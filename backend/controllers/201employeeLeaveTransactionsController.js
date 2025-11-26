import { v4 as uuidv4 } from 'uuid';
import { getHR201Pool } from '../config/hr201Database.js';
import { changeNotificationService } from '../services/changeNotificationService.js';
import { formatEmployeeName, formatEmployeeNameFromString } from '../utils/employeenameFormatter.js';

// Helper function to generate leaveno in format: yymmddLV-SEQ
async function generateLeaveNo(connection) {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const datePrefix = `${String(year).slice(-2)}${month}${day}`;
  
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM employee_leave_trans WHERE DATE_FORMAT(createddate, '%Y-%m-%d') = ?`,
    [`${year}-${month}-${day}`]
  );
  const seq = Number(rows?.[0]?.cnt || 0) + 1;
  return `${datePrefix}LV-${String(seq).padStart(3, '0')}`;
}

// Get all employees with transaction summary
export const getAllEmployeesWithTransactions = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { department } = req.query;

    let query = `
      SELECT 
        e.objid as emp_objid,
        e.idno as employee_id,
        e.surname,
        e.firstname,
        e.middlename,
        e.extension,
        e.deptid as department_id,
        d.departmentname,
        el.VL as vl_balance,
        el.SL as sl_balance,
        COALESCE(SUM(elt.deductedcredit), 0) as filed_leaves,
        COALESCE(COUNT(CASE WHEN elt.leavestatus = 'Approved' THEN 1 END), 0) as approved_leaves,
        em.photo_path,
        ed.objid as designation_objid,
        ed.position as position_title,
        ed.assigneddept as assigned_dept_id,
        atp.canleave as appointment_canleave,
        COALESCE(dept_cur.departmentshortname, dept_emp.departmentshortname) AS department_name
      FROM employees e
      LEFT JOIN department d ON e.deptid = d.deptid
      LEFT JOIN department dept_emp ON dept_emp.deptid = e.deptid
      LEFT JOIN employee_leave el ON e.objid = el.emp_objid
      LEFT JOIN employee_leave_trans elt ON e.objid = elt.emp_objid
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN employee_designation ed 
        ON ed.emp_objid = e.objid 
        AND CAST(ed.ispresent AS UNSIGNED) = 1
      LEFT JOIN department dept_cur ON dept_cur.deptid = ed.assigneddept
      LEFT JOIN appointmenttypes atp 
        ON ed.appointmentstatus = atp.id
    `;

    const conditions = [];
    const params = [];

    if (department) {
      conditions.push('ed.assigneddept = ?');
      params.push(department);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      GROUP BY e.objid, e.idno, e.surname, e.firstname, e.middlename, e.deptid, d.departmentname, el.VL, el.SL, em.photo_path, ed.objid, ed.position, ed.assigneddept, dept_cur.departmentshortname, dept_emp.departmentshortname, atp.canleave
      ORDER BY e.surname, e.firstname
    `;

    const [rows] = await pool.execute(query, params);

    // Format employee names using centralized utility
    const formattedRows = rows.map(row => ({
      ...row,
      employee_name: formatEmployeeName(row.surname, row.firstname, row.middlename, row.extension)
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching employees with transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all leave transactions with filters
export const getAllLeaveTransactions = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { dateFrom, dateTo, status, leavetypeid } = req.query;

    let query = `
      SELECT 
        elt.*,
        e.surname, e.firstname, e.middlename, e.extension,
        lt.leavetype as leave_type_name,
        lt.leavecode,
        su.photo AS created_by_photo_blob,
        su.username AS created_by_username,
        c.surname AS created_by_surname,
        c.firstname AS created_by_firstname,
        c.middlename AS created_by_middlename,
        approver_user.photo AS approved_by_photo_blob,
        approver_user.username AS approved_by_username,
        approver_emp.surname AS approved_by_surname,
        approver_emp.firstname AS approved_by_firstname,
        approver_emp.middlename AS approved_by_middlename,
        em.photo_path,
        elq.objid as question_answer_id,
        elq.questionid,
        elq.specify as answer,
        ltq.question as question_text,
        GROUP_CONCAT(
          CONCAT(eltd.leavedate, ':', eltd.leavecredit) SEPARATOR '|'
        ) as details_summary,
        el.VL AS leave_vl_balance,
        el.SL AS leave_sl_balance,
        ed.objid as designation_objid,
        ed.position as position_title,
        COALESCE(dept_cur.departmentshortname, dept_emp.departmentshortname) AS department_name
      FROM employee_leave_trans elt
      LEFT JOIN employees e ON elt.emp_objid = e.objid
      LEFT JOIN leavetypes lt ON elt.leavetypeid = lt.leaveid
      LEFT JOIN sysusers su ON elt.createdby = su.id
      LEFT JOIN employees c ON c.objid = su.emp_objid
      LEFT JOIN sysusers approver_user ON elt.approvedby = approver_user.id
      LEFT JOIN employees approver_emp ON approver_emp.objid = approver_user.emp_objid
      LEFT JOIN employees_media em ON e.objid = em.emp_objid
      LEFT JOIN employee_leave el ON el.emp_objid = elt.emp_objid
      LEFT JOIN employee_leave_trans_details eltd ON elt.objid = eltd.leave_objid
      LEFT JOIN employee_leave_questions elq ON elt.objid = elq.leave_objid
      LEFT JOIN leavetypes_question ltq ON elq.questionid COLLATE utf8mb4_unicode_ci = ltq.objid COLLATE utf8mb4_unicode_ci
      LEFT JOIN department dept_emp ON dept_emp.deptid = e.deptid
      LEFT JOIN employee_designation ed 
        ON ed.emp_objid = e.objid 
        AND CAST(ed.ispresent AS UNSIGNED) = 1
      LEFT JOIN department dept_cur ON dept_cur.deptid = ed.assigneddept
      WHERE 1=1
    `;

    const params = [];

    // Filter by status
    if (status) {
      const normalizedStatus = normalizeLeaveStatus(status);
      query += ' AND elt.leavestatus = ?';
      params.push(normalizedStatus);
    }

    // Filter by leave type
    if (leavetypeid) {
      query += ' AND elt.leavetypeid = ?';
      params.push(leavetypeid);
    }

    // Filter by date range on leavedate from details
    // Use EXISTS subquery to check if any detail date falls within the specified range
    if (dateFrom && dateTo) {
      query += ` AND EXISTS (
        SELECT 1 FROM employee_leave_trans_details eltd_filter 
        WHERE eltd_filter.leave_objid = elt.objid 
        AND eltd_filter.leavedate >= ? 
        AND eltd_filter.leavedate <= ?
      )`;
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      query += ` AND EXISTS (
        SELECT 1 FROM employee_leave_trans_details eltd_filter 
        WHERE eltd_filter.leave_objid = elt.objid 
        AND eltd_filter.leavedate >= ?
      )`;
      params.push(dateFrom);
    } else if (dateTo) {
      query += ` AND EXISTS (
        SELECT 1 FROM employee_leave_trans_details eltd_filter 
        WHERE eltd_filter.leave_objid = elt.objid 
        AND eltd_filter.leavedate <= ?
      )`;
      params.push(dateTo);
    }

    query += `
      GROUP BY elt.objid
      ORDER BY elt.createddate DESC
    `;

    const [rows] = await pool.execute(query, params);
    
    // Parse details summary and convert photos to base64
    const transactions = await Promise.all(rows.map(async (row) => {
      const details = [];
      if (row.details_summary) {
        const detailPairs = row.details_summary.split('|');
        detailPairs.forEach(pair => {
          const [date, credit] = pair.split(':');
          details.push({
            deducteddate: date,
            deductedcredit: parseFloat(credit)
          });
        });
      }
      
      let createdByPhoto = null;
      if (row.created_by_photo_blob) {
        try {
          const buffer = Buffer.isBuffer(row.created_by_photo_blob) ? row.created_by_photo_blob : Buffer.from(row.created_by_photo_blob);
          if (buffer.length === 0) {
            console.log('⚠️ [LEAVE TRANSACTIONS] Created by photo blob is empty for transaction:', row.objid);
            createdByPhoto = null;
          } else {
          const base64 = buffer.toString('base64');
          createdByPhoto = `data:image/png;base64,${base64}`;
            console.log('✅ [LEAVE TRANSACTIONS] Created by photo converted successfully for transaction:', row.objid, 'Size:', buffer.length);
          }
        } catch (e) {
          console.error('❌ [LEAVE TRANSACTIONS] Error converting created by photo blob:', e.message, 'Transaction:', row.objid);
          createdByPhoto = null;
        }
      } else {
        console.log('⚠️ [LEAVE TRANSACTIONS] No created_by_photo_blob found for transaction:', row.objid, 'createdby:', row.createdby);
      }
      
      let approvedByPhoto = null;
      if (row.approved_by_photo_blob) {
        try {
          const buffer = Buffer.isBuffer(row.approved_by_photo_blob) ? row.approved_by_photo_blob : Buffer.from(row.approved_by_photo_blob);
          const base64 = buffer.toString('base64');
          approvedByPhoto = `data:image/png;base64,${base64}`;
        } catch (e) {
          approvedByPhoto = null;
        }
      }
      
      return {
        ...row,
        status: normalizeLeaveStatus(row.leavestatus),
        employee_name: formatEmployeeName(row.surname, row.firstname, row.middlename, row.extension),
        created_by_employee_name: formatEmployeeName(row.created_by_surname, row.created_by_firstname, row.created_by_middlename),
        approved_by_employee_name: formatEmployeeName(row.approved_by_surname, row.approved_by_firstname, row.approved_by_middlename),
        details,
        vl_balance:
          row.leave_vl_balance ??
          row.VL ??
          row.vl ??
          row.vl_balance ??
          row.balance_vl ??
          null,
        sl_balance:
          row.leave_sl_balance ??
          row.SL ??
          row.sl ??
          row.sl_balance ??
          row.balance_sl ??
          null,
        created_by_photo_path: createdByPhoto,
        approved_by_photo_path: approvedByPhoto,
        questionAnswer: row.question_answer_id ? {
          id: row.question_answer_id,
          questionId: row.questionid,
          answer: row.answer,
          questionText: row.question_text
        } : null
      };
    }));

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching all leave transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get transactions for specific employee
export const getEmployeeTransactions = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { emp_objid } = req.params;

    const query = `
      SELECT 
        elt.*,
        lt.leavetype as leave_type_name,
        su.photo AS created_by_photo_blob,
        su.username AS created_by_username,
        c.surname AS created_by_surname,
        c.firstname AS created_by_firstname,
        c.middlename AS created_by_middlename,
        approver_user.photo AS approved_by_photo_blob,
        approver_user.username AS approved_by_username,
        approver_emp.surname AS approved_by_surname,
        approver_emp.firstname AS approved_by_firstname,
        approver_emp.middlename AS approved_by_middlename,
        elq.objid as question_answer_id,
        elq.questionid,
        elq.specify as answer,
        ltq.question as question_text,
        GROUP_CONCAT(
          CONCAT(
            eltd.leavedate, ':', eltd.leavecredit
          ) SEPARATOR '|'
        ) as details_summary,
        GROUP_CONCAT(
          eltd.leavedate 
          ORDER BY eltd.leavedate 
          SEPARATOR ', '
        ) as leave_dates,
        el.VL AS leave_vl_balance,
        el.SL AS leave_sl_balance
      FROM employee_leave_trans elt
      LEFT JOIN leavetypes lt ON elt.leavetypeid = lt.leaveid
      LEFT JOIN sysusers su ON elt.createdby = su.id
      LEFT JOIN employees c ON c.objid = su.emp_objid
      LEFT JOIN sysusers approver_user ON elt.approvedby = approver_user.id
      LEFT JOIN employees approver_emp ON approver_emp.objid = approver_user.emp_objid
      LEFT JOIN employee_leave el ON el.emp_objid = elt.emp_objid
      LEFT JOIN employee_leave_trans_details eltd ON elt.objid = eltd.leave_objid
      LEFT JOIN employee_leave_questions elq ON elt.objid = elq.leave_objid
      LEFT JOIN leavetypes_question ltq ON elq.questionid COLLATE utf8mb4_unicode_ci = ltq.objid COLLATE utf8mb4_unicode_ci
      WHERE elt.emp_objid = ?
      GROUP BY elt.objid
      ORDER BY elt.createddate DESC
    `;

    const [rows] = await pool.execute(query, [emp_objid]);

    // Parse details summary into structured data and convert photos to base64
    const transactions = await Promise.all(rows.map(async (row) => {
      const details = [];
      if (row.details_summary) {
        const detailPairs = row.details_summary.split('|');
        detailPairs.forEach(pair => {
          const [date, credit] = pair.split(':');
          details.push({
            deducteddate: date,
            deductedcredit: parseFloat(credit)
          });
        });
      }
      
      // Convert photo BLOB to base64
      let createdByPhoto = null;
      if (row.created_by_photo_blob) {
        try {
          const buffer = Buffer.isBuffer(row.created_by_photo_blob) ? row.created_by_photo_blob : Buffer.from(row.created_by_photo_blob);
          if (buffer.length === 0) {
            console.log('⚠️ [LEAVE TRANSACTIONS] Created by photo blob is empty for transaction:', row.objid);
            createdByPhoto = null;
          } else {
          const base64 = buffer.toString('base64');
          createdByPhoto = `data:image/png;base64,${base64}`;
            console.log('✅ [LEAVE TRANSACTIONS] Created by photo converted successfully for transaction:', row.objid, 'Size:', buffer.length);
          }
        } catch (e) {
          console.error('❌ [LEAVE TRANSACTIONS] Error converting created by photo blob:', e.message, 'Transaction:', row.objid);
          createdByPhoto = null;
        }
      } else {
        console.log('⚠️ [LEAVE TRANSACTIONS] No created_by_photo_blob found for transaction:', row.objid, 'createdby:', row.createdby);
      }
      
      let approvedByPhoto = null;
      if (row.approved_by_photo_blob) {
        try {
          const buffer = Buffer.isBuffer(row.approved_by_photo_blob) ? row.approved_by_photo_blob : Buffer.from(row.approved_by_photo_blob);
          const base64 = buffer.toString('base64');
          approvedByPhoto = `data:image/png;base64,${base64}`;
        } catch (e) {
          approvedByPhoto = null;
        }
      }
      
      return {
        ...row,
        status: normalizeLeaveStatus(row.leavestatus),
        employee_name: formatEmployeeName(row.surname, row.firstname, row.middlename, row.extension),
        created_by_employee_name: formatEmployeeName(row.created_by_surname, row.created_by_firstname, row.created_by_middlename),
        approved_by_employee_name: formatEmployeeName(row.approved_by_surname, row.approved_by_firstname, row.approved_by_middlename),
        created_by_photo_path: createdByPhoto,
        approved_by_photo_path: approvedByPhoto,
        details,
        vl_balance:
          row.leave_vl_balance ??
          row.VL ??
          row.vl ??
          row.vl_balance ??
          row.balance_vl ??
          null,
        sl_balance:
          row.leave_sl_balance ??
          row.SL ??
          row.sl ??
          row.sl_balance ??
          row.balance_sl ??
          null,
        questionAnswer: row.question_answer_id ? {
          id: row.question_answer_id,
          questionId: row.questionid,
          answer: row.answer,
          questionText: row.question_text
        } : null
      };
    }));

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching employee transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Validation helper function for leave limits
export const validateLeaveLimits = async (connection, emp_objid, leavetypeid, requested_deductedcredit, selectedDates, exclude_transaction_objid = null) => {
  try {
    // Fetch leave type details including annualentitlement and leavecharging
    const [leaveTypeRows] = await connection.execute(
      'SELECT annualentitlement, leavecharging FROM leavetypes WHERE leaveid = ?',
      [leavetypeid]
    );

    if (leaveTypeRows.length === 0) {
      return {
        valid: false,
        error: 'Leave type not found',
        details: null
      };
    }

    const leaveType = leaveTypeRows[0];
    const annualentitlement = leaveType.annualentitlement;
    const leavecharging = leaveType.leavecharging || 'VL';

    // Determine earliest leavedate from selectedDates array
    let earliest_leavedate = null;
    if (selectedDates && selectedDates.length > 0) {
      const sortedDates = [...selectedDates].sort();
      earliest_leavedate = sortedDates[0];
    } else {
      // Use current date if no dates provided
      const now = new Date();
      earliest_leavedate = now.toISOString().split('T')[0];
    }

    // Extract calendar year from earliest leavedate
    const earliestYear = earliest_leavedate ? parseInt(earliest_leavedate.split('-')[0]) : new Date().getFullYear();

    // If annualentitlement is NOT NULL and > 0, check annual usage
    if (annualentitlement !== null && annualentitlement !== undefined && parseFloat(annualentitlement) > 0) {
      // Query total deductedcredit from employee_leave_trans for same emp_objid and leavetypeid
      // where leavestatus IN ('Approved', 'For Approval', 'Returned') and year matches
      // Check if the earliest leavedate in transaction details matches the year
      let query = `
        SELECT COALESCE(SUM(elt.deductedcredit), 0) as total_annual_used
        FROM employee_leave_trans elt
        WHERE elt.emp_objid = ?
          AND elt.leavetypeid = ?
          AND elt.leavestatus IN ('Approved', 'For Approval', 'Returned')
          AND EXISTS (
            SELECT 1 
            FROM employee_leave_trans_details eltd 
            WHERE eltd.leave_objid = elt.objid 
              AND YEAR(eltd.leavedate) = ?
              AND eltd.leavedate = (
                SELECT MIN(eltd2.leavedate)
                FROM employee_leave_trans_details eltd2
                WHERE eltd2.leave_objid = elt.objid
              )
          )
      `;
      const params = [emp_objid, leavetypeid, earliestYear];

      // Exclude current transaction if provided (for updates)
      if (exclude_transaction_objid) {
        query += ' AND elt.objid != ?';
        params.push(exclude_transaction_objid);
      }

      const [usageRows] = await connection.execute(query, params);
      const total_annual_used = parseFloat(usageRows[0]?.total_annual_used || 0);
      const annualentitlementValue = parseFloat(annualentitlement);
      const available_balance = annualentitlementValue - total_annual_used;

      if (requested_deductedcredit > available_balance) {
        return {
          valid: false,
          error: `Leave entitlement limit exceeded. Annual entitlement: ${annualentitlementValue} days, Already used: ${total_annual_used} days, Available: ${available_balance} days, Requested: ${requested_deductedcredit} days. Please reduce the number of days or contact HR.`,
          details: {
            annualentitlement: annualentitlementValue,
            total_annual_used,
            available_balance,
            balance: null,
            leavecharging
          }
        };
      }

      return {
        valid: true,
        error: null,
        details: {
          annualentitlement: annualentitlementValue,
          total_annual_used,
          available_balance,
          balance: null,
          leavecharging
        }
      };
    } else {
      // If annualentitlement IS NULL or 0, check employee_leave balances
      // Handle 'ND' (no deduction) - validation should pass
      if (leavecharging === 'ND') {
        return {
          valid: true,
          error: null,
          details: {
            annualentitlement: null,
            total_annual_used: 0,
            available_balance: null,
            balance: null,
            leavecharging: 'ND'
          }
        };
      }

      // Fetch employee_leave record for the employee
      const [leaveRecordRows] = await connection.execute(
        'SELECT VL, SL FROM employee_leave WHERE emp_objid = ?',
        [emp_objid]
      );

      if (leaveRecordRows.length === 0) {
        return {
          valid: false,
          error: 'Leave record not found for employee',
          details: null
        };
      }

      const leaveRecord = leaveRecordRows[0];
      const balance = leavecharging === 'VL' 
        ? parseFloat(leaveRecord.VL || 0) 
        : leavecharging === 'SL' 
          ? parseFloat(leaveRecord.SL || 0) 
          : 0;

      if (requested_deductedcredit > balance) {
        return {
          valid: false,
          error: `Insufficient leave balance. Available ${leavecharging} balance: ${balance} days, Requested: ${requested_deductedcredit} days. Please reduce the number of days or contact HR.`,
          details: {
            annualentitlement: null,
            total_annual_used: 0,
            available_balance: null,
            balance,
            leavecharging
          }
        };
      }

      return {
        valid: true,
        error: null,
        details: {
          annualentitlement: null,
          total_annual_used: 0,
          available_balance: null,
          balance,
          leavecharging
        }
      };
    }
  } catch (error) {
    console.error('Error validating leave limits:', error);
    return {
      valid: false,
      error: 'Error validating leave limits: ' + error.message,
      details: null
    };
  }
};

// Validation endpoint controller
export const validateLeaveLimitsEndpoint = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    const {
      emp_objid,
      leavetypeid,
      deductedcredit,
      selectedDates,
      exclude_transaction_objid
    } = req.body;

    // Validate required fields
    if (!emp_objid || !leavetypeid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'Missing required fields: emp_objid and leavetypeid are required',
        details: null
      });
    }

    // Call validation helper
    const validationResult = await validateLeaveLimits(
      connection,
      emp_objid,
      leavetypeid,
      deductedcredit || 0,
      selectedDates || [],
      exclude_transaction_objid || null
    );

    // Return validation result with HTTP 200 (not 400) to allow frontend to handle gracefully
    res.status(200).json({
      success: true,
      valid: validationResult.valid,
      error: validationResult.error,
      details: validationResult.details
    });
  } catch (error) {
    console.error('Error in validateLeaveLimitsEndpoint:', error);
    res.status(500).json({
      success: false,
      valid: false,
      error: 'Error validating leave limits: ' + error.message,
      details: null
    });
  } finally {
    connection.release();
  }
};

// Create new transaction
export const createLeaveTransaction = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      emp_objid,
      leavetypeid,
      deductmode,
      leavepurpose,
      selectedDates,
      deductedcredit,
      inclusivedates,
      status,
      isportal,
      questionAnswers,
      leavecharging,
      leaveremarks
    } = req.body;

    // Validate required fields
    if (!emp_objid || !leavetypeid || !selectedDates || selectedDates.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate leave limits before creating transaction
    const validationResult = await validateLeaveLimits(
      connection,
      emp_objid,
      leavetypeid,
      deductedcredit || 0,
      selectedDates,
      null // No exclude_transaction_objid for new transactions
    );

    if (!validationResult.valid) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: validationResult.error });
    }

    // Generate transaction ID and leave number
    const transactionId = uuidv4();
    const leaveno = await generateLeaveNo(connection);
    
    // Use sysusers.id from JWT
    const createdBy = req.user?.USERID || null;

    // Get leavecharging from leavetypes if not provided in request
    let actualLeaveCharging = leavecharging;
    if (!actualLeaveCharging) {
      const [leaveType] = await connection.execute(
        'SELECT leavecharging FROM leavetypes WHERE leaveid = ?',
        [leavetypeid]
      );
      if (leaveType.length > 0) {
        actualLeaveCharging = leaveType[0].leavecharging || 'VL';
      } else {
        actualLeaveCharging = 'VL'; // Default fallback
      }
    }

    // Insert main transaction record
    const insertTransactionQuery = `
      INSERT INTO employee_leave_trans (
        objid, emp_objid, leaveno, leavetypeid, deductmode, deductedcredit, 
        leavepurpose, inclusivedates, createdby, createddate, 
        leavestatus, updateddate, isportal, leavecharging, leaveremarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?, ?, ?)
    `;

    const normalizedStatus = normalizeLeaveStatus(status);
    await connection.execute(insertTransactionQuery, [
      transactionId,
      emp_objid,
      leaveno,
      leavetypeid,
      deductmode,
      deductedcredit,
      leavepurpose,
      inclusivedates,
      createdBy,
      normalizedStatus,
      isportal || 0,
      actualLeaveCharging,
      leaveremarks || null
    ]);

    // Insert transaction details
    const creditPerDay = deductedcredit / inclusivedates;
    
    for (const date of selectedDates) {
      const detailId = uuidv4();
      const insertDetailQuery = `
        INSERT INTO employee_leave_trans_details (
          objid, leave_objid, leavedate, leavecredit, created_at
        ) VALUES (?, ?, ?, ?, NOW())
      `;
      
      await connection.execute(insertDetailQuery, [
        detailId,
        transactionId,
        date,
        creditPerDay
      ]);
    }

    // Insert question answer if provided
    if (questionAnswers && questionAnswers.selectedQuestionId && questionAnswers.answer) {
      const questionAnswerId = uuidv4();
      const insertQuestionQuery = `
        INSERT INTO employee_leave_questions (objid, leave_objid, questionid, specify, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `;
      
      await connection.execute(insertQuestionQuery, [
        questionAnswerId,
        transactionId,
        questionAnswers.selectedQuestionId,
        questionAnswers.answer
      ]);
    }

    // If status is "Approved", deduct from balance
    if (normalizedStatus === 'Approved') {
      await deductFromBalance(connection, emp_objid, transactionId, deductedcredit);
      
      // Update approved by and approved date
      const updateApprovalQuery = `
        UPDATE employee_leave_trans 
        SET approvedby = ?, approveddate = NOW() 
        WHERE objid = ?
      `;
      
      await connection.execute(updateApprovalQuery, [createdBy, transactionId]);
    }

    await connection.commit();
    
    // Notify employee about new leave transaction
    changeNotificationService.notifyEmployee(
      emp_objid,
      'leave',
      'created',
      {
        transactionId,
        leaveno,
        status: normalizedStatus,
        leavetypeid
      }
    );
    
    res.json({ success: true, transactionId, leaveno });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating leave transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// Update transaction
export const updateLeaveTransaction = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();

    const { objid } = req.params;
    const {
      leavetypeid,
      deductmode,
      leavepurpose,
      selectedDates,
      deductedcredit,
      inclusivedates,
      status,
      questionAnswers,
      leavecharging,
      leaveremarks
    } = req.body;

    // Get current transaction to check status change
    const [currentTransaction] = await connection.execute(
      'SELECT * FROM employee_leave_trans WHERE objid = ?',
      [objid]
    );

    if (currentTransaction.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const currentStatus = normalizeLeaveStatus(currentTransaction[0].leavestatus);
    const newStatus = status !== undefined ? normalizeLeaveStatus(status) : currentStatus;
    const wasApproved = currentStatus === 'Approved';
    const willBeApproved = newStatus === 'Approved';

    // Validate leave limits if deductedcredit, leavetypeid, or selectedDates changed
    const emp_objid = currentTransaction[0].emp_objid;
    const currentLeavetypeid = currentTransaction[0].leavetypeid;
    const currentDeductedcredit = currentTransaction[0].deductedcredit;
    
    // Get current selectedDates from transaction details if not provided
    let actualSelectedDates = selectedDates;
    if (!actualSelectedDates || actualSelectedDates.length === 0) {
      const [detailRows] = await connection.execute(
        'SELECT leavedate FROM employee_leave_trans_details WHERE leave_objid = ? ORDER BY leavedate',
        [objid]
      );
      actualSelectedDates = detailRows.map(row => row.leavedate);
    }

    // Only validate if leavetypeid, deductedcredit, or selectedDates changed
    const leavetypeidChanged = leavetypeid && leavetypeid !== currentLeavetypeid;
    const deductedcreditChanged = deductedcredit && deductedcredit !== currentDeductedcredit;
    const selectedDatesChanged = actualSelectedDates && actualSelectedDates.length > 0;

    if (leavetypeidChanged || deductedcreditChanged || selectedDatesChanged) {
      const validationResult = await validateLeaveLimits(
        connection,
        emp_objid,
        leavetypeid || currentLeavetypeid,
        deductedcredit || currentDeductedcredit,
        actualSelectedDates,
        objid // Exclude current transaction from annual count
      );

      if (!validationResult.valid) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: validationResult.error });
      }
    }

    // Update main transaction record
    const updateTransactionQuery = `
      UPDATE employee_leave_trans 
      SET leavetypeid = ?, deductmode = ?, deductedcredit = ?, 
          leavepurpose = ?, inclusivedates = ?, leavestatus = ?, 
          leavecharging = ?, leaveremarks = ?, updateddate = NOW(),
          updatedby = ?
      WHERE objid = ?
    `;

    await connection.execute(updateTransactionQuery, [
      leavetypeid,
      deductmode,
      deductedcredit,
      leavepurpose,
      inclusivedates,
      newStatus,
      leavecharging || currentTransaction[0].leavecharging || 'VL',
      leaveremarks || null,
      (req.user?.USERID || null),
      objid
    ]);

    // Update transaction details
    // Delete existing details
    await connection.execute(
      'DELETE FROM employee_leave_trans_details WHERE leave_objid = ?',
      [objid]
    );

    // Insert new details
    if (selectedDates && selectedDates.length > 0) {
      const creditPerDay = deductedcredit / inclusivedates;
      
      for (const date of selectedDates) {
        const detailId = uuidv4();
        const insertDetailQuery = `
          INSERT INTO employee_leave_trans_details (
            objid, leave_objid, leavedate, leavecredit, created_at
          ) VALUES (?, ?, ?, ?, NOW())
        `;
        
        await connection.execute(insertDetailQuery, [
          detailId,
          objid,
          date,
          creditPerDay
        ]);
      }
    }

    // Update question answer
    // Delete existing question answers
    await connection.execute(
      'DELETE FROM employee_leave_questions WHERE leave_objid = ?',
      [objid]
    );

    // Insert new question answer if provided
    if (questionAnswers && questionAnswers.selectedQuestionId && questionAnswers.answer) {
      const questionAnswerId = uuidv4();
      const insertQuestionQuery = `
        INSERT INTO employee_leave_questions (objid, leave_objid, questionid, specify, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `;
      
      await connection.execute(insertQuestionQuery, [
        questionAnswerId,
        objid,
        questionAnswers.selectedQuestionId,
        questionAnswers.answer
      ]);
    }

    // Enforce Return only from For Approval
    if (newStatus === 'Returned' && currentStatus !== 'For Approval') {
      throw new Error('Return action is only allowed when current status is For Approval');
    }

    // If cancelling: restore credits if currently Approved
    if (newStatus === 'Cancelled') {
      if (currentStatus === 'Approved') {
        await restoreToBalance(connection, currentTransaction[0].emp_objid, objid, deductedcredit);
        // Also clear approved fields upon cancellation
        await connection.execute(
          `UPDATE employee_leave_trans SET approvedby = NULL, approveddate = NULL WHERE objid = ?`,
          [objid]
        );
      }
    }

    // Handle balance deduction/restoration for approval transitions
    // Note: Cancellation is handled separately above, so exclude it here
    if (!wasApproved && willBeApproved) {
      // Newly approved - deduct from balance
      await deductFromBalance(connection, currentTransaction[0].emp_objid, objid, deductedcredit);
      
      // Use sysusers.id from JWT
      const approvedBy = req.user?.USERID || null;
      
      // Update approved by and approved date
      const updateApprovalQuery = `
        UPDATE employee_leave_trans 
        SET approvedby = ?, approveddate = NOW() 
        WHERE objid = ?
      `;
      
      await connection.execute(updateApprovalQuery, [approvedBy, objid]);
    } else if (wasApproved && !willBeApproved && newStatus !== 'Cancelled') {
      // Was approved, now not approved (but not cancelled) - restore balance
      // Cancellation is handled separately above to avoid double restoration
      await restoreToBalance(connection, currentTransaction[0].emp_objid, objid, deductedcredit);
      
      // Clear approved by and approved date
      const clearApprovalQuery = `
        UPDATE employee_leave_trans 
        SET approvedby = NULL, approveddate = NULL 
        WHERE objid = ?
      `;
      
      await connection.execute(clearApprovalQuery, [objid]);
    }

    await connection.commit();
    
    // Notify employee about updated leave transaction
    changeNotificationService.notifyEmployee(
      emp_objid,
      'leave',
      'updated',
      {
        transactionId: objid,
        status: newStatus,
        previousStatus: currentStatus
      }
    );
    
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating leave transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// Unapprove transaction - reverse approval and restore credits
export const unapproveLeaveTransaction = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();

    const { objid } = req.params;
    const { leaveremarks } = req.body;

    // Optional remarks; if provided, we'll save into leaveremarks

    // Get current transaction to verify it's approved
    const [currentTransaction] = await connection.execute(
      'SELECT * FROM employee_leave_trans WHERE objid = ?',
      [objid]
    );

    if (currentTransaction.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = currentTransaction[0];

    const transactionStatus = normalizeLeaveStatus(transaction.leavestatus);
    
    // Verify transaction is approved
    if (transactionStatus !== 'Approved') {
      return res.status(400).json({ error: 'Only approved transactions can be unapproved' });
    }

    // Restore leave credits using restoreToBalance function
    await restoreToBalance(connection, transaction.emp_objid, objid, transaction.deductedcredit);

    // Use sysusers.id from JWT for updatedby
    const updatedBy = req.user?.USERID || null;

    // Update transaction: revert to For Approval, clear approval fields, set updated fields
    const unapproveQuery = `
      UPDATE employee_leave_trans 
      SET leavestatus = 'For Approval',
          approvedby = NULL,
          approveddate = NULL,
          updatedby = ?,
          updateddate = NOW(),
          leaveremarks = COALESCE(?, leaveremarks)
      WHERE objid = ?
    `;

    await connection.execute(unapproveQuery, [
      updatedBy,
      (leaveremarks || null),
      objid
    ]);

    await connection.commit();
    
    // Notify employee about unapproved leave transaction
    changeNotificationService.notifyEmployee(
      transaction.emp_objid,
      'leave',
      'updated',
      {
        transactionId: objid,
        status: 'For Approval',
        previousStatus: 'Approved'
      }
    );
    
    res.json({ success: true, message: 'Leave transaction unapproved successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error unapproving leave transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// Delete transaction
export const deleteLeaveTransaction = async (req, res) => {
  const connection = await getHR201Pool().getConnection();
  
  try {
    await connection.beginTransaction();

    const { objid } = req.params;

    // Get transaction details before deletion
    const [transaction] = await connection.execute(
      'SELECT * FROM employee_leave_trans WHERE objid = ?',
      [objid]
    );

    if (transaction.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const trans = transaction[0];

    // If transaction was approved, restore balance
    if (trans.leavestatus === 'Approved') {
      await restoreToBalance(connection, trans.emp_objid, objid, trans.deductedcredit);
    }

    // Delete transaction details first (foreign key constraint)
    await connection.execute(
      'DELETE FROM employee_leave_trans_details WHERE leave_objid = ?',
      [objid]
    );

    // Delete main transaction
    await connection.execute(
      'DELETE FROM employee_leave_trans WHERE objid = ?',
      [objid]
    );

    await connection.commit();
    
    // Notify employee about deleted leave transaction
    changeNotificationService.notifyEmployee(
      trans.emp_objid,
      'leave',
      'deleted',
      {
        transactionId: objid
      }
    );
    
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting leave transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

// Get all leave types
export const getLeaveTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const query = `
      SELECT leaveid, leavetypename, leavecharging
      FROM leavetypes
      ORDER BY leavetypename
    `;

    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching leave types:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to deduct from balance
// Uses leavecharging from employee_leave_trans table instead of deductfromvl/deductfromsl
const deductFromBalance = async (connection, empObjid, transactionObjid, deductedcredit) => {
  try {
    // Get leavecharging from employee_leave_trans table
    const [transaction] = await connection.execute(
      'SELECT leavecharging FROM employee_leave_trans WHERE objid = ?',
      [transactionObjid]
    );

    if (transaction.length === 0) {
      throw new Error('Transaction not found');
    }

    const leaveCharging = transaction[0].leavecharging;
    
    if (leaveCharging === 'VL') {
      // Deduct from VL balance
      await connection.execute(
        'UPDATE employee_leave SET VL = VL - ? WHERE emp_objid = ?',
        [deductedcredit, empObjid]
      );
    } else if (leaveCharging === 'SL') {
      // Deduct from SL balance
      await connection.execute(
        'UPDATE employee_leave SET SL = SL - ? WHERE emp_objid = ?',
        [deductedcredit, empObjid]
      );
    } else if (leaveCharging === 'ND') {
      // No deduction - do nothing
      console.log('No deduction for leavecharging = ND');
    } else {
      console.warn(`Unknown leavecharging value: ${leaveCharging}, no deduction performed`);
    }
  } catch (error) {
    console.error('Error deducting from balance:', error);
    throw error;
  }
};

// Helper function to restore to balance
// Uses leavecharging from employee_leave_trans table instead of deductfromvl/deductfromsl
const restoreToBalance = async (connection, empObjid, transactionObjid, deductedcredit) => {
  try {
    // Get leavecharging from employee_leave_trans table
    const [transaction] = await connection.execute(
      'SELECT leavecharging FROM employee_leave_trans WHERE objid = ?',
      [transactionObjid]
    );

    if (transaction.length === 0) {
      throw new Error('Transaction not found');
    }

    const leaveCharging = transaction[0].leavecharging;
    
    if (leaveCharging === 'VL') {
      // Restore to VL balance
      await connection.execute(
        'UPDATE employee_leave SET VL = VL + ? WHERE emp_objid = ?',
        [deductedcredit, empObjid]
      );
    } else if (leaveCharging === 'SL') {
      // Restore to SL balance
      await connection.execute(
        'UPDATE employee_leave SET SL = SL + ? WHERE emp_objid = ?',
        [deductedcredit, empObjid]
      );
    } else if (leaveCharging === 'ND') {
      // No restoration needed - was not deducted
      console.log('No restoration needed for leavecharging = ND');
    } else {
      console.warn(`Unknown leavecharging value: ${leaveCharging}, no restoration performed`);
    }
  } catch (error) {
    console.error('Error restoring to balance:', error);
    throw error;
  }
};

const normalizeLeaveStatus = (value) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.toUpperCase() === 'PENDING') {
    return 'For Approval';
  }
  return trimmed;
};
