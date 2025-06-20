import React from 'react';

interface ProductResponseCardProps {
  productImageUrl: string;
  productName: string;
  price: string;
  inventory: number;
  inventoryStatusClass: string;
  salesVelocity: string;
  stockoutDays: string;
  responseDetails: string;
  shopifyProductUrl: string;
  onRestockAction: () => void;
}

const ProductResponseCard: React.FC<ProductResponseCardProps> = ({
  productImageUrl,
  productName,
  price,
  inventory,
  inventoryStatusClass,
  salesVelocity,
  stockoutDays,
  responseDetails,
  shopifyProductUrl,
  onRestockAction,
}) => {
  return (
    <div className="response-card p-6 shadow-lg rounded-lg bg-white">
      {/* Product Header */}
      <div className="flex items-center mb-4 product-header">
        {productImageUrl ? (
          <img src={productImageUrl} alt={productName} className="product-image w-16 h-16 object-cover rounded-md mr-4" />
        ) : (
          <div className="product-image-fallback w-16 h-16 rounded-md mr-4 bg-gray-100 flex items-center justify-center">
            <i className="fas fa-image text-gray-400 text-3xl"></i> {/* Placeholder icon */}
          </div>
        )}
        <div>
          <h2 className="text-xl font-semibold text-gray-800">{productName}</h2>
          <a href={shopifyProductUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
            View on Shopify <i className="fas fa-external-link-alt ml-1"></i>
          </a>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 metrics-grid">
        <div className="metric p-3 bg-gray-50 rounded-md">
          <span className="metric-label text-gray-600">Price</span>
          <span className="metric-value text-gray-900">{price}</span>
        </div>
        <div className="metric p-3 bg-gray-50 rounded-md">
          <span className="metric-label text-gray-600">Inventory</span>
          <span className={`metric-value font-bold ${inventoryStatusClass}`}>{inventory}</span>
        </div>
        <div className="metric p-3 bg-gray-50 rounded-md">
          <span className="metric-label text-gray-600">Sales Velocity</span>
          <span className="metric-value text-gray-900">{salesVelocity}</span>
        </div>
        <div className="metric p-3 bg-gray-50 rounded-md col-span-2 sm:col-span-1">
          <span className="metric-label text-gray-600">Days Until Stockout</span>
          <span className="metric-value text-gray-900">{stockoutDays}</span>
        </div>
      </div>

      {/* Response Details */}
      <div className="mb-4 response-details">
        <p className="text-sm text-gray-700">{responseDetails}</p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 action-buttons">
        <button
          onClick={onRestockAction}
          className="btn btn-primary py-2 px-4 rounded-md shadow-sm hover:shadow-md"
        >
          <i className="fas fa-box-open mr-2"></i>Restock
        </button>
        {/* Add other actions if needed, e.g., a secondary button for "Details" or "Dismiss" */}
      </div>
    </div>
  );
};

export default ProductResponseCard;
