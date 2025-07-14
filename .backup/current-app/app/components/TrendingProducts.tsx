import React from 'react';
import type { DashboardTrendingProduct } from '~/types';

interface TrendingProductsProps {
  products: Array<DashboardTrendingProduct>;
}

// Map product names to CSS classes for background colors (matching example)
const getProductClassName = (title: string): string => {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('anastasia') && titleLower.includes('brow')) return 'anastasia-brow-gel';
  if (titleLower.includes('elta') && titleLower.includes('md')) return 'elta-md-sunscreen';
  if (titleLower.includes('borghese') && titleLower.includes('serum')) return 'borghese-serum';
  if (titleLower.includes('kerastase') && titleLower.includes('shampoo')) return 'kerastase-shampoo';
  if (titleLower.includes('mario') && titleLower.includes('badescu')) return 'mario-badescu-spray';
  if (titleLower.includes('t3') && titleLower.includes('hair')) return 't3-hair-dryer';
  return 'default-product'; // Fallback
};

export const TrendingProducts: React.FC<TrendingProductsProps> = ({ products }) => {
  if (!products || products.length === 0) {
    return (
      <div className="pb-card">
        <p className="pb-text-sm text-center" style={{ color: '#718096' }}>
          No trending products at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-mb-6">
      <h2 className="pb-text-lg pb-font-medium pb-mb-4">Trending Products</h2>
      <div className="pb-grid pb-grid-cols-1 pb-grid-md-cols-3 pb-gap-6">
        {products.map(product => (
          <div key={product.id} className="pb-card pb-overflow-hidden">
            <div className={`pb-product-card ${getProductClassName(product.title)}`}></div>
            <div className="pb-product-info">
              <h3 className="pb-font-medium pb-mb-1">{product.title}</h3>
              <div className="pb-text-sm pb-mb-2" style={{ color: '#6b7280' }}>
                SKU: {product.variants?.[0]?.sku || 'N/A'}
              </div>
              <div className="pb-text-sm pb-mb-2" style={{ color: '#6b7280' }}>
                Vendor: {product.vendor || 'N/A'}
              </div>
              <div className="pb-text-sm pb-mb-2" style={{ color: '#6b7280' }}>
                Sales Velocity: {product.salesVelocityFloat?.toFixed(1) || '0.0'} units/day
              </div>
              {product.trending && (
                <span className="pb-trending-tag">Trending</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
