import React, { useState, useEffect, useMemo } from 'react';
import {
  generateDateRange,
  isWeekend,
  extractTimeFromTimestamp,
  timeToMinutes,
  extractDateFromTimestamp,
  getEmployeeShiftSchedule
} from '../../utils/shiftScheduleUtils';
import api from '../../utils/api';
import { normalizeCdoUsageMap, getCdoEntriesForDate } from '../../utils/cdoUtils';
import { useAuth } from '../../authContext';

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

    const firstToken = trimmed.split(/[ T]/)[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(firstToken) ? firstToken : '';
  }

  return '';
};

const normalizeHolidayDateValue = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const isoWithTimeMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
    if (isoWithTimeMatch) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return `${isoWithTimeMatch[1]}-${isoWithTimeMatch[2]}-${isoWithTimeMatch[3]}`;
    }
  }

  return extractDate(value);
};

const getHolidayDateValue = (holiday) => {
  if (!holiday) return '';
  const candidates = [
    holiday?.HOLIDAYDATE,
    holiday?.holidaydate,
    holiday?.holiday_date,
    holiday?.HolidayDate,
    holiday?.date
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHolidayDateValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const getHolidayNameValue = (holiday) => {
  if (!holiday) return 'Holiday';
  const candidates = [
    holiday?.HOLIDAYNAME,
    holiday?.holidayname,
    holiday?.holiday_name,
    holiday?.HolidayName,
    holiday?.description,
    holiday?.name,
    holiday?.HOLIDAYDESC,
    holiday?.holidaydesc
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
  const recurringValue =
    holiday?.ISRECURRING ??
    holiday?.isRecurring ??
    holiday?.is_recurring ??
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

  const targetDate = extractDate(dateStr);
  if (!targetDate) return [];

  const targetMonthDay = targetDate.length >= 5 ? targetDate.slice(5, 10) : '';

  return holidayData.filter((holiday) => {
    const holidayDate = getHolidayDateValue(holiday);
    if (!holidayDate) return false;

    if (isHolidayRecurring(holiday)) {
      const holidayMonthDay = holidayDate.length >= 5 ? holidayDate.slice(5, 10) : '';
      return holidayMonthDay === targetMonthDay;
    }

    return holidayDate === targetDate;
  });
};

const getHolidayDisplayForDate = (holidayData, dateStr) => {
  const matchingHolidays = getHolidaysForDate(holidayData, dateStr);
  if (matchingHolidays.length === 0) return null;

  const names = matchingHolidays.map(getHolidayNameValue).filter(Boolean);
  const hasWorkSuspension = names.some((name) => typeof name === 'string' && name.toLowerCase().includes('work suspension'));

  return {
    records: matchingHolidays,
    names,
    display: hasWorkSuspension ? 'Work Suspension' : names.join(', '),
    hasWorkSuspension
  };
};

function ShiftSchedView_Management({ logs = [], selectedEmployee, onFetchLogs, startDate, endDate, viewType }) {
  const { user } = useAuth();
  
  const isRootAdmin =
    user?.isRootAdmin === true ||
    user?.usertype === 1 ||
    user?.usertype === '1' ||
    user?.usertype?.id === 1 ||
    user?.usertype?.id === '1' ||
    user?.usertype_id === 1 ||
    user?.usertype_id === '1' ||
    user?.role === 'Root Admin' ||
    user?.ROLE === 'Root Admin' ||
    user?.USERID === 1 ||
    user?.USERID === '1';

  console.log(' [SHIFT SCHED VIEW] Component rendered with props:', {
    selectedEmployee: selectedEmployee?.NAME,
    selectedEmployeeId: selectedEmployee?.USERID,
    startDate,
    endDate,
    shiftSchedule: shiftSchedule?.SHIFTNAME
  });
  const [processedLogs, setProcessedLogs] = useState([]);
  const [shiftSchedule, setShiftSchedule] = useState(null);
  const [locatorData, setLocatorData] = useState([]);
  const [loadingLocatorData, setLoadingLocatorData] = useState(false);
  const [fixLogsData, setFixLogsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leaveData, setLeaveData] = useState([]);
  const [holidayData, setHolidayData] = useState([]); // Add holiday data state
  const [travelData, setTravelData] = useState([]); // Add travel data state
  const [cdoUsageByDate, setCdoUsageByDate] = useState({});
  const [cdoDetailModalOpen, setCdoDetailModalOpen] = useState(false);
  const [selectedCdoEntry, setSelectedCdoEntry] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  console.log(' [SHIFT SCHED VIEW] Current leaveData state:', leaveData);

  // Fetch shift schedule for the selected employee
  useEffect(() => {
    const fetchSchedule = async () => {
      if (!selectedEmployee?.USERID) {
        setShiftSchedule(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        console.log('📅 Fetching shift schedule for USERID:', selectedEmployee.USERID);
        const shiftData = await getEmployeeShiftSchedule(selectedEmployee.USERID);
        console.log('📅 Extracted shift data:', shiftData);
        setShiftSchedule(shiftData);
      } catch (error) {
        console.error('❌ Error fetching shift schedule:', error);
        setShiftSchedule(null);
        setError('Failed to fetch shift schedule');
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [selectedEmployee?.USERID]);

  // Fetch locator data for the selected employee and date range
  useEffect(() => {
    const fetchLocatorData = async () => {
      if (!selectedEmployee?.USERID || !startDate || !endDate) {
        setLocatorData([]);
        return;
      }
      try {
        setLoadingLocatorData(true);
        const response = await api.get('/locator', {
          params: {
            employeeId: selectedEmployee.USERID,
            dateFrom: startDate,
            dateTo: endDate
          }
        });
        setLocatorData(response.data || []);
      } catch (error) {
        console.error('❌ Error fetching locator data:', error);
        setLocatorData([]);
      } finally {
        setLoadingLocatorData(false);
      }
    };
    fetchLocatorData();
  }, [selectedEmployee?.USERID, startDate, endDate]);

  // Load leave data - module deprecated
  useEffect(() => {
    setLeaveData([]);
  }, [selectedEmployee]);

  // Load holiday data
  useEffect(() => {
    const loadHolidayData = async () => {
      try {
        console.log('🚀 [HOLIDAY DEBUG] Starting to load holiday data');
        const currentYear = new Date().getFullYear();
        const response = await api.get('/dtr-holidays');
        console.log('📊 [HOLIDAY DEBUG] Holiday API response:', response);

        if (response.data.success) {
          const records = Array.isArray(response.data.data) ? response.data.data : [];
          const filtered = records.filter((holiday) => {
            const holidayDate = getHolidayDateValue(holiday);
            if (!holidayDate) return isHolidayRecurring(holiday);
            const holidayYear = holidayDate.slice(0, 4);
            return holidayYear === String(currentYear) || isHolidayRecurring(holiday);
          });
          console.log('✅ [HOLIDAY DEBUG] Holiday data loaded successfully from MySQL:', filtered.length, 'records (raw total:', records.length, ')');
          setHolidayData(filtered);
        } else {
          console.log('❌ [HOLIDAY DEBUG] Holiday API response not successful:', response.data);
          setHolidayData([]);
        }
      } catch (error) {
        console.error('❌ [HOLIDAY DEBUG] Error loading holiday data:', error);
        setHolidayData([]);
      }
    };

    loadHolidayData();
  }, []);

  // Load travel data
  useEffect(() => {
    const loadTravelData = async () => {
      try {
        console.log('🚀 [TRAVEL DEBUG] Starting to load travel data for employee:', selectedEmployee?.USERID);
        const response = await api.get('/employee-travels/transactions', {
          params: {
            participant: selectedEmployee?.USERID
          }
        });
       	console.log('📊 [TRAVEL DEBUG] Travel API response:', response);

        const records = response.data?.data || response.data || [];
        const normalized = normalizeTravelRecords(Array.isArray(records) ? records : []);
        console.log('✅ [TRAVEL DEBUG] Travel data loaded successfully:', normalized.length);
        setTravelData(normalized);
      } catch (error) {
        console.error('❌ [TRAVEL DEBUG] Error loading travel data:', error);
        setTravelData([]);
      }
    };

    if (selectedEmployee) {
      console.log('👤 [TRAVEL DEBUG] Selected employee changed, loading travel data');
      loadTravelData();
    } else {
      console.log('👤 [TRAVEL DEBUG] No employee selected, clearing travel data');
      setTravelData([]);
    }
  }, [selectedEmployee]);

  useEffect(() => {
    const loadCdoUsage = async () => {
      const userId = selectedEmployee?.USERID ? String(selectedEmployee.USERID) : null;
      const empObjId =
        selectedEmployee?.EMP_OBJID ||
        selectedEmployee?.emp_objid ||
        selectedEmployee?.OBJID ||
        selectedEmployee?.objid ||
        null;

      if (!userId && !empObjId) {
        setCdoUsageByDate({});
        return;
      }

      try {
        const params = { includeEntries: 1 };
        if (empObjId) params.emp_objid = empObjId;
        if (userId) params.user_id = userId;
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
          employeeObjId: empObjId,
          userId
        });
        setCdoUsageByDate(usageMap);
        console.log('✅ [SHIFT SCHED] CDO usage entries loaded:', Object.keys(usageMap).length);
      } catch (error) {
        console.error('❌ [SHIFT SCHED] Error loading CDO usage:', error);
        setCdoUsageByDate({});
      }
    };

    loadCdoUsage();
  }, [selectedEmployee, startDate, endDate]);

  // Fetch fix logs data from employee_fixchecktimes
  useEffect(() => {
    const fetchFixLogsData = async () => {
      const empObjId =
        selectedEmployee?.EMP_OBJID ||
        selectedEmployee?.emp_objid ||
        selectedEmployee?.OBJID ||
        selectedEmployee?.objid ||
        null;

      if (!empObjId) {
        setFixLogsData([]);
        return;
      }
      try {
        const params = { emp_objid: empObjId };
        if (startDate) params.dateFrom = startDate;
        if (endDate) params.dateTo = endDate;
        const response = await api.get('/dtr-fix-checktime', { params });
        const records = response.data?.data || response.data || [];
        setFixLogsData(Array.isArray(records) ? records : []);
        console.log('✅ [SHIFT SCHED] Fix logs data loaded:', Array.isArray(records) ? records.length : 0);
      } catch (error) {
        console.error('❌ [SHIFT SCHED] Error loading fix logs data:', error);
        setFixLogsData([]);
      }
    };
    fetchFixLogsData();
  }, [selectedEmployee, startDate, endDate]);

  // Helper: Get locator remarks for a specific date
  const getLocatorRemarksForDate = (dateStr) => {
    if (!locatorData || locatorData.length === 0) return null;
    const locatorsForDate = locatorData.filter(locator => {
      const locDate = extractDateFromTimestamp(locator.LOCDATE);
      return locDate === dateStr && String(locator.LOCUSERID) === String(selectedEmployee.USERID);
    });

    if (locatorsForDate.length === 0) return null;
    return locatorsForDate.map(locator => {
      return `Locator(${locator.LOCNO})`;
    }).join('; ');
  };

  // Helper: Get leave remarks for a specific date - returns both remarks and records
  const getLeaveRemarksForDate = (dateStr) => {
    if (!leaveData || leaveData.length === 0) {
      return { remarks: '', records: [] };
    }
    
    const leavesForDate = leaveData.filter(leave => {
      // Comprehensive date extraction and comparison
      let leaveDate;
      
      if (leave.LEAVEDATE) {
        try {
          // Create a Date object to handle all possible formats
          const dateObj = new Date(leave.LEAVEDATE);
          
          // Check if the date is valid
          if (isNaN(dateObj.getTime())) {
            return false;
          }
          
          // Convert to YYYY-MM-DD format using local timezone
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          leaveDate = `${year}-${month}-${day}`;
        } catch (error) {
          return false;
        }
      } else {
        return false;
      }
      
      const matchesDate = leaveDate === dateStr;
      const matchesUser = String(leave.USERID) === String(selectedEmployee?.USERID);
      
      return matchesDate && matchesUser;
    });

    if (leavesForDate.length === 0) {
      return { remarks: '', records: [] };
    }
    
    // Only include approved leaves (exclude "For Approval")
    const approvedLeaves = leavesForDate.filter(leave => {
      const status = normalizeStatusLabel(leave.LEAVESTATUS || leave.status);
      return status === 'Approved';
    });
    
    const remarks = approvedLeaves.map(leave => {
      const leaveType = leave.LeaveName || 'Leave';
      const leaveRemarks = leave.LEAVEREMARKS || '';
      return leaveRemarks ? `Leave(${leaveType})` : leaveType;
    }).join('; ');
    
    return { remarks, records: approvedLeaves };
    return result;
  };

  const normalizeTravelStatus = (status) => {
    if (!status) return 'PENDING';
    return status.toString().toUpperCase().trim();
  };

  const getTravelReference = (record) => {
    return (
      record.travel_no ||
      record.travelno ||
      record.TRAVELNO ||
      record.reference_no ||
      record.reference ||
      record.cdono ||
      record.TRAVELUID ||
      ''
    );
  };

  const extractTravelDates = (record) => {
    const dateSet = new Set();

    const addDateValue = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(addDateValue);
        return;
      }
      if (typeof value === 'string') {
        value
          .split(/[,;]+/)
          .map((part) => part.trim())
          .forEach((part) => {
            if (part) {
              const normalized = extractDateFromTimestamp(part) || part;
              if (normalized) {
                dateSet.add(normalized);
              }
            }
          });
        return;
      }
      const normalized = extractDateFromTimestamp(value);
      if (normalized) {
        dateSet.add(normalized);
      }
    };

    const tryParseJson = (value) => {
      if (typeof value !== 'string') return;
      try {
        const parsed = JSON.parse(value);
        addDateValue(parsed);
      } catch {
        // ignore parse errors
      }
    };

    addDateValue(record.travel_dates);
    addDateValue(record.travelDates);
    addDateValue(record.travel_dates_array);
    addDateValue(record.travel_dates_list);
    addDateValue(record.travel_dates_raw);
    addDateValue(record.traveldate);
    addDateValue(record.TRAVELDATE);
    addDateValue(record.date);
    addDateValue(record.travel_date);

    tryParseJson(record.travel_dates_json);
    tryParseJson(record.travelDatesJson);
    tryParseJson(record.travel_dates_data);

    return Array.from(dateSet);
  };

  const extractTravelParticipants = (record) => {
    const participants = new Map();

    const addParticipant = (userId) => {
      if (userId === undefined || userId === null || userId === '') return;
      const key = String(userId);
      if (!participants.has(key)) {
        participants.set(key, { userId: key });
      }
    };

    addParticipant(record.USERID);
    addParticipant(record.userid);
    addParticipant(record.user_id);
    addParticipant(record.userId);

    const tryAddParticipantCollection = (collection) => {
      if (!Array.isArray(collection)) return;
      collection.forEach((item) => {
        addParticipant(item?.USERID ?? item?.userid ?? item?.user_id ?? item?.userId);
      });
    };

    tryAddParticipantCollection(record.employees);
    tryAddParticipantCollection(record.participants);

    if (record.employees_data) {
      if (Array.isArray(record.employees_data)) {
        tryAddParticipantCollection(record.employees_data);
      } else if (typeof record.employees_data === 'string') {
        try {
          const parsed = JSON.parse(record.employees_data);
          tryAddParticipantCollection(parsed);
        } catch {
          // ignore
        }
      }
    }

    if (Array.isArray(record.participantUserIds)) {
      record.participantUserIds.forEach(addParticipant);
    }

    return Array.from(participants.values());
  };

  const normalizeTravelRecords = (records) => {
    if (!Array.isArray(records)) return [];

    const normalized = [];

    records.forEach((record) => {
      const dates = extractTravelDates(record);
      const participants = extractTravelParticipants(record);
      if (dates.length === 0 || participants.length === 0) {
        return;
      }

      const reference = getTravelReference(record);
      const status = normalizeTravelStatus(
        record.status ||
          record.travelstatus ||
          record.TRAVELSTATUS ||
          record.STATUS ||
          record.approval_status
      );

      participants.forEach(({ userId }) => {
        dates.forEach((date) => {
          normalized.push({
            date,
            userId,
            reference,
            status,
            raw: record
          });
        });
      });
    });

    return normalized;
  };

  // Helper to get travel remarks for a specific date - FIXED to remove extra "Travel" word
  const getTravelRemarksForDate = (dateStr) => {
    if (!travelData || travelData.length === 0) return null;
    
    const travelsForDate = travelData.filter(travel => {
      return travel.date === dateStr && String(travel.userId) === String(selectedEmployee.USERID);
    });
    
    if (travelsForDate.length === 0) return null;
    
    // FIXED: Remove extra "Travel" word, just show the travel number
    return travelsForDate.map(travel => {
      const travelNo = travel.reference || 'N/A';
      return travelNo; // Changed from `Travel: ${travelNo}` to just `travelNo`
    }).join('; ');
  };

  const getCdoRemarksForDate = (dateStr) => {
    if (!cdoUsageByDate || !dateStr) {
      return { remarks: '', records: [] };
    }

    const entries = getCdoEntriesForDate(cdoUsageByDate, dateStr);
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

  // Normalize status label
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

  // Helper to get fix logs for a date - supports both Approved and For Approval statuses
  const getFixLogsForDate = (dateStr) => {
    if (!fixLogsData || fixLogsData.length === 0 || !dateStr) {
      return { fixLog: null, remarks: '' };
    }

    const empObjId =
      selectedEmployee?.EMP_OBJID ||
      selectedEmployee?.emp_objid ||
      selectedEmployee?.OBJID ||
      selectedEmployee?.objid ||
      null;

    const fixLogsForDate = fixLogsData.filter(fixLog => {
      const fixDate = extractDate(fixLog.checktimedate || fixLog.CHECKTIMEDATE);
      if (fixDate !== dateStr) return false;

      const status = normalizeStatusLabel(fixLog.fixstatus || fixLog.FIXSTATUS);
      if (status !== 'Approved' && status !== 'For Approval') return false;

      const matchesObjId =
        empObjId &&
        fixLog.emp_objid !== undefined &&
        fixLog.emp_objid !== null &&
        String(fixLog.emp_objid) === String(empObjId);

      return !empObjId || matchesObjId;
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
  const getFixLogsRemarksForDate = (dateStr) => {
    const { remarks } = getFixLogsForDate(dateStr);
    return remarks;
  };

  // Helper to check if date has existing Approved/For Approval remarks for Leave, Travel, CDO, or Locator
  const hasExistingRemarksForDate = (dateStr) => {
    if (!dateStr) return { hasRemarks: false, remarksText: '' };
    
    const locatorRemarks = getLocatorRemarksForDate(dateStr);
    const leaveRemarks = getLeaveRemarksForDate(dateStr);
    const travelRemarks = getTravelRemarksForDate(dateStr);
    const cdoRemarksData = getCdoRemarksForDate(dateStr);
    
    // Check if any of these have Approved or For Approval status
    // For locator, check if there are any approved locators
    const hasLocator = locatorRemarks && locatorRemarks.length > 0;
    
    // For leave, check status in leaveData
    const hasLeave = leaveData && leaveData.some(leave => {
      const leaveDate = extractDateFromTimestamp(leave.LEAVEDATE);
      if (leaveDate !== dateStr) return false;
      const status = normalizeStatusLabel(leave.LEAVESTATUS || leave.status);
      return (status === 'Approved' || status === 'For Approval') && String(leave.USERID) === String(selectedEmployee?.USERID);
    });
    
    // For travel, check status in travelData
    const hasTravel = travelData && travelData.some(travel => {
      if (travel.date !== dateStr || String(travel.userId) !== String(selectedEmployee?.USERID)) return false;
      const status = normalizeStatusLabel(travel.status);
      return status === 'Approved' || status === 'For Approval';
    });
    
    // For CDO, check if there are any records
    const hasCdo = cdoRemarksData.records && cdoRemarksData.records.length > 0;
    
    const remarksParts = [];
    if (hasLocator && locatorRemarks) remarksParts.push(locatorRemarks);
    if (hasLeave && leaveRemarks) remarksParts.push(leaveRemarks);
    if (hasTravel && travelRemarks) remarksParts.push(travelRemarks);
    if (hasCdo && cdoRemarksData.remarks) remarksParts.push(cdoRemarksData.remarks);
    
    return {
      hasRemarks: hasLocator || hasLeave || hasTravel || hasCdo,
      remarksText: remarksParts.join('; ')
    };
  };

  const openCdoDetailModal = (entry) => {
    if (!entry) return;
    setSelectedCdoEntry(entry);
    setCdoDetailModalOpen(true);
  };

  const closeCdoDetailModal = () => {
    setCdoDetailModalOpen(false);
    setSelectedCdoEntry(null);
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

  // Helper to check if date has leave (for time column annotation)
  const hasLeaveForDate = (dateStr) => {
    if (!leaveData || leaveData.length === 0) return false;
    
    return leaveData.some(leave => {
      const leaveDate = extractDateFromTimestamp(leave.LEAVEDATE);
      return leaveDate === dateStr && String(leave.USERID) === String(selectedEmployee.USERID);
    });
  };

  // Helper to check if date has travel (for time column annotation)
  const hasTravelForDate = (dateStr) => {
    if (!travelData || travelData.length === 0) return false;
    
    return travelData.some(travel => {
      return travel.date === dateStr && String(travel.userId) === String(selectedEmployee.USERID);
    });
  };

  const normalizeLocatorDateTime = (value) => {
    if (!value) {
      return { date: '', time: '', minutes: null };
    }

    const strValue = typeof value === 'string' ? value : String(value);
    const date = extractDateFromTimestamp(strValue);
    const time = extractTimeFromTimestamp(strValue);
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

        const locatorDate = extractDateFromTimestamp(locator.locatordate || locator.LOCDATE);
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

    return processed.map((day) => {
      if (!day || !day.rawDate) {
        return day;
      }

      const locatorWindows = getApprovedLocatorWindowsForDate(locatorData, day.rawDate);
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

        if (hasExisting || !scheduleTime || scheduleMinutes === null) {
          locatorBackfill[key] = locatorBackfill[key] || false;
          return;
        }

        const withinWindow = locatorWindows.some((window) => {
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

  // Helper to apply fix logs to processed logs - only if no locator backfill exists
  const applyFixLogsToProcessedLogs = (processed) => {
    if (!Array.isArray(processed) || !fixLogsData || fixLogsData.length === 0) {
      return processed;
    }

    const empObjId =
      selectedEmployee?.EMP_OBJID ||
      selectedEmployee?.emp_objid ||
      selectedEmployee?.OBJID ||
      selectedEmployee?.objid ||
      null;

    return processed.map((day) => {
      if (!day || !day.rawDate) {
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
        return day;
      }

      const { fixLog } = getFixLogsForDate(day.rawDate);
      if (!fixLog) {
        return day;
      }

      const status = normalizeStatusLabel(fixLog.fixstatus || fixLog.FIXSTATUS);
      
      // Only override time values if status is "Approved"
      if (status !== 'Approved') {
        // For "For Approval" status, just track the fix log without overriding
        return {
          ...day,
          fixLog: fixLog,
          fixLogStatus: status
        };
      }

      const updatedDay = { ...day };
      const fixLogBackfill = {};

      // Override time values with fix log values (if not empty/null)
      const fieldMappings = [
        { dayField: 'amCheckIn', fixLogField: 'am_checkin' },
        { dayField: 'amCheckOut', fixLogField: 'am_checkout' },
        { dayField: 'pmCheckIn', fixLogField: 'pm_checkin' },
        { dayField: 'pmCheckOut', fixLogField: 'pm_checkout' }
      ];
      
      fieldMappings.forEach(({ dayField, fixLogField }) => {
        const fixLogValue = fixLog[fixLogField] || fixLog[fixLogField.toUpperCase()] || '';
        
        if (fixLogValue && fixLogValue.trim() !== '' && fixLogValue !== '-') {
          // Normalize time value to HH:mm format
          // Try extractTimeFromTimestamp first (for datetime strings), then try direct match for HH:mm format
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
      updatedDay.fixLogStatus = status;

      return updatedDay;
    });
  };

  // Main processing logic - using the same approach as GenerateDTRPrint_Ind
  useEffect(() => {
    if (
      !logs ||
      logs.length === 0 ||
      !startDate ||
      !endDate ||
      !shiftSchedule
    ) {
      setProcessedLogs([]);
      return;
    }

    console.log('🔄 Starting log processing...');
    console.log('📊 Input data:', { 
      logsCount: logs.length, 
      schedule: shiftSchedule, 
      startDate: startDate, 
      endDate: endDate 
    });

    const dateRange = generateDateRange(startDate, endDate);
    console.log('📅 Generated date range:', dateRange);

    const processedDays = dateRange.map(dateStr => {
      console.log(`\n📅 Processing day ${dateStr.split('-')[2]}: ${dateStr}`);
      
      // Filter logs for this specific date
      const dayLogs = logs.filter(log => {
        const rawTimestamp = log.CHECKTIME || log.DATE || log.date;
        const logDate = (extractDateFromTimestamp(rawTimestamp) || '').trim();
        return logDate === dateStr;
      });
      
      console.log(`📝 Found ${dayLogs.length} logs for ${dateStr}:`, dayLogs);

      if (dayLogs.length === 0) {
        const holidayInfo = getHolidayDisplayForDate(holidayData, dateStr);
        const holidayNameList = holidayInfo?.names || [];
        const holidayDisplay = holidayInfo?.display || '';
        const hasHoliday = holidayNameList.length > 0;
        const hasWorkSuspension = !!holidayInfo?.hasWorkSuspension;
        const holidaysForDate = holidayInfo?.records || [];
        const cdoRemarksData = getCdoRemarksForDate(dateStr);
        const cdoRemarks = cdoRemarksData.remarks;
        const cdoRecords = cdoRemarksData.records;
        const hasCdo = cdoRecords.length > 0;

        // Determine remarks for no logs scenario
        let remarks = '';
        if (isWeekend(dateStr)) {
          remarks = 'Weekend';
        } else if (hasHoliday) {
          // Leave remarks empty; holiday handled separately
        } else {
          // Check if current date to avoid marking as absent
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const currentDate = new Date(dateStr);
          currentDate.setHours(0, 0, 0, 0);
          const isCurrentDate = currentDate.getTime() === today.getTime();
          const isFutureDate = currentDate > today;
          
          // Only mark as absent if not current date, not future date, and no leave/travel
          const hasLeave = hasLeaveForDate(dateStr);
          const hasTravel = hasTravelForDate(dateStr);
          
          if (!isCurrentDate && !isFutureDate && !hasLeave && !hasTravel) {
            remarks = 'Absent';
          }
        }

        if (cdoRemarks) {
          remarks = remarks ? `${remarks}; ${cdoRemarks}` : cdoRemarks;
        }

        return {
          date: formatDateDisplay(dateStr),
          rawDate: dateStr,
          dateStr,
          amCheckIn: '',
          amCheckOut: '',
          pmCheckIn: '',
          pmCheckOut: '',
          lateMinutes: 0,
          days: 0,
          remarks,
          isWeekend: isWeekend(dateStr),
          hasHoliday,
          hasCdo,
          shiftSchedule: shiftSchedule.SHIFTNAME,
          holidayNames: holidayNameList,
          holidayDisplay,
          hasWorkSuspension,
          holidayRecords: holidaysForDate,
          hasLeave: hasLeaveForDate(dateStr),
          hasTravel: hasTravelForDate(dateStr),
          locatorBackfill: {},
          cdoRecords
        };
      }

      // Get active columns based on assigned shift
      const activeColumns = getActiveColumns(shiftSchedule);

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
        amCheckInWindow: buildWindow(shiftSchedule.SHIFT_AMCHECKIN_START, shiftSchedule.SHIFT_AMCHECKIN_END, '04:00', '11:59', activeColumns.hasAMCheckIn),
        amCheckOutWindow: buildWindow(shiftSchedule.SHIFT_AMCHECKOUT_START, shiftSchedule.SHIFT_AMCHECKOUT_END, '11:00', '12:30', activeColumns.hasAMCheckOut),
        pmCheckInWindow: buildWindow(shiftSchedule.SHIFT_PMCHECKIN_START, shiftSchedule.SHIFT_PMCHECKIN_END, '12:31', '14:00', activeColumns.hasPMCheckIn),
        pmCheckOutWindow: buildWindow(shiftSchedule.SHIFT_PMCHECKOUT_START, shiftSchedule.SHIFT_PMCHECKOUT_END, '14:01', '23:59', activeColumns.hasPMCheckOut)
      };

      console.log('⏰ Time windows (minutes):', timeWindows);

      const findInWindow = (window) => {
        const [start, end] = window;
        if (start === null || end === null) return [];
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

      // AM-CHECKIN: earliest in window (only if active)
      const amCheckInLogs = activeColumns.hasAMCheckIn ? findInWindow(timeWindows.amCheckInWindow) : [];
      const amCheckInLog = amCheckInLogs.length > 0 ? amCheckInLogs[0] : null;
      const amCheckInTime = amCheckInLog ? amCheckInLog.t : '';

      // AM-CHECKOUT: latest in window (only if active)
      const amCheckOutLogs = activeColumns.hasAMCheckOut ? findInWindow(timeWindows.amCheckOutWindow) : [];
      const amCheckOutLog = amCheckOutLogs.length > 0 ? amCheckOutLogs[amCheckOutLogs.length - 1] : null;
      const amCheckOutTime = amCheckOutLog ? amCheckOutLog.t : '';

      // PM-CHECKIN: earliest in window (only if active)
      const pmCheckInLogs = activeColumns.hasPMCheckIn ? findInWindow(timeWindows.pmCheckInWindow) : [];
      const pmCheckInLog = pmCheckInLogs.length > 0 ? pmCheckInLogs[0] : null;
      const pmCheckInTime = pmCheckInLog ? pmCheckInLog.t : '';

      // PM-CHECKOUT: latest in window (only if active)
      const pmCheckOutLogs = activeColumns.hasPMCheckOut ? findInWindow(timeWindows.pmCheckOutWindow).filter((log) => {
        const rawTimestamp = log.CHECKTIME || log.DATE || log.date;
        const logDate = extractDate(rawTimestamp);
        return logDate === dateStr;
      }) : [];
      const pmCheckOutLog = pmCheckOutLogs.length > 0 ? pmCheckOutLogs[pmCheckOutLogs.length - 1] : null;
      const pmCheckOutTime = pmCheckOutLog ? pmCheckOutLog.t : '';

      console.log('🔍 Found logs:', {
        amCheckIn: amCheckInLog ? amCheckInLog.CHECKTIME : null,
        amCheckOut: amCheckOutLog ? amCheckOutLog.CHECKTIME : null,
        pmCheckIn: pmCheckInLog ? pmCheckInLog.CHECKTIME : null,
        pmCheckOut: pmCheckOutLog ? pmCheckOutLog.CHECKTIME : null
      });

      console.log('⏰ Extracted times:', {
        amCheckInTime,
        amCheckOutTime,
        pmCheckInTime,
        pmCheckOutTime
      });

      // Calculate days credit - using active columns from assigned shift
      const calculateDays = (() => {
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

        // ✅ Full day credit (1.0) - based on active columns pattern
        // AMPM pattern: Only AM-IN + PM-OUT active
        if (activeColumns.hasAMCheckIn && activeColumns.hasPMCheckOut && 
            !activeColumns.hasAMCheckOut && !activeColumns.hasPMCheckIn &&
            hasAMCheckIn && hasPMCheckOut) {
          console.log('✅ [DAYS CALC] Full day credit (1.0) - AMPM pattern');
          return 1.0;
        }

        // Full 4-log pattern: All 4 columns active and all logs present
        if (activeColumns.hasAMCheckIn && activeColumns.hasAMCheckOut && 
            activeColumns.hasPMCheckIn && activeColumns.hasPMCheckOut &&
            hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) {
          console.log('✅ [DAYS CALC] Full day credit (1.0) - All 4 logs');
          return 1.0;
        }

        // ✅ Half day credit (0.5) - AM only or PM only (if both check-in and check-out are active)
        if (activeColumns.hasAMCheckIn && activeColumns.hasAMCheckOut && 
            !activeColumns.hasPMCheckIn && !activeColumns.hasPMCheckOut &&
            hasAMCheckIn && hasAMCheckOut) {
          console.log('✅ [DAYS CALC] Half day credit (0.5) - AM only');
          return 0.5;
        }

        if (!activeColumns.hasAMCheckIn && !activeColumns.hasAMCheckOut && 
            activeColumns.hasPMCheckIn && activeColumns.hasPMCheckOut &&
            hasPMCheckIn && hasPMCheckOut) {
          console.log('✅ [DAYS CALC] Half day credit (0.5) - PM only');
          return 0.5;
        }

        // ❌ No credit
        console.log('❌ [DAYS CALC] No credit (0.0)');
        return 0.0;
      })();

      // Get remarks from locator, leave, travel, and holiday data
      // Check for Travel, Leave, CDO BEFORE calculating LATE - do not compute LATE if date has these remarks
      const holidayInfo = getHolidayDisplayForDate(holidayData, dateStr);
      const holidaysForDate = holidayInfo?.records || [];
      const holidayNameList = holidayInfo?.names || [];
      const holidayDisplay = holidayInfo?.display || '';
      const hasWorkSuspension = !!holidayInfo?.hasWorkSuspension;
      let remarks = isWeekend(dateStr) ? 'Weekend' : '';
      const locatorRemarks = getLocatorRemarksForDate(dateStr);
      const leaveRemarks = getLeaveRemarksForDate(dateStr);
      const travelRemarks = getTravelRemarksForDate(dateStr);
      const cdoRemarksData = getCdoRemarksForDate(dateStr);
      const cdoRemarks = cdoRemarksData.remarks;
      const cdoRecords = cdoRemarksData.records;
      const hasCdo = cdoRecords.length > 0;
      const hasTravel = hasTravelForDate(dateStr);
      const hasLeave = hasLeaveForDate(dateStr);

      // Calculate late minutes - only for active check-in columns
      // DO NOT compute LATE if the date has Travel, Leave, or CDO remarks
      const calculateLate = (() => {
        if (hasTravel || hasLeave || hasCdo) {
          return 0; // Do not compute LATE if date has Travel, Leave, or CDO
        }
        
        let lateMinutes = 0;
        
        // AM_CHECKIN late calculation - only if AM check-in is active
        if (activeColumns.hasAMCheckIn && amCheckInTime && shiftSchedule.SHIFT_AMCHECKIN) {
          const expectedAMTime = timeToMinutes(extractTimeFromTimestamp(shiftSchedule.SHIFT_AMCHECKIN));
          const actualAMTime = timeToMinutes(amCheckInTime);
          if (actualAMTime > expectedAMTime) {
            lateMinutes += actualAMTime - expectedAMTime;
          }
        }
        
        // PM_CHECKIN late calculation - only if PM check-in is active
        if (activeColumns.hasPMCheckIn && pmCheckInTime && shiftSchedule.SHIFT_PMCHECKIN) {
          const expectedPMTime = timeToMinutes(extractTimeFromTimestamp(shiftSchedule.SHIFT_PMCHECKIN));
          const actualPMTime = timeToMinutes(pmCheckInTime);
          if (actualPMTime > expectedPMTime) {
            lateMinutes += actualPMTime - expectedPMTime;
          }
        }
        
        return lateMinutes;
      })();

      console.log('📊 Day calculations:', { days: calculateDays, late: calculateLate });

      // Combine all remarks
      const allRemarks = [locatorRemarks, leaveRemarks, travelRemarks, cdoRemarks].filter(Boolean);
      
      // Fix logs remarks - only add if no other remarks exist (travel, leave, cdo, locator)
      const hasOtherRemarks = allRemarks.length > 0;
      const fixLogsRemarks = hasOtherRemarks ? '' : getFixLogsRemarksForDate(dateStr);
      
      if (allRemarks.length > 0) {
        remarks = remarks ? `${remarks}; ${allRemarks.join('; ')}` : allRemarks.join('; ');
      }
      
      if (fixLogsRemarks) {
        remarks = remarks ? `${remarks}; ${fixLogsRemarks}` : fixLogsRemarks;
      }

      // Check if employee has leave or travel for time column annotations
      // Note: hasLeave and hasTravel are already defined above from remarks
      const hasHoliday = holidayNameList.length > 0;

      const locatorWindows = getApprovedLocatorWindowsForDate(locatorData, dateStr);
      const amScheduleMinutes = shiftSchedule.SHIFT_AMCHECKIN ? timeToMinutes(shiftSchedule.SHIFT_AMCHECKIN) : null;
      const amOutScheduleMinutes = shiftSchedule.SHIFT_AMCHECKOUT ? timeToMinutes(shiftSchedule.SHIFT_AMCHECKOUT) : null;
      const pmInScheduleMinutes = shiftSchedule.SHIFT_PMCHECKIN ? timeToMinutes(shiftSchedule.SHIFT_PMCHECKIN) : null;
      const pmOutScheduleMinutes = shiftSchedule.SHIFT_PMCHECKOUT ? timeToMinutes(shiftSchedule.SHIFT_PMCHECKOUT) : null;

      const locatorBackfillFlags = {
        amCheckIn: isLocatorBackfillTime(amCheckInTime, amScheduleMinutes, locatorWindows),
        amCheckOut: isLocatorBackfillTime(amCheckOutTime, amOutScheduleMinutes, locatorWindows),
        pmCheckIn: isLocatorBackfillTime(pmCheckInTime, pmInScheduleMinutes, locatorWindows),
        pmCheckOut: isLocatorBackfillTime(pmCheckOutTime, pmOutScheduleMinutes, locatorWindows)
      };

      return {
        date: formatDateDisplay(dateStr),
        rawDate: dateStr,
        dateStr,
        amCheckIn: amCheckInTime,
        amCheckOut: amCheckOutTime,
        pmCheckIn: pmCheckInTime,
        pmCheckOut: pmCheckOutTime,
        lateMinutes: calculateLate,
        days: calculateDays,
        remarks,
        isWeekend: isWeekend(dateStr),
        hasHoliday,
        shiftSchedule: shiftSchedule.SHIFTNAME,
        hasLeave,
        hasTravel,
        hasCdo,
        holidayNames: holidayNameList,
        holidayDisplay,
        hasWorkSuspension,
        holidayRecords: holidaysForDate,
        locatorBackfill: locatorBackfillFlags,
        cdoRecords,
        leaveRecords
      };
    });

    console.log(' Final processed days:', processedDays);
    
    // Apply locator backfill first, then fix logs
    const afterLocatorBackfill = applyLocatorBackfillToProcessedLogs(processedDays, locatorData, shiftSchedule);
    const afterFixLogs = applyFixLogsToProcessedLogs(afterLocatorBackfill);
    
    setProcessedLogs(afterFixLogs);
  }, [logs, startDate, endDate, shiftSchedule, locatorData, leaveData, travelData, holidayData, cdoUsageByDate, fixLogsData]); // Add fixLogsData to dependencies

  // Render remarks with color for "Weekend" and holiday names
  const renderRemarks = (log) => {
    const remarksStr = log?.remarks;
    const holidayNames = Array.isArray(log?.holidayNames) ? log.holidayNames : [];
    const holidayText = log?.holidayDisplay || (holidayNames.length > 0 ? holidayNames.join(', ') : 'Holiday');
    const elements = [];

    if (log?.hasHoliday && holidayText) {
      elements.push(
        <div key="holiday" className="text-sm font-semibold text-red-600">
          {holidayText}
        </div>
      );
    }

    if (!remarksStr) {
      return elements.length > 0 ? elements : <span className="text-gray-400">-</span>;
    }

    const isWeekendDay = !!log?.isWeekend;

    const remarkNodes = remarksStr.split('; ').filter(Boolean).map((remark, i, arr) => {
      let color = '';
      const normalized = remark.toLowerCase();

      if (remark === 'Weekend' || isWeekendDay) {
        color = '#60a5fa';
      } else if (remark === 'Absent') {
        color = '#ea580c';
      } else if (normalized.startsWith('locator')) {
        color = '#ec4899';
      } else if (normalized.includes('leave')) {
        // Make leave remarks clickable
        const leaveRecords = Array.isArray(log?.leaveRecords) ? log.leaveRecords : [];
        if (leaveRecords.length > 0) {
          // Extract leave type from remark (e.g., "Leave(Vacation)" -> "Vacation")
          const leaveTypeMatch = remark.match(/^Leave\(([^)]+)\)$/i) || remark.match(/^Leave$/i);
          const leaveType = leaveTypeMatch ? (leaveTypeMatch[1] || '') : '';
          
          // Find matching leave record
          const matchingLeave = leaveRecords.find(leave => {
            const recordLeaveType = leave.LeaveName || leave.leave_type_name || '';
            return !leaveType || recordLeaveType === leaveType || recordLeaveType.toLowerCase() === leaveType.toLowerCase();
          }) || leaveRecords[0];
          
          if (matchingLeave) {
            return (
              <span key={i}>
                <button
                  type="button"
                  onClick={() => openLeaveModal(matchingLeave)}
                  className="underline cursor-pointer bg-transparent border-none p-0 text-left font-medium"
                  style={{ color: '#7c3aed', textDecorationColor: '#7c3aed' }}
                >
                  {remark}
                </button>
                {i < arr.length - 1 && '; '}
              </span>
            );
          }
        }
        color = '#7c3aed';
      } else if (normalized.includes('travel')) {
        color = '#16a34a';
      } else if (normalized.startsWith('cdo(')) {
        const cdoRecords = Array.isArray(log?.cdoRecords) ? log.cdoRecords : [];
        const refMatch = remark.match(/^CDO\(([^)]+)\)$/i);
        const cdoEntry = refMatch
          ? cdoRecords.find((record) => {
              const candidates = [
                record?.displayRef,
                record?.cdono,
                record?.CDONO
              ]
                .map((val) => (val !== undefined && val !== null ? String(val).trim() : ''))
                .filter(Boolean);
              return candidates.includes(refMatch[1]);
            }) || null
          : null;

        if (cdoEntry) {
          return (
            <span key={i}>
              <button
                type="button"
                onClick={() => openCdoDetailModal(cdoEntry)}
                className="underline cursor-pointer bg-transparent border-none p-0 text-left font-medium"
                style={{ color: '#0f766e', textDecorationColor: '#0f766e' }}
              >
                {remark}
              </button>
              {i < arr.length - 1 && '; '}
            </span>
          );
        }

        color = '#0f766e';
      } else if (remark === 'LogsFixed' || remark === 'FixOnProcess') {
        color = '#f59e0b'; // Amber/orange for fix logs
      }

      return (
        <span key={i} style={color ? { color } : undefined}>
          {remark}
          {i < arr.length - 1 && '; '}
        </span>
      );
    });

    elements.push(
      <div key="remarks">
        {remarkNodes}
      </div>
    );

    return elements.length > 0 ? elements : <span className="text-gray-400">-</span>;
  };

  const renderTimeCell = (value, log, columnType) => {
    const holidayNames = Array.isArray(log?.holidayNames) ? log.holidayNames : [];
    const holidayText = log?.holidayDisplay || (holidayNames.length > 0 ? holidayNames.join(', ') : '');
    const hasLeaveRecords = log?.hasLeave;
    const hasTravelRecords = log?.hasTravel;
    const hasCdoRecords = Array.isArray(log?.cdoRecords) ? log.cdoRecords.length > 0 : false;

    const showHolidayBadge = log?.hasHoliday && !!holidayText;
    
    // Map columnType to the field key used in backfill maps
    const fieldMap = {
      'AM_CHECKIN': 'amCheckIn',
      'AM_CHECKOUT': 'amCheckOut',
      'PM_CHECKIN': 'pmCheckIn',
      'PM_CHECKOUT': 'pmCheckOut',
      'amCheckIn': 'amCheckIn',
      'amCheckOut': 'amCheckOut',
      'pmCheckIn': 'pmCheckIn',
      'pmCheckOut': 'pmCheckOut'
    };
    const fieldKey = fieldMap[columnType];
    
    // Check if this field was overridden by locator backfill
    const isLocatorBackfill = fieldKey && log?.locatorBackfill && log.locatorBackfill[fieldKey] === true;
    
    // Check if this field was overridden by fix logs
    const isFixLogOverride = fieldKey && log?.fixLogBackfill && log.fixLogBackfill[fieldKey] === true;
    
    if (value) {
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
        const approvedByName = log?.fixLog?.approved_by_employee_name || 
                              log?.fixLog?.approvedByName || 
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
            {value}
            {badges}
          </span>
        );
      }
      
      return <span>{value}</span>;
    }

    if (log?.hasHoliday && holidayText) {
      return <span className="text-gray-400 font-medium">{holidayText}</span>;
    }

    if (hasLeaveRecords) {
      return <span className="text-gray-400">Leave</span>;
    }

    if (hasTravelRecords) {
      return <span className="text-gray-400">Travel</span>;
    }

    if (hasCdoRecords) {
      return <span className="text-gray-400">CDO</span>;
    }

    return <span>-</span>;
  };

  const getEmployeeObjId = () => {
    return (
      selectedEmployee?.emp_objid ||
      selectedEmployee?.EMP_OBJID ||
      selectedEmployee?.employee_objid ||
      selectedEmployee?.EMPLOYEE_OBJID ||
      selectedEmployee?.objid ||
      selectedEmployee?.OBJID ||
      null
    );
  };

  const deriveLogDate = (log) => {
    if (!log) return '';
    return (
      extractDate(log?.date) ||
      extractDate(log?.DATE) ||
      extractDate(log?.logDate) ||
      extractDate(log?.displayDate) ||
      extractDate(log?.DATE_RAW) ||
      (typeof log?.date === 'string' ? log.date : '')
    );
  };

  if (!selectedEmployee) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Please select an employee to view time logs.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Loading shift schedule...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!shiftSchedule) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-2">No shift schedule assigned to this employee.</p>
        <p className="text-sm text-gray-600">Please assign a shift schedule to view time logs.</p>
      </div>
    );
  }

  if (loadingLocatorData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Loading locator data...</p>
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
      <div className="mb-4 p-4 bg-gray-50 rounded">
        <h3 className="font-semibold text-lg mb-2">Shift Schedule: {shiftSchedule.SHIFTNAME}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium">AM Check-in:</span> {shiftSchedule.SHIFT_AMCHECKIN}
          </div>
          <div>
            <span className="font-medium">AM Check-out:</span> {shiftSchedule.SHIFT_AMCHECKOUT}
          </div>
          <div>
            <span className="font-medium">PM Check-in:</span> {shiftSchedule.SHIFT_PMCHECKIN}
          </div>
          <div>
            <span className="font-medium">PM Check-out:</span> {shiftSchedule.SHIFT_PMCHECKOUT}
          </div>
        </div>
      </div>

      <table className="min-w-full bg-white border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-32">DATE</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-20">AM-CHECKIN</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-20">AM-CHECKOUT</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-20">PM-CHECKIN</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-20">PM-CHECKOUT</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-16">LATE</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-16">DAYS</th>
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold w-48">REMARKS</th>
            <th className="border border-gray-300 px-4 py-2 text-center font-semibold w-28">ACTION</th>
          </tr>
        </thead>
        <tbody>
          {processedLogs.map((log, index) => (
            <tr 
              key={index} 
              className={log.isWeekend ? 'text-blue-600 bg-blue-50' : ''}
            >
              <td className="border border-gray-300 px-4 py-2 w-32">{log.date}</td>
              <td className="border border-gray-300 px-4 py-2 w-20">
                {renderTimeCell(log.amCheckIn, log, 'AM_CHECKIN')}
              </td>
              <td className="border border-gray-300 px-4 py-2 w-20">
                {renderTimeCell(log.amCheckOut, log, 'AM_CHECKOUT')}
              </td>
              <td className="border border-gray-300 px-4 py-2 w-20">
                {renderTimeCell(log.pmCheckIn, log, 'PM_CHECKIN')}
              </td>
              <td className="border border-gray-300 px-4 py-2 w-20">
                {renderTimeCell(log.pmCheckOut, log, 'PM_CHECKOUT')}
              </td>
              <td className="border border-gray-300 px-4 py-2 w-16">{log.lateMinutes || 0}</td>
              <td className="border border-gray-300 px-4 py-2 w-16">{log.days || 0}</td>
              <td className="border border-gray-300 px-4 py-2 w-48">
                {renderRemarks(log)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {cdoDetailModalOpen && selectedCdoEntry && (
        <CdoDetailModal
          isOpen={cdoDetailModalOpen}
          onClose={closeCdoDetailModal}
          cdo={selectedCdoEntry}
        />
      )}

      {showLeaveModal && selectedLeave && (
        <LeaveDetailModal
          isOpen={showLeaveModal}
          onClose={closeLeaveModal}
          leave={selectedLeave}
          employees={[]}
        />
      )}
    </div>
  );
}

// Helper function to get employee name (simplified version)
const getEmployeeNameForLeave = (userId, employees = []) => {
  if (!userId) return 'N/A';
  const employee = employees.find(emp => String(emp.USERID) === String(userId));
  return employee?.NAME || 'N/A';
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
  const employeeName = getEmployeeNameForLeave(leave.USERID || leave.userid || leave.user_id, employees) || leave.NAME || 'N/A';
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
                <span className="text-base font-semibold text-gray-900">{employeeName}</span>
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
  const creditsEarned = displayValue(cdo.creditsEarned);
  const creditsUsed = displayValue(cdo.creditsUsed);
  const creditsUsedTotal = displayValue(cdo.creditsUsedTotal);
  const createdBy = displayValue(cdo.createdByName);
  const approver = displayValue(cdo.approverName);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">CDO Information</h2>
            <p className="text-sm text-gray-500 mt-1">Reference: {reference}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 text-sm">
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
              Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <span className="block text-gray-500 mb-1">Status</span>
                <span className="font-semibold text-teal-700">{status}</span>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <span className="block text-gray-500 mb-1">CDO Date</span>
                <span className="font-semibold text-gray-900">{useDate}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
              Details
            </h3>
            <div className="space-y-3">
              <div>
                <span className="block text-gray-500 mb-1">Title</span>
                <span className="font-semibold text-gray-900">{title}</span>
              </div>
              <div>
                <span className="block text-gray-500 mb-1">Purpose</span>
                <span className="text-gray-900 whitespace-pre-wrap">{purpose}</span>
              </div>
              <div>
                <span className="block text-gray-500 mb-1">Reason / Remarks</span>
                <span className="text-gray-900 whitespace-pre-wrap">{reason}</span>
              </div>
              {description !== 'N/A' && (
                <div>
                  <span className="block text-gray-500 mb-1">Description</span>
                  <span className="text-gray-900 whitespace-pre-wrap">{description}</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
              Credits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-teal-50 p-3 rounded">
                <span className="block text-teal-700 mb-1">Earned</span>
                <span className="font-semibold text-teal-900">{creditsEarned}</span>
              </div>
              <div className="bg-teal-50 p-3 rounded">
                <span className="block text-teal-700 mb-1">Used (Entry)</span>
                <span className="font-semibold text-teal-900">{creditsUsed}</span>
              </div>
              <div className="bg-teal-50 p-3 rounded">
                <span className="block text-teal-700 mb-1">Total Used</span>
                <span className="font-semibold text-teal-900">{creditsUsedTotal}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">
              System Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <span className="block text-gray-500 mb-1">Filed By</span>
                <span className="text-gray-900">{createdBy}</span>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <span className="block text-gray-500 mb-1">Approved By</span>
                <span className="text-gray-900">{approver}</span>
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

export default ShiftSchedView_Management;
