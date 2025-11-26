import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getEnvVariables,
  updateEnvVariables,
  restartServer,
  restartAllServices,
  getDeploymentInfo,
  get201FilesDBConfig,
  test201FilesDBConnection,
  save201FilesDBConfig,
  getPayrollDBConfig,
  testPayrollDBConnection,
  savePayrollDBConfig
} from '../controllers/envController.js';

const router = express.Router();

// All routes are protected
router.get('/', protect, getEnvVariables);
router.get('/deployment-info', protect, getDeploymentInfo);
router.put('/', protect, updateEnvVariables);
router.post('/restart', protect, restartServer);
router.post('/restart-all', protect, restartAllServices);

// 201 Files Database Configuration
router.get('/db-201files', protect, get201FilesDBConfig);
router.post('/db-201files/test', protect, test201FilesDBConnection);
router.post('/db-201files/save', protect, save201FilesDBConfig);

// Payroll Database Configuration
router.get('/db-payroll', protect, getPayrollDBConfig);
router.post('/db-payroll/test', protect, testPayrollDBConnection);
router.post('/db-payroll/save', protect, savePayrollDBConfig);

export default router;