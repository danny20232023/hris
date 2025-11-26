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
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  }
};

let pool = null;

// ✅ Function to connect once and reuse the connection with retry logic
export const connectDB = async (maxRetries = 5, retryDelay = 3000) => {
  if (pool) return pool;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      pool = await sql.connect(dbConfig);
      console.log('✅ MSSQL Database connected successfully!');
      return pool;
    } catch (error) {
      console.error(`🔴 Database connection failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt === maxRetries) {
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
    throw new Error('❌ Database not connected yet. Call connectDB() first.');
  }
  return pool;
};
