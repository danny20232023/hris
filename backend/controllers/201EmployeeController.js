import { getHR201Pool } from '../config/hr201Database.js';
import { getDb } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { toBmpUnder100KB, MAX_PHOTO_BYTES, MAX_SIGNATURE_BYTES } from '../utils/image.js';
import { saveMediaFile, deleteMediaFile, readMediaAsBase64, fileExists } from '../utils/fileStorage.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// GET /api/201-employees - Get all employees from HR201 database
export const get201Employees = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT 
        e.objid,
        e.idno,
        e.dtruserid,
        e.dtrbadgenumber,
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
        e.agency_no,
        e.citizenship,
        e.dual_citizenship_type,
        e.telephone,
        e.mobile,
        e.email,
        e.created_at,
        e.updated_at,
        em.photo_path,
        COALESCE(dept_cur.departmentshortname, dept_emp.departmentshortname) AS department_name,
        cur.position AS position_title,
        cur.appointmentstatus AS appointment_status,
        atp.appointmentname AS appointment_name,
        e.empstatus,
        COALESCE(e.cancreatetravel, 0) AS cancreatetravel
      FROM employees e
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN department dept_emp ON dept_emp.deptid = e.deptid
      LEFT JOIN employee_designation cur
        ON cur.emp_objid = e.objid AND cur.ispresent = 1
      LEFT JOIN department dept_cur ON dept_cur.deptid = cur.assigneddept
      LEFT JOIN appointmenttypes atp ON cur.appointmentstatus = atp.id
      ORDER BY e.surname, e.firstname ASC
    `;
    
    const [employees] = await pool.execute(query);

    // Convert photo_path files to base64 data URLs when present and format names
    for (const emp of employees) {
      if (emp.photo_path) {
        try {
          emp.photo_path = await readMediaAsBase64(emp.photo_path);
        } catch (e) {
          // If conversion fails, keep original path or null
          // Prefer null to avoid broken image requests in the frontend
          emp.photo_path = null;
        }
      }
      emp.cancreatetravel = Number(emp.cancreatetravel) === 1;
      emp.fullname = formatEmployeeName(emp.surname, emp.firstname, emp.middlename, emp.extension);
    }
    
    const dbHost = process.env.HR201_DB_HOST || 'localhost';
    const dbPort = process.env.HR201_DB_PORT || '3306';
    console.log(`✅ Fetched ${employees.length} employees from HR201 'employees' table (${dbHost}:${dbPort})`);
    
    res.json({
      success: true,
      data: employees,
      count: employees.length,
      source: 'HR201 Database - employees table',
      server: `${dbHost}:${dbPort}`
    });
    
  } catch (error) {
    console.error('❌ Error fetching 201 employees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees from HR201 database',
      error: error.message,
      table: 'employees'
    });
  }
};

// GET /api/201-employees/:id - Get single employee by objid or idno
export const get201EmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    // Try to find by objid first, then by idno
    const query = `
      SELECT 
        e.objid,
        e.idno,
        e.dtruserid,
        e.dtrbadgenumber,
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
        e.agency_no,
        e.citizenship,
        e.dual_citizenship_type,
        e.telephone,
        e.mobile,
        e.email,
        e.created_at,
        e.updated_at,
        em.photo_path
      FROM employees e
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      WHERE (e.objid = ? OR e.idno = ? OR e.dtruserid = ?)
      LIMIT 1
    `;
    
    const [employees] = await pool.execute(query, [id, id, id]);
    
    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
        table: 'employees'
      });
    }
    
    const employee = employees[0];
    
    // Convert photo_path to base64 if present
    if (employee.photo_path) {
      try {
        employee.photo_path = await readMediaAsBase64(employee.photo_path);
      } catch (error) {
        console.warn(`⚠️ Could not read photo for employee ${id}:`, error.message);
        employee.photo_path = null;
      }
    }
    
    console.log(`✅ Fetched employee ${id} from HR201 'employees' table`);
    
    res.json({
      success: true,
      data: employee,
      source: 'HR201 Database - employees table'
    });
    
  } catch (error) {
    console.error('❌ Error fetching employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee',
      error: error.message
    });
  }
};

// GET /api/201-employees/search/:term - Search employees
export const search201Employees = async (req, res) => {
  try {
    const { term } = req.params;
    const pool = getHR201Pool();
    
    const query = `
      SELECT 
        objid,
        idno,
        dtruserid,
        dtrbadgenumber,
        surname,
        firstname,
        middlename,
        extension,
        birthdate,
        gender,
        civil_status,
        mobile,
        email,
      FROM employees
      WHERE (
          surname LIKE ? OR
          firstname LIKE ? OR
          middlename LIKE ? OR
          dtrbadgenumber LIKE ? OR
          idno LIKE ? OR
          dtruserid LIKE ? OR
          mobile LIKE ? OR
          email LIKE ?
        )
      ORDER BY surname, firstname ASC
      LIMIT 100
    `;
    
    const searchPattern = `%${term}%`;
    const [employees] = await pool.execute(query, [
      searchPattern, searchPattern, searchPattern, searchPattern,
      searchPattern, searchPattern, searchPattern, searchPattern
    ]);
    
    // Format employee names
    employees.forEach(emp => {
      emp.fullname = formatEmployeeName(emp.surname, emp.firstname, emp.middlename, emp.extension);
    });
    
    console.log(`✅ Found ${employees.length} employees matching '${term}'`);
    
    res.json({
      success: true,
      data: employees,
      count: employees.length,
      searchTerm: term
    });
    
  } catch (error) {
    console.error('❌ Error searching employees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search employees',
      error: error.message
    });
  }
};

// GET /api/201-employees/stats - Get employee statistics
export const get201EmployeeStats = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) as active,
        0 as deleted,
        COUNT(CASE WHEN gender = 'Male' THEN 1 END) as male,
        COUNT(CASE WHEN gender = 'Female' THEN 1 END) as female
      FROM employees
    `;
    
    const [statsResult] = await pool.execute(statsQuery);
    const stats = statsResult[0];
    
    console.log(`✅ Fetched employee stats from HR201:`, stats);
    
    res.json({
      success: true,
      data: stats,
      source: 'HR201 Database - employees table'
    });
    
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

// GET /api/201-employees/lookup/appointmenttypes - Get appointment types from MySQL
export const getAppointmentTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT id, appointmentname
      FROM appointmenttypes
      ORDER BY id ASC
    `;
    
    const [appointmentTypes] = await pool.execute(query);
    
    console.log(`✅ Fetched ${appointmentTypes.length} appointment types from HR201 database`);
    
    res.json({
      success: true,
      data: appointmentTypes
    });
  } catch (error) {
    console.error('Error fetching appointment types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment types',
      error: error.message
    });
  }
};

// GET /api/201-employees/lookup/employeestatustypes - Get employee status types from MySQL
export const getEmployeeStatusTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    console.log('🔍 [getEmployeeStatusTypes] Starting fetch from employeestatustypes table...');
    
    // First, verify the table exists
    let tableExists = false;
    try {
      const [tableCheck] = await pool.execute(`
        SELECT COUNT(*) as count
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'employeestatustypes'
      `);
      tableExists = tableCheck[0].count > 0;
      console.log(`🔍 [getEmployeeStatusTypes] Table 'employeestatustypes' exists: ${tableExists}`);
    } catch (schemaError) {
      console.log('⚠️ [getEmployeeStatusTypes] Could not check table existence:', schemaError.message);
    }
    
    // Check what tables exist with 'status' in the name
    let [tables] = [];
    try {
      [tables] = await pool.execute(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME LIKE '%status%'
        ORDER BY TABLE_NAME
      `);
      console.log('🔍 [getEmployeeStatusTypes] Available status-related tables:', tables.map(t => t.TABLE_NAME));
    } catch (schemaError) {
      console.log('⚠️ [getEmployeeStatusTypes] Could not query information_schema:', schemaError.message);
    }
    
    // Try the expected table name first - employeestatustypes with empstatid and empstatname
    let statusTypes = [];
    let lastError = null;
    let usedQuery = null;
    
    const queries = [
      { 
        query: `SELECT empstatid, employeestatus as empstatname FROM employeestatustypes ORDER BY empstatid ASC`, 
        desc: 'employeestatustypes (empstatid, employeestatus)',
        table: 'employeestatustypes'
      },
    ];
    
    for (const q of queries) {
      try {
        console.log(`🔍 [getEmployeeStatusTypes] Trying query: ${q.desc}`);
        const [result] = await pool.execute(q.query);
        if (result && result.length > 0) {
          statusTypes = result;
          usedQuery = q;
          console.log(`✅ [getEmployeeStatusTypes] SUCCESS - Fetched ${statusTypes.length} records from table '${q.table}' using columns: ${q.desc}`);
          console.log(`📊 [getEmployeeStatusTypes] Sample records:`, statusTypes.slice(0, 3));
          break;
        } else {
          console.log(`⚠️ [getEmployeeStatusTypes] Query succeeded but returned 0 records: ${q.desc}`);
        }
      } catch (err) {
        lastError = err;
        console.log(`❌ [getEmployeeStatusTypes] Query failed (${q.desc}):`, err.message);
        continue;
      }
    }
    
    // If no results found
    if (statusTypes.length === 0) {
      console.warn('⚠️ [getEmployeeStatusTypes] No employee status types found. Table may not exist or be empty.');
      if (lastError) {
        console.warn('⚠️ [getEmployeeStatusTypes] Last error:', lastError.message);
      }
      
      // Return empty array instead of error - allows frontend to work
      return res.json({
        success: true,
        data: [],
        warning: 'Employee status types table not found or empty',
        tableChecked: 'employeestatustypes'
      });
    }
    
    console.log(`✅ [getEmployeeStatusTypes] Successfully fetched ${statusTypes.length} employee status types from table '${usedQuery.table}'`);
    
    res.json({
      success: true,
      data: statusTypes,
      source: usedQuery.table,
      count: statusTypes.length
    });
  } catch (error) {
    console.error('❌ [getEmployeeStatusTypes] Error fetching employee status types:', error);
    console.error('❌ [getEmployeeStatusTypes] Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    
    // Return empty array instead of 500 error to prevent frontend crash
    res.json({
      success: true,
      data: [],
      error: error.message,
      warning: 'Could not fetch employee status types',
      tableChecked: 'employeestatustypes'
    });
  }
};

// GET /api/201-employees/lookup/blood-types - Get blood types for PDS form
export const getBloodTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT id, blood_type
      FROM blood_types
      ORDER BY id ASC
    `;
    
    const [bloodTypes] = await pool.execute(query);
    
    console.log(`✅ Fetched ${bloodTypes.length} blood types from HR201 database`);
    
    res.json({
      success: true,
      data: bloodTypes
    });
  } catch (error) {
    console.error('❌ Error fetching blood types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blood types',
      error: error.message
    });
  }
};

// GET /api/201-employees/lookup/civil-statuses - Get civil statuses for PDS form
export const getCivilStatuses = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT id, civil_status
      FROM civilstatus
      ORDER BY id ASC
    `;
    
    const [civilStatuses] = await pool.execute(query);
    
    console.log(`✅ Fetched ${civilStatuses.length} civil statuses from HR201 database`);
    
    res.json({
      success: true,
      data: civilStatuses
    });
  } catch (error) {
    console.error('❌ Error fetching civil statuses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch civil statuses',
      error: error.message
    });
  }
};

// Calculate PDS completeness progress
export const calculatePDSProgress = async (employeeObjId) => {
  const pool = getHR201Pool();
  let totalFields = 0;
  let filledFields = 0;
  
  try {
    // Fetch employee main record
    const [employees] = await pool.execute('SELECT * FROM employees WHERE objid = ?', [employeeObjId]);
    if (!employees.length) return 0;
    const emp = employees[0];
    
    // Page 1: Personal Information (16 fields) - excluding extension (JR., SR) and cs_id_no
    const personalFields = ['surname', 'firstname', 'middlename', 
      'birthdate', 'birthplace', 'gender', 'civil_status', 'height', 'weight', 'blood_type',
      'gsis', 'pagibig', 'philhealth', 'sss', 'tin', 'agency_no'];
    totalFields += personalFields.length;
    filledFields += personalFields.filter(f => emp[f] && emp[f] !== '').length;
    
    // Address fields (12 fields - 6 residential + 6 permanent, excluding House/Block/Lot No.)
    const [addresses] = await pool.execute('SELECT * FROM employee_address WHERE emp_objid = ?', [employeeObjId]);
    const addressFields = ['resi_province', 'resi_city', 'resi_barangay', 'resi_zip', 
      'resi_village', 'resi_street',
      'perma_province', 'perma_city', 'perma_barangay', 'perma_zip', 
      'perma_village', 'perma_street'];
    totalFields += addressFields.length;
    if (addresses.length > 0) {
      filledFields += addressFields.filter(f => addresses[0][f] && addresses[0][f] !== '').length;
    } else {
      // Add 0 for address fields if no address record exists
      filledFields += 0;
    }
    
    // Contact fields (3 fields)
    const contactFields = ['telephone', 'mobile', 'email'];
    totalFields += contactFields.length;
    filledFields += contactFields.filter(f => emp[f] && emp[f] !== '').length;
    
    // Page 2: Family Background
    // Spouse fields (4 fields) - excluding spouse_extension
    const [spouses] = await pool.execute('SELECT * FROM employee_spouses WHERE emp_objid = ?', [employeeObjId]);
    const spouseFields = ['spouse_surname', 'spouse_firstname', 'spouse_middlename', 'spouse_occupation'];
    totalFields += spouseFields.length;
    if (spouses.length > 0) {
      filledFields += spouseFields.filter(f => spouses[0][f] && spouses[0][f] !== '').length;
    }
    
    // Parent fields (6 fields) - excluding father_extension
    const parentFields = ['father_surname', 'father_firstname', 'father_middlename',
      'mother_surname', 'mother_firstname', 'mother_middlename'];
    totalFields += parentFields.length;
    filledFields += parentFields.filter(f => emp[f] && emp[f] !== '').length;
    
    // Children (1 section = 1 field)
    const [children] = await pool.execute('SELECT * FROM employee_childrens WHERE emp_objid = ?', [employeeObjId]);
    totalFields += 1;
    if (children.length > 0 && children.some(c => c.name || c.dateofbirth)) filledFields += 1;
    
    // Education (5 rows = one for each education level)
    const [education] = await pool.execute('SELECT * FROM employee_education WHERE emp_objid = ?', [employeeObjId]);
    totalFields += 5; // 5 education levels as complete rows
    
    // Count complete education rows (all required fields filled)
    let completeEducationRows = 0;
    education.forEach(edu => {
      const hasRequiredFields = 
        edu.school_name && typeof edu.school_name === 'string' && edu.school_name.trim() !== '' &&
        edu.degree_course && typeof edu.degree_course === 'string' && edu.degree_course.trim() !== '' &&
        edu.period_from && typeof edu.period_from === 'string' && edu.period_from.trim() !== '' &&
        edu.period_to && typeof edu.period_to === 'string' && edu.period_to.trim() !== '' &&
        edu.highest_level_units && typeof edu.highest_level_units === 'string' && edu.highest_level_units.trim() !== '' &&
        edu.year_graduated && edu.year_graduated.toString().trim() !== '';
      
      if (hasRequiredFields) {
        completeEducationRows++;
      }
    });
    
    filledFields += completeEducationRows;
    
    // Civil Service Eligibility (1 section = 1 field)
    const [eligibility] = await pool.execute('SELECT * FROM employee_eligibility WHERE emp_objid = ?', [employeeObjId]);
    totalFields += 1;
    if (eligibility.length > 0 && eligibility.some(e => e.career_service)) filledFields += 1;
    
    // Work Experience (1 section = 1 field)
    const [workExp] = await pool.execute('SELECT * FROM employee_workexperience WHERE emp_objid = ?', [employeeObjId]);
    totalFields += 1;
    if (workExp.length > 0 && workExp.some(w => w.position_title || w.department_name)) filledFields += 1;
    
    // Page 3: Voluntary Work, Trainings, Skills, Recognitions, Memberships (5 sections)
    const [voluntary] = await pool.execute('SELECT * FROM employee_voluntary WHERE emp_objid = ?', [employeeObjId]);
    const [trainings] = await pool.execute('SELECT * FROM employee_training WHERE emp_objid = ?', [employeeObjId]);
    const [hobbies] = await pool.execute('SELECT * FROM employee_other_info_hobies WHERE emp_objid = ?', [employeeObjId]);
    const [recognitions] = await pool.execute('SELECT * FROM employee_other_info_recognition WHERE emp_objid = ?', [employeeObjId]);
    const [memberships] = await pool.execute('SELECT * FROM employee_other_info_membership WHERE emp_objid = ?', [employeeObjId]);
    
    totalFields += 5;
    if (voluntary.length > 0) filledFields += 1;
    if (trainings.length > 0) filledFields += 1;
    if (hobbies.length > 0) filledFields += 1;
    if (recognitions.length > 0) filledFields += 1;
    if (memberships.length > 0) filledFields += 1;
    
    // Page 4: Declarations - EXCLUDED from progress calculation
    // totalFields += 27; // 14 booleans + 13 detail fields - EXCLUDED per user request
    
    // References (requires 3 references)
    const [references] = await pool.execute('SELECT * FROM employee_references WHERE emp_objid = ?', [employeeObjId]);
    totalFields += 1;
    if (references.length >= 3 && references.filter(r => r.reference_name).length >= 3) filledFields += 1;
    
    // Government IDs (1 section) - only check active records
    const [govIds] = await pool.execute('SELECT * FROM employee_govid WHERE emp_objid = ? AND status = ?', [employeeObjId, 'active']);
    totalFields += 1;
    if (govIds.length > 0 && govIds.some(g => g.gov_id)) filledFields += 1;
    
    // Media (4 fields: signature, photo, thumb, date_accomplished)
    const [media] = await pool.execute('SELECT * FROM employees_media WHERE emp_objid = ?', [employeeObjId]);
    totalFields += 4;
    let mediaFilled = 0;
    if (media.length > 0) {
      if (media[0].signature_path) {
        filledFields += 1;
        mediaFilled += 1;
      }
      if (media[0].photo_path) {
        filledFields += 1;
        mediaFilled += 1;
      }
      if (media[0].thumb_path) {
        filledFields += 1;
        mediaFilled += 1;
      }
      // Check if date_accomplished is filled (not null and not empty)
      if (media[0].date_accomplished && media[0].date_accomplished !== '' && media[0].date_accomplished !== '0000-00-00') {
        filledFields += 1;
        mediaFilled += 1;
        console.log(`📅 Date accomplished found: ${media[0].date_accomplished}`);
      } else {
        console.log(`📅 Date accomplished missing or empty: ${media[0].date_accomplished}`);
      }
    }
    console.log(`📊 Media section: ${mediaFilled}/4 fields filled`);
    
    const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100 * 100) / 100 : 0;
    console.log(`📊 PDS Progress: ${filledFields}/${totalFields} = ${percentage}%`);
    return percentage;
    
  } catch (error) {
    console.error('Error calculating PDS progress:', error);
    return 0;
  }
};

// Get missing fields with hyperlinks for form focus
export const getMissingFields = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const pool = getHR201Pool();
    
    // Get employee objid from dtruserid
    const [employees] = await pool.execute('SELECT objid FROM employees WHERE dtruserid = ?', [employeeId]);
    if (!employees.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }
    
    const employeeObjId = employees[0].objid;
    
    // Fetch all employee data
    const [empRecords] = await pool.execute('SELECT * FROM employees WHERE objid = ?', [employeeObjId]);
    if (!empRecords.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee record not found' 
      });
    }
    const emp = empRecords[0];
    
    const missingFields = [];
    
    // Helper function to check if field is empty/null
    const isEmpty = (value) => {
      return !value || value === '' || value === 'null' || value === 'undefined' || value === '0000-00-00';
    };
    
    // Helper function to add missing field with hyperlink
    const addMissingField = (fieldName, section, elementId, page = 1) => {
      missingFields.push({
        field: fieldName,
        section: section,
        link: `#${elementId}`,
        page: page,
        focusSelector: elementId
      });
    };
    
    // Page 1: Personal Information
    const personalFields = [
      { field: 'surname', name: 'Surname', selector: 'surname' },
      { field: 'firstname', name: 'First Name', selector: 'firstname' },
      { field: 'middlename', name: 'Middle Name', selector: 'middlename' },
      { field: 'birthdate', name: 'Birth Date', selector: 'birthdate' },
      { field: 'birthplace', name: 'Birth Place', selector: 'birthplace' },
      { field: 'gender', name: 'Gender', selector: 'gender' },
      { field: 'civil_status', name: 'Civil Status', selector: 'civil_status' },
      { field: 'height', name: 'Height', selector: 'height' },
      { field: 'weight', name: 'Weight', selector: 'weight' },
      { field: 'blood_type', name: 'Blood Type', selector: 'blood_type' },
      { field: 'gsis', name: 'GSIS ID', selector: 'gsis' },
      { field: 'pagibig', name: 'PAG-IBIG ID', selector: 'pagibig' },
      { field: 'philhealth', name: 'PhilHealth ID', selector: 'philhealth' },
      { field: 'sss', name: 'SSS ID', selector: 'sss' },
      { field: 'tin', name: 'TIN', selector: 'tin' },
      { field: 'agency_no', name: 'Agency Employee No.', selector: 'agency_no' }
    ];
    
    personalFields.forEach(({ field, name, selector }) => {
      if (isEmpty(emp[field])) {
        addMissingField(name, 'Personal Information', selector, 1);
      }
    });
    
    // Address fields
    const [addresses] = await pool.execute('SELECT * FROM employee_address WHERE emp_objid = ?', [employeeObjId]);
    const addressData = addresses.length > 0 ? addresses[0] : {};
    
    const addressFields = [
      { field: 'resi_province', name: 'Residential Province', selector: 'resi_province' },
      { field: 'resi_city', name: 'Residential City', selector: 'resi_city' },
      { field: 'resi_barangay', name: 'Residential Barangay', selector: 'resi_barangay' },
      { field: 'resi_zip', name: 'Residential ZIP Code', selector: 'resi_zip' },
      { field: 'resi_village', name: 'Residential Village', selector: 'resi_village' },
      { field: 'resi_street', name: 'Residential Street', selector: 'resi_street' },
      { field: 'perma_province', name: 'Permanent Province', selector: 'perma_province' },
      { field: 'perma_city', name: 'Permanent City', selector: 'perma_city' },
      { field: 'perma_barangay', name: 'Permanent Barangay', selector: 'perma_barangay' },
      { field: 'perma_zip', name: 'Permanent ZIP Code', selector: 'perma_zip' },
      { field: 'perma_village', name: 'Permanent Village', selector: 'perma_village' },
      { field: 'perma_street', name: 'Permanent Street', selector: 'perma_street' }
    ];
    
    addressFields.forEach(({ field, name, selector }) => {
      if (isEmpty(addressData[field])) {
        addMissingField(name, 'Address Information', selector, 1);
      }
    });
    
    // Contact fields
    const contactFields = [
      { field: 'telephone', name: 'Telephone Number', selector: 'telephone' },
      { field: 'mobile', name: 'Mobile Number', selector: 'mobile' },
      { field: 'email', name: 'Email Address', selector: 'email' }
    ];
    
    contactFields.forEach(({ field, name, selector }) => {
      if (isEmpty(emp[field])) {
        addMissingField(name, 'Contact Information', selector, 1);
      }
    });
    
    // Page 2: Family Background
    const [spouses] = await pool.execute('SELECT * FROM employee_spouses WHERE emp_objid = ?', [employeeObjId]);
    const spouseData = spouses.length > 0 ? spouses[0] : {};
    
    const spouseFields = [
      { field: 'spouse_surname', name: 'Spouse Surname', selector: 'spouse_surname' },
      { field: 'spouse_firstname', name: 'Spouse First Name', selector: 'spouse_firstname' },
      { field: 'spouse_middlename', name: 'Spouse Middle Name', selector: 'spouse_middlename' },
      { field: 'spouse_occupation', name: 'Spouse Occupation', selector: 'spouse_occupation' }
    ];
    
    spouseFields.forEach(({ field, name, selector }) => {
      if (isEmpty(spouseData[field])) {
        addMissingField(name, 'Spouse Information', selector, 2);
      }
    });
    
    // Parent fields
    const parentFields = [
      { field: 'father_surname', name: 'Father Surname', selector: 'father_surname' },
      { field: 'father_firstname', name: 'Father First Name', selector: 'father_firstname' },
      { field: 'father_middlename', name: 'Father Middle Name', selector: 'father_middlename' },
      { field: 'mother_surname', name: 'Mother Surname', selector: 'mother_surname' },
      { field: 'mother_firstname', name: 'Mother First Name', selector: 'mother_firstname' },
      { field: 'mother_middlename', name: 'Mother Middle Name', selector: 'mother_middlename' }
    ];
    
    parentFields.forEach(({ field, name, selector }) => {
      if (isEmpty(emp[field])) {
        addMissingField(name, 'Parent Information', selector, 2);
      }
    });
    
    // Children section
    const [children] = await pool.execute('SELECT * FROM employee_childrens WHERE emp_objid = ?', [employeeObjId]);
    if (!children.length || !children.some(c => c.name || c.dateofbirth)) {
      addMissingField('Children Information', 'Family Background', 'children-section', 2);
    }
    
    // Education section
    const [education] = await pool.execute('SELECT * FROM employee_education WHERE emp_objid = ?', [employeeObjId]);
    const requiredEducationLevels = 5;
    let completeEducationRows = 0;
    
    education.forEach(edu => {
      const hasRequiredFields = 
        edu.school_name && typeof edu.school_name === 'string' && edu.school_name.trim() !== '' &&
        edu.degree_course && typeof edu.degree_course === 'string' && edu.degree_course.trim() !== '' &&
        edu.period_from && typeof edu.period_from === 'string' && edu.period_from.trim() !== '' &&
        edu.period_to && typeof edu.period_to === 'string' && edu.period_to.trim() !== '' &&
        edu.highest_level_units && typeof edu.highest_level_units === 'string' && edu.highest_level_units.trim() !== '' &&
        edu.year_graduated && edu.year_graduated.toString().trim() !== '';
      
      if (hasRequiredFields) {
        completeEducationRows++;
      }
    });
    
    if (completeEducationRows < requiredEducationLevels) {
      addMissingField('Education Background', 'Education Information', 'education-section', 2);
    }
    
    // Civil Service Eligibility
    const [eligibility] = await pool.execute('SELECT * FROM employee_eligibility WHERE emp_objid = ?', [employeeObjId]);
    if (!eligibility.length || !eligibility.some(e => e.career_service)) {
      addMissingField('Civil Service Eligibility', 'Eligibility Information', 'eligibility-section', 2);
    }
    
    // Work Experience
    const [workExp] = await pool.execute('SELECT * FROM employee_workexperience WHERE emp_objid = ?', [employeeObjId]);
    if (!workExp.length || !workExp.some(w => w.position_title || w.department_name)) {
      addMissingField('Work Experience', 'Work History', 'work-experience-section', 2);
    }
    
    // Page 3: Voluntary Work, Trainings, Skills, Recognitions, Memberships
    const [voluntary] = await pool.execute('SELECT * FROM employee_voluntary WHERE emp_objid = ?', [employeeObjId]);
    if (!voluntary.length) {
      addMissingField('Voluntary Work', 'Voluntary Work Information', 'voluntary-section', 3);
    }
    
    const [trainings] = await pool.execute('SELECT * FROM employee_training WHERE emp_objid = ?', [employeeObjId]);
    if (!trainings.length) {
      addMissingField('Training Programs', 'Training Information', 'training-section', 3);
    }
    
    const [hobbies] = await pool.execute('SELECT * FROM employee_other_info_hobies WHERE emp_objid = ?', [employeeObjId]);
    if (!hobbies.length) {
      addMissingField('Skills & Hobbies', 'Other Information', 'skills-section', 3);
    }
    
    const [recognitions] = await pool.execute('SELECT * FROM employee_other_info_recognition WHERE emp_objid = ?', [employeeObjId]);
    if (!recognitions.length) {
      addMissingField('Recognition/Awards', 'Other Information', 'recognitions-section', 3);
    }
    
    const [memberships] = await pool.execute('SELECT * FROM employee_other_info_membership WHERE emp_objid = ?', [employeeObjId]);
    if (!memberships.length) {
      addMissingField('Memberships', 'Other Information', 'memberships-section', 3);
    }
    
    // References
    const [references] = await pool.execute('SELECT * FROM employee_references WHERE emp_objid = ?', [employeeObjId]);
    if (references.length < 3 || references.filter(r => r.reference_name).length < 3) {
      addMissingField('Character References', 'References', 'references-section', 4);
    }
    
    // Government IDs
    const [govIds] = await pool.execute('SELECT * FROM employee_govid WHERE emp_objid = ? AND status = ?', [employeeObjId, 'active']);
    if (!govIds.length || !govIds.some(g => g.gov_id)) {
      addMissingField('Government IDs', 'Government IDs', 'gov-ids-section', 4);
    }
    
    // Media fields
    const [media] = await pool.execute('SELECT * FROM employees_media WHERE emp_objid = ?', [employeeObjId]);
    if (media.length === 0) {
      addMissingField('Signature', 'Signature & Photo', 'signature-section', 4);
      addMissingField('Photo', 'Signature & Photo', 'photo-section', 4);
      addMissingField('Right Thumbmark', 'Signature & Photo', 'thumbmark-section', 4);
      addMissingField('Date Accomplished', 'Signature & Photo', 'date-accomplished', 4);
    } else {
      const mediaData = media[0];
      if (isEmpty(mediaData.signature_path)) {
        addMissingField('Signature', 'Signature & Photo', 'signature-section', 4);
      }
      if (isEmpty(mediaData.photo_path)) {
        addMissingField('Photo', 'Signature & Photo', 'photo-section', 4);
      }
      if (isEmpty(mediaData.thumb_path)) {
        addMissingField('Right Thumbmark', 'Signature & Photo', 'thumbmark-section', 4);
      }
      if (isEmpty(mediaData.date_accomplished)) {
        addMissingField('Date Accomplished', 'Signature & Photo', 'date-accomplished', 4);
      }
    }
    
    // Group missing fields by page and section
    const groupedFields = missingFields.reduce((acc, field) => {
      if (!acc[field.page]) {
        acc[field.page] = {};
      }
      if (!acc[field.page][field.section]) {
        acc[field.page][field.section] = [];
      }
      acc[field.page][field.section].push(field);
      return acc;
    }, {});
    
    const totalMissing = missingFields.length;
    
    res.json({
      success: true,
      totalMissing,
      missingFields: groupedFields,
      message: totalMissing === 0 ? 'All required fields are completed' : `${totalMissing} required field(s) are missing`
    });
    
  } catch (error) {
    console.error('Error getting missing fields:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving missing fields',
      error: error.message
    });
  }
};

// POST /api/201-employees/pds - Save complete PDS data
export const savePDS = async (req, res) => {
  try {
    // Debug: Log the entire request body
    console.log('📝 [savePDS] Full request body:', JSON.stringify(req.body, null, 2));
    
    const pool = getHR201Pool();
    const {
      employee = {},
      children = [],
      education = [],
      civil_service_eligibility = [],
      work_experience = [],
      // Page 3 data
      voluntary_work = [],
      trainings = [],
      skills = [],
      recognitions = [],
      memberships = [],
      // Page 4 data
      declarations = {},
      references = [],
      government_ids = [],
      is_replacing_gov_id = false,
      signature_data,
      photo_data,
      thumbmark_data,
      is_draft = false
    } = req.body;

    await pool.query('START TRANSACTION');
    console.log('📝 [savePDS] Transaction started');

    try {
      // Debug: Log the incoming employee data
      console.log('📝 [savePDS] Received employee data:', {
        dtruserid: employee.dtruserid,
        date_of_birth: employee.date_of_birth,
        place_of_birth: employee.place_of_birth,
        birthdate: employee.birthdate,
        birthplace: employee.birthplace
      });

      // Helper function to normalize date fields
      const normalizeDate = (value) => {
        if (!value || value === '' || value === 'null' || value === 'undefined') {
          return null;
        }
        
        // Ensure we return actual null, not string "null"
        if (value === 'null') {
          return null;
        }
        
        // Handle ISO date strings (e.g., '1990-05-14T16:00:00.000Z')
        if (typeof value === 'string' && value.includes('T')) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
        
        // Handle Date objects
        if (value instanceof Date && !isNaN(value.getTime())) {
          return value.toISOString().split('T')[0];
        }
        
        // Handle YYYY-MM-DD format strings (already correct format)
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value;
        }
        
        // Handle DD/M/YYYY format (from database) - convert to YYYY-MM-DD
        if (typeof value === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
          const [day, month, year] = value.split('/');
          const paddedDay = day.padStart(2, '0');
          const paddedMonth = month.padStart(2, '0');
          const formattedDate = `${year}-${paddedMonth}-${paddedDay}`;
          return formattedDate;
        }
        
        // Try to parse any other string as a date
        if (typeof value === 'string') {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
        
        return value;
      };

      // Helper function to normalize year fields (convert year to date)
      const normalizeYear = (value) => {
        if (!value || value === '' || value === 'null' || value === 'undefined') return null;
        
        // Convert to string and trim whitespace
        const stringValue = String(value).trim();
        
        // If it's just a year (4 digits), convert to January 1st of that year
        if (/^\d{4}$/.test(stringValue)) {
          const year = parseInt(stringValue);
          // Validate year range (reasonable graduation years)
          if (year >= 1900 && year <= new Date().getFullYear() + 10) {
            return `${year}-01-01`;
          } else {
            console.log(`⚠️ Invalid year value: ${value}, skipping`);
            return null;
          }
        }
        
        // If it's already a valid date format, return as is
        if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
          return stringValue;
        }
        
        console.log(`⚠️ Invalid year format: ${value}, skipping`);
        return null;
      };

      // Normalize incoming employee fields with truncation
      const normalized = {
        dtruserid: employee.dtruserid ?? employee.DTRuserID ?? null,
        dtrbadgenumber: employee.dtrbadgenumber ?? employee.BadgeNumber ?? null,
        surname: employee.surname ? employee.surname.toString().substring(0, 100) : '',
        firstname: employee.firstname ? employee.firstname.toString().substring(0, 100) : '',
        middlename: employee.middlename ? employee.middlename.toString().substring(0, 100) : '',
        extension: employee.extension ?? employee.name_extension ? (employee.extension ?? employee.name_extension).toString().substring(0, 10) : '',
        birthdate: normalizeDate(employee.date_of_birth ?? employee.birthdate),
        birthplace: employee.place_of_birth ?? employee.birthplace ? (employee.place_of_birth ?? employee.birthplace).toString().substring(0, 200) : '',
        gender: employee.sex ?? employee.gender ?? '',
        civil_status: employee.civil_status ?? '',
        height: employee.height ? employee.height.toString().substring(0, 5) : null,
        weight: employee.weight ? employee.weight.toString().substring(0, 5) : null,
        blood_type: employee.blood_type ? employee.blood_type.toString().substring(0, 4) : null,
        gsis: employee.gsis ? employee.gsis.toString().substring(0, 20) : null,
        pagibig: employee.pagibig ? employee.pagibig.toString().substring(0, 20) : null,
        philhealth: employee.philhealth ? employee.philhealth.toString().substring(0, 20) : null,
        sss: employee.sss ? employee.sss.toString().substring(0, 20) : null,
        tin: employee.tin ? employee.tin.toString().substring(0, 20) : null,
        agency_no: employee.agency_no ? employee.agency_no.toString().substring(0, 20) : null,
        citizenship: employee.citizenship_filipino ? 'Filipino' : employee.citizenship ?? null,
        dual_citizenship_type: employee.citizenship_dual && employee.dual_citizenship_type ? employee.dual_citizenship_type.toString().substring(0, 50) : null,
        dual_citizenship_country: employee.citizenship_dual && employee.dual_citizenship_country ? employee.dual_citizenship_country.toString().substring(0, 100) : null,
        telephone: employee.telephone ? employee.telephone.toString().substring(0, 20) : null,
        mobile: employee.mobile ? employee.mobile.toString().substring(0, 20) : null,
        email: employee.email ? employee.email.toString().substring(0, 255) : null,
        father_surname: employee.father_surname ? employee.father_surname.toString().substring(0, 100) : null,
        father_firstname: employee.father_firstname ? employee.father_firstname.toString().substring(0, 100) : null,
        father_middlename: employee.father_middlename ? employee.father_middlename.toString().substring(0, 100) : null,
        father_extension: employee.father_extension ? employee.father_extension.toString().substring(0, 10) : null,
        mother_surname: employee.mother_surname ? employee.mother_surname.toString().substring(0, 100) : null,
        mother_firstname: employee.mother_firstname ? employee.mother_firstname.toString().substring(0, 100) : null,
        mother_middlename: employee.mother_middlename ? employee.mother_middlename.toString().substring(0, 100) : null
      };

      // Debug: Log the normalized data
      console.log('📝 [savePDS] Normalized employee data:', {
        birthdate: normalized.birthdate,
        birthplace: normalized.birthplace,
        gender: normalized.gender
      });

      // Use provided objid if available, otherwise lookup by dtruserid
      let employeeObjId;
      let isExistingEmployee = false;
      
      if (employee.objid) {
        // Use the provided objid (from selected employee)
        employeeObjId = employee.objid;
        console.log(`📝 [savePDS] Using provided employee objid: ${employeeObjId}`);
        
        // Check if this employee already exists
        const [existingCheck] = await pool.execute(
          'SELECT objid FROM employees WHERE objid = ? LIMIT 1',
          [employeeObjId]
        );
        isExistingEmployee = existingCheck.length > 0;
        console.log(`📝 [savePDS] Employee exists check: ${isExistingEmployee}`);
      } else {
        // Fallback: lookup by dtruserid
        const [existing] = await pool.execute(
          'SELECT objid FROM employees WHERE dtruserid = ? LIMIT 1',
          [normalized.dtruserid]
        );
        employeeObjId = existing.length ? existing[0].objid : uuidv4();
        isExistingEmployee = existing.length > 0;
        console.log(`📝 [savePDS] Employee lookup by dtruserid: ${normalized.dtruserid}, found existing: ${existing.length}, objid: ${employeeObjId}`);
      }

      if (isExistingEmployee) {
        console.log('📝 [savePDS] Executing UPDATE for existing employee...');
        console.log('📝 [savePDS] UPDATE values:', {
          birthdate: normalized.birthdate,
          birthplace: normalized.birthplace,
          gender: normalized.gender,
          employeeObjId: employeeObjId
        });
        
        await pool.execute(`
          UPDATE employees SET
            dtrbadgenumber = ?, surname = ?, firstname = ?, middlename = ?, extension = ?,
            birthdate = ?, birthplace = ?, gender = ?, civil_status = ?,
            height = ?, weight = ?, blood_type = ?, gsis = ?, pagibig = ?, philhealth = ?, sss = ?, tin = ?, agency_no = ?,
            citizenship = ?, dual_citizenship_type = ?, dual_citizenship_country = ?,
            telephone = ?, mobile = ?, email = ?,
            father_surname = ?, father_firstname = ?, father_middlename = ?, father_extension = ?,
            mother_surname = ?, mother_firstname = ?, mother_middlename = ?,
            updated_at = NOW()
          WHERE objid = ?
        `, [
          normalized.dtrbadgenumber, normalized.surname, normalized.firstname, normalized.middlename, normalized.extension,
          normalized.birthdate, normalized.birthplace, normalized.gender, normalized.civil_status,
          normalized.height, normalized.weight, normalized.blood_type, normalized.gsis, normalized.pagibig, normalized.philhealth, normalized.sss, normalized.tin, normalized.agency_no,
          normalized.citizenship, normalized.dual_citizenship_type, normalized.dual_citizenship_country,
          normalized.telephone, normalized.mobile, normalized.email,
          normalized.father_surname, normalized.father_firstname, normalized.father_middlename, normalized.father_extension,
          normalized.mother_surname, normalized.mother_firstname, normalized.mother_middlename,
          employeeObjId
        ]);
        console.log('✅ [savePDS] Employee UPDATE completed successfully');
        
        // Verify the update by querying the database
        const [verifyResult] = await pool.execute(
          'SELECT birthdate, birthplace, gender FROM employees WHERE objid = ?',
          [employeeObjId]
        );
        console.log('📝 [savePDS] Verification query result:', {
          birthdate: verifyResult[0]?.birthdate,
          birthplace: verifyResult[0]?.birthplace,
          gender: verifyResult[0]?.gender
        });
      } else {
        await pool.execute(`
          INSERT INTO employees (
            objid, dtruserid, dtrbadgenumber, surname, firstname, middlename, extension,
            birthdate, birthplace, gender, civil_status,
            height, weight, blood_type, gsis, pagibig, philhealth, sss, tin, agency_no,
            citizenship, dual_citizenship_type, dual_citizenship_country,
            telephone, mobile, email,
            father_surname, father_firstname, father_middlename, father_extension,
            mother_surname, mother_firstname, mother_middlename,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          employeeObjId,
          normalized.dtruserid, normalized.dtrbadgenumber, normalized.surname, normalized.firstname, normalized.middlename, normalized.extension,
          normalized.birthdate, normalized.birthplace, normalized.gender, normalized.civil_status,
          normalized.height, normalized.weight, normalized.blood_type, normalized.gsis, normalized.pagibig, normalized.philhealth, normalized.sss, normalized.tin, normalized.agency_no,
          normalized.citizenship, normalized.dual_citizenship_type, normalized.dual_citizenship_country,
          normalized.telephone, normalized.mobile, normalized.email,
          normalized.father_surname, normalized.father_firstname, normalized.father_middlename, normalized.father_extension,
          normalized.mother_surname, normalized.mother_firstname, normalized.mother_middlename,
          new Date(), new Date()
        ]);
        console.log('✅ [savePDS] Employee INSERT completed successfully');
      }

      // Upsert declarations if provided
      if (declarations && Object.keys(declarations).length > 0) {
        const toBit = v => (v === true || v === 'true' || v === 1 || v === '1') ? 1 : 0;
        const decl = {
          thirtyfour_a: toBit(declarations.third_degree),
          thirtyfour_b: toBit(declarations.fourth_degree),
          thirtyfour_b_details: declarations.fourth_degree_details || null,
          thirtyfive_a: toBit(declarations.guilty_admin),
          thirtyfive_a_details: declarations.guilty_admin_details || null,
          thirtyfive_b: toBit(declarations.criminally_charged),
          thirtyfive_datefiled: declarations.criminally_charged_date || null,
          thirtyfive_statuses: declarations.criminally_charged_status || null,
          thirtysix: toBit(declarations.convicted),
          thirtysix_details: declarations.convicted_details || null,
          thirtyseven: toBit(declarations.separated_service),
          thirtyseven_details: declarations.separated_service_details || null,
          thirtyeight_a: toBit(declarations.candidate),
          thirtyeight_a_details: declarations.candidate_details || null,
          thirtyeight_b: toBit(declarations.resigned_campaign),
          thirtyeight_b_details: declarations.resigned_campaign_details || null,
          thirtynine: toBit(declarations.immigrant),
          thirtynine_details: declarations.immigrant_country || null,
          forty_a: toBit(declarations.indigenous_group),
          forty_a_details: declarations.indigenous_group_details || null,
          forty_b: toBit(declarations.pwd),
          forty_b_details: declarations.pwd_id_no || null,
          forty_c: toBit(declarations.solo_parent),
          forty_c_details: declarations.solo_parent_id_no || null
        };

        const [existingDecl] = await pool.execute('SELECT objid FROM employee_declaration WHERE emp_objid = ? LIMIT 1', [employeeObjId]);
        if (existingDecl.length) {
          await pool.execute(`
            UPDATE employee_declaration SET
              thirtyfour_a=?, thirtyfour_b=?, thirtyfour_b_details=?,
              thirtyfive_a=?, thirtyfive_a_details=?, thirtyfive_b=?, thirtyfive_datefiled=?, thirtyfive_statuses=?,
              thirtysix=?, thirtysix_details=?, thirtyseven=?, thirtyseven_details=?,
              thirtyeight_a=?, thirtyeight_a_details=?, thirtyeight_b=?, thirtyeight_b_details=?,
              thirtynine=?, thirtynine_details=?, forty_a=?, forty_a_details=?,
              forty_b=?, forty_b_details=?, forty_c=?, forty_c_details=?,
              updated_at=NOW()
            WHERE emp_objid=?
          `, [
            decl.thirtyfour_a, decl.thirtyfour_b, decl.thirtyfour_b_details,
            decl.thirtyfive_a, decl.thirtyfive_a_details, decl.thirtyfive_b, decl.thirtyfive_datefiled, decl.thirtyfive_statuses,
            decl.thirtysix, decl.thirtysix_details, decl.thirtyseven, decl.thirtyseven_details,
            decl.thirtyeight_a, decl.thirtyeight_a_details, decl.thirtyeight_b, decl.thirtyeight_b_details,
            decl.thirtynine, decl.thirtynine_details, decl.forty_a, decl.forty_a_details,
            decl.forty_b, decl.forty_b_details, decl.forty_c, decl.forty_c_details,
            employeeObjId
          ]);
        } else {
          await pool.execute(`
            INSERT INTO employee_declaration (
              objid, emp_objid,
              thirtyfour_a, thirtyfour_b, thirtyfour_b_details,
              thirtyfive_a, thirtyfive_a_details, thirtyfive_b, thirtyfive_datefiled, thirtyfive_statuses,
              thirtysix, thirtysix_details, thirtyseven, thirtyseven_details,
              thirtyeight_a, thirtyeight_a_details, thirtyeight_b, thirtyeight_b_details,
              thirtynine, thirtynine_details, forty_a, forty_a_details, forty_b, forty_b_details, forty_c, forty_c_details,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, [
            uuidv4(), employeeObjId,
            decl.thirtyfour_a, decl.thirtyfour_b, decl.thirtyfour_b_details,
            decl.thirtyfive_a, decl.thirtyfive_a_details, decl.thirtyfive_b, decl.thirtyfive_datefiled, decl.thirtyfive_statuses,
            decl.thirtysix, decl.thirtysix_details, decl.thirtyseven, decl.thirtyseven_details,
            decl.thirtyeight_a, decl.thirtyeight_a_details, decl.thirtyeight_b, decl.thirtyeight_b_details,
            decl.thirtynine, decl.thirtynine_details, decl.forty_a, decl.forty_a_details,
            decl.forty_b, decl.forty_b_details, decl.forty_c, decl.forty_c_details
          ]);
        }
      }

      // Save references records
      if (references && references.length > 0) {
        await pool.execute('DELETE FROM employee_references WHERE emp_objid = ?', [employeeObjId]);
        for (const ref of references) {
          if (ref.reference_name) {
            await pool.execute(`
              INSERT INTO employee_references (
                objid, emp_objid, reference_name, reference_address, reference_phone,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              ref.reference_name || null,
              ref.reference_address || null,
              ref.reference_tel_no || null
            ]);
          }
        }
        console.log(`✅ Saved ${references.length} reference records`);
      }

      // Save government IDs records - only update if replace flag is triggered
      if (government_ids && government_ids.length > 0 && is_replacing_gov_id) {
        console.log(`🔍 [Backend] Replace flag is TRUE - processing government ID changes`);
        console.log(`🔍 [Backend] Received government_ids:`, government_ids);
        
        // Mark all existing government IDs as inactive instead of deleting
        await pool.execute('UPDATE employee_govid SET status = ? WHERE emp_objid = ?', ['inactive', employeeObjId]);
        
        // Insert new government ID as active
        for (const govId of government_ids) {
          if (govId.government_issued_id || govId.id_number) {
            await pool.execute(`
              INSERT INTO employee_govid (
                objid, emp_objid, gov_id, gov_id_number, gov_id_dateissued, gov_id_placeissued,
                status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              govId.government_issued_id || null,
              govId.id_number || null,
              normalizeDate(govId.date_issued) || null,
              govId.place_of_issuance || null,
              'active'
            ]);
          }
        }
        console.log(`✅ Saved ${government_ids.length} government ID records (marked previous as inactive)`);
      } else {
        console.log(`🔍 [Backend] Replace flag is FALSE - skipping government ID update`);
        console.log(`🔍 [Backend] Government IDs will not be modified unless replace flag is triggered`);
      }

      // Save education records
      if (education && education.length > 0) {
        // Delete existing education records
        await pool.execute('DELETE FROM employee_education WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new education records
        for (const edu of education) {
          if (edu.level || edu.school_name || edu.degree_course) {
            // Truncate fields to match database schema lengths
            const truncated = {
              level: (edu.level || '').substring(0, 25),
              school_name: (edu.school_name || '').substring(0, 25),
              course: (edu.degree_course || '').substring(0, 50),
              highest_level: (edu.highest_level_units || '').substring(0, 15),
              honor_received: (edu.scholarship_honors || '').substring(0, 25)
            };

            const normalizedYear = normalizeYear(edu.year_graduated);
            console.log(`📝 Saving education record:`, {
              level: truncated.level,
              school_name: truncated.school_name,
              course: truncated.course,
              period_from: edu.period_from,
              period_to: edu.period_to,
              highest_level: truncated.highest_level,
              year_graduated_raw: edu.year_graduated,
              year_graduated_normalized: normalizedYear,
              honor_received: truncated.honor_received
            });

            await pool.execute(`
              INSERT INTO employee_education (
                objid, emp_objid, level, school_name, course, 
                \`from\`, \`to\`, highest_level, year_graduated, honor_received,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              truncated.level || null,
              truncated.school_name || null,
              truncated.course || null,
              normalizeDate(edu.period_from) || null,
              normalizeDate(edu.period_to) || null,
              truncated.highest_level || null,
              normalizedYear,
              truncated.honor_received || null
            ]);
          }
        }
        console.log(`✅ Saved ${education.length} education records`);
      }

      // Save children records
      if (children && children.length > 0) {
        // Delete existing children records
        await pool.execute('DELETE FROM employee_childrens WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new children records
        for (const child of children) {
          if (child.full_name || child.date_of_birth) {
            await pool.execute(`
              INSERT INTO employee_childrens (
                objid, emp_objid, name, dateofbirth, created_at, updated_at
              ) VALUES (?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              child.full_name ? child.full_name.toString().substring(0, 200) : null,
              normalizeDate(child.date_of_birth) || null
            ]);
          }
        }
        console.log(`✅ Saved ${children.length} children records`);
      }

      // Save address records
      if (employee) {
        // Delete existing address records
        await pool.execute('DELETE FROM employee_address WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new address record
        await pool.execute(`
          INSERT INTO employee_address (
            objid, emp_objid, 
            resi_province, resi_city, resi_barangay, resi_zip, resi_village, resi_street, resi_house,
            perma_province, perma_city, perma_barangay, perma_zip, perma_village, perma_street, perma_house
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(), employeeObjId,
          employee.residential_province ? employee.residential_province.toString().substring(0, 100) : null,
          employee.residential_city_municipality ? employee.residential_city_municipality.toString().substring(0, 100) : null,
          employee.residential_barangay ? employee.residential_barangay.toString().substring(0, 100) : null,
          employee.residential_zip_code ? employee.residential_zip_code.toString().substring(0, 10) : null,
          employee.residential_subdivision_village ? employee.residential_subdivision_village.toString().substring(0, 200) : null,
          employee.residential_street ? employee.residential_street.toString().substring(0, 200) : null,
          employee.residential_house_block_lot ? employee.residential_house_block_lot.toString().substring(0, 100) : null,
          employee.permanent_province ? employee.permanent_province.toString().substring(0, 100) : null,
          employee.permanent_city_municipality ? employee.permanent_city_municipality.toString().substring(0, 100) : null,
          employee.permanent_barangay ? employee.permanent_barangay.toString().substring(0, 100) : null,
          employee.permanent_zip_code ? employee.permanent_zip_code.toString().substring(0, 10) : null,
          employee.permanent_subdivision_village ? employee.permanent_subdivision_village.toString().substring(0, 200) : null,
          employee.permanent_street ? employee.permanent_street.toString().substring(0, 200) : null,
          employee.permanent_house_block_lot ? employee.permanent_house_block_lot.toString().substring(0, 100) : null
        ]);
        console.log(`✅ Saved address records`);
      }

      // Save spouse information
      if (employee && (employee.spouse_surname || employee.spouse_firstname || employee.spouse_middlename)) {
        // Delete existing spouse records
        await pool.execute('DELETE FROM employee_spouses WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new spouse record
        await pool.execute(`
          INSERT INTO employee_spouses (
            objid, emp_objid, 
            spouse_surname, spouse_firstname, spouse_middlename, spouse_extension,
            spouse_occupation, employer_businessname, business_address, telephone_no, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(), employeeObjId,
          employee.spouse_surname ? employee.spouse_surname.toString().substring(0, 50) : null,
          employee.spouse_firstname ? employee.spouse_firstname.toString().substring(0, 50) : null,
          employee.spouse_middlename ? employee.spouse_middlename.toString().substring(0, 50) : null,
          employee.spouse_extension ? employee.spouse_extension.toString().substring(0, 10) : null,
          employee.spouse_occupation ? employee.spouse_occupation.toString().substring(0, 30) : null,
          employee.spouse_employer_business_name ? employee.spouse_employer_business_name.toString().substring(0, 50) : null,
          employee.spouse_business_address ? employee.spouse_business_address.toString().substring(0, 100) : null,
          employee.spouse_telephone ? employee.spouse_telephone.toString().substring(0, 15) : null,
          'Active' // Default status
        ]);
        console.log(`✅ Saved spouse record`);
      }

      // Save civil service eligibility records
      if (civil_service_eligibility && civil_service_eligibility.length > 0) {
        // Delete existing eligibility records
        await pool.execute('DELETE FROM employee_eligibility WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new eligibility records
        for (const el of civil_service_eligibility) {
          if (el.eligibility_type || el.rating) {
            // Get the ID for the eligibility type
            let careerServiceId = null;
            if (el.eligibility_type) {
              const [eligibilityTypeResult] = await pool.execute(
                'SELECT id FROM eligibilitytypes WHERE careertypes = ? LIMIT 1',
                [el.eligibility_type]
              );
              if (eligibilityTypeResult.length > 0) {
                careerServiceId = eligibilityTypeResult[0].id;
              }
            }
            
            await pool.execute(`
              INSERT INTO employee_eligibility (
                objid, emp_objid, career_service, rating, date_of_exam, 
                place_of_exam, license_number, license_validity,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              careerServiceId,
              el.rating || null,
              normalizeDate(el.date_of_examination) || null,
              el.place_of_examination || null,
              el.license_number || null,
              normalizeDate(el.date_of_validity) || null
            ]);
          }
        }
        console.log(`✅ Saved ${civil_service_eligibility.length} eligibility records`);
      }

      // Save work experience records
      if (work_experience && work_experience.length > 0) {
        // Delete existing work experience records
        await pool.execute('DELETE FROM employee_workexperience WHERE emp_objid = ?', [employeeObjId]);
        
        // Insert new work experience records
        for (const work of work_experience) {
          if (work.position_title || work.department_agency_company) {
            await pool.execute(`
              INSERT INTO employee_workexperience (
                objid, emp_objid, \`from\`, \`to\`, ispresent, position, 
                department_name, monthly_salary, pay_grade, appointment_status, gov_service,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              normalizeDate(work.date_from) || null,
              work.is_present ? null : (normalizeDate(work.date_to) || null),
              work.is_present ? 1 : 0,
              work.position_title || null,
              work.department_agency_company || null,
              work.monthly_salary || null,
              work.salary_grade_step || null,
              work.status_of_appointment || null,
              work.government_service || null
            ]);
          }
        }
        console.log(`✅ Saved ${work_experience.length} work experience records`);
      }

      // ============ PAGE 3 DATA SAVE ============
      
      // Save voluntary work records
      if (voluntary_work && voluntary_work.length > 0) {
        await pool.execute('DELETE FROM employee_voluntary WHERE emp_objid = ?', [employeeObjId]);
        for (const work of voluntary_work) {
          if (work.organization_name_address || work.position_nature_of_work) {
            await pool.execute(`
              INSERT INTO employee_voluntary (
                objid, emp_objid, org_address, \`from\`, \`to\`, num_of_hours, position_of_work,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              work.organization_name_address || null,
              normalizeDate(work.date_from) || null,
              normalizeDate(work.date_to) || null,
              work.number_of_hours || null,
              work.position_nature_of_work || null
            ]);
          }
        }
        console.log(`✅ Saved ${voluntary_work.length} voluntary work records`);
      }

      // Save training records
      if (trainings && trainings.length > 0) {
        await pool.execute('DELETE FROM employee_training WHERE emp_objid = ?', [employeeObjId]);
        for (const training of trainings) {
          if (training.training_title || training.conducted_sponsored_by) {
            await pool.execute(`
              INSERT INTO employee_training (
                objid, emp_objid, title, \`from\`, \`to\`, num_of_hours, type, conducted,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
              uuidv4(), employeeObjId,
              training.training_title || null,
              normalizeDate(training.date_from) || null,
              normalizeDate(training.date_to) || null,
              training.number_of_hours || null,
              training.type_of_ld || null,
              training.conducted_sponsored_by || null
            ]);
          }
        }
        console.log(`✅ Saved ${trainings.length} training records`);
      }

      // Save skills/hobbies records
      if (skills && skills.length > 0) {
        await pool.execute('DELETE FROM employee_other_info_hobies WHERE emp_objid = ?', [employeeObjId]);
        for (const skill of skills) {
          if (skill.skill_hobby) {
            await pool.execute(`
              INSERT INTO employee_other_info_hobies (
                objid, emp_objid, skills_hobbies, created_at, updated_at
              ) VALUES (?, ?, ?, NOW(), NOW())
            `, [uuidv4(), employeeObjId, skill.skill_hobby]);
          }
        }
        console.log(`✅ Saved ${skills.length} skills/hobbies records`);
      }

      // Save recognition records
      if (recognitions && recognitions.length > 0) {
        await pool.execute('DELETE FROM employee_other_info_recognition WHERE emp_objid = ?', [employeeObjId]);
        for (const recog of recognitions) {
          if (recog.recognition) {
            await pool.execute(`
              INSERT INTO employee_other_info_recognition (
                objid, emp_objid, recognition, created_at, updated_at
              ) VALUES (?, ?, ?, NOW(), NOW())
            `, [uuidv4(), employeeObjId, recog.recognition]);
          }
        }
        console.log(`✅ Saved ${recognitions.length} recognition records`);
      }

      // Save membership records
      if (memberships && memberships.length > 0) {
        await pool.execute('DELETE FROM employee_other_info_membership WHERE emp_objid = ?', [employeeObjId]);
        for (const member of memberships) {
          if (member.organization) {
            await pool.execute(`
              INSERT INTO employee_other_info_membership (
                objid, emp_objid, membership, created_at, updated_at
              ) VALUES (?, ?, ?, NOW(), NOW())
            `, [uuidv4(), employeeObjId, member.organization]);
          }
        }
        console.log(`✅ Saved ${memberships.length} membership records`);
      }

      // Handle media: signature, photo, thumb - process if new media is being uploaded OR if date_accomplished is being updated
      const hasNewMedia = signature_data || photo_data || thumbmark_data;
      const hasDateAccomplished = employee.date_accomplished && employee.date_accomplished.trim() !== '';

      if (hasNewMedia || hasDateAccomplished) {
        try {
          const decode = (data) => {
            if (!data) return null;
            const base64 = (typeof data === 'string') ? data.replace(/^data:.*;base64,/, '') : '';
            if (!base64) return null; // Treat empty base64 as no data
            try { return Buffer.from(base64, 'base64'); } catch { return null; }
          };

          const sigBuf = decode(signature_data);
          const photoBuf = decode(photo_data);
          const thumbBuf = decode(thumbmark_data);

          console.log(`🖼️ Processing media - Signature: ${sigBuf ? `${sigBuf.length} bytes` : 'none'}, Photo: ${photoBuf ? `${photoBuf.length} bytes` : 'none'}, Thumb: ${thumbBuf ? `${thumbBuf.length} bytes` : 'none'}`);
          console.log(`📅 Date accomplished: ${hasDateAccomplished ? employee.date_accomplished : 'none'}`);

          // Process and compress images with quality options
          const processed = {
            signature: null,
            photo: null,
            thumb: null
          };

          // Process signature
          if (sigBuf) {
            try {
              processed.signature = await toBmpUnder100KB(sigBuf, { 
                initialMaxWidth: 800, 
                initialMaxHeight: 300,
                normalizeColors: true,         // Fix signature colors (black on white)
                maintainQuality: false,        // Signatures don't need high quality
                useCompressedFormat: false,    // Don't use JPEG
                usePngFormat: true,            // Use PNG for signatures
                maxBytes: MAX_SIGNATURE_BYTES  // 150KB limit for signatures
              });
              console.log(`✅ Signature processed: ${processed.signature.bytes} bytes`);
            } catch (error) {
              console.error('❌ Error processing signature:', error);
              processed.signature = null;
            }
          }

          // Process photo
          if (photoBuf) {
            try {
              processed.photo = await toBmpUnder100KB(photoBuf, { 
                initialMaxWidth: 800,       // Increased for better quality
                initialMaxHeight: 1000,     // Increased for better quality
                normalizeColors: false,     // Don't modify photo colors
                maintainQuality: true,      // Maintain photo quality
                useCompressedFormat: true,  // Use JPEG for photos
                maxBytes: MAX_PHOTO_BYTES   // 150KB limit for photos
              });
              console.log(`✅ Photo processed: ${processed.photo.bytes} bytes`);
            } catch (error) {
              console.error('❌ Error processing photo:', error);
              processed.photo = null;
            }
          }

          // Process thumb
          if (thumbBuf) {
            try {
              processed.thumb = await toBmpUnder100KB(thumbBuf, { 
                initialMaxWidth: 600,       // Increased for better quality
                initialMaxHeight: 600,     // Increased for better quality
                normalizeColors: false,    // Don't modify thumb colors
                maintainQuality: true,     // Maintain thumb quality
                useCompressedFormat: false, // Don't use JPEG
                usePngFormat: true,        // Use PNG for thumbmarks
                maxBytes: MAX_SIGNATURE_BYTES // 150KB limit for thumbmarks
              });
              console.log(`✅ Thumb processed: ${processed.thumb.bytes} bytes`);
            } catch (error) {
              console.error('❌ Error processing thumb:', error);
              processed.thumb = null;
            }
          }

          console.log(`📊 Signature: ${processed.signature ? processed.signature.bytes + ' bytes' : 'none'}, Photo: ${processed.photo ? processed.photo.bytes + ' bytes' : 'none'}, Thumb: ${processed.thumb ? processed.thumb.bytes + ' bytes' : 'none'}`);

          // Save files to filesystem
          const filePaths = {
            signature: null,
            photo: null,
            thumb: null
          };

          if (processed.signature) {
            try {
              filePaths.signature = await saveMediaFile(processed.signature.buffer, 'signature', employeeObjId);
              console.log(`✅ Signature saved to: ${filePaths.signature}`);
            } catch (error) {
              console.error('❌ Error saving signature:', error);
              filePaths.signature = null;
            }
          }
          if (processed.photo) {
            try {
              filePaths.photo = await saveMediaFile(processed.photo.buffer, 'photo', employeeObjId);
              console.log(`✅ Photo saved to: ${filePaths.photo}`);
            } catch (error) {
              console.error('❌ Error saving photo:', error);
              filePaths.photo = null;
            }
          }
          if (processed.thumb) {
            try {
              filePaths.thumb = await saveMediaFile(processed.thumb.buffer, 'thumb', employeeObjId);
              console.log(`✅ Thumb saved to: ${filePaths.thumb}`);
            } catch (error) {
              console.error('❌ Error saving thumb:', error);
              filePaths.thumb = null;
            }
          }

          console.log(`📁 File paths to save:`, filePaths);
          console.log(`🔍 Will delete existing files? Signature: ${filePaths.signature !== null}, Photo: ${filePaths.photo !== null}, Thumb: ${filePaths.thumb !== null}`);
          console.log(`🔍 File path values: signature=${filePaths.signature}, photo=${filePaths.photo}, thumb=${filePaths.thumb}`);

          // Update database with file paths - handle both new media and date_accomplished updates
          const [mediaExisting] = await pool.execute('SELECT objid, signature_path, photo_path, thumb_path FROM employees_media WHERE emp_objid = ? LIMIT 1', [employeeObjId]);
          console.log(`🔍 Existing media records found: ${mediaExisting.length}`);
          
          if (mediaExisting.length) {
            console.log(`📝 Updating existing media record for employee: ${employeeObjId}`);
            
            // Only delete old files if new ones are actually provided
            if (filePaths.signature !== null && mediaExisting[0].signature_path && mediaExisting[0].signature_path !== filePaths.signature) {
              console.log(`🗑️ Deleting old signature file: ${mediaExisting[0].signature_path}`);
              await deleteMediaFile(mediaExisting[0].signature_path);
            }
            if (filePaths.photo !== null && mediaExisting[0].photo_path && mediaExisting[0].photo_path !== filePaths.photo) {
              console.log(`🗑️ Deleting old photo file: ${mediaExisting[0].photo_path}`);
              await deleteMediaFile(mediaExisting[0].photo_path);
            }
            if (filePaths.thumb !== null && mediaExisting[0].thumb_path && mediaExisting[0].thumb_path !== filePaths.thumb) {
              console.log(`🗑️ Deleting old thumb file: ${mediaExisting[0].thumb_path}`);
              await deleteMediaFile(mediaExisting[0].thumb_path);
            }

            // Update with new paths (only if provided) or keep existing paths
            await pool.execute(`
              UPDATE employees_media SET
                signature_path = COALESCE(?, signature_path),
                photo_path = COALESCE(?, photo_path),
                thumb_path = COALESCE(?, thumb_path),
                date_accomplished = COALESCE(?, date_accomplished),
                updated_at = NOW()
              WHERE emp_objid = ?
            `, [
              filePaths.signature,
              filePaths.photo,
              filePaths.thumb,
              employee.date_accomplished || null,
              employeeObjId
            ]);
            console.log(`✅ Updated existing media record for user: ${employeeObjId}`);
          } else {
            // Insert new record only if we have media files or date to save
            if (Object.keys(filePaths).some(key => filePaths[key] !== null) || hasDateAccomplished) {
              await pool.execute(`
                INSERT INTO employees_media (
                  objid, emp_objid, signature_path, photo_path, thumb_path, date_accomplished, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
              `, [
                uuidv4(), employeeObjId,
                filePaths.signature,
                filePaths.photo,
                filePaths.thumb,
                employee.date_accomplished || null
              ]);
              console.log(`✅ Inserted new media record for user: ${employeeObjId}`);
            }
          }

          console.log('✅ Media files saved successfully');
        } catch (mediaError) {
          console.error('❌ Error processing media:', mediaError);
          console.log('📝 Skipping media processing due to error');
        }
      }

      await pool.query('COMMIT');
      console.log('📝 [savePDS] Transaction committed successfully');

      // Calculate and update PDS completeness progress
      const progressPercent = await calculatePDSProgress(employeeObjId);
      await pool.execute(
        'UPDATE employees SET pdscompleprogress = ? WHERE objid = ?',
        [progressPercent, employeeObjId]
      );
      console.log(`✅ Updated PDS completeness: ${progressPercent}%`);

      const message = is_draft 
        ? 'PDS draft saved successfully. You can continue editing later.' 
        : 'PDS saved successfully.';
      
      res.json({ 
        success: true, 
        message, 
        progress: progressPercent,  // Include progress in response
        data: { objid: employeeObjId, is_draft }
      });
    } catch (err) {
      console.error('❌ [savePDS] Inner error, rolling back transaction:', err.message);
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('❌ [savePDS] Error saving PDS:', error.message);
    console.error('❌ [savePDS] Error stack:', error.stack);
    console.error('❌ [savePDS] Error code:', error.code);
    
    // Enhanced error handling - extract field name from MySQL errors
    let errorMessage = 'Failed to save PDS';
    let fieldName = null;
    
    // Check for MySQL "Data too long" errors
    if (error.message && (error.message.includes('Data too long') || error.message.includes('ER_DATA_TOO_LONG'))) {
      // Try to extract column name from error message
      const columnMatch = error.message.match(/column ['"]([^'"]+)['"]/i) || 
                         error.message.match(/for column ['"]([^'"]+)['"]/i);
      
      if (columnMatch) {
        fieldName = columnMatch[1];
        errorMessage = `Failed to save PDS: The field "${fieldName}" exceeds the maximum character limit. Please reduce the text length and try again.`;
      } else {
        errorMessage = `Failed to save PDS: One or more fields exceed the maximum character limit. Please check your entries and reduce text length where necessary.`;
      }
    } else {
      errorMessage = `Failed to save PDS: ${error.message}`;
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: error.message,
      field: fieldName
    });
  }
};

// GET /api/201-employees/pds/:employeeId - Get complete PDS data for an employee
export const getPDS = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { employeeId } = req.params;
    
    console.log(`🔍 Fetching PDS for employee ID: ${employeeId}`);
    
    // Get main employee data
    const [employees] = await pool.execute(`
      SELECT * FROM employees WHERE objid = ? OR dtruserid = ?
    `, [employeeId, employeeId]);
    
    if (employees.length === 0) {
      console.log(`❌ Employee not found: ${employeeId}`);
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    const employee = employees[0];
    console.log(`✅ Found employee: ${employee.surname}, ${employee.firstname}`);
    
    // Initialize empty arrays for optional data
    let addresses = [];
    let familyBackground = [];
    let spouse = [];
    let children = [];
    let education = [];
    let eligibility = [];
    let workExperience = [];
    
    try {
      // Get addresses
      const [addressesResult] = await pool.execute(`
        SELECT * FROM employee_address WHERE emp_objid = ?
      `, [employee.objid]);
      addresses = addressesResult;
      console.log(`✅ Found ${addresses.length} addresses`);
      
      // Map address fields to frontend field names and merge into employee object
      if (addresses.length > 0) {
        const address = addresses[0];
        employee.residential_province = address.resi_province || '';
        employee.residential_city_municipality = address.resi_city || '';
        employee.residential_barangay = address.resi_barangay || '';
        employee.residential_zip_code = address.resi_zip || '';
        employee.residential_subdivision_village = address.resi_village || '';
        employee.residential_street = address.resi_street || '';
        employee.residential_house_block_lot = address.resi_house || '';
        
        employee.permanent_province = address.perma_province || '';
        employee.permanent_city_municipality = address.perma_city || '';
        employee.permanent_barangay = address.perma_barangay || '';
        employee.permanent_zip_code = address.perma_zip || '';
        employee.permanent_subdivision_village = address.perma_village || '';
        employee.permanent_street = address.perma_street || '';
        employee.permanent_house_block_lot = address.perma_house || '';
      }
    } catch (error) {
      console.log(`⚠️ Addresses table not found or error: ${error.message}`);
    }
    
    // Family background is stored directly in employees table (father_*, mother_* fields)
    familyBackground = [employee];
    console.log(`✅ Family background data from employees table`);
    
    try {
      // Get spouse information
      const [spouseResult] = await pool.execute(`
        SELECT * FROM employee_spouses WHERE emp_objid = ?
      `, [employee.objid]);
      spouse = spouseResult;
      console.log(`✅ Found ${spouse.length} spouse records`);
      
      // Map spouse fields to frontend field names and merge into employee object
      if (spouse.length > 0) {
        const spouseData = spouse[0];
        employee.spouse_surname = spouseData.spouse_surname || '';
        employee.spouse_firstname = spouseData.spouse_firstname || '';
        employee.spouse_middlename = spouseData.spouse_middlename || '';
        employee.spouse_extension = spouseData.spouse_extension || '';
        employee.spouse_occupation = spouseData.spouse_occupation || '';
        employee.spouse_employer_business_name = spouseData.employer_businessname || '';
        employee.spouse_business_address = spouseData.business_address || '';
        employee.spouse_telephone = spouseData.telephone_no || '';
      }
    } catch (error) {
      console.log(`⚠️ Spouses table not found or error: ${error.message}`);
    }
    
    try {
      // Get children
      const [childrenResult] = await pool.execute(`
        SELECT * FROM employee_childrens WHERE emp_objid = ? ORDER BY objid ASC
      `, [employee.objid]);
      children = childrenResult.map(child => {
        let formattedDate = '';
        if (child.dateofbirth) {
          try {
            // Handle different date formats from database
            const date = new Date(child.dateofbirth);
            if (!isNaN(date.getTime())) {
              formattedDate = date.toISOString().split('T')[0];
            }
          } catch (error) {
            console.log(`⚠️ Error formatting date for child ${child.name}: ${child.dateofbirth}`);
          }
        }
        console.log(`📅 Child ${child.name}: dateofbirth=${child.dateofbirth} -> formatted=${formattedDate}`);
        return {
          full_name: child.name || '',
          date_of_birth: formattedDate
        };
      });
      console.log(`✅ Found ${children.length} children records`);
    } catch (error) {
      console.log(`⚠️ Children table not found or error: ${error.message}`);
    }
    
    try {
      // Get education
      const [educationResult] = await pool.execute(`
        SELECT * FROM employee_education WHERE emp_objid = ? ORDER BY objid ASC
      `, [employee.objid]);
      education = educationResult;
      console.log(`✅ Found ${education.length} education records`);
    } catch (error) {
      console.log(`⚠️ Education table not found or error: ${error.message}`);
    }
    
    try {
      // Get civil service eligibility with joined eligibility types
      const [eligibilityResult] = await pool.execute(`
        SELECT 
          e.objid, e.emp_objid,
          et.careertypes as eligibility_type,
          e.rating,
          CASE WHEN e.date_of_exam IS NULL THEN NULL ELSE DATE_FORMAT(e.date_of_exam, '%Y-%m-%d') END as date_of_examination,
          e.place_of_exam as place_of_examination,
          e.license_number,
          CASE WHEN e.license_validity IS NULL THEN NULL ELSE DATE_FORMAT(e.license_validity, '%Y-%m-%d') END as date_of_validity
        FROM employee_eligibility e
        LEFT JOIN eligibilitytypes et ON e.career_service = et.id
        WHERE e.emp_objid = ? 
        ORDER BY e.objid ASC
      `, [employee.objid]);
      eligibility = eligibilityResult;
      console.log(`✅ Found ${eligibility.length} eligibility records`);
    } catch (error) {
      console.log(`⚠️ Eligibility table not found or error: ${error.message}`);
    }
    
    try {
      // Get work experience
      const [workExperienceResult] = await pool.execute(`
        SELECT 
          objid,
          emp_objid,
          CASE WHEN \`from\` IS NULL THEN NULL ELSE DATE_FORMAT(\`from\`, '%Y-%m-%d') END as date_from,
          CASE WHEN \`to\` IS NULL THEN NULL ELSE DATE_FORMAT(\`to\`, '%Y-%m-%d') END as date_to,
          position as position_title,
          department_name as department_agency_company,
          monthly_salary,
          pay_grade as salary_grade_step,
          appointment_status as status_of_appointment,
          gov_service as government_service,
          ispresent as is_present
        FROM employee_workexperience 
        WHERE emp_objid = ? 
        ORDER BY 
          CASE WHEN ispresent = 1 THEN 0 ELSE 1 END,
          \`from\` DESC
      `, [employee.objid]);
      workExperience = workExperienceResult;
      console.log(`✅ Found ${workExperience.length} work experience records`);
      if (workExperience.length > 0) {
        console.log('📋 Sample work experience data:', JSON.stringify(workExperience[0], null, 2));
      }
    } catch (error) {
      console.log(`⚠️ Work experience table not found or error: ${error.message}`);
    }
    
    // ============ PAGE 3 DATA RETRIEVAL ============
    
    // Get voluntary work
    let voluntaryWork = [];
    try {
      const [voluntaryWorkResult] = await pool.execute(`
        SELECT 
          objid, emp_objid,
          org_address as organization_name_address,
          CASE WHEN \`from\` IS NULL THEN NULL ELSE DATE_FORMAT(\`from\`, '%Y-%m-%d') END as date_from,
          CASE WHEN \`to\` IS NULL THEN NULL ELSE DATE_FORMAT(\`to\`, '%Y-%m-%d') END as date_to,
          num_of_hours as number_of_hours,
          position_of_work as position_nature_of_work
        FROM employee_voluntary 
        WHERE emp_objid = ? 
        ORDER BY \`from\` DESC
      `, [employee.objid]);
      voluntaryWork = voluntaryWorkResult;
      console.log(`✅ Found ${voluntaryWork.length} voluntary work records`);
    } catch (error) {
      console.log(`⚠️ Voluntary work table not found or error: ${error.message}`);
    }

    // Get trainings
    let trainings = [];
    try {
      const [trainingsResult] = await pool.execute(`
        SELECT 
          objid, emp_objid,
          title as training_title,
          CASE WHEN \`from\` IS NULL THEN NULL ELSE DATE_FORMAT(\`from\`, '%Y-%m-%d') END as date_from,
          CASE WHEN \`to\` IS NULL THEN NULL ELSE DATE_FORMAT(\`to\`, '%Y-%m-%d') END as date_to,
          num_of_hours as number_of_hours,
          type as type_of_ld,
          conducted as conducted_sponsored_by
        FROM employee_training 
        WHERE emp_objid = ? 
        ORDER BY \`from\` DESC
      `, [employee.objid]);
      trainings = trainingsResult;
      console.log(`✅ Found ${trainings.length} training records`);
    } catch (error) {
      console.log(`⚠️ Training table not found or error: ${error.message}`);
    }

    // Get skills/hobbies
    let skills = [];
    try {
      const [skillsResult] = await pool.execute(`
        SELECT objid, emp_objid, skills_hobbies as skill_hobby
        FROM employee_other_info_hobies 
        WHERE emp_objid = ?
      `, [employee.objid]);
      skills = skillsResult;
      console.log(`✅ Found ${skills.length} skills/hobbies records`);
    } catch (error) {
      console.log(`⚠️ Skills/hobbies table not found or error: ${error.message}`);
    }

    // Get recognitions
    let recognitions = [];
    try {
      const [recognitionsResult] = await pool.execute(`
        SELECT objid, emp_objid, recognition
        FROM employee_other_info_recognition 
        WHERE emp_objid = ?
      `, [employee.objid]);
      recognitions = recognitionsResult;
      console.log(`✅ Found ${recognitions.length} recognition records`);
    } catch (error) {
      console.log(`⚠️ Recognition table not found or error: ${error.message}`);
    }

    // Get memberships
    let memberships = [];
    try {
      const [membershipsResult] = await pool.execute(`
        SELECT objid, emp_objid, membership as organization
        FROM employee_other_info_membership 
        WHERE emp_objid = ?
      `, [employee.objid]);
      memberships = membershipsResult;
      console.log(`✅ Found ${memberships.length} membership records`);
    } catch (error) {
      console.log(`⚠️ Membership table not found or error: ${error.message}`);
    }

    // Get references
    let references = [];
    try {
      const [referencesResult] = await pool.execute(`
        SELECT 
          objid, emp_objid,
          reference_name,
          reference_address,
          reference_phone as reference_tel_no
        FROM employee_references 
        WHERE emp_objid = ?
        ORDER BY created_at ASC
        LIMIT 3
      `, [employee.objid]);
      references = referencesResult;
      console.log(`✅ Found ${references.length} reference records`);
    } catch (error) {
      console.log(`⚠️ References table not found or error: ${error.message}`);
    }

    // Get government IDs
    let governmentIds = [];
    try {
      const [govIdsResult] = await pool.execute(`
        SELECT 
          objid, emp_objid,
          gov_id as government_issued_id,
          gov_id_number as id_number,
          CASE WHEN gov_id_dateissued IS NULL THEN NULL ELSE DATE_FORMAT(gov_id_dateissued, '%Y-%m-%d') END as date_issued,
          gov_id_placeissued as place_of_issuance,
          status
        FROM employee_govid 
        WHERE emp_objid = ? AND status = 'active'
        ORDER BY created_at ASC
      `, [employee.objid]);
      governmentIds = govIdsResult;
      console.log(`✅ Found ${governmentIds.length} government ID records`);
    } catch (error) {
      console.log(`⚠️ Government IDs table not found or error: ${error.message}`);
    }

    // Get declarations
    let declarations = {};
    try {
      const [declarationsResult] = await pool.execute(`
        SELECT 
          objid, emp_objid,
          thirtyfour_a, thirtyfour_b, thirtyfour_b_details,
          thirtyfive_a, thirtyfive_a_details, thirtyfive_b, thirtyfive_datefiled, thirtyfive_statuses,
          thirtysix, thirtysix_details, thirtyseven, thirtyseven_details,
          thirtyeight_a, thirtyeight_a_details, thirtyeight_b, thirtyeight_b_details,
          thirtynine, thirtynine_details, forty_a, forty_a_details,
          forty_b, forty_b_details, forty_c, forty_c_details
        FROM employee_declaration 
        WHERE emp_objid = ?
        LIMIT 1
      `, [employee.objid]);
      
      if (declarationsResult.length > 0) {
        const decl = declarationsResult[0];
        declarations = {
          third_degree: decl.thirtyfour_a === 1,
          fourth_degree: decl.thirtyfour_b === 1,
          fourth_degree_details: decl.thirtyfour_b_details,
          guilty_admin: decl.thirtyfive_a === 1,
          guilty_admin_details: decl.thirtyfive_a_details,
          criminally_charged: decl.thirtyfive_b === 1,
          criminally_charged_date: decl.thirtyfive_datefiled,
          criminally_charged_status: decl.thirtyfive_statuses,
          convicted: decl.thirtysix === 1,
          convicted_details: decl.thirtysix_details,
          separated_service: decl.thirtyseven === 1,
          separated_service_details: decl.thirtyseven_details,
          candidate: decl.thirtyeight_a === 1,
          candidate_details: decl.thirtyeight_a_details,
          resigned_campaign: decl.thirtyeight_b === 1,
          resigned_campaign_details: decl.thirtyeight_b_details,
          immigrant: decl.thirtynine === 1,
          immigrant_country: decl.thirtynine_details,
          indigenous_group: decl.forty_a === 1,
          indigenous_group_details: decl.forty_a_details,
          pwd: decl.forty_b === 1,
          pwd_id_no: decl.forty_b_details,
          solo_parent: decl.forty_c === 1,
          solo_parent_id_no: decl.forty_c_details
        };
        console.log(`✅ Found declarations data`);
      }
    } catch (error) {
      console.log(`⚠️ Declarations table not found or error: ${error.message}`);
    }

    // Get media (signature, photo, thumb)
    let media = {};
    try {
      const [mediaResult] = await pool.execute(`
        SELECT 
          objid, emp_objid,
          signature_path, photo_path, thumb_path, 
          date_accomplished, mediastatus
        FROM employees_media 
        WHERE emp_objid = ?
        LIMIT 1
      `, [employee.objid]);
      
      if (mediaResult.length > 0) {
        const mediaData = mediaResult[0];
        
        // Read files and convert to base64
        const signatureBase64 = mediaData.signature_path ? await readMediaAsBase64(mediaData.signature_path) : null;
        const photoBase64 = mediaData.photo_path ? await readMediaAsBase64(mediaData.photo_path) : null;
        const thumbBase64 = mediaData.thumb_path ? await readMediaAsBase64(mediaData.thumb_path) : null;

        // Ensure date_accomplished is a yyyy-mm-dd string for the date input
        const formatDateYMD = (val) => {
          if (!val) return '';
          try {
            // If already yyyy-mm-dd, return as-is
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
            const d = new Date(val);
            if (Number.isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          } catch {
            return '';
          }
        };

        media = {
          has_signature: signatureBase64 ? true : false,
          has_photo: photoBase64 ? true : false,
          has_thumb: thumbBase64 ? true : false,
          signature: signatureBase64 || '',
          photo: photoBase64 || '',
          thumb: thumbBase64 || '',
          date_accomplished: formatDateYMD(mediaData.date_accomplished),
          mediastatus: mediaData.mediastatus
        };
        console.log(`✅ Found media data - Signature: ${media.has_signature}, Photo: ${media.has_photo}, Thumb: ${media.has_thumb}`);
      }
    } catch (error) {
      console.log(`⚠️ Media table not found or error: ${error.message}`);
    }
    
    console.log(`✅ PDS data fetched for employee ID: ${employeeId}`);
    
    // Helper function to format date for frontend (YYYY-MM-DD)
    const formatDateForFrontend = (dateValue) => {
      if (!dateValue) return '';
      
      // If it's already a string in YYYY-MM-DD format, return as-is
      if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue;
      }
      
      // Handle DD/M/YYYY format (from database) - convert to YYYY-MM-DD
      if (typeof dateValue === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split('/');
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        const formattedDate = `${year}-${paddedMonth}-${paddedDay}`;
        return formattedDate;
      }
      
      // If it's a Date object or ISO string, convert to YYYY-MM-DD using local timezone
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        // Use local date methods to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      
      return '';
    };

    // Map database fields to frontend field names
    const mappedEmployee = {
      ...employee,
      // Map gender back to sex for frontend compatibility
      sex: employee.gender || '',
      // Map birthdate/birthplace to date_of_birth/place_of_birth for frontend compatibility
      date_of_birth: formatDateForFrontend(employee.birthdate),
      place_of_birth: employee.birthplace || '',
      // Map citizenship fields
      citizenship_filipino: true, // Always true as per requirement
      citizenship_dual: !!(employee.dual_citizenship_type || employee.dual_citizenship_country)
    };
    
    console.log('📝 [getPDS] Original employee data:', {
      gender: employee.gender,
      birthdate: employee.birthdate,
      birthplace: employee.birthplace
    });
    
    console.log('📝 [getPDS] Mapped employee data:', {
      sex: mappedEmployee.sex,
      date_of_birth: mappedEmployee.date_of_birth,
      place_of_birth: mappedEmployee.place_of_birth
    });
    
    res.json({
      success: true,
      data: {
        employee: mappedEmployee,
        addresses,
        familyBackground: familyBackground[0] || {},
        spouse: spouse[0] || {},
        children,
        education,
        eligibility,
        workExperience,
        // Page 3 data
        voluntaryWork,
        trainings,
        skills,
        recognitions,
        memberships,
        // Page 4 data
        references,
        governmentIds,
        declarations,
        media
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching PDS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch PDS',
      error: error.message
    });
  }
};

// GET /api/201-employees/dtr-employees - Get employees from DTR USERINFO table with PDS status
export const getDTREmployeesWithPDS = async (req, res) => {
  try {
    const mssqlPool = getDb(); // DTR database (MSSQL)
    const mysqlPool = getHR201Pool(); // HR201 database (MySQL)
    
    // Get all employees from USERINFO (MSSQL)
    const query = `
      SELECT 
        u.USERID as DTRuserID,
        u.BADGENUMBER as BadgeNumber,
        u.NAME,
        d.DEPTNAME as Department
      FROM USERINFO u
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
      ORDER BY u.NAME
    `;
    
    const result = await mssqlPool.request().query(query);
    const employees = result.recordset;
    
    // Check which employees have PDS in HR201 (MySQL) and get completeness progress
    // Link via dtruserid (matches USERID from MSSQL)
    const [pdsRecords] = await mysqlPool.execute(
      'SELECT dtruserid, pdscompleprogress FROM employees'
    );
    
    const pdsDataMap = new Map();
    pdsRecords.forEach(record => {
      pdsDataMap.set(record.dtruserid, {
        hasPDS: true,
        pdscompleprogress: record.pdscompleprogress || 0
      });
    });
    
    // Add hasPDS flag and progress to each employee
    const employeesWithPDS = employees.map(emp => {
      const pdsData = pdsDataMap.get(emp.DTRuserID);
      return {
        DTRuserID: emp.DTRuserID,
        BadgeNumber: emp.BadgeNumber,
        NAME: emp.NAME,
        Department: emp.Department,
        hasPDS: pdsData ? pdsData.hasPDS : false,
        pdscompleprogress: pdsData ? pdsData.pdscompleprogress : 0
      };
    });
    
    console.log(`✅ Fetched ${employeesWithPDS.length} employees from DTR USERINFO table`);
    console.log(`📋 ${employeesWithPDS.filter(e => e.hasPDS).length} employees have PDS records`);
    
    res.json({
      success: true,
      data: employeesWithPDS,
      count: employeesWithPDS.length,
      pdsCount: employeesWithPDS.filter(e => e.hasPDS).length,
      source: 'MSSQL USERINFO + MySQL employees (linked via dtruserid)'
    });
    
  } catch (error) {
    console.error('❌ Error fetching DTR employees with PDS status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees from DTR database',
      error: error.message
    });
  }
};

// POST /api/201-employees/pds/:id/recalculate-progress - Recalculate PDS progress
export const recalculatePDSProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    const [employee] = await pool.execute(
      'SELECT objid FROM employees WHERE dtruserid = ?', 
      [id]
    );
    
    if (!employee.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }
    
    const progressPercent = await calculatePDSProgress(employee[0].objid);
    await pool.execute(
      'UPDATE employees SET pdscompleprogress = ? WHERE objid = ?',
      [progressPercent, employee[0].objid]
    );
    
    res.json({ 
      success: true, 
      progress: progressPercent,
      message: `Progress recalculated: ${progressPercent}%`
    });
  } catch (error) {
    console.error('Error recalculating PDS progress:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// GET /api/201-employees/eligibility-types - Get eligibility types for dropdown
export const getEligibilityTypes = async (req, res) => {
  try {
    console.log('🔄 [getEligibilityTypes] API endpoint called');
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT id, careertypes FROM eligibilitytypes ORDER BY careertypes ASC');
    console.log(`✅ [getEligibilityTypes] Fetched ${rows.length} eligibility types`);
    console.log('📋 [getEligibilityTypes] Sample data:', rows.slice(0, 3));
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ [getEligibilityTypes] Error fetching eligibility types:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};