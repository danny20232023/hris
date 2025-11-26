import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { list, getById, create, update, remove, toggleLockPDS } from '../controllers/201EmployeesWithPDSController.js';

const router = express.Router();
router.use(protect);

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
router.put('/:id/toggle-lock-pds', requirePermission('201-employees-with-pds', 'update'), toggleLockPDS);

export default router;


