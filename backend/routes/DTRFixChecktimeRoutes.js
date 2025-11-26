import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { getHR201Pool } from '../config/hr201Database.js';
import {
  listFixChecktimes,
  getFixChecktime,
  createFixChecktime,
  updateFixChecktime,
  deleteFixChecktime,
  approveFixChecktime,
  cancelFixChecktime
} from '../controllers/DTRFixChecktimeController.js';

const router = express.Router();

router.use(protect);

// Middleware to allow users to read their own fix log data
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
          console.log('✅ [FixLogs] Allowing portal user to read own fix logs:', { USERID: req.user.USERID, emp_objid });
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
    const permissionMiddleware = requirePermission('dtr-fix-checktimes', 'read');
    return permissionMiddleware(req, res, next);
  } catch (error) {
    console.error('[allowOwnDataOrRequirePermission] Unexpected error:', error);
    // On any error, require permission
    const permissionMiddleware = requirePermission('dtr-fix-checktimes', 'read');
    return permissionMiddleware(req, res, next);
  }
};

router.get('/', allowOwnDataOrRequirePermission, listFixChecktimes);
router.get('/:id', requirePermission('dtr-fix-checktimes', 'read'), getFixChecktime);
router.post('/', requirePermission('dtr-fix-checktimes', 'create'), createFixChecktime);
router.put('/:id', requirePermission('dtr-fix-checktimes', 'update'), updateFixChecktime);
router.delete('/:id', requirePermission('dtr-fix-checktimes', 'delete'), deleteFixChecktime);
router.put('/:id/approve', requirePermission('dtr-fix-checktimes', 'update'), approveFixChecktime);
router.put('/:id/cancel', requirePermission('dtr-fix-checktimes', 'update'), cancelFixChecktime);

export default router;

