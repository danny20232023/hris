import { getHR201Pool, hr201Query } from '../config/hr201Database.js';

const coerceIsDepartment = (value) => {
  if (value === null || value === undefined) {
    return 1;
  }
  return Number(value) === 1 ? 1 : 0;
};

const shapeDepartment = (row = {}) => {
  const normalized = {
    deptid: Number(row.deptid ?? row.DEPTID ?? 0),
    departmentname: row.departmentname ?? row.DEPARTMENTNAME ?? row.DEPTNAME ?? '',
    departmentshortname: row.departmentshortname ?? row.DEPARTMENTSHORTNAME ?? '',
    superdeptid: Number(row.superdeptid ?? row.SUPDEPTID ?? 0) || 0,
    parentdept: Number(row.parentdept ?? row.PARENTDEPT ?? 0) || 0,
    isdepartment: coerceIsDepartment(row.isdepartment ?? row.ISDEPARTMENT),
    emp_objid: row.emp_objid ?? row.EMP_OBJID ?? null,
    officehead: row.officehead ?? row.OFFICEHEAD ?? null,
    designationtype: row.designationtype ?? row.DESIGNATIONTYPE ?? null,
    accountcode: row.accountcode ?? row.ACCOUNTCODE ?? null
  };

  return {
    ...normalized,
    DEPTID: normalized.deptid,
    DEPARTMENTNAME: normalized.departmentname,
    DEPARTMENTSHORTNAME: normalized.departmentshortname,
    SUPDEPTID: normalized.superdeptid,
    PARENTDEPT: normalized.parentdept,
    ISDEPARTMENT: normalized.isdepartment,
    EMP_OBJID: normalized.emp_objid,
    OFFICEHEAD: normalized.officehead,
    DESIGNATIONTYPE: normalized.designationtype,
    ACCOUNTCODE: normalized.accountcode
  };
};

const respondWithDepartments = (res, rows = []) => {
  const data = rows.map(shapeDepartment);
  res.json({
    success: true,
    data,
    totalRecords: data.length
  });
};

export const getDepartments = async (req, res) => {
  try {
    const rows = await hr201Query(
      `SELECT 
         d.deptid,
         d.departmentname,
         d.departmentshortname,
         COALESCE(d.superdeptid, 0) AS superdeptid,
         COALESCE(d.parentdept, 0) AS parentdept,
         COALESCE(d.isdepartment, 1) AS isdepartment,
         d.emp_objid,
         d.officehead,
         d.designationtype,
         d.accountcode
       FROM department d
       ORDER BY d.departmentname`
    );

    respondWithDepartments(res, rows);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: error.message
    });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await hr201Query(
      `SELECT 
         d.deptid,
         d.departmentname,
         d.departmentshortname,
         COALESCE(d.superdeptid, 0) AS superdeptid,
         COALESCE(d.parentdept, 0) AS parentdept,
         COALESCE(d.isdepartment, 1) AS isdepartment,
         d.emp_objid,
         d.officehead,
         d.designationtype,
         d.accountcode
       FROM department d
       WHERE d.deptid = ?`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.json({
      success: true,
      data: shapeDepartment(rows[0])
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department',
      error: error.message
    });
  }
};

export const createDepartment = async (req, res) => {
  try {
    const {
      departmentname,
      departmentshortname = null,
      superdeptid = 0,
      parentdept = 0,
      isdepartment = 1,
      emp_objid = null,
      officehead = null,
      designationtype = null,
      accountcode = null
    } = req.body;

    if (!departmentname || !departmentname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }

    const pool = getHR201Pool();

    // Validate emp_objid if provided
    if (emp_objid) {
      const [employeeCheck] = await pool.execute(
        'SELECT objid FROM employees WHERE objid = ?',
        [emp_objid]
      );
      if (employeeCheck.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid employee ID provided'
        });
      }
    }

    const payload = [
      departmentname.trim(),
      departmentshortname ? departmentshortname.trim() : null,
      null,
      Number(parentdept) || 0,
      Number(isdepartment) === 1 ? 1 : 0,
      emp_objid || null,
      officehead ? officehead.trim() : null,
      designationtype ? designationtype.trim() : null,
      accountcode ? accountcode.trim() : null
    ];

    const [result] = await pool.execute(
      `INSERT INTO department (
        departmentname,
        departmentshortname,
        superdeptid,
        parentdept,
        isdepartment,
        emp_objid,
        officehead,
        designationtype,
        accountcode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload
    );

    const newRows = await hr201Query(
      `SELECT 
         d.deptid,
         d.departmentname,
         d.departmentshortname,
         COALESCE(d.superdeptid, 0) AS superdeptid,
         COALESCE(d.parentdept, 0) AS parentdept,
         COALESCE(d.isdepartment, 1) AS isdepartment,
         d.emp_objid,
         d.officehead,
         d.designationtype,
         d.accountcode
       FROM department d
       WHERE d.deptid = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: shapeDepartment(newRows[0] || { deptid: result.insertId, departmentname })
    });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create department',
      error: error.message
    });
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      departmentname,
      departmentshortname = null,
      superdeptid = 0,
      parentdept = 0,
      isdepartment = 1,
      emp_objid = null,
      officehead = null,
      designationtype = null,
      accountcode = null
    } = req.body;

    if (!departmentname || !departmentname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }

    const pool = getHR201Pool();

    const [exists] = await pool.execute(
      'SELECT deptid FROM department WHERE deptid = ?',
      [Number(id)]
    );

    if (exists.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    if (Number(parentdept) === Number(id)) {
      return res.status(400).json({
        success: false,
        message: 'Department cannot be its own parent'
      });
    }

    // Validate emp_objid if provided
    if (emp_objid) {
      const [employeeCheck] = await pool.execute(
        'SELECT objid FROM employees WHERE objid = ?',
        [emp_objid]
      );
      if (employeeCheck.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid employee ID provided'
        });
      }
    }

    const updatePayload = [
      departmentname.trim(),
      departmentshortname ? departmentshortname.trim() : null,
      null,
      Number(parentdept) || 0,
      Number(isdepartment) === 1 ? 1 : 0,
      emp_objid || null,
      officehead ? officehead.trim() : null,
      designationtype ? designationtype.trim() : null,
      accountcode ? accountcode.trim() : null,
      Number(id)
    ];

    const [result] = await pool.execute(
      `UPDATE department
       SET
         departmentname = ?,
         departmentshortname = ?,
         superdeptid = ?,
         parentdept = ?,
         isdepartment = ?,
         emp_objid = ?,
         officehead = ?,
         designationtype = ?,
         accountcode = ?
       WHERE deptid = ?`,
      updatePayload
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'No changes were applied'
      });
    }

    const updatedRows = await hr201Query(
      `SELECT 
         d.deptid,
         d.departmentname,
         d.departmentshortname,
         COALESCE(d.superdeptid, 0) AS superdeptid,
         COALESCE(d.parentdept, 0) AS parentdept,
         COALESCE(d.isdepartment, 0) AS isdepartment,
         d.emp_objid,
         d.officehead,
         d.accountcode
       FROM department d
       WHERE d.deptid = ?`,
      [Number(id)]
    );

    res.json({
      success: true,
      message: 'Department updated successfully',
      data: shapeDepartment(updatedRows[0])
    });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department',
      error: error.message
    });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getHR201Pool();

    const deptId = Number(id);

    const [existingRows] = await pool.execute(
      'SELECT deptid FROM department WHERE deptid = ?',
      [deptId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const [childRows] = await pool.execute(
      'SELECT deptid FROM department WHERE superdeptid = ?',
      [deptId]
    );

    if (childRows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department with child departments. Please reassign or delete child departments first.'
      });
    }

    const [result] = await pool.execute(
      'DELETE FROM department WHERE deptid = ?',
      [deptId]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete department'
      });
    }

    res.json({
      success: true,
      message: 'Department deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete department',
      error: error.message
    });
  }
};

export const getDepartmentHierarchy = async (req, res) => {
  try {
    const rows = await hr201Query(
      `WITH RECURSIVE dept_hierarchy AS (
         SELECT
           deptid,
           departmentname,
           departmentshortname,
           COALESCE(superdeptid, 0) AS superdeptid,
           COALESCE(parentdept, 0) AS parentdept,
         COALESCE(isdepartment, 1) AS isdepartment,
           0 AS level,
           CAST(departmentname AS CHAR(500)) AS hierarchy_path
         FROM department
         WHERE COALESCE(superdeptid, 0) = 0
         
         UNION ALL
         
         SELECT
           d.deptid,
           d.departmentname,
           d.departmentshortname,
           COALESCE(d.superdeptid, 0) AS superdeptid,
          COALESCE(d.parentdept, 0) AS parentdept,
          COALESCE(d.isdepartment, 0) AS isdepartment,
           dh.level + 1 AS level,
           CONCAT(dh.hierarchy_path, ' > ', d.departmentname) AS hierarchy_path
         FROM department d
         INNER JOIN dept_hierarchy dh ON d.superdeptid = dh.deptid
       )
       SELECT *
       FROM dept_hierarchy
       ORDER BY hierarchy_path`
    );

    const data = rows.map((row) => ({
      ...shapeDepartment(row),
      level: Number(row.level || 0),
      LEVEL: Number(row.level || 0),
      hierarchyPath: row.hierarchy_path,
      HIERARCHY_PATH: row.hierarchy_path
    }));

    res.json({
      success: true,
      data,
      totalRecords: data.length
    });
  } catch (error) {
    console.error('Error fetching department hierarchy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department hierarchy',
      error: error.message
    });
  }
};

export const getDepartmentsWithEmployeeCount = async (req, res) => {
  try {
    const rows = await hr201Query(
      `SELECT 
         deptid,
         departmentname,
         departmentshortname,
         COALESCE(superdeptid, 0) AS superdeptid,
         COALESCE(parentdept, 0) AS parentdept,
         COALESCE(isdepartment, 1) AS isdepartment,
         COALESCE(isdepartment, 1) AS isdepartment,
         0 AS employeeCount
       FROM department
       ORDER BY departmentname`
    );

    const data = rows.map((row) => ({
      ...shapeDepartment(row),
      employeeCount: Number(row.employeeCount || 0),
      EMPLOYEE_COUNT: Number(row.employeeCount || 0)
    }));

    res.json({
      success: true,
      data,
      totalRecords: data.length
    });
  } catch (error) {
    console.error('Error fetching departments with employee count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments with employee count',
      error: error.message
    });
  }
};
