import React, { useMemo } from 'react';
import { formatEmployeeName } from '../../utils/employeenameFormatter';

const formatMinutes = (minutes = 0) => {
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  if (safeMinutes <= 0) return '0m';
  const hours = Math.floor(safeMinutes / 60);
  const mins = Math.round(safeMinutes % 60);
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '—';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

function extractTimeSafe(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const isoMatch = trimmed.match(/T(\d{2}):(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}:${isoMatch[2]}`;
    }
    const match = trimmed.match(/(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = String(value.getHours()).padStart(2, '0');
    const mins = String(value.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  }
  return '';
}

function extractDateSafe(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const firstToken = trimmed.split(/[ T]/)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(firstToken)) {
      return firstToken;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'object' && value !== null) {
    return (
      extractDateSafe(value.date) ||
      extractDateSafe(value.CHECKTIME) ||
      extractDateSafe(value.DATE) ||
      extractDateSafe(value.checktime)
    );
  }
  return '';
}

function timeToMinutesSafe(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return NaN;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return NaN;
  return hours * 60 + minutes;
}

function getTimeWindowSafe(start, end) {
  if (!start || !end) return [null, null];
  const startMin = timeToMinutesSafe(start);
  const endMin = timeToMinutesSafe(end);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) return [null, null];
  return [startMin, endMin];
}

function getWindowBounds(startValue, endValue, fallbackStart, fallbackEnd) {
  const start = extractTimeSafe(startValue) || fallbackStart;
  const end = extractTimeSafe(endValue) || fallbackEnd;
  return getTimeWindowSafe(start, end);
}

function validateTimeInWindowSafe(timeStr, startWindow, endWindow) {
  if (!timeStr || startWindow === null || endWindow === null) return false;
  const minutes = timeToMinutesSafe(timeStr);
  if (Number.isNaN(minutes)) return false;
  return minutes >= startWindow && minutes <= endWindow;
}

function generateDateRangeSafe(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const dates = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function calculateDaysForModal(amCheckIn, amCheckOut, pmCheckIn, pmCheckOut) {
  const hasAMCheckIn = Boolean(amCheckIn && amCheckIn.trim());
  const hasAMCheckOut = Boolean(amCheckOut && amCheckOut.trim());
  const hasPMCheckIn = Boolean(pmCheckIn && pmCheckIn.trim());
  const hasPMCheckOut = Boolean(pmCheckOut && pmCheckOut.trim());

  if (
    (hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) ||
    (hasAMCheckIn && hasAMCheckOut && hasPMCheckOut && !hasPMCheckIn) ||
    (hasAMCheckIn && hasPMCheckIn && hasPMCheckOut && !hasAMCheckOut) ||
    (hasAMCheckIn && hasPMCheckOut)
  ) {
    return 1;
  }

  if (
    (hasAMCheckIn && hasAMCheckOut && !hasPMCheckIn && !hasPMCheckOut) ||
    (!hasAMCheckIn && !hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) ||
    (!hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) ||
    (hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && !hasPMCheckOut) ||
    (hasAMCheckIn && !hasAMCheckOut && hasPMCheckIn && !hasPMCheckOut) ||
    (!hasAMCheckIn && hasAMCheckOut && !hasPMCheckIn && hasPMCheckOut)
  ) {
    return 0.5;
  }

  return 0;
}

function deriveDateBoundsFromLogs(logs = []) {
  const dates = logs
    .map((log) => extractDateSafe(log?.CHECKTIME || log?.DATE || log?.date))
    .filter(Boolean)
    .sort();
  if (dates.length === 0) {
    return { start: '', end: '' };
  }
  return { start: dates[0], end: dates[dates.length - 1] };
}

function processLogsForModal(logs = [], shiftSchedule, startDate, endDate) {
  if (!Array.isArray(logs)) {
    return { rows: [], totalLates: 0, totalDays: 0, rangeStart: '', rangeEnd: '' };
  }

  const derived = deriveDateBoundsFromLogs(logs);
  const normalizedStart = startDate || derived.start || derived.end || '';
  const normalizedEnd = endDate || derived.end || derived.start || '';

  if (!normalizedStart || !normalizedEnd) {
    return { rows: [], totalLates: 0, totalDays: 0, rangeStart: '', rangeEnd: '' };
  }

  const [amCheckInStartMin, amCheckInEndMin] = getWindowBounds(
    shiftSchedule?.SHIFT_AMCHECKIN_START,
    shiftSchedule?.SHIFT_AMCHECKIN_END,
    '04:00',
    '11:30'
  );
  const [amCheckOutStartMin, amCheckOutEndMin] = getWindowBounds(
    shiftSchedule?.SHIFT_AMCHECKOUT_START,
    shiftSchedule?.SHIFT_AMCHECKOUT_END,
    '11:00',
    '13:30'
  );
  const [pmCheckInStartMin, pmCheckInEndMin] = getWindowBounds(
    shiftSchedule?.SHIFT_PMCHECKIN_START,
    shiftSchedule?.SHIFT_PMCHECKIN_END,
    '12:31',
    '15:00'
  );
  const [pmCheckOutStartMin, pmCheckOutEndMin] = getWindowBounds(
    shiftSchedule?.SHIFT_PMCHECKOUT_START,
    shiftSchedule?.SHIFT_PMCHECKOUT_END,
    '15:00',
    '23:59'
  );

  const expectedAmCheckIn = timeToMinutesSafe(extractTimeSafe(shiftSchedule?.SHIFT_AMCHECKIN));
  const expectedPmCheckIn = timeToMinutesSafe(extractTimeSafe(shiftSchedule?.SHIFT_PMCHECKIN));
  const expectedAmCheckOut = timeToMinutesSafe(extractTimeSafe(shiftSchedule?.SHIFT_AMCHECKOUT));
  const expectedPmCheckOut = timeToMinutesSafe(extractTimeSafe(shiftSchedule?.SHIFT_PMCHECKOUT));

  const logsByDate = logs.reduce((acc, log) => {
    const date = extractDateSafe(log?.CHECKTIME || log?.DATE || log?.date);
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {});

  const allDates = generateDateRangeSafe(normalizedStart, normalizedEnd);
  const rows = [];
  let totalLates = 0;
  let totalDays = 0;

  allDates.forEach((date) => {
    const logsForDay = logsByDate[date] || [];
    const mappedLogs = logsForDay
      .map((log) => {
        const time = extractTimeSafe(log?.CHECKTIME || log?.DATE || log?.date);
        const minutes = timeToMinutesSafe(time);
        return { time, minutes, raw: log };
      })
      .filter((item) => item.time && !Number.isNaN(item.minutes));

    const amInLogs = mappedLogs
      .filter((item) => {
        if (amCheckInStartMin !== null && amCheckInEndMin !== null) {
          return item.minutes >= amCheckInStartMin && item.minutes <= amCheckInEndMin;
        }
        return item.minutes < 12 * 60;
      })
      .sort((a, b) => a.minutes - b.minutes);
    const amOutLogs = mappedLogs
      .filter((item) => {
        if (amCheckOutStartMin !== null && amCheckOutEndMin !== null) {
          return item.minutes >= amCheckOutStartMin && item.minutes <= amCheckOutEndMin;
        }
        return item.minutes >= 11 * 60 && item.minutes <= 15 * 60;
      })
      .sort((a, b) => a.minutes - b.minutes);
    const pmInLogs = mappedLogs
      .filter((item) => {
        if (pmCheckInStartMin !== null && pmCheckInEndMin !== null) {
          return item.minutes >= pmCheckInStartMin && item.minutes <= pmCheckInEndMin;
        }
        return item.minutes >= 12 * 60;
      })
      .sort((a, b) => a.minutes - b.minutes);
    const pmOutLogs = mappedLogs
      .filter((item) => {
        if (pmCheckOutStartMin !== null && pmCheckOutEndMin !== null) {
          return item.minutes >= pmCheckOutStartMin && item.minutes <= pmCheckOutEndMin;
        }
        return item.minutes >= 12 * 60;
      })
      .sort((a, b) => b.minutes - a.minutes);

    const amCheckIn = amInLogs[0]?.time || '';
    const amCheckOut = amOutLogs[0]?.time || '';
    const pmCheckIn = pmInLogs[0]?.time || '';
    const pmCheckOut = pmOutLogs[0]?.time || '';

    let lateMinutes = 0;

    if (amCheckIn && Number.isFinite(expectedAmCheckIn)) {
      const actual = timeToMinutesSafe(amCheckIn);
      if (!Number.isNaN(actual) && actual > expectedAmCheckIn) {
        lateMinutes += actual - expectedAmCheckIn;
      }
    }

    if (pmCheckIn && Number.isFinite(expectedPmCheckIn)) {
      const actual = timeToMinutesSafe(pmCheckIn);
      if (!Number.isNaN(actual) && actual > expectedPmCheckIn) {
        lateMinutes += actual - expectedPmCheckIn;
      }
    }

    if (amCheckOut && Number.isFinite(expectedAmCheckOut)) {
      const actual = timeToMinutesSafe(amCheckOut);
      if (!Number.isNaN(actual) && actual < expectedAmCheckOut) {
        lateMinutes += expectedAmCheckOut - actual;
      }
    }

    if (pmCheckOut && Number.isFinite(expectedPmCheckOut)) {
      const actual = timeToMinutesSafe(pmCheckOut);
      if (!Number.isNaN(actual) && actual < expectedPmCheckOut) {
        lateMinutes += expectedPmCheckOut - actual;
      }
    }

    const days = calculateDaysForModal(amCheckIn, amCheckOut, pmCheckIn, pmCheckOut);

    rows.push({
      date,
      displayDate: formatDateDisplay(date),
      amCheckIn: amCheckIn || '—',
      amCheckOut: amCheckOut || '—',
      pmCheckIn: pmCheckIn || '—',
      pmCheckOut: pmCheckOut || '—',
      lateMinutes: Math.round(lateMinutes),
      days,
      rawLogs: logsForDay
    });

    totalLates += lateMinutes;
    totalDays += days;
  });

  return {
    rows,
    totalLates: Math.round(totalLates),
    totalDays: Number(totalDays.toFixed(2)),
    rangeStart: normalizedStart,
    rangeEnd: normalizedEnd
  };
}

const ComputedAttendanceModal = ({
  isOpen,
  onClose,
  employee,
  monthLabel,
  periodLabel,
  logs = [],
  dateRange = { startDate: '', endDate: '' },
  shiftSchedule = null,
  loading = false,
  error = null,
  onFixLog
}) => {
  if (!isOpen) return null;

  const employeeName = employee
    ? formatEmployeeName(employee.surname, employee.firstname, employee.middlename, employee.extension) || employee.name || '—'
    : '—';

  const departmentPosition = employee
    ? [employee.department || employee.DEPARTMENT, employee.position || employee.TITLE].filter(Boolean).join(' - ')
    : '';

  const {
    rows: processedRows,
    totalLates,
    totalDays,
    rangeStart,
    rangeEnd
  } = useMemo(
    () => processLogsForModal(logs, shiftSchedule, dateRange?.startDate, dateRange?.endDate),
    [logs, shiftSchedule, dateRange?.startDate, dateRange?.endDate]
  );

  const rangeLabel = useMemo(() => {
    const start = dateRange?.startDate || rangeStart;
    const end = dateRange?.endDate || rangeEnd;
    if (!start || !end) return '';
    const startDateObj = new Date(`${start}T00:00:00`);
    const endDateObj = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
      return '';
    }
    const sameMonth =
      startDateObj.getMonth() === endDateObj.getMonth() &&
      startDateObj.getFullYear() === endDateObj.getFullYear();
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return sameMonth
      ? `${formatter.format(startDateObj)} – ${endDateObj.getDate()}`
      : `${formatter.format(startDateObj)} – ${formatter.format(endDateObj)}`;
  }, [dateRange, rangeStart, rangeEnd]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gray-900 bg-opacity-60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {employee?.photo_path || employee?.PHOTO ? (
              <img
                src={employee.photo_path || employee.PHOTO}
                alt={employeeName}
                className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-semibold text-indigo-600">
                {employeeName?.charAt(0) || '?'}
              </div>
            )}
            <div>
              <p className="text-xl font-semibold text-gray-900">{employeeName}</p>
              {departmentPosition && (
                <p className="text-sm text-gray-500">{departmentPosition}</p>
              )}
              <p className="text-sm text-gray-600 mt-1">
                {monthLabel || 'Selected Period'} • {periodLabel || 'Full Month'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
              <p className="text-sm text-gray-500">Loading time logs...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm text-red-600 font-medium mb-2">Unable to load time logs</p>
              <p className="text-xs text-gray-500">{error}</p>
            </div>
          ) : processedRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm text-gray-600">No time logs found for the selected period.</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        AM Check-In
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        AM Check-Out
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        PM Check-In
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        PM Check-Out
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Lates
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Day
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {processedRows.map((row) => {
                      const canFix = Boolean(onFixLog) && row.rawLogs.length > 0;
                      return (
                        <tr key={row.date} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.displayDate}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.amCheckIn}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.amCheckOut}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.pmCheckIn}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{row.pmCheckOut}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{formatMinutes(row.lateMinutes)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{row.days || 0}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <button
                              type="button"
                              onClick={() => canFix && onFixLog?.(row)}
                              disabled={!canFix}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition-colors border border-blue-100 shadow-sm hover:shadow disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                              title={canFix ? 'Fix Time' : 'Fix Time unavailable'}
                            >
                              <span role="img" aria-label="Fix Time">🔧</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700" colSpan={5}>
                        Totals
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-indigo-700">
                        {formatMinutes(totalLates)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-indigo-700">
                        {Number(totalDays || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <p className="text-gray-500">Days Displayed</p>
              <p className="text-lg font-semibold text-gray-900">{processedRows.length}</p>
            </div>
            {rangeLabel && (
              <div>
                <p className="text-gray-500">Range</p>
                <p className="text-sm font-medium text-gray-900">{rangeLabel}</p>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center px-6 py-2.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComputedAttendanceModal;

