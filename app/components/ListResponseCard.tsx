import React from 'react';

interface ProductListItem {
  productImageUrl: string;
  productName: string;
  price: string;
  inventory: number;
  salesVelocity: string;
}

interface ListResponseCardProps {
  title: string;
  products: ProductListItem[];
  responseDetails: string;
}

const ListResponseCard: React.FC<ListResponseCardProps> = ({
  title,
  products,
  responseDetails,
}) => {
  return (
    <div className="response-card p-6 shadow-lg rounded-lg bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        {/* Optional: Add a tag like "Trending" if applicable, referencing .trending-tag */}
        {/* Example: <span className="trending-tag">Trending</span> */}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 products-grid">
        {products.map((product, index) => (
          <div key={index} className="product-card border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center mb-3">
              {product.productImageUrl ? (
                <img src={product.productImageUrl} alt={product.productName} className="product-image w-14 h-14 object-cover rounded-md mr-3" />
              ) : (
                <div className="product-image-fallback w-14 h-14 rounded-md mr-3 bg-gray-100 flex items-center justify-center">
                  <i className="fas fa-image text-gray-400 text-2xl"></i> {/* Placeholder icon */}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-gray-700">{product.productName}</h3>
                {/* Example of a trending tag on an item */}
                {index < 2 && title.toLowerCase().includes("trending") && <span className="trending-tag mt-1 inline-block">Hot <i className="fas fa-fire ml-1"></i></span>}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Price:</span>
                <span className="font-medium text-gray-800">{product.price}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Inventory:</span>
                <span className={`font-medium ${product.inventory < 50 ? 'status-low' : 'status-healthy'}`}>{product.inventory}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Sales Velocity:</span>
                <span className="font-medium text-gray-800">{product.salesVelocity}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Response Details */}
      <div className="mt-4 response-details">
        <p className="text-sm text-gray-700">{responseDetails}</p>
      </div>
    </div>
  );
};

export default ListResponseCard;
