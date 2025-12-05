import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';
import GenerateDTRPrint_Ind from './GenerateDTRPrint_Ind';
import GenerateDTRPrint_Dept from './GenerateDTRPrint_Dept';
import GenerateDTRPrintReportWithAnnotations from './print_GenerateDTRPrintReportWithAnnotations';
import { getAppointmentOptions, getAppointmentName } from '../../utils/appointmentLookup';
import { formatEmployeeName } from '../../utils/employeenameFormatter';

const GenerateDTRReport = () => {
  const [reportType, setReportType] = useState('individual');
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [employeeStatusTypes, setEmployeeStatusTypes] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('full'); // New state for period selection
  const [selectedStatus, setSelectedStatus] = useState('all'); // Changed to 'all' to use employeestatustypes
  const [selectedAppointment, setSelectedAppointment] = useState('all'); // Added appointment filter
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [showPrintOptionsModal, setShowPrintOptionsModal] = useState(false);
  const [showBulkPrintOptionsModal, setShowBulkPrintOptionsModal] = useState(false);
  const [printFormat, setPrintFormat] = useState('basic');
  const [bulkPrintFormat, setBulkPrintFormat] = useState('basic');
  const [selectedAnnotations, setSelectedAnnotations] = useState({
    locator: true,
    fixlog: true,
    leave: true,
    travel: true,
    cdo: true,
    holiday: true,
    weekend: true,
    absent: true
  });
  const [bulkSelectedAnnotations, setBulkSelectedAnnotations] = useState({
    locator: true,
    fixlog: true,
    leave: true,
    travel: true,
    cdo: true,
    holiday: true,
    weekend: true,
    absent: true
  });

  // New state for department employee selection
  const [departmentEmployees, setDepartmentEmployees] = useState([]);
  const [selectedDepartmentEmployees, setSelectedDepartmentEmployees] = useState(new Set());
  const [loadingDepartmentEmployees, setLoadingDepartmentEmployees] = useState(false);
  
  // New state for department employee search
  const [departmentEmployeeSearchTerm, setDepartmentEmployeeSearchTerm] = useState('');
  const [filteredDepartmentEmployees, setFilteredDepartmentEmployees] = useState([]);

  // Generate month options (last 2 years to current month)
  const monthOptions = useMemo(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() is 0-indexed
    const months = [];
    
    // Generate months from 2 years ago to current month
    for (let year = currentYear - 2; year <= currentYear; year++) {
      const maxMonth = year === currentYear ? currentMonth : 12;
      for (let month = 1; month <= maxMonth; month++) {
        const date = new Date(year, month - 1, 1);
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const value = `${year}-${String(month).padStart(2, '0')}-01`;
        months.push({ value, label: `${monthName} ${year}` });
      }
    }
    return months;
  }, []);

  // Generate period options based on selected month
  const periodOptions = useMemo(() => {
    if (!selectedMonth) return [];

    const [year, month] = selectedMonth.split('-').map(Number);
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
    
    // Get the last day of the selected month
    const lastDay = new Date(year, month, 0).getDate();

    return [
      { 
        value: 'full', 
        label: `Full Month (${monthName} 1-${lastDay})` 
      },
      { 
        value: 'first_half', 
        label: `1st Half (${monthName} 1-15)` 
      },
      { 
        value: 'second_half', 
        label: `2nd Half (${monthName} 16-${lastDay})` 
      }
    ];
  }, [selectedMonth]);

  // Set default selected month to current month
  useEffect(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const defaultMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    setSelectedMonth(defaultMonth);
  }, []);

  // Reset period when month changes
  useEffect(() => {
    setSelectedPeriod('full');
  }, [selectedMonth]);

  // Fetch employees for search - from MySQL employees table
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        console.log('🔄 Fetching employees from MySQL employees table...');
        // Use the 201-employees endpoint which queries the MySQL employees table
        const response = await api.get('/201-employees');
        
        if (response.data.success && response.data.data) {
          // Map MySQL employee fields to expected format
          const mappedEmployees = response.data.data.map(emp => {
            // Format name as "Last Name, First Name" using the formatter
            const formattedName = formatEmployeeName(emp.surname, emp.firstname, emp.middlename, emp.extension);
            
            return {
              ...emp,
              // Map MySQL fields to expected field names
              NAME: formattedName || String(emp.fullname || `${emp.firstname || ''} ${emp.middlename || ''} ${emp.surname || ''}`.trim()),
              BADGENUMBER: String(emp.dtrbadgenumber || emp.badgenumber || ''),
              USERID: emp.dtruserid || emp.userid || emp.objid,
              DEPTNAME: String(emp.department_name || emp.department || ''),
              POSITION: String(emp.position_title || emp.position || ''),
              PHOTO: emp.photo_path || emp.photo || null,
              APPOINTMENT: emp.appointment_status || emp.appointmentstatus || null,
              APPOINTMENT_NAME: emp.appointment_name || null,
              EMPSTATUS: emp.empstatus || null,
              // Keep original fields for compatibility
              objid: emp.objid,
              idno: emp.idno,
              surname: emp.surname,
              firstname: emp.firstname,
              middlename: emp.middlename,
              extension: emp.extension
            };
          });
          
          console.log('✅ Employees fetched from MySQL:', mappedEmployees.length);
          setEmployees(mappedEmployees);
        } else {
          console.error('❌ Invalid response structure:', response.data);
          setEmployees([]);
        }
      } catch (error) {
        console.error('❌ Error fetching employees from MySQL:', error);
        setEmployees([]);
      }
    };
    fetchEmployees();
  }, []);

  // Filter employees based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredEmployees([]);
    } else {
      const searchLower = searchTerm.toLowerCase();
      const filtered = employees.filter(emp => {
        const name = String(emp.NAME || '').toLowerCase();
        const badgeNumber = String(emp.BADGENUMBER || '').toLowerCase();
        return name.includes(searchLower) || badgeNumber.includes(searchLower);
      });
      setFilteredEmployees(filtered.slice(0, 10));
    }
  }, [searchTerm, employees]);

  // Filter department employees based on search term
  useEffect(() => {
    if (departmentEmployeeSearchTerm.trim() === '') {
      setFilteredDepartmentEmployees(departmentEmployees);
    } else {
      const searchLower = departmentEmployeeSearchTerm.toLowerCase();
      const filtered = departmentEmployees.filter(emp => {
        const name = String(emp.NAME || '').toLowerCase();
        const badgeNumber = String(emp.BADGENUMBER || '').toLowerCase();
        return name.includes(searchLower) || badgeNumber.includes(searchLower);
      });
      setFilteredDepartmentEmployees(filtered);
    }
  }, [departmentEmployeeSearchTerm, departmentEmployees]);

  // Fetch departments, appointment types, and employee status types
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        console.log('🔄 Fetching departments from MySQL...');
        const response = await api.get('/departments');
        if (response.data.success) {
          console.log('✅ Departments fetched:', response.data.data.length);
          setDepartments(response.data.data);
        }
      } catch (error) {
        console.error('❌ Error fetching departments:', error);
      }
    };

    const fetchAppointmentTypes = async () => {
      try {
        console.log('🔄 Fetching appointment types from MySQL...');
        const response = await api.get('/201-employees/lookup/appointmenttypes');
        if (response.data.success) {
          console.log('✅ Appointment types fetched:', response.data.data.length);
          setAppointmentTypes(response.data.data);
        }
      } catch (error) {
        console.error('❌ Error fetching appointment types:', error);
      }
    };

    const fetchEmployeeStatusTypes = async () => {
      try {
        console.log('🔄 Fetching employee status types from MySQL...');
        const response = await api.get('/201-employees/lookup/employeestatustypes');
        if (response.data.success) {
          console.log('✅ Employee status types fetched:', response.data.data.length);
          setEmployeeStatusTypes(response.data.data);
        }
      } catch (error) {
        console.error('❌ Error fetching employee status types:', error);
      }
    };

    fetchDepartments();
    fetchAppointmentTypes();
    fetchEmployeeStatusTypes();
  }, []);

  // Fetch department employees when department, status, or appointment changes
  useEffect(() => {
    if (reportType === 'department') {
      // Check if user has selected a department or appointment (not just default status)
      const hasUserSelectedFilter = selectedDepartment || selectedAppointment !== 'all';
      
      if (hasUserSelectedFilter) {
        fetchDepartmentEmployees();
      } else {
        // Clear employees when no user-selected filters
        setDepartmentEmployees([]);
        setSelectedDepartmentEmployees(new Set());
        setFilteredDepartmentEmployees([]);
        setDepartmentEmployeeSearchTerm('');
      }
    } else {
      setDepartmentEmployees([]);
      setSelectedDepartmentEmployees(new Set());
      setFilteredDepartmentEmployees([]);
      setDepartmentEmployeeSearchTerm('');
    }
  }, [selectedDepartment, selectedStatus, selectedAppointment, reportType]);

  const fetchDepartmentEmployees = async () => {
    setLoadingDepartmentEmployees(true);
    setDepartmentEmployees([]);
    setSelectedDepartmentEmployees(new Set());
    setFilteredDepartmentEmployees([]);
    setDepartmentEmployeeSearchTerm('');

    try {
      // Start with all employees and apply filters independently
      let allEmployees = [...employees];
      
      console.log(' DEBUG: Starting with all employees:', allEmployees.length);
      console.log('🔍 DEBUG: Sample employee data:', allEmployees[0]);

      // Apply department filter
      if (selectedDepartment) {
        console.log('🔍 DEBUG: Filtering by department:', selectedDepartment);
        const beforeCount = allEmployees.length;
        allEmployees = allEmployees.filter(emp => {
          const matches = emp.DEPTNAME === selectedDepartment;
          if (!matches && allEmployees.indexOf(emp) < 5) { // Log first 5 non-matches for debugging
            console.log(' DEBUG: Employee does not match department:', {
              name: emp.NAME,
              deptName: emp.DEPTNAME,
              expectedDept: selectedDepartment,
              matches: matches
            });
          }
          return matches;
        });
        console.log(`🔍 DEBUG: Department filter: ${beforeCount} -> ${allEmployees.length}`);
      }

      // Apply status filter - Use empstatus field (lookup to employeestatustypes)
      if (selectedStatus !== 'all') {
        console.log('🔍 DEBUG: Filtering by status:', selectedStatus);
        const beforeCount = allEmployees.length;
        const statusId = parseInt(selectedStatus);
        allEmployees = allEmployees.filter(emp => {
          const empStatus = emp.empstatus !== null && emp.empstatus !== undefined ? parseInt(emp.empstatus) : null;
          const matches = empStatus === statusId;
          
          if (!matches && allEmployees.indexOf(emp) < 5) { // Log first 5 non-matches for debugging
            console.log('🔍 DEBUG: Employee does not match status:', {
              name: emp.NAME,
              empstatus: emp.empstatus,
              expectedStatus: statusId,
              matches: matches
            });
          }
          return matches;
        });
        console.log(`🔍 DEBUG: Status filter: ${beforeCount} -> ${allEmployees.length}`);
      }

      // Apply appointment filter - FIXED: Use same logic as ComputeAttendance
      if (selectedAppointment !== 'all') {
        console.log('🔍 DEBUG: Filtering by appointment:', selectedAppointment);
        const beforeCount = allEmployees.length;
        const appointmentId = parseInt(selectedAppointment); // Convert string to int
        allEmployees = allEmployees.filter(emp => {
          // Handle null/undefined appointment values - exclude them (same as ComputeAttendance)
          if (emp.Appointment === null || emp.Appointment === undefined) {
            return false; // Exclude employees with null appointment
          }
          
          const empAppointment = parseInt(emp.Appointment); // Convert to int
          const matches = empAppointment === appointmentId;
          if (!matches && allEmployees.indexOf(emp) < 5) { // Log first 5 non-matches for debugging
            console.log('🔍 DEBUG: Employee does not match appointment:', {
              name: emp.NAME,
              appointment: emp.Appointment,
              expectedAppointment: appointmentId,
              matches: matches
            });
          }
          return matches;
        });
        console.log(`🔍 DEBUG: Appointment filter: ${beforeCount} -> ${allEmployees.length}`);
      }

      setDepartmentEmployees(allEmployees);
      setFilteredDepartmentEmployees(allEmployees);
      
      // AUTOMATICALLY SELECT ALL FOUND EMPLOYEES
      const allEmployeeIds = new Set(allEmployees.map(emp => emp.USERID));
      setSelectedDepartmentEmployees(allEmployeeIds);
      
      console.log(`✅ Final result: ${allEmployees.length} employees for department: ${selectedDepartment}, status: ${selectedStatus}, appointment: ${selectedAppointment}`);
      console.log(`✅ Automatically selected all ${allEmployeeIds.size} employees`);
      
      // Debug: Show sample of final filtered employees
      if (allEmployees.length > 0) {
        console.log('🔍 DEBUG: Sample filtered employees:', allEmployees.slice(0, 3));
      } else {
        console.log('❌ DEBUG: No employees found after filtering');
        // Let's check what departments actually exist
        const uniqueDepts = [...new Set(employees.map(emp => emp.DEPTNAME))];
        console.log('🔍 DEBUG: Available departments:', uniqueDepts.slice(0, 10));
        // Let's check what privilege values actually exist
        const uniquePrivileges = [...new Set(employees.map(emp => emp.privilege))];
        console.log('🔍 DEBUG: Available privilege values:', uniquePrivileges);
        // Let's check what appointments actually exist
        const uniqueAppointments = [...new Set(employees.map(emp => emp.APPOINTMENT))];
        console.log('🔍 DEBUG: Available appointments:', uniqueAppointments);
        // Let's check what appointment field names might exist
        const sampleEmp = employees[0];
        console.log('🔍 DEBUG: Sample employee fields:', Object.keys(sampleEmp));
        console.log('🔍 DEBUG: Sample employee appointment-related fields:', {
          APPOINTMENT: sampleEmp.APPOINTMENT,
          Appointment: sampleEmp.Appointment,
          appointment: sampleEmp.appointment
        });
      }
    } catch (error) {
      console.error('Error fetching department employees:', error);
      setDepartmentEmployees([]);
      setFilteredDepartmentEmployees([]);
    } finally {
      setLoadingDepartmentEmployees(false);
    }
  };

  const handleEmployeeSelect = async (employee) => {
    console.log('👤 Employee selected:', employee.NAME);
    setSelectedEmployee(employee);
    setSearchTerm(''); // Clear search term to hide dropdown
    setFilteredEmployees([]);
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
    console.log('👤 Total selected employees:', newSelected.size);
  };

  const handleSelectAllDepartmentEmployees = () => {
    console.log('🔄 Select all department employees toggled');
    if (selectedDepartmentEmployees.size === departmentEmployees.length) {
      // Deselect all
      console.log('❌ Deselecting all employees');
      setSelectedDepartmentEmployees(new Set());
    } else {
      // Select all
      console.log('✅ Selecting all employees');
      const allEmployeeIds = new Set(departmentEmployees.map(emp => emp.USERID));
      setSelectedDepartmentEmployees(allEmployeeIds);
    }
  };

  const handleSelectAllFilteredEmployees = () => {
    console.log('🔄 Select all filtered employees toggled');
    const filteredEmployeeIds = new Set(filteredDepartmentEmployees.map(emp => emp.USERID));
    const allFilteredSelected = filteredEmployeeIds.size > 0 && 
      Array.from(filteredEmployeeIds).every(id => selectedDepartmentEmployees.has(id));
    
    if (allFilteredSelected) {
      // Deselect all filtered employees
      console.log('❌ Deselecting all filtered employees');
      const newSelected = new Set(selectedDepartmentEmployees);
      filteredEmployeeIds.forEach(id => newSelected.delete(id));
      setSelectedDepartmentEmployees(newSelected);
    } else {
      // Select all filtered employees
      console.log('✅ Selecting all filtered employees');
      const newSelected = new Set(selectedDepartmentEmployees);
      filteredEmployeeIds.forEach(id => newSelected.add(id));
      setSelectedDepartmentEmployees(newSelected);
    }
  };

  const handlePrint = () => {
    console.log('🖨️ Opening individual print modal');
    setShowPrintModal(true);
  };

  const handleBulkPrint = () => {
    console.log('🖨️ Opening department print modal');
    console.log('📊 Selected employees for bulk print:', selectedDepartmentEmployees.size);
    
    if (selectedDepartmentEmployees.size === 0) {
      alert('Please select at least one employee to generate the report.');
      return;
    }
    
    setShowBulkPrintModal(true);
  };

  const handleClosePrintModal = () => {
    setShowPrintModal(false);
  };

  const handleCloseBulkPrintModal = () => {
    setShowBulkPrintModal(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Generate DTR Report</h2>
          
          {/* Report Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="individual"
                  checked={reportType === 'individual'}
                  onChange={(e) => setReportType(e.target.value)}
                  className="mr-2"
                />
                Individual
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="department"
                  checked={reportType === 'department'}
                  onChange={(e) => setReportType(e.target.value)}
                  className="mr-2"
                />
                Multiple
              </label>
            </div>
          </div>

          {reportType === 'individual' ? (
            <>
              {/* Employee Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Employee
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or badge number..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {filteredEmployees.length > 0 && !selectedEmployee && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredEmployees.map((emp) => (
                        <div
                          key={emp.USERID}
                          onClick={() => handleEmployeeSelect(emp)}
                          className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0 flex items-center space-x-3"
                        >
                          {/* Employee Photo */}
                          <div className="flex-shrink-0">
                            {emp.PHOTO ? (
                              <img
                                src={emp.PHOTO}
                                alt={emp.NAME}
                                className="w-10 h-10 rounded-full object-cover border border-gray-300"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  if (e.target.nextSibling) {
                                    e.target.nextSibling.style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}
                            <div 
                              className={`w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm font-medium ${emp.PHOTO ? 'hidden' : ''}`}
                            >
                              {emp.NAME ? emp.NAME.charAt(0).toUpperCase() : '?'}
                            </div>
                          </div>
                          
                          {/* Employee Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">{emp.NAME}</div>
                            {(emp.DEPTNAME || emp.POSITION) && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                {[emp.DEPTNAME, emp.POSITION].filter(Boolean).join(' - ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Employee Display */}
              {selectedEmployee && (
                <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-4">
                    {/* Employee Photo */}
                    <div className="flex-shrink-0">
                      {selectedEmployee.PHOTO ? (
                        <img
                          src={selectedEmployee.PHOTO}
                          alt={selectedEmployee.NAME}
                          className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xl font-medium border-2 border-gray-300 ${selectedEmployee.PHOTO ? 'hidden' : ''}`}
                      >
                        {selectedEmployee.NAME ? selectedEmployee.NAME.charAt(0).toUpperCase() : '?'}
                    </div>
                    </div>
                    
                    {/* Employee Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg text-gray-900 mb-1">{selectedEmployee.NAME}</h3>
                      <div className="space-y-1">
                        {selectedEmployee.DEPTNAME && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Department:</span> {selectedEmployee.DEPTNAME}
                          </p>
                        )}
                        {selectedEmployee.POSITION && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Position:</span> {selectedEmployee.POSITION}
                          </p>
                        )}
                        {(selectedEmployee.APPOINTMENT_NAME || selectedEmployee.APPOINTMENT || selectedEmployee.Appointment || selectedEmployee.appointmentstatus) && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Appointment:</span> {selectedEmployee.APPOINTMENT_NAME || getAppointmentName(selectedEmployee.APPOINTMENT || selectedEmployee.Appointment || selectedEmployee.appointmentstatus)}
                          </p>
                        )}
                        {!selectedEmployee.APPOINTMENT_NAME && !selectedEmployee.APPOINTMENT && !selectedEmployee.Appointment && !selectedEmployee.appointmentstatus && (
                          <p className="text-sm text-gray-500">
                            <span className="font-medium">Appointment:</span> N/A
                          </p>
                        )}
                    </div>
                    </div>
                    
                    {/* Clear Selection Button */}
                    <button
                      onClick={() => {
                        setSelectedEmployee(null);
                        setSearchTerm('');
                      }}
                      className="flex-shrink-0 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Month Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a month...</option>
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Period Selection */}
              {selectedMonth && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Period
                  </label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {periodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Generate Button */}
              {selectedEmployee && selectedMonth && (
                <button
                  onClick={() => setShowPrintOptionsModal(true)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Generate Report
                </button>
              )}
            </>
          ) : (
            <>
              {/* Department, Appointment, and Status Filters - Inline with other filters */}
              <div className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <option key={dept.deptid || dept.DEPTID} value={dept.departmentshortname || dept.DEPARTMENTSHORTNAME || dept.departmentname || dept.DEPTNAME}>
                          {dept.departmentshortname || dept.DEPARTMENTSHORTNAME || dept.departmentname || dept.DEPTNAME}
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
                      <option value="all">All Status</option>
                      {employeeStatusTypes.map((status) => (
                        <option key={status.empstatid} value={status.empstatid}>
                          {status.empstatname}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Month and Period Selection - Below the filters with light green highlighting */}
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Month
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Select a month...</option>
                      {monthOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Period
                    </label>
                    <select
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {periodOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Department Employee Selection */}
              {(departmentEmployees.length > 0 || loadingDepartmentEmployees) && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Select Employees {selectedDepartment ? `from ${selectedDepartment}` : ''} ({departmentEmployees.length} found)
                    </h3>
                    {loadingDepartmentEmployees && (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm text-gray-600">Loading employees...</span>
                      </div>
                    )}
                  </div>

                  {/* Employee Search Field */}
                  <div className="mb-4">
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
                      <p className="mt-1 text-sm text-gray-600">
                        Showing {filteredDepartmentEmployees.length} of {departmentEmployees.length} employees
                      </p>
                    )}
                  </div>

                  {/* Select All/None Buttons */}
                  <div className="mb-4 flex space-x-2">
                    <button
                      onClick={() => {
                        const allIds = filteredDepartmentEmployees.map(emp => emp.USERID);
                        setSelectedDepartmentEmployees(new Set(allIds));
                      }}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Select All ({filteredDepartmentEmployees.length})
                    </button>
                    <button
                      onClick={() => setSelectedDepartmentEmployees(new Set())}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Select None
                    </button>
                    {selectedDepartmentEmployees.size > 0 && (
                      <span className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded">
                        {selectedDepartmentEmployees.size} selected
                      </span>
                    )}
                  </div>

                  {/* Employee List */}
                  <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
                      {filteredDepartmentEmployees.map((emp) => (
                        <div key={emp.USERID} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                          <input
                            type="checkbox"
                            id={`emp-${emp.USERID}`}
                            checked={selectedDepartmentEmployees.has(emp.USERID)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedDepartmentEmployees);
                              if (e.target.checked) {
                                newSelected.add(emp.USERID);
                              } else {
                                newSelected.delete(emp.USERID);
                              }
                              setSelectedDepartmentEmployees(newSelected);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                          />
                          <label htmlFor={`emp-${emp.USERID}`} className="flex-1 cursor-pointer flex items-center space-x-3">
                            {/* Employee Photo */}
                            <div className="flex-shrink-0">
                              {emp.PHOTO ? (
                                <img
                                  src={emp.PHOTO}
                                  alt={emp.NAME}
                                  className="w-10 h-10 rounded-full object-cover border border-gray-300"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    if (e.target.nextSibling) {
                                      e.target.nextSibling.style.display = 'flex';
                                    }
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm font-medium border border-gray-300 ${emp.PHOTO ? 'hidden' : ''}`}
                              >
                                {emp.NAME ? emp.NAME.charAt(0).toUpperCase() : '?'}
                              </div>
                            </div>
                            
                            {/* Employee Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900">{emp.NAME}</div>
                              {(emp.DEPTNAME || emp.POSITION) && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {[emp.DEPTNAME, emp.POSITION].filter(Boolean).join(' - ')}
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              {selectedDepartmentEmployees.size > 0 && selectedMonth && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowBulkPrintOptionsModal(true)}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Generate Report ({selectedDepartmentEmployees.size} employees)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Print Options Modal - Individual */}
        {showPrintOptionsModal && selectedEmployee && selectedMonth && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">Print Options</h2>
              
              {/* Print Format Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Print Format</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="printFormat"
                      value="basic"
                      checked={printFormat === 'basic'}
                      onChange={(e) => setPrintFormat(e.target.value)}
                      className="mr-2"
                    />
                    <span>Basic Format</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="printFormat"
                      value="annotations"
                      checked={printFormat === 'annotations'}
                      onChange={(e) => setPrintFormat(e.target.value)}
                      className="mr-2"
                    />
                    <span>With Annotations</span>
                  </label>
                </div>
              </div>

              {/* Annotation Selection (only shown when "With Annotations" is selected) */}
              {printFormat === 'annotations' && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700">Select Annotations</label>
                    <div className="space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnnotations({
                            locator: true,
                            fixlog: true,
                            leave: true,
                            travel: true,
                            cdo: true,
                            holiday: true,
                            weekend: true,
                            absent: true
                          });
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnnotations({
                            locator: false,
                            fixlog: false,
                            leave: false,
                            travel: false,
                            cdo: false,
                            holiday: false,
                            weekend: false,
                            absent: false
                          });
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.locator}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, locator: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">📌 Locator Backfill</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.fixlog}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, fixlog: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">🔒 Fix Log Override</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.leave}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, leave: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Leave</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.travel}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, travel: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Travel</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.cdo}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, cdo: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">CDO</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.holiday}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, holiday: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Holiday</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.weekend}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, weekend: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Weekend</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAnnotations.absent}
                        onChange={(e) => setSelectedAnnotations({ ...selectedAnnotations, absent: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Absent</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowPrintOptionsModal(false);
                    setPrintFormat('basic');
                  }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPrintOptionsModal(false);
                    setShowPrintModal(true);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Print Options Modal - Department */}
        {showBulkPrintOptionsModal && selectedDepartmentEmployees.size > 0 && selectedMonth && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">Print Options</h2>
              
              {/* Print Format Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Print Format</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="bulkPrintFormat"
                      value="basic"
                      checked={bulkPrintFormat === 'basic'}
                      onChange={(e) => setBulkPrintFormat(e.target.value)}
                      className="mr-2"
                    />
                    <span>Basic Format</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="bulkPrintFormat"
                      value="annotations"
                      checked={bulkPrintFormat === 'annotations'}
                      onChange={(e) => setBulkPrintFormat(e.target.value)}
                      className="mr-2"
                    />
                    <span>With Annotations</span>
                  </label>
                </div>
              </div>

              {/* Annotation Selection (only shown when "With Annotations" is selected) */}
              {bulkPrintFormat === 'annotations' && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700">Select Annotations</label>
                    <div className="space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkSelectedAnnotations({
                            locator: true,
                            fixlog: true,
                            leave: true,
                            travel: true,
                            cdo: true,
                            holiday: true,
                            weekend: true,
                            absent: true
                          });
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkSelectedAnnotations({
                            locator: false,
                            fixlog: false,
                            leave: false,
                            travel: false,
                            cdo: false,
                            holiday: false,
                            weekend: false,
                            absent: false
                          });
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.locator}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, locator: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">📌 Locator Backfill</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.fixlog}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, fixlog: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">🔒 Fix Log Override</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.leave}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, leave: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Leave</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.travel}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, travel: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Travel</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.cdo}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, cdo: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">CDO</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.holiday}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, holiday: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Holiday</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.weekend}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, weekend: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Weekend</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelectedAnnotations.absent}
                        onChange={(e) => setBulkSelectedAnnotations({ ...bulkSelectedAnnotations, absent: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Absent</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowBulkPrintOptionsModal(false);
                    setBulkPrintFormat('basic');
                  }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowBulkPrintOptionsModal(false);
                    setShowBulkPrintModal(true);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Print Modals */}
        {showPrintModal && selectedEmployee && selectedMonth && printFormat === 'basic' && (
          <GenerateDTRPrint_Ind
            employee={selectedEmployee}
            selectedMonth={selectedMonth}
            selectedPeriod={selectedPeriod}
            onClose={() => {
              setShowPrintModal(false);
              setPrintFormat('basic');
            }}
          />
        )}

        {showPrintModal && selectedEmployee && selectedMonth && printFormat === 'annotations' && (
          <GenerateDTRPrintReportWithAnnotations
            employee={selectedEmployee}
            selectedMonth={selectedMonth}
            selectedPeriod={selectedPeriod}
            selectedAnnotations={selectedAnnotations}
            onClose={() => {
              setShowPrintModal(false);
              setPrintFormat('basic');
            }}
          />
        )}

        {showBulkPrintModal && selectedDepartmentEmployees.size > 0 && selectedMonth && bulkPrintFormat === 'basic' && (
          <GenerateDTRPrint_Dept
            department={selectedDepartment}
            selectedEmployees={selectedDepartmentEmployees}
            selectedMonth={selectedMonth}
            selectedPeriod={selectedPeriod}
            selectedStatus={selectedStatus}
            selectedAppointment={selectedAppointment}
            departmentEmployees={departmentEmployees}
            onClose={() => {
              setShowBulkPrintModal(false);
              setBulkPrintFormat('basic');
            }}
          />
        )}

        {showBulkPrintModal && selectedDepartmentEmployees.size > 0 && selectedMonth && bulkPrintFormat === 'annotations' && (
          <GenerateDTRPrintReportWithAnnotations
            department={selectedDepartment}
            selectedEmployees={selectedDepartmentEmployees}
            selectedMonth={selectedMonth}
            selectedPeriod={selectedPeriod}
            selectedStatus={selectedStatus}
            selectedAppointment={selectedAppointment}
            departmentEmployees={departmentEmployees}
            selectedAnnotations={bulkSelectedAnnotations}
            onClose={() => {
              setShowBulkPrintModal(false);
              setBulkPrintFormat('basic');
            }}
          />
        )}
      </div>
    </div>
  );
};

export default GenerateDTRReport;
