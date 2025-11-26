import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../utils/api';
import { formatEmployeeName } from '../../utils/employeenameFormatter';
import { getEmployeeShiftSchedule } from '../../utils/shiftScheduleUtils';
import ComputedAttendanceModal from './ComputedAttendanceModal.jsx';
import FixTimeModal from './FixTimeModal.jsx';
import { usePermissions } from '../../hooks/usePermissions';

const parseSelectedMonth = (value) => {
  if (!value) return null;

  const buildMonthInfo = (dateObj) => {
    if (Number.isNaN(dateObj.getTime())) return null;
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    return {
      year,
      month,
      monthName: dateObj.toLocaleString('en-US', { month: 'long' }),
      shortMonth: dateObj.toLocaleString('en-US', { month: 'short' }),
      label: dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    };
  };

  // Try direct Date parsing
  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) {
    return buildMonthInfo(directDate);
  }

  // Try ISO without day (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(value)) {
    const isoDate = new Date(`${value}-01`);
    if (!Number.isNaN(isoDate.getTime())) {
      return buildMonthInfo(isoDate);
    }
  }

  // Try word month with optional year
  const sanitized = value.trim();
  const yearMatch = sanitized.match(/(19|20)\d{2}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
  const monthPart = yearMatch ? sanitized.replace(yearMatch[0], '').trim() : sanitized;

  const wordDate = new Date(`${monthPart} 1, ${year}`);
  if (!Number.isNaN(wordDate.getTime())) {
    return buildMonthInfo(wordDate);
  }

  return null;
};

const RecomputedDTRAttendance = ({
  selectedMonth,
  processMode = 'recompute',
  onBack
}) => {
  // State for filters
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [employeeStatusTypes, setEmployeeStatusTypes] = useState([]);
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('1');
  const [selectedAppointment, setSelectedAppointment] = useState('all');

  // State for department employee selection
  const [departmentEmployees, setDepartmentEmployees] = useState([]);
  const [selectedDepartmentEmployees, setSelectedDepartmentEmployees] = useState(new Set());
  const [loadingDepartmentEmployees, setLoadingDepartmentEmployees] = useState(false);
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(true);
  
  // State for department employee search
  const [departmentEmployeeSearchTerm, setDepartmentEmployeeSearchTerm] = useState('');
  const [filteredDepartmentEmployees, setFilteredDepartmentEmployees] = useState([]);

  // State for period filter
  const [selectedPeriod, setSelectedPeriod] = useState('');

  // State for all employees (from MySQL)
  const [allEmployees, setAllEmployees] = useState([]);

  // State for tracking employees with computed DTR
  const [employeesWithComputedDtr, setEmployeesWithComputedDtr] = useState(new Set());
  const [loadingComputedDtr, setLoadingComputedDtr] = useState(false);

  // State for period checking
  const [existingPeriods, setExistingPeriods] = useState({
    '1st Half': new Set(),
    'Full Month': new Set(),
    '2nd Half': new Set()
  });
  const [isPeriodControlDisabled, setIsPeriodControlDisabled] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // State for computed DTR data and grid
  const [computedDtrData, setComputedDtrData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [modalLogs, setModalLogs] = useState([]);
  const [modalRange, setModalRange] = useState({ startDate: '', endDate: '' });
  const [modalShiftSchedule, setModalShiftSchedule] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalMeta, setModalMeta] = useState({ monthLabel: '', periodLabel: '' });

  // Fix modal state
  const [fixTimeModalOpen, setFixTimeModalOpen] = useState(false);
  const [fixTimeModalRow, setFixTimeModalRow] = useState(null);
  const [fixTimeForm, setFixTimeForm] = useState({
    emp_objid: '',
    checktimedate: '',
    am_checkin: '',
    am_checkout: '',
    pm_checkin: '',
    pm_checkout: '',
    remarks: ''
  });
  const [fixTimeExistingRecord, setFixTimeExistingRecord] = useState(null);
  const [fixTimeLoading, setFixTimeLoading] = useState(false);
  const [fixTimeSaving, setFixTimeSaving] = useState(false);
  const [fixTimeError, setFixTimeError] = useState('');

  // Fetch all employees from MySQL
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        console.log('🔄 Fetching employees from MySQL employees table...');
        const response = await api.get('/201-employees');
        
        if (response.data.success && response.data.data) {
          const mappedEmployees = response.data.data.map(emp => {
            const formattedName = formatEmployeeName(emp.surname, emp.firstname, emp.middlename, emp.extension);
            
            return {
              ...emp,
              NAME: formattedName || String(emp.fullname || `${emp.firstname || ''} ${emp.middlename || ''} ${emp.surname || ''}`.trim()),
              BADGENUMBER: String(emp.dtrbadgenumber || emp.badgenumber || ''),
              USERID: emp.dtruserid || emp.userid || emp.objid,
              DEPARTMENT: String(emp.department_name || emp.department || ''),
              TITLE: String(emp.position_title || emp.position || ''),
              photo_path: emp.photo_path || emp.photo || null,
              PHOTO: emp.photo_path || emp.photo || null,
              Appointment: emp.appointment_status || emp.appointmentstatus || null,
              STATUS_ID: emp.empstatusid ?? emp.empstatid ?? emp.statusid ?? null,
              STATUS: emp.empstatus || emp.employeestatus || null,
              objid: emp.objid,
              idno: emp.idno,
              surname: emp.surname,
              firstname: emp.firstname,
              middlename: emp.middlename,
              extension: emp.extension
            };
          });
          
          console.log('✅ Employees fetched from MySQL:', mappedEmployees.length);
          setAllEmployees(mappedEmployees);
        } else {
          console.error('❌ Invalid response structure:', response.data);
          setAllEmployees([]);
        }
      } catch (error) {
        console.error('❌ Error fetching employees from MySQL:', error);
        setAllEmployees([]);
      }
    };
    fetchEmployees();
  }, []);

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        console.log('🔄 Fetching departments from ComputeAttendance API...');
        const response = await api.get('/compute-attendance/departments');
        console.log('✅ Departments fetched:', response.data.length);
        setDepartments(response.data);
      } catch (error) {
        console.error('❌ Error fetching departments:', error);
      }
    };
    fetchDepartments();
  }, []);

  // Fetch employee status types and appointment types
  useEffect(() => {
    const fetchEmployeeStatusTypes = async () => {
      try {
        console.log('🔄 Fetching employee status types...');
        const response = await api.get('/201-employees/lookup/employeestatustypes');
        if (Array.isArray(response.data)) {
          setEmployeeStatusTypes(response.data);
        } else if (response.data?.data) {
          setEmployeeStatusTypes(response.data.data);
        } else {
          console.warn('⚠️ Unexpected employee status response:', response.data);
          setEmployeeStatusTypes([]);
        }
      } catch (error) {
        console.error('❌ Error fetching employee status types:', error);
        setEmployeeStatusTypes([]);
      }
    };

    const fetchAppointmentTypes = async () => {
      try {
        console.log('🔄 Fetching appointment types from MySQL...');
        const response = await api.get('/201-employees/lookup/appointmenttypes');
        if (response.data.success) {
          console.log('✅ Appointment types fetched:', response.data.data.length);
          setAppointmentTypes(response.data.data);
        } else if (response.data?.data) {
          setAppointmentTypes(response.data.data);
        } else if (Array.isArray(response.data)) {
          setAppointmentTypes(response.data);
        } else {
          console.warn('⚠️ Unexpected appointment types response:', response.data);
          setAppointmentTypes([]);
        }
      } catch (error) {
        console.error('❌ Error fetching appointment types:', error);
        setAppointmentTypes([]);
      }
    };

    fetchEmployeeStatusTypes();
    fetchAppointmentTypes();
  }, []);

  // Filter department employees based on search term
  useEffect(() => {
    if (departmentEmployeeSearchTerm.trim() === '') {
      setFilteredDepartmentEmployees(departmentEmployees);
    } else {
      const filtered = departmentEmployees.filter(emp =>
        String(emp.NAME || '').toLowerCase().includes(departmentEmployeeSearchTerm.toLowerCase()) ||
        String(emp.BADGENUMBER || '').toLowerCase().includes(departmentEmployeeSearchTerm.toLowerCase())
      );
      setFilteredDepartmentEmployees(filtered);
    }
  }, [departmentEmployeeSearchTerm, departmentEmployees]);

  // Fetch department employees when department, status, or appointment changes
  useEffect(() => {
    const hasUserSelectedFilter = selectedDepartment || 
                                  selectedStatus !== 'all' || 
                                  selectedAppointment !== 'all';
    
    if (hasUserSelectedFilter && allEmployees.length > 0) {
      fetchDepartmentEmployees();
    } else {
      setDepartmentEmployees([]);
      setSelectedDepartmentEmployees(new Set());
      setFilteredDepartmentEmployees([]);
      setDepartmentEmployeeSearchTerm('');
    }
  }, [selectedDepartment, selectedStatus, selectedAppointment, allEmployees]);

  const fetchDepartmentEmployees = async () => {
    setLoadingDepartmentEmployees(true);
    setDepartmentEmployees([]);
    setSelectedDepartmentEmployees(new Set());
    setFilteredDepartmentEmployees([]);
    setDepartmentEmployeeSearchTerm('');

    try {
      let deptEmployees = [...allEmployees];
      console.log(`✅ Starting with ${deptEmployees.length} total employees`);

      // Apply department filter
      if (selectedDepartment) {
        deptEmployees = deptEmployees.filter(emp => emp.DEPARTMENT === selectedDepartment);
        console.log(`✅ After department filter (${selectedDepartment}): ${deptEmployees.length} employees`);
      }

      // Apply status filter
      if (selectedStatus !== 'all') {
        const selectedStatusId = parseInt(selectedStatus);
        deptEmployees = deptEmployees.filter(emp => {
          const empStatusRaw = emp.STATUS_ID ?? emp.STATUS;
          const empStatusId = empStatusRaw !== undefined && empStatusRaw !== null ? parseInt(empStatusRaw) : null;
          return !Number.isNaN(selectedStatusId) && empStatusId === selectedStatusId;
        });
        console.log(`✅ After status filter (${selectedStatus}): ${deptEmployees.length} employees`);
      }

      // Apply appointment filter
      if (selectedAppointment !== 'all') {
        const appointmentId = parseInt(selectedAppointment);
        deptEmployees = deptEmployees.filter(emp => {
          if (emp.Appointment === null || emp.Appointment === undefined) {
            return false;
          }
          return parseInt(emp.Appointment) === appointmentId;
        });
        console.log(`✅ After appointment filter (${appointmentId}): ${deptEmployees.length} employees`);
      }

      console.log(`✅ Final filtered employees:`, deptEmployees.length);
      setDepartmentEmployees(deptEmployees);
      setFilteredDepartmentEmployees(deptEmployees);
      
      // For recompute mode: Don't auto-select all, wait for period selection
      // Employees will be selected based on existing records

    } catch (error) {
      console.error('❌ Error fetching department employees:', error);
    } finally {
      setLoadingDepartmentEmployees(false);
    }
  };

  const monthInfo = useMemo(() => parseSelectedMonth(selectedMonth), [selectedMonth]);

  // Helper function to get month range based on period
  const getMonthRange = (monthDetails, period = 'full') => {
    if (!monthDetails) {
      return { startDate: '', endDate: '' };
    }

    const year = monthDetails.year;
    const month = String(monthDetails.month).padStart(2, '0');

    let startDate, endDate;
    
    if (period === 'full') {
      startDate = `${year}-${month}-01`;
      const lastDay = new Date(year, monthDetails.month, 0).getDate();
      endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    } else if (period === 'first') {
      startDate = `${year}-${month}-01`;
      endDate = `${year}-${month}-15`;
    } else if (period === 'second') {
      startDate = `${year}-${month}-16`;
      const lastDay = new Date(year, monthDetails.month, 0).getDate();
      endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    }
    
    console.log('📅 Period range calculated:', { period, startDate, endDate });
    return { startDate, endDate };
  };

  // Check periods for ALL department employees (to determine which should be disabled)
  const checkAllPeriodsForDepartmentEmployees = useCallback(async () => {
    if (!monthInfo || departmentEmployees.length === 0) {
      setExistingPeriods({
        '1st Half': new Set(),
        'Full Month': new Set(),
        '2nd Half': new Set()
      });
      setIsPeriodControlDisabled(false);
      return;
    }
    
    try {
      setLoadingPeriods(true);
      const monthName = monthInfo.monthName;
      const computedYear = monthInfo.year;
      
      // Get objid values from ALL department employees
      const allEmployeeObjIds = departmentEmployees
        .map(emp => emp.objid)
        .filter(objid => objid);
      
      if (allEmployeeObjIds.length === 0) {
        setExistingPeriods({
          '1st Half': new Set(),
          'Full Month': new Set(),
          '2nd Half': new Set()
        });
        setIsPeriodControlDisabled(false);
        return;
      }
      
      console.log('🔄 Checking all periods for ALL department employees:', {
        monthName,
        computedYear,
        employeeCount: allEmployeeObjIds.length
      });
      
      const response = await api.get('/compute-attendance/check-all-periods', {
        params: {
          computedmonth: monthName,
          computedyear: computedYear,
          emp_objids: allEmployeeObjIds.join(',')
        }
      });
      
      if (response.data.success) {
        const periods = response.data.periods || {};
        
        // Convert arrays to Sets
        const newExistingPeriods = {
          '1st Half': new Set(periods['1st Half'] || []),
          'Full Month': new Set(periods['Full Month'] || []),
          '2nd Half': new Set(periods['2nd Half'] || [])
        };
        
        setExistingPeriods(newExistingPeriods);
        setIsPeriodControlDisabled(false);
        
        console.log('✅ Period check completed for ALL employees:', {
          '1st Half': newExistingPeriods['1st Half'].size,
          'Full Month': newExistingPeriods['Full Month'].size,
          '2nd Half': newExistingPeriods['2nd Half'].size
        });
      } else {
        setExistingPeriods({
          '1st Half': new Set(),
          'Full Month': new Set(),
          '2nd Half': new Set()
        });
        setIsPeriodControlDisabled(false);
      }
    } catch (error) {
      console.error('❌ Error checking all periods:', error);
      setExistingPeriods({
        '1st Half': new Set(),
        'Full Month': new Set(),
        '2nd Half': new Set()
      });
      setIsPeriodControlDisabled(false);
    } finally {
      setLoadingPeriods(false);
    }
  }, [monthInfo, departmentEmployees]);

  // Check periods when department employees change
  useEffect(() => {
    if (monthInfo && departmentEmployees.length > 0) {
      checkAllPeriodsForDepartmentEmployees();
    } else {
      setExistingPeriods({
        '1st Half': new Set(),
        'Full Month': new Set(),
        '2nd Half': new Set()
      });
      setIsPeriodControlDisabled(false);
    }
  }, [monthInfo, departmentEmployees, checkAllPeriodsForDepartmentEmployees]);

  // Reset state when selectedMonth changes
  useEffect(() => {
    setSelectedPeriod('');
    setSelectedDepartmentEmployees(new Set());
    setDepartmentEmployees([]);
  }, [selectedMonth]);

  // Auto-select employees with existing records when period is selected
  useEffect(() => {
    if (selectedPeriod && departmentEmployees.length > 0) {
      const employeesWithPeriod = departmentEmployees.filter(emp => {
        if (selectedPeriod === 'full') {
          return existingPeriods['Full Month'].has(emp.objid);
        } else if (selectedPeriod === 'first') {
          return existingPeriods['1st Half'].has(emp.objid);
        } else if (selectedPeriod === 'second') {
          return existingPeriods['2nd Half'].has(emp.objid);
        }
        return false;
      });
      
      const employeeIds = new Set(employeesWithPeriod.map(emp => emp.USERID));
      setSelectedDepartmentEmployees(employeeIds);
      console.log(`✅ Auto-selected ${employeeIds.size} employees with existing ${selectedPeriod} records`);
    } else if (!selectedPeriod) {
      setSelectedDepartmentEmployees(new Set());
    }
  }, [selectedPeriod, departmentEmployees, existingPeriods]);

  // Helper function to format period options
  const getPeriodOptions = () => {
    if (!monthInfo) {
      return [
        { value: 'full', label: 'Full Month', disabled: false },
        { value: 'first', label: '1st Half', disabled: false },
        { value: 'second', label: '2nd Half', disabled: false }
      ];
    }

    const monthName = monthInfo.shortMonth;
    const lastDay = new Date(monthInfo.year, monthInfo.month, 0).getDate();

    // All periods are always enabled (no validation)
    return [
      { 
        value: 'full', 
        label: `Full Month (${monthName})`,
        disabled: false
      },
      { 
        value: 'first', 
        label: `1st Half (${monthName} 1 - ${monthName} 15)`,
        disabled: false
      },
      { 
        value: 'second', 
        label: `2nd Half (${monthName} 16 - ${monthName} ${lastDay})`,
        disabled: false
      }
    ];
  };

  // Department employee selection handlers
  const handleDepartmentEmployeeSelect = (employeeId) => {
    console.log('👤 Department employee selection toggled:', employeeId);
    const newSelected = new Set(selectedDepartmentEmployees);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
      console.log('❌ Employee deselected:', employeeId);
    } else {
      newSelected.add(employeeId);
      console.log('✅ Employee selected:', employeeId);
    }
    setSelectedDepartmentEmployees(newSelected);
    console.log(' Total selected employees:', newSelected.size);
  };

  const handleSelectAllDepartmentEmployees = () => {
    console.log('🔄 Select all department employees toggled');
    
    // Filter out disabled employees based on selected period (recompute mode: only employees WITH records)
    const availableEmployees = departmentEmployees.filter(emp => {
      if (selectedPeriod === 'full') {
        return existingPeriods['Full Month'].has(emp.objid);
      } else if (selectedPeriod === 'first') {
        return existingPeriods['1st Half'].has(emp.objid);
      } else if (selectedPeriod === 'second') {
        return existingPeriods['2nd Half'].has(emp.objid);
      }
      return false;
    });
    
    const availableEmployeeIds = new Set(availableEmployees.map(emp => emp.USERID));
    const allAvailableSelected = availableEmployeeIds.size > 0 && 
      Array.from(availableEmployeeIds).every(id => selectedDepartmentEmployees.has(id));
    
    if (allAvailableSelected) {
      console.log('❌ Deselecting all available employees');
      const newSelected = new Set(selectedDepartmentEmployees);
      availableEmployeeIds.forEach(id => newSelected.delete(id));
      setSelectedDepartmentEmployees(newSelected);
    } else {
      console.log('✅ Selecting all available employees');
      const newSelected = new Set(selectedDepartmentEmployees);
      availableEmployeeIds.forEach(id => newSelected.add(id));
      setSelectedDepartmentEmployees(newSelected);
    }
  };

  const handleSelectAllFilteredEmployees = () => {
    console.log('🔄 Select all filtered employees toggled');
    
    // Filter out disabled employees based on selected period (recompute mode: only employees WITH records)
    const availableFilteredEmployees = filteredDepartmentEmployees.filter(emp => {
      if (selectedPeriod === 'full') {
        return existingPeriods['Full Month'].has(emp.objid);
      } else if (selectedPeriod === 'first') {
        return existingPeriods['1st Half'].has(emp.objid);
      } else if (selectedPeriod === 'second') {
        return existingPeriods['2nd Half'].has(emp.objid);
      }
      return false;
    });
    
    const filteredEmployeeIds = new Set(availableFilteredEmployees.map(emp => emp.USERID));
    const allFilteredSelected = filteredEmployeeIds.size > 0 && 
      Array.from(filteredEmployeeIds).every(id => selectedDepartmentEmployees.has(id));
    
    if (allFilteredSelected) {
      console.log('❌ Deselecting all filtered employees');
      const newSelected = new Set(selectedDepartmentEmployees);
      filteredEmployeeIds.forEach(id => newSelected.delete(id));
      setSelectedDepartmentEmployees(newSelected);
    } else {
      console.log('✅ Selecting all available filtered employees');
      const newSelected = new Set(selectedDepartmentEmployees);
      filteredEmployeeIds.forEach(id => newSelected.add(id));
      setSelectedDepartmentEmployees(newSelected);
    }
  };

  // Convert Set to sorted array string for dependency tracking
  const selectedEmployeesKey = useMemo(() => {
    return Array.from(selectedDepartmentEmployees).sort().join(',');
  }, [selectedDepartmentEmployees.size]);

  // Fetch computed DTR records
  const fetchComputedDtrRecords = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching computed DTR records for Recompute mode', {
        monthLabel: monthInfo?.label,
        selectedPeriod,
        selectedEmployeesCount: selectedDepartmentEmployees.size,
        departmentEmployeesCount: departmentEmployees.length
      });
      
      if (!monthInfo || !selectedPeriod) {
        console.log('⚠️ Missing required parameters:', { selectedMonth, selectedPeriod });
        setComputedDtrData([]);
        return;
      }
      
      if (selectedDepartmentEmployees.size === 0 || departmentEmployees.length === 0) {
        console.log('⚠️ No employees selected or available');
        setComputedDtrData([]);
        return;
      }
      
      const monthName = monthInfo.monthName;
      const computedYear = monthInfo.year;
      
      // Map period values
      const periodMap = {
        'full': 'Full Month',
        'first': '1st Half',
        'second': '2nd Half'
      };
      const periodValue = periodMap[selectedPeriod] || selectedPeriod;
      
      console.log('📋 Fetching for:', { monthName, computedYear, periodValue });
      
      // Get selected employees
      const selectedEmployeeIds = Array.from(selectedDepartmentEmployees);
      const currentEmployees = departmentEmployees.filter(emp => selectedEmployeeIds.includes(emp.USERID));
      
      console.log('👥 Processing employees:', currentEmployees.length, 'out of', selectedEmployeeIds.length, 'selected');
      
      const computedDtrArray = [];
      
      // Fetch computed DTR for each selected employee
      for (const employee of currentEmployees) {
        try {
          console.log(`🔄 Fetching for employee: ${employee.NAME} (${employee.objid})`);
          const response = await api.get(`/computed-dtr/employee/${employee.objid}`, {
            params: {
              computedmonth: monthName,
              computedyear: computedYear,
              period: periodValue
            }
          });
          
          if (response.data.success && response.data.data && response.data.data.length > 0) {
            const computedRecord = response.data.data[0];
            
            // Fetch details for this computeid
            const detailsResponse = await api.get(`/computed-dtr/${computedRecord.computeid}/details`);
            
            computedDtrArray.push({
              employeeId: employee.USERID,
              name: employee.NAME,
              department: employee.DEPARTMENT,
              position: employee.TITLE,
              photo_path: employee.photo_path || employee.PHOTO || null,
              objid: employee.objid,
              computeid: computedRecord.computeid,
              lates: computedRecord.total_lates || 0,
              days: computedRecord.total_days || 0,
              netDays: computedRecord.total_netdays || 0,
              locatorsCount: 0,
              leavesCount: computedRecord.total_leaves || 0,
              travelsCount: computedRecord.total_travels || 0,
              cdoCount: computedRecord.total_cdo || 0,
              computestatus: computedRecord.computestatus,
              details: detailsResponse.data.success ? detailsResponse.data.data : [],
              status: 'Loaded from Database'
            });
            console.log(`✅ Added record for ${employee.NAME} with computeid: ${computedRecord.computeid}`);
          } else {
            console.log(`⚠️ No computed DTR found for ${employee.NAME}`);
            computedDtrArray.push({
              employeeId: employee.USERID,
              name: employee.NAME,
              department: employee.DEPARTMENT,
              position: employee.TITLE,
              photo_path: employee.photo_path || employee.PHOTO || null,
              objid: employee.objid,
              status: 'No computed DTR found'
            });
          }
        } catch (error) {
          console.error(`❌ Error fetching computed DTR for employee ${employee.USERID}:`, error);
          computedDtrArray.push({
            employeeId: employee.USERID,
            name: employee.NAME,
            department: employee.DEPARTMENT,
            position: employee.TITLE,
            photo_path: employee.photo_path || employee.PHOTO || null,
            objid: employee.objid,
            status: 'Error: ' + (error.response?.data?.message || error.message)
          });
        }
      }
      
      setComputedDtrData(computedDtrArray);
      const recordsWithComputeId = computedDtrArray.filter(emp => emp.computeid);
      console.log('✅ Computed DTR records fetched:', {
        total: computedDtrArray.length,
        withComputeId: recordsWithComputeId.length,
        withoutComputeId: computedDtrArray.length - recordsWithComputeId.length
      });
    } catch (error) {
      console.error('❌ Error fetching computed DTR records:', error);
      setComputedDtrData([]);
    } finally {
      setLoading(false);
    }
  }, [monthInfo, selectedPeriod, selectedEmployeesKey, departmentEmployees]);

  // Fetch data when period and employees change
  useEffect(() => {
    if (monthInfo && selectedPeriod && selectedDepartmentEmployees.size > 0 && departmentEmployees.length > 0) {
      console.log('🔄 RecomputedDTRAttendance: Triggering fetchComputedDtrRecords', {
        monthLabel: monthInfo.label,
        selectedPeriod,
        selectedEmployeesCount: selectedDepartmentEmployees.size,
        departmentEmployeesCount: departmentEmployees.length,
        selectedEmployeesKey
      });
      fetchComputedDtrRecords();
    } else {
      console.log('🔄 RecomputedDTRAttendance: Clearing data - conditions not met');
      setComputedDtrData([]);
    }
  }, [monthInfo, selectedPeriod, selectedEmployeesKey, departmentEmployees.length, fetchComputedDtrRecords]);

  const recomputeEmployeeRecord = async (employee) => {
    if (!monthInfo || !selectedPeriod) {
      throw new Error('Please select month and period');
    }

    if (!employee.objid || !employee.employeeId) {
      throw new Error('Employee data is incomplete');
    }

    console.log('🔄 Recomputing attendance for employee:', employee.name, employee.employeeId);

    // Get month range
    const { startDate, endDate } = getMonthRange(monthInfo, selectedPeriod);

    // Calculate attendance for this employee
    const response = await api.post('/compute-attendance/calculate', {
      userId: employee.employeeId,
      startDate: startDate,
      endDate: endDate
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to calculate attendance');
    }

    const metrics = response.data.data;

    const monthName = monthInfo.monthName;
    const computedYear = monthInfo.year;

    // Map period values
    const periodMap = {
      'full': 'Full Month',
      'first': '1st Half',
      'second': '2nd Half'
    };
    const periodValue = periodMap[selectedPeriod] || selectedPeriod;

    // Check if computed DTR exists
    const checkResponse = await api.get(`/computed-dtr/employee/${employee.objid}`, {
      params: {
        computedmonth: monthName,
        computedyear: computedYear,
        period: periodValue
      }
    });

    const existingRecord = checkResponse.data.success && checkResponse.data.data && checkResponse.data.data.length > 0
      ? checkResponse.data.data[0]
      : null;

    // Prepare details data
    const details = metrics.dailyData || [];

    const computedDtrData = {
      emp_objid: employee.objid,
      batchid: null,
      computedmonth: monthName,
      computedyear: computedYear,
      period: periodValue,
      total_lates: metrics.totalLates || 0,
      total_days: metrics.totalDays || 0,
      total_netdays: metrics.netDays || 0,
      total_cdo: metrics.cdoCount || 0,
      total_travels: metrics.travelsCount || 0,
      total_leaves: metrics.leavesCount || 0,
      total_fixtimes: 0,
      computeremarks: null,
      computestatus: existingRecord?.computestatus || 'For Approval',
      details: details
    };

    if (existingRecord) {
      await api.put(`/computed-dtr/${existingRecord.computeid}`, computedDtrData);
      console.log(`✅ Updated computed DTR for employee ${employee.employeeId}`);
    } else {
      await api.post('/computed-dtr', computedDtrData);
      console.log(`✅ Created computed DTR for employee ${employee.employeeId}`);
    }
  };

  // Handle individual employee recompute
  const handleIndividualRecompute = async (employee) => {
    try {
      setLoading(true);
      await recomputeEmployeeRecord(employee);
      await fetchComputedDtrRecords();
      alert(`Successfully recomputed attendance for ${employee.name}`);
    } catch (error) {
      console.error('❌ Error recomputing attendance:', error);
      alert('Error recomputing attendance: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRecomputeAllSelected = async () => {
    if (!monthInfo || !selectedPeriod) {
      alert('Please select month and period');
      return;
    }

    const employeesToProcess = displayData.filter(
      emp => emp.computeid && selectedDepartmentEmployees.has(emp.employeeId)
    );

    if (employeesToProcess.length === 0) {
      alert('No selected employees available for recomputation.');
      return;
    }

    if (!window.confirm(`Recompute DTR for ${employeesToProcess.length} selected employees?`)) {
      return;
    }

    setLoading(true);
    const results = { success: [], failed: [] };

    try {
      for (const employee of employeesToProcess) {
        try {
          await recomputeEmployeeRecord(employee);
          results.success.push(employee.name || employee.employeeId);
        } catch (err) {
          console.error(`❌ Error recomputing ${employee.name}:`, err);
          results.failed.push(`${employee.name || employee.employeeId}: ${err.message || 'Unknown error'}`);
        }
      }

      await fetchComputedDtrRecords();

      let message = '';
      if (results.success.length > 0) {
        message += `Successfully recomputed ${results.success.length} employees.`;
      }
      if (results.failed.length > 0) {
        message += `\nFailed: ${results.failed.length}.\n${results.failed.join('\n')}`;
      }

      alert(message || 'Recompute process completed.');
    } catch (error) {
      console.error('❌ Error during bulk recompute:', error);
      alert('Error during bulk recompute: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePrintComputedDtr = () => {
    alert('Print Computed DTR is not yet implemented.');
  };

  // Filter out records with no computed DTR for display
  const displayData = computedDtrData.filter(emp => emp.computeid);

  // Calculate totals
  const totals = useMemo(() => {
    const sum = displayData.reduce((acc, emp) => {
      const lates = Number(emp.lates) || 0;
      const days = Number(emp.days) || 0;
      const netDays = Number(emp.netDays) || 0;
      
      acc.totalLates += isNaN(lates) ? 0 : lates;
      acc.totalDays += isNaN(days) ? 0 : days;
      acc.totalNetDays += isNaN(netDays) ? 0 : netDays;
      acc.totalLocators += Number(emp.locatorsCount) || 0;
      acc.totalLeaves += Number(emp.leavesCount) || 0;
      acc.totalTravels += Number(emp.travelsCount) || 0;
      acc.totalCdo += Number(emp.cdoCount) || 0;
      return acc;
    }, {
      totalLates: 0,
      totalDays: 0,
      totalNetDays: 0,
      totalLocators: 0,
      totalLeaves: 0,
      totalTravels: 0,
      totalCdo: 0
    });
    
    return {
      totalLates: isNaN(sum.totalLates) ? 0 : sum.totalLates,
      totalDays: isNaN(sum.totalDays) ? 0 : sum.totalDays,
      totalNetDays: isNaN(sum.totalNetDays) ? 0 : Math.round(sum.totalNetDays * 10000) / 10000,
      totalLocators: isNaN(sum.totalLocators) ? 0 : sum.totalLocators,
      totalLeaves: isNaN(sum.totalLeaves) ? 0 : sum.totalLeaves,
      totalTravels: isNaN(sum.totalTravels) ? 0 : sum.totalTravels,
      totalCdo: isNaN(sum.totalCdo) ? 0 : sum.totalCdo
    };
  }, [displayData]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return displayData.slice(startIndex, endIndex);
  }, [displayData, currentPage, itemsPerPage]);

  // Calculate total pages
  useEffect(() => {
    const total = Math.ceil(displayData.length / itemsPerPage);
    setTotalPages(total);
    if (currentPage > total && total > 0) {
      setCurrentPage(1);
    }
  }, [displayData.length, itemsPerPage, currentPage]);

  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [displayData.length]);

  // Handle view details
  const handleViewDetails = async (record) => {
    if (!record || !record.employeeId) {
      return;
    }

    try {
      setModalLoading(true);
      setModalError('');
      setDetailsModalOpen(true);
      setSelectedRecord(record);
      setModalShiftSchedule(record.shiftSchedule || null);

      if (!monthInfo || !selectedPeriod) {
        setModalError('Please select a month and period to view logs.');
        setModalLogs([]);
        return;
      }

      const { startDate, endDate } = getMonthRange(monthInfo, selectedPeriod);
      setModalRange({ startDate, endDate });

      const shiftSchedulePromise = record.shiftSchedule
        ? Promise.resolve(record.shiftSchedule)
        : record.employeeId
        ? getEmployeeShiftSchedule(record.employeeId)
        : Promise.resolve(null);

      const [response, fetchedShiftSchedule] = await Promise.all([
        api.get('/compute-attendance/time-logs', {
          params: {
            userId: record.employeeId,
            startDate,
            endDate
          }
        }),
        shiftSchedulePromise
      ]);

      const logs = Array.isArray(response.data) ? response.data : [];
      setModalLogs(logs);
      setModalShiftSchedule(fetchedShiftSchedule || record.shiftSchedule || null);

      const monthOption = monthInfo ? monthInfo.label : '';
      const periodLabels = {
        'full': 'Full Month',
        'first': '1st Half',
        'second': '2nd Half'
      };
      setModalMeta({
        monthLabel: monthOption,
        periodLabel: periodLabels[selectedPeriod] || selectedPeriod
      });
    } catch (error) {
      console.error('❌ Error fetching details:', error);
      setModalError('Failed to load attendance details');
      setModalLogs([]);
      setModalShiftSchedule(null);
    } finally {
      setModalLoading(false);
    }
  };

  // Utility functions for fix modal
  const deriveFixLogDate = (row) => {
    if (!row) return null;
    const dateValue = row.date || row.DATE_RAW || row.DATE || '';
    if (!dateValue) return null;
    const dateStr = String(dateValue).trim();
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return isoMatch[0];
    }
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return null;
  };

  const normalizeFixTimeValue = (timeValue) => {
    if (!timeValue || timeValue === '-') return '';
    const trimmed = String(timeValue).trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
      const hour = String(parseInt(match[1], 10)).padStart(2, '0');
      const minute = match[2];
      return `${hour}:${minute}`;
    }
    return trimmed;
  };

  const extractTimeFromString = (value) => {
    if (!value) return '';
    if (/^\d{2}:\d{2}$/.test(value)) return value;
    if (typeof value === 'string') {
      const isoMatch = value.match(/T(\d{2}):(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[1]}:${isoMatch[2]}`;
      }
      const match = value.match(/(\d{2}):(\d{2})/);
      if (match) {
        return `${match[1]}:${match[2]}`;
      }
    }
    return '';
  };

  const extractTimeFromShiftField = (fieldValue) => {
    if (!fieldValue) return null;
    if (typeof fieldValue === 'string') {
      if (/^\d{2}:\d{2}$/.test(fieldValue)) return fieldValue;
      const match = fieldValue.match(/^(\d{2}):(\d{2})/);
      if (match) return `${match[1]}:${match[2]}`;
      return extractTimeFromString(fieldValue);
    }
    if (fieldValue instanceof Date) {
      const hours = String(fieldValue.getHours()).padStart(2, '0');
      const minutes = String(fieldValue.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return null;
  };

  const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  };

  const generateFilteredFixTimeOptions = (fieldName, shiftSchedule, currentLogValues = []) => {
    const options = [{ value: '', label: '-- Select Time --' }];
    const timeSet = new Set();
    
    let windowStart = null;
    let windowEnd = null;
    
    if (shiftSchedule) {
      switch (fieldName) {
        case 'am_checkin':
          windowStart = extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKIN_START);
          windowEnd = extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKIN_END);
          break;
        case 'am_checkout':
          windowStart = extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKOUT_START);
          windowEnd = extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKOUT_END);
          break;
        case 'pm_checkin':
          windowStart = extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKIN_START);
          windowEnd = extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKIN_END);
          break;
        case 'pm_checkout':
          windowStart = extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKOUT_START);
          windowEnd = extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKOUT_END);
          break;
      }
    }
    
    const windowStartMinutes = windowStart ? timeToMinutes(windowStart) : null;
    const windowEndMinutes = windowEnd ? timeToMinutes(windowEnd) : null;
    
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const hourStr = String(hour).padStart(2, '0');
        const minuteStr = String(minute).padStart(2, '0');
        const timeValue = `${hourStr}:${minuteStr}`;
        const timeMinutes = hour * 60 + minute;
        
        if (windowStartMinutes !== null && windowEndMinutes !== null) {
          if (timeMinutes >= windowStartMinutes && timeMinutes <= windowEndMinutes) {
            timeSet.add(timeValue);
            options.push({ value: timeValue, label: timeValue });
          }
        } else {
          timeSet.add(timeValue);
          options.push({ value: timeValue, label: timeValue });
        }
      }
    }
    
    currentLogValues.forEach((timeValue) => {
      if (timeValue && timeValue.trim() && !timeSet.has(timeValue)) {
        timeSet.add(timeValue);
        options.push({ value: timeValue, label: timeValue });
      }
    });
    
    const selectOption = options[0];
    const timeOptions = options.slice(1).sort((a, b) => {
      const [aHour, aMin] = a.value.split(':').map(Number);
      const [bHour, bMin] = b.value.split(':').map(Number);
      if (aHour !== bHour) return aHour - bHour;
      return aMin - bMin;
    });
    
    return [selectOption, ...timeOptions];
  };

  const formatLogDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const raw = String(dateStr).trim();
    const datePart = raw.split(/[T ]/)[0];

    const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      const weekday = utcDate.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
      return `${month}/${day}/${year}, ${weekday}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      const year = parsed.getFullYear();
      const weekday = parsed.toLocaleString('en-US', { weekday: 'short' });
      return `${month}/${day}/${year}, ${weekday}`;
    }

    return raw;
  };

  const getInitials = (value = '') => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return 'NA';
    const parts = cleaned.split(/\s+/);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    const first = parts[0][0] || '';
    const last = parts[parts.length - 1][0] || '';
    return (first + last).toUpperCase();
  };

  const handleFixLogRequest = (log) => {
    if (!log || !selectedRecord) return;
    openFixTimeModal(log);
  };

  // Fix modal handlers
  const openFixTimeModal = (row) => {
    if (!selectedRecord) {
      window.alert('Employee information is missing.');
      return;
    }
    
    const empObjId = selectedRecord.objid;
    if (!empObjId) {
      window.alert('Employee ObjID is required for Fix Time entry.');
      return;
    }
    
    const normalizedDate = deriveFixLogDate(row);
    if (!normalizedDate) {
      window.alert('Selected log does not have a valid date.');
      return;
    }
    
    // Transform row data to match FixTimeModal expected format
    const transformedRow = {
      normalizedDate,
      AM_CHECKIN: row.amCheckIn === '-' ? '' : row.amCheckIn,
      AM_CHECKOUT: row.amCheckOut === '-' ? '' : row.amCheckOut,
      PM_CHECKIN: row.pmCheckIn === '-' ? '' : row.pmCheckIn,
      PM_CHECKOUT: row.pmCheckOut === '-' ? '' : row.pmCheckOut,
      lateMinutes: row.lateMinutes || 0
    };
    
    setFixTimeModalRow(transformedRow);
    
    // Set form with normalized values
    setFixTimeForm({
      emp_objid: empObjId,
      checktimedate: normalizedDate,
      am_checkin: normalizeFixTimeValue(transformedRow.AM_CHECKIN),
      am_checkout: normalizeFixTimeValue(transformedRow.AM_CHECKOUT),
      pm_checkin: normalizeFixTimeValue(transformedRow.PM_CHECKIN),
      pm_checkout: normalizeFixTimeValue(transformedRow.PM_CHECKOUT),
      remarks: ''
    });
    
    setFixTimeExistingRecord(null);
    setFixTimeError('');
    setFixTimeModalOpen(true);
    loadExistingFixRecord(empObjId, normalizedDate);
  };

  const loadExistingFixRecord = async (empObjId, dateValue) => {
    if (!empObjId || !dateValue) return;
    setFixTimeLoading(true);
    try {
      const { data } = await api.get('/dtr-fix-checktime', {
        params: {
          emp_objid: empObjId,
          dateFrom: dateValue,
          dateTo: dateValue
        }
      });

      const record = Array.isArray(data?.data) ? data.data[0] : null;
      if (record) {
        setFixTimeExistingRecord(record);
        setFixTimeForm((prev) => ({
          ...prev,
          am_checkin: normalizeFixTimeValue(record.am_checkin) || prev.am_checkin,
          am_checkout: normalizeFixTimeValue(record.am_checkout) || prev.am_checkout,
          pm_checkin: normalizeFixTimeValue(record.pm_checkin) || prev.pm_checkin,
          pm_checkout: normalizeFixTimeValue(record.pm_checkout) || prev.pm_checkout,
          remarks: record.remarks || prev.remarks || ''
        }));
      } else {
        setFixTimeExistingRecord(null);
      }
    } catch (error) {
      console.error('Error loading fix record:', error);
      setFixTimeError('Failed to load existing fix log.');
    } finally {
      setFixTimeLoading(false);
    }
  };

  const handleFixFormChange = (e) => {
    const { name, value } = e.target;
    setFixTimeForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFixFormSubmit = async (e) => {
    e.preventDefault();
    if (!fixTimeForm.emp_objid || !fixTimeForm.checktimedate) {
      setFixTimeError('Employee ObjID and Fix Log Date are required.');
      return;
    }

    try {
      setFixTimeSaving(true);
      setFixTimeError('');
      const payload = {
        emp_objid: fixTimeForm.emp_objid,
        checktimedate: fixTimeForm.checktimedate,
        am_checkin: fixTimeForm.am_checkin || null,
        am_checkout: fixTimeForm.am_checkout || null,
        pm_checkin: fixTimeForm.pm_checkin || null,
        pm_checkout: fixTimeForm.pm_checkout || null,
        remarks: fixTimeForm.remarks || null,
        fixstatus: fixTimeExistingRecord?.fixstatus || 'For Approval'
      };

      if (fixTimeExistingRecord?.fixid) {
        await api.put(`/dtr-fix-checktime/${fixTimeExistingRecord.fixid}`, payload);
      } else {
        await api.post('/dtr-fix-checktime', payload);
      }

      closeFixTimeModal();
      // Optionally refresh the modal logs to show updated data
      if (selectedRecord && modalRange.startDate && modalRange.endDate) {
        // Refresh logs after fix
        const response = await api.get('/compute-attendance/time-logs', {
          params: {
            userId: selectedRecord.employeeId,
            startDate: modalRange.startDate,
            endDate: modalRange.endDate
          }
        });
        const logs = Array.isArray(response.data) ? response.data : [];
        setModalLogs(logs);
      }
    } catch (err) {
      console.error('Error saving fix log:', err);
      setFixTimeError(err.response?.data?.message || 'Failed to save fix log.');
    } finally {
      setFixTimeSaving(false);
    }
  };

  const closeFixTimeModal = () => {
    setFixTimeModalOpen(false);
    setFixTimeModalRow(null);
    setFixTimeExistingRecord(null);
    setFixTimeForm({
      emp_objid: '',
      checktimedate: '',
      am_checkin: '',
      am_checkout: '',
      pm_checkin: '',
      pm_checkout: '',
      remarks: ''
    });
    setFixTimeError('');
    setFixTimeLoading(false);
    setFixTimeSaving(false);
  };

  // Handle delete
  const handleDeleteComputedDtr = async (record) => {
    if (!record.computeid) {
      alert('Cannot delete: No compute ID found');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the computed DTR for ${record.name}?`)) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/computed-dtr/${record.computeid}`);
      
      setComputedDtrData(prev => prev.filter(emp => emp.computeid !== record.computeid));
      await fetchComputedDtrRecords();
      
      alert(`Successfully deleted computed DTR for ${record.name}`);
    } catch (error) {
      console.error('❌ Error deleting computed DTR:', error);
      alert('Error deleting computed DTR: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Handle items per page change
  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <div className="p-6 min-h-screen bg-red-50">
      <div className="max-w-7xl mx-auto bg-white bg-opacity-95 p-6 rounded-lg shadow-sm">
        {/* Back button */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-green-700">Recompute DTR</h2>
        </div>

        <div className="mb-4 text-sm text-gray-600 hidden">
          <span className="font-semibold text-gray-800">Process Mode:</span> {processMode || '—'} ·{' '}
          <span className="font-semibold text-gray-800">Selected Month:</span>{' '}
          {monthInfo ? monthInfo.label : '—'}
        </div>

        {/* Step 2: Department, Appointment, and Employee Status Filters */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Filter Employees</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a department...</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Appointment
              </label>
              <select
                value={selectedAppointment}
                onChange={(e) => setSelectedAppointment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Appointments</option>
                {appointmentTypes.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.appointmentname}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employee Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {employeeStatusTypes.map((status) => (
                  <option key={status.empstatid || status.id} value={status.empstatid || status.id}>
                    {status.empstatname || status.employeestatus}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Step 3: Period Control */}
        {departmentEmployees.length > 0 && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 3: Select Period</h2>
            {loadingPeriods && (
              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Checking existing periods...</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Period
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="" disabled>
                  Select a Period
                </option>
                {getPeriodOptions().map((option) => (
                  <option 
                    key={option.value} 
                    value={option.value}
                    disabled={option.disabled}
                    style={option.disabled ? { color: '#9ca3af', backgroundColor: '#f3f4f6' } : {}}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 4: Employee Selection */}
        {selectedPeriod && departmentEmployees.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 4: Select Employees</h2>
            <div className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => setShowEmployeeSelector((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg transition-colors"
              >
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Select Employees ({departmentEmployees.length} found)
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedDepartmentEmployees.size} of {departmentEmployees.length} selected
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  {showEmployeeSelector ? 'Hide' : 'Show'}
                  <svg
                    className={`w-4 h-4 transform transition-transform ${showEmployeeSelector ? 'rotate-180' : 'rotate-0'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {showEmployeeSelector && (
                <div className="p-4 space-y-4">
                  {loadingDepartmentEmployees && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span>Loading employees...</span>
                    </div>
                  )}

                  {/* Employee Search Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Employees
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={departmentEmployeeSearchTerm}
                        onChange={(e) => setDepartmentEmployeeSearchTerm(e.target.value)}
                        placeholder="Search by name or badge number..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                    {departmentEmployeeSearchTerm && (
                      <p className="text-sm text-gray-500 mt-1">
                        Showing {filteredDepartmentEmployees.length} of {departmentEmployees.length} employees
                      </p>
                    )}
                  </div>

                  {/* Select All Controls */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="selectAllDepartment"
                        checked={
                          departmentEmployees.length > 0 &&
                          departmentEmployees
                            .filter(emp => {
                              // Recompute mode: Only show employees WITH records for selected period
                              if (selectedPeriod === 'full') {
                                return existingPeriods['Full Month'].has(emp.objid);
                              } else if (selectedPeriod === 'first') {
                                return existingPeriods['1st Half'].has(emp.objid);
                              } else if (selectedPeriod === 'second') {
                                return existingPeriods['2nd Half'].has(emp.objid);
                              }
                              return false;
                            })
                            .every(emp => selectedDepartmentEmployees.has(emp.USERID))
                        }
                        onChange={handleSelectAllDepartmentEmployees}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="selectAllDepartment" className="ml-2 text-sm font-medium text-gray-700">
                        Select All Available Employees
                      </label>
                      {(() => {
                        const disabledCount = selectedPeriod === 'full' 
                          ? departmentEmployees.filter(emp => !existingPeriods['Full Month'].has(emp.objid)).length
                          : selectedPeriod === 'first'
                          ? departmentEmployees.filter(emp => !existingPeriods['1st Half'].has(emp.objid)).length
                          : selectedPeriod === 'second'
                          ? departmentEmployees.filter(emp => !existingPeriods['2nd Half'].has(emp.objid)).length
                          : 0;
                        return disabledCount > 0 && (
                          <span className="text-xs text-gray-500 ml-2">
                            ({disabledCount} excluded)
                          </span>
                        );
                      })()}
                    </div>
                    {departmentEmployeeSearchTerm && filteredDepartmentEmployees.length > 0 && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="selectAllFiltered"
                          checked={filteredDepartmentEmployees.length > 0 && 
                            filteredDepartmentEmployees.every(emp => selectedDepartmentEmployees.has(emp.USERID))}
                          onChange={handleSelectAllFilteredEmployees}
                          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <label htmlFor="selectAllFiltered" className="ml-2 text-sm font-medium text-gray-700">
                          Select Filtered ({filteredDepartmentEmployees.length} employees)
                        </label>
                      </div>
                    )}
                    <span className="text-sm text-gray-500">
                      {selectedDepartmentEmployees.size} selected
                    </span>
                  </div>

                  {/* Employee List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
                    {filteredDepartmentEmployees.map((employee) => {
                      // Check if employee should be disabled based on selected period
                      // Recompute mode: Disable if employee does NOT have record for selected period
                      let isDisabled = false;
                      let disabledReason = '';
                      
                      if (selectedPeriod === 'full') {
                        if (!existingPeriods['Full Month'].has(employee.objid)) {
                          isDisabled = true;
                          disabledReason = 'No existing Full Month record';
                        }
                      } else if (selectedPeriod === 'first') {
                        if (!existingPeriods['1st Half'].has(employee.objid)) {
                          isDisabled = true;
                          disabledReason = 'No existing 1st Half record';
                        }
                      } else if (selectedPeriod === 'second') {
                        if (!existingPeriods['2nd Half'].has(employee.objid)) {
                          isDisabled = true;
                          disabledReason = 'No existing 2nd Half record';
                        }
                      }
                      
                      return (
                        <div
                          key={employee.USERID}
                          className={`p-3 border rounded-lg transition-colors ${
                            isDisabled
                              ? 'border-gray-300 bg-gray-100 opacity-60 cursor-not-allowed'
                              : selectedDepartmentEmployees.has(employee.USERID)
                              ? 'border-blue-500 bg-blue-50 cursor-pointer'
                              : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (!isDisabled) {
                              handleDepartmentEmployeeSelect(employee.USERID);
                            }
                          }}
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={!isDisabled && selectedDepartmentEmployees.has(employee.USERID)}
                              onChange={() => {
                                if (!isDisabled) {
                                  handleDepartmentEmployeeSelect(employee.USERID);
                                }
                              }}
                              disabled={isDisabled}
                              className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${
                                isDisabled ? 'cursor-not-allowed opacity-50' : ''
                              }`}
                            />
                            <div className="ml-3 flex-1 flex items-center space-x-2">
                              {employee.photo_path && (
                                <img 
                                  src={employee.photo_path} 
                                  alt={employee.NAME}
                                  className="w-8 h-8 rounded-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <p className={`text-sm font-medium ${
                                    isDisabled ? 'text-gray-500' : 'text-gray-900'
                                  }`}>
                                    {employee.NAME}
                                  </p>
                                  {isDisabled && (
                                    <span
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200"
                                      title={disabledReason || 'Unavailable'}
                                    >
                                      {disabledReason || (selectedPeriod ? 'Excluded' : 'Computed')}
                                    </span>
                                  )}
                                </div>
                                {employee.DEPARTMENT && employee.TITLE && (
                                  <p className={`text-xs ${
                                    isDisabled ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    {employee.DEPARTMENT} - {employee.TITLE}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Grid Display */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading computed DTR records...</span>
          </div>
        )}

        {!loading && displayData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Show:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-500">records</span>
                </div>
                <div className="text-sm text-gray-700">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, displayData.length)} of {displayData.length} entries
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRecomputeAllSelected}
                  disabled={loading || selectedDepartmentEmployees.size === 0 || displayData.length === 0}
                  className="inline-flex items-center px-4 py-2 border border-green-600 text-green-700 hover:bg-green-50 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔁 Recompute All
                </button>
                <button
                  type="button"
                  onClick={handlePrintComputedDtr}
                  disabled={loading || displayData.length === 0}
                  className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 hover:bg-blue-50 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Print Computed DTR"
                >
                  🖨️
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      No.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Leaves
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Locators
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Travels
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CDO
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lates
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      Net Days
                    </th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((emp, index) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                    const deptPosition = [emp.department, emp.position].filter(Boolean).join(' - ') || '—';
                    return (
                      <tr key={emp.computeid ?? emp.employeeId ?? rowNumber} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {rowNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-semibold text-gray-900">{emp.name || '—'}</div>
                          <div className="text-xs text-gray-500">{deptPosition}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                            {emp.leavesCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {emp.locatorsCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            {emp.travelsCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                            {emp.cdoCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {Math.round(Number(emp.lates || 0))}
                        </td>
                        <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-900">
                          {Number(emp.days) || 0}
                        </td>
                        <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-900 w-20">
                          {Number(emp.netDays ?? 0).toFixed(4)}
                        </td>
                        <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[150px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewDetails(emp)}
                              className="text-blue-600 hover:text-blue-800 transition-colors text-lg"
                              title="View Attendance"
                            >
                              👁️
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await handleIndividualRecompute(emp);
                              }}
                              className="text-green-600 hover:text-green-800 transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Recompute Attendance"
                              disabled={loading}
                            >
                              🔄
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComputedDtr(emp)}
                              className="text-red-600 hover:text-red-800 transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete Attendance"
                              disabled={loading}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals Footer */}
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan="2" className="px-6 py-4 text-sm font-bold text-gray-900">
                      TOTALS
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                        {totals.totalLeaves}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {totals.totalLocators}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        {totals.totalTravels}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                        {totals.totalCdo}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {Math.round(Number(totals.totalLates || 0))}
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {Number(totals.totalDays || 0).toFixed(3)}
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap text-xs font-semibold text-gray-900 w-20">
                      {Number(totals.totalNetDays || 0).toFixed(4)}
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[150px]">
                      {/* Empty cell for alignment */}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination Controls - Bottom */}
            {displayData.length > 0 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-center">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {/* Page Numbers */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-1 text-sm border rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && displayData.length === 0 && selectedPeriod && selectedDepartmentEmployees.size > 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No computed DTR records found for the selected employees and period.</p>
          </div>
        )}

        {!loading && !selectedPeriod && (
          <div className="text-center py-8 text-gray-500">
            <p>Please select a period to view computed DTR records.</p>
          </div>
        )}

        {!loading && selectedPeriod && selectedDepartmentEmployees.size === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>Please select employees to view computed DTR records.</p>
          </div>
        )}

        {/* Details Modal */}
        {detailsModalOpen && selectedRecord && (
          <ComputedAttendanceModal
            isOpen={detailsModalOpen}
            onClose={() => {
              setDetailsModalOpen(false);
              setSelectedRecord(null);
              setModalLogs([]);
              setModalRange({ startDate: '', endDate: '' });
              setModalShiftSchedule(null);
              setModalError('');
            }}
            employee={selectedRecord}
            monthLabel={modalMeta.monthLabel}
            periodLabel={modalMeta.periodLabel}
            logs={modalLogs}
            dateRange={modalRange}
            shiftSchedule={modalShiftSchedule}
            loading={modalLoading}
            error={modalError}
            onFixLog={handleFixLogRequest}
          />
        )}
        <FixTimeModal
          isOpen={fixTimeModalOpen}
          onClose={closeFixTimeModal}
          employee={selectedRecord}
          row={fixTimeModalRow}
          form={fixTimeForm}
          onChange={handleFixFormChange}
          onSubmit={handleFixFormSubmit}
          loading={fixTimeLoading}
          saving={fixTimeSaving}
          error={fixTimeError}
          existingRecord={fixTimeExistingRecord}
          shiftSchedule={modalShiftSchedule}
        />
      </div>
    </div>
  );
};

export default RecomputedDTRAttendance;
    