import { getDb } from '../config/db.js';
import sql from 'mssql';
import { getServerTimeFromDB } from '../utils/timeUtils.js';

// Helper function to create Philippine time datetime
const createPhilippineTime = (dateTimeString) => {
  console.log('=== createPhilippineTime DEBUG ===');
  console.log('Input dateTimeString:', dateTimeString);
  console.log('Type of dateTimeString:', typeof dateTimeString);
  
  if (!dateTimeString) {
    console.log('dateTimeString is null/undefined, returning null');
    return null;
  }
  
  // If it's already a Date object, return as is
  if (dateTimeString instanceof Date) {
    console.log('dateTimeString is already a Date object, returning as is');
    return dateTimeString;
  }
  
  // If it's a string, parse it directly without timezone conversion
  if (typeof dateTimeString === 'string') {
    // If it's already in the format "YYYY-MM-DD HH:MM:SS", use it directly
    if (dateTimeString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      console.log('dateTimeString is already in correct format, using directly:', dateTimeString);
      return dateTimeString;
    }
    
    // If it's in ISO format, parse it carefully
    if (dateTimeString.includes('T')) {
      console.log('dateTimeString contains T, parsing as ISO format');
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) {
        console.log('Invalid date, returning null');
        return null;
      }
      
      // Format as Philippine time string without timezone conversion
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      const result = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      console.log('Formatted result:', result);
      return result;
    }
    
    // For other formats, try to parse as is
    console.log('Using dateTimeString as is:', dateTimeString);
    return dateTimeString;
  }
  
  console.log('Returning dateTimeString as is:', dateTimeString);
  return dateTimeString;
};

// Separate function for dashboard time calculations
const timeToMinutesDashboard = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper function specifically for shift schedule time values - NO CONVERSION
const formatShiftTime = (timeString) => {
  console.log('=== formatShiftTime DEBUG ===');
  console.log('Input timeString:', timeString);
  console.log('Type of timeString:', typeof timeString);
  
  if (!timeString) {
    console.log('timeString is null/undefined, returning null');
    return null;
  }
  
  // Add ":00" for seconds to complete SQL Server TIME format
  if (timeString.match(/^\d{2}:\d{2}$/)) {
    const result = `${timeString}:00`;
    console.log('Converted HH:MM to HH:MM:SS:', result);
    return result;
  }
  
  // Return as-is if already has seconds or other format
  console.log('Returning timeString as-is:', timeString);
  return timeString;
};

// GET /api/management/dashboard
export const getDashboard = async (req, res) => {
  try {
    const pool = getDb();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const isAM = currentHour < 12; // AM if before 12:00, PM if after

    console.log('Dashboard calculation for:', today, 'Current hour:', currentHour, 'Is AM:', isAM);

    // Get total employees count first
    const totalEmpResult = await pool.request().query(`SELECT COUNT(*) AS totalEmployees FROM USERINFO`);
    const totalEmployees = totalEmpResult.recordset[0].totalEmployees || 0;

    // Get active employees count
    const activeEmpResult = await pool.request().query(`
      SELECT COUNT(*) AS activeEmployees 
      FROM USERINFO 
      WHERE privilege >= 0
    `);
    const activeEmployees = activeEmpResult.recordset[0].activeEmployees || 0;

    // Get inactive employees count
    const inactiveEmpResult = await pool.request().query(`
      SELECT COUNT(*) AS inactiveEmployees 
      FROM USERINFO 
      WHERE privilege < 0
    `);
    const inactiveEmployees = inactiveEmpResult.recordset[0].inactiveEmployees || 0;

    console.log('Employee counts:', { totalEmployees, activeEmployees, inactiveEmployees });

    // Get all employees with their time logs for today (only active employees for attendance calculation)
    const employeeLogsResult = await pool.request().query(`
      SELECT 
        u.USERID,
        u.NAME,
        u.BADGENUMBER,
        u.privilege,
        c.CHECKTIME,
        c.CHECKTYPE
      FROM USERINFO u
      LEFT JOIN CHECKINOUT c ON u.USERID = c.USERID 
        AND CAST(c.CHECKTIME AS DATE) = CAST(GETDATE() AS DATE)
      WHERE u.privilege >= 0
      ORDER BY u.USERID, c.CHECKTIME
    `);

    console.log('Employee logs query result count:', employeeLogsResult.recordset.length);
    console.log('Sample employee logs:', employeeLogsResult.recordset.slice(0, 5));

    // Leave module retired: preserve placeholders for compatibility
    
    // Build date range for the last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }

    // Locator tracking no longer sourced from LOCATOR2; fill with zeros
    const locatorChartData = last7Days.map((date) => ({
      date,
      count: 0
    }));

    // Travel tracking no longer sourced from TRAVELDATES2; fill with zeros
    const travelChartData = last7Days.map((date) => ({
      date,
      count: 0
    }));

    // Process employee logs to calculate attendance
    const employeeLogs = employeeLogsResult.recordset;
    const employeeMap = new Map();

    // Group logs by employee
    employeeLogs.forEach(log => {
      if (!employeeMap.has(log.USERID)) {
        employeeMap.set(log.USERID, {
          USERID: log.USERID,
          NAME: log.NAME,
          BADGENUMBER: log.BADGENUMBER,
          privilege: log.privilege,
          logs: []
        });
      }
      if (log.CHECKTIME) {
        employeeMap.get(log.USERID).logs.push({
          CHECKTIME: log.CHECKTIME,
          CHECKTYPE: log.CHECKTYPE
        });
      }
    });

    let presentToday = 0;
    let absentToday = 0;
    let lateToday = 0;
    let onLeave = 0;
    let onTravel = 0;

    // Calculate attendance for each employee
    employeeMap.forEach(employee => {
      if (employee.logs.length > 0) {
        presentToday++;
        
        // Check if employee is late
        employee.logs.sort((a, b) => new Date(a.CHECKTIME) - new Date(b.CHECKTIME));
        
        // Get first check-in time
        const firstCheckIn = employee.logs.find(log => log.CHECKTYPE === 'I');
        if (firstCheckIn) {
          const checkInTime = new Date(firstCheckIn.CHECKTIME);
          const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
          
          // Check if it's AM or PM
        if (isAM) {
          // If it's AM, check AM check-in time
            if (checkInMinutes > 510) { // 8:30 AM
              employee.isLate = true;
              lateToday++;
          }
        } else {
          // If it's PM, check PM check-in time
            if (checkInMinutes > 810) { // 1:30 PM
              employee.isLate = true;
              lateToday++;
            }
          }
        }
      } else {
        absentToday++;
      }
    });

    // Calculate on travel counts
    // Leave tracking removed; keep onLeave at zero
    
    // Get today's travel count from TRAVELDATES2
    onTravel = 0;

    // Get today's locator count from LOCATOR2
    const onLocator = 0;

    console.log('Dashboard stats calculated:', {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      presentToday,
      absentToday,
      lateToday,
      onLeave,
      onTravel,
      onLocator,
      currentTime: currentTime.toISOString(),
      isAM
    });

    res.json({
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      presentToday,
      absentToday,
      lateToday,
      onLeave,
      onTravel,
      onLocator,
      chartData: {
        locatorData: locatorChartData,
        travelData: travelChartData
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      message: 'Error fetching dashboard data', 
      error: error.message,
      stack: error.stack 
    });
  }
};

// GET /api/management/locator
export const getLocator = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.request().query(`
      SELECT TOP 100 
        l.USERID,
        u.NAME,
        l.CHECKTIME,
        l.CHECKTYPE,
        l.VERIFYCODE,
        l.SENSORID
      FROM CHECKINOUT l
      LEFT JOIN USERINFO u ON l.USERID = u.USERID
      ORDER BY l.CHECKTIME DESC
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching locator data:', error);
    res.status(500).json({ message: 'Error fetching locator data' });
  }
};

// POST /api/management/locator
export const addLocator = async (req, res) => {
  try {
    const { userid, checktime, checktype, verifycode, sensorid } = req.body;
    const pool = getDb();

    await pool.request()
      .input('USERID', sql.NVarChar, userid)
      .input('CHECKTIME', sql.DateTime, createPhilippineTime(checktime))
      .input('CHECKTYPE', sql.NVarChar, checktype)
      .input('VERIFYCODE', sql.Int, verifycode)
      .input('SENSORID', sql.Int, sensorid)
      .query(`
        INSERT INTO CHECKINOUT (USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID)
        VALUES (@USERID, @CHECKTIME, @CHECKTYPE, @VERIFYCODE, @SENSORID)
      `);

    res.status(201).json({ message: 'Locator entry created successfully' });
  } catch (error) {
    console.error('Error creating locator entry:', error);
    res.status(500).json({ message: 'Error creating locator entry' });
  }
};

// PUT /api/management/locator/:userid/:checktime
export const updateLocator = async (req, res) => {
  try {
    const { userid, checktime } = req.params;
    const { checktype, verifycode, sensorid } = req.body;
    const pool = getDb();

    await pool.request()
      .input('USERID', sql.NVarChar, userid)
      .input('CHECKTIME', sql.DateTime, createPhilippineTime(checktime))
      .input('CHECKTYPE', sql.NVarChar, checktype)
      .input('VERIFYCODE', sql.Int, verifycode)
      .input('SENSORID', sql.Int, sensorid)
      .query(`
        UPDATE CHECKINOUT 
        SET CHECKTYPE = @CHECKTYPE, VERIFYCODE = @VERIFYCODE, SENSORID = @SENSORID
        WHERE USERID = @USERID AND CHECKTIME = @CHECKTIME
      `);

    res.json({ message: 'Locator entry updated successfully' });
  } catch (error) {
    console.error('Error updating locator entry:', error);
    res.status(500).json({ message: 'Error updating locator entry' });
  }
};

// DELETE /api/management/locator/:userid/:checktime
export const deleteLocator = async (req, res) => {
  try {
  const { userid, checktime } = req.params;
    const pool = getDb();

    await pool.request()
      .input('USERID', sql.NVarChar, userid)
      .input('CHECKTIME', sql.DateTime, createPhilippineTime(checktime))
      .query(`
        DELETE FROM CHECKINOUT 
        WHERE USERID = @USERID AND CHECKTIME = @CHECKTIME
      `);

    res.json({ message: 'Locator entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting locator entry:', error);
    res.status(500).json({ message: 'Error deleting locator entry' });
  }
};

// GET /api/management/shiftschedules
export const getShiftSchedules = async (req, res) => {
  try {
    // Old SHIFTSCHEDULE2 table removed - shift schedules now managed through shiftscheduletypes table
    // Use /api/dtr-shifts endpoint instead
    console.log('⚠️ Old SHIFTSCHEDULE2 table no longer used - returning empty array');
    res.json([]);
  } catch (error) {
    console.error('Error fetching shift schedules:', error);
    res.status(500).json({ message: 'Error fetching shift schedules' });
  }
};

// POST /api/management/shiftschedules
export const addShiftSchedule = async (req, res) => {
  try {
    // Old SHIFTSCHEDULE2 table removed - use /api/dtr-shifts endpoint instead
    console.log('⚠️ Old SHIFTSCHEDULE2 table no longer used - endpoint deprecated');
    res.status(410).json({ 
      message: 'This endpoint is deprecated. Old SHIFTSCHEDULE2 table has been removed. Please use /api/dtr-shifts endpoint instead.' 
    });
  } catch (error) {
    console.error('Error creating shift schedule:', error);
    res.status(500).json({ message: 'Error creating shift schedule' });
  }
};

// PUT /api/management/shiftschedules/:shiftNo
export const updateShiftSchedule = async (req, res) => {
  try {
    // Old SHIFTSCHEDULE2 table removed - use /api/dtr-shifts/:id endpoint instead
    console.log('⚠️ Old SHIFTSCHEDULE2 table no longer used - endpoint deprecated');
    res.status(410).json({ 
      message: 'This endpoint is deprecated. Old SHIFTSCHEDULE2 table has been removed. Please use /api/dtr-shifts/:id endpoint instead.' 
    });
  } catch (error) {
    console.error('Error updating shift schedule:', error);
    res.status(500).json({ message: 'Error updating shift schedule' });
  }
};

// DELETE /api/management/shiftschedules/:shiftNo
export const deleteShiftSchedule = async (req, res) => {
  try {
    // Old SHIFTSCHEDULE2 table removed - use /api/dtr-shifts/:id endpoint instead
    console.log('⚠️ Old SHIFTSCHEDULE2 table no longer used - endpoint deprecated');
    res.status(410).json({ 
      message: 'This endpoint is deprecated. Old SHIFTSCHEDULE2 table has been removed. Please use /api/dtr-shifts/:id endpoint instead.' 
    });
  } catch (error) {
    console.error('Error deleting shift schedule:', error);
    res.status(500).json({ message: 'Error deleting shift schedule' });
  }
};

// GET /api/management/employees
export const getEmployees = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.request().query(`
      SELECT 
        u.USERID, 
        u.NAME, 
        u.BADGENUMBER, 
        u.DEFAULTDEPTID,
        u.SSN,
        u.InheritDeptSchClass,
        d.DEPTNAME,
        u.PHOTO
      FROM USERINFO u
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
      ORDER BY u.NAME
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees' });
  }
};

// POST /api/management/assign-shift-schedule
export const assignShiftSchedule = async (req, res) => {
  try {
    const { shiftNo, employeeIds } = req.body;
    const pool = getDb();

    console.log('Received request:', { shiftNo, employeeIds });

    if (!shiftNo || !employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Invalid request data' });
    }

    // Use a transaction to ensure all updates are successful
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Update each employee's InheritDeptSchClass
      for (const employeeId of employeeIds) {
        await transaction.request()
          .input('USERID', sql.Int, employeeId)
          .input('InheritDeptSchClass', sql.Int, shiftNo)
          .query(`
            UPDATE USERINFO 
            SET InheritDeptSchClass = @InheritDeptSchClass 
            WHERE USERID = @USERID
          `);
      }

      await transaction.commit();
      res.json({ 
        message: `Successfully assigned shift schedule ${shiftNo} to ${employeeIds.length} employee(s)` 
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error assigning shift schedule:', error);
    res.status(500).json({ 
      message: 'Error assigning shift schedule',
      details: error.message 
    });
  }
};

// GET /api/management/locator2 - UPDATED WITH EMPLOYEE ID FILTERING
export const getLocator2 = async (req, res) => {
  try {
    const pool = getDb();
    
    // Get search parameters from query string
    const { 
      employeeSearch, 
      locatorNoSearch, 
      dateFrom, 
      dateTo, 
      remarksSearch,
      employeeId // NEW: Support for filtering by specific employee ID
    } = req.query;
    
    // First check if the LOCATOR2 table exists
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOCATOR2'
    `);
    
    if (tableCheck.recordset[0].tableExists === 0) {
      // Return empty array if table doesn't exist
      res.json([]);
      return;
    }

    // Build the base query
    let query = `
      SELECT 
        l.LOCNO,
        l.LOCDATE,
        l.LOCREMARKS,
        l.LOCENTRYDATE,
        l.LOCENTRYBY,
        l.LOCUSERID,
        l.LOCSTATUS,
        l.LOCTYPE,
        u.NAME as EmployeeName,
        u.BADGENUMBER
      FROM LOCATOR2 l
      LEFT JOIN USERINFO u ON l.LOCUSERID = u.USERID
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    // Add search conditions
    if (employeeId) {
      query += ` AND l.LOCUSERID = @param${paramIndex}`;
      params.push(employeeId);
      paramIndex++;
    }

    if (employeeSearch) {
      query += ` AND (u.NAME LIKE @param${paramIndex} OR u.BADGENUMBER LIKE @param${paramIndex})`;
      params.push(`%${employeeSearch}%`);
      paramIndex++;
    }

    if (locatorNoSearch) {
      query += ` AND l.LOCNO LIKE @param${paramIndex}`;
      params.push(`%${locatorNoSearch}%`);
      paramIndex++;
    }

    if (dateFrom) {
      query += ` AND CAST(l.LOCDATE AS DATE) >= @param${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND CAST(l.LOCDATE AS DATE) <= @param${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    if (remarksSearch) {
      query += ` AND l.LOCREMARKS LIKE @param${paramIndex}`;
      params.push(`%${remarksSearch}%`);
      paramIndex++;
    }

    // Add ordering
    query += ` ORDER BY l.LOCDATE DESC, l.LOCENTRYDATE DESC`;

    console.log('Search query:', query);
    console.log('Search parameters:', params);

    // Execute the query with parameters
    const request = pool.request();
    params.forEach((param, index) => {
      request.input(`param${index + 1}`, sql.NVarChar, param);
    });

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching locator data:', error);
    res.status(500).json({ message: 'Error fetching locator data' });
  }
};

// POST /api/management/locator2 - FIXED VERSION
export const addLocator2 = async (req, res) => {
  try {
    console.log('=== addLocator2 DEBUG START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      LOCNO,
      LOCDATE,
      LOCREMARKS,
      LOCENTRYDATE,
      LOCENTRYBY,
      LOCUSERID,
      LOCSTATUS,
      LOCTYPE
    } = req.body;

    console.log('Extracted data:', {
      LOCNO,
      LOCDATE,
      LOCREMARKS,
      LOCENTRYDATE,
      LOCENTRYBY,
      LOCUSERID,
      LOCSTATUS,
      LOCTYPE
    });

    const pool = getDb();

    // First, check if LOCATOR2 table exists
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOCATOR2'
    `);
    
    if (tableCheck.recordset[0].tableExists === 0) {
      // Create the table if it doesn't exist
      await pool.request().query(`
        CREATE TABLE [dbo].[LOCATOR2](
          [LOCNO] [nvarchar](50) NOT NULL,
          [LOCDATE] [datetime] NULL,
          [LOCREMARKS] [nvarchar](50) NULL,
          [LOCENTRYDATE] [datetime] NULL,
          [LOCENTRYBY] [int] NULL,
          [LOCUSERID] [int] NULL,
          [LOCSTATUS] [nchar](10) NULL,
          [LOCTYPE] [nvarchar](50) NULL
        ) ON [PRIMARY]
      `);
    }

    console.log('About to insert into LOCATOR2 with LOCDATE:', LOCDATE);
    console.log('LOCDATE type:', typeof LOCDATE);

    // Insert into LOCATOR2 table using raw SQL to avoid timezone conversion
    const insertQuery = `
      INSERT INTO LOCATOR2 (
        LOCNO, LOCDATE, LOCREMARKS, LOCENTRYDATE, LOCENTRYBY, LOCUSERID, LOCSTATUS, LOCTYPE
      ) VALUES (
        '${LOCNO}', 
        '${LOCDATE}', 
        '${LOCREMARKS || ''}', 
        GETDATE(), 
        ${LOCENTRYBY || 1}, 
        ${LOCUSERID}, 
        '${LOCSTATUS || 'ACTIVE'}', 
        '${LOCTYPE}'
      )
    `;
    
    console.log('Insert query:', insertQuery);
    
    await pool.request().query(insertQuery);

    console.log('Successfully inserted into LOCATOR2');

    // Only insert into CHECKINOUT table if LOCTYPE is not 'OB' (Official Business)
    if (LOCTYPE !== 'OB') {
      try {
        console.log('About to insert into CHECKINOUT with LOCDATE:', LOCDATE);
        
        const checkinoutQuery = `
          INSERT INTO CHECKINOUT (
            USERID, CHECKTIME, CHECKTYPE, VERIFYCODE, SENSORID, MEMOINFO, WORKCODE, SN, USEREXTFMT
          ) VALUES (
            '${LOCUSERID}', 
            '${LOCDATE}', 
            'I', 
            1, 
            101, 
            NULL, 
            0, 
            'CLXE224760187', 
            0
          )
        `;
        
        console.log('CHECKINOUT query:', checkinoutQuery);
        
        await pool.request().query(checkinoutQuery);
        console.log('Successfully inserted into CHECKINOUT');
      } catch (checkinoutError) {
        console.error('Error inserting into CHECKINOUT:', checkinoutError);
        // Don't throw the error, just log it since LOCATOR2 insert was successful
      }
    }

    res.json({ 
      success: true, 
      message: 'Location record created successfully',
      data: {
        LOCNO,
        LOCDATE,
        LOCREMARKS,
        LOCENTRYBY: LOCENTRYBY || 1,
        LOCUSERID,
        LOCSTATUS: LOCSTATUS || 'ACTIVE',
        LOCTYPE
      }
    });
  } catch (error) {
    console.error('Error creating location record:', error);
      res.status(500).json({ 
      success: false, 
      message: 'Error creating location record', 
      error: error.message 
    });
  }
};

export const getServerTime = async (req, res) => {
  try {
    const result = await getServerTimeFromDB();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Error getting server time', 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('Error in getServerTime controller:', error);
      res.status(500).json({ 
      success: false, 
      message: 'Error getting server time', 
      error: error.message 
    });
  }
};

// GET /api/management/calendar/monthly-stats/travel - Get monthly travel stats from TRAVELDATES2
export const getMonthlyTravelStats = async (req, res) => {
  try {
    const { year, month } = req.query;
    const pool = getDb();
    
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required'
      });
    }

    // Get travel records count for each day of the month from TRAVELDATES2
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthlyStats = {};
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      monthlyStats[dateKey] = 0;
    }
    
    res.json(monthlyStats);
  } catch (error) {
    console.error('Error getting monthly travel stats:', error);
      res.status(500).json({ 
      success: false,
      message: 'Error getting monthly travel stats',
      error: error.message
    });
  }
};

// GET /api/management/calendar/monthly-stats/locator - Get monthly locator stats from LOCATOR2
export const getMonthlyLocatorStats = async (req, res) => {
  try {
    const { year, month } = req.query;
    const pool = getDb();

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required'
      });
    }

    // Check if LOCATOR2 table exists
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOCATOR2'
    `);
    
    if (tableCheck.recordset[0].tableExists === 0) {
      // Return empty stats if table doesn't exist
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthlyStats = {};
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        monthlyStats[dateKey] = 0;
      }
      
      return res.json(monthlyStats);
    }

    // Get locator records count for each day of the month from LOCATOR2
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthlyStats = {};
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      monthlyStats[dateKey] = 0;
    }
    
    res.json(monthlyStats);
  } catch (error) {
    console.error('Error getting monthly locator stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error getting monthly locator stats',
      error: error.message 
    });
  }
};