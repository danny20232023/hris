import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import RawLogsView_Management from './RawLogsView_Management';
import { exportGridToCSV, exportGridToExcel } from './ExportTimeLogs';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { getEmployeeShiftSchedule } from '../../utils/shiftScheduleUtils';
import { normalizeCdoUsageMap, getCdoEntriesForDate } from '../../utils/cdoUtils';
import { TravelDetailModal } from './MyShiftView';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';
import FixTimeModal from './FixTimeModal.jsx';

// --- Utility Functions ---

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

// Date formatting for Log Date column: "mm/dd/yyyy, day"
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

// Normalize time value from "HH:mm:ss" or "HH:mm" to "HH:mm" format
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

// Helper to extract time from shift schedule field (handles various formats)
const extractTimeFromShiftField = (fieldValue) => {
  if (!fieldValue) return null;
  if (typeof fieldValue === 'string') {
    // If it's already in HH:mm format, return as-is
    if (/^\d{2}:\d{2}$/.test(fieldValue)) return fieldValue;
    // If it's in HH:mm:ss format, extract HH:mm
    const match = fieldValue.match(/^(\d{2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}`;
    // Try to extract from timestamp
    return extractTimeFromString(fieldValue);
  }
  if (fieldValue instanceof Date) {
    const hours = String(fieldValue.getHours()).padStart(2, '0');
    const minutes = String(fieldValue.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  return null;
};

// Generate filtered time options based on shift schedule
const generateFilteredFixTimeOptions = (fieldName, shiftSchedule, currentLogValues = []) => {
  const options = [{ value: '', label: '-- Select Time --' }];
  const timeSet = new Set();
  
  // Get time window for this field from shift schedule
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
  
  // Convert window to minutes for comparison
  const windowStartMinutes = windowStart ? timeToMinutes(windowStart) : null;
  const windowEndMinutes = windowEnd ? timeToMinutes(windowEnd) : null;
  
  // Generate 15-minute interval options
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hourStr = String(hour).padStart(2, '0');
      const minuteStr = String(minute).padStart(2, '0');
      const timeValue = `${hourStr}:${minuteStr}`;
      const timeMinutes = hour * 60 + minute;
      
      // Filter based on shift schedule window if available
      if (windowStartMinutes !== null && windowEndMinutes !== null) {
        if (timeMinutes >= windowStartMinutes && timeMinutes <= windowEndMinutes) {
          timeSet.add(timeValue);
          options.push({ value: timeValue, label: timeValue });
        }
      } else {
        // No window, include all times
        timeSet.add(timeValue);
        options.push({ value: timeValue, label: timeValue });
      }
    }
  }
  
  // Always include current log values (even if outside window)
  currentLogValues.forEach((timeValue) => {
    if (timeValue && timeValue.trim() && !timeSet.has(timeValue)) {
      timeSet.add(timeValue);
      options.push({ value: timeValue, label: timeValue });
    }
  });
  
  // Sort options by time value (except the first "-- Select Time --" option)
  const selectOption = options[0];
  const timeOptions = options.slice(1).sort((a, b) => {
    const [aHour, aMin] = a.value.split(':').map(Number);
    const [bHour, bMin] = b.value.split(':').map(Number);
    if (aHour !== bHour) return aHour - bHour;
    return aMin - bMin;
  });
  
  return [selectOption, ...timeOptions];
};

// Generate time options in 24-hour format (HH:mm) - every 15 minutes for Fix Time modal
// Also includes current log values if they don't match 15-minute intervals
const generateFixTimeOptions = (currentLogValues = []) => {
  const options = [{ value: '', label: '-- Select Time --' }];
  const timeSet = new Set();
  
  // Add standard 15-minute interval options
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hourStr = String(hour).padStart(2, '0');
      const minuteStr = String(minute).padStart(2, '0');
      const timeValue = `${hourStr}:${minuteStr}`;
      timeSet.add(timeValue);
      options.push({ value: timeValue, label: timeValue });
    }
  }
  
  // Add current log values if they're not already in the options
  currentLogValues.forEach((timeValue) => {
    if (timeValue && timeValue.trim() && !timeSet.has(timeValue)) {
      timeSet.add(timeValue);
      options.push({ value: timeValue, label: timeValue });
    }
  });
  
  // Sort options by time value (except the first "-- Select Time --" option)
  const selectOption = options[0];
  const timeOptions = options.slice(1).sort((a, b) => {
    const [aHour, aMin] = a.value.split(':').map(Number);
    const [bHour, bMin] = b.value.split(':').map(Number);
    if (aHour !== bHour) return aHour - bHour;
    return aMin - bMin;
  });
  
  return [selectOption, ...timeOptions];
};

const emptyFixForm = {
  emp_objid: '',
  checktimedate: '',
  am_checkin: '',
  am_checkout: '',
  pm_checkin: '',
  pm_checkout: '',
  remarks: ''
};

// Check if date is weekend (Saturday or Sunday)
const isWeekend = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
};

function extractTime(value) {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

// Extract time from string (handles various formats including datetime strings)
function extractTimeFromString(value) {
  if (!value) return '';
  
  // If it's already in HH:MM format, return as is
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  
  // If it's a datetime string, extract time part
  if (typeof value === 'string') {
    // Handle ISO datetime strings (e.g., "2025-01-15T08:30:00.000Z")
    const isoMatch = value.match(/T(\d{2}):(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}:${isoMatch[2]}`;
    }
    
    // Handle other datetime formats
    const match = value.match(/(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  
  return '';
}

function extractTimeFromTimestamp(value) {
  return extractTimeFromString(value);
}

// Parse hour from time string (e.g., "08:30" -> 8)
const parseHour = (timeStr) => {
  if (!timeStr) return 0;
  
  // Extract time string first
  const time = extractTimeFromString(timeStr);
  if (!time) return 0;
  
  // Parse hour from HH:MM format
  const hourMatch = time.match(/^(\d{2}):/);
  if (hourMatch) {
    return parseInt(hourMatch[1], 10);
  }
  
  return 0;
};

const extractDate = (value) => {
  if (!value) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'object' && value !== null) {
    if (value.date) return extractDate(value.date);
    if (value.CHECKTIME) return extractDate(value.CHECKTIME);
    if (value.value) return extractDate(value.value);
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const slashMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const [, mm, dd, yyyy] = slashMatch;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    const ymdSlashMatch = trimmed.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (ymdSlashMatch) {
      const [, yyyy, mm, dd] = ymdSlashMatch;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    const firstToken = trimmed.split(/[ T]/)[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(firstToken) ? firstToken : '';
  }

  return '';
};

// Safe date extraction without timezone conversion (for YYYY-MM-DD strings)
const extractDateSafe = (value) => {
  if (!value) return '';
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    
    // For YYYY-MM-DD format, extract directly without Date object
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }
    
    // For dates with time component (YYYY-MM-DDTHH:MM:SS), extract date part only
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    
    // For slash format (MM/DD/YYYY)
    const slashMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const [, mm, dd, yyyy] = slashMatch;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }

  return '';
};

const normalizeHolidayDateValue = (value) => {
  if (!value) return '';

  // Handle Date objects - extract date part from ISO string without timezone conversion
  if (value instanceof Date) {
    // Convert to ISO string and extract date part (YYYY-MM-DD) before 'T'
    // This preserves the stored date value exactly as stored in database
    const isoString = value.toISOString();
    const dateMatch = isoString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    // For YYYY-MM-DD format, return directly without any conversion
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }

    // For ISO strings with time component, extract date part (YYYY-MM-DD) before 'T' or space
    // Extract directly without any Date object conversion to preserve stored value
    const isoWithTimeMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoWithTimeMatch) {
      // Extract date directly from string - no timezone conversion
      return `${isoWithTimeMatch[1]}-${isoWithTimeMatch[2]}-${isoWithTimeMatch[3]}`;
    }
  }

  // For other formats, use extractDateSafe instead of extractDate to avoid timezone conversion
  return extractDateSafe(value);
};

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper to get time window from shiftSchedule
const getTimeWindow = (start, end) => {
  if (!start || !end) return [null, null];
  return [timeToMinutes(start), timeToMinutes(end)];
};

// Helper to validate if time is within window (basic version)
const validateTimeInWindow = (timeStr, startWindow, endWindow) => {
  if (!timeStr) return false;
  if (startWindow === null || startWindow === undefined || endWindow === null || endWindow === undefined) {
    return false;
  }
  const timeInMinutes = timeToMinutes(timeStr);
  return timeInMinutes >= startWindow && timeInMinutes <= endWindow;
};

// Helper to get locator remarks for a date - supports MySQL employee_locators structure
const getLocatorRemarksForDate = (locatorData, dateStr, userId, employeeObjId) => {
  if (!locatorData || locatorData.length === 0) return { remarks: '', locators: [] };

  const userIdStr = userId !== undefined && userId !== null ? String(userId) : null;
  const empObjIdStr = employeeObjId !== undefined && employeeObjId !== null ? String(employeeObjId) : null;

  const locatorsForDate = locatorData.filter(locator => {
    const locDate = extractDate(locator.locatordate || locator.LOCDATE);
    if (locDate !== dateStr) return false;

    const status = normalizeStatusLabel(locator.locstatus || locator.LOCSTATUS);
    if (status !== 'Approved') return false;

    const matchesObjId =
      empObjIdStr &&
      locator.emp_objid !== undefined &&
      locator.emp_objid !== null &&
      String(locator.emp_objid) === empObjIdStr;

    const matchesUserId =
      userIdStr &&
      locator.LOCUSERID !== undefined &&
      locator.LOCUSERID !== null &&
      String(locator.LOCUSERID) === userIdStr;

    return matchesObjId || matchesUserId;
  });

  const remarks = locatorsForDate
    .map(locator => {
      const locNo = locator.LOCNO || locator.locatorno || locator.loc_no || 'N/A';
      return `Locator (${locNo})`;
    })
    .filter(Boolean)
    .join('; ');

  return { remarks, locators: locatorsForDate };
};

// Function to open locator details in new window
const openLocatorDetails = (locator) => {
  const locatorWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
  
  if (locatorWindow) {
    locatorWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Locator Details - ${locator.LOCNO}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
          .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { color: #333; margin: 0; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #555; display: inline-block; width: 150px; }
          .value { color: #333; }
          .close-btn { background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-top: 20px; }
          .close-btn:hover { background: #c82333; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Locator Details</h1>
          </div>
          <div class="field">
            <span class="label">Locator Number:</span>
            <span class="value">${locator.LOCNO || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Employee:</span>
            <span class="value">${locator.NAME || 'Unknown Employee'}</span>
          </div>
          <div class="field">
            <span class="label">Date:</span>
            <span class="value">${locator.LOCDATE ? new Date(locator.LOCDATE).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Destination:</span>
            <span class="value">${locator.LOCDESTINATION || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Purpose:</span>
            <span class="value">${locator.LOCPURPOSE || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Time Departure:</span>
            <span class="value">${locator.LOCTIMEDEPARTURE ? new Date(locator.LOCTIMEDEPARTURE).toLocaleString() : 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Time Arrival:</span>
            <span class="value">${locator.LOCTIMEARRIVAL ? new Date(locator.LOCTIMEARRIVAL).toLocaleString() : 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Status:</span>
            <span class="value">${locator.LOCSTATUS || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Entry By:</span>
            <span class="value">${locator.LOCENTRYBY || 'N/A'}</span>
          </div>
          <div class="field">
            <span class="label">Entry Date:</span>
            <span class="value">${locator.LOCENTRYDATE ? new Date(locator.LOCENTRYDATE).toLocaleString() : 'N/A'}</span>
          </div>
          <button class="close-btn" onclick="window.close()">Close</button>
        </div>
      </body>
      </html>
    `);
    locatorWindow.document.close();
  }
};

// Function to render remarks with clickable locator links - SIMPLIFIED STRING APPROACH
const renderRemarksWithLinks = (remarksStr, isWeekend, locatorData, dateStr, userId, employeeObjId) => {
  if (!remarksStr) return null;
  
  const { remarks: locatorRemarks, locators } = getLocatorRemarksForDate(locatorData, dateStr, userId, employeeObjId);
  
  // Return the remarks string as-is, but with data attributes for locator info
  return remarksStr;
};

// Function to handle click on remarks cell
const handleRemarksClick = (event, locatorData, dateStr, userId, employeeObjId) => {
  const target = event.target;
  if (target.tagName === 'SPAN' && target.textContent.startsWith('Locator(')) {
    const statusMatch = target.textContent.match(/^Locator\(([^)]+)\)/);
    if (!statusMatch) return;
    const locator = locatorData.find(l => {
      const locDate = extractDate(l.locatordate || l.LOCDATE);
      if (locDate !== dateStr) return false;

      const matchesObjId =
        employeeObjId !== undefined &&
        employeeObjId !== null &&
        l.emp_objid !== undefined &&
        l.emp_objid !== null &&
        String(l.emp_objid) === String(employeeObjId);

      const matchesUserId =
        userId !== undefined &&
        userId !== null &&
        l.LOCUSERID !== undefined &&
        l.LOCUSERID !== null &&
        String(l.LOCUSERID) === String(userId);

      return matchesObjId || matchesUserId;
    });

    if (locator) {
      openLocatorDetails(locator);
    }
  }
};

// Add missing utility functions after line 100
const calculateLateMinutes = (checkInTime, expectedStartTime) => {
  if (!checkInTime || !expectedStartTime) return 0;
  
  const checkInTimeStr = extractTimeFromString(checkInTime);
  const expectedTimeStr = extractTimeFromString(expectedStartTime);
  
  if (!checkInTimeStr || !expectedTimeStr) return 0;
  
  const checkInMinutes = timeToMinutes(checkInTimeStr);
  const expectedMinutes = timeToMinutes(expectedTimeStr);
  
  // If check-in is after expected time, calculate late minutes
  if (checkInMinutes > expectedMinutes) {
    return checkInMinutes - expectedMinutes;
  }
  
  return 0; // Not late
};

// Helper to check if time is within window (for time string inputs)
const isTimeInWindow = (timeStr, startWindow, endWindow) => {
  if (!timeStr || !startWindow || !endWindow) return false;
  
  const timeInMinutes = timeToMinutes(timeStr);
  const startMinutes = timeToMinutes(startWindow);
  const endMinutes = timeToMinutes(endWindow);
  
  return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
};

// Helper to get leave remarks for a date - UPDATED for new table structure
const getLeaveRemarksForDate = (leaveData, dateStr, userId, employeeObjId) => {
  console.log('🔍 [LEAVE REMARKS] getLeaveRemarksForDate called with:', { dateStr, userId, employeeObjId, leaveDataLength: leaveData?.length });
  
  if (!leaveData || leaveData.length === 0) {
    console.log('❌ [LEAVE REMARKS] No leave data available');
    return { remarks: '', leaveRecords: [] };
  }

  const leavesForDate = leaveData.filter(leave => {
    const status = normalizeStatusLabel(leave.leavestatus || leave.LEAVESTATUS || leave.status);
    if (status !== 'Approved') {
      return false;
    }
    
    // Check if leave has leaveDates array (new structure from LEAVEDATES2)
    if (leave.leaveDates && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractDate(leaveDate.LEAVEDATE);
        const dateMatch = leaveDateStr === dateStr;
        const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
        return dateMatch && matchesEmployee;
      });
      
      if (hasMatchingDate) {
        console.log('🔍 [LEAVE REMARKS] Found matching leave (new structure):', {
          leaveRefNo: leave.LEAVEREFNO,
          leaveType: leave.LeaveName,
          remarks: leave.LEAVEREMARKS
        });
        return true;
      }
    }
    
    // Fallback to old structure for backward compatibility
    const leaveDate = extractDate(leave.LEAVEDATE);
    const dateMatch = leaveDate === dateStr;
    const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
    
    console.log('🔍 [LEAVE REMARKS] Checking leave (old structure):', {
      leaveDate,
      targetDate: dateStr,
      leaveUserId: leave.USERID,
      targetUserId: userId,
      dateMatch,
      matchesEmployee,
      leaveType: leave.LeaveName,
      leaveRefNo: leave.LEAVEREFNO
    });
    
    return dateMatch && matchesEmployee;
  });
  
  if (leavesForDate.length === 0) {
    console.log('❌ [LEAVE REMARKS] No leaves found for date and user');
    return { remarks: '', leaveRecords: [] };
  }
  
  const leaveRecords = leavesForDate.map(leave => ({
    ...leave,
    type: 'leave'
  }));
  
  const remarks = leaveRecords.map(leave => {
    const leaveRefNo = leave.LEAVEREFNO || leave.leaveno || 'N/A';
    return `Leave (${leaveRefNo})`;
  }).join('; ');
  
  console.log('✅ [LEAVE REMARKS] Final result:', { remarks, leaveRecords });
  return { remarks, leaveRecords };
};

const normalizeTravelDateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, mm, dd, yyyy] = match;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return extractDate(trimmed);
  }
  return extractDate(value);
};

const collectTravelDatesFromRecord = (travel) => {
  const dates = new Set();
  if (!travel) return dates;

  const pushDate = (val) => {
    const normalized = normalizeTravelDateValue(val);
    if (normalized) dates.add(normalized);
  };

  if (Array.isArray(travel.travelDates)) {
    travel.travelDates.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        pushDate(entry.TRAVELDATE || entry.traveldate);
      } else {
        pushDate(entry);
      }
    });
  }

  if (Array.isArray(travel.travel_dates_array)) {
    travel.travel_dates_array.forEach(pushDate);
  }

  if (Array.isArray(travel.normalizedTravelDates)) {
    travel.normalizedTravelDates.forEach(pushDate);
  }

  if (typeof travel.travel_dates === 'string') {
    travel.travel_dates.split(',').forEach((part) => pushDate(part));
  }

  if (travel.traveldate) {
    pushDate(travel.traveldate);
  }

  if (travel.TRAVELDATE) {
    pushDate(travel.TRAVELDATE);
  }

  return dates;
};

const extractParticipantEmpObjIdsFromEmployeesData = (employeesData) => {
  if (!employeesData || typeof employeesData !== 'string') return [];
  return employeesData
    .split('|')
    .map((entry) => entry.split(':')[0]?.trim())
    .filter(Boolean);
};

const travelRecordIncludesEmployee = (travel, employeeObjId, userId) => {
  const objIdStr = employeeObjId ? String(employeeObjId) : null;
  const userIdStr = userId ? String(userId) : null;

  if (objIdStr) {
    if (travel.emp_objid && String(travel.emp_objid) === objIdStr) return true;
    if (travel.employee_objid && String(travel.employee_objid) === objIdStr) return true;
    if (travel.EMP_OBJID && String(travel.EMP_OBJID) === objIdStr) return true;

    if (Array.isArray(travel.employees)) {
      if (travel.employees.some((emp) => String(emp?.objid) === objIdStr)) return true;
    }

    if (Array.isArray(travel.participantEmpObjIds)) {
      if (travel.participantEmpObjIds.some((id) => String(id) === objIdStr)) return true;
    }

    const parsed = extractParticipantEmpObjIdsFromEmployeesData(travel.employees_data);
    if (parsed.some((id) => String(id) === objIdStr)) return true;
  }

  if (userIdStr) {
    if (travel.USERID && String(travel.USERID) === userIdStr) return true;
    if (travel.createdby && String(travel.createdby) === userIdStr) return true;
    if (Array.isArray(travel.participantUserIds)) {
      if (travel.participantUserIds.some((id) => String(id) === userIdStr)) return true;
    }
  }

  return false;
};

// Helper to get travel remarks for a date - MySQL employee_travels support
const getTravelRemarksForDate = (travelData, dateStr, userId, employeeObjId) => {
  if (!Array.isArray(travelData) || travelData.length === 0) {
    return { remarks: '', travelRecords: [] };
  }

  const matches = travelData.filter((travel) => {
    const status = normalizeStatusLabel(travel.travelstatus || travel.status || travel.TRAVELSTATUS);
    if (status !== 'Approved') {
      return false;
    }

    if (!travelRecordIncludesEmployee(travel, employeeObjId, userId)) {
      return false;
    }

    const dates = collectTravelDatesFromRecord(travel);
    return dates.has(dateStr);
  });

  if (matches.length === 0) {
    return { remarks: '', travelRecords: [] };
  }

  const travelRecords = matches.map((travel) => ({
    ...travel,
    type: 'travel'
  }));

  const remarks = travelRecords
    .map((travel) => {
      const travelNo = travel.travelno || travel.TRAVELNO || travel.cdono || 'N/A';
      return `Travel (${travelNo})`;
    })
    .join('; ');

  return { remarks, travelRecords };
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

  for (const value of candidates) {
    if (value) {
      // Debug: Log the raw value and its type
      if (holiday.holidayname && holiday.holidayname.includes('Christmas')) {
        console.log('🔍 [HOLIDAY DATE DEBUG] Raw date value:', {
          holidayName: holiday.holidayname,
          rawValue: value,
          valueType: typeof value,
          isDate: value instanceof Date,
          valueString: String(value),
          valueISO: value instanceof Date ? value.toISOString() : 'N/A'
        });
      }
      
      const normalized = normalizeHolidayDateValue(value);
      if (normalized) {
        // Debug: Log the normalized value
        if (holiday.holidayname && holiday.holidayname.includes('Christmas')) {
          console.log('🔍 [HOLIDAY DATE DEBUG] Normalized date:', {
            holidayName: holiday.holidayname,
            normalized
          });
        }
        return normalized;
      }
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
    holiday.name
  ];

  for (const value of candidates) {
    if (value && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return 'Holiday';
};

const isHolidayRecurring = (holiday) => {
  const recurringValue =
    holiday?.ISRECURRING ??
    holiday?.isRecurring ??
    holiday?.is_recurring ??
    holiday?.isrecurring ??  // Database column name (all lowercase)
    holiday?.recurring ??
    holiday?.IS_RECURRING;

  if (recurringValue === undefined || recurringValue === null) return false;

  if (typeof recurringValue === 'boolean') return recurringValue;
  if (typeof recurringValue === 'number') return recurringValue === 1;

  const normalized = String(recurringValue).trim().toLowerCase();
  if (!normalized) return false;

  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
};

const getHolidaysForDate = (holidayData, dateStr) => {
  if (!holidayData || holidayData.length === 0 || !dateStr) return [];

  // Extract date safely without timezone conversion
  const targetDate = extractDateSafe(dateStr);
  if (!targetDate || targetDate.length < 10) {
    console.log('⚠️ [HOLIDAY DEBUG] Invalid targetDate:', { dateStr, targetDate });
    return [];
  }

  const targetMonthDay = targetDate.slice(5, 10);

  console.log('🔍 [HOLIDAY DEBUG] getHolidaysForDate called:', {
    dateStr,
    targetDate,
    targetMonthDay,
    totalHolidays: holidayData.length,
    recurringHolidays: holidayData.filter(h => isHolidayRecurring(h)).length
  });
  
  const matchingHolidays = holidayData.filter((holiday) => {
    // Get raw date value before normalization for debugging
    const rawHolidayDate = holiday.HOLIDAYDATE || holiday.holidaydate || holiday.holiday_date || holiday.HolidayDate || holiday.date || '';
    const holidayDate = getHolidayDateValue(holiday);
    if (!holidayDate || holidayDate.length < 10) {
      console.log('⚠️ [HOLIDAY DEBUG] Invalid holidayDate:', {
        holidayName: getHolidayNameValue(holiday),
        rawHolidayDate,
        holidayDate
      });
      return false;
    }

    const isRecurring = isHolidayRecurring(holiday);
    
    console.log('🔍 [HOLIDAY DEBUG] Checking holiday:', {
      holidayName: getHolidayNameValue(holiday),
      isRecurring,
      rawHolidayDate: rawHolidayDate instanceof Date ? rawHolidayDate.toISOString() : rawHolidayDate,
      normalizedHolidayDate: holidayDate
    });
    
    // For recurring holidays, match by month-day (MM-DD) to work for any year
    // Extract month-day from the stored date value (before timezone conversion) for accurate matching
    if (isRecurring) {
      // Extract month-day from raw date value to avoid timezone conversion issues
      // This ensures recurring holidays match correctly regardless of timezone
      let holidayMonthDay = '';
      if (rawHolidayDate) {
        let rawDateStr = '';
        
        // Handle Date objects
        if (rawHolidayDate instanceof Date) {
          // Extract date part from Date object (use UTC to avoid timezone conversion)
          const year = rawHolidayDate.getUTCFullYear();
          const month = String(rawHolidayDate.getUTCMonth() + 1).padStart(2, '0');
          const day = String(rawHolidayDate.getUTCDate()).padStart(2, '0');
          rawDateStr = `${year}-${month}-${day}`;
        } else {
          rawDateStr = String(rawHolidayDate).trim();
        }
        
        // Extract date part directly from string (YYYY-MM-DD) before 'T' or space
        const datePartMatch = rawDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (datePartMatch) {
          // Use the stored date part directly (no timezone conversion)
          holidayMonthDay = `${datePartMatch[2]}-${datePartMatch[3]}`;
        } else {
          // Fallback to normalized date if extraction fails
          holidayMonthDay = holidayDate.slice(5, 10);
        }
      } else {
        // Fallback to normalized date if no raw date available
        holidayMonthDay = holidayDate.slice(5, 10);
      }
      
      const matches = holidayMonthDay === targetMonthDay;
      
      // Debug logging for recurring holidays
      if (matches) {
        console.log('✅ [HOLIDAY DEBUG] Recurring holiday match:', {
          holidayName: getHolidayNameValue(holiday),
          rawHolidayDate,
          normalizedHolidayDate: holidayDate,
          holidayMonthDay,
          targetDate,
          targetMonthDay
        });
      } else {
        // Log when recurring holiday doesn't match for debugging
        console.log('🔍 [HOLIDAY DEBUG] Recurring holiday no match:', {
          holidayName: getHolidayNameValue(holiday),
          rawHolidayDate,
          normalizedHolidayDate: holidayDate,
          holidayMonthDay,
          targetDate,
          targetMonthDay
        });
      }
      
      return matches;
    }

    // For non-recurring holidays, match by full date (YYYY-MM-DD)
    return holidayDate === targetDate;
  });
  
  if (matchingHolidays.length === 0) {
    const recurringHolidays = holidayData.filter(h => isHolidayRecurring(h));
    if (recurringHolidays.length > 0) {
      console.log('🔍 [HOLIDAY DEBUG] No holidays found for date:', {
        dateStr,
        targetDate,
        targetMonthDay,
        totalHolidays: holidayData.length,
        recurringHolidaysCount: recurringHolidays.length,
        recurringHolidays: recurringHolidays.map(h => {
          const rawDate = h.HOLIDAYDATE || h.holidaydate || h.holiday_date || h.HolidayDate || h.date || '';
          const normalizedDate = getHolidayDateValue(h);
          let monthDay = '';
          if (rawDate) {
            let rawDateStr = '';
            if (rawDate instanceof Date) {
              const year = rawDate.getUTCFullYear();
              const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
              const day = String(rawDate.getUTCDate()).padStart(2, '0');
              rawDateStr = `${year}-${month}-${day}`;
            } else {
              rawDateStr = String(rawDate).trim();
            }
            const datePartMatch = rawDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (datePartMatch) {
              monthDay = `${datePartMatch[2]}-${datePartMatch[3]}`;
            } else {
              monthDay = normalizedDate?.slice(5, 10) || 'N/A';
            }
          } else {
            monthDay = normalizedDate?.slice(5, 10) || 'N/A';
          }
          return {
            name: getHolidayNameValue(h),
            rawDate: rawDate instanceof Date ? rawDate.toISOString() : rawDate,
            normalizedDate,
            monthDay
          };
        })
      });
    }
  }
  
  return matchingHolidays;
};

// Helper to get holiday names for a date (HOLIDAY NOTIFICATION ONLY)
const getHolidayNamesForDate = (holidayData, dateStr) => {
  if (!holidayData || holidayData.length === 0) return '';
  
  const holidaysForDate = holidayData.filter(holiday => {
    const holidayDate = getHolidayDateValue(holiday);
    return holidayDate === dateStr;
  });
  
  if (holidaysForDate.length === 0) return '';
  
  // Just return the holiday names - notification only
  return holidaysForDate.map(holiday => {
    return getHolidayNameValue(holiday);
  }).join('; ');
};

const getHolidayDisplayForDate = (holidayData, dateStr) => {
  console.log('🔍 [HOLIDAY DISPLAY] getHolidayDisplayForDate called:', {
    dateStr,
    holidayDataLength: holidayData?.length || 0,
    holidayDataExists: !!holidayData
  });
  
  const matchingHolidays = getHolidaysForDate(holidayData, dateStr);
  
  console.log('🔍 [HOLIDAY DISPLAY] Matching holidays found:', {
    dateStr,
    matchingCount: matchingHolidays.length,
    matchingHolidays: matchingHolidays.map(h => ({
      name: getHolidayNameValue(h),
      date: getHolidayDateValue(h),
      isRecurring: isHolidayRecurring(h)
    }))
  });
  
  if (matchingHolidays.length === 0) {
    return null;
  }

  const names = matchingHolidays.map(getHolidayNameValue).filter(Boolean);
  const hasWorkSuspension = names.some((name) => typeof name === 'string' && name.toLowerCase().includes('work suspension'));

  return {
    records: matchingHolidays,
    names,
    display: hasWorkSuspension ? 'Work Suspension' : names.join(', '),
    hasWorkSuspension
  };
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

// Helper to get fix logs for a date - supports both Approved and For Approval statuses
const getFixLogsForDate = (fixLogsData, dateStr, employeeObjId) => {
  if (!fixLogsData || fixLogsData.length === 0 || !dateStr) {
    return { fixLog: null, remarks: '' };
  }

  const empObjIdStr = employeeObjId !== undefined && employeeObjId !== null ? String(employeeObjId) : null;

  const fixLogsForDate = fixLogsData.filter(fixLog => {
    const fixDate = extractDate(fixLog.checktimedate || fixLog.CHECKTIMEDATE);
    if (fixDate !== dateStr) return false;

    const status = normalizeStatusLabel(fixLog.fixstatus || fixLog.FIXSTATUS);
    if (status !== 'Approved' && status !== 'For Approval') return false;

    const matchesObjId =
      empObjIdStr &&
      fixLog.emp_objid !== undefined &&
      fixLog.emp_objid !== null &&
      String(fixLog.emp_objid) === empObjIdStr;

    return !empObjIdStr || matchesObjId;
  });

  if (fixLogsForDate.length === 0) {
    return { fixLog: null, remarks: '' };
  }

  // Use the most recent fix log (prefer Approved over For Approval)
  const approvedFixLog = fixLogsForDate.find(f => normalizeStatusLabel(f.fixstatus || f.FIXSTATUS) === 'Approved');
  const fixLog = approvedFixLog || fixLogsForDate[0];
  const status = normalizeStatusLabel(fixLog.fixstatus || fixLog.FIXSTATUS);

  let remarks = '';
  if (status === 'Approved') {
    remarks = 'LogsFixed';
  } else if (status === 'For Approval') {
    remarks = 'FixOnProcess';
  }

  return { fixLog, remarks };
};

// Helper to get fix logs remarks for a date (for remarks display)
const getFixLogsRemarksForDate = (fixLogsData, dateStr, employeeObjId) => {
  const { remarks } = getFixLogsForDate(fixLogsData, dateStr, employeeObjId);
  return remarks;
};

// Helper to check if date has existing Approved/For Approval remarks for Leave, Travel, CDO, or Locator
const hasExistingRemarksForDate = (dateStr, userId, employeeObjId, locatorData, leaveData, travelData, cdoUsageMap) => {
  if (!dateStr) return { hasRemarks: false, remarksText: '' };
  
  const locatorRemarks = getLocatorRemarksForDate(locatorData, dateStr, userId, employeeObjId);
  const leaveRemarksData = getLeaveRemarksForDate(leaveData, dateStr, userId, employeeObjId);
  const travelRemarksData = getTravelRemarksForDate(travelData, dateStr, userId, employeeObjId);
  const cdoRemarksData = getCdoRemarksForDate(cdoUsageMap, dateStr);
  
  // Check if any of these have Approved or For Approval status
  const hasLocator = locatorRemarks.locators && locatorRemarks.locators.some(loc => {
    const status = normalizeStatusLabel(loc.locstatus || loc.LOCSTATUS);
    return status === 'Approved' || status === 'For Approval';
  });
  
  const hasLeave = leaveRemarksData.leaveRecords && leaveRemarksData.leaveRecords.some(leave => {
    const status = normalizeStatusLabel(leave.leavestatus || leave.LEAVESTATUS || leave.status);
    return status === 'Approved' || status === 'For Approval';
  });
  
  const hasTravel = travelRemarksData.travelRecords && travelRemarksData.travelRecords.some(travel => {
    const status = normalizeStatusLabel(travel.travelstatus || travel.TRAVELSTATUS || travel.status);
    return status === 'Approved' || status === 'For Approval';
  });
  
  const hasCdo = cdoRemarksData.records && cdoRemarksData.records.length > 0;
  
  const remarksParts = [];
  if (hasLocator && locatorRemarks.remarks) remarksParts.push(locatorRemarks.remarks);
  if (hasLeave && leaveRemarksData.remarks) remarksParts.push(leaveRemarksData.remarks);
  if (hasTravel && travelRemarksData.remarks) remarksParts.push(travelRemarksData.remarks);
  if (hasCdo && cdoRemarksData.remarks) remarksParts.push(cdoRemarksData.remarks);
  
  return {
    hasRemarks: hasLocator || hasLeave || hasTravel || hasCdo,
    remarksText: remarksParts.join('; ')
  };
};

const LeaveDetailModal = ({ isOpen, onClose, leave, employees }) => {
  if (!isOpen || !leave) return null;

  const formatDateMMDDYYYY = (dateStr) => {
    if (!dateStr) return '';
    const trimmed = String(dateStr).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-');
      return `${month}/${day}/${year}`;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      return `${mm}/${dd}/${yyyy}`;
    }

    return trimmed;
  };

  const collectInclusiveDates = () => {
    const dates = new Set();

    if (Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
      leave.leaveDates.forEach((item) => {
        const raw = item?.LEAVEDATE || item?.leavedate || item;
        if (raw) {
          dates.add(formatDateMMDDYYYY(raw));
        }
      });
    }

    if (Array.isArray(leave.details) && leave.details.length > 0) {
      leave.details.forEach((detail) => {
        const raw = detail?.deducteddate || detail?.leavedate || detail;
        if (raw) {
          dates.add(formatDateMMDDYYYY(raw));
        }
      });
    }

    if (typeof leave.inclusivedates === 'string' && leave.inclusivedates.trim() !== '') {
      leave.inclusivedates.split(',').forEach((raw) => {
        const trimmed = raw.trim();
        if (trimmed) {
          dates.add(formatDateMMDDYYYY(trimmed));
        }
      });
    }

    if (dates.size === 0) {
      const fallback = leave.LEAVEDATE || leave.leavedate || leave.leaveDate || null;
      if (fallback) {
        dates.add(formatDateMMDDYYYY(fallback));
      }
    }

    return Array.from(dates);
  };

  const leaveNo = leave.leaveno || leave.LEAVEREFNO || leave.leaverefno || 'N/A';
  const leaveType = leave.leave_type_name || leave.LeaveName || leave.leavetype || 'N/A';
  const leaveMode = leave.deductmode || leave.mode || 'N/A';
  const normalizedStatus = normalizeStatusLabel(leave.leavestatus || leave.LEAVESTATUS || leave.status);
  const leavePurpose = leave.leavepurpose || leave.LEAVEREMARKS || leave.leaveremarks || 'No purpose provided';
  const leaveDays = leave.inclusivedates || leave.LEAVEDAYS || leave.leaveDays || leave.leavecredits || 'N/A';
  const employeeName = getEmployeeNameForLocator(leave.USERID || leave.userid || leave.user_id, employees);
  const createdBy = leave.created_by_employee_name || leave.created_by_username || leave.createdbyname || 'N/A';
  const approvedBy = leave.approved_by_employee_name || leave.approved_by_username || leave.approvedbyname || 'N/A';
  const createdDate = leave.createddate || leave.createdDate || leave.created_at || null;
  const approvedDate = leave.approveddate || leave.approvedDate || null;
  const formattedInclusiveDates = collectInclusiveDates();

  const formatDateDisplay = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return formatDateMMDDYYYY(date.toISOString().split('T')[0]);
    }
    return formatDateMMDDYYYY(value);
  };

  const statusBadgeClass = (() => {
    switch (normalizedStatus) {
      case 'For Approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Returned':
        return 'bg-blue-100 text-blue-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  })();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Leave Information</h2>
            <p className="text-sm text-gray-500 mt-1">Reference Number: {leaveNo}</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Employee</span>
                <span className="text-base font-semibold text-gray-900">{employeeName || 'N/A'}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Leave Type</span>
                <span className="text-base font-semibold text-gray-900">{leaveType}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Mode</span>
                <span className="text-base font-semibold text-gray-900">{leaveMode}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Status</span>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${statusBadgeClass}`}>
                  {normalizedStatus || 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Leave Days / Credits</span>
                <span className="text-base font-semibold text-gray-900">
                  {typeof leaveDays === 'number' ? leaveDays : String(leaveDays).trim() || 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Created Date</span>
                <span className="text-base font-semibold text-gray-900">
                  {createdDate ? formatDateDisplay(createdDate) : 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Approved Date</span>
                <span className="text-base font-semibold text-gray-900">
                  {approvedDate ? formatDateDisplay(approvedDate) : 'N/A'}
                </span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Inclusive Dates
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg min-h-[80px] text-gray-900">
              {formattedInclusiveDates.length > 0 ? formattedInclusiveDates.join(', ') : 'N/A'}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Reason / Purpose
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg min-h-[100px] text-gray-900 whitespace-pre-wrap">
              {leavePurpose}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Audit Trail
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Created By</span>
                <span className="text-base font-semibold text-gray-900">{createdBy}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <span className="block text-sm font-medium text-gray-600 mb-1">Approved By</span>
                <span className="text-base font-semibold text-gray-900">{approvedBy}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="bg-gray-100 px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

function CdoDetailModal({ isOpen, onClose, cdo }) {
  if (!isOpen || !cdo) return null;

  const toDisplay = (value) => {
    if (value === undefined || value === null) return 'N/A';
    const str = String(value).trim();
    return str || 'N/A';
  };

  const reference = toDisplay(cdo.cdono || cdo.displayRef);
  const status = toDisplay(cdo.entryStatus || 'Approved');
  const useDate = toDisplay(cdo.date || cdo.cdodate);
  const title = toDisplay(cdo.cdoTitle);
  const purpose = toDisplay(cdo.cdoPurpose);
  const description = toDisplay(cdo.cdoDescription);
  const remarks = toDisplay(cdo.cdoRemarks);
  const reason = toDisplay(cdo.entryReason);
  const employee = toDisplay(cdo.employeeName);
  const department = toDisplay(cdo.department);
  const position = toDisplay(cdo.position);
  const creditsEarned = toDisplay(cdo.creditsEarned);
  const creditsUsed = toDisplay(cdo.creditsUsed);
  const creditsUsedTotal = toDisplay(cdo.creditsUsedTotal);
  const createdBy = toDisplay(cdo.createdByName);
  const approver = toDisplay(cdo.approverName);

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
              CDO Details
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
                <span className="text-base text-gray-900 whitespace-pre-wrap">
                  {reason !== 'N/A' ? reason : remarks}
                </span>
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
}

// Helper to check if date has travel order (for days calculation)
const hasTravelOrderForDate = (travelData, dateStr, userId, employeeObjId) => {
  return hasTravelRecordForDate(travelData, dateStr, userId, employeeObjId);
};

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

// Helper to check if date has leave (for days calculation) - UPDATED for new table structure
const hasLeaveForDate = (leaveData, dateStr, userId, employeeObjId) => {
  if (!leaveData || leaveData.length === 0) {
    console.log('❌ [HAS LEAVE] No leave data available');
    return false;
  }
  
  return leaveData.some(leave => {
    const status = normalizeStatusLabel(leave.leavestatus || leave.LEAVESTATUS || leave.status);
    if (status !== 'Approved') return false;
    
    // Check if leave has leaveDates array (new structure)
    if (leave.leaveDates && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractDate(leaveDate.LEAVEDATE);
        const dateMatch = leaveDateStr === dateStr;
        const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
        return dateMatch && matchesEmployee;
      });
      
      if (hasMatchingDate) {
        return true;
      }
    }
    
    // Fallback to old structure for backward compatibility
    const leaveDate = extractDate(leave.LEAVEDATE);
    const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
    return leaveDate === dateStr && matchesEmployee;
  });
};

// Helper to check if date has OB leave (for days calculation) - UPDATED for new table structure
const hasOBLeaveForDate = (leaveData, dateStr, userId, employeeObjId) => {
  if (!leaveData || leaveData.length === 0) return false;
  
  return leaveData.some(leave => {
    // Check if leave has leaveDates array (new structure)
    if (leave.leaveDates && leave.leaveDates.length > 0) {
      const hasMatchingDate = leave.leaveDates.some(leaveDate => {
        const leaveDateStr = extractDate(leaveDate.LEAVEDATE);
        const dateMatch = leaveDateStr === dateStr;
        const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
        const isOBLeave = leave.LeaveName && leave.LeaveName.toLowerCase().includes('ob');
        return dateMatch && matchesEmployee && isOBLeave;
      });
      
      if (hasMatchingDate) {
        return true;
      }
    }
    
    // Fallback to old structure for backward compatibility
    const leaveDate = extractDate(leave.LEAVEDATE);
    const isOBLeave = leave.LeaveName && leave.LeaveName.toLowerCase().includes('ob');
    const matchesEmployee = matchesEmployeeForLeave(leave, userId, employeeObjId);
    return leaveDate === dateStr && matchesEmployee && isOBLeave;
  });
};

// Helper to check if date has travel record (for days calculation) - UPDATED for new table structure
const hasTravelRecordForDate = (travelData, dateStr, userId, employeeObjId) => {
  if (!Array.isArray(travelData) || travelData.length === 0) return false;
  
  return travelData.some(travel => {
    const status = normalizeStatusLabel(travel.travelstatus || travel.status || travel.TRAVELSTATUS);
    if (status !== 'Approved') {
      return false;
    }

    if (!travelRecordIncludesEmployee(travel, employeeObjId, userId)) {
      return false;
    }

    const dates = collectTravelDatesFromRecord(travel);
    return dates.has(dateStr);
  });
};

// Calculate days credit based on the specified logic and active columns from assigned shift
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

const calculateDays = (amCheckIn, amCheckOut, pmCheckIn, pmCheckOut, shiftSchedule = null) => {
  const activeColumns = shiftSchedule ? getActiveColumns(shiftSchedule) : {
    hasAMCheckIn: false,
    hasAMCheckOut: false,
    hasPMCheckIn: false,
    hasPMCheckOut: false
  };

  const shiftCredits = getShiftCredits(shiftSchedule);

  const hasAMCheckIn = activeColumns.hasAMCheckIn && amCheckIn && amCheckIn.trim() !== '';
  const hasAMCheckOut = activeColumns.hasAMCheckOut && amCheckOut && amCheckOut.trim() !== '';
  const hasPMCheckIn = activeColumns.hasPMCheckIn && pmCheckIn && pmCheckIn.trim() !== '';
  const hasPMCheckOut = activeColumns.hasPMCheckOut && pmCheckOut && pmCheckOut.trim() !== '';

  const isAmpmShift =
    activeColumns.hasAMCheckIn &&
    activeColumns.hasPMCheckOut &&
    !activeColumns.hasAMCheckOut &&
    !activeColumns.hasPMCheckIn;

  if (isAmpmShift) {
    const ampmCredit = Number(shiftCredits.AMPM) || 0;
    const amPortion = hasAMCheckIn ? ampmCredit / 2 : 0;
    const pmPortion = hasPMCheckOut ? ampmCredit / 2 : 0;
    return Number((amPortion + pmPortion).toFixed(2));
  }

  let totalCredit = 0;
  const amCredit = Number(shiftCredits.AM) || 0;
  const pmCredit = Number(shiftCredits.PM) || 0;

  const amComplete = hasAMCheckIn && hasAMCheckOut;
  const pmComplete = hasPMCheckIn && hasPMCheckOut;
  
  // Special case 1: AM has check-in (no check-out) AND PM is complete (has check-in and check-out)
  // Sum both AM and PM credits (full sum)
  if (hasAMCheckIn && !hasAMCheckOut && pmComplete) {
    totalCredit = amCredit + pmCredit;
    return Number(totalCredit.toFixed(2));
  }
  
  // Special case 2: AM is complete (has check-in and check-out) AND PM has check-out (no check-in)
  // Sum both AM and PM credits (full sum)
  if (amComplete && !hasPMCheckIn && hasPMCheckOut) {
    totalCredit = amCredit + pmCredit;
    return Number(totalCredit.toFixed(2));
  }
  
  // Special case 3: AM has check-out (no check-in) AND PM is complete (has check-in and check-out)
  // Sum of credits divided by 2 (half)
  if (!hasAMCheckIn && hasAMCheckOut && pmComplete) {
    totalCredit = (amCredit + pmCredit) / 2;
    return Number(totalCredit.toFixed(2));
  }
  
  // Special case 4: AM is complete (has check-in and check-out) AND PM has check-in (no check-out)
  // Sum of credits divided by 2 (half)
  if (amComplete && hasPMCheckIn && !hasPMCheckOut) {
    totalCredit = (amCredit + pmCredit) / 2;
    return Number(totalCredit.toFixed(2));
  }
  
  // Special case 5: AM has check-in (no check-out) AND PM has check-out (no check-in)
  // Sum both AM and PM credits (full sum)
  if (hasAMCheckIn && !hasAMCheckOut && !hasPMCheckIn && hasPMCheckOut) {
    totalCredit = amCredit + pmCredit;
    return Number(totalCredit.toFixed(2));
  }
  
  // Standard logic: only count if complete pairs
  if (amComplete) {
    totalCredit += amCredit;
  }

  if (pmComplete) {
    totalCredit += pmCredit;
  }

  return Number(totalCredit.toFixed(2));
};

// Helper to calculate days based on various conditions (for leave/travel/holidays)
const calculateDaysWithLeaveTravel = (amCheckIn, amCheckOut, pmCheckIn, pmCheckOut, dateStr, userId, employeeObjId, leaveData, travelData, holidayData, shiftSchedule = null, cdoUsageMap = null, fixLogsData = null, locatorData = null) => {
  // Check if it's a weekend
  const isWeekendDay = isWeekend(dateStr);
  
  // Check if it's a holiday (handles recurring holidays for past years)
  const hasHoliday = holidayData && holidayData.length > 0 && (() => {
    // Extract date safely without timezone conversion
    const targetDate = extractDateSafe(dateStr);
    if (!targetDate || targetDate.length < 10) return false;
    
    const targetMonthDay = targetDate.slice(5, 10);
    
    return holidayData.some(holiday => {
      const rawHolidayDate = holiday.HOLIDAYDATE || holiday.holidaydate || holiday.holiday_date || holiday.HolidayDate || holiday.date || '';
      const holidayDate = getHolidayDateValue(holiday);
      if (!holidayDate || holidayDate.length < 10) return false;
      
      // For recurring holidays, match by month-day (MM-DD) to work for any year
      // Extract month-day from raw date value to avoid timezone conversion issues
      if (isHolidayRecurring(holiday)) {
        let holidayMonthDay = '';
        if (rawHolidayDate) {
          let rawDateStr = '';
          
          // Handle Date objects
          if (rawHolidayDate instanceof Date) {
            // Extract date part from Date object (use UTC to avoid timezone conversion)
            const year = rawHolidayDate.getUTCFullYear();
            const month = String(rawHolidayDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(rawHolidayDate.getUTCDate()).padStart(2, '0');
            rawDateStr = `${year}-${month}-${day}`;
          } else {
            rawDateStr = String(rawHolidayDate).trim();
          }
          
          // Extract date part directly from string (YYYY-MM-DD) before 'T' or space
          const datePartMatch = rawDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (datePartMatch) {
            // Use the stored date part directly (no timezone conversion)
            holidayMonthDay = `${datePartMatch[2]}-${datePartMatch[3]}`;
          } else {
            // Fallback to normalized date if extraction fails
            holidayMonthDay = holidayDate.slice(5, 10);
          }
        } else {
          // Fallback to normalized date if no raw date available
          holidayMonthDay = holidayDate.slice(5, 10);
        }
        return holidayMonthDay === targetMonthDay;
      }
      
      // For non-recurring holidays, match by full date (YYYY-MM-DD)
      return holidayDate === targetDate;
    });
  })();
  
  // REMOVED: Leave should not automatically count as 1 day
  // Days for leave dates should be calculated based on actual time logs
  
  // If has approved travel order, count as 1 day
  if (hasTravelOrderForDate(travelData, dateStr, userId, employeeObjId)) {
    return Number(1);
  }
  
  // If has approved CDO, count as 1 day
  if (cdoUsageMap) {
    const cdoRemarksData = getCdoRemarksForDate(cdoUsageMap, dateStr);
    const hasCdo = cdoRemarksData.records && cdoRemarksData.records.length > 0;
    if (hasCdo) {
    return Number(1);
    }
  }
  
  // If has approved fix logs, count as 1 day
  if (fixLogsData && employeeObjId) {
    const { fixLog } = getFixLogsForDate(fixLogsData, dateStr, employeeObjId);
    if (fixLog) {
      const status = normalizeStatusLabel(fixLog.fixstatus || fixLog.FIXSTATUS);
      if (status === 'Approved') {
        return Number(1);
      }
    }
  }
  
  // If has approved locator, count as 1 day
  if (locatorData && userId && employeeObjId) {
    const locatorRemarks = getLocatorRemarksForDate(locatorData, dateStr, userId, employeeObjId);
    const hasApprovedLocator = locatorRemarks.locators && locatorRemarks.locators.some(loc => {
      const status = normalizeStatusLabel(loc.locstatus || loc.LOCSTATUS);
      return status === 'Approved';
    });
    if (hasApprovedLocator) {
      return Number(1);
    }
  }
  
  // Calculate based on actual time logs using the specified logic with active columns
  const timeBasedDays = calculateDays(amCheckIn, amCheckOut, pmCheckIn, pmCheckOut, shiftSchedule);
  
  // If it's a weekend or holiday with no work, count as 0
  if ((isWeekendDay || hasHoliday) && timeBasedDays === 0) {
    return Number(0);
  }
  
  // Ensure we return a number
  return Number(timeBasedDays) || 0;
};

// Generate date range array (simple implementation)
const generateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return [];

  const pad = (num) => String(num).padStart(2, '0');
  const parse = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { year: y, month: m, day: d };
  };

  const daysInMonth = (year, month) => {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  };

  const start = parse(startDate);
  const end = parse(endDate);
  if (!start.year || !end.year) return [];

  const dates = [];
  let { year, month, day } = start;

  const isBeforeOrSame = () => {
    if (year < end.year) return true;
    if (year > end.year) return false;
    if (month < end.month) return true;
    if (month > end.month) return false;
    return day <= end.day;
  };

  while (isBeforeOrSame()) {
    dates.push(`${year}-${pad(month)}-${pad(day)}`);

    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return dates;
};

// Define columns for the grid
const columns = [
  { header: 'DATE', field: 'DATE' },
  { header: 'AM-CHECKIN', field: 'AM_CHECKIN' },
  { header: 'AM-CHECKOUT', field: 'AM_CHECKOUT' },
  { header: 'PM-CHECKIN', field: 'PM_CHECKIN' },
  { header: 'PM-CHECKOUT', field: 'PM_CHECKOUT' },
  { header: 'LATE', field: 'LATE' },
  { header: 'DAYS', field: 'DAYS' },
  { header: 'REMARKS', field: 'REMARKS' },
  { header: 'ACTION', field: 'ACTION' }
];

// Group logs by date using time-based window filtering (same logic as MyShiftView)
function groupLogsByDateWithTimeWindows(
  logs,
  shiftSchedule,
  locatorData,
  leaveData,
  travelData,
  holidayData,
  cdoUsageMap,
  userId,
  employeeObjId,
  startDate,
  endDate,
  fixLogsData
) {
  // Check if shift schedule exists
  if (!shiftSchedule) {
    console.log('⚠️ No shift schedule found for processing');
    return [];
  }

  // Get active columns based on assigned shift
  const activeColumns = getActiveColumns(shiftSchedule);

  const buildWindow = (start, end, fallbackStart, fallbackEnd, hasShiftTime) => {
    // If shift doesn't have this time defined, return null window
    if (!hasShiftTime) {
      return [null, null];
    }
    const startStr = start ? extractTimeFromString(start) : null;
    const endStr = end ? extractTimeFromString(end) : null;
    if (startStr && endStr) {
      return getTimeWindow(startStr, endStr);
    }
    // Only use fallback if shift time is defined but start/end windows are missing
    if (fallbackStart && fallbackEnd) {
      return getTimeWindow(fallbackStart, fallbackEnd);
    }
    return [null, null];
  };

  const [amCheckInStartMin, amCheckInEndMin] = buildWindow(
    shiftSchedule.SHIFT_AMCHECKIN_START,
    shiftSchedule.SHIFT_AMCHECKIN_END,
    '04:00',
    '11:59',
    activeColumns.hasAMCheckIn
  );
  const [amCheckOutStartMin, amCheckOutEndMin] = buildWindow(
    shiftSchedule.SHIFT_AMCHECKOUT_START,
    shiftSchedule.SHIFT_AMCHECKOUT_END,
    '11:00',
    '12:30',
    activeColumns.hasAMCheckOut
  );
  const [pmCheckInStartMin, pmCheckInEndMin] = buildWindow(
    shiftSchedule.SHIFT_PMCHECKIN_START,
    shiftSchedule.SHIFT_PMCHECKIN_END,
    '12:31',
    '14:00',
    activeColumns.hasPMCheckIn
  );
  const [pmCheckOutStartMin, pmCheckOutEndMin] = buildWindow(
    shiftSchedule.SHIFT_PMCHECKOUT_START,
    shiftSchedule.SHIFT_PMCHECKOUT_END,
    '14:01',
    '23:59',
    activeColumns.hasPMCheckOut
  );

  console.log('⏰ Time windows (minutes):', {
    amCheckInStartMin,
    amCheckInEndMin,
    amCheckOutStartMin,
    amCheckOutEndMin,
    pmCheckInStartMin,
    pmCheckInEndMin,
    pmCheckOutStartMin,
    pmCheckOutEndMin
  });

  // Group logs by date
  const logsByDate = {};
  const cdoMap = cdoUsageMap || {};
  logs.forEach(log => {
    const date = extractDate(log.CHECKTIME || log.DATE || log.date);
    if (!date) return;
    if (!logsByDate[date]) logsByDate[date] = [];
    logsByDate[date].push(log);
  });

  // Generate all dates in range
  const allDates = generateDateRange(startDate, endDate);

  const processedRows = allDates.map(date => {
    const logsForDay = logsByDate[date] || [];

    // AM CheckIN: earliest inside AM check-in window (only if active)
    let AM_CHECKIN = '';
    if (activeColumns.hasAMCheckIn && amCheckInStartMin !== null && amCheckInEndMin !== null) {
    const amInLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, amCheckInStartMin, amCheckInEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

    if (amInLogs.length > 0) {
      AM_CHECKIN = extractTimeFromString(amInLogs[0].CHECKTIME || amInLogs[0].DATE || amInLogs[0].date);
      }
    }

    // AM CheckOUT: earliest in AM checkout window (only if active)
    let AM_CHECKOUT = '';
    if (activeColumns.hasAMCheckOut && amCheckOutStartMin !== null && amCheckOutEndMin !== null) {
    const amOutLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, amCheckOutStartMin, amCheckOutEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

    if (amOutLogs.length > 0) {
      AM_CHECKOUT = extractTimeFromString(amOutLogs[0].CHECKTIME || amOutLogs[0].DATE || amOutLogs[0].date);
      }
    }

    // PM CheckIN: earliest in PM checkin window (only if active)
    let PM_CHECKIN = '';
    if (activeColumns.hasPMCheckIn && pmCheckInStartMin !== null && pmCheckInEndMin !== null) {
    const pmInLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, pmCheckInStartMin, pmCheckInEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

    if (pmInLogs.length > 0) {
      PM_CHECKIN = extractTimeFromString(pmInLogs[0].CHECKTIME || pmInLogs[0].DATE || pmInLogs[0].date);
      }
    }

    // PM CheckOUT: latest inside PM checkout window (only if active)
    let PM_CHECKOUT = '';
    if (activeColumns.hasPMCheckOut && pmCheckOutStartMin !== null && pmCheckOutEndMin !== null) {
    const pmOutLogs = logsForDay
      .map((log) => ({
        ...log,
        _time: extractTimeFromString(log.CHECKTIME || log.DATE || log.date),
        _date: extractDate(log.CHECKTIME || log.DATE || log.date)
      }))
      .filter(log => {
        return log._time &&
          validateTimeInWindow(log._time, pmCheckOutStartMin, pmCheckOutEndMin) &&
          log._date === date;
      })
      .sort((a, b) => timeToMinutes(b._time) - timeToMinutes(a._time));

    if (pmOutLogs.length > 0) {
      PM_CHECKOUT = pmOutLogs[0]._time;
      }
    }

    // Calculate late minutes - only for active check-in columns
    let LATE = 0;
    
    // AM_CHECKIN late calculation - only if AM check-in is active
    if (activeColumns.hasAMCheckIn && AM_CHECKIN && shiftSchedule.SHIFT_AMCHECKIN) {
      const expectedAMTime = timeToMinutes(extractTimeFromString(shiftSchedule.SHIFT_AMCHECKIN));
      const actualAMTime = timeToMinutes(AM_CHECKIN);
      if (actualAMTime > expectedAMTime) {
        LATE += actualAMTime - expectedAMTime;
      }
    }
    
    // PM_CHECKIN late calculation - only if PM check-in is active
    if (activeColumns.hasPMCheckIn && PM_CHECKIN && shiftSchedule.SHIFT_PMCHECKIN) {
      const expectedPMTime = timeToMinutes(extractTimeFromString(shiftSchedule.SHIFT_PMCHECKIN));
      const actualPMTime = timeToMinutes(PM_CHECKIN);
      if (actualPMTime > expectedPMTime) {
        LATE += actualPMTime - expectedPMTime;
      }
    }
    
    // AM_CHECKOUT early penalty - if check-out is before expected time
    if (activeColumns.hasAMCheckOut && AM_CHECKOUT && shiftSchedule.SHIFT_AMCHECKOUT) {
      const expectedAMCheckOutTime = timeToMinutes(extractTimeFromString(shiftSchedule.SHIFT_AMCHECKOUT));
      const actualAMCheckOutTime = timeToMinutes(AM_CHECKOUT);
      if (actualAMCheckOutTime < expectedAMCheckOutTime) {
        const earlyMins = expectedAMCheckOutTime - actualAMCheckOutTime;
        LATE += earlyMins;
      }
    }
    
    // PM_CHECKOUT early penalty - if check-out is before expected time
    if (activeColumns.hasPMCheckOut && PM_CHECKOUT && shiftSchedule.SHIFT_PMCHECKOUT) {
      const expectedPMCheckOutTime = timeToMinutes(extractTimeFromString(shiftSchedule.SHIFT_PMCHECKOUT));
      const actualPMCheckOutTime = timeToMinutes(PM_CHECKOUT);
      if (actualPMCheckOutTime < expectedPMCheckOutTime) {
        const earlyMins = expectedPMCheckOutTime - actualPMCheckOutTime;
        LATE += earlyMins;
      }
    }

    // Calculate days using the proper function with actual time logs
    const DAYS = Number(calculateDaysWithLeaveTravel(AM_CHECKIN, AM_CHECKOUT, PM_CHECKIN, PM_CHECKOUT, date, userId, employeeObjId, leaveData, travelData, holidayData, shiftSchedule, cdoMap, fixLogsData, locatorData)) || 0;

    // REMARKS: from locator2, leave2, travel2, holiday2, plus static "Weekend", "Leave", and "Travel" indicators
    const dateObj = new Date(date);
    const isWeekendDay = isWeekend(date);
    const hasLeave = hasLeaveForDate(leaveData, date, userId, employeeObjId);
    const hasTravel = hasTravelRecordForDate(travelData, date, userId, employeeObjId);
    
    const locatorRemarks = getLocatorRemarksForDate(locatorData, date, userId, employeeObjId);
    const leaveRemarksData = getLeaveRemarksForDate(leaveData, date, userId, employeeObjId);
    const travelRemarksData = getTravelRemarksForDate(travelData, date, userId, employeeObjId);
    const cdoRemarksData = getCdoRemarksForDate(cdoMap, date);
    const cdoRecords = cdoRemarksData.records || [];
    const cdoRemarksStr = cdoRemarksData.remarks || '';
    const hasCdo = cdoRecords.length > 0;
    const holidayInfo = getHolidayDisplayForDate(holidayData, date);
    const holidaysForDate = holidayInfo?.records || [];
    const holidayNameList = holidayInfo?.names || [];
    const holidayDisplay = holidayInfo?.display || '';
    const hasWorkSuspension = !!holidayInfo?.hasWorkSuspension;
    const hasHoliday = holidayNameList.length > 0;

    // Build static remarks first
    const staticRemarks = [];

    // Calculate timeLogCount outside the if-else block so it's available for debugging
    const timeLogCount = [AM_CHECKIN, AM_CHECKOUT, PM_CHECKIN, PM_CHECKOUT].filter(log => log && log.trim() !== '').length;

    // Check if date is in the future or current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDate = new Date(date);
    currentDate.setHours(0, 0, 0, 0);
    const isFutureDate = currentDate > today;
    const isCurrentDate = currentDate.getTime() === today.getTime();

    console.log('🔍 [ABSENT DEBUG] Processing date:', date, {
      hasLeave,
      hasTravel,
      hasHoliday,
      timeLogCount,
      isFutureDate,
      isCurrentDate,
      currentDate: currentDate.toDateString(),
      today: today.toDateString(),
      timeLogs: {
        AM_CHECKIN: AM_CHECKIN || 'empty',
        AM_CHECKOUT: AM_CHECKOUT || 'empty',
        PM_CHECKIN: PM_CHECKIN || 'empty',
        PM_CHECKOUT: PM_CHECKOUT || 'empty'
      }
    });

    if (isWeekendDay) {
      staticRemarks.push('Weekend');
      console.log('🔍 [ABSENT DEBUG] Weekend detected, added "Weekend" remark');
    } else {
      // Only check for absent on weekdays (not weekends), not holidays, not future dates, and not current date
      console.log('🔍 [ABSENT DEBUG] Weekday analysis:', {
        timeLogCount,
        hasLeave,
        hasTravel,
        hasHoliday,
        isFutureDate,
        isCurrentDate,
        currentDate: currentDate.toDateString(),
        today: today.toDateString(),
        timeLogs: {
          AM_CHECKIN: AM_CHECKIN || 'empty',
          AM_CHECKOUT: AM_CHECKOUT || 'empty',
          PM_CHECKIN: PM_CHECKIN || 'empty',
          PM_CHECKOUT: PM_CHECKOUT || 'empty'
        }
      });
      
      if (!hasLeave && !hasTravel && !hasHoliday && timeLogCount === 0 && !isFutureDate && !isCurrentDate) {
        staticRemarks.push('Absent');
        console.log('✅ [ABSENT DEBUG] ABSENT CONDITION MET - Added "Absent" remark');
      } else {
        console.log('❌ [ABSENT DEBUG] Absent condition NOT met:', {
          hasLeave: hasLeave ? 'YES - has leave' : 'NO',
          hasTravel: hasTravel ? 'YES - has travel' : 'NO',
          hasHoliday: hasHoliday ? 'YES - has holiday' : 'NO',
          timeLogCount: `${timeLogCount} logs (need 0 for absent)`,
          isFutureDate: isFutureDate ? 'YES - future date' : 'NO',
          isCurrentDate: isCurrentDate ? 'YES - current date' : 'NO',
          condition: `!hasLeave(${!hasLeave}) && !hasTravel(${!hasTravel}) && !hasHoliday(${!hasHoliday}) && timeLogCount===0(${timeLogCount === 0}) && !isFutureDate(${!isFutureDate}) && !isCurrentDate(${!isCurrentDate})`
        });
      }
    }

    console.log('🔍 [ABSENT DEBUG] Final staticRemarks:', staticRemarks);

    // Combine static remarks with dynamic remarks - FIXED: extract remarks string from locatorRemarks object
    const dynamicRemarks = [
      locatorRemarks.remarks,
      leaveRemarksData.remarks,
      travelRemarksData.remarks,
      cdoRemarksStr
    ].filter(Boolean);
    
    // Fix logs remarks - only add if no other remarks exist (travel, leave, cdo, locator)
    const hasOtherRemarks = dynamicRemarks.length > 0;
    const fixLogsRemarks = hasOtherRemarks ? '' : getFixLogsRemarksForDate(fixLogsData, date, employeeObjId);
    
    const allRemarks = [...staticRemarks, ...dynamicRemarks];
    if (fixLogsRemarks) {
      allRemarks.push(fixLogsRemarks);
    }

    console.log('🔍 [ABSENT DEBUG] Remarks combination for date', date, {
      staticRemarks,
      dynamicRemarks: {
        locator: locatorRemarks.remarks || 'empty',
        leave: leaveRemarksData.remarks || 'empty',
        travel: travelRemarksData.remarks || 'empty',
        cdo: cdoRemarksStr || 'empty'
      },
      allRemarks
    });

    let finalRemarks = '';
    if (allRemarks.length > 0) {
      finalRemarks = allRemarks.join('; ');
    }

    console.log('🔍 [ABSENT DEBUG] Final remarks for date', date, ':', finalRemarks);

    console.log('🔍 [ABSENT DEBUG] Leave/Travel check for date', date, {
      hasLeave,
      hasTravel,
      leaveDataLength: leaveData?.length,
      travelDataLength: travelData?.length
    });

    // Update the remarks section debugging (around line 750-770)
    console.log('🔍 [ABSENT DEBUG] Weekday analysis:', {
      date,
      timeLogCount,
      hasLeave,
      hasTravel,
      hasHoliday,
      isFutureDate: dateObj > today,
      currentDateObj: dateObj,
      todayObj: today,
      currentDateString: dateObj.toDateString(),
      todayString: today.toDateString(),
      comparison: `${dateObj.getTime()} > ${today.getTime()} = ${dateObj > today}`,
      timeLogs: {
        AM_CHECKIN: AM_CHECKIN || 'empty',
        AM_CHECKOUT: AM_CHECKOUT || 'empty', 
        PM_CHECKIN: PM_CHECKIN || 'empty',
        PM_CHECKOUT: PM_CHECKOUT || 'empty'
      }
    });

    return {
      DATE: formatDateDisplay(date),
      DATE_RAW: date,
      AM_CHECKIN,
      AM_CHECKOUT,
      PM_CHECKIN,
      PM_CHECKOUT,
      LATE,
      DAYS,
      REMARKS: finalRemarks,
      REMARKS_DATA: {
        locatorRecords: locatorRemarks.locators || [],
        leaveRecords: leaveRemarksData.leaveRecords || [],
        travelRecords: travelRemarksData.travelRecords || [],
        cdoRecords,
        holidayRecords: holidaysForDate,
        fixLogRecords: (() => {
          const { fixLog } = getFixLogsForDate(fixLogsData, date, employeeObjId);
          return fixLog ? [fixLog] : [];
        })()
      },
      isWeekend: isWeekendDay,
      hasHoliday: hasHoliday,
      hasCdo,
      holidayNames: holidayNameList,
      holidayDisplay,
      cdoRemarks: cdoRemarksStr,
      hasWorkSuspension
    };
  });

  const afterLocatorBackfill = applyLocatorBackfillToTimeLogs(processedRows, locatorData, shiftSchedule);
  return applyFixLogsToTimeLogs(afterLocatorBackfill, fixLogsData, employeeObjId);
}

// Generate time options based on shift schedule (FIXED LOGIC)
const generateTimeOptions = (locatorType, shiftSchedule) => {
  console.log('🔍 generateTimeOptions called with:', { locatorType, shiftSchedule });
  
  if (!locatorType || !shiftSchedule || locatorType === 'OB') {
    console.log('❌ No valid data, returning full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Normalize locator type (remove underscores if present)
  const normalizedType = locatorType.replace(/_/g, '');
  console.log('�� Normalized locator type:', normalizedType);

  // Log all available fields in shiftSchedule
  console.log('📋 Available shift schedule fields:', Object.keys(shiftSchedule));

  // Get time range based on locator type from shiftSchedule
  let startTime, endTime;
  switch (normalizedType) {
    case 'AMCHECKIN':
      startTime = shiftSchedule.SHIFT_AMCHECKIN_START || shiftSchedule.SHIFT_AMCHECKIN_START_TIME;
      endTime = shiftSchedule.SHIFT_AMCHECKIN_END || shiftSchedule.SHIFT_AMCHECKIN_END_TIME;
      break;
    case 'AMCHECKOUT':
      startTime = shiftSchedule.SHIFT_AMCHECKOUT_START || shiftSchedule.SHIFT_AMCHECKOUT_START_TIME;
      endTime = shiftSchedule.SHIFT_AMCHECKOUT_END || shiftSchedule.SHIFT_AMCHECKOUT_END_TIME;
      break;
    case 'PMCHECKIN':
      startTime = shiftSchedule.SHIFT_PMCHECKIN_START || shiftSchedule.SHIFT_PMCHECKIN_START_TIME;
      endTime = shiftSchedule.SHIFT_PMCHECKIN_END || shiftSchedule.SHIFT_PMCHECKIN_END_TIME;
      break;
    case 'PMCHECKOUT':
      startTime = shiftSchedule.SHIFT_PMCHECKOUT_START || shiftSchedule.SHIFT_PMCHECKOUT_START_TIME;
      endTime = shiftSchedule.SHIFT_PMCHECKOUT_END || shiftSchedule.SHIFT_PMCHECKOUT_END_TIME;
      break;
    default:
      console.log('❌ Unknown locator type:', locatorType, 'Normalized:', normalizedType);
      return {
        hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
        minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
      };
  }

  console.log(`⏰ Raw time range for ${normalizedType}:`, { startTime, endTime });

  if (!startTime || !endTime) {
    console.log('❌ No time range found, using full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Extract time strings without timezone conversion
  const startTimeStr = extractTimeFromString(startTime);
  const endTimeStr = extractTimeFromString(endTime);
  
  console.log(`⏰ Extracted time strings for ${normalizedType}:`, { startTimeStr, endTimeStr });

  if (!startTimeStr || !endTimeStr) {
    console.log('❌ Could not extract time strings, using full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Parse start and end hours using the fixed parseHour function
  const startHour = parseHour(startTime);
  const endHour = parseHour(endTime);

  console.log(`📊 Parsed hours for ${normalizedType}:`, { startHour, endHour });

  // Generate hours within the range
  const hours = [];
  if (startHour <= endHour) {
    // Same day range (e.g., 08:00 to 12:00)
    for (let i = startHour; i <= endHour; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
  } else {
    // Cross-day range (e.g., 22:00 to 06:00)
    for (let i = startHour; i <= 23; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
    for (let i = 0; i <= endHour; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
  }

  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  console.log(`✅ Generated time options for ${normalizedType}:`, { hours, minutes });

  return { hours, minutes };
};

// Enhanced time range validation functions
const validateTimeInRange = (timeStr, startTime, endTime) => {
  if (!timeStr || !startTime || !endTime) return true; // Allow if no constraints
  
  const timeMinutes = timeToMinutes(timeStr);
  const startMinutes = timeToMinutes(extractTimeFromString(startTime) || startTime);
  const endMinutes = timeToMinutes(extractTimeFromString(endTime) || endTime);
  
  if (startMinutes <= endMinutes) {
    // Same day range (e.g., 08:00 to 12:00)
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  } else {
    // Cross-day range (e.g., 22:00 to 06:00)
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
  }
};

const getTimeRangeForLocatorType = (locatorType, shiftSchedule) => {
  if (!locatorType || !shiftSchedule) return { start: null, end: null };
  
  const normalizedType = locatorType.replace(/_/g, '');
  
  let startTime, endTime;
  switch (normalizedType) {
    case 'AMCHECKIN':
      startTime = shiftSchedule.SHIFT_AMCHECKIN_START || shiftSchedule.SHIFT_AMCHECKIN_START_TIME;
      endTime = shiftSchedule.SHIFT_AMCHECKIN_END || shiftSchedule.SHIFT_AMCHECKIN_END_TIME;
      break;
    case 'AMCHECKOUT':
      startTime = shiftSchedule.SHIFT_AMCHECKOUT_START || shiftSchedule.SHIFT_AMCHECKOUT_START_TIME;
      endTime = shiftSchedule.SHIFT_AMCHECKOUT_END || shiftSchedule.SHIFT_AMCHECKOUT_END_TIME;
      break;
    case 'PMCHECKIN':
      startTime = shiftSchedule.SHIFT_PMCHECKIN_START || shiftSchedule.SHIFT_PMCHECKIN_START_TIME;
      endTime = shiftSchedule.SHIFT_PMCHECKIN_END || shiftSchedule.SHIFT_PMCHECKIN_END_TIME;
      break;
    case 'PMCHECKOUT':
      startTime = shiftSchedule.SHIFT_PMCHECKOUT_START || shiftSchedule.SHIFT_PMCHECKOUT_START_TIME;
      endTime = shiftSchedule.SHIFT_PMCHECKOUT_END || shiftSchedule.SHIFT_PMCHECKOUT_END_TIME;
      break;
    default:
      return { start: null, end: null };
  }
  
  // Extract time strings for display without timezone conversion
  const startTimeStr = extractTimeFromString(startTime) || startTime;
  const endTimeStr = extractTimeFromString(endTime) || endTime;
  
  return { start: startTimeStr, end: endTimeStr };
};

// Generate time options for departure based on shift schedule (AM_CHECKIN_START to PM_CHECKOUT_END)
const generateDepartureTimeOptions = (shiftSchedule) => {
  console.log('🔍 generateDepartureTimeOptions called with:', { shiftSchedule });
  
  if (!shiftSchedule) {
    console.log('❌ No shift schedule, returning full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Get AM_CHECKIN_START and PM_CHECKOUT_END times
  const amCheckInStart = shiftSchedule.SHIFT_AMCHECKIN_START || shiftSchedule.SHIFT_AMCHECKIN_START_TIME;
  const pmCheckOutEnd = shiftSchedule.SHIFT_PMCHECKOUT_END || shiftSchedule.SHIFT_PMCHECKOUT_END_TIME;
  
  console.log('⏰ Departure time range:', { amCheckInStart, pmCheckOutEnd });

  if (!amCheckInStart || !pmCheckOutEnd) {
    console.log('❌ Missing time range, returning full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Extract time strings
  const startTimeStr = extractTimeFromString(amCheckInStart);
  const endTimeStr = extractTimeFromString(pmCheckOutEnd);
  
  console.log('⏰ Extracted time strings:', { startTimeStr, endTimeStr });

  if (!startTimeStr || !endTimeStr) {
    console.log('❌ Could not extract time strings, using full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Parse start and end hours
  const startHour = parseHour(startTimeStr);
  const endHour = parseHour(endTimeStr);

  console.log('📊 Parsed hours for departure:', { startHour, endHour });

  // Generate hours within the range
  const hours = [];
  if (startHour <= endHour) {
    // Same day range (e.g., 08:00 to 17:00)
    for (let i = startHour; i <= endHour; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
  } else {
    // Cross-day range (e.g., 22:00 to 06:00)
    for (let i = startHour; i <= 23; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
    for (let i = 0; i <= endHour; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
  }

  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  console.log('✅ Generated departure time options:', { hours, minutes });

  return { hours, minutes };
};

// Generate time options for arrival based on shift schedule (AM_CHECKIN_START to PM_CHECKOUT_END)
const generateArrivalTimeOptions = (shiftSchedule) => {
  console.log('🔍 generateArrivalTimeOptions called with:', { shiftSchedule });
  
  if (!shiftSchedule) {
    console.log('❌ No shift schedule, returning full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Get AM_CHECKIN_START and PM_CHECKOUT_END times
  const amCheckInStart = shiftSchedule.SHIFT_AMCHECKIN_START || shiftSchedule.SHIFT_AMCHECKIN_START_TIME;
  const pmCheckOutEnd = shiftSchedule.SHIFT_PMCHECKOUT_END || shiftSchedule.SHIFT_PMCHECKOUT_END_TIME;
  
  console.log('⏰ Arrival time range:', { amCheckInStart, pmCheckOutEnd });

  if (!amCheckInStart || !pmCheckOutEnd) {
    console.log('❌ Missing time range, returning full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Extract time strings
  const startTimeStr = extractTimeFromString(amCheckInStart);
  const endTimeStr = extractTimeFromString(pmCheckOutEnd);
  
  console.log('⏰ Extracted time strings for arrival:', { startTimeStr, endTimeStr });

  if (!startTimeStr || !endTimeStr) {
    console.log('❌ Could not extract time strings, using full 24 hours');
    return {
      hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
      minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    };
  }

  // Parse start and end hours
  const startHour = parseHour(startTimeStr);
  const endHour = parseHour(endTimeStr);

  console.log('📊 Parsed hours for arrival:', { startHour, endHour });

  // Generate hours within the range
  const hours = [];
  if (startHour <= endHour) {
    // Same day range (e.g., 08:00 to 17:00)
    for (let i = startHour; i <= endHour; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
  } else {
    // Cross-day range (e.g., 22:00 to 06:00)
    for (let i = startHour; i <= 23; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
    for (let i = 0; i <= endHour; i++) {
      hours.push(i.toString().padStart(2, '0'));
    }
  }

  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  console.log('✅ Generated arrival time options:', { hours, minutes });

  return { hours, minutes };
};

// Enhanced Locator Form Component with new schema structure
const LocatorForm = ({ isOpen, onClose, onSubmit, date, columnType, employee, shiftSchedule }) => {
  const [formData, setFormData] = useState({
    LOCNO: '',
    LOCUSERID: '',
    LOCDATE: '',
    LOCDESTINATION: '',
    LOCPURPOSE: '',
    LOCTIMEDEPARTURE: '',
    LOCTIMEARRIVAL: '',
    LOCENTRYBY: '1',
    LOCENTRYDATE: '',
    LOCSTATUS: 'ACTIVE'
  });
  const [loading, setLoading] = useState(false);
  const [departureTimeOptions, setDepartureTimeOptions] = useState({
    hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
  });
  const [arrivalTimeOptions, setArrivalTimeOptions] = useState({
    hours: Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')),
    minutes: Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
  });
  const [timeValidationError, setTimeValidationError] = useState('');
  const [error, setError] = useState(null);
  const [existingTimeLogs, setExistingTimeLogs] = useState(null);
  const [loadingTimeLogs, setLoadingTimeLogs] = useState(false);

  // Separate function specifically for getting existing time logs for locator form
  const getExistingTimeLogsForLocator = async (userId, locatorDate) => {
    try {
      setLoadingTimeLogs(true);
      console.log('🔍 [LOCATOR FORM] Getting existing time logs for:', { userId, locatorDate });
      
      // Use the new locator form specific endpoint
      const response = await api.get('/dtr/logs/locator', {
        params: {
          userId: userId,
          date: locatorDate
        }
      });
      
      console.log('🔍 [LOCATOR FORM] DTR logs response:', response.data);
      
      if (response.data && response.data.length > 0) {
        // Process the raw CHECKINOUT data using simple chronological logic
        const processedLogs = processLogsForLocatorFormSimple(response.data, locatorDate, shiftSchedule);
        
        console.log('🔍 [LOCATOR FORM] Processed logs:', processedLogs);
        
        if (processedLogs) {
          setExistingTimeLogs(processedLogs);
        } else {
          setExistingTimeLogs(null);
        }
      } else {
        console.log('🔍 [LOCATOR FORM] No time logs found for this date');
        setExistingTimeLogs(null);
      }
    } catch (error) {
      console.error('Error getting existing time logs for locator:', error);
      setExistingTimeLogs(null);
    } finally {
      setLoadingTimeLogs(false);
    }
  };

  // Updated function that uses the same grouping logic as the main grid
  const processLogsForLocatorFormSimple = (logs, dateStr, shiftSchedule) => {
    if (!logs || logs.length === 0) return null;

    console.log('🔍 [LOCATOR FORM] Processing logs for date:', dateStr);
    console.log('🔍 [LOCATOR FORM] Raw logs:', logs);
    console.log('🔍 [LOCATOR FORM] Shift schedule:', shiftSchedule);

    const logsForDay = logs.filter(log => {
      const logDate = extractDate(log.CHECKTIME || log.DATE || log.date);
      return logDate === dateStr;
    });

    if (logsForDay.length === 0) {
      console.log('🔍 [LOCATOR FORM] No logs found for date:', dateStr);
      return null;
    }

    console.log('🔍 [LOCATOR FORM] Logs for day:', logsForDay);

    // Get active columns based on assigned shift
    const activeColumns = getActiveColumns(shiftSchedule);

    const buildWindow = (start, end, fallbackStart, fallbackEnd, hasShiftTime) => {
      // If shift doesn't have this time defined, return null window
      if (!hasShiftTime) {
        return [null, null];
      }
      const startStr = start ? extractTimeFromString(start) : null;
      const endStr = end ? extractTimeFromString(end) : null;
      if (startStr && endStr) {
        return getTimeWindow(startStr, endStr);
      }
      // Only use fallback if shift time is defined but start/end windows are missing
      if (fallbackStart && fallbackEnd) {
        return getTimeWindow(fallbackStart, fallbackEnd);
      }
      return [null, null];
    };

    const [amCheckInStartMin, amCheckInEndMin] = buildWindow(
      shiftSchedule?.SHIFT_AMCHECKIN_START,
      shiftSchedule?.SHIFT_AMCHECKIN_END,
      '04:00',
      '11:59',
      activeColumns.hasAMCheckIn
    );
    const [amCheckOutStartMin, amCheckOutEndMin] = buildWindow(
      shiftSchedule?.SHIFT_AMCHECKOUT_START,
      shiftSchedule?.SHIFT_AMCHECKOUT_END,
      '11:00',
      '12:30',
      activeColumns.hasAMCheckOut
    );
    const [pmCheckInStartMin, pmCheckInEndMin] = buildWindow(
      shiftSchedule?.SHIFT_PMCHECKIN_START,
      shiftSchedule?.SHIFT_PMCHECKIN_END,
      '12:31',
      '14:00',
      activeColumns.hasPMCheckIn
    );
    const [pmCheckOutStartMin, pmCheckOutEndMin] = buildWindow(
      shiftSchedule?.SHIFT_PMCHECKOUT_START,
      shiftSchedule?.SHIFT_PMCHECKOUT_END,
      '14:01',
      '23:59',
      activeColumns.hasPMCheckOut
    );

    // AM CheckIN: earliest inside check-in window (only if active)
    let AM_CHECKIN = '';
    if (activeColumns.hasAMCheckIn && amCheckInStartMin !== null && amCheckInEndMin !== null) {
    const amInLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, amCheckInStartMin, amCheckInEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

    if (amInLogs.length > 0) {
      AM_CHECKIN = extractTimeFromString(amInLogs[0].CHECKTIME || amInLogs[0].DATE || amInLogs[0].date);
      }
    }

    // AM CheckOUT: earliest in AM checkout window (only if active)
    let AM_CHECKOUT = '';
    if (activeColumns.hasAMCheckOut && amCheckOutStartMin !== null && amCheckOutEndMin !== null) {
    const amOutLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, amCheckOutStartMin, amCheckOutEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

    if (amOutLogs.length > 0) {
      AM_CHECKOUT = extractTimeFromString(amOutLogs[0].CHECKTIME || amOutLogs[0].DATE || amOutLogs[0].date);
      }
    }

    // PM CheckIN: earliest in PM checkin window (only if active)
    let PM_CHECKIN = '';
    if (activeColumns.hasPMCheckIn && pmCheckInStartMin !== null && pmCheckInEndMin !== null) {
    const pmInLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, pmCheckInStartMin, pmCheckInEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

    if (pmInLogs.length > 0) {
      PM_CHECKIN = extractTimeFromString(pmInLogs[0].CHECKTIME || pmInLogs[0].DATE || pmInLogs[0].date);
      }
    }

    // PM CheckOUT: latest inside checkout window (only if active)
    let PM_CHECKOUT = '';
    if (activeColumns.hasPMCheckOut && pmCheckOutStartMin !== null && pmCheckOutEndMin !== null) {
    const pmOutLogs = logsForDay
      .filter(log => {
        const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
        return t && validateTimeInWindow(t, pmCheckOutStartMin, pmCheckOutEndMin);
      })
      .sort((a, b) => timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)) - timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)));

    if (pmOutLogs.length > 0) {
      PM_CHECKOUT = extractTimeFromString(pmOutLogs[0].CHECKTIME || pmOutLogs[0].DATE || pmOutLogs[0].date);
      }
    }

    const result = {
      AM_CHECKIN,
      AM_CHECKOUT,
      PM_CHECKIN,
      PM_CHECKOUT
    };

    console.log(' [LOCATOR FORM] Final result:', result);

    return result;
  };

  // Function to generate LOCNO with new logic - UPDATED to use standardized format YYMMDD+LE(prefix)+001(Seqno)
  const generateLocatorNumber = async () => {
    try {
      // Use the locator date instead of current date
      const locatorDate = new Date(date);
      const year = locatorDate.getFullYear().toString().slice(-2); // YY format
      const month = String(locatorDate.getMonth() + 1).padStart(2, '0'); // MM format
      const day = String(locatorDate.getDate()).padStart(2, '0'); // DD format (locator date)
      
      // Create prefix in format YYMMDD
      const datePrefix = `${year}${month}${day}`;
      
      console.log(' Generating locator number for:', { year, month, day, locatorDate: date });
      console.log('🔍 API call parameters:', { 
        year: locatorDate.getFullYear(), 
        month: locatorDate.getMonth() + 1 
      });
      
      // Get the count of records for this year-month (based on locator date)
      const response = await api.get('/locator/count', {
        params: {
          year: locatorDate.getFullYear(),
          month: locatorDate.getMonth() + 1
        }
      });
      
      console.log('📊 Count response:', response);
      console.log('📊 Response data:', response.data);
      console.log('📊 Response status:', response.status);
      
      if (response.data && response.data.success) {
        const currentCount = response.data.count || 0;
        const sequenceNumber = String(currentCount + 1).padStart(3, '0'); // 3-digit sequence number
        
        // Create final reference number: YYMMDD+LE(prefix)+001(Seqno)
        const locNo = `${datePrefix}LE-${sequenceNumber}`;
        console.log(`✅ Generated locator number: ${locNo} (found ${currentCount} existing records for ${year}-${month})`);
        return locNo;
      } else {
        console.error('❌ API response not successful:', response.data);
        throw new Error(`API returned unsuccessful response: ${response.data?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error generating locator number:', error);
      console.error('❌ Error details:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Error message:', error.message);
      
      // Fallback: Use a simple counter based on current time
      const locatorDate = new Date(date);
      const year = locatorDate.getFullYear().toString().slice(-2);
      const month = String(locatorDate.getMonth() + 1).padStart(2, '0');
      const day = String(locatorDate.getDate()).padStart(2, '0');
      
      // Create prefix in format YYMMDD
      const datePrefix = `${year}${month}${day}`;
      
      // Use milliseconds to create a unique but sequential-looking number
      const fallbackSeq = String(Math.floor(Date.now() / 1000) % 1000).padStart(3, '0');
      const fallbackLocNo = `${datePrefix}LE-${fallbackSeq}`;
      
      console.log('⚠️ Using fallback locator number:', fallbackLocNo);
      return fallbackLocNo;
    }
  };

  useEffect(() => {
    console.log(' LocatorForm useEffect triggered:', { isOpen, employee, date, columnType, shiftSchedule });
    
    if (isOpen && employee && date && shiftSchedule) {
      // Use the separate function to get existing time logs
      getExistingTimeLogsForLocator(employee.USERID, date);

      // Generate time options based on shift schedule
      const departureOptions = generateDepartureTimeOptions(shiftSchedule);
      const arrivalOptions = generateArrivalTimeOptions(shiftSchedule);
      
      setDepartureTimeOptions(departureOptions);
      setArrivalTimeOptions(arrivalOptions);

      console.log('✅ Generated time options for form:', { departureOptions, arrivalOptions });

      // Generate locator number and set form data
      const initializeForm = async () => {
        const locNo = await generateLocatorNumber();
        
        setFormData({
          LOCNO: locNo,
          LOCUSERID: employee.USERID,
          LOCDATE: date,
          LOCDESTINATION: '',
          LOCPURPOSE: '',
          LOCTIMEDEPARTURE: '',
          LOCTIMEARRIVAL: '',
          LOCENTRYBY: '1',
          LOCENTRYDATE: new Date().toISOString(),
          LOCSTATUS: 'ACTIVE'
        });
      };

      initializeForm();
      
      // Clear any previous validation errors
      setTimeValidationError('');
      setError(null);
    }
  }, [isOpen, employee, date, columnType, shiftSchedule]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user changes input
    if (field === 'LOCTIMEDEPARTURE' || field === 'LOCTIMEARRIVAL') {
      setTimeValidationError('');
    }
    setError(null);
  };

  const handleTimeChange = useCallback((type, value, timeField) => {
    const currentTime = formData[timeField] || '';
    const [currentHours, currentMinutes] = currentTime.split(':');

    let newHours = currentHours || '';
    let newMinutes = currentMinutes || '';

    if (type === 'hours') {
      newHours = value;
    } else if (type === 'minutes') {
      newMinutes = value;
    }

    let timeValue = '';
    if (newHours && newMinutes) {
      timeValue = `${newHours}:${newMinutes}`;
    } else if (newHours) {
      timeValue = `${newHours}:`;
    } else if (newMinutes) {
      timeValue = `:${newMinutes}`;
    }

    setFormData(prev => ({ ...prev, [timeField]: timeValue }));
    setError(null);
  }, [formData]);

  const parseTime = useCallback((timeString) => {
    if (!timeString) return { hours: '', minutes: '' };
    const [hours, minutes] = timeString.split(':');
    return { hours: hours || '', minutes: minutes || '' };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.LOCUSERID) {
      setError('Employee is required.');
      return;
    }

    if (!formData.LOCDATE) {
      setError('Date is required.');
      return;
    }

    if (!formData.LOCDESTINATION) {
      setError('Destination is required.');
      return;
    }

    if (!formData.LOCPURPOSE) {
      setError('Purpose is required.');
      return;
    }

    // Validate time format if provided
    if (formData.LOCTIMEDEPARTURE && !/^\d{2}:\d{2}$/.test(formData.LOCTIMEDEPARTURE)) {
      setTimeValidationError('Time departure must be in HH:MM format');
      return;
    }

    if (formData.LOCTIMEARRIVAL && !/^\d{2}:\d{2}$/.test(formData.LOCTIMEARRIVAL)) {
      setTimeValidationError('Time arrival must be in HH:MM format');
      return;
    }

    setLoading(true);
    setError(null);
    setTimeValidationError('');

    // Save time values as they are inputted (HH:MM format) without conversion
    const submitData = {
      ...formData,
      LOCTIMEDEPARTURE: formData.LOCTIMEDEPARTURE || null,
      LOCTIMEARRIVAL: formData.LOCTIMEARRIVAL || null,
      LOCENTRYDATE: new Date().toISOString()
    };

    console.log(' Submitting locator data:', submitData);

    try {
      await onSubmit(submitData);
      onClose();
    } catch (error) {
      console.error('Error saving locator entry:', error);
      setError('Error saving locator entry');
    } finally {
      setLoading(false);
    }
  };

  const departureTimeValues = parseTime(formData.LOCTIMEDEPARTURE);
  const arrivalTimeValues = parseTime(formData.LOCTIMEARRIVAL);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Add Locator Entry
        </h3>

        {/* Error Display */}
        {error && (
          <div className={`mb-4 p-3 rounded-md ${
            error.includes('Error') || error.includes('already has') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {error}
          </div>
        )}

        {/* Existing Time Logs Display - Blue Text Styling */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-md font-semibold text-blue-600 mb-3">Existing Time Logs for {date}</h4>
          {loadingTimeLogs ? (
            <div className="text-center py-2">
              <p className="text-blue-500">Loading time logs...</p>
            </div>
          ) : existingTimeLogs ? (
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="font-semibold text-blue-600">AM-CHECKIN</div>
                <div className="text-lg font-mono bg-white p-2 rounded border text-blue-600">
                  {existingTimeLogs.AM_CHECKIN || '--:--'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">AM-CHECKOUT</div>
                <div className="text-lg font-mono bg-white p-2 rounded border text-blue-600">
                  {existingTimeLogs.AM_CHECKOUT || '--:--'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">PM-CHECKIN</div>
                <div className="text-lg font-mono bg-white p-2 rounded border text-blue-600">
                  {existingTimeLogs.PM_CHECKIN || '--:--'}
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">PM-CHECKOUT</div>
                <div className="text-lg font-mono bg-white p-2 rounded border text-blue-600">
                  {existingTimeLogs.PM_CHECKOUT || '--:--'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-blue-500">No time logs found for this date</p>
            </div>
          )}
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Locator Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Locator Number
              </label>
              <input
                type="text"
                value={formData.LOCNO}
                onChange={(e) => handleInputChange('LOCNO', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                readOnly
              />
              <p className="text-xs text-gray-500 mt-1">
                Auto-generated: YY-MM-DD-seqno format
              </p>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Locator Date *
              </label>
              <input
                type="date"
                value={formData.LOCDATE}
                onChange={(e) => handleInputChange('LOCDATE', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-700 cursor-not-allowed"
                readOnly
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Automatically set based on selected row date
              </p>
            </div>
          </div>

          {/* Employee - Full Width */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Employee *
            </label>
            <input
              type="text"
              value={employee ? `${employee.NAME} (${employee.BADGENUMBER})` : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-700 cursor-not-allowed"
              readOnly
            />
          </div>

          {/* Destination - Full Width */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination
            </label>
            <textarea
              value={formData.LOCDESTINATION}
              onChange={(e) => handleInputChange('LOCDESTINATION', e.target.value)}
              placeholder="Enter destination"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              maxLength={50}
            />
            <div className="mt-1 text-xs text-gray-500">
              {/* LOCREMARKS field has been removed */}
            </div>
          </div>

          {/* Purpose - Full Width */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purpose
            </label>
            <textarea
              value={formData.LOCPURPOSE}
              onChange={(e) => handleInputChange('LOCPURPOSE', e.target.value)}
              placeholder="Enter purpose"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              maxLength={100}
            />
            <div className="mt-1 text-xs text-gray-500">
              {formData.LOCPURPOSE.length}/100 characters
            </div>
          </div>

          {/* Time Departure and Time Arrival - Inline */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Time Departure */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Departure
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">at</span>
                <select
                  value={departureTimeValues.hours}
                  onChange={(e) => handleTimeChange('hours', e.target.value, 'LOCTIMEDEPARTURE')}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">HH</option>
                  {departureTimeOptions.hours.map(hour => (
                    <option key={hour} value={hour}>{hour}</option>
                  ))}
                </select>
                <span className="text-gray-500">:</span>
                <select
                  value={departureTimeValues.minutes}
                  onChange={(e) => handleTimeChange('minutes', e.target.value, 'LOCTIMEDEPARTURE')}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">MM</option>
                  {departureTimeOptions.minutes.map(minute => (
                    <option key={minute} value={minute}>{minute}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Time Arrival */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Arrival
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">at</span>
                <select
                  value={arrivalTimeValues.hours}
                  onChange={(e) => handleTimeChange('hours', e.target.value, 'LOCTIMEARRIVAL')}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">HH</option>
                  {arrivalTimeOptions.hours.map(hour => (
                    <option key={hour} value={hour}>{hour}</option>
                  ))}
                </select>
                <span className="text-gray-500">:</span>
                <select
                  value={arrivalTimeValues.minutes}
                  onChange={(e) => handleTimeChange('minutes', e.target.value, 'LOCTIMEARRIVAL')}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">MM</option>
                  {arrivalTimeOptions.minutes.map(minute => (
                    <option key={minute} value={minute}>{minute}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Form Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Locator Entry'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Utility functions (moved outside component)
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

const normalizeLocatorDateTime = (value) => {
  if (!value) {
    return { date: '', time: '', minutes: null };
  }

  const strValue = typeof value === 'string' ? value : String(value);
  const date = extractDate(strValue);
  const time = extractTime(strValue);
  const minutes = time ? timeToMinutes(time) : null;

  return { date, time, minutes };
};

const getApprovedLocatorWindowsForDate = (locatorRecords, dateStr) => {
  if (!Array.isArray(locatorRecords) || !dateStr) return [];

  return locatorRecords
    .filter((locator) => {
      const status = normalizeStatusLabel(locator.locstatus || locator.LOCSTATUS);
      if (status !== 'Approved') {
        return false;
      }

      const locatorDate = extractDate(locator.locatordate || locator.LOCDATE);
      return locatorDate === dateStr;
    })
    .map((locator) => {
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

const applyLocatorBackfillToTimeLogs = (processedRows, locatorRecords, shiftSchedule) => {
  if (!Array.isArray(processedRows) || !locatorRecords || !shiftSchedule) {
    return processedRows;
  }

  const scheduleTimeMap = {
    AM_CHECKIN: shiftSchedule.SHIFT_AMCHECKIN ? extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN) : '',
    AM_CHECKOUT: shiftSchedule.SHIFT_AMCHECKOUT ? extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKOUT) : '',
    PM_CHECKIN: shiftSchedule.SHIFT_PMCHECKIN ? extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN) : '',
    PM_CHECKOUT: shiftSchedule.SHIFT_PMCHECKOUT ? extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKOUT) : ''
  };

  const scheduleMinutesMap = {
    AM_CHECKIN: scheduleTimeMap.AM_CHECKIN ? timeToMinutes(scheduleTimeMap.AM_CHECKIN) : null,
    AM_CHECKOUT: scheduleTimeMap.AM_CHECKOUT ? timeToMinutes(scheduleTimeMap.AM_CHECKOUT) : null,
    PM_CHECKIN: scheduleTimeMap.PM_CHECKIN ? timeToMinutes(scheduleTimeMap.PM_CHECKIN) : null,
    PM_CHECKOUT: scheduleTimeMap.PM_CHECKOUT ? timeToMinutes(scheduleTimeMap.PM_CHECKOUT) : null
  };

  const fieldMappings = [
    { field: 'AM_CHECKIN', scheduleKey: 'AM_CHECKIN' },
    { field: 'AM_CHECKOUT', scheduleKey: 'AM_CHECKOUT' },
    { field: 'PM_CHECKIN', scheduleKey: 'PM_CHECKIN' },
    { field: 'PM_CHECKOUT', scheduleKey: 'PM_CHECKOUT' }
  ];

  return processedRows.map((row) => {
    if (!row || !row.DATE_RAW) {
      return row;
    }

    const locatorWindows = getApprovedLocatorWindowsForDate(locatorRecords, row.DATE_RAW);
    if (locatorWindows.length === 0) {
      return row;
    }

    const updatedRow = { ...row };
    const backfillMap = { ...(row.LOCATOR_BACKFILL || {}) };

    fieldMappings.forEach(({ field, scheduleKey }) => {
      const currentValue = updatedRow[field];
      const normalizedValue = typeof currentValue === 'string' ? currentValue.trim() : '';
      const hasExisting = normalizedValue !== '' && normalizedValue !== '-';
      const scheduleTime = scheduleTimeMap[scheduleKey];
      const scheduleMinutes = scheduleMinutesMap[scheduleKey];

      // If no schedule time or minutes, preserve existing flag or set to false
      if (!scheduleTime || scheduleMinutes === null) {
        backfillMap[field] = backfillMap[field] || false;
        return;
      }

      // If time value already exists, check if it matches the schedule time (indicating locator backfill)
      // and preserve the existing flag if it was already set
      if (hasExisting) {
        // If the existing value matches the schedule time, it's likely a locator backfill
        // Preserve the existing flag if it was already set to true
        if (backfillMap[field] === true) {
          // Keep it as true - it was already marked as locator backfill
          return;
        }
        // If the existing value matches schedule time but flag wasn't set, check if it should be
        if (normalizedValue === scheduleTime) {
          // Check if schedule time is within locator window
          const withinWindow = locatorWindows.some((window) => {
            if (window.startMinutes == null || window.endMinutes == null) return false;
            return scheduleMinutes >= window.startMinutes && scheduleMinutes <= window.endMinutes;
          });
          if (withinWindow) {
            backfillMap[field] = true;
          } else {
            backfillMap[field] = backfillMap[field] || false;
          }
        } else {
          // Existing value doesn't match schedule - not a locator backfill
          backfillMap[field] = false;
        }
        return;
      }

      // No existing value - check if we should backfill
      const withinWindow = locatorWindows.some((window) => {
        if (window.startMinutes == null || window.endMinutes == null) return false;
        return scheduleMinutes >= window.startMinutes && scheduleMinutes <= window.endMinutes;
      });

      if (withinWindow) {
        updatedRow[field] = scheduleTime;
        backfillMap[field] = true;
      } else {
        backfillMap[field] = backfillMap[field] || false;
      }
    });

    updatedRow.LOCATOR_BACKFILL = backfillMap;
    return updatedRow;
  });
};

// Helper to apply fix logs to time logs - only if no locator backfill exists
const applyFixLogsToTimeLogs = (processedRows, fixLogsData, employeeObjId) => {
  if (!Array.isArray(processedRows) || !fixLogsData || fixLogsData.length === 0) {
    return processedRows;
  }

  return processedRows.map((row) => {
    if (!row || !row.DATE_RAW) {
      return row;
    }

    // Check if locator backfill exists - if yes, skip fix logs (locator takes precedence)
    const hasLocatorBackfill = row.LOCATOR_BACKFILL && (
      row.LOCATOR_BACKFILL.AM_CHECKIN ||
      row.LOCATOR_BACKFILL.AM_CHECKOUT ||
      row.LOCATOR_BACKFILL.PM_CHECKIN ||
      row.LOCATOR_BACKFILL.PM_CHECKOUT
    );

    if (hasLocatorBackfill) {
      return row;
    }

    const { fixLog } = getFixLogsForDate(fixLogsData, row.DATE_RAW, employeeObjId);
    if (!fixLog) {
      return row;
    }

    const status = normalizeStatusLabel(fixLog.fixstatus || fixLog.FIXSTATUS);
    
    // Only override time values if status is "Approved"
    if (status !== 'Approved') {
      // For "For Approval" status, just track the fix log without overriding
      return {
        ...row,
        FIX_LOG: fixLog,
        FIX_LOG_STATUS: status
      };
    }

    const updatedRow = { ...row };
    const fixLogBackfill = {};

    // Override time values with fix log values (if not empty/null)
    const fieldMappings = [
      { rowField: 'AM_CHECKIN', fixLogField: 'am_checkin' },
      { rowField: 'AM_CHECKOUT', fixLogField: 'am_checkout' },
      { rowField: 'PM_CHECKIN', fixLogField: 'pm_checkin' },
      { rowField: 'PM_CHECKOUT', fixLogField: 'pm_checkout' }
    ];
    
    fieldMappings.forEach(({ rowField, fixLogField }) => {
      const fixLogValue = fixLog[fixLogField] || fixLog[fixLogField.toUpperCase()] || '';
      
      if (fixLogValue && fixLogValue.trim() !== '' && fixLogValue !== '-') {
        // Normalize time value to HH:mm format
        const normalizedTime = extractTimeFromString(fixLogValue);
        if (normalizedTime) {
          updatedRow[rowField] = normalizedTime;
          fixLogBackfill[rowField] = true;
        } else {
          fixLogBackfill[rowField] = false;
        }
      } else {
        fixLogBackfill[rowField] = false;
      }
    });

    updatedRow.FIX_LOG_BACKFILL = fixLogBackfill;
    updatedRow.FIX_LOG = fixLog;
    updatedRow.FIX_LOG_STATUS = status;

    return updatedRow;
  });
};

function TimeLogsManagement() {
  console.log('🔄 [TIME LOGS] Component rendered');
  
  const navigate = useNavigate();
  const { can, loading: permissionsLoading } = usePermissions();
  const primaryComponentId = 'manage-time-logs';
  const legacyComponentId = 'manage-checktime'; // fallback identifier used elsewhere
  const canReadTimeLogs = can(primaryComponentId, 'read') || can(legacyComponentId, 'read');
  const canCreateTimeLogs = can(primaryComponentId, 'create') || can(legacyComponentId, 'create');
  const canUpdateTimeLogs = can(primaryComponentId, 'update') || can(legacyComponentId, 'update');
  const canDeleteTimeLogs = can(primaryComponentId, 'delete') || can(legacyComponentId, 'delete');
  
  // RBAC for Fix Time functionality
  const fixTimeComponentId = 'dtr-fix-checktimes';
  const canCreateFixLogs = can(fixTimeComponentId, 'create');
  
  const [search, setSearch] = useState('');
  const [viewType, setViewType] = useState('Shift Sched'); // 'Shift Sched' | 'Raw Logs'
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const firstDay = new Date(year, month - 1, 1);
    return firstDay.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, month, 0);
    return lastDay.toISOString().split('T')[0];
  });
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  
  // Now we can safely log selectedEmployee
  console.log('🔄 [TIME LOGS] Current selectedEmployee:', selectedEmployee);
  
  // Internal state for logs and employees
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  const [employeeShiftSchedule, setEmployeeShiftSchedule] = useState(null);
  const [selectedEmployeeObjId, setSelectedEmployeeObjId] = useState(null);
  const [locatorData, setLocatorData] = useState([]);
  const [leaveData, setLeaveData] = useState([]);
  const [travelData, setTravelData] = useState([]);
  const [holidayData, setHolidayData] = useState([]); // Add holiday data state
  const [cdoUsageByDate, setCdoUsageByDate] = useState({});
  const [fixLogsData, setFixLogsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const derivedShiftMode = useMemo(() => {
    if (!employeeShiftSchedule) return 'STANDARD';
    const assignedModes = Array.isArray(employeeShiftSchedule.assignedShifts)
      ? employeeShiftSchedule.assignedShifts
          .map((shift) => (shift.shiftMode || shift.period || '').toString().toUpperCase())
          .filter(Boolean)
      : [];
    if (assignedModes.includes('AMPM')) {
      return 'AMPM';
    }
    const hasAMCheckInField = !!employeeShiftSchedule.SHIFT_AMCHECKIN;
    const hasAMCheckOutField = !!employeeShiftSchedule.SHIFT_AMCHECKOUT;
    const hasPMCheckInField = !!employeeShiftSchedule.SHIFT_PMCHECKIN;
    const hasPMCheckOutField = !!employeeShiftSchedule.SHIFT_PMCHECKOUT;
    if (hasAMCheckInField && hasPMCheckOutField && !hasAMCheckOutField && !hasPMCheckInField) {
      return 'AMPM';
    }
    return 'STANDARD';
  }, [employeeShiftSchedule]);

  const isAmpmShift = derivedShiftMode === 'AMPM';

  // Locator form state
  const [locatorFormOpen, setLocatorFormOpen] = useState(false);
  const [locatorFormData, setLocatorFormData] = useState({
    date: '',
    columnType: '',
    employee: null
  });
  const [fixTimeModalOpen, setFixTimeModalOpen] = useState(false);
  const [fixTimeModalRow, setFixTimeModalRow] = useState(null);
  const [fixTimeForm, setFixTimeForm] = useState(emptyFixForm);
  const [fixTimeExistingRecord, setFixTimeExistingRecord] = useState(null);
  const [fixTimeLoading, setFixTimeLoading] = useState(false);
  const [fixTimeSaving, setFixTimeSaving] = useState(false);
  const [fixTimeError, setFixTimeError] = useState('');

  // For printing
  const printRef = useRef();
  
  // Fetch employees (MySQL HR201 employees table)
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const fetchEmployees = async () => {
      try {
        const response = await api.get('/201-employees');
        const rawEmployees = response.data?.data || [];
        const mapped = rawEmployees.map((emp) => {
          const surname = emp.surname ? emp.surname.trim() : '';
          const firstname = emp.firstname ? emp.firstname.trim() : '';
          const middlename = emp.middlename ? emp.middlename.trim() : '';
          const extension = emp.extension ? emp.extension.trim() : '';
          const nameParts = [
            surname,
            firstname && (middlename || extension) ? `${firstname}` : firstname,
          ].filter(Boolean);

          const fullName = formatEmployeeName(surname, firstname, middlename, extension);

          return {
            USERID: emp.dtruserid || null,
            BADGENUMBER: emp.dtrbadgenumber || emp.idno || '',
            SSN: emp.idno || '',
            DEPARTMENT: emp.department_name || emp.departmentname || '',
            DEPARTMENT_ID: emp.deptid || null,
            POSITION: emp.position_title || emp.position || '',
            PHOTO: emp.photo_path || null,
            EMP_OBJID: emp.objid || null,
            RAW: emp,
            NAME: fullName || emp.fullname || nameParts.join(' ').trim() || 'Unnamed Employee',
          };
        });

        setEmployees(mapped);
        console.log('✅ [TIME LOGS] Employees (MySQL) loaded:', mapped.length);
      } catch (error) {
        console.error('❌ [TIME LOGS] Error loading employees from MySQL:', error);
        setEmployees([]);
      }
    };
    fetchEmployees();
  }, [canReadTimeLogs]);
  
  // Fetch logs when employee or date range changes
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const fetchLogs = async () => {
      if (!selectedEmployee) {
        setLogs([]);
        return;
      }
      
      try {
        setLoading(true);
        console.log('🔍 [TIME LOGS] Fetching logs for employee:', selectedEmployee.USERID, 'from:', startDate, 'to:', endDate);
        const response = await api.get(`/logs/${selectedEmployee.USERID}`, {
          params: { startDate, endDate }
        });
        setLogs(response.data || []);
        console.log('✅ [TIME LOGS] Logs loaded:', response.data?.length);
      } catch (error) {
        console.error('❌ [TIME LOGS] Error loading logs:', error);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [selectedEmployee, startDate, endDate, canReadTimeLogs]);

  // Debug: log raw logs and locatorData
  useEffect(() => {
    console.log('DEBUG: logs:', logs);
  }, [logs]);
  useEffect(() => {
    console.log('DEBUG: locatorData:', locatorData);
  }, [locatorData]);

  // Fetch shift schedule for the selected employee
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const fetchSchedule = async () => {
      if (!selectedEmployee?.USERID) {
        setEmployeeShiftSchedule(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        console.log('📅 Fetching shift schedule for USERID:', selectedEmployee.USERID);
        const shiftData = await getEmployeeShiftSchedule(selectedEmployee.USERID);
        console.log('📅 Extracted shift data:', shiftData);
        setEmployeeShiftSchedule(shiftData);
        setSelectedEmployeeObjId(shiftData?.employeeObjId || null);
      } catch (error) {
        console.error('❌ Error fetching shift schedule:', error);
        setEmployeeShiftSchedule(null);
        setError('Failed to fetch shift schedule');
        setSelectedEmployeeObjId(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [selectedEmployee?.USERID, canReadTimeLogs]);

  // Fetch locator data for the selected employee (MySQL employee_locators)
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const fetchLocatorData = async () => {
      if (!selectedEmployeeObjId) {
        setLocatorData([]);
        return;
      }
      try {
        const params = { emp_objid: selectedEmployeeObjId };
        if (startDate) params.from = startDate;
        if (endDate) params.to = endDate;
        const res = await api.get('/employee-locators', { params });
        const records = res.data?.data || res.data || [];
        setLocatorData(Array.isArray(records) ? records : []);
        console.log('✅ [TIME LOGS] Locator data (MySQL):', records.length);
      } catch (err) {
        setLocatorData([]);
        console.error('❌ [TIME LOGS] Failed to fetch locator data from MySQL', err);
      }
    };
    fetchLocatorData();
  }, [selectedEmployeeObjId, startDate, endDate, canReadTimeLogs]);

  // Load leave data from employee_leave_trans tables
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const loadLeaveData = async () => {
      if (!selectedEmployeeObjId) {
        setLeaveData([]);
        return;
      }
      try {
        console.log('🚀 [TIME LOGS] Loading leave data for emp_objid:', selectedEmployeeObjId);
        const response = await api.get(`/employee-leave-transactions/${selectedEmployeeObjId}`);
        const records = response.data || [];
        const normalizedRecords = (Array.isArray(records) ? records : []).map((record) => {
          const leaveDates = [];

          if (Array.isArray(record.details) && record.details.length > 0) {
            record.details.forEach((detail) => {
              if (detail?.deducteddate) {
                leaveDates.push({
                  LEAVEDATE: detail.deducteddate,
                  LEAVEDETAIL: detail.deductedcredit ?? null
                });
              }
            });
          }

          if (typeof record.leave_dates === 'string' && record.leave_dates.trim() !== '') {
            record.leave_dates.split(',').forEach((rawDate) => {
              const trimmed = rawDate.trim();
              if (trimmed && !leaveDates.some((item) => extractDate(item.LEAVEDATE) === extractDate(trimmed))) {
                leaveDates.push({
                  LEAVEDATE: trimmed,
                  LEAVEDETAIL: null
                });
              }
            });
          }

          const normalizedStatus = normalizeStatusLabel(record.leavestatus || record.status);
          const primaryDate = leaveDates.length > 0 ? leaveDates[0].LEAVEDATE : record.LEAVEDATE;

          return {
            ...record,
            leavestatus: normalizedStatus,
            status: normalizedStatus,
            leaveDates,
            LEAVEDATE: primaryDate || null,
            LEAVEREFNO: record.LEAVEREFNO || record.leaveno || record.leaverefno || null,
            emp_objid: record.emp_objid ?? selectedEmployeeObjId,
            USERID: record.USERID ?? record.userid ?? record.user_id ?? null
          };
        });

        setLeaveData(normalizedRecords);
        console.log('✅ [TIME LOGS] Leave data (MySQL) loaded:', normalizedRecords.length);
      } catch (error) {
        console.error('❌ [TIME LOGS] Error loading leave data from MySQL:', error);
        setLeaveData([]);
      }
    };

    loadLeaveData();
  }, [selectedEmployeeObjId, canReadTimeLogs]);

  // Load travel data from employee_travels tables
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const loadTravelData = async () => {
      if (!selectedEmployee && !selectedEmployeeObjId) {
        setTravelData([]);
        return;
      }
      try {
        const participantUserId = selectedEmployee?.USERID;
        const participantEmpObjId = selectedEmployeeObjId;

        if (!participantUserId && !participantEmpObjId) {
          setTravelData([]);
          return;
        }

        const response = await api.get('/employee-travels/transactions', {
          params: {
            participant: participantUserId,
            emp_objid: participantEmpObjId
          }
        });
        const records = response.data?.data || [];
        setTravelData(Array.isArray(records) ? records : []);
        console.log('✅ [TIME LOGS] Travel data (MySQL) loaded:', Array.isArray(records) ? records.length : 0);
      } catch (error) {
        console.error('❌ [TIME LOGS] Error loading travel data from MySQL:', error);
        setTravelData([]);
      }
    };

    loadTravelData();
  }, [selectedEmployee, selectedEmployeeObjId, canReadTimeLogs]);

  // Fetch fix logs data from employee_fixchecktimes
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const fetchFixLogsData = async () => {
      if (!selectedEmployeeObjId) {
        setFixLogsData([]);
        return;
      }
      try {
        const params = { emp_objid: selectedEmployeeObjId };
        if (startDate) params.dateFrom = startDate;
        if (endDate) params.dateTo = endDate;
        const response = await api.get('/dtr-fix-checktime', { params });
        const records = response.data?.data || response.data || [];
        setFixLogsData(Array.isArray(records) ? records : []);
        console.log('✅ [TIME LOGS] Fix logs data loaded:', Array.isArray(records) ? records.length : 0);
      } catch (error) {
        console.error('❌ [TIME LOGS] Error loading fix logs data:', error);
        setFixLogsData([]);
      }
    };
    fetchFixLogsData();
  }, [selectedEmployeeObjId, startDate, endDate, canReadTimeLogs]);

  // Load holiday data (HOLIDAY NOTIFICATION ONLY)
  useEffect(() => {
    if (!canReadTimeLogs) return;
    const loadHolidayData = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const response = await api.get('/dtr-holidays');
        if (response.data.success) {
          const records = Array.isArray(response.data.data) ? response.data.data : [];
          const filteredRecords = records.filter((holiday) => {
            const dateValue = getHolidayDateValue(holiday);
            if (!dateValue) return isHolidayRecurring(holiday);
            const holidayYear = dateValue.slice(0, 4);
            const isRecurring = isHolidayRecurring(holiday);
            const isCurrentYear = holidayYear === String(currentYear);
            const shouldInclude = isCurrentYear || isRecurring;
            
            // Debug logging for recurring holidays
            if (isRecurring) {
              const rawDate = holiday.HOLIDAYDATE || holiday.holidaydate || holiday.holiday_date || holiday.HolidayDate || holiday.date || '';
              console.log('📅 [HOLIDAY LOAD] Recurring holiday processed:', {
                name: getHolidayNameValue(holiday),
                rawDate,
                normalizedDate: dateValue,
                monthDay: dateValue ? dateValue.slice(5, 10) : 'N/A',
                year: holidayYear,
                currentYear: String(currentYear),
                included: shouldInclude
              });
            }
            
            return shouldInclude;
          });
          setHolidayData(filteredRecords);
          
          const recurringCount = filteredRecords.filter(h => isHolidayRecurring(h)).length;
          
          // Debug: Check what field names exist for recurring flag
          if (filteredRecords.length > 0) {
            const firstHoliday = filteredRecords[0];
            console.log('🔍 [HOLIDAY DEBUG] Sample holiday object keys:', {
              keys: Object.keys(firstHoliday),
              isrecurring: firstHoliday.isrecurring,
              isRecurring: firstHoliday.isRecurring,
              ISRECURRING: firstHoliday.ISRECURRING,
              is_recurring: firstHoliday.is_recurring,
              recurring: firstHoliday.recurring,
              isHolidayRecurring: isHolidayRecurring(firstHoliday)
            });
          }
          
          console.log('✅ Holiday data loaded from MySQL:', {
            total: filteredRecords.length,
            rawTotal: records.length,
            recurringCount: recurringCount,
            currentYearCount: filteredRecords.filter(h => {
              const dateValue = getHolidayDateValue(h);
              return dateValue && dateValue.slice(0, 4) === String(currentYear);
            }).length
          });
        } else {
          console.log('❌ Holiday API response not successful:', response.data);
          setHolidayData([]);
        }
      } catch (error) {
        console.error('❌ Error loading holiday data:', error);
        setHolidayData([]);
      }
    };

    loadHolidayData();
  }, [canReadTimeLogs]);

  useEffect(() => {
    if (!canReadTimeLogs) return;
    const loadCdoUsage = async () => {
      if (!selectedEmployeeObjId) {
        setCdoUsageByDate({});
        return;
      }
      try {
        const params = { includeEntries: 1, emp_objid: selectedEmployeeObjId };
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
          employeeObjId: selectedEmployeeObjId
        });
        setCdoUsageByDate(usageMap);
        console.log('✅ [TIME LOGS] CDO usage entries loaded:', Object.keys(usageMap).length);
      } catch (error) {
        console.error('❌ [TIME LOGS] Error loading CDO data:', error);
        setCdoUsageByDate({});
      }
    };

    loadCdoUsage();
  }, [selectedEmployeeObjId, startDate, endDate, canReadTimeLogs]);

  // Add this right after the selectedEmployee state declaration
  useEffect(() => {
    console.log('🔄 [TIME LOGS] Test useEffect - this should run on every render');
  }, []);

  // Add this to track selectedEmployee changes
  useEffect(() => {
    console.log('🔄 [TIME LOGS] selectedEmployee dependency changed:', selectedEmployee);
  }, [selectedEmployee]);

  // Filter locatorData for current user
  const filteredLocatorData = useMemo(() => {
    return Array.isArray(locatorData) ? locatorData : [];
  }, [locatorData]);

  // Process logs for grid and export (group by date, extract/check-in/out, late, days, remarks)
  const processedLogs = useMemo(() => {
    if (!selectedEmployee || !employeeShiftSchedule) return [];
    return groupLogsByDateWithTimeWindows(
      logs,
      employeeShiftSchedule,
      locatorData,
      leaveData,
      travelData,
      holidayData,
      cdoUsageByDate,
      selectedEmployee?.USERID,
      selectedEmployeeObjId,
      startDate,
      endDate,
      fixLogsData
    );
  }, [logs, employeeShiftSchedule, locatorData, leaveData, travelData, holidayData, cdoUsageByDate, selectedEmployee, selectedEmployeeObjId, startDate, endDate, fixLogsData]);

  // Fetch employees (MySQL HR201 employees table)

  // Filter employees based on search
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const term = search.toLowerCase();
    return employees.filter(emp => {
      const name = typeof emp.NAME === 'string' ? emp.NAME.toLowerCase() : '';
      const badge = emp.BADGENUMBER !== undefined && emp.BADGENUMBER !== null
        ? String(emp.BADGENUMBER).toLowerCase()
        : '';
      const ssn = emp.SSN !== undefined && emp.SSN !== null
        ? String(emp.SSN).toLowerCase()
        : '';
      const dept = typeof emp.DEPARTMENT === 'string' ? emp.DEPARTMENT.toLowerCase() : '';

      return (
        name.includes(term) ||
        badge.includes(term) ||
        ssn.includes(term) ||
        dept.includes(term)
      );
    });
  }, [employees, search]);

  // Handle employee selection
  const handleEmployeeSelect = async (employee) => {
    setSelectedEmployee(employee);
    setSelectedEmployeeObjId(employee?.EMP_OBJID || null);
    setSearch('');
    setError(null);
    
    if (employee) {
      const defaultStartDate = startDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = endDate || new Date().toISOString().split('T')[0];
      // Data will refresh automatically via useEffect when selectedEmployee, startDate, or endDate changes
      if (!startDate) setStartDate(defaultStartDate);
      if (!endDate) setEndDate(defaultEndDate);
    }
  };

  // Handle date changes
  const handleDateChange = (type, value) => {
    if (type === 'start') {
      setStartDate(value);
    } else if (type === 'end') {
      setEndDate(value);
    } else if (type === 'month') {
      setSelectedMonth(value);
      // Auto-calculate start and end dates for the selected month
      const monthRange = getMonthDateRange(value);
      setStartDate(monthRange.startDate);
      setEndDate(monthRange.endDate);
    }
    
    if (selectedEmployee && value) {
      let actualStartDate, actualEndDate;
      
      if (type === 'month') {
        const monthRange = getMonthDateRange(value);
        actualStartDate = monthRange.startDate;
        actualEndDate = monthRange.endDate;
      } else {
        actualStartDate = type === 'start' ? value : startDate;
        actualEndDate = type === 'end' ? value : endDate;
      }
      
      if (actualStartDate && actualEndDate) {
        // Data will refresh automatically via useEffect when startDate or endDate changes
        setStartDate(actualStartDate);
        setEndDate(actualEndDate);
      }
    }
  };

  // Handle locator form submission
  const handleLocatorSubmit = async (formData) => {
    if (!canCreateTimeLogs && !canUpdateTimeLogs) {
      alert('You do not have permission to add locator entries.');
      return;
    }
    try {
      setLoading(true);
      await api.post('/locator', formData);
      
      // Refresh locator data
      const res = await api.get('/locator', {
        params: {
          employeeId: selectedEmployee.USERID,
          dateFrom: startDate,
          dateTo: endDate
        }
      });
      setLocatorData(res.data.data || res.data || []);
      
      // Refresh logs to reflect the new locator entry
      // Data will refresh automatically via useEffect when locatorData changes
    } catch (error) {
      console.error('Error adding locator entry:', error);
      setError('Failed to add locator entry');
    } finally {
      setLoading(false);
    }
  };

  // Open locator form
const openLocatorForm = (date, columnType) => {
  if (!canCreateTimeLogs && !canUpdateTimeLogs) {
    alert('You do not have permission to add locator entries.');
    return;
  }
  // Convert column field name to locator type format
  const locatorType = columnType.replace(/_/g, ''); // Remove underscores
  
  setLocatorFormData({
    date,
    columnType: locatorType, // Use the converted locator type
    employee: selectedEmployee
  });
  setLocatorFormOpen(true);
};

  const getActiveEmployeeObjId = () => {
    return (
      selectedEmployeeObjId ||
      selectedEmployee?.EMP_OBJID ||
      selectedEmployee?.emp_objid ||
      selectedEmployee?.employee_objid ||
      selectedEmployee?.objid ||
      selectedEmployee?.OBJID ||
      selectedEmployee?.RAW?.objid ||
      null
    );
  };

  const deriveFixLogDate = (row) => {
    if (!row) return '';
    return (
      extractDate(row?.DATE_RAW) ||
      extractDate(row?.DATE) ||
      extractDate(row?.date) ||
      ''
    );
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
        // No existing record - form already has current log values from openFixTimeModal
        // Don't overwrite them
      }
    } catch (error) {
      console.error('Error loading fix record:', error);
      setFixTimeError('Failed to load existing fix log.');
    } finally {
      setFixTimeLoading(false);
    }
  };

  const openFixTimeModal = (row) => {
    // Check RBAC permission
    if (!canCreateFixLogs) {
      window.alert('You do not have permission to create fix time entries.');
      return;
    }
    
    if (!selectedEmployee) {
      window.alert('Please select an employee first.');
      return;
    }
    const empObjId = getActiveEmployeeObjId();
    if (!empObjId) {
      window.alert('Selected employee record is missing an ObjID required for Fix Time entry.');
      return;
    }
    const normalizedDate = deriveFixLogDate(row);
    if (!normalizedDate) {
      window.alert('Selected log does not have a valid date.');
      return;
    }

    setFixTimeModalRow({ ...row, normalizedDate });
    
    // Use the EXACT same extraction logic as Current Logs display
    const amCheckInRaw = row?.AM_CHECKIN || row?.amCheckIn || '-';
    const amCheckOutRaw = row?.AM_CHECKOUT || row?.amCheckOut || '-';
    const pmCheckInRaw = row?.PM_CHECKIN || row?.pmCheckIn || '-';
    const pmCheckOutRaw = row?.PM_CHECKOUT || row?.pmCheckOut || '-';
    
    // Normalize the values (convert '-' to empty string, and format HH:mm:ss to HH:mm)
    const amCheckInNormalized = amCheckInRaw === '-' ? '' : normalizeFixTimeValue(amCheckInRaw);
    const amCheckOutNormalized = amCheckOutRaw === '-' ? '' : normalizeFixTimeValue(amCheckOutRaw);
    const pmCheckInNormalized = pmCheckInRaw === '-' ? '' : normalizeFixTimeValue(pmCheckInRaw);
    const pmCheckOutNormalized = pmCheckOutRaw === '-' ? '' : normalizeFixTimeValue(pmCheckOutRaw);
    
    console.log('🔍 [TimeLogsManagement] Setting form with Current Logs values:', {
      amCheckInRaw,
      amCheckOutRaw,
      pmCheckInRaw,
      pmCheckOutRaw,
      amCheckInNormalized,
      amCheckOutNormalized,
      pmCheckInNormalized,
      pmCheckOutNormalized,
      rowObject: row
    });
    
    setFixTimeForm({
      emp_objid: empObjId,
      checktimedate: normalizedDate,
      am_checkin: amCheckInNormalized,
      am_checkout: amCheckOutNormalized,
      pm_checkin: pmCheckInNormalized,
      pm_checkout: pmCheckOutNormalized,
      remarks: ''
    });
    setFixTimeExistingRecord(null);
    setFixTimeError('');
    setFixTimeModalOpen(true);
    loadExistingFixRecord(empObjId, normalizedDate);
  };

  const closeFixTimeModal = () => {
    setFixTimeModalOpen(false);
    setFixTimeModalRow(null);
    setFixTimeExistingRecord(null);
    setFixTimeForm(emptyFixForm);
    setFixTimeError('');
    setFixTimeLoading(false);
    setFixTimeSaving(false);
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
    } catch (err) {
      console.error('Error saving fix log:', err);
      setFixTimeError(err.response?.data?.message || 'Failed to save fix log.');
    } finally {
      setFixTimeSaving(false);
    }
  };

  // Helper function to get shift name for display
  const getShiftDisplayName = () => {
    if (employeeShiftSchedule && employeeShiftSchedule.SHIFTNAME) {
      return employeeShiftSchedule.SHIFTNAME;
    }
    if (selectedEmployee && selectedEmployee.InheritDeptSchClass) {
      return `Shift #${selectedEmployee.InheritDeptSchClass}`;
    }
    return 'No Schedule Assigned';
  };

  // Helper to get shift time values for display
  const getShiftTimeDisplay = () => {
    if (!employeeShiftSchedule) return null;
    return (
      <div className="text-xs text-blue-700 mt-1">
        AM In: {extractTime(employeeShiftSchedule.SHIFT_AMCHECKIN)} | AM Out: {extractTime(employeeShiftSchedule.SHIFT_AMCHECKOUT)} | PM In: {extractTime(employeeShiftSchedule.SHIFT_PMCHECKIN)} | PM Out: {extractTime(employeeShiftSchedule.SHIFT_PMCHECKOUT)}
      </div>
    );
  };

  // Helper to check if date has holiday (for time column annotation)
  const hasHolidayForDate = (holidayData, dateStr) => {
    if (!holidayData || holidayData.length === 0 || !dateStr) return false;
    
    // Extract date safely without timezone conversion
    const targetDate = extractDateSafe(dateStr);
    if (!targetDate || targetDate.length < 10) return false;
    
    const targetMonthDay = targetDate.slice(5, 10);
    
    return holidayData.some(holiday => {
      const rawHolidayDate = holiday.HOLIDAYDATE || holiday.holidaydate || holiday.holiday_date || holiday.HolidayDate || holiday.date || '';
      const holidayDate = getHolidayDateValue(holiday);
      if (!holidayDate || holidayDate.length < 10) return false;
      
      // For recurring holidays, match by month-day (MM-DD) to work for any year
      // Extract month-day from raw date value to avoid timezone conversion issues
      if (isHolidayRecurring(holiday)) {
        let holidayMonthDay = '';
        if (rawHolidayDate) {
          let rawDateStr = '';
          
          // Handle Date objects
          if (rawHolidayDate instanceof Date) {
            // Extract date part from Date object (use UTC to avoid timezone conversion)
            const year = rawHolidayDate.getUTCFullYear();
            const month = String(rawHolidayDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(rawHolidayDate.getUTCDate()).padStart(2, '0');
            rawDateStr = `${year}-${month}-${day}`;
          } else {
            rawDateStr = String(rawHolidayDate).trim();
          }
          
          // Extract date part directly from string (YYYY-MM-DD) before 'T' or space
          const datePartMatch = rawDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (datePartMatch) {
            // Use the stored date part directly (no timezone conversion)
            holidayMonthDay = `${datePartMatch[2]}-${datePartMatch[3]}`;
          } else {
            // Fallback to normalized date if extraction fails
            holidayMonthDay = holidayDate.slice(5, 10);
          }
        } else {
          // Fallback to normalized date if no raw date available
          holidayMonthDay = holidayDate.slice(5, 10);
        }
        return holidayMonthDay === targetMonthDay;
      }
      
      // For non-recurring holidays, match by full date (YYYY-MM-DD)
      return holidayDate === targetDate;
    });
  };

  // Helper function to check if any time logs are missing for a specific date
const hasMissingTimeLogs = (row, shiftSchedule) => {
  if (!shiftSchedule) return false;
  
  const hasAMCheckIn = row.AM_CHECKIN && row.AM_CHECKIN.trim() !== '';
  const hasAMCheckOut = row.AM_CHECKOUT && row.AM_CHECKOUT.trim() !== '';
  const hasPMCheckIn = row.PM_CHECKIN && row.PM_CHECKIN.trim() !== '';
  const hasPMCheckOut = row.PM_CHECKOUT && row.PM_CHECKOUT.trim() !== '';
  
  // Check if any of the required time logs are missing
  return !hasAMCheckIn || !hasAMCheckOut || !hasPMCheckIn || !hasPMCheckOut;
};

  // --- Print Logic (unchanged) ---
  const handlePrint = () => {
    if (printRef.current) {
      const printContents = printRef.current.innerHTML;
      const win = window.open('', '', 'height=700,width=900');
      win.document.write('<html><head><title>Print Time Logs</title>');
      win.document.write('<style>table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:center;}th{background:#f3f4f6;} .header-info{margin-bottom:16px;} .footer-totals{font-weight:bold;background:#e0e7ff;}</style>');
      win.document.write('</head><body>');
      win.document.write(printContents);
      win.document.write('</body></html>');
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }
  };

  // Calculate totals for footer
  const totalLate = processedLogs.reduce((sum, log) => sum + (Number(log.LATE) || 0), 0);
  const totalDays = processedLogs.reduce((sum, log) => sum + (Number(log.DAYS) || 0), 0);

  // Add state for locator modal
  const [showLocatorModal, setShowLocatorModal] = useState(false);
  const [selectedLocator, setSelectedLocator] = useState(null);

  // Function to open locator details modal
  const openLocatorModal = (locator) => {
    setSelectedLocator(locator);
    setShowLocatorModal(true);
  };

  // Function to close locator modal
  const closeLocatorModal = () => {
    setShowLocatorModal(false);
    setSelectedLocator(null);
  };

  // Function to handle remarks cell click - UPDATED to handle Travel and Leave
  const handleRemarksClick = (remarksData, dateStr, userId) => {
    if (!remarksData) return;
    
    // Check for leave records
    if (remarksData.leaveRecords && remarksData.leaveRecords.length > 0) {
      const firstLeave = remarksData.leaveRecords[0];
      openLeaveModal(firstLeave);
      return;
    }
    
    // Check for travel records
    if (remarksData.travelRecords && remarksData.travelRecords.length > 0) {
      const firstTravel = remarksData.travelRecords[0];
      openTravelModal(firstTravel);
      return;
    }

    if (remarksData.cdoRecords && remarksData.cdoRecords.length > 0) {
      const firstCdo = remarksData.cdoRecords[0];
      openCdoModal(firstCdo);
      return;
    }
    
    // Check for locator records
    if (remarksData.locatorRecords && remarksData.locatorRecords.length > 0) {
      const firstLocator = remarksData.locatorRecords[0];
      openLocatorModal(firstLocator);
      return;
    }
  };

  // Add state for travel and leave modals
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [selectedTravel, setSelectedTravel] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showCdoModal, setShowCdoModal] = useState(false);
  const [selectedCdo, setSelectedCdo] = useState(null);

  // Function to open travel details modal
  const openTravelModal = (travel) => {
    setSelectedTravel(travel);
    setShowTravelModal(true);
  };

  // Function to close travel modal
  const closeTravelModal = () => {
    setShowTravelModal(false);
    setSelectedTravel(null);
  };

  // Function to open leave details modal
  const openLeaveModal = (leave) => {
    setSelectedLeave(leave);
    setShowLeaveModal(true);
  };

  // Function to close leave modal
  const closeLeaveModal = () => {
    setShowLeaveModal(false);
    setSelectedLeave(null);
  };

  const openCdoModal = (cdo) => {
    if (!cdo) return;
    setSelectedCdo(cdo);
    setShowCdoModal(true);
  };

  const closeCdoModal = () => {
    setShowCdoModal(false);
    setSelectedCdo(null);
  };

  // Add state for hover tooltip
  const [hoveredRemark, setHoveredRemark] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Function to handle remark hover
  const handleRemarkHover = (event, remark, remarkType, remarkData) => {
    const rect = event.target.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setHoveredRemark({
      remark,
      type: remarkType,
      data: remarkData
    });
  };

  // Function to handle remark hover out
  const handleRemarkHoverOut = () => {
    setHoveredRemark(null);
  };

  // Function to get hover content based on remark type
  const getHoverContent = (hoveredRemark) => {
    if (!hoveredRemark) return null;

    const { type, data } = hoveredRemark;

    switch (type) {
      case 'locator':
        return (
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-xs">
            <div className="font-semibold text-blue-600 mb-2">Locator Details</div>
            <div className="text-sm space-y-1">
              <div><strong>Locator No:</strong> {data.LOCNO || 'N/A'}</div>
              <div><strong>Date:</strong> {data.LOCDATE ? new Date(data.LOCDATE).toLocaleDateString() : 'N/A'}</div>
              <div><strong>Destination:</strong> {data.LOCDESTINATION || 'N/A'}</div>
              <div><strong>Purpose:</strong> {data.LOCPURPOSE || 'N/A'}</div>
              <div><strong>Status:</strong> {data.LOCSTATUS || 'N/A'}</div>
            </div>
          </div>
        );

      case 'leave':
        return (
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-xs">
            <div className="font-semibold text-purple-600 mb-2">Leave Details</div>
            <div className="text-sm space-y-1">
              <div><strong>Ref No:</strong> {data.LEAVEREFNO || 'N/A'}</div>
              <div><strong>Leave Type:</strong> {data.LeaveName || 'N/A'}</div>
              <div><strong>Days:</strong> {data.LEAVEDAYS || 'N/A'}</div>
              <div><strong>Status:</strong> {data.LEAVESTATUS || 'N/A'}</div>
            </div>
          </div>
        );

      case 'travel':
        return (
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-xs">
            <div className="font-semibold text-green-600 mb-2">Travel Order Details</div>
            <div className="text-sm space-y-1">
              <div><strong>Travel No:</strong> {data.TRAVELNO || 'N/A'}</div>
              <div><strong>Purpose:</strong> {data.PURPOSE || data.TRAVELPURPOSE || 'N/A'}</div>
              <div><strong>Destination:</strong> {data.TRAVELDESTINATION || 'N/A'}</div>
              <div><strong>Status:</strong> {data.STATUS || 'N/A'}</div>
            </div>
          </div>
        );
      case 'cdo':
        return (
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-xs">
            <div className="font-semibold text-teal-600 mb-2">CDO Details</div>
            <div className="text-sm space-y-1">
              <div><strong>Reference:</strong> {data?.cdono || data?.displayRef || 'N/A'}</div>
              <div><strong>Title:</strong> {data?.cdoTitle || 'N/A'}</div>
              <div><strong>Date:</strong> {data?.date || data?.cdodate || 'N/A'}</div>
              <div><strong>Status:</strong> {data?.entryStatus || 'Approved'}</div>
              <div><strong>Reason:</strong> {data?.entryReason || 'N/A'}</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Add new state variables after the existing date states (around line 1709)
  const [dateFilterType, setDateFilterType] = useState('monthly'); // Changed default to 'monthly'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Add helper function to get month display name
  const getMonthDisplayName = (monthValue) => {
    const [year, month] = monthValue.split('-');
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Add helper function to get start and end dates for monthly filter
  const getMonthDateRange = (monthValue) => {
    const [year, month] = monthValue.split('-');
    
    // Create start date: 1st day of the month at 00:00:00
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    
    // Create end date: last day of the month at 00:00:00
    const endDate = new Date(parseInt(year), parseInt(month), 0); // Day 0 = last day of previous month
    
    // Format as YYYY-MM-DD without timezone conversion
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  };

  

  // Update the date filter type handler
  const handleFilterTypeChange = (filterType) => {
    setDateFilterType(filterType);
    
    if (filterType === 'monthly') {
      // Always set to current month and year when switching to monthly
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const monthValue = `${year}-${month}`;
      setSelectedMonth(monthValue);
      
      // Update the date range to cover the full current month
      const monthRange = getMonthDateRange(monthValue);
      // Data will refresh automatically via useEffect when startDate or endDate changes
      setStartDate(monthRange.startDate);
      setEndDate(monthRange.endDate);
    } else if (filterType === 'range') {
      // Always set to current date when switching to range
      const today = new Date();
      const currentDate = today.toISOString().split('T')[0];
      // Data will refresh automatically via useEffect when startDate or endDate changes
      setStartDate(currentDate);
      setEndDate(currentDate);
    }
  };

  // Replace the existing Date Range Filter section (around line 2265) with this updated version:
  {/* Date Filter */}
  <div className="mb-6">
    {/* Inline Filter Type and Date Controls */}
    {dateFilterType === 'range' ? (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date Filter Type
          </label>
          <select
            value={dateFilterType}
            onChange={(e) => handleFilterTypeChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="monthly">Monthly</option>
            <option value="range">Date Range</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange('start', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange('end', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date Filter Type
          </label>
          <select
            value={dateFilterType}
            onChange={(e) => handleFilterTypeChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="monthly">Monthly</option>
            <option value="range">Date Range</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Month
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => handleDateChange('month', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
    )}
  </div>

  // Also need to add an effect to initialize the monthly filter on component mount
  useEffect(() => {
    // Initialize monthly filter with current month on component mount
    if (dateFilterType === 'monthly') {
      const monthRange = getMonthDateRange(selectedMonth);
      setStartDate(monthRange.startDate);
      setEndDate(monthRange.endDate);
    }
  }, []); // Run only on mount

  // Add new state for available months (after the existing states around line 1728)
  const [availableMonths, setAvailableMonths] = useState([]);

  // Add function to generate last 5 years of months
  const generateLast5YearsMonths = () => {
    const months = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    // Generate months for the last 5 years
    for (let year = currentYear; year >= currentYear - 4; year--) {
      const startMonth = year === currentYear ? currentMonth : 12;
      const endMonth = 1;
      
      for (let month = startMonth; month >= endMonth; month--) {
        const monthYear = `${year}-${String(month).padStart(2, '0')}`;
        const displayName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { 
          month: 'long', 
          year: 'numeric' 
        });
        
        months.push({
          year,
          month,
          monthYear,
          displayName
        });
      }
    }
    
    return months;
  };

  // Add useEffect to generate available months on component mount
  useEffect(() => {
    const months = generateLast5YearsMonths();
    setAvailableMonths(months);
    console.log('✅ [TIME LOGS] Generated last 5 years months:', months);
  }, []);

  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 text-gray-600">
          Loading permissions…
        </div>
      </div>
    );
  }

  if (!canReadTimeLogs) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 text-gray-600">
          You do not have permission to view time logs.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header (search, filters, etc.) */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Employee Search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Employee
          </label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, badge number, SSN, or department..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {search && filteredEmployees.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredEmployees.map((emp, idx) => (
                  <div
                    key={emp.USERID ?? emp.EMP_OBJID ?? idx}
                    onClick={() => handleEmployeeSelect(emp)}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full overflow-hidden bg-gray-200 border border-gray-300 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {emp.PHOTO ? (
                          <img
                            src={emp.PHOTO}
                            alt={emp.NAME}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{(emp.NAME || 'N/A').charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-800">{emp.NAME}</span>
                        <span className="text-xs text-gray-500">
                          {[emp.DEPARTMENT || 'No Department', emp.POSITION].filter(Boolean).join(' • ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Employee Info - Always Visible */}
        {selectedEmployee && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Selected Employee:</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div><strong>Name:</strong> {selectedEmployee.NAME}</div>
              <div><strong>Badge Number:</strong> {selectedEmployee.BADGENUMBER}</div>
              <div><strong>Department:</strong> {selectedEmployee.DEPARTMENT || 'No Department'}</div>
              <div><strong>Position:</strong> {selectedEmployee.POSITION || 'Not Assigned'}</div>
              <div className="md:col-span-4">
                <strong>Assigned Shift:</strong> {getShiftDisplayName()}
                {getShiftTimeDisplay()}
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Date Range Filter */}
        <div className="mb-6">
          {/* Inline Filter Type and Date Controls */}
          {dateFilterType === 'range' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Filter Type
                </label>
                <select
                  value={dateFilterType}
                  onChange={(e) => handleFilterTypeChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="range">Date Range</option>
                </select>
              </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Filter Type
                </label>
                <select
                  value={dateFilterType}
                  onChange={(e) => handleFilterTypeChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="range">Date Range</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => handleDateChange('month', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  {availableMonths.map((month) => (
                    <option key={month.monthYear} value={month.monthYear}>
                      {month.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        {/* View Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
          <div className="flex space-x-2">
            <button
              onClick={() => setViewType('Shift Sched')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition duration-200 ease-in-out ${
                viewType === 'Shift Sched'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Shift Sched
            </button>
            <button
              onClick={() => setViewType('Raw Logs')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition duration-200 ease-in-out ${
                viewType === 'Raw Logs'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Raw Logs
            </button>
          </div>
          {/* Print and Export Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 shadow"
              disabled={!selectedEmployee || processedLogs.length === 0}
            >
              Print
            </button>
            <button
              onClick={() => exportGridToCSV(processedLogs, columns)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-500 text-white hover:bg-yellow-600 shadow"
              disabled={!selectedEmployee || processedLogs.length === 0}
            >
              Export CSV
            </button>
            <button
              onClick={() => exportGridToExcel(processedLogs, columns)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-700 text-white hover:bg-green-800 shadow"
              disabled={!selectedEmployee || processedLogs.length === 0}
            >
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Content Area - Switch between views */}
      {viewType === 'Raw Logs' ? (
        // Raw Logs View
        <RawLogsView_Management
          logs={logs}
          selectedEmployee={selectedEmployee}
          startDate={startDate}
          endDate={endDate}
        />
      ) : (
        // Shift Sched View (with print area)
        <div ref={printRef}>
          {/* Loading State */}
          {loading && (
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <p className="text-gray-500">Loading shift schedule...</p>
            </div>
          )}

          {/* No Shift Schedule Warning */}
          {!loading && selectedEmployee && !employeeShiftSchedule && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-yellow-800 mb-2">No shift schedule assigned to this employee.</p>
              <p className="text-sm text-yellow-700">Please assign a shift schedule to view time logs.</p>
            </div>
          )}

          {/* Logs Display */}
          {!loading && selectedEmployee && employeeShiftSchedule && processedLogs.length > 0 ? (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="min-w-full table-auto border border-gray-300 shadow-sm">
                <thead className="bg-gray-100 text-sm text-gray-700">
                  <tr>
                    {columns.map(col => {
                      // Define column widths
                      const getColumnWidth = (field) => {
                        switch (field) {
                          case 'DATE':
                            return 'w-32'; // 128px
                          case 'AM_CHECKIN':
                          case 'AM_CHECKOUT':
                          case 'PM_CHECKIN':
                          case 'PM_CHECKOUT':
                            return 'w-20'; // 80px (reduced from default)
                          case 'LATE':
                            return 'w-16'; // 64px
                          case 'DAYS':
                            return 'w-16'; // 64px
                          case 'REMARKS':
                            return 'w-40'; // 160px (reduced from 192px - approximately 17% reduction)
                          case 'ACTION':
                            return 'w-32'; // 128px (updated from w-24)
                          default:
                            return 'w-auto';
                        }
                      };
                      
                      return (
                        <th key={col.field} className={`border px-4 py-2 ${getColumnWidth(col.field)}`}>
                          {col.header}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {processedLogs.map((row, idx) => (
                    <tr 
                      key={idx} 
                      className={`text-center text-sm ${
                        row.isWeekend 
                          ? 'text-blue-600 bg-blue-50' 
                          : ''
                      }`}
                    >
                      {columns.map(col => {
                        // Define column widths for data cells
                        const getColumnWidth = (field) => {
                          switch (field) {
                            case 'DATE':
                              return 'w-32'; // 128px
                            case 'AM_CHECKIN':
                            case 'AM_CHECKOUT':
                            case 'PM_CHECKIN':
                            case 'PM_CHECKOUT':
                              return 'w-20'; // 80px (reduced from default)
                            case 'LATE':
                              return 'w-16'; // 64px
                            case 'DAYS':
                              return 'w-16'; // 64px
                            case 'REMARKS':
                              return 'w-40'; // 160px (reduced from 192px - approximately 17% reduction)
                            case 'ACTION':
                              return 'w-32'; // 128px (updated from w-24)
                            default:
                              return 'w-auto';
                          }
                        };
                        
                        if (col.field === 'REMARKS') {
                          const holidayNames = Array.isArray(row.holidayNames) ? row.holidayNames : [];
                          const holidayText = row.holidayDisplay || (holidayNames.length > 0 ? holidayNames.join(', ') : 'Holiday');
                          const showHoliday = row.hasHoliday && holidayText;

                          return (
                            <td
                              key={col.field}
                              className={`border px-4 py-2 text-left ${getColumnWidth(col.field)}`}
                            >
                              {showHoliday && (
                                <div className="text-sm font-semibold text-red-600">
                                  {holidayText}
                                </div>
                              )}
                              {row.REMARKS ? (
                                <div className={showHoliday ? 'mt-1' : undefined}>
                                  {row.REMARKS.split('; ').filter(Boolean).map((remark, i, arr) => {
                                    const trimmedRemark = remark.trim();
                                    const locatorMatch = trimmedRemark.match(/^Locator \(([^)]+)\)$/);
                                    const leaveMatch = trimmedRemark.match(/^Leave \(([^)]+)\)$/);
                                    const travelMatch = trimmedRemark.match(/^Travel \(([^)]+)\)$/);
                                    const cdoMatch = trimmedRemark.match(/^CDO\(([^)]+)\)$/i);

                                    if (locatorMatch) {
                                      const locatorNo = locatorMatch[1];
                                      const locatorRecords = row.REMARKS_DATA?.locatorRecords || [];
                                      const locatorData = locatorRecords.find(l => {
                                        const values = [l.LOCNO, l.locatorno, l.loc_no];
                                        return values.some(val => val !== undefined && val !== null && String(val).trim() === locatorNo);
                                      });

                                      return (
                                        <span key={i}>
                                          <button
                                            onClick={() => locatorData && openLocatorModal(locatorData)}
                                            onMouseEnter={(e) => handleRemarkHover(e, trimmedRemark, 'locator', locatorData)}
                                            onMouseLeave={handleRemarkHoverOut}
                                            className="text-pink-600 hover:text-pink-800 underline cursor-pointer bg-transparent border-none p-0 text-left font-normal"
                                            style={{ textDecoration: 'underline', color: '#ec4899', cursor: 'pointer' }}
                                            title="Click to view locator details"
                                          >
                                            {trimmedRemark}
                                          </button>
                                          {i < arr.length - 1 && '; '}
                                        </span>
                                      );
                                    }

                                    if (leaveMatch) {
                                      const leaveRef = leaveMatch[1];
                                      const leaveRecords = row.REMARKS_DATA?.leaveRecords || [];
                                      const leaveData = leaveRecords.find(l => {
                                        const refs = [l.LEAVEREFNO, l.leaveno, l.leaverefno, l.LeaveRefNo, l.leave_refno, l.LEAVEID, l.leaveid];
                                        return refs.some(val => val !== undefined && val !== null && String(val).trim() === leaveRef);
                                      });
                                      let resolvedLeave = leaveData;

                                      if (!resolvedLeave) {
                                        resolvedLeave = leaveRecords.find((leaveRecord) => {
                                          if (leaveRecord.leaveDates && leaveRecord.leaveDates.length > 0) {
                                            return leaveRecord.leaveDates.some((leaveDate) => extractDate(leaveDate.LEAVEDATE) === row.DATE_RAW);
                                          }
                                          const fallbackDate = extractDate(leaveRecord.LEAVEDATE || leaveRecord.leavedate);
                                          return fallbackDate === row.DATE_RAW;
                                        }) || null;
                                      }

                                      if (!resolvedLeave && leaveRecords.length === 1) {
                                        resolvedLeave = leaveRecords[0];
                                      }

                                      return (
                                        <span key={i}>
                                          <button
                                            onClick={() => resolvedLeave && openLeaveModal(resolvedLeave)}
                                            onMouseEnter={(e) => handleRemarkHover(e, trimmedRemark, 'leave', resolvedLeave)}
                                            onMouseLeave={handleRemarkHoverOut}
                                            className="text-purple-600 hover:text-purple-800 underline cursor-pointer bg-transparent border-none p-0 text-left font-normal"
                                            style={{ textDecoration: 'underline', color: '#7c3aed', cursor: 'pointer' }}
                                            title="Click to view leave details"
                                          >
                                            {trimmedRemark}
                                          </button>
                                          {i < arr.length - 1 && '; '}
                                        </span>
                                      );
                                    }

                                    if (travelMatch) {
                                      const travelRef = travelMatch[1];
                                      const travelRecords = row.REMARKS_DATA?.travelRecords || [];
                                      const travelData = travelRecords.find(t => {
                                        const refs = [t.travelno, t.TRAVELNO, t.cdono, t.travel_no];
                                        return refs.some(val => val !== undefined && val !== null && String(val).trim() === travelRef);
                                      });

                                      return (
                                        <span key={i}>
                                          <button
                                            onClick={() => travelData && openTravelModal(travelData)}
                                            onMouseEnter={(e) => handleRemarkHover(e, trimmedRemark, 'travel', travelData)}
                                            onMouseLeave={handleRemarkHoverOut}
                                            className="text-green-600 hover:text-green-800 underline cursor-pointer bg-transparent border-none p-0 text-left font-normal"
                                            style={{ textDecoration: 'underline', color: '#16a34a', cursor: 'pointer' }}
                                            title="Click to view travel details"
                                          >
                                            {trimmedRemark}
                                          </button>
                                          {i < arr.length - 1 && '; '}
                                        </span>
                                      );
                                    }

                                    if (cdoMatch) {
                                      const cdoRef = cdoMatch[1];
                                      const cdoRecords = row.REMARKS_DATA?.cdoRecords || [];
                                      const cdoData = cdoRecords.find((record) => {
                                        const candidates = [
                                          record?.displayRef,
                                          record?.cdono,
                                          record?.CDONO
                                        ]
                                          .map((val) => (val !== undefined && val !== null ? String(val).trim() : ''))
                                          .filter(Boolean);
                                        return candidates.includes(String(cdoRef).trim());
                                      }) || null;

                                      return (
                                        <span key={i}>
                                          <button
                                            onClick={() => cdoData && openCdoModal(cdoData)}
                                            onMouseEnter={(e) => handleRemarkHover(e, trimmedRemark, 'cdo', cdoData)}
                                            onMouseLeave={handleRemarkHoverOut}
                                            className="underline cursor-pointer bg-transparent border-none p-0 text-left font-normal"
                                            style={{ textDecoration: 'underline', color: '#0f766e', cursor: 'pointer' }}
                                            title="Click to view CDO details"
                                          >
                                            {trimmedRemark}
                                          </button>
                                          {i < arr.length - 1 && '; '}
                                        </span>
                                      );
                                    }

                                    // Regular remarks (not clickable)
                                    const getRemarkColor = (remark) => {
                                      if (remark === 'Weekend') {
                                        return 'text-blue-600';
                                      }

                                      if (remark === 'Absent') {
                                        return 'text-orange-600';
                                      }

                                      if (remark.toLowerCase().startsWith('locator')) {
                                        return 'text-pink-600';
                                      }

                                      if (remark.toLowerCase().includes('leave')) {
                                        return 'text-purple-600';
                                      }

                                      if (remark.toLowerCase().includes('travel')) {
                                        return 'text-green-600';
                                      }

                                      if (remark.toLowerCase().startsWith('cdo')) {
                                        return 'text-teal-600';
                                      }

                                      // Check if this remark is a holiday name
                                      if (row.hasHoliday && (row.holidayNames || []).some((name) => name === remark)) {
                                        return 'text-red-600';
                                      }

                                      // Check for other holiday-related text
                                      if (remark.toLowerCase().includes('holiday') || 
                                          remark.toLowerCase().includes('national') ||
                                          remark.toLowerCase().includes('special')) {
                                        return 'text-red-600';
                                      }

                                      return 'text-gray-600';
                                    };

                                    return (
                                      <span key={i} className={getRemarkColor(trimmedRemark)}>
                                        {trimmedRemark}{i < arr.length - 1 && '; '}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                !showHoliday ? <span className="text-gray-400">-</span> : null
                              )}
                            </td>
                          );
                        }

                        // Handle ACTION column
                        if (col.field === 'ACTION') {
                          const hasLeave = hasLeaveForDate(leaveData, row.DATE_RAW, selectedEmployee?.USERID, selectedEmployeeObjId);
                          const hasOBLeave = hasOBLeaveForDate(leaveData, row.DATE_RAW, selectedEmployee?.USERID, selectedEmployeeObjId);
                          const hasTravel = hasTravelRecordForDate(travelData, row.DATE_RAW, selectedEmployee?.USERID, selectedEmployeeObjId);
                          const hasHoliday = hasHolidayForDate(holidayData, row.DATE_RAW);
                          const hasMissingLogs = hasMissingTimeLogs(row, employeeShiftSchedule);
                          
                          // Check if date is in the future or current date
                          const currentDate = new Date(row.DATE_RAW);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          currentDate.setHours(0, 0, 0, 0);
                          const isFutureDate = currentDate > today;
                          const isCurrentDate = currentDate.getTime() === today.getTime();
                          
                          // Determine button states based on conditions
                          const hasExistingRecords = hasLeave || hasOBLeave || hasTravel;
                          const hasCompleteLogs = !hasMissingLogs; // Complete logs means no missing logs
                          const hasNoLogs = !row.AM_CHECKIN && !row.AM_CHECKOUT && !row.PM_CHECKIN && !row.PM_CHECKOUT;
                          
                          // Button enable/disable logic:
                          // 1. Disable all if complete logs OR existing records
                          // 2. Enable only Locator if incomplete logs (has some logs but missing some)
                          // 3. Enable all if no logs at all
                          
                          const shouldDisableAll = hasCompleteLogs || hasExistingRecords;
                          const shouldEnableLocatorOnly = !hasCompleteLogs && !hasNoLogs && !hasExistingRecords; // Has some logs but incomplete
                          const shouldEnableAll = hasNoLogs && !hasExistingRecords; // No logs at all
                          const locatorDisabled = shouldDisableAll || row.isWeekend || isFutureDate;
                          
                          // Check if date has existing Approved/For Approval remarks for Leave, Travel, CDO, Locator, or Fix Logs
                          const { hasRemarks: hasExistingRemarks } = hasExistingRemarksForDate(
                            row.DATE_RAW,
                            selectedEmployee?.USERID,
                            selectedEmployeeObjId,
                            locatorData,
                            leaveData,
                            travelData,
                            cdoUsageByDate
                          );
                          
                          // Also check for fix logs remarks
                          const fixLogsRemarks = getFixLogsRemarksForDate(fixLogsData, row.DATE_RAW, selectedEmployeeObjId);
                          const hasFixLogsRemarks = !!fixLogsRemarks;
                          
                          // Hide both buttons if there are existing remarks (including fix logs)
                          const shouldHideButtons = hasExistingRemarks || hasFixLogsRemarks;
                          
                          // Update locatorDisabled to remove weekend restriction for hiding, but keep it for disabling
                          // Weekends are now allowed - only disable for future dates or complete logs/existing records
                          const locatorDisabledForWeekend = isFutureDate || shouldDisableAll;
                          
                          return (
                            <td key={col.field} className={`border px-4 py-2 ${getColumnWidth(col.field)}`}>
                              <div className="flex items-center justify-center space-x-1">
                                {/* Locator Button */}
                                {canCreateTimeLogs || canUpdateTimeLogs ? (
                                  !shouldHideButtons ? (
                                    <button
                                      onClick={() => openLocatorForm(row.DATE_RAW, 'AM_CHECKIN')}
                                      disabled={locatorDisabledForWeekend}
                                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 shadow-sm hover:shadow-md ${
                                        locatorDisabledForWeekend 
                                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                          : 'bg-blue-50 hover:bg-blue-100 text-gray-700'
                                      }`}
                                      title={
                                        isFutureDate
                                          ? 'Locator disabled for future dates'
                                          : shouldDisableAll
                                            ? 'Locator disabled - Complete logs or existing records'
                                            : 'Add Locator Entry'
                                      }
                                    >
                                      <span className="text-base">📌</span>
                                    </button>
                                  ) : null
                                ) : (
                                  <span className="text-xs text-gray-400 italic">No actions</span>
                                )}
                                {/* Fix Time Button */}
                                {canCreateFixLogs && !shouldHideButtons ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition-colors border border-blue-100 shadow-sm hover:shadow disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                                    title="Fix Time"
                                    onClick={() => openFixTimeModal(row)}
                                    disabled={permissionsLoading}
                                  >
                                    <span role="img" aria-label="Fix Time">🔧</span>
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          );
                        }
                        
                        return (
                          <td key={col.field} className={`border px-4 py-2 ${getColumnWidth(col.field)}`}>
                            {(() => {
                              // Check if this is a time column
                              const isTimeColumn = ['AM_CHECKIN', 'AM_CHECKOUT', 'PM_CHECKIN', 'PM_CHECKOUT'].includes(col.field);
                              
                              if (isTimeColumn) {
                                const isAmpmHiddenColumn =
                                  isAmpmShift && (col.field === 'AM_CHECKOUT' || col.field === 'PM_CHECKIN');
                                if (isAmpmHiddenColumn) {
                                  return <span className="text-gray-400">-</span>;
                                }
                                
                                // Get the time value first - always show it if it exists
                                const timeValue = row[col.field] || '-';
                                
                                // Check for various indicators (but don't hide time logs)
                                const hasLeave = hasLeaveForDate(leaveData, row.DATE_RAW, selectedEmployee?.USERID, selectedEmployeeObjId);
                                const hasTravel = hasTravelRecordForDate(travelData, row.DATE_RAW, selectedEmployee?.USERID, selectedEmployeeObjId);
                                const hasCdo = row.hasCdo || (cdoUsageByDate && cdoUsageByDate[row.DATE_RAW]);
                                const hasHoliday = hasHolidayForDate(holidayData, row.DATE_RAW);
                                const isWeekendDay = row.isWeekend;
                                
                                // Check for absent (only if no logs and no leave/travel/holiday)
                                const hasNoLogs = !row.AM_CHECKIN && !row.AM_CHECKOUT && !row.PM_CHECKIN && !row.PM_CHECKOUT;
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                const currentDate = new Date(row.DATE_RAW);
                                  currentDate.setHours(0, 0, 0, 0);
                                  const isFutureDate = currentDate > today;
                                const isCurrentDate = currentDate.getTime() === today.getTime();
                                const isAbsent = row.REMARKS && row.REMARKS.includes('Absent');
                                const showAbsent = (isAbsent || (hasNoLogs && !isFutureDate && !isCurrentDate)) && !hasLeave && !hasTravel && !hasHoliday;
                                
                                // If time value exists, show it with indicators as badges
                                if (timeValue !== '-') {
                                  const badges = [];
                                  
                                  // Add indicator badges (lower priority than time display)
                                  // Note: Holiday badge is hidden when time logs are present
                                  if (hasLeave) {
                                    badges.push(
                                      <span key="leave" className="inline-block ml-1 px-1 py-0.5 text-xs bg-purple-100 text-purple-700 rounded font-semibold" title="Leave">
                                        Leave
                                      </span>
                                    );
                                  }
                                  
                                  if (hasTravel) {
                                    badges.push(
                                      <span key="travel" className="inline-block ml-1 px-1 py-0.5 text-xs bg-green-100 text-green-700 rounded font-semibold" title="Travel">
                                        Travel
                                      </span>
                                    );
                                  }
                                  
                                  if (hasCdo) {
                                    badges.push(
                                      <span key="cdo" className="inline-block ml-1 px-1 py-0.5 text-xs bg-teal-100 text-teal-700 rounded font-semibold" title="CDO">
                                        CDO
                                      </span>
                                    );
                                }
                                
                                  // Holiday badge is NOT shown when time logs are present
                                  // Only show holiday indicator when there are no time logs
                                  
                                  if (isWeekendDay) {
                                    badges.push(
                                      <span key="weekend" className="inline-block ml-1 px-1 py-0.5 text-xs bg-blue-100 text-blue-700 rounded font-semibold" title="Weekend">
                                        Weekend
                                      </span>
                                    );
                                  }
                                
                                // Check if this field was overridden by locator backfill
                                const isLocatorBackfill = row.LOCATOR_BACKFILL && row.LOCATOR_BACKFILL[col.field] === true;
                                
                                // Check if this field was overridden by fix logs
                                const isFixLogOverride = row.FIX_LOG_BACKFILL && row.FIX_LOG_BACKFILL[col.field] === true;
                                  
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
                                    const approvedByName = row.FIX_LOG?.approved_by_employee_name || 
                                                          row.FIX_LOG?.approvedByName || 
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
                                  
                                    return (
                                    <span className="inline-flex items-center flex-wrap gap-1">
                                      <span className="font-medium">{timeValue}</span>
                                        {badges}
                                      </span>
                                    );
                                  }
                                
                                // If no time value, show indicators only
                                if (hasLeave) {
                                  return <span className="text-red-600 font-semibold">Leave</span>;
                                }
                                
                                if (hasTravel) {
                                  return <span className="text-green-600 font-semibold">Travel</span>;
                                }
                                
                                if (hasCdo) {
                                  return <span className="text-gray-400 font-semibold">CDO</span>;
                                }
                                
                                if (hasHoliday) {
                                  return <span className="text-gray-400 font-semibold">Holiday</span>;
                                }
                                
                                if (isWeekendDay) {
                                  return <span className="text-blue-600 font-semibold">Weekend</span>;
                                }
                                
                                if (showAbsent) {
                                  return <span className="text-orange-600 font-semibold">Absent</span>;
                                }
                                
                                return timeValue;
                              }
                              
                              // For non-time columns, return the value as-is
                              const cellValue = row[col.field];
                              return cellValue !== undefined && cellValue !== null && cellValue !== ''
                                ? cellValue
                                : '-';
                            })()}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* Footer with totals */}
                <tfoot>
                  <tr className="footer-totals">
                    <td colSpan={5} className="border px-4 py-2 text-right">TOTALS:</td>
                    <td className="border px-4 py-2">{totalLate}</td>
                    <td className="border px-4 py-2">{totalDays}</td>
                    <td className="border px-4 py-2"></td>
                    <td className="border px-4 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : !loading && selectedEmployee && employeeShiftSchedule ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-yellow-800">
                No logs found for the selected date range.
              </p>
            </div>
          ) : !loading && !selectedEmployee ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <p className="text-gray-600">Please select an employee to view their time logs.</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Locator Form Modal */}
      <LocatorForm
        isOpen={locatorFormOpen}
        onClose={() => setLocatorFormOpen(false)}
        onSubmit={handleLocatorSubmit}
        date={locatorFormData.date}
        columnType={locatorFormData.columnType}
        employee={locatorFormData.employee}
        shiftSchedule={employeeShiftSchedule}
      />

      <FixTimeModal
        isOpen={fixTimeModalOpen}
        onClose={closeFixTimeModal}
        employee={selectedEmployee}
        row={fixTimeModalRow}
        form={fixTimeForm}
        onChange={handleFixFormChange}
        onSubmit={handleFixFormSubmit}
        loading={fixTimeLoading}
        saving={fixTimeSaving}
        error={fixTimeError}
        existingRecord={fixTimeExistingRecord}
        shiftSchedule={employeeShiftSchedule}
      />

      {showLocatorModal && selectedLocator && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-bold">Locator Details</h3>
                  <p className="text-blue-100 mt-1">Locator Number: {selectedLocator.LOCNO}</p>
                </div>
                <button
                  onClick={closeLocatorModal}
                  className="text-white hover:text-blue-200 transition-colors duration-200"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6">
              {/* Basic Information */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                  Basic Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Employee</label>
                    <p className="text-lg font-semibold text-gray-900">{selectedLocator.NAME || 'Unknown Employee'}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Date</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedLocator.LOCDATE ? new Date(selectedLocator.LOCDATE).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Status</label>
                    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                      selectedLocator.LOCSTATUS === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedLocator.LOCSTATUS || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Location Details */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                  Location Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-blue-700 mb-2">Destination</label>
                    <p className="text-lg text-blue-900">{selectedLocator.LOCDESTINATION || 'Not specified'}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-blue-700 mb-2">Purpose</label>
                    <p className="text-lg text-blue-900">{selectedLocator.LOCPURPOSE || 'Not specified'}</p>
                  </div>
                </div>
              </div>

              {/* Time Information */}
              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                  Time Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-green-700 mb-2">Time Departure</label>
                    <p className="text-lg font-mono text-green-900">
                      {selectedLocator.LOCTIMEDEPARTURE ? new Date(selectedLocator.LOCTIMEDEPARTURE).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      }) : 'Not specified'}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-green-700 mb-2">Time Arrival</label>
                    <p className="text-lg font-mono text-green-900">
                      {selectedLocator.LOCTIMEARRIVAL ? new Date(selectedLocator.LOCTIMEARRIVAL).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      }) : 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* System Information */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                  System Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Entry By</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {getEmployeeNameForLocator(selectedLocator.LOCENTRYBY, employees)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Entry Date</label>
                    <p className="text-lg font-mono text-gray-900">
                      {selectedLocator.LOCENTRYDATE ? new Date(selectedLocator.LOCENTRYDATE).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      }) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 rounded-b-lg border-t border-gray-200">
              <div className="flex justify-end">
                <button
                  onClick={closeLocatorModal}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTravelModal && selectedTravel && (
        <TravelDetailModal
          isOpen={showTravelModal}
          onClose={closeTravelModal}
          travel={selectedTravel}
        />
      )}

      {showCdoModal && selectedCdo && (
        <CdoDetailModal
          isOpen={showCdoModal}
          onClose={closeCdoModal}
          cdo={selectedCdo}
        />
      )}

        <LeaveDetailModal
          isOpen={showLeaveModal}
          onClose={closeLeaveModal}
          leave={selectedLeave}
          employees={employees}
        />
    </div>
  );
}

export default TimeLogsManagement;