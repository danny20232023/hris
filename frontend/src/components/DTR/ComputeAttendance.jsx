import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../utils/api';
import { formatEmployeeName } from '../../utils/employeenameFormatter';
import { getEmployeeShiftSchedule } from '../../utils/shiftScheduleUtils';
import ComputedAttendanceModal from './ComputedAttendanceModal.jsx';
import RecomputedDTRAttendance from './recomputedDTRAttendance.jsx';
import FixTimeModal from './FixTimeModal.jsx';
import { usePermissions } from '../../hooks/usePermissions';

const ComputeAttendance = () => {
  const { can, canAccessPage, isRootAdmin, loading: permissionsLoading } = usePermissions();
  const canViewComputeAttendance = canAccessPage('compute-attendance') || isRootAdmin;
  const canReadComputeAttendance = isRootAdmin || can('compute-attendance', 'read');
  const canProcessAttendance = isRootAdmin || can('compute-attendance', 'update');
  const canDownloadAttendance = isRootAdmin || can('compute-attendance', 'print');
  const canOpenFixModal = isRootAdmin || can('fix-dtr-checktime', 'update');
  const canDeleteAttendance = isRootAdmin || can('compute-attendance', 'delete');
  const canViewRecomputeTab = isRootAdmin || canAccessPage('recomputed-dtr');
  const canRecompute = isRootAdmin || can('recomputed-dtr', 'update');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [employeeStatusTypes, setEmployeeStatusTypes] = useState([]);
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('1');
  const [selectedAppointment, setSelectedAppointment] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(false);

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

  // Modal state for viewing detailed logs
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedAttendanceRecord, setSelectedAttendanceRecord] = useState(null);
  const [modalLogs, setModalLogs] = useState([]);
  const [modalRange, setModalRange] = useState({ startDate: '', endDate: '' });
  const [modalShiftSchedule, setModalShiftSchedule] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalMeta, setModalMeta] = useState({ monthLabel: '', periodLabel: '' });

  // Fix modal state
  const [fixTimeModalOpen, setFixTimeModalOpen] = useState(false);
  if (!permissionsLoading && !canViewComputeAttendance) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        You do not have permission to access Compute Attendance.
      </div>
    );
  }
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  // State for all employees (from MySQL)
  const [allEmployees, setAllEmployees] = useState([]);

  // State for tracking employees with computed DTR
  const [employeesWithComputedDtr, setEmployeesWithComputedDtr] = useState(new Set());
  const [loadingComputedDtr, setLoadingComputedDtr] = useState(false);

  // State for view mode (Compute or Recompute)
  const [viewMode, setViewMode] = useState('compute'); // 'compute' or 'recompute'

  // State for UI flow control
  const [hasProceeded, setHasProceeded] = useState(false);
  
  // State for period checking
  const [existingPeriods, setExistingPeriods] = useState({
    '1st Half': new Set(),
    'Full Month': new Set(),
    '2nd Half': new Set()
  });
  const [isPeriodControlDisabled, setIsPeriodControlDisabled] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // Generate month options (last 2 years to current month) - SORTED IN DESCENDING ORDER
  const monthOptions = useMemo(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const months = [];
    
    for (let year = currentYear - 2; year <= currentYear; year++) {
      const maxMonth = year === currentYear ? currentMonth : 12;
      for (let month = 1; month <= maxMonth; month++) {
        const date = new Date(year, month - 1, 1);
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const value = `${year}-${String(month).padStart(2, '0')}-01`;
        months.push({ value, label: `${monthName} ${year}` });
      }
    }
    
    return months.sort((a, b) => new Date(b.value) - new Date(a.value));
  }, []);

  // Set default selected month to current month
  useEffect(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const defaultMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    setSelectedMonth(defaultMonth);
  }, []);

  // Fetch all employees from MySQL (same as GenerateDTRReport)
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
    } catch (error) {
      console.error('❌ Error fetching department employees:', error);
    } finally {
      setLoadingDepartmentEmployees(false);
    }
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
    
    // Filter out disabled employees based on selected period (same logic as checkbox checked state)
    const availableEmployees = departmentEmployees.filter(emp => {
      // Filter out disabled employees based on selected period
      if (selectedPeriod === 'full') {
        return !existingPeriods['1st Half'].has(emp.objid) &&
               !existingPeriods['Full Month'].has(emp.objid) &&
               !existingPeriods['2nd Half'].has(emp.objid);
      } else if (selectedPeriod === 'first') {
        // 1st Half: 
        // - In compute mode: Exclude if employee has 1st Half record
        // - In recompute mode: Exclude if employee has NO 1st Half record (need existing record to recompute)
        const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
        
        if (viewMode === 'compute') {
          // Compute mode: Exclude if employee has 1st Half record
          return !hasFirstHalf;
    } else {
          // Recompute mode: Exclude if employee has NO 1st Half record (can't recompute what doesn't exist)
          return hasFirstHalf;
        }
      } else if (selectedPeriod === 'second') {
        // 2nd Half: 
        // - In compute mode: Exclude if employee has NO 1st Half record OR has 2nd Half record
        // - In recompute mode: Exclude if employee has 2nd Half record
        const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
        const hasSecondHalf = existingPeriods['2nd Half'].has(emp.objid);
        
        if (viewMode === 'compute') {
          // Compute mode: Exclude if no 1st Half record OR has 2nd Half record
          return hasFirstHalf && !hasSecondHalf;
        } else {
          // Recompute mode: Exclude if employee has 2nd Half record
          return !hasSecondHalf;
        }
      }
      // If no period selected, use old logic
      return !employeesWithComputedDtr.has(emp.objid);
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
    
    // Filter out disabled employees based on selected period
    const availableFilteredEmployees = filteredDepartmentEmployees.filter(emp => {
      if (selectedPeriod === 'full') {
        return !existingPeriods['1st Half'].has(emp.objid) &&
               !existingPeriods['Full Month'].has(emp.objid) &&
               !existingPeriods['2nd Half'].has(emp.objid);
      } else if (selectedPeriod === 'first') {
        // 1st Half: 
        // - In compute mode: Exclude if employee has 1st Half record
        // - In recompute mode: Exclude if employee has NO 1st Half record (need existing record to recompute)
        const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
        
        if (viewMode === 'compute') {
          // Compute mode: Exclude if employee has 1st Half record
          return !hasFirstHalf;
        } else {
          // Recompute mode: Exclude if employee has NO 1st Half record (can't recompute what doesn't exist)
          return hasFirstHalf;
        }
      } else if (selectedPeriod === 'second') {
        // 2nd Half: 
        // - In compute mode: Exclude if employee has NO 1st Half record OR has 2nd Half record
        // - In recompute mode: Exclude if employee has 2nd Half record
        const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
        const hasSecondHalf = existingPeriods['2nd Half'].has(emp.objid);
        
        if (viewMode === 'compute') {
          // Compute mode: Exclude if no 1st Half record OR has 2nd Half record
          return hasFirstHalf && !hasSecondHalf;
        } else {
          // Recompute mode: Exclude if employee has 2nd Half record
          return !hasSecondHalf;
        }
      }
      // If no period selected, use old logic
      return !employeesWithComputedDtr.has(emp.objid);
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
      console.log('✅ Selecting all available filtered employees (excluding disabled)');
      const newSelected = new Set(selectedDepartmentEmployees);
      filteredEmployeeIds.forEach(id => newSelected.add(id));
      setSelectedDepartmentEmployees(newSelected);
    }
  };

  // Helper function to get month range based on period
  const getMonthRange = (monthString, period = 'full') => {
    const [year, month] = monthString.split('-');
    
    let startDate, endDate;
    
    if (period === 'full') {
      startDate = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    } else if (period === 'first') {
      startDate = `${year}-${month}-01`;
      endDate = `${year}-${month}-15`;
    } else if (period === 'second') {
      startDate = `${year}-${month}-16`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    }
    
    console.log('📅 Period range calculated:', { period, startDate, endDate });
    return { startDate, endDate };
  };

  // Fetch employees with computed DTR for selected month/year/period
  const fetchComputedDtrEmployees = async () => {
    if (!selectedMonth || !selectedPeriod) {
      setEmployeesWithComputedDtr(new Set());
      return;
    }
    
    try {
      setLoadingComputedDtr(true);
      
      // Extract month name and year from selectedMonth
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' }); // e.g., "January"
      const computedYear = parseInt(year);
      
      console.log('🔄 Checking computed DTR for:', { monthName, computedYear, period: selectedPeriod });
      
      const response = await api.get('/compute-attendance/check-computed-dtr', {
        params: {
          computedmonth: monthName,
          computedyear: computedYear,
          period: selectedPeriod
        }
      });
      
      if (response.data.success) {
        // Convert array of emp_objid to Set for fast lookup
        const empObjIdSet = new Set(response.data.empObjIds);
        setEmployeesWithComputedDtr(empObjIdSet);
        console.log(`✅ Found ${empObjIdSet.size} employees with computed DTR`);
      } else {
        setEmployeesWithComputedDtr(new Set());
      }
    } catch (error) {
      console.error('❌ Error fetching computed DTR:', error);
      setEmployeesWithComputedDtr(new Set());
    } finally {
      setLoadingComputedDtr(false);
    }
  };

  // Calculate attendance for department
  const calculateDepartmentAttendance = async () => {
    try {
      setLoading(true);
      console.log('🔍 Calculating attendance for department:', selectedDepartment);
      console.log('🔍 Selected month:', selectedMonth);
      console.log('🔍 Selected period:', selectedPeriod);
      
      // Get selected employees from the checkbox selection
      const selectedEmployeeIds = Array.from(selectedDepartmentEmployees);
      const currentEmployees = departmentEmployees.filter(emp => selectedEmployeeIds.includes(emp.USERID));
      
      // Filter employees based on selected period:
      // - Full Month: Only show employees with NO records for Full Month, 1st Half, AND 2nd Half
      // - 1st Half: Only show employees with NO 1st Half record
      // - 2nd Half: Only show employees with NO 2nd Half record
      const employeesToProcess = currentEmployees.filter(emp => {
        let shouldExclude = false;
        let exclusionReason = '';
        
        if (selectedPeriod === 'full') {
          // Full Month: Exclude if employee has ANY period (Full Month, 1st Half, or 2nd Half)
          const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
          const hasFullMonth = existingPeriods['Full Month'].has(emp.objid);
          const hasSecondHalf = existingPeriods['2nd Half'].has(emp.objid);
          
          if (hasFirstHalf || hasFullMonth || hasSecondHalf) {
            shouldExclude = true;
            const periods = [];
            if (hasFirstHalf) periods.push('1st Half');
            if (hasFullMonth) periods.push('Full Month');
            if (hasSecondHalf) periods.push('2nd Half');
            exclusionReason = `has existing records: ${periods.join(', ')}`;
          }
        } else if (selectedPeriod === 'first') {
          // 1st Half: 
          // - In compute mode: Exclude if employee has 1st Half record
          // - In recompute mode: Exclude if employee has NO 1st Half record (need existing record to recompute)
          const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
          
          if (viewMode === 'compute') {
            // Compute mode: Exclude if employee has 1st Half record
            if (hasFirstHalf) {
              shouldExclude = true;
              exclusionReason = 'has existing 1st Half record';
            }
          } else {
            // Recompute mode: Exclude if employee has NO 1st Half record (can't recompute what doesn't exist)
            if (!hasFirstHalf) {
              shouldExclude = true;
              exclusionReason = 'has no existing 1st Half record to recompute';
            }
          }
        } else if (selectedPeriod === 'second') {
          // 2nd Half: 
          // - In compute mode: Exclude if employee has NO 1st Half record OR has 2nd Half record
          // - In recompute mode: Exclude if employee has 2nd Half record
          const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
          const hasSecondHalf = existingPeriods['2nd Half'].has(emp.objid);
          
          if (viewMode === 'compute') {
            // Compute mode: Exclude if no 1st Half record OR has 2nd Half record
            if (!hasFirstHalf || hasSecondHalf) {
              shouldExclude = true;
              if (!hasFirstHalf) {
                exclusionReason = 'has no existing 1st Half record (2nd Half requires 1st Half)';
              } else if (hasSecondHalf) {
                exclusionReason = 'has existing 2nd Half record';
              }
            }
          } else {
            // Recompute mode: Exclude if employee has 2nd Half record
            if (hasSecondHalf) {
              shouldExclude = true;
              exclusionReason = 'has existing 2nd Half record';
            }
          }
        }
        
        if (shouldExclude) {
          console.log(`⏭️ Skipping employee ${emp.USERID} (${emp.NAME}) - ${exclusionReason}`);
        }
        
        return !shouldExclude;
      });
      
      console.log('🔍 Current employees to process:', employeesToProcess.length, 'out of', currentEmployees.length);
      console.log('🔍 Filtered employees:', employeesToProcess.map(emp => ({ USERID: emp.USERID, NAME: emp.NAME })));
      
      const attendanceDataArray = [];
      
      // Get month range based on selected period
      const { startDate, endDate } = getMonthRange(selectedMonth, selectedPeriod);
      console.log('📅 Processing period range:', { startDate, endDate });
      
      // Process each employee individually to ensure all are processed
      for (let i = 0; i < employeesToProcess.length; i++) {
        const employee = employeesToProcess[i];
        console.log(`🔄 Processing employee ${i + 1}/${employeesToProcess.length}:`, employee.USERID, employee.NAME);
        
        // Initialize attendance record with default values
        let attendanceRecord = {
          employeeId: employee.USERID,
          objid: employee.objid, // Required for processing computed DTR
          name: employee.NAME,
          department: employee.DEPARTMENT,
          position: employee.TITLE,
          photo_path: employee.photo_path || employee.PHOTO || null,
          surname: employee.surname,
          firstname: employee.firstname,
          middlename: employee.middlename,
          extension: employee.extension,
          shiftSchedule: null,
          lates: 0,
          days: 0,
          netDays: 0,
          equivalentDaysDeducted: 0,
          locatorsCount: 0,
          leavesCount: 0,
          travelsCount: 0,
          cdoCount: 0,
          status: 'Processing'
        };

        try {
          console.log('🔄 Calling API for employee:', employee.USERID, employee.NAME);
          // Use the ComputeAttendance API (shift schedule fetched in backend)
          const response = await api.post('/compute-attendance/calculate', {
            userId: employee.USERID,
            startDate: startDate,
            endDate: endDate
          });

          console.log('✅ API response for employee:', employee.USERID, response.data);

          if (response.data.success) {
            const metrics = response.data.data;
            attendanceRecord = {
              ...attendanceRecord,
              lates: metrics.totalLates,
              days: metrics.totalDays,
              netDays: metrics.netDays,
              equivalentDaysDeducted: metrics.equivalentDaysDeducted,
              locatorsCount: metrics.locatorsCount,
              leavesCount: metrics.leavesCount,
              travelsCount: metrics.travelsCount,
              cdoCount: metrics.cdoCount ?? 0,
              shiftSchedule: response.data.shiftSchedule || null,
              dailyData: metrics.dailyData || [], // Store daily time log data for details
              status: 'Calculated'
            };
            console.log('✅ Added attendance record:', attendanceRecord);
          } else {
            console.log('⚠️ API returned success: false for employee:', employee.USERID, response.data);
            attendanceRecord.status = response.data.message || 'API Error';
          }
        } catch (error) {
          console.error(`❌ Error calculating attendance for employee ${employee.USERID}:`, error);
          attendanceRecord.status = 'Error: ' + (error.response?.data?.message || error.message);
        }

        // Always add the attendance record, regardless of success or failure
        attendanceDataArray.push(attendanceRecord);
        console.log('✅ Added attendance record for employee:', employee.USERID, attendanceRecord);
      }
      
      setAttendanceData(attendanceDataArray);
      console.log('✅ Department attendance data fetched:', attendanceDataArray.length);
    } catch (error) {
      console.error('❌ Error calculating department attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch computed DTR data for Recompute mode
  const fetchComputedDtrData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching computed DTR data for Recompute mode');
      
      if (!selectedMonth || !selectedPeriod) {
        setAttendanceData([]);
        return;
      }
      
      // Extract month name and year from selectedMonth
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
      const computedYear = parseInt(year);
      
      // Map period values
      const periodMap = {
        'full': 'Full Month',
        'first': '1st Half',
        'second': '2nd Half'
      };
      const periodValue = periodMap[selectedPeriod] || selectedPeriod;
      
      // Get selected employees
      const selectedEmployeeIds = Array.from(selectedDepartmentEmployees);
      const currentEmployees = departmentEmployees.filter(emp => selectedEmployeeIds.includes(emp.USERID));
      
      const attendanceDataArray = [];
      
      // Fetch computed DTR for each selected employee
      for (const employee of currentEmployees) {
        try {
          const response = await api.get(`/computed-dtr/employee/${employee.objid}`, {
            params: {
              computedmonth: monthName,
              computedyear: computedYear,
              period: periodValue
            }
          });
          
          if (response.data.success && response.data.data && response.data.data.length > 0) {
            const computedRecord = response.data.data[0]; // Get the most recent one
            
            // Fetch details for this computeid
            const detailsResponse = await api.get(`/computed-dtr/${computedRecord.computeid}/details`);
            
            attendanceDataArray.push({
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
              locatorsCount: 0, // Not stored in computed DTR
              leavesCount: computedRecord.total_leaves || 0,
              travelsCount: computedRecord.total_travels || 0,
              cdoCount: computedRecord.total_cdo || 0,
              computestatus: computedRecord.computestatus,
              details: detailsResponse.data.success ? detailsResponse.data.data : [],
              status: 'Loaded from Database'
            });
          } else {
            // No computed DTR found for this employee
            attendanceDataArray.push({
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
          attendanceDataArray.push({
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
      
      setAttendanceData(attendanceDataArray);
      console.log('✅ Computed DTR data fetched:', attendanceDataArray.length);
    } catch (error) {
      console.error('❌ Error fetching computed DTR data:', error);
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  };

  // Process attendance - Save/Update computed DTR records
  const handleProcessAttendance = async () => {
    try {
      if (!attendanceData || attendanceData.length === 0) {
        alert('No attendance data to process');
        return;
      }
      
      if (!selectedMonth || !selectedPeriod) {
        alert('Please select month and period');
        return;
      }
      
      // Extract month name and year
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
      const computedYear = parseInt(year);
      
      // Map period values
      const periodMap = {
        'full': 'Full Month',
        'first': '1st Half',
        'second': '2nd Half'
      };
      const periodValue = periodMap[selectedPeriod] || selectedPeriod;
      
      setLoading(true);
      
      // Process only employees with successful computations
      const successfulRecords = attendanceData.filter(emp => 
        emp.status === 'Calculated' && emp.days !== undefined
      );
      
      if (successfulRecords.length === 0) {
        alert('No successful attendance calculations to process');
        setLoading(false);
        return;
      }
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Process each employee
      for (const record of successfulRecords) {
        try {
          // Check if computed DTR already exists
          const checkResponse = await api.get(`/computed-dtr/employee/${record.objid}`, {
            params: {
              computedmonth: monthName,
              computedyear: computedYear,
              period: periodValue
            }
          });
          
          const existingRecord = checkResponse.data.success && checkResponse.data.data && checkResponse.data.data.length > 0
            ? checkResponse.data.data[0]
            : null;
          
          // Prepare details data from daily time logs
          const details = record.dailyData || [];
          
          const computedDtrData = {
            emp_objid: record.objid,
            batchid: null,
            computedmonth: monthName,
            computedyear: computedYear,
            period: periodValue,
            total_lates: record.lates || 0,
            total_days: record.days || 0,
            total_netdays: record.netDays || 0,
            total_cdo: record.cdoCount || 0,
            total_travels: record.travelsCount || 0,
            total_leaves: record.leavesCount || 0,
            total_fixtimes: 0, // Would need to be calculated
            computeremarks: null,
            computestatus: 'For Approval',
            details: details
          };
          
          if (existingRecord) {
            // Update existing record
            await api.put(`/computed-dtr/${existingRecord.computeid}`, computedDtrData);
            console.log(`✅ Updated computed DTR for employee ${record.employeeId}`);
          } else {
            // Create new record
            await api.post('/computed-dtr', computedDtrData);
            console.log(`✅ Created computed DTR for employee ${record.employeeId}`);
          }
          
          processedCount++;
        } catch (error) {
          console.error(`❌ Error processing attendance for employee ${record.employeeId}:`, error);
          errorCount++;
        }
      }
      
      alert(`Processed ${processedCount} employees successfully${errorCount > 0 ? `. ${errorCount} errors occurred.` : '.'}`);
      
      // Refresh computed DTR employees list
      await fetchComputedDtrEmployees();
      
      // Filter out employees that were just processed from the grid
      // Get the objids of successfully processed employees
      const processedObjIds = new Set(successfulRecords.map(record => record.objid));
      
      // Remove processed employees from the grid
      const updatedAttendanceData = attendanceData.filter(emp => {
        const wasProcessed = processedObjIds.has(emp.objid);
        if (wasProcessed) {
          console.log(`🗑️ Removing ${emp.name} (${emp.employeeId}) from grid - already processed`);
        }
        return !wasProcessed;
      });
      
      setAttendanceData(updatedAttendanceData);
      console.log(`✅ Grid refreshed: ${updatedAttendanceData.length} employees remaining (${attendanceData.length - updatedAttendanceData.length} removed after processing)`);
      
    } catch (error) {
      console.error('❌ Error processing attendance:', error);
      alert('Error processing attendance: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Handle individual employee recompute
  const handleIndividualRecompute = async (employee) => {
    try {
      if (!selectedMonth || !selectedPeriod) {
        alert('Please select month and period');
        return;
      }

      if (!employee.objid || !employee.employeeId) {
        alert('Employee data is incomplete');
        return;
      }

      setLoading(true);
      console.log('🔄 Recomputing attendance for employee:', employee.name, employee.employeeId);

      // Get month range
      const { startDate, endDate } = getMonthRange(selectedMonth, selectedPeriod);

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

      // Extract month name and year
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
      const computedYear = parseInt(year);

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
        // Update existing record
        await api.put(`/computed-dtr/${existingRecord.computeid}`, computedDtrData);
        console.log(`✅ Updated computed DTR for employee ${employee.employeeId}`);
      } else {
        // Create new record
        await api.post('/computed-dtr', computedDtrData);
        console.log(`✅ Created computed DTR for employee ${employee.employeeId}`);
      }

      // Refresh the attendance data for this employee
      const updatedAttendanceData = attendanceData.map(emp => {
        if (emp.employeeId === employee.employeeId) {
          return {
            ...emp,
            lates: metrics.totalLates || 0,
            days: metrics.totalDays || 0,
            netDays: metrics.netDays || 0,
            locatorsCount: metrics.locatorsCount || 0,
            leavesCount: metrics.leavesCount || 0,
            travelsCount: metrics.travelsCount || 0,
            cdoCount: metrics.cdoCount || 0,
            dailyData: details,
            status: 'Recomputed'
          };
        }
        return emp;
      });

      setAttendanceData(updatedAttendanceData);
      alert(`Successfully recomputed attendance for ${employee.name}`);
    } catch (error) {
      console.error('❌ Error recomputing attendance:', error);
      alert('Error recomputing attendance: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Check all periods for selected employees
  // Check periods for ALL department employees (to determine which should be disabled)
  const checkAllPeriodsForDepartmentEmployees = useCallback(async () => {
    if (!hasProceeded || !selectedMonth || departmentEmployees.length === 0) {
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
      
      // Extract month name and year from selectedMonth
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
      const computedYear = parseInt(year);
      
      // Get objid values from ALL department employees (not just selected ones)
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
        
        // Check if ALL THREE periods exist (Approved) for ANY selected employee
        // This means we need to check if any employee has all three periods
        const selectedEmployeeObjIds = departmentEmployees
          .filter(emp => selectedDepartmentEmployees.has(emp.USERID))
          .map(emp => emp.objid)
          .filter(objid => objid);
        
        let hasAllThreePeriods = false;
        for (const empObjId of selectedEmployeeObjIds) {
          const hasFirstHalf = newExistingPeriods['1st Half'].has(empObjId);
          const hasFullMonth = newExistingPeriods['Full Month'].has(empObjId);
          const hasSecondHalf = newExistingPeriods['2nd Half'].has(empObjId);
          
          if (hasFirstHalf && hasFullMonth && hasSecondHalf) {
            hasAllThreePeriods = true;
            break;
          }
        }
        
        setIsPeriodControlDisabled(hasAllThreePeriods);
        
        console.log('✅ Period check completed for ALL employees:', {
          '1st Half': newExistingPeriods['1st Half'].size,
          'Full Month': newExistingPeriods['Full Month'].size,
          '2nd Half': newExistingPeriods['2nd Half'].size,
          isPeriodControlDisabled: hasAllThreePeriods
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
  }, [hasProceeded, selectedMonth, departmentEmployees, selectedDepartmentEmployees]);

  // Check periods for selected employees only (for period control disabling)
  const checkAllPeriodsForSelectedEmployees = useCallback(async () => {
    // Both compute and recompute modes: always enable period control (no validation)
    setIsPeriodControlDisabled(false);
    return;
    
    if (!selectedMonth || selectedDepartmentEmployees.size === 0) {
      setIsPeriodControlDisabled(false);
      return;
    }
    
    try {
      // Extract month name and year from selectedMonth
      const [year, month] = selectedMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
      const computedYear = parseInt(year);
      
      // Get objid values from selected employees
      const selectedEmployeeObjIds = departmentEmployees
        .filter(emp => selectedDepartmentEmployees.has(emp.USERID))
        .map(emp => emp.objid)
        .filter(objid => objid);
      
      if (selectedEmployeeObjIds.length === 0) {
        setIsPeriodControlDisabled(false);
        return;
      }
      
      const response = await api.get('/compute-attendance/check-all-periods', {
        params: {
          computedmonth: monthName,
          computedyear: computedYear,
          emp_objids: selectedEmployeeObjIds.join(',')
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
        
        // Check if ALL THREE periods exist (Approved) for ANY selected employee
        let hasAllThreePeriods = false;
        for (const empObjId of selectedEmployeeObjIds) {
          const hasFirstHalf = newExistingPeriods['1st Half'].has(empObjId);
          const hasFullMonth = newExistingPeriods['Full Month'].has(empObjId);
          const hasSecondHalf = newExistingPeriods['2nd Half'].has(empObjId);
          
          if (hasFirstHalf && hasFullMonth && hasSecondHalf) {
            hasAllThreePeriods = true;
            break;
          }
        }
        
        setIsPeriodControlDisabled(hasAllThreePeriods);
      } else {
        setIsPeriodControlDisabled(false);
      }
    } catch (error) {
      console.error('❌ Error checking periods for selected employees:', error);
      setIsPeriodControlDisabled(false);
    }
  }, [selectedMonth, selectedDepartmentEmployees, departmentEmployees, viewMode]);

  // Fetch computed DTR employees when month/period changes
  useEffect(() => {
    if (selectedMonth && selectedPeriod) {
      fetchComputedDtrEmployees();
    } else {
      setEmployeesWithComputedDtr(new Set());
    }
  }, [selectedMonth, selectedPeriod]);

  // Check periods for ALL department employees when month, department employees, or period changes (after Proceed is clicked)
  // This is needed to determine which employees should be disabled
  useEffect(() => {
    if (hasProceeded && selectedMonth && departmentEmployees.length > 0) {
      checkAllPeriodsForDepartmentEmployees();
    } else {
      setExistingPeriods({
        '1st Half': new Set(),
        'Full Month': new Set(),
        '2nd Half': new Set()
      });
      setIsPeriodControlDisabled(false);
    }
  }, [selectedMonth, departmentEmployees, selectedPeriod, hasProceeded, viewMode, checkAllPeriodsForDepartmentEmployees]);

  // Check periods for selected employees only (for period control disabling)
  useEffect(() => {
    if (hasProceeded && selectedMonth && selectedDepartmentEmployees.size > 0) {
      checkAllPeriodsForSelectedEmployees();
    } else {
      setIsPeriodControlDisabled(false);
    }
  }, [selectedMonth, selectedDepartmentEmployees, hasProceeded, viewMode, checkAllPeriodsForSelectedEmployees]);

  // Reset selectedPeriod if it becomes disabled (but don't auto-select a new one)
  // Note: Both compute and recompute modes now have all periods always enabled, so this logic is no longer needed
  // The useEffect is kept for potential future use, but periods are always enabled so it won't trigger
  useEffect(() => {
    // All periods are always enabled in both modes, so no reset logic needed
  }, [existingPeriods, hasProceeded, viewMode, selectedPeriod, selectedDepartmentEmployees.size]);

  // Auto-deselect employees that become disabled when period changes
  useEffect(() => {
    if (hasProceeded && selectedPeriod && selectedDepartmentEmployees.size > 0) {
      const newSelected = new Set();
      let deselectedCount = 0;
      
      selectedDepartmentEmployees.forEach(employeeId => {
        const employee = departmentEmployees.find(emp => emp.USERID === employeeId);
        if (!employee) {
          // Employee not found, remove from selection
          deselectedCount++;
          return;
        }
        
        let shouldExclude = false;
        
        if (selectedPeriod === 'full') {
          // Full Month: Exclude if employee has ANY period (Full Month, 1st Half, or 2nd Half)
          shouldExclude = existingPeriods['1st Half'].has(employee.objid) ||
                         existingPeriods['Full Month'].has(employee.objid) ||
                         existingPeriods['2nd Half'].has(employee.objid);
        } else if (selectedPeriod === 'first') {
          // 1st Half: 
          // - In compute mode: Exclude if employee has 1st Half record
          // - In recompute mode: Exclude if employee has NO 1st Half record (need existing record to recompute)
          const hasFirstHalf = existingPeriods['1st Half'].has(employee.objid);
          
          if (viewMode === 'compute') {
            // Compute mode: Exclude if employee has 1st Half record
            shouldExclude = hasFirstHalf;
          } else {
            // Recompute mode: Exclude if employee has NO 1st Half record (can't recompute what doesn't exist)
            shouldExclude = !hasFirstHalf;
          }
        } else if (selectedPeriod === 'second') {
          // 2nd Half: 
          // - In compute mode: Exclude if employee has NO 1st Half record OR has 2nd Half record
          // - In recompute mode: Exclude if employee has 2nd Half record
          const hasFirstHalf = existingPeriods['1st Half'].has(employee.objid);
          const hasSecondHalf = existingPeriods['2nd Half'].has(employee.objid);
          
          if (viewMode === 'compute') {
            // Compute mode: Exclude if no 1st Half record OR has 2nd Half record
            shouldExclude = !hasFirstHalf || hasSecondHalf;
          } else {
            // Recompute mode: Exclude if employee has 2nd Half record
            shouldExclude = hasSecondHalf;
          }
        }
        
        if (!shouldExclude) {
          newSelected.add(employeeId);
        } else {
          deselectedCount++;
          console.log(`⏭️ Auto-deselected ${employee.NAME} - excluded for selected period`);
        }
      });
      
      if (deselectedCount > 0) {
        console.log(`🔄 Auto-deselected ${deselectedCount} employees that are excluded for period ${selectedPeriod}`);
        setSelectedDepartmentEmployees(newSelected);
      }
    }
  }, [selectedPeriod, existingPeriods, hasProceeded, departmentEmployees]);

  // Fetch attendance data when parameters change (auto-compute on selection)
  useEffect(() => {
    if (hasProceeded && selectedMonth && selectedDepartmentEmployees.size > 0 && selectedPeriod && viewMode === 'compute') {
      calculateDepartmentAttendance();
    } else if (hasProceeded && selectedMonth && selectedDepartmentEmployees.size > 0 && selectedPeriod && viewMode === 'recompute') {
      fetchComputedDtrData();
    }
  }, [selectedMonth, selectedDepartmentEmployees, selectedPeriod, viewMode, hasProceeded]);

  // Clear attendance data in compute mode when no employees are selected
  useEffect(() => {
    if (viewMode === 'compute' && selectedDepartmentEmployees.size === 0) {
      setAttendanceData([]);
      setCurrentPage(1);
    }
  }, [selectedDepartmentEmployees.size, viewMode]);

  // Calculate totals for footer
  const totals = useMemo(() => {
    const sum = attendanceData.reduce((acc, emp) => {
      acc.totalLates += emp.lates || 0;
      acc.totalDays += emp.days || 0;
      acc.equivalentDaysDeducted += emp.equivalentDaysDeducted || 0;
      acc.totalCdo += emp.cdoCount || 0;
      acc.totalLeaves += emp.leavesCount || 0;
      acc.totalLocators += emp.locatorsCount || 0;
      acc.totalTravels += emp.travelsCount || 0;
      return acc;
    }, { totalLates: 0, totalDays: 0, equivalentDaysDeducted: 0, totalCdo: 0, totalLeaves: 0, totalLocators: 0, totalTravels: 0 });
    
    // Calculate Net Days correctly: Total Days - (Total Lates / 480)
    const latesInDays = sum.totalLates / (8 * 60); // Convert late minutes to days
    const netDays = Math.max(0, sum.totalDays - latesInDays);
    
    return {
      ...sum,
      netDays: Math.round(netDays * 10000) / 10000 // Round to 4 decimal places
    };
  }, [attendanceData, selectedDepartmentEmployees, viewMode]);

  const formatMinutes = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Helper function to format period options based on selected month
  const getPeriodOptions = () => {
    if (!selectedMonth) {
      return [
        { value: 'full', label: 'Full Month', disabled: false },
        { value: 'first', label: '1st Half', disabled: false },
        { value: 'second', label: '2nd Half', disabled: false }
      ];
    }

    // Extract month and year from selectedMonth (format: "2025-01-01")
    const [year, month] = selectedMonth.split('-');
    const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthName = monthDate.toLocaleString('en-US', { month: 'short' });
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();

    // Determine which periods exist for selected employees
    const hasFirstHalf = existingPeriods['1st Half'].size > 0;
    const hasFullMonth = existingPeriods['Full Month'].size > 0;
    const hasSecondHalf = existingPeriods['2nd Half'].size > 0;

    let disableFull, disableFirst, disableSecond;

    // Both compute and recompute modes: All periods are always enabled (no validation)
    disableFull = false;
    disableFirst = false;
    disableSecond = false;

    return [
      { 
        value: 'full', 
        label: `Full Month (${monthName})`,
        disabled: disableFull
      },
      { 
        value: 'first', 
        label: `1st Half (${monthName} 1 - ${monthName} 15)`,
        disabled: disableFirst
      },
      { 
        value: 'second', 
        label: `2nd Half (${monthName} 16 - ${monthName} ${lastDay})`,
        disabled: disableSecond
      }
    ];
  };

  // Print function for the grid data
  const handlePrint = async () => {
    if (!attendanceData || attendanceData.length === 0) {
      alert('No data to print');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Get the selected period display text
    const periodOptions = getPeriodOptions();
    const selectedPeriodOption = periodOptions.find(option => option.value === selectedPeriod);
    const periodDisplayText = selectedPeriodOption ? selectedPeriodOption.label : 'Full Month';
    
    // Get the selected month display text
    const selectedMonthOption = monthOptions.find(option => option.value === selectedMonth);
    const monthDisplayText = selectedMonthOption ? selectedMonthOption.label : 'Current Month';
    
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Compute Attendance Report</title>
          <style>
            body { 
              font-family: Arial, sans-serif;
              font-size: 12px; 
              margin: 0;
              padding: 20px;
            }
            .print-header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .print-logo {
              height: 60px;
              margin-bottom: 10px;
            }
            .print-title {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .print-subtitle {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
            }
            .print-period {
              font-size: 16px;
              font-weight: bold;
              color: #333;
              margin-bottom: 20px;
            }
            .print-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            .print-table th, 
            .print-table td { 
              border: 1px solid #333; 
              padding: 6px; 
              text-align: left; 
              font-size: 11px;
            }
            .print-table th { 
              background-color: #f0f0f0; 
              font-weight: bold; 
            }
            .print-footer {
              text-align: center;
              margin-top: 20px;
              font-size: 10px;
              color: #666;
              border-top: 1px solid #ccc;
              padding-top: 10px;
            }
            @page {
              margin: 0.5in;
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <div class="print-title">Human Resource Management Office</div>
            <div class="print-subtitle">Computed Attendance Report for the Period of ${periodDisplayText}</div>
          </div>
          
          <table class="print-table">
            <thead>
              <tr>
                <th>ROW</th>
                <th>Employee</th>
                <th>Leaves</th>
                <th>Locators</th>
                <th>Travels</th>
                <th>CDO</th>
                <th>Lates</th>
                <th>Days</th>
                <th>Net Days</th>
              </tr>
            </thead>
            <tbody>
              ${attendanceData.map((emp, idx) => {
                const deptPosition = [emp.department, emp.position].filter(Boolean).join(' - ') || '—';
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>
                      <div style="font-weight:600;color:#111827;">${emp.name || '—'}</div>
                      <div style="font-size:10px;color:#6b7280;">${deptPosition}</div>
                    </td>
                    <td>${emp.leavesCount || 0}</td>
                    <td>${emp.locatorsCount || 0}</td>
                    <td>${emp.travelsCount || 0}</td>
                    <td>${emp.cdoCount || 0}</td>
                    <td>${Math.round(Number(emp.lates || 0))}</td>
                    <td>${emp.days ?? 0}</td>
                    <td>${Number(emp.netDays ?? 0).toFixed(4)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="print-footer">
            System Generated (${new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}) By: ${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).USERID : 'Unknown'}
          </div>
        </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  const handleViewAttendance = async (record) => {
    if (!record || !record.employeeId) {
      return;
    }

    const monthOption = monthOptions.find(option => option.value === selectedMonth);
    const periodOption = getPeriodOptions().find(option => option.value === selectedPeriod);
    setModalMeta({
      monthLabel: monthOption ? monthOption.label : 'Selected Month',
      periodLabel: periodOption ? periodOption.label : 'Selected Period'
    });

    setSelectedAttendanceRecord(record);
    setModalLogs([]);
    setModalRange({ startDate: '', endDate: '' });
    setModalShiftSchedule(record.shiftSchedule || null);
    setModalError('');
    setDetailsModalOpen(true);

    if (!selectedMonth) {
      setModalError('Please select a month to view attendance details.');
      return;
    }

    const { startDate, endDate } = getMonthRange(selectedMonth, selectedPeriod);
    setModalRange({ startDate, endDate });

    setModalLoading(true);
    try {
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
    } catch (error) {
      console.error('❌ Error loading time logs for modal:', error);
      setModalError(error.response?.data?.message || error.message || 'Failed to load time logs.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseModal = () => {
    setDetailsModalOpen(false);
    setSelectedAttendanceRecord(null);
    setModalLogs([]);
    setModalRange({ startDate: '', endDate: '' });
    setModalShiftSchedule(null);
    setModalError('');
  };

  // Utility functions for fix modal
  const deriveFixLogDate = (row) => {
    if (!row) return null;
    // Extract date from row.date (YYYY-MM-DD format)
    const dateValue = row.date || row.DATE_RAW || row.DATE || '';
    if (!dateValue) return null;
    // Ensure it's in YYYY-MM-DD format
    const dateStr = String(dateValue).trim();
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return isoMatch[0]; // Return YYYY-MM-DD
    }
    // Try to parse and format
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
    // Extract HH:mm from HH:mm:ss format
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
    if (!log || !selectedAttendanceRecord) return;
    openFixTimeModal(log);
  };

  // Fix modal handlers
  const openFixTimeModal = (row) => {
    if (!selectedAttendanceRecord) {
      window.alert('Employee information is missing.');
      return;
    }
    
    const empObjId = selectedAttendanceRecord.objid;
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
      if (selectedAttendanceRecord && modalRange.startDate && modalRange.endDate) {
        // Refresh logs after fix
        const response = await api.get('/compute-attendance/time-logs', {
          params: {
            userId: selectedAttendanceRecord.employeeId,
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

  // Calculate pagination
  const filteredAttendanceData = useMemo(() => {
    if (viewMode === 'compute') {
      if (!selectedDepartmentEmployees || selectedDepartmentEmployees.size === 0) {
        return [];
      }
      return attendanceData.filter(emp => selectedDepartmentEmployees.has(emp.employeeId));
    }
    return attendanceData;
  }, [viewMode, attendanceData, selectedDepartmentEmployees]);

  const paginatedAttendanceData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAttendanceData.slice(startIndex, endIndex);
  }, [filteredAttendanceData, currentPage, itemsPerPage]);

  // Calculate total pages
  useEffect(() => {
    const total = Math.ceil(filteredAttendanceData.length / itemsPerPage);
    setTotalPages(total);
    // Reset to page 1 if current page is beyond total pages
    if (currentPage > total && total > 0) {
      setCurrentPage(1);
    }
  }, [filteredAttendanceData.length, itemsPerPage, currentPage]);

  // Reset pagination when attendance data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [attendanceData]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          
          {/* Step 1: Month and Process Mode Selection */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Select Month and Process Mode</h2>
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  disabled={hasProceeded}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select a month...</option>
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Process Mode
                </label>
                <select
                  value={viewMode}
                  onChange={(e) => {
                    setViewMode(e.target.value);
                    setAttendanceData([]); // Clear data when switching modes
                  }}
                  disabled={hasProceeded}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="compute">Compute</option>
                  <option value="recompute">Recompute</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                {((viewMode === 'compute' && canReadComputeAttendance) || (viewMode === 'recompute' && canViewRecomputeTab)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHasProceeded(true);
                    }}
                    disabled={
                      !selectedMonth ||
                      hasProceeded ||
                      (viewMode === 'compute' && !canReadComputeAttendance) ||
                      (viewMode === 'recompute' && !canViewRecomputeTab)
                    }
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md shadow hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Proceed
                  </button>
                )}
                {hasProceeded && (
                  <button
                    type="button"
                    onClick={() => {
                      setHasProceeded(false);
                      setSelectedDepartment('');
                      setSelectedAppointment('all');
                      setSelectedStatus('1');
                      setSelectedPeriod('');
                      setDepartmentEmployees([]);
                      setSelectedDepartmentEmployees(new Set());
                      setAttendanceData([]);
                      setExistingPeriods({
                        '1st Half': new Set(),
                        'Full Month': new Set(),
                        '2nd Half': new Set()
                      });
                      setIsPeriodControlDisabled(false);
                    }}
                    className="px-4 py-2 bg-gray-500 text-white font-medium rounded-md shadow hover:bg-gray-600 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            {!selectedMonth && (
              <p className="mt-2 text-sm text-gray-600">Please select Month and Process Mode to continue</p>
            )}
          </div>

          {/* Step 2: Department, Appointment, and Employee Status Filters - Only show after Proceed (Compute Mode only) */}
          {hasProceeded && viewMode === 'compute' && canViewComputeAttendance && (
            <>
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

              {/* Step 3: Period Control - Only show after filters are applied */}
          {departmentEmployees.length > 0 && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 3: Select Period</h2>
                  {loadingPeriods && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span>Checking existing periods...</span>
                    </div>
                  )}
                  {isPeriodControlDisabled ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800 font-medium">
                        All periods already computed for selected employees
                      </p>
                    </div>
                  ) : (
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
                            {option.label} {option.disabled ? (viewMode === 'recompute' ? '(No records)' : '(Already computed)') : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Step 4: Employee Selection - Only show after Period is selected */}
          {hasProceeded && selectedPeriod && departmentEmployees.length > 0 && viewMode === 'compute' && canViewComputeAttendance && (
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
                              // Filter out disabled employees based on selected period
                              if (selectedPeriod === 'full') {
                                return !existingPeriods['1st Half'].has(emp.objid) &&
                                       !existingPeriods['Full Month'].has(emp.objid) &&
                                       !existingPeriods['2nd Half'].has(emp.objid);
                              } else if (selectedPeriod === 'first') {
                                // 1st Half: 
                                // - In compute mode: Exclude if employee has 1st Half record
                                // - In recompute mode: Exclude if employee has NO 1st Half record (need existing record to recompute)
                                const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
                                
                                if (viewMode === 'compute') {
                                  // Compute mode: Exclude if employee has 1st Half record
                                  return !hasFirstHalf;
                                } else {
                                  // Recompute mode: Exclude if employee has NO 1st Half record (can't recompute what doesn't exist)
                                  return hasFirstHalf;
                                }
                              } else if (selectedPeriod === 'second') {
                                // 2nd Half: 
                                // - In compute mode: Exclude if employee has NO 1st Half record OR has 2nd Half record
                                // - In recompute mode: Exclude if employee has 2nd Half record
                                const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
                                const hasSecondHalf = existingPeriods['2nd Half'].has(emp.objid);
                                
                                if (viewMode === 'compute') {
                                  // Compute mode: Exclude if no 1st Half record OR has 2nd Half record
                                  return hasFirstHalf && !hasSecondHalf;
                                } else {
                                  // Recompute mode: Exclude if employee has 2nd Half record
                                  return !hasSecondHalf;
                                }
                              }
                              // If no period selected, use old logic
                              return !employeesWithComputedDtr.has(emp.objid);
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
                        const disabledCount = departmentEmployees.filter(emp => {
                          if (!selectedPeriod) {
                            return employeesWithComputedDtr.has(emp.objid);
                          }

                          if (selectedPeriod === 'full') {
                            return (
                              existingPeriods['1st Half'].has(emp.objid) ||
                              existingPeriods['Full Month'].has(emp.objid) ||
                              existingPeriods['2nd Half'].has(emp.objid)
                            );
                          }

                          if (selectedPeriod === 'first') {
                            const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
                            const hasFullMonth = existingPeriods['Full Month'].has(emp.objid);
                            return hasFirstHalf || hasFullMonth;
                          }

                          if (selectedPeriod === 'second') {
                            const hasFirstHalf = existingPeriods['1st Half'].has(emp.objid);
                            const hasSecondHalf = existingPeriods['2nd Half'].has(emp.objid);
                            if (viewMode === 'compute') {
                              return !hasFirstHalf || hasSecondHalf;
                            }
                            return hasSecondHalf;
                          }

                          return false;
                        }).length;
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
                      let isDisabled = false;
                      let disabledReason = '';
                      
                      if (selectedPeriod === 'full') {
                        // Full Month: Disable if employee has ANY period (Full Month, 1st Half, or 2nd Half)
                        const hasFirstHalf = existingPeriods['1st Half'].has(employee.objid);
                        const hasFullMonth = existingPeriods['Full Month'].has(employee.objid);
                        const hasSecondHalf = existingPeriods['2nd Half'].has(employee.objid);
                        
                        if (hasFirstHalf || hasFullMonth || hasSecondHalf) {
                          isDisabled = true;
                          const periods = [];
                          if (hasFirstHalf) periods.push('1st Half');
                          if (hasFullMonth) periods.push('Full Month');
                          if (hasSecondHalf) periods.push('2nd Half');
                          disabledReason = `Has existing records: ${periods.join(', ')}`;
                        }
                      } else if (selectedPeriod === 'first') {
                        // 1st Half: 
                        // - In compute mode: Disable if employee has 1st Half record or Full Month record
                        // - In recompute mode: Disable if employee has NO 1st Half record (need existing record to recompute)
                        const hasFirstHalf = existingPeriods['1st Half'].has(employee.objid);
                        const hasFullMonth = existingPeriods['Full Month'].has(employee.objid);
                        
                        if (viewMode === 'compute') {
                          // Compute mode: Disable if employee has 1st Half record or Full Month record
                          if (hasFirstHalf || hasFullMonth) {
                            isDisabled = true;
                            disabledReason = hasFullMonth
                              ? 'Has existing Full Month record'
                              : 'Has existing 1st Half record';
                          }
                        } else {
                          // Recompute mode: Disable if employee has NO 1st Half record (can't recompute what doesn't exist)
                          if (!hasFirstHalf) {
                            isDisabled = true;
                            disabledReason = 'No existing 1st Half record to recompute';
                          }
                        }
                      } else if (selectedPeriod === 'second') {
                        // 2nd Half: 
                        // - In compute mode: Disable if employee has NO 1st Half record OR has 2nd Half record
                        // - In recompute mode: Disable if employee has 2nd Half record
                        const hasFirstHalf = existingPeriods['1st Half'].has(employee.objid);
                        const hasSecondHalf = existingPeriods['2nd Half'].has(employee.objid);
                        
                        if (viewMode === 'compute') {
                          // Compute mode: Disable if no 1st Half record OR has 2nd Half record
                          if (!hasFirstHalf || hasSecondHalf) {
                            isDisabled = true;
                            if (!hasFirstHalf) {
                              disabledReason = 'No existing 1st Half record (2nd Half requires 1st Half)';
                            } else if (hasSecondHalf) {
                              disabledReason = 'Has existing 2nd Half record';
                            }
                          }
                        } else {
                          // Recompute mode: Disable if employee has 2nd Half record
                          if (hasSecondHalf) {
                            isDisabled = true;
                            disabledReason = 'Has existing 2nd Half record';
                          }
                        }
                      }
                      
                      // Also check the old computed DTR check (for backward compatibility)
                      const hasComputedDtr = employeesWithComputedDtr.has(employee.objid);
                      if (hasComputedDtr && !isDisabled) {
                        isDisabled = true;
                        disabledReason = 'Already has computed DTR for this period';
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

                  {/* No results message */}
                  {departmentEmployeeSearchTerm && filteredDepartmentEmployees.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>No employees found matching "{departmentEmployeeSearchTerm}"</p>
                      <button
                        onClick={() => setDepartmentEmployeeSearchTerm('')}
                        className="mt-2 text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          )}

          {viewMode === 'compute' && canViewComputeAttendance && departmentEmployees.length === 0 && !loadingDepartmentEmployees && selectedDepartment && (
            <div className="text-center py-8 text-gray-500">
              <p>No employees found in {selectedDepartment} with the selected status filter.</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Computing attendance...</span>
            </div>
          )}

          {/* Attendance Table */}
          {/* Conditionally render based on view mode */}
          {viewMode === 'recompute' ? (
            canViewRecomputeTab ? (
              hasProceeded ? (
                <RecomputedDTRAttendance
                  selectedMonth={selectedMonth}
                  processMode={viewMode}
                  onBack={() => {
                    setHasProceeded(false);
                    setSelectedPeriod('');
                    setSelectedDepartmentEmployees(new Set());
                    setDepartmentEmployees([]);
                  }}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Please click Proceed to continue with the recompute process.</p>
                </div>
              )
            ) : (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-yellow-800">
                You do not have permission to view recomputation.
              </div>
            )
          ) : (
            !loading && selectedMonth && selectedPeriod && filteredAttendanceData.length > 0 && canViewComputeAttendance && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {/* Pagination Controls - Top */}
              {filteredAttendanceData.length > 0 && (
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <label className="text-sm font-medium text-gray-700">Show:</label>
                        <select
                          value={itemsPerPage}
                          onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={10}>10</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                        <span className="text-sm text-gray-500">records</span>
                      </div>
                      <div className="text-sm text-gray-700">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAttendanceData.length)} of {filteredAttendanceData.length} entries
                      </div>
                    </div>
                    
                    {/* Action Buttons - Process and Print */}
                    {hasProceeded && selectedPeriod && attendanceData.length > 0 && (
                      <div className="flex items-center gap-3">
                      <button
                          type="button"
                          onClick={handleProcessAttendance}
                          disabled={!attendanceData || attendanceData.length === 0 || viewMode !== 'compute'}
                          className="inline-flex items-center gap-1.5 px-3 py-1 border border-green-600 text-green-700 hover:bg-green-50 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Process Attendance"
                        >
                          🧮
                          <span>Process</span>
                      </button>
                      <button
                          type="button"
                          onClick={handlePrint}
                          disabled={!attendanceData || attendanceData.length === 0}
                          className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 hover:bg-blue-50 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Print Computed DTR"
                        >
                          🖨️
                      </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Days
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                        Net Days
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedAttendanceData.map((emp, index) => {
                      const rowNumber = (currentPage - 1) * itemsPerPage + index + 1;
                      const deptPosition = [emp.department, emp.position].filter(Boolean).join(' - ') || '—';
                      return (
                        <tr key={emp.employeeId ?? rowNumber} className="hover:bg-gray-50">
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
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {emp.days ?? 0}
                          </td>
                          <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-900 w-20">
                            {Number(emp.netDays ?? 0).toFixed(4)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleViewAttendance(emp)}
                                className="text-blue-600 hover:text-blue-800 transition-colors text-lg"
                                title="View Attendance"
                              >
                                👁️
                              </button>
                              {canDeleteAttendance && (
                              <button
                                type="button"
                                onClick={() => console.log('Delete attendance for:', emp.name)}
                                className="text-red-600 hover:text-red-800 transition-colors text-lg"
                                title="Delete Attendance"
                              >
                                🗑️
                              </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        Total Employees: {filteredAttendanceData.length}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalLeaves}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalLocators}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalTravels}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalCdo}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                        {Math.round(Number(totals.totalLates || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">{totals.totalDays}</td>
                      <td className="px-2 py-3 text-xs font-semibold text-gray-700 w-20">{Number(totals.netDays ?? 0).toFixed(4)}</td>
                      <td className="px-6 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {/* Pagination Navigation - Bottom */}
              {filteredAttendanceData.length > 0 && (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-center">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                              onClick={() => setCurrentPage(pageNum)}
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
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Last
                      </button>
                    </div>
              </div>
            </div>
              )}
            </div>
            )
          )}

          {/* No Data State */}
          {viewMode === 'compute' && !loading && selectedMonth && selectedPeriod && selectedDepartmentEmployees.size > 0 && attendanceData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No attendance data found for the selected parameters.</p>
            </div>
          )}

          {/* Select Parameters Prompt */}
          {!selectedMonth && (
            <div className="text-center py-8 text-gray-500">
              <p>Please select a month to compute attendance.</p>
            </div>
          )}
        </div>
      </div>
      <ComputedAttendanceModal
        isOpen={detailsModalOpen}
        onClose={handleCloseModal}
        employee={selectedAttendanceRecord}
        monthLabel={modalMeta.monthLabel}
        periodLabel={modalMeta.periodLabel}
        logs={modalLogs}
        dateRange={modalRange}
        shiftSchedule={modalShiftSchedule}
        loading={modalLoading}
        error={modalError}
        onFixLog={handleFixLogRequest}
      />
      <FixTimeModal
        isOpen={fixTimeModalOpen}
        onClose={closeFixTimeModal}
        employee={selectedAttendanceRecord}
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
  );
};

export default ComputeAttendance;
