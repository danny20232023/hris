import { useState, useMemo } from 'react';
import DTRPortalUsers from './DTRPortalUsers';
import DTRPortalEmployeeUsers from './DTRPortalEmployeeUsers';

const TAB_CONFIG = [
  { id: 'biometric', label: 'Biometric Users' },
  { id: 'employee', label: 'Employee Portal Users' }
];

function DTRPortalUsersTabs() {
  const [activeTab, setActiveTab] = useState('biometric');

  const tabButtons = useMemo(
    () =>
      TAB_CONFIG.map((tab) => ({
        ...tab,
        isActive: tab.id === activeTab
      })),
    [activeTab]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4" aria-label="Portal users tabs">
          {tabButtons.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                tab.isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'biometric' ? (
          <DTRPortalUsers />
        ) : (
          <DTRPortalEmployeeUsers />
        )}
      </div>
    </div>
  );
}

export default DTRPortalUsersTabs;

