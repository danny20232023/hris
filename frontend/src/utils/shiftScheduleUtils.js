import api from './api';

// Convert "HH:MM" to minutes
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Extract "HH:MM" from a timestamp string (NO conversion, just slice)
export const extractTimeFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (typeof timestamp === 'string') {
    // Accepts "YYYY-MM-DD HH:MM:SS" or ISO string
    const match = timestamp.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : null;
  }
  return null;
};

// Extract "YYYY-MM-DD" from a timestamp string
export const extractDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  if (typeof timestamp === 'string') {
    return timestamp.slice(0, 10);
  }
  return null;
};

const parseDateParts = (dateStr) => {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  const datePart = raw.split(/[T ]/)[0];
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate()
    };
  }
  return null;
};

const buildUTCDate = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day));

// Format date for display
export const formatDateDisplay = (dateStr) => {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr || '';
  const date = buildUTCDate(parts);
  const day = String(parts.day).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = parts.year;
  const weekday = date.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday}, ${month} ${day}, ${year}`;
};

// Generate date range array
export const generateDateRange = (startDate, endDate) => {
  const startParts = parseDateParts(startDate);
  const endParts = parseDateParts(endDate);
  if (!startParts || !endParts) return [];

  const startTime = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endTime = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  const dates = [];

  for (let current = startTime; current <= endTime; current += 86400000) {
    const date = new Date(current);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
};

// Is weekend
export const isWeekend = (dateStr) => {
  const parts = parseDateParts(dateStr);
  if (!parts) return false;
  const date = buildUTCDate(parts);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

// Format time for display (exported for grid)
export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const t = extractTimeFromTimestamp(timestamp);
  return t || '';
};

// API: Get employee's shift schedule (returns SHIFTSCHEDULE2 row or null)
export const getEmployeeShiftSchedule = async (employeeId) => {
  if (!employeeId) return null;
  try {
    const response = await api.get(`/employees/${employeeId}/shift-schedule`);
    const data = response.data || {};

    // New response shape via DTRPortalUsersController
    if (data.shiftSchedule) {
      const schedule = {
        ...data.shiftSchedule,
        assignedShifts: data.assignedShifts || []
      };
      if (data.employeeObjId) {
        schedule.employeeObjId = data.employeeObjId;
      }
      return schedule;
    }

    // Legacy fallback shape
    if (data && data.InheritDeptSchClass) {
      return {
        SHIFTNO: data.InheritDeptSchClass,
        SHIFTNAME: data.SHIFTNAME,
        SHIFT_AMCHECKIN: data.SHIFT_AMCHECKIN,
        SHIFT_AMCHECKIN_START: data.SHIFT_AMCHECKIN_START,
        SHIFT_AMCHECKIN_END: data.SHIFT_AMCHECKIN_END,
        SHIFT_AMCHECKOUT: data.SHIFT_AMCHECKOUT,
        SHIFT_AMCHECKOUT_START: data.SHIFT_AMCHECKOUT_START,
        SHIFT_AMCHECKOUT_END: data.SHIFT_AMCHECKOUT_END,
        SHIFT_PMCHECKIN: data.SHIFT_PMCHECKIN,
        SHIFT_PMCHECKIN_START: data.SHIFT_PMCHECKIN_START,
        SHIFT_PMCHECKIN_END: data.SHIFT_PMCHECKIN_END,
        SHIFT_PMCHECKOUT: data.SHIFT_PMCHECKOUT,
        SHIFT_PMCHECKOUT_START: data.SHIFT_PMCHECKOUT_START,
        SHIFT_PMCHECKOUT_END: data.SHIFT_PMCHECKOUT_END,
        assignedShifts: [],
        employeeObjId: data.employeeObjId || null
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Error fetching employee shift schedule:', error);
    return null;
  }
};// Get expected times for a shift schedule (all as "HH:MM" or null)
export const getExpectedTimes = (shiftSchedule) => {
  if (!shiftSchedule) return {};
  return {
    amCheckIn: extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN),
    amCheckInStart: extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN_START),
    amCheckInEnd: extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN_END),
    amCheckOut: extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKOUT),
    amCheckOutStart: extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKOUT_START),
    amCheckOutEnd: extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKOUT_END),
    pmCheckIn: extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN),
    pmCheckInStart: extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN_START),
    pmCheckInEnd: extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN_END),
    pmCheckOut: extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKOUT),
    pmCheckOutStart: extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKOUT_START),
    pmCheckOutEnd: extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKOUT_END)
  };
};

// Group logs by raw (for Raw Logs view)
export const groupLogsByRaw = (logs, startDate, endDate) => {
  try {
    if (!logs || !Array.isArray(logs) || logs.length === 0) return [];
    const logsByDate = {};
    logs.forEach((log) => {
      const checkTime = log.CHECKTIME || log.checktime || log.CheckTime;
      if (!checkTime) return;
      const dateStr = extractDateFromTimestamp(checkTime);
      if (!dateStr) return;
      if (!logsByDate[dateStr]) logsByDate[dateStr] = [];
      logsByDate[dateStr].push(log);
    });
    const allDates = generateDateRange(startDate, endDate);
    return allDates.map(dateStr => {
      const dateLogs = logsByDate[dateStr] || [];
      const weekendCheck = isWeekend(dateStr);
      // Split logs into AM/PM based on 12:00
      const amLogs = [];
      const pmLogs = [];
      dateLogs.forEach(log => {
        const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
        if (!t) return;
        const min = timeToMinutes(t);
        if (min < 720) {
          amLogs.push({ ...log, time: t });
        } else {
          pmLogs.push({ ...log, time: t });
        }
      });
      return {
        date: formatDateDisplay(dateStr),
        dateStr: dateStr,
        amLogs,
        pmLogs,
        remarks: weekendCheck ? 'Weekend' : '',
        isWeekend: weekendCheck
      };
    });
  } catch (error) {
    console.error('❌ Error in groupLogsByRaw:', error);
    return [];
  }
};

// Main function to process logs based on SHIFTSCHEDULE2
export const getBestLogsByShift = async (logs, startDate, endDate, employeeId) => {
  try {
    const shiftSchedule = await getEmployeeShiftSchedule(employeeId);
    if (!shiftSchedule) return [];
    const expectedTimes = getExpectedTimes(shiftSchedule);

    // Extract all relevant shift times as "HH:MM"
    const amCheckIn = expectedTimes.amCheckIn;
    const amCheckInStart = expectedTimes.amCheckInStart;
    const amCheckInEnd = expectedTimes.amCheckInEnd;
    const amCheckOut = expectedTimes.amCheckOut;
    const amCheckOutStart = expectedTimes.amCheckOutStart;
    const amCheckOutEnd = expectedTimes.amCheckOutEnd;
    const pmCheckIn = expectedTimes.pmCheckIn;
    const pmCheckInStart = expectedTimes.pmCheckInStart;
    const pmCheckInEnd = expectedTimes.pmCheckInEnd;
    const pmCheckOut = expectedTimes.pmCheckOut;
    const pmCheckOutStart = expectedTimes.pmCheckOutStart;
    const pmCheckOutEnd = expectedTimes.pmCheckOutEnd;

    const hasAMCheckOutGroup = amCheckOutStart && amCheckOutEnd;
    const hasPMCheckInGroup = pmCheckInStart && pmCheckInEnd;

    const logsByDate = {};
    logs.forEach(log => {
      const dateStr = extractDateFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
      if (!dateStr) return;
      if (!logsByDate[dateStr]) logsByDate[dateStr] = [];
      logsByDate[dateStr].push(log);
    });

    const allDates = generateDateRange(startDate, endDate);

    return allDates.map(dateStr => {
      const dateLogs = logsByDate[dateStr] || [];
      const weekend = isWeekend(dateStr);

      // --- AM Check-In ---
      let amCheckInLog = null;
      if (amCheckIn && amCheckInStart && amCheckInEnd) {
        const groupLogs = dateLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          if (!t) return false;
          const min = timeToMinutes(t);
          return min >= timeToMinutes(amCheckInStart) && min <= timeToMinutes(amCheckInEnd);
        });
        const before = groupLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          return timeToMinutes(t) <= timeToMinutes(amCheckIn);
        });
        if (before.length > 0) {
          amCheckInLog = before.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return tb > ta ? b : a;
          });
        } else if (groupLogs.length > 0) {
          amCheckInLog = groupLogs.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return Math.abs(ta - timeToMinutes(amCheckIn)) < Math.abs(tb - timeToMinutes(amCheckIn)) ? a : b;
          });
        }
      }

      // --- AM Check-Out (include logs exactly at AM_CHECKOUT_END) ---
      let amCheckOutLog = null;
      if (hasAMCheckOutGroup && amCheckOut && amCheckOutStart && amCheckOutEnd) {
        const groupLogs = dateLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          if (!t) return false;
          const min = timeToMinutes(t);
          return min >= timeToMinutes(amCheckOutStart) && min <= timeToMinutes(amCheckOutEnd);
        });
        const after = groupLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          return timeToMinutes(t) >= timeToMinutes(amCheckOut);
        });
        if (after.length > 0) {
          amCheckOutLog = after.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return ta < tb ? a : b;
          });
        } else if (groupLogs.length > 0) {
          amCheckOutLog = groupLogs.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return Math.abs(ta - timeToMinutes(amCheckOut)) < Math.abs(tb - timeToMinutes(amCheckOut)) ? a : b;
          });
        }
      }

      // --- PM Check-In ---
      let pmCheckInLog = null;
      if (hasPMCheckInGroup && pmCheckIn && pmCheckInStart && pmCheckInEnd) {
        const groupLogs = dateLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          if (!t) return false;
          const min = timeToMinutes(t);
          return min >= timeToMinutes(pmCheckInStart) && min <= timeToMinutes(pmCheckInEnd);
        });
        const before = groupLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          return timeToMinutes(t) <= timeToMinutes(pmCheckIn);
        });
        if (before.length > 0) {
          pmCheckInLog = before.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return tb > ta ? b : a;
          });
        } else if (groupLogs.length > 0) {
          pmCheckInLog = groupLogs.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return Math.abs(ta - timeToMinutes(pmCheckIn)) < Math.abs(tb - timeToMinutes(pmCheckIn)) ? a : b;
          });
        }
      }

      // --- PM Check-Out ---
      let pmCheckOutLog = null;
      if (pmCheckOut && pmCheckOutStart && pmCheckOutEnd) {
        const groupLogs = dateLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          if (!t) return false;
          const min = timeToMinutes(t);
          return min >= timeToMinutes(pmCheckOutStart) && min <= timeToMinutes(pmCheckOutEnd);
        });
        const after = groupLogs.filter(log => {
          const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
          return timeToMinutes(t) >= timeToMinutes(pmCheckOut);
        });
        if (after.length > 0) {
          pmCheckOutLog = after.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return ta < tb ? a : b;
          });
        } else if (groupLogs.length > 0) {
          pmCheckOutLog = groupLogs.reduce((a, b) => {
            const ta = timeToMinutes(extractTimeFromTimestamp(a.CHECKTIME || a.checktime || a.CheckTime));
            const tb = timeToMinutes(extractTimeFromTimestamp(b.CHECKTIME || b.checktime || b.CheckTime));
            return Math.abs(ta - timeToMinutes(pmCheckOut)) < Math.abs(tb - timeToMinutes(pmCheckOut)) ? a : b;
          });
        }
      }

      // If AM_CHECKOUT and PM_CHECKIN groupings are null, do not group for those columns
      const amCheckOutTime = hasAMCheckOutGroup ? (amCheckOutLog ? extractTimeFromTimestamp(amCheckOutLog.CHECKTIME) : null) : null;
      const pmCheckInTime = hasPMCheckInGroup ? (pmCheckInLog ? extractTimeFromTimestamp(pmCheckInLog.CHECKTIME) : null) : null;

      // Calculate late minutes
      const lateMinutes = (() => {
        let late = 0;
        if (amCheckIn && amCheckInLog) {
          const actual = extractTimeFromTimestamp(amCheckInLog.CHECKTIME);
          const expected = amCheckIn;
          if (actual && expected) {
            const diff = timeToMinutes(actual) - timeToMinutes(expected);
            if (diff > 0) late += diff;
          }
        }
        if (pmCheckIn && pmCheckInLog) {
          const actual = extractTimeFromTimestamp(pmCheckInLog.CHECKTIME);
          const expected = pmCheckIn;
          if (actual && expected) {
            const diff = timeToMinutes(actual) - timeToMinutes(expected);
            if (diff > 0) late += diff;
          }
        }
        return late;
      })();

      // Calculate total hours worked
      const totalHours = (() => {
        let total = 0;
        const getMinutes = t => t ? timeToMinutes(t) : null;
        const amIn = amCheckInLog ? extractTimeFromTimestamp(amCheckInLog.CHECKTIME) : null;
        const amOut = amCheckOutTime;
        const pmIn = pmCheckInTime;
        const pmOut = pmCheckOutLog ? extractTimeFromTimestamp(pmCheckOutLog.CHECKTIME) : null;
        if (amIn && amOut) total += Math.max(0, getMinutes(amOut) - getMinutes(amIn));
        if (pmIn && pmOut) total += Math.max(0, getMinutes(pmOut) - getMinutes(pmIn));
        return Math.round((total / 60) * 100) / 100;
      })();

      return {
        date: formatDateDisplay(dateStr),
        dateStr,
        amCheckIn: amCheckInLog ? extractTimeFromTimestamp(amCheckInLog.CHECKTIME) : null,
        amCheckOut: amCheckOutTime,
        pmCheckIn: pmCheckInTime,
        pmCheckOut: pmCheckOutLog ? extractTimeFromTimestamp(pmCheckOutLog.CHECKTIME) : null,
        lateMinutes,
        totalHours,
        remarks: weekend ? 'Weekend' : '',
        isWeekend: weekend,
        shiftSchedule: shiftSchedule.SHIFTNAME
      };
    });

  } catch (error) {
    console.error('❌ Error in getBestLogsByShift:', error);
    return [];
  }
};

