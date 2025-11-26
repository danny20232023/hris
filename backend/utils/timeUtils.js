// backend/utils/timeUtils.js
import { getDb } from '../config/db.js';

// Fetch: Just return the value as-is (no conversion)
function fetchTimeValue(dbValue) {
  // dbValue is assumed to be in PH time and correct format
  return dbValue;
}

// Save: If you need to generate a datetime (e.g., for "now"), use server time
function getServerNowPH() {
  // This will be the server's current time (assumed to be PH time if server is in PH)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Save: For user-supplied values, just use as-is (assume PH time)
function saveTimeValue(userValue) {
  // userValue should be in "YYYY-MM-DD HH:mm:ss" or "HH:mm" format and already PH time
  return userValue;
}

// Get server time from database
async function getServerTimeFromDB() {
  try {
    const pool = getDb();
    
    const result = await pool.request().query(`
      SELECT 
        GETDATE() as serverTime,
        CAST(GETDATE() AS DATE) as serverDate,
        CONVERT(VARCHAR(10), GETDATE(), 120) as serverDateString
    `);
    
    const serverTime = result.recordset[0];
    
    return {
      success: true,
      serverTime: serverTime.serverTime,
      serverDate: serverTime.serverDate,
      serverDateString: serverTime.serverDateString
    };
  } catch (error) {
    console.error('Error getting server time from database:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export {
  fetchTimeValue,
  saveTimeValue,
  getServerNowPH,
  getServerTimeFromDB,
};