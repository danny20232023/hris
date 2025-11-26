import React, { useRef, useState, useEffect } from 'react';
import { getEmployeeShiftSchedule, generateDateRange } from '../../utils/shiftScheduleUtils';
import api from '../../utils/api';
import { getAppointmentOptions } from '../../utils/appointmentLookup';
import { useAuth } from '../../authContext';

// Get month name and year for display
const getMonthYearDisplay = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${month} ${year}`;
};

// Get month year display with period information
const getMonthYearDisplayWithPeriod = (dateStr, selectedPeriod) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  
  // Get the last day of the month
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  
  switch (selectedPeriod) {
    case 'first_half':
      return `${month} 1-15, ${year}`;
    case 'second_half':
      return `${month} 16-${lastDay}, ${year}`;
    case 'full':
    default:
      return `${month} ${year}`;
  }
};

// Date formatting for "20-Aug-2025, Fri"
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const weekday = date.toLocaleString('en-US', { weekday: 'short' });
  return `${day}-${month}-${year}, ${weekday.toUpperCase()}`;
};

// Check if date is weekend
const isWeekend = (dateStr) => {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
};

// Utility functions from TimeLogsManagement
const extractTime = (value) => {
  if (!value) return '';
  // Extract time from datetime string (HH:MM:SS or HH:MM)
  if (typeof value === 'string') {
    const timeMatch = value.match(/(\d{2}:\d{2})(?::\d{2})?/);
    return timeMatch ? timeMatch[1] : value;
  }
  return value;
};

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  // Extract time portion if it's a datetime string
  const timeOnly = extractTime(timeStr);
  const [hours, minutes] = timeOnly.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper to extract time from string (from TimeLogsManagement)
const extractTimeFromString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const timeMatch = value.match(/(\d{2}:\d{2})(?::\d{2})?/);
    return timeMatch ? timeMatch[1] : value;
  }
  return value;
};

// Helper to get time window from shiftSchedule
const getTimeWindow = (start, end) => {
  if (!start || !end) return [null, null];
  return [timeToMinutes(start), timeToMinutes(end)];
};

// Helper to validate if time is within window
const validateTimeInWindow = (timeStr, startWindow, endWindow) => {
  if (!timeStr || !startWindow || !endWindow) return false;
  const timeInMinutes = timeToMinutes(timeStr);
  return timeInMinutes >= startWindow && timeInMinutes <= endWindow;
};

// Local date range generation function (without timezone conversion)
const generateLocalDateRange = (startDate, endDate) => {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    // Use local date formatting without timezone conversion
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    dates.push(dateStr);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

// New function to calculate date range based on period
const calculateDateRangeByPeriod = (selectedMonth, selectedPeriod) => {
  if (!selectedMonth || !selectedPeriod) return null;

  const monthDate = new Date(selectedMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  let startDate, endDate;

  switch (selectedPeriod) {
    case 'first_half':
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month, 15);
      break;
    case 'second_half':
      startDate = new Date(year, month, 16);
      endDate = new Date(year, month + 1, 0); // Last day of the month
      break;
    case 'full':
    default:
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0); // Last day of the month
      break;
  }

  // Return dates without conversion
  return {
    startDate,
    endDate,
    startDateStr: selectedMonth, // Use original selectedMonth format
    endDateStr: endDate.toISOString().split('T')[0] // Only convert end date for API
  };
};

// New function to get ALL days of the month for display
const getAllDaysOfMonth = (selectedMonth) => {
  if (!selectedMonth) return null;

  const monthDate = new Date(selectedMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0); // Last day of the month

  // Return dates without conversion
  return {
    startDate,
    endDate,
    startDateStr: selectedMonth, // Use original selectedMonth format
    endDateStr: endDate.toISOString().split('T')[0] // Only convert end date for API
  };
};

// Helper function to check if a date is within the selected period
const isDateInSelectedPeriod = (dateStr, selectedMonth, selectedPeriod) => {
  if (!selectedPeriod || selectedPeriod === 'full') return true;

  // Extract day directly from dateStr without conversion
  const day = parseInt(dateStr.split('-')[2]);

  switch (selectedPeriod) {
    case 'first_half':
      return day >= 1 && day <= 15;
    case 'second_half':
      return day >= 16;
    default:
      return true;
  }
};

function GenerateDTRPrint_Dept({ 
  department, 
  selectedMonth, 
  selectedPeriod = 'full', // New prop with default value
  selectedStatus = 'active', // Updated default to 'active'
  selectedAppointment = 'all', // New prop for appointment filter
  selectedEmployees = new Set(), // New prop for pre-selected employees
  departmentEmployees = [], // New prop for department employees
  onClose 
}) {
  const printRef = useRef();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false); // Changed from true to false
  const [departmentData, setDepartmentData] = useState({});
  const [error, setError] = useState(null);
  const [processingData, setProcessingData] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({ lguDtrName: '' });

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    } else {
      console.warn('GenerateDTRPrint_Dept: onClose handler not provided');
    }
  };

  // Convert selectedEmployees Set to finalSelectedEmployees for compatibility
  const finalSelectedEmployees = selectedEmployees;

  useEffect(() => {
    console.log('🚀 GenerateDTRPrint_Dept Component Mounted/Updated:', {
      department,
      selectedMonth,
      selectedPeriod,
      selectedStatus,
      selectedAppointment,
      timestamp: new Date().toISOString()
    });
  }, [department, selectedMonth, selectedPeriod, selectedStatus, selectedAppointment]); // Added selectedAppointment to dependencies

  // Fetch company info for footer
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const response = await api.get('/company/info');
        if (response.data.success) {
          setCompanyInfo(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching company info:', error);
      }
    };
    fetchCompanyInfo();
  }, []);

  // Fetch data immediately when component mounts
  useEffect(() => {
    if (selectedMonth && finalSelectedEmployees.size > 0) {
      fetchSelectedEmployeeData();
    }
  }, [department, selectedMonth, selectedPeriod, finalSelectedEmployees]); // Added selectedPeriod to dependencies

  const fetchSelectedEmployeeData = async () => {
    console.log('🔄 Starting data fetch for selected employees...');
    console.log('📊 Input parameters:', {
      department,
      selectedMonth,
      selectedPeriod,
      selectedStatus,
      selectedAppointment,
      selectedEmployeesCount: finalSelectedEmployees.size
    });

    setLoading(true);
    setProcessingData(true);
    setError(null);
    setDepartmentData({});

    try {
      const newDepartmentData = {};

      // Process each selected employee
      for (const employeeId of finalSelectedEmployees) {
        console.log(`🔄 Processing employee ID: ${employeeId}`);

        // Find employee data from departmentEmployees prop
        const employee = departmentEmployees.find(emp => emp.USERID === parseInt(employeeId));
        
        if (!employee) {
          console.warn(`⚠️ Employee with ID ${employeeId} not found in departmentEmployees`);
          continue;
        }

        console.log(`✅ Found employee: ${employee.NAME}`);

          // Fetch shift schedule
        const scheduleResponse = await api.get(`/employees/${employee.USERID}/shift-schedule`);
        const shiftSchedule = scheduleResponse.data.success ? scheduleResponse.data.data : null;
          console.log(`📅 Shift schedule for ${employee.NAME}:`, shiftSchedule);

        // Fetch time logs with period filtering
          const logsResponse = await api.get(`/logs/${employee.USERID}`, {
          params: {
            startDate: calculateDateRangeByPeriod(selectedMonth, selectedPeriod).startDateStr,
            endDate: calculateDateRangeByPeriod(selectedMonth, selectedPeriod).endDateStr
          }
          });

          const logs = Array.isArray(logsResponse.data) ? logsResponse.data : [];
          console.log(`⏰ Time logs for ${employee.NAME}:`, logs.length, 'logs');

        // Process logs - Pass the full month range for display but period data for processing
        const displayDateRange = getAllDaysOfMonth(selectedMonth);
        const processedResult = processEmployeeLogs(logs, shiftSchedule, displayDateRange.startDate, displayDateRange.endDate, employee.NAME, selectedPeriod);
          console.log(`✅ Processed ${processedResult.processed.length} days for ${employee.NAME}`);

          newDepartmentData[employee.USERID] = {
            employee,
            shiftSchedule,
            logs,
          processed: processedResult.processed,
            totals: processedResult.totals,
          undertime: processedResult.undertime
        };
      }

      console.log('✅ All employee data processed:', Object.keys(newDepartmentData).length, 'employees');
      setDepartmentData(newDepartmentData);
      setProcessingData(false);
    } catch (error) {
      console.error('❌ Error fetching department data:', error);
      setError(error.message || 'Failed to load department data');
      setProcessingData(false);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get employee status based on privilege column (same logic as GenerateDTRReport)
  const getEmployeeStatus = (employee) => {
    const privilege = employee.privilege;
    
    if (privilege === null || privilege === undefined) {
      return 'Inactive'; // Default to inactive if privilege is not set
    }
    
    // Convert to number if it's a string
    const privilegeValue = typeof privilege === 'string' ? parseInt(privilege, 10) : privilege;
    
    // If privilege is 0 or greater than 0, employee is active
    // If privilege is below 0 or -1, employee is inactive
    if (privilegeValue >= 0) {
      return 'Active';
    } else {
      return 'Inactive';
    }
  };

  // Helper function to check if employee matches filters
  const employeeMatchesFilters = (employee) => {
    // Check department filter
    if (department && employee.DEPTNAME !== department) {
      return false;
    }

    // Check status filter using privilege field
    if (selectedStatus !== 'all') {
      const isActive = getEmployeeStatus(employee) === 'Active';
      if (selectedStatus === 'active' && !isActive) {
        return false;
      }
      if (selectedStatus === 'inactive' && isActive) {
        return false;
      }
    }

    // Check appointment filter
    if (selectedAppointment !== 'all' && employee.APPOINTMENT !== selectedAppointment) {
      return false;
    }

    return true;
  };

  const processEmployeeLogs = (logs, schedule, startDate, endDate, employeeName, selectedPeriod) => {
    console.log(`🔄 Starting log processing for ${employeeName}...`);
    console.log('📊 Input data:', { 
      logsCount: logs.length, 
      schedule: schedule, 
      startDate: startDate, 
      endDate: endDate,
      selectedPeriod: selectedPeriod
    });

    // DEBUG: Log sample of actual log data
    if (logs.length > 0) {
      console.log(' Sample log data:', {
        firstLog: logs[0],
        lastLog: logs[logs.length - 1],
        totalLogs: logs.length
      });
    }

    // Generate date range without timezone conversion for ALL days of month
    const dateRange = generateLocalDateRange(startDate, endDate); // Use local date range
    
    console.log(`📅 Generated local date range for ${employeeName}:`, {
      startDate: startDate,
      endDate: endDate,
      totalDays: dateRange.length,
      firstDay: dateRange[0],
      lastDay: dateRange[dateRange.length - 1],
      fullRange: dateRange
    });

    // Get time windows from shiftSchedule (same logic as TimeLogsManagement)
    const amCheckOutStart = schedule?.SHIFT_AMCHECKOUT_START ? extractTimeFromString(schedule.SHIFT_AMCHECKOUT_START) : "11:00";
    const amCheckOutEnd = schedule?.SHIFT_AMCHECKOUT_END ? extractTimeFromString(schedule.SHIFT_AMCHECKOUT_END) : "12:30";
    const pmCheckInStart = schedule?.SHIFT_PMCHECKIN_START ? extractTimeFromString(schedule.SHIFT_PMCHECKIN_START) : "12:31";
    const pmCheckInEnd = schedule?.SHIFT_PMCHECKIN_END ? extractTimeFromString(schedule.SHIFT_PMCHECKIN_END) : "14:00";
    
    const [amCheckOutStartMin, amCheckOutEndMin] = getTimeWindow(amCheckOutStart, amCheckOutEnd);
    const [pmCheckInStartMin, pmCheckInEndMin] = getTimeWindow(pmCheckInStart, pmCheckInEnd);

    console.log('⏰ Time windows:', {
      amCheckOutStart,
      amCheckOutEnd,
      pmCheckInStart,
      pmCheckInEnd,
      amCheckOutStartMin,
      amCheckOutEndMin,
      pmCheckInStartMin,
      pmCheckInEndMin
    });

    const processed = [];
    let totalDays = 0;
    let totalLate = 0;
    let totalUndertimeMinutes = 0;

    for (let i = 0; i < dateRange.length; i++) {
      const dateStr = dateRange[i];
      const day = i + 1;
      const isWeekendDay = isWeekend(dateStr);
      const isInPeriod = isDateInSelectedPeriod(dateStr, selectedMonth, selectedPeriod);
      
      // Only process logs for dates within the selected period
      let dayLogs = [];
      if (isInPeriod) {
        dayLogs = logs.filter(log => {
          // Handle different possible date formats in CHECKTIME
          let logDateStr = '';
          if (log.CHECKTIME) {
            // If CHECKTIME is a datetime string, extract date part
            if (log.CHECKTIME.includes(' ')) {
              logDateStr = log.CHECKTIME.split(' ')[0];
            } else if (log.CHECKTIME.includes('T')) {
              logDateStr = log.CHECKTIME.split('T')[0];
            } else {
              logDateStr = log.CHECKTIME;
            }
          }
          
          // Debug: Log the comparison for debugging
          if (dateStr === '2024-08-01' || dateStr === '2024-08-02') {
            console.log(`🔍 Date comparison for ${dateStr} (${employeeName}):`, {
              logDateStr,
              dateStr,
              matches: logDateStr === dateStr,
              checktime: log.CHECKTIME
            });
          }
          
          return logDateStr === dateStr;
        });
      }

      console.log(`📅 Processing ${dateStr} (Day ${day}) for ${employeeName} - In period: ${isInPeriod}:`, dayLogs.length, 'logs');
      if (dayLogs.length > 0) {
        console.log(' Sample day logs:', dayLogs.map(log => ({
          CHECKTIME: log.CHECKTIME,
          extractedTime: extractTime(log.CHECKTIME),
          extractedDate: log.CHECKTIME ? log.CHECKTIME.split(' ')[0] : 'N/A'
        })));
      }

      // PROPER LOG GROUPING BASED ON SHIFT SCHEDULE TIME WINDOWS
      let AM_CHECKIN = '';
      let AM_CHECKOUT = '';
      let PM_CHECKIN = '';
      let PM_CHECKOUT = '';

      if (dayLogs.length > 0) {
        // AM CheckIN: earliest before 12:00 (same as TimeLogsManagement)
        const amInLogs = dayLogs
          .filter(log => {
            const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
            return t && timeToMinutes(t) < 12 * 60;
          })
          .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

        if (amInLogs.length > 0) {
          AM_CHECKIN = extractTimeFromString(amInLogs[0].CHECKTIME || amInLogs[0].DATE || amInLogs[0].date);
        }

        // AM CheckOUT: earliest in AM checkout window
        const amOutLogs = dayLogs
          .filter(log => {
            const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
            return t && validateTimeInWindow(t, amCheckOutStartMin, amCheckOutEndMin);
          })
          .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

        if (amOutLogs.length > 0) {
          AM_CHECKOUT = extractTimeFromString(amOutLogs[0].CHECKTIME || amOutLogs[0].DATE || amOutLogs[0].date);
        }

        // PM CheckIN: earliest in PM checkin window
        const pmInLogs = dayLogs
          .filter(log => {
            const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
            return t && validateTimeInWindow(t, pmCheckInStartMin, pmCheckInEndMin);
          })
          .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

        if (pmInLogs.length > 0) {
          PM_CHECKIN = extractTimeFromString(pmInLogs[0].CHECKTIME || pmInLogs[0].DATE || pmInLogs[0].date);
        }

        // PM CheckOUT: latest after PM checkin window
        const pmOutLogs = dayLogs
          .filter(log => {
            const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
            return t && timeToMinutes(t) > pmCheckInEndMin;
          })
          .sort((a, b) => timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)) - timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)));

        if (pmOutLogs.length > 0) {
          PM_CHECKOUT = extractTimeFromString(pmOutLogs[0].CHECKTIME || pmOutLogs[0].DATE || pmOutLogs[0].date);
        }
      }

      console.log(`⏰ Properly grouped times for ${dateStr} (${employeeName}):`, { 
        AM_CHECKIN, 
        AM_CHECKOUT, 
        PM_CHECKIN, 
        PM_CHECKOUT,
        totalLogs: dayLogs.length
      });

      // Calculate late minutes (only for dates in period)
      let lateMinutes = 0;
      if (isInPeriod && schedule) {
        // AM_CHECKIN late calculation
        if (AM_CHECKIN && schedule.SHIFT_AMCHECKIN) {
          const expectedAMTime = timeToMinutes(extractTimeFromString(schedule.SHIFT_AMCHECKIN));
          const actualAMTime = timeToMinutes(AM_CHECKIN);
          if (actualAMTime > expectedAMTime) {
            lateMinutes += actualAMTime - expectedAMTime;
          }
        }
        
        // PM_CHECKIN late calculation
        if (PM_CHECKIN && schedule.SHIFT_PMCHECKIN) {
          const expectedPMTime = timeToMinutes(extractTimeFromString(schedule.SHIFT_PMCHECKIN));
          const actualPMTime = timeToMinutes(PM_CHECKIN);
          if (actualPMTime > expectedPMTime) {
            lateMinutes += actualPMTime - expectedPMTime;
          }
        }
      }

      // Calculate undertime (only for dates in period)
        let undertimeMinutes = 0;
      if (isInPeriod && schedule) {
        if (AM_CHECKOUT && schedule.SHIFT_AMCHECKOUT) {
          const expectedAmOut = extractTime(schedule.SHIFT_AMCHECKOUT);
          undertimeMinutes += Math.max(0, timeToMinutes(expectedAmOut) - timeToMinutes(AM_CHECKOUT));
        }
        if (PM_CHECKOUT && schedule.SHIFT_PMCHECKOUT) {
          const expectedPmOut = extractTime(schedule.SHIFT_PMCHECKOUT);
          undertimeMinutes += Math.max(0, timeToMinutes(expectedPmOut) - timeToMinutes(PM_CHECKOUT));
        }
      }

      // Generate remarks
      let remarks = '';
      if (isWeekendDay) {
        remarks = 'Weekend';
      } else if (isInPeriod) {
        const timeLogCount = [AM_CHECKIN, AM_CHECKOUT, PM_CHECKIN, PM_CHECKOUT].filter(log => log && log.trim() !== '').length;
        if (timeLogCount === 0) {
          remarks = 'Absent';
        } else if (lateMinutes > 0) {
          remarks = `Late ${lateMinutes} min`;
        }
      }

      // Calculate days credit (only for dates in period with logs and not weekend)
      const timeLogCount = [AM_CHECKIN, AM_CHECKOUT, PM_CHECKIN, PM_CHECKOUT].filter(log => log && log.trim() !== '').length;
      const daysCredit = (isInPeriod && timeLogCount > 0 && !isWeekendDay) ? 1 : 0;

      processed.push({
        day,
        date: dateStr,
        amIn: isInPeriod ? AM_CHECKIN : '',
        amOut: isInPeriod ? AM_CHECKOUT : '',
        pmIn: isInPeriod ? PM_CHECKIN : '',
        pmOut: isInPeriod ? PM_CHECKOUT : '',
        late: isInPeriod && lateMinutes > 0 ? `${lateMinutes} min` : '',
        undertime: isInPeriod && undertimeMinutes > 0 ? `${undertimeMinutes} min` : '',
        undertimeHours: isInPeriod && undertimeMinutes > 0 ? Math.floor(undertimeMinutes / 60) : '',
        undertimeMinutes: isInPeriod && undertimeMinutes > 0 ? (undertimeMinutes % 60) : '',
        days: daysCredit,
        remarks,
        isWeekend: isWeekendDay,
        isInPeriod: isInPeriod
      });

      // Update totals (only for dates in period)
      if (isInPeriod && timeLogCount > 0 && !isWeekendDay) {
        totalDays++;
        totalLate += lateMinutes;
      totalUndertimeMinutes += undertimeMinutes;
      }
    }

    console.log('✅ Final totals:', {
      totalDays,
      totalLate,
      totalUndertimeMinutes
    });

    return {
      processed,
      totals: { days: totalDays, late: totalLate },
      undertime: { hours: Math.floor(totalUndertimeMinutes / 60), minutes: totalUndertimeMinutes % 60 }
    };
  };

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    
    // Get current date/time and user info for footer
    const now = new Date();
    const printDateTime = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const systemName = companyInfo.lguDtrName || 'HRIS System';
    const printedBy = user?.id || user?.USERID || user?.username || 'System';
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DTR Print</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 8mm;
              }
              body { 
                margin: 0; 
                padding: 0; 
                font-family: Arial, sans-serif;
                font-size: 6px;
                line-height: 1.1;
              }
              .no-print { display: none !important; }
              
              /* Page Break Controls - Each employee on separate page */
              .page-break {
                page-break-before: always;
                page-break-inside: avoid;
                break-before: page;
                break-inside: avoid;
              }
              
              /* First employee should not have page break before */
              .page-break:first-child {
                page-break-before: auto;
                break-before: auto;
              }
              
              /* Ensure each employee section stays together */
              .employee-dtr-section {
                page-break-inside: avoid;
                break-inside: avoid;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
              }
              
              /* Header Styles - Compact for space */
              .header { 
                text-align: center; 
                margin-bottom: 6px; 
                font-size: 10px;
              }
              .header h1 { 
                font-size: 12px; 
                font-weight: bold; 
                margin: 0 0 1px 0;
                line-height: 1.1;
              }
              .header h2 { 
                font-size: 11px; 
                font-weight: bold; 
                margin: 0 0 1px 0;
                line-height: 1.1;
              }
              .header h3 { 
                font-size: 10px; 
                font-weight: bold; 
                margin: 0 0 1px 0;
                line-height: 1.1;
              }
              .header p { 
                font-size: 8px; 
                margin: 0 0 1px 0;
                line-height: 1.1;
              }
              
              /* Employee Name - Blue Color */
              .employee-name {
                color: #0066cc !important;
                font-weight: bold;
                font-size: 11px;
              }
              
              /* Weekend day styling */
              .weekend-day {
                color: #0066cc !important; /* Blue color for weekends */
                font-weight: bold;
              }
              
              /* Table Styles - 40% increase in row height from default */
              table { 
                border-collapse: collapse; 
                width: 100%; 
                font-size: 10px;
                margin-bottom: 8px;
                table-layout: fixed;
                height: auto;
              }
              th, td { 
                border: 0.5px solid #000; 
                padding: 2.8px 1px; /* 40% increase from 2px */
                text-align: center; 
                vertical-align: middle;
                font-size: 11px; /* 30% increase from 6px: 6px + 5px */
                line-height: 1.0;
                height: 14px; /* 40% increase from 10px */
              }
              th { 
                font-weight: bold; 
                background-color: #d3d3d3 !important; /* Light grey header */
                font-size: 11px; /* 30% increase from 6px: 6px + 5px */
                height: 16.8px; /* 40% increase from 12px */
              }
              
              /* Column widths for better A4 utilization */
              .col-day { width: 6%; }
              .col-am-arrival { width: 13%; }
              .col-am-departure { width: 13%; }
              .col-pm-arrival { width: 13%; }
              .col-pm-departure { width: 13%; }
              .col-undertime-hours { width: 6%; }
              .col-undertime-minutes { width: 6%; }
              .col-days { width: 7%; }
              .col-late { width: 7%; }
              
              /* Footer Styles - Compact */
              .footer { 
                margin-top: 6px; 
                font-size: 8px;
                background-color: #f5f5f5 !important; /* Light grey footer */
                padding: 6px;
                border: 1px solid #ddd;
              }
              .footer p { 
                margin: 0 0 2px 0; 
                font-size: 8px;
                line-height: 1.1;
              }
              .footer p.text-right {
                text-align: right !important;
              }
              .footer .mb-2 {
                margin-bottom: 8px !important;
              }
              .signature-line { 
                margin-top: 4px; 
                text-align: right; 
              }
              .signature-line .line { 
                border-bottom: 1px solid #000; 
                display: inline-block; 
                width: 120px; 
              }
              .signature-line .label { 
                text-align: right !important; /* Right align the "In Charge" label */
                width: 100%; 
                margin-top: 1px; 
                font-size: 8px;
                padding-right: 0;
              }
              
              /* Fit to page container - No height restrictions */
              .print-container {
                height: auto;
                width: 100%;
                overflow: visible;
              }
              .table-container {
                height: auto;
                overflow: visible;
              }
              
              /* Totals row styling */
              .totals-row {
                background-color: #d3d3d3 !important; /* Light grey totals row */
                font-weight: bold;
                height: 16.8px; /* 40% increase from 12px to match header */
              }
              
              /* System-generated document footer */
              .system-footer {
                margin-top: 8px;
                padding-top: 4px;
                border-top: 1px solid #ddd;
                font-size: 7px;
                color: #666;
                text-align: center;
                line-height: 1.2;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${printContents}
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  // Enhanced debugging - log render state
  console.log('🔍 GenerateDTRPrint_Dept Render Debug:', {
    loading,
    error,
    processingData,
    departmentDataCount: Object.keys(departmentData).length,
    selectedEmployeesCount: finalSelectedEmployees.size,
    department,
    selectedMonth,
    selectedPeriod,
    selectedStatus,
    selectedAppointment
  });

  // Debug: Log which render path will be taken
  if (loading) {
    console.log('🔄 RENDER PATH: Loading state');
  } else if (error) {
    console.log('❌ RENDER PATH: Error state');
  } else if (processingData) {
    console.log('⏳ RENDER PATH: Processing data state');
  } else {
    console.log('📊 RENDER PATH: Report preview');
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Loading department employees...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg max-w-md">
          <h3 className="text-lg font-semibold text-red-600 mb-2">Error Loading Data</h3>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={handleClose}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (processingData) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Processing employee data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">DTR Print Preview - {department} ({finalSelectedEmployees.size} employees)</h2>
          <div className="space-x-2">
            <button
              onClick={handlePrint}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Print
            </button>
          <button
            onClick={handleClose}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
              Close
          </button>
          </div>
        </div>

          <div ref={printRef}>
            {/* Department Report Content */}
          {Object.keys(departmentData).length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-600 mb-4">
                  No data available for the selected employees.
                </div>
                <div className="text-sm text-gray-500">
                  Please check if:
                  <ul className="list-disc list-inside mt-2">
                    <li>Employees are selected</li>
                    <li>The selected month has data</li>
                    <li>The status filter is not too restrictive</li>
                  </ul>
                </div>
              </div>
            ) : (
            Object.entries(departmentData).map(([employeeId, employeeData]) => (
                <div key={employeeId} className="mb-8 page-break employee-dtr-section">
                  {/* Header - Compact for space */}
                  <div className="header text-center mb-4">
                    <h1 className="text-lg font-bold">CIVIL SERVICE FORM NO. 48</h1>
                    <div className="mt-1"></div>
                    <h2 className="text-lg font-bold">DAILY TIME RECORD</h2>
                    <h3 className="text-lg font-bold employee-name">{employeeData.employee.NAME}</h3>
                    <p className="text-sm">NAME</p>
                    <p className="text-lg month-year">
                      For the month of: <span className="bold-month">{getMonthYearDisplayWithPeriod(selectedMonth, selectedPeriod)}</span>
                    </p>
                    <p className="text-sm official-hours">Official hours for arrival and departure</p>
                    <p className="text-sm regular-days">Regular Days ________ Saturdays _____________</p>
                  </div>

                {/* Table Container - No height restrictions */}
                <div className="table-container">
                  <table className="w-full border-collapse border border-gray-300 mb-4">
                    <thead>
                      <tr className="bg-gray-300">
                        <th className="border border-gray-300 px-2 py-2 text-center font-medium text-xs col-day">Day</th>
                        <th colSpan="2" className="border border-gray-300 px-2 py-2 text-center font-medium text-xs">AM</th>
                        <th colSpan="2" className="border border-gray-300 px-2 py-2 text-center font-medium text-xs">PM</th>
                        <th colSpan="2" className="border border-gray-300 px-2 py-2 text-center font-medium text-xs">Undertime</th>
                        <th className="border border-gray-300 px-2 py-2 text-center font-medium text-xs col-days">Days</th>
                        <th className="border border-gray-300 px-2 py-2 text-center font-medium text-xs col-late">Late</th>
                      </tr>
                      <tr className="bg-gray-300">
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium"></th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium col-am-arrival">Arrival</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium col-am-departure">Departure</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium col-pm-arrival">Arrival</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium col-pm-departure">Departure</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium col-undertime-hours">Hours</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium col-undertime-minutes">Minutes</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium"></th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeData.processed.map((log, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                          <td className={`border border-gray-300 px-2 py-2 text-center text-xs ${log.isWeekend ? 'weekend-day' : ''}`}>
                                {log.day}
                              </td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.amIn}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.amOut}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.pmIn}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.pmOut}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.undertimeHours}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.undertimeMinutes}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.days}</td>
                          <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.late}</td>
                            </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-300 font-semibold totals-row">
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs">TOTAL</td>
                        <td colSpan="4" className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs">{employeeData.undertime.hours}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs">{employeeData.undertime.minutes}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs">{employeeData.totals.days}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs">{employeeData.totals.late}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                  {/* Footer */}
                <div className="footer mt-6 text-xs">
                  <div className="mb-2">
                      I CERTIFY on my honor that the above is a true and correct report of the hours and work performed, record of which was made daily at the time of arrival at and departure from office.
                  </div>
                  <div className="mb-2"></div> {/* Added space */}
                  <div className="mb-2"></div> {/* Added space */}
                  <div className="signature-line">
                    <div className="line">_________________</div>
                  </div>
                  <div className="mb-2"></div> {/* Added space */}
                  <div className="mb-2"></div> {/* Added space */}
                  <p className="mb-2 text-right">
                      Verified as to the prescribed office hours.
                    </p>
                  <div className="mb-2"></div> {/* Added space */}
                    <div className="signature-line">
                      <div className="line">_______________</div>
                      <div className="label">In Charge</div>
                    </div>
                  </div>
                  
                  {/* System-Generated Document Footer */}
                  <div className="system-footer mt-4">
                    System-Generated Document — {companyInfo.lguDtrName || 'HRIS System'} - Printed on: {new Date().toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true
                    })}. Printed By: {user?.id || user?.USERID || user?.username || 'System'}
                  </div>
                </div>
              ))
            )}
        //</div>
      </div>
    </div>
  );
}

export default GenerateDTRPrint_Dept;
