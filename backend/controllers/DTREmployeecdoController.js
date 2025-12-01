import { getHR201Pool } from '../config/hr201Database.js';
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

const generateCDONo = async (connection) => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${yyyy}${mm}${dd}DO-`;

  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS cnt FROM employee_cdo WHERE DATE(createddate) = ?',
    [`${yyyy}-${mm}-${dd}`]
  );

  const seq = Number(rows?.[0]?.cnt || 0) + 1;
  const seqStr = String(seq).padStart(3, '0');
  return `${prefix}${seqStr}`;
};

// Use centralized name formatter - formatEmployeeNameUtil is imported at the top
const formatEmployeeName = formatEmployeeNameUtil;

const normalizeStatus = (value) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'PENDING') {
    return 'For Approval';
  }
  return trimmed;
};
const normalizeStatusUpper = (value) => normalizeStatus(value).toUpperCase();

export const listCdo = async (req, res) => {
  let connection;
  try {
    const { status, title, dateFrom, dateTo, scope, emp_objid: queryEmpObjid } = req.query || {};

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
      `SELECT *
       FROM employee_cdo
       ORDER BY createddate DESC`
    );

    const filters = [];
    if (employeeObjIdFilter) {
      filters.push((row) => String(row.emp_objid) === String(employeeObjIdFilter));
    }
    if (status && status !== 'All') {
      const statusUpper = normalizeStatusUpper(status);
      filters.push((row) => normalizeStatusUpper(row.cdostatus) === statusUpper);
    }
    if (title && title.trim()) {
      const titleLower = title.toLowerCase();
      filters.push((row) => (row.cdotitle || '').toLowerCase().includes(titleLower));
    }
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      if (!Number.isNaN(fromTime)) {
        filters.push((row) => {
          const createdTime = new Date(row.createddate || row.createdDate || row.created_date || '').getTime();
          return !Number.isNaN(createdTime) && createdTime >= fromTime;
        });
      }
    }
    if (dateTo) {
      const toTime = new Date(dateTo).getTime();
      if (!Number.isNaN(toTime)) {
        filters.push((row) => {
          const createdTime = new Date(row.createddate || row.createdDate || row.created_date || '').getTime();
          return !Number.isNaN(createdTime) && createdTime <= toTime;
        });
      }
    }

    const filteredRows = filters.length ? rows.filter((row) => filters.every((fn) => fn(row))) : rows;

    const cdoIds = filteredRows.map((row) => row.id).filter(Boolean);
    const employeeIds = [...new Set(filteredRows.map((row) => row.emp_objid).filter(Boolean))];

    const employeeMap = new Map();
    if (employeeIds.length) {
      const [employeeRows] = await connection.query(
        `SELECT e.objid, e.surname, e.firstname, em.photo_path
     FROM employees e
     LEFT JOIN employees_media em ON em.emp_objid = e.objid
         WHERE e.objid IN (?)`,
        [employeeIds]
  );
      for (const emp of employeeRows) {
  let photo = null;
        if (emp.photo_path) {
    try {
            // photo_path is now INT (pathid), requires objid and type
            photo = await readMediaAsBase64(emp.photo_path, emp.objid, 'photo');
    } catch (error) {
            console.warn('Failed to read employee photo:', emp.objid, error.message);
      photo = null;
    }
  }
        employeeMap.set(emp.objid, {
          name: formatEmployeeName(emp.surname, emp.firstname, null),
          photo,
        });
      }
    }

    let usedRows = [];
    if (cdoIds.length) {
      const [usedRowsResult] = await connection.query(
        `SELECT ud.*, DATE_FORMAT(ud.cdodate, '%Y-%m-%d') AS formatted_cdodate
         FROM employee_cdo_usedates ud
         WHERE ud.cdo_id IN (?)
         ORDER BY ud.cdodate ASC`,
        [cdoIds]
      );
      usedRows = usedRowsResult;
    }

    const creatorIdSet = new Set();
    filteredRows.forEach((row) => {
      if (Number(row.isportal) === 0 && row.createdby) {
        creatorIdSet.add(row.createdby);
      }
    });
    usedRows.forEach((row) => {
      if (Number(row.isportal) === 0 && row.createdby) {
        creatorIdSet.add(row.createdby);
      }
    });

    const creatorMap = new Map();
    if (creatorIdSet.size) {
      const [creatorRows] = await connection.query(
        `SELECT su.id, su.username, su.photo,
                emp.surname, emp.firstname
         FROM sysusers su
         LEFT JOIN employees emp ON emp.objid = su.emp_objid
         WHERE su.id IN (?)`,
        [[...creatorIdSet]]
      );
      for (const creator of creatorRows) {
        const name = formatEmployeeName(creator.surname, creator.firstname, null) || creator.username || null;
        let photo = null;
        if (creator.photo) {
          if (typeof creator.photo === 'string' && creator.photo.startsWith('data:')) {
            photo = creator.photo;
          } else if (Buffer.isBuffer(creator.photo)) {
            photo = `data:image/png;base64,${creator.photo.toString('base64')}`;
          }
        }
        creatorMap.set(creator.id, { name, photo });
      }
    }

    connection.release();

    const consumeEntriesByCdo = new Map();
    usedRows.forEach((used) => {
      const entries = consumeEntriesByCdo.get(used.cdo_id) || [];
      const creatorInfo = Number(used.isportal) === 0 ? creatorMap.get(used.createdby) || {} : {};
      entries.push({
        id: used.id,
        cdo_id: used.cdo_id,
        cdodate: used.formatted_cdodate,
        reason: used.reason,
        cdodateremarks: used.cdodateremarks,
        isportal: used.isportal,
        createdby: used.createdby,
        createddate: used.createddate,
        cdodatestatus: normalizeStatus(used.cdodatestatus),
        createdByName: Number(used.isportal) === 1 ? 'Portal' : creatorInfo.name || null,
        createdByPhoto: Number(used.isportal) === 1 ? null : creatorInfo.photo || null,
      });
      consumeEntriesByCdo.set(used.cdo_id, entries);
    });

    const data = filteredRows.map((row) => {
      const employeeInfo = employeeMap.get(row.emp_objid) || {};
      const creatorInfo = creatorMap.get(row.createdby) || {};
      const showCreator = Number(row.isportal) === 0;
      const earned = Number(row.earnedcredit) || 0;
      const used = Number(row.usedcredit) || 0;
      const expiryTime = row.expirydate ? new Date(row.expirydate).getTime() : null;
      const isExpired = expiryTime ? Date.now() > expiryTime : false;

      return {
        id: row.id,
        emp_objid: row.emp_objid,
        cdono: row.cdono,
        cdotitle: row.cdotitle,
        cdopurpose: row.cdopurpose,
        cdodescription: row.cdodescription,
        cdoremarks: row.cdoremarks,
        earnedcredit: earned,
        usedcredit: used,
        remainingCredits: isExpired ? 0 : Math.max(earned - used, 0),
        isconsume: row.isconsume || 0,
        isportal: row.isportal,
        createdby: row.createdby,
        createddate: row.createddate,
        expirydate: row.expirydate,
        cdostatus: normalizeStatus(row.cdostatus),
        approvedby: row.approvedby,
        approveddate: row.approveddate,
        updatedby: row.updatedby,
        updateddate: row.updateddate,
        employeeName: employeeInfo.name || null,
        employeePhoto: employeeInfo.photo || null,
        consumeEntries: consumeEntriesByCdo.get(row.id) || [],
        createdByName: showCreator ? creatorInfo.name || null : null,
        createdByPhoto: showCreator ? creatorInfo.photo || null : null,
        isExpired,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error listing CDO records:', error);
    res.status(500).json({ success: false, message: 'Failed to load CDO records', error: error.message });
  }
};

export const createCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const {
      emp_objid,
      cdotitle,
      cdopurpose,
      cdodescription,
      cdoremarks,
      earnedcredit,
      workdates = [],
    } = req.body || {};

    if (!emp_objid || !cdotitle || !cdopurpose) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Employee, title and purpose are required' });
    }

    const cdono = await generateCDONo(connection);
    const createddate = new Date();
    const expirydate = new Date(createddate.getFullYear(), 11, 31, 23, 59, 59, 999);
    const isPortal = req.isPortal ? 1 : 0;
    const createdByUserId = !isPortal ? req.user?.USERID || null : null;

    const [result] = await connection.execute(
      `INSERT INTO employee_cdo
       (emp_objid, cdono, cdotitle, cdopurpose, cdodescription, cdoremarks, earnedcredit, usedcredit, expirydate, isportal, createdby, createddate, cdostatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'For Approval')`,
      [
        emp_objid,
        cdono,
        cdotitle,
        cdopurpose,
        cdodescription || null,
        cdoremarks || null,
        Number(earnedcredit) || 0,
        expirydate,
        isPortal,
        createdByUserId,
        createddate,
      ]
    );

    const insertedId = result.insertId;

    if (Array.isArray(workdates) && workdates.length) {
      const workValues = workdates
        .map((d) => formatDate(d))
        .filter(Boolean)
        .map((date) => [insertedId, `${date} 00:00:00`]);
      if (workValues.length) {
        await connection.query('INSERT INTO employee_cdo_workdates (cdo_id, cdoworkdate) VALUES ?', [workValues]);
      }
    }

    connection.release();
    
    // Notify employee about new CDO record
    changeNotificationService.notifyEmployee(
      emp_objid,
      'cdo',
      'created',
      { cdoId: insertedId, cdonum: cdono }
    );
    
    res.status(201).json({ success: true, data: { id: insertedId, cdono }, message: 'CDO record created' });
  } catch (error) {
    connection.release();
    console.error('Error creating CDO:', error);
    res.status(500).json({ success: false, message: 'Failed to create CDO record', error: error.message });
  }
};

export const updateCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    
    // Get original emp_objid before updating (for notification purposes)
    const [existingRows] = await connection.execute(
      'SELECT emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
      [id]
    );
    const originalEmpObjId = existingRows.length > 0 ? existingRows[0].emp_objid : null;
    
    const {
      emp_objid,
      cdotitle,
      cdopurpose,
      cdodescription,
      cdoremarks,
      earnedcredit,
      workdates = [],
    } = req.body || {};

    const fields = [];
    const params = [];

    if (emp_objid !== undefined) {
      fields.push('emp_objid = ?');
      params.push(emp_objid);
    }
    if (cdotitle !== undefined) {
      fields.push('cdotitle = ?');
      params.push(cdotitle);
    }
    if (cdopurpose !== undefined) {
      fields.push('cdopurpose = ?');
      params.push(cdopurpose);
    }
    if (cdodescription !== undefined) {
      fields.push('cdodescription = ?');
      params.push(cdodescription);
    }
    if (cdoremarks !== undefined) {
      fields.push('cdoremarks = ?');
      params.push(cdoremarks);
    }
    if (earnedcredit !== undefined) {
      fields.push('earnedcredit = ?');
      params.push(Number(earnedcredit) || 0);
    }

    fields.push('updatedby = ?');
    params.push(req.user?.USERID || null);
    fields.push('updateddate = ?');
    params.push(new Date());

    if (!fields.length) {
      connection.release();
      return res.json({ success: true, message: 'No changes applied' });
    }

    params.push(id);
    const sql = `UPDATE employee_cdo SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await connection.execute(sql, params);

    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'CDO record not found' });
    }

    if (Array.isArray(workdates)) {
      await connection.execute('DELETE FROM employee_cdo_workdates WHERE cdo_id = ?', [id]);
      const workValues = workdates
        .map((d) => formatDate(d))
        .filter(Boolean)
        .map((date) => [id, `${date} 00:00:00`]);
      if (workValues.length) {
        await connection.query('INSERT INTO employee_cdo_workdates (cdo_id, cdoworkdate) VALUES ?', [workValues]);
      }
    }

    connection.release();
    
    // Notify employee about updated CDO record (use original emp_objid for notification)
    const notifyEmpObjId = originalEmpObjId || emp_objid;
    if (notifyEmpObjId) {
      changeNotificationService.notifyEmployee(
        notifyEmpObjId,
        'cdo',
        'updated',
        { cdoId: id }
      );
    }
    
    res.json({ success: true, message: 'CDO record updated' });
  } catch (error) {
    connection.release();
    console.error('Error updating CDO:', error);
    res.status(500).json({ success: false, message: 'Failed to update CDO record', error: error.message });
  }
};

export const updateCdoStatus = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    const { status } = req.body || {};
    if (!status) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const normalized = normalizeStatus(status);

    const [currentRows] = await connection.execute(
      'SELECT cdostatus, emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
      [id]
    );

    if (!currentRows.length) {
      connection.release();
      return res.status(404).json({ success: false, message: 'CDO record not found' });
    }

    const previousStatus = normalizeStatus(currentRows[0].cdostatus);

    if (previousStatus === normalized) {
      await connection.execute(
        'UPDATE employee_cdo SET updatedby = ?, updateddate = ? WHERE id = ?',
        [req.user?.USERID || null, new Date(), id]
      );
      connection.release();
      return res.json({ success: true, message: 'Status updated' });
    }

    const fields = ['cdostatus = ?'];
    const params = [normalized];

    if (normalized === 'Approved') {
      fields.push('approvedby = ?');
      fields.push('approveddate = ?');
      params.push(req.user?.USERID || null, new Date());
    }

    fields.push('updatedby = ?');
    fields.push('updateddate = ?');
    params.push(req.user?.USERID || null, new Date());
    params.push(id);

    const sql = `UPDATE employee_cdo SET ${fields.join(', ')} WHERE id = ?`;
    await connection.execute(sql, params);
    
    const emp_objid = currentRows[0].emp_objid;
    connection.release();
    
    // Notify employee about CDO status change
    if (emp_objid) {
      changeNotificationService.notifyEmployee(
        emp_objid,
        'cdo',
        'updated',
        { cdoId: id, status: normalized }
      );
    }
    
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    connection.release();
    console.error('Error updating CDO status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};

export const listUsedCdo = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT u.*, c.cdono AS cdono, c.cdotitle AS cdotitle, c.emp_objid,
              emp.surname AS emp_surname,
              emp.firstname AS emp_firstname,
              emp.middlename AS emp_middlename,
              DATE_FORMAT(u.cdodate, '%Y-%m-%d') AS cdodate_formatted,
              su.username AS createdby_username,
              empCreated.surname AS createdby_surname,
              empCreated.firstname AS createdby_firstname,
              empCreated.middlename AS createdby_middlename
       FROM employee_cdo_usedates u
       LEFT JOIN employee_cdo c ON c.id = u.cdo_id
       LEFT JOIN employees emp ON emp.objid = c.emp_objid
       LEFT JOIN sysusers su ON su.id = u.createdby
       LEFT JOIN employees empCreated ON empCreated.objid = su.emp_objid
       ORDER BY u.createddate DESC`
    );

    const result = rows.map((row) => ({
        id: row.id,
        cdo_id: row.cdo_id,
      cdono: row.cdono,
      cdotitle: row.cdotitle,
        emp_objid: row.emp_objid,
      employeeName: formatEmployeeName(row.emp_surname, row.emp_firstname, row.emp_middlename),
        reason: row.reason,
        cdodateremarks: row.cdodateremarks,
      cdodatestatus: normalizeStatus(row.cdodatestatus),
        cdodate: row.cdodate_formatted,
      createdby: row.createdby,
      createddate: row.createddate,
      createdByName:
        Number(row.isportal) === 0
          ? formatEmployeeName(row.createdby_surname, row.createdby_firstname, row.createdby_middlename) || row.createdby_username || null
          : null,
    }));

    connection.release();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error listing used CDO records:', error);
    res.status(500).json({ success: false, message: 'Failed to load used CDO records', error: error.message });
  }
};

export const createUsedCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const { cdo_id, reason, cdodateremarks, cdodates = [] } = req.body || {};
    if (!cdo_id || !reason) {
      connection.release();
      return res.status(400).json({ success: false, message: 'CDO reference and reason are required' });
    }

    const createddate = new Date();
    const datesArray = Array.isArray(cdodates) && cdodates.length ? cdodates : [req.body?.cdodate];
    const normalizedDates = (datesArray || [])
      .map((d) => formatDate(d))
      .filter(Boolean);

    if (!normalizedDates.length) {
      connection.release();
      return res.status(400).json({ success: false, message: 'At least one CDO date is required' });
    }

    const isPortal = req.isPortal ? 1 : 0;
    const createdByUserId = !isPortal ? req.user?.USERID || null : null;

    const insertValues = normalizedDates.map((date) => [
      cdo_id,
      `${date} 00:00:00`,
      reason,
      cdodateremarks || null,
      isPortal,
      createdByUserId,
      createddate,
    ]);

    await connection.query(
      `INSERT INTO employee_cdo_usedates (cdo_id, cdodate, reason, cdodateremarks, isportal, createdby, createddate, cdodatestatus)
       VALUES ?`,
      [insertValues]
    );

    // Get emp_objid from parent CDO
    const [cdoRows] = await connection.execute(
      'SELECT emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
      [cdo_id]
    );
    const emp_objid = cdoRows.length > 0 ? cdoRows[0].emp_objid : null;

    connection.release();
    
    // Notify employee about new used CDO record
    if (emp_objid) {
      changeNotificationService.notifyEmployee(
        emp_objid,
        'cdo',
        'created',
        { usedCdoId: cdo_id }
      );
    }
    
    res.status(201).json({ success: true, message: 'Used CDO record(s) created' });
  } catch (error) {
    connection.release();
    console.error('Error creating used CDO:', error);
    res.status(500).json({ success: false, message: 'Failed to create used CDO record', error: error.message });
  }
};

export const updateUsedCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    const { cdo_id, reason, cdodateremarks, cdodates = [] } = req.body || {};
    
    // Get emp_objid from parent CDO (use existing cdo_id or get from record)
    let targetCdoId = cdo_id;
    if (!targetCdoId) {
      const [existingRows] = await connection.execute(
        'SELECT cdo_id FROM employee_cdo_usedates WHERE id = ? LIMIT 1',
        [id]
      );
      if (existingRows.length > 0) {
        targetCdoId = existingRows[0].cdo_id;
      }
    }

    const fields = [];
    const params = [];

    if (cdo_id !== undefined) {
      fields.push('cdo_id = ?');
      params.push(cdo_id);
    }
    if (reason !== undefined) {
      fields.push('reason = ?');
      params.push(reason);
    }
    if (cdodateremarks !== undefined) {
      fields.push('cdodateremarks = ?');
      params.push(cdodateremarks);
    }
    fields.push('updatedby = ?');
    params.push(req.user?.USERID || null);
    fields.push('updateddate = ?');
    params.push(new Date());

    if (!fields.length) {
      connection.release();
      return res.json({ success: true, message: 'No changes applied' });
    }

    params.push(id);
    const sql = `UPDATE employee_cdo_usedates SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await connection.execute(sql, params);
    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Used CDO record not found' });
    }

    if (Array.isArray(cdodates) && cdodates.length) {
      const firstDate = formatDate(cdodates[0]);
      if (firstDate) {
        await connection.execute('UPDATE employee_cdo_usedates SET cdodate = ? WHERE id = ?', [`${firstDate} 00:00:00`, id]);
      }
    }

    // Get emp_objid from parent CDO
    const [cdoRows] = await connection.execute(
      'SELECT emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
      [targetCdoId]
    );
    const emp_objid = cdoRows.length > 0 ? cdoRows[0].emp_objid : null;

    connection.release();
    
    // Notify employee about updated used CDO record
    if (emp_objid) {
      changeNotificationService.notifyEmployee(
        emp_objid,
        'cdo',
        'updated',
        { usedCdoId: targetCdoId }
      );
    }
    
    res.json({ success: true, message: 'Used CDO record updated' });
  } catch (error) {
    connection.release();
    console.error('Error updating used CDO:', error);
    res.status(500).json({ success: false, message: 'Failed to update used CDO record', error: error.message });
  }
};

export const updateUsedCdoStatus = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    const { status } = req.body || {};
    if (!status) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const normalized = normalizeStatus(status);

    const [currentRows] = await connection.execute(
      'SELECT cdo_id, cdodatestatus FROM employee_cdo_usedates WHERE id = ? LIMIT 1',
      [id]
    );
    if (!currentRows.length) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Used CDO record not found' });
    }

    const currentRecord = currentRows[0];
    const previousStatus = normalizeStatus(currentRecord.cdodatestatus);

    if (previousStatus === normalized) {
      await connection.execute(
        `UPDATE employee_cdo_usedates SET updatedby = ?, updateddate = ? WHERE id = ?`,
        [req.user?.USERID || null, new Date(), id]
      );
      connection.release();
      return res.json({ success: true, message: 'Status updated' });
    }

    const [parentRows] = await connection.execute(
      'SELECT earnedcredit, usedcredit, emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
      [currentRecord.cdo_id]
    );
    if (!parentRows.length) {
    connection.release();
      return res.status(404).json({ success: false, message: 'Parent CDO record not found' });
    }

    let earnedcredit = Number(parentRows[0].earnedcredit) || 0;
    let usedcredit = Number(parentRows[0].usedcredit) || 0;

    const wasApproved = previousStatus === 'Approved';
    const willBeApproved = normalized === 'Approved';
    let delta = 0;
    if (!wasApproved && willBeApproved) {
      delta = 1;
    } else if (wasApproved && !willBeApproved) {
      delta = -1;
    }

    await connection.execute(
      `UPDATE employee_cdo_usedates SET cdodatestatus = ?, updatedby = ?, updateddate = ? WHERE id = ?`,
      [normalized, req.user?.USERID || null, new Date(), id]
    );

    let newUsedCredit = usedcredit;
    if (delta !== 0) {
      newUsedCredit = usedcredit + delta;
      if (newUsedCredit < 0) newUsedCredit = 0;
      if (newUsedCredit > earnedcredit) newUsedCredit = earnedcredit;
      const isconsume = newUsedCredit >= earnedcredit ? 1 : 0;
      await connection.execute(
        `UPDATE employee_cdo SET usedcredit = ?, isconsume = ?, updatedby = ?, updateddate = ? WHERE id = ?`,
        [newUsedCredit, isconsume, req.user?.USERID || null, new Date(), currentRecord.cdo_id]
      );
    } else if (!willBeApproved && usedcredit >= earnedcredit) {
      const isconsume = usedcredit >= earnedcredit ? 1 : 0;
      await connection.execute(
        `UPDATE employee_cdo SET isconsume = ?, updatedby = ?, updateddate = ? WHERE id = ?`,
        [isconsume, req.user?.USERID || null, new Date(), currentRecord.cdo_id]
      );
    }

    const emp_objid = parentRows.length > 0 ? parentRows[0].emp_objid : null;
    connection.release();
    
    // Notify employee about used CDO status change
    if (emp_objid) {
      changeNotificationService.notifyEmployee(
        emp_objid,
        'cdo',
        'updated',
        { usedCdoId: currentRecord.cdo_id, status: normalized }
      );
    }
    
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    connection.release();
    console.error('Error updating used CDO status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};

export const deleteUsedCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

    try {
    const id = req.params.id;
    const [existingRows] = await connection.execute(
      'SELECT cdo_id, cdodatestatus FROM employee_cdo_usedates WHERE id = ? LIMIT 1',
      [id]
    );

    if (!existingRows.length) {
    connection.release();
      return res.status(404).json({ success: false, message: 'Used CDO record not found' });
    }

    const existing = existingRows[0];

    // Get emp_objid from parent CDO before deleting
      const [parentRows] = await connection.execute(
      'SELECT earnedcredit, usedcredit, emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
        [existing.cdo_id]
      );
    const emp_objid = parentRows.length > 0 ? parentRows[0].emp_objid : null;
    
    await connection.execute('DELETE FROM employee_cdo_usedates WHERE id = ?', [id]);

    if ((existing.cdodatestatus || '').toUpperCase() === 'APPROVED') {
      if (parentRows.length) {
        const earned = Number(parentRows[0].earnedcredit) || 0;
        let used = Number(parentRows[0].usedcredit) || 0;
        used = Math.max(used - 1, 0);
        const isconsume = used >= earned ? 1 : 0;
        await connection.execute(
          'UPDATE employee_cdo SET usedcredit = ?, isconsume = ?, updatedby = ?, updateddate = ? WHERE id = ?',
          [used, isconsume, req.user?.USERID || null, new Date(), existing.cdo_id]
        );
      }
    }

    connection.release();
    
    // Notify employee about deleted used CDO record
    if (emp_objid) {
      changeNotificationService.notifyEmployee(
        emp_objid,
        'cdo',
        'deleted',
        { usedCdoId: existing.cdo_id }
      );
    }
    
    res.json({ success: true, message: 'Record deleted' });
  } catch (error) {
    connection.release();
    console.error('Error deleting used CDO record:', error);
    res.status(500).json({ success: false, message: 'Failed to delete record', error: error.message });
  }
};

export const deleteCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = req.params.id;
    if (!id) {
      connection.release();
      return res.status(400).json({ success: false, message: 'CDO id is required' });
    }

    // Get emp_objid before deleting
    const [existingRows] = await connection.execute(
      'SELECT emp_objid FROM employee_cdo WHERE id = ? LIMIT 1',
      [id]
    );
    const emp_objid = existingRows.length > 0 ? existingRows[0].emp_objid : null;

    await connection.execute('DELETE FROM employee_cdo_workdates WHERE cdo_id = ?', [id]);
    const [result] = await connection.execute('DELETE FROM employee_cdo WHERE id = ?', [id]);
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'CDO record not found' });
    }

    // Notify employee about deleted CDO record
    if (emp_objid) {
      console.log(`📢 [CDO] Notifying employee ${emp_objid} (type: ${typeof emp_objid}) about deleted CDO ${id}`);
      changeNotificationService.notifyEmployee(
        emp_objid,
        'cdo',
        'deleted',
        { cdoId: id }
      );
    } else {
      console.warn(`⚠️ [CDO] Cannot notify: emp_objid is null/undefined for deleted CDO ${id}`);
    }

    res.json({ success: true, message: 'CDO record deleted' });
  } catch (error) {
    connection.release();
    console.error('Error deleting CDO record:', error);
    res.status(500).json({ success: false, message: 'Failed to delete CDO record', error: error.message });
  }
};

export const consumeCdo = async (req, res) => {
  const pool = getHR201Pool();
  const connection = await pool.getConnection();

  try {
    const id = Number(req.params.id);
    const { dates = [], reason = '', cdodateremarks = '' } = req.body || {};

    if (!id) {
      connection.release();
      return res.status(400).json({ success: false, message: 'CDO id is required' });
    }

    if (!Array.isArray(dates) || dates.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'At least one consume date is required' });
    }

    if (!reason || !reason.trim()) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const [cdoRows] = await connection.execute(
      'SELECT earnedcredit, usedcredit, isconsume, cdostatus, expirydate FROM employee_cdo WHERE id = ? LIMIT 1',
      [id]
    );

    if (!cdoRows.length) {
      connection.release();
      return res.status(404).json({ success: false, message: 'CDO record not found' });
    }

    const cdo = cdoRows[0];
    if (cdo.expirydate) {
      const expiryTime = new Date(cdo.expirydate).getTime();
      if (!Number.isNaN(expiryTime) && Date.now() > expiryTime) {
        await connection.execute(
          'UPDATE employee_cdo SET isconsume = 1, updatedby = ?, updateddate = ? WHERE id = ?',
          [req.user?.USERID || null, new Date(), id]
        );
        connection.release();
        return res.status(400).json({ success: false, message: 'This CDO credit has expired and can no longer be used.' });
      }
    }

    if ((cdo.cdostatus || '').toUpperCase() !== 'APPROVED') {
      connection.release();
      return res.status(400).json({ success: false, message: 'Only approved CDO credits can be consumed' });
    }

    const [pendingRows] = await connection.execute(
      `SELECT COUNT(*) AS pendingCount
       FROM employee_cdo_usedates
       WHERE cdo_id = ? AND cdodatestatus = 'For Approval'`,
      [id]
    );
    const pendingCount = Number(pendingRows?.[0]?.pendingCount || 0);

    const earned = Number(cdo.earnedcredit) || 0;
    const approvedUsed = Number(cdo.usedcredit) || 0;
    const remaining = Math.max(earned - approvedUsed - pendingCount, 0);

    if (remaining <= 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'No remaining credits available to consume' });
    }

    const normaliseIncomingDate = (value) => {
      if (!value) return null;
      if (value instanceof Date) {
        return formatDate(value);
      }
      if (typeof value === 'string') {
        const direct = new Date(value);
        if (!Number.isNaN(direct.getTime())) {
          return formatDate(direct);
        }
        const parts = value.split('-').map((part) => Number(part));
        if (parts.length === 3 && parts.every((num) => !Number.isNaN(num))) {
          const [year, month, day] = parts;
          const candidate = new Date(year, month - 1, day);
          return formatDate(candidate);
        }
      }
      return null;
    };

    const uniqueDates = Array.from(
      new Set(
        dates
          .map((value) => normaliseIncomingDate(value))
          .filter(Boolean)
      )
    ).sort();

    if (!uniqueDates.length) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Invalid consume dates' });
    }

    if (uniqueDates.length > remaining) {
      connection.release();
      return res.status(400).json({ success: false, message: `Only ${remaining} credit(s) remain for this CDO.` });
    }

    const [existingDateRows] = await connection.execute(
      `SELECT DATE_FORMAT(cdodate, '%Y-%m-%d') AS cdodate_fmt
       FROM employee_cdo_usedates
       WHERE cdo_id = ?`,
      [id]
    );
    const existingDateSet = new Set(existingDateRows.map((row) => row.cdodate_fmt));
    const filteredDates = uniqueDates.filter((date) => !existingDateSet.has(date));

    if (!filteredDates.length) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Consume dates already exist for this CDO.' });
    }

    const createddate = new Date();
    const isPortal = req.isPortal ? 1 : 0;
    const createdByUserId = !isPortal ? req.user?.USERID || null : null;
    const values = filteredDates.map((date) => [
      id,
      `${date} 00:00:00`,
      reason.trim(),
      cdodateremarks || null,
      isPortal,
      createdByUserId,
      createddate,
      'For Approval',
    ]);

    await connection.query(
      `INSERT INTO employee_cdo_usedates (cdo_id, cdodate, reason, cdodateremarks, isportal, createdby, createddate, cdodatestatus)
       VALUES ?`,
      [values]
    );

    connection.release();
    res.status(201).json({ success: true, data: { count: values.length } });
  } catch (error) {
    if (connection) connection.release();
    console.error('Error consuming CDO credits:', error);
    res.status(500).json({ success: false, message: 'Failed to consume CDO credits', error: error.message });
  }
};

