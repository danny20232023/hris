import { getHR201Pool } from '../config/hr201Database.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

function resolveSysUserIdFromJWT(req) {
  // Return the logged-in user ID from JWT
  return req.user?.USERID || null;
}

function toHHMM(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return null;
}

export const list = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const empFilter = req.query.emp_objid ? 'WHERE a.emp_objid = ?' : '';
    const params = req.query.emp_objid ? [req.query.emp_objid] : [];
    const sql = `
      SELECT a.objid, a.emp_objid, a.shiftid, a.is_used, a.createdby, a.createddate,
             e.surname, e.firstname, e.middlename, e.extension,
             s.shiftname, s.shifttimemode, s.shift_checkin, s.shift_checkout,
             su.username AS createdby_username,
             su.photo AS createdby_photo_blob,
             e2.surname AS createdby_surname,
             e2.firstname AS createdby_firstname,
             e2.middlename AS createdby_middlename
      FROM employee_assignedshifts a
      LEFT JOIN employees e ON e.objid = a.emp_objid
      LEFT JOIN shiftscheduletypes s ON s.id = a.shiftid
      LEFT JOIN sysusers su ON su.id = a.createdby
      LEFT JOIN employees e2 ON e2.objid = su.emp_objid
      ${empFilter}
      ORDER BY e.surname, e.firstname, a.createddate DESC`;
    const [rows] = await pool.execute(sql, params);
    
    // Convert photo blobs to base64
    const withPhotos = await Promise.all(rows.map(async (r) => {
      let createdbyPhoto = null;
      if (r.createdby_photo_blob) {
        try {
          const photoBuffer = Buffer.isBuffer(r.createdby_photo_blob) 
            ? r.createdby_photo_blob 
            : Buffer.from(r.createdby_photo_blob);
          
          if (photoBuffer.length > 0) {
            createdbyPhoto = `data:image/png;base64,${photoBuffer.toString('base64')}`;
          }
        } catch (error) {
          console.error('Error converting createdby photo:', error);
        }
      }
      const { createdby_photo_blob, ...rest } = r;
      return { 
        ...rest, 
        createdby_employee_name: formatEmployeeName(r.createdby_surname, r.createdby_firstname, r.createdby_middlename),
        createdby_photo_path: createdbyPhoto 
      };
    }));
    
    return res.json({ success: true, data: withPhotos });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list assigned shifts', error: e.message });
  }
};

export const getById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM employee_assignedshifts WHERE objid = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to get assigned shift', error: e.message });
  }
};

export const create = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { emp_objid, shiftid } = req.body || {};
    if (!emp_objid || !shiftid) return res.status(400).json({ success: false, message: 'emp_objid and shiftid are required' });

    const createdby = resolveSysUserIdFromJWT(req);
    if (!createdby) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const sql = `INSERT INTO employee_assignedshifts (objid, emp_objid, shiftid, is_used, createdby, createddate)
                 VALUES (UUID(), ?, ?, 0, ?, NOW())`;
    const params = [emp_objid, Number(shiftid), createdby];
    await pool.execute(sql, params);
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create assigned shift', error: e.message });
  }
};

export const update = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const id = req.params.id;
    const { shiftid, is_used, emp_objid } = req.body || {};
    if (!shiftid && is_used === undefined) return res.status(400).json({ success: false, message: 'Nothing to update' });

    // Do not reset other rows; only update this row

    const updates = [];
    const params = [];
    if (shiftid !== undefined) { updates.push('shiftid = ?'); params.push(Number(shiftid)); }
    if (is_used !== undefined) { updates.push('is_used = ?'); params.push(is_used ? 1 : 0); }
    if (!updates.length) return res.json({ success: true });
    params.push(id);
    const sql = `UPDATE employee_assignedshifts SET ${updates.join(', ')} WHERE objid = ?`;
    const [result] = await pool.execute(sql, params);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update assigned shift', error: e.message });
  }
};

export const remove = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [result] = await pool.execute('DELETE FROM employee_assignedshifts WHERE objid = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete assigned shift', error: e.message });
  }
};

export const bulkAssign = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { shiftid } = req.body || {};
    if (!shiftid) return res.status(422).json({ success: false, message: 'shiftid is required' });

    const createdby = resolveSysUserIdFromJWT(req);
    if (!createdby) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const sql = `
      INSERT INTO employee_assignedshifts (objid, emp_objid, shiftid, is_used, createdby, createddate)
      SELECT UUID(), e.objid, ?, 1, ?, NOW()
      FROM employees e
      LEFT JOIN employee_assignedshifts a ON a.emp_objid = e.objid AND a.shiftid = ?
      WHERE a.emp_objid IS NULL`;
    const [result] = await pool.execute(sql, [Number(shiftid), createdby, Number(shiftid)]);
    res.json({ success: true, insertedCount: result?.affectedRows || 0 });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to bulk assign', error: e.message });
  }
};


