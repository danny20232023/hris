import React, { useState, useEffect } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';

const MyLeaveRecords = () => {
  const { user } = useAuth();
  
  console.log('🔍 [MyLeaveRecords] Component is rendering!');
  
  const [leaveRecord, setLeaveRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch leave record for logged-in user
  const fetchMyLeaveRecord = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 [MyLeaveRecords] Starting fetch for user:', user);
      
      // Get employee objid from user context
      const userId = user?.USERID || user?.userid;
      if (!userId) {
        throw new Error('User ID not found');
      }

      console.log('🔍 [MyLeaveRecords] User ID:', userId);

      // First, get the employee objid from the employees table
      console.log('🔍 [MyLeaveRecords] Fetching employees...');
      const employeeResponse = await api.get(`/201-employees`);
      console.log('🔍 [MyLeaveRecords] Employee response:', employeeResponse.data);
      
      if (!employeeResponse.data.success) {
        throw new Error('Failed to fetch employee data');
      }

      const employees = employeeResponse.data.data;
      console.log('🔍 [MyLeaveRecords] All employees:', employees);
      
      const currentEmployee = employees.find(emp => emp.dtruserid === userId);
      console.log('🔍 [MyLeaveRecords] Current employee:', currentEmployee);
      
      if (!currentEmployee) {
        throw new Error('Employee record not found');
      }

      // Now fetch leave record using the employee objid
      const employeeObjId = String(currentEmployee.objid || '').trim();
      console.log('🔍 [MyLeaveRecords] Fetching leave record for objid:', employeeObjId);
      
      if (!employeeObjId) {
        throw new Error('Employee objid is missing or invalid');
      }
      
      // Ensure objid doesn't contain any special characters that might break the URL
      const cleanObjId = employeeObjId.split(':')[0]; // Remove any trailing colon and number if present
      console.log('🔍 [MyLeaveRecords] Clean objid:', cleanObjId);
      
      const leaveResponse = await api.get(`/employee-leave-records/${encodeURIComponent(cleanObjId)}`);
      console.log('🔍 [MyLeaveRecords] Leave response:', leaveResponse.data);
      
      if (leaveResponse.data.success) {
        setLeaveRecord(leaveResponse.data.leaveRecord);
        console.log('✅ [MyLeaveRecords] Leave record loaded successfully');
      } else {
        // No leave record exists yet
        console.log('ℹ️ [MyLeaveRecords] No leave record found, setting to null');
        setLeaveRecord(null);
      }
    } catch (err) {
      // Handle 404 gracefully - employee might not have a leave record yet
      if (err?.response?.status === 404) {
        console.log('ℹ️ [MyLeaveRecords] Leave record not found (404), this is normal if employee has no record yet');
        setLeaveRecord(null);
        setError(null); // Don't show error for 404
      } else {
        console.error('❌ [MyLeaveRecords] Error fetching leave record:', err);
        setError(err.response?.data?.message || err.message || 'Failed to fetch leave record');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMyLeaveRecord();
    }
  }, [user]);


  // Format number to 3 decimal places
  const formatNumber = (value) => {
    return value ? parseFloat(value).toFixed(3) : '0.000';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        <span className="ml-3 text-gray-600">Loading leave records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <button 
              onClick={fetchMyLeaveRecord}
              className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header removed per request */}

      {/* Leave Records Display */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {leaveRecord ? (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Leave Credits</h3>
            
            {/* Total Earned Credits */}
            <div className="bg-blue-50 p-4 rounded-lg mb-4">
              <h4 className="font-medium text-blue-900 mb-3">Total Earned Credits</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded border">
                  <p className="text-sm text-gray-600 mb-1">Earned VL</p>
                  <p className="text-xl font-bold text-blue-600">{formatNumber(leaveRecord.total_earned_vl)}</p>
                </div>
                <div className="p-3 bg-white rounded border">
                  <p className="text-sm text-gray-600 mb-1">Earned SL</p>
                  <p className="text-xl font-bold text-blue-600">{formatNumber(leaveRecord.total_earned_sl)}</p>
                </div>
              </div>
            </div>

            {/* Leave Balances */}
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-medium text-green-900 mb-3">Leave Balances</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded border">
                  <p className="text-sm text-gray-600 mb-1">VL Balance</p>
                  <p className="text-xl font-bold text-green-600">{formatNumber(leaveRecord.balance_vl)}</p>
                </div>
                <div className="p-3 bg-white rounded border">
                  <p className="text-sm text-gray-600 mb-1">SL Balance</p>
                  <p className="text-xl font-bold text-green-600">{formatNumber(leaveRecord.balance_sl)}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-500">
              Last updated: {leaveRecord.updated_at ? new Date(leaveRecord.updated_at).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="text-gray-500 mb-4">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Not available</h3>
            <p className="text-gray-500 mb-4">Leave record is not available. Please contact HR to set up your leave records.</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default MyLeaveRecords;