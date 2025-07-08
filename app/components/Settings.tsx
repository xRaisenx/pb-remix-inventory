import React, { useState, useMemo, useCallback } from "react";

// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  let lastCallTime: number;
  
  return function executedFunction(...args: Parameters<T>) {
    const now = Date.now();
    const { leading = false, trailing = true } = options;
    
    const later = () => {
      timeout = null as any;
      if (trailing && lastCallTime !== now) {
        func(...args);
      }
    };
    
    const callNow = leading && !timeout;
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    lastCallTime = now;
    
    if (callNow) {
      func(...args);
    }
  };
}

export interface NotificationSettingsType {
  email: { enabled: boolean; address: string };
  slack: { enabled: boolean; webhook: string };
  telegram: { enabled: boolean; botToken: string; chatId: string };
  mobilePush: { enabled: boolean; service: string };
  salesThreshold: number;
  stockoutThreshold: number;
  notificationFrequency: 'immediate' | 'hourly' | 'daily';
  syncEnabled: boolean;
}

interface SettingsProps {
  notificationSettings: NotificationSettingsType;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettingsType>>;
  onSubmit: (settings: NotificationSettingsType) => Promise<{ success: boolean; message?: string; error?: string }>;
}

interface NotificationHistoryItem {
  message: string;
  timestamp: string;
  status: string;
  channel: string;
}

interface ValidationErrors {
  [key: string]: string;
}

export default function Settings({ notificationSettings, setNotificationSettings, onSubmit }: SettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Validation functions
  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateSlackWebhook = (webhook: string): boolean => {
    return webhook.startsWith('https://hooks.slack.com/');
  };

  const validateTelegramBotToken = (token: string): boolean => {
    return /^\d+:[A-Za-z0-9_-]{35}$/.test(token);
  };

  const validateSettings = (settings: NotificationSettingsType): ValidationErrors => {
    const errors: ValidationErrors = {};

    // Email validation
    if (settings.email.enabled && !validateEmail(settings.email.address)) {
      errors.email = "Please enter a valid email address";
    }

    // Slack validation
    if (settings.slack.enabled && !validateSlackWebhook(settings.slack.webhook)) {
      errors.slack = "Please enter a valid Slack webhook URL (https://hooks.slack.com/...)";
    }

    // Telegram validation
    if (settings.telegram.enabled) {
      if (!validateTelegramBotToken(settings.telegram.botToken)) {
        errors.telegramToken = "Invalid bot token format (should be numbers:letters)";
      }
      if (!settings.telegram.chatId.trim()) {
        errors.telegramChat = "Chat ID is required for Telegram notifications";
      }
    }

    // Numeric validation
    if (settings.salesThreshold < 0) {
      errors.salesThreshold = "Sales threshold must be positive";
    }
    if (settings.salesThreshold > 10000) {
      errors.salesThreshold = "Sales threshold too large (max: 10,000)";
    }
    if (settings.stockoutThreshold < 1 || settings.stockoutThreshold > 365) {
      errors.stockoutThreshold = "Stockout threshold must be between 1-365 days";
    }

    return errors;
  };

  // Debounced input change handler to prevent race conditions
  const debouncedInputChange = useMemo(
    () => debounce((channel: keyof NotificationSettingsType, field: string, value: any) => {
      setNotificationSettings((prev) => {
        const prevChannelSettings = prev[channel];
        if (typeof prevChannelSettings === 'object' && prevChannelSettings !== null && 'enabled' in prevChannelSettings) {
          return {
            ...prev,
            [channel]: { ...prevChannelSettings, [field]: value },
          };
        }
        return prev;
      });
      
      // Clear validation error when user starts typing
      if (validationErrors[channel]) {
        setValidationErrors(prev => ({ ...prev, [channel]: '' }));
      }
    }, 300),
    [validationErrors]
  );

  const handleInputChange = useCallback((channel: keyof NotificationSettingsType, field: string, value: any) => {
    debouncedInputChange(channel, field, value);
  }, [debouncedInputChange]);

  const handleThresholdChange = useCallback((field: keyof NotificationSettingsType, value: string | number | boolean) => {
    setNotificationSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear validation error
    if (validationErrors[field as string]) {
      setValidationErrors(prev => ({ ...prev, [field as string]: '' }));
    }
  }, [validationErrors]);

  const testNotification = (channel: string) => {
    const message = `Test notification sent via ${channel}`;
    const historyEntry: NotificationHistoryItem = {
      message,
      timestamp: new Date().toLocaleString(),
      status: "Sent",
      channel: channel.charAt(0).toUpperCase() + channel.slice(1)
    };
    
    const updatedHistory = [...notificationHistory, historyEntry];
    setNotificationHistory(updatedHistory.slice(-5)); // Keep last 5 notifications
    
    console.log(`${channel.charAt(0).toUpperCase() + channel.slice(1)} test sent: ${message}`);
  };

  const handleSubmit = async () => {
    // Validate before submitting
    const errors = validateSettings(notificationSettings);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setErrorMessage("Please fix the validation errors before saving.");
      return;
    }

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationErrors({});
    
    try {
      const result = await onSubmit(notificationSettings);
      if (result.success) {
        setSuccessMessage(result.message || 'Settings saved successfully!');
      } else {
        setErrorMessage(result.error || 'Failed to save settings.');
      }
    } catch (error) {
      setErrorMessage('An error occurred while saving settings.');
    }
    
    setIsSaving(false);
  };

  // Debounced submit to prevent double-clicking
  const debouncedSubmit = useMemo(
    () => debounce(handleSubmit, 500, { leading: true, trailing: false }),
    [handleSubmit]
  );

  return (
    <div className="pb-space-y-6">
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="pb-alert-high-sales">
          <p>{successMessage}</p>
        </div>
      )}
      
      {errorMessage && (
        <div className="pb-alert-critical">
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Notification Channels */}
      <div className="pb-card">
        <h3 className="pb-text-lg pb-font-medium pb-mb-4" style={{ color: '#374151' }}>Notification Channels</h3>
        <div className="pb-space-y-6">
          
          {/* Email Notifications */}
          <div>
            <label className="pb-flex pb-items-center pb-mb-3">
              <input
                type="checkbox"
                checked={notificationSettings.email.enabled}
                onChange={(e) => handleInputChange('email', 'enabled', e.target.checked)}
                className="mr-2"
              />
              <span className="pb-font-medium">Email Notifications</span>
            </label>
            <input
              type="email"
              className={`pb-input pb-mb-2 ${validationErrors.email ? 'border-red-500' : ''}`}
              placeholder="Email address"
              value={notificationSettings.email.address}
              onChange={(e) => handleInputChange('email', 'address', e.target.value)}
              disabled={!notificationSettings.email.enabled}
              min={0}
              max={10000}
            />
            {validationErrors.email && (
              <p className="text-red-500 text-sm mb-2">{validationErrors.email}</p>
            )}
            <button
              className="pb-btn-secondary"
              onClick={() => testNotification('email')}
              disabled={!notificationSettings.email.enabled || !validateEmail(notificationSettings.email.address)}
            >
              Test Email
            </button>
          </div>

          {/* Slack Notifications */}
          <div>
            <label className="pb-flex pb-items-center pb-mb-3">
              <input
                type="checkbox"
                checked={notificationSettings.slack.enabled}
                onChange={(e) => handleInputChange('slack', 'enabled', e.target.checked)}
                className="mr-2"
              />
              <span className="pb-font-medium">Slack Notifications</span>
            </label>
            <input
              type="text"
              className={`pb-input pb-mb-2 ${validationErrors.slack ? 'border-red-500' : ''}`}
              placeholder="Slack Webhook URL (https://hooks.slack.com/...)"
              value={notificationSettings.slack.webhook}
              onChange={(e) => handleInputChange('slack', 'webhook', e.target.value)}
              disabled={!notificationSettings.slack.enabled}
            />
            {validationErrors.slack && (
              <p className="text-red-500 text-sm mb-2">{validationErrors.slack}</p>
            )}
            <button
              className="pb-btn-secondary"
              onClick={() => testNotification('slack')}
              disabled={!notificationSettings.slack.enabled || !validateSlackWebhook(notificationSettings.slack.webhook)}
            >
              Test Slack
            </button>
          </div>

          {/* Telegram Notifications */}
          <div>
            <label className="pb-flex pb-items-center pb-mb-3">
              <input
                type="checkbox"
                checked={notificationSettings.telegram.enabled}
                onChange={(e) => handleInputChange('telegram', 'enabled', e.target.checked)}
                className="mr-2"
              />
              <span className="pb-font-medium">Telegram Notifications</span>
            </label>
            <input
              type="text"
              className={`pb-input pb-mb-2 ${validationErrors.telegramToken ? 'border-red-500' : ''}`}
              placeholder="Telegram Bot Token (123456:ABC-DEF1234...)"
              value={notificationSettings.telegram.botToken}
              onChange={(e) => handleInputChange('telegram', 'botToken', e.target.value)}
              disabled={!notificationSettings.telegram.enabled}
            />
            {validationErrors.telegramToken && (
              <p className="text-red-500 text-sm mb-2">{validationErrors.telegramToken}</p>
            )}
            <input
              type="text"
              className={`pb-input pb-mb-2 ${validationErrors.telegramChat ? 'border-red-500' : ''}`}
              placeholder="Telegram Chat ID"
              value={notificationSettings.telegram.chatId}
              onChange={(e) => handleInputChange('telegram', 'chatId', e.target.value)}
              disabled={!notificationSettings.telegram.enabled}
            />
            {validationErrors.telegramChat && (
              <p className="text-red-500 text-sm mb-2">{validationErrors.telegramChat}</p>
            )}
            <button
              className="pb-btn-secondary"
              onClick={() => testNotification('telegram')}
              disabled={!notificationSettings.telegram.enabled || !validateTelegramBotToken(notificationSettings.telegram.botToken) || !notificationSettings.telegram.chatId}
            >
              Test Telegram
            </button>
          </div>

          {/* Mobile Push Notifications */}
          <div>
            <label className="pb-flex pb-items-center pb-mb-3">
              <input
                type="checkbox"
                checked={notificationSettings.mobilePush.enabled}
                onChange={(e) => handleInputChange('mobilePush', 'enabled', e.target.checked)}
                className="mr-2"
              />
              <span className="pb-font-medium">Mobile Push Notifications</span>
            </label>
            <input
              type="text"
              className="pb-input pb-mb-2"
              placeholder="Push Service Credentials"
              value={notificationSettings.mobilePush.service}
              onChange={(e) => handleInputChange('mobilePush', 'service', e.target.value)}
              disabled={!notificationSettings.mobilePush.enabled}
            />
            <button
              className="pb-btn-secondary"
              onClick={() => testNotification('mobilePush')}
              disabled={!notificationSettings.mobilePush.enabled || !notificationSettings.mobilePush.service}
            >
              Test Mobile Push
            </button>
          </div>
        </div>
      </div>

      {/* Alert Thresholds */}
      <div className="pb-card">
        <h3 className="pb-text-lg pb-font-medium pb-mb-4" style={{ color: '#374151' }}>Alert Thresholds</h3>
        <div className="pb-space-y-4">
          <div>
            <label className="block pb-text-sm pb-font-medium pb-mb-2" style={{ color: '#374151' }}>
              High Sales Velocity Threshold (units/day)
            </label>
            <input
              type="number"
              className={`pb-input ${validationErrors.salesThreshold ? 'border-red-500' : ''}`}
              style={{ width: '180px' }}
              value={notificationSettings.salesThreshold}
              onChange={(e) => handleThresholdChange('salesThreshold', parseFloat(e.target.value) || 0)}
              min={0}
              max={10000}
            />
            {validationErrors.salesThreshold && (
              <p className="text-red-500 text-sm mt-1">{validationErrors.salesThreshold}</p>
            )}
          </div>
          
          <div>
            <label className="block pb-text-sm pb-font-medium pb-mb-2" style={{ color: '#374151' }}>
              Stockout Risk Threshold (days)
            </label>
            <input
              type="number"
              className={`pb-input ${validationErrors.stockoutThreshold ? 'border-red-500' : ''}`}
              style={{ width: '180px' }}
              value={notificationSettings.stockoutThreshold}
              onChange={(e) => handleThresholdChange('stockoutThreshold', parseInt(e.target.value, 10) || 0)}
              min={1}
              max={365}
            />
            {validationErrors.stockoutThreshold && (
              <p className="text-red-500 text-sm mt-1">{validationErrors.stockoutThreshold}</p>
            )}
          </div>
          
          <div>
            <label className="block pb-text-sm pb-font-medium pb-mb-2" style={{ color: '#374151' }}>
              Notification Frequency
            </label>
            <select
              className="pb-select"
              value={notificationSettings.notificationFrequency}
              onChange={(e) => handleThresholdChange('notificationFrequency', e.target.value as 'immediate' | 'hourly' | 'daily')}
            >
              <option value="immediate">Immediate</option>
              <option value="hourly">Hourly Digest</option>
              <option value="daily">Daily Summary</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Sync */}
      <div className="pb-card">
        <h3 className="pb-text-lg pb-font-medium pb-mb-4" style={{ color: '#374151' }}>Inventory Sync</h3>
        <label className="pb-flex pb-items-center">
          <input
            type="checkbox"
            checked={notificationSettings.syncEnabled}
            onChange={(e) => handleThresholdChange('syncEnabled', e.target.checked)}
            className="mr-2"
          />
          <span className="pb-font-medium">Enable Real-Time Shopify Inventory Sync</span>
        </label>
      </div>

      {/* Notification History */}
      <div className="pb-card">
        <h3 className="pb-text-lg pb-font-medium pb-mb-4" style={{ color: '#374151' }}>Notification History (Last 5)</h3>
        <div className="bg-gray-50 pb-p-4 rounded-md max-h-40 pb-overflow-y-auto">
          {notificationHistory.length === 0 ? (
            <p style={{ color: '#718096' }}>No test notifications sent yet.</p>
          ) : (
            notificationHistory.map((entry, index) => (
              <div key={index} className="pb-mb-2" style={{ color: '#374151' }}>
                <strong>{entry.timestamp} ({entry.status} via {entry.channel}):</strong> {entry.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="pb-flex pb-justify-end">
        <button 
          className="pb-btn-primary"
          onClick={debouncedSubmit}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
