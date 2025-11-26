import { getDb } from '../config/db.js';
import { getHR201Pool } from '../config/hr201Database.js';
import sql from 'mssql';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// @desc    Get shift schedules for ComputeAttendance
// @route   GET /api/compute-attendance/shift-schedules
// @access  Private
const getShiftSchedules = async (req, res) => {
  try {
    console.log('🔄 Fetching shift schedules for ComputeAttendance from MySQL...');
    const pool = getHR201Pool();
    
    const query = `
      SELECT 
        id,
        shiftname,
        shifttimemode,
        shift_checkin,
        shift_checkin_start,
        shift_checkin_end,
        shift_checkout,
        shift_checkout_start,
        shift_checkout_end,
        credits
      FROM shiftscheduletypes
      ORDER BY shiftname
    `;
    
    const [schedules] = await pool.execute(query);
    
    // Convert to object keyed by id, mapping to expected format
    const schedulesByShiftId = {};
    schedules.forEach(schedule => {
      schedulesByShiftId[schedule.id] = {
        SHIFTNO: schedule.id,
        SHIFTNAME: schedule.shiftname,
        SHIFTTIMEMODE: schedule.shifttimemode,
        SHIFT_AMCHECKIN: schedule.shifttimemode === 'AM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkin : null,
        SHIFT_AMCHECKIN_START: schedule.shifttimemode === 'AM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkin_start : null,
        SHIFT_AMCHECKIN_END: schedule.shifttimemode === 'AM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkin_end : null,
        SHIFT_AMCHECKOUT: schedule.shifttimemode === 'AM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkout : null,
        SHIFT_AMCHECKOUT_START: schedule.shifttimemode === 'AM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkout_start : null,
        SHIFT_AMCHECKOUT_END: schedule.shifttimemode === 'AM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkout_end : null,
        SHIFT_PMCHECKIN: schedule.shifttimemode === 'PM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkin : null,
        SHIFT_PMCHECKIN_START: schedule.shifttimemode === 'PM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkin_start : null,
        SHIFT_PMCHECKIN_END: schedule.shifttimemode === 'PM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkin_end : null,
        SHIFT_PMCHECKOUT: schedule.shifttimemode === 'PM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkout : null,
        SHIFT_PMCHECKOUT_START: schedule.shifttimemode === 'PM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkout_start : null,
        SHIFT_PMCHECKOUT_END: schedule.shifttimemode === 'PM' || schedule.shifttimemode === 'AMPM' ? schedule.shift_checkout_end : null,
        CREDITS: schedule.credits
      };
    });
    
    console.log('✅ Shift schedules fetched from MySQL:', Object.keys(schedulesByShiftId).length);
    res.json(Object.values(schedulesByShiftId));
  } catch (error) {
    console.error('❌ Error fetching shift schedules:', error);
    res.status(500).json({ message: 'Error fetching shift schedules', error: error.message });
  }
};

// @desc    Get time logs for ComputeAttendance
// @route   GET /api/compute-attendance/time-logs
// @access  Private
const getTimeLogs = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    
    console.log('🔄 Fetching time logs for ComputeAttendance:', { userId, startDate, endDate });
    
    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'userId, startDate, and endDate are required' 
      });
    }
    
    const pool = getDb();
    
    const query = `
      SELECT 
        USERID,
        CHECKTIME,
        CAST(CHECKTIME AS DATE) as date
      FROM CHECKINOUT 
      WHERE USERID = @userId 
        AND CAST(CHECKTIME AS DATE) BETWEEN @startDate AND @endDate
      ORDER BY CHECKTIME
    `;
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(query);
    
    console.log('✅ Time logs fetched:', result.recordset.length);
    res.json(result.recordset);
  } catch (error) {
    console.error('❌ Error fetching time logs:', error);
    res.status(500).json({ message: 'Error fetching time logs', error: error.message });
  }
};

// @desc    Get employees for ComputeAttendance
// @route   GET /api/compute-attendance/employees
// @access  Private
const getEmployees = async (req, res) => {
  try {
    const { department, status } = req.query;
    
    console.log('🔄 Fetching employees for ComputeAttendance from MySQL:', { department, status });
    
    const pool = getHR201Pool();
    
    let query = `
      SELECT 
        e.objid,
        e.dtruserid AS USERID,
        e.dtrbadgenumber AS BADGENUMBER,
        e.surname,
        e.firstname,
        e.middlename,
        COALESCE(dept_cur.departmentshortname, dept_emp.departmentshortname) AS DEPARTMENT,
        cur.position AS TITLE,
        cur.appointmentstatus AS Appointment,
        e.empstatus AS STATUS,
        em.photo_path
      FROM employees e
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN department dept_emp ON dept_emp.deptid = e.deptid
      INNER JOIN employee_designation cur
        ON cur.emp_objid = e.objid AND cur.ispresent = 1
      LEFT JOIN department dept_cur ON dept_cur.deptid = cur.assigneddept
      WHERE 1=1
    `;
    
    const params = [];
    
    if (department && department !== 'all') {
      query += ` AND (dept_cur.departmentshortname = ? OR dept_emp.departmentshortname = ?)`;
      params.push(department, department);
    }
    
    if (status && status !== 'all') {
      // Map status: 'active' means empstatus >= 0, 'inactive' means empstatus < 0
      if (status === 'active') {
        query += ` AND e.empstatus >= 0`;
      } else if (status === 'inactive') {
        query += ` AND e.empstatus < 0`;
      }
    }
    
    query += ` ORDER BY e.surname, e.firstname ASC`;
    
    const [employees] = await pool.execute(query, params);
    
    // Format employee names and map to expected structure
    const formattedEmployees = employees.map(emp => ({
      USERID: emp.USERID || emp.objid,
      NAME: formatEmployeeName(emp.surname, emp.firstname, emp.middlename),
      BADGENUMBER: emp.BADGENUMBER || '',
      DEPARTMENT: emp.DEPARTMENT || '',
      TITLE: emp.TITLE || '',
      Appointment: emp.Appointment || null,
      STATUS: emp.STATUS || 0,
      photo_path: emp.photo_path || null,
      objid: emp.objid
    }));
    
    console.log('✅ Employees fetched from MySQL:', formattedEmployees.length);
    console.log('✅ First employee sample:', formattedEmployees[0]);
    
    res.json(formattedEmployees);
  } catch (error) {
    console.error('❌ Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees', error: error.message });
  }
};

// @desc    Get departments for ComputeAttendance
// @route   GET /api/compute-attendance/departments
// @access  Private
const getDepartments = async (req, res) => {
  try {
    console.log('🔄 Fetching departments for ComputeAttendance from MySQL...');
    const pool = getHR201Pool();
    
    const query = `
      SELECT DISTINCT departmentshortname AS DEPARTMENT
      FROM department
      WHERE departmentshortname IS NOT NULL 
        AND departmentshortname != ''
      ORDER BY departmentshortname
    `;
    
    const [departments] = await pool.execute(query);
    
    console.log('✅ Departments fetched from MySQL:', departments.length);
    res.json(departments.map(row => row.DEPARTMENT));
  } catch (error) {
    console.error('❌ Error fetching departments:', error);
    res.status(500).json({ message: 'Error fetching departments', error: error.message });
  }
};

// @desc    Calculate attendance metrics for ComputeAttendance
// @route   POST /api/compute-attendance/calculate
// @access  Private
const calculateAttendance = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.body;
    
    console.log('🔄 Calculating attendance for ComputeAttendance:', { userId, startDate, endDate });
    
    if (!userId || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'userId, startDate, and endDate are required' 
      });
    }
    
    const mssqlPool = getDb(); // For time logs from CHECKINOUT
    const mysqlPool = getHR201Pool(); // For employee and shift schedule data
    
    // Map userId (dtruserid) to emp_objid in MySQL
    const [empRows] = await mysqlPool.execute(
      'SELECT objid FROM employees WHERE TRIM(CAST(dtruserid AS CHAR)) = ? LIMIT 1',
      [String(userId)]
    );
    
    if (empRows.length === 0) {
      return res.status(404).json({ 
        message: 'Employee not found in MySQL database',
        data: {
          totalLates: 0,
          totalDays: 0,
          netDays: 0,
          equivalentDaysDeducted: 0,
          locatorsCount: 0,
          leavesCount: 0,
          travelsCount: 0
        }
      });
    }
    
    const empObjId = empRows[0].objid;
    console.log(`✅ Mapped USERID ${userId} to emp_objid: ${empObjId}`);
    
    // Fetch assigned shifts from MySQL
    const [assignedShifts] = await mysqlPool.execute(`
      SELECT 
        a.objid AS assignment_id,
        a.emp_objid,
        a.shiftid,
        a.is_used,
        a.createddate AS assignment_date,
        s.id AS shift_id,
        s.shiftname,
        s.shifttimemode,
        s.shift_checkin,
        s.shift_checkin_start,
        s.shift_checkin_end,
        s.shift_checkout,
        s.shift_checkout_start,
        s.shift_checkout_end,
        s.is_ot,
        s.credits
      FROM employee_assignedshifts a
      JOIN shiftscheduletypes s ON s.id = a.shiftid
      WHERE a.emp_objid = ? AND a.is_used = 1
      ORDER BY a.createddate DESC
    `, [empObjId]);
    
    console.log(`📊 Found ${assignedShifts.length} assigned shifts with is_used=1`);
    
    // Combine shifts into single shift schedule object (same logic as DTRPortalUsersController)
    let shiftSchedule = null;
    
    if (assignedShifts.length > 0) {
      shiftSchedule = {
        SHIFTNO: null,
        SHIFTNAME: null,
        SHIFT_AMCHECKIN: null,
        SHIFT_AMCHECKIN_START: null,
        SHIFT_AMCHECKIN_END: null,
        SHIFT_AMCHECKOUT: null,
        SHIFT_AMCHECKOUT_START: null,
        SHIFT_AMCHECKOUT_END: null,
        SHIFT_PMCHECKIN: null,
        SHIFT_PMCHECKIN_START: null,
        SHIFT_PMCHECKIN_END: null,
        SHIFT_PMCHECKOUT: null,
        SHIFT_PMCHECKOUT_START: null,
        SHIFT_PMCHECKOUT_END: null
      };
      
      // Separate shifts by mode
      const amShifts = assignedShifts.filter(s => s.shifttimemode === 'AM' || s.shifttimemode === 'AMPM');
      const pmShifts = assignedShifts.filter(s => s.shifttimemode === 'PM' || s.shifttimemode === 'AMPM');
      
      // Process AM shifts
      if (amShifts.length > 0) {
        const amShift = amShifts[0];
        shiftSchedule.SHIFT_AMCHECKIN = amShift.shift_checkin || null;
        shiftSchedule.SHIFT_AMCHECKIN_START = amShift.shift_checkin_start || null;
        shiftSchedule.SHIFT_AMCHECKIN_END = amShift.shift_checkin_end || null;
        shiftSchedule.SHIFT_AMCHECKOUT = amShift.shift_checkout || null;
        shiftSchedule.SHIFT_AMCHECKOUT_START = amShift.shift_checkout_start || null;
        shiftSchedule.SHIFT_AMCHECKOUT_END = amShift.shift_checkout_end || null;
      }
      
      // Process PM shifts
      if (pmShifts.length > 0) {
        const pmShift = pmShifts[0];
        shiftSchedule.SHIFT_PMCHECKIN = pmShift.shift_checkin || null;
        shiftSchedule.SHIFT_PMCHECKIN_START = pmShift.shift_checkin_start || null;
        shiftSchedule.SHIFT_PMCHECKIN_END = pmShift.shift_checkin_end || null;
        shiftSchedule.SHIFT_PMCHECKOUT = pmShift.shift_checkout || null;
        shiftSchedule.SHIFT_PMCHECKOUT_START = pmShift.shift_checkout_start || null;
        shiftSchedule.SHIFT_PMCHECKOUT_END = pmShift.shift_checkout_end || null;
      }
      
      // Set SHIFTNAME
      const shiftNames = assignedShifts.map(s => s.shiftname).filter(Boolean);
      if (shiftNames.length > 0) {
        shiftSchedule.SHIFTNAME = [...new Set(shiftNames)].join(' / ');
      }
    }
    
    if (!shiftSchedule || (!shiftSchedule.SHIFT_AMCHECKIN && !shiftSchedule.SHIFT_PMCHECKIN)) {
      return res.status(404).json({ 
        message: 'No shift schedule assigned to employee',
        data: {
          totalLates: 0,
          totalDays: 0,
          netDays: 0,
          equivalentDaysDeducted: 0,
          locatorsCount: 0,
          leavesCount: 0,
          travelsCount: 0
        }
      });
    }
    
    // Get time logs from MSSQL CHECKINOUT (baseline for DTR attendance)
    const logsQuery = `
      SELECT 
        USERID,
        CHECKTIME,
        CAST(CHECKTIME AS DATE) as date
      FROM CHECKINOUT 
      WHERE USERID = @userId 
        AND CAST(CHECKTIME AS DATE) BETWEEN @startDate AND @endDate
      ORDER BY CHECKTIME
    `;
    
    const logsResult = await mssqlPool.request()
      .input('userId', sql.Int, userId)
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(logsQuery);
    
    const logs = logsResult.recordset;
    console.log(`✅ Fetched ${logs.length} time logs from MSSQL CHECKINOUT`);
    
    // Fetch holidays for date range (for days calculation)
    const [holidayData] = await mysqlPool.execute(`
      SELECT 
        id,
        holidayname,
        holidaydate,
        isrecurring,
        status
      FROM holidays
      WHERE status = 1
        AND (
          (isrecurring = 1)
          OR (isrecurring = 0 AND DATE(holidaydate) BETWEEN ? AND ?)
        )
    `, [startDate, endDate]);
    
    // Fetch travel, CDO, fix logs, and locator data for date range (for days calculation)
    const [travelData] = await mysqlPool.execute(`
      SELECT 
        et.objid as travel_objid,
        et.travelstatus,
        DATE(etd.traveldate) as traveldate,
        etd.emp_objid
      FROM employee_travels_dates etd
      INNER JOIN employee_travels et ON et.objid = etd.travel_objid
      WHERE etd.emp_objid = ?
        AND UPPER(COALESCE(et.travelstatus, '')) = 'APPROVED'
        AND DATE(etd.traveldate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    const [cdoData] = await mysqlPool.execute(`
      SELECT 
        u.cdo_id,
        DATE(u.cdodate) as cdodate,
        COALESCE(u.cdodatestatus, c.cdostatus, '') as cdostatus,
        c.emp_objid
      FROM employee_cdo_usedates u
      INNER JOIN employee_cdo c ON c.id = u.cdo_id
      WHERE c.emp_objid = ?
        AND UPPER(COALESCE(u.cdodatestatus, c.cdostatus, '')) = 'APPROVED'
        AND DATE(u.cdodate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    const [fixLogsData] = await mysqlPool.execute(`
      SELECT 
        fixid,
        emp_objid,
        DATE(checktimedate) as checktimedate,
        fixstatus
      FROM employee_fixchecktimes
      WHERE emp_objid = ?
        AND UPPER(COALESCE(fixstatus, '')) = 'APPROVED'
        AND DATE(checktimedate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    const [locatorData] = await mysqlPool.execute(`
      SELECT 
        objid,
        emp_objid,
        DATE(locatordate) as locatordate,
        locstatus
      FROM employee_locators
      WHERE emp_objid = ? AND locstatus = 'Approved'
        AND DATE(locatordate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    // Calculate attendance metrics using EXACT same logic as TimeLogsManagement
    const attendanceMetrics = groupLogsByDateWithTimeWindows(
      logs, 
      shiftSchedule, 
      startDate, 
      endDate,
      travelData,
      cdoData,
      fixLogsData,
      locatorData,
      holidayData
    );
    
    // Get counts for locators, leaves, and travels from MySQL (for display)
    const [locatorCount] = await mysqlPool.execute(`
      SELECT COUNT(*) as count
      FROM employee_locators
      WHERE emp_objid = ? AND locstatus = 'Approved'
        AND DATE(locatordate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    const [leaveCount] = await mysqlPool.execute(`
      SELECT COUNT(DISTINCT elt.objid) as count
      FROM employee_leave_trans elt
      INNER JOIN employee_leave_trans_details eltd ON elt.objid = eltd.leave_objid
      WHERE elt.emp_objid = ? 
        AND UPPER(COALESCE(elt.leavestatus, '')) = 'APPROVED'
        AND DATE(eltd.leavedate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    const [travelCount] = await mysqlPool.execute(`
      SELECT COUNT(DISTINCT etd.travel_objid) as count
      FROM employee_travels_dates etd
      INNER JOIN employee_travels et ON et.objid = etd.travel_objid
      WHERE etd.emp_objid = ?
        AND UPPER(COALESCE(et.travelstatus, '')) = 'APPROVED'
        AND DATE(etd.traveldate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);

    const [cdoCount] = await mysqlPool.execute(`
      SELECT COUNT(*) as count
      FROM employee_cdo_usedates u
      INNER JOIN employee_cdo c ON c.id = u.cdo_id
      WHERE c.emp_objid = ?
        AND UPPER(COALESCE(u.cdodatestatus, c.cdostatus, '')) = 'APPROVED'
        AND DATE(u.cdodate) BETWEEN ? AND ?
    `, [empObjId, startDate, endDate]);
    
    const counts = {
      locatorsCount: locatorCount[0]?.count || 0,
      leavesCount: leaveCount[0]?.count || 0,
      travelsCount: travelCount[0]?.count || 0,
      cdoCount: cdoCount[0]?.count || 0
    };
    
    console.log('✅ Attendance calculated:', attendanceMetrics);
    console.log('✅ Counts calculated:', counts);
    
    res.json({
      success: true,
      data: {
        ...attendanceMetrics,
        locatorsCount: counts.locatorsCount,
        leavesCount: counts.leavesCount,
        travelsCount: counts.travelsCount,
        cdoCount: counts.cdoCount
      },
      shiftSchedule: shiftSchedule,
      logsCount: logs.length
    });
    
  } catch (error) {
    console.error('❌ Error calculating attendance:', error);
    res.status(500).json({ message: 'Error calculating attendance', error: error.message });
  }
};

// @desc    Check which employees have computed DTR for given month/year/period
// @route   GET /api/compute-attendance/check-computed-dtr
// @access  Private
export const checkComputedDtr = async (req, res) => {
  try {
    const { computedmonth, computedyear, period } = req.query;
    
    if (!computedmonth || !computedyear || !period) {
      return res.status(400).json({ 
        success: false,
        message: 'computedmonth, computedyear, and period are required' 
      });
    }
    
    const pool = getHR201Pool();
    
    // Map period values: 'full' → 'Full Month', 'first' → '1st Half', 'second' → '2nd Half'
    const periodMap = {
      'full': 'Full Month',
      'first': '1st Half',
      'second': '2nd Half'
    };
    const periodValue = periodMap[period] || period;
    
    // Query to get all emp_objid that have computed DTR matching the criteria
    const [computedRecords] = await pool.execute(`
      SELECT DISTINCT emp_objid
      FROM employee_computeddtr
      WHERE computedmonth = ?
        AND computedyear = ?
        AND period = ?
        AND computestatus IN ('For Approval', 'Approved')
    `, [computedmonth, computedyear, periodValue]);
    
    const empObjIds = computedRecords.map(record => record.emp_objid);
    
    console.log(`✅ Found ${empObjIds.length} employees with computed DTR for ${computedmonth} ${computedyear} (${periodValue})`);
    
    res.json({
      success: true,
      empObjIds: empObjIds,
      count: empObjIds.length
    });
  } catch (error) {
    console.error('❌ Error checking computed DTR:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error checking computed DTR', 
      error: error.message 
    });
  }
};

// @desc    Check which periods exist for given employees in a month/year
// @route   GET /api/compute-attendance/check-all-periods
// @access  Private
export const checkAllPeriodsForEmployees = async (req, res) => {
  try {
    const { computedmonth, computedyear, emp_objids } = req.query;
    
    if (!computedmonth || !computedyear) {
      return res.status(400).json({ 
        success: false,
        message: 'computedmonth and computedyear are required' 
      });
    }
    
    if (!emp_objids) {
      return res.json({
        success: true,
        periods: {
          '1st Half': [],
          'Full Month': [],
          '2nd Half': []
        }
      });
    }
    
    const pool = getHR201Pool();
    
    // Parse emp_objids from comma-separated string
    const empObjIdArray = emp_objids.split(',').map(id => id.trim()).filter(id => id);
    
    if (empObjIdArray.length === 0) {
      return res.json({
        success: true,
        periods: {
          '1st Half': [],
          'Full Month': [],
          '2nd Half': []
        }
      });
    }
    
    // Create placeholders for IN clause
    const placeholders = empObjIdArray.map(() => '?').join(',');
    
    // Query to get all periods for the given employees
    const [computedRecords] = await pool.execute(`
      SELECT DISTINCT emp_objid, period
      FROM employee_computeddtr
      WHERE computedmonth = ?
        AND computedyear = ?
        AND emp_objid IN (${placeholders})
        AND computestatus IN ('For Approval', 'Approved')
    `, [computedmonth, computedyear, ...empObjIdArray]);
    
    // Group by period
    const periods = {
      '1st Half': [],
      'Full Month': [],
      '2nd Half': []
    };
    
    computedRecords.forEach(record => {
      if (periods[record.period]) {
        periods[record.period].push(record.emp_objid);
      }
    });
    
    console.log(`✅ Found periods for ${empObjIdArray.length} employees:`, {
      '1st Half': periods['1st Half'].length,
      'Full Month': periods['Full Month'].length,
      '2nd Half': periods['2nd Half'].length
    });
    
    res.json({
      success: true,
      periods: periods
    });
  } catch (error) {
    console.error('❌ Error checking all periods:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error checking all periods', 
      error: error.message 
    });
  }
};

// Helper function to check if date is weekend (matching TimeLogsManagement)
const isWeekend = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
};

// Helper function to extract date safely (matching TimeLogsManagement)
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
  }
  
  // For Date objects, extract date part directly
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // For other types, convert to string and extract date part
  const str = String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : '';
};

// Helper function to get holiday date value (matching TimeLogsManagement)
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
      if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return match[0];
      }
    }
  }
  return '';
};

// Helper function to check if holiday is recurring (matching TimeLogsManagement)
const isHolidayRecurring = (holiday) => {
  const recurringValue =
    holiday?.ISRECURRING ??
    holiday?.isRecurring ??
    holiday?.is_recurring ??
    holiday?.isrecurring ??
    holiday?.recurring ??
    holiday?.IS_RECURRING;

  if (recurringValue === undefined || recurringValue === null) return false;
  if (typeof recurringValue === 'boolean') return recurringValue;
  if (typeof recurringValue === 'number') return recurringValue === 1;

  const normalized = String(recurringValue).trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

// Helper function to check if date has holiday (matching TimeLogsManagement logic)
const checkHoliday = (holidayData, dateStr) => {
  if (!holidayData || holidayData.length === 0 || !dateStr) return false;
  
  // Extract date safely without timezone conversion
  const targetDate = extractDateSafe(dateStr);
  if (!targetDate || targetDate.length < 10) return false;
  
  const targetMonthDay = targetDate.slice(5, 10); // MM-DD
  
  return holidayData.some(holiday => {
    const rawHolidayDate = holiday.HOLIDAYDATE || holiday.holidaydate || holiday.holiday_date || holiday.HolidayDate || holiday.date || '';
    const holidayDate = getHolidayDateValue(holiday);
    if (!holidayDate || holidayDate.length < 10) return false;
    
    // For recurring holidays, match by month-day (MM-DD) to work for any year
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

// EXACT COPY of groupLogsByDateWithTimeWindows from TimeLogsManagement
function groupLogsByDateWithTimeWindows(logs, shiftSchedule, startDate, endDate, travelData = [], cdoData = [], fixLogsData = [], locatorData = [], holidayData = []) {
  // Check if shift schedule exists
  if (!shiftSchedule) {
    console.log('⚠️ No shift schedule found for processing');
    return {
      totalLates: 0,
      totalDays: 0,
      netDays: 0,
      equivalentDaysDeducted: 0
    };
  }

  console.log('🔍 Shift schedule data:', shiftSchedule);
  console.log(' Available shift schedule fields:', Object.keys(shiftSchedule));

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
  logs.forEach(log => {
    const date = extractDate(log.CHECKTIME || log.DATE || log.date);
    if (!date) return;
    if (!logsByDate[date]) logsByDate[date] = [];
    logsByDate[date].push(log);
  });

  console.log('📅 Logs grouped by date:', logsByDate);

  // Generate all dates in range - FIXED to process entire month
  const allDates = generateDateRange(startDate, endDate);
  console.log('📆 Date range:', { startDate, endDate, allDates, totalDays: allDates.length });

  let totalLates = 0;
  let totalDays = 0;
  let equivalentDaysDeducted = 0;
  const dailyData = []; // Store daily time log data for details

  // Get USERID from logs (all logs should have same USERID)
  const userId = logs.length > 0 ? (logs[0].USERID || logs[0].userid || null) : null;

  // Process each date in the month
  allDates.forEach(date => {
    const logsForDay = logsByDate[date] || [];
    console.log(`📅 Processing date ${date}, logs:`, logsForDay);

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

    console.log(`⏰ Time logs for ${date}:`, {
      AM_CHECKIN,
      AM_CHECKOUT,
      PM_CHECKIN,
      PM_CHECKOUT
    });

    // Calculate late minutes - only for active check-in columns
    let LATE = 0;
    
    // AM_CHECKIN late calculation - only if AM check-in is active
    if (activeColumns.hasAMCheckIn && AM_CHECKIN && shiftSchedule.SHIFT_AMCHECKIN) {
      const expectedAMTime = timeToMinutes(extractTimeFromString(shiftSchedule.SHIFT_AMCHECKIN));
      const actualAMTime = timeToMinutes(AM_CHECKIN);
      if (actualAMTime > expectedAMTime) {
        LATE += actualAMTime - expectedAMTime;
      }
      console.log(`🕐 AM Late calculation for ${date}: expected=${expectedAMTime}, actual=${actualAMTime}, late=${actualAMTime - expectedAMTime}`);
    }
    
    // PM_CHECKIN late calculation - only if PM check-in is active
    if (activeColumns.hasPMCheckIn && PM_CHECKIN && shiftSchedule.SHIFT_PMCHECKIN) {
      const expectedPMTime = timeToMinutes(extractTimeFromString(shiftSchedule.SHIFT_PMCHECKIN));
      const actualPMTime = timeToMinutes(PM_CHECKIN);
      if (actualPMTime > expectedPMTime) {
        LATE += actualPMTime - expectedPMTime;
      }
      console.log(`🕐 PM Late calculation for ${date}: expected=${expectedPMTime}, actual=${actualPMTime}, late=${actualPMTime - expectedPMTime}`);
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

    // Calculate days using the proper function with checks for travel, CDO, fix logs, locator, holidays, and weekends
    // Helper function to normalize date to YYYY-MM-DD format
    const normalizeDate = (dateValue) => {
      if (!dateValue) return null;
      if (dateValue instanceof Date) {
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      const dateStr = String(dateValue);
      // Extract YYYY-MM-DD from string (handles both date strings and datetime strings)
      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? match[0] : null;
    };
    
    // Check if it's a weekend
    const isWeekendDay = isWeekend(date);
    
    // Check if it's a holiday (matching TimeLogsManagement logic)
    const hasHoliday = checkHoliday(holidayData, date);
    
    // Check for approved travel
    const hasTravel = travelData.some(travel => {
      const travelDate = normalizeDate(travel.traveldate);
      return travelDate === date;
    });
    
    // Check for approved CDO
    const hasCdo = cdoData.some(cdo => {
      const cdoDate = normalizeDate(cdo.cdodate);
      return cdoDate === date;
    });
    
    // Check for approved fix logs
    const hasFixLog = fixLogsData.some(fixLog => {
      const fixDate = normalizeDate(fixLog.checktimedate);
      return fixDate === date;
    });
    
    // Check for approved locator
    const hasLocator = locatorData.some(locator => {
      const locDate = normalizeDate(locator.locatordate);
      return locDate === date;
    });
    
    // Calculate time-based days first
    const timeBasedDays = calculateDays(AM_CHECKIN, AM_CHECKOUT, PM_CHECKIN, PM_CHECKOUT);
    
    // If any approved record exists (travel, CDO, fix logs, locator), count as 1 day
    let DAYS = 0;
    if (hasTravel || hasCdo || hasFixLog || hasLocator) {
      DAYS = 1;
    } else {
      // If it's a weekend or holiday with no work, count as 0 (matching TimeLogsManagement logic)
      if ((isWeekendDay || hasHoliday) && timeBasedDays === 0) {
        DAYS = 0;
      } else {
        // Otherwise, use time-based calculation
        DAYS = timeBasedDays;
      }
    }
    
    console.log(`📊 Day calculation for ${date}: ${DAYS} days (travel: ${hasTravel}, cdo: ${hasCdo}, fixLog: ${hasFixLog}, locator: ${hasLocator}, weekend: ${isWeekendDay}, holiday: ${hasHoliday}, timeBased: ${timeBasedDays}), ${LATE} minutes late`);

    // Store daily data for details table
    dailyData.push({
      dtruserid: userId,
      dtrdate: date,
      am_checkin: AM_CHECKIN || null,
      am_checkout: AM_CHECKOUT || null,
      pm_checkin: PM_CHECKIN || null,
      pm_checkout: PM_CHECKOUT || null,
      ot_checkin: null, // Not calculated yet
      ot_checkout: null, // Not calculated yet
      hascdo: hasCdo ? 1 : 0,
      hasleave: 0, // Leave data not available in this function, would need to be added
      hastravel: hasTravel ? 1 : 0,
      haslocator: hasLocator ? 1 : 0,
      hasfixlogs: hasFixLog ? 1 : 0
    });

    // Add to totals
    totalLates += LATE;
    totalDays += DAYS;
    equivalentDaysDeducted += LATE / (8 * 60); // Convert late minutes to days
  });
  
  // Calculate Net Days
  const latesInDays = totalLates / (8 * 60);
  const netDays = Math.max(0, totalDays - latesInDays);
  
  console.log('📊 Final metrics for entire month:', {
    totalLates,
    totalDays,
    latesInDays,
    netDays,
    equivalentDaysDeducted,
    totalDaysProcessed: allDates.length,
    calculation: `${totalDays} - (${totalLates} minutes / 480 minutes) = ${totalDays} - ${latesInDays} = ${netDays}`
  });
  
  return {
    totalLates: Math.round(totalLates),
    totalDays,
    netDays: Math.round(netDays * 10000) / 10000,
    equivalentDaysDeducted: Math.round(equivalentDaysDeducted * 100) / 100,
    dailyData: dailyData // Return daily time log data for details table
  };
}

// Helper functions - NO TIME/DATE CONVERSION, use raw database values
const extractTimeFromString = (value) => {
  if (!value) return '';
  
  // Handle Date objects - extract time directly without timezone conversion
  if (value instanceof Date) {
    // Convert to ISO string and extract time part directly
    const isoString = value.toISOString();
    const timeMatch = isoString.match(/T(\d{2}):(\d{2})/);
    if (timeMatch) {
      return `${timeMatch[1]}:${timeMatch[2]}`;
    }
  }
  
  // If it's already in HH:MM format, return as is
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  
  // If it's a datetime string, extract time part directly
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

const extractDate = (value) => {
  if (!value) return '';
  
  // Handle Date objects - extract date directly without timezone conversion
  if (value instanceof Date) {
    // Convert to ISO string and extract date part directly
    const isoString = value.toISOString();
    return isoString.split('T')[0];
  }
  
  // Handle string values - extract date part directly
  if (typeof value === 'string') {
    return value.split(/[ T]/)[0];
  }
  
  // Handle other types by converting to string first
  return String(value).split(/[ T]/)[0];
};

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const getTimeWindow = (start, end) => {
  if (!start || !end) return [null, null];
  return [timeToMinutes(start), timeToMinutes(end)];
};

const validateTimeInWindow = (timeStr, startWindow, endWindow) => {
  if (!timeStr || !startWindow || !endWindow) return false;
  const timeInMinutes = timeToMinutes(timeStr);
  return timeInMinutes >= startWindow && timeInMinutes <= endWindow;
};

const calculateDays = (amCheckIn, amCheckOut, pmCheckIn, pmCheckOut) => {
  const hasAMCheckIn = amCheckIn && amCheckIn.trim() !== '';
  const hasAMCheckOut = amCheckOut && amCheckOut.trim() !== '';
  const hasPMCheckIn = pmCheckIn && pmCheckIn.trim() !== '';
  const hasPMCheckOut = pmCheckOut && pmCheckOut.trim() !== '';

  // Days = 1 (Full Day Credit) if:
  // Both AM and PM sessions are complete, OR
  // One session is complete and the other is partially complete but still has a CHECKIN + CHECKOUT pair (3 valid logs forming a full day), OR
  // Has AM-CHECKIN and PM-CHECKOUT (spans full work day)
  if ((hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) || // Both sessions complete
      (hasAMCheckIn && hasAMCheckOut && hasPMCheckOut && !hasPMCheckIn) || // AM complete + PM-CHECKOUT
      (hasAMCheckIn && hasPMCheckIn && hasPMCheckOut && !hasAMCheckOut) || // PM complete + AM-CHECKIN
      (hasAMCheckIn && hasPMCheckOut)) { // AM-CHECKIN + PM-CHECKOUT (spans full day)
    return 1;
  }
  
  // Days = 0.5 (Half Day Credit) if:
  // Only AM session is complete, or
  // Only PM session is complete, or
  // Missing AM-CHECKIN but has AM-CHECKOUT + full PM session, or
  // Full AM session + PM-CHECKIN but missing PM-CHECKOUT, or
  // Has AM-CHECKIN + PM-CHECKIN but missing both checkouts, or
  // Has AM-CHECKOUT + PM-CHECKOUT but missing both checkins
  if ((hasAMCheckIn && hasAMCheckOut && !hasPMCheckIn && !hasPMCheckOut) || // Only AM complete
      (!hasAMCheckIn && !hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) || // Only PM complete
      (!hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && hasPMCheckOut) || // Missing AM-CHECKIN + AM-CHECKOUT + full PM
      (hasAMCheckIn && hasAMCheckOut && hasPMCheckIn && !hasPMCheckOut) || // Full AM + PM-CHECKIN + missing PM-CHECKOUT
      (hasAMCheckIn && !hasAMCheckOut && hasPMCheckIn && !hasPMCheckOut) || // AM-CHECKIN + PM-CHECKIN + missing both checkouts
      (!hasAMCheckIn && hasAMCheckOut && !hasPMCheckIn && hasPMCheckOut)) { // AM-CHECKOUT + PM-CHECKOUT + missing both checkins
    return 0.5;
  }
  
  // Days = 0 (No Credit) if:
  // Neither AM nor PM session is complete
  return 0;
};

// FIXED: Generate date range for entire month
const generateDateRange = (startDate, endDate) => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  console.log('📅 Generating date range from:', startDate, 'to:', endDate);
  console.log('📅 Start date object:', start);
  console.log('�� End date object:', end);
  
  // Create a copy of start date to avoid modifying the original
  let current = new Date(start);
  
  while (current <= end) {
    const dateString = current.toISOString().slice(0, 10);
    dates.push(dateString);
    console.log('📅 Added date to range:', dateString);
    current.setDate(current.getDate() + 1);
  }
  
  console.log('📅 Generated dates:', dates.length, 'days');
  console.log('📅 All dates in range:', dates);
  return dates;
};

export {
  getShiftSchedules,
  getTimeLogs,
  getEmployees,
  getDepartments,
  calculateAttendance
};
