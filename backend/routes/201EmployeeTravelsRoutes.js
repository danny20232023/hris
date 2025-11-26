import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { getHR201Pool } from '../config/hr201Database.js';
import { listEmployeesWithTravel, createTravel, addTravelDates, listTransactions, updateTravel, deleteTravel, listMyTravels, listTravelLiaisons, updateTravelLiaisons } from '../controllers/201EmployeeTravelsController.js';

const router = express.Router();
router.use(protect);

const ensureReadAccess = (req, res, next) => {
  if (req.authMethod === 'portal' || req.isPortal) return next();
  return requirePermission('201-travel', 'read')(req, res, next);
};

const ensureCreateAccess = async (req, res, next) => {
  if (req.authMethod === 'portal' || req.isPortal) {
    const userId = req.user?.USERID;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    try {
      const pool = getHR201Pool();
      const [rows] = await pool.execute('SELECT cancreatetravel FROM employees WHERE dtruserid = ? LIMIT 1', [userId]);
      if (rows.length && Number(rows[0].cancreatetravel) === 1) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Travel creation not allowed for this user' });
    } catch (error) {
      console.error('Failed to verify portal travel creation permission:', error);
      return res.status(500).json({ success: false, message: 'Unable to verify travel permissions' });
    }
  }
  return requirePermission('201-travel', 'create')(req, res, next);
};

const ensureUpdateAccess = async (req, res, next) => {
  if (req.authMethod === 'portal' || req.isPortal) {
    const userId = req.user?.USERID;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    try {
      const pool = getHR201Pool();
      const [rows] = await pool.execute('SELECT cancreatetravel FROM employees WHERE dtruserid = ? LIMIT 1', [userId]);
      if (rows.length && Number(rows[0].cancreatetravel) === 1) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Travel update not allowed for this user' });
    } catch (error) {
      console.error('Failed to verify portal travel update permission:', error);
      return res.status(500).json({ success: false, message: 'Unable to verify travel permissions' });
    }
  }
  return requirePermission('201-travel', 'update')(req, res, next);
};

router.get('/info', ensureReadAccess, listEmployeesWithTravel);
router.get('/transactions', ensureReadAccess, listTransactions);
router.get('/my', ensureReadAccess, listMyTravels);
router.get('/liaisons', (req, res, next) => {
  if (req.authMethod === 'portal' || req.isPortal) return next();
  return requirePermission('201-travel', 'update')(req, res, next);
}, listTravelLiaisons);
router.post('/', ensureCreateAccess, createTravel);
router.post('/:travel_objid/dates', requirePermission('201-travel', 'create'), addTravelDates);
router.put('/liaisons', (req, res, next) => {
  if (req.authMethod === 'portal' || req.isPortal) return next();
  return requirePermission('201-travel', 'update')(req, res, next);
}, updateTravelLiaisons);
router.put('/:id', ensureUpdateAccess, updateTravel);
router.delete('/:id', requirePermission('201-travel', 'delete'), deleteTravel);

export default router;


