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

function PrintMyDTRChecker({ 
  user, 
  selectedFilter, 
  selectedPeriod = 'full',
  processedLogs = [],
  shiftSchedule,
  onClose 
}) {
  const printRef = useRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Process logs for full month display
  const fullMonthLogs = processLogsForFullMonth(processedLogs, selectedFilter);
  
  // Debug logging
  console.log('🔍 [PrintMyDTRChecker] Debug info:', {
    selectedFilter,
    selectedPeriod,
    processedLogsLength: processedLogs.length,
    fullMonthLogsLength: fullMonthLogs.length,
    sampleProcessedLog: processedLogs[0],
    sampleFullMonthLog: fullMonthLogs[0]
  });

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
          <h2 className="text-xl font-bold">DTR Print Preview - My Shift View</h2>
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
            <h3 className="text-lg font-bold">{user?.NAME || user?.name || 'Employee'}</h3>
            <p className="text-sm">NAME</p>
            <p className="text-lg month-year">
              For the month of: <span className="bold-month">{getMonthYearDisplayWithPeriod(selectedFilter, selectedPeriod)}</span>
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
                {fullMonthLogs.map((log, index) => {
                  console.log(`🔍 [PrintMyDTRChecker] Rendering row ${index}:`, {
                    date: log.date,
                    dateStr: log.dateStr,
                    amCheckIn: log.amCheckIn,
                    amCheckOut: log.amCheckOut,
                    pmCheckIn: log.pmCheckIn,
                    pmCheckOut: log.pmCheckOut,
                    days: log.days,
                    lateMinutes: log.lateMinutes
                  });
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className={`border border-gray-300 px-2 py-2 text-center text-xs ${log.isWeekend ? 'weekend-day' : ''}`}>
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.amCheckIn || ''}</td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.amCheckOut || ''}</td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.pmCheckIn || ''}</td>
                      <td className="border border-gray-300 px-2 py-2 text-center text-xs">{log.pmCheckOut || ''}</td>
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

export default PrintMyDTRChecker;
