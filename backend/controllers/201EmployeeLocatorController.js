import { getHR201Pool } from '../config/hr201Database.js';
import { v4 as uuidv4 } from 'uuid';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { changeNotificationService } from '../services/changeNotificationService.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// Helper: build locator number YYYYMMDDLC-SEQ, using current local date
// SEQ = (count of locators created in the same year-month) + 1
async function generateLocatorNo(connection) {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth(); // 0-based
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  const yearMonth = `${year}-${mm}`; // e.g., 2025-11
  const [countRows] = await connection.execute(
    "SELECT COUNT(*) AS cnt FROM employee_locators WHERE DATE_FORMAT(createddate, '%Y-%m') = ?",
    [yearMonth]
  );

  const seq = Number(countRows?.[0]?.cnt || 0) + 1;
  const sequenceStr = String(seq).padStart(3, '0');
  const yyyy = String(year).padStart(4, '0');
  return `${yyyy}${mm}${dd}LC-${sequenceStr}`;
}

const normalizeLocatorStatus = (value) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'PENDING') {
    return 'For Approval';
  }
  return trimmed;
};

export const listLocators = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const { emp_objid, q, from, to } = req.query;
    const params = [];
    let sql = `SELECT el.objid, el.emp_objid, el.locatorno, el.locpurpose, el.locdestination,
      DATE_FORMAT(el.locatordate, '%Y-%m-%d') AS locatordate,
      el.loctimedeparture, el.loctimearrival, el.locremarks, el.createdby, el.createddate,
      el.updatedby, el.updateddate, el.locstatus, el.approvedby, el.approveddate, el.isportal,
      e.objid AS emp_objid_join,
      e.surname, e.firstname, e.middlename,
      em.photo_path AS employee_photo_path_raw,
      s.id AS createdby_sysuser_id,
      s.username AS createdby_username,
      s.photo AS createdby_photo_blob,
      c.surname AS createdby_surname,
      c.firstname AS createdby_firstname,
      c.middlename AS createdby_middlename
      FROM employee_locators el
      LEFT JOIN employees e ON e.objid = el.emp_objid
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      LEFT JOIN sysusers s ON s.id = el.createdby
      LEFT JOIN employees c ON c.objid = s.emp_objid`;
    const where = [];
    if (emp_objid) { where.push('el.emp_objid = ?'); params.push(emp_objid); }
    if (q) { where.push('(el.locatorno LIKE ? OR el.locpurpose LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (from) { where.push('DATE(el.locatordate) >= ?'); params.push(from); }
    if (to) { where.push('DATE(el.locatordate) <= ?'); params.push(to); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY el.emp_objid ASC, el.locatordate DESC, el.loctimedeparture DESC';
    const [rows] = await connection.execute(sql, params);
    connection.release();
    // Convert photos to base64 data URLs
    const withPhotos = await Promise.all(rows.map(async (r) => {
      // Convert employee photo from file path to base64
      let employeePhoto = null;
      if (r.employee_photo_path_raw && r.emp_objid_join) {
        try {
          // photo_path is now INT (pathid), requires objid and type
          employeePhoto = await readMediaAsBase64(r.employee_photo_path_raw, r.emp_objid_join, 'photo');
        } catch {
          employeePhoto = null;
        }
      }
      
      // Convert creator photo BLOB to base64 data URL if available
      let createdbyPhoto = null;
      if (r.createdby_photo_blob) {
        try {
          // Convert BLOB Buffer to base64
          const buffer = Buffer.isBuffer(r.createdby_photo_blob) ? r.createdby_photo_blob : Buffer.from(r.createdby_photo_blob);
          const base64 = buffer.toString('base64');
          createdbyPhoto = `data:image/png;base64,${base64}`;
        } catch {
          createdbyPhoto = null;
        }
      }
      
      return { 
        ...r, 
        locstatus: normalizeLocatorStatus(r.locstatus),
        employee_name: formatEmployeeName(r.surname, r.firstname, r.middlename),
        createdby_employee_name: formatEmployeeName(r.createdby_surname, r.createdby_firstname, r.createdby_middlename),
        employee_photo_path: employeePhoto,
        createdby_photo_path: createdbyPhoto 
      };
    }));
    res.json({ success: true, data: withPhotos });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list locators', error: e.message });
  }
};

export const getLocatorById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT objid, emp_objid, locatorno, locpurpose, locdestination,
       DATE_FORMAT(locatordate, '%Y-%m-%d') AS locatordate,
       loctimedeparture, loctimearrival, locremarks, createdby, createddate,
       updatedby, updateddate, locstatus, approvedby, approveddate, isportal
       FROM employee_locators WHERE objid = ? LIMIT 1`,
      [req.params.id]
    );
    connection.release();
    if (!rows.length) return res.status(404).json({ success: false, message: 'Locator not found' });
    const locator = rows[0];
    locator.locstatus = normalizeLocatorStatus(locator.locstatus);
    res.json({ success: true, data: locator });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to get locator', error: e.message });
  }
};

export const createLocator = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const {
      emp_objid,
      locpurpose,
      locdestination,
      locatordate, // YYYY-MM-DD
      loctimedeparture, // HH:mm
      loctimearrival, // HH:mm
      locremarks,
      isportal,
      createdby // Allow explicit null for portal entries
    } = req.body || {};

    // Validate all required fields
    if (!emp_objid || !locpurpose || !locdestination || !locatordate || !loctimedeparture || !loctimearrival) {
      connection.release();
      return res.status(400).json({ success: false, message: 'emp_objid, locpurpose, locdestination, locatordate, loctimedeparture, loctimearrival are required' });
    }

    const objid = uuidv4();
    const locatorno = await generateLocatorNo(connection, locatordate);
    // Use provided createdby (can be null for portal entries), otherwise use req.user.USERID
    const finalCreatedby = createdby !== undefined ? createdby : (req.user?.USERID || null);
    const createddate = new Date();
    const locstatus = 'For Approval'; // server-enforced
    const finalIsportal = isportal !== undefined ? isportal : 0; // Default to 0 if not provided

    const depDateTime = `${locatordate} ${loctimedeparture}:00`;
    const arrDateTime = `${locatordate} ${loctimearrival}:00`;

    await connection.execute(
      `INSERT INTO employee_locators (objid, emp_objid, locatorno, locpurpose, locdestination, locatordate, loctimedeparture, loctimearrival, locremarks, createdby, createddate, locstatus, isportal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [objid, emp_objid, locatorno, locpurpose, locdestination, locatordate, depDateTime, arrDateTime, locremarks || null, finalCreatedby, createddate, locstatus, finalIsportal]
    );
    connection.release();
    
    // Notify employee about new locator record
    console.log(`📢 [LOCATOR] Notifying employee ${emp_objid} (type: ${typeof emp_objid}) about created locator ${objid}`);
    changeNotificationService.notifyEmployee(
      emp_objid,
      'locator',
      'created',
      { locatorId: objid, locatorno }
    );
    
    res.status(201).json({ success: true, data: { objid, locatorno }, message: 'Locator created' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create locator', error: e.message });
  }
};

export const updateLocator = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const id = req.params.id;
    
    // Get emp_objid before updating
    const [existingRows] = await connection.execute(
      'SELECT emp_objid FROM employee_locators WHERE objid = ?',
      [id]
    );
    const emp_objid = existingRows.length > 0 ? existingRows[0].emp_objid : null;
    const {
      locpurpose,
      locdestination,
      locatordate,
      loctimedeparture,
      loctimearrival,
      locremarks,
      locstatus
    } = req.body || {};

    const updates = [];
    const params = [];
    if (locpurpose !== undefined) { updates.push('locpurpose = ?'); params.push(locpurpose); }
    if (locdestination !== undefined) { updates.push('locdestination = ?'); params.push(locdestination); }
    if (locatordate) { updates.push('locatordate = ?'); params.push(locatordate); }
    if (loctimedeparture) { updates.push('loctimedeparture = ?'); params.push(`${locatordate || ''} ${loctimedeparture}:00`.trim()); }
    if (loctimearrival) { updates.push('loctimearrival = ?'); params.push(`${locatordate || ''} ${loctimearrival}:00`.trim()); }
    if (locremarks !== undefined) { updates.push('locremarks = ?'); params.push(locremarks); }
    if (locstatus) {
      const normalizedStatus = normalizeLocatorStatus(locstatus);
      updates.push('locstatus = ?'); params.push(normalizedStatus);
      // If status is being set to "Approved", also set approvedby and approveddate
      if (normalizedStatus === 'Approved') {
        updates.push('approvedby = ?'); params.push(req.user?.USERID || null);
        updates.push('approveddate = ?'); params.push(new Date());
      }
      updates.push('updatedby = ?'); params.push(req.user?.USERID || null);
      updates.push('updateddate = ?'); params.push(new Date());
    }

    if (!updates.length) { connection.release(); return res.json({ success: true }); }
    params.push(id);
    const sql = `UPDATE employee_locators SET ${updates.join(', ')} WHERE objid = ?`;
    const [result] = await connection.execute(sql, params);
    connection.release();
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Locator not found' });
    
    // Notify employee about updated locator record
    if (emp_objid) {
      console.log(`📢 [LOCATOR] Notifying employee ${emp_objid} (type: ${typeof emp_objid}) about updated locator ${id}`);
      changeNotificationService.notifyEmployee(
        emp_objid,
        'locator',
        'updated',
        { locatorId: id }
      );
    } else {
      console.warn(`⚠️ [LOCATOR] Cannot notify: emp_objid is null/undefined for locator ${id}`);
    }
    
    res.json({ success: true, message: 'Locator updated' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update locator', error: e.message });
  }
};

export const deleteLocator = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const id = req.params.id;
    
    // Get emp_objid before deleting
    const [existingRows] = await connection.execute(
      'SELECT emp_objid FROM employee_locators WHERE objid = ?',
      [id]
    );
    const emp_objid = existingRows.length > 0 ? existingRows[0].emp_objid : null;
    
    const [result] = await connection.execute('DELETE FROM employee_locators WHERE objid = ?', [id]);
    connection.release();
    
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Locator not found' });
    
    // Notify employee about deleted locator record
    if (emp_objid) {
      console.log(`📢 [LOCATOR] Notifying employee ${emp_objid} (type: ${typeof emp_objid}) about deleted locator ${id}`);
      changeNotificationService.notifyEmployee(
        emp_objid,
        'locator',
        'deleted',
        { locatorId: id }
      );
    } else {
      console.warn(`⚠️ [LOCATOR] Cannot notify: emp_objid is null/undefined for deleted locator ${id}`);
    }
    
    res.json({ success: true, message: 'Locator deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete locator', error: e.message });
  }
};

export const listEmployeesForLocator = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const { q } = req.query;
    let sql = `SELECT objid, surname, firstname, middlename FROM employees`;
    const params = [];
    if (q) {
      sql += ` WHERE surname LIKE ? OR firstname LIKE ? OR middlename LIKE ?`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY surname, firstname, middlename';
    const [rows] = await connection.execute(sql, params);
    connection.release();
    const data = rows.map(r => ({
      objid: r.objid,
      name: `${r.surname || ''}, ${r.firstname || ''} ${r.middlename || ''}`.trim(),
      photo: null
    }));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list employees', error: e.message });
  }
};


