import { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import Plantilla201 from './201Plantilla';
import PlantillaTranches from './201PlantillaTranches';
import PlantillaRates from './201PlantillaRates';

const TAB_CONFIG = [
  { id: 'plantillas', label: 'Plantillas', component: Plantilla201, permissionId: '201-plantilla' },
  { id: 'tranches', label: 'Tranches', component: PlantillaTranches, permissionId: '201-plantilla-tranches' },
  { id: 'rates', label: 'Rates', component: PlantillaRates, permissionId: '201-plantilla-rates' },
];

function PlantillaTabs() {
  const { can, canAccessPage, loading: permissionsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState('');

  const accessibleTabs = useMemo(
    () => TAB_CONFIG.filter((tab) => {
      // Check both canaccesspage and canread permissions
      const hasPageAccess = canAccessPage(tab.permissionId);
      const hasReadPermission = can(tab.permissionId, 'read');
      return hasPageAccess && hasReadPermission;
    }),
    [can, canAccessPage]
  );

  useEffect(() => {
    if (permissionsLoading) return;
    if (accessibleTabs.length === 0) {
      setActiveTab('');
      return;
    }
    if (!activeTab || !accessibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(accessibleTabs[0].id);
    }
  }, [permissionsLoading, accessibleTabs, activeTab]);

  const tabButtons = useMemo(
    () =>
      accessibleTabs.map((tab) => ({
        ...tab,
        isActive: tab.id === activeTab,
      })),
    [accessibleTabs, activeTab]
  );

  const activeTabConfig = accessibleTabs.find((tab) => tab.id === activeTab);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header Section - Above Tab Control */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-800">Plantilla Management</h1>
        <p className="text-sm text-gray-500">Manage plantilla records, salary tranches, and rates</p>
      </div>

      {/* Tab Control Navigation */}
      <div className="bg-white border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 px-6" aria-label="Plantilla tabs">
          {tabButtons.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                tab.isActive
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {permissionsLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading permissions...</div>
        ) : accessibleTabs.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">You do not have permission to view any Plantilla tabs.</div>
        ) : activeTabConfig ? (
          (() => {
            const ActiveComponent = activeTabConfig.component;
            return <ActiveComponent />;
          })()
        ) : (
          <div className="p-6 text-sm text-gray-500">Select a tab to continue.</div>
        )}
      </div>
    </div>
  );
}

export default PlantillaTabs;

