import React from 'react';

// Utility Functions

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

// Extract time from string (handles various formats including datetime strings)
const extractTimeFromString = (value) => {
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

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
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

// FixTimeModal Component
const FixTimeModal = ({
  isOpen,
  onClose,
  employee,
  row,
  form,
  onChange,
  onSubmit,
  loading,
  saving,
  error,
  existingRecord,
  shiftSchedule
}) => {
  if (!isOpen || !employee || !row) return null;

  const photoSrc =
    employee?.PHOTO ||
    employee?.photo ||
    employee?.PHOTOPATH ||
    employee?.photoPath ||
    employee?.RAW?.photo_path ||
    employee?.photo_path ||
    '';
  const displayName =
    employee?.NAME ||
    employee?.name ||
    employee?.RAW?.fullname ||
    [employee?.LASTNAME, employee?.FIRSTNAME].filter(Boolean).join(', ') ||
    'Employee';
  const badgeNo =
    employee?.BADGENUMBER ||
    employee?.BADGENO ||
    employee?.badgeNo ||
    employee?.RAW?.badge_no ||
    '';
  const department =
    employee?.DEPARTMENT ||
    employee?.department ||
    employee?.RAW?.department_name ||
    '';
  const selectedDate =
    row?.normalizedDate ||
    row?.DATE_RAW ||
    row?.DATE ||
    form?.checktimedate ||
    '';
  const formattedDate = formatDateDisplay(selectedDate);

  // Get current log values for single-line display - format Log Date as mm/dd/yyyy, day
  const logDate = formatLogDate(selectedDate);
  const amCheckIn = row?.AM_CHECKIN || row?.amCheckIn || '-';
  const amCheckOut = row?.AM_CHECKOUT || row?.amCheckOut || '-';
  const pmCheckIn = row?.PM_CHECKIN || row?.pmCheckIn || '-';
  const pmCheckOut = row?.PM_CHECKOUT || row?.pmCheckOut || '-';
  const lateMinutes = row?.lateMinutes || row?.LATEMINUTES || row?.late_minutes || 0;

  // Collect current log values to include in dropdown options (ensures exact times are available)
  const currentLogTimeValues = [
    normalizeFixTimeValue(amCheckIn),
    normalizeFixTimeValue(amCheckOut),
    normalizeFixTimeValue(pmCheckIn),
    normalizeFixTimeValue(pmCheckOut)
  ].filter(Boolean); // Remove empty values

  // Generate filtered time options for each field based on shift schedule
  const timeFields = [
    { 
      name: 'am_checkin', 
      label: 'AM Check-In', 
      currentValue: normalizeFixTimeValue(amCheckIn),
      options: generateFilteredFixTimeOptions('am_checkin', shiftSchedule, [normalizeFixTimeValue(amCheckIn)].filter(Boolean))
    },
    { 
      name: 'am_checkout', 
      label: 'AM Check-Out', 
      currentValue: normalizeFixTimeValue(amCheckOut),
      options: generateFilteredFixTimeOptions('am_checkout', shiftSchedule, [normalizeFixTimeValue(amCheckOut)].filter(Boolean))
    },
    { 
      name: 'pm_checkin', 
      label: 'PM Check-In', 
      currentValue: normalizeFixTimeValue(pmCheckIn),
      options: generateFilteredFixTimeOptions('pm_checkin', shiftSchedule, [normalizeFixTimeValue(pmCheckIn)].filter(Boolean))
    },
    { 
      name: 'pm_checkout', 
      label: 'PM Check-Out', 
      currentValue: normalizeFixTimeValue(pmCheckOut),
      options: generateFilteredFixTimeOptions('pm_checkout', shiftSchedule, [normalizeFixTimeValue(pmCheckOut)].filter(Boolean))
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-4 flex-1">
            {photoSrc ? (
              <img
                src={photoSrc}
                alt={displayName}
                className="w-12 h-12 rounded-full object-cover border"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                {getInitials(displayName)}
              </div>
            )}
            <div>
              <h3 className="text-xl font-semibold text-gray-800">{displayName}</h3>
              <p className="text-sm text-gray-500">{formattedDate || 'N/A'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-6 py-6 space-y-6">
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Current Logs</h4>
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 overflow-x-auto">
              <div className="flex items-center gap-2 md:gap-4 text-sm w-full">
                <div className="flex-shrink min-w-[120px] flex-[1.5]">
                  <span className="text-xs text-gray-500 uppercase font-medium">Log Date</span>
                  <div className="text-sm md:text-base font-semibold text-blue-600 mt-1 break-words">{logDate}</div>
                </div>
                <div className="flex-shrink border-l border-gray-300 pl-2 md:pl-4 min-w-[80px] flex-1">
                  <span className="text-xs text-gray-500 uppercase font-medium">AM-CheckIn</span>
                  <div className="text-sm md:text-base font-medium text-gray-900 mt-1">{amCheckIn}</div>
                </div>
                <div className="flex-shrink border-l border-gray-300 pl-2 md:pl-4 min-w-[80px] flex-1">
                  <span className="text-xs text-gray-500 uppercase font-medium">AM-CheckOut</span>
                  <div className="text-sm md:text-base font-medium text-gray-900 mt-1">{amCheckOut}</div>
                </div>
                <div className="flex-shrink border-l border-gray-300 pl-2 md:pl-4 min-w-[80px] flex-1">
                  <span className="text-xs text-gray-500 uppercase font-medium">PM-CheckIn</span>
                  <div className="text-sm md:text-base font-medium text-gray-900 mt-1">{pmCheckIn}</div>
                </div>
                <div className="flex-shrink border-l border-gray-300 pl-2 md:pl-4 min-w-[80px] flex-1">
                  <span className="text-xs text-gray-500 uppercase font-medium">PM-CheckOut</span>
                  <div className="text-sm md:text-base font-medium text-gray-900 mt-1">{pmCheckOut}</div>
                </div>
                <div className="flex-shrink border-l border-gray-300 pl-2 md:pl-4 min-w-[70px] flex-[0.8]">
                  <span className="text-xs text-gray-500 uppercase font-medium">Lates (minutes)</span>
                  <div className="text-sm md:text-base font-medium mt-1">
                    {lateMinutes > 0 ? (
                      <span className="text-red-600 font-semibold">{lateMinutes}</span>
                    ) : (
                      <span className="text-gray-500">0</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Current Shift Schedule Section - Always displayed above Override Check Times */}
          <section className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Current Shift Schedule</h4>
            {shiftSchedule ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-blue-600 uppercase font-medium mb-1">Shift Name</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {shiftSchedule.SHIFTNAME || 'Not Assigned'}
                    </div>
                  </div>
                  {shiftSchedule.SHIFT_AMCHECKIN_START && shiftSchedule.SHIFT_AMCHECKIN_END && (
                    <div>
                      <div className="text-xs text-blue-600 uppercase font-medium mb-1">AM Check-In Window</div>
                      <div className="text-sm font-medium text-gray-900">
                        {extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKIN_START) || 'N/A'} - {extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKIN_END) || 'N/A'}
                      </div>
                    </div>
                  )}
                  {shiftSchedule.SHIFT_AMCHECKOUT_START && shiftSchedule.SHIFT_AMCHECKOUT_END && (
                    <div>
                      <div className="text-xs text-blue-600 uppercase font-medium mb-1">AM Check-Out Window</div>
                      <div className="text-sm font-medium text-gray-900">
                        {extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKOUT_START) || 'N/A'} - {extractTimeFromShiftField(shiftSchedule.SHIFT_AMCHECKOUT_END) || 'N/A'}
                      </div>
                    </div>
                  )}
                  {shiftSchedule.SHIFT_PMCHECKIN_START && shiftSchedule.SHIFT_PMCHECKIN_END && (
                    <div>
                      <div className="text-xs text-blue-600 uppercase font-medium mb-1">PM Check-In Window</div>
                      <div className="text-sm font-medium text-gray-900">
                        {extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKIN_START) || 'N/A'} - {extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKIN_END) || 'N/A'}
                      </div>
                    </div>
                  )}
                  {shiftSchedule.SHIFT_PMCHECKOUT_START && shiftSchedule.SHIFT_PMCHECKOUT_END && (
                    <div>
                      <div className="text-xs text-blue-600 uppercase font-medium mb-1">PM Check-Out Window</div>
                      <div className="text-sm font-medium text-gray-900">
                        {extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKOUT_START) || 'N/A'} - {extractTimeFromShiftField(shiftSchedule.SHIFT_PMCHECKOUT_END) || 'N/A'}
                      </div>
                    </div>
                  )}
                </div>
                {!shiftSchedule.SHIFTNAME && (
                  <div className="mt-3 text-xs text-amber-600 italic">
                    Note: Time options are not filtered as no shift schedule is assigned.
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="text-sm text-amber-800">
                  <span className="font-medium">No shift schedule assigned.</span>
                  <span className="ml-2 text-xs italic">Time options will show all available times.</span>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Override Check Times</h4>
              {existingRecord && (
                <span className="text-xs font-medium text-blue-600">
                  Existing record status: {existingRecord.fixstatus || 'For Approval'}
                </span>
              )}
            </div>
            {loading ? (
              <div className="p-3 text-sm text-gray-500 bg-gray-50 rounded-lg">
                Loading existing fix log...
              </div>
            ) : (
              <div className="flex items-end gap-4">
                {timeFields.map((field) => (
                  <div key={field.name} className="flex-1">
                    <label htmlFor={field.name} className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    <select
                      id={field.name}
                      name={field.name}
                      value={form[field.name] || ''}
                      onChange={onChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                      style={{
                        color: form[field.name] && form[field.name] === field.currentValue ? '#2563eb' : '#111827'
                      }}
                      disabled={saving}
                    >
                      {field.options.map((option) => {
                        const isCurrentValue = option.value && option.value === field.currentValue;
                        return (
                          <option
                            key={option.value}
                            value={option.value}
                            style={{ color: isCurrentValue ? '#2563eb' : '#111827' }}
                          >
                            {option.label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <label htmlFor="fix-remarks" className="block text-sm font-medium text-gray-700 mb-1">
                Remarks
              </label>
              <textarea
                id="fix-remarks"
                name="remarks"
                value={form.remarks || ''}
                onChange={onChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Provide reason or supporting notes..."
                disabled={saving}
              />
            </div>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              disabled={saving}
            >
              {saving ? 'Saving...' : existingRecord ? 'Update Fix Log' : 'Save Fix Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FixTimeModal;

