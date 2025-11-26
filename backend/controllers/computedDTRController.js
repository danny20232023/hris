import { getHR201Pool } from '../config/hr201Database.js';
import { getDb } from '../config/db.js';
import sql from 'mssql';

// @desc    Get all computed DTR records with filters
// @route   GET /api/computed-dtr
// @access  Private
export const getAllComputedDtr = async (req, res) => {
  try {
    const { emp_objid, computedmonth, computedyear, period, computestatus, department, appointment, status } = req.query;
    const pool = getHR201Pool();
    
    let query = `
      SELECT 
        c.computeid,
        c.emp_objid,
        c.batchid,
        c.computedmonth,
        c.computedyear,
        c.period,
        c.total_lates,
        c.total_days,
        c.total_netdays,
        c.total_cdo,
        c.total_travels,
        c.total_leaves,
        c.total_fixtimes,
        c.createdby,
        c.createddate,
        c.updatedby,
        c.updateddate,
        c.approvedby,
        c.approveddate,
        c.computeremarks,
        c.computestatus,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension,
        COALESCE(dept_cur.departmentshortname, dept_emp.departmentshortname) AS department_name,
        cur.position AS position_title,
        cur.appointmentstatus AS appointment_status,
        atp.appointmentname AS appointment_name,
        e.empstatus AS employee_status
      FROM employee_computeddtr c
      LEFT JOIN employees e ON c.emp_objid = e.objid
      LEFT JOIN department dept_emp ON dept_emp.deptid = e.deptid
      LEFT JOIN employee_designation cur ON cur.emp_objid = e.objid AND cur.ispresent = 1
      LEFT JOIN department dept_cur ON dept_cur.deptid = cur.assigneddept
      LEFT JOIN appointmenttypes atp ON cur.appointmentstatus = atp.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (emp_objid) {
      query += ` AND c.emp_objid = ?`;
      params.push(emp_objid);
    }
    
    if (computedmonth) {
      query += ` AND c.computedmonth = ?`;
      params.push(computedmonth);
    }
    
    if (computedyear) {
      query += ` AND c.computedyear = ?`;
      params.push(computedyear);
    }
    
    if (period) {
      query += ` AND c.period = ?`;
      params.push(period);
    }
    
    if (computestatus) {
      query += ` AND c.computestatus = ?`;
      params.push(computestatus);
    }
    
    if (department && department !== 'all') {
      query += ` AND (dept_cur.departmentshortname = ? OR dept_emp.departmentshortname = ?)`;
      params.push(department, department);
    }
    
    if (appointment && appointment !== 'all') {
      query += ` AND cur.appointmentstatus = ?`;
      params.push(appointment);
    }
    
    if (status && status !== 'all') {
      query += ` AND e.empstatus = ?`;
      params.push(status);
    }
    
    query += ` ORDER BY c.createddate DESC`;
    
    const [records] = await pool.execute(query, params);
    
    res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (error) {
    console.error('❌ Error fetching computed DTR records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching computed DTR records',
      error: error.message
    });
  }
};

// @desc    Get single computed DTR record by computeid
// @route   GET /api/computed-dtr/:id
// @access  Private
export const getComputedDtrById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    const [records] = await pool.execute(`
      SELECT 
        c.*,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension
      FROM employee_computeddtr c
      LEFT JOIN employees e ON c.emp_objid = e.objid
      WHERE c.computeid = ?
    `, [id]);
    
    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Computed DTR record not found'
      });
    }
    
    res.json({
      success: true,
      data: records[0]
    });
  } catch (error) {
    console.error('❌ Error fetching computed DTR record:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching computed DTR record',
      error: error.message
    });
  }
};

// @desc    Get all details records for a computeid
// @route   GET /api/computed-dtr/:id/details
// @access  Private
export const getComputedDtrDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();
    
    const [details] = await pool.execute(`
      SELECT *
      FROM employee_computeddtr_details
      WHERE computeid = ?
      ORDER BY dtrdate ASC
    `, [id]);
    
    res.json({
      success: true,
      data: details,
      count: details.length
    });
  } catch (error) {
    console.error('❌ Error fetching computed DTR details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching computed DTR details',
      error: error.message
    });
  }
};

// @desc    Get computed DTR for specific employee/month/year/period
// @route   GET /api/computed-dtr/employee/:empObjId
// @access  Private
export const getComputedDtrByEmployee = async (req, res) => {
  try {
    const { empObjId } = req.params;
    const { computedmonth, computedyear, period } = req.query;
    const pool = getHR201Pool();
    
    let query = `
      SELECT 
        c.*,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension
      FROM employee_computeddtr c
      LEFT JOIN employees e ON c.emp_objid = e.objid
      WHERE c.emp_objid = ?
    `;
    
    const params = [empObjId];
    
    if (computedmonth) {
      query += ` AND c.computedmonth = ?`;
      params.push(computedmonth);
    }
    
    if (computedyear) {
      query += ` AND c.computedyear = ?`;
      params.push(computedyear);
    }
    
    if (period) {
      query += ` AND c.period = ?`;
      params.push(period);
    }
    
    query += ` ORDER BY c.createddate DESC`;
    
    const [records] = await pool.execute(query, params);
    
    res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (error) {
    console.error('❌ Error fetching computed DTR by employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching computed DTR by employee',
      error: error.message
    });
  }
};

// @desc    Create new computed DTR with details
// @route   POST /api/computed-dtr
// @access  Private
export const createComputedDtr = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      emp_objid,
      batchid,
      computedmonth,
      computedyear,
      period,
      total_lates,
      total_days,
      total_netdays,
      total_cdo,
      total_travels,
      total_leaves,
      total_fixtimes,
      computeremarks,
      computestatus = 'For Approval',
      details = []
    } = req.body;
    
    const createdby = req.user?.USERID || req.user?.id || null;
    
    // Validate required fields
    if (!emp_objid || !computedmonth || !computedyear || !period) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'emp_objid, computedmonth, computedyear, and period are required'
      });
    }
    
    // Insert main computed DTR record
    const [result] = await connection.execute(`
      INSERT INTO employee_computeddtr (
        emp_objid,
        batchid,
        computedmonth,
        computedyear,
        period,
        total_lates,
        total_days,
        total_netdays,
        total_cdo,
        total_travels,
        total_leaves,
        total_fixtimes,
        createdby,
        createddate,
        computeremarks,
        computestatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
    `, [
      emp_objid,
      batchid || null,
      computedmonth,
      computedyear,
      period,
      total_lates || 0,
      total_days || 0,
      total_netdays || 0,
      total_cdo || 0,
      total_travels || 0,
      total_leaves || 0,
      total_fixtimes || 0,
      createdby,
      computeremarks || null,
      computestatus
    ]);
    
    const computeid = result.insertId;
    
    // Insert details records one by one
    if (details && details.length > 0) {
      for (const detail of details) {
        await connection.execute(`
          INSERT INTO employee_computeddtr_details (
            computeid,
            dtruserid,
            dtrdate,
            am_checkin,
            am_checkout,
            pm_checkin,
            pm_checkout,
            ot_checkin,
            ot_checkout,
            hascdo,
            hasleave,
            hastravel,
            haslocator,
            hasfixlogs
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          computeid,
          detail.dtruserid || null,
          detail.dtrdate || null,
          detail.am_checkin || null,
          detail.am_checkout || null,
          detail.pm_checkin || null,
          detail.pm_checkout || null,
          detail.ot_checkin || null,
          detail.ot_checkout || null,
          detail.hascdo ? 1 : 0,
          detail.hasleave ? 1 : 0,
          detail.hastravel ? 1 : 0,
          detail.haslocator ? 1 : 0,
          detail.hasfixlogs ? 1 : 0
        ]);
      }
    }
    
    await connection.commit();
    
    // Fetch the created record
    const [createdRecord] = await connection.execute(`
      SELECT * FROM employee_computeddtr WHERE computeid = ?
    `, [computeid]);
    
    res.status(201).json({
      success: true,
      message: 'Computed DTR created successfully',
      data: createdRecord[0],
      computeid: computeid
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error creating computed DTR:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating computed DTR',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// @desc    Update computed DTR and details
// @route   PUT /api/computed-dtr/:id
// @access  Private
export const updateComputedDtr = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      batchid,
      computedmonth,
      computedyear,
      period,
      total_lates,
      total_days,
      total_netdays,
      total_cdo,
      total_travels,
      total_leaves,
      total_fixtimes,
      computeremarks,
      computestatus,
      details = []
    } = req.body;
    
    const updatedby = req.user?.USERID || req.user?.id || null;
    
    // Check if record exists
    const [existing] = await connection.execute(`
      SELECT computeid FROM employee_computeddtr WHERE computeid = ?
    `, [id]);
    
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Computed DTR record not found'
      });
    }
    
    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    
    if (batchid !== undefined) {
      updateFields.push('batchid = ?');
      updateValues.push(batchid);
    }
    if (computedmonth !== undefined) {
      updateFields.push('computedmonth = ?');
      updateValues.push(computedmonth);
    }
    if (computedyear !== undefined) {
      updateFields.push('computedyear = ?');
      updateValues.push(computedyear);
    }
    if (period !== undefined) {
      updateFields.push('period = ?');
      updateValues.push(period);
    }
    if (total_lates !== undefined) {
      updateFields.push('total_lates = ?');
      updateValues.push(total_lates);
    }
    if (total_days !== undefined) {
      updateFields.push('total_days = ?');
      updateValues.push(total_days);
    }
    if (total_netdays !== undefined) {
      updateFields.push('total_netdays = ?');
      updateValues.push(total_netdays);
    }
    if (total_cdo !== undefined) {
      updateFields.push('total_cdo = ?');
      updateValues.push(total_cdo);
    }
    if (total_travels !== undefined) {
      updateFields.push('total_travels = ?');
      updateValues.push(total_travels);
    }
    if (total_leaves !== undefined) {
      updateFields.push('total_leaves = ?');
      updateValues.push(total_leaves);
    }
    if (total_fixtimes !== undefined) {
      updateFields.push('total_fixtimes = ?');
      updateValues.push(total_fixtimes);
    }
    if (computeremarks !== undefined) {
      updateFields.push('computeremarks = ?');
      updateValues.push(computeremarks);
    }
    if (computestatus !== undefined) {
      updateFields.push('computestatus = ?');
      updateValues.push(computestatus);
    }
    
    if (updateFields.length > 0) {
      updateFields.push('updatedby = ?');
      updateValues.push(updatedby);
      updateFields.push('updateddate = NOW()');
      updateValues.push(id);
      
      await connection.execute(`
        UPDATE employee_computeddtr
        SET ${updateFields.join(', ')}
        WHERE computeid = ?
      `, updateValues);
    }
    
    // Update details: delete existing and insert new
    if (details && details.length > 0) {
      // Delete existing details
      await connection.execute(`
        DELETE FROM employee_computeddtr_details WHERE computeid = ?
      `, [id]);
      
      // Insert new details one by one
      for (const detail of details) {
        await connection.execute(`
          INSERT INTO employee_computeddtr_details (
            computeid,
            dtruserid,
            dtrdate,
            am_checkin,
            am_checkout,
            pm_checkin,
            pm_checkout,
            ot_checkin,
            ot_checkout,
            hascdo,
            hasleave,
            hastravel,
            haslocator,
            hasfixlogs
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          detail.dtruserid || null,
          detail.dtrdate || null,
          detail.am_checkin || null,
          detail.am_checkout || null,
          detail.pm_checkin || null,
          detail.pm_checkout || null,
          detail.ot_checkin || null,
          detail.ot_checkout || null,
          detail.hascdo ? 1 : 0,
          detail.hasleave ? 1 : 0,
          detail.hastravel ? 1 : 0,
          detail.haslocator ? 1 : 0,
          detail.hasfixlogs ? 1 : 0
        ]);
      }
    }
    
    await connection.commit();
    
    // Fetch updated record
    const [updatedRecord] = await connection.execute(`
      SELECT * FROM employee_computeddtr WHERE computeid = ?
    `, [id]);
    
    res.json({
      success: true,
      message: 'Computed DTR updated successfully',
      data: updatedRecord[0]
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error updating computed DTR:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating computed DTR',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// @desc    Delete computed DTR and cascade delete details
// @route   DELETE /api/computed-dtr/:id
// @access  Private
export const deleteComputedDtr = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    
    // Check if record exists
    const [existing] = await connection.execute(`
      SELECT computeid FROM employee_computeddtr WHERE computeid = ?
    `, [id]);
    
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Computed DTR record not found'
      });
    }
    
    // Delete details first (cascade)
    await connection.execute(`
      DELETE FROM employee_computeddtr_details WHERE computeid = ?
    `, [id]);
    
    // Delete main record
    await connection.execute(`
      DELETE FROM employee_computeddtr WHERE computeid = ?
    `, [id]);
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Computed DTR deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error deleting computed DTR:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting computed DTR',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

