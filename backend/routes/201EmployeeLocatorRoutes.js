import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { getHR201Pool } from '../config/hr201Database.js';
import { listLocators, getLocatorById, getLocatorByIdForPrint, createLocator, updateLocator, deleteLocator, listEmployeesForLocator } from '../controllers/201EmployeeLocatorController.js';

const router = express.Router();

router.use(protect);

// Middleware to allow users to read their own locator data
const allowOwnDataOrRequirePermission = async (req, res, next) => {
  try {
    // If emp_objid query parameter is provided, check if it belongs to the current user
    const { emp_objid } = req.query;
    if (emp_objid && req.user?.USERID) {
      const pool = getHR201Pool();
      let connection = null;
      try {
        connection = await pool.getConnection();
        // Map USERID (from MSSQL userinfo) to emp_objid (from MySQL employees) via dtruserid
        const [employees] = await connection.execute(
          'SELECT objid FROM employees WHERE dtruserid = ? AND objid = ? LIMIT 1',
          [String(req.user.USERID), emp_objid]
        );
        
        // If emp_objid matches the current user's employee record, allow without permission check
        if (employees.length > 0) {
          if (connection) connection.release();
          return next();
        }
      } catch (error) {
        console.error('[allowOwnDataOrRequirePermission] Error checking employee match:', error);
        // If there's an error checking, fall through to require permission
      } finally {
        if (connection) connection.release();
      }
    }
    
    // If no emp_objid or it doesn't match, require permission
    const permissionMiddleware = requirePermission('201-locator', 'read');
    return permissionMiddleware(req, res, next);
  } catch (error) {
    console.error('[allowOwnDataOrRequirePermission] Unexpected error:', error);
    // On any error, require permission
    const permissionMiddleware = requirePermission('201-locator', 'read');
    return permissionMiddleware(req, res, next);
  }
};

router.get('/', allowOwnDataOrRequirePermission, listLocators);
router.get('/employees/list', requirePermission('201-locator', 'read'), listEmployeesForLocator);
router.get('/:id/print', getLocatorByIdForPrint); // Print endpoint - bypasses RBAC for own records
router.get('/:id', requirePermission('201-locator', 'read'), getLocatorById);
// POST route - allow all authenticated users (for DtrChecker portal entries)
router.post('/', createLocator);
router.put('/:id', requirePermission('201-locator', 'update'), updateLocator);
router.delete('/:id', requirePermission('201-locator', 'delete'), deleteLocator);

export default router;


