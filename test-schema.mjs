import { PrismaClient } from '@prisma/client';

async function testSchema() {
  const prisma = new PrismaClient();
  
  try {
    // Test creating a shop first
    const shop = await prisma.shop.create({
      data: {
        shop: `test-shop-${Date.now()}.myshopify.com`,
        emailForNotifications: 'test@example.com'
      }
    });
    
    console.log('Shop created:', shop.id);
    
    // Test creating a product
    const product = await prisma.product.create({
      data: {
        shopifyId: `test-product-${Date.now()}`,
        title: 'Test Product',
        vendor: 'Test Vendor',
        shopId: shop.id,
        quantity: 10
      }
    });
    
    console.log('Product created:', product.id);
    console.log('Product quantity:', product.quantity);
    
    // Clean up
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.shop.delete({ where: { id: shop.id } });
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testSchema();