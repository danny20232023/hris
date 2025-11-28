import { getHR201Pool } from '../config/hr201Database.js';
import { getDb } from '../config/db.js';
import sql from 'mssql';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { changeNotificationService } from '../services/changeNotificationService.js';
import { formatEmployeeName as formatEmployeeNameUtil } from '../utils/employeenameFormatter.js';

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const generateOTNo = async (connection) => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${yyyy}${mm}${dd}OT-`;

  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS cnt FROM employee_overtimes WHERE DATE(otdateissued) = ?',
    [`${yyyy}-${mm}-${dd}`]
  );

  const seq = Number(rows?.[0]?.cnt || 0) + 1;
  const seqStr = String(seq).padStart(3, '0');
  return `${prefix}${seqStr}`;
};

const formatEmployeeName = formatEmployeeNameUtil;

const normalizeStatus = (value) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'PENDING') {
    return 'For Approval';
  }
  return trimmed;
};

const normalizeStatusUpper = (value) => normalizeStatus(value).toUpperCase();

export const listOTTransactions = async (req, res) => {
  let connection;
  try {
    const { status, employee, otType, dateFrom, dateTo, scope, emp_objid: queryEmpObjid } = req.query || {};

    const pool = getHR201Pool();
    connection = await pool.getConnection();

    let employeeObjIdFilter = null;
    if (scope === 'self') {
      const userId = req.user?.USERID || req.user?.id || null;
      if (userId) {
        const [empRows] = await connection.execute(
          'SELECT objid FROM employees WHERE dtruserid = ? LIMIT 1',
          [userId]
        );
        if (empRows.length) {
          employeeObjIdFilter = empRows[0].objid;
        }
      }
    }
    if (queryEmpObjid) {
      employeeObjIdFilter = queryEmpObjid;
    }

    const [rows] = await connection.execute(
      `SELECT 
        otid, otno, otdetails, otdateissued,
        ottimefrom,
        ottimeto,
        total_renderedtime, otremarks, createdby, createddate,
        updatedby, updateddate, approvedby, approveddate, otstatus
       FROM employee_overtimes
       ORDER BY otdateissued DESC, createddate DESC`
    );

    const filters = [];
    // Note: employee_overtimes doesn't have emp_objid directly, we'll filter after joining with employee_overtimes_dates
    if (employeeObjIdFilter) {
      // Will be handled after getting OT dates
    }
    if (status && status !== 'All') {
      const statusUpper = normalizeStatusUpper(status);
      filters.push((row) => normalizeStatusUpper(row.otstatus) === statusUpper);
    }
    if (employee && employee.trim()) {
      // Will filter after joining with employees
    }
    // OT type filtering removed - ottype is no longer in employee_overtimes table, only in employee_overtimes_dates
    // if (otType) {
    //   filters.push((row) => String(row.ottype) === String(otType));
    // }
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      if (!Number.isNaN(fromTime)) {
        filters.push((row) => {
          const dateTime = new Date(row.otdateissued || row.createddate || '').getTime();
          return !Number.isNaN(dateTime) && dateTime >= fromTime;
        });
      }
    }
    if (dateTo) {
      const toTime = new Date(dateTo).getTime();
      if (!Number.isNaN(toTime)) {
        filters.push((row) => {
          const dateTime = new Date(row.otdateissued || row.createddate || '').getTime();
          return !Number.isNaN(dateTime) && dateTime <= toTime;
        });
      }
    }

    let filteredRows = filters.length ? rows.filter((row) => filters.every((fn) => fn(row))) : rows;

    const otIds = filteredRows.map((row) => row.otid).filter(Boolean);
    
    // Get employee IDs from employee_overtimes_dates
    let employeeIds = [];
    if (otIds.length) {
      const [empIdRows] = await connection.query(
        'SELECT DISTINCT emp_objid FROM employee_overtimes_dates WHERE otid IN (?)',
        [otIds]
      );
      employeeIds = empIdRows.map((row) => row.emp_objid).filter(Boolean);
      
      // Filter by employee if needed
      if (employeeObjIdFilter) {
        employeeIds = employeeIds.filter((id) => String(id) === String(employeeObjIdFilter));
      }
    }

    // Get employee info
    const employeeMap = new Map();
    if (employeeIds.length) {
      const [employeeRows] = await connection.query(
        `SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path
         FROM employees e
         LEFT JOIN employees_media em ON em.emp_objid = e.objid
         WHERE e.objid IN (?)`,
        [employeeIds]
      );
      for (const emp of employeeRows) {
        let photo = null;
        if (emp.photo_path) {
          try {
            photo = await readMediaAsBase64(emp.photo_path);
          } catch (error) {
            console.warn('Failed to read employee photo:', emp.objid, error.message);
            photo = null;
          }
        }
        employeeMap.set(emp.objid, {
          name: formatEmployeeName(emp.surname, emp.firstname, emp.middlename),
          photo,
        });
      }
    }

    // Get employee IDs for each OT transaction through employee_overtimes_dates
    const otIdToEmpObjIdMap = new Map();
    if (otIds.length) {
      const [empIdRows] = await connection.query(
        'SELECT DISTINCT otid, emp_objid FROM employee_overtimes_dates WHERE otid IN (?)',
        [otIds]
      );
      for (const row of empIdRows) {
        if (!otIdToEmpObjIdMap.has(row.otid)) {
          otIdToEmpObjIdMap.set(row.otid, []);
        }
        otIdToEmpObjIdMap.get(row.otid).push(row.emp_objid);
      }
    }

    // Filter by employee name if provided
    if (employee && employee.trim()) {
      const employeeLower = employee.toLowerCase().trim();
      filteredRows = filteredRows.filter((row) => {
        const empObjIds = otIdToEmpObjIdMap.get(row.otid) || [];
        return empObjIds.some((empObjId) => {
          const empInfo = employeeMap.get(empObjId);
          const name = (empInfo?.name || '').toLowerCase();
          return name.includes(employeeLower);
        });
      });
    }

    // Get OT dates
    let otDatesRows = [];
    if (otIds.length) {
      const [datesResult] = await connection.query(
        `SELECT 
          id, otid, emp_objid, ottype,
          otdate as otdate_raw,
          DATE_FORMAT(otdate, '%Y-%m-%d') as otdate,
          am_timerendered_from, am_timerendered_to,
          pm_timerendered_from, pm_timerendered_to,
          updatedby, updateddate, otdatestatus
         FROM employee_overtimes_dates
         WHERE otid IN (?)
         ORDER BY otdate_raw ASC`,
        [otIds]
      );
      
      // Remove the raw date column after sorting
      datesResult.forEach(row => {
        delete row.otdate_raw;
      });
      otDatesRows = datesResult;
    }

    // Group dates by otid
    const datesByOtId = new Map();
    for (const dateRow of otDatesRows) {
      const otid = dateRow.otid;
      if (!datesByOtId.has(otid)) {
        datesByOtId.set(otid, []);
      }
      datesByOtId.get(otid).push(dateRow);
    }

    // Get creator/approver info
    const creatorIds = [
      ...new Set(filteredRows.map((r) => r.createdby).filter(Boolean)),
      ...new Set(filteredRows.map((r) => r.approvedby).filter(Boolean)),
    ];

    const creatorMap = new Map();
    if (creatorIds.length) {
      const [creatorRows] = await connection.query(
        `SELECT s.id, s.username,
                e.objid AS emp_objid, e.surname, e.firstname, e.middlename, em.photo_path
         FROM sysusers s
         LEFT JOIN employees e ON e.dtruserid = s.id
         LEFT JOIN employees_media em ON em.emp_objid = e.objid
         WHERE s.id IN (?)`,
        [creatorIds]
      );
      for (const creator of creatorRows) {
        let photo = null;
        if (creator.photo_path) {
          try {
            photo = await readMediaAsBase64(creator.photo_path);
          } catch (error) {
            photo = null;
          }
        }
        creatorMap.set(creator.id, {
          name: formatEmployeeName(creator.surname, creator.firstname, creator.middlename) || creator.username || null,
          photo,
        });
      }
    }

    const data = filteredRows.map((row) => {
      const empObjIds = otIdToEmpObjIdMap.get(row.otid) || [];
      const firstEmpObjId = empObjIds[0];
      const employeeInfo = firstEmpObjId ? employeeMap.get(firstEmpObjId) || {} : {};
      const creatorInfo = creatorMap.get(row.createdby) || {};
      const approverInfo = creatorMap.get(row.approvedby) || {};

      // Get all unique employees for this transaction
      const allEmployees = [...new Set(empObjIds)]
        .map((empObjId) => {
          const empInfo = employeeMap.get(empObjId);
          if (!empInfo) return null;
          return {
            emp_objid: empObjId,
            name: empInfo.name,
            photo: empInfo.photo,
          };
        })
        .filter(Boolean);

      return {
        otid: row.otid,
        otno: row.otno,
        // ottype removed from employee_overtimes table - now only in employee_overtimes_dates
        otdetails: row.otdetails,
        otdateissued: row.otdateissued,
        ottimefrom: row.ottimefrom,
        ottimeto: row.ottimeto,
        total_renderedtime: row.total_renderedtime,
        createdby: row.createdby,
        createddate: row.createddate,
        updatedby: row.updatedby,
        updateddate: row.updateddate,
        approvedby: row.approvedby,
        approveddate: row.approveddate,
        otremarks: row.otremarks,
        otstatus: normalizeStatus(row.otstatus),
        emp_objid: firstEmpObjId || null,
        employeeName: employeeInfo.name || null, // Keep for backward compatibility
        employeePhoto: employeeInfo.photo || null, // Keep for backward compatibility
        employees: allEmployees, // Array of all employees for this transaction
        createdByName: creatorInfo.name || null,
        createdByPhoto: creatorInfo.photo || null,
        approvedByName: approverInfo.name || null,
        approvedByPhoto: approverInfo.photo || null,
        otDates: datesByOtId.get(row.otid) || [],
      };
    });

    connection.release();
    res.json({ success: true, data });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error listing OT transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to load OT transactions', error: error.message });
  }
};

export const getOTTransactionById = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    connection = await pool.getConnection();

    const [rows] = await connection.execute('SELECT * FROM employee_overtimes WHERE otid = ? LIMIT 1', [id]);

    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'OT transaction not found' });
    }

    const row = rows[0];

    // Get employee info from employee_overtimes_dates
    let employeeInfo = {};
    const [empObjIdRows] = await connection.execute(
      'SELECT DISTINCT emp_objid FROM employee_overtimes_dates WHERE otid = ? LIMIT 1',
      [id]
    );
    
    if (empObjIdRows.length && empObjIdRows[0].emp_objid) {
      const empObjId = empObjIdRows[0].emp_objid;
      const [empRows] = await connection.query(
        `SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path
         FROM employees e
         LEFT JOIN employees_media em ON em.emp_objid = e.objid
         WHERE e.objid = ? LIMIT 1`,
        [empObjId]
      );
      if (empRows.length) {
        const emp = empRows[0];
        let photo = null;
        if (emp.photo_path) {
          try {
            photo = await readMediaAsBase64(emp.photo_path);
          } catch (error) {
            photo = null;
          }
        }
        employeeInfo = {
          name: formatEmployeeName(emp.surname, emp.firstname, emp.middlename),
          photo,
        };
      }
    }

    // Get OT dates
    const [otDates] = await connection.execute(
      `SELECT 
        id, otid, emp_objid, ottype,
        otdate as otdate_raw,
        DATE_FORMAT(otdate, '%Y-%m-%d') as otdate,
        am_timerendered_from, am_timerendered_to,
        pm_timerendered_from, pm_timerendered_to,
        updatedby, updateddate, otdatestatus
       FROM employee_overtimes_dates
       WHERE otid = ? 
       ORDER BY otdate_raw ASC`,
      [id]
    );
    
    // Remove the raw date column after sorting
    otDates.forEach(row => {
      delete row.otdate_raw;
    });

    connection.release();

    res.json({
      success: true,
      data: {
        ...row,
        otstatus: normalizeStatus(row.otstatus),
        emp_objid: empObjIdRows.length ? empObjIdRows[0].emp_objid : null,
        employeeName: employeeInfo.name || null,
        employeePhoto: employeeInfo.photo || null,
        otDates: otDates || [],
      },
    });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error getting OT transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to get OT transaction', error: error.message });
  }
};

export const createOTTransaction = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const {
      emp_objid,
      otdetails,
      otdateissued,
      ottimefrom,
      ottimeto,
      total_renderedtime,
      otremarks,
      otDates = [],
    } = req.body || {};

    if (!emp_objid) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Employee is required' });
    }
    
    // Validate that at least one date has an OT type
    if (Array.isArray(otDates) && otDates.length > 0) {
      const hasValidDateWithType = otDates.some(date => date.otdate && date.ottype);
      if (!hasValidDateWithType) {
        connection.release();
        return res.status(400).json({ success: false, message: 'At least one OT date with OT type is required' });
      }
    } else {
      connection.release();
      return res.status(400).json({ success: false, message: 'At least one OT date is required' });
    }

    const otno = await generateOTNo(connection);
    const createddate = new Date();
    const isPortal = req.isPortal ? 1 : 0;
    const createdByUserId = !isPortal ? req.user?.USERID || null : null;

    const [result] = await connection.execute(
      `INSERT INTO employee_overtimes
       (otno, otdetails, otdateissued, ottimefrom, ottimeto, total_renderedtime, otremarks, createdby, createddate, otstatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'For Approval')`,
      [
        otno,
        otdetails || null,
        otdateissued ? new Date(otdateissued) : createddate,
        ottimefrom || null, // Store as TIME string (HH:MM:SS format)
        ottimeto || null,   // Store as TIME string (HH:MM:SS format)
        total_renderedtime ? Number(total_renderedtime) : null,
        otremarks || null,
        createdByUserId,
        createddate,
      ]
    );

    const insertedOtId = result.insertId;

    // Insert OT dates - support multiple employees via date.emp_objid
    if (Array.isArray(otDates) && otDates.length) {
      const dateValues = otDates
        .filter((date) => date.otdate && (date.emp_objid || emp_objid))
        .map((date) => [
          insertedOtId,
          date.emp_objid || emp_objid, // Use date.emp_objid if provided, otherwise use main emp_objid
          date.ottype || null, // OT type is required per date, no fallback
          date.otdate ? new Date(date.otdate) : null,
          date.am_timerendered_from || null, // Store as TIME string (HH:MM:SS format)
          date.am_timerendered_to || null,   // Store as TIME string (HH:MM:SS format)
          date.pm_timerendered_from || null, // Store as TIME string (HH:MM:SS format)
          date.pm_timerendered_to || null,   // Store as TIME string (HH:MM:SS format)
          req.user?.USERID || null,
          new Date(),
          date.otdatestatus || 'Not Rendered',
        ]);

      if (dateValues.length) {
        await connection.query(
          `INSERT INTO employee_overtimes_dates
           (otid, emp_objid, ottype, otdate, am_timerendered_from, am_timerendered_to, pm_timerendered_from, pm_timerendered_to, updatedby, updateddate, otdatestatus)
           VALUES ?`,
          [dateValues]
        );
      }
    }

    connection.release();

    // Notify employee about new OT transaction
    changeNotificationService.notifyEmployee(emp_objid, 'overtime', 'created', { otId: insertedOtId, otno });

    res.status(201).json({ success: true, data: { otid: insertedOtId, otno }, message: 'OT transaction created' });
  } catch (error) {
    connection.release();
    console.error('Error creating OT transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to create OT transaction', error: error.message });
  }
};

export const updateOTTransaction = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const id = req.params.id;

    console.log(`[updateOTTransaction] Updating OT transaction ${id}`);
    console.log(`[updateOTTransaction] Request body:`, {
      emp_objid: req.body?.emp_objid,
      otdetails: req.body?.otdetails ? 'present' : 'missing',
      otdateissued: req.body?.otdateissued,
      ottimefrom: req.body?.ottimefrom,
      ottimeto: req.body?.ottimeto,
      otDates_count: Array.isArray(req.body?.otDates) ? req.body.otDates.length : 'not an array',
      otDates_sample: Array.isArray(req.body?.otDates) && req.body.otDates.length > 0 ? req.body.otDates[0] : 'none',
    });

    // Get original emp_objid from employee_overtimes_dates before updating
    const [existingDateRows] = await connection.execute('SELECT DISTINCT emp_objid FROM employee_overtimes_dates WHERE otid = ? LIMIT 1', [id]);
    const originalEmpObjId = existingDateRows.length > 0 ? existingDateRows[0].emp_objid : null;

    const {
      emp_objid,
      otdetails,
      otdateissued,
      ottimefrom,
      ottimeto,
      total_renderedtime,
      otremarks,
      otDates,
    } = req.body || {};

    const fields = [];
    const params = [];

    // Note: employee_overtimes table doesn't have emp_objid, it's only in employee_overtimes_dates
    // Note: OT type is no longer stored in employee_overtimes table, only in employee_overtimes_dates
    if (otdetails !== undefined) {
      fields.push('otdetails = ?');
      params.push(otdetails);
    }
    if (otdateissued !== undefined) {
      fields.push('otdateissued = ?');
      params.push(otdateissued ? new Date(otdateissued) : null);
    }
    if (ottimefrom !== undefined) {
      fields.push('ottimefrom = ?');
      params.push(ottimefrom || null); // Store as TIME string (HH:MM:SS format)
    }
    if (ottimeto !== undefined) {
      fields.push('ottimeto = ?');
      params.push(ottimeto || null); // Store as TIME string (HH:MM:SS format)
    }
    if (total_renderedtime !== undefined) {
      fields.push('total_renderedtime = ?');
      params.push(total_renderedtime ? Number(total_renderedtime) : null);
    }
    if (otremarks !== undefined) {
      fields.push('otremarks = ?');
      params.push(otremarks);
    }

    fields.push('updatedby = ?');
    params.push(req.user?.USERID || null);
    fields.push('updateddate = ?');
    params.push(new Date());

    // Always update the main transaction record (at least updatedby and updateddate)
    // This ensures the record timestamp is updated even if only dates are changed
    params.push(id);
    const sql = `UPDATE employee_overtimes SET ${fields.join(', ')} WHERE otid = ?`;
    const [result] = await connection.execute(sql, params);

    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'OT transaction not found' });
    }

    // Update OT dates if provided
    if (Array.isArray(otDates)) {
      console.log(`[updateOTTransaction] Processing ${otDates.length} OT dates for transaction ${id}`);
      
      // Validate that at least one OT date is provided
      const validDates = otDates.filter((date) => {
        const hasDate = date.otdate && (typeof date.otdate === 'string' ? date.otdate.trim() !== '' : true);
        const hasEmp = date.emp_objid && (typeof date.emp_objid === 'string' ? date.emp_objid.trim() !== '' : true);
        // ottype can be a number (0+), so check for existence and type, not just truthiness
        const hasType = date.ottype !== undefined && date.ottype !== null && date.ottype !== '';
        return hasDate && hasEmp && hasType;
      });
      
      console.log(`[updateOTTransaction] Valid dates after filtering: ${validDates.length} out of ${otDates.length}`);
      
      if (validDates.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ 
          success: false, 
          message: 'At least one OT date with employee and OT type is required',
          details: `Received ${otDates.length} dates, but none passed validation (need otdate, emp_objid, and ottype)`
        });
      }

      // Delete existing dates and reinsert with new data
      await connection.execute('DELETE FROM employee_overtimes_dates WHERE otid = ?', [id]);
      console.log(`[updateOTTransaction] Deleted existing OT dates for transaction ${id}`);

      const dateValues = validDates.map((date) => [
        id,
        date.emp_objid, // Use emp_objid from each date entry (each date can belong to different employees)
        date.ottype, // OT type is required per date
        date.otdate ? new Date(date.otdate) : null,
        date.am_timerendered_from || null, // Store as TIME string (HH:MM:SS format)
        date.am_timerendered_to || null,   // Store as TIME string (HH:MM:SS format)
        date.pm_timerendered_from || null, // Store as TIME string (HH:MM:SS format)
        date.pm_timerendered_to || null,   // Store as TIME string (HH:MM:SS format)
        req.user?.USERID || null,
        new Date(),
        date.otdatestatus || 'Not Rendered',
      ]);

      console.log(`[updateOTTransaction] Inserting ${dateValues.length} new OT dates`);
      await connection.query(
        `INSERT INTO employee_overtimes_dates
         (otid, emp_objid, ottype, otdate, am_timerendered_from, am_timerendered_to, pm_timerendered_from, pm_timerendered_to, updatedby, updateddate, otdatestatus)
         VALUES ?`,
        [dateValues]
      );
      console.log(`[updateOTTransaction] Successfully inserted ${dateValues.length} OT dates`);
    } else if (otDates === undefined || otDates === null) {
      // If otDates is explicitly undefined or null, that's okay - user might only be updating header fields
      // Don't delete existing dates in this case
      console.log(`[updateOTTransaction] otDates not provided, skipping date updates`);
    } else {
      // If otDates is not an array, return error
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, message: 'OT dates must be an array' });
    }

    await connection.commit();
    connection.release();

    console.log(`[updateOTTransaction] Successfully updated OT transaction ${id}`);

    // Notify employee about updated OT transaction
    const notifyEmpObjId = originalEmpObjId || emp_objid;
    if (notifyEmpObjId) {
      changeNotificationService.notifyEmployee(notifyEmpObjId, 'overtime', 'updated', { otId: id });
    }

    res.json({ success: true, message: 'OT transaction updated' });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('[updateOTTransaction] Error updating OT transaction:', error);
    console.error('[updateOTTransaction] Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      sql: error.sql,
    });
    res.status(500).json({ success: false, message: 'Failed to update OT transaction', error: error.message });
  }
};

export const updateOTTransactionStatus = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    const { status, remarks } = req.body || {};
    if (!status) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const normalized = normalizeStatus(status);

    const [currentRows] = await connection.execute('SELECT otstatus FROM employee_overtimes WHERE otid = ? LIMIT 1', [
      id,
    ]);

    if (!currentRows.length) {
      connection.release();
      return res.status(404).json({ success: false, message: 'OT transaction not found' });
    }

    const previousStatus = normalizeStatus(currentRows[0].otstatus);

    if (previousStatus === normalized) {
      await connection.execute('UPDATE employee_overtimes SET updatedby = ?, updateddate = ? WHERE otid = ?', [
        req.user?.USERID || null,
        new Date(),
        id,
      ]);
      connection.release();
      return res.json({ success: true, message: 'Status updated' });
    }

    const fields = ['otstatus = ?'];
    const params = [normalized];

    if (normalized === 'Approved') {
      fields.push('approvedby = ?');
      fields.push('approveddate = ?');
      params.push(req.user?.USERID || null, new Date());
    }

    if (remarks !== undefined) {
      fields.push('otremarks = ?');
      params.push(remarks);
    }

    fields.push('updatedby = ?');
    fields.push('updateddate = ?');
    params.push(req.user?.USERID || null, new Date());
    params.push(id);

    const sql = `UPDATE employee_overtimes SET ${fields.join(', ')} WHERE otid = ?`;
    await connection.execute(sql, params);

    // Get emp_objid from employee_overtimes_dates (employee_overtimes doesn't have emp_objid)
    const [empObjIdRows] = await connection.execute(
      'SELECT DISTINCT emp_objid FROM employee_overtimes_dates WHERE otid = ? LIMIT 1',
      [id]
    );
    const emp_objid = empObjIdRows.length > 0 ? empObjIdRows[0].emp_objid : null;
    connection.release();

    // Notify employee about OT status change
    if (emp_objid) {
      changeNotificationService.notifyEmployee(emp_objid, 'overtime', 'updated', { otId: id, status: normalized });
    }

    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    connection.release();
    console.error('Error updating OT transaction status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};

export const deleteOTTransaction = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;

    // Get emp_objid from employee_overtimes_dates before deletion for notification
    const [existingDateRows] = await connection.execute('SELECT DISTINCT emp_objid FROM employee_overtimes_dates WHERE otid = ? LIMIT 1', [id]);
    const emp_objid = existingDateRows.length > 0 ? existingDateRows[0].emp_objid : null;

    // Delete OT dates first (cascade)
    await connection.execute('DELETE FROM employee_overtimes_dates WHERE otid = ?', [id]);

    // Delete OT transaction
    const [result] = await connection.execute('DELETE FROM employee_overtimes WHERE otid = ?', [id]);

    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'OT transaction not found' });
    }

    connection.release();

    // Notify employee about deleted OT transaction
    if (emp_objid) {
      changeNotificationService.notifyEmployee(emp_objid, 'overtime', 'deleted', { otId: id });
    }

    res.json({ success: true, message: 'OT transaction deleted' });
  } catch (error) {
    connection.release();
    console.error('Error deleting OT transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to delete OT transaction', error: error.message });
  }
};

export const listOTDates = async (req, res) => {
  let connection;
  try {
    const { otid, emp_objid, status } = req.query || {};
    const pool = getHR201Pool();
    connection = await pool.getConnection();

    let query = `SELECT 
      id, otid, emp_objid, ottype,
      otdate as otdate_raw,
      DATE_FORMAT(otdate, '%Y-%m-%d') as otdate,
      am_timerendered_from, am_timerendered_to,
      pm_timerendered_from, pm_timerendered_to,
      updatedby, updateddate, otdatestatus
     FROM employee_overtimes_dates
     WHERE 1=1`;
    const params = [];

    if (otid) {
      query += ' AND otid = ?';
      params.push(otid);
    }
    if (emp_objid) {
      query += ' AND emp_objid = ?';
      params.push(emp_objid);
    }
    if (status) {
      query += ' AND otdatestatus = ?';
      params.push(status);
    }

    query += ' ORDER BY otdate_raw ASC';

    const [rows] = await connection.execute(query, params);
    connection.release();

    res.json({ success: true, data: rows });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error listing OT dates:', error);
    res.status(500).json({ success: false, message: 'Failed to load OT dates', error: error.message });
  }
};

export const createOTDate = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const { otid, emp_objid, ottype, otdate, am_timerendered_from, am_timerendered_to, pm_timerendered_from, pm_timerendered_to, otdatestatus } =
      req.body || {};

    if (!otid || !emp_objid || !otdate) {
      connection.release();
      return res.status(400).json({ success: false, message: 'OT ID, employee, and OT date are required' });
    }

    await connection.execute(
      `INSERT INTO employee_overtimes_dates
       (otid, emp_objid, ottype, otdate, am_timerendered_from, am_timerendered_to, pm_timerendered_from, pm_timerendered_to, updatedby, updateddate, otdatestatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        otid,
        emp_objid,
        ottype || null,
        new Date(otdate),
        am_timerendered_from || null, // Store as TIME string (HH:MM:SS format)
        am_timerendered_to || null,   // Store as TIME string (HH:MM:SS format)
        pm_timerendered_from || null, // Store as TIME string (HH:MM:SS format)
        pm_timerendered_to || null,   // Store as TIME string (HH:MM:SS format)
        req.user?.USERID || null,
        new Date(),
        otdatestatus || 'Not Rendered',
      ]
    );

    connection.release();

    // Notify employee
    changeNotificationService.notifyEmployee(emp_objid, 'overtime', 'updated', { otId: otid });

    res.status(201).json({ success: true, message: 'OT date created' });
  } catch (error) {
    connection.release();
    console.error('Error creating OT date:', error);
    res.status(500).json({ success: false, message: 'Failed to create OT date', error: error.message });
  }
};

export const updateOTDate = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    const { ottype, otdate, am_timerendered_from, am_timerendered_to, pm_timerendered_from, pm_timerendered_to, otdatestatus } = req.body || {};

    const fields = [];
    const params = [];

    if (ottype !== undefined) {
      fields.push('ottype = ?');
      params.push(ottype);
    }
    if (otdate !== undefined) {
      fields.push('otdate = ?');
      params.push(otdate ? new Date(otdate) : null);
    }
    if (am_timerendered_from !== undefined) {
      fields.push('am_timerendered_from = ?');
      params.push(am_timerendered_from || null); // Store as TIME string (HH:MM:SS format)
    }
    if (am_timerendered_to !== undefined) {
      fields.push('am_timerendered_to = ?');
      params.push(am_timerendered_to || null); // Store as TIME string (HH:MM:SS format)
    }
    if (pm_timerendered_from !== undefined) {
      fields.push('pm_timerendered_from = ?');
      params.push(pm_timerendered_from || null); // Store as TIME string (HH:MM:SS format)
    }
    if (pm_timerendered_to !== undefined) {
      fields.push('pm_timerendered_to = ?');
      params.push(pm_timerendered_to || null); // Store as TIME string (HH:MM:SS format)
    }
    if (otdatestatus !== undefined) {
      fields.push('otdatestatus = ?');
      params.push(otdatestatus);
    }

    fields.push('updatedby = ?');
    params.push(req.user?.USERID || null);
    fields.push('updateddate = ?');
    params.push(new Date());
    params.push(id);

    const sql = `UPDATE employee_overtimes_dates SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await connection.execute(sql, params);

    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'OT date not found' });
    }

    // Get otid and emp_objid for notification
    const [dateRow] = await connection.execute('SELECT otid, emp_objid FROM employee_overtimes_dates WHERE id = ?', [id]);
    connection.release();

    if (dateRow.length && dateRow[0].emp_objid) {
      changeNotificationService.notifyEmployee(dateRow[0].emp_objid, 'overtime', 'updated', { otId: dateRow[0].otid });
    }

    res.json({ success: true, message: 'OT date updated' });
  } catch (error) {
    connection.release();
    console.error('Error updating OT date:', error);
    res.status(500).json({ success: false, message: 'Failed to update OT date', error: error.message });
  }
};

export const deleteOTDate = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;

    // Get otid and emp_objid before deletion
    const [existingRows] = await connection.execute('SELECT otid, emp_objid FROM employee_overtimes_dates WHERE id = ? LIMIT 1', [id]);
    const otid = existingRows.length > 0 ? existingRows[0].otid : null;
    const emp_objid = existingRows.length > 0 ? existingRows[0].emp_objid : null;

    const [result] = await connection.execute('DELETE FROM employee_overtimes_dates WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'OT date not found' });
    }

    connection.release();

    // Notify employee
    if (emp_objid) {
      changeNotificationService.notifyEmployee(emp_objid, 'overtime', 'updated', { otId: otid });
    }

    res.json({ success: true, message: 'OT date deleted' });
  } catch (error) {
    connection.release();
    console.error('Error deleting OT date:', error);
    res.status(500).json({ success: false, message: 'Failed to delete OT date', error: error.message });
  }
};

export const listOTTypes = async (req, res) => {
  let connection;
  try {
    const pool = getHR201Pool();
    connection = await pool.getConnection();

    console.log('[listOTTypes] Fetching OT types from ottypes table...');

    // First, get table structure to determine column names
    let nameColumn = null;
    let idColumn = null;
    
    try {
      const [columns] = await connection.execute(
        "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ottypes' ORDER BY ORDINAL_POSITION"
      );
      
      const columnNames = columns.map(col => col.COLUMN_NAME);
      console.log('[listOTTypes] Available columns:', columnNames);
      
      // Find the name column (try common variations)
      nameColumn = columnNames.find(col => 
        col.toLowerCase() === 'typename' ||
        col.toLowerCase() === 'name' ||
        col.toLowerCase() === 'ottypename' ||
        col.toLowerCase() === 'type_name' ||
        col.toLowerCase() === 'description' ||
        col.toLowerCase() === 'typedesc'
      );
      
      // Find the id column
      idColumn = columnNames.find(col => 
        col.toLowerCase() === 'id' ||
        col.toLowerCase() === 'ottypeid' ||
        col.toLowerCase() === 'typeid'
      ) || columnNames[0];
      
      console.log('[listOTTypes] Using columns - id:', idColumn, 'name:', nameColumn);
    } catch (structError) {
      console.warn('[listOTTypes] Could not check table structure, using default:', structError.message);
    }

    // Build query with proper column mapping
    let query;
    if (nameColumn && idColumn && nameColumn !== idColumn) {
      // Map the actual column name to typename and name for frontend compatibility
      query = `SELECT ${idColumn} as id, ${nameColumn} as typename, ${nameColumn} as name FROM ottypes ORDER BY ${idColumn} ASC`;
    } else {
      // Fallback: select all columns
      query = `SELECT * FROM ottypes ORDER BY id ASC`;
    }
    
    console.log('[listOTTypes] Executing query:', query);
    const [rows] = await connection.execute(query);
    
    // Map columns to ensure frontend compatibility
    const mappedRows = rows.map(row => {
      const mapped = { ...row };
      
      // Ensure id is available
      if (!mapped.id) {
        mapped.id = row.id || row.ottypeid || row.typeid || row[Object.keys(row)[0]];
      }
      
      // Find name value from common column names
      const nameValue = mapped.typename || mapped.name || row.typename || row.name || 
                       row.ottypename || row.type_name || row.description || row.typedesc ||
                       (() => {
                         // Try to find any column with 'name' or 'type' in it (excluding id)
                         const nameKey = Object.keys(row).find(k => 
                           k.toLowerCase() !== 'id' && 
                           (k.toLowerCase().includes('name') || 
                            (k.toLowerCase().includes('type') && !k.toLowerCase().includes('id')))
                         );
                         return nameKey ? row[nameKey] : null;
                       })();
      
      // Map name value to both typename and name for frontend compatibility
      if (nameValue) {
        mapped.typename = nameValue;
        mapped.name = nameValue;
      }
      
      return mapped;
    });
    
    connection.release();

    console.log(`[listOTTypes] Found ${mappedRows.length} OT types`);
    if (mappedRows.length > 0) {
      console.log('[listOTTypes] Sample OT type:', mappedRows[0]);
      console.log('[listOTTypes] OT type columns:', Object.keys(mappedRows[0]));
    }

    res.json({ success: true, data: mappedRows });
  } catch (error) {
    if (connection) connection.release();
    console.error('❌ [listOTTypes] Error listing OT types:', error);
    console.error('❌ [listOTTypes] Error code:', error.code);
    console.error('❌ [listOTTypes] SQL Error:', error.sqlMessage);
    console.error('❌ [listOTTypes] SQL:', error.sql);
    
    // Return empty array if table doesn't exist
    if (error.code === 'ER_NO_SUCH_TABLE' || 
        error.code === 'ER_BAD_TABLE_ERROR' ||
        error.sqlMessage?.includes('doesn\'t exist')) {
      console.warn('[listOTTypes] ottypes table does not exist, returning empty array');
      return res.json({ success: true, data: [] });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load OT types', 
      error: error.message,
      sqlError: error.sqlMessage || error.code
    });
  }
};

export const listEmployeesWithOT = async (req, res) => {
  let connection;
  try {
    const { status } = req.query || {};
    const pool = getHR201Pool();
    
    try {
      connection = await pool.getConnection();
    } catch (poolError) {
      console.error('[listEmployeesWithOT] Failed to get connection:', poolError.message);
      return res.status(500).json({ success: false, message: 'Database connection failed', error: poolError.message });
    }

    // First, check if tables exist and if we have any OT dates at all
    let hasData = false;
    try {
      const [dateCheck] = await connection.execute('SELECT COUNT(*) as cnt FROM employee_overtimes_dates');
      hasData = (dateCheck[0]?.cnt || 0) > 0;
      console.log('[listEmployeesWithOT] OT dates count:', dateCheck[0]?.cnt || 0);
    } catch (err) {
      // Table might not exist or query failed
      console.warn('[listEmployeesWithOT] Could not check employee_overtimes_dates:', err.message);
      console.warn('[listEmployeesWithOT] Error code:', err.code);
      console.warn('[listEmployeesWithOT] SQL Error:', err.sqlMessage);
      connection.release();
      // Return empty array if table doesn't exist yet (normal for new feature)
      return res.json({ success: true, data: [] });
    }

    if (!hasData) {
      connection.release();
      console.log('[listEmployeesWithOT] No OT dates found, returning empty array');
      return res.json({ success: true, data: [] });
    }

    // Get all unique employee IDs from employee_overtimes_dates
    let empIdRows = [];
    try {
      [empIdRows] = await connection.execute(
        'SELECT DISTINCT emp_objid FROM employee_overtimes_dates WHERE emp_objid IS NOT NULL'
      );
    } catch (err) {
      console.error('[listEmployeesWithOT] Error fetching employee IDs:', err.message);
      console.error('[listEmployeesWithOT] SQL Error:', err.sqlMessage);
      connection.release();
      return res.json({ success: true, data: [] });
    }

    if (!empIdRows || empIdRows.length === 0) {
      connection.release();
      console.log('[listEmployeesWithOT] No employee IDs found, returning empty array');
      return res.json({ success: true, data: [] });
    }

    const employeeIds = empIdRows.map((row) => row.emp_objid).filter(Boolean);

    if (!employeeIds || employeeIds.length === 0) {
      connection.release();
      return res.json({ success: true, data: [] });
    }

    // Get employee info
    const employeeMap = new Map();
    let employeeRows = [];
    try {
      [employeeRows] = await connection.query(
        `SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path
         FROM employees e
         LEFT JOIN employees_media em ON em.emp_objid = e.objid
         WHERE e.objid IN (?)`,
        [employeeIds]
      );
    } catch (empQueryError) {
      console.error('[listEmployeesWithOT] Error fetching employees:', empQueryError.message);
      connection.release();
      return res.json({ success: true, data: [] });
    }

    for (const emp of employeeRows) {
      let photo = null;
      if (emp.photo_path) {
        try {
          photo = await readMediaAsBase64(emp.photo_path);
        } catch (error) {
          photo = null;
        }
      }
      employeeMap.set(emp.objid, {
        objid: emp.objid,
        surname: emp.surname,
        firstname: emp.firstname,
        middlename: emp.middlename,
        name: formatEmployeeName(emp.surname, emp.firstname, emp.middlename),
        photo,
      });
    }

    // Get OT transactions for each employee through employee_overtimes_dates
    const finalEmployeeMap = new Map();
    
    for (const emp of employeeRows) {
      // Get OT transactions for this employee by joining through employee_overtimes_dates
      let otQuery = `
        SELECT DISTINCT ot.*
        FROM employee_overtimes ot
        INNER JOIN employee_overtimes_dates otd ON otd.otid = ot.otid
        WHERE otd.emp_objid = ?
      `;
      const otParams = [emp.objid];
      if (status && status.trim()) {
        otQuery += ' AND ot.otstatus = ?';
        otParams.push(status.trim());
      }
      otQuery += ' ORDER BY ot.otdateissued DESC';

      let otTransactions = [];
      try {
        [otTransactions] = await connection.execute(otQuery, otParams);
      } catch (otQueryError) {
        console.error(`[listEmployeesWithOT] Error fetching OT transactions for employee ${emp.objid}:`, otQueryError.message);
        // Continue with empty transactions for this employee
        otTransactions = [];
      }

      // Get OT dates for each transaction - filter by employee's emp_objid
      const transactionsWithDates = await Promise.all(
        otTransactions.map(async (ot) => {
          try {
            const [otDates] = await connection.execute(
              `SELECT 
                id, otid, emp_objid, ottype,
                otdate as otdate_raw,
                DATE_FORMAT(otdate, '%Y-%m-%d') as otdate,
                am_timerendered_from, am_timerendered_to,
                pm_timerendered_from, pm_timerendered_to,
                updatedby, updateddate, otdatestatus
               FROM employee_overtimes_dates
               WHERE otid = ? AND emp_objid = ? 
               ORDER BY otdate_raw ASC`,
              [ot.otid, emp.objid] // Only get dates for this specific employee
            );
            
            // Remove the raw date column after sorting
            otDates.forEach(row => {
              delete row.otdate_raw;
            });

            return {
              ...ot,
              otstatus: normalizeStatus(ot.otstatus),
              otDates: otDates || [],
            };
          } catch (dateError) {
            console.error(`[listEmployeesWithOT] Error fetching OT dates for otid ${ot.otid}:`, dateError.message);
            return {
              ...ot,
              otstatus: normalizeStatus(ot.otstatus),
              otDates: [],
            };
          }
        })
      );

      // Calculate total OT hours
      let totalHours = 0;
      for (const tx of transactionsWithDates) {
        if (tx.total_renderedtime) {
          totalHours += Number(tx.total_renderedtime) || 0;
        }
      }

      const empInfo = employeeMap.get(emp.objid);
      if (empInfo) {
        finalEmployeeMap.set(emp.objid, {
          emp_objid: emp.objid,
          employeeName: empInfo.name,
          employeePhoto: empInfo.photo,
          otTransactions: transactionsWithDates,
          totalOvertimeHours: totalHours,
        });
      }
    }

    connection.release();

    const result = Array.from(finalEmployeeMap.values());
    console.log('[listEmployeesWithOT] Successfully returning', result.length, 'employees');
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (connection) connection.release();
    console.error('❌ [listEmployeesWithOT] Error listing employees with OT:', error);
    console.error('❌ [listEmployeesWithOT] Error name:', error.name);
    console.error('❌ [listEmployeesWithOT] Error message:', error.message);
    console.error('❌ [listEmployeesWithOT] Error code:', error.code);
    console.error('❌ [listEmployeesWithOT] Error sqlMessage:', error.sqlMessage);
    console.error('❌ [listEmployeesWithOT] Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load employees with OT', 
      error: error.message,
      sqlError: error.sqlMessage || error.code
    });
  }
};

export const getDtrLogsForOt = async (req, res) => {
  let hrConnection;
  try {
    const { empObjId, date } = req.params || {};

    if (!empObjId || !date) {
      return res.status(400).json({ success: false, message: 'Employee objid and date are required' });
    }

    const normalizedDate = formatDate(date);
    if (!normalizedDate) {
      return res.status(400).json({ success: false, message: 'Invalid date provided' });
    }

    const hr201Pool = getHR201Pool();
    hrConnection = await hr201Pool.getConnection();

    const [rows] = await hrConnection.execute('SELECT dtruserid FROM employees WHERE objid = ? LIMIT 1', [empObjId]);
    hrConnection.release();
    hrConnection = null;

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const dtruserid = rows[0].dtruserid;
    const parsedUserId = Number(dtruserid);
    if (!parsedUserId || Number.isNaN(parsedUserId)) {
      return res.status(400).json({ success: false, message: 'Employee does not have a valid dtruserid' });
    }

    const msPool = getDb();
    const query = `
      SELECT
        c.USERID,
        c.CHECKTIME,
        CAST(c.CHECKTIME AS DATE) AS date
      FROM CHECKINOUT c
      WHERE c.USERID = @userId
        AND CAST(c.CHECKTIME AS DATE) = @date
      ORDER BY c.CHECKTIME ASC
    `;

    const result = await msPool
      .request()
      .input('userId', sql.Int, parsedUserId)
      .input('date', sql.Date, normalizedDate)
      .query(query);

    // Debug: Log raw CHECKTIME values to diagnose timezone serialization issues
    if (result.recordset && result.recordset.length > 0) {
      console.log('[getDtrLogsForOt] Raw CHECKTIME values from MSSQL:', 
        result.recordset.map(log => ({
          USERID: log.USERID,
          CHECKTIME: log.CHECKTIME,
          CHECKTIME_type: typeof log.CHECKTIME,
          date: log.date
        }))
      );
    }

    return res.json({
      success: true,
      data: result.recordset || [],
    });
  } catch (error) {
    if (hrConnection) {
      hrConnection.release();
    }
    console.error('Error fetching DTR logs for OT:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch DTR logs for overtime computation',
      error: error.message,
    });
  }
};

