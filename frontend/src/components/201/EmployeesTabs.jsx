import React, { useEffect, useMemo, useState } from 'react';
import EmployeesWithPDS from './201EmployeesWithPDS';
import Employees201 from './201Employees';
import EmployeeDesignation from './201EmployeeDesignation';

const EmployeesTabs = ({
  initialTab = 'employees',
  canViewEmployees = false,
  canViewPds = false,
  canViewDesignation = false
}) => {
  const tabs = useMemo(
    () => [
      {
        id: 'employees',
        label: 'Employees',
        visible: canViewEmployees,
        render: () => <EmployeesWithPDS />
      },
      {
        id: 'pds',
        label: 'PDS',
        visible: canViewPds,
        render: () => <Employees201 />
      },
      {
        id: 'designation',
        label: 'Designation',
        visible: canViewDesignation,
        render: () => <EmployeeDesignation />
      }
    ],
    [canViewDesignation, canViewEmployees, canViewPds]
  );

  const computeInitialTab = useMemo(() => {
    const availableTabs = tabs.filter((tab) => tab.visible);
    if (availableTabs.length === 0) {
      return null;
    }
    const requested = availableTabs.find((tab) => tab.id === initialTab);
    return (requested || availableTabs[0]).id;
  }, [initialTab, tabs]);

  const [activeTab, setActiveTab] = useState(computeInitialTab);

  useEffect(() => {
    setActiveTab((prev) => (prev === computeInitialTab ? prev : computeInitialTab));
  }, [computeInitialTab]);

  if (!computeInitialTab) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You currently do not have access to any employees, PDS, or designation modules.
        </div>
      </div>
    );
  }

  const tabButtonClass = (tabId) =>
    `px-4 py-2 text-sm font-semibold border-b-2 transition-colors duration-150 ${
      activeTab === tabId
        ? 'border-green-600 text-green-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab && tab.visible);

  return (
    <div className="p-6">
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex flex-wrap gap-4">
          {tabs
            .filter((tab) => tab.visible)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tabButtonClass(tab.id)}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
        </nav>
      </div>

      <div className="mt-4">
        {activeTabConfig ? activeTabConfig.render() : (
          <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
            The selected tab is not available.
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeesTabs;

