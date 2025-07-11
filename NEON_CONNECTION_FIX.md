# 🔥 Neon Database Connection Fix Guide

## 🚨 Current Issue

Your Planet Beauty Inventory AI app is failing to connect to the Neon PostgreSQL database with the error:

```
Can't reach database server at `ep-morning-grass-a40tbg74-pooler.us-east-1.aws.neon.tech:5432`
```

## 🎯 Immediate Action Plan

### 1. **Check Neon Project Status** 

```bash
# Log into your Neon Console
https://console.neon.tech/

# Verify your project status:
# • Project: ep-morning-grass-a40tbg74-pooler
# • Status: Should be "Active"
# • Compute: Should be "Running"
```

### 2. **Verify Environment Variables in Vercel**

Go to your Vercel dashboard and ensure these variables are set:

```bash
# Critical: This should be your Neon POOLED connection string
DATABASE_URL="postgresql://username:password@ep-morning-grass-a40tbg74-pooler.us-east-1.aws.neon.tech:5432/neondb?pgbouncer=true&connection_limit=5"

# Shopify Configuration
SHOPIFY_API_KEY="919e88ca96685994550e0a9bc9236584"
SHOPIFY_API_SECRET="your-shopify-api-secret"
SHOPIFY_APP_URL="https://pb-inventory-ai-olive.vercel.app/"
SCOPES="write_products,read_products,write_inventory,read_inventory,read_locations"
```

### 3. **Fix Common Neon Connection Issues**

#### Issue A: Neon Project Suspended/Inactive
```bash
# Solution: Reactivate your Neon project
1. Go to Neon Console
2. Check if project is suspended due to inactivity
3. Click "Resume" if suspended
4. Wait 30-60 seconds for database to start
```

#### Issue B: Incorrect Connection String
```bash
# Get the correct connection string from Neon:
1. Go to Neon Console → Your Project
2. Click "Connection Details"
3. Select "Pooled connection" 
4. Copy the full connection string
5. Update DATABASE_URL in Vercel
```

#### Issue C: Connection Limit Exceeded
```bash
# Enhanced connection string with limits:
DATABASE_URL="postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=5&connect_timeout=15&pool_timeout=15"
```

### 4. **Test Database Connection Locally**

Run this test to verify your connection string:

```bash
# Install dependencies
npm install

# Test connection
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => console.log('✅ Connection successful'))
  .catch(err => console.error('❌ Connection failed:', err))
  .finally(() => prisma.\$disconnect());
"
```

### 5. **Enhanced Database Initialization**

Run the enhanced initialization script:

```bash
# This will validate environment and test connection
npm run db:init

# Or run manually:
node scripts/db-init.js
```

### 6. **Deploy with Proper Build Process**

```bash
# Ensure proper build order
vercel --prod

# Monitor build logs for database connection
vercel logs
```

## 🔧 Advanced Troubleshooting

### Check Neon Region Compatibility
```bash
# Verify your Neon database region matches Vercel deployment region
# Common regions:
# • us-east-1 (Virginia) - Vercel iad1
# • us-west-2 (Oregon) - Vercel sfo1
# • eu-west-1 (Ireland) - Vercel lhr1
```

### Update Prisma Configuration
If using a different database URL format, update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // Optional for migrations
}
```

### Check Vercel Function Timeout
Update `vercel.json` if functions are timing out:

```json
{
  "functions": {
    "build/server/index.js": {
      "maxDuration": 30
    }
  }
}
```

## 🚀 Quick Fix Commands

```bash
# 1. Validate environment
npm run db:init

# 2. Force redeploy with fresh environment
vercel --prod --force

# 3. Check function logs
vercel logs --follow

# 4. Test Shopify authentication
curl https://pb-inventory-ai-olive.vercel.app/auth?shop=josedevai.myshopify.com
```

## 📊 Expected Success Indicators

After fixing the connection, you should see:

```bash
✅ Neon database connection successful
✅ Session table exists and accessible
✅ Shopify integration verified
✅ Health check passed
🎉 Database initialization completed successfully!
```

## 🆘 If Nothing Works

### Last Resort Options:

1. **Create New Neon Database**
   ```bash
   # Create fresh Neon project
   # Export data from old database (if needed)
   # Update DATABASE_URL
   # Run migrations
   ```

2. **Check Neon Status Page**
   ```bash
   https://status.neon.tech/
   # Look for outages in your region
   ```

3. **Contact Neon Support**
   ```bash
   # If infrastructure issue
   https://neon.tech/support
   ```

## 💡 Prevention for Future

```bash
# Add health check endpoint
# Monitor database connection
# Set up alerts for downtime
# Use connection pooling
# Implement retry logic
```

---

## 🎯 Next Steps After Fix

1. ✅ Database connection restored
2. ✅ Shopify OAuth working  
3. ✅ App deployed successfully
4. ✅ Ready for merchant onboarding

**Your Planet Beauty Inventory AI will be fully operational once the Neon connection is restored!**