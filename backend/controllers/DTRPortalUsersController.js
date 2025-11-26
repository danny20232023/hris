import { getDb } from '../config/db.js';
import { getHR201Pool } from '../config/hr201Database.js';
import sql from 'mssql';
import multer from 'multer';
import { encryptPassword, decryptPassword } from '../utils/passwordUtils.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Extracts "HH:mm" from "YYYY-MM-DD HH:mm:ss" or returns as-is if already "HH:mm"
const getTimeOnly = (value) => {
  if (!value) return '-';
  // If already "HH:mm"
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  // If "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm"
  const match = value.match(/\b(\d{2}:\d{2})/);
  return match ? match[1] : value;
};

const PORTAL_DEFAULTS = {
  PORTAL_REGISTERED: false,
  PORTAL_STATUS: 0,
  PORTAL_USERNAME: null,
  PORTAL_EMAIL: null,
  PORTAL_PIN: null,
  PORTAL_USERPORTALID: null,
  PORTAL_CREATEDDATE: null,
  PORTAL_UPDATEDDATE: null,
  PORTAL_EMP_OBJID: null,
  portalUsername: null
};

const mapEmployeePhoto = (employee) => {
  if (!employee) return employee;
  if (!employee.PHOTO) {
    return employee;
  }

  try {
    const base64Photo = Buffer.from(employee.PHOTO).toString('base64');
    return {
      ...employee,
      PHOTO: `data:image/jpeg;base64,${base64Photo}`
    };
  } catch (error) {
    console.warn('Error converting photo for employee:', employee.USERID, error);
    return {
      ...employee,
      PHOTO: null
    };
  }
};

const normalizePortalRow = (row = {}) => {
  const trimmedId = row.dtruserid !== undefined && row.dtruserid !== null
    ? String(row.dtruserid).trim()
    : '';

  return {
    userportalid: row.userportalid ?? row.USERPORTALID ?? null,
    dtruserid: trimmedId,
    dtruseridNumber: trimmedId ? Number(trimmedId) : NaN,
    username: row.username ?? row.USERNAME ?? null,
    emailaddress: row.emailaddress ?? row.EMAILADDRESS ?? null,
    status: row.status ?? row.STATUS ?? 0,
    pin: row.pin ?? row.PIN ?? null,
    createddate: row.createddate ?? row.CREATEDDATE ?? null,
    updateddate: row.updateddate ?? row.UPDATEDDATE ?? null,
    emp_objid: row.emp_objid ?? row.EMP_OBJID ?? null,
    photo_path: row.photo_path ?? row.PHOTO_PATH ?? null
  };
};

const withPortalDefaults = (employee = {}) => ({
  ...employee,
  ...PORTAL_DEFAULTS
});

const toNormalizedNumber = (value) => {
  if (value === undefined || value === null) return NaN;
  const stringValue = String(value);
  if (!stringValue.length) return NaN;
  const parsed = Number(stringValue);
  return Number.isNaN(parsed) ? NaN : parsed;
};

const mergePortalData = async (employees = []) => {
  if (!employees.length) {
    return employees.map(withPortalDefaults);
  }

  const hr201Pool = getHR201Pool();

  const portalRows = await Promise.all(employees.map(async (employee) => {
    const queryParts = [];
    const params = [];

    const numericUserId = toNormalizedNumber(employee.USERID);
    if (!Number.isNaN(numericUserId)) {
      queryParts.push('CAST(dtruserid AS UNSIGNED) = ?');
      params.push(numericUserId);
    }

    const stringUserId = employee.USERID !== undefined && employee.USERID !== null
      ? String(employee.USERID)
      : '';
    if (stringUserId) {
      queryParts.push('TRIM(dtruserid) = ?');
      params.push(stringUserId);
  }

    const stringBadge = employee.BADGENUMBER !== undefined && employee.BADGENUMBER !== null
      ? String(employee.BADGENUMBER)
      : '';
    if (stringBadge) {
      queryParts.push('TRIM(username) = ?');
      params.push(stringBadge);
    }

    if (!queryParts.length) {
      return null;
    }

    const query = `
      SELECT 
        sp.userportalid, 
        sp.dtruserid, 
        sp.username, 
        sp.emailaddress, 
        sp.status, 
        sp.pin, 
        sp.createddate, 
        sp.updateddate, 
        sp.emp_objid,
        em.photo_path
      FROM sysusers_portal sp
      LEFT JOIN employees_media em ON em.emp_objid = sp.emp_objid
      WHERE ${queryParts.join(' OR ')}
      ORDER BY sp.updateddate DESC
      LIMIT 1
    `;

    try {
      const [rows] = await hr201Pool.query(query, params);
      if (Array.isArray(rows) && rows.length > 0) {
        const normalized = normalizePortalRow(rows[0]);
        let photoBase64 = null;

        if (normalized.photo_path) {
          try {
            photoBase64 = await readMediaAsBase64(normalized.photo_path);
          } catch (photoError) {
            console.warn('Warning: unable to read portal photo for', normalized.dtruserid, photoError.message);
          }
        }

        console.log('[mergePortalData] Fetched portal row for employee', {
          USERID: employee.USERID,
          BADGENUMBER: employee.BADGENUMBER,
          portalUsername: normalized.username,
          hasPhoto: Boolean(photoBase64)
        });

        return {
          ...normalized,
          photoBase64
        };
      }
    } catch (error) {
      console.error('Error fetching portal user for employee', employee.USERID, error);
    }

    console.log('[mergePortalData] No portal row found for employee', {
      USERID: employee.USERID,
      BADGENUMBER: employee.BADGENUMBER
    });
    return null;
  }));

  return employees.map((employee, index) => {
    const candidate = withPortalDefaults(employee);
    const portal = portalRows[index];

    if (!portal) {
      return candidate;
    }

    const portalStatus = portal.status !== undefined && portal.status !== null ? Number(portal.status) : 0;
    const mergedPhoto = candidate.PHOTO || portal.photoBase64 || null;

    return {
      ...candidate,
      PHOTO: mergedPhoto,
      PORTAL_REGISTERED: true,
      PORTAL_STATUS: portalStatus,
      PORTAL_USERNAME: portal.username ?? null,
      PORTAL_EMAIL: portal.emailaddress ?? null,
      PORTAL_PIN: portal.pin ?? null,
      PORTAL_USERPORTALID: portal.userportalid ?? null,
      PORTAL_CREATEDDATE: portal.createddate ?? null,
      PORTAL_UPDATEDDATE: portal.updateddate ?? null,
      PORTAL_EMP_OBJID: portal.emp_objid ?? null,
      PORTAL_PHOTO_PATH: portal.photo_path ?? null,
      portalUsername: portal.username ?? null,
      portalStatus,
      portalEmail: portal.emailaddress ?? null,
      portalPin: portal.pin ?? null,
      portalUserportalId: portal.userportalid ?? null,
      portalEmpObjId: portal.emp_objid ?? null,
      portalPhotoPath: portal.photo_path ?? null,
      portalPhoto: portal.photoBase64 ?? null
    };
  });
};

// @desc    Get all employees with department names (original function - no pagination)
// @route   GET /api/employees
// @access  Private (or Public, depending on app design)
const getEmployees = async (req, res) => {
  try {
    const pool = getDb();
    
    // Debug: Test biometric tables first
    try {
      console.log('=== COMPREHENSIVE BIOMETRIC DEBUG ===');
      
      // Test 1: Check if tables have any data at all
      const templateCount = await pool.request().query(`SELECT COUNT(*) as total FROM TEMPLATE`);
      const faceCount = await pool.request().query(`SELECT COUNT(*) as total FROM FaceTemp`);
      console.log('Total records in TEMPLATE:', templateCount.recordset[0].total);
      console.log('Total records in FaceTemp:', faceCount.recordset[0].total);
      
      // Test 2: Check sample data from both tables
      const templateSample = await pool.request().query(`
        SELECT TOP 5 USERID, FINGERID, 
        CASE WHEN TEMPLATE IS NOT NULL THEN 'Has Template' ELSE 'No Template' END as template_status
        FROM TEMPLATE
      `);
      console.log('TEMPLATE sample data:', templateSample.recordset);
      
      const faceSample = await pool.request().query(`
        SELECT TOP 5 UserId, pin, FACEID,
        CASE WHEN TEMPLATE IS NOT NULL THEN 'Has Template' ELSE 'No Template' END as template_status
        FROM FaceTemp
      `);
      console.log('FaceTemp sample data:', faceSample.recordset);
      
    } catch (error) {
      console.error('Error in biometric debugging:', error);
    }
    
    const result = await pool.request().query(`
      SELECT 
        u.USERID, 
        u.NAME, 
        u.BADGENUMBER, 
        u.DEFAULTDEPTID,
        u.SSN,
        u.InheritDeptSchClass,
        u.TITLE,
        u.GENDER,
        u.BIRTHDAY,
        u.HIREDDAY,
        u.STREET,
        u.privilege,
        d.DEPTNAME,
        u.PHOTO,
        -- Add biometric template counts
        ISNULL((
          SELECT COUNT(*) 
          FROM TEMPLATE t 
          WHERE t.USERID = u.USERID
        ), 0) as FINGER_COUNT,
        ISNULL((
          SELECT COUNT(*) 
          FROM FaceTemp f 
          WHERE f.UserID = u.USERID
        ), 0) as FACE_COUNT
      FROM USERINFO u
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
      ORDER BY u.NAME
    `);

    // Debug: Check what the database is returning
    console.log('=== IMMEDIATE BIOMETRIC DEBUG ===');
    console.log('Query executed successfully');
    console.log('Number of records returned:', result.recordset.length);
    
    if (result.recordset.length > 0) {
      const sampleEmployee = result.recordset[0];
      console.log('Sample employee from database:');
      console.log('Name:', sampleEmployee.NAME);
      console.log('USERID:', sampleEmployee.USERID);
      console.log('FINGER_COUNT:', sampleEmployee.FINGER_COUNT);
      console.log('FACE_COUNT:', sampleEmployee.FACE_COUNT);
      console.log('All fields:', Object.keys(sampleEmployee));
      
      // Check if the biometric fields exist
      console.log('Has FINGER_COUNT:', 'FINGER_COUNT' in sampleEmployee);
      console.log('Has FACE_COUNT:', 'FACE_COUNT' in sampleEmployee);
    }

    // Convert photos to base64 in JavaScript
    const employeesWithPhotos = result.recordset.map(employee => {
      if (employee.PHOTO) {
        try {
          // Convert binary to base64
          const base64Photo = Buffer.from(employee.PHOTO).toString('base64');
          employee.PHOTO = `data:image/jpeg;base64,${base64Photo}`;
        } catch (error) {
          console.warn('Error converting photo for employee:', employee.USERID, error);
          employee.PHOTO = null;
        }
      }
      return employee;
    });

    res.json(employeesWithPhotos);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ message: 'Server error fetching employees' });
  }
};

// @desc    Get employees with pagination for EmployeeManagement component only
// @route   GET /api/employees/paginated
// @access  Private
const getEmployeePaginateInEmployeeManagement = async (req, res) => {
  try {
    const pool = getDb();
    
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const search = req.query.search || '';
    const status = req.query.status || 'all'; // Add status parameter
    const offset = (page - 1) * limit;
    
    // Build WHERE clause for search and status
    let whereClause = '';
    let searchParams = [];
    let whereConditions = [];
    
    // Add search conditions
    if (search.trim()) {
      whereConditions.push(`
        (u.NAME LIKE @search 
        OR u.BADGENUMBER LIKE @search 
        OR CAST(u.USERID AS VARCHAR) LIKE @search 
        OR d.DEPTNAME LIKE @search 
        OR u.TITLE LIKE @search)
      `);
      searchParams.push({ name: 'search', value: `%${search}%` });
    }
    
    // Add status filter conditions
    if (status !== 'all') {
      if (status === 'active') {
        whereConditions.push('(u.privilege IS NULL OR u.privilege >= 0)');
      } else if (status === 'inactive') {
        whereConditions.push('u.privilege < 0');
      }
    }
    
    // Combine all conditions
    if (whereConditions.length > 0) {
      whereClause = 'WHERE ' + whereConditions.join(' AND ');
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM USERINFO u
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
      ${whereClause}
    `;
    
    const countRequest = pool.request();
    searchParams.forEach(param => {
      // Handle different parameter types
      if (param.name === 'appointment' || param.name === 'department' || param.name === 'shiftSchedule') {
        countRequest.input(param.name, sql.Int, parseInt(param.value));
      } else {
        countRequest.input(param.name, sql.NVarChar, param.value);
      }
    });
    const countResult = await countRequest.query(countQuery);
    const total = countResult.recordset[0].total;
    
    // Debug: Test biometric tables with detailed information
    try {
      console.log('=== COMPREHENSIVE BIOMETRIC DEBUG ===');
      
      // Test 1: Check if tables have any data at all
      const templateCount = await pool.request().query(`SELECT COUNT(*) as total FROM TEMPLATE`);
      const faceCount = await pool.request().query(`SELECT COUNT(*) as total FROM FaceTemp`);
      console.log('Total records in TEMPLATE:', templateCount.recordset[0].total);
      console.log('Total records in FaceTemp:', faceCount.recordset[0].total);
      
      // Test 2: Check sample data from both tables
      const templateSample = await pool.request().query(`
        SELECT TOP 5 USERID, FINGERID, 
        CASE WHEN TEMPLATE IS NOT NULL THEN 'Has Template' ELSE 'No Template' END as template_status
        FROM TEMPLATE
      `);
      console.log('TEMPLATE sample data:', templateSample.recordset);
      
      const faceSample = await pool.request().query(`
        SELECT TOP 5 UserId, pin, FACEID,
        CASE WHEN TEMPLATE IS NOT NULL THEN 'Has Template' ELSE 'No Template' END as template_status
        FROM FaceTemp
      `);
      console.log('FaceTemp sample data:', faceSample.recordset);
      
      // Test 3: Check if there are any users with biometric data
      const userWithBiometrics = await pool.request().query(`
        SELECT TOP 3 u.USERID, u.NAME,
          (SELECT COUNT(*) FROM TEMPLATE t WHERE t.USERID = u.USERID) as finger_count,
          (SELECT COUNT(*) FROM FaceTemp f WHERE f.UserID = u.USERID) as face_count
        FROM USERINFO u
        WHERE (SELECT COUNT(*) FROM TEMPLATE t WHERE t.USERID = u.USERID) > 0 
           OR (SELECT COUNT(*) FROM FaceTemp f WHERE f.UserID = u.USERID) > 0
      `);
      console.log('Users with biometric data:', userWithBiometrics.recordset);
      
      // Test 4: Check specific user biometric counts (using first user)
      const firstUser = await pool.request().query(`
        SELECT TOP 1 USERID, NAME FROM USERINFO
      `);
      if (firstUser.recordset.length > 0) {
        const userId = firstUser.recordset[0].USERID;
        const userName = firstUser.recordset[0].NAME;
        
        const userFingerCount = await pool.request().query(`
          SELECT COUNT(*) as count FROM TEMPLATE WHERE USERID = ${userId}
        `);
        const userFaceCount = await pool.request().query(`
          SELECT COUNT(*) as count FROM FaceTemp WHERE UserId = ${userId}
        `);
        
        console.log(`Biometric counts for user ${userName} (ID: ${userId}):`);
        console.log('Finger count:', userFingerCount.recordset[0].count);
        console.log('Face count:', userFaceCount.recordset[0].count);
      }
      
    } catch (error) {
      console.error('Error in biometric debugging:', error);
    }

    const query = `
      WITH EmployeeCTE AS (
        SELECT 
          u.USERID, 
          u.NAME, 
          u.BADGENUMBER, 
          u.DEFAULTDEPTID,
          u.SSN,
          u.InheritDeptSchClass,
          u.TITLE,
          u.GENDER,
          u.BIRTHDAY,
          u.HIREDDAY,
          u.STREET,
          u.privilege,
          u.Appointment,
          d.DEPTNAME,
          u.PHOTO,
          0 as SHIFTNO,
          '' as SHIFTNAME,
          -- Add biometric template counts
          ISNULL((
            SELECT COUNT(*) 
            FROM TEMPLATE t 
            WHERE t.USERID = u.USERID
          ), 0) as FINGER_COUNT,
          ISNULL((
            SELECT COUNT(*) 
            FROM FaceTemp f 
            WHERE f.UserID = u.USERID
          ), 0) as FACE_COUNT,
          ROW_NUMBER() OVER (ORDER BY u.NAME) as RowNum
        FROM USERINFO u
        LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
        ${whereClause}
      )
      SELECT 
        USERID, 
        NAME, 
        BADGENUMBER, 
        DEFAULTDEPTID,
        SSN,
        InheritDeptSchClass,
        TITLE,
        GENDER,
        BIRTHDAY,
        HIREDDAY,
        STREET,
        privilege,
        Appointment,
        DEPTNAME,
        PHOTO,
        SHIFTNO,
        SHIFTNAME,
        FINGER_COUNT,
        FACE_COUNT
      FROM EmployeeCTE
      WHERE RowNum > @offset AND RowNum <= @offset + @limit
      ORDER BY RowNum
    `;
    
    const request = pool.request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit);
    
    searchParams.forEach(param => {
      // Handle different parameter types
      if (param.name === 'appointment' || param.name === 'department' || param.name === 'shiftSchedule') {
        request.input(param.name, sql.Int, parseInt(param.value));
      } else {
        request.input(param.name, sql.NVarChar, param.value);
      }
    });
    
    const result = await request.query(query);
    const employeesWithPhotos = result.recordset.map(mapEmployeePhoto);

    let employeesWithPortal;
    try {
      employeesWithPortal = await mergePortalData(employeesWithPhotos);
    } catch (portalError) {
      console.error('Error merging portal registrations:', portalError);
      employeesWithPortal = employeesWithPhotos.map(withPortalDefaults);
    }

    res.json({
      employees: employeesWithPortal,
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error fetching employees with pagination:', err);
    res.status(500).json({ message: 'Server error fetching employees with pagination' });
  }
};

// @desc    Get employees with shift schedule and pagination for EmployeeManagement component only
// @route   GET /api/employees/paginated-with-shifts
// @access  Private
const getPortalEmployeeWithSysuserPortal = async (req, res) => {
  try {
    const pool = getDb();
    
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10);
    const allowedPageSizes = [10, 50, 100];
    const limit = allowedPageSizes.includes(requestedLimit) ? requestedLimit : 10;
    const offset = (page - 1) * limit;
    
    const search = (req.query.search || '').trim();
    const status = req.query.status || 'all';
    const appointment = req.query.appointment || 'all';
    const department = req.query.department || 'all';
    const shiftSchedule = req.query.shiftSchedule || 'all';

    const whereConditions = [];
    const params = [];

    if (search) {
      whereConditions.push(`
        (u.NAME LIKE @search 
        OR u.BADGENUMBER LIKE @search 
        OR CAST(u.USERID AS VARCHAR) LIKE @search 
        OR u.TITLE LIKE @search)
      `);
      params.push({ name: 'search', type: sql.NVarChar, value: `%${search}%` });
    }
    
    if (status !== 'all') {
      if (status === 'active') {
        whereConditions.push('(u.privilege IS NULL OR u.privilege >= 0)');
      } else if (status === 'inactive') {
        whereConditions.push('u.privilege < 0');
      }
    }
    
    if (appointment !== 'all') {
      const appointmentValue = parseInt(appointment, 10);
      if (!Number.isNaN(appointmentValue)) {
      whereConditions.push('u.Appointment = @appointment');
        params.push({ name: 'appointment', type: sql.Int, value: appointmentValue });
      }
    }
    
    if (department !== 'all') {
      const departmentValue = parseInt(department, 10);
      if (!Number.isNaN(departmentValue)) {
      whereConditions.push('u.DEFAULTDEPTID = @department');
        params.push({ name: 'department', type: sql.Int, value: departmentValue });
      }
    }
    
    if (shiftSchedule !== 'all') {
      if (shiftSchedule === '0') {
        whereConditions.push('(u.InheritDeptSchClass IS NULL OR u.InheritDeptSchClass = 0)');
      } else {
        const shiftValue = parseInt(shiftSchedule, 10);
        if (!Number.isNaN(shiftValue)) {
        whereConditions.push('u.InheritDeptSchClass = @shiftSchedule');
          params.push({ name: 'shiftSchedule', type: sql.Int, value: shiftValue });
      }
    }
    }
    
    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM USERINFO u
      ${whereClause}
    `;
    
    const countRequest = pool.request();
    params.forEach(param => countRequest.input(param.name, param.type, param.value));
    const countResult = await countRequest.query(countQuery);
    const total = countResult.recordset[0]?.total || 0;

    const startRow = offset + 1;
    const endRow = offset + limit;

    const dataQuery = `
      WITH EmployeeCTE AS (
        SELECT 
          u.USERID, 
          u.NAME, 
          u.BADGENUMBER, 
          u.DEFAULTDEPTID,
          u.SSN,
          u.InheritDeptSchClass,
          u.TITLE,
          u.GENDER,
          u.BIRTHDAY,
          u.HIREDDAY,
          u.STREET,
          u.privilege,
          u.Appointment,
          NULL AS DEPTNAME,
          u.PHOTO,
          0 AS SHIFTNO,
          '' AS SHIFTNAME,
          ROW_NUMBER() OVER (ORDER BY u.NAME) AS RowNum
        FROM USERINFO u
        ${whereClause}
      )
      SELECT 
        USERID, 
        NAME, 
        BADGENUMBER, 
        DEFAULTDEPTID,
        SSN,
        InheritDeptSchClass,
        TITLE,
        GENDER,
        BIRTHDAY,
        HIREDDAY,
        STREET,
        privilege,
        Appointment,
        DEPTNAME,
        PHOTO,
        SHIFTNO,
        SHIFTNAME
      FROM EmployeeCTE
      WHERE RowNum BETWEEN @startRow AND @endRow
      ORDER BY RowNum
    `;
    
    const dataRequest = pool.request()
      .input('startRow', sql.Int, startRow)
      .input('endRow', sql.Int, endRow);
    params.forEach(param => dataRequest.input(param.name, param.type, param.value));
    
    const dataResult = await dataRequest.query(dataQuery);
    const employeesWithPhotos = dataResult.recordset.map(mapEmployeePhoto);

    let employeesWithPortal = [];
    try {
      employeesWithPortal = await mergePortalData(employeesWithPhotos);
    } catch (portalError) {
      console.error('Error merging portal registrations:', portalError);
      employeesWithPortal = employeesWithPhotos.map(withPortalDefaults);
    }

    res.json({
      employees: employeesWithPortal,
      total,
      page,
      limit,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0
    });
  } catch (err) {
    console.error('Error fetching employees with shift schedule:', err);
    res.status(500).json({ message: 'Server error fetching employees with shift schedule' });
  }
};

const getEmployeeWithShiftSchedulePaginate = getPortalEmployeeWithSysuserPortal;

// @desc    Get all departments
// @route   GET /api/employees/departments
// @access  Private
const getDepartments = async (req, res) => {
  try {
    const pool = getDb();
    const result = await pool.request().query(`
      SELECT DEPTID, DEPTNAME 
      FROM DEPARTMENTS 
      ORDER BY DEPTNAME
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.status(500).json({ message: 'Server error fetching departments' });
  }
};

// @desc    Add new employee
// @route   POST /api/employees
// @access  Private
const addEmployee = async (req, res) => {
  try {
    const { USERID, NAME, BADGENUMBER, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege, PASSWORD, Appointment, InheritDeptSchClass } = req.body;
    
    console.log('=== EMPLOYEE ADD ANALYSIS ===');
    console.log('Adding new employee');
    console.log('Request body:', req.body);
    console.log('USERID provided:', USERID, '(will be auto-generated by database)');
    console.log('Password provided:', !!PASSWORD);
    console.log('Appointment provided:', Appointment);
    console.log('InheritDeptSchClass provided:', InheritDeptSchClass);
    
    // Handle photo upload
    let photoBuffer = null;
    if (req.file) {
      photoBuffer = req.file.buffer;
      console.log('=== PHOTO UPLOAD ANALYSIS ===');
      console.log('Photo uploaded, size:', photoBuffer.length, 'bytes');
      console.log('Photo file type:', req.file.mimetype);
      console.log('Photo original name:', req.file.originalname);
      console.log('Photo field name:', req.file.fieldname);
      
      // Analyze photo data
      console.log('Photo buffer type:', typeof photoBuffer);
      console.log('Photo buffer is Buffer:', Buffer.isBuffer(photoBuffer));
      console.log('First 20 bytes (hex):', photoBuffer.slice(0, 20).toString('hex'));
      
      // Check if it's a valid image by looking at file signatures
      const signatures = {
        'image/jpeg': [0xFF, 0xD8, 0xFF],
        'image/png': [0x89, 0x50, 0x4E, 0x47],
        'image/gif': [0x47, 0x49, 0x46],
        'image/bmp': [0x42, 0x4D],
        'image/webp': [0x52, 0x49, 0x46, 0x46]
      };
      
      const fileSignature = Array.from(photoBuffer.slice(0, 4));
      console.log('File signature (hex):', fileSignature.map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      let detectedFormat = 'Unknown';
      for (const [format, signature] of Object.entries(signatures)) {
        if (signature.every((byte, index) => photoBuffer[index] === byte)) {
          detectedFormat = format;
          break;
        }
      }
      console.log('Detected format:', detectedFormat);
      console.log('Expected format:', req.file.mimetype);
    }

    const pool = getDb();
    
    // Handle password encryption if provided
    let encryptedPassword = null;
    if (PASSWORD) {
      console.log('=== PASSWORD ENCRYPTION ANALYSIS ===');
      console.log('Original password:', PASSWORD);
      console.log('Password length:', PASSWORD.length);
      
      // Encrypt the password using SHA-256 (truncated to fit VARCHAR(50))
      encryptedPassword = await encryptPassword(PASSWORD);
      if (encryptedPassword) {
        console.log('Password encrypted successfully');
        console.log('Encrypted password length:', encryptedPassword.length);
        console.log('Encrypted password fits VARCHAR(50):', encryptedPassword.length <= 50);
      } else {
        console.error('Failed to encrypt password');
        return res.status(400).json({ message: 'Error: Unable to encrypt password. Please try again.' });
      }
    }
    
    // Build insert query dynamically based on whether photo and password are provided
    // NOTE: USERID is removed from INSERT because it's an IDENTITY column (auto-generated)
    let insertQuery;
    let request = pool.request()
      .input('NAME', sql.NVarChar, NAME)
      .input('BADGENUMBER', sql.NVarChar, BADGENUMBER)
      .input('DEFAULTDEPTID', sql.Int, DEFAULTDEPTID)
      .input('SSN', sql.NVarChar, SSN)
      .input('TITLE', sql.NVarChar, TITLE)
      .input('GENDER', sql.NVarChar, GENDER)
      .input('BIRTHDAY', sql.Date, BIRTHDAY || null)
      .input('HIREDDAY', sql.Date, HIREDDAY || null)
      .input('STREET', sql.NVarChar, STREET)
      .input('privilege', sql.Int, privilege || 0)
      .input('Appointment', sql.Int, Appointment || null)
      .input('InheritDeptSchClass', sql.Int, InheritDeptSchClass || null);

    // Add encrypted password parameter if provided
    if (encryptedPassword) {
      console.log('Adding encrypted password to insert query');
      request = request.input('PASSWORD', sql.VarChar(50), encryptedPassword);
    }

    if (photoBuffer) {
      request = request.input('PHOTO', sql.VarBinary(sql.MAX), photoBuffer);
      
      if (encryptedPassword) {
        insertQuery = `
          INSERT INTO USERINFO (NAME, BADGENUMBER, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege, Appointment, InheritDeptSchClass, PASSWORD, PHOTO)
          VALUES (@NAME, @BADGENUMBER, @DEFAULTDEPTID, @SSN, @TITLE, @GENDER, @BIRTHDAY, @HIREDDAY, @STREET, @privilege, @Appointment, @InheritDeptSchClass, @PASSWORD, @PHOTO)
        `;
      } else {
        insertQuery = `
          INSERT INTO USERINFO (NAME, BADGENUMBER, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege, Appointment, InheritDeptSchClass, PHOTO)
          VALUES (@NAME, @BADGENUMBER, @DEFAULTDEPTID, @SSN, @TITLE, @GENDER, @BIRTHDAY, @HIREDDAY, @STREET, @privilege, @Appointment, @InheritDeptSchClass, @PHOTO)
        `;
      }
    } else {
      if (encryptedPassword) {
        insertQuery = `
          INSERT INTO USERINFO (NAME, BADGENUMBER, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege, Appointment, InheritDeptSchClass, PASSWORD)
          VALUES (@NAME, @BADGENUMBER, @DEFAULTDEPTID, @SSN, @TITLE, @GENDER, @BIRTHDAY, @HIREDDAY, @STREET, @privilege, @Appointment, @InheritDeptSchClass, @PASSWORD)
        `;
      } else {
        insertQuery = `
          INSERT INTO USERINFO (NAME, BADGENUMBER, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege, Appointment, InheritDeptSchClass)
          VALUES (@NAME, @BADGENUMBER, @DEFAULTDEPTID, @SSN, @TITLE, @GENDER, @BIRTHDAY, @HIREDDAY, @STREET, @privilege, @Appointment, @InheritDeptSchClass)
        `;
      }
    }

    console.log('Executing insert query with parameters:', {
      // USERID removed from logging since it's auto-generated
      NAME,
      BADGENUMBER,
      DEFAULTDEPTID,
      SSN: SSN ? '***' : null,
      TITLE,
      GENDER,
      BIRTHDAY,
      HIREDDAY,
      STREET,
      privilege,
      Appointment,
      InheritDeptSchClass,
      PASSWORD: encryptedPassword ? '***' : null,
      PHOTO: photoBuffer ? `${photoBuffer.length} bytes` : null
    });

    await request.query(insertQuery);

    console.log('Employee added successfully');
    res.json({ message: 'Employee added successfully' });
  } catch (err) {
    console.error('Error adding employee:', err);
    res.status(500).json({ message: 'Server error adding employee' });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { NAME, BADGENUMBER, DEFAULTDEPTID, SSN, TITLE, GENDER, BIRTHDAY, HIREDDAY, STREET, privilege, PASSWORD, Appointment, InheritDeptSchClass } = req.body;
    
    console.log('=== EMPLOYEE UPDATE ANALYSIS ===');
    console.log('Updating employee ID:', id);
    console.log('Request body:', req.body);
    console.log('Password provided:', !!PASSWORD);
    console.log('Appointment provided:', Appointment);
    console.log('InheritDeptSchClass provided:', InheritDeptSchClass);
    
    // Handle photo upload
    let photoBuffer = null;
    if (req.file) {
      photoBuffer = req.file.buffer;
      console.log('=== PHOTO UPLOAD ANALYSIS ===');
      console.log('Photo uploaded, size:', photoBuffer.length, 'bytes');
      console.log('Photo file type:', req.file.mimetype);
      console.log('Photo original name:', req.file.originalname);
      console.log('Photo field name:', req.file.fieldname);
      
      // Analyze photo data
      console.log('Photo buffer type:', typeof photoBuffer);
      console.log('Photo buffer is Buffer:', Buffer.isBuffer(photoBuffer));
      console.log('First 20 bytes (hex):', photoBuffer.slice(0, 20).toString('hex'));
      
      // Check if it's a valid image by looking at file signatures
      const signatures = {
        'image/jpeg': [0xFF, 0xD8, 0xFF],
        'image/png': [0x89, 0x50, 0x4E, 0x47],
        'image/gif': [0x47, 0x49, 0x46],
        'image/bmp': [0x42, 0x4D],
        'image/webp': [0x52, 0x49, 0x46, 0x46]
      };
      
      const fileSignature = Array.from(photoBuffer.slice(0, 4));
      console.log('File signature (hex):', fileSignature.map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      let detectedFormat = 'Unknown';
      for (const [format, signature] of Object.entries(signatures)) {
        if (signature.every((byte, index) => photoBuffer[index] === byte)) {
          detectedFormat = format;
          break;
        }
      }
      console.log('Detected format:', detectedFormat);
      console.log('Expected format:', req.file.mimetype);
    }

    const pool = getDb();
    
    // Handle password encryption if provided
    let encryptedPassword = null;
    if (PASSWORD) {
      console.log('=== PASSWORD ENCRYPTION ANALYSIS ===');
      console.log('Original password:', PASSWORD);
      console.log('Password length:', PASSWORD.length);
      
      // Encrypt the password using SHA-256 (truncated to fit VARCHAR(50))
      encryptedPassword = await encryptPassword(PASSWORD);
      if (encryptedPassword) {
        console.log('Password encrypted successfully');
        console.log('Encrypted password length:', encryptedPassword.length);
        console.log('Encrypted password fits VARCHAR(50):', encryptedPassword.length <= 50);
      } else {
        console.error('Failed to encrypt password');
        return res.status(400).json({ message: 'Error: Unable to encrypt password. Please try again.' });
      }
    }
    
    // Build update query dynamically based on whether photo and password are provided
    let updateQuery;
    let request = pool.request()
      .input('USERID', sql.Int, id)
      .input('NAME', sql.NVarChar, NAME)
      .input('BADGENUMBER', sql.NVarChar, BADGENUMBER)
      .input('DEFAULTDEPTID', sql.Int, DEFAULTDEPTID)
      .input('SSN', sql.NVarChar, SSN)
      .input('TITLE', sql.NVarChar, TITLE)
      .input('GENDER', sql.NVarChar, GENDER)
      .input('BIRTHDAY', sql.Date, BIRTHDAY || null)
      .input('HIREDDAY', sql.Date, HIREDDAY || null)
      .input('STREET', sql.NVarChar, STREET)
      .input('privilege', sql.Int, privilege || 0)
      .input('Appointment', sql.Int, Appointment || null)
      .input('InheritDeptSchClass', sql.Int, InheritDeptSchClass || null);

    // Add encrypted password parameter if provided
    if (encryptedPassword) {
      console.log('Adding encrypted password to update query');
      request = request.input('PASSWORD', sql.VarChar(50), encryptedPassword);
    }

    if (photoBuffer) {
      request = request.input('PHOTO', sql.VarBinary(sql.MAX), photoBuffer);
      
      if (encryptedPassword) {
        updateQuery = `
          UPDATE USERINFO 
          SET NAME = @NAME, 
              BADGENUMBER = @BADGENUMBER, 
              DEFAULTDEPTID = @DEFAULTDEPTID, 
              SSN = @SSN,
              TITLE = @TITLE,
              GENDER = @GENDER,
              BIRTHDAY = @BIRTHDAY,
              HIREDDAY = @HIREDDAY,
              STREET = @STREET,
              privilege = @privilege,
              Appointment = @Appointment,
              InheritDeptSchClass = @InheritDeptSchClass,
              PASSWORD = @PASSWORD,
              PHOTO = @PHOTO
          WHERE USERID = @USERID
        `;
      } else {
        updateQuery = `
          UPDATE USERINFO 
          SET NAME = @NAME, 
              BADGENUMBER = @BADGENUMBER, 
              DEFAULTDEPTID = @DEFAULTDEPTID, 
              SSN = @SSN,
              TITLE = @TITLE,
              GENDER = @GENDER,
              BIRTHDAY = @BIRTHDAY,
              HIREDDAY = @HIREDDAY,
              STREET = @STREET,
              privilege = @privilege,
              Appointment = @Appointment,
              InheritDeptSchClass = @InheritDeptSchClass,
              PHOTO = @PHOTO
          WHERE USERID = @USERID
        `;
      }
    } else {
      if (encryptedPassword) {
        updateQuery = `
          UPDATE USERINFO 
          SET NAME = @NAME, 
              BADGENUMBER = @BADGENUMBER, 
              DEFAULTDEPTID = @DEFAULTDEPTID, 
              SSN = @SSN,
              TITLE = @TITLE,
              GENDER = @GENDER,
              BIRTHDAY = @BIRTHDAY,
              HIREDDAY = @HIREDDAY,
              STREET = @STREET,
              privilege = @privilege,
              Appointment = @Appointment,
              InheritDeptSchClass = @InheritDeptSchClass,
              PASSWORD = @PASSWORD
          WHERE USERID = @USERID
        `;
      } else {
        updateQuery = `
          UPDATE USERINFO 
          SET NAME = @NAME, 
              BADGENUMBER = @BADGENUMBER, 
              DEFAULTDEPTID = @DEFAULTDEPTID, 
              SSN = @SSN,
              TITLE = @TITLE,
              GENDER = @GENDER,
              BIRTHDAY = @BIRTHDAY,
              HIREDDAY = @HIREDDAY,
              STREET = @STREET,
              privilege = @privilege,
              Appointment = @Appointment,
              InheritDeptSchClass = @InheritDeptSchClass
          WHERE USERID = @USERID
        `;
      }
    }

    console.log('Executing update query with parameters:', {
      USERID: id,
      NAME,
      BADGENUMBER,
      DEFAULTDEPTID,
      SSN: SSN ? '***' : null,
      TITLE,
      GENDER,
      BIRTHDAY,
      HIREDDAY,
      STREET,
      privilege,
      Appointment,
      InheritDeptSchClass,
      PASSWORD: encryptedPassword ? '***' : null,
      PHOTO: photoBuffer ? `${photoBuffer.length} bytes` : null
    });

    await request.query(updateQuery);

    console.log('Employee updated successfully');
    res.json({ message: 'Employee updated successfully' });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ message: 'Server error updating employee' });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDb();
    
    await pool.request()
      .input('USERID', sql.Int, id)
      .query('DELETE FROM USERINFO WHERE USERID = @USERID');

    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({ message: 'Server error deleting employee' });
  }
};

// @desc    Get employee by ID (without password for security)
// @route   GET /api/employees/:id
// @access  Private
const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDb();
    
    const result = await pool.request()
      .input('USERID', sql.Int, id)
      .query(`
        SELECT 
          u.USERID, 
          u.NAME, 
          u.BADGENUMBER, 
          u.DEFAULTDEPTID,
          u.SSN,
          u.InheritDeptSchClass,
          u.TITLE,
          u.GENDER,
          u.BIRTHDAY,
          u.HIREDDAY,
          u.STREET,
          u.privilege,
          u.Appointment,
          d.DEPTNAME,
          u.PHOTO
        FROM USERINFO u
        LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
        WHERE u.USERID = @USERID
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const employee = result.recordset[0];
    
    // Convert photo to base64 if exists
    if (employee.PHOTO) {
      try {
        const base64Photo = Buffer.from(employee.PHOTO).toString('base64');
        employee.PHOTO = `data:image/jpeg;base64,${base64Photo}`;
      } catch (error) {
        console.warn('Error converting photo for employee:', employee.USERID, error);
        employee.PHOTO = null;
      }
    }

    res.json(employee);
  } catch (err) {
    console.error('Error fetching employee by ID:', err);
    res.status(500).json({ message: 'Server error fetching employee' });
  }
};

// @desc    Get employee by ID with decrypted password (for super admin only)
// @route   GET /api/employees/:id/with-password
// @access  Private (Super Admin only)
const getEmployeeByIdWithPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDb();
    
    const result = await pool.request()
      .input('USERID', sql.Int, id)
      .query(`
        SELECT 
          u.USERID, 
          u.NAME, 
          u.BADGENUMBER, 
          u.DEFAULTDEPTID,
          u.SSN,
          u.InheritDeptSchClass,
          u.TITLE,
          u.GENDER,
          u.BIRTHDAY,
          u.HIREDDAY,
          u.STREET,
          u.privilege,
          u.PASSWORD,
          u.Appointment,
          d.DEPTNAME,
          u.PHOTO
        FROM USERINFO u
        LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
        WHERE u.USERID = @USERID
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const employee = result.recordset[0];
    
    // Decrypt password if it exists (for super admin users)
    if (employee.PASSWORD) {
      try {
        const decryptedPassword = decryptPassword(employee.PASSWORD);
        employee.PASSWORD = decryptedPassword;
        console.log('=== EMPLOYEE PASSWORD DECRYPTION ===');
        console.log('Employee ID:', employee.USERID);
        console.log('Original stored password:', employee.PASSWORD);
        console.log('Decrypted password:', decryptedPassword);
      } catch (error) {
        console.warn('Error decrypting password for employee:', employee.USERID, error);
        employee.PASSWORD = '';
      }
    }
    
    // Convert photo to base64 if exists
    if (employee.PHOTO) {
      try {
        const base64Photo = Buffer.from(employee.PHOTO).toString('base64');
        employee.PHOTO = `data:image/jpeg;base64,${base64Photo}`;
      } catch (error) {
        console.warn('Error converting photo for employee:', employee.USERID, error);
        employee.PHOTO = null;
      }
    }

    res.json(employee);
  } catch (err) {
    console.error('Error fetching employee by ID with password:', err);
    res.status(500).json({ message: 'Server error fetching employee' });
  }
};

// @desc    Get employee with shift schedule
// @route   GET /api/employees/:id/shift-schedule
// @access  Private
const getEmployeeWithShiftSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDb(); // MSSQL pool for USERINFO
    const hr201Pool = getHR201Pool(); // MySQL pool for employee_assignedshifts
    
    console.log(`🔄 Fetching employee with shift schedule for USERID: ${id}`);
    
    // First get employee info with all necessary fields from MSSQL
    const employeeResult = await pool.request()
      .input('USERID', sql.Int, id)
      .query(`
        SELECT 
          u.USERID, 
          u.NAME, 
          u.BADGENUMBER, 
          u.DEFAULTDEPTID,
          u.SSN,
          u.TITLE,
          u.GENDER,
          u.BIRTHDAY,
          u.HIREDDAY,
          u.STREET,
          u.privilege,
          d.DEPTNAME,
          u.InheritDeptSchClass
        FROM USERINFO u
        LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
        WHERE u.USERID = @USERID
      `);

    if (employeeResult.recordset.length === 0) {
      console.log(`❌ Employee not found: ${id}`);
      return res.status(404).json({ message: 'Employee not found' });
    }

    const employee = employeeResult.recordset[0];
    console.log(`✅ Employee found: ${employee.NAME}`);

    // Map USERID to emp_objid via employees.dtruserid
    const userId = parseInt(id);
    const [empRows] = await hr201Pool.execute(
      'SELECT objid FROM employees WHERE dtruserid = ? LIMIT 1',
      [userId]
    );

    if (!empRows || empRows.length === 0) {
      console.log(`⚠️ Employee not found in HR201 database for USERID: ${id}`);
      return res.json({
        employee: employee,
        shiftSchedule: null,
        assignedShifts: []
      });
    }

    const empObjId = empRows[0].objid;
    console.log(`✅ Mapped USERID ${id} to emp_objid: ${empObjId}`);

    // Query employee_assignedshifts with is_used = 1 and join with shiftscheduletypes
    const [assignedShifts] = await hr201Pool.execute(`
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
    
    // Debug: Log the raw assigned shifts data
    if (assignedShifts.length > 0) {
      console.log('🔍 [DEBUG] Assigned shifts raw data:', JSON.stringify(assignedShifts, null, 2));
    }

    // Group shifts by shifttimemode and combine into single shift schedule object
    let shiftSchedule = null;
    const assignedShiftsInfo = [];

    if (assignedShifts.length > 0) {
      // Initialize shift schedule object
      shiftSchedule = {
        SHIFTNO: null, // Not applicable for combined shifts
        SHIFTNAME: null, // Will be set based on shifts
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

      // Process AM shifts (use most recent if multiple)
      if (amShifts.length > 0) {
        const amShift = amShifts[0]; // Most recent (already sorted by createddate DESC)
        shiftSchedule.SHIFT_AMCHECKIN = amShift.shift_checkin || null;
        shiftSchedule.SHIFT_AMCHECKIN_START = amShift.shift_checkin_start || null;
        shiftSchedule.SHIFT_AMCHECKIN_END = amShift.shift_checkin_end || null;
        shiftSchedule.SHIFT_AMCHECKOUT = amShift.shift_checkout || null;
        shiftSchedule.SHIFT_AMCHECKOUT_START = amShift.shift_checkout_start || null;
        shiftSchedule.SHIFT_AMCHECKOUT_END = amShift.shift_checkout_end || null;
        
        assignedShiftsInfo.push({
          period: 'AM',
          shiftName: amShift.shiftname,
          shiftMode: amShift.shifttimemode,
          checkIn: amShift.shift_checkin,
          checkOut: amShift.shift_checkout,
          credits: amShift.credits ?? 0
        });
      }

      // Process PM shifts (use most recent if multiple)
      if (pmShifts.length > 0) {
        const pmShift = pmShifts[0]; // Most recent (already sorted by createddate DESC)
        shiftSchedule.SHIFT_PMCHECKIN = pmShift.shift_checkin || null;
        shiftSchedule.SHIFT_PMCHECKIN_START = pmShift.shift_checkin_start || null;
        shiftSchedule.SHIFT_PMCHECKIN_END = pmShift.shift_checkin_end || null;
        shiftSchedule.SHIFT_PMCHECKOUT = pmShift.shift_checkout || null;
        shiftSchedule.SHIFT_PMCHECKOUT_START = pmShift.shift_checkout_start || null;
        shiftSchedule.SHIFT_PMCHECKOUT_END = pmShift.shift_checkout_end || null;
        
        // Only add PM if it's not already added as AMPM
        if (pmShift.shifttimemode !== 'AMPM' || amShifts.length === 0) {
          assignedShiftsInfo.push({
            period: 'PM',
            shiftName: pmShift.shiftname,
            shiftMode: pmShift.shifttimemode,
            checkIn: pmShift.shift_checkin,
            checkOut: pmShift.shift_checkout,
            credits: pmShift.credits ?? 0
          });
        }
      }

      // Set SHIFTNAME based on shifts (combine if multiple)
      if (assignedShiftsInfo.length > 0) {
        shiftSchedule.SHIFTNAME = assignedShiftsInfo.map(s => s.shiftName).join(' / ');
      }

      console.log(`✅ Combined shift schedule: ${shiftSchedule.SHIFTNAME}`);
      console.log(`📊 AM: ${shiftSchedule.SHIFT_AMCHECKIN ? 'Set' : 'Not assigned'}, PM: ${shiftSchedule.SHIFT_PMCHECKIN ? 'Set' : 'Not assigned'}`);
      console.log(`🔍 [DEBUG] Final shiftSchedule object:`, JSON.stringify(shiftSchedule, null, 2));
    } else {
      console.log(`⚠️ No assigned shifts with is_used=1 found for employee`);
    }

        const response = {
          employee: employee,
          shiftSchedule: shiftSchedule,
          assignedShifts: assignedShiftsInfo,
          employeeObjId: empObjId || null
        };

    console.log(`✅ Successfully fetched employee data for: ${employee.NAME}`);
    console.log(`🔍 [DEBUG] Final API response shiftSchedule:`, shiftSchedule ? 'exists' : 'null');
    res.json(response);
  } catch (err) {
    console.error('❌ Error fetching employee with shift schedule:', err);
    res.status(500).json({ 
      message: 'Server error fetching employee with shift schedule',
      error: err.message 
    });
  }
};

// @desc    Validate unique fields (USERID and BADGENUMBER)
// @route   GET /api/employees/validate-unique
// @access  Private
const validateUniqueFields = async (req, res) => {
  try {
    const { userId, badgeNumber, currentUserId } = req.query;
    
    if (!userId && !badgeNumber) {
      return res.status(400).json({
        isValid: false,
        message: 'At least one field (userId or badgeNumber) is required for validation'
      });
    }

    const pool = getDb();
    let query = 'SELECT USERID, BADGENUMBER FROM USERINFO WHERE 1=1';
    const params = [];
    
    // Add conditions for checking duplicates
    if (userId) {
      query += ' AND USERID = @userId';
      params.push({ name: 'userId', value: userId });
    }
    
    if (badgeNumber) {
      query += ' AND BADGENUMBER = @badgeNumber';
      params.push({ name: 'badgeNumber', value: badgeNumber });
    }
    
    // Exclude current user if editing
    if (currentUserId && currentUserId !== 'new') {
      query += ' AND USERID != @currentUserId';
      params.push({ name: 'currentUserId', value: currentUserId });
    }

    const request = pool.request();
    params.forEach(param => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);
    
    const errors = {};
    let isValid = true;

    // Check for USERID duplicates
    if (userId) {
      const userIdExists = result.recordset.some(record => record.USERID == userId);
      if (userIdExists) {
        errors.userId = 'User ID already exists';
        isValid = false;
      }
    }

    // Check for BADGENUMBER duplicates
    if (badgeNumber) {
      const badgeNumberExists = result.recordset.some(record => record.BADGENUMBER == badgeNumber);
      if (badgeNumberExists) {
        errors.badgeNumber = 'Badge Number already exists';
        isValid = false;
      }
    }

    res.json({
      isValid,
      errors
    });

  } catch (err) {
    console.error('❌ Error validating unique fields:', err);
    res.status(500).json({ 
      message: 'Server error validating unique fields',
      error: err.message 
    });
  }
};

// @desc    Reset employee PIN/SSN
// @route   PUT /api/employees/:id/reset-pin
// @access  Private
const resetEmployeePin = async (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    // Validate PIN: must be exactly 4 digits
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    const pool = getDb();

    // Update SSN field in USERINFO table
    await pool.request()
      .input('USERID', sql.Int, id)
      .input('SSN', sql.NVarChar, pin)
      .query(`
        UPDATE USERINFO 
        SET SSN = @SSN 
        WHERE USERID = @USERID
      `);

    console.log(`PIN reset successfully for employee ${id}`);
    res.json({ message: 'PIN reset successfully' });
  } catch (err) {
    console.error('Error resetting PIN:', err);
    res.status(500).json({ error: 'Server error resetting PIN' });
  }
};

const sanitizePortalPin = (pin, fallback = '1234') => {
  const fallbackString = fallback !== undefined && fallback !== null ? String(fallback) : '1234';
  const raw = pin !== undefined && pin !== null ? String(pin) : '';
  const cleaned = raw.replace(/\D/g, '').slice(0, 6);
  if (!cleaned) {
    const fallbackCleaned = fallbackString.replace(/\D/g, '').slice(0, 6) || '1234';
    return fallbackCleaned;
  }
  return cleaned.length < 4 ? (fallbackString.replace(/\D/g, '').slice(0, 6) || '1234') : cleaned;
};

const registerPortalUser = async (req, res) => {
  try {
    const { id } = req.params; // MSSQL USERID
    const { username, pin, emailaddress, status, dtrname, emp_objid } = req.body;
    const hr201Pool = getHR201Pool();
    const userId = Number(id);

    const [existing] = await hr201Pool.query('SELECT userportalid FROM sysusers_portal WHERE dtruserid = ?', [userId]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Portal user already registered.' });
    }

    const pinValue = sanitizePortalPin(pin, '1234');
    if (pinValue.length < 4 || pinValue.length > 6) {
      return res.status(400).json({ success: false, message: 'PIN must be between 4 and 6 digits.' });
    }
    const statusValue = typeof status === 'number' ? status : 1;
    const createdBy = req.user?.USERID || req.user?.userid || req.user?.id || null;
    const empObjIdValue = emp_objid || null;

    const [result] = await hr201Pool.query(
      `INSERT INTO sysusers_portal (emp_objid, dtruserid, dtrname, username, pin, emailaddress, status, createdby, createddate, updateddate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [empObjIdValue, userId, dtrname || '', username || null, pinValue, emailaddress || null, statusValue, createdBy]
    );

    res.json({ success: true, userportalid: result.insertId });
  } catch (error) {
    console.error('Error registering portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to register portal user.' });
  }
};

const updatePortalUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, pin, emailaddress, status, dtrname, emp_objid } = req.body;
    const hr201Pool = getHR201Pool();
    const userId = Number(id);

    const [existing] = await hr201Pool.query('SELECT userportalid, pin, status, dtrname, emp_objid FROM sysusers_portal WHERE dtruserid = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Portal user not found.' });
    }

    const pinValue = sanitizePortalPin(pin, existing[0].pin || '1234');
    if (pinValue.length < 4 || pinValue.length > 6) {
      return res.status(400).json({ success: false, message: 'PIN must be between 4 and 6 digits.' });
    }
    const statusValue = typeof status === 'number' ? status : existing[0].status;
    const empObjIdValue = emp_objid !== undefined ? emp_objid : existing[0].emp_objid;

    await hr201Pool.query(
      `UPDATE sysusers_portal
       SET username = ?, pin = ?, emailaddress = ?, status = ?, dtrname = ?, emp_objid = ?, updateddate = NOW()
       WHERE dtruserid = ?`,
      [username || null, pinValue, emailaddress || null, statusValue, dtrname || existing[0].dtrname || '', empObjIdValue || null, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to update portal user.' });
  }
};

const deletePortalUser = async (req, res) => {
  try {
    const { id } = req.params;
    const hr201Pool = getHR201Pool();
    const userId = Number(id);

    const [existing] = await hr201Pool.query('SELECT userportalid FROM sysusers_portal WHERE dtruserid = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Portal user not found.' });
    }

    await hr201Pool.query('DELETE FROM sysusers_portal WHERE dtruserid = ?', [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting portal user:', error);
    res.status(500).json({ success: false, message: 'Failed to delete portal user.' });
  }
};

const getPortalEmployeeProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = Number(id);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid DTR user ID' });
    }

    const hr201Pool = getHR201Pool();
    const [rows] = await hr201Pool.query(
      `SELECT e.objid, e.surname, e.firstname, e.middlename, em.photo_path
       FROM employees e
       LEFT JOIN employees_media em ON em.emp_objid = e.objid
       WHERE e.dtruserid = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.json({ success: true, match: null });
    }

    const match = rows[0];
    const lastName = match.surname || '';
    const firstName = match.firstname || '';
    const middleName = match.middlename || '';
    const fullName = [lastName, firstName].filter(Boolean).join(', ');

    let photo = null;
    if (match.photo_path) {
      try {
        photo = await readMediaAsBase64(match.photo_path);
      } catch (error) {
        console.warn('Unable to read employee photo:', error);
        photo = null;
      }
    }

    res.json({
      success: true,
      match: {
        objid: match.objid,
        surname: lastName,
        firstname: firstName,
        middlename: middleName,
        fullName,
        photo,
        photo_path: match.photo_path || null
      }
    });
  } catch (error) {
    console.error('Error fetching portal employee profile:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch portal employee profile.' });
  }
};

// Export all functions
export {
  getEmployees,
  getEmployeePaginateInEmployeeManagement,
  getPortalEmployeeWithSysuserPortal,
  getEmployeeWithShiftSchedulePaginate,
  getDepartments,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeeByIdWithPassword, // Add this export
  getEmployeeWithShiftSchedule,
  validateUniqueFields, // Add this new export
  resetEmployeePin, // Add reset PIN export
  upload, // Export upload middleware
  registerPortalUser,
  updatePortalUser,
  deletePortalUser,
  getPortalEmployeeProfile
};