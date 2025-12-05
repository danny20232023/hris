import React, { useRef, useState, useEffect } from 'react';
import { getEmployeeShiftSchedule, generateDateRange } from '../../utils/shiftScheduleUtils';
import api from '../../utils/api';
import { useAuth } from '../../authContext';

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

// Helper to extract time from string
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

// Local date range generation function
const generateLocalDateRange = (startDate, endDate) => {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    dates.push(dateStr);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

// Calculate date range based on period
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
      endDate = new Date(year, month + 1, 0);
      break;
    case 'full':
    default:
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
      break;
  }

  return {
    startDate,
    endDate,
    startDateStr: startDate.toISOString().split('T')[0],
    endDateStr: endDate.toISOString().split('T')[0]
  };
};

// Get ALL days of the month for display
const getAllDaysOfMonth = (selectedMonth) => {
  if (!selectedMonth) return null;

  const monthDate = new Date(selectedMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);

  return {
    startDate,
    endDate,
    startDateStr: startDate.toISOString().split('T')[0],
    endDateStr: endDate.toISOString().split('T')[0]
  };
};

// Check if a date is within the selected period
const isDateInSelectedPeriod = (dateStr, selectedMonth, selectedPeriod) => {
  if (!selectedPeriod || selectedPeriod === 'full') return true;

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
  
  // Debug logging for first few calls
  if (dayLog?.day && dayLog.day <= 3 && columnType === 'AM_CHECKIN') {
    console.log(`🎨 Rendering ${columnType} for day ${dayLog.day}:`, {
      timeValue,
      hasLocatorBackfill: isLocatorBackfill,
      hasFixLogOverride: isFixLogOverride,
      locatorBackfillFlags,
      fixLogBackfillFlags,
      remarkFlags: dayLog.remarkFlags,
      selectedAnnotations
    });
  }

  const normalizedTimeValue = typeof timeValue === 'string' ? timeValue.trim() : '';
  const hasValue = normalizedTimeValue !== '' && normalizedTimeValue !== '-';
  const remarkFlags = dayLog?.remarkFlags || {};
  const hasLeave = !!remarkFlags.hasLeave;
  const hasTravel = !!remarkFlags.hasTravel;
  const hasCdo = !!remarkFlags.hasCdo;
  const hasHoliday = !!dayLog?.hasHoliday;
  const isWeekendDay = !!dayLog?.isWeekend;
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
    
    // Also add text annotations for leave, CDO even when there are time values
    // Note: Travel annotation is NOT shown when there are existing logs
    const textAnnotations = [];
    if ((hasLeave || hasOBLeave) && selectedAnnotations.leave) {
      // Only approved leaves are processed, so always show "Leave"
      textAnnotations.push('Leave');
    }
    // Travel annotation removed from here - only show when no time logs exist
    if (hasCdo && selectedAnnotations.cdo) {
      textAnnotations.push('CDO');
    }
    
    if (badges.length > 0 || textAnnotations.length > 0) {
      const badgeStr = badges.length > 0 ? ` ${badges.join(' ')}` : '';
      const annotationStr = textAnnotations.length > 0 ? ` <span class="text-gray-400 text-xs">${textAnnotations.join(', ')}</span>` : '';
      return `${timeValue}${badgeStr}${annotationStr}`;
    }
    
    return timeValue || '-';
  } else if ((isLocatorBackfill && selectedAnnotations.locator) || (isFixLogOverride && selectedAnnotations.fixlog)) {
    // PRIORITY 2.5: Show locator/fixlog badges even when there's no time value
    const badges = [];
    if (isLocatorBackfill && selectedAnnotations.locator) {
      badges.push('📌');
    }
    if (isFixLogOverride && selectedAnnotations.fixlog) {
      badges.push('🔒');
    }
    return badges.join(' ');
  } else if (isWeekendDay && selectedAnnotations.weekend) {
    // PRIORITY 3: Weekend annotation (only if selected)
    const weekendColor = hasHoliday ? 'text-red-600' : 'text-blue-600';
    const escapedHolidayText = holidayText.replace(/"/g, '&quot;');
    return `<span class="${weekendColor} font-medium">Weekend</span>`;
  } else if ((hasLeave || hasOBLeave) && selectedAnnotations.leave) {
    // PRIORITY 4: Leave annotation (only if selected)
    // Only approved leaves are processed, so always show "Leave"
    return '<span class="text-gray-400">Leave</span>';
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
  } else if (isAbsent && selectedAnnotations.absent && !isWeekendDay && !hasHoliday) {
    // PRIORITY 8: Absent annotation (only if selected, and not weekend or holiday)
    return '<span class="text-gray-400">Absent</span>';
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
    if (type === 'weekend' && !selectedAnnotations.weekend) return false;
    
    return true;
  });
  
  const filteredTexts = filteredEntries.map(entry => entry.text).filter(Boolean);
  return filteredTexts.length > 0 ? filteredTexts.join('; ') : '';
};

// Helper to extract participant employee objids from employees_data string
const extractParticipantEmpObjIdsFromEmployeesData = (employeesData) => {
  if (!employeesData || typeof employeesData !== 'string') return [];
  return employeesData
    .split('|')
    .map((entry) => entry.split(':')[0]?.trim())
    .filter(Boolean);
};

// Helper to check if travel record includes employee (participant check)
const travelRecordIncludesEmployee = (travel, employeeObjId, userId) => {
  // Only check if employee has records in employee_travels_dates (is a participant)
  const objIdStr = employeeObjId ? String(employeeObjId) : null;
  const userIdStr = userId ? String(userId) : null;

  if (objIdStr) {
    // Check employees_data which comes from employee_travels_dates table
    const parsed = extractParticipantEmpObjIdsFromEmployeesData(travel.employees_data);
    if (parsed.some((id) => String(id) === objIdStr)) return true;

    // Check participantEmpObjIds array (also from employee_travels_dates)
    if (Array.isArray(travel.participantEmpObjIds)) {
      if (travel.participantEmpObjIds.some((id) => String(id) === objIdStr)) return true;
    }

    // Check employees array (if it contains participant data)
    if (Array.isArray(travel.employees)) {
      if (travel.employees.some((emp) => String(emp?.objid) === objIdStr)) return true;
    }

    // Legacy fields - only if they represent actual participation
    if (travel.emp_objid && String(travel.emp_objid) === objIdStr) return true;
    if (travel.employee_objid && String(travel.employee_objid) === objIdStr) return true;
    if (travel.EMP_OBJID && String(travel.EMP_OBJID) === objIdStr) return true;
  }

  if (userIdStr) {
    // Check participantUserIds array (from employee_travels_dates)
    if (Array.isArray(travel.participantUserIds)) {
      if (travel.participantUserIds.some((id) => String(id) === userIdStr)) return true;
    }

    // Legacy USERID field - only if it represents actual participation
    if (travel.USERID && String(travel.USERID) === userIdStr) return true;
  }

  return false;
};

// Shared function to process logs with annotation data
const processLogsWithAnnotations = (logs, schedule, startDate, endDate, selectedPeriod, annotationData, selectedMonth, employeeObjId, userId) => {
  // Use default time windows if no schedule is provided
  const amCheckOutStart = schedule?.SHIFT_AMCHECKOUT_START ? extractTimeFromString(schedule.SHIFT_AMCHECKOUT_START) : "11:00";
  const amCheckOutEnd = schedule?.SHIFT_AMCHECKOUT_END ? extractTimeFromString(schedule.SHIFT_AMCHECKOUT_END) : "12:30";
  const pmCheckInStart = schedule?.SHIFT_PMCHECKIN_START ? extractTimeFromString(schedule.SHIFT_PMCHECKIN_START) : "12:31";
  const pmCheckInEnd = schedule?.SHIFT_PMCHECKIN_END ? extractTimeFromString(schedule.SHIFT_PMCHECKIN_END) : "14:00";
  
  const [amCheckOutStartMin, amCheckOutEndMin] = getTimeWindow(amCheckOutStart, amCheckOutEnd);
  const [pmCheckInStartMin, pmCheckInEndMin] = getTimeWindow(pmCheckInStart, pmCheckInEnd);

  const dateRange = generateLocalDateRange(startDate, endDate);
  const processed = [];
  let totalDays = 0;
  let totalLate = 0;

  for (let i = 0; i < dateRange.length; i++) {
    const dateStr = dateRange[i];
    const day = i + 1;
    const isWeekendDay = isWeekend(dateStr);
    const isInPeriod = isDateInSelectedPeriod(dateStr, selectedMonth, selectedPeriod);
    
    // Get logs for this date
    let dayLogs = [];
    if (isInPeriod) {
      dayLogs = logs.filter(log => {
        let logDateStr = '';
        // Try CHECKTIME first
        if (log.CHECKTIME) {
          if (log.CHECKTIME.includes(' ')) {
            logDateStr = log.CHECKTIME.split(' ')[0];
          } else if (log.CHECKTIME.includes('T')) {
            logDateStr = log.CHECKTIME.split('T')[0];
          } else {
            logDateStr = log.CHECKTIME;
          }
        } 
        // Fallback to DATE field
        else if (log.DATE) {
          if (log.DATE.includes(' ')) {
            logDateStr = log.DATE.split(' ')[0];
          } else if (log.DATE.includes('T')) {
            logDateStr = log.DATE.split('T')[0];
          } else {
            logDateStr = log.DATE;
          }
        }
        // Fallback to date field (lowercase)
        else if (log.date) {
          if (log.date.includes(' ')) {
            logDateStr = log.date.split(' ')[0];
          } else if (log.date.includes('T')) {
            logDateStr = log.date.split('T')[0];
          } else {
            logDateStr = log.date;
          }
        }
        
        // Normalize date strings to YYYY-MM-DD format for comparison
        if (logDateStr && logDateStr !== dateStr) {
          // Try to parse and reformat if needed
          try {
            const parsedDate = new Date(logDateStr);
            if (!isNaN(parsedDate.getTime())) {
              const normalizedDate = parsedDate.toISOString().split('T')[0];
              return normalizedDate === dateStr;
            }
          } catch (e) {
            // If parsing fails, just do string comparison
          }
        }
        
        return logDateStr === dateStr;
      });
    }

    // Process time logs
    let AM_CHECKIN = '';
    let AM_CHECKOUT = '';
    let PM_CHECKIN = '';
    let PM_CHECKOUT = '';

    if (dayLogs.length > 0) {
      // Debug: log first few days with logs
      if (i < 5 && dayLogs.length > 0) {
        console.log(`🔍 Processing ${dayLogs.length} logs for ${dateStr}:`, dayLogs.map(l => ({
          CHECKTIME: l.CHECKTIME,
          DATE: l.DATE,
          date: l.date
        })));
      }
      const amInLogs = dayLogs
        .filter(log => {
          const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
          return t && timeToMinutes(t) < 12 * 60;
        })
        .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

      if (amInLogs.length > 0) {
        AM_CHECKIN = extractTimeFromString(amInLogs[0].CHECKTIME || amInLogs[0].DATE || amInLogs[0].date);
      }

      const amOutLogs = dayLogs
        .filter(log => {
          const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
          return t && validateTimeInWindow(t, amCheckOutStartMin, amCheckOutEndMin);
        })
        .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

      if (amOutLogs.length > 0) {
        AM_CHECKOUT = extractTimeFromString(amOutLogs[0].CHECKTIME || amOutLogs[0].DATE || amOutLogs[0].date);
      }

      const pmInLogs = dayLogs
        .filter(log => {
          const t = extractTimeFromString(log.CHECKTIME || log.DATE || log.date);
          return t && validateTimeInWindow(t, pmCheckInStartMin, pmCheckInEndMin);
        })
        .sort((a, b) => timeToMinutes(extractTimeFromString(a.CHECKTIME || a.DATE || a.date)) - timeToMinutes(extractTimeFromString(b.CHECKTIME || b.DATE || b.date)));

      if (pmInLogs.length > 0) {
        PM_CHECKIN = extractTimeFromString(pmInLogs[0].CHECKTIME || pmInLogs[0].DATE || pmInLogs[0].date);
      }

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

    // Calculate late minutes
    let lateMinutes = 0;
    if (isInPeriod && schedule) {
      if (AM_CHECKIN && schedule.SHIFT_AMCHECKIN) {
        const expectedAMTime = timeToMinutes(extractTimeFromString(schedule.SHIFT_AMCHECKIN));
        const actualAMTime = timeToMinutes(AM_CHECKIN);
        if (actualAMTime > expectedAMTime) {
          lateMinutes += actualAMTime - expectedAMTime;
        }
      }
      
      if (PM_CHECKIN && schedule.SHIFT_PMCHECKIN) {
        const expectedPMTime = timeToMinutes(extractTimeFromString(schedule.SHIFT_PMCHECKIN));
        const actualPMTime = timeToMinutes(PM_CHECKIN);
        if (actualPMTime > expectedPMTime) {
          lateMinutes += actualPMTime - expectedPMTime;
        }
      }
    }

    // Process annotation data for this date
    const locatorBackfill = {};
    const fixLogBackfill = {};
    let hasHoliday = false;
    let holidayNames = [];
    let holidayDisplay = '';
    let hasWorkSuspension = false;
    let leaveStatus = null;
    let hasOBLeave = false;
    let hasLeave = false;
    let hasTravel = false;
    let hasCdo = false;

    // Process locator data
    if (annotationData.locatorData && Array.isArray(annotationData.locatorData) && schedule) {
      // Get schedule times in minutes for comparison
      const scheduleTimes = {
        amCheckIn: schedule.SHIFT_AMCHECKIN ? timeToMinutes(extractTimeFromString(schedule.SHIFT_AMCHECKIN)) : null,
        amCheckOut: schedule.SHIFT_AMCHECKOUT ? timeToMinutes(extractTimeFromString(schedule.SHIFT_AMCHECKOUT)) : null,
        pmCheckIn: schedule.SHIFT_PMCHECKIN ? timeToMinutes(extractTimeFromString(schedule.SHIFT_PMCHECKIN)) : null,
        pmCheckOut: schedule.SHIFT_PMCHECKOUT ? timeToMinutes(extractTimeFromString(schedule.SHIFT_PMCHECKOUT)) : null
      };

      annotationData.locatorData.forEach(locator => {
        // Check if locator applies to this date and has approved status
        let locatorDate = null;
        if (locator.locatordate) {
          if (locator.locatordate.includes('T')) {
            locatorDate = locator.locatordate.split('T')[0];
          } else if (locator.locatordate.includes(' ')) {
            locatorDate = locator.locatordate.split(' ')[0];
          } else {
            locatorDate = locator.locatordate;
          }
        } else if (locator.LOCDATE) {
          if (locator.LOCDATE.includes('T')) {
            locatorDate = locator.LOCDATE.split('T')[0];
          } else if (locator.LOCDATE.includes(' ')) {
            locatorDate = locator.LOCDATE.split(' ')[0];
          } else {
            locatorDate = locator.LOCDATE;
          }
        } else if (locator.locdate) {
          if (locator.locdate.includes('T')) {
            locatorDate = locator.locdate.split('T')[0];
          } else if (locator.locdate.includes(' ')) {
            locatorDate = locator.locdate.split(' ')[0];
          } else {
            locatorDate = locator.locdate;
          }
        }
        
        const status = (locator.status || locator.locstatus || locator.LOCSTATUS || '').toString().toUpperCase();
        
        if (locatorDate === dateStr && status === 'APPROVED') {
          // Extract locator time windows
          const departureValue = locator.loctimedeparture || locator.locdeparture || '';
          const arrivalValue = locator.loctimearrival || locator.locarrival || '';
          
          // Parse times from locator
          const extractLocatorTime = (value) => {
            if (!value) return null;
            const timeStr = extractTimeFromString(value);
            return timeStr ? timeToMinutes(timeStr) : null;
          };
          
          const departureMinutes = extractLocatorTime(departureValue);
          const arrivalMinutes = extractLocatorTime(arrivalValue);
          
          if (departureMinutes !== null || arrivalMinutes !== null) {
            const minMinutes = departureMinutes !== null && arrivalMinutes !== null 
              ? Math.min(departureMinutes, arrivalMinutes) 
              : (departureMinutes ?? arrivalMinutes ?? 0);
            const maxMinutes = departureMinutes !== null && arrivalMinutes !== null 
              ? Math.max(departureMinutes, arrivalMinutes) 
              : (departureMinutes ?? arrivalMinutes ?? 0);
            
            // Check if schedule times fall within locator window and set time values
            const scheduleTimeStr = {
              amCheckIn: schedule.SHIFT_AMCHECKIN ? extractTimeFromString(schedule.SHIFT_AMCHECKIN) : '',
              amCheckOut: schedule.SHIFT_AMCHECKOUT ? extractTimeFromString(schedule.SHIFT_AMCHECKOUT) : '',
              pmCheckIn: schedule.SHIFT_PMCHECKIN ? extractTimeFromString(schedule.SHIFT_PMCHECKIN) : '',
              pmCheckOut: schedule.SHIFT_PMCHECKOUT ? extractTimeFromString(schedule.SHIFT_PMCHECKOUT) : ''
            };
            
            if (scheduleTimes.amCheckIn !== null && scheduleTimes.amCheckIn >= minMinutes && scheduleTimes.amCheckIn <= maxMinutes) {
              locatorBackfill.amCheckIn = true;
              // Set time value if it doesn't exist
              if (!AM_CHECKIN || AM_CHECKIN.trim() === '') {
                AM_CHECKIN = scheduleTimeStr.amCheckIn;
              }
            }
            if (scheduleTimes.amCheckOut !== null && scheduleTimes.amCheckOut >= minMinutes && scheduleTimes.amCheckOut <= maxMinutes) {
              locatorBackfill.amCheckOut = true;
              // Set time value if it doesn't exist
              if (!AM_CHECKOUT || AM_CHECKOUT.trim() === '') {
                AM_CHECKOUT = scheduleTimeStr.amCheckOut;
              }
            }
            if (scheduleTimes.pmCheckIn !== null && scheduleTimes.pmCheckIn >= minMinutes && scheduleTimes.pmCheckIn <= maxMinutes) {
              locatorBackfill.pmCheckIn = true;
              // Set time value if it doesn't exist
              if (!PM_CHECKIN || PM_CHECKIN.trim() === '') {
                PM_CHECKIN = scheduleTimeStr.pmCheckIn;
              }
            }
            if (scheduleTimes.pmCheckOut !== null && scheduleTimes.pmCheckOut >= minMinutes && scheduleTimes.pmCheckOut <= maxMinutes) {
              locatorBackfill.pmCheckOut = true;
              // Set time value if it doesn't exist
              if (!PM_CHECKOUT || PM_CHECKOUT.trim() === '') {
                PM_CHECKOUT = scheduleTimeStr.pmCheckOut;
              }
            }
          }
        }
      });
    }

    // Process fix logs (only if no locator backfill exists for that field)
    if (annotationData.fixLogsData && Array.isArray(annotationData.fixLogsData)) {
      annotationData.fixLogsData.forEach(fixLog => {
        // Check if fix log belongs to this employee
        const fixLogEmpObjId = fixLog.emp_objid || fixLog.EMP_OBJID;
        if (employeeObjId && String(fixLogEmpObjId) !== String(employeeObjId)) {
          return; // Skip if not for this employee
        }
        
        // Check if fix log applies to this date and is approved
        const rawDate = fixLog.checktimedate || fixLog.CHECKTIMEDATE || '';
        let fixLogDate = null;
        
        // Handle date extraction - backend returns YYYY-MM-DD format directly
        if (rawDate) {
          // If it's already in YYYY-MM-DD format, use it directly
          if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            fixLogDate = rawDate;
          } else if (rawDate.includes('T')) {
            fixLogDate = rawDate.split('T')[0];
          } else if (rawDate.includes(' ')) {
            fixLogDate = rawDate.split(' ')[0];
          } else {
            // Try to extract date using extractDate helper if available
            fixLogDate = rawDate;
          }
        }
        
        const fixStatus = (fixLog.fixstatus || fixLog.status || fixLog.FIXSTATUS || '').toString();
        const isApproved = fixStatus.toLowerCase() === 'approved';
        
        if (fixLogDate === dateStr && isApproved) {
          // Only apply fix log if no locator backfill exists for that field
          if ((fixLog.am_checkin || fixLog.AM_CHECKIN) && !locatorBackfill.amCheckIn) {
            fixLogBackfill.amCheckIn = true;
            // Set time value if it doesn't exist
            const fixTime = extractTimeFromString(fixLog.am_checkin || fixLog.AM_CHECKIN || '');
            if (fixTime && (!AM_CHECKIN || AM_CHECKIN.trim() === '')) {
              AM_CHECKIN = fixTime;
            }
          }
          if ((fixLog.am_checkout || fixLog.AM_CHECKOUT) && !locatorBackfill.amCheckOut) {
            fixLogBackfill.amCheckOut = true;
            // Set time value if it doesn't exist
            const fixTime = extractTimeFromString(fixLog.am_checkout || fixLog.AM_CHECKOUT || '');
            if (fixTime && (!AM_CHECKOUT || AM_CHECKOUT.trim() === '')) {
              AM_CHECKOUT = fixTime;
            }
          }
          if ((fixLog.pm_checkin || fixLog.PM_CHECKIN) && !locatorBackfill.pmCheckIn) {
            fixLogBackfill.pmCheckIn = true;
            // Set time value if it doesn't exist
            const fixTime = extractTimeFromString(fixLog.pm_checkin || fixLog.PM_CHECKIN || '');
            if (fixTime && (!PM_CHECKIN || PM_CHECKIN.trim() === '')) {
              PM_CHECKIN = fixTime;
            }
          }
          if ((fixLog.pm_checkout || fixLog.PM_CHECKOUT) && !locatorBackfill.pmCheckOut) {
            fixLogBackfill.pmCheckOut = true;
            // Set time value if it doesn't exist
            const fixTime = extractTimeFromString(fixLog.pm_checkout || fixLog.PM_CHECKOUT || '');
            if (fixTime && (!PM_CHECKOUT || PM_CHECKOUT.trim() === '')) {
              PM_CHECKOUT = fixTime;
            }
          }
        }
      });
    }

    // Process leave data
    if (annotationData.leaveData && Array.isArray(annotationData.leaveData)) {
      annotationData.leaveData.forEach(leave => {
        // Check if leave is approved
        const leaveStatusValue = (leave.leavestatus || leave.status || '').toString().toLowerCase();
        const isApproved = leaveStatusValue === 'approved';
        
        if (!isApproved) return; // Only process approved leaves (exclude "For Approval")
        
        // Check if leave applies to this date
        // Handle leave_dates as array or string
        if (leave.leave_dates) {
          if (Array.isArray(leave.leave_dates)) {
            if (leave.leave_dates.includes(dateStr)) {
              hasLeave = true;
              leaveStatus = leave.leavestatus || leave.status;
            }
          } else if (typeof leave.leave_dates === 'string') {
            // If it's a comma-separated string, split and check
            const dates = leave.leave_dates.split(',').map(d => d.trim());
            if (dates.includes(dateStr)) {
              hasLeave = true;
              leaveStatus = leave.leavestatus || leave.status;
            }
          }
        }
        // Also check details if available
        if (leave.details && Array.isArray(leave.details)) {
          const hasLeaveForDate = leave.details.some(detail => {
            let detailDate = null;
            if (detail.leavedate) {
              if (detail.leavedate.includes('T')) {
                detailDate = detail.leavedate.split('T')[0];
              } else if (detail.leavedate.includes(' ')) {
                detailDate = detail.leavedate.split(' ')[0];
              } else {
                detailDate = detail.leavedate;
              }
            }
            return detailDate === dateStr;
          });
          if (hasLeaveForDate) {
            hasLeave = true;
            leaveStatus = leave.leavestatus || leave.status;
          }
        }
        // Also check leavestartdate and leaveenddate range
        if (leave.leavestartdate && leave.leaveenddate) {
          const startDate = leave.leavestartdate.includes('T') ? leave.leavestartdate.split('T')[0] : leave.leavestartdate.split(' ')[0];
          const endDate = leave.leaveenddate.includes('T') ? leave.leaveenddate.split('T')[0] : leave.leaveenddate.split(' ')[0];
          if (dateStr >= startDate && dateStr <= endDate) {
            hasLeave = true;
            leaveStatus = leave.leavestatus || leave.status;
          }
        }
      });
    }

    // Process travel data
    if (annotationData.travelData && Array.isArray(annotationData.travelData)) {
      annotationData.travelData.forEach(travel => {
        // Check if travel applies to this date and has approved status
        const travelStatus = (travel.travelstatus || travel.status || travel.TRAVELSTATUS || '').toLowerCase();
        const isApproved = travelStatus === 'approved';
        
        if (!isApproved) return; // Only process approved travels (exclude "For Approval")
        
        // Check if employee is a participant in this travel (has records in employee_travels_dates)
        const isParticipant = travelRecordIncludesEmployee(travel, employeeObjId, userId);
        if (!isParticipant) {
          // Debug: log why participant check failed
          if (i < 3 && dateStr.includes('01')) {
            console.log(`🔍 [TRAVEL DEBUG] Date ${dateStr}: Travel ${travel.travelno || 'N/A'} - Not a participant`, {
              employeeObjId,
              userId,
              employees_data: travel.employees_data,
              participantEmpObjIds: travel.participantEmpObjIds
            });
          }
          return;
        }
        
        // Collect all travel dates from various formats
        const travelDates = new Set();
        
        // Helper to normalize and add date
        const normalizeTravelDate = (val) => {
          if (!val) return null;
          
          let dateStr = null;
          
          if (typeof val === 'string') {
            const trimmed = val.trim();
            
            // Handle ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
            if (trimmed.includes('T')) {
              dateStr = trimmed.split('T')[0];
            } else if (trimmed.includes(' ')) {
              dateStr = trimmed.split(' ')[0];
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
              // Already in YYYY-MM-DD format
              dateStr = trimmed;
            } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
              // Handle MM/DD/YYYY format (from backend travel_dates)
              const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
              if (match) {
                const [, month, day, year] = match;
                dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }
            } else {
              dateStr = trimmed;
            }
          } else if (val && typeof val === 'object') {
            // Handle date objects or entries with TRAVELDATE/traveldate
            const dateValue = val.TRAVELDATE || val.traveldate || val.date;
            if (dateValue) {
              return normalizeTravelDate(dateValue);
            }
          }
          
          // Validate and return normalized date
          if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
          }
          
          return null;
        };
        
        const addTravelDate = (val) => {
          const normalized = normalizeTravelDate(val);
          if (normalized) {
            travelDates.add(normalized);
          }
        };
        
        // Check travelDates array
        if (Array.isArray(travel.travelDates)) {
          travel.travelDates.forEach(entry => {
            if (entry && typeof entry === 'object') {
              addTravelDate(entry.TRAVELDATE || entry.traveldate);
            } else {
              addTravelDate(entry);
            }
          });
        }
        
        // Check travel_dates_array
        if (Array.isArray(travel.travel_dates_array)) {
          travel.travel_dates_array.forEach(addTravelDate);
        }
        
        // Check normalizedTravelDates
        if (Array.isArray(travel.normalizedTravelDates)) {
          travel.normalizedTravelDates.forEach(addTravelDate);
        }
        
        // Check travel_dates string (comma-separated)
        if (typeof travel.travel_dates === 'string') {
          travel.travel_dates.split(',').forEach(part => {
            const trimmed = part.trim();
            if (trimmed) addTravelDate(trimmed);
          });
        }
        
        // Check single date fields
        if (travel.traveldate) addTravelDate(travel.traveldate);
        if (travel.TRAVELDATE) addTravelDate(travel.TRAVELDATE);
        
        // Fallback to date range if no specific dates found
        if (travelDates.size === 0) {
          let travelStart = null;
          let travelEnd = null;
          
          if (travel.travelstartdate) {
            if (travel.travelstartdate.includes('T')) {
              travelStart = travel.travelstartdate.split('T')[0];
            } else if (travel.travelstartdate.includes(' ')) {
              travelStart = travel.travelstartdate.split(' ')[0];
            } else {
              travelStart = travel.travelstartdate;
            }
          }
          
          if (travel.travelenddate) {
            if (travel.travelenddate.includes('T')) {
              travelEnd = travel.travelenddate.split('T')[0];
            } else if (travel.travelenddate.includes(' ')) {
              travelEnd = travel.travelenddate.split(' ')[0];
            } else {
              travelEnd = travel.travelenddate;
            }
          }
          
          // If we have a date range, check if current date falls within it
          if (travelStart && travelEnd && dateStr >= travelStart && dateStr <= travelEnd) {
            hasTravel = true;
          }
        } else {
          // Check if current date is in the collected travel dates
          if (travelDates.has(dateStr)) {
            hasTravel = true;
            // Debug: log when travel is found
            if (i < 3) {
              console.log(`✅ [TRAVEL DEBUG] Date ${dateStr}: Found travel match`, {
                travelNo: travel.travelno || 'N/A',
                travelDates: Array.from(travelDates),
                dateStr,
                hasTravel
              });
            }
          } else {
            // Debug: log when date doesn't match
            if (i < 3 && travelDates.size > 0) {
              console.log(`❌ [TRAVEL DEBUG] Date ${dateStr}: Travel dates don't match`, {
                travelNo: travel.travelno || 'N/A',
                travelDates: Array.from(travelDates),
                dateStr,
                match: travelDates.has(dateStr)
              });
            }
          }
        }
      });
    }

    // Process CDO data
    if (annotationData.cdoData && Array.isArray(annotationData.cdoData)) {
      annotationData.cdoData.forEach(cdo => {
        // CDO data structure: transactions have consumeEntries or usedDates arrays
        const entries = cdo.consumeEntries || cdo.usedDates || [];
        entries.forEach(entry => {
          // Only process approved entries
          const status = (entry.cdodatestatus || entry.status || '').toUpperCase();
          if (status !== 'APPROVED') return;
          
          const entryDate = entry.cdodate || entry.date || entry.formatted_cdodate;
          if (entryDate) {
            const entryDateStr = entryDate.split('T')[0];
            if (entryDateStr === dateStr) {
              hasCdo = true;
            }
          }
        });
      });
    }

    // Process holiday data
    if (annotationData.holidayData && Array.isArray(annotationData.holidayData)) {
      annotationData.holidayData.forEach(holiday => {
        // Check if holiday applies to this date
        const holidayDate = holiday.holidaydate ? holiday.holidaydate.split('T')[0] : null;
        if (holidayDate === dateStr) {
          hasHoliday = true;
          if (holiday.holidayname) {
            holidayNames.push(holiday.holidayname);
          }
          if (holiday.holidaydisplay) {
            holidayDisplay = holiday.holidaydisplay;
          }
          if (holiday.isworksuspension) {
            hasWorkSuspension = true;
          }
        }
      });
    }

    // Calculate days credit
    const timeLogCount = [AM_CHECKIN, AM_CHECKOUT, PM_CHECKIN, PM_CHECKOUT].filter(log => log && log.trim() !== '').length;
    const daysCredit = (isInPeriod && timeLogCount > 0 && !isWeekendDay) ? 1 : 0;

    // Debug logging for first few days with annotations
    if (i < 5 && (hasLeave || hasTravel || hasCdo || Object.values(locatorBackfill).some(v => v) || Object.values(fixLogBackfill).some(v => v))) {
      console.log(`🔍 Date ${dateStr} annotations:`, {
        hasLeave,
        hasTravel,
        hasCdo,
        locatorBackfill,
        fixLogBackfill,
        hasHoliday,
        annotationDataCounts: {
          locator: annotationData.locatorData?.length || 0,
          fixLogs: annotationData.fixLogsData?.length || 0,
          leave: annotationData.leaveData?.length || 0,
          travel: annotationData.travelData?.length || 0,
          cdo: annotationData.cdoData?.length || 0
        }
      });
    }

    processed.push({
      day,
      date: dateStr,
      dateStr: dateStr,
      amCheckIn: isInPeriod ? AM_CHECKIN : '',
      amCheckOut: isInPeriod ? AM_CHECKOUT : '',
      pmCheckIn: isInPeriod ? PM_CHECKIN : '',
      pmCheckOut: isInPeriod ? PM_CHECKOUT : '',
      lateMinutes: isInPeriod ? lateMinutes : 0,
      days: daysCredit,
      remarks: '',
      isWeekend: isWeekendDay,
      isInPeriod: isInPeriod,
      locatorBackfill,
      fixLogBackfill,
      remarkFlags: {
        hasLeave: hasLeave,
        hasTravel: hasTravel,
        hasCdo: hasCdo,
        // Only mark as absent if date is not in the future (past or today)
        isAbsent: timeLogCount === 0 && !isWeekendDay && isInPeriod && !hasLeave && !hasTravel && !hasCdo && !hasHoliday && dateStr <= new Date().toISOString().split('T')[0]
      },
      hasHoliday,
      holidayNames,
      holidayDisplay,
      hasWorkSuspension,
      leaveStatus,
      hasOBLeave
    });

    // Update totals
    if (isInPeriod && timeLogCount > 0 && !isWeekendDay) {
      totalDays++;
      totalLate += lateMinutes;
    }
  }

  return {
    processed,
    totals: { days: totalDays, late: totalLate }
  };
};

// Component for individual employee print with annotations
function GenerateDTRPrintReportWithAnnotations_Ind({ 
  employee, 
  selectedMonth, 
  selectedPeriod = 'full',
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [shiftSchedule, setShiftSchedule] = useState(null);
  const [timeLogs, setTimeLogs] = useState([]);
  const [processedLogs, setProcessedLogs] = useState([]);
  const [totals, setTotals] = useState({ days: 0, late: 0 });
  const [error, setError] = useState(null);
  const [companyInfo, setCompanyInfo] = useState({ lguDtrName: '' });
  const [annotationData, setAnnotationData] = useState({
    locatorData: [],
    fixLogsData: [],
    leaveData: [],
    travelData: [],
    cdoData: [],
    holidayData: []
  });

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

  // Fetch annotation data
  useEffect(() => {
    const employeeObjId = employee?.objid;
    if (!employeeObjId || !selectedMonth) return;

    const fetchAnnotationData = async () => {
      try {
        const monthDate = new Date(selectedMonth);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth() + 1;
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        // Fetch locator data
        try {
          const locatorResponse = await api.get('/employee-locators', {
            params: { emp_objid: employeeObjId }
          });
          setAnnotationData(prev => ({ ...prev, locatorData: locatorResponse.data?.data || [] }));
        } catch (err) {
          console.error('Error fetching locator data:', err);
        }

        // Fetch fix logs data
        try {
          const fixLogsResponse = await api.get('/dtr-fix-checktime', {
            params: { emp_objid: employeeObjId, startDate, endDate }
          });
          setAnnotationData(prev => ({ ...prev, fixLogsData: fixLogsResponse.data?.data || [] }));
        } catch (err) {
          console.error('Error fetching fix logs data:', err);
        }

        // Fetch leave data
        try {
          const leaveResponse = await api.get(`/employee-leave-transactions/${employeeObjId}`);
          const transactions = Array.isArray(leaveResponse.data) ? leaveResponse.data : (leaveResponse.data?.data || []);
          setAnnotationData(prev => ({ ...prev, leaveData: transactions }));
        } catch (err) {
          console.error('Error fetching leave data:', err);
        }

        // Fetch travel data
        try {
          const travelResponse = await api.get('/employee-travels/transactions', {
            params: { emp_objid: employeeObjId, startDate, endDate }
          });
          setAnnotationData(prev => ({ ...prev, travelData: travelResponse.data?.data || [] }));
        } catch (err) {
          console.error('Error fetching travel data:', err);
        }

        // Fetch CDO data
        try {
          const cdoResponse = await api.get('/dtr/employee-cdo/transactions', {
            params: { 
              emp_objid: employeeObjId, 
              from: startDate, 
              to: endDate,
              includeEntries: 1
            }
          });
          const records = (Array.isArray(cdoResponse.data?.data) && cdoResponse.data.data) ||
                          (Array.isArray(cdoResponse.data) && cdoResponse.data) ||
                          [];
          setAnnotationData(prev => ({ ...prev, cdoData: records }));
        } catch (err) {
          console.error('Error fetching CDO data:', err);
        }

        // Fetch holiday data
        try {
          const holidayResponse = await api.get('/dtr-holidays');
          if (holidayResponse.data.success) {
            setAnnotationData(prev => ({ ...prev, holidayData: holidayResponse.data.data || [] }));
          }
        } catch (err) {
          console.error('Error fetching holiday data:', err);
        }
      } catch (error) {
        console.error('Error fetching annotation data:', error);
      }
    };

    fetchAnnotationData();
  }, [employee?.objid, selectedMonth]);

  // Fetch and process logs with annotations
  useEffect(() => {
    const employeeId = employee?.USERID;
    if (!employeeId || !selectedMonth) {
      setShiftSchedule(null);
      setTimeLogs([]);
      setProcessedLogs([]);
      setTotals({ days: 0, late: 0 });
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch shift schedule
        const shiftData = await getEmployeeShiftSchedule(employeeId);
        if (cancelled) return;
        setShiftSchedule(shiftData);

        // Calculate date range for data fetching
        const dataDateRange = calculateDateRangeByPeriod(selectedMonth, selectedPeriod);
        if (!dataDateRange) {
          throw new Error('Invalid date range calculation');
        }

        // Fetch time logs
        const logsResponse = await api.get(`/logs/${employeeId}`, {
          params: { startDate: dataDateRange.startDateStr, endDate: dataDateRange.endDateStr }
        });
        if (cancelled) return;
        const logsData = Array.isArray(logsResponse.data) ? logsResponse.data : [];
        setTimeLogs(logsData);

        // Process logs with annotations
        const displayDateRange = getAllDaysOfMonth(selectedMonth);
        console.log('🔍 Processing logs with annotations:', {
          logsCount: logsData.length,
          annotationDataCounts: {
            locator: annotationData.locatorData?.length || 0,
            fixLogs: annotationData.fixLogsData?.length || 0,
            leave: annotationData.leaveData?.length || 0,
            travel: annotationData.travelData?.length || 0,
            cdo: annotationData.cdoData?.length || 0,
            holiday: annotationData.holidayData?.length || 0
          }
        });
        
        const employeeObjId = employee?.objid;
        // Use employee's dtruserid (USERID) for travel participant check, not the logged-in user's id
        const userId = employee?.USERID || employee?.dtruserid || user?.id || user?.USERID;
        
        const result = processLogsWithAnnotations(
          logsData, 
          shiftData, 
          displayDateRange.startDate, 
          displayDateRange.endDate, 
          selectedPeriod,
          annotationData,
          selectedMonth,
          employeeObjId,
          userId
        );
        
        console.log('✅ Processed logs result:', {
          processedCount: result.processed.length,
          sampleLog: result.processed.find(log => log.remarkFlags?.hasTravel || log.remarkFlags?.hasLeave || log.remarkFlags?.hasCdo) || result.processed[0]
        });
        
        setProcessedLogs(result.processed);
        setTotals(result.totals);
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
  }, [employee?.USERID, selectedMonth, selectedPeriod, annotationData]);

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    
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
              
              .col-day { width: 6%; }
              .col-am-arrival { width: 13%; }
              .col-am-departure { width: 13%; }
              .col-pm-arrival { width: 13%; }
              .col-pm-departure { width: 13%; }
              .col-undertime-hours { width: 6%; }
              .col-undertime-minutes { width: 6%; }
              .col-days { width: 7%; }
              .col-late { width: 7%; }
              
              .weekend-day {
                color: #0066cc !important;
                font-weight: bold;
              }
              
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
            <h3 className="text-lg font-bold">{employee.NAME}</h3>
            <p className="text-sm">NAME</p>
            <p className="text-lg month-year">
              For the month of: <span className="bold-month">{getMonthYearDisplayWithPeriod(selectedMonth, selectedPeriod)}</span>
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
                {processedLogs.map((log, index) => {
                  const amCheckInDisplay = renderTimeColumnWithAnnotations(log.amCheckIn, log, shiftSchedule, 'AM_CHECKIN', selectedAnnotations);
                  const amCheckOutDisplay = renderTimeColumnWithAnnotations(log.amCheckOut, log, shiftSchedule, 'AM_CHECKOUT', selectedAnnotations);
                  const pmCheckInDisplay = renderTimeColumnWithAnnotations(log.pmCheckIn, log, shiftSchedule, 'PM_CHECKIN', selectedAnnotations);
                  const pmCheckOutDisplay = renderTimeColumnWithAnnotations(log.pmCheckOut, log, shiftSchedule, 'PM_CHECKOUT', selectedAnnotations);
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className={`border border-gray-300 px-2 py-2 text-center text-xs ${log.isWeekend && selectedAnnotations.weekend ? 'weekend-day' : ''}`}>
                        {log.day}
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
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{totals.days}</td>
                  <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{totals.late}</td>
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

// Component for department/multiple employee print with annotations
function GenerateDTRPrintReportWithAnnotations_Dept({ 
  department, 
  selectedMonth, 
  selectedPeriod = 'full',
  selectedStatus = 'all',
  selectedAppointment = 'all',
  selectedEmployees = new Set(),
  departmentEmployees = [],
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [departmentData, setDepartmentData] = useState({});
  const [error, setError] = useState(null);
  const [processingData, setProcessingData] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({ lguDtrName: '' });

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    } else {
      console.warn('GenerateDTRPrintReportWithAnnotations_Dept: onClose handler not provided');
    }
  };

  const finalSelectedEmployees = selectedEmployees;

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

  // Fetch data for all selected employees
  useEffect(() => {
    if (selectedMonth && finalSelectedEmployees.size > 0) {
      fetchSelectedEmployeeData();
    }
  }, [department, selectedMonth, selectedPeriod, finalSelectedEmployees]);

  const fetchSelectedEmployeeData = async () => {
    console.log('🔄 Starting data fetch for selected employees with annotations...');
    setLoading(true);
    setProcessingData(true);
    setError(null);
    setDepartmentData({});

    try {
      const newDepartmentData = {};
      
      // Fetch holiday data once (shared for all employees)
      let sharedHolidayData = [];
      try {
        const holidayResponse = await api.get('/dtr-holidays');
        if (holidayResponse.data.success) {
          sharedHolidayData = holidayResponse.data.data || [];
        }
      } catch (err) {
        console.error('Error fetching holiday data:', err);
      }

      // Process each selected employee
      for (const employeeId of finalSelectedEmployees) {
        const employee = departmentEmployees.find(emp => emp.USERID === parseInt(employeeId));
        
        if (!employee) {
          console.warn(`⚠️ Employee with ID ${employeeId} not found`);
          continue;
        }

        const employeeObjId = employee.objid;
        if (!employeeObjId) {
          console.warn(`⚠️ Employee ${employee.NAME} has no objid`);
          continue;
        }

        console.log(`🔄 Processing employee: ${employee.NAME} (objid: ${employeeObjId})`);

        // Fetch shift schedule using helper function
        const shiftSchedule = await getEmployeeShiftSchedule(employee.USERID);
        console.log(`📅 Shift schedule for ${employee.NAME}:`, shiftSchedule ? 'Found' : 'Not found');

        // Fetch time logs
        const dataDateRange = calculateDateRangeByPeriod(selectedMonth, selectedPeriod);
        const logsResponse = await api.get(`/logs/${employee.USERID}`, {
          params: {
            startDate: dataDateRange.startDateStr,
            endDate: dataDateRange.endDateStr
          }
        });
        const logs = Array.isArray(logsResponse.data) ? logsResponse.data : [];
        console.log(`📊 Fetched ${logs.length} logs for ${employee.NAME} (USERID: ${employee.USERID})`);

        // Fetch annotation data for this employee
        const monthDate = new Date(selectedMonth);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth() + 1;
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        const annotationData = {
          locatorData: [],
          fixLogsData: [],
          leaveData: [],
          travelData: [],
          cdoData: [],
          holidayData: []
        };

        // Fetch locator data
        try {
          const locatorResponse = await api.get('/employee-locators', {
            params: { emp_objid: employeeObjId }
          });
          annotationData.locatorData = locatorResponse.data?.data || [];
        } catch (err) {
          console.error(`Error fetching locator data for ${employee.NAME}:`, err);
        }

        // Fetch fix logs data
        try {
          const fixLogsResponse = await api.get('/dtr-fix-checktime', {
            params: { emp_objid: employeeObjId, startDate, endDate }
          });
          annotationData.fixLogsData = fixLogsResponse.data?.data || [];
        } catch (err) {
          console.error(`Error fetching fix logs data for ${employee.NAME}:`, err);
        }

        // Fetch leave data
        try {
          const leaveResponse = await api.get(`/employee-leave-transactions/${employeeObjId}`);
          const transactions = Array.isArray(leaveResponse.data) ? leaveResponse.data : (leaveResponse.data?.data || []);
          annotationData.leaveData = transactions;
        } catch (err) {
          console.error(`Error fetching leave data for ${employee.NAME}:`, err);
        }

        // Fetch travel data
        try {
          const travelResponse = await api.get('/employee-travels/transactions', {
            params: { emp_objid: employeeObjId, startDate, endDate }
          });
          annotationData.travelData = travelResponse.data?.data || [];
        } catch (err) {
          console.error(`Error fetching travel data for ${employee.NAME}:`, err);
        }

        // Fetch CDO data
        try {
          const cdoResponse = await api.get('/dtr/employee-cdo/transactions', {
            params: { 
              emp_objid: employeeObjId, 
              from: startDate, 
              to: endDate,
              includeEntries: 1
            }
          });
          const records = (Array.isArray(cdoResponse.data?.data) && cdoResponse.data.data) ||
                          (Array.isArray(cdoResponse.data) && cdoResponse.data) ||
                          [];
          annotationData.cdoData = records;
        } catch (err) {
          console.error(`Error fetching CDO data for ${employee.NAME}:`, err);
        }

        // Use shared holiday data
        annotationData.holidayData = sharedHolidayData;

        // Process logs with annotations
        const displayDateRange = getAllDaysOfMonth(selectedMonth);
        console.log(`🔄 Processing logs for ${employee.NAME}:`, {
          logsCount: logs.length,
          displayDateRange: `${displayDateRange.startDate} to ${displayDateRange.endDate}`,
          selectedPeriod,
          hasSchedule: !!shiftSchedule
        });
        
        // employeeObjId is already declared above in the loop (line 1739)
        // Use employee's dtruserid (USERID) for travel participant check, not the logged-in user's id
        const userId = employee?.USERID || employee?.dtruserid || user?.id || user?.USERID;
        
        const processedResult = processLogsWithAnnotations(
          logs, 
          shiftSchedule, 
          displayDateRange.startDate, 
          displayDateRange.endDate, 
          selectedPeriod,
          annotationData,
          selectedMonth,
          employeeObjId,
          userId
        );

        console.log(`✅ Processed ${processedResult.processed.length} days for ${employee.NAME}`, {
          processedDaysWithLogs: processedResult.processed.filter(p => p.amCheckIn || p.amCheckOut || p.pmCheckIn || p.pmCheckOut).length,
          totals: processedResult.totals
        });

        newDepartmentData[employee.USERID] = {
          employee,
          shiftSchedule,
          logs,
          processed: processedResult.processed,
          totals: processedResult.totals,
          annotationData
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

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    
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
              
              .page-break {
                page-break-before: always;
                page-break-inside: avoid;
                break-before: page;
                break-inside: avoid;
              }
              
              .page-break:first-child {
                page-break-before: auto;
                break-before: auto;
              }
              
              .employee-dtr-section {
                page-break-inside: avoid;
                break-inside: avoid;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
              }
              
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
              
              .employee-name {
                color: #0066cc !important;
                font-weight: bold;
                font-size: 11px;
              }
              
              .weekend-day {
                color: #0066cc !important;
                font-weight: bold;
              }
              
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
              
              .col-day { width: 6%; }
              .col-am-arrival { width: 13%; }
              .col-am-departure { width: 13%; }
              .col-pm-arrival { width: 13%; }
              .col-pm-departure { width: 13%; }
              .col-undertime-hours { width: 6%; }
              .col-undertime-minutes { width: 6%; }
              .col-days { width: 7%; }
              .col-late { width: 7%; }
              
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
          <h2 className="text-xl font-bold">DTR Print Preview - With Annotations ({finalSelectedEmployees.size} employees)</h2>
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
          {Object.keys(departmentData).length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-600 mb-4">
                No data available for the selected employees.
              </div>
            </div>
          ) : (
            Object.entries(departmentData).map(([employeeId, employeeData]) => (
              <div key={employeeId} className="mb-8 page-break employee-dtr-section">
                {/* Header */}
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
                      {(!employeeData.processed || !Array.isArray(employeeData.processed) || employeeData.processed.length === 0) ? (
                        <tr>
                          <td colSpan="9" className="border border-gray-300 px-2 py-2 text-center text-xs text-red-600">
                            No processed data available for this employee
                          </td>
                        </tr>
                      ) : (
                        employeeData.processed.map((log, index) => {
                          const amCheckInDisplay = renderTimeColumnWithAnnotations(log.amCheckIn, log, employeeData.shiftSchedule, 'AM_CHECKIN', selectedAnnotations);
                          const amCheckOutDisplay = renderTimeColumnWithAnnotations(log.amCheckOut, log, employeeData.shiftSchedule, 'AM_CHECKOUT', selectedAnnotations);
                          const pmCheckInDisplay = renderTimeColumnWithAnnotations(log.pmCheckIn, log, employeeData.shiftSchedule, 'PM_CHECKIN', selectedAnnotations);
                          const pmCheckOutDisplay = renderTimeColumnWithAnnotations(log.pmCheckOut, log, employeeData.shiftSchedule, 'PM_CHECKOUT', selectedAnnotations);
                        
                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className={`border border-gray-300 px-2 py-2 text-center text-xs ${log.isWeekend && selectedAnnotations.weekend ? 'weekend-day' : ''}`}>
                              {log.day}
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
                      })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-300 font-semibold totals-row">
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs">TOTAL</td>
                        <td colSpan="4" className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs"></td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{employeeData.totals.days}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-xs font-bold">{employeeData.totals.late}</td>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Main component that handles both individual and department printing
function GenerateDTRPrintReportWithAnnotations({ 
  employee = null,
  department = null,
  selectedMonth, 
  selectedPeriod = 'full',
  selectedStatus = 'all',
  selectedAppointment = 'all',
  selectedEmployees = new Set(),
  departmentEmployees = [],
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
  // If employee is provided, render individual component
  if (employee) {
    return (
      <GenerateDTRPrintReportWithAnnotations_Ind
        employee={employee}
        selectedMonth={selectedMonth}
        selectedPeriod={selectedPeriod}
        selectedAnnotations={selectedAnnotations}
        onClose={onClose}
      />
    );
  }

  // For department printing, render department component
  return (
    <GenerateDTRPrintReportWithAnnotations_Dept
      department={department}
      selectedMonth={selectedMonth}
      selectedPeriod={selectedPeriod}
      selectedStatus={selectedStatus}
      selectedAppointment={selectedAppointment}
      selectedEmployees={selectedEmployees}
      departmentEmployees={departmentEmployees}
      selectedAnnotations={selectedAnnotations}
      onClose={onClose}
    />
  );
}

export default GenerateDTRPrintReportWithAnnotations;

