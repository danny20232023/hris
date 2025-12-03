import React, { useRef, useState, useEffect } from 'react';

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
const getMonthYearDisplayWithPeriod = (selectedFilter, selectedPeriod) => {
  const now = new Date();
  let targetYear, targetMonth;
  
  if (selectedFilter === 'This Month') {
    targetYear = now.getFullYear();
    targetMonth = now.getMonth() + 1;
  } else if (selectedFilter === 'Last Month') {
    targetYear = now.getFullYear();
    targetMonth = now.getMonth();
    if (targetMonth === 0) {
      targetYear--;
      targetMonth = 12;
    }
  } else {
    return 'Current Period';
  }
  
  const month = new Date(targetYear, targetMonth - 1, 1).toLocaleString('en-US', { month: 'long' });
  const year = targetYear;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  
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

// Date formatting for "20-Aug-2025, Fri" - duplicate for use in processLogsForFullMonth
const formatDateDisplayForLogs = (dateStr) => {
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

// Generate full month date range for printing
const generateFullMonthDates = (selectedFilter) => {
  const now = new Date();
  let targetYear, targetMonth;
  
  if (selectedFilter === 'This Month') {
    targetYear = now.getFullYear();
    targetMonth = now.getMonth() + 1;
  } else if (selectedFilter === 'Last Month') {
    targetYear = now.getFullYear();
    targetMonth = now.getMonth();
    if (targetMonth === 0) {
      targetYear--;
      targetMonth = 12;
    }
  } else {
    // For other filters, use current month
    targetYear = now.getFullYear();
    targetMonth = now.getMonth() + 1;
  }
  
  const firstDay = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const lastDayStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  const dates = [];
  let current = new Date(firstDay);
  const endDate = new Date(lastDayStr);
  
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

// Process logs for full month display
const processLogsForFullMonth = (processedLogs, selectedFilter) => {
  const fullMonthDates = generateFullMonthDates(selectedFilter);
  
  return fullMonthDates.map(dateStr => {
    // Find matching log from processedLogs
    const matchingLog = processedLogs.find(log => log.dateStr === dateStr);
    
    if (matchingLog) {
      return matchingLog;
    }
    
    // Create empty log entry for dates not in processedLogs
    return {
      date: formatDateDisplayForLogs(dateStr),
      dateStr: dateStr,
      amCheckIn: '-',
      amCheckOut: '-',
      pmCheckIn: '-',
      pmCheckOut: '-',
      remarks: isWeekend(dateStr) ? 'Weekend' : '',
      isWeekend: isWeekend(dateStr),
      hasHoliday: false,
      lateMinutes: 0,
      days: 0
    };
  });
};

// Helper to get active columns from shift schedule
const getActiveColumns = (shiftSchedule) => {
  if (!shiftSchedule) {
    return {
      hasAMCheckIn: false,
      hasAMCheckOut: false,
      hasPMCheckIn: false,
      hasPMCheckOut: false
    };
  }
  
  return {
    hasAMCheckIn: !!(shiftSchedule.SHIFT_AMCHECKIN || shiftSchedule.SHIFTAMCHECKIN),
    hasAMCheckOut: !!(shiftSchedule.SHIFT_AMCHECKOUT || shiftSchedule.SHIFTAMCHECKOUT),
    hasPMCheckIn: !!(shiftSchedule.SHIFT_PMCHECKIN || shiftSchedule.SHIFTPMCHECKIN),
    hasPMCheckOut: !!(shiftSchedule.SHIFT_PMCHECKOUT || shiftSchedule.SHIFTPMCHECKOUT)
  };
};

// Render time column with annotations based on selectedAnnotations
const renderTimeColumnWithAnnotations = (timeValue, dayLog, shiftSchedule, columnType, selectedAnnotations) => {
  const locatorBackfillFlags = dayLog?.locatorBackfill || {};
  let locatorKey = null;
  if (columnType === 'AM_CHECKIN') locatorKey = 'amCheckIn';
  else if (columnType === 'AM_CHECKOUT') locatorKey = 'amCheckOut';
  else if (columnType === 'PM_CHECKIN') locatorKey = 'pmCheckIn';
  else if (columnType === 'PM_CHECKOUT') locatorKey = 'pmCheckOut';

  const isLocatorBackfill = locatorKey ? !!locatorBackfillFlags[locatorKey] : false;
  const fixLogBackfillFlags = dayLog?.fixLogBackfill || {};
  const isFixLogOverride = locatorKey ? !!fixLogBackfillFlags[locatorKey] : false;

  const normalizedTimeValue = typeof timeValue === 'string' ? timeValue.trim() : '';
  const hasValue = normalizedTimeValue !== '' && normalizedTimeValue !== '-';
  const remarkFlags = dayLog?.remarkFlags || {};
  const hasLeave = !!remarkFlags.hasLeave;
  const hasTravel = !!remarkFlags.hasTravel;
  const hasCdo = !!remarkFlags.hasCdo;
  const hasHoliday = !!dayLog?.hasHoliday;
  const isWeekend = !!dayLog?.isWeekend;
  const isAbsent = !!remarkFlags.isAbsent;
  const leaveStatus = dayLog?.leaveStatus || null;
  const hasOBLeave = !!dayLog?.hasOBLeave;

  const holidayNames = Array.isArray(dayLog?.holidayNames) ? dayLog.holidayNames : [];
  const workSuspensionText = dayLog?.hasWorkSuspension ? 'Work Suspension' : null;
  const holidayText = workSuspensionText || dayLog?.holidayDisplay || (holidayNames.length > 0 ? holidayNames.join(', ') : 'Holiday');

  // Check if shift is assigned for this column type
  const activeColumns = getActiveColumns(shiftSchedule);
  let shiftAssigned = true;
  if (shiftSchedule && columnType) {
    if (columnType === 'AM_CHECKIN') {
      shiftAssigned = activeColumns.hasAMCheckIn;
    } else if (columnType === 'AM_CHECKOUT') {
      shiftAssigned = activeColumns.hasAMCheckOut;
    } else if (columnType === 'PM_CHECKIN') {
      shiftAssigned = activeColumns.hasPMCheckIn;
    } else if (columnType === 'PM_CHECKOUT') {
      shiftAssigned = activeColumns.hasPMCheckOut;
    }
  }

  // PRIORITY 1: Check shift assignment first
  if (!shiftAssigned) {
    return '-';
  } else if (hasValue) {
    // PRIORITY 2: If there are actual time logs, display them with badges if selected
    const badges = [];
    
    if (isLocatorBackfill && selectedAnnotations.locator) {
      badges.push('📌');
    }
    
    if (isFixLogOverride && selectedAnnotations.fixlog) {
      badges.push('🔒');
    }
    
    if (badges.length > 0) {
      return `${timeValue} ${badges.join(' ')}`;
    }
    
    return timeValue || '-';
  } else if (isWeekend && selectedAnnotations.weekend) {
    // PRIORITY 3: Weekend annotation (only if selected)
    const weekendColor = hasHoliday ? 'text-red-600' : 'text-blue-600';
    const escapedHolidayText = holidayText.replace(/"/g, '&quot;');
    return `<span class="${weekendColor} font-medium">Weekend</span>`;
  } else if ((hasLeave || hasOBLeave) && selectedAnnotations.leave) {
    // PRIORITY 4: Leave annotation (only if selected)
    const normalized = (leaveStatus || '').toLowerCase();
    const displayText = normalized === 'for approval' ? 'For Approval' : 'Leave';
    const escapedText = displayText.replace(/"/g, '&quot;');
    return `<span class="text-gray-400">${escapedText}</span>`;
  } else if (hasTravel && selectedAnnotations.travel) {
    // PRIORITY 5: Travel annotation (only if selected)
    return '<span class="text-gray-400">Travel</span>';
  } else if (hasCdo && selectedAnnotations.cdo) {
    // PRIORITY 6: CDO annotation (only if selected)
    return '<span class="text-gray-400">CDO</span>';
  } else if (hasHoliday && selectedAnnotations.holiday) {
    // PRIORITY 7: Holiday annotation (only if selected)
    const escapedHolidayText = holidayText.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `<span class="text-gray-400 font-medium text-[11px]">${escapedHolidayText}</span>`;
  } else if (isAbsent && selectedAnnotations.absent) {
    // PRIORITY 8: Absent annotation (only if selected)
    return '-';
  } else {
    // PRIORITY 9: Show dash for regular work days without logs
    return '-';
  }
};

// Filter remarks based on selectedAnnotations
const filterRemarks = (remarkMeta, selectedAnnotations, fallbackRemarks = '') => {
  if (!remarkMeta || !remarkMeta.entries) {
    // If no remarkMeta, use fallback remarks but filter weekend if not selected
    if (fallbackRemarks && fallbackRemarks.toLowerCase().includes('weekend') && !selectedAnnotations.weekend) {
      return '';
    }
    return fallbackRemarks || '';
  }
  
  const filteredEntries = remarkMeta.entries.filter(entry => {
    if (!entry || !entry.type) return false;
    
    const type = entry.type.toLowerCase();
    if (type === 'leave' && !selectedAnnotations.leave) return false;
    if (type === 'travel' && !selectedAnnotations.travel) return false;
    if (type === 'cdo' && !selectedAnnotations.cdo) return false;
    if (type === 'holiday' && !selectedAnnotations.holiday) return false;
    if (type === 'locator' && !selectedAnnotations.locator) return false;
    if (type === 'absent' && !selectedAnnotations.absent) return false;
    // Weekend is handled separately in the time columns, but we can include it in remarks if selected
    if (type === 'weekend' && !selectedAnnotations.weekend) return false;
    
    return true;
  });
  
  const filteredTexts = filteredEntries.map(entry => entry.text).filter(Boolean);
  return filteredTexts.length > 0 ? filteredTexts.join('; ') : '';
};

function PrintMyDTRCheckerWithAnnotations({ 
  user, 
  selectedFilter, 
  selectedPeriod = 'full',
  processedLogs = [],
  shiftSchedule,
  selectedAnnotations = {
    locator: true,
    fixlog: true,
    leave: true,
    travel: true,
    cdo: true,
    holiday: true,
    weekend: true,
    absent: true
  },
  onClose 
}) {
  const printRef = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Process logs for full month display
  const fullMonthLogs = processLogsForFullMonth(processedLogs, selectedFilter);

  // Calculate totals
  const calculateTotals = () => {
    const totalLateMinutes = fullMonthLogs.reduce((sum, log) => sum + (log.lateMinutes || 0), 0);
    const totalDays = fullMonthLogs.reduce((sum, log) => sum + (log.days || 0), 0);
    
    return {
      totalLateMinutes,
      totalDays
    };
  };

  const totals = calculateTotals();

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DTR Print - With Annotations</title>
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
              
              /* Specific header text styling */
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
              
              /* Table Styles */
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
                padding: 2.8px 1px;
                text-align: center; 
                vertical-align: middle;
                font-size: 11px;
                line-height: 1.0;
                height: 14px;
              }
              th { 
                font-weight: bold; 
                background-color: #d3d3d3 !important;
                font-size: 11px;
                height: 16.8px;
              }
              
              /* Column widths */
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
                color: #0066cc !important;
                font-weight: bold;
              }
              
              /* Annotation styling */
              .text-gray-400 {
                color: #9ca3af !important;
              }
              .text-blue-600 {
                color: #2563eb !important;
              }
              .text-red-600 {
                color: #dc2626 !important;
              }
              .font-medium {
                font-weight: 500;
              }
              .text-\\[11px\\] {
                font-size: 11px !important;
              }
              
              /* Footer Styles */
              .footer { 
                margin-top: 6px; 
                font-size: 8px;
                background-color: #f5f5f5 !important;
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
                text-align: right !important;
                width: 100%; 
                margin-top: 1px; 
                font-size: 8px;
                padding-right: 0;
              }
              
              .signature-line .employee-signature { 
                border-bottom: 1px solid #000; 
                display: inline-block; 
                width: 300px; 
                margin-top: 2px;
              }
              
              .print-container {
                height: auto;
                width: 100%;
                overflow: visible;
              }
              .table-container {
                height: auto;
                overflow: visible;
              }
              
              .totals-row {
                background-color: #d3d3d3 !important;
                font-weight: bold;
                height: 16.8px;
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
          <h2 className="text-xl font-bold">DTR Print Preview - With Annotations</h2>
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
          {/* Header */}
          <div className="header text-center mb-4">
            <h1 className="text-lg font-bold">CIVIL SERVICE FORM NO. 48</h1>
            <div className="mt-1"></div>
            <h2 className="text-lg font-bold">DAILY TIME RECORD</h2>
            <h3 className="text-lg font-bold">{user?.NAME || user?.name || 'Employee'}</h3>
            <p className="text-sm">NAME</p>
            <p className="text-lg month-year">
              For the month of: <span className="bold-month">{getMonthYearDisplayWithPeriod(selectedFilter, selectedPeriod)}</span>
            </p>
            <p className="text-sm official-hours">Official hours for arrival and departure</p>
            <p className="text-sm regular-days">Regular Days ________ Saturdays _____________</p>
          </div>

          {/* Table Container */}
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
                {fullMonthLogs.map((log, index) => {
                  const amCheckInDisplay = renderTimeColumnWithAnnotations(log.amCheckIn, log, shiftSchedule, 'AM_CHECKIN', selectedAnnotations);
                  const amCheckOutDisplay = renderTimeColumnWithAnnotations(log.amCheckOut, log, shiftSchedule, 'AM_CHECKOUT', selectedAnnotations);
                  const pmCheckInDisplay = renderTimeColumnWithAnnotations(log.pmCheckIn, log, shiftSchedule, 'PM_CHECKIN', selectedAnnotations);
                  const pmCheckOutDisplay = renderTimeColumnWithAnnotations(log.pmCheckOut, log, shiftSchedule, 'PM_CHECKOUT', selectedAnnotations);
                  const filteredRemarks = filterRemarks(log.remarkMeta, selectedAnnotations, log.remarks);
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className={`border border-gray-300 px-2 py-2 text-center text-xs ${log.isWeekend && selectedAnnotations.weekend ? 'weekend-day' : ''}`}>
                        {index + 1}
                      </td>
                      <td 
                        className="border border-gray-300 px-2 py-2 text-center text-xs"
                        dangerouslySetInnerHTML={{ __html: amCheckInDisplay }}
                      />
                      <td 
                        className="border border-gray-300 px-2 py-2 text-center text-xs"
                        dangerouslySetInnerHTML={{ __html: amCheckOutDisplay }}
                      />
                      <td 
                        className="border border-gray-300 px-2 py-2 text-center text-xs"
                        dangerouslySetInnerHTML={{ __html: pmCheckInDisplay }}
                      />
                      <td 
                        className="border border-gray-300 px-2 py-2 text-center text-xs"
                        dangerouslySetInnerHTML={{ __html: pmCheckOutDisplay }}
                      />
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.days || ''}</td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.lateMinutes || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-300 font-semibold totals-row">
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs">TOTAL</td>
                  <td colSpan="4" className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{totals.totalDays}</td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{totals.totalLateMinutes}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer */}
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

export default PrintMyDTRCheckerWithAnnotations;

