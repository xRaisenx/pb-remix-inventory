// app/components/Metrics.tsx

import React from 'react';

interface MetricsProps {
  totalProducts: number;
  lowStockItemsCount: number;
  totalInventoryUnits: number;
}

export const Metrics: React.FC<MetricsProps> = ({ totalProducts, lowStockItemsCount, totalInventoryUnits }) => {
  return (
    <div className="pb-grid pb-grid-cols-1 pb-grid-md-cols-3 pb-gap-4 pb-mb-6">
      {/* Total Products Metric */}
      <div className="pb-card">
        <div className="pb-flex pb-justify-between pb-items-center">
          <div>
            <div className="pb-text-sm pb-text-light pb-mb-1">Total Products</div>
            <div className="pb-text-2xl pb-font-bold">{totalProducts}</div>
          </div>
          <div className="pb-metric-icon pb-metric-products">
            <i className="fas fa-cube"></i>
          </div>
        </div>
      </div>

      {/* Low Stock Items Metric */}
      <div className="pb-card">
        <div className="pb-flex pb-justify-between pb-items-center">
          <div>
            <div className="pb-text-sm pb-text-light pb-mb-1">Low Stock Items</div>
            <div className="pb-text-2xl pb-font-bold text-red-500">{lowStockItemsCount}</div>
          </div>
          <div className="pb-metric-icon pb-metric-stock">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
        </div>
      </div>

      {/* Total Inventory Units Metric */}
      <div className="pb-card">
        <div className="pb-flex pb-justify-between pb-items-center">
          <div>
            <div className="pb-text-sm pb-text-light pb-mb-1">Total Inventory</div>
            <div className="pb-text-2xl pb-font-bold">{totalInventoryUnits}</div>
          </div>
          <div className="pb-metric-icon pb-metric-inventory">
            <i className="fas fa-chart-line"></i>
          </div>
        </div>
      </div>
    </div>
  );
};