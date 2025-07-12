# Planet Beauty AI Inventory Management - Shopify Remix App

A comprehensive Shopify embedded app for intelligent inventory management with AI-powered insights, real-time alerts, and automated restock recommendations.

## 🚀 Features

- **AI-Powered Inventory Analysis**: Google AI integration for intelligent product insights
- **Real-time Stock Monitoring**: Automated alerts for low stock and critical inventory levels
- **Smart Restock Recommendations**: AI-driven suggestions for optimal reorder quantities
- **Multi-channel Notifications**: Email, Slack, Telegram, and SMS alerting
- **Comprehensive Reporting**: Sales velocity, demand forecasting, and trend analysis
- **Warehouse Management**: Multi-location inventory tracking
- **Shopify Integration**: Seamless embedded app experience with full Shopify API integration

## 🛠️ Tech Stack

- **Frontend**: Remix 2.16.8, React 18, Shopify Polaris 12
- **Backend**: Node.js, Remix Server
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **AI**: Google Generative AI
- **Hosting**: Vercel
- **Authentication**: Shopify App Bridge
- **Testing**: Vitest, Comprehensive Test Suite

## 📋 Prerequisites

- Node.js 18.20+ or 20.10+
- PostgreSQL database (Neon recommended)
- Shopify Partner account
- Google AI API key
- Vercel account (for deployment)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd planet-beauty-inventory-ai
npm run setup
```

### 2. Environment Configuration

Create a `.env` file with the following variables:

```env
# Shopify App Configuration
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_APP_URL=https://your-app-url.vercel.app

# Database Configuration (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require

# AI Configuration
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Optional Configuration
NODE_ENV=production
SESSION_SECRET=your_session_secret_here
SHOPIFY_SCOPES=write_products,read_products,write_inventory,read_inventory,read_locations,read_orders
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Create database indexes
node scripts/add-session-indexes.js
```

### 4. Development

```bash
# Start development server
npm run dev

# Run linting
npm run lint

# Run tests
npm run test:full
```

### 5. Deployment

```bash
# Deploy to Vercel
npm run deploy

# Or build for production
npm run build
```

## 🧪 Testing

### Comprehensive Test Suite

Run the full test suite to verify all functionality:

```bash
npm run test:full
```

This tests:
- Database connections and operations
- Shopify authentication and API integration
- AI service functionality
- Webhook endpoints
- Frontend routes and components
- Integration scenarios
- Performance benchmarks

### Individual Test Categories

```bash
# Database tests
npm run db:test

# Installation flow tests
npm run test:installation

# Comprehensive app tests
npm run test:comprehensive
```

## 📊 Project Structure

```
├── app/
│   ├── components/          # React components
│   ├── routes/             # Remix routes
│   ├── services/           # Business logic services
│   ├── lib/                # Utility libraries
│   ├── styles/             # CSS styles
│   └── utils/              # Helper utilities
├── prisma/
│   └── schema.prisma       # Database schema
├── scripts/
│   ├── setup-project.js    # Project setup script
│   ├── comprehensive-test-suite.js  # Full test suite
│   ├── db-init.js          # Database initialization
│   └── ...                 # Other utility scripts
├── extensions/             # Shopify app extensions
└── public/                 # Static assets
```

## 🔧 Configuration

### Shopify App Configuration

The app is configured in `shopify.app.toml`:

```toml
client_id = "your_client_id"
name = "focused-policy-app"
handle = "focused-policy-app-6"
application_url = "https://your-app-url.vercel.app/"
embedded = true

[webhooks]
api_version = "2024-07"

[access_scopes]
scopes = "write_products,read_products,write_inventory,read_inventory,read_locations,read_orders"
```

### Database Schema

The Prisma schema includes models for:
- **Session**: Shopify session management
- **Shop**: Store configuration and settings
- **Product**: Product inventory and analytics
- **Variant**: Product variants
- **Inventory**: Multi-location inventory tracking
- **Warehouse**: Warehouse/location management
- **NotificationSetting**: Alert configuration
- **ProductAlert**: Active alerts and notifications
- **AnalyticsData**: Historical analytics
- **DemandForecast**: AI-powered demand predictions

## 🤖 AI Integration

### Google AI Features

- **Inventory Analysis**: Smart stock level recommendations
- **Demand Forecasting**: Predictive analytics for restock timing
- **Natural Language Queries**: AI assistant for inventory questions
- **Trend Analysis**: Sales velocity and pattern recognition

### AI Configuration

```typescript
// Example AI query
const aiResponse = await generateAIResponse({
  query: "How much lipstick inventory do I have?",
  context: { shopId, productData }
});
```

## 📱 App Features

### Dashboard
- Real-time inventory metrics
- Trending products
- Low stock alerts
- Quick actions

### Products
- Product catalog management
- Inventory level monitoring
- AI-powered insights
- Bulk operations

### Inventory
- Multi-location tracking
- Stock level updates
- Movement history
- Automated alerts

### Alerts
- Configurable thresholds
- Multi-channel notifications
- Alert history
- Resolution tracking

### Reports
- Sales velocity analysis
- Demand forecasting
- Inventory turnover
- Performance metrics

### Settings
- Notification preferences
- AI configuration
- Warehouse management
- Integration settings

## 🔔 Notifications

### Supported Channels
- **Email**: SMTP integration
- **Slack**: Webhook notifications
- **Telegram**: Bot integration
- **SMS**: Twilio integration
- **Webhook**: Custom endpoints

### Alert Types
- Low stock warnings
- Critical stock alerts
- High demand notifications
- Restock reminders
- System errors

## 🚀 Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Configure environment variables
3. Deploy with automatic builds

```bash
# Deploy command
npm run deploy
```

### Environment Variables for Production

Ensure all required environment variables are set in Vercel:
- `DATABASE_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `GOOGLE_AI_API_KEY`

## 🔍 Monitoring and Debugging

### Health Checks

```bash
# Database health check
npm run db:test

# App health check
curl https://your-app-url.vercel.app/api/warmup
```

### Logging

The app includes comprehensive logging for:
- Database operations
- Shopify API calls
- AI service interactions
- Error tracking
- Performance monitoring

### Debug Mode

Enable debug mode for detailed logging:

```bash
NODE_ENV=development npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test:full`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
1. Check the documentation
2. Run the test suite: `npm run test:full`
3. Review error logs
4. Contact the development team

## 🔄 Updates and Maintenance

### Regular Maintenance Tasks

```bash
# Update dependencies
npm update

# Regenerate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Run full test suite
npm run test:full
```

### Monitoring Checklist

- [ ] Database connection health
- [ ] Shopify API rate limits
- [ ] AI service availability
- [ ] Notification delivery rates
- [ ] App performance metrics

---

**Built with ❤️ for Planet Beauty**
