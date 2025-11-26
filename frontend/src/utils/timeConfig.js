// frontend/src/utils/timeConfig.js

export const TIME_FORMAT_24HR = true;

/**
 * Get browser's current time and timezone info.
 * @returns {Object}
 */
export function getClientTimeInfo() {
  const now = new Date();
  const timezoneOffsetMinutes = now.getTimezoneOffset();
  const timezoneOffsetHours = -timezoneOffsetMinutes / 60;
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    now,
    iso: now.toISOString(),
    local: now.toLocaleString(),
    timezoneOffsetMinutes,
    timezoneOffsetHours,
    timezone,
    // No hostname in browser
  };
}

/**
 * Format a Date object or time string to 24-hour "HH:mm" format.
 * @param {Date|string} input
 * @returns {string}
 */
export function formatTime24hr(input) {
  let date;
  if (typeof input === 'string') {
    // If input is already "HH:mm", just return as is
    if (/^\d{2}:\d{2}$/.test(input)) return input;
    date = new Date(input);
  } else {
    date = input;
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

/**
 * Get current client time in 24hr format ("HH:mm").
 * @returns {string}
 */
export function getCurrentTime24hr() {
  return formatTime24hr(new Date());
}

/**
 * Convert a "HH:mm" string to a Date object for today in client time.
 * @param {string} timeStr
 * @returns {Date}
 */
export function timeStringToTodayDate(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  now.setHours(h, m, 0, 0);
  return now;
}

/**
 * Parse a Date or string to { hours, minutes } in 24hr format.
 * @param {Date|string} input
 * @returns {{hours: string, minutes: string}}
 */
export function parseTime24hr(input) {
  let date;
  if (typeof input === 'string') {
    if (/^\d{2}:\d{2}$/.test(input)) {
      const [hours, minutes] = input.split(':');
      return { hours, minutes };
    }
    date = new Date(input);
  } else {
    date = input;
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) return { hours: '', minutes: '' };
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return { hours, minutes };
}

// Export as default for convenience
const timeConfig = {
  TIME_FORMAT_24HR,
  getClientTimeInfo,
  formatTime24hr,
  getCurrentTime24hr,
  timeStringToTodayDate,
  parseTime24hr,
};

export default timeConfig;