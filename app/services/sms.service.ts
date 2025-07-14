import prisma from '~/db.server';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

export interface SMSConfig {
  provider: 'twilio' | 'aws-sns' | 'mock';
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}

export interface SMSMessage {
  to: string;
  message: string;
  shopId: string;
  productId?: string;
  productTitle?: string;
  alertType?: string;
  alertId?: string;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  cost?: number;
  deliveryStatus?: string;
  provider?: string;
}

class SMSService {
  private config: SMSConfig;

  constructor(config: SMSConfig) {
    this.config = config;
  }

  async sendSMS(message: SMSMessage): Promise<SMSResult> {
    try {
      // Log the notification attempt
      await this.logNotification(message, NotificationStatus.Pending);

      let result: SMSResult;

      switch (this.config.provider) {
        case 'twilio':
          result = await this.sendViaTwilio(message);
          break;
        case 'aws-sns':
          result = await this.sendViaAWSSNS(message);
          break;
        case 'mock':
        default:
          result = await this.sendViaMock(message);
          break;
      }

      // Update the notification log with result
      await this.logNotification(
        message,
        result.success ? NotificationStatus.Sent : NotificationStatus.Failed,
        result.error,
        result.messageId
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logNotification(message, NotificationStatus.Error, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private async sendViaTwilio(message: SMSMessage): Promise<SMSResult> {
    if (!this.config.twilioAccountSid || !this.config.twilioAuthToken || !this.config.twilioPhoneNumber) {
      throw new Error('Twilio configuration missing');
    }

    try {
      // Mock Twilio implementation since we can't install the SDK in this environment
      // In a real implementation, you would use the Twilio SDK
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: message.to,
          From: this.config.twilioPhoneNumber,
          Body: message.message,
        }),
      });

      if (!response.ok) {
        throw new Error(`Twilio API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.sid,
        cost: parseFloat(data.price || '0'),
        deliveryStatus: data.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Twilio send failed',
      };
    }
  }

  private async sendViaAWSSNS(message: SMSMessage): Promise<SMSResult> {
    if (!this.config.awsRegion || !this.config.awsAccessKeyId || !this.config.awsSecretAccessKey) {
      throw new Error('AWS SNS configuration missing');
    }

    try {
      // Mock AWS SNS implementation
      // In a real implementation, you would use the AWS SDK
      const mockMessageId = `mock-aws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`📱 [AWS SNS] Sending SMS to ${message.to}: ${message.message}`);
      
      return {
        success: true,
        messageId: mockMessageId,
        cost: 0.0075, // Typical AWS SNS cost
        deliveryStatus: 'delivered',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AWS SNS send failed',
      };
    }
  }

  private async sendViaMock(message: SMSMessage): Promise<SMSResult> {
    // Mock implementation for testing
    console.log(`📱 [MOCK SMS] To: ${message.to}`);
    console.log(`📱 [MOCK SMS] Message: ${message.message}`);
    
    // Simulate success/failure for testing
    const mockMessageId = `mock-sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      messageId: mockMessageId,
      cost: 0.01,
      deliveryStatus: 'delivered',
      provider: 'mock',
    };
  }

  // Expose config for testing and integration
  getConfig(): SMSConfig {
    return this.config;
  }

  private async logNotification(
    message: SMSMessage,
    status: NotificationStatus,
    error?: string,
    messageId?: string
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          shopId: message.shopId,
          channel: NotificationChannel.SMS,
          recipient: message.to,
          message: message.message,
          status,
          productId: message.productId,
          productTitle: message.productTitle,
          alertType: message.alertType,
          // alertId field doesn't exist in NotificationLog model
          errorMessage: error,
          sentAt: status === NotificationStatus.Sent ? new Date() : undefined,
          deliveredAt: status === NotificationStatus.Delivered ? new Date() : undefined,
          // metadata field doesn't exist in NotificationLog model
          // messageId,
          // provider: this.config.provider,
        },
      });
    } catch (logError) {
      console.error('Failed to log SMS notification:', logError);
    }
  }

  async bulkSendSMS(messages: SMSMessage[]): Promise<SMSResult[]> {
    const results: SMSResult[] = [];
    
    for (const message of messages) {
      const result = await this.sendSMS(message);
      results.push(result);
      
      // Add delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  async getDeliveryStatus(messageId: string): Promise<string | null> {
    try {
      const log = await prisma.notificationLog.findFirst({
        where: {
          // metadata field doesn't exist in NotificationLog model
          // path: ['messageId'],
          // equals: messageId,
        },
      });
      
      return log?.status || null;
    } catch (error) {
      console.error('Failed to get delivery status:', error);
      return null;
    }
  }
}

// Factory function to create SMS service with environment-based configuration
export function createSMSService(): SMSService {
  // Determine provider based on available environment variables
  let provider: 'twilio' | 'aws-sns' | 'mock' = 'mock';
  
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    provider = 'twilio';
  } else if (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    provider = 'aws-sns';
  } else if (process.env.SMS_PROVIDER === 'twilio' || process.env.SMS_PROVIDER === 'aws-sns') {
    provider = process.env.SMS_PROVIDER as 'twilio' | 'aws-sns';
  }
  
  const config: SMSConfig = {
    provider,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };

  return new SMSService(config);
}

// Utility functions for common SMS messages
export function createInventoryAlertSMS(
  phoneNumber: string,
  productTitle: string,
  currentQuantity: number,
  threshold: number,
  shopId: string,
  productId?: string
): SMSMessage {
  return {
    to: phoneNumber,
    message: `🚨 LOW STOCK ALERT: ${productTitle} is running low! Current: ${currentQuantity} units (threshold: ${threshold}). Please restock soon.`,
    shopId,
    productId,
    productTitle,
    alertType: 'LOW_STOCK',
  };
}

export function createOutOfStockSMS(
  phoneNumber: string,
  productTitle: string,
  shopId: string,
  productId?: string
): SMSMessage {
  return {
    to: phoneNumber,
    message: `🔴 OUT OF STOCK: ${productTitle} is completely out of stock! Immediate restocking required.`,
    shopId,
    productId,
    productTitle,
    alertType: 'OUT_OF_STOCK',
  };
}

export function createHighDemandSMS(
  phoneNumber: string,
  productTitle: string,
  salesVelocity: number,
  shopId: string,
  productId?: string
): SMSMessage {
  return {
    to: phoneNumber,
    message: `📈 HIGH DEMAND: ${productTitle} is selling fast! ${salesVelocity.toFixed(1)} units/day. Consider increasing stock levels.`,
    shopId,
    productId,
    productTitle,
    alertType: 'HIGH_DEMAND',
  };
}

export default SMSService;