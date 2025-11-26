import express from 'express';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentHierarchy,
  getDepartmentsWithEmployeeCount
} from '../controllers/departmentsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected (require authentication)
router.use(protect);

// GET /api/departments - Get all departments
router.get('/', getDepartments);

// GET /api/departments/hierarchy - Get department hierarchy
router.get('/hierarchy', getDepartmentHierarchy);

// GET /api/departments/with-employees - Get departments with employee count
router.get('/with-employees', getDepartmentsWithEmployeeCount);

// GET /api/departments/:id - Get department by ID
router.get('/:id', getDepartmentById);

// POST /api/departments - Create new department
router.post('/', createDepartment);

// PUT /api/departments/:id - Update department
router.put('/:id', updateDepartment);

// DELETE /api/departments/:id - Delete department
router.delete('/:id', deleteDepartment);

export default router;