// config/db.js
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

// Parse port safely
const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433;

// Validate required env variables (optional, but helpful)
if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  throw new Error('❌ Missing required database environment variables');
}

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: dbPort,
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000, // 30 seconds default
  requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT) || 30000, // 30 seconds default
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true
  }
};

let pool = null;

// ✅ Function to connect once and reuse the connection with retry logic
export const connectDB = async (maxRetries = 3, retryDelay = 5000) => {
  if (pool) return pool;
  
  // Check if SQL Server connection is optional (for development/testing)
  const isOptional = process.env.DB_OPTIONAL === 'true';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempting to connect to MSSQL database (${process.env.DB_SERVER}:${dbPort})... (attempt ${attempt}/${maxRetries})`);
      pool = await sql.connect(dbConfig);
      console.log('✅ MSSQL Database connected successfully!');
      return pool;
    } catch (error) {
      const errorMsg = error.message || error.toString();
      console.error(`🔴 Database connection failed (attempt ${attempt}/${maxRetries}):`, errorMsg);
      
      // If connection is optional, log warning but don't throw
      if (isOptional && attempt === maxRetries) {
        console.warn('⚠️  MSSQL database connection failed, but continuing (DB_OPTIONAL=true)');
        console.warn('⚠️  Features requiring SQL Server will not be available');
        return null;
      }
      
      if (attempt === maxRetries) {
        if (isOptional) {
          console.warn('⚠️  Failed to connect to MSSQL database after all retry attempts, but continuing (DB_OPTIONAL=true)');
          return null;
        }
        console.error('❌ Failed to connect to MSSQL database after all retry attempts');
        throw error;
      }
      
      console.log(`⏳ Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      // Exponential backoff
      retryDelay = Math.min(retryDelay * 1.5, 30000);
    }
  }
};

// ✅ Function to get the connection elsewhere
export const getDb = () => {
  if (!pool) {
    // Check if SQL Server connection is optional
    if (process.env.DB_OPTIONAL === 'true') {
      throw new Error('❌ MSSQL database not connected. SQL Server connection is optional but not available.');
    }
    throw new Error('❌ Database not connected yet. Call connectDB() first.');
  }
  return pool;
};
