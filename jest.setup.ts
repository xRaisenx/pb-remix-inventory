import '@testing-library/jest-dom';

// Mock the Shopify Authenticator
jest.mock('@shopify/shopify-app-remix', () => ({
  // Mock the entire module
  ...jest.requireActual('@shopify/shopify-app-remix'), // Keep original parts you don't need to mock
  ShopifyApp: {
    // Mock any static properties or methods if needed
  },
  // Mock the authenticate object and its methods
  authenticate: {
    admin: jest.fn().mockResolvedValue({
      // Provide a fake session and admin context
      session: { shop: 'mock-shop.myshopify.com', accessToken: 'mock-token' },
      admin: { /* mock admin API context if needed */ },
    }),
  },
}));

// Mock Prisma Client (db.server)
jest.mock('~/db.server', () => ({
  __esModule: true,
  default: {
    // Mock every model and method you use in your tests
    $transaction: jest.fn().mockImplementation(async (callback) => {
      // The transaction mock can just execute the callback with a mocked client
      const mockTx = {
        product: {
          findUnique: jest.fn().mockResolvedValue({ id: 'prod_123', title: 'Mock Product' }),
          create: jest.fn().mockResolvedValue({ id: 'prod_456', title: 'New Mock Product' }),
          // ... add other methods you use
        },
        inventoryLevel: {
          // ... mock inventory methods
        },
      };
      return await callback(mockTx);
    }),
    product: {
      findUnique: jest.fn().mockResolvedValue({ id: 'prod_123', title: 'Mock Product' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'prod_123', title: 'Mock Product' }]),
      // ... add other methods you use
    },
    // ... add other models
  },
}));

// Removed App Bridge mock. No longer needed.
