import { getHR201Pool } from '../config/hr201Database.js';
import { v4 as uuidv4 } from 'uuid';
import { formatEmployeeName } from '../utils/employeenameFormatter.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';

// Get all employees with their leave records
export const getAllEmployeesWithLeaveRecords = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    // Query to get all employees with their leave records
    const query = `
      SELECT 
        e.objid as emp_objid,
        e.idno,
        e.dtrbadgenumber,
        e.surname,
        e.firstname,
        e.middlename,
        e.totalearnedvl,
        e.totalearnedsl,
        el.objid as leave_objid,
        el.VL as balance_vl,
        el.SL as balance_sl,
        el.updated_at as leave_updated_at,
        el.updatedby,
        em.photo_path,
        s.photo AS updated_by_photo_blob,
        s.username AS updated_by_username,
        c.surname AS updated_by_surname,
        c.firstname AS updated_by_firstname,
        c.middlename AS updated_by_middlename,
        ed.objid as designation_objid,
        ed.position as position_title,
        atp.canleave as appointment_canleave,
        COALESCE(dept_cur.departmentshortname, dept_emp.departmentshortname) AS department_name
      FROM employees e
      LEFT JOIN employee_leave el ON e.objid = el.emp_objid
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN sysusers s ON el.updatedby = s.id
      LEFT JOIN employees c ON c.objid = s.emp_objid
      LEFT JOIN department dept_emp ON dept_emp.deptid = e.deptid
      LEFT JOIN employee_designation ed 
        ON ed.emp_objid = e.objid 
        AND CAST(ed.ispresent AS UNSIGNED) = 1
      LEFT JOIN department dept_cur ON dept_cur.deptid = ed.assigneddept
      LEFT JOIN appointmenttypes atp 
        ON ed.appointmentstatus = atp.id
      ORDER BY e.surname, e.firstname
    `;
    
    const [rows] = await pool.execute(query);
    
    // Format the data for frontend with photo conversion
    const employees = await Promise.all(rows.map(async (row) => {
      // Convert updated_by_photo_blob to base64
      let updatedByPhoto = null;
      if (row.updated_by_photo_blob) {
        try {
          const buffer = Buffer.isBuffer(row.updated_by_photo_blob) ? row.updated_by_photo_blob : Buffer.from(row.updated_by_photo_blob);
          if (buffer.length > 0) {
            const base64 = buffer.toString('base64');
            updatedByPhoto = `data:image/png;base64,${base64}`;
          }
        } catch (e) {
          console.error('❌ [LEAVE RECORDS] Error converting updated by photo blob:', e.message, 'Employee:', row.emp_objid);
          updatedByPhoto = null;
        }
      }
      // Only log warning if updatedby exists but photo blob is missing (actual issue)
      // Don't log if updatedby is null (expected - record was never updated)
      else if (row.updatedby) {
        console.warn('⚠️ [LEAVE RECORDS] updatedby exists but no photo blob found for employee:', row.emp_objid, 'updatedby:', row.updatedby);
      }
      
      // Convert photo_path (pathid) to base64
      let photoPathBase64 = null;
      if (row.photo_path != null && row.emp_objid) {
        try {
          // photo_path is now INT (pathid), requires objid and type
          photoPathBase64 = await readMediaAsBase64(row.photo_path, row.emp_objid, 'photo');
        } catch (error) {
          console.warn(`⚠️ [LEAVE RECORDS] Could not read photo for employee ${row.emp_objid}:`, error.message);
          photoPathBase64 = null;
        }
      }
      
      return {
        emp_objid: row.emp_objid,
        employee_id: row.idno,
        name: formatEmployeeName(row.surname, row.firstname, row.middlename),
        surname: row.surname,
        firstname: row.firstname,
        middlename: row.middlename,
        total_earned_vl: row.totalearnedvl || 0,
        total_earned_sl: row.totalearnedsl || 0,
        balance_vl: row.balance_vl || 0,
        balance_sl: row.balance_sl || 0,
        has_leave_record: !!row.leave_objid,
        leave_objid: row.leave_objid,
        photo_path: photoPathBase64, // Replace pathid with base64 data URL
        leave_updated_at: row.leave_updated_at,
        updatedby: row.updatedby || null,
        updated_by_username: row.updated_by_username || null,
        updated_by_surname: row.updated_by_surname || null,
        updated_by_firstname: row.updated_by_firstname || null,
        updated_by_middlename: row.updated_by_middlename || null,
        updated_by_employee_name: formatEmployeeName(row.updated_by_surname, row.updated_by_firstname, row.updated_by_middlename),
        updated_by_photo_path: updatedByPhoto,
        designation_objid: row.designation_objid || null,
        appointment_canleave: row.appointment_canleave !== null ? Number(row.appointment_canleave) : null,
        department_name: row.department_name || null,
        position_title: row.position_title || null
      };
    }));
    
    res.json({
      success: true,
      employees: employees
    });
    
  } catch (error) {
    console.error('Error fetching employees with leave records:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees with leave records',
      error: error.message
    });
  }
};

// Get leave record by employee ID
export const getLeaveRecordByEmployeeId = async (req, res) => {
  try {
    let { emp_objid } = req.params;
    
    // Clean up emp_objid - remove any trailing colon and number if present
    if (emp_objid && emp_objid.includes(':')) {
      emp_objid = emp_objid.split(':')[0];
      console.log('⚠️ [LeaveRecords] Cleaned emp_objid from URL param:', emp_objid);
    }
    
    if (!emp_objid) {
      return res.status(400).json({
        success: false,
        message: 'Employee objid is required'
      });
    }
    
    console.log('🔍 [LeaveRecords] Fetching leave record for emp_objid:', emp_objid);
    const pool = getHR201Pool();
    
    const query = `
      SELECT 
        el.objid,
        el.emp_objid,
        el.VL as balance_vl,
        el.SL as balance_sl,
        el.updated_at,
        e.idno,
        e.surname,
        e.firstname,
        e.middlename,
        e.totalearnedvl,
        e.totalearnedsl
      FROM employee_leave el
      JOIN employees e ON el.emp_objid = e.objid
      WHERE el.emp_objid = ?
    `;
    
    const [rows] = await pool.execute(query, [emp_objid]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave record not found for this employee'
      });
    }
    
    const leaveRecord = rows[0];
    
    res.json({
      success: true,
      leaveRecord: {
        objid: leaveRecord.objid,
        emp_objid: leaveRecord.emp_objid,
        employee_id: leaveRecord.idno,
        name: `${leaveRecord.surname}, ${leaveRecord.firstname} ${leaveRecord.middlename || ''}`.trim(),
        total_earned_vl: leaveRecord.totalearnedvl || 0,
        total_earned_sl: leaveRecord.totalearnedsl || 0,
        balance_vl: leaveRecord.balance_vl || 0,
        balance_sl: leaveRecord.balance_sl || 0,
        updated_at: leaveRecord.updated_at
      }
    });
    
  } catch (error) {
    console.error('Error fetching leave record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave record',
      error: error.message
    });
  }
};

// Create new leave record
export const createLeaveRecord = async (req, res) => {
  try {
    const { emp_objid, balance_vl, balance_sl, total_earned_vl, total_earned_sl } = req.body;
    const pool = getHR201Pool();
    
    // Validate required fields
    if (!emp_objid) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    // Check if employee exists
    const [employeeRows] = await pool.execute(
      'SELECT objid FROM employees WHERE objid = ?',
      [emp_objid]
    );
    
    if (employeeRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if leave record already exists
    const [existingRows] = await pool.execute(
      'SELECT objid FROM employee_leave WHERE emp_objid = ?',
      [emp_objid]
    );
    
    if (existingRows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Leave record already exists for this employee'
      });
    }
    
    const objid = uuidv4();
    
    // Insert new leave record - use sysusers.id from JWT
    const updatedBy = req.user?.USERID || null;
    await pool.execute(
      `INSERT INTO employee_leave (objid, emp_objid, VL, SL, updated_at, updatedby)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [objid, emp_objid, balance_vl || 0, balance_sl || 0, updatedBy]
    );
    
    // Update employee's total earned VL/SL if provided
    if (total_earned_vl !== undefined || total_earned_sl !== undefined) {
      const updateFields = [];
      const updateValues = [];
      
      if (total_earned_vl !== undefined) {
        // Ensure the value is within valid range (decimal 7,3 = max 9999.999)
        const vlValue = Math.min(Math.max(parseFloat(total_earned_vl) || 0, 0), 9999.999);
        updateFields.push('totalearnedvl = ?');
        updateValues.push(vlValue);
      }
      
      if (total_earned_sl !== undefined) {
        // Ensure the value is within valid range (decimal 7,3 = max 9999.999)
        const slValue = Math.min(Math.max(parseFloat(total_earned_sl) || 0, 0), 9999.999);
        updateFields.push('totalearnedsl = ?');
        updateValues.push(slValue);
      }
      
      updateValues.push(emp_objid);
      
      await pool.execute(
        `UPDATE employees SET ${updateFields.join(', ')} WHERE objid = ?`,
        updateValues
      );
    }
    
    res.json({
      success: true,
      message: 'Leave record created successfully',
      leaveRecord: {
        objid,
        emp_objid,
        balance_vl: balance_vl || 0,
        balance_sl: balance_sl || 0
      }
    });
    
  } catch (error) {
    console.error('Error creating leave record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create leave record',
      error: error.message
    });
  }
};

// Update leave record
export const updateLeaveRecord = async (req, res) => {
  try {
    const { objid } = req.params;
    const { balance_vl, balance_sl, total_earned_vl, total_earned_sl } = req.body;
    const pool = getHR201Pool();
    
    // Check if leave record exists
    const [existingRows] = await pool.execute(
      'SELECT emp_objid FROM employee_leave WHERE objid = ?',
      [objid]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave record not found'
      });
    }
    
    const emp_objid = existingRows[0].emp_objid;
    
    // Update leave record - use sysusers.id from JWT
    const updatedBy = req.user?.USERID || null;
    await pool.execute(
      `UPDATE employee_leave 
       SET VL = ?, SL = ?, updated_at = NOW(), updatedby = ?
       WHERE objid = ?`,
      [balance_vl || 0, balance_sl || 0, updatedBy, objid]
    );
    
    // Update employee's total earned VL/SL if provided
    if (total_earned_vl !== undefined || total_earned_sl !== undefined) {
      const updateFields = [];
      const updateValues = [];
      
      if (total_earned_vl !== undefined) {
        // Ensure the value is within valid range (decimal 7,3 = max 9999.999)
        const vlValue = Math.min(Math.max(parseFloat(total_earned_vl) || 0, 0), 9999.999);
        updateFields.push('totalearnedvl = ?');
        updateValues.push(vlValue);
      }
      
      if (total_earned_sl !== undefined) {
        // Ensure the value is within valid range (decimal 7,3 = max 9999.999)
        const slValue = Math.min(Math.max(parseFloat(total_earned_sl) || 0, 0), 9999.999);
        updateFields.push('totalearnedsl = ?');
        updateValues.push(slValue);
      }
      
      updateValues.push(emp_objid);
      
      await pool.execute(
        `UPDATE employees SET ${updateFields.join(', ')} WHERE objid = ?`,
        updateValues
      );
    }
    
    res.json({
      success: true,
      message: 'Leave record updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating leave record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update leave record',
      error: error.message
    });
  }
};

// Delete leave record
export const deleteLeaveRecord = async (req, res) => {
  try {
    const { objid } = req.params;
    const pool = getHR201Pool();
    
    // Check if leave record exists
    const [existingRows] = await pool.execute(
      'SELECT emp_objid FROM employee_leave WHERE objid = ?',
      [objid]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave record not found'
      });
    }
    
    // Delete leave record
    await pool.execute(
      'DELETE FROM employee_leave WHERE objid = ?',
      [objid]
    );
    
    res.json({
      success: true,
      message: 'Leave record deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting leave record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete leave record',
      error: error.message
    });
  }
};

// Get current user's leave eligibility
export const getCurrentUserLeaveEligibility = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const userId = req.user?.USERID;

    if (!userId) {
      return res.status(401).json({
        success: false,
        canApplyLeave: false,
        hasActiveDesignation: false,
        reason: 'User ID not found in authentication context'
      });
    }

    // Step 1: Get employee objid from dtruserid
    const [employees] = await pool.execute(
      'SELECT objid FROM employees WHERE TRIM(CAST(dtruserid AS CHAR)) = ? LIMIT 1',
      [String(userId)]
    );

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        canApplyLeave: false,
        hasActiveDesignation: false,
        reason: 'Employee record not found'
      });
    }

    const emp_objid = employees[0].objid;

    // Step 2: Check for active designation with canleave flag from appointmenttypes
    // Note: 
    // - ed.designationid is a lookup to designationtypes table
    // - ed.appointmentstatus is a lookup to appointmenttypes table (contains canleave column)
    // Debug: First check if designation exists at all
    const [allDesignations] = await pool.execute(
      `SELECT 
        ed.objid as designation_objid,
        ed.emp_objid,
        ed.ispresent,
        ed.appointmentstatus,
        atp.canleave,
        atp.id as appointmenttype_id
      FROM employee_designation ed
      LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
      WHERE ed.emp_objid = ?`,
      [emp_objid]
    );

    console.log(`[LeaveEligibility] Found ${allDesignations.length} total designations for emp_objid: ${emp_objid}`);
    if (allDesignations.length > 0) {
      console.log('[LeaveEligibility] Designations found:', allDesignations.map(d => ({
        designation_objid: d.designation_objid,
        ispresent: d.ispresent,
        ispresent_type: typeof d.ispresent,
        appointmentstatus: d.appointmentstatus,
        canleave: d.canleave,
        appointmenttype_id: d.appointmenttype_id
      })));
    }

    // Filter for ispresent = 1 - use CAST to ensure proper comparison
    const [designations] = await pool.execute(
      `SELECT 
        atp.canleave,
        ed.objid as designation_objid,
        ed.emp_objid,
        ed.ispresent,
        ed.appointmentstatus
      FROM employee_designation ed
      LEFT JOIN appointmenttypes atp ON ed.appointmentstatus = atp.id
      WHERE ed.emp_objid = ? AND CAST(ed.ispresent AS UNSIGNED) = 1
      LIMIT 1`,
      [emp_objid]
    );

    console.log(`[LeaveEligibility] Found ${designations.length} active designations (ispresent = 1)`);
    if (designations.length > 0) {
      console.log('[LeaveEligibility] Active designation details:', {
        designation_objid: designations[0].designation_objid,
        ispresent: designations[0].ispresent,
        appointmentstatus: designations[0].appointmentstatus,
        canleave: designations[0].canleave
      });
    }

    // If no active designation found
    if (designations.length === 0) {
      return res.json({
        success: true,
        canApplyLeave: false,
        hasActiveDesignation: false,
        canleave: null,
        vlBalance: 0,
        slBalance: 0,
        reason: 'No active designation found'
      });
    }

    const designation = designations[0];
    const canleave = designation.canleave !== null ? Number(designation.canleave) : 0;

    // Step 3: Check canleave flag
    if (canleave === 0) {
      return res.json({
        success: true,
        canApplyLeave: false,
        hasActiveDesignation: true,
        canleave: 0,
        vlBalance: 0,
        slBalance: 0,
        reason: 'Leave application not allowed for your designation'
      });
    }

    // Step 4: If canleave = 1, check leave balances
    const [leaveRecords] = await pool.execute(
      `SELECT VL, SL
      FROM employee_leave
      WHERE emp_objid = ?`,
      [emp_objid]
    );

    let vlBalance = 0;
    let slBalance = 0;

    if (leaveRecords.length > 0) {
      vlBalance = Number(leaveRecords[0].VL) || 0;
      slBalance = Number(leaveRecords[0].SL) || 0;
    }

    // Check if both balances are <= 0
    if (vlBalance <= 0 && slBalance <= 0) {
      return res.json({
        success: true,
        canApplyLeave: false,
        hasActiveDesignation: true,
        canleave: 1,
        vlBalance: vlBalance,
        slBalance: slBalance,
        reason: 'Cannot apply leave with zero or negative leave balances'
      });
    }

    // All checks passed - can apply leave
    return res.json({
      success: true,
      canApplyLeave: true,
      hasActiveDesignation: true,
      canleave: 1,
      vlBalance: vlBalance,
      slBalance: slBalance,
      reason: ''
    });

  } catch (error) {
    console.error('Error checking leave eligibility:', error);
    res.status(500).json({
      success: false,
      canApplyLeave: false,
      hasActiveDesignation: false,
      reason: 'Unable to verify leave eligibility. Please contact HR.',
      error: error.message
    });
  }
};