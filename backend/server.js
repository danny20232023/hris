// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import os from 'os';

// ✅ Load environment variables first
dotenv.config();

import { connectDB } from './config/db.js';
import { initHR201Database } from './config/hr201Database.js';
import { initMediaPaths } from './config/uploadsConfig.js';
import authRoutes from './routes/authRoutes.js';
import dtrRoutes from './routes/dtrRoutes.js';
import dtrPortalUsersRoutes from './routes/DTRPortalUsersRoutes.js';
import dtrPortalEmployeeUsersRoutes from './routes/DTRPortalEmployeeUsersRoutes.js';
import logsRoutes from './routes/logsRoutes.js';
import managementRoutes from './routes/managementRoutes.js';
import locatorRoutes from './routes/locatorRoutes.js'; // Add new locator routes
import departmentsRoutes from './routes/departmentsRoutes.js';
import envRoutes from './routes/envRoutes.js'; // Add env routes
import companyRoutes from './routes/companyRoutes.js';
import computeAttendanceRoutes from './routes/computeAttendanceRoutes.js'; // Add ComputeAttendance routes
import machineRoutes from './routes/machineRoutes.js'; // Add machine routes
import biometricRoutes from './routes/biometricRoutes.js'; // ADD THIS LINE
import bioEnrollRoutes from './routes/BioEnrollRoutes.js'; // Bio Enrollment Routes
import employees201Routes from './routes/201EmployeeRoutes.js'; // 201 Employee Routes - ADD THIS LINE
import pdsDtrCheckerRoutes from './routes/pdsDtrCheckerRoutes.js'; // PdsDtrChecker Routes
import leaveTypesRoutes from './routes/201employeeLeaveTypesRoutes.js'; // Leave Types Routes
import employeeLeaveRecordsRoutes from './routes/201employeeLeaveRecordsRoutes.js'; // Employee Leave Records Routes
import employeeLeaveTransactionsRoutes from './routes/201employeeLeaveTransactionsRoutes.js'; // Employee Leave Transactions Routes
import mediaStorageRoutes from './routes/mediaStorageRoutes.js'; // Media Storage Routes
import employeeDesignationRoutes from './routes/201employeeDesignationRoutes.js'; // 201 Employee Designation Routes
import employeeLocatorRoutes from './routes/201EmployeeLocatorRoutes.js'; // 201 Employee Locator Routes
import employeeTravelsRoutes from './routes/201EmployeeTravelsRoutes.js'; // 201 Employee Travels Routes
import employeesWithPDSRoutes from './routes/201EmployeesWithPDSRoutes.js'; // 201 Employees With PDS
import dtrShiftsRoutes from './routes/DTRShiftsRoutes.js'; // DTR Shifts Routes
import dtrAssignedShiftsRoutes from './routes/DTRAssignedShiftsRoutes.js'; // DTR Assigned Shifts Routes
import sysUsersRoutes from './routes/sysUsersRoutes.js'; // System Users Routes
import dtrHolidaysRoutes from './routes/DTRHolidaysRoutes.js'; // DTR Holidays Routes
import dtrEmployeeCdoRoutes from './routes/DTREmployeecdoRoutes.js';
import dtrEmployeeOTroutes from './routes/DTREmployeeOTroutes.js';
import dtrFixChecktimeRoutes from './routes/DTRFixChecktimeRoutes.js';
import changeNotificationRoutes from './routes/changeNotificationRoutes.js'; // Change Notification Routes
import adminApprovalRoutes from './routes/adminApprovalRoutes.js'; // Admin Approval Dashboard Routes
import computedDTRRoutes from './routes/computedDTRRoutes.js'; // Computed DTR Routes
import printDTRModalRoutes from './routes/printDTRModalRoutes.js'; // Print DTR Modal Routes

// Validate required environment variables
const validateEnvironment = () => {
  const requiredEnvVars = [
    'DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD',
    'HR201_DB_HOST', 'HR201_DB_NAME', 'HR201_DB_USER', 'HR201_DB_PASSWORD'
  ];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please set these variables in your .env file or docker-compose.yml');
    process.exit(1);
  }
  console.log('✅ Environment variables validated');
};

// Validate environment before proceeding
validateEnvironment();

// Graceful handling of edge-js errors (Windows-only dependency)
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && (
    reason.message.includes('edge-js') || 
    reason.message.includes('edge.js') ||
    reason.message.includes('ZKTeco Native SDK')
  )) {
    console.warn('⚠️  edge-js not available (expected on Linux/containers). Some features may be disabled.');
    return; // Don't crash on edge-js errors
  }
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: '50mb' })); // Increase from default 100kb to 50mb
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from uploads directory
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Dynamic CORS configuration from environment variable
const getCorsOrigins = () => {
  if (process.env.CORS_ORIGINS) {
    // Parse comma-separated origins
    const origins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
    // Convert string patterns to regex if needed
    return origins.map(origin => {
      // If it's a regex pattern (starts with /^), convert to regex
      if (origin.startsWith('/^') && origin.endsWith('$/')) {
        const pattern = origin.slice(1, -2);
        return new RegExp(pattern);
      }
      return origin;
    });
  }
  // Default development origins
  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    // Allow all IPs in 192.168.xx.xx subnet
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:(3000|5173)$/,
    // Allow HTTPS for domain
    /^https:\/\/.*\.dalaguete\.gov\.ph$/
  ];
};

app.use(cors({
  origin: getCorsOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dtr', dtrRoutes);
app.use('/api/employees', dtrPortalUsersRoutes);
app.use('/api/portal-employee-users', dtrPortalEmployeeUsersRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/locator', locatorRoutes); // Add new locator routes
app.use('/api/departments', departmentsRoutes);
app.use('/api/env', envRoutes); // Add env routes
app.use('/api/company', companyRoutes);
app.use('/api/compute-attendance', computeAttendanceRoutes); // Add ComputeAttendance routes
app.use('/api/machines', machineRoutes); // Add machine routes
app.use('/api/biometric', biometricRoutes); // ADD THIS LINE
app.use('/api/bio-enroll', bioEnrollRoutes); // Bio Enrollment Routes
app.use('/api/201-employees', employees201Routes); // 201 Employees Routes - ADD THIS LINE
app.use('/api/pds-dtrchecker', pdsDtrCheckerRoutes); // PdsDtrChecker Routes
app.use('/api/leave-types', leaveTypesRoutes); // Leave Types Routes
app.use('/api/employee-leave-records', employeeLeaveRecordsRoutes); // Employee Leave Records Routes
app.use('/api/employee-leave-transactions', employeeLeaveTransactionsRoutes); // Employee Leave Transactions Routes
app.use('/api/media-storage', mediaStorageRoutes); // Media Storage Routes
app.use('/api/employee-designations', employeeDesignationRoutes); // Employee Designations Routes
app.use('/api/employee-locators', employeeLocatorRoutes); // Employee Locators Routes
app.use('/api/employee-travels', employeeTravelsRoutes); // Employee Travels Routes
app.use('/api/201-employees-with-pds', employeesWithPDSRoutes); // 201 Employees With PDS
app.use('/api/dtr-shifts', dtrShiftsRoutes); // DTR Shifts
app.use('/api/dtr-assigned-shifts', dtrAssignedShiftsRoutes); // DTR Assigned Shifts
app.use('/api', sysUsersRoutes); // System Users Routes
app.use('/api/dtr-holidays', dtrHolidaysRoutes); // DTR Holidays
app.use('/api/dtr/employee-cdo', dtrEmployeeCdoRoutes);
app.use('/api/dtr/employee-ot', dtrEmployeeOTroutes);
app.use('/api/dtr-fix-checktime', dtrFixChecktimeRoutes);
app.use('/api/change-notifications', changeNotificationRoutes); // Change Notifications
app.use('/api/admin-approvals', adminApprovalRoutes); // Admin Approval Dashboard Routes
app.use('/api/computed-dtr', computedDTRRoutes); // Computed DTR Routes
app.use('/api/print-dtr-modal', printDTRModalRoutes); // Print DTR Modal Routes

// Health check endpoints (before error handlers)
app.get('/', (req, res) => {
  res.send('✅ DTR Checker Backend is running!');
});

app.get('/health', async (req, res) => {
  try {
    // Import database functions
    const { getDb } = await import('./config/db.js');
    const { getHR201Pool } = await import('./config/hr201Database.js');
    
    // Quick database connectivity checks
    const mssqlStatus = await (async () => {
      try {
        const db = getDb();
        await db.request().query('SELECT 1');
        return 'connected';
      } catch (error) {
        console.error('MSSQL health check failed:', error.message);
        return 'disconnected';
      }
    })();
    
    const mysqlStatus = await (async () => {
      try {
        const pool = getHR201Pool();
        await pool.query('SELECT 1');
        return 'connected';
      } catch (error) {
        console.error('MySQL health check failed:', error.message);
        return 'disconnected';
      }
    })();
    
    const isHealthy = mssqlStatus === 'connected' && mysqlStatus === 'connected';
    
    res.status(isHealthy ? 200 : 503).json({ 
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'HRIS Backend API',
      databases: {
        mssql: mssqlStatus,
        mysql: mysqlStatus
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'HRIS Backend API',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Initialize database connections and start server
(async () => {
  try {
    console.log('🔄 Initializing database connections...');
    
    // Connect to databases with retry logic
    // SQL Server connection (optional if DB_OPTIONAL=true)
    try {
    await connectDB();
    } catch (error) {
      if (process.env.DB_OPTIONAL === 'true') {
        console.warn('⚠️  SQL Server connection failed, but continuing (DB_OPTIONAL=true)');
      } else {
        console.error('❌ SQL Server connection is required. Set DB_OPTIONAL=true in .env to make it optional.');
        throw error;
      }
    }
    
    // MySQL HR201 database connection (required)
    await initHR201Database();
    
    // Initialize media storage paths (after database is ready)
    try {
      await initMediaPaths();
      console.log('✅ Media storage paths loaded from database');
    } catch (error) {
      console.error('❌ Error loading media storage paths:', error);
      // Don't fail startup if media paths fail to load, but warn user
      console.warn('⚠️  Server will start, but media file saving may not work until folders are configured');
    }
    
    // Start server only after successful database connections
    app.listen(PORT, '0.0.0.0', () => {
      const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${PORT}`;
      const uploadsBaseUrl = process.env.UPLOADS_BASE_URL || `http://localhost:${PORT}/uploads`;
      
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API Base URL: ${apiBaseUrl}`);
      console.log(`📁 Uploads Base URL: ${uploadsBaseUrl}`);
      
      // Log accessible URLs
      if (process.env.API_BASE_URL) {
        console.log(`🌐 Server accessible at ${apiBaseUrl}`);
      } else {
        console.log(`🌐 Server accessible at http://localhost:${PORT}`);
        // Try to detect network IP (optional, for development)
        if (process.env.NODE_ENV !== 'production') {
          try {
            const networkInterfaces = os.networkInterfaces();
            for (const interfaceName in networkInterfaces) {
              const addresses = networkInterfaces[interfaceName];
              for (const addr of addresses) {
                if (addr.family === 'IPv4' && !addr.internal) {
                  console.log(`🌐 Server accessible at http://${addr.address}:${PORT}`);
                  break;
                }
              }
            }
          } catch (error) {
            // Ignore errors in network detection
          }
        }
      }
    });
    
    // Graceful shutdown handlers
    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      process.exit(0);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
})();