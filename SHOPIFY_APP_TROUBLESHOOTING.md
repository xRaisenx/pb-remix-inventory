# 🔧 Shopify App Dashboard Troubleshooting Guide

## 🚨 Issue: App Not Showing in Shopify Dashboard

Even though your Vercel deployment is successful, the app isn't appearing in your Shopify store. Here's how to fix it:

## ✅ **Step 1: Check Shopify Partners Dashboard**

1. **Go to**: https://partners.shopify.com/
2. **Navigate to**: Apps → Your Apps
3. **Verify**: 
   - App name: "Planet Beauty Inventory AI" (recently updated)
   - Client ID: `919e88ca96685994550e0a9bc9236584`
   - Status: Should be "Active" or "Development"

### **If App Doesn't Exist in Partners Dashboard:**
```bash
# Create the app using Shopify CLI
shopify app create
# Then configure with your existing code
```

## ✅ **Step 2: Verify App URLs**

In your **Shopify Partners Dashboard → Your App → App setup**:

### **Required URLs:**
- **App URL**: `https://pb-inventory-ai-olive.vercel.app/`
- **Allowed redirection URL(s)**: `https://pb-inventory-ai-olive.vercel.app/auth/callback`

### **Webhook URLs** (should be configured):
```
https://pb-inventory-ai-olive.vercel.app/webhooks/app/uninstalled
https://pb-inventory-ai-olive.vercel.app/webhooks/products/create
https://pb-inventory-ai-olive.vercel.app/webhooks/products/update
https://pb-inventory-ai-olive.vercel.app/webhooks/products/delete
https://pb-inventory-ai-olive.vercel.app/webhooks/inventory/update
https://pb-inventory-ai-olive.vercel.app/webhooks/orders/create
https://pb-inventory-ai-olive.vercel.app/webhooks/orders/paid
```

## ✅ **Step 3: Check App Scopes**

In Partners Dashboard → Your App → App setup → App scopes:

**Required Scopes:**
- `read_products`
- `write_products` 
- `read_inventory`
- `write_inventory`
- `read_locations`
- `read_orders`

## ✅ **Step 4: Verify Environment Variables**

In your **Vercel Dashboard → Your Project → Settings → Environment Variables**:

```bash
SHOPIFY_API_KEY="919e88ca96685994550e0a9bc9236584"
SHOPIFY_API_SECRET="your-secret-key"  # Must match Partners Dashboard
SHOPIFY_APP_URL="https://pb-inventory-ai-olive.vercel.app/"
SCOPES="write_products,read_products,write_inventory,read_inventory,read_locations,read_orders"
DATABASE_URL="your-neon-database-url"
```

## ✅ **Step 5: Test App Installation**

### **Method 1: Direct Installation URL**
```
https://pb-inventory-ai-olive.vercel.app/auth?shop=josedevai.myshopify.com
```

### **Method 2: Through Partners Dashboard**
1. Go to Partners Dashboard → Your App
2. Click "Test on development store"
3. Select your store: `josedevai.myshopify.com`

## ✅ **Step 6: Check Common Issues**

### **Issue A: App Not Published**
- In Partners Dashboard, ensure app is in "Development" mode
- For custom apps, you don't need to publish to App Store

### **Issue B: Store Not Connected**
- Verify the store `josedevai.myshopify.com` is connected to your Partners account
- Check if it's a development store or live store

### **Issue C: Incorrect Client Secret**
- In Partners Dashboard → Your App → App credentials
- Copy the **Client Secret** 
- Update `SHOPIFY_API_SECRET` in Vercel environment variables

### **Issue D: Domain Mismatch**
- Verify app domain exactly matches: `pb-inventory-ai-olive.vercel.app`
- No trailing slashes or protocol mismatches

## 🔍 **Diagnostic Steps**

### **1. Check Vercel Logs**
```bash
vercel logs https://pb-inventory-ai-olive.vercel.app/
```

### **2. Test App URL Directly**
Visit: `https://pb-inventory-ai-olive.vercel.app/`
- Should show a page (not 404)
- Check browser console for errors

### **3. Test Auth URL**
Visit: `https://pb-inventory-ai-olive.vercel.app/auth?shop=josedevai.myshopify.com`
- Should redirect to Shopify OAuth
- Check for any error messages

### **4. Verify Database Connection**
The logs should show:
```
✅ Shop.criticalStockThreshold is now accessible
✅ Session table is accessible
```

## 🆘 **If App Still Not Working**

### **Last Resort: Recreate App**

1. **In Partners Dashboard**: Delete existing app
2. **Create new app**:
   ```bash
   shopify app create
   ```
3. **Update configuration**:
   - Copy new Client ID and Secret
   - Update Vercel environment variables
   - Deploy again

### **Alternative: Manual Configuration**

1. Create app manually in Partners Dashboard
2. Set all URLs to your Vercel domain
3. Configure scopes and webhooks
4. Update your code with new credentials

## 📞 **Need Help?**

**Share these details for further troubleshooting:**
1. Screenshot of Partners Dashboard app list
2. Screenshot of app configuration in Partners Dashboard
3. Any error messages when accessing the app URL
4. Current status of the app in Partners Dashboard
5. Whether the store `josedevai.myshopify.com` appears in your Partners account

---

**The app deployment is working perfectly - this is likely a configuration issue in Shopify Partners Dashboard or app installation process.**