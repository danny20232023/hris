import { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import DTREmployeeOT from './DTREmployeeOT';
import DtrOTTransactions from './DtrOTTransactions';
import DTRComputeOT from './DTRComputeOT';

const TAB_CONFIG = [
  { id: 'employee', label: 'Employee Overtimes', component: DTREmployeeOT, permissionId: 'dtr-employee-ot' },
  { id: 'transactions', label: 'Transactions', component: DtrOTTransactions, permissionId: 'dtr-ot-transactions' },
  { id: 'compute', label: 'Compute Overtime', component: DTRComputeOT, permissionId: 'dtr-compute-ot' },
];

function DTROTtab() {
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
        <h1 className="text-2xl font-semibold text-gray-800">Overtime Transactions</h1>
        <p className="text-sm text-gray-500">Manage all overtime transactions and their dates</p>
      </div>

      {/* Tab Control Navigation */}
      <div className="bg-white border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 px-6" aria-label="Overtime tabs">
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

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {permissionsLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading permissions...</div>
        ) : accessibleTabs.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">You do not have permission to view any OT tabs.</div>
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

export default DTROTtab;

