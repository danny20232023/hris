import { getHR201Pool } from '../config/hr201Database.js';

// GET /api/201-plantilla - Get all plantilla records with pagination, search, and filters
export const getAllPlantilla = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { page = 1, limit = 10, search = '', department = '', vacant = '', islguplantilla = '', vacantOnly = '', includeEmployee = '' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const offset = Math.max(0, (pageNum - 1) * limitNum);
    
    const whereConditions = [];
    const params = [];
    
    // Search filter - only search position_title, position_shortname, and plantilla_no
    if (search) {
      whereConditions.push(`(p.position_title LIKE ? OR p.position_shortname LIKE ? OR p.plantilla_no LIKE ?)`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }
    
    // Department filter
    if (department && department !== 'all') {
      whereConditions.push(`p.department_id = ?`);
      params.push(parseInt(department));
    }
    
    // Vacant filter
    if (vacant && vacant !== 'all') {
      const vacantValue = parseInt(vacant);
      if (vacantValue === 1) {
        // Filter for Yes (isvacant = 1)
        whereConditions.push(`p.isvacant = 1`);
      } else if (vacantValue === 0) {
        // Filter for No (isvacant = 0 OR isvacant IS NULL)
        whereConditions.push(`(p.isvacant = 0 OR p.isvacant IS NULL)`);
      }
    }
    
    // Vacant only filter (for employee designation form - only show vacant plantillas)
    if (vacantOnly === 'true' || vacantOnly === true) {
      whereConditions.push(`p.isvacant = 1`);
    }
    
    // LGU Plantilla filter
    if (islguplantilla && islguplantilla !== 'all') {
      const lguValue = parseInt(islguplantilla);
      if (lguValue === 1) {
        // Filter for Yes (islguplantilla = 1)
        whereConditions.push(`p.islguplantilla = 1`);
      } else if (lguValue === 0) {
        // Filter for No (islguplantilla = 0)
        whereConditions.push(`p.islguplantilla = 0`);
      }
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM plantilla p
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
    
    // Fetch records with pagination
    // Build base query
    const includeEmployeeInfo = includeEmployee === 'true' || includeEmployee === true;
    let query = `
      SELECT 
        p.id,
        p.plantilla_no,
        p.salarygrade,
        p.plantilla_cscitemno,
        p.position_title,
        p.position_shortname,
        p.level,
        p.eligibilities,
        p.experiences,
        p.educations,
        p.trainings,
        p.competencies,
        p.supporting_id,
        p.department_id,
        p.plantillastatus,
        p.approvedby,
        p.approveddate,
        p.createdby,
        p.createddate,
        p.updatedby,
        p.updateddate,
        p.isvacant,
        p.dailywagesdays,
        p.islguplantilla,
        d.departmentname AS department_name,
        d.departmentshortname AS department_shortname,
        CASE 
          WHEN str.rate IS NOT NULL AND active_tranche.tranche_percent IS NOT NULL AND active_tranche.tranche_percent > 0 
          THEN str.rate * (active_tranche.tranche_percent / 100)
          ELSE NULL 
        END AS active_salary_rate,
        active_tranche.tranche AS active_tranche_name,
        active_tranche.implement_year AS active_tranche_implement_year${includeEmployeeInfo ? `,
        ed.emp_objid,
        e.surname AS assigned_employee_surname,
        e.firstname AS assigned_employee_firstname,
        e.middlename AS assigned_employee_middlename,
        e.extension AS assigned_employee_extension` : ''}
      FROM plantilla p
      LEFT JOIN department d ON p.department_id = d.deptid
      LEFT JOIN (
        SELECT t.tranche_id, t.tranche_percent, t.tranche, t.implement_year
        FROM salarytranches t
        WHERE t.tranchestatus = 'Active'
        ORDER BY t.implement_year DESC, t.tranche_id DESC
        LIMIT 1
      ) active_tranche ON 1=1
      LEFT JOIN salarytranches_rates str ON str.tranche_id = active_tranche.tranche_id 
        AND str.salarygrade = p.salarygrade 
        AND str.stepincrement = '01'${includeEmployeeInfo ? `
      LEFT JOIN employee_designation ed ON ed.plantilla_id = p.id AND ed.ispresent = 1
      LEFT JOIN employees e ON ed.emp_objid = e.objid` : ''}
    `;
    
    // Add WHERE clause if needed
    if (whereClause) {
      query += ` ${whereClause}`;
    }
    
    // Add ORDER BY and LIMIT/OFFSET
    // Use string interpolation for LIMIT/OFFSET as MySQL2 sometimes has issues with placeholders here
    query += ` ORDER BY p.position_title ASC LIMIT ${finalLimit} OFFSET ${finalOffset}`;
    
    // Build query parameters array - only WHERE clause params, no LIMIT/OFFSET
    const safeParams = Array.isArray(params) ? params : [];
    
    const [plantillaRecords] = await pool.execute(query, safeParams);
    
    // Format records
    const formattedRecords = plantillaRecords.map(record => ({
      ...record,
      plantillano: record.plantilla_no, // Keep for backward compatibility
      position: record.position_title, // Keep for backward compatibility
      positioncode: record.plantilla_cscitemno, // Keep for backward compatibility
      supportingid: record.supporting_id // Keep for backward compatibility
    }));
    
    res.json({
      success: true,
      data: formattedRecords,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching plantilla records:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plantilla records',
      error: error.message
    });
  }
};

// GET /api/201-plantilla/:id - Get single plantilla record by id
export const getPlantillaById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    const query = `
      SELECT 
        p.*,
        d.departmentname AS department_name,
        d.departmentshortname AS department_shortname
      FROM plantilla p
      LEFT JOIN department d ON p.department_id = d.deptid
      WHERE p.id = ?
    `;
    
    const [records] = await pool.execute(query, [id]);
    
    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Plantilla record not found'
      });
    }
    
    const record = records[0];
    
    // Add backward compatibility fields
    record.plantillano = record.plantilla_no;
    record.position = record.position_title;
    record.positioncode = record.plantilla_cscitemno;
    record.supportingid = record.supporting_id;
    
    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('❌ Error fetching plantilla record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plantilla record',
      error: error.message
    });
  }
};

// POST /api/201-plantilla - Create new plantilla record
export const createPlantilla = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const userId = req.user?.id || req.user?.USERID;
    
      const {
      plantilla_no,
      position_title,
      plantilla_cscitemno,
      position_shortname,
      level,
      salarygrade,
      eligibilities,
      experiences,
      educations,
      trainings,
      competencies,
      supporting_id,
      department_id,
      plantillastatus,
      islguplantilla
    } = req.body;
    
    // Validate required fields
    if (!position_title || !level || !salarygrade) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: position_title, level, salarygrade'
      });
    }
    
    await pool.query('START TRANSACTION');
    
    try {
      // Insert plantilla record
      const insertQuery = `
        INSERT INTO plantilla (
          plantilla_no, salarygrade, plantilla_cscitemno, position_title, position_shortname,
          level, eligibilities, experiences, educations, trainings, competencies,
          supporting_id, department_id, plantillastatus, islguplantilla, createdby, createddate, updatedby, updateddate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `;
      
      const [result] = await pool.execute(insertQuery, [
        plantilla_no || null,
        salarygrade,
        plantilla_cscitemno || null,
        position_title,
        position_shortname || null,
        parseInt(level),
        eligibilities || null,
        experiences || null,
        educations || null,
        trainings || null,
        competencies || null,
        supporting_id || null,
        department_id || null,
        plantillastatus || 'New',
        islguplantilla !== undefined ? (islguplantilla ? 1 : 0) : 0,
        userId,
        userId
      ]);
      
      const plantillaId = result.insertId;
      
      await pool.query('COMMIT');
      
      res.status(201).json({
        success: true,
        message: 'Plantilla record created successfully',
        data: { id: plantillaId }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error creating plantilla record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create plantilla record',
      error: error.message
    });
  }
};

// PUT /api/201-plantilla/:id - Update plantilla record
export const updatePlantilla = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const userId = req.user?.id || req.user?.USERID;
    
      const {
      plantilla_no,
      position_title,
      plantilla_cscitemno,
      position_shortname,
      level,
      salarygrade,
      eligibilities,
      experiences,
      educations,
      trainings,
      competencies,
      supporting_id,
      department_id,
      plantillastatus,
      islguplantilla
    } = req.body;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Update plantilla record
      const updateFields = [];
      const updateParams = [];
      
      if (plantilla_no !== undefined) { updateFields.push('plantilla_no = ?'); updateParams.push(plantilla_no); }
      if (position_title !== undefined) { updateFields.push('position_title = ?'); updateParams.push(position_title); }
      if (plantilla_cscitemno !== undefined) { updateFields.push('plantilla_cscitemno = ?'); updateParams.push(plantilla_cscitemno); }
      if (position_shortname !== undefined) { updateFields.push('position_shortname = ?'); updateParams.push(position_shortname); }
      if (level !== undefined) { updateFields.push('level = ?'); updateParams.push(parseInt(level)); }
      if (salarygrade !== undefined) { updateFields.push('salarygrade = ?'); updateParams.push(salarygrade); }
      if (eligibilities !== undefined) { updateFields.push('eligibilities = ?'); updateParams.push(eligibilities); }
      if (experiences !== undefined) { updateFields.push('experiences = ?'); updateParams.push(experiences); }
      if (educations !== undefined) { updateFields.push('educations = ?'); updateParams.push(educations); }
      if (trainings !== undefined) { updateFields.push('trainings = ?'); updateParams.push(trainings); }
      if (competencies !== undefined) { updateFields.push('competencies = ?'); updateParams.push(competencies); }
      if (supporting_id !== undefined) { updateFields.push('supporting_id = ?'); updateParams.push(supporting_id === '' ? null : supporting_id); }
      if (department_id !== undefined) { updateFields.push('department_id = ?'); updateParams.push(department_id === '' ? null : department_id); }
      if (plantillastatus !== undefined) { updateFields.push('plantillastatus = ?'); updateParams.push(plantillastatus); }
      if (islguplantilla !== undefined) { updateFields.push('islguplantilla = ?'); updateParams.push(islguplantilla ? 1 : 0); }
      
      updateFields.push('updatedby = ?');
      updateFields.push('updateddate = NOW()');
      updateParams.push(userId);
      updateParams.push(id);
      
      const updateQuery = `
        UPDATE plantilla
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      
      const [result] = await pool.execute(updateQuery, updateParams);
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Plantilla record not found'
        });
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Plantilla record updated successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error updating plantilla record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update plantilla record',
      error: error.message
    });
  }
};

// DELETE /api/201-plantilla/:id - Delete plantilla record
export const deletePlantilla = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    await pool.query('START TRANSACTION');
    
    try {
      // Delete plantilla record
      const [result] = await pool.execute('DELETE FROM plantilla WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Plantilla record not found'
        });
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Plantilla record deleted successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Error deleting plantilla record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete plantilla record',
      error: error.message
    });
  }
};


