import { v4 as uuidv4 } from 'uuid';
import { getHR201Pool } from '../config/hr201Database.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';

// Helper to map row with optional base64 photos (employee and creator)
async function mapDesignationRow(row) {
  let employeePhoto = null;
  if (row.photo_path && row.employee_objid) {
    try {
      // photo_path is now INT (pathid), requires objid and type
      employeePhoto = await readMediaAsBase64(row.photo_path, row.employee_objid, 'photo');
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
    const { search = '', rankId = '', appointmentId = '', departmentId = '', status = 'active', emp_objid = '', page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = Math.max(0, (pageNum - 1) * limitNum);

    const params = [];
    const whereConditions = [];

    // Use ispresent instead of status column (status column has been removed)
    if (status === 'active') {
      whereConditions.push('ed.ispresent = ?');
      params.push(1);
    }

    if (search) {
      whereConditions.push('(e.surname LIKE ? OR e.firstname LIKE ? OR e.middlename LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (rankId) {
      // Filter by designationid (lookup to designationtypes table)
      whereConditions.push('ed.designationid = ?');
      params.push(rankId);
    }
    if (appointmentId) {
      // Filter by appointmentstatus (lookup to appointmenttypes table)
      whereConditions.push('ed.appointmentstatus = ?');
      params.push(appointmentId);
    }
    if (departmentId) {
      // Filter by assigneddept (lookup to department table)
      whereConditions.push('ed.assigneddept = ?');
      params.push(departmentId);
    }
    if (emp_objid) {
      // Filter by employee objid
      whereConditions.push('ed.emp_objid = ?');
      params.push(emp_objid);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : 'WHERE 1=1';

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM employee_designation ed
      LEFT JOIN employees e ON ed.emp_objid = e.objid
      LEFT JOIN department d ON ed.assigneddept = d.deptid
      LEFT JOIN designationtypes r ON ed.designationid = r.id
      LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
      LEFT JOIN plantilla p ON ed.plantilla_id = p.id
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN sysusers s ON ed.createdby = s.id
      LEFT JOIN employees c ON c.objid = s.emp_objid
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0].total;

    // Ensure limitNum and offset are proper integers
    const finalLimit = parseInt(String(limitNum), 10);
    const finalOffset = parseInt(String(offset), 10);

    // Validate parameters
    if (isNaN(finalLimit) || isNaN(finalOffset) || finalLimit < 1 || finalOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters',
        error: `limit: ${finalLimit}, offset: ${finalOffset}`
      });
    }

    let query = `
      SELECT 
        ed.objid,
        ed.emp_objid,
        ed.designationid as rankid,  -- Lookup to designationtypes.id
        r.designationname as rankname,  -- From designationtypes table
        COALESCE(ed.position, p.position_title) as position,  -- Use plantilla position_title as fallback
        p.position_title as plantilla_position_title,  -- Include plantilla position for reference
        ed.appointmentstatus as appointmentid,  -- Lookup to appointmenttypes.id
        ed.appointmentdate,
        ed.appointmentdate_end,
        ed.plantillano,
        ed.plantilla_id,
        ed.tranche_id,
        p.salarygrade,
        ed.stepincrement,
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
      LEFT JOIN plantilla p ON ed.plantilla_id = p.id
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN sysusers s ON ed.createdby = s.id
      LEFT JOIN employees c ON c.objid = s.emp_objid
      ${whereClause}
      ORDER BY e.surname, e.firstname, e.middlename
      LIMIT ${finalLimit} OFFSET ${finalOffset}
    `;

    const [rows] = await pool.execute(query, params);
    const data = await Promise.all(rows.map(mapDesignationRow));
    
    res.json({ 
      data, 
      total: total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
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
      `SELECT ed.*, r.designationname as rankname, atp.appointmentname, p.salarygrade, 
              COALESCE(ed.position, p.position_title) as position,
              p.position_title as plantilla_position_title
       FROM employee_designation ed 
       LEFT JOIN designationtypes r ON ed.designationid = r.id
       LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
       LEFT JOIN plantilla p ON ed.plantilla_id = p.id
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
      appointmentdate_end = null,
      plantillano = null,
      plantilla_id = null,
      tranche_id = null,
      stepincrement = null,
      dailywage = null,
      salary = null,
      jobdescription = null,
      assigneddept = null,
      createdby 
    } = req.body;

    console.log('Create designation payload:', {
      appointmentid: appointmentid,
      appointmentidType: typeof appointmentid,
      stepincrement: stepincrement,
      stepincrementType: typeof stepincrement,
      plantilla_id: plantilla_id,
      plantilla_idType: typeof plantilla_id
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
    // stepincrement should be kept as string (char(2) format: "01", "02", etc.)
    const stepIncrementStr = stepincrement ? String(stepincrement).padStart(2, '0') : null;
    const rankIdInt = rankid ? parseInt(String(rankid), 10) : null;
    const assignedDeptInt = assigneddept ? parseInt(String(assigneddept), 10) : null;
    const plantillaIdInt = plantilla_id ? parseInt(String(plantilla_id), 10) : null;
    const trancheIdInt = tranche_id ? parseInt(String(tranche_id), 10) : null;

    console.log('Converted values:', {
      appointmentIdInt,
      stepIncrementStr,
      rankIdInt,
      assignedDeptInt,
      plantillaIdInt,
      plantillaIdOriginal: plantilla_id,
      plantillaIdConverted: plantillaIdInt,
      trancheIdInt
    });
    await connection.execute(
      `INSERT INTO employee_designation (
         objid, emp_objid, designationid, position, appointmentstatus,
         appointmentdate, appointmentdate_end, plantillano, plantilla_id, tranche_id, stepincrement,
         dailywage, salary, jobdescription,
         assigneddept,
         ispresent,
         ispayroll,
         islock,
         createdby, createddate, updatedby, updateddate
       ) VALUES (
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?,
         ?,
         0,
         0,
         0,
         ?, NOW(), ?, NOW()
       )`,
      [
        objid, emp_objid, rankIdInt, position, appointmentIdInt,
        appointmentdate || null, appointmentdate_end || null, plantillano || null, plantillaIdInt, trancheIdInt, stepIncrementStr,
        dailywage ?? null, salary ?? null, jobdescription || null,
        assignedDeptInt,
        creator, creator
      ]
    );
    
    // Update plantilla vacancy status if plantilla_id is provided
    if (plantillaIdInt) {
      console.log('[Create Designation] Updating plantilla vacancy:', {
        plantillaId: plantillaIdInt,
        action: 'set isvacant = 0'
      });
      
      // Verify plantilla exists first
      const [plantillaCheck] = await connection.execute(
        'SELECT id, isvacant FROM plantilla WHERE id = ?',
        [plantillaIdInt]
      );
      
      if (plantillaCheck.length === 0) {
        console.error('[Create Designation] Plantilla not found:', plantillaIdInt);
        throw new Error(`Plantilla with id ${plantillaIdInt} does not exist`);
      }
      
      console.log('[Create Designation] Plantilla before update:', {
        id: plantillaCheck[0].id,
        isvacant: plantillaCheck[0].isvacant
      });
      
      const [updateResult] = await connection.execute(
        `UPDATE plantilla SET isvacant = 0 WHERE id = ?`,
        [plantillaIdInt]
      );
      
      console.log('[Create Designation] Plantilla update result:', {
        affectedRows: updateResult.affectedRows,
        plantillaId: plantillaIdInt
      });
      
      // Verify the update
      const [verifyResult] = await connection.execute(
        'SELECT isvacant FROM plantilla WHERE id = ?',
        [plantillaIdInt]
      );
      
      if (verifyResult.length > 0) {
        console.log('[Create Designation] Plantilla after update:', {
          id: plantillaIdInt,
          isvacant: verifyResult[0].isvacant
        });
      }
    } else {
      console.log('[Create Designation] No plantilla_id provided, skipping vacancy update');
    }
    
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
      appointmentdate, appointmentdate_end, plantillano, plantilla_id, tranche_id, stepincrement, dailywage, salary, jobdescription, assigneddept,
      ispresent, emp_objid
    } = req.body;
    
    // Convert to integers
    const appointmentIdInt = appointmentid ? parseInt(String(appointmentid), 10) : null;
    // stepincrement should be kept as string (char(2) format: "01", "02", etc.)
    const stepIncrementStr = stepincrement !== undefined ? (stepincrement ? String(stepincrement).padStart(2, '0') : null) : undefined;
    const rankIdInt = rankid ? parseInt(String(rankid), 10) : null;
    const assignedDeptInt = assigneddept ? parseInt(String(assigneddept), 10) : null;
    const plantillaIdInt = plantilla_id !== undefined ? (plantilla_id ? parseInt(String(plantilla_id), 10) : null) : undefined;
    const trancheIdInt = tranche_id !== undefined ? (tranche_id ? parseInt(String(tranche_id), 10) : null) : undefined;
    const isPresentInt = (ispresent === 0 || ispresent === '0') ? 0 :
      (ispresent === 1 || ispresent === '1') ? 1 : null;
    
    // Use sysusers.id directly from JWT
    const updatedByUserId = req.user?.USERID || null;
    
    console.log('[Update Designation] Received data:', {
      objid,
      plantilla_id_received: plantilla_id,
      plantilla_id_type: typeof plantilla_id,
      plantilla_id_value: plantilla_id
    });
    
    await connection.beginTransaction();
    
    // Get current plantilla_id before update to manage vacancy
    const [currentRecord] = await connection.execute(
      'SELECT plantilla_id FROM employee_designation WHERE objid = ?',
      [objid]
    );
    const oldPlantillaId = currentRecord.length > 0 ? currentRecord[0].plantilla_id : null;
    console.log('[Update Designation] Current plantilla_id from DB:', oldPlantillaId);
    if (isPresentInt === 1 && emp_objid) {
      await connection.execute(
        `UPDATE employee_designation
         SET ispresent = 0
         WHERE emp_objid = ? AND objid <> ?`,
        [emp_objid, objid]
      );
    }
    // Build update query dynamically to handle optional plantilla_id and tranche_id
    const updateFields = [];
    const updateParams = [];
    
    if (rankIdInt !== null && rankIdInt !== undefined) {
      updateFields.push('designationid = ?');
      updateParams.push(rankIdInt);
    }
    if (position !== undefined) {
      updateFields.push('position = COALESCE(?, position)');
      updateParams.push(position || null);
    }
    if (appointmentIdInt !== null && appointmentIdInt !== undefined) {
      updateFields.push('appointmentstatus = ?');
      updateParams.push(appointmentIdInt);
    }
    if (appointmentdate !== undefined) {
      updateFields.push('appointmentdate = COALESCE(?, appointmentdate)');
      updateParams.push(appointmentdate || null);
    }
    if (appointmentdate_end !== undefined) {
      updateFields.push('appointmentdate_end = COALESCE(?, appointmentdate_end)');
      updateParams.push(appointmentdate_end || null);
    }
    if (plantillano !== undefined) {
      updateFields.push('plantillano = COALESCE(?, plantillano)');
      updateParams.push(plantillano || null);
    }
    if (plantillaIdInt !== undefined) {
      updateFields.push('plantilla_id = ?');
      updateParams.push(plantillaIdInt);
    }
    if (trancheIdInt !== undefined) {
      updateFields.push('tranche_id = ?');
      updateParams.push(trancheIdInt);
    }
    if (stepIncrementStr !== undefined) {
      updateFields.push('stepincrement = ?');
      updateParams.push(stepIncrementStr);
    }
    if (dailywage !== undefined) {
      updateFields.push('dailywage = ?');
      updateParams.push(dailywage ?? null);
    }
    if (salary !== undefined) {
      updateFields.push('salary = ?');
      updateParams.push(salary ?? null);
    }
    if (jobdescription !== undefined) {
      updateFields.push('jobdescription = COALESCE(?, jobdescription)');
      updateParams.push(jobdescription || null);
    }
    if (assignedDeptInt !== null && assignedDeptInt !== undefined) {
      updateFields.push('assigneddept = COALESCE(?, assigneddept)');
      updateParams.push(assignedDeptInt);
    }
    if (isPresentInt !== null && isPresentInt !== undefined) {
      updateFields.push('ispresent = ?');
      updateParams.push(isPresentInt);
    }
    
    updateFields.push('updatedby = ?');
    updateFields.push('updateddate = NOW()');
    updateParams.push(updatedByUserId);
    updateParams.push(objid);
    
    if (updateFields.length > 0) {
      await connection.execute(
        `UPDATE employee_designation SET ${updateFields.join(', ')} WHERE objid = ?`,
        updateParams
      );
    }
    
    // Manage plantilla vacancy
    // Determine the new plantilla_id value (what it will be after the update)
    const newPlantillaId = plantillaIdInt !== undefined ? plantillaIdInt : oldPlantillaId;
    
    // Normalize values for comparison (handle potential type mismatches)
    const normalizedOldId = oldPlantillaId !== null && oldPlantillaId !== undefined ? Number(oldPlantillaId) : null;
    const normalizedNewId = newPlantillaId !== null && newPlantillaId !== undefined ? Number(newPlantillaId) : null;
    
    console.log('[Plantilla Vacancy Update]', {
      oldPlantillaId: normalizedOldId,
      newPlantillaId: normalizedNewId,
      plantillaIdInt,
      plantillaIdProvided: plantilla_id !== undefined,
      changed: normalizedOldId !== normalizedNewId
    });
    
    // Check if plantilla assignment changed
    if (normalizedOldId !== normalizedNewId) {
      // Plantilla assignment changed - update vacancy status for both old and new
      
      // Free up the old plantilla (set to vacant) if it exists
      if (normalizedOldId !== null) {
        console.log('[Plantilla Vacancy Update] Freeing old plantilla:', normalizedOldId);
        
        // Verify plantilla exists before freeing
        const [oldPlantillaCheck] = await connection.execute(
          'SELECT id, isvacant FROM plantilla WHERE id = ?',
          [normalizedOldId]
        );
        
        if (oldPlantillaCheck.length > 0) {
          console.log('[Plantilla Vacancy Update] Old plantilla before freeing:', {
            id: oldPlantillaCheck[0].id,
            isvacant: oldPlantillaCheck[0].isvacant
          });
          
          const [freeResult] = await connection.execute(
            `UPDATE plantilla SET isvacant = 1 WHERE id = ?`,
            [normalizedOldId]
          );
          
          console.log('[Plantilla Vacancy Update] Free result:', {
            affectedRows: freeResult.affectedRows,
            plantillaId: normalizedOldId
          });
          
          // Verify the update
          const [freeVerifyResult] = await connection.execute(
            'SELECT isvacant FROM plantilla WHERE id = ?',
            [normalizedOldId]
          );
          
          if (freeVerifyResult.length > 0) {
            console.log('[Plantilla Vacancy Update] Old plantilla after freeing:', {
              id: normalizedOldId,
              isvacant: freeVerifyResult[0].isvacant
            });
          }
        } else {
          console.warn('[Plantilla Vacancy Update] Old plantilla not found when trying to free:', normalizedOldId);
        }
      }
      
      // Mark the new plantilla as occupied (set to not vacant) if it exists
      if (normalizedNewId !== null) {
        console.log('[Plantilla Vacancy Update] Occupying new plantilla:', normalizedNewId);
        
        // Verify plantilla exists
        const [plantillaCheck] = await connection.execute(
          'SELECT id, isvacant FROM plantilla WHERE id = ?',
          [normalizedNewId]
        );
        
        if (plantillaCheck.length === 0) {
          console.error('[Plantilla Vacancy Update] Plantilla not found:', normalizedNewId);
          throw new Error(`Plantilla with id ${normalizedNewId} does not exist`);
        }
        
        console.log('[Plantilla Vacancy Update] Plantilla before update:', {
          id: plantillaCheck[0].id,
          isvacant: plantillaCheck[0].isvacant
        });
        
        const [updateResult] = await connection.execute(
          `UPDATE plantilla SET isvacant = 0 WHERE id = ?`,
          [normalizedNewId]
        );
        
        console.log('[Plantilla Vacancy Update] Update result:', {
          affectedRows: updateResult.affectedRows,
          plantillaId: normalizedNewId
        });
        
        // Verify the update
        const [verifyResult] = await connection.execute(
          'SELECT isvacant FROM plantilla WHERE id = ?',
          [normalizedNewId]
        );
        
        if (verifyResult.length > 0) {
          console.log('[Plantilla Vacancy Update] Plantilla after update:', {
            id: normalizedNewId,
            isvacant: verifyResult[0].isvacant
          });
        }
      }
    } else if (plantillaIdInt !== undefined && normalizedNewId !== null) {
      // Plantilla_id was explicitly provided in the update but didn't change
      // Ensure it's marked as occupied (defensive check in case it was somehow marked as vacant)
      console.log('[Plantilla Vacancy Update] Ensuring plantilla is occupied:', normalizedNewId);
      
      // Verify plantilla exists
      const [plantillaCheck] = await connection.execute(
        'SELECT id, isvacant FROM plantilla WHERE id = ?',
        [normalizedNewId]
      );
      
      if (plantillaCheck.length > 0) {
        const [updateResult] = await connection.execute(
          `UPDATE plantilla SET isvacant = 0 WHERE id = ?`,
          [normalizedNewId]
        );
        
        console.log('[Plantilla Vacancy Update] Defensive update result:', {
          affectedRows: updateResult.affectedRows,
          plantillaId: normalizedNewId,
          previousIsvacant: plantillaCheck[0].isvacant
        });
      } else {
        console.error('[Plantilla Vacancy Update] Plantilla not found for defensive update:', normalizedNewId);
      }
    }
    
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
    
    // Get plantilla_id before deletion to free it up
    const [currentRecord] = await connection.execute(
      'SELECT plantilla_id FROM employee_designation WHERE objid = ?',
      [objid]
    );
    const plantillaId = currentRecord.length > 0 ? currentRecord[0].plantilla_id : null;
    
    await connection.execute('DELETE FROM employee_designation WHERE objid = ?', [objid]);
    
    // Free up plantilla if it was assigned
    if (plantillaId) {
      await connection.execute(
        `UPDATE plantilla SET isvacant = 1 WHERE id = ?`,
        [plantillaId]
      );
    }
    
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
    const [rows] = await pool.execute('SELECT id, appointmentname, canleave, has_expiry FROM appointmenttypes ORDER BY appointmentname');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching appointment types:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


