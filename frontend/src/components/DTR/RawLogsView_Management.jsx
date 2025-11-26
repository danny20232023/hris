import React, { useEffect, useState } from 'react';

// Local utility functions (since shiftScheduleUtils may not have these)
const extractDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (typeof timestamp === 'string') {
    return timestamp.slice(0, 10);
  }
  return null;
};

const extractTimeFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (typeof timestamp === 'string') {
    const match = timestamp.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : null;
  }
  return null;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();
  const weekday = date.toLocaleString('en-US', { weekday: 'short' }).toUpperCase();
  return `${day}-${month}-${year}, ${weekday}`;
};

const generateDateRange = (start, end) => {
  const dates = [];
  let current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
    if (dates.length > 1000) break;
  }
  return dates;
};

const isWeekend = (dateStr) => {
  const date = new Date(dateStr);
  return date.getDay() === 0 || date.getDay() === 6;
};

function RawLogsView_Management({ logs = [], selectedEmployee, startDate, endDate }) {
  const [processedLogs, setProcessedLogs] = useState([]);

  useEffect(() => {
    console.log('DEBUG: RawLogsView_Management logs:', logs);
    
    // Group logs by date
    const logsByDate = {};
    logs.forEach(log => {
      const dateStr = extractDateFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime || log.DATE);
      if (!dateStr) return;
      if (!logsByDate[dateStr]) logsByDate[dateStr] = [];
      logsByDate[dateStr].push(log);
    });

    const allDates = generateDateRange(startDate, endDate);

    const result = allDates.map(dateStr => {
      const dateLogs = logsByDate[dateStr] || [];
      // Split into AM/PM based on time (before/after 12:00)
      const amLogs = [];
      const pmLogs = [];
      dateLogs.forEach(log => {
        const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
        if (!t) return;
        const [h] = t.split(':').map(Number);
        if (h < 12) amLogs.push({ time: t });
        else pmLogs.push({ time: t });
      });
      return {
        date: formatDateDisplay(dateStr),
        dateStr,
        amLogs,
        pmLogs,
        isWeekend: isWeekend(dateStr),
        remarks: isWeekend(dateStr) ? 'Weekend' : ''
      };
    });

    setProcessedLogs(result);
  }, [logs, startDate, endDate]);

  // Helper to render remarks with color for "Weekend"
  const renderRemarks = (remarksStr, isWeekend) => {
    if (!remarksStr) return null;
    return remarksStr.split('; ').map((remark, i, arr) => (
      <span key={i} style={remark === 'Weekend' || isWeekend ? { color: 'blue' } : {}}>
        {remark}{i < arr.length - 1 && '; '}
      </span>
    ));
  };

  if (!selectedEmployee) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Please select an employee to view time logs.</p>
      </div>
    );
  }

  if (processedLogs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No logs found for the selected date range.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Date</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold">AM Logs</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold">PM Logs</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {processedLogs.map((log, index) => (
            <tr key={index}>
              <td className="border border-gray-300 px-4 py-2">{log.date}</td>
              <td className="border border-gray-300 px-4 py-2">
                {log.amLogs && log.amLogs.length > 0
                  ? log.amLogs.map((amLog, i) => amLog.time).join(', ')
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {log.pmLogs && log.pmLogs.length > 0
                  ? log.pmLogs.map((pmLog, i) => pmLog.time).join(', ')
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {renderRemarks(log.remarks, log.isWeekend)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RawLogsView_Management;
