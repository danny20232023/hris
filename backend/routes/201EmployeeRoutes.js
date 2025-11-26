import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission, requirePermissionOr } from '../middleware/rbacMiddleware.js';
import {
  get201Employees,
  get201EmployeeById,
  search201Employees,
  get201EmployeeStats,
  savePDS,
  getPDS,
  getBloodTypes,
  getCivilStatuses,
  getAppointmentTypes,
  getEmployeeStatusTypes,
  getDTREmployeesWithPDS,
  getEligibilityTypes,
  recalculatePDSProgress,
  getMissingFields
} from '../controllers/201EmployeeController.js';

const router = express.Router();

// All routes are protected - require authentication
router.get('/', protect, get201Employees);
router.get('/dtr-employees', protect, getDTREmployeesWithPDS);
router.get('/stats', protect, get201EmployeeStats);
router.get('/search/:term', protect, search201Employees);

// Lookup data for PDS forms (MUST be before /:id route)
router.get('/lookup/blood-types', protect, getBloodTypes);
router.get('/lookup/civil-statuses', protect, getCivilStatuses);
router.get('/lookup/appointmenttypes', protect, getAppointmentTypes);
router.get('/lookup/employeestatustypes', protect, getEmployeeStatusTypes);
router.get('/eligibility-types', protect, getEligibilityTypes);

// PDS (Personal Data Sheet) routes - RBAC protected
// POST /pds can be either create or update, so check for either permission
router.post('/pds', protect, requirePermissionOr('201-pds', 'create', 'update'), savePDS);
// GET /pds/:employeeId - supports both objid and dtruserid
// Allow portal users to access their own PDS by dtruserid without RBAC
router.get('/pds/:employeeId', protect, async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const userId = req.user?.USERID || req.user?.id;
    const authMethod = req.authMethod || (req.user?.isPortal ? 'portal' : 'admin');
    
    console.log(`🔍 [PDS Route] Checking access - employeeId: ${employeeId}, userId: ${userId}, authMethod: ${authMethod}`);
    
    // If portal user accessing by dtruserid, allow if it matches their own USERID
    if (authMethod === 'portal' && String(employeeId) === String(userId)) {
      console.log(`✅ [PDS Route] Portal user accessing own PDS - skipping RBAC`);
      // Portal user accessing their own PDS - skip RBAC check and call getPDS directly
      return getPDS(req, res);
    }
    
    // Admin users or portal users accessing other records need RBAC
    console.log(`🔒 [PDS Route] Requiring RBAC permission`);
    // Call the RBAC middleware
    const rbacMiddleware = requirePermission('201-pds', 'read');
    return rbacMiddleware(req, res, next);
  } catch (error) {
    console.error('❌ [PDS Route] Error in middleware:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking PDS access',
      error: error.message 
    });
  }
}, getPDS);
router.post('/pds/:id/recalculate-progress', protect, requirePermission('201-pds', 'read'), recalculatePDSProgress);
router.get('/missing-fields/:employeeId', protect, requirePermission('201-pds', 'read'), getMissingFields);

// Employee by ID route (MUST be last to avoid conflicts)
router.get('/:id', protect, get201EmployeeById);

export default router;