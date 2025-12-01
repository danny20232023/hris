import { v4 as uuidv4 } from 'uuid';
import { getHR201Pool } from '../config/hr201Database.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { changeNotificationService } from '../services/changeNotificationService.js';
import { formatEmployeeName, formatEmployeeNameFromString } from '../utils/employeenameFormatter.js';

const mapTransactionRows = async (rows) => {
  return Promise.all(rows.map(async (r) => {
    const employees = [];
    if (r.employees_data) {
      const empDataArray = r.employees_data.split('|');
      const seenEmployees = new Set();
      for (const empData of empDataArray) {
        const parts = empData.split(':');
        if (parts.length >= 3) {
          const objid = parts[0];
          if (seenEmployees.has(objid)) continue;
          seenEmployees.add(objid);

          const name = parts.slice(1, -1).join(':').trim();
          const photo_path = parts[parts.length - 1];

          let photo = null;
          if (photo_path && photo_path.trim()) {
            try {
              photo = await readMediaAsBase64(photo_path.trim());
            } catch (e) {
              console.warn('Failed to load photo for employee:', objid, e.message);
              photo = null;
            }
          }
          
          // Parse the name from the employees_data format (surname, firstname middlename)
          const nameParts = name.split(',').map(p => p.trim());
          const lastName = nameParts[0] || '';
          const firstMiddle = nameParts[1] || '';
          const firstMiddleParts = firstMiddle.split(' ').filter(Boolean);
          const firstName = firstMiddleParts[0] || '';
          const middleName = firstMiddleParts.slice(1).join(' ') || '';
          
          employees.push({
            objid,
            name: formatEmployeeName(lastName, firstName, middleName) || 'Unknown',
            photo_path: photo,
          });
        }
      }
    }

    let createdByPhoto = null;
    let createdByEmployeeName = formatEmployeeName(r.created_by_surname, r.created_by_firstname, r.created_by_middlename) || null;
    let createdByUsername = r.created_by_username || null;
    let approvedByPhoto = null;
    let approvedByEmployeeName = r.approved_by_employee_name ? formatEmployeeNameFromString(r.approved_by_employee_name) : null;
    let approvedByUsername = r.approved_by_username || null;

    if (r.isportal === 1) {
      try {
        const pool = getHR201Pool();
        const [creatorRows] = await pool.execute(
          'SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path FROM employees e LEFT JOIN employees_media em ON em.emp_objid = e.objid WHERE e.dtruserid = ? LIMIT 1',
          [r.createdby]
        );
        if (creatorRows.length) {
          const creator = creatorRows[0];
          const fullname = `${creator.surname || ''}, ${creator.firstname || ''} ${creator.middlename || ''}`.replace(/\s+/g, ' ').trim();
          createdByEmployeeName = fullname || createdByEmployeeName;
          if (creator.photo_path) {
            try {
              // photo_path is now INT (pathid), requires objid and type
              createdByPhoto = await readMediaAsBase64(creator.photo_path, creator.objid, 'photo');
            } catch (e) {
              console.warn('Failed to load portal creator photo:', e.message);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to resolve portal creator info:', e.message);
      }
    }

    if (!createdByPhoto && r.created_by_photo_blob) {
      try {
        const buffer = Buffer.isBuffer(r.created_by_photo_blob) ? r.created_by_photo_blob : Buffer.from(r.created_by_photo_blob);
        const base64 = buffer.toString('base64');
        createdByPhoto = `data:image/png;base64,${base64}`;
      } catch (e) {
        console.warn('Failed to convert createdby photo:', e.message);
        createdByPhoto = null;
      }
    }

    if (r.approvedby && (!approvedByPhoto || !approvedByEmployeeName)) {
      try {
        const pool = getHR201Pool();
        if (!approvedByEmployeeName) {
          const [rows] = await pool.execute(
            'SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path FROM sysusers s LEFT JOIN employees e ON s.emp_objid = e.objid LEFT JOIN employees_media em ON em.emp_objid = e.objid WHERE s.id = ? LIMIT 1',
            [r.approvedby]
          );
          if (rows.length) {
            const approver = rows[0];
            const fullname = `${approver.surname || ''}, ${approver.firstname || ''} ${approver.middlename || ''}`.replace(/\s+/g, ' ').trim();
            approvedByEmployeeName = fullname || approvedByEmployeeName;
            if (!approvedByPhoto && approver.photo_path) {
              try {
                // photo_path is now INT (pathid), requires objid and type
                approvedByPhoto = await readMediaAsBase64(approver.photo_path, approver.objid, 'photo');
              } catch (e) {
                console.warn('Failed to load approver photo:', e.message);
              }
            }
          }
        }
        if (!approvedByPhoto || !approvedByEmployeeName) {
          const [rows] = await pool.execute(
            'SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path FROM employees e LEFT JOIN employees_media em ON em.emp_objid = e.objid WHERE e.dtruserid = ? LIMIT 1',
            [r.approvedby]
          );
          if (rows.length) {
            const approver = rows[0];
            const fullname = `${approver.surname || ''}, ${approver.firstname || ''} ${approver.middlename || ''}`.replace(/\s+/g, ' ').trim();
            approvedByEmployeeName = approvedByEmployeeName || fullname;
            if (!approvedByPhoto && approver.photo_path) {
              try {
                approvedByPhoto = await readMediaAsBase64(approver.photo_path);
              } catch (e) {
                console.warn('Failed to load portal approver photo:', e.message);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to resolve approver info:', e.message);
      }
    }

    const travelstatus = normalizeTravelStatus(r.travelstatus);

    return {
      ...r,
      employees,
      travel_dates: r.travel_dates || '',
      created_by_photo_path: createdByPhoto,
      created_by_username: createdByUsername,
      created_by_employee_name: createdByEmployeeName,
      approved_by_photo_path: approvedByPhoto,
      approved_by_username: approvedByUsername,
      approved_by_employee_name: approvedByEmployeeName,
      travelstatus,
    };
  }));
};

function toYyMmDd(dateStr) {
  const d = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

async function generateTravelNo(connection) {
  // Use current date/createddate for both prefix and monthly sequence
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS cnt FROM employee_travels WHERE DATE_FORMAT(createddate, '%Y-%m') = ?",
    [`${year}-${month}`]
  );
  const seq = Number(rows?.[0]?.cnt || 0) + 1;
  return `${toYyMmDd()}TR-${String(seq).padStart(3, '0')}`;
}

export const listEmployeesWithTravel = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const query = `
      SELECT e.objid, e.surname, e.firstname, e.middlename, e.extension,
             em.photo_path,
             (
               SELECT GROUP_CONCAT(DISTINCT DATE_FORMAT(d.traveldate, '%m/%d/%Y') ORDER BY d.traveldate SEPARATOR ', ')
               FROM employee_travels t
               JOIN employee_travels_dates d ON d.travel_objid = t.objid
               WHERE d.emp_objid = e.objid
                 AND t.travelstatus IN ('For Approval','Approved')
                 AND DATE(d.traveldate) >= ?
             ) AS has_travel_dates,
             (
               SELECT COUNT(*)
               FROM employee_travels t2
               JOIN employee_travels_dates d2 ON d2.travel_objid = t2.objid
               WHERE d2.emp_objid = e.objid
             ) AS total_travel_dates
      FROM employees e
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      ORDER BY e.surname, e.firstname
    `;
    const [rows] = await connection.execute(query, [todayStr]);
    connection.release();
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
        fullname: `${r.surname || ''}, ${r.firstname || ''} ${r.middlename || ''}`.trim(),
        surname: r.surname,
        firstname: r.firstname,
        middlename: r.middlename,
        extension: r.extension,
        photo_path: photo,
        has_travel_dates: r.has_travel_dates || '',
        total_travel_dates: Number(r.total_travel_dates || 0),
      };
    }));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to load info', error: e.message });
  }
};

export const listTravelLiaisons = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();

    const sql = `
      SELECT 
        e.objid,
        e.idno,
        e.dtruserid,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension,
        COALESCE(e.cancreatetravel, 0) AS cancreatetravel,
        em.photo_path
      FROM employees e
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      ORDER BY e.surname, e.firstname
    `;

    const [rows] = await connection.execute(sql);
    connection.release();

    const data = await Promise.all(rows.map(async (row) => {
      let photo = null;
      if (row.photo_path) {
        try {
          // photo_path is now INT (pathid), requires objid and type
          photo = await readMediaAsBase64(row.photo_path, row.objid, 'photo');
        } catch (err) {
          photo = null;
        }
      }

      const fullname = `${row.surname || ''}, ${row.firstname || ''} ${row.middlename || ''}`.replace(/\s+/g, ' ').trim();

      return {
        objid: row.objid,
        idno: row.idno,
        dtruserid: row.dtruserid,
        surname: row.surname,
        firstname: row.firstname,
        middlename: row.middlename,
        extension: row.extension,
        fullname,
        cancreatetravel: Number(row.cancreatetravel) === 1,
        photo_path: photo,
      };
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to list travel liaisons', error);
    res.status(500).json({ success: false, message: 'Failed to load travel liaisons', error: error.message });
  }
};

export const updateTravelLiaisons = async (req, res) => {
  const { updates } = req.body || {};

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ success: false, message: 'updates[] is required' });
  }

  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const entry of updates) {
      if (!entry || !entry.objid) continue;
      const value = entry.cancreatetravel ? 1 : 0;
      await connection.execute(
        'UPDATE employees SET cancreatetravel = ? WHERE objid = ?',
        [value, entry.objid]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to update travel liaisons', error);
    res.status(500).json({ success: false, message: 'Failed to update travel liaisons', error: error.message });
  } finally {
    connection.release();
  }
};

export const createTravel = async (req, res) => {
  let connection;
  try {
    const pool = getHR201Pool();
    connection = await pool.getConnection();
    const { employees = [], purpose, traveldestination, dates = [], isportal = 0 } = req.body || {};
    if (!Array.isArray(employees) || employees.length === 0 || !purpose || !traveldestination || !Array.isArray(dates) || dates.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'employees[], purpose, traveldestination, dates[] required' });
    }

    const userId = req.user?.USERID || null;
    let createdByObjId = null;
    if (userId) {
      try {
        const [creatorRows] = await connection.execute(
          'SELECT objid FROM employees WHERE dtruserid = ? LIMIT 1',
          [userId]
        );
        if (creatorRows.length) {
          createdByObjId = creatorRows[0].objid;
        }
      } catch (lookupErr) {
        console.warn('Failed to resolve creator objid for travel:', lookupErr.message);
      }
    }

    const objid = uuidv4();
    const travelno = await generateTravelNo(connection);
    const travelstatus = 'For Approval';
    const isPortalRequest = req.isPortal === true || req.authMethod === 'portal';
    const isPortalValue = isPortalRequest ? 1 : (isportal ? 1 : 0);
    let createdByValue = createdByObjId || userId;
    if (isPortalRequest) {
      createdByValue = userId != null ? Number(userId) : null;
    }

    await connection.execute(
      `INSERT INTO employee_travels (objid, travelno, purpose, traveldestination, createdby, createddate, travelstatus, isportal)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        objid,
        travelno,
        purpose,
        traveldestination,
        createdByValue,
        travelstatus,
        isPortalValue
      ]
    );

    // Create cartesian product: employees × dates
    for (const emp_objid of employees) {
      for (const d of dates) {
        await connection.execute(
          `INSERT INTO employee_travels_dates (objid, travel_objid, emp_objid, traveldate) VALUES (?, ?, ?, ?)`,
          [uuidv4(), objid, emp_objid, `${d} 00:00:00`]
        );
      }
    }
    connection.release();
    
    // Notify all employees about new travel record
    for (const emp_objid of employees) {
      changeNotificationService.notifyEmployee(
        emp_objid,
        'travel',
        'created',
        { travelId: objid, travelno }
      );
    }
    
    res.status(201).json({ success: true, data: { objid, travelno } });
  } catch (e) {
    console.error('Create travel error:', e);
    if (connection) connection.release();
    res.status(500).json({ success: false, message: 'Failed to create travel', error: e.message });
  }
};

export const addTravelDates = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const { travel_objid } = req.params;
    const { employees = [], dates = [] } = req.body || {};
    if (!travel_objid || !Array.isArray(employees) || employees.length === 0 || !Array.isArray(dates) || dates.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'travel_objid, employees[], and dates[] required' });
    }
    // Create cartesian product: employees × dates
    for (const emp_objid of employees) {
      for (const d of dates) {
        await connection.execute(
          `INSERT INTO employee_travels_dates (objid, travel_objid, emp_objid, traveldate) VALUES (?, ?, ?, ?)`,
          [uuidv4(), travel_objid, emp_objid, `${d} 00:00:00`]
        );
      }
    }
    connection.release();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to add travel dates', error: e.message });
  }
};

export const listTransactions = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const { dateFrom, dateTo, status, createdBy, participant } = req.query;
    
    let sql = `
      SELECT t.*,
             GROUP_CONCAT(DISTINCT CONCAT(e.objid, ':', e.surname, ', ', e.firstname, ' ', COALESCE(e.middlename, ''), ':', COALESCE(em.photo_path, '')) SEPARATOR '|') AS employees_data,
             GROUP_CONCAT(DISTINCT DATE_FORMAT(d.traveldate, '%m/%d/%Y') ORDER BY d.traveldate SEPARATOR ', ') AS travel_dates,
             su.photo AS created_by_photo_blob,
             su.username AS created_by_username,
             c.surname AS created_by_surname,
             c.firstname AS created_by_firstname,
             c.middlename AS created_by_middlename
      FROM employee_travels t
      LEFT JOIN employee_travels_dates d ON d.travel_objid = t.objid
      LEFT JOIN employees e ON e.objid = d.emp_objid
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      LEFT JOIN sysusers su ON t.createdby = su.id
      LEFT JOIN employees c ON c.objid = su.emp_objid
      WHERE 1=1
    `;
    const params = [];
    
    if (dateFrom) {
      sql += ` AND DATE(d.traveldate) >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND DATE(d.traveldate) <= ?`;
      params.push(dateTo);
    }
    if (status && status !== 'All') {
      const normalizedStatus = normalizeTravelStatus(status);
      sql += ` AND travelstatus = ?`;
      params.push(normalizedStatus);
    }
    if (createdBy) {
      const createdByIsUuid = typeof createdBy === 'string' && createdBy.includes('-');
      if (createdByIsUuid) {
        sql += ` AND t.createdby = ?`;
        params.push(createdBy);
      } else {
        sql += ` AND (t.createdby = ? OR EXISTS (SELECT 1 FROM employees ecb WHERE ecb.objid = t.createdby AND ecb.dtruserid = ?))`;
        params.push(createdBy);
        params.push(createdBy);
      }
    }
    if (participant) {
      sql += ` AND (
        t.createdby = ?
        OR EXISTS (
          SELECT 1
          FROM employee_travels_dates ed
          LEFT JOIN employees ep ON ep.objid = ed.emp_objid
          WHERE ed.travel_objid = t.objid
            AND (ed.emp_objid = ? OR ep.dtruserid = ?)
        )
      )`;
      params.push(participant);
      params.push(participant);
      params.push(participant);
    }
    
    sql += ` GROUP BY t.objid ORDER BY t.createddate DESC`;
    
    const [rows] = await connection.execute(sql, params);
    connection.release();
    const data = await mapTransactionRows(rows);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to load transactions', error: e.message });
  }
};

export const updateTravel = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const id = req.params.id;
    const { purpose, traveldestination, travelstatus, employees, dates, isportal } = req.body || {};
    const updates = [];
    const params = [];
    const normalizedTravelStatus = travelstatus !== undefined ? normalizeTravelStatus(travelstatus) : undefined;
    if (purpose !== undefined) { updates.push('purpose = ?'); params.push(purpose); }
    if (traveldestination !== undefined) { updates.push('traveldestination = ?'); params.push(traveldestination); }
    if (normalizedTravelStatus !== undefined) {
      updates.push('travelstatus = ?'); params.push(normalizedTravelStatus);
      // If status is being set to "Approved", also set approvedby and approveddate
      if (normalizedTravelStatus === 'Approved') {
        updates.push('approvedby = ?'); params.push(req.user?.USERID || null);
        updates.push('approveddate = ?'); params.push(new Date());
      }
      // If status is being set to "Returned" or "Cancelled", set updatedby and updateddate
      if (normalizedTravelStatus === 'Returned' || normalizedTravelStatus === 'Cancelled') {
        updates.push('updatedby = ?'); params.push(req.user?.USERID || null);
        updates.push('updateddate = ?'); params.push(new Date());
      }
    }
    if (isportal !== undefined) { updates.push('isportal = ?'); params.push(isportal ? 1 : 0); }
    if (updates.length === 0 && !employees && !dates) {
      updates.push('updatedby = ?'); params.push(req.user?.USERID || null);
      updates.push('updateddate = ?'); params.push(new Date());
    } else if (updates.length > 0 && !updates.some(u => u.includes('updatedby'))) {
      updates.push('updatedby = ?'); params.push(req.user?.USERID || null);
      updates.push('updateddate = ?'); params.push(new Date());
    }
    
    // If employees or dates are being updated, delete and re-insert employee_travels_dates
    if ((employees && Array.isArray(employees) && employees.length > 0) || (dates && Array.isArray(dates) && dates.length > 0)) {
      // Get current employees/dates before deleting
      let finalEmployees = employees;
      let finalDates = dates;
      
      if (!finalEmployees || finalEmployees.length === 0) {
        // Get existing employees from dates
        const [existingEmps] = await connection.execute(
          'SELECT DISTINCT emp_objid FROM employee_travels_dates WHERE travel_objid = ?',
          [id]
        );
        finalEmployees = existingEmps.map(r => r.emp_objid);
      }
      
      if (!finalDates || finalDates.length === 0) {
        // Get existing dates
        const [existingDates] = await connection.execute(
          'SELECT DISTINCT DATE_FORMAT(traveldate, "%Y-%m-%d") as date_str FROM employee_travels_dates WHERE travel_objid = ?',
          [id]
        );
        finalDates = existingDates.map(r => r.date_str);
      }
      
      // Delete existing dates
      await connection.execute('DELETE FROM employee_travels_dates WHERE travel_objid = ?', [id]);
      
      // Re-insert with cartesian product
      if (finalEmployees.length > 0 && finalDates.length > 0) {
        for (const emp_objid of finalEmployees) {
          for (const d of finalDates) {
            await connection.execute(
              `INSERT INTO employee_travels_dates (objid, travel_objid, emp_objid, traveldate) VALUES (?, ?, ?, ?)`,
              [uuidv4(), id, emp_objid, `${d} 00:00:00`]
            );
          }
        }
      }
    }
    
    if (updates.length > 0) {
      params.push(id);
      const sql = `UPDATE employee_travels SET ${updates.join(', ')} WHERE objid = ?`;
      const [result] = await connection.execute(sql, params);
      if (result.affectedRows === 0) {
        connection.release();
        return res.status(404).json({ success: false, message: 'Travel not found' });
      }
    }
    
    // Get all employees associated with this travel to notify them
    const [empRows] = await connection.execute(
      'SELECT DISTINCT emp_objid FROM employee_travels_dates WHERE travel_objid = ?',
      [id]
    );
    
    connection.release();
    
    // Notify all employees about updated travel record
    for (const row of empRows) {
      changeNotificationService.notifyEmployee(
        row.emp_objid,
        'travel',
        'updated',
        { travelId: id }
      );
    }
    
    res.json({ success: true });
  } catch (e) {
    connection.release();
    res.status(500).json({ success: false, message: 'Failed to update travel', error: e.message });
  }
};

export const deleteTravel = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const id = req.params.id;
    
    // Get all employees associated with this travel before deleting
    const [empRows] = await connection.execute(
      'SELECT DISTINCT emp_objid FROM employee_travels_dates WHERE travel_objid = ?',
      [id]
    );
    
    await connection.execute('DELETE FROM employee_travels_dates WHERE travel_objid = ?', [id]);
    const [result] = await connection.execute('DELETE FROM employee_travels WHERE objid = ?', [id]);
    connection.release();
    
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Travel not found' });
    
    // Notify all employees about deleted travel record
    for (const row of empRows) {
      changeNotificationService.notifyEmployee(
        row.emp_objid,
        'travel',
        'deleted',
        { travelId: id }
      );
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete travel', error: e.message });
  }
};

export const listMyTravels = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    const userId = req.user?.USERID;
    console.log('[listMyTravels] userId from token:', userId);
    if (!userId) {
      connection.release();
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const [empRows] = await connection.execute(
      'SELECT objid, dtruserid FROM employees WHERE dtruserid = ? LIMIT 1',
      [userId]
    );

    console.log('[listMyTravels] HR201 employee query result:', empRows);

    if (!empRows.length) {
      connection.release();
      console.warn('[listMyTravels] No HR201 employee found for dtruserid:', userId);
      return res.json({ success: true, data: [] });
    }

    const participantObjId = empRows[0].objid;
    const participantDtrId = empRows[0].dtruserid;
    console.log('[listMyTravels] Using objid/dtruserid:', participantObjId, participantDtrId);

    const sql = `
      SELECT t.*,
             GROUP_CONCAT(DISTINCT CONCAT(e.objid, ':', e.surname, ', ', e.firstname, ' ', COALESCE(e.middlename, ''), ':', COALESCE(em.photo_path, '')) SEPARATOR '|') AS employees_data,
             GROUP_CONCAT(DISTINCT DATE_FORMAT(d.traveldate, '%m/%d/%Y') ORDER BY d.traveldate SEPARATOR ', ') AS travel_dates,
             su.photo AS created_by_photo_blob,
             su.username AS created_by_username,
             c.surname AS created_by_surname,
             c.firstname AS created_by_firstname,
             c.middlename AS created_by_middlename
      FROM employee_travels t
      LEFT JOIN employee_travels_dates d ON d.travel_objid = t.objid
      LEFT JOIN employees e ON e.objid = d.emp_objid
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      LEFT JOIN sysusers su ON t.createdby = su.id
      LEFT JOIN employees c ON c.objid = su.emp_objid
      WHERE (
        t.createdby = ?
        OR t.createdby = ?
        OR EXISTS (
          SELECT 1
          FROM employee_travels_dates ed
          LEFT JOIN employees e2 ON e2.objid = ed.emp_objid
          WHERE ed.travel_objid = t.objid
            AND (ed.emp_objid = ? OR e2.dtruserid = ?)
        )
      )
      GROUP BY t.objid
      ORDER BY t.createddate DESC
    `;
    const [rows] = await connection.execute(sql, [participantObjId, participantDtrId, participantObjId, participantDtrId]);
    console.log('[listMyTravels] Raw travel rows count:', rows.length);
    connection.release();
    const data = await mapTransactionRows(rows);
    console.log('[listMyTravels] Mapped travel rows count:', data.length);
    res.json({ success: true, data });
  } catch (e) {
    console.error('List my travels error:', e);
    res.status(500).json({ success: false, message: 'Failed to load my travels', error: e.message });
  }
};

const normalizeTravelStatus = (value) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'PENDING') {
    return 'For Approval';
  }
  return trimmed;
};


