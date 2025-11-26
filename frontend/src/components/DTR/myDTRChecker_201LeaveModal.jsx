import React, { useState, useEffect } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';

const LeaveTransactionEditModal = ({ 
  isOpen, 
  onClose, 
  transaction, 
  onSave,
  readonly = false
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    leavetypeid: '',
    deductmode: 'Leave',
    leavepurpose: '',
    selectedDates: [],
    deductedcredit: 0,
    inclusivedates: 0
  });
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedLeaveTypeQuestions, setSelectedLeaveTypeQuestions] = useState([]);
  const [questionAnswers, setQuestionAnswers] = useState({ 
    selectedQuestionId: null, 
    answer: '' 
  });
  const [currentEmployee, setCurrentEmployee] = useState(null);

  // Load form data when transaction changes
  useEffect(() => {
    if (transaction && isOpen) {
      setFormData({
        leavetypeid: transaction.leavetypeid || '',
        deductmode: transaction.deductmode || 'Leave',
        leavepurpose: transaction.leavepurpose || '',
        selectedDates: transaction.details ? transaction.details.map(d => d.deducteddate) : [],
        deductedcredit: transaction.deductedcredit || 0,
        inclusivedates: transaction.inclusivedates || 0
      });

      // Set question answers if available
      if (transaction.questionAnswer) {
        setQuestionAnswers({
          selectedQuestionId: transaction.questionAnswer.questionId,
          answer: transaction.questionAnswer.answer
        });
      }
    }
  }, [transaction, isOpen]);

  // Fetch leave types and employee data on component mount
  useEffect(() => {
    if (isOpen) {
      fetchLeaveTypes();
      fetchCurrentEmployee();
    }
  }, [isOpen]);

  // Fetch questions when leave type changes
  useEffect(() => {
    if (formData.leavetypeid) {
      fetchLeaveTypeQuestions(formData.leavetypeid);
    }
  }, [formData.leavetypeid]);

  const fetchCurrentEmployee = async () => {
    try {
      const userId = user?.USERID || user?.userid;
      if (!userId) return;

      // Fetch employee with leave balances
      const employeeResponse = await api.get('/201-employees');
      const employees = employeeResponse.data.data;
      const employee = employees.find(emp => emp.dtruserid === userId);
      
      if (employee) {
        // Fetch leave record to get current balances
        try {
          const leaveRecordResponse = await api.get(`/employee-leave-records/${employee.objid}`);
          const leaveRecord = leaveRecordResponse.data.leaveRecord || leaveRecordResponse.data.data || leaveRecordResponse.data;
          
          setCurrentEmployee({
            ...employee,
            vl_balance: leaveRecord.balance_vl || leaveRecord.VL || 0,
            sl_balance: leaveRecord.balance_sl || leaveRecord.SL || 0
          });
        } catch (leaveErr) {
          // If leave record not found, set balances to 0
          console.warn('Leave record not found, setting balances to 0:', leaveErr);
          setCurrentEmployee({
            ...employee,
            vl_balance: 0,
            sl_balance: 0
          });
        }
      }
    } catch (err) {
      console.error('Error fetching employee data:', err);
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/leave-types');
      console.log('Leave types response:', response.data);
      
      // Handle different response structures
      let leaveTypesData = [];
      if (Array.isArray(response.data)) {
        leaveTypesData = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        leaveTypesData = response.data.data;
      } else if (response.data && response.data.success && Array.isArray(response.data.data)) {
        leaveTypesData = response.data.data;
      }
      
      setLeaveTypes(leaveTypesData);
    } catch (err) {
      console.error('Error fetching leave types:', err);
      setError('Failed to fetch leave types');
      setLeaveTypes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaveTypeQuestions = async (leaveTypeId) => {
    try {
      const response = await api.get(`/leave-types/${leaveTypeId}/questions`);
      setSelectedLeaveTypeQuestions(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching leave type questions:', err);
      setSelectedLeaveTypeQuestions([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleDateSelection = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    setFormData(prev => ({
      ...prev,
      selectedDates: prev.selectedDates.includes(dateStr)
        ? prev.selectedDates.filter(d => d !== dateStr)
        : [...prev.selectedDates, dateStr].sort(),
      inclusivedates: prev.selectedDates.includes(dateStr) 
        ? prev.selectedDates.length - 1 
        : prev.selectedDates.length + 1,
      deductedcredit: prev.selectedDates.includes(dateStr) 
        ? prev.selectedDates.length - 1 
        : prev.selectedDates.length + 1
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleQuestionAnswerChange = (questionId, answer) => {
    setQuestionAnswers({
      selectedQuestionId: questionId,
      answer: answer
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (readonly) {
      return; // Prevent submission in readonly mode
    }
    
    if (!formData.leavetypeid || formData.selectedDates.length === 0) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Check if current status is "Returned" to resubmit
      const currentStatus = transaction?.status || transaction?.leavestatus || transaction?.LeaveStatus || transaction?.LEAVESTATUS || '';
      const isReturned = currentStatus === 'Returned' || currentStatus === 'returned';

      const payload = {
        leavetypeid: formData.leavetypeid,
        deductmode: formData.deductmode,
        leavepurpose: formData.leavepurpose,
        selectedDates: formData.selectedDates,
        deductedcredit: formData.selectedDates.length,
        inclusivedates: formData.selectedDates.length,
        questionAnswers: questionAnswers.selectedQuestionId && questionAnswers.answer ? questionAnswers : null
      };

      // If resubmitting a Returned leave, update status to For Approval
      if (isReturned) {
        payload.status = 'For Approval';
      }

      await api.put(`/employee-leave-transactions/${transaction.objid}`, payload);
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update leave transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({
      leavetypeid: '',
      deductmode: 'Leave',
      leavepurpose: '',
      selectedDates: [],
      deductedcredit: 0,
      inclusivedates: 0
    });
    setQuestionAnswers({ selectedQuestionId: null, answer: '' });
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl">
        <div className="p-6">
          {/* Modal Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900">
              {readonly ? 'View Leave Transaction' : 'Edit Leave Transaction'}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Employee Info */}
          {currentEmployee && (
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <div className="flex items-center space-x-4">
                {currentEmployee.photo_path ? (
                  <img
                    src={currentEmployee.photo_path}
                    alt={currentEmployee.employee_name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-gray-600 text-lg font-medium">
                      {currentEmployee.employee_name?.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </span>
                  </div>
                )}
                <div>
                  <h4 className="text-lg font-medium text-gray-900">{currentEmployee.employee_name}</h4>
                  <p className="text-gray-600">{currentEmployee.employee_id}</p>
                  <p className="text-sm text-gray-500">
                    VL: {currentEmployee.vl_balance || 0} | SL: {currentEmployee.sl_balance || 0}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Edit Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Leave Type and Questions - Two Column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Leave Type *</label>
                <select
                  name="leavetypeid"
                  value={formData.leavetypeid}
                  onChange={handleInputChange}
                  disabled={readonly}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 ${readonly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                  required
                >
                  <option value="">Select Leave Type</option>
                  {Array.isArray(leaveTypes) && leaveTypes.length > 0 ? (
                    leaveTypes.map(type => (
                      <option key={type.leaveid} value={type.leaveid}>
                        {type.leavetype} ({type.leavecode || 'N/A'})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>Loading leave types...</option>
                  )}
                </select>
              </div>

              {/* Leave Type Questions */}
              <div>
                {selectedLeaveTypeQuestions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">📋 Questions</label>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {Array.isArray(selectedLeaveTypeQuestions) && selectedLeaveTypeQuestions.map((question, index) => (
                        <div key={question.objid} className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <div className="flex-shrink-0 mt-1">
                              <input
                                type="radio"
                                id={`question-${question.objid}`}
                                name="leave-question"
                                checked={questionAnswers.selectedQuestionId === question.objid}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setQuestionAnswers({
                                      selectedQuestionId: question.objid,
                                      answer: ''
                                    });
                                  }
                                }}
                                disabled={readonly}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <label 
                                htmlFor={`question-${question.objid}`}
                                className="block text-xs font-medium text-gray-700 mb-1 cursor-pointer"
                              >
                                {index + 1}. {question.question}
                              </label>
                              {questionAnswers.selectedQuestionId === question.objid && (
                                <textarea
                                  value={questionAnswers.answer}
                                  onChange={(e) => {
                                    setQuestionAnswers(prev => ({
                                      ...prev,
                                      answer: e.target.value
                                    }));
                                  }}
                                  disabled={readonly}
                                  rows={2}
                                  className={`w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 resize-none ${readonly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                                  placeholder="Answer..."
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Deduct Mode and Leave Purpose - Two Column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deduct Mode</label>
                <select
                  name="deductmode"
                  value={formData.deductmode}
                  onChange={handleInputChange}
                  disabled={readonly}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 ${readonly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                >
                  <option value="Leave">Leave</option>
                  <option value="Absent">Absent</option>
                  <option value="Lates">Lates</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Leave Purpose</label>
                <textarea
                  name="leavepurpose"
                  value={formData.leavepurpose}
                  onChange={handleInputChange}
                  disabled={readonly}
                  rows={3}
                  maxLength={100}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 resize-none ${readonly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
                  placeholder="Enter leave purpose..."
                />
                <p className="text-xs text-gray-500 mt-1">{formData.leavepurpose.length}/100 characters</p>
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Dates *</label>
              <input
                type="date"
                onChange={(e) => handleDateSelection(new Date(e.target.value))}
                disabled={readonly}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 ${readonly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''}`}
              />
              {formData.selectedDates.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-gray-600 mb-2">Selected Dates:</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.selectedDates.map(date => (
                      <span
                        key={date}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
                      >
                        {formatDate(date)}
                        {!readonly && (
                          <button
                            type="button"
                            onClick={() => handleDateSelection(new Date(date))}
                            className="ml-2 text-blue-600 hover:text-blue-800 transition-colors duration-200"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Read-only Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Inclusive Dates</label>
                <input
                  type="text"
                  value={formData.inclusivedates}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deducted Credit</label>
                <input
                  type="text"
                  value={formData.deductedcredit}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Leave Remarks - Display for Returned, Approved, and Cancelled statuses */}
            {(() => {
              const status = transaction?.status || transaction?.leavestatus || transaction?.LeaveStatus || transaction?.LEAVESTATUS || '';
              const isStatusWithRemarks = status === 'Returned' || status === 'Approved' || status === 'Cancelled' || 
                                         status === 'returned' || status === 'approved' || status === 'cancelled';
              const leaveremarks = transaction?.leaveremarks || transaction?.LEAVEREMARKS || '';
              
              if (isStatusWithRemarks) {
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {status === 'Returned' || status === 'returned' ? 'Return Reason' : 
                       status === 'Cancelled' || status === 'cancelled' ? 'Cancellation Reason' : 
                       'Remarks'}
                    </label>
                    <textarea
                      value={leaveremarks || 'No remarks'}
                      readOnly
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed resize-none"
                    />
                  </div>
                );
              }
              return null;
            })()}


             {/* Modal Actions */}
             <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
               <button
                 type="button"
                 onClick={handleClose}
                 className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200"
               >
                 {readonly ? 'Close' : 'Cancel'}
               </button>
               {!readonly && (() => {
                 const currentStatus = transaction?.status || transaction?.leavestatus || transaction?.LeaveStatus || transaction?.LEAVESTATUS || '';
                 const isReturned = currentStatus === 'Returned' || currentStatus === 'returned';
                 const buttonText = isReturned ? 'Resubmit Application' : 'Update Transaction';
                 
                 return (
                   <button
                     type="submit"
                     disabled={saving || !formData.leavetypeid || formData.selectedDates.length === 0}
                     className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                   >
                     {saving ? 'Saving...' : buttonText}
                   </button>
                 );
               })()}
             </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LeaveTransactionEditModal;
