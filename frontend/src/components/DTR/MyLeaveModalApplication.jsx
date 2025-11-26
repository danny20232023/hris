import React, { useState, useEffect, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';
import { getPhotoUrl } from '../../utils/urls';

const MyLeaveModalApplication = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeData, setEmployeeData] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveCredits, setLeaveCredits] = useState({ vl: 0, sl: 0 });
  const [hasPDS, setHasPDS] = useState(false);
  const [hasLeaveRecord, setHasLeaveRecord] = useState(false);
  const [selectedLeaveTypeQuestions, setSelectedLeaveTypeQuestions] = useState([]);
  const [questionAnswers, setQuestionAnswers] = useState({ selectedQuestionId: null, answer: '' });
  const [selectedCalDates, setSelectedCalDates] = useState([]);
  const [calendarYmd, setCalendarYmd] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [validationError, setValidationError] = useState(null);
  const [validating, setValidating] = useState(false);
  
  const [formData, setFormData] = useState({
    leavetypeid: '',
    deductmode: 'Leave', // Always "Leave" for portal submissions
    leavepurpose: '',
    selectedDates: [],
    leavestatus: 'For Approval',
    deductedcredit: 0,
    inclusivedates: 0
  });

  const displayMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // Enhanced Dropdown Component
  const EnhancedDropdown = ({ 
    label, 
    value, 
    options = [], 
    onSelect, 
    placeholder = "Select an option",
    required = false,
    className = ""
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOption, setSelectedOption] = useState(null);

    const validOptions = Array.isArray(options) ? options.filter(option => 
      option && typeof option === 'object' && option.value && option.label
    ) : [];

    useEffect(() => {
      if (value && validOptions.length > 0) {
        const option = validOptions.find(opt => opt.value === value);
        setSelectedOption(option || null);
      } else {
        setSelectedOption(null);
      }
    }, [value, validOptions]);

    const filteredOptions = validOptions.filter(option => {
      try {
        if (!option || !option.label || typeof option.label !== 'string') return false;
        return option.label.toLowerCase().includes(searchTerm.toLowerCase());
      } catch (error) {
        return false;
      }
    });

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (isOpen && !event.target.closest('.enhanced-dropdown')) {
          setIsOpen(false);
          setSearchTerm('');
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

    const handleSelect = (option) => {
      try {
        if (!option || typeof onSelect !== 'function') return;
        setSelectedOption(option);
        onSelect(option.value);
        setIsOpen(false);
        setSearchTerm('');
      } catch (error) {
        console.error('Error selecting option:', error);
      }
    };

    return (
      <div className={`enhanced-dropdown ${className}`}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <div
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md cursor-pointer bg-white flex items-center justify-between ${
              isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'
            } transition-colors duration-200`}
          >
            <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <svg 
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          
          {isOpen && (
            <div className="absolute z-[70] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
              <div className="p-2 border-b border-gray-200">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  autoFocus
                />
              </div>
              
              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => {
                    if (!option || !option.value || !option.label) return null;
                    return (
                      <div
                        key={option.value}
                        className={`px-3 py-2 text-sm cursor-pointer transition-colors duration-150 ${
                          selectedOption?.value === option.value 
                            ? 'bg-blue-50 text-blue-900 font-medium' 
                            : 'text-gray-900 hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelect(option)}
                      >
                        {option.label}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">No options found</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Fetch employee data, PDS, leave credits, and leave types on mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const userId = user?.USERID || user?.userid;
      if (!userId) {
        displayMessage('User ID not found', 'error');
        return;
      }

      // Check PDS
      try {
        await api.get('/pds-dtrchecker/me');
        setHasPDS(true);
      } catch (err) {
        setHasPDS(false);
      }

      // Get employee data
      const employeeResponse = await api.get('/201-employees');
      const employees = employeeResponse.data.data;
      const currentEmployee = employees.find(emp => emp.dtruserid === userId);
      
      if (!currentEmployee) {
        displayMessage('Employee record not found', 'error');
        return;
      }

      setEmployeeData(currentEmployee);

      // Get leave credits
      try {
        const leaveResponse = await api.get(`/employee-leave-records/${currentEmployee.objid}`);
        // API returns { success: true, leaveRecord: {...} } or 404 if not found
        if (leaveResponse.data && leaveResponse.data.success === true && leaveResponse.data.leaveRecord) {
          const leaveRecord = leaveResponse.data.leaveRecord;
          setLeaveCredits({
            vl: parseFloat(leaveRecord.balance_vl || 0),
            sl: parseFloat(leaveRecord.balance_sl || 0)
          });
          setHasLeaveRecord(true);
        } else {
          setHasLeaveRecord(false);
        }
      } catch (err) {
        // 404 or other error means no leave record found
        setHasLeaveRecord(false);
      }

      // Get leave types
      const leaveTypesResponse = await api.get('/leave-types');
      // API returns { success: true, data: [...] }
      setLeaveTypes(leaveTypesResponse.data?.data || []);

    } catch (error) {
      console.error('Error fetching initial data:', error);
      displayMessage('Error loading data. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaveTypeQuestions = async (leaveTypeId) => {
    try {
      const response = await api.get(`/leave-types/${leaveTypeId}/questions`);
      setSelectedLeaveTypeQuestions(response.data || []);
    } catch (error) {
      console.error('Error fetching leave type questions:', error);
      setSelectedLeaveTypeQuestions([]);
    }
  };

  useEffect(() => {
    const ymd = (selectedCalDates||[]).filter(Boolean).map(d => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}`;
    });
    setFormData(prev => ({ 
      ...prev, 
      selectedDates: Array.from(new Set([...(prev.selectedDates||[]).filter(x=>!calendarYmd.includes(x)), ...ymd])), 
      inclusivedates: ymd.length,
      deductedcredit: ymd.length * 1.000
    }));
    setCalendarYmd(ymd);
  }, [selectedCalDates]);

  // Validation function
  const validateLeaveLimits = useCallback(async (emp_objid, leavetypeid, deductedcredit, selectedDates) => {
    if (!emp_objid || !leavetypeid || !selectedDates || selectedDates.length === 0) {
      setValidationError(null);
      return;
    }

    try {
      setValidating(true);
      const response = await api.post('/employee-leave-transactions/validate', {
        emp_objid,
        leavetypeid,
        deductedcredit,
        selectedDates
      });

      if (response.data && response.data.success !== false) {
        if (response.data.valid) {
          setValidationError(null);
        } else {
          setValidationError({
            valid: false,
            error: response.data.error || 'Validation failed'
          });
        }
      } else {
        setValidationError({
          valid: false,
          error: response.data?.error || 'Validation failed'
        });
      }
    } catch (error) {
      console.error('Error validating leave limits:', error);
      // Don't set error on API failure - let backend validation handle it
      setValidationError(null);
    } finally {
      setValidating(false);
    }
  }, []);

  // Validate when formData changes (leave type or dates)
  useEffect(() => {
    if (employeeData?.objid && formData.leavetypeid && formData.selectedDates?.length > 0) {
      validateLeaveLimits(
        employeeData.objid,
        formData.leavetypeid,
        formData.deductedcredit || formData.inclusivedates || 0,
        formData.selectedDates
      );
    } else if (!formData.leavetypeid || formData.selectedDates?.length === 0) {
      setValidationError(null);
    }
  }, [formData.leavetypeid, formData.selectedDates, formData.deductedcredit, employeeData?.objid, validateLeaveLimits]);

  const removeSelectedDate = (d) => {
    setFormData(prev => {
      const newDates = (prev.selectedDates||[]).filter(x=>x!==d);
      const newInclusivedates = Math.max(0, newDates.length);
      return {
        ...prev,
        selectedDates: newDates,
        inclusivedates: newInclusivedates,
        deductedcredit: newInclusivedates * 1.000
      };
    });
    if (calendarYmd.includes(d)) {
      setSelectedCalDates(prev => prev.filter(dt => {
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const dd = String(dt.getDate()).padStart(2,'0');
        return `${yyyy}-${mm}-${dd}` !== d;
      }));
      setCalendarYmd(prev => prev.filter(x => x !== d));
    }
  };

  const calculateRequiredCredits = () => {
    const daysSelected = formData.selectedDates.length;
    
    // Safety check: ensure leaveTypes is an array
    if (!Array.isArray(leaveTypes) || leaveTypes.length === 0 || !formData.leavetypeid) {
      return { required: 0, type: 'Other', available: 0, sufficient: true };
    }
    
    const selectedLeaveType = leaveTypes.find(lt => lt.leaveid === formData.leavetypeid);
    
    if (!selectedLeaveType) return { required: 0, type: 'Other', available: 0, sufficient: true };
    
    const isVL = selectedLeaveType.leavecode?.includes('VL') || selectedLeaveType.leavetype?.includes('Vacation');
    const isSL = selectedLeaveType.leavecode?.includes('SL') || selectedLeaveType.leavetype?.includes('Sick');
    
    return {
      required: daysSelected * 1.000,
      type: isVL ? 'VL' : isSL ? 'SL' : 'Other',
      available: isVL ? leaveCredits.vl : isSL ? leaveCredits.sl : 0,
      sufficient: isVL ? leaveCredits.vl >= daysSelected : isSL ? leaveCredits.sl >= daysSelected : true
    };
  };

  const creditInfo = calculateRequiredCredits();
  const canSubmit = hasPDS && hasLeaveRecord && creditInfo.sufficient && 
                   formData.leavetypeid && formData.selectedDates.length > 0 &&
                   (!validationError || validationError.valid);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // getPhotoUrl is now imported from '../../utils/urls'

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const payload = {
        emp_objid: employeeData.objid,
        leavetypeid: formData.leavetypeid,
        deductmode: 'Leave', // Always "Leave" for portal submissions
        leavepurpose: formData.leavepurpose,
        selectedDates: formData.selectedDates,
        deductedcredit: formData.deductedcredit,
        inclusivedates: formData.inclusivedates,
        status: 'For Approval', // Backend maps this to leavestatus column
        isportal: 1, // Indicates submission from employee portal
        createdby: user.USERID,
        questionAnswers: questionAnswers.selectedQuestionId && questionAnswers.answer ? questionAnswers : null
      };
      
      await api.post('/employee-leave-transactions', payload);
      displayMessage('Leave application submitted successfully', 'success');
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (error) {
      console.error('Error submitting leave application:', error);
      displayMessage(
        error.response?.data?.error || 'Failed to submit leave application. Please try again.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl">
        <div className="p-6">
          {/* Modal Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                {employeeData?.photo_path ? (
                  <img 
                    src={getPhotoUrl(employeeData.photo_path)} 
                    alt={employeeData.employee_name || 'Employee'} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-300">
                    <span className="text-gray-600 text-sm font-medium">
                      {(employeeData?.surname?.[0] || '') + (employeeData?.firstname?.[0] || '')}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Apply Leave</h3>
                <div className="text-sm text-gray-600">
                  {employeeData ? formatEmployeeName(employeeData.surname, employeeData.firstname, employeeData.middlename) : ''}
                  {employeeData?.employee_id && ` · ${employeeData.employee_id}`}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Message Display */}
          {message.text && (
            <div className={`mb-4 p-3 rounded-md ${
              message.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* Validation Messages */}
          {!hasPDS && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800">PDS Required</h3>
                  <p className="mt-1 text-sm text-red-700">
                    You must complete your Personal Data Sheet (PDS) before applying for leave. 
                    Please go to the <strong>"My PDS"</strong> tab to fill out your information.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!hasLeaveRecord && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">No Leave Credits Found</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    No leave credits found in the system. Please contact HR to update your leave credit records.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Leave Credit Display */}
          {hasLeaveRecord && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div className="flex-1 text-center">
                  <span className="text-sm font-medium text-blue-900">Vacation Leave (VL)</span>
                  <div className="text-2xl font-bold text-blue-700">{leaveCredits.vl.toFixed(3)}</div>
                </div>
                <div className="flex-1 text-center border-l border-blue-300">
                  <span className="text-sm font-medium text-blue-900">Sick Leave (SL)</span>
                  <div className="text-2xl font-bold text-blue-700">{leaveCredits.sl.toFixed(3)}</div>
                </div>
              </div>
              {formData.selectedDates.length > 0 && formData.leavetypeid && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <div className="text-sm text-blue-800">
                    <strong>Selected:</strong> {formData.selectedDates.length} day(s) · 
                    <strong> Required Credits:</strong> {creditInfo.required.toFixed(3)} {creditInfo.type}
                    {!creditInfo.sufficient && (
                      <span className="ml-2 text-red-600 font-semibold">
                        (Insufficient: {creditInfo.type} balance is {creditInfo.available.toFixed(3)})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-6">
            {/* Leave Type and Questions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <EnhancedDropdown
                  label="Leave Type"
                  value={formData.leavetypeid}
                  options={Array.isArray(leaveTypes) ? leaveTypes.map(lt => ({
                    value: lt.leaveid,
                    label: `${lt.leavetype || 'Unknown Leave Type'} (${lt.leavecode || 'N/A'})`,
                    hasQuestions: lt.hasquestion === 1 || lt.hasquestion === true
                  })) : []}
                  onSelect={(value) => {
                    setFormData(prev => ({ ...prev, leavetypeid: value }));
                    if (Array.isArray(leaveTypes)) {
                      const selectedLeaveType = leaveTypes.find(lt => lt.leaveid === value);
                      if (selectedLeaveType && (selectedLeaveType.hasquestion === 1 || selectedLeaveType.hasquestion === true)) {
                        fetchLeaveTypeQuestions(value);
                      } else {
                        setSelectedLeaveTypeQuestions([]);
                        setQuestionAnswers({ selectedQuestionId: null, answer: '' });
                      }
                    }
                  }}
                  placeholder="Select Leave Type"
                  required={true}
                />
                {/* Validation Error Display */}
                {validationError && !validationError.valid && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-red-800">{validationError.error}</p>
                    </div>
                  </div>
                )}
                {validating && (
                  <div className="mt-2 text-sm text-gray-500">
                    Validating leave limits...
                  </div>
                )}
              </div>

              {/* Leave Type Questions */}
              <div>
                {selectedLeaveTypeQuestions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Questions</label>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {selectedLeaveTypeQuestions.map((question, index) => (
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
                                  rows={2}
                                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
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

            {/* Leave Purpose */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Leave Purpose</label>
              <textarea
                name="leavepurpose"
                value={formData.leavepurpose}
                onChange={handleInputChange}
                rows={3}
                maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                placeholder="Enter leave purpose..."
              />
              <p className="text-xs text-gray-500 mt-1">{formData.leavepurpose.length}/100 characters</p>
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Dates</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <DayPicker
                    mode="multiple"
                    selected={selectedCalDates}
                    onSelect={setSelectedCalDates}
                    weekStartsOn={1}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 1}
                    toYear={new Date().getFullYear() + 1}
                  />
                </div>
                <div className="border rounded p-3 bg-gray-50 max-h-64 overflow-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Selected Dates</span>
                    <span className="text-xs text-gray-600">Total: {formData.selectedDates.length}</span>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {formData.selectedDates.sort().map(d => {
                      const mm = d.slice(5,7); const dd = d.slice(8,10); const yy = d.slice(0,4);
                      const label = `${mm}/${dd}/${yy}`;
                      return (
                        <li key={d} className="flex items-center justify-between bg-white rounded border px-2 py-1">
                          <span>{label}</span>
                          <button 
                            type="button" 
                            onClick={() => removeSelectedDate(d)} 
                            className="text-red-600 text-xs hover:text-red-800"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                    {formData.selectedDates.length === 0 && (
                      <li className="text-xs text-gray-500">No dates selected</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !canSubmit || (validationError && !validationError.valid)}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Submitting...' : 'Submit Leave Application'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MyLeaveModalApplication;

