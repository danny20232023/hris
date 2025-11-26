import { getHR201Pool } from '../config/hr201Database.js';
import { changeNotificationService } from '../services/changeNotificationService.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// Helper function to ensure the table exists
const ensureTableExists = async (pool) => {
  try {
    const [tables] = await pool.execute(`
      SELECT COUNT(*) as tableExists 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'employee_fixchecktimes'
    `);
    
    if (tables[0].tableExists === 0) {
      console.log('Creating employee_fixchecktimes table...');
      await pool.execute(`
        CREATE TABLE employee_fixchecktimes(
          fixid INT AUTO_INCREMENT PRIMARY KEY,
          emp_objid CHAR(36) NOT NULL,
          checktimedate DATETIME NOT NULL,
          am_checkin TIME NULL,
          am_checkout TIME NULL,
          pm_checkin TIME NULL,
          pm_checkout TIME NULL,
          remarks TEXT NULL,
          createdby INT NULL,
          createddate DATETIME NULL,
          updatedby INT NULL,
          updateddate DATETIME NULL,
          approveby INT NULL,
          approvedate DATETIME NULL,
          fixstatus VARCHAR(20) NULL,
          UNIQUE KEY UQ_employee_fixchecktimes_date_employee (emp_objid, checktimedate)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log('employee_fixchecktimes table created successfully.');
    }
  } catch (error) {
    console.error('Error checking/creating employee_fixchecktimes table:', error);
    throw error;
  }
};

const baseQuery = `
  SELECT 
    f.fixid,
    f.emp_objid,
    DATE_FORMAT(f.checktimedate, '%Y-%m-%d') AS checktimedate,
    f.am_checkin,
    f.am_checkout,
    f.pm_checkin,
    f.pm_checkout,
    f.remarks,
    f.createdby,
    f.createddate,
    f.updatedby,
    f.updateddate,
    f.approveby,
    f.approvedate,
    f.fixstatus,
    e.firstname AS FIRSTNAME,
    e.surname AS LASTNAME,
    e.middlename,
    em.photo_path AS PHOTOPATH,
    e.dtrbadgenumber AS BADGENO,
    cb.username AS createdByName,
    cb.photo AS created_by_photo_blob,
    ce.surname AS created_by_surname,
    ce.firstname AS created_by_firstname,
    ce.middlename AS created_by_middlename,
    ab.username AS approvedByName,
    ab.photo AS approved_by_photo_blob,
    ae.surname AS approved_by_surname,
    ae.firstname AS approved_by_firstname,
    ae.middlename AS approved_by_middlename
  FROM employee_fixchecktimes f
  LEFT JOIN employees e ON f.emp_objid = e.objid
  LEFT JOIN employees_media em ON e.objid = em.emp_objid
  LEFT JOIN sysusers cb ON f.createdby = cb.id
  LEFT JOIN employees ce ON cb.emp_objid = ce.objid
  LEFT JOIN sysusers ab ON f.approveby = ab.id
  LEFT JOIN employees ae ON ab.emp_objid = ae.objid
`;

// Helper function to convert photo blob to base64 data URL
const convertPhotoBlob = (photoBlob) => {
  if (!photoBlob) return null;
  try {
    const buffer = Buffer.isBuffer(photoBlob) 
      ? photoBlob 
      : Buffer.from(photoBlob);
    if (buffer.length > 0) {
      const base64 = buffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    }
  } catch (error) {
    console.error('Error converting photo blob:', error);
  }
  return null;
};

// Helper function to process a row and convert photo blobs
const processRow = (row) => {
  const processedRow = { ...row };
  
  // Format employee names
  processedRow.employeeName = formatEmployeeName(row.LASTNAME, row.FIRSTNAME, row.middlename);
  processedRow.created_by_employee_name = formatEmployeeName(row.created_by_surname, row.created_by_firstname, row.created_by_middlename);
  processedRow.approved_by_employee_name = formatEmployeeName(row.approved_by_surname, row.approved_by_firstname, row.approved_by_middlename);
  
  processedRow.created_by_photo_path = convertPhotoBlob(row.created_by_photo_blob);
  processedRow.approved_by_photo_path = convertPhotoBlob(row.approved_by_photo_blob);
  
  // Remove blob fields from response
  delete processedRow.created_by_photo_blob;
  delete processedRow.approved_by_photo_blob;
  
  return processedRow;
};

export const listFixChecktimes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    
    const {
      search,
      emp_objid,
      dateFrom,
      dateTo,
      status
    } = req.query;

    let query = baseQuery + ' WHERE 1=1';
    const params = [];

    if (emp_objid) {
      query += ` AND f.emp_objid = ?`;
      params.push(emp_objid);
    }

    if (search) {
      query += ` AND (e.surname LIKE ? OR e.firstname LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (dateFrom) {
      query += ` AND DATE(f.checktimedate) >= ?`;
      params.push(dateFrom);
    }
    
    if (dateTo) {
      query += ` AND DATE(f.checktimedate) <= ?`;
      params.push(dateTo);
    }
    
    if (status) {
      query += ` AND f.fixstatus = ?`;
      params.push(status);
    }

    query += ' ORDER BY f.checktimedate DESC, f.createddate DESC';

    const [rows] = await pool.execute(query, params);
    
    // Convert sysuser photo blobs to base64 data URLs
    const processedRows = rows.map(processRow);
    
    res.json({ success: true, data: processedRows });
  } catch (error) {
    console.error('Error listing fix checktime records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fix logs', error: error.message });
  }
};

export const getFixChecktime = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    const { id } = req.params;
    const [rows] = await pool.execute(`${baseQuery} WHERE f.fixid = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fix log not found' });
    }
    const processedRow = processRow(rows[0]);
    res.json({ success: true, data: processedRow });
  } catch (error) {
    console.error('Error fetching fix checktime record:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fix log' });
  }
};

export const createFixChecktime = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    const {
      emp_objid,
      checktimedate,
      am_checkin,
      am_checkout,
      pm_checkin,
      pm_checkout,
      remarks
    } = req.body;

    // Get user ID from auth middleware or request body
    const createdby = req.user?.USERID || req.user?.id || req.body.createdby;

    // Check for existing record
    const [existing] = await pool.execute(
      'SELECT fixid FROM employee_fixchecktimes WHERE emp_objid = ? AND DATE(checktimedate) = DATE(?)',
      [emp_objid, checktimedate]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'A fix record for this employee and date already exists. Please update it instead.' 
      });
    }

    const [insertResult] = await pool.execute(
      `INSERT INTO employee_fixchecktimes (
        emp_objid,
        checktimedate,
        am_checkin,
        am_checkout,
        pm_checkin,
        pm_checkout,
        remarks,
        createdby,
        createddate,
        fixstatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'For Approval')`,
      [
        emp_objid,
        checktimedate,
        am_checkin || null,
        am_checkout || null,
        pm_checkin || null,
        pm_checkout || null,
        remarks || null,
        createdby
      ]
    );

    const newId = insertResult.insertId;
    const [rows] = await pool.execute(`${baseQuery} WHERE f.fixid = ?`, [newId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Created fix log not found' });
    }
    
    const processedRow = processRow(rows[0]);
    
    // Notify employee about new fix log record
    console.log(`📢 [FIX LOGS] Notifying employee ${emp_objid} (type: ${typeof emp_objid}) about created fix log ${newId}`);
    console.log(`📢 [FIX LOGS] Request body emp_objid: ${req.body.emp_objid}, type: ${typeof req.body.emp_objid}`);
    changeNotificationService.notifyEmployee(
      emp_objid,
      'fix_logs',
      'created',
      { fixLogId: newId }
    );
    
    res.status(201).json({ success: true, data: processedRow });
  } catch (error) {
    console.error('Error creating fix checktime record:', error);
    res.status(500).json({ success: false, message: 'Failed to create fix log', error: error.message });
  }
};

export const updateFixChecktime = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    const { id } = req.params;
    const {
      checktimedate,
      am_checkin,
      am_checkout,
      pm_checkin,
      pm_checkout,
      remarks
    } = req.body;

    // Get user ID from auth middleware or request body
    const updatedby = req.user?.USERID || req.user?.id || req.body.updatedby;

    await pool.execute(
      `UPDATE employee_fixchecktimes
      SET 
        checktimedate = ?,
        am_checkin = ?,
        am_checkout = ?,
        pm_checkin = ?,
        pm_checkout = ?,
        remarks = ?,
        updatedby = ?,
        updateddate = NOW()
      WHERE fixid = ?`,
      [
        checktimedate,
        am_checkin || null,
        am_checkout || null,
        pm_checkin || null,
        pm_checkout || null,
        remarks || null,
        updatedby,
        id
      ]
    );

    const [rows] = await pool.execute(`${baseQuery} WHERE f.fixid = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fix log not found' });
    }
    const processedRow = processRow(rows[0]);
    const emp_objid = rows[0].emp_objid;
    
    // Notify employee about updated fix log record
    if (emp_objid) {
      console.log(`📢 [FIX LOGS] Notifying employee ${emp_objid} (type: ${typeof emp_objid}) about updated fix log ${id}`);
      changeNotificationService.notifyEmployee(
        emp_objid,
        'fix_logs',
        'updated',
        { fixLogId: id }
      );
    } else {
      console.warn(`⚠️ [FIX LOGS] Cannot notify: emp_objid is null/undefined for fix log ${id}`);
    }
    
    res.json({ success: true, data: processedRow });
  } catch (error) {
    console.error('Error updating fix checktime record:', error);
    res.status(500).json({ success: false, message: 'Failed to update fix log', error: error.message });
  }
};

export const deleteFixChecktime = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    const { id } = req.params;
    
    // Get emp_objid before deleting
    const [existingRows] = await pool.execute(
      'SELECT emp_objid FROM employee_fixchecktimes WHERE fixid = ? LIMIT 1',
      [id]
    );
    const emp_objid = existingRows.length > 0 ? existingRows[0].emp_objid : null;
    
    const [result] = await pool.execute('DELETE FROM employee_fixchecktimes WHERE fixid = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Fix log not found' });
    }
    
    // Notify employee about deleted fix log record
    if (emp_objid) {
      console.log(`📢 [FIX LOGS] Notifying employee ${emp_objid} about deleted fix log ${id}`);
      changeNotificationService.notifyEmployee(
        emp_objid,
        'fix_logs',
        'deleted',
        { fixLogId: id }
      );
    } else {
      console.warn(`⚠️ [FIX LOGS] Cannot notify: emp_objid is null for fix log ${id}`);
    }
    
    res.json({ success: true, message: 'Fix log deleted' });
  } catch (error) {
    console.error('Error deleting fix checktime record:', error);
    res.status(500).json({ success: false, message: 'Failed to delete fix log', error: error.message });
  }
};

export const approveFixChecktime = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    const { id } = req.params;
    const { remarks } = req.body;
    
    // Get user ID from auth middleware or request body
    const approveby = req.user?.USERID || req.user?.id || req.body.approveby;
    
    // If remarks provided, append to existing remarks or set new
    let updateQuery = `
      UPDATE employee_fixchecktimes
      SET fixstatus = 'Approved',
          approveby = ?,
          approvedate = NOW()`;
    
    const params = [approveby];
    
    if (remarks) {
      // Get existing remarks and append new approval remarks
      const [existing] = await pool.execute(
        'SELECT remarks FROM employee_fixchecktimes WHERE fixid = ?',
        [id]
      );
      const existingRemarks = existing[0]?.remarks || '';
      const newRemarks = existingRemarks 
        ? `${existingRemarks}\n\n[APPROVED] ${remarks}`
        : `[APPROVED] ${remarks}`;
      updateQuery += `, remarks = ?`;
      params.push(newRemarks);
    }
    
    updateQuery += ` WHERE fixid = ?`;
    params.push(id);
    
    const [result] = await pool.execute(updateQuery, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Fix log not found' });
    }
    
    // Get emp_objid to notify employee about approval
    const [approvedFixLog] = await pool.execute('SELECT emp_objid FROM employee_fixchecktimes WHERE fixid = ? LIMIT 1', [id]);
    const emp_objid_approve = approvedFixLog.length > 0 ? approvedFixLog[0].emp_objid : null;
    
    if (emp_objid_approve) {
      console.log(`📢 [FIX LOGS] Notifying employee ${emp_objid_approve} (type: ${typeof emp_objid_approve}) about approved fix log ${id}`);
      changeNotificationService.notifyEmployee(
        emp_objid_approve,
        'fix_logs',
        'approved',
        { fixLogId: id }
      );
    } else {
      console.warn(`⚠️ [FIX LOGS] Cannot notify: emp_objid is null/undefined for approved fix log ${id}`);
    }
    
    res.json({ success: true, message: 'Fix log approved' });
  } catch (error) {
    console.error('Error approving fix checktime record:', error);
    res.status(500).json({ success: false, message: 'Failed to approve fix log', error: error.message });
  }
};

export const cancelFixChecktime = async (req, res) => {
  try {
    const pool = getHR201Pool();
    await ensureTableExists(pool);
    const { id } = req.params;
    const { remarks } = req.body;
    
    // Get user ID from auth middleware or request body
    const updatedby = req.user?.USERID || req.user?.id || req.body.updatedby;
    
    // If remarks provided, append to existing remarks or set new
    let updateQuery = `
      UPDATE employee_fixchecktimes
      SET fixstatus = 'Cancel',
          updatedby = ?,
          updateddate = NOW()`;
    
    const params = [updatedby];
    
    if (remarks) {
      // Get existing remarks and append new cancellation remarks
      const [existing] = await pool.execute(
        'SELECT remarks FROM employee_fixchecktimes WHERE fixid = ?',
        [id]
      );
      const existingRemarks = existing[0]?.remarks || '';
      const newRemarks = existingRemarks 
        ? `${existingRemarks}\n\n[CANCELLED] ${remarks}`
        : `[CANCELLED] ${remarks}`;
      updateQuery += `, remarks = ?`;
      params.push(newRemarks);
    }
    
    updateQuery += ` WHERE fixid = ?`;
    params.push(id);
    
    const [result] = await pool.execute(updateQuery, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Fix log not found' });
    }
    
    res.json({ success: true, message: 'Fix log cancelled' });
  } catch (error) {
    console.error('Error cancelling fix checktime record:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel fix log', error: error.message });
  }
};
