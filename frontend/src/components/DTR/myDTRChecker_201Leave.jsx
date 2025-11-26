import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import LeaveTransactionEditModal from './myDTRChecker_201LeaveModal';
import MyLeaveModalApplication from './MyLeaveModalApplication';
import openLeavePrintWindow from '../201/print_201LeaveApplication';

const MyLeaveTransactions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [hasPDS, setHasPDS] = useState(false);
  const [hasLeaveCredits, setHasLeaveCredits] = useState(false);
  const [canApplyLeave, setCanApplyLeave] = useState(true);
  const [eligibilityReason, setEligibilityReason] = useState('');
  const [validationLoading, setValidationLoading] = useState(true);

  // Fetch leave transactions and check eligibility for logged-in user
  useEffect(() => {
    fetchLeaveTransactions();
    checkEligibility();
  }, [user]);

  const checkEligibility = async () => {
    setValidationLoading(true);
    try {
      const userId = user?.USERID || user?.userid;
      
      // Check PDS
      try {
        await api.get('/pds-dtrchecker/me');
        setHasPDS(true);
      } catch (err) {
        setHasPDS(false);
      }
      
      // Check leave credits
      const employeeResponse = await api.get('/201-employees');
      const employees = employeeResponse.data.data;
      const currentEmployee = employees.find(emp => emp.dtruserid === userId);
      
      if (currentEmployee) {
        setEmployeeProfile(currentEmployee);
        try {
          const leaveResponse = await api.get(`/employee-leave-records/${currentEmployee.objid}`);
          // API returns { success: true, leaveRecord: {...} } or 404 if not found
          setHasLeaveCredits(leaveResponse.data && leaveResponse.data.success === true && leaveResponse.data.leaveRecord);
        } catch (err) {
          // 404 or other error means no leave record found
          setHasLeaveCredits(false);
        }
      }

      // Check leave eligibility (designation, canleave, balances)
      try {
        const eligibilityResponse = await api.get('/employee-leave-records/eligibility/current');
        setCanApplyLeave(eligibilityResponse.data.canApplyLeave || false);
        setEligibilityReason(eligibilityResponse.data.reason || '');
      } catch (err) {
        // On error, default to false (restrict access)
        console.error('Error checking leave eligibility:', err);
        setCanApplyLeave(false);
        setEligibilityReason('Unable to verify leave eligibility. Please contact HR.');
      }
    } catch (err) {
      console.error('Error checking eligibility:', err);
    } finally {
      setValidationLoading(false);
    }
  };

  const fetchLeaveTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = user?.USERID || user?.userid;
      if (!userId) {
        throw new Error('User ID not found');
      }

      // Get employee objid
      const employeeResponse = await api.get('/201-employees');
      const employees = employeeResponse.data.data;
      const currentEmployee = employees.find(emp => emp.dtruserid === userId);
      
      if (!currentEmployee) {
        throw new Error('Employee record not found');
      }

      setEmployeeProfile(currentEmployee);

      // Fetch leave transactions
      const response = await api.get(`/employee-leave-transactions/${currentEmployee.objid}`);
      setTransactions(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setEditingTransaction(null);
  };

  const handleSave = () => {
    // Refresh the transactions list
    fetchLeaveTransactions();
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">My Leave Transactions</h2>
        <button
          onClick={() => setShowApplyModal(true)}
          disabled={!hasPDS || !hasLeaveCredits || !canApplyLeave || validationLoading}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
            !hasPDS || !hasLeaveCredits || !canApplyLeave || validationLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
          title={
            !hasPDS 
              ? 'Please complete your PDS first' 
              : !hasLeaveCredits 
              ? 'No leave credits found. Contact HR.' 
              : !canApplyLeave
              ? eligibilityReason || 'You are not authorized to apply for leave. Contact HR for more information.'
              : 'Apply for leave'
          }
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Apply Leave</span>
        </button>
      </div>

      {/* Alert banner if not eligible */}
      {!validationLoading && (!hasPDS || !hasLeaveCredits || !canApplyLeave) && (
        <div className="mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">Action Required</h3>
              <div className="mt-2 text-sm text-yellow-700">
                {!hasPDS && (
                  <p className="mb-2">
                    You must complete your Personal Data Sheet (PDS) before applying for leave. 
                    Please go to the <strong>"My PDS"</strong> tab to fill out your information.
                  </p>
                )}
                {!hasLeaveCredits && (
                  <p className="mb-2">
                    No leave credits found in the system. Please contact HR to update your leave credit records.
                  </p>
                )}
                {!canApplyLeave && (
                  <p>
                    {eligibilityReason || 'You are not authorized to apply for leave. Please contact HR for more information.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No.</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Dates</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map((transaction, index) => (
              <tr key={transaction.objid}>
                <td className="px-6 py-4 text-sm text-gray-900">{index + 1}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{transaction.leave_type_name}</td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {transaction.leave_dates ? (
                    <div className="flex flex-wrap gap-1">
                      {transaction.leave_dates.split(', ').map((date, idx) => (
                        <span 
                          key={idx}
                          className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                        >
                          {new Date(date).toLocaleDateString()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">No dates</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{transaction.leavepurpose}</td>
                <td className="px-6 py-4">
                  {transaction.isportal === 1 ? (
                    <span className="text-sm text-blue-600 font-medium">Portal</span>
                  ) : transaction.created_by_photo_path ? (
                    <img 
                      src={transaction.created_by_photo_path} 
                      alt="Creator"
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-xs text-gray-600">N/A</span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {(() => {
                    const status = transaction.status || transaction.leavestatus || transaction.LeaveStatus || transaction.LEAVESTATUS || 'Unknown';
                    const normalized = (status || '').toLowerCase();
                    return (
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        normalized === 'approved' ? 'bg-green-100 text-green-800' :
                        normalized === 'for approval' ? 'bg-yellow-100 text-yellow-800' :
                        normalized === 'returned' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {status}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const status = transaction.status || transaction.leavestatus || transaction.LeaveStatus || transaction.LEAVESTATUS;
                      const normalizedStatus = (status || '').toLowerCase();
                      const isForApprovalOrReturned = normalizedStatus === 'for approval' || normalizedStatus === 'returned';
                      const isPortal = Number(transaction.isportal) === 1;
                      const isApprovedOrCancelled = normalizedStatus === 'approved' || normalizedStatus === 'cancelled';
                      const buttons = [];

                      if (isForApprovalOrReturned && isPortal) {
                        buttons.push(
                          <button
                            key="edit"
                            onClick={() => handleEdit(transaction)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        );
                      }

                      if (isApprovedOrCancelled) {
                        buttons.push(
                          <button
                            key="view"
                            onClick={() => {
                              setEditingTransaction(transaction);
                              setShowEditModal(true);
                            }}
                            className="text-gray-600 hover:text-gray-800"
                            title="View"
                          >
                            👁
                          </button>
                        );
                      }

                      return buttons;
                    })()}

                    <button
                      onClick={() => openLeavePrintWindow(transaction, employeeProfile || {
                        employee_name: transaction.employee_name || user?.NAME,
                        emp_objid: transaction.emp_objid,
                        department_name: transaction.department_name || selectedEmployee?.department_name,
                        position_title: transaction.position_title || selectedEmployee?.position_title,
                        salary: transaction.salary || selectedEmployee?.salary
                      })}
                      className="text-green-600 hover:text-green-800 transition-colors"
                      title="Print Leave Application"
                    >
                      🖨️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {transactions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No leave transactions found.</p>
        </div>
      )}

      {/* Edit Modal */}
      <LeaveTransactionEditModal
        isOpen={showEditModal}
        onClose={handleCloseModal}
        transaction={editingTransaction}
        onSave={handleSave}
        readonly={editingTransaction && (editingTransaction.status === 'Approved' || editingTransaction.status === 'Cancelled' || editingTransaction.leavestatus === 'Approved' || editingTransaction.leavestatus === 'Cancelled')}
      />

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <MyLeaveModalApplication
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => {
            setShowApplyModal(false);
            fetchLeaveTransactions();
          }}
        />
      )}
    </div>
  );
};

// Loading component
const LoadingState = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
  </div>
);

// Error component
const ErrorState = ({ message }) => (
  <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
    <p className="font-semibold">Error:</p>
    <p>{message}</p>
  </div>
);

export default MyLeaveTransactions;
