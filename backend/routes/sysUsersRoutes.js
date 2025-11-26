import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import {
  // SysUsers CRUD
  getSysUsers,
  getSysUserById,
  createSysUser,
  updateSysUser,
  deleteSysUser,
  changeSysUserPassword,
  // SysComponents CRUD
  getSysComponents,
  getSysComponentById,
  createSysComponent,
  updateSysComponent,
  deleteSysComponent,
  // UserTypes CRUD
  getUserTypes,
  getUserTypeById,
  createUserType,
  updateUserType,
  deleteUserType,
  // SysUsersRoles CRUD
  getUserRolesByUserId,
  getUserRolesByUserType,
  bulkAssignUserRoles,
  createUserTypeRole,
  updateUserTypeRole,
  deleteUserRole,
  // SysComponents Controls
  getSysComponentControls,
  createSysComponentControl,
  updateSysComponentControl,
  deleteSysComponentControl
} from '../controllers/sysUsersController.js';

const router = express.Router();

// Configure multer for photo uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// ============================================
// SYSUSERS ROUTES
// ============================================
router.get('/sys-users', protect, requirePermission('sys-users', 'read'), getSysUsers);
router.get('/sys-users/:id', protect, requirePermission('sys-users', 'read'), getSysUserById);
router.post('/sys-users', protect, requirePermission('sys-users', 'create'), upload.single('photo'), createSysUser);
router.put('/sys-users/:id', protect, requirePermission('sys-users', 'update'), upload.single('photo'), updateSysUser);
router.delete('/sys-users/:id', protect, requirePermission('sys-users', 'delete'), deleteSysUser);
router.post('/sys-users/:id/change-password', protect, requirePermission('sys-users', 'update'), changeSysUserPassword);

// ============================================
// SYSCOMPONENTS ROUTES
// ============================================
router.get('/sys-components', protect, requirePermission('sys-users', 'read'), getSysComponents);
router.get('/sys-components/:id', protect, requirePermission('sys-users', 'read'), getSysComponentById);
router.get('/sys-components/:id/controls', protect, requirePermission('sys-users', 'read'), getSysComponentControls);
router.post('/sys-components', protect, requirePermission('sys-users', 'create'), createSysComponent);
router.put('/sys-components/:id', protect, requirePermission('sys-users', 'update'), updateSysComponent);
router.delete('/sys-components/:id', protect, requirePermission('sys-users', 'delete'), deleteSysComponent);

// ============================================
// SYSCOMPONENTS CONTROLS ROUTES
// ============================================
router.post('/sys-components-controls', protect, requirePermission('sys-users', 'create'), createSysComponentControl);
router.put('/sys-components-controls/:id', protect, requirePermission('sys-users', 'update'), updateSysComponentControl);
router.delete('/sys-components-controls/:id', protect, requirePermission('sys-users', 'delete'), deleteSysComponentControl);

// ============================================
// USERTYPES ROUTES
// ============================================
router.get('/user-types', protect, requirePermission('sys-users', 'read'), getUserTypes);
router.get('/user-types/:id', protect, requirePermission('sys-users', 'read'), getUserTypeById);
router.post('/user-types', protect, requirePermission('sys-users', 'create'), createUserType);
router.put('/user-types/:id', protect, requirePermission('sys-users', 'update'), updateUserType);
router.delete('/user-types/:id', protect, requirePermission('sys-users', 'delete'), deleteUserType);

// ============================================
// SYSUSERS_ROLES ROUTES
// ============================================
router.get('/sys-users-roles/user/:userId', protect, requirePermission('sys-users', 'read'), getUserRolesByUserId);
router.get('/sys-users/user-roles-by-type/:usertypeid', protect, requirePermission('sys-users', 'read'), getUserRolesByUserType);
router.post('/sys-users-roles', protect, requirePermission('sys-users', 'create'), bulkAssignUserRoles);
router.post('/sys-users-roles/user-type', protect, requirePermission('sys-users', 'create'), createUserTypeRole);
router.put('/sys-users-roles/:id', protect, requirePermission('sys-users', 'update'), updateUserTypeRole);
router.delete('/sys-users-roles', protect, requirePermission('sys-users', 'delete'), deleteUserRole);

export default router;

