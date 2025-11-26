import mysql from 'mysql2/promise';

// Create 201 Files database connection
export const get201FilesConnection = async () => {
  // Check if 201 Files module is enabled
  if (process.env.DB_201FILES_ENABLED !== 'true') {
    console.log('ℹ️ 201 Files database is not enabled');
    return null;
  }

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_201FILES_HOST || 'localhost',
      port: parseInt(process.env.DB_201FILES_PORT) || 3306,
      database: process.env.DB_201FILES_NAME || 'files201_db',
      user: process.env.DB_201FILES_USER || 'root',
      password: process.env.DB_201FILES_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log('✅ Connected to 201 Files database');
    return connection;
  } catch (error) {
    console.error('❌ Error connecting to 201 Files database:', error.message);
    throw error;
  }
};

// Create 201 Files connection pool
export const create201FilesPool = () => {
  // Check if 201 Files module is enabled
  if (process.env.DB_201FILES_ENABLED !== 'true') {
    console.log('ℹ️ 201 Files database pool not created (module disabled)');
    return null;
  }

  try {
    const pool = mysql.createPool({
      host: process.env.DB_201FILES_HOST || 'localhost',
      port: parseInt(process.env.DB_201FILES_PORT) || 3306,
      database: process.env.DB_201FILES_NAME || 'files201_db',
      user: process.env.DB_201FILES_USER || 'root',
      password: process.env.DB_201FILES_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    console.log('✅ 201 Files database pool created');
    return pool;
  } catch (error) {
    console.error('❌ Error creating 201 Files database pool:', error.message);
    return null;
  }
};

// Test 201 Files database connection
export const test201FilesConnection = async (config) => {
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
  get201FilesConnection,
  create201FilesPool,
  test201FilesConnection
};

