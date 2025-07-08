#!/usr/bin/env node

/**
 * Planet Beauty Inventory AI - Demo Validation Script
 * 
 * This script validates all enhanced features before client demo
 * Run: node scripts/demo-validation.js
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.magenta}${colors.bright}🚀 ${msg}${colors.reset}\n`)
};

class DemoValidator {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
  }

  async validateFileExists(path, description) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(path)) {
        log.success(`${description} exists`);
        this.passed++;
        return true;
      } else {
        log.error(`${description} missing: ${path}`);
        this.failed++;
        return false;
      }
    } catch (error) {
      log.error(`Error checking ${description}: ${error.message}`);
      this.failed++;
      return false;
    }
  }

  async validateEnhancedComponents() {
    log.header('Validating Enhanced Components');
    
    const components = [
      { path: 'app/components/PlanetBeautyLayout.tsx', desc: 'Planet Beauty Layout' },
      { path: 'app/components/AIAssistant.tsx', desc: 'Enhanced AI Assistant' },
      { path: 'app/components/ProductModal.tsx', desc: 'Enhanced Product Modal' },
      { path: 'app/components/ProductAlerts.tsx', desc: 'Enhanced Product Alerts' },
      { path: 'app/components/Settings.tsx', desc: 'Enhanced Settings' },
      { path: 'app/components/Metrics.tsx', desc: 'Enhanced Metrics' },
      { path: 'app/components/TrendingProducts.tsx', desc: 'Enhanced Trending Products' }
    ];

    for (const component of components) {
      await this.validateFileExists(component.path, component.desc);
    }
  }

  async validateEnhancedPages() {
    log.header('Validating Enhanced Pages');
    
    const pages = [
      { path: 'app/routes/app._index.tsx', desc: 'Enhanced Dashboard' },
      { path: 'app/routes/app.products.tsx', desc: 'Enhanced Products Page' },
      { path: 'app/routes/app.alerts.tsx', desc: 'Enhanced Alerts Page' },
      { path: 'app/routes/app.reports.tsx', desc: 'Enhanced Reports Page' },
      { path: 'app/routes/app.settings.tsx', desc: 'Enhanced Settings Page' }
    ];

    for (const page of pages) {
      await this.validateFileExists(page.path, page.desc);
    }
  }

  async validatePlanetBeautyStyles() {
    log.header('Validating Planet Beauty Styles');
    
    try {
      const fs = await import('fs');
      const cssPath = 'app/styles/app.css';
      
      if (!fs.existsSync(cssPath)) {
        log.error('Planet Beauty CSS file missing');
        this.failed++;
        return;
      }

      const cssContent = fs.readFileSync(cssPath, 'utf8');
      const requiredStyles = [
        ':root',
        '--pb-primary',
        '--pb-secondary', 
        '.pb-card',
        '.pb-btn-primary',
        '.pb-btn-secondary',
        '.pb-navbar',
        '.pb-sidebar'
      ];

      let stylesFound = 0;
      for (const style of requiredStyles) {
        if (cssContent.includes(style)) {
          stylesFound++;
        } else {
          log.warning(`Missing Planet Beauty style: ${style}`);
          this.warnings++;
        }
      }

      if (stylesFound === requiredStyles.length) {
        log.success('All Planet Beauty styles present');
        this.passed++;
      } else {
        log.warning(`${stylesFound}/${requiredStyles.length} Planet Beauty styles found`);
        this.warnings++;
      }

    } catch (error) {
      log.error(`Error validating styles: ${error.message}`);
      this.failed++;
    }
  }

  async validateDatabaseSchema() {
    log.header('Validating Database Schema');
    
    try {
      const fs = await import('fs');
      const schemaPath = 'prisma/schema.prisma';
      
      if (!fs.existsSync(schemaPath)) {
        log.error('Prisma schema missing');
        this.failed++;
        return;
      }

      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const requiredModels = [
        'model Session',
        'model Shop', 
        'model Product',
        'model ProductAlert',
        'model AnalyticsData',
        'model NotificationLog',
        'model NotificationSettings'
      ];

      let modelsFound = 0;
      for (const model of requiredModels) {
        if (schemaContent.includes(model)) {
          modelsFound++;
        } else {
          log.warning(`Missing database model: ${model}`);
          this.warnings++;
        }
      }

      if (modelsFound === requiredModels.length) {
        log.success('All required database models present');
        this.passed++;
      } else {
        log.warning(`${modelsFound}/${requiredModels.length} database models found`);
        this.warnings++;
      }

    } catch (error) {
      log.error(`Error validating database schema: ${error.message}`);
      this.failed++;
    }
  }

  async validatePackageDependencies() {
    log.header('Validating Package Dependencies');
    
    try {
      const fs = await import('fs');
      const packagePath = 'package.json';
      
      if (!fs.existsSync(packagePath)) {
        log.error('package.json missing');
        this.failed++;
        return;
      }

      const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const dependencies = packageContent.dependencies || {};
      
      const requiredDeps = [
        '@remix-run/react',
        '@prisma/client',
        '@shopify/polaris',
        'react',
        'react-dom'
      ];

      let depsFound = 0;
      for (const dep of requiredDeps) {
        if (dependencies[dep]) {
          depsFound++;
        } else {
          log.warning(`Missing dependency: ${dep}`);
          this.warnings++;
        }
      }

      if (depsFound === requiredDeps.length) {
        log.success('All required dependencies present');
        this.passed++;
      } else {
        log.warning(`${depsFound}/${requiredDeps.length} dependencies found`);
        this.warnings++;
      }

    } catch (error) {
      log.error(`Error validating dependencies: ${error.message}`);
      this.failed++;
    }
  }

  async validateEnhancedFeatures() {
    log.header('Validating Enhanced Features');
    
    try {
      const fs = await import('fs');
      
      // Check AI Assistant enhancements
      const aiPath = 'app/components/AIAssistant.tsx';
      if (fs.existsSync(aiPath)) {
        const aiContent = fs.readFileSync(aiPath, 'utf8');
        const aiFeatures = [
          'typing indicator',
          'proactive suggestions',
          'Planet Beauty specific',
          'quick suggestions'
        ];
        
        let aiEnhanced = aiFeatures.every(feature => 
          aiContent.toLowerCase().includes(feature.toLowerCase().replace(' ', ''))
        );
        
        if (aiEnhanced) {
          log.success('AI Assistant enhancements verified');
          this.passed++;
        } else {
          log.warning('AI Assistant may be missing some enhancements');
          this.warnings++;
        }
      }

      // Check Product Alerts enhancements
      const alertsPath = 'app/components/ProductAlerts.tsx';
      if (fs.existsSync(alertsPath)) {
        const alertsContent = fs.readFileSync(alertsPath, 'utf8');
        const alertFeatures = [
          'send notification',
          'notification history',
          'color-coded',
          'filter'
        ];
        
        let alertsEnhanced = alertFeatures.every(feature => 
          alertsContent.toLowerCase().includes(feature.toLowerCase().replace(' ', ''))
        );
        
        if (alertsEnhanced) {
          log.success('Product Alerts enhancements verified');
          this.passed++;
        } else {
          log.warning('Product Alerts may be missing some enhancements');
          this.warnings++;
        }
      }

    } catch (error) {
      log.error(`Error validating enhanced features: ${error.message}`);
      this.failed++;
    }
  }

  generateDemoChecklist() {
    log.header('Demo Preparation Checklist');
    
    const checklist = [
      '🎯 Test AI Assistant responses',
      '📊 Verify metrics display correctly', 
      '🔔 Test alert notifications',
      '📱 Check mobile responsiveness',
      '🎨 Confirm Planet Beauty branding',
      '📈 Test reports generation',
      '⚙️ Verify settings functionality',
      '🔍 Test product search/filtering',
      '💾 Test CSV export',
      '🚀 Check loading states'
    ];

    console.log('\n📋 Pre-Demo Testing Checklist:\n');
    checklist.forEach(item => console.log(`   ${item}`));
    
    console.log('\n💡 Demo Script Suggestions:');
    console.log('   1. Start with dashboard overview');
    console.log('   2. Demonstrate AI assistant with sample queries');
    console.log('   3. Show alert management and notifications');
    console.log('   4. Display product management features');
    console.log('   5. Generate and export a report');
    console.log('   6. Configure notification settings');
    console.log('   7. Show mobile responsiveness');
  }

  async runValidation() {
    console.log(`${colors.cyan}${colors.bright}`);
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              🌟 PLANET BEAUTY INVENTORY AI 🌟              ║');
    console.log('║                   Demo Validation Suite                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(colors.reset);

    await this.validateEnhancedComponents();
    await this.validateEnhancedPages();
    await this.validatePlanetBeautyStyles();
    await this.validateDatabaseSchema();
    await this.validatePackageDependencies();
    await this.validateEnhancedFeatures();
    
    // Summary
    log.header('Validation Summary');
    console.log(`${colors.green}✅ Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Warnings: ${this.warnings}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${this.failed}${colors.reset}`);
    
    const total = this.passed + this.warnings + this.failed;
    const successRate = total > 0 ? Math.round((this.passed / total) * 100) : 0;
    
    console.log(`\n${colors.bright}🎯 Success Rate: ${successRate}%${colors.reset}`);
    
    if (successRate >= 80) {
      log.success('System ready for client demo! 🚀');
    } else if (successRate >= 60) {
      log.warning('System mostly ready - address warnings before demo');
    } else {
      log.error('System needs attention before demo');
    }

    this.generateDemoChecklist();
    
    console.log(`\n${colors.magenta}${colors.bright}Ready to showcase Planet Beauty Inventory AI! 💪${colors.reset}\n`);
  }
}

// Run validation
const validator = new DemoValidator();
validator.runValidation().catch(console.error);