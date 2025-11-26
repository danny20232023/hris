import { v4 as uuidv4 } from 'uuid';
import { getHR201Pool } from '../config/hr201Database.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// Helper to map row with optional base64 photos (employee and creator)
async function mapDesignationRow(row) {
  let employeePhoto = null;
  if (row.photo_path) {
    try {
      employeePhoto = await readMediaAsBase64(row.photo_path);
    } catch (e) {
      employeePhoto = null;
    }
  }
  let creatorPhoto = null;
  if (row.createdby_photo_blob) {
    try {
      // Convert BLOB Buffer to base64
      const buffer = Buffer.isBuffer(row.createdby_photo_blob) ? row.createdby_photo_blob : Buffer.from(row.createdby_photo_blob);
      const base64 = buffer.toString('base64');
      creatorPhoto = `data:image/png;base64,${base64}`;
    } catch (e) {
      creatorPhoto = null;
    }
  }
  return {
    ...row,
    photo_path: employeePhoto,
    createdby_photo_path: creatorPhoto,
    createdby_employee_name: formatEmployeeName(row.createdby_surname, row.createdby_firstname, row.createdby_middlename),
  };
}

// GET /api/employee-designations
// Note: 
// - ed.designationid is a lookup to designationtypes table (via r.id)
// - ed.appointmentstatus is a lookup to appointmenttypes table (via atp.id, contains canleave column)
export const listDesignations = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { search = '', rankId = '', appointmentId = '', status = 'active' } = req.query;

    const params = [];
    let query = `
      SELECT 
        ed.objid,
        ed.emp_objid,
        ed.designationid as rankid,  -- Lookup to designationtypes.id
        r.designationname as rankname,  -- From designationtypes table
        ed.position,
        ed.appointmentstatus as appointmentid,  -- Lookup to appointmenttypes.id
        ed.appointmentdate,
        ed.plantillano,
        ed.salarygrade,
        ed.gradeincrement,
        ed.dailywage,
        ed.salary,
        ed.jobdescription,
        ed.assigneddept,
        ed.ispresent,
        atp.canleave,
        atp.appointmentname,
        e.objid as employee_objid,
        e.surname,
        e.firstname,
        e.middlename,
        e.deptid,
        d.departmentshortname as departmentname,
        em.photo_path,
        s.photo AS createdby_photo_blob,
        s.username AS createdby_username,
        c.surname AS createdby_surname,
        c.firstname AS createdby_firstname,
        c.middlename AS createdby_middlename,
        ed.createdby,
        ed.createddate,
        ed.updatedby,
        ed.updateddate
      FROM employee_designation ed
      LEFT JOIN employees e ON ed.emp_objid = e.objid
      LEFT JOIN department d ON ed.assigneddept = d.deptid
      LEFT JOIN designationtypes r ON ed.designationid = r.id
      LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN sysusers s ON ed.createdby = s.id
      LEFT JOIN employees c ON c.objid = s.emp_objid
      WHERE 1=1
    `;

    // Use ispresent instead of status column (status column has been removed)
    if (status === 'active') {
      query += ' AND ed.ispresent = ?';
      params.push(1);
    }

    if (search) {
      query += ' AND (e.surname LIKE ? OR e.firstname LIKE ? OR e.middlename LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (rankId) {
      // Filter by designationid (lookup to designationtypes table)
      query += ' AND ed.designationid = ?';
      params.push(rankId);
    }
    if (appointmentId) {
      // Filter by appointmentstatus (lookup to appointmenttypes table)
      query += ' AND ed.appointmentstatus = ?';
      params.push(appointmentId);
    }

    query += ' ORDER BY e.surname, e.firstname, e.middlename';

    const [rows] = await pool.execute(query, params);
    const data = await Promise.all(rows.map(mapDesignationRow));
    res.json({ data, total: data.length });
  } catch (error) {
    console.error('Error listing designations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/employee-designations/:objid
export const getDesignation = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { objid } = req.params;
    const [rows] = await pool.execute(
      `SELECT ed.*, r.designationname as rankname, atp.appointmentname FROM employee_designation ed 
       LEFT JOIN designationtypes r ON ed.designationid = r.id
       LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
       WHERE ed.objid = ? LIMIT 1`,
      [objid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error getting designation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/employee-designations
// Note:
// - rankid parameter maps to designationid column (lookup to designationtypes.id)
// - appointmentid parameter maps to appointmentstatus column (lookup to appointmenttypes.id)
export const createDesignation = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  try {
    const { 
      emp_objid, 
      rankid,  // Maps to designationid column (lookup to designationtypes.id)
      position, 
      appointmentid,  // Maps to appointmentstatus column (lookup to appointmenttypes.id) 
      appointmentdate = null,
      plantillano = null,
      salarygrade = null,
      gradeincrement = null,
      dailywage = null,
      salary = null,
      jobdescription = null,
      assigneddept = null,
      createdby 
    } = req.body;

    console.log('Create designation payload:', {
      appointmentid: appointmentid,
      appointmentidType: typeof appointmentid,
      salarygrade: salarygrade,
      salarygradeType: typeof salarygrade,
      gradeincrement: gradeincrement,
      gradeincrementType: typeof gradeincrement
    });

    // Use sysusers.id directly from JWT
    const creator = req.user?.USERID || null;
    if (!emp_objid || !rankid || !position || !appointmentid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const objid = uuidv4();
    await connection.beginTransaction();
    // Ensure all ID fields are proper integers or null
    const appointmentIdInt = appointmentid ? parseInt(String(appointmentid), 10) : null;
    const salaryGradeInt = salarygrade ? parseInt(String(salarygrade), 10) : null;
    const gradeIncrementInt = gradeincrement ? parseInt(String(gradeincrement), 10) : null;
    const rankIdInt = rankid ? parseInt(String(rankid), 10) : null;
    const assignedDeptInt = assigneddept ? parseInt(String(assigneddept), 10) : null;

    console.log('Converted values:', {
      appointmentIdInt,
      salaryGradeInt,
      gradeIncrementInt,
      rankIdInt,
      assignedDeptInt
    });
    await connection.execute(
      `INSERT INTO employee_designation (
         objid, emp_objid, designationid, position, appointmentstatus,
         appointmentdate, plantillano, salarygrade, gradeincrement,
         dailywage, salary, jobdescription,
         assigneddept,
         ispresent,
         ispayroll,
         islock,
         createdby, createddate, updatedby, updateddate
       ) VALUES (
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?,
         ?,
         0,
         0,
         0,
         ?, NOW(), ?, NOW()
       )`,
      [
        objid, emp_objid, rankIdInt, position, appointmentIdInt,
        appointmentdate || null, plantillano || null, salaryGradeInt || null, gradeIncrementInt || null,
        dailywage ?? null, salary ?? null, jobdescription || null,
        assignedDeptInt,
        creator, creator
      ]
    );
    await connection.commit();
    res.status(201).json({ success: true, objid });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating designation:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// PUT /api/employee-designations/:objid
export const updateDesignation = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  try {
    const { objid } = req.params;
    const { 
      rankid, position, appointmentid,
      appointmentdate, plantillano, salarygrade, gradeincrement, dailywage, salary, jobdescription, assigneddept,
      ispresent, emp_objid
    } = req.body;
    
    // Convert to integers
    const appointmentIdInt = appointmentid ? parseInt(String(appointmentid), 10) : null;
    const salaryGradeInt = salarygrade ? parseInt(String(salarygrade), 10) : null;
    const gradeIncrementInt = gradeincrement ? parseInt(String(gradeincrement), 10) : null;
    const rankIdInt = rankid ? parseInt(String(rankid), 10) : null;
    const assignedDeptInt = assigneddept ? parseInt(String(assigneddept), 10) : null;
    const isPresentInt = (ispresent === 0 || ispresent === '0') ? 0 :
      (ispresent === 1 || ispresent === '1') ? 1 : null;
    
    // Use sysusers.id directly from JWT
    const updatedByUserId = req.user?.USERID || null;
    
    await connection.beginTransaction();
    if (isPresentInt === 1 && emp_objid) {
      await connection.execute(
        `UPDATE employee_designation
         SET ispresent = 0
         WHERE emp_objid = ? AND objid <> ?`,
        [emp_objid, objid]
      );
    }
    await connection.execute(
      `UPDATE employee_designation SET 
         designationid = COALESCE(?, designationid),
         position = COALESCE(?, position),
         appointmentstatus = COALESCE(?, appointmentstatus),
         appointmentdate = COALESCE(?, appointmentdate),
         plantillano = COALESCE(?, plantillano),
         salarygrade = COALESCE(?, salarygrade),
         gradeincrement = COALESCE(?, gradeincrement),
         dailywage = COALESCE(?, dailywage),
         salary = COALESCE(?, salary),
         jobdescription = COALESCE(?, jobdescription),
         assigneddept = COALESCE(?, assigneddept),
         ispresent = COALESCE(?, ispresent),
         updatedby = ?,
         updateddate = NOW()
       WHERE objid = ?`,
      [
        rankIdInt, position || null, appointmentIdInt,
        appointmentdate || null, plantillano || null, salaryGradeInt || null, gradeIncrementInt || null,
        dailywage ?? null, salary ?? null, jobdescription || null,
        assignedDeptInt,
        isPresentInt,
        updatedByUserId, objid
      ]
    );
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating designation:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// DELETE /api/employee-designations/:objid
export const deleteDesignation = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  try {
    const { objid } = req.params;
    await connection.beginTransaction();
    await connection.execute('DELETE FROM employee_designation WHERE objid = ?', [objid]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting designation:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// Lookups
export const listRanks = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT id as rankid, designationname as rankname FROM designationtypes ORDER BY designationname');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching ranks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listAppointmentTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT id, appointmentname FROM appointmenttypes ORDER BY appointmentname');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching appointment types:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


