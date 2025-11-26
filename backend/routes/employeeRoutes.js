import express from 'express';
import {
  getEmployees,
  getEmployeePaginateInEmployeeManagement,
  getEmployeeWithShiftSchedulePaginate,
  getDepartments,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeeWithShiftSchedule,
  getEmployeeByIdWithPassword,
  validateUniqueFields,
  resetEmployeePin,
  upload
} from '../controllers/DTRPortalUsersController.js';

const router = express.Router();

// GET /api/employees (original - no pagination, for search components)
router.get('/', getEmployees);

// GET /api/employees/paginated (with pagination, for EmployeeManagement only)
router.get('/paginated', getEmployeePaginateInEmployeeManagement);

// GET /api/employees/paginated-with-shifts (with pagination and shift schedules, for EmployeeManagement only)
router.get('/paginated-with-shifts', getEmployeeWithShiftSchedulePaginate);

// GET /api/employees/validate-unique (validate USERID and BADGENUMBER uniqueness)
router.get('/validate-unique', validateUniqueFields);

// GET /api/employees/departments
router.get('/departments', getDepartments);

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

// DELETE /api/employees/:id
router.delete('/:id', deleteEmployee);

export default router;