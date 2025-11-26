import { getHR201Pool } from '../config/hr201Database.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

const sanitizePinValue = (pin, fallback = '1234') => {
  const fallbackString = fallback !== undefined && fallback !== null ? String(fallback) : '1234';
  const raw = pin !== undefined && pin !== null ? String(pin) : '';
  const cleaned = raw.replace(/\D/g, '').slice(0, 6);
  const candidate = cleaned || fallbackString.replace(/\D/g, '').slice(0, 6);
  if (!candidate) {
    return '1234';
  }
  if (candidate.length < 4) {
    const fallbackCandidate = fallbackString.replace(/\D/g, '').slice(0, 6);
    return fallbackCandidate && fallbackCandidate.length >= 4 ? fallbackCandidate : '1234';
  }
  return candidate;
};

const sanitizeStatusValue = (status, fallback = 1) => {
  if (status === undefined || status === null || status === '') {
    return fallback;
  }
  return Number(status) === 1 ? 1 : 0;
};

const buildSearchFilter = (search) => {
  if (!search || !search.trim()) {
    return { clause: '', params: [] };
  }
  const like = `%${search.trim()}%`;
  const clause = `
    (
      sp.dtrname LIKE ?
      OR sp.username LIKE ?
      OR sp.emailaddress LIKE ?
      OR CAST(sp.dtruserid AS CHAR) LIKE ?
      OR e.surname LIKE ?
      OR e.firstname LIKE ?
      OR e.middlename LIKE ?
    )
  `;
  return { clause, params: [like, like, like, like, like, like, like] };
};

const buildStatusFilter = (statusFilter) => {
  if (!statusFilter || statusFilter === 'all') {
    return { clause: '', params: [] };
  }
  if (statusFilter === 'active') {
    return { clause: 'sp.status = 1', params: [] };
  }
  if (statusFilter === 'inactive') {
    return { clause: 'sp.status = 0', params: [] };
  }
  return { clause: '', params: [] };
};

const augmentPortalRows = async (rows = []) => {
  const augmented = [];
  for (const row of rows) {
    let photo = null;
    if (row.employee_photo_path) {
      try {
        photo = await readMediaAsBase64(row.employee_photo_path);
      } catch (error) {
        console.warn('[PortalEmployeeUsers] Failed to read photo:', row.employee_photo_path, error);
      }
    }

    let createdByPhoto = null;
    if (row.created_by_photo_path) {
      try {
        createdByPhoto = await readMediaAsBase64(row.created_by_photo_path);
      } catch (error) {
        console.warn('[PortalEmployeeUsers] Failed to read created-by photo:', row.created_by_photo_path, error);
      }
    } else if (row.created_by_photo_blob) {
      try {
        const blob = Buffer.isBuffer(row.created_by_photo_blob)
          ? row.created_by_photo_blob
          : Buffer.from(row.created_by_photo_blob);
        if (blob.length > 0) {
          createdByPhoto = `data:image/png;base64,${blob.toString('base64')}`;
        }
      } catch (error) {
        console.warn('[PortalEmployeeUsers] Failed to convert created-by photo blob:', error);
      }
    }

    augmented.push({
      ...row,
      photo,
      created_by_name: formatEmployeeName(row.created_by_surname, row.created_by_firstname, row.created_by_middlename) || row.created_by_username || null,
      created_by_photo: createdByPhoto
    });
  }
  return augmented;
};

const listPortalEmployeeUsers = async (req, res) => {
  try {
    const hr201Pool = getHR201Pool();
    const limitParam = Math.max(parseInt(req.query.limit, 10) || 0, 0);
    const search = req.query.search || '';
    const statusFilter = req.query.status || 'all';

    const searchFilter = buildSearchFilter(search);
    const statusFilterClause = buildStatusFilter(statusFilter);

    const whereParts = [];
    const params = [];

    if (searchFilter.clause) {
      whereParts.push(searchFilter.clause);
      params.push(...searchFilter.params);
    }

    if (statusFilterClause.clause) {
      whereParts.push(statusFilterClause.clause);
    }

    let whereClause = '';
    if (whereParts.length > 0) {
      whereClause = `WHERE ${whereParts.join(' AND ')}`;
    }

    const dataQuery = `
      SELECT
        sp.userportalid,
        sp.emp_objid,
        sp.dtruserid,
        sp.dtrname,
        sp.username,
        sp.pin,
        sp.emailaddress,
        sp.status,
        sp.createdby,
        sp.createddate,
        sp.updateddate,
        e.surname,
        e.firstname,
        e.middlename,
        e.dtruserid AS employee_dtruserid,
        em.photo_path AS employee_photo_path,
        su.username AS created_by_username,
        su.photo AS created_by_photo_blob,
        empCreator.surname AS created_by_surname,
        empCreator.firstname AS created_by_firstname,
        empCreator.middlename AS created_by_middlename,
        emCreator.photo_path AS created_by_photo_path
      FROM sysusers_portal sp
      LEFT JOIN employees e ON e.objid = sp.emp_objid
      LEFT JOIN employees_media em ON em.emp_objid = e.objid
      LEFT JOIN sysusers su ON su.id = sp.createdby
      LEFT JOIN employees empCreator ON empCreator.objid = su.emp_objid
      LEFT JOIN employees_media emCreator ON emCreator.emp_objid = empCreator.objid
      ${whereClause}
      ORDER BY sp.createddate DESC
    `;

    const [rows] = await hr201Pool.query(dataQuery, params);
    const baseRows = limitParam > 0 ? rows.slice(0, limitParam) : rows;
    const users = await augmentPortalRows(baseRows);
    const total = users.length;

    res.json({
      success: true,
      data: {
        users,
        total
      }
    });
  } catch (error) {
    console.error('[PortalEmployeeUsers] Failed to list portal users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve portal user records.'
    });
  }
};

const createPortalEmployeeUser = async (req, res) => {
  try {
    const {
      dtruserid,
      dtrname,
      username,
      pin,
      emailaddress,
      status,
      emp_objid
    } = req.body || {};

    if (!dtruserid) {
      return res.status(400).json({ success: false, message: 'DTR ID is required.' });
    }

    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    const hr201Pool = getHR201Pool();
    const numericDtrId = Number(String(dtruserid).replace(/\D/g, ''));
    if (Number.isNaN(numericDtrId)) {
      return res.status(400).json({ success: false, message: 'DTR ID must be numeric.' });
    }

    const [existing] = await hr201Pool.query(
      'SELECT userportalid FROM sysusers_portal WHERE dtruserid = ? LIMIT 1',
      [numericDtrId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Portal user already exists for this DTR ID.' });
    }

    const pinValue = sanitizePinValue(pin, 1234);
    if (pinValue.length < 4 || pinValue.length > 6) {
      return res.status(400).json({ success: false, message: 'PIN must be between 4 and 6 digits.' });
    }
    const statusValue = sanitizeStatusValue(status, 1);
    const createdBy = req.user?.id || req.user?.userid || req.user?.USERID || null;

    const [result] = await hr201Pool.query(
      `INSERT INTO sysusers_portal
        (emp_objid, dtruserid, dtrname, username, pin, emailaddress, status, createdby, createddate, updateddate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        emp_objid || null,
        numericDtrId,
        dtrname || '',
        username || null,
        pinValue,
        emailaddress || null,
        statusValue,
        createdBy
      ]
    );

    res.json({
      success: true,
      data: {
        userportalid: result.insertId
      }
    });
  } catch (error) {
    console.error('[PortalEmployeeUsers] Failed to create portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to create portal user.' });
  }
};

const updatePortalEmployeeUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      dtruserid,
      dtrname,
      username,
      pin,
      emailaddress,
      status,
      emp_objid
    } = req.body || {};

    const hr201Pool = getHR201Pool();
    const [existingRows] = await hr201Pool.query(
      'SELECT userportalid, pin, status, dtruserid FROM sysusers_portal WHERE userportalid = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Portal user not found.' });
    }

    const existing = existingRows[0];
    const numericDtrId = dtruserid
      ? Number(String(dtruserid).replace(/\D/g, ''))
      : existing.dtruserid;

    if (!numericDtrId || Number.isNaN(numericDtrId)) {
      return res.status(400).json({ success: false, message: 'DTR ID must be numeric.' });
    }

    const pinValue = sanitizePinValue(pin, existing.pin || 1234);
    if (pinValue.length < 4 || pinValue.length > 6) {
      return res.status(400).json({ success: false, message: 'PIN must be between 4 and 6 digits.' });
    }
    const statusValue = sanitizeStatusValue(status, existing.status);

    await hr201Pool.query(
      `UPDATE sysusers_portal
       SET dtruserid = ?, dtrname = ?, username = ?, pin = ?, emailaddress = ?, status = ?, emp_objid = ?, updateddate = NOW()
       WHERE userportalid = ?`,
      [
        numericDtrId,
        dtrname || '',
        username || null,
        pinValue,
        emailaddress || null,
        statusValue,
        emp_objid || null,
        id
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[PortalEmployeeUsers] Failed to update portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to update portal user.' });
  }
};

const deletePortalEmployeeUser = async (req, res) => {
  try {
    const { id } = req.params;
    const hr201Pool = getHR201Pool();
    const [existingRows] = await hr201Pool.query(
      'SELECT userportalid FROM sysusers_portal WHERE userportalid = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Portal user not found.' });
    }

    await hr201Pool.query('DELETE FROM sysusers_portal WHERE userportalid = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[PortalEmployeeUsers] Failed to delete portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to delete portal user.' });
  }
};

const resetPortalEmployeeUserPin = async (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body || {};
    const hr201Pool = getHR201Pool();

    const [existingRows] = await hr201Pool.query(
      'SELECT pin FROM sysusers_portal WHERE userportalid = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Portal user not found.' });
    }

    const rawPin = pin !== undefined && pin !== null ? String(pin) : '';
    const normalizedPin = rawPin.replace(/\D/g, '');

    if (!normalizedPin) {
      return res.status(400).json({ success: false, message: 'New PIN is required.' });
    }

    const pinValue = sanitizePinValue(normalizedPin, existingRows[0].pin || '1234');
    if (pinValue.length < 4 || pinValue.length > 6) {
      return res.status(400).json({ success: false, message: 'PIN must be between 4 and 6 digits.' });
    }

    await hr201Pool.query(
      'UPDATE sysusers_portal SET pin = ?, updateddate = NOW() WHERE userportalid = ?',
      [pinValue, id]
    );

    res.json({ success: true, message: 'Portal user PIN has been reset.' });
  } catch (error) {
    console.error('[PortalEmployeeUsers] Failed to reset portal user PIN:', error);
    res.status(500).json({ success: false, message: 'Failed to reset portal user PIN.' });
  }
};

export {
  listPortalEmployeeUsers,
  createPortalEmployeeUser,
  updatePortalEmployeeUser,
  deletePortalEmployeeUser,
  resetPortalEmployeeUserPin
};

