import { useAppBridge } from "@shopify/app-bridge-react";

/**
 * Hook to get the App Bridge instance
 */
export function useAppBridgeInstance() {
  return useAppBridge();
}

/**
 * Hook for navigation in embedded apps
 */
export function useAppBridgeNavigate() {
  const app = useAppBridge();
  
  return {
    /**
     * Navigate to a resource (product, order, etc.)
     */
    navigateToResource: (resourceType: string, resourceId: string) => {
      // Use the app instance to navigate
      if (app && app.dispatch) {
        app.dispatch('REDIRECT', {
          action: 'ADMIN_PATH',
          payload: { path: `/${resourceType}s/${resourceId}` }
        });
      }
    },
    
    /**
     * Navigate to admin path
     */
    navigateToAdminPath: (path: string) => {
      if (app && app.dispatch) {
        app.dispatch('REDIRECT', {
          action: 'ADMIN_PATH',
          payload: { path }
        });
      }
    },
    
    /**
     * Navigate to external URL
     */
    navigateToExternalUrl: (url: string) => {
      if (app && app.dispatch) {
        app.dispatch('REDIRECT', {
          action: 'REMOTE',
          payload: { url }
        });
      }
    },
    
    /**
     * Navigate to app path
     */
    navigateToAppPath: (path: string) => {
      if (app && app.dispatch) {
        app.dispatch('REDIRECT', {
          action: 'APP',
          payload: { path }
        });
      }
    },
  };
}

/**
 * Hook for showing toasts in embedded apps
 */
export function useAppBridgeToast() {
  const app = useAppBridge();
  
  return {
    /**
     * Show a success toast
     */
    showSuccess: (message: string, duration?: number) => {
      if (app && app.dispatch) {
        app.dispatch('TOAST', {
          action: 'SHOW',
          payload: {
            message,
            duration: duration || 5000,
            isError: false,
          }
        });
      }
    },
    
    /**
     * Show an error toast
     */
    showError: (message: string, duration?: number) => {
      if (app && app.dispatch) {
        app.dispatch('TOAST', {
          action: 'SHOW',
          payload: {
            message,
            duration: duration || 5000,
            isError: true,
          }
        });
      }
    },
    
    /**
     * Show a custom toast
     */
    showToast: (options: {
      message: string;
      duration?: number;
      isError?: boolean;
      action?: {
        title: string;
        onAction: () => void;
      };
    }) => {
      if (app && app.dispatch) {
        app.dispatch('TOAST', {
          action: 'SHOW',
          payload: {
            message: options.message,
            duration: options.duration || 5000,
            isError: options.isError || false,
            action: options.action,
          }
        });
      }
    },
  };
}

/**
 * Hook for showing modals in embedded apps
 */
export function useAppBridgeModal() {
  const app = useAppBridge();
  
  return {
    /**
     * Show a confirmation modal
     */
    showConfirm: (options: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void;
      onCancel?: () => void;
    }) => {
      if (app && app.dispatch) {
        app.dispatch('MODAL', {
          action: 'OPEN',
          payload: {
            title: options.title,
            message: options.message,
            primaryAction: {
              label: options.confirmText || "Confirm",
              action: () => {
                options.onConfirm();
                app.dispatch('MODAL', { action: 'CLOSE' });
              },
            },
            secondaryActions: [
              {
                label: options.cancelText || "Cancel",
                action: () => {
                  options.onCancel?.();
                  app.dispatch('MODAL', { action: 'CLOSE' });
                },
              },
            ],
          }
        });
      }
    },
    
    /**
     * Show a custom modal
     */
    showModal: (options: {
      title: string;
      message: string;
      primaryAction?: {
        label: string;
        action: () => void;
      };
      secondaryActions?: Array<{
        label: string;
        action: () => void;
      }>;
    }) => {
      if (app && app.dispatch) {
        app.dispatch('MODAL', {
          action: 'OPEN',
          payload: {
            title: options.title,
            message: options.message,
            primaryAction: options.primaryAction,
            secondaryActions: options.secondaryActions || [],
          }
        });
      }
    },
  };
}

/**
 * Hook for resource picker in embedded apps
 */
export function useAppBridgeResourcePicker() {
  const app = useAppBridge();
  
  return {
    /**
     * Open product picker
     */
    openProductPicker: (options: {
      onSelect: (resources: any[]) => void;
      onCancel?: () => void;
      allowMultiple?: boolean;
    }) => {
      if (app && app.dispatch) {
        app.dispatch('RESOURCE_PICKER', {
          action: 'OPEN',
          payload: {
            type: "product",
            actionVerb: "select",
            allowMultiple: options.allowMultiple || false,
            onSelect: (payload: any) => {
              options.onSelect(payload.selection);
              app.dispatch('RESOURCE_PICKER', { action: 'CLOSE' });
            },
            onCancel: () => {
              options.onCancel?.();
              app.dispatch('RESOURCE_PICKER', { action: 'CLOSE' });
            },
          }
        });
      }
    },
    
    /**
     * Open order picker
     */
    openOrderPicker: (options: {
      onSelect: (resources: any[]) => void;
      onCancel?: () => void;
      allowMultiple?: boolean;
    }) => {
      if (app && app.dispatch) {
        app.dispatch('RESOURCE_PICKER', {
          action: 'OPEN',
          payload: {
            type: "order",
            actionVerb: "select",
            allowMultiple: options.allowMultiple || false,
            onSelect: (payload: any) => {
              options.onSelect(payload.selection);
              app.dispatch('RESOURCE_PICKER', { action: 'CLOSE' });
            },
            onCancel: () => {
              options.onCancel?.();
              app.dispatch('RESOURCE_PICKER', { action: 'CLOSE' });
            },
          }
        });
      }
    },
  };
}

/**
 * Utility to check if the app is running in embedded mode
 */
export function isEmbeddedApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.top !== window.self;
}

/**
 * Utility to get the host parameter from URL
 */
export function getHostFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("host");
}

/**
 * Utility to get the shop parameter from URL
 */
export function getShopFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("shop");
}