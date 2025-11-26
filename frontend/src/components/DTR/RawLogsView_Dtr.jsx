import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

// --- Local utility functions ---
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
  console.log('🔍 [generateDateRange] Input:', { start, end });
  const dates = [];
  let current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
    if (dates.length > 1000) break; // safety
  }
  console.log('🔍 [generateDateRange] Output:', {
    datesCount: dates.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    sampleDates: dates.slice(0, 5)
  });
  return dates;
};

// Helper to get locator remarks for a date
const getLocatorRemarksForDate = (locatorData, dateStr, userId) => {
  if (!locatorData || locatorData.length === 0) return '';
  const locatorsForDate = locatorData.filter(locator => {
    const locDate = locator.LOCDATE ? locator.LOCDATE.slice(0, 10) : '';
    return locDate === dateStr && String(locator.LOCUSERID) === String(userId);
  });
  if (locatorsForDate.length === 0) return '';
  return locatorsForDate.map(l => l.LOCREMARKS).filter(Boolean).join('; ');
};

// Helper to get leave remarks for a date
const getLeaveRemarksForDate = (leaveData, dateStr, userId) => {
  if (!leaveData || leaveData.length === 0) return null;
  
  const matchingLeaves = leaveData.filter(leave => {
    const leaveDate = extractDateFromTimestamp(leave.LEAVEDATE);
    return leaveDate === dateStr && String(leave.USERID) === String(userId);
  });
  
  if (matchingLeaves.length === 0) return null;
  
  const leaveRemarks = matchingLeaves.map(leave => leave.LeaveName || 'Leave');
  return leaveRemarks.join('; ');
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
        .map(part => part.trim())
        .forEach(part => {
          if (part) {
            const normalized = extractDateFromTimestamp(part);
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

const normalizeTravelRecords = (records) => {
  if (!Array.isArray(records)) return [];

  const normalized = [];

  records.forEach(record => {
    const dates = extractTravelDates(record);
    const reference = getTravelReference(record);
    if (dates.length === 0) return;

    dates.forEach(date => {
      normalized.push({
        date,
        reference,
        raw: record
      });
    });
  });

  return normalized;
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
    if (candidate === undefined || candidate === null) continue;
    const str = typeof candidate === 'string' ? candidate.trim() : String(candidate);
    if (!str) continue;

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    const extracted = str.split(/[ T]/)[0];
    if (extracted) {
      return extracted;
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

  const targetDate = dateStr.substring(0, 10);
  const targetMonthDay = targetDate.slice(5, 10);

  return holidayData.filter((holiday) => {
    const holidayDate = getHolidayDateValue(holiday);
    if (!holidayDate) return false;

    if (isHolidayRecurring(holiday)) {
      return holidayDate.slice(5, 10) === targetMonthDay;
    }

    return holidayDate === targetDate;
  });
};

// Helper: Get travel order remarks for a specific date
const getTravelRemarksForDate = (travelData, dateStr) => {
  if (!travelData || travelData.length === 0) return null;
  
  const matchingTravels = travelData.filter(travel => travel.date === dateStr);
  
  if (matchingTravels.length === 0) return null;
  
  const travelRemarks = matchingTravels.map(travel => {
    const label = travel.reference ? `Travel (${travel.reference})` : 'Travel';
    return label;
  });
  return travelRemarks.join('; ');
};

const getHolidayRemarksForDate = (holidayData, dateStr) => {
  const matchingHolidays = getHolidaysForDate(holidayData, dateStr);
  if (matchingHolidays.length === 0) return null;
  return matchingHolidays.map(getHolidayNameValue).join('; ');
};

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const isWeekend = (dateStr) => {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday=0, Saturday=6
};

const hasHolidayForDate = (holidayData, dateStr) => {
  return getHolidaysForDate(holidayData, dateStr).length > 0;
};

const RawLogsView_Dtr = ({ user, selectedFilter, locatorData = [], selectedPeriod = 'full', onLogsProcessed }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [leaveData, setLeaveData] = useState([]);
  const [travelData, setTravelData] = useState([]);
  const [holidayData, setHolidayData] = useState([]);

  // Normalize period value
  const getNormalizedPeriod = () => {
    const raw = (selectedPeriod || '').toString().trim().toLowerCase();
    
    console.log('🔍 [getNormalizedPeriod] Input:', {
      selectedPeriod,
      raw,
      selectedFilter
    });
    
    if (raw === 'first_half' || raw === 'first-half' || raw === 'first half' || raw === 'h1' || raw === '1st_half' || raw === '1st half') {
      console.log('🔍 [getNormalizedPeriod] Matched first_half');
      return 'first_half';
    }
    if (raw === 'second_half' || raw === 'second-half' || raw === 'second half' || raw === 'h2' || raw === '2nd_half' || raw === '2nd half') {
      console.log('🔍 [getNormalizedPeriod] Matched second_half');
      return 'second_half';
    }
    if (raw === 'full' || raw === 'whole' || raw === 'entire') {
      console.log('🔍 [getNormalizedPeriod] Matched full');
      return 'full';
    }
    
    console.log('🔍 [getNormalizedPeriod] Defaulting to full');
    return 'full'; // default
  };

  const getTodayStr = () => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  };

  // Calculate date range based on selected filter and period
  const getDateRangeStrings = () => {
    const now = new Date();
    const todayStr = getTodayStr();
    const period = getNormalizedPeriod();
    let startDate, endDate;

    console.log('🔍 [RawLogsView_Dtr] Calculating date range:', {
      selectedFilter,
      selectedPeriod,
      normalizedPeriod: period,
      currentDate: now.toISOString().slice(0, 10)
    });

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
      
      if (period === 'first_half') {
        startDate = firstDay;
        endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
      } else if (period === 'second_half') {
        startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-16`;
        endDate = lastDayStr;
      } else { // full
        startDate = firstDay;
        endDate = lastDayStr;
      }
    } else if (selectedFilter === 'Last Month') {
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
      
      if (period === 'first_half') {
        startDate = firstDay;
        endDate = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-15`;
      } else if (period === 'second_half') {
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

    console.log('🔍 [RawLogsView_Dtr] Calculated date range:', {
      startDate,
      endDate,
      period,
      dateRangeLength: startDate && endDate ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1 : 0
    });

    return { startDate, endDate };
  };

  // Load leave data - module removed
  const loadLeaveData = () => {
    setLeaveData([]);
  };

  // Load travel data
  const loadTravelData = async () => {
    try {
      const response = await api.get('/employee-travels/transactions', {
        params: {
          participant: user.id
        }
      });
      const records = response.data?.data || response.data || [];
      setTravelData(normalizeTravelRecords(Array.isArray(records) ? records : []));
    } catch (error) {
      console.error('❌ Error loading travel data:', error);
    }
  };

  // Load holiday data
  const loadHolidayData = async () => {
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
      } else {
        setHolidayData([]);
      }
    } catch (error) {
      console.error('❌ Error loading holiday data:', error);
      setHolidayData([]);
    }
  };

  // Debug effect to track prop changes
  useEffect(() => {
    console.log('🔍 [RawLogsView_Dtr] Props changed:', {
      selectedFilter,
      selectedPeriod,
      user: user?.id,
      locatorDataLength: locatorData?.length
    });
  }, [selectedFilter, selectedPeriod, user, locatorData]);

  // Load all data when component mounts
  useEffect(() => {
    if (user) {
      loadLeaveData();
      loadTravelData();
      loadHolidayData();
    }
  }, [user]);

  // Main effect to fetch and process logs
  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      if (!user || !user.id) return;
      setLoading(true);
      setApiError(null);
      
      try {
        const { startDate, endDate } = getDateRangeStrings();
        
        console.log('🔍 [RawLogsView_Dtr] Fetching logs with:', {
          startDate,
          endDate,
          selectedFilter,
          selectedPeriod,
          userId: user.id
        });
        
        const response = await api.get('/dtr/logs', {
          params: { userId: user.id, startDate, endDate }
        });
        
        const checkInOutLogs = Array.isArray(response.data) ? response.data : [];
        const allDates = generateDateRange(startDate, endDate);
        
        console.log('🔍 [RawLogsView_Dtr] Processing data:', {
          checkInOutLogsLength: checkInOutLogs.length,
          allDatesLength: allDates.length,
          startDate,
          endDate,
          firstDate: allDates[0],
          lastDate: allDates[allDates.length - 1]
        });
        
        // Process logs for each date in the range
        const processedLogs = allDates.map(dateStr => {
          const logsForDay = checkInOutLogs.filter(log => {
            const checkTime = log.CHECKTIME || log.checktime || log.CheckTime;
            const extracted = checkTime ? extractDateFromTimestamp(checkTime) : '';
            return checkTime && extracted === dateStr;
          });
          
          // AM LOGS: 00:00 to 11:59, PM LOGS: 12:00 to 23:59
          const amLogs = logsForDay.filter(log => {
            const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
            const mins = timeToMinutes(t);
            return mins >= 0 && mins < 12 * 60;
          });
          
          const pmLogs = logsForDay.filter(log => {
            const t = extractTimeFromTimestamp(log.CHECKTIME || log.checktime || log.CheckTime);
            const mins = timeToMinutes(t);
            return mins >= 12 * 60 && mins <= 23 * 60 + 59;
          });
          
          // Check if this date has a holiday
          const hasHoliday = hasHolidayForDate(holidayData, dateStr);

          // Remarks: Weekend if Sat/Sun, else locator, leave, travel, and holiday remarks
          const locatorRemarks = getLocatorRemarksForDate(locatorData, dateStr, user.id);
          const leaveRemarks = getLeaveRemarksForDate(leaveData, dateStr, user.id);
          const travelRemarks = getTravelRemarksForDate(travelData, dateStr);
          const holidayRemarks = getHolidayRemarksForDate(holidayData, dateStr);
          
          let remarks = '';
          if (isWeekend(dateStr)) {
            remarks = 'Weekend';
            if (locatorRemarks) remarks += '; ' + locatorRemarks;
          } else {
            // Combine all remarks
            const allRemarks = [locatorRemarks, leaveRemarks, travelRemarks, holidayRemarks].filter(Boolean);
            if (allRemarks.length > 0) {
              remarks = allRemarks.join('; ');
            }
          }
          
          return {
            date: dateStr,
            amLogs,
            pmLogs,
            remarks,
            isWeekend: isWeekend(dateStr),
            hasHoliday: hasHoliday
          };
        });
        
        console.log('🔍 [RawLogsView_Dtr] Final processed logs:', {
          processedLogsCount: processedLogs.length,
          firstProcessedDate: processedLogs[0]?.date,
          lastProcessedDate: processedLogs[processedLogs.length - 1]?.date
        });
        
        if (isMounted) {
          setLogs(processedLogs);
          if (onLogsProcessed) {
            onLogsProcessed(processedLogs);
          }
        }
      } catch (error) {
        if (isMounted) setApiError(error.response?.data?.message || 'Failed to fetch DTR logs. Please try again.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchLogs();
    return () => { isMounted = false; };
  }, [user, locatorData, selectedFilter, selectedPeriod, leaveData, travelData, holidayData]);

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading logs...</p>
        </div>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <strong className="font-bold">Error:</strong>
          </div>
          <p className="mt-1">{apiError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Table Container */}
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {/* Modern Table Header with DtrChecker color scheme */}
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-t-xl overflow-hidden">
            <div className="grid grid-cols-4 gap-0 w-full" style={{ 
              gridTemplateColumns: '1fr 2fr 2fr 1fr',
              width: '100%'
            }}>
              <div className="px-6 py-4 text-center flex items-center justify-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">Date</div>
              </div>
              <div className="px-4 py-4 text-center flex items-center justify-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">AM Logs</div>
                <div className="text-blue-100 text-xs font-normal ml-2">(00:00-11:59)</div>
              </div>
              <div className="px-4 py-4 text-center flex items-center justify-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">PM Logs</div>
                <div className="text-blue-100 text-xs font-normal ml-2">(12:00-23:59)</div>
              </div>
              <div className="px-6 py-4 text-center flex items-center justify-center">
                <div className="text-white font-bold text-sm uppercase tracking-wide">Remarks</div>
              </div>
            </div>
          </div>

          {/* Table Body - No Scroll */}
          <div>
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div
                  key={`${log.date}-${index}`}
                  className={`grid grid-cols-4 hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100 ${
                    log.isWeekend ? 'bg-blue-50' : 'bg-white'
                  }`}
                  style={{ 
                    gridTemplateColumns: '1fr 2fr 2fr 1fr'
                  }}
                >
                  {/* Date Column */}
                  <div className="px-6 py-4 flex items-center justify-center">
                    <div className={`text-sm font-semibold ${
                      log.isWeekend ? 'text-blue-600' : 
                      log.hasHoliday ? 'text-red-600' : 
                      'text-gray-900'
                    }`}>
                      {formatDateDisplay(log.date)}
                    </div>
                  </div>

                  {/* AM Logs Column */}
                  <div className="px-4 py-4 flex items-center">
                    <div className="text-sm font-mono text-gray-700">
                      {log.amLogs && log.amLogs.length > 0
                        ? log.amLogs
                            .map(entry => extractTimeFromTimestamp(entry.CHECKTIME || entry.checktime || entry.CheckTime))
                            .filter(Boolean)
                            .join(', ')
                        : '-'}
                    </div>
                  </div>

                  {/* PM Logs Column */}
                  <div className="px-4 py-4 flex items-center">
                    <div className="text-sm font-mono text-gray-700">
                      {log.pmLogs && log.pmLogs.length > 0
                        ? log.pmLogs
                            .map(entry => extractTimeFromTimestamp(entry.CHECKTIME || entry.checktime || entry.CheckTime))
                            .filter(Boolean)
                            .join(', ')
                        : '-'}
                    </div>
                  </div>

                  {/* Remarks Column */}
                  <div className="px-6 py-4 flex items-center justify-center">
                    <div className={`text-sm font-medium ${
                      log.isWeekend ? 'text-blue-600' : 
                      log.hasHoliday ? 'text-red-600' : 
                      'text-gray-700'
                    }`}>
                      {log.remarks || '-'}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="text-gray-600 text-lg font-semibold mb-2">No data available</div>
                  <div className="text-gray-500 text-sm">Please select a different date range or check your connection.</div>
                </div>
              </div>
            )}
          </div>

          {/* Modern Table Footer with DtrChecker color scheme */}
          <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-b-xl overflow-hidden">
            <div className="grid grid-cols-4 gap-0 w-full" style={{ 
              gridTemplateColumns: '1fr 2fr 2fr 1fr',
              width: '100%'
            }}>
              <div className="px-6 py-4 text-center flex items-center justify-center">
                <div className="text-gray-800 font-bold text-sm uppercase tracking-wide">Total</div>
              </div>
              <div className="px-4 py-4 text-center flex items-center justify-center">
                <div className="text-blue-600 font-bold text-sm">{logs.reduce((sum, log) => sum + (log.amLogs ? log.amLogs.length : 0), 0)}</div>
              </div>
              <div className="px-4 py-4 text-center flex items-center justify-center">
                <div className="text-blue-600 font-bold text-sm">{logs.reduce((sum, log) => sum + (log.pmLogs ? log.pmLogs.length : 0), 0)}</div>
              </div>
              <div className="px-6 py-4 text-center flex items-center justify-center">
                <div className="text-gray-500 text-sm">Total Logs</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RawLogsView_Dtr;