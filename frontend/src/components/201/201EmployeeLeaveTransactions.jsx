import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import openLeavePrintWindow from './print_201LeaveApplication';
import { formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';
import { getPhotoUrl } from '../../utils/urls';

const EmployeeLeaveTransactions = () => {
  const { user } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = '201-leave';
  const canReadLeave = can(COMPONENT_ID, 'read');
  const canCreateLeave = can(COMPONENT_ID, 'create');
  const canUpdateLeave = can(COMPONENT_ID, 'update');
  const canDeleteLeave = can(COMPONENT_ID, 'delete');
  const canApproveLeave = can(COMPONENT_ID, 'approve');
  const canReturnLeave = can(COMPONENT_ID, 'return');
  const canCancelLeave = can(COMPONENT_ID, 'cancel');
  const canPrintLeave = can(COMPONENT_ID, 'print');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add', 'edit', 'view'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [formData, setFormData] = useState({
    leavetypeid: '',
    deductmode: 'Leave',
    leavepurpose: '',
    selectedDates: [],
    status: 'For Approval',
    deductedcredit: 0,
    inclusivedates: 0,
    leavecharging: '',
    leaveremarks: ''
  });
  const [selectedLeaveTypeQuestions, setSelectedLeaveTypeQuestions] = useState([]);
  const [questionAnswers, setQuestionAnswers] = useState({ selectedQuestionId: null, answer: '' });
  const [employeeTransactions, setEmployeeTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('leave-information'); // 'leave-information' or 'leave-transactions'
  const [allTransactions, setAllTransactions] = useState([]);
  const [transactionFilters, setTransactionFilters] = useState({
    dateFrom: '', // Default to first day of current month
    dateTo: '',   // Default to last day of current month
    status: '',    // Empty = All, or 'For Approval', 'Approved', 'Returned', 'Cancelled'
    searchEmployee: '', // Search by employee name
    leavetypeid: ''    // Filter by leave type
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [selectedCalDates, setSelectedCalDates] = useState([]);
  const [calendarYmd, setCalendarYmd] = useState([]);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [leaveCharging, setLeaveCharging] = useState('');
  const [leaveRemarks, setLeaveRemarks] = useState('');
  const [viewAction, setViewAction] = useState(null); // 'approve' | 'return' | null
  const [cancelContext, setCancelContext] = useState({ open: false, transaction: null });
  const [cancelRemarks, setCancelRemarks] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [validating, setValidating] = useState(false);

  const displayMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };
  const [viewFilters, setViewFilters] = useState({
    dateFrom: '',
    dateTo: '',
    status: '',
    leavetypeid: ''
  });

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

    // Validate options array
    const validOptions = Array.isArray(options) ? options.filter(option => 
      option && typeof option === 'object' && option.value && option.label
    ) : [];

    // Find selected option
    useEffect(() => {
      if (value && validOptions.length > 0) {
        const option = validOptions.find(opt => opt.value === value);
        setSelectedOption(option || null);
      } else {
        setSelectedOption(null);
      }
    }, [value, validOptions]);

    // Filter options based on search
    const filteredOptions = validOptions.filter(option => {
      try {
        if (!option || !option.label || typeof option.label !== 'string') return false;
        return option.label.toLowerCase().includes(searchTerm.toLowerCase());
      } catch (error) {
        console.error('Error filtering option:', error, option);
        return false;
      }
    });

    // Close dropdown when clicking outside
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
        if (!option || typeof onSelect !== 'function') {
          console.error('Invalid option or onSelect function:', option, onSelect);
          return;
        }
        setSelectedOption(option);
        onSelect(option.value);
        setIsOpen(false);
        setSearchTerm('');
      } catch (error) {
        console.error('Error selecting option:', error, option);
      }
    };

    const handleInputClick = () => {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setSearchTerm('');
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
          {/* Input Field */}
          <div
            onClick={handleInputClick}
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
          
          {/* Dropdown List */}
          {isOpen && (
            <div className="absolute z-[70] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
              {/* Search Input */}
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
              
              {/* Options List */}
              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => {
                    if (!option || !option.value || !option.label) {
                      console.warn('Invalid option found:', option);
                      return null;
                    }
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
                  <div className="px-3 py-2 text-sm text-gray-500">
                    {validOptions.length === 0 ? 'No options available' : 'No options found'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!canReadLeave) return;
    console.log('🚀 Component mounted, fetching data...');
    fetchEmployees();
    fetchDepartments();
    fetchLeaveTypes();
    
    // Initialize default date range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setTransactionFilters({
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: lastDay.toISOString().split('T')[0],
      status: '',
      searchEmployee: '',
      leavetypeid: ''
    });
  }, [canReadLeave]);

  const fetchAllTransactions = useCallback(async () => {
    if (!canReadLeave) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (transactionFilters.dateFrom) params.append('dateFrom', transactionFilters.dateFrom);
      if (transactionFilters.dateTo) params.append('dateTo', transactionFilters.dateTo);
      if (transactionFilters.status) params.append('status', transactionFilters.status);
      if (transactionFilters.leavetypeid) params.append('leavetypeid', transactionFilters.leavetypeid);
      
      const response = await api.get(`/employee-leave-transactions/all?${params.toString()}`);
      console.log('All transactions response:', response.data);
      setAllTransactions(response.data);
    } catch (error) {
      console.error('Error fetching all transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [canReadLeave, transactionFilters.dateFrom, transactionFilters.dateTo, transactionFilters.status, transactionFilters.leavetypeid]);

  // Auto-fetch transactions when filters change (only for Transactions tab)
  useEffect(() => {
    if (activeTab === 'leave-transactions' && canReadLeave) {
      fetchAllTransactions();
    }
  }, [activeTab, canReadLeave, fetchAllTransactions]);

  // Filtered transactions for client-side employee search (Transactions tab)
  const filteredAllTransactions = useMemo(() => {
    let filtered = Array.isArray(allTransactions) ? [...allTransactions] : [];
    
    // Client-side filter by employee name
    if (transactionFilters.searchEmployee && transactionFilters.searchEmployee.trim()) {
      const searchLower = transactionFilters.searchEmployee.toLowerCase().trim();
      filtered = filtered.filter(transaction => {
        const employeeName = formatEmployeeNameFromObject(transaction).toLowerCase();
        return employeeName.includes(searchLower);
      });
    }
    
    return filtered;
  }, [allTransactions, transactionFilters.searchEmployee]);

  const fetchEmployees = async () => {
    if (!canReadLeave) return;
    try {
      setLoading(true);
      const response = await api.get('/employee-leave-transactions');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      displayMessage('Error fetching employees', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    if (!canReadLeave) return;
    try {
      const response = await api.get('/departments');
      // Backend returns { success: true, data: [...], totalRecords: ... }
      setDepartments(response.data?.data || response.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setDepartments([]);
    }
  };

  const fetchLeaveTypes = async () => {
    if (!canReadLeave) return;
    try {
      console.log('🔍 Fetching leave types...');
      console.log('🔍 API base URL:', api.defaults.baseURL);
      const response = await api.get('/leave-types');
      console.log('✅ Leave types response:', response.data);
      console.log('✅ Response status:', response.status);
      // Fix: Access the nested data structure
      const leaveTypesData = response.data.success ? response.data.data : response.data;
      console.log('✅ Processed leave types:', leaveTypesData);
      console.log('✅ First leave type structure:', leaveTypesData?.[0]);
      console.log('✅ Available fields:', leaveTypesData?.[0] ? Object.keys(leaveTypesData[0]) : 'No data');
      setLeaveTypes(leaveTypesData || []);
    } catch (error) {
      console.error('❌ Error fetching leave types:', error);
      console.error('❌ Error details:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      setLeaveTypes([]);
    }
  };

  const fetchLeaveTypeQuestions = async (leaveTypeId) => {
    try {
      console.log('🔍 Fetching questions for leave type:', leaveTypeId);
      const response = await api.get(`/leave-types/${leaveTypeId}/questions`);
      console.log('✅ Questions response:', response.data);
      
      if (response.data.success) {
        const questions = response.data.data || [];
        setSelectedLeaveTypeQuestions(questions);
        
        // Auto-select if only one question exists
        if (questions.length === 1) {
          setQuestionAnswers({ 
            selectedQuestionId: questions[0].objid, 
            answer: '' 
          });
        } else {
          setQuestionAnswers({ selectedQuestionId: null, answer: '' });
        }
      } else {
        setSelectedLeaveTypeQuestions([]);
        setQuestionAnswers({ selectedQuestionId: null, answer: '' });
      }
    } catch (error) {
      console.error('❌ Error fetching questions:', error);
      setSelectedLeaveTypeQuestions([]);
      setQuestionAnswers({ selectedQuestionId: null, answer: '' });
    }
  };

  const fetchEmployeeTransactions = async (empObjid) => {
    if (!canReadLeave) return;
    try {
      const response = await api.get(`/employee-leave-transactions/${empObjid}`);
      setEmployeeTransactions(response.data);
    } catch (error) {
      console.error('Error fetching employee transactions:', error);
      displayMessage('Error fetching employee transactions', 'error');
    }
  };

  // Get photo URL
  const formatInclusiveDates = (details) => {
    if (!details || details.length === 0) return 'N/A';
    return details
      .map(d => new Date(d.deducteddate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      .join(', ');
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'For Approval': return 'bg-yellow-100 text-yellow-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Returned': return 'bg-blue-100 text-blue-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // getPhotoUrl is now imported from '../../utils/urls'

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleDepartmentFilter = (value) => {
    const deptValue = value || '';
    setSelectedDepartment(deptValue);
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const hasDesignation = !!(emp.designation_objid || emp.current_designation_id);
      const canLeaveValueRaw = emp.appointment_canleave ?? emp.canleave ?? null;
      const canLeaveValue = canLeaveValueRaw === null || canLeaveValueRaw === undefined
        ? null
        : Number(canLeaveValueRaw);
      if (!hasDesignation) {
        return false;
      }
      if (canLeaveValue !== null && canLeaveValue !== 1) {
        return false;
      }
      const employeeName = emp.employee_name || '';
      const employeeId = emp.employee_id || '';
      const matchesSearch = employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           employeeId.toLowerCase().includes(searchTerm.toLowerCase());
      // Use assigned_dept_id from employee_designation.assigneddept (where ispresent=1)
      // This follows: employee_leave_trans.emp_objid = employee_designation.emp_objid 
      // AND employee_designation.ispresent=1 AND employee_designation.assigneddept = department.deptid
      const empDeptId = emp.assigned_dept_id ?? emp.assigneddept ?? null;
      const matchesDepartment = !selectedDepartment || (empDeptId != null && String(empDeptId) === String(selectedDepartment));
      
      return matchesSearch && matchesDepartment;
    });
  }, [employees, selectedDepartment, searchTerm]);

  const handleOpenModal = async (mode, employee, transaction = null) => {
    if (mode === 'add' && !canCreateLeave) {
      alert('You do not have permission to create leave transactions.');
      return;
    }
    if (mode === 'edit' && !canUpdateLeave) {
      alert('You do not have permission to update leave transactions.');
      return;
    }
    if (mode === 'view' && !canReadLeave) {
      alert('You do not have permission to view leave transactions.');
      return;
    }
    setModalMode(mode);
    setSelectedEmployee(employee);
    setSelectedTransaction(transaction);
    
    if (mode === 'add') {
      setIsEditMode(false);
      setFormData({
        leavetypeid: '',
        deductmode: 'Leave',
        leavepurpose: '',
        selectedDates: [],
        status: 'For Approval',
        deductedcredit: 0,
        inclusivedates: 0,
        leavecharging: '',
        leaveremarks: ''
      });
      setSelectedCalDates([]);
      setCalendarYmd([]);
    } else if (mode === 'edit' && transaction) {
      setIsEditMode(true);
      setEditingTransaction(transaction);
      setFormData({
        leavetypeid: transaction.leavetypeid,
        deductmode: transaction.deductmode,
        leavepurpose: transaction.leavepurpose,
        selectedDates: transaction.details ? transaction.details.map(d => d.deducteddate) : [],
        status: transaction.status,
        deductedcredit: transaction.deductedcredit,
        inclusivedates: transaction.inclusivedates,
        leavecharging: transaction.leavecharging || 'VL',
        leaveremarks: transaction.leaveremarks || ''
      });
      try {
        const dates = (transaction.details || []).map(d => new Date(d.deducteddate));
        setSelectedCalDates(dates);
        setCalendarYmd((transaction.details||[]).map(d=>String(d.deducteddate).slice(0,10)));
      } catch {}
      
      // Fetch questions for the leave type
      if (transaction.leavetypeid) {
        await fetchLeaveTypeQuestions(transaction.leavetypeid);
      }
      
      // Fetch question answers if available
      if (transaction.questionAnswer) {
        setQuestionAnswers({
          selectedQuestionId: transaction.questionAnswer.questionId,
          answer: transaction.questionAnswer.answer
        });
      }
    } else if (mode === 'view') {
      fetchEmployeeTransactions(employee.emp_objid);
    }
    
    setShowModal(true);
  };
  useEffect(() => {
    // Sync selectedCalDates (Date[]) into formData.selectedDates (yyyy-mm-dd[]) and update inclusivedates
    const ymd = (selectedCalDates||[]).filter(Boolean).map(d=>{
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
  const validateLeaveLimits = useCallback(async (emp_objid, leavetypeid, deductedcredit, selectedDates, exclude_transaction_objid = null) => {
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
        selectedDates,
        exclude_transaction_objid
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
    if (showModal && selectedEmployee?.emp_objid && formData.leavetypeid && formData.selectedDates?.length > 0) {
      validateLeaveLimits(
        selectedEmployee.emp_objid,
        formData.leavetypeid,
        formData.deductedcredit || formData.inclusivedates || 0,
        formData.selectedDates,
        isEditMode && editingTransaction?.objid ? editingTransaction.objid : null
      );
    } else if (!formData.leavetypeid || formData.selectedDates?.length === 0) {
      setValidationError(null);
    }
  }, [formData.leavetypeid, formData.selectedDates, formData.deductedcredit, selectedEmployee?.emp_objid, showModal, isEditMode, editingTransaction?.objid, validateLeaveLimits]);

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

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
    setSelectedTransaction(null);
    setIsEditMode(false);
    setEditingTransaction(null);
    setFormData({
      leavetypeid: '',
      deductmode: 'Leave',
      leavepurpose: '',
      selectedDates: [],
      status: 'For Approval',
      deductedcredit: 0,
      inclusivedates: 0
    });
    setSelectedLeaveTypeQuestions([]);
    setQuestionAnswers({ selectedQuestionId: null, answer: '' });
    setEmployeeTransactions([]);
    setValidationError(null);
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
    setFormData(prev => {
      const newDates = prev.selectedDates.includes(dateStr)
        ? prev.selectedDates.filter(d => d !== dateStr)
        : [...prev.selectedDates, dateStr].sort();
      
      const inclusivedates = newDates.length;
      const deductedcredit = inclusivedates * 1.000; // 1 credit per day
      
      return {
        ...prev,
        selectedDates: newDates,
        inclusivedates,
        deductedcredit
      };
    });
  };

  const handleSave = async () => {
    if (modalMode === 'add' && !canCreateLeave) {
      alert('You do not have permission to create leave transactions.');
      return;
    }
    if (modalMode === 'edit' && !canUpdateLeave) {
      alert('You do not have permission to update leave transactions.');
      return;
    }
    try {
      setSaving(true);
      
      if (modalMode === 'add') {
        const payload = {
          emp_objid: selectedEmployee.emp_objid,
          leavetypeid: formData.leavetypeid,
          deductmode: formData.deductmode,
          leavepurpose: formData.leavepurpose,
          selectedDates: formData.selectedDates,
          deductedcredit: formData.deductedcredit,
          inclusivedates: formData.inclusivedates,
          status: formData.status,
          createdby: user.USERID,
          leavecharging: formData.leavecharging || 'VL',
          leaveremarks: formData.leaveremarks || null,
          questionAnswers: questionAnswers.selectedQuestionId && questionAnswers.answer ? questionAnswers : null
        };
        
        await api.post('/employee-leave-transactions', payload);
        displayMessage('Leave transaction created successfully');
      } else if (modalMode === 'edit') {
        const payload = {
          leavetypeid: formData.leavetypeid,
          deductmode: formData.deductmode,
          leavepurpose: formData.leavepurpose,
          selectedDates: formData.selectedDates,
          deductedcredit: formData.deductedcredit,
          inclusivedates: formData.inclusivedates,
          status: formData.status,
          approvedby: formData.status === 'Approved' ? user.USERID : null,
          approveddate: formData.status === 'Approved' ? new Date().toISOString() : null,
          leavecharging: formData.leavecharging || 'VL',
          leaveremarks: formData.leaveremarks || null,
          questionAnswers: questionAnswers.selectedQuestionId && questionAnswers.answer ? questionAnswers : null
        };
        
        await api.put(`/employee-leave-transactions/${selectedTransaction.objid}`, payload);
        displayMessage('Leave transaction updated successfully');
      }
      
      handleCloseModal();
      
      // Refresh data based on active tab
      if (activeTab === 'leave-information') {
        fetchEmployees();
      } else {
        fetchAllTransactions();
      }
    } catch (error) {
      console.error('Error saving transaction:', error);
      displayMessage('Error saving transaction', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (transactionId) => {
    if (!canDeleteLeave) {
      alert('You do not have permission to delete leave transactions.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await api.delete(`/employee-leave-transactions/${transactionId}`);
        displayMessage('Transaction deleted successfully');
        if (activeTab === 'leave-information') {
          fetchEmployees();
        } else {
          fetchAllTransactions();
        }
      } catch (error) {
        console.error('Error deleting transaction:', error);
        displayMessage('Error deleting transaction', 'error');
      }
    }
  };

  const handleOpenViewModal = (transaction, action = null) => {
    if (action === 'approve' && !canApproveLeave) {
      alert('You do not have permission to approve leave transactions.');
      return;
    }
    if (action === 'return' && !canReturnLeave) {
      alert('You do not have permission to return leave transactions.');
      return;
    }
    if (!canReadLeave) {
      alert('You do not have permission to view leave transactions.');
      return;
    }
    setViewingTransaction(transaction);
    setLeaveCharging(transaction.leavecharging || 'VL');
    setLeaveRemarks(transaction.leaveremarks || '');
    setViewAction(action);
    setShowViewModal(true);
  };

  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setViewingTransaction(null);
    setLeaveCharging('');
    setLeaveRemarks('');
    setViewAction(null);
  };

  const handleUnapprove = async () => {
    if (!viewingTransaction) return;
    if (!canApproveLeave) {
      alert('You do not have permission to update approval status.');
      return;
    }
    try {
      const payload = { leaveremarks: leaveRemarks || null };
      await api.put(`/employee-leave-transactions/${viewingTransaction.objid}/unapprove`, payload);
      displayMessage('Leave transaction unapproved successfully', 'success');
      handleCloseViewModal();
      if (activeTab === 'leave-information') { fetchEmployees(); } else { fetchAllTransactions(); }
    } catch (error) {
      console.error('Error unapproving transaction:', error);
      displayMessage(error.response?.data?.error || 'Error unapproving transaction','error');
    }
  };

  const handleCancelLeave = async () => {
    if (!cancelContext.transaction) return;
    if (!canCancelLeave) {
      alert('You do not have permission to cancel leave transactions.');
      return;
    }
    if (!cancelRemarks || cancelRemarks.trim() === '') {
      displayMessage('Leave remarks are required to cancel', 'error');
      return;
    }
    try {
      setCancelling(true);
      const payload = {
        leavetypeid: cancelContext.transaction.leavetypeid,
        deductmode: cancelContext.transaction.deductmode || 'Leave',
        leavepurpose: cancelContext.transaction.leavepurpose,
        selectedDates: cancelContext.transaction.details ? cancelContext.transaction.details.map(d => d.deducteddate || d.leavedate) : [],
        deductedcredit: cancelContext.transaction.deductedcredit,
        inclusivedates: cancelContext.transaction.inclusivedates,
        status: 'Cancelled',
        leavecharging: cancelContext.transaction.leavecharging,
        leaveremarks: cancelRemarks.trim(),
        questionAnswers: cancelContext.transaction.questionAnswer ? {
          selectedQuestionId: cancelContext.transaction.questionAnswer.questionId,
          answer: cancelContext.transaction.questionAnswer.answer
        } : null
      };
      if (window.confirm('Are you sure you want to cancel this leave?')) {
        await api.put(`/employee-leave-transactions/${cancelContext.transaction.objid}`, payload);
        displayMessage('Leave transaction cancelled successfully', 'success');
        setCancelContext({ open: false, transaction: null });
        setCancelRemarks('');
        if (activeTab === 'leave-information') { fetchEmployees(); } else { fetchAllTransactions(); }
      }
    } catch (error) {
      console.error('Error cancelling transaction:', error);
      displayMessage(error.response?.data?.error || 'Error cancelling transaction','error');
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (newStatus === 'Approved' && !canApproveLeave) {
      alert('You do not have permission to approve leave transactions.');
      return;
    }
    if (newStatus === 'Returned' && !canReturnLeave) {
      alert('You do not have permission to return leave transactions.');
      return;
    }
    if (!viewingTransaction) return;

    // If approving, validate required fields
    if (newStatus === 'Approved') {
      if (!leaveCharging || !leaveRemarks) {
        displayMessage('Leave Charging and Leave Remarks are required before approval', 'error');
        return;
      }
    }

    try {
      setUpdatingStatus(true);
      
      // For status update, include leavecharging and leaveremarks
      const payload = {
        leavetypeid: viewingTransaction.leavetypeid,
        deductmode: viewingTransaction.deductmode || 'Leave',
        leavepurpose: viewingTransaction.leavepurpose,
        selectedDates: viewingTransaction.details ? viewingTransaction.details.map(d => d.deducteddate || d.leavedate) : [],
        deductedcredit: viewingTransaction.deductedcredit,
        inclusivedates: viewingTransaction.inclusivedates,
        status: newStatus,
        leavecharging: leaveCharging,
        leaveremarks: leaveRemarks,
        questionAnswers: viewingTransaction.questionAnswer ? {
          selectedQuestionId: viewingTransaction.questionAnswer.questionId,
          answer: viewingTransaction.questionAnswer.answer
        } : null
      };

      await api.put(`/employee-leave-transactions/${viewingTransaction.objid}`, payload);
      displayMessage(`Leave transaction ${newStatus.toLowerCase()} successfully`, 'success');
      handleCloseViewModal();
      
      // Refresh the lists
      if (activeTab === 'leave-information') {
        fetchEmployees();
      } else {
        fetchAllTransactions();
      }
    } catch (error) {
      console.error('Error updating transaction status:', error);
      displayMessage(
        error.response?.data?.error || 'Error updating transaction status',
        'error'
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'For Approval': return 'bg-yellow-100 text-yellow-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Returned': return 'bg-blue-100 text-blue-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const filteredTransactions = employeeTransactions.filter(trans => {
    const matchesDateFrom = !viewFilters.dateFrom || new Date(trans.deductdate) >= new Date(viewFilters.dateFrom);
    const matchesDateTo = !viewFilters.dateTo || new Date(trans.deductdate) <= new Date(viewFilters.dateTo);
    const matchesStatus = !viewFilters.status || trans.status === viewFilters.status;
    const matchesLeaveType = !viewFilters.leavetypeid || trans.leavetypeid === viewFilters.leavetypeid;
    
    return matchesDateFrom && matchesDateTo && matchesStatus && matchesLeaveType;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">Loading permissions…</p>
        </div>
      </div>
    );
  }

  if (!canReadLeave) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">You do not have permission to view leave transactions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Message Display */}
      {message.text && (
        <div className={`mb-4 p-4 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {message.type === 'success' ? (
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('leave-information')}
          className={`px-6 py-3 font-medium ${activeTab === 'leave-information' ? 'border-b-2 border-green-500 text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Information
        </button>
        <button
          onClick={() => {
            setActiveTab('leave-transactions');
            fetchAllTransactions();
          }}
          className={`px-6 py-3 font-medium ${activeTab === 'leave-transactions' ? 'border-b-2 border-green-500 text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Transactions
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'leave-information' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Employee</label>
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Search by name or ID..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                className="w-full px-3 py-2 text-left border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white flex items-center justify-between"
              >
                <span>
                  {selectedDepartment ? (() => {
                    const selectedDept = departments.find(d => String(d.deptid || d.DEPTID) === String(selectedDepartment));
                    if (!selectedDept) return 'All Departments';
                    const shortName = selectedDept.departmentshortname || selectedDept.DEPARTMENTSHORTNAME || '';
                    const fullName = selectedDept.departmentname || selectedDept.DEPARTMENTNAME || '';
                    return shortName ? (
                      `${shortName} (${fullName})`
                    ) : fullName;
                  })() : 'All Departments'}
                </span>
                <svg className={`w-4 h-4 transition-transform ${departmentDropdownOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {departmentDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setDepartmentDropdownOpen(false)}
                  ></div>
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        handleDepartmentFilter('');
                        setDepartmentDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-100 ${!selectedDepartment ? 'bg-blue-50' : ''}`}
                    >
                      All Departments
                    </button>
                    {departments && Array.isArray(departments) && departments.map(dept => {
                      const shortName = dept.departmentshortname || dept.DEPARTMENTSHORTNAME || '';
                      const fullName = dept.departmentname || dept.DEPARTMENTNAME || '';
                      const deptId = dept.deptid || dept.DEPTID;
                      const isSelected = String(selectedDepartment) === String(deptId);
                      return (
                        <button
                          key={deptId}
                          type="button"
                          onClick={() => {
                            handleDepartmentFilter(String(deptId));
                            setDepartmentDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-100 ${isSelected ? 'bg-blue-50' : ''}`}
                        >
                          {shortName ? `${shortName} (${fullName})` : fullName}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VL Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SL Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filed Leaves</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved Leaves</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.emp_objid} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 h-10 w-10">
                    {getPhotoUrl(employee.photo_path) ? (
                      <img
                        src={getPhotoUrl(employee.photo_path)}
                            alt={formatEmployeeNameFromObject(employee)}
                        className="h-10 w-10 rounded-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                      />
                        ) : null}
                        <div 
                          className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium"
                          style={{ display: getPhotoUrl(employee.photo_path) ? 'none' : 'flex' }}
                        >
                          {employee.employee_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {employee.employee_name}
                        </div>
                        {employee.designation_objid && employee.department_name && employee.position_title ? (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {employee.department_name} - {employee.position_title}
                          </div>
                        ) : employee.designation_objid && employee.department_name ? (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {employee.department_name}
                          </div>
                        ) : employee.designation_objid && employee.position_title ? (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {employee.position_title}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.vl_balance || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.sl_balance || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.filed_leaves || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.approved_leaves || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2 items-center">
                      {canCreateLeave && (
                        <button
                          onClick={() => handleOpenModal('add', employee)}
                          className="text-green-600 hover:text-green-900"
                          title="Add Leave Transaction"
                        >
                          ➕
                        </button>
                      )}
                      {canReadLeave && (
                        <button
                          onClick={() => handleOpenModal('view', employee)}
                          className="text-purple-600 hover:text-purple-900"
                          title="View All Transactions"
                        >
                          👁
                        </button>
                      )}
                      {!canCreateLeave && !canReadLeave && (
                        <span className="text-xs text-gray-400 italic">No actions</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                    {getPhotoUrl(selectedEmployee?.photo_path) ? (
                      <img src={getPhotoUrl(selectedEmployee.photo_path)} alt={formatEmployeeNameFromObject(selectedEmployee || {})} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'add' && 'Add Leave Transaction'}
                  {modalMode === 'edit' && 'Edit Leave Transaction'}
                  {modalMode === 'view' && 'View Leave Transactions'}
                </h3>
                    <div className="text-sm text-gray-600">{selectedEmployee?.employee_name} {selectedEmployee?.employee_id ? `· ${selectedEmployee.employee_id}` : ''}</div>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              {modalMode === 'view' ? (
                <div>
                  {/* Employee Info */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <div className="flex items-center space-x-4">
                      {getPhotoUrl(selectedEmployee?.photo_path) ? (
                        <img
                          src={getPhotoUrl(selectedEmployee.photo_path)}
                          alt={selectedEmployee.employee_name}
                          className="h-16 w-16 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-gray-600 text-lg font-medium">
                            {formatEmployeeNameFromObject(selectedEmployee || {}).split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </span>
                        </div>
                      )}
                      <div>
                        <h4 className="text-lg font-medium text-gray-900">{formatEmployeeNameFromObject(selectedEmployee || {})}</h4>
                        <p className="text-gray-600">{selectedEmployee?.employee_id}</p>
                      </div>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                      <input
                        type="date"
                        value={viewFilters.dateFrom}
                        onChange={(e) => setViewFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                      <input
                        type="date"
                        value={viewFilters.dateTo}
                        onChange={(e) => setViewFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={viewFilters.status}
                        onChange={(e) => setViewFilters(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      >
                        <option value="">All Status</option>
                        <option value="For Approval">For Approval</option>
                        <option value="Approved">Approved</option>
                        <option value="Returned">Returned</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                      <select
                        value={viewFilters.leavetypeid}
                        onChange={(e) => setViewFilters(prev => ({ ...prev, leavetypeid: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      >
                        <option value="">All Leave Types</option>
                        {leaveTypes && Array.isArray(leaveTypes) && leaveTypes.map(lt => (
                          <option key={lt.leaveid} value={lt.leaveid}>{lt.leavetypename}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave No.</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTransactions.map((transaction) => (
                          <tr key={transaction.objid}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {transaction.leaveno || '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(transaction.deductdate)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {transaction.leave_type_name || 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {transaction.leavepurpose}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {transaction.inclusivedates}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {transaction.deductedcredit}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(transaction.status)}`}>
                                {transaction.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2 items-center">
                                {canUpdateLeave && (
                                  <button
                                    onClick={() => handleOpenModal('edit', selectedEmployee, transaction)}
                                    className="px-2 py-1 text-blue-600 hover:text-blue-800"
                                    title="Edit"
                                  >
                                    ✎
                                  </button>
                                )}
                                {canPrintLeave && (
                                  <button
                                    onClick={() => openLeavePrintWindow(
                                      transaction,
                                      selectedEmployee || {
                                        employee_name: transaction.employee_name,
                                        emp_objid: transaction.emp_objid,
                                        department_name: transaction.department_name,
                                        position_title: transaction.position_title,
                                        salary: transaction.salary,
                                        vl_balance:
                                          transaction.vl_balance ??
                                          transaction.leave_vl_balance ??
                                          selectedEmployee?.vl_balance ??
                                          selectedEmployee?.leave_vl_balance ??
                                          null,
                                        sl_balance:
                                          transaction.sl_balance ??
                                          transaction.leave_sl_balance ??
                                          selectedEmployee?.sl_balance ??
                                          selectedEmployee?.leave_sl_balance ??
                                          null
                                      }
                                    )}
                                    className="px-2 py-1 text-green-600 hover:text-green-800"
                                    title="Print Leave Application"
                                  >
                                    🖨️
                                  </button>
                                )}
                                {canDeleteLeave && (
                                  <button
                                    onClick={() => handleDelete(transaction.objid)}
                                    className="px-2 py-1 text-red-600 hover:text-red-800 ml-1"
                                    title="Delete"
                                  >
                                    🗑
                                  </button>
                                )}
                                {!canUpdateLeave && !canDeleteLeave && !canPrintLeave && (
                                  <span className="text-xs text-gray-400 italic">No actions</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Employee Info moved to header */}

                  {/* Add/Edit Form */}
                  <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-6">
                    {/* Leave Type and Questions - Two Column */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <EnhancedDropdown
                          label="Leave Type"
                          value={formData.leavetypeid}
                          options={leaveTypes && Array.isArray(leaveTypes) ? leaveTypes.map(lt => {
                            console.log('🔍 Mapping leave type:', lt);
                            return {
                              value: lt.leaveid,
                              label: `${lt.leavetype || 'Unknown Leave Type'} (${lt.leavecode || 'N/A'})`,
                              hasQuestions: lt.hasquestion === 1 || lt.hasquestion === true
                            };
                          }) : []}
                          onSelect={(value) => {
                            try {
                              // Find the selected leave type to check if it has questions and get leavecharging
                              const selectedLeaveType = leaveTypes.find(lt => lt.leaveid === value);
                              const leaveChargingValue = selectedLeaveType?.leavecharging || 'VL';
                              
                              setFormData(prev => ({ ...prev, leavetypeid: value, leavecharging: leaveChargingValue }));
                              
                              if (selectedLeaveType && (selectedLeaveType.hasquestion === 1 || selectedLeaveType.hasquestion === true)) {
                                fetchLeaveTypeQuestions(value);
                              } else {
                                setSelectedLeaveTypeQuestions([]);
                                setQuestionAnswers({ selectedQuestionId: null, answer: '' });
                              }
                            } catch (error) {
                              console.error('Error setting leave type:', error);
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">📋 Questions</label>
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
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 resize-none"
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
                        <EnhancedDropdown
                          label="Deduct Mode"
                          value={formData.deductmode}
                          options={[
                            { value: 'Leave', label: 'Leave' },
                            { value: 'Absent', label: 'Absent' },
                            { value: 'Lates', label: 'Lates' }
                          ]}
                          onSelect={(value) => setFormData(prev => ({ ...prev, deductmode: value }))}
                          placeholder="Select Deduct Mode"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Leave Purpose</label>
                        <textarea
                          name="leavepurpose"
                          value={formData.leavepurpose}
                          onChange={handleInputChange}
                          rows={3}
                          maxLength={100}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 resize-none"
                          placeholder="Enter leave purpose..."
                        />
                        <p className="text-xs text-gray-500 mt-1">{formData.leavepurpose.length}/100 characters</p>
                      </div>
                    </div>


                    {/* Date Selection (Calendar) */}
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
                            <span className="text-xs text-gray-600">Total: {(formData.selectedDates||[]).length}</span>
                        </div>
                          <ul className="space-y-1 text-sm">
                            {(formData.selectedDates||[]).sort().map(d => {
                              const mm = d.slice(5,7); const dd = d.slice(8,10); const yy = d.slice(0,4);
                              const label = `${mm}/${dd}/${yy}`;
                              return (
                                <li key={d} className="flex items-center justify-between bg-white rounded border px-2 py-1">
                                  <span>{label}</span>
                                  <button type="button" onClick={()=>removeSelectedDate(d)} className="text-red-600 text-xs">Remove</button>
                                </li>
                              );
                            })}
                            {(!(formData.selectedDates||[]).length) && (
                              <li className="text-xs text-gray-500">No dates selected</li>
                            )}
                          </ul>
                    </div>
                      </div>
                    </div>

                    {/* Removed Inclusive Dates and Deducted Credit readonly fields per request */}

                    {/* Status (Edit Mode Only) */}
                    {modalMode === 'edit' && (
                      <EnhancedDropdown
                        label="Status"
                        value={formData.status}
                        options={[
                          { value: 'For Approval', label: 'For Approval' },
                          { value: 'Approved', label: 'Approved' },
                          { value: 'Returned', label: 'Returned' },
                          { value: 'Cancelled', label: 'Cancelled' }
                        ]}
                        onSelect={(value) => setFormData(prev => ({ ...prev, status: value }))}
                        placeholder="Select Status"
                      />
                    )}

                    {/* Modal Actions */}
                    <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving || !formData.leavetypeid || formData.selectedDates.length === 0 || (validationError && !validationError.valid)}
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                      >
                        {saving ? 'Saving...' : modalMode === 'add' ? 'Create Transaction' : 'Update Transaction'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {activeTab === 'leave-transactions' && (
        <>
          {/* All Transactions Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
              {/* Search Employee Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2.5">Search Employee</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search by employee name..."
                  value={transactionFilters.searchEmployee}
                  onChange={(e) => setTransactionFilters(prev => ({ ...prev, searchEmployee: e.target.value }))}
                />
              </div>
              
              {/* Date From Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2.5">Date From</label>
                <input
                  type="date"
                  value={transactionFilters.dateFrom}
                  onChange={(e) => setTransactionFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* Date To Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2.5">Date To</label>
                <input
                  type="date"
                  value={transactionFilters.dateTo}
                  onChange={(e) => setTransactionFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  min={transactionFilters.dateFrom || undefined}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* Leave Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2.5">Leave Type</label>
                <select
                  value={transactionFilters.leavetypeid}
                  onChange={(e) => setTransactionFilters(prev => ({ ...prev, leavetypeid: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">All Leave Types</option>
                  {leaveTypes.map((lt) => {
                    // Try multiple field name variations to find the leave type name
                    const leaveTypeName = lt.leavetype || lt.leavetypename || lt.leave_type_name || lt.leave_type || lt.name || '';
                    const leaveCode = lt.leavecode || lt.leave_code || '';
                    const displayName = leaveTypeName 
                      ? (leaveCode ? `${leaveTypeName} (${leaveCode})` : leaveTypeName)
                      : (leaveCode || 'Unknown');
                    // Use leaveid as the value (this is what's stored in employee_leave_trans.leavetypeid)
                    const leaveTypeId = lt.leaveid || lt.objid || '';
                    return (
                      <option key={leaveTypeId} value={leaveTypeId}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>
              
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2.5">Status</label>
                <select
                  value={transactionFilters.status}
                  onChange={(e) => setTransactionFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">All Statuses</option>
                  <option value="For Approval">For Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Returned">Returned</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            
            {/* Clear Filters Button */}
            {(transactionFilters.searchEmployee || transactionFilters.dateFrom || transactionFilters.dateTo || transactionFilters.status || transactionFilters.leavetypeid) && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    setTransactionFilters({
                      dateFrom: firstDay.toISOString().split('T')[0],
                      dateTo: lastDay.toISOString().split('T')[0],
                      status: '',
                      searchEmployee: '',
                      leavetypeid: ''
                    });
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* All Transactions Grid */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inclusive Date(s)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAllTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-6 text-center text-sm text-gray-500">
                        {allTransactions.length === 0 ? 'No leave transactions found.' : 'No transactions match the filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAllTransactions.map((transaction) => (
                    <tr key={transaction.objid} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0 h-10 w-10">
                          {transaction.photo_path ? (
                            <img
                              src={getPhotoUrl(transaction.photo_path)}
                                alt={formatEmployeeNameFromObject(transaction)}
                              className="h-10 w-10 rounded-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                            <div 
                              className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium"
                              style={{ display: transaction.photo_path ? 'none' : 'flex' }}
                            >
                              {formatEmployeeNameFromObject(transaction).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">
                              {formatEmployeeNameFromObject(transaction)}
                            </div>
                            {transaction.designation_objid && transaction.department_name && transaction.position_title ? (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {transaction.department_name} - {transaction.position_title}
                              </div>
                            ) : transaction.designation_objid && transaction.department_name ? (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {transaction.department_name}
                              </div>
                            ) : transaction.designation_objid && transaction.position_title ? (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {transaction.position_title}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.leaveno || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.leave_type_name} ({transaction.leavecode})
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatInclusiveDates(transaction.details)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(transaction.status)}`}>
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {transaction.isportal === 1 ? (
                          <span className="text-sm text-blue-600 font-medium">Portal</span>
                        ) : (
                          <div className="h-8 w-8">
                            {transaction.created_by_photo_path ? (
                              <img
                                src={transaction.created_by_photo_path}
                                alt={transaction.created_by_employee_name || transaction.created_by_username || ''}
                                className="h-8 w-8 rounded-full object-cover"
                                title={transaction.created_by_employee_name || transaction.created_by_username || ''}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : (
                              <div className={`h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center`}>
                                <span className="text-gray-600 text-xs font-medium">
                                  {(() => {
                                    // Try to get initials from individual fields first
                                    if (transaction.created_by_surname && transaction.created_by_firstname) {
                                      return `${transaction.created_by_surname.charAt(0)}${transaction.created_by_firstname.charAt(0)}`;
                                    }
                                    // Fallback to extracting from concatenated name
                                    if (transaction.created_by_employee_name) {
                                      const parts = transaction.created_by_employee_name.split(',').map(p => p.trim());
                                      if (parts.length >= 2) {
                                        const surname = parts[0];
                                        const firstname = parts[1].split(' ')[0];
                                        return `${surname.charAt(0)}${firstname.charAt(0)}`;
                                      }
                                    }
                                    // Last resort: use username
                                    if (transaction.created_by_username) {
                                      return transaction.created_by_username.substring(0, 2).toUpperCase();
                                    }
                                    return '??';
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2 items-center">
                          {transaction.status === 'For Approval' && canApproveLeave && (
                            <button
                              onClick={() => handleOpenViewModal(transaction, 'approve')}
                              className="px-2 py-1 text-green-600 hover:text-green-800"
                              title="Approve"
                            >
                              👍
                            </button>
                          )}
                          {transaction.status === 'For Approval' && canReturnLeave && (
                            <button
                              onClick={() => handleOpenViewModal(transaction, 'return')}
                              className="px-2 py-1 text-orange-600 hover:text-orange-800"
                              title="Return"
                            >
                              ↩
                            </button>
                          )}
                          {(transaction.status === 'For Approval' || transaction.status === 'Returned' || transaction.status === 'Approved') && canCancelLeave && (
                            <button
                              onClick={() => setCancelContext({ open: true, transaction })}
                              className="px-2 py-1 text-red-600 hover:text-red-800"
                              title="Cancel Leave"
                            >
                              ✖
                            </button>
                          )}
                          {canPrintLeave && (
                            <button
                              onClick={() =>
                                openLeavePrintWindow(transaction, {
                                  employee_name: transaction.employee_name,
                                  emp_objid: transaction.emp_objid,
                                  department_name: transaction.department_name,
                                  position_title: transaction.position_title,
                                  salary: transaction.salary,
                                  vl_balance:
                                    transaction.vl_balance ??
                                    transaction.leave_vl_balance ??
                                    null,
                                  sl_balance:
                                    transaction.sl_balance ??
                                    transaction.leave_sl_balance ??
                                    null
                                })
                              }
                              className="px-2 py-1 text-green-600 hover:text-green-800"
                              title="Print Leave Application"
                            >
                              🖨️
                            </button>
                          )}
                          {canDeleteLeave && (
                            <button
                              onClick={() => handleDelete(transaction.objid)}
                              className="px-2 py-1 text-red-600 hover:text-red-800"
                              title="Delete Transaction"
                            >
                              🗑
                            </button>
                          )}
                          {!((transaction.status === 'For Approval' && (canApproveLeave || canReturnLeave)) ||
                            ((transaction.status === 'For Approval' || transaction.status === 'Returned' || transaction.status === 'Approved') && canCancelLeave) ||
                            canDeleteLeave ||
                            canPrintLeave) && (
                              <span className="text-xs text-gray-400 italic">No actions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* View Transaction Modal */}
      {showViewModal && viewingTransaction && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                    {viewingTransaction.photo_path ? (
                      <img 
                        src={getPhotoUrl(viewingTransaction.photo_path)} 
                        alt={viewingTransaction.employee_name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-300">
                        <span className="text-gray-600 text-sm font-medium">
                          {viewingTransaction.employee_name?.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">View Leave Transaction</h3>
                    <div className="text-sm text-gray-600">
                      {viewingTransaction.employee_name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleCloseViewModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Section 1: Leave Information */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-gray-800 mb-4">Leave Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave No.</label>
                    <div className="text-sm text-gray-900">{viewingTransaction.leaveno || '—'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                    <div className="text-sm text-gray-900">
                      {viewingTransaction.leave_type_name || '—'} 
                      {viewingTransaction.leavecode && ` (${viewingTransaction.leavecode})`}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave Dates</label>
                    <div className="text-sm text-gray-900">
                      {viewingTransaction.details && viewingTransaction.details.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {viewingTransaction.details.map((detail, idx) => {
                            const dateStr = detail.deducteddate || detail.leavedate;
                            if (!dateStr) return null;
                            const mm = dateStr.slice(5,7);
                            const dd = dateStr.slice(8,10);
                            const yy = dateStr.slice(0,4);
                            return (
                              <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                {mm}/{dd}/{yy}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400">No dates</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                    <div className="text-sm text-gray-900">{viewingTransaction.leavepurpose || '—'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Created By</label>
                    <div className="text-sm text-gray-900">
                      {viewingTransaction.isportal === 1 ? (
                        <span className="text-blue-600 font-medium">Portal</span>
                      ) : viewingTransaction.created_by_employee_name ? (
                        viewingTransaction.created_by_employee_name
                      ) : viewingTransaction.created_by_username ? (
                        viewingTransaction.created_by_username
                      ) : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(viewingTransaction.status)}`}>
                        {viewingTransaction.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Approval Information - Only shown when status is For Approval and not in return mode */}
              {viewingTransaction.status === 'For Approval' && viewAction !== 'return' && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4">Approval Information</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Leave Charging <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={leaveCharging}
                        onChange={(e) => setLeaveCharging(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        required
                      >
                        <option value="VL">VL</option>
                        <option value="SL">SL</option>
                        <option value="ND">ND</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Leave Remarks <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={leaveRemarks}
                        onChange={(e) => setLeaveRemarks(e.target.value)}
                        rows={3}
                        placeholder="Enter remarks for this leave application..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Return mode: only remarks required */}
              {viewAction === 'return' && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-semibold text-orange-800 mb-4">Return Leave Transaction</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave Remarks <span className="text-red-500">*</span></label>
                    <textarea
                      value={leaveRemarks}
                      onChange={(e) => setLeaveRemarks(e.target.value)}
                      rows={4}
                      placeholder="Enter the reason for returning this leave transaction..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Additional Information - Hide approved by when in return mode */}
              {(viewingTransaction.approved_by_employee_name || viewingTransaction.questionAnswer) && viewAction !== 'return' && (
                <div className="space-y-4 mb-6">
                  {viewingTransaction.approved_by_employee_name && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Approved By</label>
                      <div className="text-sm text-gray-900">{viewingTransaction.approved_by_employee_name}</div>
                    </div>
                  )}
                  {viewingTransaction.questionAnswer && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Question & Answer</label>
                      <div className="text-sm text-gray-900">
                        <div className="font-medium mb-1">{viewingTransaction.questionAnswer.questionText || '—'}</div>
                        <div className="text-gray-600">{viewingTransaction.questionAnswer.answer || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Action Buttons */}
              <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseViewModal}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                {viewAction === 'approve' && viewingTransaction.status === 'For Approval' && canApproveLeave && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to approve this leave transaction? This will deduct the leave credits from the employee\'s balance.')) {
                        handleUpdateStatus('Approved');
                      }
                    }}
                    disabled={updatingStatus}
                    className="px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updatingStatus ? 'Updating...' : 'Approve'}
                  </button>
                )}
                {viewAction === 'return' && viewingTransaction.status === 'For Approval' && canReturnLeave && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to return this leave transaction?')) {
                        handleUpdateStatus('Returned');
                      }
                    }}
                    disabled={updatingStatus}
                    className="px-6 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updatingStatus ? 'Updating...' : 'Return'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Leave Modal */}
      {canCancelLeave && cancelContext.open && cancelContext.transaction && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                    {cancelContext.transaction.photo_path ? (
                      <img 
                        src={getPhotoUrl(cancelContext.transaction.photo_path)} 
                        alt={cancelContext.transaction.employee_name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-300">
                        <span className="text-gray-600 text-sm font-medium">
                          {cancelContext.transaction.employee_name?.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Cancel Leave Transaction</h3>
                    <div className="text-sm text-gray-600">
                      {cancelContext.transaction.employee_name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setCancelContext({ open: false, transaction: null }); setCancelRemarks(''); }}
                  className="text-red-400 hover:text-red-600 transition-colors duration-200 p-1 rounded-full hover:bg-red-50"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Section 1: Leave Information */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-gray-800 mb-4">Leave Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave No.</label>
                    <div className="text-sm text-gray-900">{cancelContext.transaction.leaveno || '—'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                    <div className="text-sm text-gray-900">
                      {cancelContext.transaction.leave_type_name || '—'} 
                      {cancelContext.transaction.leavecode && ` (${cancelContext.transaction.leavecode})`}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leave Dates</label>
                    <div className="text-sm text-gray-900">
                      {cancelContext.transaction.details && cancelContext.transaction.details.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {cancelContext.transaction.details.map((detail, idx) => {
                            const dateStr = detail.deducteddate || detail.leavedate;
                            if (!dateStr) return null;
                            const mm = dateStr.slice(5,7);
                            const dd = dateStr.slice(8,10);
                            const yy = dateStr.slice(0,4);
                            return (
                              <span key={idx} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                {mm}/{dd}/{yy}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400">No dates</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                    <div className="text-sm text-gray-900">{cancelContext.transaction.leavepurpose || '—'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Created By</label>
                    <div className="text-sm text-gray-900">
                      {cancelContext.transaction.isportal === 1 ? (
                        <span className="text-blue-600 font-medium">Portal</span>
                      ) : cancelContext.transaction.created_by_employee_name ? (
                        cancelContext.transaction.created_by_employee_name
                      ) : cancelContext.transaction.created_by_username ? (
                        cancelContext.transaction.created_by_username
                      ) : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(cancelContext.transaction.status)}`}>
                        {cancelContext.transaction.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cancel Leave Transaction Section */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-red-800 mb-4">Cancel Leave Transaction</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leave Remarks <span className="text-red-500">*</span></label>
                  <textarea
                    value={cancelRemarks}
                    onChange={(e) => setCancelRemarks(e.target.value)}
                    rows={4}
                    placeholder="Enter the reason for cancelling this leave transaction..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900"
                    required
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setCancelContext({ open: false, transaction: null }); setCancelRemarks(''); }}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleCancelLeave}
                  disabled={cancelling}
                  className="px-6 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeLeaveTransactions;
