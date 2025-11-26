import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  generateDateRange,
  isWeekend,
  extractTimeFromTimestamp,
  timeToMinutes,
  extractDateFromTimestamp
} from '../../utils/shiftScheduleUtils';
import api from '../../utils/api';
import { normalizeCdoUsageMap, getCdoEntriesForDate } from '../../utils/cdoUtils';
import { useAuth } from '../../authContext';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

// Date formatting for "20-Aug-2025, Fri"
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const raw = String(dateStr).trim();
  const datePart = raw.split(/[T ]/)[0];

  const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const dayNum = String(day).padStart(2, '0');
    const monthName = utcDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const yearNum = utcDate.getUTCFullYear();
    const weekday = utcDate.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
    return `${dayNum}-${monthName}-${yearNum}, ${weekday}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    const month = parsed.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = parsed.getUTCFullYear();
    const weekday = parsed.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
    return `${day}-${month}-${year}, ${weekday}`;
  }

  return raw;
};

const extractTime = (value) => {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
};

const extractDate = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value.split(/[ T]/)[0];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
};

// Simple date extraction for leave dates that matches the grid's extractDateFromTimestamp approach
// Avoids timezone conversions that can shift dates
const extractLeaveDate = (value) => {
  if (!value) return '';
  
  // If it's already a YYYY-MM-DD string, return as-is
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // If it matches YYYY-MM-DD format exactly, return it
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Otherwise, take first 10 characters (like extractDateFromTimestamp)
    if (trimmed.length >= 10) {
      return trimmed.slice(0, 10);
    }
    return trimmed;
  }
  
  // If it's a Date object, format it directly without timezone conversion
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return '';
};

// Helper to determine which columns are active based on assigned shift
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
    hasAMCheckIn: !!(shiftSchedule.SHIFT_AMCHECKIN),
    hasAMCheckOut: !!(shiftSchedule.SHIFT_AMCHECKOUT),
    hasPMCheckIn: !!(shiftSchedule.SHIFT_PMCHECKIN),
    hasPMCheckOut: !!(shiftSchedule.SHIFT_PMCHECKOUT)
  };
};

const normalizeLocatorDateTime = (value) => {
  if (!value) {
    return { date: '', time: '', minutes: null };
  }
  const date = extractDate(value);
  const time = extractTime(typeof value === 'string' ? value : String(value));
  const minutes = time ? timeToMinutes(time) : null;
  return { date, time, minutes };
};

const getApprovedLocatorWindowsForDate = (locatorData, dateStr) => {
  if (!Array.isArray(locatorData) || !dateStr) return [];

  return locatorData
    .filter(locator => {
      const status = (locator.locstatus || locator.LOCSTATUS || '').toString().toUpperCase();
      if (status !== 'APPROVED') {
        return false;
      }

      const locatorDate = extractDate(locator.locatordate || locator.LOCDATE || locator.locdate);
      return locatorDate === dateStr;
    })
    .map(locator => {
      const departureValue = locator.loctimedeparture || locator.locdeparture || locator.LOCTIMEDEPARTURE;
      const arrivalValue = locator.loctimearrival || locator.locarrival || locator.LOCTIMEARRIVAL;

      const departure = normalizeLocatorDateTime(departureValue);
      const arrival = normalizeLocatorDateTime(arrivalValue);

      if (departure.minutes === null && arrival.minutes === null) {
        return null;
      }

      const minMinutes = Math.min(
        departure.minutes ?? arrival.minutes ?? 0,
        arrival.minutes ?? departure.minutes ?? 0
      );
      const maxMinutes = Math.max(
        departure.minutes ?? arrival.minutes ?? 0,
        arrival.minutes ?? departure.minutes ?? 0
      );

      return {
        raw: locator,
        startMinutes: minMinutes,
        endMinutes: maxMinutes,
        departureTime: departure.time,
        arrivalTime: arrival.time
      };
    })
    .filter(Boolean);
};

const applyLocatorBackfillToProcessedLogs = (processed, locatorData, shiftSchedule) => {
  if (!Array.isArray(processed) || !locatorData || !shiftSchedule) {
    return processed;
  }

  const scheduleTimeMap = {
    amCheckIn: shiftSchedule.SHIFT_AMCHECKIN ? extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN) : '',
    amCheckOut: shiftSchedule.SHIFT_AMCHECKOUT ? extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKOUT) : '',
    pmCheckIn: shiftSchedule.SHIFT_PMCHECKIN ? extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN) : '',
    pmCheckOut: shiftSchedule.SHIFT_PMCHECKOUT ? extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKOUT) : ''
  };

  const scheduleMinutesMap = {
    amCheckIn: scheduleTimeMap.amCheckIn ? timeToMinutes(scheduleTimeMap.amCheckIn) : null,
    amCheckOut: scheduleTimeMap.amCheckOut ? timeToMinutes(scheduleTimeMap.amCheckOut) : null,
    pmCheckIn: scheduleTimeMap.pmCheckIn ? timeToMinutes(scheduleTimeMap.pmCheckIn) : null,
    pmCheckOut: scheduleTimeMap.pmCheckOut ? timeToMinutes(scheduleTimeMap.pmCheckOut) : null
  };

  const fillKeys = [
    { key: 'amCheckIn', scheduleKey: 'amCheckIn' },
    { key: 'amCheckOut', scheduleKey: 'amCheckOut' },
    { key: 'pmCheckIn', scheduleKey: 'pmCheckIn' },
    { key: 'pmCheckOut', scheduleKey: 'pmCheckOut' }
  ];

  return processed.map(day => {
    if (!day || !day.dateStr) {
      return day;
    }

    const locatorWindows = getApprovedLocatorWindowsForDate(locatorData, day.dateStr);
    if (locatorWindows.length === 0) {
      return day;
    }

    const updatedDay = { ...day };
    const locatorBackfill = { ...(day.locatorBackfill || {}) };

    fillKeys.forEach(({ key, scheduleKey }) => {
      const currentValue = updatedDay[key];
      const normalizedValue = typeof currentValue === 'string' ? currentValue.trim() : '';
      const hasExisting = normalizedValue !== '' && normalizedValue !== '-';
      const scheduleTime = scheduleTimeMap[scheduleKey];
      const scheduleMinutes = scheduleMinutesMap[scheduleKey];

      // If no schedule time or minutes, preserve existing flag or set to false
      if (!scheduleTime || scheduleMinutes === null) {
        locatorBackfill[key] = locatorBackfill[key] || false;
        return;
      }

      // If time value already exists, check if it matches the schedule time (indicating locator backfill)
      if (hasExisting) {
        // If the existing value matches the schedule time, it's likely a locator backfill
        // Preserve the existing flag if it was already set to true
        if (locatorBackfill[key] === true) {
          // Keep it as true - it was already marked as locator backfill
          return;
        }
        // If the existing value matches schedule time but flag wasn't set, check if it should be
        if (normalizedValue === scheduleTime) {
          // Check if schedule time is within locator window
          const withinWindow = locatorWindows.some(window => {
            if (window.startMinutes == null || window.endMinutes == null) return false;
            return scheduleMinutes >= window.startMinutes && scheduleMinutes <= window.endMinutes;
          });
          if (withinWindow) {
            locatorBackfill[key] = true;
          } else {
            locatorBackfill[key] = locatorBackfill[key] || false;
          }
        } else {
          // Existing value doesn't match schedule - not a locator backfill
          locatorBackfill[key] = false;
        }
        return;
      }

      // No existing value - check if we should backfill
      const withinWindow = locatorWindows.some(window => {
        if (window.startMinutes == null || window.endMinutes == null) return false;
        return scheduleMinutes >= window.startMinutes && scheduleMinutes <= window.endMinutes;
      });

      if (withinWindow) {
        updatedDay[key] = scheduleTime;
        locatorBackfill[key] = true;
      } else {
        locatorBackfill[key] = locatorBackfill[key] || false;
      }
    });

    updatedDay.locatorBackfill = locatorBackfill;
    return updatedDay;
  });
};

// Helper to normalize status labels
const normalizeStatusLabel = (status) => {
  if (!status) return 'For Approval';
  const normalized = status.toString().trim();
  if (!normalized) return 'For Approval';
  const lower = normalized.toLowerCase();
  if (lower === 'pending') return 'For Approval';
  if (lower === 'for approval') return 'For Approval';
  if (lower === 'approved') return 'Approved';
  if (lower === 'returned') return 'Returned';
  if (lower === 'cancelled') return 'Cancelled';
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
};

// Helper to get fix log for a date - ONLY returns Approved status fix logs
const getFixLogForDate = (dateStr, fixLogsData, employeeObjId) => {
  if (!fixLogsData || fixLogsData.length === 0 || !dateStr || !employeeObjId) {
    console.log('🔍 [FIX LOGS DEBUG] getFixLogForDate early return:', {
      hasFixLogsData: !!fixLogsData,
      fixLogsDataLength: fixLogsData?.length || 0,
      dateStr,
      employeeObjId
    });
    return null;
  }

  console.log('🔍 [FIX LOGS DEBUG] getFixLogForDate called:', {
    dateStr,
    employeeObjId,
    fixLogsDataLength: fixLogsData?.length || 0,
    sampleFixLog: fixLogsData?.[0] ? {
      checktimedate: fixLogsData[0].checktimedate || fixLogsData[0].CHECKTIMEDATE,
      fixstatus: fixLogsData[0].fixstatus || fixLogsData[0].FIXSTATUS,
      emp_objid: fixLogsData[0].emp_objid
    } : null
  });

  const fixLogsForDate = fixLogsData.filter(fixLog => {
    // Handle date extraction - backend returns YYYY-MM-DD format directly
    const rawDate = fixLog.checktimedate || fixLog.CHECKTIMEDATE || '';
    // If it's already in YYYY-MM-DD format, use it directly
    const fixDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) 
      ? rawDate 
      : extractDate(rawDate);
    
    const datesMatch = fixDate === dateStr;
    
    // CRITICAL: Only return Approved status fix logs
    const rawStatus = fixLog.fixstatus || fixLog.FIXSTATUS || '';
    const status = normalizeStatusLabel(rawStatus);
    const isApproved = status === 'Approved';

    // Match by employee object ID
    const rawEmpObjId = fixLog.emp_objid;
    const matchesObjId =
      rawEmpObjId !== undefined &&
      rawEmpObjId !== null &&
      String(rawEmpObjId) === String(employeeObjId);

    console.log('🔍 [FIX LOGS DEBUG] Checking fix log:', {
      fixLogId: fixLog.fixid || fixLog.objid || 'unknown',
      rawChecktimedate: rawDate,
      extractedFixDate: fixDate,
      targetDateStr: dateStr,
      datesMatch,
      rawFixstatus: rawStatus,
      normalizedStatus: status,
      isApproved,
      rawEmpObjId,
      targetEmpObjId: employeeObjId,
      empObjIdsMatch: matchesObjId,
      passesFilter: datesMatch && isApproved && matchesObjId
    });

    return datesMatch && isApproved && matchesObjId;
  });

  console.log('🔍 [FIX LOGS DEBUG] Filtered fix logs:', {
    totalFixLogs: fixLogsData.length,
    matchingFixLogs: fixLogsForDate.length,
    matchingFixLog: fixLogsForDate[0] || null
  });

  if (fixLogsForDate.length === 0) {
    return null;
  }

  // Return the most recent fix log (if multiple exist)
  return fixLogsForDate[0];
};

// Helper to apply fix logs to processed logs - only Approved status
// Only applies fields that correspond to active columns in the assigned shift
const applyFixLogsToProcessedLogs = (processed, fixLogsData, employeeObjId, shiftSchedule) => {
  if (!Array.isArray(processed) || !fixLogsData || fixLogsData.length === 0 || !employeeObjId) {
    console.log('🔍 [FIX LOGS DEBUG] applyFixLogsToProcessedLogs early return:', {
      isArray: Array.isArray(processed),
      processedLength: processed?.length || 0,
      hasFixLogsData: !!fixLogsData,
      fixLogsDataLength: fixLogsData?.length || 0,
      employeeObjId
    });
    return processed;
  }

  // Get active columns based on assigned shift
  const activeColumns = getActiveColumns(shiftSchedule);

  console.log('🔍 [FIX LOGS DEBUG] applyFixLogsToProcessedLogs called:', {
    processedDays: processed.length,
    fixLogsDataLength: fixLogsData.length,
    employeeObjId,
    employeeObjIdType: typeof employeeObjId,
    sampleFixLog: fixLogsData[0] ? {
      emp_objid: fixLogsData[0].emp_objid,
      emp_objidType: typeof fixLogsData[0].emp_objid,
      checktimedate: fixLogsData[0].checktimedate,
      fixstatus: fixLogsData[0].fixstatus
    } : null
  });

  return processed.map(day => {
    if (!day || !day.dateStr) {
      return day;
    }

    // Check if locator backfill exists - if yes, skip fix logs (locator takes precedence)
    const hasLocatorBackfill = day.locatorBackfill && (
      day.locatorBackfill.amCheckIn ||
      day.locatorBackfill.amCheckOut ||
      day.locatorBackfill.pmCheckIn ||
      day.locatorBackfill.pmCheckOut
    );

    if (hasLocatorBackfill) {
      console.log('🔍 [FIX LOGS DEBUG] Skipping fix logs for date (locator backfill exists):', day.dateStr);
      return day;
    }

    const fixLog = getFixLogForDate(day.dateStr, fixLogsData, employeeObjId);
    console.log('🔍 [FIX LOGS DEBUG] applyFixLogsToProcessedLogs for date:', day.dateStr, {
      fixLogFound: !!fixLog,
      dateStr: day.dateStr,
      dateStrType: typeof day.dateStr,
      employeeObjId,
      employeeObjIdType: typeof employeeObjId,
      fixLogsDataLength: fixLogsData?.length || 0,
      fixLogData: fixLog ? {
        fixid: fixLog.fixid || fixLog.objid,
        checktimedate: fixLog.checktimedate || fixLog.CHECKTIMEDATE,
        fixstatus: fixLog.fixstatus || fixLog.FIXSTATUS,
        emp_objid: fixLog.emp_objid,
        emp_objidType: typeof fixLog.emp_objid,
        am_checkin: fixLog.am_checkin,
        am_checkout: fixLog.am_checkout,
        pm_checkin: fixLog.pm_checkin,
        pm_checkout: fixLog.pm_checkout
      } : null,
      allFixLogsForDebug: fixLogsData?.map(fl => ({
        checktimedate: fl.checktimedate || fl.CHECKTIMEDATE,
        emp_objid: fl.emp_objid,
        fixstatus: fl.fixstatus || fl.FIXSTATUS
      })) || []
    });
    
    if (!fixLog) {
      console.log('⚠️ [FIX LOGS DEBUG] No fix log found for date, returning day without override:', day.dateStr);
      return day;
    }

    // Explicit status check - only override if status is "Approved"
    const rawStatus = fixLog.fixstatus || fixLog.FIXSTATUS || '';
    const status = normalizeStatusLabel(rawStatus);
    const isApproved = status === 'Approved';

    if (!isApproved) {
      console.log('🔍 [FIX LOGS DEBUG] Fix log status is not Approved, skipping override:', {
        dateStr: day.dateStr,
        status: status,
        fixLogId: fixLog.fixid || fixLog.objid
      });
      return day; // Don't override if not Approved
    }

    // Fix log exists and is Approved - override time values
    const updatedDay = { ...day };
    const fixLogBackfill = {};

    // Field mappings: day field -> fix log field -> active column check
    const fieldMappings = [
      { dayField: 'amCheckIn', fixLogField: 'am_checkin', isActive: activeColumns.hasAMCheckIn },
      { dayField: 'amCheckOut', fixLogField: 'am_checkout', isActive: activeColumns.hasAMCheckOut },
      { dayField: 'pmCheckIn', fixLogField: 'pm_checkin', isActive: activeColumns.hasPMCheckIn },
      { dayField: 'pmCheckOut', fixLogField: 'pm_checkout', isActive: activeColumns.hasPMCheckOut }
    ];

    fieldMappings.forEach(({ dayField, fixLogField, isActive }) => {
      // Skip applying fix log field if the column is not active in the assigned shift
      if (!isActive) {
        console.log('🔍 [FIX LOGS DEBUG] Skipping field (not active in assigned shift):', {
          dayField,
          fixLogField,
          isActive
        });
        fixLogBackfill[dayField] = false;
        return;
      }
      // Try multiple field name variations (lowercase, uppercase, camelCase)
      const fixLogValue = fixLog[fixLogField] || 
                         fixLog[fixLogField.toUpperCase()] || 
                         fixLog[fixLogField.toLowerCase()] ||
                         fixLog[fixLogField.charAt(0).toUpperCase() + fixLogField.slice(1)] ||
                         '';

      console.log('🔍 [FIX LOGS DEBUG] Processing field:', {
        dayField,
        fixLogField,
        fixLogValue,
        hasValue: fixLogValue && fixLogValue.trim() !== '' && fixLogValue !== '-'
      });

      if (fixLogValue && fixLogValue.trim() !== '' && fixLogValue !== '-') {
        // Normalize time value to HH:mm format
        let normalizedTime = extractTimeFromTimestamp(fixLogValue);
        if (!normalizedTime) {
          // If it's already in HH:mm or HH:mm:ss format, extract just HH:mm
          const timeMatch = String(fixLogValue).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
          if (timeMatch) {
            const hour = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
            const minute = timeMatch[2];
            normalizedTime = `${hour}:${minute}`;
          }
        }
        if (normalizedTime) {
          updatedDay[dayField] = normalizedTime;
          fixLogBackfill[dayField] = true;
        } else {
          fixLogBackfill[dayField] = false;
        }
      } else {
        fixLogBackfill[dayField] = false;
      }
    });

    updatedDay.fixLogBackfill = fixLogBackfill;
    updatedDay.fixLog = fixLog;

    console.log('🔍 [FIX LOGS DEBUG] Fix log applied to day:', {
      dateStr: day.dateStr,
      hasFixLog: !!updatedDay.fixLog,
      hasFixLogBackfill: !!updatedDay.fixLogBackfill,
      fixLogBackfillFlags: updatedDay.fixLogBackfill,
      fixLogStatus: updatedDay.fixLog?.fixstatus
    });

    return updatedDay;
  });
};

// Helper to get locator remarks for a date (works with both old LOCATOR2 and new employee_locators format)
const getLocatorRemarksForDate = (locatorData, dateStr, userId) => {
  if (!locatorData || locatorData.length === 0) return '';
  const locatorsForDate = locatorData.filter(locator => {
    const locDate = extractDate(locator.LOCDATE || locator.locatordate);
    // For new format, we don't check USERID since we already filtered by emp_objid
    // For old format, check USERID match
    if (locator.LOCUSERID) {
      return locDate === dateStr && String(locator.LOCUSERID) === String(userId);
    }
    // New format - just check date match
    return locDate === dateStr;
  });
  // Format remarks as "Locator(status)" where status comes from LOCSTATUS or locstatus
  const remarks = locatorsForDate.map(l => {
    const status = l.LOCSTATUS || l.locstatus || 'For Approval';
    return `Locator(${status})`;
  }).filter(Boolean);
  // If there are locators for this date, return formatted remarks
  return remarks.length > 0 ? remarks.join('; ') : '';
};

// Helper: Get leave objects for a specific date - returns array of leave objects
// Helper to match employee for leave records (supports both emp_objid and USERID)
const matchesEmployeeForLeave = (leave, userId, employeeObjId) => {
  const empObjIdStr = employeeObjId !== undefined && employeeObjId !== null ? String(employeeObjId) : null;
  const userIdStr = userId !== undefined && userId !== null ? String(userId) : null;

  if (empObjIdStr && leave.emp_objid !== undefined && leave.emp_objid !== null) {
    if (String(leave.emp_objid) === empObjIdStr) return true;
  }

  if (userIdStr && leave.USERID !== undefined && leave.USERID !== null) {
    if (String(leave.USERID) === userIdStr) return true;
  }

  return false;
};

const getLeavesForDate = (leaveData, dateStr, userId, employeeObjId) => {
  if (!leaveData || leaveData.length === 0) return [];
  
  return leaveData.filter(leave => {
    // Check if leave has details array (new structure from backend)
    if (leave.details && Array.isArray(leave.details) && leave.details.length > 0) {
      const hasMatchingDate = leave.details.some(detail => {
        const detailDate = extractLeaveDate(detail.deducteddate || detail.leavedate);
        return detailDate === dateStr;
      });
      const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
      return hasMatchingDate && matchesEmployee;
    }
    
    // Check if leave has leaveDates array (alternative new structure)
    if (leave.leaveDates && Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractLeaveDate(leaveDate.LEAVEDATE || leaveDate.leavedate);
        return leaveDateStr === dateStr;
      });
      const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
      return hasMatchingDate && matchesEmployee;
    }
    
    // Fallback to old structure (single LEAVEDATE)
    const leaveDate = extractLeaveDate(leave.LEAVEDATE);
    const dateMatch = leaveDate === dateStr;
    const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
    return dateMatch && matchesEmployee;
  });
};

// Helper to get leave remarks for a date
const getLeaveRemarksForDate = (leaveData, dateStr, userId, employeeObjId) => {
  const callId = Math.random().toString(36).substr(2, 9); // Unique identifier for this call
  console.log(`�� [LEAVE REMARKS ${callId}] getLeaveRemarksForDate called with:`, { 
    dateStr, 
    userId, 
    employeeObjId,
    leaveDataLength: leaveData?.length
  });
  
  if (!leaveData || leaveData.length === 0) {
    console.log(`❌ [LEAVE REMARKS ${callId}] No leave data available`);
    return '';
  }

  // Enhanced debugging: log sample leave structure
  if (leaveData.length > 0) {
    console.log(`🔍 [LEAVE REMARKS ${callId}] Sample leave structure:`, {
      firstLeave: {
        objid: leaveData[0].objid,
        emp_objid: leaveData[0].emp_objid,
        leavestatus: leaveData[0].leavestatus,
        LEAVESTATUS: leaveData[0].LEAVESTATUS,
        status: leaveData[0].status,
        leaveno: leaveData[0].leaveno,
        LEAVEREFNO: leaveData[0].LEAVEREFNO,
        leave_type_name: leaveData[0].leave_type_name,
        detailsCount: leaveData[0].details?.length || 0,
        firstDetail: leaveData[0].details?.[0],
        hasDetails: !!leaveData[0].details
      }
    });
  }

  const leavesForDate = leaveData.filter(leave => {
    const rawStatus = leave.leavestatus || leave.LEAVESTATUS || leave.status;
    const status = normalizeStatusLabel(rawStatus);
    
    console.log(`🔍 [LEAVE REMARKS ${callId}] Checking leave status:`, {
      rawStatus,
      normalizedStatus: status,
      isApproved: status === 'Approved',
      leaveRefNo: leave.leaveno || leave.LEAVEREFNO
    });
    
    if (status !== 'Approved') {
      return false;
    }
    
    // Check if leave has details array (new structure from backend)
    if (leave.details && Array.isArray(leave.details) && leave.details.length > 0) {
      const hasMatchingDate = leave.details.some(detail => {
        const rawDetailDate = detail.deducteddate || detail.leavedate;
        const detailDate = extractLeaveDate(rawDetailDate);
        const dateMatch = detailDate === dateStr;
        
        console.log(`🔍 [LEAVE REMARKS ${callId}] Checking detail date:`, {
          rawDetailDate,
          extractedDetailDate: detailDate,
          targetDateStr: dateStr,
          dateMatch,
          detailDateType: typeof rawDetailDate
        });
        
        return dateMatch;
      });
      const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
      
      console.log(`🔍 [LEAVE REMARKS ${callId}] Details array check result:`, {
        hasMatchingDate,
        matchesEmployee,
        leaveEmpObjId: leave.emp_objid,
        targetEmpObjId: employeeObjId,
        leaveUserId: leave.USERID,
        targetUserId: userId
      });
      
      if (hasMatchingDate && matchesEmployee) {
        console.log(`✅ [LEAVE REMARKS ${callId}] Found matching leave (details array):`, {
          leaveRefNo: leave.leaveno || leave.LEAVEREFNO,
          leaveType: leave.leave_type_name || leave.LeaveName,
          detailDates: leave.details.map(d => ({
            raw: d.deducteddate || d.leavedate,
            extracted: extractLeaveDate(d.deducteddate || d.leavedate)
          }))
        });
        return true;
      }
      return false;
    }
    
    // Check if leave has leaveDates array (alternative new structure)
    if (leave.leaveDates && Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractLeaveDate(leaveDate.LEAVEDATE || leaveDate.leavedate);
        return leaveDateStr === dateStr;
      });
      const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
      
      if (hasMatchingDate && matchesEmployee) {
        console.log(`🔍 [LEAVE REMARKS ${callId}] Found matching leave (leaveDates array):`, {
          leaveRefNo: leave.leaveno || leave.LEAVEREFNO,
          leaveType: leave.leave_type_name || leave.LeaveName
        });
        return true;
      }
      return false;
    }
    
    // Fallback to old structure (single LEAVEDATE)
    const leaveDate = extractLeaveDate(leave.LEAVEDATE);
    const dateMatch = leaveDate === dateStr;
    const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
    
    console.log(`🔍 [LEAVE REMARKS ${callId}] Checking leave (old structure):`, {
      leaveDate,
      targetDate: dateStr,
      leaveUserId: leave.USERID,
      leaveEmpObjId: leave.emp_objid,
      targetUserId: userId,
      targetEmpObjId: employeeObjId,
      dateMatch,
      matchesEmployee,
      leaveType: leave.leave_type_name || leave.LeaveName,
      leaveRefNo: leave.leaveno || leave.LEAVEREFNO,
      willInclude: dateMatch && matchesEmployee
    });
    
    return dateMatch && matchesEmployee;
  });
  
  console.log(`✅ [LEAVE REMARKS ${callId}] Found leaves for date:`, leavesForDate.length, leavesForDate);
  
  if (leavesForDate.length === 0) return '';
  
  // Updated format: "Leave(leaveno)" - e.g., "Leave(251102LV-002)"
  // No status indicator in text - color will indicate status
  const result = leavesForDate.map(l => {
    const leaveno = l.leaveno || l.LEAVEREFNO || 'N/A';
    console.log(`🔍 [LEAVE REMARKS ${callId}] Processing leave:`, {
      leaveName: l.leave_type_name || l.LeaveName,
      leaveno: leaveno,
      status: l.leavestatus || l.LEAVESTATUS || ''
    });
    return `Leave(${leaveno})`;
  }).join('; ');
  
  console.log(`✅ [LEAVE REMARKS ${callId}] Final result:`, result);
  return result;
};

const normalizeTravelDateString = (value) => {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return extractDateFromTimestamp(str);
};

const extractNormalizedTravelDates = (travel) => {
  if (!travel) return [];

  if (Array.isArray(travel.normalizedTravelDates)) {
    return travel.normalizedTravelDates.filter(Boolean);
  }

  const collected = new Set();

  if (Array.isArray(travel.travel_dates_array)) {
    travel.travel_dates_array.forEach(dateVal => {
      const normalized = normalizeTravelDateString(dateVal);
      if (normalized) collected.add(normalized);
    });
  }

  if (typeof travel.travel_dates === 'string') {
    travel.travel_dates.split(',').forEach(part => {
      const normalized = normalizeTravelDateString(part);
      if (normalized) collected.add(normalized);
    });
  }

  if (Array.isArray(travel.travel_dates)) {
    travel.travel_dates.forEach(dateVal => {
      const normalized = normalizeTravelDateString(dateVal);
      if (normalized) collected.add(normalized);
    });
  }

  if (travel.TRAVELDATE) {
    const normalized = normalizeTravelDateString(extractDateFromTimestamp(travel.TRAVELDATE));
    if (normalized) collected.add(normalized);
  }

  if (travel.traveldate) {
    const normalized = normalizeTravelDateString(extractDateFromTimestamp(travel.traveldate));
    if (normalized) collected.add(normalized);
  }

  if (travel.date) {
    const normalized = normalizeTravelDateString(extractDateFromTimestamp(travel.date));
    if (normalized) collected.add(normalized);
  }

  return Array.from(collected);
};

const extractParticipantUserIds = (travel) => {
  const ids = new Set();
  const push = (value) => {
    if (value !== undefined && value !== null && value !== '') {
      ids.add(String(value));
    }
  };

  push(travel?.USERID);
  push(travel?.userid);
  push(travel?.userId);
  push(travel?.createdby);
  push(travel?.created_by);
  push(travel?.created_by_userid);

  if (Array.isArray(travel?.participantUserIds)) {
    travel.participantUserIds.forEach(push);
  }

  if (Array.isArray(travel?.employees)) {
    travel.employees.forEach(emp => {
      push(emp?.dtruserid);
      push(emp?.userid);
      push(emp?.USERID);
    });
  }

  if (Array.isArray(travel?.participants)) {
    travel.participants.forEach(participant => {
      push(participant?.dtruserid);
      push(participant?.userid);
      push(participant?.USERID);
    });
  }

  return Array.from(ids);
};

const extractParticipantEmpObjIds = (travel) => {
  const ids = new Set();
  const push = (value) => {
    if (value !== undefined && value !== null && value !== '') {
      ids.add(String(value));
    }
  };

  push(travel?.emp_objid);
  push(travel?.employee_objid);
  push(travel?.EMP_OBJID);

  if (Array.isArray(travel?.participantEmpObjIds)) {
    travel.participantEmpObjIds.forEach(push);
  }

  if (Array.isArray(travel?.employees)) {
    travel.employees.forEach(emp => {
      push(emp?.emp_objid);
      push(emp?.objid);
    });
  }

  if (Array.isArray(travel?.participants)) {
    travel.participants.forEach(participant => {
      push(participant?.emp_objid);
      push(participant?.objid);
    });
  }

  return Array.from(ids);
};

const normalizeTravelRecord = (travel) => {
  const normalizedTravelDates = extractNormalizedTravelDates(travel);
  const participantUserIds = extractParticipantUserIds(travel);
  const participantEmpObjIds = extractParticipantEmpObjIds(travel);
  const normalizedTravelNo = travel?.travelno || travel?.TRAVELNO || travel?.travel_no || travel?.TRAVEL_NO || 'N/A';
  const normalizedTravelStatus = travel?.travelstatus || travel?.TRAVELSTATUS || travel?.status || travel?.TRAVEL_STATUS || null;

  return {
    ...travel,
    normalizedTravelDates,
    participantUserIds,
    participantEmpObjIds,
    normalizedTravelNo,
    normalizedTravelStatus,
  };
};

const normalizeTravelRecords = (records) => {
  if (!Array.isArray(records)) return [];
  return records.map(normalizeTravelRecord);
};

const travelRecordAppliesToUser = (travel, userId, employeeObjId) => {
  const normalized = normalizeTravelRecord(travel);
  const userIdStr = userId !== undefined && userId !== null ? String(userId) : null;
  const empObjIdStr = employeeObjId !== undefined && employeeObjId !== null ? String(employeeObjId) : null;

  const userMatches = userIdStr && normalized.participantUserIds.some(id => String(id) === userIdStr);
  const empMatches = empObjIdStr && normalized.participantEmpObjIds.some(id => String(id) === empObjIdStr);

  if (userMatches || empMatches) {
    return true;
  }

  if (normalized.participantUserIds.length === 0 && normalized.participantEmpObjIds.length === 0) {
    // Fallback: rely on legacy fields if participants were not resolved
    if (normalized.USERID !== undefined && userIdStr) {
      return String(normalized.USERID) === userIdStr;
    }
    if (normalized.emp_objid !== undefined && empObjIdStr) {
      return String(normalized.emp_objid) === empObjIdStr;
    }
    return true;
  }

  return false;
};

const getTravelMatchesForDate = (travelData, dateStr, userId, employeeObjId) => {
  if (!Array.isArray(travelData) || travelData.length === 0) return [];

  return travelData.filter(travel => {
    const normalized = Array.isArray(travel.normalizedTravelDates) ? travel.normalizedTravelDates : extractNormalizedTravelDates(travel);
    if (!normalized || normalized.length === 0) {
      return false;
    }
    const dateMatch = normalized.some(dateValue => dateValue === dateStr);
    if (!dateMatch) {
      return false;
    }
    return travelRecordAppliesToUser(travel, userId, employeeObjId);
  }).filter(travel => {
    const status = (travel.normalizedTravelStatus || travel.travelstatus || travel.TRAVELSTATUS || travel.status || '').toString().toLowerCase();
    return status === 'approved';
  }).map(normalizeTravelRecord);
};

const formatTravelRemarks = (travelMatches) => {
  if (!Array.isArray(travelMatches) || travelMatches.length === 0) return '';
  return travelMatches.map(travel => `Travel: (${travel.normalizedTravelNo || 'N/A'})`).join('; ');
};

const splitRemarkSegments = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap(item => splitRemarkSegments(item))
      .map(segment => segment.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
};

const createRemarkMeta = () => ({
  entries: [],
  byType: {
    weekend: [],
    holiday: [],
    locator: [],
    leave: [],
    travel: [],
    cdo: [],
    absent: [],
    action: [],
    misc: [],
  },
  flags: {
    hasLeave: false,
    hasTravel: false,
    hasLocator: false,
    isAbsent: false,
    isHoliday: false,
    hasCdo: false,
  }
});

const addRemarkEntry = (meta, type, values, data = null) => {
  if (!meta) return;
  const segments = splitRemarkSegments(values);
  if (segments.length === 0) return;

  if (!meta.byType[type]) {
    meta.byType[type] = [];
  }

  segments.forEach(segment => {
    if (!segment) return;
    // Prevent duplicate entries of the same type and text
    const alreadyExists = meta.entries.some(entry => entry.type === type && entry.text === segment);
    if (alreadyExists) return;

    meta.entries.push({ type, text: segment, data });
    meta.byType[type].push(segment);

    if (type === 'leave') {
      meta.flags.hasLeave = true;
    } else if (type === 'travel') {
      meta.flags.hasTravel = true;
    } else if (type === 'locator') {
      meta.flags.hasLocator = true;
    } else if (type === 'cdo') {
      meta.flags.hasCdo = true;
    } else if (type === 'absent') {
      meta.flags.isAbsent = true;
    } else if (type === 'holiday') {
      meta.flags.isHoliday = true;
    }
  });
};

const addTravelRemarkEntries = (meta, travelMatches) => {
  if (!meta || !Array.isArray(travelMatches) || travelMatches.length === 0) return;

  if (!meta.byType.travel) {
    meta.byType.travel = [];
  }

  travelMatches.forEach(travel => {
    if (!travel) return;
    const travelNumber = travel.normalizedTravelNo || travel.travelno || travel.TRAVELNO || travel.travel_no || 'N/A';
    const text = `Travel: (${travelNumber})`;
    const alreadyExists = meta.entries.some(entry => entry.type === 'travel' && entry.text === text);
    if (alreadyExists) return;

    meta.entries.push({ type: 'travel', text, data: travel });
    meta.byType.travel.push(text);
    meta.flags.hasTravel = true;
  });
};

const getHolidayDateValue = (holiday) => {
  if (!holiday) return '';
  const candidates = [
    holiday.HOLIDAYDATE,
    holiday.holidaydate,
    holiday.holiday_date,
    holiday.HolidayDate,
    holiday.date
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = typeof candidate === 'string' ? candidate.trim() : String(candidate);
    if (!str) continue;

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    const extracted = extractDate(str);
    if (extracted) {
      return extracted;
    }
  }

  return '';
};

const getHolidayNameValue = (holiday) => {
  if (!holiday) return 'Holiday';
  const candidates = [
    holiday.HOLIDAYNAME,
    holiday.holidayname,
    holiday.holiday_name,
    holiday.HolidayName,
    holiday.description,
    holiday.name,
    holiday.HOLIDAYDESC,
    holiday.holidaydesc,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) {
      return str;
    }
  }

  return 'Holiday';
};

const isHolidayRecurring = (holiday) => {
  const rawValue =
    holiday?.ISRECURRING ??
    holiday?.isRecurring ??
    holiday?.is_recurring ??
    holiday?.recurring ??
    holiday?.IS_RECURRING;

  if (rawValue === undefined || rawValue === null) return false;

  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'number') return rawValue === 1;

  const normalized = String(rawValue).trim().toLowerCase();
  if (!normalized) return false;

  return ['1', 'true', 'yes', 'y'].includes(normalized);
};

// Helper: Get holiday objects for a specific date - returns array of holiday objects
const getHolidaysForDate = (holidayData, dateStr) => {
  if (!holidayData || holidayData.length === 0 || !dateStr) return [];

  const targetDate = extractDate(dateStr);
  if (!targetDate) return [];

  const targetMonthDay = targetDate.length >= 5 ? targetDate.slice(5, 10) : '';

  return holidayData.filter(holiday => {
    const holidayDate = getHolidayDateValue(holiday);
    if (!holidayDate) return false;

    const recurring = isHolidayRecurring(holiday);
    if (recurring) {
      const holidayMonthDay = holidayDate.length >= 5 ? holidayDate.slice(5, 10) : '';
      return holidayMonthDay === targetMonthDay;
    }

    return holidayDate === targetDate;
  });
};

// Helper: Get holiday remarks for a specific date - NO DATE CONVERSION, USE RAW TABLE VALUE
const getHolidayRemarksForDate = (holidayData, dateStr) => {
  const matchingHolidays = getHolidaysForDate(holidayData, dateStr);
  if (matchingHolidays.length === 0) return null;
  
  const holidayRemarks = matchingHolidays.map(getHolidayNameValue);
  return holidayRemarks.join('; ');
};

const getHolidayDisplayForDate = (holidayData, dateStr) => {
  const matchingHolidays = getHolidaysForDate(holidayData, dateStr);
  if (matchingHolidays.length === 0) return null;

  const names = matchingHolidays.map(getHolidayNameValue).filter(Boolean);
  const hasWorkSuspension = names.some((name) => typeof name === 'string' && name.toLowerCase().includes('work suspension'));

  return {
    names,
    display: hasWorkSuspension ? 'Work Suspension' : names.join(', ')
  };
};

const normalizeHolidayRecord = (holiday) => {
  if (!holiday || typeof holiday !== 'object') return null;

  const coalesce = (...candidates) => {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const value = typeof candidate === 'function' ? candidate() : candidate;
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return null;
  };

  const normalized = {
    HOLIDAYNAME: coalesce(
      holiday.HOLIDAYNAME,
      holiday.holidayname,
      holiday.holiday_name,
      holiday.name,
      holiday.description
    ) || 'N/A',
    HOLIDAYCATEGORY: coalesce(
      holiday.HOLIDAYCATEGORY,
      holiday.holidaycategory,
      holiday.category
    ) || 'N/A',
    HOLIDAYTYPE: coalesce(
      holiday.HOLIDAYTYPE,
      holiday.holidaytype,
      holiday.type
    ) || 'N/A',
    HOLIDAYDATE: coalesce(
      holiday.HOLIDAYDATE,
      holiday.holidaydate,
      holiday.date
    ) || '',
    HOLIDAYDESC: coalesce(
      holiday.HOLIDAYDESC,
      holiday.holidaydesc,
      holiday.description,
      'No description provided'
    ),
    ISRECURRING: coalesce(
      holiday.ISRECURRING,
      holiday.isRecurring,
      holiday.is_recurring,
      holiday.recurring,
      () => {
        const desc = coalesce(holiday.HOLIDAYDESC, holiday.holidaydesc, holiday.description);
        return desc && desc.toString().toLowerCase().includes('recurring') ? 1 : null;
      }
    ),
    raw: holiday
  };

  return normalized;
};

const getCdoRemarksForDate = (cdoUsageMap, dateStr) => {
  if (!cdoUsageMap || !dateStr) {
    return { remarks: '', records: [] };
  }

  const entries = getCdoEntriesForDate(cdoUsageMap, dateStr);
  if (!entries || entries.length === 0) {
    return { remarks: '', records: [] };
  }

  const seen = new Set();
  const parts = [];

  entries.forEach((entry) => {
    if (!entry) return;
    const displayRef = entry.displayRef || entry.cdono || 'CDO';
    const remarkText = `CDO(${displayRef})`;
    if (!seen.has(remarkText)) {
      seen.add(remarkText);
      parts.push(remarkText);
    }
  });

  return {
    remarks: parts.join('; '),
    records: entries
  };
};

// Helper to check if date has leave (for time column annotation)
const hasLeaveForDate = (leaveData, dateStr, userId, employeeObjId) => {
  if (!leaveData || leaveData.length === 0) return false;
  
  return leaveData.some(leave => {
    const status = normalizeStatusLabel(leave.leavestatus || leave.LEAVESTATUS || leave.status);
    if (status !== 'Approved') return false;
    
    // Check if leave has details array (new structure)
    if (leave.details && Array.isArray(leave.details) && leave.details.length > 0) {
      const hasMatchingDate = leave.details.some(detail => {
        const detailDate = extractLeaveDate(detail.deducteddate || detail.leavedate);
        return detailDate === dateStr;
      });
      return hasMatchingDate && matchesEmployeeForLeave(leave, userId, employeeObjId);
    }
    
    // Check if leave has leaveDates array (alternative new structure)
    if (leave.leaveDates && Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractLeaveDate(leaveDate.LEAVEDATE || leaveDate.leavedate);
        return leaveDateStr === dateStr;
      });
      return hasMatchingDate && matchesEmployeeForLeave(leave, userId, employeeObjId);
    }
    
    // Fallback to old structure
    const leaveDate = extractLeaveDate(leave.LEAVEDATE);
    return leaveDate === dateStr && matchesEmployeeForLeave(leave, userId, employeeObjId);
  });
};

// Helper: Get leave status for a date (returns 'For Approval', 'Approved', etc. or null)
const getLeaveStatusForDate = (leaveData, dateStr, userId, employeeObjId) => {
  if (!leaveData || leaveData.length === 0) return null;
  
  const leave = leaveData.find(l => {
    // Check if leave has details array (new structure)
    if (l.details && Array.isArray(l.details) && l.details.length > 0) {
      const hasMatchingDate = l.details.some(detail => {
        const detailDate = extractLeaveDate(detail.deducteddate || detail.leavedate);
        return detailDate === dateStr;
      });
      return hasMatchingDate && matchesEmployeeForLeave(l, userId, employeeObjId);
    }
    
    // Check if leave has leaveDates array (alternative new structure)
    if (l.leaveDates && Array.isArray(l.leaveDates) && l.leaveDates.length > 0) {
      const hasMatchingDate = l.leaveDates.some(leaveDate => {
        const leaveDateStr = extractLeaveDate(leaveDate.LEAVEDATE || leaveDate.leavedate);
        return leaveDateStr === dateStr;
      });
      return hasMatchingDate && matchesEmployeeForLeave(l, userId, employeeObjId);
    }
    
    // Fallback to old structure
    const leaveDate = extractLeaveDate(l.LEAVEDATE);
    return leaveDate === dateStr && matchesEmployeeForLeave(l, userId, employeeObjId);
  });
  
  if (leave) {
    return leave.leavestatus || leave.LEAVESTATUS || null;
  }
  return null;
};

// Helper to check if date has OB leave (for time column annotation)
const hasOBLeaveForDate = (leaveData, dateStr, userId, employeeObjId) => {
  if (!leaveData || leaveData.length === 0) return false;
  
  return leaveData.some(leave => {
    const isOBLeave = (leave.leave_type_name || leave.LeaveName || '').toLowerCase().includes('ob');
    
    // Check if leave has details array (new structure)
    if (leave.details && Array.isArray(leave.details) && leave.details.length > 0) {
      const hasMatchingDate = leave.details.some(detail => {
        const detailDate = extractLeaveDate(detail.deducteddate || detail.leavedate);
        return detailDate === dateStr;
      });
      return hasMatchingDate && isOBLeave && matchesEmployeeForLeave(leave, userId, employeeObjId);
    }
    
    // Check if leave has leaveDates array (alternative new structure)
    if (leave.leaveDates && Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractLeaveDate(leaveDate.LEAVEDATE || leaveDate.leavedate);
        return leaveDateStr === dateStr;
      });
      return hasMatchingDate && isOBLeave && matchesEmployeeForLeave(leave, userId, employeeObjId);
    }
    
    // Fallback to old structure
    const leaveDate = extractLeaveDate(leave.LEAVEDATE);
    return leaveDate === dateStr && isOBLeave && matchesEmployeeForLeave(leave, userId, employeeObjId);
  });
};

// Helper to check if date has travel record (for time column annotation)
const hasTravelRecordForDate = (travelData, dateStr, userId, employeeObjId) => {
  const matches = getTravelMatchesForDate(travelData, dateStr, userId, employeeObjId);
  return matches.length > 0;
};

// Helper to check if date has holiday (for time column annotation) - NO DATE CONVERSION, USE RAW TABLE VALUE
const hasHolidayForDate = (holidayData, dateStr) => {
  if (!holidayData || holidayData.length === 0 || !dateStr) return false;
  return getHolidaysForDate(holidayData, dateStr).length > 0;
};

// Helper to render time column with annotations
const renderTimeColumn = (timeValue, dayLog, shiftSchedule, columnType) => {
  const locatorBackfillFlags = dayLog?.locatorBackfill || {};
  let locatorKey = null;
  if (columnType === 'AM_CHECKIN') locatorKey = 'amCheckIn';
  else if (columnType === 'AM_CHECKOUT') locatorKey = 'amCheckOut';
  else if (columnType === 'PM_CHECKIN') locatorKey = 'pmCheckIn';
  else if (columnType === 'PM_CHECKOUT') locatorKey = 'pmCheckOut';

  const isLocatorBackfill = locatorKey ? !!locatorBackfillFlags[locatorKey] : false;

  // Check if this field was overridden by fix logs
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
  const dateStr = dayLog?.dateStr;

  console.log('🔍 [FIX LOGS DEBUG] renderTimeColumn fix log check:', {
    dateStr,
    columnType,
    locatorKey,
    dayLogHasFixLogBackfill: !!dayLog?.fixLogBackfill,
    dayLogHasFixLog: !!dayLog?.fixLog,
    fixLogBackfillFlags,
    isFixLogOverride,
    dayLogKeys: dayLog ? Object.keys(dayLog) : []
  });
  const holidayNames = Array.isArray(dayLog?.holidayNames) ? dayLog.holidayNames : [];
  const workSuspensionText = dayLog?.hasWorkSuspension ? 'Work Suspension' : null;
  const holidayText = workSuspensionText || dayLog?.holidayDisplay || (holidayNames.length > 0 ? holidayNames.join(', ') : 'Holiday');
  const holidayAnnotationClass = workSuspensionText
    ? 'text-gray-400 font-medium text-[9px]'
    : 'text-gray-400 font-medium text-[11px]';

  // Check if shift is assigned for this column type using getActiveColumns
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

  console.log('🔍 [TIME COLUMN] renderTimeColumn called:', {
    timeValue,
    dateStr,
    hasValue,
    isWeekend,
    hasLeave,
    hasOBLeave,
    hasTravel,
    hasHoliday,
    isAbsent,
    leaveStatus,
    columnType,
    shiftAssigned,
    activeColumns
  });

  // PRIORITY 1: Check shift assignment first - if column is not active, show "-" instead of "No Shift Assigned"
  if (!shiftAssigned) {
    console.log('✅ [TIME COLUMN] Showing "-" for inactive column (shift not assigned)');
    return <span className="text-gray-500">-</span>;
  } else if (hasValue) {
    // PRIORITY 2: If there are actual time logs, display them (only if shift is assigned)
    console.log('✅ [TIME COLUMN] Showing actual time value:', timeValue, {
      isLocatorBackfill,
      isFixLogOverride,
      dayLogHasFixLog: !!dayLog?.fixLog,
      dayLogHasFixLogBackfill: !!dayLog?.fixLogBackfill
    });
    const badges = [];
    
    if (isLocatorBackfill) {
      badges.push(
        <span 
          key="locator"
          className="text-xs" 
          title="Backfilled by Locator"
          role="img" 
          aria-label="Backfilled by Locator"
        >
          📌
        </span>
      );
    }
    
    if (isFixLogOverride) {
      // Get approved by employee name from fix log
      const approvedByName = dayLog?.fixLog?.approved_by_employee_name || 
                            dayLog?.fixLog?.approvedByName || 
                            'Unknown';
      const tooltipText = approvedByName && approvedByName !== 'Unknown' 
        ? `Fixed by (${approvedByName})`
        : 'Fixed by Fix Log';
      
      badges.push(
        <span 
          key="fixlog"
          className="text-xs" 
          title={tooltipText}
          role="img" 
          aria-label={tooltipText}
        >
          🔒
        </span>
      );
    }
    
    if (badges.length > 0) {
      return (
        <span className="inline-flex items-center gap-1">
          <span>{timeValue}</span>
          {badges}
        </span>
      );
    }
    
    return timeValue;
  } else if (isWeekend) {
    // PRIORITY 3: Weekend annotation (only if no logs)
    // Show in red if there's a holiday, otherwise blue
    console.log('✅ [TIME COLUMN] Showing Weekend annotation');
    const weekendColor = hasHoliday ? 'text-red-600' : 'text-blue-600';
    return <span className={`${weekendColor} font-medium`}>Weekend</span>;
  } else if (hasLeave || hasOBLeave) {
    // PRIORITY 4: Leave annotation (only if no logs)
    const normalized = (leaveStatus || '').toLowerCase();
    const displayText = normalized === 'for approval' ? 'For Approval' : 'Leave';
    console.log('✅ [TIME COLUMN] Showing Leave annotation:', { leaveStatus, displayText });
    return <span className="text-gray-400">{displayText}</span>;
  } else if (hasTravel) {
    // PRIORITY 5: Travel annotation (only if no logs)
    console.log('✅ [TIME COLUMN] Showing Travel annotation');
    return <span className="text-gray-400">Travel</span>;
  } else if (hasCdo) {
    // PRIORITY 6: CDO annotation (only if no logs)
    console.log('✅ [TIME COLUMN] Showing CDO annotation');
    return <span className="text-gray-400">CDO</span>;
  } else if (hasHoliday) {
    // PRIORITY 7: Holiday annotation (only if no logs)
    console.log('✅ [TIME COLUMN] Showing Holiday annotation');
    return <span className={holidayAnnotationClass}>{holidayText}</span>;
  } else if (isAbsent) {
    // PRIORITY 8: Absent annotation (only if no logs and remarks include Absent)
    console.log('✅ [TIME COLUMN] Showing Absent annotation');
    return <span>-</span>;
  } else if (!shiftAssigned) {
    // PRIORITY 9: No shift assigned for PM columns (only if no logs and shift not assigned)
    console.log('✅ [TIME COLUMN] Showing No Shift Assigned');
    return <span className="text-gray-500 italic">No Shift Assigned</span>;
  } else {
    // PRIORITY 10: Show dash for regular work days without logs
    console.log('✅ [TIME COLUMN] Showing dash (no logs, no annotations)');
    return '-';
  }
};

// Helper to validate if time is within window (basic version)
const validateTimeInWindow = (timeStr, startWindow, endWindow) => {
  if (!timeStr || !startWindow || !endWindow) return false;
  const timeInMinutes = timeToMinutes(timeStr);
  return timeInMinutes >= startWindow && timeInMinutes <= endWindow;
};

// Helper function to check if a date should be marked as Absent
const shouldMarkAsAbsent = (dateStr, timeLogCount, leaveData, travelData, holidayData, userId, employeeObjId) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // Get YYYY-MM-DD format
  const isFutureDate = dateStr > todayStr;
  const isCurrentDate = dateStr === todayStr;
  
  // Check for various conditions that would prevent marking as Absent
  const hasLeave = hasLeaveForDate(leaveData, dateStr, userId, employeeObjId);
  const hasTravel = hasTravelRecordForDate(travelData, dateStr, userId, employeeObjId);
  const hasHoliday = hasHolidayForDate(holidayData, dateStr);
  const isWeekendDay = isWeekend(dateStr);
  
  console.log(' [ABSENT FUNCTION] Checking Absent condition for date:', dateStr, {
    hasLeave,
    hasTravel,
    hasHoliday,
    timeLogCount,
    isFutureDate,
    isCurrentDate,
    isWeekendDay,
    currentTime: today.toISOString(),
    dateStr: dateStr,
    todayStr: todayStr,
    employeeObjId
  });
  
  // Return true if should be marked as Absent
  return !isWeekendDay && !hasLeave && !hasTravel && !hasHoliday && timeLogCount === 0 && !isCurrentDate && !isFutureDate;
};

const MyShiftView = ({ user, selectedFilter, shiftSchedule, locatorData = [], selectedPeriod = 'full', onLogsProcessed }) => {
  const { user: authUser } = useAuth(); // Get user from auth context
  
  // Use the user prop if available, otherwise fall back to authUser
  const currentUser = user || authUser;
  
  // Add safety check to ensure we have a valid user
  if (!currentUser) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 text-lg">Loading user information...</div>
      </div>
    );
  }

  const [processedLogs, setProcessedLogs] = useState([]);
  const [locatorDataState, setLocatorDataState] = useState([]);
  const [loadingLocatorData, setLoadingLocatorData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leaveData, setLeaveData] = useState([]);
  const [travelData, setTravelData] = useState([]);
  const [logs, setLogs] = useState([]);
  const [holidayData, setHolidayData] = useState([]); // Add holiday data state
  const [cdoUsageByDate, setCdoUsageByDate] = useState({});
  const [refreshTrigger, setRefreshTrigger] = useState({ leave: 0, travel: 0, locator: 0, cdo: 0, fixLogs: 0 });
  const [fixLogsData, setFixLogsData] = useState([]);
  const [loadingFixLogs, setLoadingFixLogs] = useState(false);
  const [locatorModalOpen, setLocatorModalOpen] = useState(false);
  const [selectedDateForLocator, setSelectedDateForLocator] = useState('');
  const [employeeObjId, setEmployeeObjId] = useState(null);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [travelModalOpen, setTravelModalOpen] = useState(false);
  const [selectedTravel, setSelectedTravel] = useState(null);
  const [cdoDetailModalOpen, setCdoDetailModalOpen] = useState(false);
  const [selectedCdoEntry, setSelectedCdoEntry] = useState(null);

  const getTodayStr = () => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  };

  const getDateRangeStrings = () => {
    const now = new Date();
    const todayStr = getTodayStr();
    let startDate, endDate;
    if (selectedFilter === 'Last 2 Weeks') {
      const start = new Date(now);
      start.setDate(now.getDate() - 13);
      startDate = start.toISOString().slice(0, 10);
      endDate = todayStr;
    } else if (selectedFilter === 'This Month') {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed
      const firstDay = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, currentMonth, 0).getDate();
      const lastDayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      
      if (selectedPeriod === 'first_half') {
        startDate = firstDay;
        endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
      } else if (selectedPeriod === 'second_half') {
        startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-16`;
        endDate = lastDayStr;
      } else { // full
        startDate = firstDay;
        endDate = lastDayStr;
      }
    } else if (selectedFilter === 'Last Month') {
      // Get last month's year and month without Date conversions
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed
      
      let lastMonthYear = currentYear;
      let lastMonth = currentMonth - 1;
      
      // Handle January (month 0)
      if (currentMonth === 0) {
        lastMonthYear = currentYear - 1;
        lastMonth = 11; // December
      }
      
      const firstDay = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(lastMonthYear, lastMonth + 1, 0).getDate();
      const lastDayStr = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      
      if (selectedPeriod === 'first_half') {
        startDate = firstDay;
        endDate = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-15`;
      } else if (selectedPeriod === 'second_half') {
        startDate = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-16`;
        endDate = lastDayStr;
      } else { // full
        startDate = firstDay;
        endDate = lastDayStr;
      }
    } else {
      startDate = todayStr;
      endDate = todayStr;
    }
    return { startDate, endDate };
  };

  // Fetch logs for the user
  useEffect(() => {
    const fetchLogs = async () => {
      if (!currentUser || !currentUser.id) return;
      setLoading(true);
      setError(null);
      try {
        const { startDate, endDate } = getDateRangeStrings();
        const response = await api.get('/dtr/logs', {
          params: { startDate, endDate }
        });
        const checkInOutLogs = Array.isArray(response.data) ? response.data : [];
        
        // Filter logs to ensure only current user's logs are included
        const userLogs = checkInOutLogs.filter(log => 
          String(log.USERID) === String(currentUser.id)
        );
        
        console.log(' [DEBUG] Total logs from API:', checkInOutLogs.length);
        console.log(' [DEBUG] User ID:', currentUser.id);
        console.log('🔍 [DEBUG] Filtered logs for user:', userLogs.length);
        console.log(' [DEBUG] Sample log USERID:', checkInOutLogs[0]?.USERID);
        
        setLogs(userLogs);
      } catch (error) {
        setError(error.response?.data?.message || 'Failed to fetch DTR logs. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [currentUser?.id, selectedFilter, selectedPeriod]);

  // Fetch employee objid from USERID (map via dtruserid column)
  useEffect(() => {
    const fetchEmployeeObjId = async () => {
      if (!currentUser?.id && !currentUser?.USERID) {
        setEmployeeObjId(null);
        return;
      }
      try {
        const userId = currentUser.id || currentUser.USERID;
        const response = await api.get('/201-employees');
        if (response.data?.success && response.data?.data) {
          const employee = response.data.data.find(emp => 
            String(emp.dtruserid) === String(userId)
          );
          if (employee) {
            setEmployeeObjId(employee.objid);
          } else {
            setEmployeeObjId(null);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching employee objid:', error);
        setEmployeeObjId(null);
      }
    };
    fetchEmployeeObjId();
  }, [currentUser]);

  // Fetch locator data for the user and date range (from employee_locators table)
  useEffect(() => {
    const fetchLocatorData = async () => {
      if (!employeeObjId) {
        setLocatorDataState([]);
        return;
      }
      console.log('🔄 [LOCATOR] Fetching locator data...', { employeeObjId, refreshTrigger: refreshTrigger.locator });
      try {
        setLoadingLocatorData(true);
        const { startDate, endDate } = getDateRangeStrings();
        const response = await api.get('/employee-locators', {
          params: {
            emp_objid: employeeObjId,
            from: startDate,
            to: endDate
          }
        });
        // Transform the response to match expected format
        const locators = response.data?.data || [];
        // Convert to format expected by existing code (LOCDATE, LOCREMARKS)
        // Don't set LOCUSERID for new format - getLocatorRemarksForDate will use date-only check
        const transformedLocators = locators.map(loc => {
          const departureValue = loc.loctimedeparture || loc.locdeparture || loc.LOCTIMEDEPARTURE;
          const arrivalValue = loc.loctimearrival || loc.locarrival || loc.LOCTIMEARRIVAL;

          const departure = normalizeLocatorDateTime(departureValue);
          const arrival = normalizeLocatorDateTime(arrivalValue);

          return {
            LOCDATE: loc.locatordate,
            LOCREMARKS: loc.locremarks || 'Locator filed',
            LOCSTATUS: loc.locstatus || 'For Approval',
            objid: loc.objid,
            locatordate: loc.locatordate,
            locstatus: loc.locstatus || 'For Approval',
            loctimedeparture: departureValue || null,
            loctimearrival: arrivalValue || null,
            departureTime: departure.time,
            arrivalTime: arrival.time,
            departureMinutes: departure.minutes,
            arrivalMinutes: arrival.minutes
          };
        });
        setLocatorDataState(transformedLocators);
        console.log('✅ [LOCATOR] Locator data fetched successfully:', { count: transformedLocators.length });
      } catch (error) {
        console.error('❌ [LOCATOR] Error fetching locator data:', error);
        setLocatorDataState([]);
      } finally {
        setLoadingLocatorData(false);
      }
    };
    fetchLocatorData();
  }, [employeeObjId, selectedFilter, selectedPeriod, refreshTrigger.locator]);

  // Fetch fix logs data from employee_fixchecktimes
  useEffect(() => {
    const fetchFixLogsData = async () => {
      if (!employeeObjId) {
        setFixLogsData([]);
        return;
      }
      try {
        setLoadingFixLogs(true);
        const { startDate, endDate } = getDateRangeStrings();
        const params = { emp_objid: employeeObjId };
        if (startDate) params.dateFrom = startDate;
        if (endDate) params.dateTo = endDate;
        const response = await api.get('/dtr-fix-checktime', { params });
        const records = response.data?.data || response.data || [];
        const fixLogsArray = Array.isArray(records) ? records : [];
        setFixLogsData(fixLogsArray);
        console.log('✅ [MY SHIFT VIEW] Fix logs data loaded:', {
          count: fixLogsArray.length,
          params,
          sampleRecord: fixLogsArray[0] ? {
            fixid: fixLogsArray[0].fixid || fixLogsArray[0].objid,
            checktimedate: fixLogsArray[0].checktimedate || fixLogsArray[0].CHECKTIMEDATE,
            fixstatus: fixLogsArray[0].fixstatus || fixLogsArray[0].FIXSTATUS,
            emp_objid: fixLogsArray[0].emp_objid,
            am_checkin: fixLogsArray[0].am_checkin,
            am_checkout: fixLogsArray[0].am_checkout,
            pm_checkin: fixLogsArray[0].pm_checkin,
            pm_checkout: fixLogsArray[0].pm_checkout
          } : null,
          allRecords: fixLogsArray
        });
      } catch (error) {
        console.error('❌ [MY SHIFT VIEW] Error loading fix logs data:', error);
        setFixLogsData([]);
      } finally {
        setLoadingFixLogs(false);
      }
    };
    fetchFixLogsData();
  }, [employeeObjId, selectedFilter, selectedPeriod, refreshTrigger.fixLogs]);

  // Load leave data from MySQL using emp_objid
  useEffect(() => {
    const loadLeaveData = async () => {
      if (!employeeObjId) {
        console.log('👤 [LEAVE2 DEBUG] No employeeObjId yet, skipping leave data load');
        setLeaveData([]);
        return;
      }

      try {
        console.log('🚀 [LEAVE2 DEBUG] Starting to load leave data for employeeObjId:', employeeObjId);
        const response = await api.get(`/employee-leave-transactions/${employeeObjId}`);
        console.log('📊 [LEAVE2 DEBUG] Raw API response:', response);
        console.log('📊 [LEAVE2 DEBUG] Response data:', response.data);
        
        // Backend returns array directly, not wrapped in {success: true, data: [...]}
        const transactions = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        
          console.log('✅ [LEAVE2 DEBUG] API call successful, setting leave data');
        console.log('📋 [LEAVE2 DEBUG] Leave records count:', transactions.length);
        console.log('📋 [LEAVE2 DEBUG] All leave records:', transactions);
          
        // Backend already filters by emp_objid, so use data directly
        // Log sample transaction structure for debugging
        if (transactions.length > 0) {
          console.log('🔍 [LEAVE2 DEBUG] Sample transaction structure:', {
            objid: transactions[0].objid,
            emp_objid: transactions[0].emp_objid,
            leavestatus: transactions[0].leavestatus,
            leaveno: transactions[0].leaveno,
            leave_type_name: transactions[0].leave_type_name,
            detailsCount: transactions[0].details?.length || 0,
            firstDetail: transactions[0].details?.[0],
            hasDetails: !!transactions[0].details
          });
        }
        
        // Set leave data with full details for modal
        setLeaveData(transactions);
      } catch (error) {
        console.error('❌ [LEAVE2 DEBUG] Error loading leave data:', error);
        console.error('❌ [LEAVE2 DEBUG] Error details:', error.response?.data);
        setLeaveData([]);
      }
    };

    if (currentUser && employeeObjId) {
      console.log('👤 [LEAVE2 DEBUG] User and employeeObjId available, loading leave data');
      loadLeaveData();
    } else {
      console.log('👤 [LEAVE2 DEBUG] No user or employeeObjId, clearing leave data');
      setLeaveData([]);
    }
  }, [currentUser, employeeObjId, refreshTrigger.leave]);

  // Fetch travel order data for the user from new employee travel tables
  useEffect(() => {
    const fetchTravelData = async () => {
      if (!currentUser?.id) return;
      
      try {
        console.log(' [TRAVEL2 DEBUG] Loading travel data from /employee-travels/my for employee:', currentUser.id);
        const response = await api.get('/employee-travels/my');
        console.log('[TRAVEL2 DEBUG] /employee-travels/my raw response:', response);
        console.log('📊 [TRAVEL2 DEBUG] /employee-travels/my data payload:', response.data);

        if (response.data?.success) {
          const rawRecords = Array.isArray(response.data?.data) ? response.data.data : [];
          const normalizedRecords = normalizeTravelRecords(rawRecords);
          const filteredRecords = employeeObjId
            ? normalizedRecords.filter(travel => travelRecordAppliesToUser(travel, currentUser.id, employeeObjId))
            : normalizedRecords;

          console.log('✅ [TRAVEL2 DEBUG] Loaded employee travel records from new endpoint:', {
            total: normalizedRecords.length,
            filtered: filteredRecords.length,
            employeeObjId
          });

          setTravelData(filteredRecords);
          return;
        }

        console.warn('❌ [TRAVEL2 DEBUG] /employee-travels/my returned unsuccessful response:', response.data);
        setTravelData([]);
      } catch (error) {
        console.error('❌ [TRAVEL2 DEBUG] Error fetching travel data from new endpoint:', error);
        setTravelData([]);
      }
    };

    fetchTravelData();
  }, [currentUser, employeeObjId, refreshTrigger.travel]);

  useEffect(() => {
    const loadCdoUsage = async () => {
      if (!employeeObjId) {
        setCdoUsageByDate({});
        return;
      }
      try {
        const { startDate, endDate } = getDateRangeStrings();
        const params = { includeEntries: 1, emp_objid: employeeObjId, scope: 'self' };
        if (startDate) params.from = startDate;
        if (endDate) params.to = endDate;
        const response = await api.get('/dtr/employee-cdo/transactions', { params });
        const records =
          (Array.isArray(response.data?.data) && response.data.data) ||
          (Array.isArray(response.data) && response.data) ||
          [];
        const usageMap = normalizeCdoUsageMap(records, {
          startDate,
          endDate,
          employeeObjId
        });
        setCdoUsageByDate(usageMap);
        console.log('✅ [MY SHIFT] CDO usage entries loaded:', Object.keys(usageMap).length);
      } catch (error) {
        console.error('❌ [MY SHIFT] Error loading CDO usage:', error);
        setCdoUsageByDate({});
      }
    };

    loadCdoUsage();
  }, [employeeObjId, selectedFilter, selectedPeriod, refreshTrigger.cdo]);

  // Load holiday data
  const loadHolidayData = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const response = await api.get('/dtr-holidays');
      if (response.data.success) {
        const records = Array.isArray(response.data.data) ? response.data.data : [];
        const filtered = records.filter((holiday) => {
          const holidayDate = getHolidayDateValue(holiday);
          if (!holidayDate) return isHolidayRecurring(holiday);
          const holidayYear = holidayDate.slice(0, 4);
          return holidayYear === String(currentYear) || isHolidayRecurring(holiday);
        });
        setHolidayData(filtered);
        console.log('✅ Holiday data loaded from MySQL:', filtered.length, 'holidays (raw total:', records.length, ')');
      } else {
        setHolidayData([]);
        console.log('❌ Holiday API response not successful:', response.data);
      }
    } catch (error) {
      console.error('❌ Error loading holiday data:', error);
      setHolidayData([]);
    }
  }, []);

  // Load holiday data when component mounts
  useEffect(() => {
    loadHolidayData();
  }, [loadHolidayData]);

  // Connect to SSE stream for real-time change notifications
  useEffect(() => {
    if (!currentUser || !employeeObjId) {
      console.log('⏸️ [SSE] Skipping SSE setup:', {
        hasCurrentUser: !!currentUser,
        hasEmployeeObjId: !!employeeObjId,
        currentUserId: currentUser?.id || currentUser?.USERID,
        employeeObjId
      });
      return;
    }

    console.log('🔄 [SSE] Setting up change notification stream...', {
      currentUserId: currentUser?.id || currentUser?.USERID,
      employeeObjId,
      employeeObjIdType: typeof employeeObjId
    });

    // Create EventSource connection
    // Note: EventSource doesn't support custom headers, so pass token as query parameter
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.error('❌ [SSE] No auth token found, cannot connect to notification stream');
      return;
    }
    
    const eventSourceUrl = `/api/change-notifications/stream?token=${encodeURIComponent(token)}`;
    console.log('🔗 [SSE] Connecting to:', eventSourceUrl);
    const eventSource = new EventSource(eventSourceUrl);

    eventSource.onopen = () => {
      console.log('✅ [SSE] Connected to change notification stream', {
        employeeObjId,
        readyState: eventSource.readyState
      });
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('✅ [SSE] Stream connected:', data);
          console.log('🔍 [SSE] Connected emp_objid:', data.emp_objid, 'type:', typeof data.emp_objid);
          console.log('🔍 [SSE] Local employeeObjId:', employeeObjId, 'type:', typeof employeeObjId);
          console.log('🔍 [SSE] Match check:', String(data.emp_objid) === String(employeeObjId));
          return;
        }
        
        if (data.type === 'heartbeat') {
          // Keep connection alive - no action needed
          return;
        }
        
        if (data.type === 'data_changed') {
          console.log('🔔 [SSE] Data changed notification:', data);
          
          // Refresh specific data based on changeType by updating refresh trigger
          switch (data.changeType) {
            case 'leave':
              console.log('🔄 [SSE] Refreshing leave data...');
              setRefreshTrigger(prev => ({ ...prev, leave: prev.leave + 1 }));
              break;
              
            case 'travel':
              console.log('🔄 [SSE] Refreshing travel data...');
              setRefreshTrigger(prev => ({ ...prev, travel: prev.travel + 1 }));
              break;
              
            case 'locator':
              console.log('🔄 [SSE] Refreshing locator data...', { action: data.action, metadata: data.metadata });
              setRefreshTrigger(prev => {
                const newValue = prev.locator + 1;
                console.log('🔄 [SSE] Updating locator refresh trigger:', { old: prev.locator, new: newValue });
                return { ...prev, locator: newValue };
              });
              break;
              
            case 'cdo':
              console.log('🔄 [SSE] Refreshing CDO data...');
              setRefreshTrigger(prev => ({ ...prev, cdo: prev.cdo + 1 }));
              break;
              
            case 'fix_logs':
              console.log('🔄 [SSE] Refreshing fix logs data...');
              setRefreshTrigger(prev => ({ ...prev, fixLogs: prev.fixLogs + 1 }));
              break;
              
            default:
              console.log('🔄 [SSE] Unknown change type, refreshing all data...');
              setRefreshTrigger(prev => ({
                leave: prev.leave + 1,
                travel: prev.travel + 1,
                locator: prev.locator + 1,
                cdo: prev.cdo + 1,
                fixLogs: prev.fixLogs + 1
              }));
          }
        }
      } catch (error) {
        console.error('❌ [SSE] Error parsing message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ [SSE] Stream error:', error);
      // EventSource will automatically attempt to reconnect
    };

    // Cleanup on unmount
    return () => {
      console.log('🔌 [SSE] Closing change notification stream');
      eventSource.close();
    };
  }, [currentUser, employeeObjId]);

  // Main processing logic - using the same approach as ShiftSchedView_Management
  useEffect(() => {
    console.log('🔄 [USE EFFECT] Starting to process logs...', {
      logsLength: logs?.length,
      shiftSchedule: !!shiftSchedule,
      locatorDataLength: locatorDataState?.length,
      leaveDataLength: leaveData?.length,
      travelDataLength: travelData?.length,
      holidayDataLength: holidayData?.length,
      userId: currentUser?.id,
      selectedFilter
    });

    if (!shiftSchedule) {
      console.log('⚠️ [USE EFFECT] No shift schedule available, setting empty array');
      setProcessedLogs([]);
      return;
    }

    // For "Today" filter, we want to show the current date even if there are no logs
    const shouldProcessWithoutLogs = selectedFilter === 'Today' || selectedFilter === 'today';
    
    if (!logs || logs.length === 0) {
      if (shouldProcessWithoutLogs) {
        console.log('📅 [USE EFFECT] No logs available, but processing Today filter anyway');
        // Continue processing for Today filter
      } else {
        console.log('⚠️ [USE EFFECT] No logs available, setting empty array');
        setProcessedLogs([]);
        return;
      }
    }

    const { startDate, endDate } = getDateRangeStrings();
    console.log('Date range:', { startDate, endDate, selectedFilter });
    const dateRange = generateDateRange(startDate, endDate);
    console.log(' Generated date range:', dateRange);
    
    // Debug: Ensure current date is included for Today filter
    if (selectedFilter === 'Today' || selectedFilter === 'today') {
      const todayStr = getTodayStr();
      if (!dateRange.includes(todayStr)) {
        console.log('⚠️ [DEBUG] Adding current date to range for Today filter');
        dateRange.push(todayStr);
      }
      console.log('🔍 [DEBUG] Today filter - dateRange:', dateRange);
    }

    const processedDays = dateRange.map(dateStr => {
      console.log(`\n📅 Processing day ${dateStr.split('-')[2]}: ${dateStr}`);
      
      // Filter logs for this specific date - NO TIME CONVERSION
      const dayLogs = (logs || []).filter(log => {
        const logDate = extractDateFromTimestamp(log.CHECKTIME);
        return logDate === dateStr;
      });
      
      console.log(`📝 Found ${dayLogs.length} logs for ${dateStr}:`, dayLogs);

      const isWeekendDay = isWeekend(dateStr);
      const holidayRemarks = getHolidayRemarksForDate(holidayData, dateStr);
      const hasHoliday = hasHolidayForDate(holidayData, dateStr);
      const locatorRemarks = getLocatorRemarksForDate(locatorDataState, dateStr, currentUser.id);
      const hasLocatorFiled = locatorRemarks && locatorRemarks.trim() !== '';
      const leaveRemarks = getLeaveRemarksForDate(leaveData, dateStr, currentUser.id, employeeObjId);
      const hasLeaveRecord = hasLeaveForDate(leaveData, dateStr, currentUser.id, employeeObjId);
      const leaveStatus = getLeaveStatusForDate(leaveData, dateStr, currentUser.id, employeeObjId);
      const hasOBLeave = hasOBLeaveForDate(leaveData, dateStr, currentUser.id, employeeObjId);
      const travelMatches = getTravelMatchesForDate(travelData, dateStr, currentUser.id, employeeObjId);
      const travelRemarks = formatTravelRemarks(travelMatches);
      const hasTravelRecord = travelMatches.length > 0;
      const holidayDisplayData = getHolidayDisplayForDate(holidayData, dateStr);
      const holidayDisplay = holidayDisplayData?.display || null;
      const holidayNameList = holidayDisplayData?.names || [];
      const hasWorkSuspension = holidayNameList.some((name) => typeof name === 'string' && name.toLowerCase().includes('work suspension'));
      const cdoRemarksData = getCdoRemarksForDate(cdoUsageByDate, dateStr);
      const cdoRecords = cdoRemarksData.records || [];
      const hasCdoRecords = cdoRecords.length > 0;

      const populateBaseRemarkEntries = (meta) => {
        if (!meta) return;
        if (!holidayDisplay && isWeekendDay) {
          addRemarkEntry(meta, 'weekend', 'Weekend');
        }
        if (holidayDisplay) {
          addRemarkEntry(meta, 'holiday', holidayDisplay);
        }
        if (locatorRemarks) {
          addRemarkEntry(meta, 'locator', locatorRemarks);
        }
        if (leaveRemarks) {
          addRemarkEntry(meta, 'leave', leaveRemarks);
        }
        if (travelMatches && travelMatches.length > 0) {
          addTravelRemarkEntries(meta, travelMatches);
        }
        if (cdoRecords && cdoRecords.length > 0) {
          cdoRecords.forEach((entry) => {
            if (!entry) return;
            const displayRef = entry.displayRef || entry.cdono || 'CDO';
            addRemarkEntry(meta, 'cdo', `CDO(${displayRef})`, entry);
          });
        }
      };

      if (dayLogs.length === 0) {
        console.log(`📝 [NO LOGS] Processing date ${dateStr} with no logs`);
        
        console.log(`🔍 [NO LOGS] Status for ${dateStr}:`, {
          hasTravel: hasTravelRecord,
          hasLeave: hasLeaveRecord,
          hasHoliday,
          isWeekend: isWeekendDay
        });

        console.log('🔍 [REMARKS DEBUG - NO LOGS] For date:', dateStr, {
          locatorRemarks,
          leaveRemarks,
          travelRemarks,
          holidayRemarks,
          travelDataCount: travelData?.length || 0,
          holidayDataCount: holidayData?.length || 0
        });
        
        const remarkMeta = createRemarkMeta();
        populateBaseRemarkEntries(remarkMeta);

        const timeLogCount = 0;
        const isAbsent = shouldMarkAsAbsent(dateStr, timeLogCount, leaveData, travelData, holidayData, currentUser.id, employeeObjId);
        if (isAbsent) {
          addRemarkEntry(remarkMeta, 'absent', 'Absent');
          console.log('✅ [ABSENT DEBUG - NO LOGS] Added Absent remark for date:', dateStr);
        }

        remarkMeta.flags.hasLeave = hasLeaveRecord;
        remarkMeta.flags.hasTravel = hasTravelRecord;
        remarkMeta.flags.hasLocator = remarkMeta.flags.hasLocator || hasLocatorFiled;
        remarkMeta.flags.isHoliday = remarkMeta.flags.isHoliday || hasHoliday;
        remarkMeta.flags.isAbsent = remarkMeta.flags.isAbsent || isAbsent;
    remarkMeta.flags.hasCdo = remarkMeta.flags.hasCdo || hasCdoRecords;
        remarkMeta.flags.hasCdo = remarkMeta.flags.hasCdo || hasCdoRecords;

        const remarks = remarkMeta.entries.map(entry => entry.text).join('; ');

        console.log(`✅ [NO LOGS] Returning row for ${dateStr}:`, {
          date: formatDateDisplay(dateStr),
          remarks,
          isWeekend: isWeekendDay,
          hasHoliday
        });

        return {
          date: formatDateDisplay(dateStr),
          dateStr,
          displayDate: formatDateDisplay(dateStr),
          rawDate: dateStr,
          amCheckIn: '-',
          amCheckOut: '-',
          pmCheckIn: '-',
          pmCheckOut: '-',
          lateMinutes: 0,
          days: hasTravelRecord ? 1 : 0,
          remarks,
          remarkMeta,
          remarkFlags: remarkMeta.flags,
          leaveStatus,
          hasOBLeave,
          isWeekend: isWeekendDay,
          hasHoliday,
          hasTravel: hasTravelRecord,
          travelRecords: travelMatches,
          hasCdo: hasCdoRecords,
          cdoRecords,
          holidayDisplay,
          holidayNames: holidayNameList,
          hasWorkSuspension,
          holidayRecords: getHolidaysForDate(holidayData, dateStr)
        };
      }

      // Get active columns based on assigned shift
      const activeColumns = getActiveColumns(shiftSchedule);

      // Get time windows - convert shift schedule timestamps to minutes
      // Only use fallback windows if the shift schedule explicitly defines those times
      const buildWindow = (start, end, fallbackStart, fallbackEnd, hasShiftTime) => {
        // If shift doesn't have this time defined, return null window
        if (!hasShiftTime) {
          return [null, null];
        }
        const startStr = start ? extractTimeFromTimestamp(start) : null;
        const endStr = end ? extractTimeFromTimestamp(end) : null;
        if (startStr && endStr) {
          return [timeToMinutes(startStr), timeToMinutes(endStr)];
        }
        // Only use fallback if shift time is defined but start/end windows are missing
        if (fallbackStart && fallbackEnd) {
          return [timeToMinutes(fallbackStart), timeToMinutes(fallbackEnd)];
        }
        return [null, null];
      };

      const timeWindows = {
        amCheckInWindow: buildWindow(
          shiftSchedule.SHIFT_AMCHECKIN_START,
          shiftSchedule.SHIFT_AMCHECKIN_END,
          '04:00',
          '11:59',
          activeColumns.hasAMCheckIn
        ),
        amCheckOutWindow: buildWindow(
          shiftSchedule.SHIFT_AMCHECKOUT_START,
          shiftSchedule.SHIFT_AMCHECKOUT_END,
          '11:00',
          '12:30',
          activeColumns.hasAMCheckOut
        ),
        pmCheckInWindow: buildWindow(
          shiftSchedule.SHIFT_PMCHECKIN_START,
          shiftSchedule.SHIFT_PMCHECKIN_END,
          '12:31',
          '14:00',
          activeColumns.hasPMCheckIn
        ),
        pmCheckOutWindow: buildWindow(
          shiftSchedule.SHIFT_PMCHECKOUT_START,
          shiftSchedule.SHIFT_PMCHECKOUT_END,
          '14:01',
          '23:59',
          activeColumns.hasPMCheckOut
        )
      };

      console.log('⏰ Time windows (in minutes):', timeWindows);

      // Find logs in each window based on shift schedule
      const findInWindow = (window) => {
        const [start, end] = window;
        if (!start || !end) return []; // Skip if time window is not defined
        
        return dayLogs
          .map(l => ({
            ...l,
            t: extractTimeFromTimestamp(l.CHECKTIME)
          }))
          .filter(l => {
            if (!l.t) return false;
            const mins = timeToMinutes(l.t);
            return mins >= start && mins <= end;
          })
          .sort((a, b) => timeToMinutes(a.t) - timeToMinutes(b.t));
      };

      const getLogsInWindow = (window, { pick = 'earliest' } = {}) => {
        // If window is null (shift doesn't define this time), return empty array
        if (!window || window[0] === null || window[1] === null) {
          return [];
        }

        const [start, end] = window;
        if (start === null || end === null) return [];

        return dayLogs
          .map(l => ({
            ...l,
            t: extractTimeFromTimestamp(l.CHECKTIME || l.DATE || l.date)
          }))
          .filter(l => {
            if (!l.t) return false;
            const mins = timeToMinutes(l.t);
            return mins >= start && mins <= end;
          })
          .sort((a, b) => {
            const diff = timeToMinutes(a.t) - timeToMinutes(b.t);
            return pick === 'latest' ? -diff : diff;
          });
      };

      // AM-CHECKIN: earliest inside window (only if active)
      const amCheckInLogs = activeColumns.hasAMCheckIn 
        ? getLogsInWindow(timeWindows.amCheckInWindow, { pick: 'earliest' })
        : [];
      const amCheckInTime = amCheckInLogs.length > 0 ? extractTimeFromTimestamp(amCheckInLogs[0].CHECKTIME || amCheckInLogs[0].DATE || amCheckInLogs[0].date) : '';

      // AM-CHECKOUT: earliest in checkout window (only if active)
      const amCheckOutLogs = activeColumns.hasAMCheckOut
        ? getLogsInWindow(timeWindows.amCheckOutWindow, { pick: 'earliest' })
        : [];
      const amCheckOutTime = amCheckOutLogs.length > 0 ? extractTimeFromTimestamp(amCheckOutLogs[0].CHECKTIME || amCheckOutLogs[0].DATE || amCheckOutLogs[0].date) : '';

      // PM-CHECKIN: earliest in check-in window (only if active)
      const pmCheckInLogs = activeColumns.hasPMCheckIn
        ? getLogsInWindow(timeWindows.pmCheckInWindow, { pick: 'earliest' })
        : [];
      const pmCheckInTime = pmCheckInLogs.length > 0 ? extractTimeFromTimestamp(pmCheckInLogs[0].CHECKTIME || pmCheckInLogs[0].DATE || pmCheckInLogs[0].date) : '';

      // PM-CHECKOUT: latest in checkout window (only if active)
      const pmCheckOutLogs = activeColumns.hasPMCheckOut
        ? getLogsInWindow(timeWindows.pmCheckOutWindow, { pick: 'latest' })
        : [];

      const pmCheckOutTime = pmCheckOutLogs.length > 0 ? extractTimeFromTimestamp(pmCheckOutLogs[0].CHECKTIME || pmCheckOutLogs[0].DATE || pmCheckOutLogs[0].date) : '';

      console.log('🔍 Found logs:', {
        amCheckIn: amCheckInLogs[0]?.CHECKTIME || null,
        amCheckOut: amCheckOutLogs[0]?.CHECKTIME || null,
        pmCheckIn: pmCheckInLogs[0]?.CHECKTIME || null,
        pmCheckOut: pmCheckOutLogs[0]?.CHECKTIME || null
      });

      console.log('⏰ Extracted times:', {
        amCheckInTime,
        amCheckOutTime,
        pmCheckInTime,
        pmCheckOutTime
      });

      // Helper function to get shift credits from assigned shifts
      const getShiftCredits = (shiftSchedule) => {
        const assigned = shiftSchedule?.assignedShifts || [];
        const findCredit = (mode) => {
          const shift = assigned.find((shift) => (shift.shiftMode || shift.period || '').toUpperCase() === mode);
          const credits = shift?.credits;
          // Convert to number, default to 0 if invalid
          return credits !== undefined && credits !== null ? Number(credits) : 0;
        };
        return {
          AM: findCredit('AM'),
          PM: findCredit('PM'),
          AMPM: findCredit('AMPM')
        };
      };

      // Calculate days credit - using active columns from assigned shift
      const calculateDays = (() => {
        // Check for holidays and leaves first - these should get 0 days
        const hasLeaveForDays = hasLeaveRecord;
        const hasHolidayForDays = hasHoliday;
        
        if (hasLeaveForDays || hasHolidayForDays) {
          console.log('✅ [DAYS CALC] Holiday or Leave - 0 days credit');
          return Number(0);
        }
        
        // Only check for logs that correspond to active columns
        const hasAMCheckIn = activeColumns.hasAMCheckIn && amCheckInTime !== '';
        const hasAMCheckOut = activeColumns.hasAMCheckOut && amCheckOutTime !== '';
        const hasPMCheckIn = activeColumns.hasPMCheckIn && pmCheckInTime !== '';
        const hasPMCheckOut = activeColumns.hasPMCheckOut && pmCheckOutTime !== '';

        console.log('🔍 [DAYS CALC] Checking day calculation:', {
          date: dateStr,
          activeColumns,
          hasAMCheckIn,
          hasAMCheckOut,
          hasPMCheckIn,
          hasPMCheckOut,
          amCheckInTime,
          amCheckOutTime,
          pmCheckInTime,
          pmCheckOutTime
        });

        // Get shift credits
        const shiftCredits = getShiftCredits(shiftSchedule);

        // Check if this is an AMPM shift
        const isAmpmShift =
          activeColumns.hasAMCheckIn &&
          activeColumns.hasPMCheckOut &&
          !activeColumns.hasAMCheckOut &&
          !activeColumns.hasPMCheckIn;

        // Handle AMPM shift separately
        if (isAmpmShift) {
          const ampmCredit = Number(shiftCredits.AMPM) || 0;
          const amPortion = hasAMCheckIn ? ampmCredit / 2 : 0;
          const pmPortion = hasPMCheckOut ? ampmCredit / 2 : 0;
          const result = Number((amPortion + pmPortion).toFixed(2));
          console.log('✅ [DAYS CALC] AMPM shift credit:', result);
          return result;
        }

        // Standard AM/PM shift logic with special cases
        let totalCredit = 0;
        const amCredit = Number(shiftCredits.AM) || 0;
        const pmCredit = Number(shiftCredits.PM) || 0;

        const amComplete = hasAMCheckIn && hasAMCheckOut;
        const pmComplete = hasPMCheckIn && hasPMCheckOut;
        
        // Special case 1: AM has check-in (no check-out) AND PM is complete (has check-in and check-out)
        // Sum both AM and PM credits (full sum)
        if (hasAMCheckIn && !hasAMCheckOut && pmComplete) {
          totalCredit = amCredit + pmCredit;
          const result = Number(totalCredit.toFixed(2));
          console.log('✅ [DAYS CALC] Special Case 1 - Full sum:', result);
          return result;
        }

        // Special case 2: AM is complete (has check-in and check-out) AND PM has check-out (no check-in)
        // Sum both AM and PM credits (full sum)
        if (amComplete && !hasPMCheckIn && hasPMCheckOut) {
          totalCredit = amCredit + pmCredit;
          const result = Number(totalCredit.toFixed(2));
          console.log('✅ [DAYS CALC] Special Case 2 - Full sum:', result);
          return result;
        }

        // Special case 3: AM has check-out (no check-in) AND PM is complete (has check-in and check-out)
        // Sum of credits divided by 2 (half)
        if (!hasAMCheckIn && hasAMCheckOut && pmComplete) {
          totalCredit = (amCredit + pmCredit) / 2;
          const result = Number(totalCredit.toFixed(2));
          console.log('✅ [DAYS CALC] Special Case 3 - Half sum:', result);
          return result;
        }
        
        // Special case 4: AM is complete (has check-in and check-out) AND PM has check-in (no check-out)
        // Sum of credits divided by 2 (half)
        if (amComplete && hasPMCheckIn && !hasPMCheckOut) {
          totalCredit = (amCredit + pmCredit) / 2;
          const result = Number(totalCredit.toFixed(2));
          console.log('✅ [DAYS CALC] Special Case 4 - Half sum:', result);
          return result;
        }
        
        // Special case 5: AM has check-in (no check-out) AND PM has check-out (no check-in)
        // Sum both AM and PM credits (full sum)
        if (hasAMCheckIn && !hasAMCheckOut && !hasPMCheckIn && hasPMCheckOut) {
          totalCredit = amCredit + pmCredit;
          const result = Number(totalCredit.toFixed(2));
          console.log('✅ [DAYS CALC] Special Case 5 - Full sum:', result);
          return result;
        }

        // Standard logic: only count if complete pairs
        if (amComplete) {
          totalCredit += amCredit;
        }

        if (pmComplete) {
          totalCredit += pmCredit;
        }

        const result = Number(totalCredit.toFixed(2));
        console.log('✅ [DAYS CALC] Standard calculation:', result);
        return result;
      })();

      // Calculate late minutes - only for active check-in columns
      const calculateLate = (() => {
        let lateMinutes = 0;
        
        // AM late calculation - only if AM check-in is active in assigned shift
        if (activeColumns.hasAMCheckIn && amCheckInTime && shiftSchedule.SHIFT_AMCHECKIN) {
          const expectedAMTime = timeToMinutes(extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN));
          const actualAMTime = timeToMinutes(amCheckInTime);
          const amLateMins = actualAMTime - expectedAMTime;
          if (amLateMins > 0) {
            lateMinutes += amLateMins;
          }
        }
        
        // PM late calculation - only if PM check-in is active in assigned shift
        if (activeColumns.hasPMCheckIn && pmCheckInTime && shiftSchedule.SHIFT_PMCHECKIN) {
          const expectedPMTime = timeToMinutes(extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN));
          const actualPMTime = timeToMinutes(pmCheckInTime);
          const pmLateMins = actualPMTime - expectedPMTime;
          if (pmLateMins > 0) {
            lateMinutes += pmLateMins;
          }
        }
        
        // AM Check-Out early penalty - if check-out is before expected time
        if (activeColumns.hasAMCheckOut && amCheckOutTime && shiftSchedule.SHIFT_AMCHECKOUT) {
          const expectedAMCheckOutTime = timeToMinutes(extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKOUT));
          const actualAMCheckOutTime = timeToMinutes(amCheckOutTime);
          if (actualAMCheckOutTime < expectedAMCheckOutTime) {
            const earlyMins = expectedAMCheckOutTime - actualAMCheckOutTime;
            lateMinutes += earlyMins;
          }
        }
        
        // PM Check-Out early penalty - if check-out is before expected time
        if (activeColumns.hasPMCheckOut && pmCheckOutTime && shiftSchedule.SHIFT_PMCHECKOUT) {
          const expectedPMCheckOutTime = timeToMinutes(extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKOUT));
          const actualPMCheckOutTime = timeToMinutes(pmCheckOutTime);
          if (actualPMCheckOutTime < expectedPMCheckOutTime) {
            const earlyMins = expectedPMCheckOutTime - actualPMCheckOutTime;
            lateMinutes += earlyMins;
          }
        }
        
        return lateMinutes;
      })();

      console.log('📊 Day calculations:', { days: calculateDays, late: calculateLate });

      const timeLogCount = [amCheckInTime, amCheckOutTime, pmCheckInTime, pmCheckOutTime].filter(log => log && log.trim() !== '').length;

      const remarkMeta = createRemarkMeta();
      populateBaseRemarkEntries(remarkMeta);
      
      console.log('🔍 [REMARKS DEBUG] For date:', dateStr, {
        locatorRemarks,
        leaveRemarks,
        travelRemarks,
        holidayRemarks,
        travelDataCount: travelData?.length || 0,
        holidayDataCount: holidayData?.length || 0
      });
      
      const isAbsent = shouldMarkAsAbsent(dateStr, timeLogCount, leaveData, travelData, holidayData, currentUser.id, employeeObjId);
      if (isAbsent) {
        addRemarkEntry(remarkMeta, 'absent', 'Absent');
        console.log('✅ [ABSENT DEBUG] Added Absent remark for date:', dateStr);
      }

      remarkMeta.flags.hasLeave = hasLeaveRecord;
      remarkMeta.flags.hasTravel = hasTravelRecord;
      remarkMeta.flags.hasLocator = remarkMeta.flags.hasLocator || hasLocatorFiled;
      remarkMeta.flags.isHoliday = remarkMeta.flags.isHoliday || hasHoliday;
      remarkMeta.flags.isAbsent = remarkMeta.flags.isAbsent || isAbsent;
      remarkMeta.flags.hasCdo = remarkMeta.flags.hasCdo || hasCdoRecords;

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const isFutureDate = dateStr > todayStr;
      const isCurrentDate = dateStr === todayStr;

      if (!isWeekendDay && !isCurrentDate && !isFutureDate && !hasLocatorFiled && !hasLeaveRecord && !hasTravelRecord && !hasHoliday) {
          // Use getActiveColumns to determine expected log count based on assigned shift
          const activeColumns = getActiveColumns(shiftSchedule);
          const expectedLogCount = (activeColumns.hasAMCheckIn ? 1 : 0) + 
                                   (activeColumns.hasAMCheckOut ? 1 : 0) + 
                                   (activeColumns.hasPMCheckIn ? 1 : 0) + 
                                   (activeColumns.hasPMCheckOut ? 1 : 0);
          
          // Only show "File a locator" if we have some logs but less than expected
          if (timeLogCount > 0 && timeLogCount < expectedLogCount) {
            addRemarkEntry(remarkMeta, 'action', 'File a locator');
            console.log('✅ [LOCATOR DEBUG] Added File a locator remark for date:', {
              dateStr,
              timeLogCount,
              expectedLogCount,
              activeColumns
            });
        }
      }

      const remarks = remarkMeta.entries.map(entry => entry.text).join('; ');

      return {
        date: formatDateDisplay(dateStr),
        dateStr,
        displayDate: formatDateDisplay(dateStr),
        rawDate: dateStr,
        amCheckIn: amCheckInTime,
        amCheckOut: amCheckOutTime,
        pmCheckIn: pmCheckInTime,
        pmCheckOut: pmCheckOutTime,
        lateMinutes: calculateLate,
        days: calculateDays,
        remarks,
        remarkMeta,
        remarkFlags: remarkMeta.flags,
        leaveStatus,
        hasOBLeave,
        isWeekend: isWeekendDay,
        hasHoliday,
        hasCdo: hasCdoRecords,
        hasTravel: hasTravelRecord,
        travelRecords: travelMatches,
        cdoRecords,
        shiftSchedule: shiftSchedule.SHIFTNAME,
        holidayDisplay,
        holidayNames: holidayNameList,
        hasWorkSuspension,
        holidayRecords: getHolidaysForDate(holidayData, dateStr)
      };
    });

    const enhancedProcessedDays = applyLocatorBackfillToProcessedLogs(processedDays, locatorDataState, shiftSchedule);
    const afterFixLogs = applyFixLogsToProcessedLogs(enhancedProcessedDays, fixLogsData, employeeObjId, shiftSchedule);

    console.log('✅ Final processed days:', afterFixLogs);
    console.log('🔍 [DEBUG] Sample processed log:', afterFixLogs[0]);
    setProcessedLogs(afterFixLogs);
    
    // Call the callback to export processed logs to parent component
    if (onLogsProcessed) {
      onLogsProcessed(afterFixLogs);
    }
  }, [logs, shiftSchedule, locatorDataState, leaveData, travelData, currentUser, selectedFilter, holidayData, employeeObjId, cdoUsageByDate, fixLogsData, onLogsProcessed]);

  // Handler to open locator modal
  const openLocatorModal = (dateStr) => {
    setSelectedDateForLocator(dateStr);
    setLocatorModalOpen(true);
  };

  // Handler to close locator modal
  const closeLocatorModal = () => {
    setLocatorModalOpen(false);
    setSelectedDateForLocator('');
  };

  // Handler to save locator
  const handleSaveLocator = async (formData) => {
    if (!employeeObjId) {
      alert('Employee information not found. Please try again.');
      return;
    }
    try {
      await api.post('/employee-locators', {
        emp_objid: employeeObjId,
        locatordate: selectedDateForLocator,
        locdestination: formData.locdestination,
        loctimedeparture: formData.loctimedeparture,
        loctimearrival: formData.loctimearrival,
        locpurpose: formData.locpurpose,
        locstatus: 'For Approval',
        isportal: 1,
        createdby: null
      });
      // Refresh locator data
      const { startDate, endDate } = getDateRangeStrings();
      const response = await api.get('/employee-locators', {
        params: {
          emp_objid: employeeObjId,
          from: startDate,
          to: endDate
        }
      });
      const locators = response.data?.data || [];
      // Don't set LOCUSERID for new format - getLocatorRemarksForDate will use date-only check
      const transformedLocators = locators.map(loc => {
        const departureValue = loc.loctimedeparture || loc.locdeparture || loc.LOCTIMEDEPARTURE;
        const arrivalValue = loc.loctimearrival || loc.locarrival || loc.LOCTIMEARRIVAL;

        const departure = normalizeLocatorDateTime(departureValue);
        const arrival = normalizeLocatorDateTime(arrivalValue);

        return {
          LOCDATE: loc.locatordate,
          LOCREMARKS: loc.locremarks || 'Locator filed',
          LOCSTATUS: loc.locstatus || 'For Approval',
          objid: loc.objid,
          locatordate: loc.locatordate,
          locstatus: loc.locstatus || 'For Approval',
          loctimedeparture: departureValue || null,
          loctimearrival: arrivalValue || null,
          departureTime: departure.time,
          arrivalTime: arrival.time,
          departureMinutes: departure.minutes,
          arrivalMinutes: arrival.minutes
        };
      });
      setLocatorDataState(transformedLocators);
      closeLocatorModal();
    } catch (error) {
      console.error('Error saving locator:', error);
      alert('Failed to save locator. Please try again.');
      throw error;
    }
  };

  const openTravelDetailModal = (travel) => {
    if (!travel) return;
    setSelectedTravel(travel);
    setTravelModalOpen(true);
  };

  const closeTravelDetailModal = () => {
    setTravelModalOpen(false);
    setSelectedTravel(null);
  };

  const openCdoDetailModal = (cdoEntry) => {
    if (!cdoEntry) return;
    setSelectedCdoEntry(cdoEntry);
    setCdoDetailModalOpen(true);
  };

  const closeCdoDetailModal = () => {
    setCdoDetailModalOpen(false);
    setSelectedCdoEntry(null);
  };

  // Helper function to get locator status color classes
  const getLocatorStatusClasses = (status) => {
    const statusUpper = (status || '').toUpperCase();
    if (statusUpper === 'APPROVED') {
      return 'bg-green-100 text-green-800';
    } else if (statusUpper === 'REJECTED') {
      return 'bg-red-100 text-red-800';
    } else if (statusUpper === 'PENDING') {
      return 'bg-yellow-100 text-yellow-800';
    }
    // Default for unknown statuses
    return 'bg-gray-100 text-gray-800';
  };

  // Render remarks with color for "Weekend", "Holiday", and "Locator(status)"
  const renderRemarks = (remarkMeta, dateStr, dayLog) => {
    if (!remarkMeta) return null;

    let normalizedMeta = remarkMeta;
    if (typeof normalizedMeta === 'string') {
      normalizedMeta = {
        entries: normalizedMeta.split('; ').map(text => ({ type: 'legacy', text })),
        flags: {}
      };
    }

    const entries = Array.isArray(normalizedMeta.entries) ? normalizedMeta.entries : [];
    if (!entries.length) return null;

    const hasLocatorFiled = !!normalizedMeta.flags?.hasLocator;
    const leavesForDate = dateStr && currentUser ? getLeavesForDate(leaveData, dateStr, currentUser.id, employeeObjId) : [];
    const holidayNames = Array.isArray(dayLog?.holidayNames) ? dayLog.holidayNames : [];
    const holidayNameSet = new Set(holidayNames);
    const holidayDisplay = dayLog?.holidayDisplay || null;
    const hasWorkSuspension = !!dayLog?.hasWorkSuspension;
    const hasHoliday = !!dayLog?.hasHoliday;
    const colorMap = {
      leave: '#7c3aed',
      travel: '#16a34a',
      absent: '#ea580c',
      holiday: '#dc2626',
      locator: '#ec4899',
      cdo: '#0f766e',
      weekend: '#60a5fa'
    };

    return entries.map((entry, index) => {
      if (!entry || !entry.text) return null;

      const { type, text, data } = entry;
      const trimmedText = text.trim();
      const isLast = index === entries.length - 1;
      const separator = !isLast ? '; ' : null;
      const lower = trimmedText.toLowerCase();

      if (type === 'locator') {
        const locatorMatch = trimmedText.match(/^Locator\((.+)\)$/);
        if (locatorMatch) {
          const status = locatorMatch[1];
          const statusClasses = getLocatorStatusClasses(status);
          return (
            <span key={`${type}-${index}`}>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClasses}`}
                style={{ color: colorMap.locator }}
              >
                Locator({status})
              </span>
              {separator}
            </span>
          );
        }
        return (
          <span key={`${type}-${index}`} style={{ color: colorMap.locator, fontWeight: 600 }}>
            {trimmedText}
            {separator}
          </span>
        );
      }

      if (type === 'action') {
        if (lower.includes('file a locator') && !hasLocatorFiled) {
          // Lock locator action if fix logs exist
          const hasFixLog = !!dayLog?.fixLog;
          if (hasFixLog) {
            // Hide the locator action when fix logs exist
            return null;
          }
          
          const baseColor = colorMap.locator;
          const hoverColor = '#1d4ed8';
          return (
            <span key={`${type}-${index}`} style={{ color: baseColor }}>
              <button
                className="underline cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: baseColor,
                  textDecorationColor: baseColor
                }}
                onMouseEnter={(e) => {
                  e.target.style.setProperty('color', hoverColor, 'important');
                  e.target.style.setProperty('text-decoration-color', hoverColor, 'important');
                }}
                onMouseLeave={(e) => {
                  e.target.style.setProperty('color', baseColor, 'important');
                  e.target.style.setProperty('text-decoration-color', baseColor, 'important');
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dateStr) {
                    openLocatorModal(dateStr);
                  }
                }}
              >
                {trimmedText}
              </button>
              {separator}
            </span>
          );
        }
        return null;
      }

      if (type === 'holiday') {
        const baseColor = colorMap.holiday;
        const hoverColor = '#b91c1c';
        const isWorkSuspensionEntry = hasWorkSuspension && lower.includes('work suspension');
        return (
          <span key={`${type}-${index}`} style={{ color: baseColor }}>
            <button
              className="underline cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: baseColor,
                textDecorationColor: baseColor,
                fontSize: isWorkSuspensionEntry ? '9px' : undefined
              }}
              onMouseEnter={(e) => {
                e.target.style.setProperty('color', hoverColor, 'important');
                e.target.style.setProperty('text-decoration-color', hoverColor, 'important');
              }}
              onMouseLeave={(e) => {
                e.target.style.setProperty('color', baseColor, 'important');
                e.target.style.setProperty('text-decoration-color', baseColor, 'important');
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
      const matchingHolidays = getHolidaysForDate(holidayData, dayLog?.rawDate || dateStr) || [];
                const trimmedLower = trimmedText.toLowerCase();
                const holidayMatch =
                  matchingHolidays.find((holiday) => {
                    const nameLower = (getHolidayNameValue(holiday) || '').toLowerCase();
                    return nameLower === trimmedLower || trimmedLower.includes(nameLower) || nameLower.includes(trimmedLower);
                  }) ||
                  matchingHolidays.find((holiday) => {
                    const holidayDisplay = getHolidayDisplayForDate([holiday], dayLog?.rawDate || dateStr)?.display?.toLowerCase() || '';
                    return holidayDisplay === trimmedLower || trimmedLower.includes(holidayDisplay) || holidayDisplay.includes(trimmedLower);
                  }) ||
                  matchingHolidays[0] ||
                  null;
                if (holidayMatch) {
                  setSelectedHoliday(normalizeHolidayRecord(holidayMatch));
                  setHolidayModalOpen(true);
                }
              }}
            >
              {trimmedText}
            </button>
            {separator}
          </span>
        );
      }

      if (type === 'leave') {
        const leaveMatch = trimmedText.match(/^Leave\((.+?)\)$/);
        if (leaveMatch) {
          const leaveno = leaveMatch[1];
          const matchingLeave = leavesForDate.find(l => (l.leaveno || l.LEAVEREFNO) === leaveno);
          if (matchingLeave) {
            const linkColor = colorMap.leave;
            const hoverColor = '#6d28d9';
            return (
              <span key={`${type}-${index}`} style={{ color: linkColor, display: 'inline' }}>
                <button
                  className="underline cursor-pointer"
                  ref={(el) => {
                    if (el) {
                      el.style.setProperty('color', linkColor, 'important');
                      el.style.setProperty('text-decoration-color', linkColor, 'important');
                    }
                  }}
                  style={{ 
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    cursor: 'pointer',
                    textDecorationColor: linkColor
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.setProperty('color', hoverColor, 'important');
                    e.target.style.setProperty('text-decoration-color', hoverColor, 'important');
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.setProperty('color', linkColor, 'important');
                    e.target.style.setProperty('text-decoration-color', linkColor, 'important');
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedLeave(matchingLeave);
                    setLeaveModalOpen(true);
                  }}
                >
                  {trimmedText}
                </button>
                {separator}
              </span>
            );
          }
        }
      }

      if (type === 'travel') {
        const travelDataEntry = Array.isArray(dayLog?.travelRecords)
          ? dayLog.travelRecords.find((travel) => {
              const travelNumber = travel.reference || travel.travelno || travel.TRAVELNO || travel.travel_no || 'N/A';
              return trimmedText.includes(travelNumber);
            })
          : null;

        if (travelDataEntry) {
          const baseColor = colorMap.travel;
          const hoverColor = '#047857';
          return (
            <span key={`${type}-${index}`} style={{ color: baseColor }}>
              <button
                className="underline cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: baseColor,
                  textDecorationColor: baseColor
                }}
                onMouseEnter={(e) => {
                  e.target.style.setProperty('color', hoverColor, 'important');
                  e.target.style.setProperty('text-decoration-color', hoverColor, 'important');
                }}
                onMouseLeave={(e) => {
                  e.target.style.setProperty('color', baseColor, 'important');
                  e.target.style.setProperty('text-decoration-color', baseColor, 'important');
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openTravelDetailModal(travelDataEntry.raw || travelDataEntry);
                }}
              >
                {trimmedText}
              </button>
              {separator}
            </span>
          );
        }
      }

      if (type === 'cdo') {
        const cdoRecords = Array.isArray(dayLog?.cdoRecords) ? dayLog.cdoRecords : [];
        const cdoEntry =
          cdoRecords.find((record) => {
            const candidates = [
              record?.displayRef,
              record?.cdono,
              record?.CDONO
            ]
              .map((val) => (val !== undefined && val !== null ? String(val).trim() : ''))
              .filter(Boolean);
            return candidates.some((ref) => trimmedText.includes(ref));
          }) || data || null;

        const baseColor = colorMap.cdo;
        const hoverColor = '#0d9488';

        if (cdoEntry) {
          return (
            <span key={`${type}-${index}`} style={{ color: baseColor }}>
              <button
                className="underline cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: baseColor,
                  textDecorationColor: baseColor
                }}
                onMouseEnter={(e) => {
                  e.target.style.setProperty('color', hoverColor, 'important');
                  e.target.style.setProperty('text-decoration-color', hoverColor, 'important');
                }}
                onMouseLeave={(e) => {
                  e.target.style.setProperty('color', baseColor, 'important');
                  e.target.style.setProperty('text-decoration-color', baseColor, 'important');
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCdoDetailModal(cdoEntry);
                }}
              >
                {trimmedText}
              </button>
              {separator}
            </span>
          );
        }

        return (
          <span key={`${type}-${index}`} style={{ color: baseColor, fontWeight: 600 }}>
            {trimmedText}
            {separator}
          </span>
        );
      }

      if (type === 'weekend' || trimmedText === 'Weekend') {
        return (
          <span key={`${type}-${index}`} style={{ color: colorMap.weekend, fontWeight: 600 }}>
            {trimmedText}
            {separator}
          </span>
        );
      }

      if (type === 'absent' || trimmedText === 'Absent') {
        return (
          <span key={`${type}-${index}`} style={{ color: colorMap.absent, fontWeight: 600 }}>
            {trimmedText}
            {separator}
          </span>
        );
      }

      if (type === 'legacy') {
        if (lower.includes('locator')) {
          return (
            <span key={`${type}-${index}`} style={{ color: colorMap.locator, fontWeight: 600 }}>
              {trimmedText}
              {separator}
            </span>
          );
        }
        if (hasHoliday && (holidayNameSet.has(trimmedText) || lower.includes('holiday') || (holidayDisplay && holidayDisplay.toLowerCase().includes(lower)))) {
          return (
            <span key={`${type}-${index}`} style={{ color: colorMap.holiday, fontWeight: hasWorkSuspension && lower.includes('work suspension') ? 600 : 500, fontSize: hasWorkSuspension && lower.includes('work suspension') ? '9px' : undefined }}>
              {trimmedText}
              {separator}
            </span>
          );
        }
        if (lower.includes('travel')) {
          return (
            <span key={`${type}-${index}`} style={{ color: colorMap.travel, fontWeight: 600 }}>
              {trimmedText}
              {separator}
            </span>
          );
        }
        if (lower.includes('cdo')) {
          return (
            <span key={`${type}-${index}`} style={{ color: colorMap.cdo, fontWeight: 600 }}>
              {trimmedText}
              {separator}
            </span>
          );
        }
        if (lower.includes('leave') || lower.includes('ob')) {
          return (
            <span key={`${type}-${index}`} style={{ color: colorMap.leave, fontWeight: 600 }}>
              {trimmedText}
              {separator}
            </span>
          );
        }
      }

      return (
        <span key={`${type}-${index}`} className="text-gray-600">
          {trimmedText}
          {separator}
        </span>
      );
    });
  };

  const derivedShiftMode = useMemo(() => {
    if (!shiftSchedule) return 'STANDARD';
    const assignedModes = Array.isArray(shiftSchedule.assignedShifts)
      ? shiftSchedule.assignedShifts
          .map((shift) => (shift.shiftMode || shift.period || '').toString().toUpperCase())
          .filter(Boolean)
      : [];
    if (assignedModes.includes('AMPM')) {
      return 'AMPM';
    }
    const hasAMCheckInField = !!shiftSchedule.SHIFT_AMCHECKIN;
    const hasAMCheckOutField = !!shiftSchedule.SHIFT_AMCHECKOUT;
    const hasPMCheckInField = !!shiftSchedule.SHIFT_PMCHECKIN;
    const hasPMCheckOutField = !!shiftSchedule.SHIFT_PMCHECKOUT;
    if (hasAMCheckInField && hasPMCheckOutField && !hasAMCheckOutField && !hasPMCheckInField) {
      return 'AMPM';
    }
    return 'STANDARD';
  }, [shiftSchedule]);

  const isAmpmShift = derivedShiftMode === 'AMPM';

  const timeColumnDefs = useMemo(() => ([
    { key: 'AM_CHECKIN', label: 'AM Check-in', dataKey: 'amCheckIn', columnType: 'AM_CHECKIN', hideOnAmpm: false },
    { key: 'AM_CHECKOUT', label: 'AM Check-out', dataKey: 'amCheckOut', columnType: 'AM_CHECKOUT', hideOnAmpm: true },
    { key: 'PM_CHECKIN', label: 'PM Check-in', dataKey: 'pmCheckIn', columnType: 'PM_CHECKIN', hideOnAmpm: true },
    { key: 'PM_CHECKOUT', label: 'PM Check-out', dataKey: 'pmCheckOut', columnType: 'PM_CHECKOUT', hideOnAmpm: false }
  ]), []);

  const timeColumnTemplate = useMemo(() => {
    const template = timeColumnDefs.map(() => 'minmax(100px, 1fr)').join(' ');
    return template || 'minmax(100px, 1fr)';
  }, [timeColumnDefs]);

  const gridTemplateColumns = useMemo(() => {
    return `minmax(120px, 1.5fr) ${timeColumnTemplate} minmax(80px, 0.8fr) minmax(150px, 2fr)`;
  }, [timeColumnTemplate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500 text-lg">Loading logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg">
          <strong className="font-bold">Error:</strong> {error}
        </div>
      </div>
    );
  }

  // Check if shiftSchedule exists (even if partially null for AM/PM)
  // Check for shift name or assigned shifts array, not just time fields (which might be null)
  const hasAnyShift = shiftSchedule && (
    shiftSchedule.SHIFTNAME ||
    shiftSchedule.assignedShifts?.length > 0 ||
    shiftSchedule.SHIFT_AMCHECKIN || 
    shiftSchedule.SHIFT_AMCHECKOUT || 
    shiftSchedule.SHIFT_PMCHECKIN || 
    shiftSchedule.SHIFT_PMCHECKOUT
  );

  console.log('🔍 [MyShiftView] Shift schedule check:', {
    hasShiftSchedule: !!shiftSchedule,
    shiftName: shiftSchedule?.SHIFTNAME,
    assignedShiftsCount: shiftSchedule?.assignedShifts?.length || 0,
    hasAMCheckIn: !!shiftSchedule?.SHIFT_AMCHECKIN,
    hasAMCheckOut: !!shiftSchedule?.SHIFT_AMCHECKOUT,
    hasPMCheckIn: !!shiftSchedule?.SHIFT_PMCHECKIN,
    hasPMCheckOut: !!shiftSchedule?.SHIFT_PMCHECKOUT,
    hasAnyShift
  });

  if (!shiftSchedule || !hasAnyShift) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-6 py-4 rounded-lg">
            <p className="text-red-500 mb-2 font-semibold">No shift schedule assigned to this employee.</p>
            <p className="text-sm text-gray-600">Please assign a shift schedule to view time logs.</p>
            {shiftSchedule && (
              <p className="text-xs text-gray-500 mt-2">
                Debug: shiftSchedule exists but hasAnyShift is false. Check console for details.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loadingLocatorData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500 text-lg">Loading locator data...</p>
        </div>
      </div>
    );
  }

  if (processedLogs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-gray-100 border border-gray-300 text-gray-700 px-6 py-8 rounded-lg">
            <p className="text-gray-500 text-lg">No logs found for the selected date range.</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate totals for footer
  const calculateTotals = () => {
    const totalLateMinutes = processedLogs.reduce((sum, log) => sum + (log.lateMinutes || 0), 0);
    
    return {
      totalLateMinutes
    };
  };

  const totals = calculateTotals();

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Table Container */}
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {/* Table Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-t-xl">
            <div className="grid" style={{ gridTemplateColumns }}>
              <div className="px-6 py-4 text-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">Date</div>
              </div>
              {timeColumnDefs.map((column) => (
                <div key={column.key} className="px-4 py-4 text-center">
                  <div className="text-white font-bold text-sm uppercase tracking-wide">{column.label}</div>
              </div>
              ))}
              <div className="px-4 py-4 text-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">Late (min)</div>
              </div>
              <div className="px-6 py-4 text-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">Remarks</div>
              </div>
            </div>
          </div>

          {/* Table Body - No Scroll */}
          <div>
            {processedLogs.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500 text-lg">No data available</div>
                <div className="text-gray-400 text-sm mt-1">
                  {selectedFilter ? `No logs found for ${selectedFilter}` : 'No logs found for today'}
                </div>
              </div>
            ) : (
              <div>
                {processedLogs.map((log, index) => {
                  // Holiday supersedes weekend - use red background and text for holidays
                  const rowBgClass = log.hasHoliday ? 'bg-red-50' : (log.isWeekend ? 'bg-blue-50' : 'bg-white');
                  const textColorClass = log.hasHoliday ? 'text-red-600' : (log.isWeekend ? 'text-blue-600' : 'text-gray-900');
                  const textColorClassMono = log.hasHoliday ? 'text-red-600' : 'text-gray-900';
                  const textColorClassRemarks = log.hasHoliday ? 'text-red-600' : 'text-gray-700';
                  
                  return (
                    <div 
                      key={`${log.dateStr}-${index}`}
                      className={`grid hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100 ${rowBgClass}`}
                      style={{ 
                        gridTemplateColumns,
                        minHeight: '60px'
                      }}
                    >
                      {/* Date Column */}
                      <div className="px-6 py-4 flex items-center justify-center">
                        <div className={`text-sm font-semibold text-center ${textColorClass}`}>
                          {log.date}
                        </div>
                      </div>

                      {timeColumnDefs.map((column) => {
                        const shouldForceDash = isAmpmShift && column.hideOnAmpm;
                        return (
                          <div key={`${log.dateStr}-${column.key}`} className="px-4 py-4 flex items-center justify-center">
                        <div className={`text-sm font-mono text-center ${textColorClassMono}`}>
                              {shouldForceDash
                                ? <span className="text-gray-400">-</span>
                                : renderTimeColumn(log[column.dataKey], log, shiftSchedule, column.columnType)}
                        </div>
                      </div>
                        );
                      })}

                      {/* Late Column */}
                      <div className="px-4 py-4 flex items-center justify-center">
                        <div className={log.hasHoliday 
                          ? 'text-sm font-semibold text-red-600' 
                          : (log.lateMinutes > 0 ? 'text-sm font-semibold text-red-600' : 'text-sm font-semibold text-gray-500')}>
                          {log.lateMinutes || 0}
                        </div>
                      </div>

                      {/* Remarks Column */}
                      <div className="px-6 py-4 flex items-center justify-center">
                        <div className={`text-sm text-center ${textColorClassRemarks}`}>
                          {renderRemarks(log.remarkMeta, log.dateStr, log)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Table Footer */}
          <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-b-xl">
            <div className="grid" style={{ gridTemplateColumns }}>
              <div
                className="px-6 py-4 text-center"
                style={{ gridColumn: `span ${1 + timeColumnDefs.length}` }}
              >
                <div className="text-gray-800 font-bold text-sm uppercase tracking-wide">
                  TOTAL
                </div>
              </div>
              <div className="px-4 py-4 text-center">
                <div className="text-gray-800 font-bold text-sm">
                  {totals.totalLateMinutes}
                </div>
              </div>
              <div className="px-6 py-4 text-center">
                <div className="text-gray-800 font-bold text-sm">
                  {/* Remarks column - empty in footer */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Locator Modal */}
      {locatorModalOpen && (
        <LocatorModal
          isOpen={locatorModalOpen}
          onClose={closeLocatorModal}
          onSave={handleSaveLocator}
          selectedDate={selectedDateForLocator}
        />
      )}

      {/* Holiday Detail Modal */}
      {holidayModalOpen && selectedHoliday && (
        <HolidayDetailModal
          isOpen={holidayModalOpen}
          onClose={() => {
            setHolidayModalOpen(false);
            setSelectedHoliday(null);
          }}
          holiday={selectedHoliday}
        />
      )}

      {travelModalOpen && selectedTravel && (
        <TravelDetailModal
          isOpen={travelModalOpen}
          onClose={closeTravelDetailModal}
          travel={selectedTravel}
        />
      )}

      {cdoDetailModalOpen && selectedCdoEntry && (
        <CdoDetailModal
          isOpen={cdoDetailModalOpen}
          onClose={closeCdoDetailModal}
          cdo={selectedCdoEntry}
        />
      )}

      {/* Leave Detail Modal */}
      {leaveModalOpen && selectedLeave && (
        <LeaveDetailModal
          isOpen={leaveModalOpen}
          onClose={() => {
            setLeaveModalOpen(false);
            setSelectedLeave(null);
          }}
          leave={selectedLeave}
        />
      )}
    </div>
  );
};

// HolidayDetailModal Component
const HolidayDetailModal = ({ isOpen, onClose, holiday }) => {
  if (!isOpen || !holiday) return null;

  // Format date for display
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return 'N/A';
    const normalized = extractDate(dateStr);
    if (!normalized) {
      return 'N/A';
    }
    const [year, month, day] = normalized.split('-').map(Number);
    if (!year || !month || !day) {
      return normalized;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">Holiday Information</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="space-y-4">
            {/* Holiday Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Holiday Name
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {holiday.HOLIDAYNAME || 'N/A'}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Category
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {holiday.HOLIDAYCATEGORY || 'N/A'}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Type
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {holiday.HOLIDAYTYPE || 'N/A'}
              </div>
            </div>

            {/* Holiday Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Holiday Date
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {formatDateDisplay(holiday.HOLIDAYDATE)}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Description
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900 min-h-[100px]">
                {holiday.HOLIDAYDESCRIPTION || 'No description provided'}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded bg-gray-600 text-white hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// LeaveDetailModal Component
const LeaveDetailModal = ({ isOpen, onClose, leave }) => {
  if (!isOpen || !leave) return null;

  // Format date from YYYY-MM-DD to mm/dd/yyyy
  const formatDateMMDDYYYY = (dateStr) => {
    if (!dateStr) return '';
    try {
      // Handle YYYY-MM-DD format
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        return `${month}/${day}/${year}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  // Get all inclusive dates
  const getInclusiveDates = () => {
    if (leave.details && Array.isArray(leave.details) && leave.details.length > 0) {
      // Use details array if available - extract date from detail objects
      return leave.details
        .map(detail => {
          // Extract date from detail object (detail is an object with deducteddate property)
          const dateValue = detail.deducteddate || detail.leavedate || detail.LEAVEDATE;
          if (!dateValue) return null;
          // Ensure it's a string before formatting
          const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
          return formatDateMMDDYYYY(dateStr);
        })
        .filter(Boolean)
        .join(', ');
    } else if (leave.inclusivedates) {
      // Parse inclusivedates string if details array not available
      if (typeof leave.inclusivedates === 'string') {
        const dates = leave.inclusivedates.split(',').map(d => d.trim()).filter(d => d);
        return dates.map(date => formatDateMMDDYYYY(date)).join(', ');
      }
    }
    return 'N/A';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">Leave Information</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="space-y-4">
            {/* Leave No */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Leave No
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {leave.leaveno || leave.LEAVEREFNO || 'N/A'}
              </div>
            </div>

            {/* Leave Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Leave Type
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {leave.leave_type_name || leave.LeaveName || 'N/A'}
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Mode
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {leave.deductmode || 'N/A'}
              </div>
            </div>

            {/* Leave Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Leave Status
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50">
                {(() => {
                  const status = leave.leavestatus || leave.LEAVESTATUS || 'N/A';
                  const getStatusBadgeColor = (status) => {
                    switch (status) {
                      case 'For Approval': return 'bg-yellow-100 text-yellow-800';
                      case 'Approved': return 'bg-green-100 text-green-800';
                      case 'Returned': return 'bg-blue-100 text-blue-800';
                      case 'Cancelled': return 'bg-red-100 text-red-800';
                      default: return 'bg-gray-100 text-gray-800';
                    }
                  };
                  return (
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(status)}`}>
                      {status}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Inclusive Dates */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Inclusive Dates
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900 min-h-[60px]">
                {getInclusiveDates()}
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Purpose
              </label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900 min-h-[100px]">
                {leave.leavepurpose || leave.LEAVEREMARKS || 'No purpose provided'}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded bg-gray-600 text-white hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CdoDetailModal = ({ isOpen, onClose, cdo }) => {
  if (!isOpen || !cdo) return null;

  const displayValue = (value) => {
    if (value === undefined || value === null) return 'N/A';
    const str = String(value).trim();
    return str || 'N/A';
  };

  const reference = displayValue(cdo.cdono || cdo.displayRef);
  const status = displayValue(cdo.entryStatus || 'Approved');
  const useDate = displayValue(cdo.date || cdo.cdodate);
  const title = displayValue(cdo.cdoTitle);
  const purpose = displayValue(cdo.cdoPurpose);
  const description = displayValue(cdo.cdoDescription);
  const reason = displayValue(cdo.entryReason || cdo.cdoRemarks);
  const employee = displayValue(cdo.employeeName);
  const department = displayValue(cdo.department);
  const position = displayValue(cdo.position);
  const creditsEarned = displayValue(cdo.creditsEarned);
  const creditsUsed = displayValue(cdo.creditsUsed);
  const creditsUsedTotal = displayValue(cdo.creditsUsedTotal);
  const createdBy = displayValue(cdo.createdByName);
  const approver = displayValue(cdo.approverName);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">CDO Information</h2>
            <p className="text-sm text-gray-500 mt-1">Reference: {reference}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 space-y-8">
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Employee</span>
                <span className="text-base font-semibold text-gray-900">{employee}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Department</span>
                <span className="text-base font-semibold text-gray-900">{department}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Position</span>
                <span className="text-base font-semibold text-gray-900">{position}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Status</span>
                <span className="inline-flex px-3 py-1 rounded-full text-sm font-semibold bg-teal-100 text-teal-800">
                  {status}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">CDO Date</span>
                <span className="text-base font-semibold text-gray-900">{useDate}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Details
            </h3>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Title</span>
                <span className="text-base text-gray-900">{title}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Purpose</span>
                <span className="text-base text-gray-900 whitespace-pre-wrap">{purpose}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Reason / Remarks</span>
                <span className="text-base text-gray-900 whitespace-pre-wrap">{reason}</span>
              </div>
              {description !== 'N/A' && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <span className="block text-sm font-medium text-gray-600 mb-1">Description</span>
                  <span className="text-base text-gray-900 whitespace-pre-wrap">{description}</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Credits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-teal-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-teal-700 mb-1">Earned</span>
                <span className="text-lg font-semibold text-teal-900">{creditsEarned}</span>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-teal-700 mb-1">Used (Entry)</span>
                <span className="text-lg font-semibold text-teal-900">{creditsUsed}</span>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-teal-700 mb-1">Total Used</span>
                <span className="text-lg font-semibold text-teal-900">{creditsUsedTotal}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              System Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Filed By</span>
                <span className="text-base text-gray-900">{createdBy}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Approved By</span>
                <span className="text-base text-gray-900">{approver}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="bg-gray-50 px-6 py-4 rounded-b-lg border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors duration-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const TravelDetailModal = ({ isOpen, onClose, travel }) => {
  if (!isOpen || !travel) return null;

  const travelNo = travel.normalizedTravelNo || travel.travelno || travel.TRAVELNO || travel.travel_no || 'N/A';
  const travelStatus = travel.normalizedTravelStatus || travel.travelstatus || travel.TRAVELSTATUS || travel.status || 'N/A';
  const destination = travel.traveldestination || travel.destination || 'N/A';
  const purpose = travel.purpose || travel.TRAVELPURPOSE || '';
  const createdDateRaw = travel.createddate || travel.CREATEDDATE || null;

  const collectTravelDates = () => {
    if (Array.isArray(travel.normalizedTravelDates) && travel.normalizedTravelDates.length > 0) {
      return travel.normalizedTravelDates;
    }
    if (typeof travel.travel_dates === 'string' && travel.travel_dates.trim() !== '') {
      return travel.travel_dates.split(',').map(d => d.trim()).filter(Boolean);
    }
    if (Array.isArray(travel.travel_dates) && travel.travel_dates.length > 0) {
      return travel.travel_dates.filter(Boolean).map(String);
    }
    if (travel.traveldate) {
      return [String(travel.traveldate)];
    }
    if (travel.TRAVELDATE) {
      return [String(travel.TRAVELDATE)];
    }
    return [];
  };

  const travelDates = collectTravelDates();
  const formattedDates = travelDates.map(dateVal => {
    const normalized = normalizeTravelDateString(dateVal);
    if (normalized) {
      return formatDateDisplay(normalized);
    }
    return dateVal;
  });

  const formatParticipantName = (emp = {}) => {
    const rawPrimary = (emp.name || emp.fullname || emp.display_name || '').trim();
    const rawSurname = (emp.surname || '').trim();
    const rawFirstname = (emp.firstname || '').trim();

    let lastName = '';
    let firstName = '';

    if (rawSurname) {
      lastName = rawSurname;
      if (rawFirstname) {
        firstName = rawFirstname.split(' ')[0];
      } else if (rawPrimary) {
        const primaryParts = rawPrimary.split(/[ ,]+/).filter(Boolean);
        if (primaryParts.length) {
          firstName = primaryParts[0];
        }
      }
    } else if (rawPrimary) {
      if (rawPrimary.includes(',')) {
        const [lastPart, restPart = ''] = rawPrimary.split(',');
        lastName = lastPart.trim();
        firstName = restPart.trim().split(' ').filter(Boolean)[0] || '';
      } else {
        const parts = rawPrimary.split(' ').filter(Boolean);
        if (parts.length >= 2) {
          firstName = parts[0];
          lastName = parts[parts.length - 1];
        } else {
          lastName = rawPrimary;
        }
      }
    }

    if (!lastName && !firstName) {
      const fallback = formatEmployeeName(emp.surname, emp.firstname, emp.middlename);
      return fallback || 'Unknown';
    }

    return [lastName, firstName].filter(Boolean).join(', ') || 'Unknown';
  };

  const participantEntries = Array.isArray(travel.employees)
    ? travel.employees
        .map((emp) => {
          const name = formatParticipantName(emp);
          const photo = emp?.photo_path || emp?.photo || null;
          const initials = name
            .split(',')
            .map(part => part.trim()[0] || '')
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'NA';
          return {
            id: emp?.objid || emp?.id || name,
            name,
            photo,
            initials,
          };
        })
        .filter(entry => !!entry.name && entry.name !== 'Unknown')
    : [];

  const formatPersonDisplayName = (rawName = '') => {
    const trimmed = rawName.trim();
    if (!trimmed) return '';

    if (trimmed.includes(',')) {
      const [lastPart, restPart = ''] = trimmed.split(',');
      const lastName = lastPart.trim();
      const firstName = restPart.trim().split(' ').filter(Boolean)[0] || '';
      return [lastName, firstName].filter(Boolean).join(', ') || trimmed;
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      return `${lastName}, ${firstName}`;
    }

    return trimmed;
  };

  const buildPersonDisplay = (nameValue, usernameValue, photoValue) => {
    const rawName = (nameValue && String(nameValue).trim()) || (usernameValue && String(usernameValue).trim()) || '';
    const formattedName = formatPersonDisplayName(rawName);
    const displayName = formattedName || rawName;
    const photo = photoValue || null;

    const initialsSource = displayName || rawName || 'NA';
    const initials = initialsSource
      .split(',')
      .map(part => part.trim()[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'NA';

    return {
      hasData: !!(displayName || photo),
      displayName: displayName || 'N/A',
      photo,
      initials
    };
  };

  const createdByInfo = buildPersonDisplay(
    travel.created_by_employee_name,
    travel.created_by_username || travel.createdby,
    travel.created_by_photo_path
  );

  const approvedByInfo = buildPersonDisplay(
    travel.approved_by_employee_name,
    travel.approved_by_username || travel.approvedby,
    travel.approved_by_photo_path
  );

  const statusColorMap = {
    Approved: 'bg-green-100 text-green-800',
    'For Approval': 'bg-yellow-100 text-yellow-800',
    Returned: 'bg-blue-100 text-blue-800',
    Cancelled: 'bg-red-100 text-red-800'
  };
  const statusClasses = statusColorMap[travelStatus] || 'bg-gray-100 text-gray-800';

  const createdDateDisplay = createdDateRaw || 'N/A';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">Travel Information</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Travel No</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {travelNo}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClasses}`}>
                  {travelStatus}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Destination</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {destination || 'N/A'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Purpose</label>
            <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900 min-h-[100px]">
              {purpose
                ? <div dangerouslySetInnerHTML={{ __html: purpose }} />
                : 'N/A'}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Travel Dates</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900 whitespace-pre-wrap">
                {formattedDates.length > 0 ? formattedDates.join('\n') : 'N/A'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Participants</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {participantEntries.length > 0 ? (
                  <div className="space-y-2">
                    {participantEntries.map((participant) => (
                      <div key={participant.id} className="flex items-center gap-3">
                        <div className="relative">
                          <div className={`w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600 ${participant.photo ? 'hidden' : ''}`}>
                            {participant.initials}
                          </div>
                          {participant.photo && (
                            <img
                              src={participant.photo}
                              alt={participant.name}
                              className="w-8 h-8 rounded-full object-cover border border-gray-200"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.previousElementSibling;
                                if (fallback) {
                                  fallback.classList.remove('hidden');
                                }
                              }}
                            />
                          )}
                        </div>
                        <span>{participant.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  'N/A'
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Created By</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {createdByInfo.hasData ? (
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600 ${createdByInfo.photo ? 'hidden' : ''}`}>
                        {createdByInfo.initials}
                      </div>
                      {createdByInfo.photo && (
                        <img
                          src={createdByInfo.photo}
                          alt={createdByInfo.displayName}
                          className="w-8 h-8 rounded-full object-cover border border-gray-200"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.previousElementSibling;
                            if (fallback) {
                              fallback.classList.remove('hidden');
                            }
                          }}
                        />
                      )}
                    </div>
                    <span>{createdByInfo.displayName}</span>
                  </div>
                ) : (
                  'N/A'
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Created Date</label>
              <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
                {createdDateDisplay}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Approved By</label>
            <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-900">
              {approvedByInfo.hasData ? (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600 ${approvedByInfo.photo ? 'hidden' : ''}`}>
                      {approvedByInfo.initials}
                    </div>
                    {approvedByInfo.photo && (
                      <img
                        src={approvedByInfo.photo}
                        alt={approvedByInfo.displayName}
                        className="w-8 h-8 rounded-full object-cover border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.previousElementSibling;
                          if (fallback) {
                            fallback.classList.remove('hidden');
                          }
                        }}
                      />
                    )}
                  </div>
                  <span>{approvedByInfo.displayName}</span>
                </div>
              ) : (
                'N/A'
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded bg-gray-600 text-white hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// LocatorModal Component
const LocatorModal = ({ isOpen, onClose, onSave, selectedDate }) => {
  const [form, setForm] = useState({
    locdestination: '',
    loctimedeparture: '',
    loctimearrival: '',
    locpurpose: ''
  });
  const [departureTimeValues, setDepartureTimeValues] = useState({ hours: '', minutes: '' });
  const [arrivalTimeValues, setArrivalTimeValues] = useState({ hours: '', minutes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Helper to parse time value
  const parseTimeValue = (timeStr) => {
    if (!timeStr) return { hours: '', minutes: '' };
    const match = String(timeStr).match(/(\d{2}):(\d{2})/);
    return match ? { hours: match[1], minutes: match[2] } : { hours: '', minutes: '' };
  };

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        locdestination: '',
        loctimedeparture: '',
        loctimearrival: '',
        locpurpose: ''
      });
      setDepartureTimeValues({ hours: '', minutes: '' });
      setArrivalTimeValues({ hours: '', minutes: '' });
      setError('');
    }
  }, [isOpen]);

  const handleTimeChange = (type, field, value) => {
    if (field === 'departure') {
      setDepartureTimeValues(prev => {
        const updated = { ...prev, [type]: value };
        const timeStr = updated.hours && updated.minutes ? `${updated.hours}:${updated.minutes}` : '';
        setForm(f => ({ ...f, loctimedeparture: timeStr }));
        return updated;
      });
    } else if (field === 'arrival') {
      setArrivalTimeValues(prev => {
        const updated = { ...prev, [type]: value };
        const timeStr = updated.hours && updated.minutes ? `${updated.hours}:${updated.minutes}` : '';
        setForm(f => ({ ...f, loctimearrival: timeStr }));
        return updated;
      });
    }
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate all required fields
    const missingFields = [];
    
    if (!form.locdestination || !form.locdestination.trim()) {
      missingFields.push('Destination');
    }
    if (!form.loctimedeparture || !form.loctimedeparture.trim()) {
      missingFields.push('Time Departure');
    }
    if (!form.loctimearrival || !form.loctimearrival.trim()) {
      missingFields.push('Time Arrival');
    }
    if (!form.locpurpose || !form.locpurpose.trim()) {
      missingFields.push('Purpose');
    }

    if (missingFields.length > 0) {
      setError(`Please fill in all required fields: ${missingFields.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save locator. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Add Locator</h3>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Date Field (pre-filled, read-only) */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Locator Date</label>
            <input
              type="date"
              value={selectedDate || ''}
              disabled
              className="w-full border rounded px-3 py-2 bg-gray-100"
            />
          </div>

          {/* Time Departure */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Time Departure</label>
            <div className="flex items-center gap-2">
              <select
                value={departureTimeValues.hours}
                onChange={(e) => handleTimeChange('hours', 'departure', e.target.value)}
                className="px-3 py-2 border rounded"
              >
                <option value="">HH</option>
                {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span>:</span>
              <select
                value={departureTimeValues.minutes}
                onChange={(e) => handleTimeChange('minutes', 'departure', e.target.value)}
                className="px-3 py-2 border rounded"
              >
                <option value="">MM</option>
                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Time Arrival */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Time Arrival</label>
            <div className="flex items-center gap-2">
              <select
                value={arrivalTimeValues.hours}
                onChange={(e) => handleTimeChange('hours', 'arrival', e.target.value)}
                className="px-3 py-2 border rounded"
              >
                <option value="">HH</option>
                {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span>:</span>
              <select
                value={arrivalTimeValues.minutes}
                onChange={(e) => handleTimeChange('minutes', 'arrival', e.target.value)}
                className="px-3 py-2 border rounded"
              >
                <option value="">MM</option>
                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Destination */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Destination</label>
            <input
              name="locdestination"
              type="text"
              value={form.locdestination}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              placeholder="Enter destination"
            />
          </div>

          {/* Purpose */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Purpose</label>
            <textarea
              name="locpurpose"
              value={form.locpurpose}
              onChange={handleChange}
              rows={3}
              className="w-full border rounded px-3 py-2"
              placeholder="Enter purpose"
            />
          </div>

          {error && (
            <div className="mb-4 text-red-600 text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MyShiftView;
