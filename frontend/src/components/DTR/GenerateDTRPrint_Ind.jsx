import React, { useRef, useState, useEffect } from 'react';
import { getEmployeeShiftSchedule, generateDateRange } from '../../utils/shiftScheduleUtils';
import api from '../../utils/api';
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

  // Return proper date strings for API calls
  return {
    startDate,
    endDate,
    startDateStr: startDate.toISOString().split('T')[0], // Convert start date properly
    endDateStr: endDate.toISOString().split('T')[0] // Convert end date properly
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

  // Return dates for display generation
  return {
    startDate,
    endDate,
    startDateStr: startDate.toISOString().split('T')[0],
    endDateStr: endDate.toISOString().split('T')[0]
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

function GenerateDTRPrint_Ind({ 
  employee, 
  selectedMonth, 
  selectedPeriod = 'full', // New prop with default value
  onClose 
}) {
  const printRef = useRef();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [shiftSchedule, setShiftSchedule] = useState(null);
  const [timeLogs, setTimeLogs] = useState([]);
  const [processedLogs, setProcessedLogs] = useState([]);
  const [totals, setTotals] = useState({ days: 0, late: 0 });
  const [finalUndertimeHours, setFinalUndertimeHours] = useState(0);
  const [finalUndertimeMinutes, setFinalUndertimeMinutes] = useState(0);
  const [error, setError] = useState(null);
  const [companyInfo, setCompanyInfo] = useState({ lguDtrName: '' });

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

  // Fetch data when inputs change
  useEffect(() => {
    const employeeId = employee?.USERID;
    if (!employeeId || !selectedMonth) {
      setShiftSchedule(null);
      setTimeLogs([]);
      setProcessedLogs([]);
      setTotals({ days: 0, late: 0 });
      setFinalUndertimeHours(0);
      setFinalUndertimeMinutes(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      console.log('🔄 Starting data fetch for employee:', employee.NAME);
      console.log('📅 Selected period:', selectedPeriod);
      setLoading(true);
      setError(null);

      try {
        // Step 1: Fetch shift schedule via helper
        const shiftData = await getEmployeeShiftSchedule(employeeId);
        if (cancelled) return;
        console.log('🔍 Extracted shift data:', shiftData);
        setShiftSchedule(shiftData);

        // Step 2: Calculate date range for data fetching (only for selected period)
        const dataDateRange = calculateDateRangeByPeriod(selectedMonth, selectedPeriod);
        if (!dataDateRange) {
          throw new Error('Invalid date range calculation');
        }

        console.log('📆 Data range for period:', { 
          period: selectedPeriod,
          startDate: dataDateRange.startDateStr, 
          endDate: dataDateRange.endDateStr 
        });

        // Step 3: Fetch time logs (only for the selected period)
        const logsResponse = await api.get(`/logs/${employeeId}`, {
          params: { startDate: dataDateRange.startDateStr, endDate: dataDateRange.endDateStr }
        });
        if (cancelled) return;
        const logsData = Array.isArray(logsResponse.data) ? logsResponse.data : [];
        setTimeLogs(logsData);

        // Step 4: Process logs - Pass the full month range for display but period data for processing
        const displayDateRange = getAllDaysOfMonth(selectedMonth);
        processLogs(logsData, shiftData, displayDateRange.startDate, displayDateRange.endDate, selectedPeriod);
      } catch (error) {
        if (!cancelled) {
          console.error('❌ Error fetching data:', error);
          setError('Failed to fetch data. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [employee?.USERID, selectedMonth, selectedPeriod]);

  const processLogs = (logs, schedule, startDate, endDate, selectedPeriod) => {
    console.log(' Starting log processing...');
    console.log('📊 Input data:', { 
      logsCount: logs.length, 
      schedule: schedule, 
      startDate: startDate, 
      endDate: endDate,
      selectedPeriod: selectedPeriod
    });

    if (!schedule) {
      console.warn('⚠️ No shift schedule found, skipping processing');
      // Set empty processed logs to show the table structure with ALL days
      const dateRange = generateLocalDateRange(startDate, endDate); // Use local date range
      const emptyProcessed = dateRange.map((dateStr, index) => {
        const isWeekendDay = isWeekend(dateStr);
        const isInPeriod = isDateInSelectedPeriod(dateStr, selectedMonth, selectedPeriod);
        
        return {
        day: index + 1,
        date: dateStr,
          amIn: '',
          amOut: '',
          pmIn: '',
          pmOut: '',
          late: '',
          undertime: '',
          undertimeHours: '', // Empty undertime hours
          undertimeMinutes: '', // Empty undertime minutes
          days: '',
          remarks: isInPeriod ? 'No shift schedule assigned' : '',
          isWeekend: isWeekendDay,
          isInPeriod: isInPeriod
        };
      });
      setProcessedLogs(emptyProcessed);
      setTotals({ days: 0, late: 0 });
      setFinalUndertimeHours(0);
      setFinalUndertimeMinutes(0);
      return;
    }

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

    const dateRange = generateLocalDateRange(startDate, endDate); // Use local date range
    console.log('📅 Generated local date range for display:', dateRange);

    const processed = [];
    let totalDays = 0;
    let totalLate = 0;

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
            console.log(` Date comparison for ${dateStr}:`, {
              logDateStr,
              dateStr,
              matches: logDateStr === dateStr,
              checktime: log.CHECKTIME
            });
          }
          
          return logDateStr === dateStr;
        });
      }

      console.log(` Processing ${dateStr} (Day ${day}) - In period: ${isInPeriod}:`, dayLogs.length, 'logs');
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

      console.log(`⏰ Properly grouped times for ${dateStr}:`, { 
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
        undertime: '', // Empty undertime string
        undertimeHours: '', // Empty undertime hours
        undertimeMinutes: '', // Empty undertime minutes
        days: daysCredit,
        remarks,
        isWeekend: isWeekendDay,
        isInPeriod: isInPeriod
      });

      // Update totals (only for dates in period)
      if (isInPeriod && timeLogCount > 0 && !isWeekendDay) {
        totalDays++;
        totalLate += lateMinutes;
      }
    }

    console.log('✅ Final totals:', {
      totalDays,
      totalLate
    });

    setProcessedLogs(processed);
    setTotals({ days: totalDays, late: totalLate });
    setFinalUndertimeHours(0); // Set to 0 since no calculation
    setFinalUndertimeMinutes(0); // Set to 0 since no calculation
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
              
              /* Specific header text styling - Font size 12px with bold month */
              .header .month-year {
                font-size: 10px !important;
                font-weight: normal;
                margin: 1px 0;
              }
              .header .month-year .bold-month {
                font-weight: bold !important;
              }
              .header .official-hours {
                font-size: 8px !important;
                font-weight: normal;
                margin: 1px 0;
              }
              .header .regular-days {
                font-size: 8px !important;
                font-weight: normal;
                margin: 1px 0;
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
              
              /* Weekend day styling */
              .weekend-day {
                color: #0066cc !important; /* Blue color for weekends */
                font-weight: bold;
              }
              
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
              
              /* Employee signature line styling */
              .signature-line .employee-signature { 
                border-bottom: 1px solid #000; 
                display: inline-block; 
                width: 300px; 
                margin-top: 2px;
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
            <div class="system-footer">
              System-Generated Document — ${systemName} - Printed on: ${printDateTime}. Printed By: ${printedBy}
            </div>
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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Loading DTR data...</span>
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
            onClick={onClose}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">DTR Print Preview</h2>
          <div className="space-x-2">
            <button
              onClick={handlePrint}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>

        <div ref={printRef} className="print-content">
          {/* Header - Compact for space */}
          <div className="header text-center mb-4">
            <h1 className="text-lg font-bold">CIVIL SERVICE FORM NO. 48</h1>
            <div className="mt-1"></div>
            <h2 className="text-lg font-bold">DAILY TIME RECORD</h2>
            <h3 className="text-lg font-bold">{employee.NAME}</h3>
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
                {processedLogs.map((log, index) => (
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
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs">{finalUndertimeHours}</td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs">{finalUndertimeMinutes}</td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{totals.days}</td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{totals.late}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer - Compact */}
          <div className="footer bg-gray-100 p-3 border border-gray-300">
            <p className="mb-2">
              I CERTIFY on my honor that the above is a true and correct report of the hours and work performed, record of which was made daily at the time of arrival at and departure from office.
            </p>
            <div className="mb-2"></div>
            <div className="mb-2"></div>
            <div className="signature-line">
              <div className="line">_________________</div>
            </div>
            <div className="mb-2"></div>
            <div className="mb-2"></div>
            <p className="mb-2 text-right">
              Verified as to the prescribed office hours.
            </p>
            <div className="mb-2"></div>
            <div className="signature-line">
              <div className="line">_______________</div>
              <div className="label">In Charge</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GenerateDTRPrint_Ind;
