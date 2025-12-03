import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import DTROTModal from './DTROTModal';

// Extract OT date directly from ISO string (no timezone conversion)
// Normalized to match TimeLogsManagement extractDateSafe: extract directly from string, NO timezone conversion
// OT dates represent calendar dates, not specific moments in time
const extractOtDateFromString = (value) => {
  if (!value) return '';
  
  const str = String(value).trim();
  if (!str) return '';
  
  // Extract date directly from ISO string: "2025-11-27T16:00:00.000Z" → "2025-11-27"
  // Matches TimeLogsManagement extractDateSafe approach
  const dateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`; // Returns "YYYY-MM-DD"
  }
  
  return '';
};

const formatDisplayDate = (value) => {
  if (!value) return '';
  // For OT dates, extract directly from ISO string to avoid timezone conversion
  // Normalized to match TimeLogsManagement: NO Date object conversion
  const dateStr = extractOtDateFromString(value);
  if (dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`; // Returns "MM/DD/YYYY"
  }
  // If extraction fails, return empty string (no fallback to Date object to avoid timezone conversion)
  return '';
};

// Extract DATE value from CHECKTIME (returns "YYYY-MM-DD" format)
// Normalized to match TimeLogsManagement: extract directly from ISO string, NO timezone conversion
// This ensures dates match exactly as stored in database
const extractDateFromChecktime = (checktime) => {
  if (!checktime) return null;
  
  const str = String(checktime).trim();
  if (!str) return null;
  
  // Extract date directly from ISO string: "2025-11-27T18:10:22.000Z" → "2025-11-27"
  // Matches TimeLogsManagement extractDateSafe approach
  const dateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`; // Returns "YYYY-MM-DD"
  }
  
  // Try space-separated format: "2025-11-27 18:10:22"
  const spaceMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (spaceMatch) {
    return `${spaceMatch[1]}-${spaceMatch[2]}-${spaceMatch[3]}`; // Returns "YYYY-MM-DD"
  }
  
  return null;
};

// Format date as "YYYY-MM-DD" key for caching and API calls
// Normalized to match TimeLogsManagement: extract directly from ISO string, NO timezone conversion
const formatDateKey = (value) => {
  if (!value) return '';
  
  // Use normalized extraction function - NO Date object conversion
  const dateStr = extractOtDateFromString(value) || extractDateFromChecktime(value);
  if (dateStr) {
    return dateStr; // Already in "YYYY-MM-DD" format
  }
  
  // If extraction fails, return empty string (no fallback to Date object to avoid timezone conversion)
  return '';
};

// Extract TIME value from CHECKTIME (returns "HH:MM" format in 24-hour format)
// Normalized to match TimeLogsManagement extractTimeFromString: extract directly from ISO string, NO timezone conversion
// This ensures times match exactly as stored in database
// Use this for CHECKTIME logs from MSSQL CHECKINOUT table
const extractTimeFromChecktime = (checktime) => {
  if (!checktime) return null;
  
  const str = String(checktime);
  
  // If it's already in HH:MM format, return as is (matches TimeLogsManagement)
  if (/^\d{2}:\d{2}$/.test(str)) return str;
  
  // Extract time directly from ISO datetime string: "2025-11-27T18:09:57.000Z" → "18:09"
  // Matches TimeLogsManagement extractTimeFromString approach - NO timezone conversion
  const isoMatch = str.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2]}`; // Return "HH:MM" in 24-hour format
  }
  
  // Handle other datetime formats
  const match = str.match(/(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  
  return null;
};

// Extract TIME value from header times (ottimefrom/ottimeto)
// Now handles TIME datatype (HH:MM:SS format) directly, or legacy datetime strings
const extractTimeFromHeaderTime = (checktime) => {
  if (!checktime) return null;
  
  const str = String(checktime);
  
  console.log('[extractTimeFromHeaderTime] Input:', { checktime, str });
  
  // PRIORITY 1: Handle TIME datatype string (HH:MM:SS or HH:MM format) - extract directly
  // Database now uses TIME type, so values come as "18:05:00" or "18:05"
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const hours = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    const minutes = timeMatch[2];
    const result = `${hours}:${minutes}`;
    console.log('[extractTimeFromHeaderTime] Extracted from TIME string:', { str, result });
    return result;
  }
  
  // PRIORITY 2: Handle ISO datetime strings with timezone (Z, +, -) - convert UTC to local
  // Legacy support for datetime strings: "2025-11-27T14:00:00.000Z" → "22:00" local
  if (str.includes('T') && (str.includes('Z') || str.includes('+') || str.includes('-'))) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      // Convert from UTC to local time
      const hours = String(parsed.getHours()).padStart(2, '0');
      const minutes = String(parsed.getMinutes()).padStart(2, '0');
      const result = `${hours}:${minutes}`;
      
      console.log('[extractTimeFromHeaderTime] Parsed Date (legacy):', {
        originalISO: str,
        parsedUTC: parsed.toISOString(),
        localHours: parsed.getHours(),
        localMinutes: parsed.getMinutes(),
        result
      });
      
      return result;
    }
  }
  
  // PRIORITY 3: Fallback - extract time from any datetime string
  const fallback = extractTimeFromChecktime(checktime);
  console.log('[extractTimeFromHeaderTime] Fallback result:', fallback);
  return fallback;
};

// Format time label from TIME datatype (HH:MM:SS) or datetime strings
// Handles TIME strings directly (e.g., "18:05:00" → "18:05")
const formatTimeLabel = (value) => {
  if (!value) return '';
  
  // Handle Date objects
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  const str = String(value).trim();
  if (!str) return '';

  // PRIORITY 1: Handle TIME datatype strings (HH:MM:SS or HH:MM format)
  // Extract directly from time strings like "18:05:00" or "18:05"
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const hours = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    const minutes = timeMatch[2];
    return `${hours}:${minutes}`; // Returns "HH:MM" format
  }

  // PRIORITY 2: Handle ISO datetime strings with time component
  const isoMatch = str.match(/T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];

  // PRIORITY 3: Handle space-separated datetime strings
  const spaceMatch = str.match(/\s(\d{2}:\d{2})/);
  if (spaceMatch) return spaceMatch[1];

  // PRIORITY 4: Try to extract any HH:MM pattern
  const hhmmMatch = str.match(/(\d{1,2}:\d{2})/);
  if (hhmmMatch) {
    const hours = String(parseInt(hhmmMatch[1].split(':')[0], 10)).padStart(2, '0');
    const minutes = hhmmMatch[1].split(':')[1];
    return `${hours}:${minutes}`;
  }

  return str;
};

// Helper: Convert "HH:MM" time string (24-hour format) to minutes of day for comparison
const timeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const combineDateAndTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;
  const dateKey = formatDateKey(dateValue);
  if (!dateKey) return null;
  return `${dateKey}T${timeValue}:00`;
};

// Calculate rendered hours from AM and PM time ranges
// Accepts TIME strings (HH:MM:SS or HH:MM) or datetime strings
const calculateRenderedHours = (amFrom, amTo, pmFrom, pmTo) => {
  let totalHours = 0;
  
  // Helper to convert TIME string or datetime string to minutes of day
  const toMinutes = (timeStr) => {
    if (!timeStr) return null;
    const str = String(timeStr).trim();
    
    // Handle TIME datatype strings (HH:MM:SS or HH:MM)
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
      return hours * 60 + minutes;
    }
    
    // Handle datetime strings - extract time component
    const d = new Date(timeStr);
    if (!Number.isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
    
    return null;
  };
  
  // Calculate AM hours
  if (amFrom && amTo) {
    const amFromMinutes = toMinutes(amFrom);
    const amToMinutes = toMinutes(amTo);
    if (amFromMinutes !== null && amToMinutes !== null) {
      let amDiffMinutes = amToMinutes - amFromMinutes;
      // Handle case where time wraps around midnight
      if (amDiffMinutes < 0) {
        amDiffMinutes += 24 * 60; // Add 24 hours
      }
      if (amDiffMinutes > 0) {
        totalHours += amDiffMinutes / 60;
      }
    }
  }
  
  // Calculate PM hours
  if (pmFrom && pmTo) {
    const pmFromMinutes = toMinutes(pmFrom);
    const pmToMinutes = toMinutes(pmTo);
    if (pmFromMinutes !== null && pmToMinutes !== null) {
      let pmDiffMinutes = pmToMinutes - pmFromMinutes;
      // Handle case where time wraps around midnight
      if (pmDiffMinutes < 0) {
        pmDiffMinutes += 24 * 60; // Add 24 hours
      }
      if (pmDiffMinutes > 0) {
        totalHours += pmDiffMinutes / 60;
      }
    }
  }
  
  return totalHours > 0 ? totalHours : 0;
};

const extractMinutesOfDay = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.getHours() * 60 + value.getMinutes();
  }

  const str = String(value);

  // Try ISO string first
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getHours() * 60 + parsed.getMinutes();
  }

  const isoMatch = str.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const hours = Number(isoMatch[1]);
    const minutes = Number(isoMatch[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  const spaceMatch = str.match(/\s(\d{2}):(\d{2})/);
  if (spaceMatch) {
    const hours = Number(spaceMatch[1]);
    const minutes = Number(spaceMatch[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  const hhmmMatch = str.match(/^(\d{1,2}):(\d{2})/);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  return null;
};

const processDtrLogsForOtDate = (dtrLogs, otDate, timeFrom, timeTo) => {
  if (!dtrLogs || dtrLogs.length === 0 || !timeFrom || !timeTo) {
    return {
      amFrom: null,
      amTo: null,
      pmFrom: null,
      pmTo: null,
      renderedHours: 0,
    };
  }

  // Step 1: Extract TIME from header window (ottimefrom/ottimeto) - should be in "HH:MM" format
  console.log('[processDtrLogsForOtDate] Header times - Original (raw):', { 
    timeFrom, 
    timeTo,
    timeFromType: typeof timeFrom,
    timeToType: typeof timeTo,
    timeFromValue: String(timeFrom),
    timeToValue: String(timeTo)
  });
  const headerFromTime = extractTimeFromHeaderTime(timeFrom); // Extract "HH:MM" from ottimefrom (UTC→local conversion)
  const headerToTime = extractTimeFromHeaderTime(timeTo);     // Extract "HH:MM" from ottimeto (UTC→local conversion)
  console.log('[processDtrLogsForOtDate] Header times - Extracted:', { 
    headerFromTime, 
    headerToTime,
    headerFromMinutes: timeToMinutes(headerFromTime),
    headerToMinutes: timeToMinutes(headerToTime)
  });
  if (!headerFromTime || !headerToTime) {
    return {
      amFrom: null,
      amTo: null,
      pmFrom: null,
      pmTo: null,
      renderedHours: 0,
    };
  }

  // Convert header times to minutes for comparison
  const headerFromMinutes = timeToMinutes(headerFromTime);
  const headerToMinutes = timeToMinutes(headerToTime);
  console.log('[processDtrLogsForOtDate] Header times - Minutes:', { headerFromMinutes, headerToMinutes });
  if (headerFromMinutes === null || headerToMinutes === null) {
    return {
      amFrom: null,
      amTo: null,
      pmFrom: null,
      pmTo: null,
      renderedHours: 0,
    };
  }

  // Step 2: Extract DATE from OT date (extract directly from ISO string, no timezone conversion)
  // OT dates represent calendar dates, so extract "YYYY-MM-DD" directly from string
  const otDateKey = extractOtDateFromString(otDate) || extractDateFromChecktime(otDate); // Returns "YYYY-MM-DD"
  if (!otDateKey) {
    return {
      amFrom: null,
      amTo: null,
      pmFrom: null,
      pmTo: null,
      renderedHours: 0,
    };
  }

  // Step 3: Filter logs with two-step comparison
  // STEP 1: Filter by DATE - Compare extracted CHECKTIME date to OT date
  // STEP 2: Filter by TIME - Compare extracted CHECKTIME time (HH:MM) to header window (HH:MM)
  console.log('[processDtrLogsForOtDate] Processing DTR logs, count:', dtrLogs.length);
  const matchingLogs = dtrLogs
    .map((log) => {
      const checktime = log.CHECKTIME || log.checktime;
      
      // STEP 1: Extract DATE from CHECKTIME (extract directly from ISO string, no timezone conversion)
      // CHECKTIME dates represent calendar dates, same as OT dates, so extract directly from string
      // Matches TimeLogsManagement extractDateSafe approach: NO timezone conversion
      // Example: '2025-11-27T18:09:57.000Z' → extracts '2025-11-27' directly
      const logDate = extractDateFromChecktime(checktime);
      
      // STEP 2: Extract TIME from CHECKTIME
      // For CHECKTIME logs from MSSQL, extract time directly from ISO string without conversion
      // Matches TimeLogsManagement approach: extract directly from string, NO timezone conversion
      // Example: '2025-11-27T18:09:57.000Z' → extract '18:09' directly
      const logTimeStr = extractTimeFromChecktime(checktime);
      
      console.log('[processDtrLogsForOtDate] Log processing:', {
        rawChecktime: checktime,
        extractedDate: logDate,
        extractedTime: logTimeStr,
      });
      
      return {
        logDate,
        logTimeStr, // "HH:MM" format
        originalLog: log,
      };
    })
    .filter(({ logDate, logTimeStr }) => {
      // COMPARISON 1: Check if DATE matches OT date
      if (logDate !== otDateKey) {
        return false; // Reject: Date doesn't match
      }
      
      // COMPARISON 2: Check if TIME (HH:MM) is within header window (HH:MM)
      if (!logTimeStr) {
        return false; // Reject: Could not extract time
      }
      
      // Convert log time to minutes for numeric comparison
      const logTimeMinutes = timeToMinutes(logTimeStr);
      if (logTimeMinutes === null) {
        return false; // Reject: Could not parse time
      }
      
      // Compare log time to header time window
      const isWithinWindow = logTimeMinutes >= headerFromMinutes && logTimeMinutes <= headerToMinutes;
      if (!isWithinWindow) {
        console.log('[processDtrLogsForOtDate] Log rejected - outside window:', {
          logTimeStr,
          logTimeMinutes,
          headerFromMinutes,
          headerToMinutes,
          isWithinWindow,
        });
        return false; // Reject: Time is outside header window
      }
      
      console.log('[processDtrLogsForOtDate] Log accepted - within window:', {
        logTimeStr,
        logTimeMinutes,
        headerFromMinutes,
        headerToMinutes,
      });
      return true; // Accept: Both date and time match
    })
    .map(({ logTimeStr }) => timeToMinutes(logTimeStr)) // Convert to minutes for sorting and grouping
    .filter((minutes) => minutes !== null)
    .sort((a, b) => a - b); // Sort chronologically

  if (matchingLogs.length === 0) {
    return {
      amFrom: null,
      amTo: null,
      pmFrom: null,
      pmTo: null,
      renderedHours: 0,
    };
  }

  const minutesToLabel = (minutes) => {
    if (minutes === null) return null;
    const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mins = String(minutes % 60).padStart(2, '0');
    return `${hours}:${mins}`;
  };

  const AM_THRESHOLD = 12 * 60; // 12:00 PM in minutes
  const amLogs = matchingLogs.filter((minutes) => minutes < AM_THRESHOLD);
  const pmLogs = matchingLogs.filter((minutes) => minutes >= AM_THRESHOLD);

  const amFrom = amLogs.length ? minutesToLabel(Math.min(...amLogs)) : null;
  const amTo = amLogs.length ? minutesToLabel(Math.max(...amLogs)) : null;
  const pmFrom = pmLogs.length ? minutesToLabel(Math.min(...pmLogs)) : null;
  const pmTo = pmLogs.length ? minutesToLabel(Math.max(...pmLogs)) : null;

  const labelToMinutes = (label) => {
    if (!label) return null;
    const [hours, minutes] = label.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  const amDiff = amFrom && amTo ? Math.max(0, labelToMinutes(amTo) - labelToMinutes(amFrom)) : 0;
  const pmDiff = pmFrom && pmTo ? Math.max(0, labelToMinutes(pmTo) - labelToMinutes(pmFrom)) : 0;
  const renderedHours = (amDiff + pmDiff) / 60;

  return {
    amFrom,
    amTo,
    pmFrom,
    pmTo,
    renderedHours: renderedHours > 0 ? renderedHours : 0,
  };
};

const AvatarWithTooltip = ({ photo, name }) => {
  const initials = (name || 'NA')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasPhoto = !!photo && (photo.startsWith('data:') || photo.startsWith('http'));

  return (
    <div className="relative group" title={name || 'N/A'}>
      {hasPhoto && (
        <img
          src={photo}
          alt={name || 'Employee'}
          className="w-8 h-8 rounded-full object-cover border border-gray-200"
          onError={(e) => {
            e.target.style.display = 'none';
            const fallback = e.target.nextElementSibling;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      )}
      <div
        className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 border border-gray-200 ${
          hasPhoto ? 'hidden' : ''
        }`}
      >
        {initials}
      </div>
    </div>
  );
};

const ActionIconButton = ({ title, onClick, disabled, children, colorClass = 'text-blue-600 border-blue-200 hover:bg-blue-50' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`inline-flex items-center justify-center w-9 h-9 rounded-full border ${colorClass} transition disabled:opacity-50 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

const DTRComputeOT = () => {
  const { can, canAccessPage, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = 'dtr-compute-ot'; // Match the permissionId in DTROTtab
  
  // Check menu visibility first (canaccesspage=1)
  const canViewPage = canAccessPage(COMPONENT_ID);
  
  // CRUD permissions
  const componentPermissions = useMemo(
    () => ({
      read: can(COMPONENT_ID, 'read'),
      create: can(COMPONENT_ID, 'create'),
      update: can(COMPONENT_ID, 'update'),
      delete: can(COMPONENT_ID, 'delete'),
      print: can(COMPONENT_ID, 'print'),
    }),
    [can]
  );

  const { 
    read: canRead, 
    create: canCreate,
    update: canUpdate,
    delete: canDelete,
    print: canPrint
  } = componentPermissions;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ employee: '', otNo: '', dateFrom: '', dateTo: '' });
  const [otTypeMap, setOtTypeMap] = useState({});
  const [rowLoading, setRowLoading] = useState({});
  const [dtrLogsCache, setDtrLogsCache] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [modalTransaction, setModalTransaction] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [computingAll, setComputingAll] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Check if there are any rows with pending computed times (unsaved changes)
  const hasPendingChanges = useMemo(() => {
    return rows.some((row) => row.pendingComputedTimes);
  }, [rows]);

  const fetchOtTypes = useCallback(async () => {
    try {
      const response = await api.get('/dtr/employee-ot/types');
      const list = response.data?.data || [];
      const map = {};
      list.forEach((type) => {
        const label = type.name || type.typename || `Type ${type.id || ''}`;
        map[type.id] = label;
      });
      setOtTypeMap(map);
    } catch (error) {
      console.error('Failed to load OT types:', error);
    }
  }, []);

  const buildRowFromTransaction = (transaction, date, employeeMap) => {
    const employee = date.emp_objid ? employeeMap.get(date.emp_objid) : null;
    return {
      id: date.id,
      otid: transaction.otid,
      otno: transaction.otno,
      otdate: date.otdate,
      ottype: date.ottype,
      emp_objid: date.emp_objid,
      employee: employee || {
        emp_objid: transaction.emp_objid || date.emp_objid,
        name: transaction.employeeName || 'N/A',
        photo: transaction.employeePhoto || null,
      },
      headerTimeFrom: transaction.ottimefrom,
      headerTimeTo: transaction.ottimeto,
      am_timerendered_from: date.am_timerendered_from,
      am_timerendered_to: date.am_timerendered_to,
      pm_timerendered_from: date.pm_timerendered_from,
      pm_timerendered_to: date.pm_timerendered_to,
      otdatestatus: date.otdatestatus || 'Not Rendered',
    };
  };

  const fetchRows = useCallback(async () => {
    if (!canRead) return;
    try {
      setLoading(true);
      const response = await api.get('/dtr/employee-ot/transactions', {
        params: { status: 'Approved' },
      });
      const transactions = response.data?.data || [];
      const flattened = [];

      transactions.forEach((transaction) => {
        const employeeMap = new Map();
        if (Array.isArray(transaction.employees)) {
          transaction.employees.forEach((emp) => {
            if (emp.emp_objid) {
              employeeMap.set(emp.emp_objid, emp);
            }
          });
        } else if (transaction.emp_objid) {
          employeeMap.set(transaction.emp_objid, {
            emp_objid: transaction.emp_objid,
            name: transaction.employeeName,
            photo: transaction.employeePhoto,
          });
        }

        (transaction.otDates || []).forEach((date) => {
          flattened.push(buildRowFromTransaction(transaction, date, employeeMap));
        });
      });

      setRows(flattened);
    } catch (error) {
      console.error('Failed to load OT dates for compute tab:', error);
      alert(error.response?.data?.message || 'Failed to load OT dates');
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    fetchOtTypes();
    fetchRows();
  }, [canRead, fetchOtTypes, fetchRows]);

  const employeeOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (row.employee?.emp_objid && !map.has(row.employee.emp_objid)) {
        map.set(row.employee.emp_objid, row.employee.name || 'Unnamed Employee');
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filters.employee && row.employee?.emp_objid !== filters.employee) {
        return false;
      }
      if (filters.otNo && !(row.otno || '').toLowerCase().includes(filters.otNo.toLowerCase())) {
        return false;
      }
      // Extract date directly from ISO string without timezone conversion
      const rowDateStr = extractOtDateFromString(row.otdate);
      if (!rowDateStr) return false; // Skip if date cannot be extracted
      
      if (filters.dateFrom) {
        const fromDateStr = extractOtDateFromString(filters.dateFrom) || filters.dateFrom;
        if (rowDateStr < fromDateStr) return false; // Compare as strings "YYYY-MM-DD"
      }
      if (filters.dateTo) {
        const toDateStr = extractOtDateFromString(filters.dateTo) || filters.dateTo;
        if (rowDateStr > toDateStr) return false; // Compare as strings "YYYY-MM-DD"
      }
      return true;
    });
  }, [rows, filters]);

  const fetchDtrLogs = useCallback(
    async (empObjId, otDate) => {
      if (!empObjId || !otDate) return [];
      const dateKey = formatDateKey(otDate);
      const cacheKey = `${empObjId}:${dateKey}`;
      if (dtrLogsCache[cacheKey]) {
        return dtrLogsCache[cacheKey];
      }

      try {
        const response = await api.get(`/dtr/employee-ot/dtr-logs/${empObjId}/${dateKey}`);
        const logs = response.data?.data || [];
        setDtrLogsCache((prev) => ({ ...prev, [cacheKey]: logs }));
        return logs;
      } catch (error) {
        console.error('Failed to fetch DTR logs:', error);
        alert(error.response?.data?.message || 'Failed to fetch DTR logs');
        return [];
      }
    },
    [dtrLogsCache]
  );

  const computeRow = useCallback(
    async (row, { silent } = { silent: false }) => {
      console.group('[Compute OT Row]');
      console.log('Row info:', {
        id: row.id,
        emp_objid: row.emp_objid,
        employeeName: row.employee?.name,
        otdate: row.otdate,
        otno: row.otno,
        headerTimeFrom: row.headerTimeFrom,
        headerTimeTo: row.headerTimeTo,
      });

      setRowLoading((prev) => ({ ...prev, [row.id]: true }));
      try {
        const cacheKey = `${row.emp_objid}:${formatDateKey(row.otdate)}`;
        let logs = dtrLogsCache[cacheKey];
        if (!logs) {
          console.log('Fetching DTR logs for', cacheKey);
          logs = await fetchDtrLogs(row.emp_objid, row.otdate);
        } else {
          console.log('Using cached logs for', cacheKey, logs);
        }

        if (!logs.length) {
          console.warn('No logs found for cacheKey', cacheKey);
          if (!silent) alert('No DTR logs found for this employee on the selected OT date.');
          console.groupEnd();
          return { status: 'no-logs' };
        }

        console.log('[Compute OT Row] DTR logs received:', logs);
        console.log('[Compute OT Row] Processing with (raw header values):', {
          otDate: row.otdate,
          headerTimeFrom: row.headerTimeFrom,
          headerTimeTo: row.headerTimeTo,
          headerTimeFromType: typeof row.headerTimeFrom,
          headerTimeToType: typeof row.headerTimeTo,
          headerTimeFromStr: String(row.headerTimeFrom),
          headerTimeToStr: String(row.headerTimeTo),
        });

        const computed = processDtrLogsForOtDate(logs, row.otdate, row.headerTimeFrom, row.headerTimeTo);
        console.log('[Compute OT Row] Computed result:', computed);
        if (
          !computed.amFrom &&
          !computed.amTo &&
          !computed.pmFrom &&
          !computed.pmTo
        ) {
          console.warn('No logs within valid window for cacheKey', cacheKey);
          if (!silent) alert('No DTR logs were found within the allowed OT window.');
          console.groupEnd();
          return { status: 'out-of-range' };
        }

        setRows((prev) =>
          prev.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  pendingComputedTimes: computed,
                  pendingRenderedHours: computed.renderedHours,
                }
              : item
          )
        );

        console.groupEnd();
        return { status: 'success' };
      } catch (error) {
        console.error('Failed to compute OT date:', error);
        if (!silent) {
          alert(error.response?.data?.message || 'Failed to compute OT date');
        }
        console.groupEnd();
        return { status: 'error', error };
      } finally {
        setRowLoading((prev) => {
          const clone = { ...prev };
          delete clone[row.id];
          return clone;
        });
      }
    },
    [fetchDtrLogs, dtrLogsCache]
  );

  const handleCompute = async (row) => {
    if (!canUpdate) {
      alert('You do not have permission to compute OT.');
      return;
    }
    await computeRow(row);
  };

  const handleComputeAll = async () => {
    if (!canUpdate) {
      alert('You do not have permission to compute OT.');
      return;
    }
    if (renderedRows.length === 0) {
      alert('There are no OT records in the current list to compute.');
      return;
    }
    setComputingAll(true);
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const row of renderedRows) {
      console.group('[Compute All] Processing row', { rowId: row.id, otno: row.otno, otdate: row.otdate });
      const result = await computeRow(row, { silent: true });
      if (result.status === 'success') {
        successCount += 1;
      } else if (result.status === 'permission' || result.status === 'no-logs' || result.status === 'out-of-range') {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }
      console.groupEnd();
    }

    setComputingAll(false);
    const summary = [
      successCount ? `${successCount} computed` : null,
      skippedCount ? `${skippedCount} skipped` : null,
      failedCount ? `${failedCount} failed` : null,
    ]
      .filter(Boolean)
      .join(', ');

    alert(summary ? `Compute All finished: ${summary}.` : 'Compute All finished.');
  };

  const handleEdit = async (row) => {
    if (!canUpdate) {
      alert('You do not have permission to edit OT transactions.');
      return;
    }
    setModalLoading(true);
    try {
      const response = await api.get(`/dtr/employee-ot/transactions/${row.otid}`);
      setModalTransaction(response.data?.data || null);
      setShowModal(true);
    } catch (error) {
      console.error('Failed to load OT transaction for editing:', error);
      alert(error.response?.data?.message || 'Failed to load OT transaction');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalTransaction(null);
    fetchRows();
  };

  // Save all pending computed times to the database
  const handleSaveAll = async () => {
    if (!canUpdate) {
      alert('You do not have permission to save computed times.');
      return;
    }

    const rowsToSave = rows.filter((row) => row.pendingComputedTimes);
    if (rowsToSave.length === 0) {
      alert('No computed times to save.');
      return;
    }

    if (!confirm(`Save computed times for ${rowsToSave.length} record(s)?`)) {
      return;
    }

    setSaving(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      // Save each row's computed times
      for (const row of rowsToSave) {
        try {
          const computed = row.pendingComputedTimes;
          
          // Convert HH:MM to HH:MM:SS format for TIME datatype
          const formatTimeForDb = (timeStr) => {
            if (!timeStr) return null;
            const str = String(timeStr).trim();
            // If already in HH:MM:SS format, return as-is
            if (str.match(/^\d{1,2}:\d{2}:\d{2}$/)) return str;
            // If in HH:MM format, append :00
            if (str.match(/^\d{1,2}:\d{2}$/)) return `${str}:00`;
            return null;
          };

          const payload = {
            am_timerendered_from: formatTimeForDb(computed.amFrom),
            am_timerendered_to: formatTimeForDb(computed.amTo),
            pm_timerendered_from: formatTimeForDb(computed.pmFrom),
            pm_timerendered_to: formatTimeForDb(computed.pmTo),
            otdatestatus: 'Rendered',
          };

          await api.put(`/dtr/employee-ot/dates/${row.id}`, payload);
          successCount++;
        } catch (error) {
          console.error(`Failed to save row ${row.id}:`, error);
          errorCount++;
        }
      }

      // Clear pending computed times from state after successful save
      if (successCount > 0) {
        setRows((prev) =>
          prev.map((item) => {
            if (item.pendingComputedTimes) {
              const { pendingComputedTimes, pendingRenderedHours, ...rest } = item;
              // Update stored values with the computed times
              return {
                ...rest,
                am_timerendered_from: pendingComputedTimes.amFrom ? `${pendingComputedTimes.amFrom}:00` : null,
                am_timerendered_to: pendingComputedTimes.amTo ? `${pendingComputedTimes.amTo}:00` : null,
                pm_timerendered_from: pendingComputedTimes.pmFrom ? `${pendingComputedTimes.pmFrom}:00` : null,
                pm_timerendered_to: pendingComputedTimes.pmTo ? `${pendingComputedTimes.pmTo}:00` : null,
                otdatestatus: 'Rendered',
              };
            }
            return item;
          })
        );
      }

      if (errorCount > 0) {
        alert(`Saved ${successCount} record(s), but ${errorCount} failed.`);
      } else {
        alert(`Successfully saved computed times for ${successCount} record(s).`);
      }
    } catch (error) {
      console.error('Error saving computed times:', error);
      alert(error.response?.data?.message || 'Failed to save computed times');
    } finally {
      setSaving(false);
    }
  };

  const renderTimeRange = (from, to) => {
    const fromTime = formatTimeLabel(from);
    const toTime = formatTimeLabel(to);
    if (fromTime && toTime) return `${fromTime} - ${toTime}`;
    if (fromTime) return fromTime;
    if (toTime) return toTime;
    return '—';
  };

  const renderedRows = filteredRows;

  if (permissionsLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading permissions...</div>;
  }

  // Early return if no page access (canaccesspage=0)
  if (!permissionsLoading && !canViewPage) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 text-center text-red-600">
          You do not have permission to access this page (canaccesspage=0).
        </div>
      </div>
    );
  }

  // Early return if no read permission
  if (!canRead) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 text-center text-red-600">
          You do not have permission to view this tab.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-4 py-5 border-b bg-gray-50 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-semibold text-gray-700">Filters</div>
              <div className="flex gap-2">
                {hasPendingChanges && (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving || !canUpdate}
                    className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white ${
                      saving || !canUpdate
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleComputeAll}
                  disabled={
                    computingAll ||
                    loading ||
                    renderedRows.length === 0 ||
                    !canUpdate
                  }
                  className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white ${
                    computingAll || renderedRows.length === 0 || !canUpdate
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {computingAll ? 'Computing...' : 'Compute All'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  value={filters.employee}
                  onChange={(e) => setFilters((prev) => ({ ...prev, employee: e.target.value }))}
                >
                  <option value="">All Employees</option>
                  {employeeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OT No</label>
                <input
                  type="text"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  placeholder="Search OT number..."
                  value={filters.otNo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, otNo: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>
            </div>
            {(filters.employee || filters.otNo || filters.dateFrom || filters.dateTo) && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setFilters({ employee: '', otNo: '', dateFrom: '', dateTo: '' })}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">OT No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">OT Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">OT Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">AM (FROM-TO)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">PM (FROM-TO)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rendered (Hrs)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase text-center">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      Loading OT records...
                    </td>
                  </tr>
                ) : renderedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      No OT records found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  renderedRows.map((row) => {
                    const computedTimes = row.pendingComputedTimes || null;
                    const renderedHours =
                      row.pendingRenderedHours ??
                      row.autoRenderedHours ??
                      calculateRenderedHours(
                        row.am_timerendered_from,
                        row.am_timerendered_to,
                        row.pm_timerendered_from,
                        row.pm_timerendered_to
                      );
                    const otTypeLabel = row.ottype ? otTypeMap[row.ottype] || `Type ${row.ottype}` : '—';
                    const isRowLoading = rowLoading[row.id];

                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="flex items-center gap-3">
                            <AvatarWithTooltip photo={row.employee?.photo} name={row.employee?.name} />
                            <div>
                              <div className="font-medium text-gray-800">{row.employee?.name || 'N/A'}</div>
                              <div className="text-xs text-gray-500">Status: {row.otdatestatus || 'Not Rendered'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{row.otno || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{formatDisplayDate(row.otdate)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{otTypeLabel}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {/* Show computed times if available, otherwise show stored values from database */}
                          {computedTimes
                            ? renderTimeRange(computedTimes.amFrom, computedTimes.amTo)
                            : renderTimeRange(row.am_timerendered_from, row.am_timerendered_to)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {/* Show computed times if available, otherwise show stored values from database */}
                          {computedTimes
                            ? renderTimeRange(computedTimes.pmFrom, computedTimes.pmTo)
                            : renderTimeRange(row.pm_timerendered_from, row.pm_timerendered_to)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {renderedHours > 0 ? renderedHours.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="flex items-center justify-center gap-2">
                            <ActionIconButton
                              title="Detect DTR Logs"
                              onClick={() => handleCompute(row)}
                              disabled={isRowLoading}
                            >
                              {isRowLoading ? '⏳' : '🧮'}
                            </ActionIconButton>
                            <ActionIconButton
                              title="Edit OT Transaction"
                              onClick={() => handleEdit(row)}
                              disabled={modalLoading}
                              colorClass="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              ✏️
                            </ActionIconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalLoading && (
        <div className="px-6 pb-4 text-sm text-gray-500">Loading transaction details...</div>
      )}

      {showModal && modalTransaction && (
        <DTROTModal
          isOpen={showModal}
          onClose={closeModal}
          transaction={modalTransaction}
          onSave={fetchRows}
        />
      )}
    </div>
  );
};

export default DTRComputeOT;

