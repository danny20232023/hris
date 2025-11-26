import React, { useState, useEffect, useMemo } from 'react';
import EmployeeLeaveTransactions from './201EmployeeLeaveTransactions';
import EmployeeLeaveRecords from './201EmployeeLeaveRecords';
import EmployeeLeaveTypes from './201EmployeeLeaveTypes';
import { usePermissions } from '../../hooks/usePermissions';

const EmployeeLeaves = () => {
  const [activeTab, setActiveTab] = useState('transactions');
  const { can, canAccessPage, loading: permissionsLoading } = usePermissions();

  // Load saved tab from localStorage
  useEffect(() => {
    const savedTab = localStorage.getItem('201-leaves-active-tab');
    if (savedTab && ['transactions', 'credits', 'types'].includes(savedTab)) {
      setActiveTab(savedTab);
    }
  }, []);

  const tabConfigs = useMemo(() => ([
    {
      key: 'transactions',
      label: 'Leave Transactions',
      componentId: '201-leave-transactions',
      fallbackComponentId: '201-leave',
      component: <EmployeeLeaveTransactions />
    },
    {
      key: 'credits',
      label: 'Leave Credits',
      componentId: '201-leave-credits',
      fallbackComponentId: '201-leave',
      component: <EmployeeLeaveRecords />
    },
    {
      key: 'types',
      label: 'Leave Types',
      componentId: '201-leave-types',
      fallbackComponentId: '201-leave',
      component: <EmployeeLeaveTypes />
    }
  ]), []);

  const hasTabAccess = (tab) => {
    const candidates = [tab.componentId, tab.fallbackComponentId].filter(Boolean);
    return candidates.some((componentName) => {
      if (!componentName) return false;
      return can(componentName, 'read') || canAccessPage(componentName);
    });
  };

  const availableTabs = tabConfigs.filter(hasTabAccess);
  const activeTabConfig = availableTabs.find(tab => tab.key === activeTab);

  const handleTabChange = (tabKey) => {
    if (!availableTabs.some(tab => tab.key === tabKey)) {
      return;
    }
    setActiveTab(tabKey);
    localStorage.setItem('201-leaves-active-tab', tabKey);
  };

  useEffect(() => {
    if (!availableTabs.length) {
      return;
    }
    if (!activeTabConfig) {
      const fallbackTab = availableTabs[0];
      setActiveTab(fallbackTab.key);
      localStorage.setItem('201-leaves-active-tab', fallbackTab.key);
    }
  }, [availableTabs, activeTabConfig, activeTab]);

  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">Loading permissions…</p>
        </div>
      </div>
    );
  }

  if (!availableTabs.length) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">You do not have permission to view any leave tabs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6">
          <div className="flex space-x-8">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTabConfig && (
        <div className="mt-4">
          {activeTabConfig.component}
        </div>
      )}
    </div>
  );
};

export default EmployeeLeaves;

