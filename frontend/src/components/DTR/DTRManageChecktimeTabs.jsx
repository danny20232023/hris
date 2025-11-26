import React, { useState, useEffect } from 'react';
import TimeLogsManagement from './TimeLogsManagement';
import DTRFixChecktime from './DTRFixChecktime';
import ComputeAttendance from './ComputeAttendance';
import { usePermissions } from '../../hooks/usePermissions';

const DTRManageChecktimeTabs = () => {
  const { canAccessPage, loading: permissionsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState('manage-logs');
  const canAccessFixLogs = !permissionsLoading && canAccessPage('dtr-fix-checktimes');
  const canAccessComputeTab = !permissionsLoading && (canAccessPage('compute-attendance') || canAccessPage('recomputed-dtr'));

  // If user doesn't have access to fix logs and is on that tab, switch to manage-logs
  useEffect(() => {
    if (!permissionsLoading) {
      if (!canAccessFixLogs && activeTab === 'fix-logs') {
        setActiveTab('manage-logs');
      } else if (!canAccessComputeTab && activeTab === 'compute-attendance') {
        setActiveTab('manage-logs');
      }
    }
  }, [permissionsLoading, canAccessFixLogs, canAccessComputeTab, activeTab]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="border-b border-gray-200">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('manage-logs')}
              className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
                activeTab === 'manage-logs'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Manage Logs
            </button>
            {canAccessFixLogs && (
              <button
                onClick={() => setActiveTab('fix-logs')}
                className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
                  activeTab === 'fix-logs'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                Fix Logs
              </button>
            )}
            {(permissionsLoading || canAccessComputeTab) && (
              <button
                onClick={() => setActiveTab('compute-attendance')}
                className={`px-6 py-3 text-sm font-semibold transition-all duration-200 border-b-2 ${
                  activeTab === 'compute-attendance'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                Compute Attendance
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        {activeTab === 'manage-logs' && <TimeLogsManagement />}
        {activeTab === 'fix-logs' && canAccessFixLogs && <DTRFixChecktime />}
        {activeTab === 'compute-attendance' && canAccessComputeTab && <ComputeAttendance />}
      </div>
    </div>
  );
};

export default DTRManageChecktimeTabs;

