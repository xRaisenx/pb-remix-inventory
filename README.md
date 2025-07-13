# 🌟 Planet Beauty Inventory AI

**AI-powered inventory management for beauty retailers**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://vercel.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue)](https://www.typescriptlang.org/)
[![Remix](https://img.shields.io/badge/Remix-2.16-purple)](https://remix.run/)
[![Shopify](https://img.shields.io/badge/Shopify-App-orange)](https://shopify.dev/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 🚀 Overview

Planet Beauty Inventory AI is a sophisticated Shopify embedded application that leverages artificial intelligence to provide intelligent inventory management for beauty retailers. Built with modern technologies and corporate-grade architecture, it offers real-time inventory tracking, predictive analytics, and automated alerts.

### ✨ Key Features

- 🤖 **AI-Powered Insights**: Google AI integration for intelligent inventory recommendations
- 📊 **Real-time Analytics**: Comprehensive dashboard with key metrics and visualizations
- 🔔 **Smart Alerts**: Automated notifications for low stock, high demand, and critical inventory levels
- 📱 **Multi-channel Notifications**: Email, Slack, and Telegram integration
- 🔄 **Automated Sync**: Seamless Shopify product and inventory synchronization
- 📈 **Predictive Analytics**: Sales velocity tracking and stockout predictions
- 🎨 **Modern UI**: Polaris design system for consistent Shopify admin experience
- 🏗️ **Enterprise Architecture**: Scalable, maintainable, and production-ready

## 🛠️ Tech Stack

### Frontend
- **Remix** - Full-stack React framework
- **TypeScript** - Type-safe development
- **Shopify Polaris** - Design system and components
- **Vite** - Fast build tooling

### Backend
- **Node.js** - Runtime environment
- **Prisma** - Database ORM
- **PostgreSQL** - Primary database (Neon)
- **Shopify API** - E-commerce integration

### AI & Analytics
- **Google Generative AI** - Intelligent insights
- **Custom Analytics Engine** - Sales velocity and predictions

### Infrastructure
- **Vercel** - Hosting and deployment
- **Neon** - Serverless PostgreSQL
- **Shopify App Bridge** - Embedded app framework

## 📋 Prerequisites

- Node.js 18.20+ or 20.10+
- npm or yarn package manager
- Shopify Partner account
- Neon PostgreSQL database
- Google AI API key

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/planet-beauty/inventory-ai.git
cd inventory-ai
npm install
```

### 2. Environment Configuration

Create a `.env` file with the following variables:

```env
# Shopify Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_orders,write_orders
SHOPIFY_APP_URL=https://your-app.vercel.app

# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database

# AI Configuration
GOOGLE_AI_API_KEY=your_google_ai_api_key

# Security
SESSION_SECRET=your_session_secret

# App Configuration
APP_URL=https://your-app.vercel.app
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:setup

# Test database connection
npm run db:test
```

### 4. Development

```bash
# Start development server
npm run dev

# Run tests
npm run test

# Type checking
npm run type-check

# Linting
npm run lint
```

### 5. Production Deployment

```bash
# Build for production
npm run vercel-build

# Deploy to Vercel
vercel --prod
```

## 📁 Project Structure

```
planet-beauty-inventory-ai/
├── app/
│   ├── components/          # React components
│   │   ├── Metrics.tsx     # Dashboard metrics
│   │   ├── AIAssistant.tsx # AI chat interface
│   │   └── ...
│   ├── routes/             # Remix routes
│   │   ├── app._index.tsx  # Dashboard
│   │   ├── app.products.tsx # Products management
│   │   ├── webhooks/       # Shopify webhooks
│   │   └── ...
│   ├── services/           # Business logic
│   │   ├── ai.server.ts    # AI integration
│   │   ├── inventory.service.ts # Inventory logic
│   │   └── ...
│   ├── styles/             # CSS and styling
│   └── db.server.ts        # Database connection
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── migrations/         # Database migrations
├── scripts/                # Utility scripts
│   ├── setup-project.js    # Project setup
│   ├── test-db-connection.js # Database tests
│   └── ...
├── package.json            # Dependencies and scripts
├── vite.config.ts          # Vite configuration
├── remix.config.js         # Remix configuration
└── README.md               # This file
```

## 🔧 Configuration

### Shopify App Setup

1. Create a new app in your Shopify Partner dashboard
2. Configure the app URL and allowed redirection URLs
3. Set up webhooks for the following topics:
   - `products/create`
   - `products/update`
   - `products/delete`
   - `inventory_levels/update`
   - `orders/create`
   - `orders/paid`
   - `app/uninstalled`

### Database Configuration

The application uses Prisma with PostgreSQL. Key models include:

- **Shop** - Store information and settings
- **Product** - Product data and analytics
- **Variant** - Product variants and inventory
- **Inventory** - Warehouse inventory tracking
- **ProductAlert** - Stock and sales alerts
- **NotificationSetting** - Notification preferences
- **AnalyticsData** - Sales and inventory analytics

### AI Configuration

The AI system uses Google's Generative AI for:

- Inventory recommendations
- Sales trend analysis
- Stockout predictions
- Demand forecasting

## 🧪 Testing

### Test Suite

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Installation flow test
npm run test:installation

# Comprehensive test suite
npm run test:comprehensive
```

### Test Coverage

- ✅ Database connectivity and operations
- ✅ Shopify authentication and webhooks
- ✅ API endpoints and responses
- ✅ Frontend component rendering
- ✅ AI integration and responses
- ✅ Notification system
- ✅ Error handling and edge cases

## 🚀 Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Configure environment variables
3. Set build command: `npm run vercel-build`
4. Deploy automatically on push to main branch

### Environment Variables

Ensure all required environment variables are set in your Vercel project:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `DATABASE_URL`
- `GOOGLE_AI_API_KEY`
- `SESSION_SECRET`
- `APP_URL`

### Database Migration

The application automatically runs database migrations during deployment. Ensure your database is accessible and has the necessary permissions.

## 📊 Monitoring & Analytics

### Health Checks

- Database connectivity monitoring
- Shopify API status checks
- AI service availability
- Webhook delivery tracking

### Performance Metrics

- Response time monitoring
- Database query optimization
- Memory usage tracking
- Error rate monitoring

### Logging

- Structured logging throughout the application
- Error tracking and alerting
- Performance monitoring
- User activity tracking

## 🔒 Security

### Authentication

- Shopify OAuth 2.0 implementation
- Session management with secure cookies
- CSRF protection
- Rate limiting

### Data Protection

- Encrypted sensitive data storage
- Secure API communication
- Database connection security
- Environment variable protection

### Compliance

- GDPR compliance for data handling
- Shopify App Store guidelines
- Security best practices
- Regular security audits

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Conventional commits for version control

### Testing Requirements

- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance testing for scalability

## 📈 Performance Optimization

### Build Optimization

- Vite for fast development and builds
- Code splitting for optimal loading
- Tree shaking for bundle size reduction
- Asset optimization and compression

### Runtime Optimization

- Database query optimization
- Caching strategies
- Lazy loading of components
- Memory leak prevention

### Monitoring

- Real-time performance monitoring
- Error tracking and alerting
- User experience metrics
- Resource usage optimization

## 🆘 Support

### Documentation

- [API Documentation](./docs/api.md)
- [Deployment Guide](./docs/deployment.md)
- [Troubleshooting Guide](./docs/troubleshooting.md)
- [Contributing Guidelines](./docs/contributing.md)

### Contact

- **Email**: support@planetbeauty.com
- **GitHub Issues**: [Create an issue](https://github.com/planet-beauty/inventory-ai/issues)
- **Documentation**: [Full documentation](https://docs.planetbeauty.com)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Shopify for the excellent platform and tools
- Remix team for the amazing framework
- Vercel for seamless deployment
- Neon for serverless PostgreSQL
- Google for AI capabilities

---

**Built with ❤️ by the Planet Beauty team**

*Empowering beauty retailers with intelligent inventory management*
