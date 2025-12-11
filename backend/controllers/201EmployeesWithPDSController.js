import { getHR201Pool } from '../config/hr201Database.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { v4 as uuidv4 } from 'uuid';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

function toMmDdYyyy(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).slice(0, 10);
  const y = s.slice(0, 4), m = s.slice(5, 7), d = s.slice(8, 10);
  if (y && m && d) return `${m}/${d}/${y}`;
  return s;
}

export const list = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const sql = `
      SELECT 
        e.objid,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension,
        e.birthdate,
        e.birthplace,
        e.gender,
        e.civil_status,
        e.height,
        e.weight,
        e.blood_type,
        e.gsis,
        e.pagibig,
        e.philhealth,
        e.sss,
        e.tin,
        e.telephone,
        e.mobile,
        e.email,
        e.agency_no,
        e.ispdsentrylock,
        em.photo_path,
        em.date_accomplished,
        dt.designationname AS presentDesignationName,
        ed.position AS presentPosition,
        dept.departmentshortname AS departmentName,
        dept.departmentname AS departmentLongName,
        ed.assigneddept,
        ed.designationid,
        ed.objid AS currentDesignationObjId,
        ed.appointmentstatus,
        ed.plantilla_id,
        ed.stepincrement,
        p.salarygrade,
        atp.appointmentname AS appointmentName,
        shiftAgg.shiftNames,
        shiftAgg.firstShiftId
      FROM employees e
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      LEFT JOIN (
        SELECT emp_objid, MAX(objid) AS objid
        FROM employee_designation
        WHERE ispresent = 1
        GROUP BY emp_objid
      ) current_des ON current_des.emp_objid = e.objid
      LEFT JOIN employee_designation ed ON ed.objid = current_des.objid
      LEFT JOIN designationtypes dt ON dt.id = ed.designationid
      LEFT JOIN department dept ON dept.deptid = ed.assigneddept
      LEFT JOIN appointmenttypes atp ON atp.id = ed.appointmentstatus
      LEFT JOIN plantilla p ON ed.plantilla_id = p.id
      LEFT JOIN (
        SELECT 
          a.emp_objid,
          GROUP_CONCAT(DISTINCT sst.shiftname ORDER BY sst.shiftname SEPARATOR ', ') AS shiftNames,
          MAX(a.shiftid) AS firstShiftId
        FROM employee_assignedshifts a
        LEFT JOIN shiftscheduletypes sst ON sst.id = a.shiftid
        WHERE a.is_used = 1
        GROUP BY a.emp_objid
      ) shiftAgg ON shiftAgg.emp_objid = e.objid
      ORDER BY e.surname, e.firstname, e.middlename
    `;
    const [rows] = await pool.execute(sql);
    const data = await Promise.all(rows.map(async (r) => {
      let photo = null;
      if (r.photo_path) { 
        try { 
          // photo_path is now INT (pathid), requires objid and type
          photo = await readMediaAsBase64(r.photo_path, r.objid, 'photo'); 
        } catch { 
          photo = null; 
        } 
      }
      return {
        objid: r.objid,
        fullname: formatEmployeeName(r.surname, r.firstname, r.middlename, r.extension),
        birthdate: toMmDdYyyy(r.birthdate),
        birthdate_iso: r.birthdate ? String(r.birthdate).slice(0, 10) : null,
        photo_path: photo,
        presentDesignation: r.presentDesignationName || r.presentPosition || '',
        presentDesignationId: r.designationid || null,
        position: r.presentPosition || '',
        department: r.departmentName || r.departmentLongName || '',
        departmentId: r.assigneddept || null,
        appointment: r.appointmentName || '',
        appointmentId: r.appointmentstatus || null,
        salarygrade: r.salarygrade || null,
        stepincrement: r.stepincrement || null,
        shiftSchedule: r.shiftNames || '',
        shiftId: r.firstShiftId || null,
        designationRecordId: r.currentDesignationObjId || null,
        surname: r.surname || '',
        firstname: r.firstname || '',
        middlename: r.middlename || '',
        extension: r.extension || '',
        birth_place: r.birthplace || '',
        gender: r.gender || '',
        civilstatus: r.civil_status || '',
        height: r.height != null ? String(r.height) : '',
        weight: r.weight != null ? String(r.weight) : '',
        bloodtype: r.blood_type || '',
        gsis: r.gsis || '',
        pagibig: r.pagibig || '',
        philhealth: r.philhealth || '',
        sss: r.sss || '',
        tin: r.tin || '',
        telephone: r.telephone || '',
        mobileno: r.mobile || '',
        email: r.email || '',
        agency_no: r.agency_no || '',
        ispdsentrylock: r.ispdsentrylock || 0,
        date_accomplished: r.date_accomplished || null,
      };
    }));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list employees', error: e.message });
  }
};

export const getById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM employees WHERE objid = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to get record', error: e.message });
  }
};

export const create = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const payload = req.body || {};
    const requiredFields = ['surname', 'firstname', 'birthdate'];
    for (const field of requiredFields) {
      if (!payload[field] || String(payload[field]).trim() === '') {
        return res.status(400).json({ success: false, message: `${field} is required` });
      }
    }

    const fieldMap = {
      surname: 'surname',
      firstname: 'firstname',
      middlename: 'middlename',
      extension: 'extension',
      birthdate: 'birthdate',
      birth_place: 'birthplace',
      gender: 'gender',
      civilstatus: 'civil_status',
      height: 'height',
      weight: 'weight',
      bloodtype: 'blood_type',
      gsis: 'gsis',
      pagibig: 'pagibig',
      philhealth: 'philhealth',
      sss: 'sss',
      tin: 'tin',
      telephone: 'telephone',
      mobileno: 'mobile',
      email: 'email',
      agency_no: 'agency_no'
    };

    const columns = ['objid'];
    const placeholders = ['UUID()'];
    const values = [];

    for (const [key, column] of Object.entries(fieldMap)) {
      if (payload[key] !== undefined) {
        columns.push(column);
        placeholders.push('?');
        const value = payload[key];
        values.push(value === '' ? null : value);
      }
    }

    const sql = `INSERT INTO employees (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    await pool.execute(sql, values);
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create employee', error: e.message });
  }
};

export const update = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const payload = req.body || {};
    const fieldMap = {
      surname: 'surname',
      firstname: 'firstname',
      middlename: 'middlename',
      extension: 'extension',
      birthdate: 'birthdate',
      birth_place: 'birthplace',
      gender: 'gender',
      civilstatus: 'civil_status',
      height: 'height',
      weight: 'weight',
      bloodtype: 'blood_type',
      gsis: 'gsis',
      pagibig: 'pagibig',
      philhealth: 'philhealth',
      sss: 'sss',
      tin: 'tin',
      telephone: 'telephone',
      mobileno: 'mobile',
      email: 'email',
      agency_no: 'agency_no'
    };

    const updates = [];
    const params = [];

    for (const [key, column] of Object.entries(fieldMap)) {
      if (payload[key] !== undefined) {
        updates.push(`${column} = ?`);
        const value = payload[key];
        params.push(value === '' ? null : value);
      }
    }

    if (!updates.length) return res.json({ success: true });
    params.push(req.params.id);
    const sql = `UPDATE employees SET ${updates.join(', ')} WHERE objid = ?`;
    const [result] = await pool.execute(sql, params);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update employee', error: e.message });
  }
};

export const remove = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [result] = await pool.execute('DELETE FROM employees WHERE objid = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete employee', error: e.message });
  }
};

export const toggleLockPDS = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const employeeObjId = req.params.id;
    const { isLocked } = req.body;

    if (typeof isLocked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isLocked must be a boolean value' });
    }

    await pool.query('START TRANSACTION');

    try {
      // Update employees table
      await pool.execute(
        'UPDATE employees SET ispdsentrylock = ? WHERE objid = ?',
        [isLocked ? 1 : 0, employeeObjId]
      );

      // Check if employees_media record exists
      const [existingMedia] = await pool.execute(
        'SELECT objid FROM employees_media WHERE emp_objid = ? LIMIT 1',
        [employeeObjId]
      );

      if (isLocked) {
        // ON: Set ispdsentrylock = 1, and set date_accomplished if null
        if (existingMedia.length > 0) {
          // Update existing record - set date_accomplished to current date if it's null
          await pool.execute(
            `UPDATE employees_media 
             SET date_accomplished = COALESCE(date_accomplished, CURDATE()), updated_at = NOW() 
             WHERE emp_objid = ?`,
            [employeeObjId]
          );
        } else {
          // Create new record with date_accomplished = current date
          await pool.execute(
            `INSERT INTO employees_media (objid, emp_objid, signature_path, photo_path, thumb_path, date_accomplished, created_at, updated_at)
             VALUES (?, ?, NULL, NULL, NULL, CURDATE(), NOW(), NOW())`,
            [uuidv4(), employeeObjId]
          );
        }
      } else {
        // OFF: Set ispdsentrylock = 0, and set date_accomplished = NULL
        if (existingMedia.length > 0) {
          await pool.execute(
            'UPDATE employees_media SET date_accomplished = NULL, updated_at = NOW() WHERE emp_objid = ?',
            [employeeObjId]
          );
        }
        // If no media record exists, we don't need to create one for OFF state
      }

      await pool.query('COMMIT');
      res.json({ success: true, message: `PDS ${isLocked ? 'locked' : 'unlocked'} successfully` });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (e) {
    console.error('Error toggling PDS lock:', e);
    res.status(500).json({ success: false, message: 'Failed to toggle PDS lock', error: e.message });
  }
};


