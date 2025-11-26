import express from 'express';
import {
  getEmployees,
  getEmployeePaginateInEmployeeManagement,
  getPortalEmployeeWithSysuserPortal,
  getDepartments,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeeWithShiftSchedule,
  getEmployeeByIdWithPassword,
  validateUniqueFields,
  resetEmployeePin,
  upload,
  registerPortalUser,
  updatePortalUser,
  deletePortalUser,
  getPortalEmployeeProfile
} from '../controllers/DTRPortalUsersController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// GET /api/employees (original - no pagination, for search components)
router.get('/', getEmployees);

// GET /api/employees/paginated (with pagination, for DTRPortalUsers only)
router.get('/paginated', getEmployeePaginateInEmployeeManagement);

// GET /api/employees/paginated-with-shifts (portal-focused, joins sysusers_portal)
router.get('/paginated-with-shifts', getPortalEmployeeWithSysuserPortal);

// GET /api/employees/validate-unique (validate USERID and BADGENUMBER uniqueness)
router.get('/validate-unique', validateUniqueFields);

// GET /api/employees/departments
router.get('/departments', getDepartments);

// GET /api/employees/:id/portal-profile
router.get('/:id/portal-profile', getPortalEmployeeProfile);

// POST /api/employees (with file upload)
router.post('/', upload.single('photo'), addEmployee);

// GET /api/employees/:id
router.get('/:id', getEmployeeById);

// GET /api/employees/:id/with-password (with decrypted password for super admin)
router.get('/:id/with-password', getEmployeeByIdWithPassword);

// GET /api/employees/:id/shift-schedule
router.get('/:id/shift-schedule', getEmployeeWithShiftSchedule);

// PUT /api/employees/:id (with file upload)
router.put('/:id', upload.single('photo'), updateEmployee);

// PUT /api/employees/:id/reset-pin (reset PIN/SSN)
router.put('/:id/reset-pin', resetEmployeePin);

// Portal user management
router.post('/:id/portal-register', registerPortalUser);
router.put('/:id/portal', updatePortalUser);
router.delete('/:id/portal', deletePortalUser);

// DELETE /api/employees/:id
router.delete('/:id', deleteEmployee);

export default router;

