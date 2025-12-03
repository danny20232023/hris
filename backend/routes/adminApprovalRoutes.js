import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { checkPermission, canAccessPage } from '../middleware/rbacMiddleware.js';
import {
  getAllPendingApprovals,
  approveTransaction,
  returnTransaction,
  cancelTransaction
} from '../controllers/adminApprovalController.js';

const router = express.Router();

// Middleware to check if user has access to admin approval dashboard
const hasAdminApprovalDashboardAccess = async (req, res, next) => {
  try {
    const userId = req.user?.USERID || req.user?.id;
    const usertype = req.user?.usertype || req.user?.usertype_id;
    
    // Root Admin bypass - sysusers.id = 1
    const isRootAdmin = Number(userId) === 1 || userId === '1';
    
    if (isRootAdmin) {
      return next(); // Root admin bypasses all checks
    }
    
    // First, check if user has canaccesspage for the admin approval dashboard component
    const ADMIN_DASHBOARD_COMPONENT = 'admin-approval-dashboard';
    
    // Check if the component exists in syscomponents
    const { getHR201Pool } = await import('../config/hr201Database.js');
    const pool = getHR201Pool();
    const [componentRows] = await pool.execute(
      `SELECT id FROM syscomponents WHERE componentname = ? LIMIT 1`,
      [ADMIN_DASHBOARD_COMPONENT]
    );
    
    let hasDashboardAccess = false;
    
    if (componentRows.length > 0) {
      // Component exists, check canaccesspage for it
      hasDashboardAccess = await canAccessPage(userId, ADMIN_DASHBOARD_COMPONENT, usertype);
      
      if (!hasDashboardAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access the approval dashboard (canaccesspage=0)'
        });
      }
    } else {
      // Component doesn't exist - fall back to checking individual component canaccesspage
      // This provides backward compatibility if the component hasn't been created yet
      console.warn(`[AdminApproval] Component '${ADMIN_DASHBOARD_COMPONENT}' not found in syscomponents, falling back to individual component checks`);
      
      const components = ['201-travel', 'dtr-cdo', '201-locator', '201-leave', 'dtr-fix-checktimes', 'dtr-ot-transactions'];
      let hasAnyAccessPage = false;
      
      for (const component of components) {
        const hasAccess = await canAccessPage(userId, component, usertype);
        if (hasAccess) {
          hasAnyAccessPage = true;
          break;
        }
      }
      
      if (!hasAnyAccessPage) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access the approval dashboard (canaccesspage=0 for all approval components)'
        });
      }
    }
    
    // Then, check if user has any approval permission for any transaction type
    const components = ['201-travel', 'dtr-cdo', '201-locator', '201-leave', 'dtr-fix-checktimes', 'dtr-ot-transactions'];
    
    let hasAnyApprovalPermission = false;
    const permissionDetails = [];
    
    for (const component of components) {
      const canApprove = await checkPermission(req, component, 'approve');
      const canReturn = await checkPermission(req, component, 'return');
      const canCancel = await checkPermission(req, component, 'cancel');
      
      permissionDetails.push({
        component,
        canApprove,
        canReturn,
        canCancel
      });
      
      if (canApprove || canReturn || canCancel) {
        hasAnyApprovalPermission = true;
        console.log(`[AdminApproval] User ${userId} has approval permission for ${component}`);
        break;
      }
    }
    
    if (!hasAnyApprovalPermission) {
      console.log(`[AdminApproval] User ${userId} (usertype=${usertype}) denied access - no approval permissions:`, permissionDetails);
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access approval dashboard (no approve/return/cancel permissions)'
      });
    }
    
    return next();
  } catch (error) {
    console.error('Error checking approval permissions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking permissions'
    });
  }
};

// Get all pending approvals
router.get('/', protect, hasAdminApprovalDashboardAccess, getAllPendingApprovals);

// Approve transaction
router.post('/:type/:id/approve', protect, approveTransaction);

// Return transaction
router.post('/:type/:id/return', protect, returnTransaction);

// Cancel transaction
router.post('/:type/:id/cancel', protect, cancelTransaction);

export default router;

