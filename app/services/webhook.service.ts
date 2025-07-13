import prisma from '~/db.server';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

export interface WebhookConfig {
  url: string;
  secret?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface WebhookPayload {
  event: string;
  shop: {
    id: string;
    domain: string;
  };
  product?: {
    id: string;
    title: string;
    currentQuantity: number;
    threshold?: number;
  };
  alert?: {
    id: string;
    type: string;
    severity: string;
    message: string;
  };
  inventory?: {
    previousQuantity: number;
    newQuantity: number;
    changeReason: string;
  };
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface WebhookMessage {
  url: string;
  payload: WebhookPayload;
  shopId: string;
  productId?: string;
  productTitle?: string;
  alertType?: string;
  alertId?: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  response?: any;
  error?: string;
  retryCount?: number;
  duration?: number;
}

class WebhookService {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  async sendWebhook(message: WebhookMessage): Promise<WebhookResult> {
    const startTime = Date.now();
    
    try {
      // Log the webhook attempt
      await this.logWebhook(message, NotificationStatus.Pending);

      const result = await this.sendWithRetry(message);
      const duration = Date.now() - startTime;

      // Update the notification log with result
      await this.logWebhook(
        message,
        result.success ? NotificationStatus.Sent : NotificationStatus.Failed,
        result.error,
        undefined,
        result.retryCount
      );

      return { ...result, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.logWebhook(message, NotificationStatus.Error, errorMessage);
      
      return { 
        success: false, 
        error: errorMessage, 
        duration 
      };
    }
  }

  private async sendWithRetry(message: WebhookMessage): Promise<WebhookResult> {
    let lastError: string | undefined;
    
    for (let attempt = 0; attempt < (this.config.retryAttempts || 3); attempt++) {
      try {
        const result = await this.performWebhookRequest(message);
        
        if (result.success) {
          return { ...result, retryCount: attempt };
        }
        
        lastError = result.error;
        
        // Wait before retry (exponential backoff)
        if (attempt < (this.config.retryAttempts || 3) - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, (this.config.retryDelay || 1000) * Math.pow(2, attempt))
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Request failed';
      }
    }
    
    return {
      success: false,
      error: lastError || 'All retry attempts failed',
      retryCount: this.config.retryAttempts || 3,
    };
  }

  private async performWebhookRequest(message: WebhookMessage): Promise<WebhookResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'PlanetBeauty-InventoryAI/1.0',
      ...this.config.headers,
      ...message.headers,
    };

    // Add signature if secret is provided
    if (message.secret) {
      const signature = await this.generateSignature(message.payload, message.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(message.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message.payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      return {
        success: response.ok,
        statusCode: response.status,
        response: responseData,
        error: !response.ok ? `HTTP ${response.status}: ${response.statusText}` : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Webhook request timed out');
      }
      
      throw error;
    }
  }

  private async generateSignature(payload: WebhookPayload, secret: string): Promise<string> {
    const payloadString = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);
    const key = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async logWebhook(
    message: WebhookMessage,
    status: NotificationStatus,
    error?: string,
    messageId?: string,
    retryCount?: number
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          shopId: message.shopId,
          channel: NotificationChannel.Webhook,
          recipient: message.url,
          message: JSON.stringify(message.payload),
          status,
          productId: message.productId,
          productTitle: message.productTitle,
          alertType: message.alertType,
          alertId: message.alertId,
          errorMessage: error,
          retryCount: retryCount || 0,
          sentAt: status === NotificationStatus.Sent ? new Date() : undefined,
          deliveredAt: status === NotificationStatus.Delivered ? new Date() : undefined,
          metadata: {
            url: message.url,
            hasSecret: !!message.secret,
            payloadSize: JSON.stringify(message.payload).length,
          },
        },
      });
    } catch (logError) {
      console.error('Failed to log webhook notification:', logError);
    }
  }

  async bulkSendWebhooks(messages: WebhookMessage[]): Promise<WebhookResult[]> {
    const results: WebhookResult[] = [];
    
    // Process webhooks in parallel with concurrency limit
    const concurrency = 5;
    const chunks = this.chunkArray(messages, concurrency);
    
    for (const chunk of chunks) {
      const promises = chunk.map(message => this.sendWebhook(message));
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
    
    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Factory function to create webhook service
export function createWebhookService(config: WebhookConfig): WebhookService {
  return new WebhookService(config);
}

// Utility functions for common webhook payloads
export function createInventoryAlertWebhook(
  url: string,
  shopId: string,
  shopDomain: string,
  productId: string,
  productTitle: string,
  currentQuantity: number,
  threshold: number,
  alertId: string,
  secret?: string
): WebhookMessage {
  return {
    url,
    shopId,
    productId,
    productTitle,
    alertType: 'LOW_STOCK',
    alertId,
    secret,
    payload: {
      event: 'inventory.low_stock',
      shop: {
        id: shopId,
        domain: shopDomain,
      },
      product: {
        id: productId,
        title: productTitle,
        currentQuantity,
        threshold,
      },
      alert: {
        id: alertId,
        type: 'LOW_STOCK',
        severity: 'medium',
        message: `${productTitle} is running low on stock. Current: ${currentQuantity}, Threshold: ${threshold}`,
      },
      timestamp: new Date().toISOString(),
    },
  };
}

export function createOutOfStockWebhook(
  url: string,
  shopId: string,
  shopDomain: string,
  productId: string,
  productTitle: string,
  alertId: string,
  secret?: string
): WebhookMessage {
  return {
    url,
    shopId,
    productId,
    productTitle,
    alertType: 'OUT_OF_STOCK',
    alertId,
    secret,
    payload: {
      event: 'inventory.out_of_stock',
      shop: {
        id: shopId,
        domain: shopDomain,
      },
      product: {
        id: productId,
        title: productTitle,
        currentQuantity: 0,
      },
      alert: {
        id: alertId,
        type: 'OUT_OF_STOCK',
        severity: 'high',
        message: `${productTitle} is completely out of stock`,
      },
      timestamp: new Date().toISOString(),
    },
  };
}

export function createInventoryUpdateWebhook(
  url: string,
  shopId: string,
  shopDomain: string,
  productId: string,
  productTitle: string,
  previousQuantity: number,
  newQuantity: number,
  changeReason: string,
  secret?: string
): WebhookMessage {
  return {
    url,
    shopId,
    productId,
    productTitle,
    alertType: 'INVENTORY_UPDATE',
    secret,
    payload: {
      event: 'inventory.updated',
      shop: {
        id: shopId,
        domain: shopDomain,
      },
      product: {
        id: productId,
        title: productTitle,
        currentQuantity: newQuantity,
      },
      inventory: {
        previousQuantity,
        newQuantity,
        changeReason,
      },
      timestamp: new Date().toISOString(),
    },
  };
}

export function createHighDemandWebhook(
  url: string,
  shopId: string,
  shopDomain: string,
  productId: string,
  productTitle: string,
  salesVelocity: number,
  currentQuantity: number,
  alertId: string,
  secret?: string
): WebhookMessage {
  return {
    url,
    shopId,
    productId,
    productTitle,
    alertType: 'HIGH_DEMAND',
    alertId,
    secret,
    payload: {
      event: 'inventory.high_demand',
      shop: {
        id: shopId,
        domain: shopDomain,
      },
      product: {
        id: productId,
        title: productTitle,
        currentQuantity,
      },
      alert: {
        id: alertId,
        type: 'HIGH_DEMAND',
        severity: 'low',
        message: `${productTitle} is experiencing high demand. Sales velocity: ${salesVelocity.toFixed(1)} units/day`,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        salesVelocity,
        estimatedStockoutDays: currentQuantity / salesVelocity,
      },
    },
  };
}

export default WebhookService;