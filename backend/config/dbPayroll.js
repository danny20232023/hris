import mysql from 'mysql2/promise';

// Create Payroll database connection
export const getPayrollConnection = async () => {
  // Check if Payroll module is enabled
  if (process.env.DB_PAYROLL_ENABLED !== 'true') {
    console.log('ℹ️ Payroll database is not enabled');
    return null;
  }

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_PAYROLL_HOST || 'localhost',
      port: parseInt(process.env.DB_PAYROLL_PORT) || 3306,
      database: process.env.DB_PAYROLL_NAME || 'payroll_db',
      user: process.env.DB_PAYROLL_USER || 'root',
      password: process.env.DB_PAYROLL_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log('✅ Connected to Payroll database');
    return connection;
  } catch (error) {
    console.error('❌ Error connecting to Payroll database:', error.message);
    throw error;
  }
};

// Create Payroll connection pool
export const createPayrollPool = () => {
  // Check if Payroll module is enabled
  if (process.env.DB_PAYROLL_ENABLED !== 'true') {
    console.log('ℹ️ Payroll database pool not created (module disabled)');
    return null;
  }

  try {
    const pool = mysql.createPool({
      host: process.env.DB_PAYROLL_HOST || 'localhost',
      port: parseInt(process.env.DB_PAYROLL_PORT) || 3306,
      database: process.env.DB_PAYROLL_NAME || 'payroll_db',
      user: process.env.DB_PAYROLL_USER || 'root',
      password: process.env.DB_PAYROLL_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    console.log('✅ Payroll database pool created');
    return pool;
  } catch (error) {
    console.error('❌ Error creating Payroll database pool:', error.message);
    return null;
  }
};

// Test Payroll database connection
export const testPayrollConnection = async (config) => {
  try {
    const connection = await mysql.createConnection({
      host: config.host,
      port: parseInt(config.port),
      database: config.database,
      user: config.username,
      password: config.password
    });

    await connection.ping();
    await connection.end();
    
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export default {
  getPayrollConnection,
  createPayrollPool,
  testPayrollConnection
};

