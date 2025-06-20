import React from 'react';

interface Alert {
  alertType: string;
  alertMessage: string;
}

interface SummaryResponseCardProps {
  title: string;
  totalProducts: number;
  lowStockCount: number;
  totalInventoryValue: string;
  alerts: Alert[];
  responseDetails: string;
}

const SummaryResponseCard: React.FC<SummaryResponseCardProps> = ({
  title,
  totalProducts,
  lowStockCount,
  totalInventoryValue,
  alerts,
  responseDetails,
}) => {
  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case 'alert-critical':
        return <i className="fas fa-exclamation-circle mr-2"></i>;
      case 'alert-warning':
        return <i className="fas fa-exclamation-triangle mr-2"></i>;
      case 'alert-high-sales':
        return <i className="fas fa-chart-line mr-2"></i>;
      default:
        return <i className="fas fa-info-circle mr-2"></i>;
    }
  };

  return (
    <div className="response-card p-6 shadow-lg rounded-lg bg-white">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">{title}</h2>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 summary-grid">
        <div className="summary-item metric bg-gray-50 p-4 rounded-lg shadow">
          <span className="metric-label text-gray-600">Total Products</span>
          <span className="summary-value metric-value text-2xl font-bold text-gray-900">{totalProducts}</span>
          <i className="fas fa-boxes text-indigo-500 text-2xl absolute top-4 right-4 opacity-50"></i>
        </div>
        <div className="summary-item metric bg-gray-50 p-4 rounded-lg shadow">
          <span className="metric-label text-gray-600">Low Stock Items</span>
          <span className="summary-value metric-value text-2xl font-bold text-red-600">{lowStockCount}</span>
          <i className="fas fa-battery-quarter text-red-500 text-2xl absolute top-4 right-4 opacity-50"></i>
        </div>
        <div className="summary-item metric bg-gray-50 p-4 rounded-lg shadow">
          <span className="metric-label text-gray-600">Total Inventory Value</span>
          <span className="summary-value metric-value text-2xl font-bold text-green-600">{totalInventoryValue}</span>
          <i className="fas fa-dollar-sign text-green-500 text-2xl absolute top-4 right-4 opacity-50"></i>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mb-4 alerts-section">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            <i className="fas fa-bell mr-2 text-yellow-500"></i>Alerts
          </h3>
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={index} className={`alert flex items-center p-3 rounded-md shadow-sm ${alert.alertType}`}>
                {getAlertIcon(alert.alertType)}
                <span className="text-sm">{alert.alertMessage}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response Details */}
      <div className="mt-4 response-details">
        <p className="text-sm text-gray-600 italic">{responseDetails}</p>
      </div>
    </div>
  );
};

export default SummaryResponseCard;
