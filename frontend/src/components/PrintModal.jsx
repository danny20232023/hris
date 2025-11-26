import React from 'react';

function PrintModal({ isOpen, onClose, onConfirm, title = 'DTR Logs' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Print Confirmation</h2>
          <p className="text-gray-600 mb-6">
            Are you sure you want to print the {title}?
          </p>
          
          <div className="flex space-x-3 justify-center">
            <button 
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Print
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrintModal;