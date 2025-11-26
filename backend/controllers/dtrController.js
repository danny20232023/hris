import { getDb } from '../config/db.js';
import sql from 'mssql';

// @desc    Get DTR logs for authenticated user
// @route   GET /api/dtr/logs
// @access  Private
const getDtrLogs = async (req, res) => {
  const { USERID } = req.user; // Get USERID from authenticated user
  const { startDate, endDate } = req.query; // Optional date range filters

  console.log('DTR Logs request - USERID:', USERID, 'startDate:', startDate, 'endDate:', endDate);

  if (!USERID) {
    return res.status(400).json({ message: 'User ID is required for DTR logs.' });
  }

  try {
    const pool = getDb();
    let query = `
      SELECT
        c.USERID,
        c.CHECKTIME,
        CAST(c.CHECKTIME AS DATE) as date
      FROM CHECKINOUT c
      WHERE c.USERID = @USERID
    `;

    if (startDate && endDate) {
      query += ` AND CAST(c.CHECKTIME AS DATE) BETWEEN @startDate AND @endDate`;
    } else if (startDate) {
      query += ` AND CAST(c.CHECKTIME AS DATE) >= @startDate`;
    } else if (endDate) {
      query += ` AND CAST(c.CHECKTIME AS DATE) <= @endDate`;
    }

    // Order by date and time to easily process in frontend
    query += ` ORDER BY CAST(c.CHECKTIME AS DATE) ASC, c.CHECKTIME ASC`;

    const request = pool.request()
      .input('USERID', sql.Int, USERID);

    if (startDate) request.input('startDate', sql.Date, startDate);
    if (endDate) request.input('endDate', sql.Date, endDate);

    console.log('Executing query:', query);
    const result = await request.query(query);
    console.log('Query result count:', result.recordset.length);

    // Return raw CHECKINOUT data for frontend processing
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching DTR logs:', err);
    res.status(500).json({ message: 'Server error fetching DTR logs' });
  }
};

// @desc    Get DTR logs for specific employee and date (for locator form)
// @route   GET /api/dtr/logs/locator
// @access  Private
const getDtrLogsForLocatorForm = async (req, res) => {
  const { userId, date } = req.query;

  console.log('DTR Logs for Locator Form request - userId:', userId, 'date:', date);

  if (!userId || !date) {
    return res.status(400).json({ message: 'User ID and date are required for locator form DTR logs.' });
  }

  try {
    const pool = getDb();
    const query = `
      SELECT
        c.USERID,
        c.CHECKTIME,
        CAST(c.CHECKTIME AS DATE) as date
      FROM CHECKINOUT c
      WHERE c.USERID = @userId
        AND CAST(c.CHECKTIME AS DATE) = @date
      ORDER BY c.CHECKTIME ASC
    `;

    const request = pool.request()
      .input('userId', sql.Int, userId)
      .input('date', sql.Date, date);

    console.log('Executing locator form DTR query:', query);
    const result = await request.query(query);
    console.log('Locator form DTR query result count:', result.recordset.length);

    // Return raw CHECKINOUT data for frontend processing
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching locator form DTR logs:', err);
    res.status(500).json({ message: 'Server error fetching locator form DTR logs' });
  }
};

export { getDtrLogs, getDtrLogsForLocatorForm };
