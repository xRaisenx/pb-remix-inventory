// app/services/ai.server.ts
import prisma from "../db.server";

// Enhanced AI service with improved intent parsing and error handling
export interface AIQuery {
  text: string;
  shopId: string;
  userId?: string;
  sessionId?: string;
}

export interface AIResponse {
  success: boolean;
  intent: string;
  message: string;
  data?: any;
  suggestions?: string[];
  error?: string;
  confidence?: number;
  processingTime?: number;
}

// Intent categories and patterns
const INTENT_PATTERNS = {
  // Stock level queries
  STOCK_CHECK: [
    /how much.*(?:stock|inventory).*(?:do i have|available)/i,
    /what.*(?:stock|inventory).*(?:level|amount)/i,
    /check.*(?:stock|inventory)/i,
    /show.*(?:stock|inventory)/i,
    /(?:stock|inventory).*status/i,
    /(?:quantity|amount).*available/i
  ],
  
  // Low stock queries
  LOW_STOCK: [
    /(?:what|which).*(?:products|items).*(?:low|running low)/i,
    /show.*low.*stock/i,
    /(?:critical|low).*(?:stock|inventory)/i,
    /(?:products|items).*need.*(?:restock|reorder)/i,
    /(?:out of stock|stockout)/i
  ],
  
  // Product search
  PRODUCT_SEARCH: [
    /(?:find|search|look for|show me).*product/i,
    /product.*(?:called|named)/i,
    /(?:do you have|got any).*(?:product|item)/i,
    /where.*(?:product|item)/i
  ],
  
  // Sales and trending
  SALES_TRENDING: [
    /(?:what|which).*(?:selling|popular|trending)/i,
    /(?:best|top).*(?:seller|selling|product)/i,
    /(?:hot|trending|popular).*(?:product|item)/i,
    /sales.*(?:performance|data)/i,
    /(?:fast|quick).*moving/i
  ],
  
  // Forecasting and predictions
  FORECAST: [
    /(?:predict|forecast|estimate).*(?:sales|demand)/i,
    /(?:when|how long).*(?:until|before).*(?:out of stock|stockout)/i,
    /(?:reorder|restocking).*(?:date|time)/i,
    /(?:how much|quantity).*(?:order|buy)/i
  ],
  
  // Analytics and insights
  ANALYTICS: [
    /(?:show|give).*(?:analytics|insights|report)/i,
    /(?:performance|metrics|stats)/i,
    /(?:summary|overview).*inventory/i,
    /(?:compare|comparison)/i
  ],
  
  // Help and guidance
  HELP: [
    /help/i,
    /(?:how to|how do i)/i,
    /(?:what can|what do).*(?:you do|you help)/i,
    /(?:guide|tutorial|instructions)/i
  ]
};

// Enhanced entity extraction
function extractEntities(text: string): {
  productNames: string[];
  quantities: number[];
  timeframes: string[];
  categories: string[];
  priorities: string[];
} {
  const entities = {
    productNames: [] as string[],
    quantities: [] as number[],
    timeframes: [] as string[],
    categories: [] as string[],
    priorities: [] as string[]
  };

  // Extract quoted product names
  const quotedMatches = text.match(/"([^"]+)"/g);
  if (quotedMatches) {
    entities.productNames.push(...quotedMatches.map(m => m.replace(/"/g, '')));
  }

  // Extract quantities
  const quantityMatches = text.match(/(\d+)\s*(?:units?|pieces?|items?)?/gi);
  if (quantityMatches) {
    entities.quantities.push(...quantityMatches.map(m => parseInt(m.match(/\d+/)?.[0] || '0')));
  }

  // Extract timeframes
  const timeframePatterns = [
    /(?:in|within|next|last|past)\s+(\d+)\s+(day|week|month|year)s?/gi,
    /(today|tomorrow|yesterday|this week|next week|this month|next month)/gi
  ];
  
  for (const pattern of timeframePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      entities.timeframes.push(...matches);
    }
  }

  // Extract categories/types
  const categoryPatterns = [
    /(?:beauty|cosmetic|skincare|makeup|fragrance|hair|nail)/gi,
    /(?:lipstick|foundation|mascara|eyeshadow|blush|concealer)/gi,
    /(?:shampoo|conditioner|serum|cream|lotion|cleanser)/gi
  ];
  
  for (const pattern of categoryPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      entities.categories.push(...matches.map(m => m.toLowerCase()));
    }
  }

  // Extract priority indicators
  const priorityPatterns = [
    /(urgent|critical|high priority|asap|immediate)/gi,
    /(low|medium|high|critical)\s+(?:priority|importance)/gi
  ];
  
  for (const pattern of priorityPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      entities.priorities.push(...matches.map(m => m.toLowerCase()));
    }
  }

  return entities;
}

// Improved intent classification
function classifyIntent(text: string): { intent: string; confidence: number } {
  const normalizedText = text.toLowerCase().trim();
  let bestMatch = { intent: 'UNKNOWN', confidence: 0 };

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        const confidence = calculateConfidence(normalizedText, pattern);
        if (confidence > bestMatch.confidence) {
          bestMatch = { intent, confidence };
        }
      }
    }
  }

  // Fallback to keyword matching if no patterns match
  if (bestMatch.confidence < 0.5) {
    const keywordMatch = classifyByKeywords(normalizedText);
    if (keywordMatch.confidence > bestMatch.confidence) {
      bestMatch = keywordMatch;
    }
  }

  return bestMatch;
}

// Calculate pattern match confidence
function calculateConfidence(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) return 0;
  
  const matchLength = match[0].length;
  const textLength = text.length;
  const coverage = matchLength / textLength;
  
  // Base confidence on coverage and specificity
  return Math.min(0.9, 0.3 + coverage * 0.6);
}

// Keyword-based classification fallback
function classifyByKeywords(text: string): { intent: string; confidence: number } {
  const keywords = {
    STOCK_CHECK: ['stock', 'inventory', 'quantity', 'available', 'level'],
    LOW_STOCK: ['low', 'critical', 'running', 'empty', 'restock', 'reorder'],
    PRODUCT_SEARCH: ['find', 'search', 'show', 'product', 'item'],
    SALES_TRENDING: ['selling', 'popular', 'trending', 'best', 'top', 'hot'],
    FORECAST: ['predict', 'forecast', 'when', 'estimate', 'future'],
    ANALYTICS: ['analytics', 'report', 'performance', 'metrics', 'insights'],
    HELP: ['help', 'how', 'guide', 'tutorial', 'instructions']
  };

  let bestMatch = { intent: 'UNKNOWN', confidence: 0 };

  for (const [intent, intentKeywords] of Object.entries(keywords)) {
    const matches = intentKeywords.filter(keyword => text.includes(keyword));
    const confidence = matches.length / intentKeywords.length * 0.7; // Max 0.7 for keyword matching
    
    if (confidence > bestMatch.confidence) {
      bestMatch = { intent, confidence };
    }
  }

  return bestMatch;
}

// Input validation
function validateAIQuery(query: AIQuery): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!query.text || typeof query.text !== 'string') {
    errors.push('Query text is required');
  } else if (query.text.length > 2000) {
    errors.push('Query text cannot exceed 2000 characters');
  } else if (query.text.trim().length < 3) {
    errors.push('Query text must be at least 3 characters long');
  }

  if (!query.shopId || typeof query.shopId !== 'string') {
    errors.push('Shop ID is required');
  }

  return { isValid: errors.length === 0, errors };
}

// Removed unused StockCheckProductVariant interface

// Removed unused StockCheckProduct interface

// Removed unused LowStockProductVariant interface

// Removed unused LowStockProduct interface

// Removed unused ProductSearchProductVariant interface

// Removed unused ProductSearchProduct interface

// Removed unused TrendingProductAnalyticsData interface

// Removed unused TrendingProduct interface

async function handleStockCheck(entities: any, shopId: string): Promise<Partial<AIResponse>> {
  try {
    // Optimized query with selective fields and proper indexing
    const products: any[] = await prisma.product.findMany({
      where: {
        shopId,
        ...(entities.productNames.length > 0 && {
          title: {
            in: entities.productNames.map((name: string) => name.toLowerCase()),
            mode: 'insensitive'
          }
        }),
        ...(entities.categories.length > 0 && {
          tags: {
            hasSome: entities.categories
          }
        })
      },
      include: {
        Variant: {
        }
      },
      orderBy: { id: 'asc' },
      take: 10
    });

    if (products.length === 0) {
      return {
        message: entities.productNames.length > 0 
          ? `I couldn't find any products matching "${entities.productNames.join(', ')}". Try searching with different terms.`
          : "No products found in your inventory.",
        suggestions: [
          "Try searching for a specific product name",
          "Check if the product name is spelled correctly",
          "Browse all products in your inventory"
        ]
      };
    }

    const stockInfo = products.map(product => ({
      title: product.title,
      quantity: product.Variant.reduce((sum: number, v: any) => sum + (v.Inventory?.reduce((invSum: number, inv: any) => invSum + (inv.quantity || 0), 0) || 0), 0),
      status: product.status,
      sku: product.Variant[0]?.sku || 'N/A'
    }));

    const totalProducts = stockInfo.length;
    const lowStockCount = stockInfo.filter(p => p.status === 'Low' || p.status === 'Critical').length;

    let message = `Found ${totalProducts} product${totalProducts !== 1 ? 's' : ''}:\n\n`;
    
    stockInfo.forEach(product => {
      const statusEmoji = {
        'OK': '✅',
        'Low': '⚠️',
        'Critical': '🔴',
        'OutOfStock': '❌',
        'Unknown': '❓'
      }[product.status as string] || '❓';
      
      message += `${statusEmoji} **${product.title}**: ${product.quantity} units (${product.status})\n`;
    });

    if (lowStockCount > 0) {
      message += `\n🚨 **Alert**: ${lowStockCount} product${lowStockCount !== 1 ? 's' : ''} need${lowStockCount === 1 ? 's' : ''} attention!`;
    }

    return {
      message,
      data: stockInfo,
      suggestions: [
        "Update inventory levels",
        "Set up automatic reorder points",
        "View detailed product analytics"
      ]
    };

  } catch (error) {
    console.error('Stock check query failed:', error);
    return {
      message: "I encountered an error while checking your stock levels. Please try again.",
      error: 'STOCK_CHECK_ERROR'
    };
  }
}

async function handleLowStockQuery(entities: any, shopId: string): Promise<Partial<AIResponse>> {
  try {
    // Optimized query with status index and selective fields
    const lowStockProducts: any[] = await prisma.product.findMany({
      where: {
        shopId,
        status: {
          in: ['Low', 'Critical', 'OutOfStock']
        }
      },
      include: {
        Variant: {
        }
      },
      orderBy: [
        { status: 'desc' },
        { id: 'asc' }
      ],
      take: 20
    });

    if (lowStockProducts.length === 0) {
      return {
        message: "🎉 Great news! All your products are well-stocked. No immediate restocking needed.",
        suggestions: [
          "Review sales trends to predict future needs",
          "Set up automated alerts for low stock",
          "Analyze product performance"
        ]
      };
    }

    const criticalCount = lowStockProducts.filter((p: LowStockProduct): boolean => p.status === 'Critical').length;
    const lowCount = lowStockProducts.filter((p: LowStockProduct): boolean => p.status === 'Low').length;
    const outOfStockCount = lowStockProducts.filter((p: LowStockProduct): boolean => p.status === 'OutOfStock').length;

    let message = `📊 **Stock Alert Summary**:\n`;
    if (criticalCount > 0) message += `🔴 ${criticalCount} Critical\n`;
    if (lowCount > 0) message += `⚠️ ${lowCount} Low Stock\n`;
    if (outOfStockCount > 0) message += `❌ ${outOfStockCount} Out of Stock\n`;

    message += `\n**Products needing attention**:\n\n`;

    lowStockProducts.slice(0, 10).forEach((product: any) => {
      const totalQuantity = product.Variant.reduce((sum: number, v: any) => sum + (v.Inventory?.reduce((invSum: number, inv: any) => invSum + (inv.quantity || 0), 0) || 0), 0);
      const statusEmoji = {
        'Critical': '🔴',
        'Low': '⚠️',
        'OutOfStock': '❌'
      }[product.status as string] || '❓';
      
      const urgency = product.status === 'Critical' ? ' - URGENT' : 
                     product.status === 'OutOfStock' ? ' - IMMEDIATE ACTION NEEDED' : '';
      
      message += `${statusEmoji} **${product.title}**: ${totalQuantity} units${urgency}\n`;
    });

    if (lowStockProducts.length > 10) {
      message += `\n_...and ${lowStockProducts.length - 10} more products_`;
    }

    const suggestions = [
      "Set up automatic reordering",
      "Review supplier lead times",
      "Analyze demand patterns"
    ];

    if (criticalCount > 0) {
      suggestions.unshift("Reorder critical items immediately");
    }

    return {
      message,
      data: {
        summary: { critical: criticalCount, low: lowCount, outOfStock: outOfStockCount },
        products: lowStockProducts.map((p: any) => ({
          id: p.id,
          title: p.title,
          quantity: p.Variant.reduce((sum: number, v: any) => sum + (v.Inventory?.reduce((invSum: number, inv: any) => invSum + (inv.quantity || 0), 0) || 0), 0),
          status: p.status
        }))
      },
      suggestions
    };

  } catch (error) {
    console.error('Low stock query failed:', error);
    return {
      message: "I encountered an error while checking for low stock items. Please try again.",
      error: 'LOW_STOCK_ERROR'
    };
  }
}

async function handleProductSearch(entities: any, shopId: string): Promise<Partial<AIResponse>> {
  try {
    // ... (code before the loop is unchanged)

    if (entities.productNames.length === 0 && entities.categories.length === 0) {
      return {
        message: "I'd be happy to help you find products! Please specify what you're looking for.",
        suggestions: [
          'Search by product name: "lipstick"',
          'Search by category: "skincare products"',
          'Use quotes for exact names: "MAC Ruby Woo"'
        ]
      };
    }

    const searchTerms = [...entities.productNames, ...entities.categories];
    
    const products = await prisma.product.findMany({
      where: {
        shopId,
        OR: [
          {
            title: {
              contains: searchTerms.join(' '),
              mode: 'insensitive'
            }
          },
          {
            tags: {
              hasSome: searchTerms
            }
          },
          {
            vendor: {
              in: searchTerms,
              mode: 'insensitive'
            }
          }
        ]
      },
      include: {
        Variant: {
        }
      },
      take: 15
    });

    if (products.length === 0) {
      return {
        message: `I couldn't find any products matching "${searchTerms.join(', ')}". Here are some suggestions:`,
        suggestions: [
          "Check the spelling of the product name",
          "Try searching with partial names",
          "Browse products by category",
          "Check if the product exists in your inventory"
        ]
      };
    }

    let message = `🔍 Found ${products.length} product${products.length !== 1 ? 's' : ''} matching your search:\n\n`;

    products.forEach((product: any) => {
      const totalQuantity = product.Variant.reduce((sum: number, v: any) => sum + (v.Inventory?.reduce((invSum: number, inv: any) => invSum + (inv.quantity || 0), 0) || 0), 0);
      const avgPrice = product.Variant.length > 0
        ? product.Variant.reduce((sum: number, v: any) => sum + Number(v.price || 0), 0) / product.Variant.length
        : 0;
      
      const statusEmoji = {
        'OK': '✅',
        'Low': '⚠️',
        'Critical': '🔴',
        'OutOfStock': '❌',
        'Unknown': '❓'
      }[product.status as string] || '❓';

      message += `${statusEmoji} **${product.title}**\n`;
      message += `   Stock: ${totalQuantity} units | Price: $${avgPrice.toFixed(2)}\n`;
      if (product.vendor) message += `   Brand: ${product.vendor}\n`;
      message += `\n`;
    });

    return {
      message,
      // FIX: Add type to 'p' and use 'p' instead of 'product' inside the map
      data: products.map((p: any) => ({
        id: p.id,
        title: p.title,
        vendor: p.vendor,
        quantity: p.Variant.reduce((sum: number, v: any) => sum + (v.Inventory?.reduce((invSum: number, inv: any) => invSum + (inv.quantity || 0), 0) || 0), 0),
        status: p.status,
        avgPrice: p.Variant.length > 0
          ? p.Variant.reduce((sum: number, v: any) => sum + Number(v.price || 0), 0) / p.Variant.length
          : 0
      })),
      suggestions: [
        "View detailed product information",
        "Update inventory levels",
        "Set up stock alerts for these products"
      ]
    };

  } catch (error) {
    console.error('Product search failed:', error);
    return {
      message: "I encountered an error while searching for products. Please try again.",
      error: 'PRODUCT_SEARCH_ERROR'
    };
  }
}

async function handleTrendingQuery(entities: any, shopId: string): Promise<Partial<AIResponse>> {
  try {
    // ... (code before the return statement is unchanged)

    const trendingProducts = await prisma.product.findMany({
      where: {
        shopId,
        OR: [
          { trending: true },
          { salesVelocityFloat: { gt: 0 } }
        ]
      },
      include: {
        Variant: true
      },
      orderBy: [
        { salesVelocityFloat: 'desc' },
        { trending: 'desc' }
      ],
      take: 10
    });

    if (trendingProducts.length === 0) {
      return {
        message: "📈 I don't see any particularly trending products right now. This could mean:\n\n• Sales are stable across all products\n• You may need more sales data for trend analysis\n• Consider reviewing your product performance metrics",
        suggestions: [
          "Review sales data from the past month",
          "Check product performance analytics",
          "Set up trend tracking for key products"
        ]
      };
    }

    let message = `🔥 **Trending Products** (Top ${trendingProducts.length}):\n\n`;

    trendingProducts.forEach((product: any, index: number) => {
      // Aggregate recent sales across all variants
      const recentSales = product.Variant?.reduce((sum: number, variant: any) => {
        return sum + (variant.AnalyticsData?.reduce((vSum: number, data: any) => vSum + (data.unitsSold || 0), 0) || 0);
      }, 0) || 0;
      const velocity = product.salesVelocityFloat || 0;
      
      const trendEmoji = velocity > 10 ? '🚀' : velocity > 5 ? '📈' : '📊';
      
      message += `${index + 1}. ${trendEmoji} **${product.title}**\n`;
      message += `   Sales Velocity: ${velocity.toFixed(1)} units/day\n`;
      if (recentSales > 0) message += `   Recent Sales: ${recentSales} units (7 days)\n`;
      message += `\n`;
    });

    // FIX: The entire return object was malformed. This is the correct structure.
    return {
      message,
      data: trendingProducts.map((p: any) => ({
        id: p.id,
        title: p.title,
        salesVelocity: p.salesVelocityFloat,
        trending: p.trending,
        recentSales: p.Variant?.reduce((sum: number, variant: any) => {
          return sum + (variant.AnalyticsData?.reduce((vSum: number, data: any) => vSum + (data.unitsSold || 0), 0) || 0);
        }, 0) || 0
      })),
      suggestions: [
        "Increase inventory for trending items",
        "Analyze what's driving these trends",
        "Consider promotional opportunities"
      ]
    };

  } catch (error) {
    console.error('Trending query failed:', error);
    return {
      message: "I encountered an error while analyzing trending products. Please try again.",
      error: 'TRENDING_ERROR'
    };
  }
}

async function handleHelpQuery(): Promise<Partial<AIResponse>> {
  return {
    message: `👋 **Hello! I'm your Planet Beauty Inventory AI assistant.**

Here's what I can help you with:

**📦 Inventory Management**
• "Check stock levels for lipstick"
• "Show me low stock items"
• "How much inventory do I have?"

**🔍 Product Search**
• "Find products by MAC"
• "Show me skincare products"
• "Search for foundation"

**📈 Sales & Trends**
• "What's trending right now?"
• "Show me best sellers"
• "Which products are popular?"

**📊 Analytics & Insights**
• "Give me an inventory overview"
• "Show performance metrics"
• "Predict when I'll run out of stock"

**💡 Tips for better results:**
• Use specific product names in quotes
• Mention quantities when relevant
• Ask about timeframes (this week, next month)

Just ask me anything about your inventory in natural language!`,
    suggestions: [
      "Check my stock levels",
      "Show trending products",
      "Find low stock items",
      "Search for a specific product"
    ]
  };
}

// Main AI query processing function
export async function processAIQuery(query: AIQuery): Promise<AIResponse> {
  const startTime = Date.now();
  
  try {
    // Validate input
    const validation = validateAIQuery(query);
    if (!validation.isValid) {
      return {
        success: false,
        intent: 'VALIDATION_ERROR',
        message: 'Invalid query: ' + validation.errors.join(', '),
        error: 'VALIDATION_ERROR'
      };
    }

    // Classify intent
    const { intent, confidence } = classifyIntent(query.text);
    
    // Extract entities
    const entities = extractEntities(query.text);

    // Handle the query based on intent
    let response: Partial<AIResponse> = {};

    switch (intent) {
      case 'STOCK_CHECK':
        response = await handleStockCheck(entities, query.shopId);
        break;
      case 'LOW_STOCK':
        response = await handleLowStockQuery(entities, query.shopId);
        break;
      case 'PRODUCT_SEARCH':
        response = await handleProductSearch(entities, query.shopId);
        break;
      case 'SALES_TRENDING':
        response = await handleTrendingQuery(entities, query.shopId);
        break;
      case 'HELP':
        response = await handleHelpQuery();
        break;
      default:
        response = {
          message: "I'm not sure how to help with that specific request. Try asking about stock levels, product searches, or trending items.",
          suggestions: [
            "Check stock levels",
            "Find low stock products",
            "Search for specific products",
            "Ask for help"
          ]
        };
    }

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      intent,
      confidence,
      processingTime,
      message: response.message || "I processed your request successfully.",
      data: response.data,
      suggestions: response.suggestions || [],
      error: response.error
    };
  } catch (error) {
    console.error('AI query processing failed:', error);
    
    const processingTime = Date.now() - startTime;
    
    return {
      success: false,
      intent: 'ERROR',
      message: "I encountered an error processing your request. Please try again or rephrase your question.",
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime,
      suggestions: [
        "Try rephrasing your question",
        "Ask for help to see what I can do",
        "Check your internet connection"
      ]
    };
  }
}

// Removed unused getQuerySuggestions helper
/*
async function getQuerySuggestions(shopId: string): Promise<string[]> {
  try {
    const [lowStockCount, totalProducts, trendingCount] = await Promise.all([
      prisma.product.count({
        where: {
          shopId,
          status: { in: ['Low', 'Critical', 'OutOfStock'] }
        }
      }),
      prisma.product.count({ where: { shopId } }),
      prisma.product.count({
        where: {
          shopId,
          trending: true
        }
      })
    ]);

    const suggestions = [
      "Show me my inventory overview",
      "What products need restocking?"
    ];

    if (lowStockCount > 0) {
      suggestions.unshift(`I have ${lowStockCount} low stock items`);
    }

    if (trendingCount > 0) {
      suggestions.push("What's trending right now?");
    }

    if (totalProducts > 0) {
      suggestions.push("Find products by category");
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions

  } catch (error) {
    console.error('Failed to generate query suggestions:', error);
    return [
      "Check my stock levels",
      "Show trending products",
      "Find low stock items",
      "Help me get started"
    ];
  }
}
*/
