// backend/config/hr201Database.js
// MySQL Connection for HR201 Database
// Separate from ZKBio5 SQL Server Database

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// =============================================
// HR201 MySQL Database Configuration
// =============================================

const hr201Config = {
  host: process.env.HR201_DB_HOST || 'localhost',
  port: parseInt(process.env.HR201_DB_PORT) || 3306,
  user: process.env.HR201_DB_USER || 'root',
  password: process.env.HR201_DB_PASSWORD || '',
  database: process.env.HR201_DB_NAME || 'HR201',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Character set for Filipino/International names
  charset: 'utf8mb4',
  // Timezone
  timezone: '+08:00' // Philippine Time
};

// Create connection pool
let hr201Pool;

/**
 * Initialize HR201 MySQL connection pool with retry logic
 */
export const initHR201Database = async (maxRetries = 5, retryDelay = 3000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Connecting to HR201 MySQL database... (attempt ${attempt}/${maxRetries})`);
      console.log(`   Host: ${hr201Config.host}:${hr201Config.port}`);
      console.log(`   Database: ${hr201Config.database}`);
      console.log(`   User: ${hr201Config.user}`);
      
      hr201Pool = mysql.createPool(hr201Config);
      
      // Test connection
      const connection = await hr201Pool.getConnection();
      console.log('✅ HR201 MySQL database connected successfully');
      console.log(`   Connection ID: ${connection.threadId}`);
      connection.release();
      
      return hr201Pool;
    } catch (error) {
      console.error(`❌ Error connecting to HR201 MySQL database (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt === maxRetries) {
        console.error('❌ Failed to connect to HR201 MySQL database after all retry attempts');
        throw error;
      }
      
      console.log(`⏳ Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      // Exponential backoff
      retryDelay = Math.min(retryDelay * 1.5, 30000);
    }
  }
};

/**
 * Get HR201 database connection pool
 */
export const getHR201Pool = () => {
  if (!hr201Pool) {
    throw new Error('HR201 database not initialized. Call initHR201Database() first.');
  }
  return hr201Pool;
};

/**
 * Execute query on HR201 database
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
export const hr201Query = async (query, params = []) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('HR201 Query Error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
};

/**
 * Execute stored procedure on HR201 database
 * @param {string} procedureName - Stored procedure name
 * @param {Array} params - Procedure parameters
 * @returns {Promise<Array>} Procedure results
 */
export const hr201CallProcedure = async (procedureName, params = []) => {
  try {
    const pool = getHR201Pool();
    const placeholders = params.map(() => '?').join(', ');
    const query = `CALL ${procedureName}(${placeholders})`;
    const [results] = await pool.execute(query, params);
    return results;
  } catch (error) {
    console.error('HR201 Procedure Error:', error);
    console.error('Procedure:', procedureName);
    console.error('Params:', params);
    throw error;
  }
};

/**
 * Begin transaction on HR201 database
 */
export const hr201BeginTransaction = async () => {
  const connection = await getHR201Pool().getConnection();
  await connection.beginTransaction();
  return connection;
};

/**
 * Close HR201 database connection
 */
export const closeHR201Database = async () => {
  if (hr201Pool) {
    try {
      await hr201Pool.end();
      console.log('✅ HR201 database connection closed');
    } catch (error) {
      console.error('❌ Error closing HR201 database:', error);
    }
  }
};

// =============================================
// HELPER FUNCTIONS FOR COMMON OPERATIONS
// =============================================

/**
 * Sync employee from ZKBio5 to HR201
 * @param {number} userid - Employee USERID
 * @param {string} badgenumber - Badge number
 * @param {string} name - Employee name
 */
export const syncEmployeeToHR201 = async (userid, badgenumber, name) => {
  try {
    const result = await hr201CallProcedure('SP_SyncEmployeeFromZKBio5', [
      userid,
      badgenumber,
      name
    ]);
    return result;
  } catch (error) {
    console.error('Error syncing employee to HR201:', error);
    throw error;
  }
};

/**
 * Get complete employee profile from HR201
 * @param {number} userid - Employee USERID
 */
export const getEmployeeCompleteProfile = async (userid) => {
  try {
    const results = await hr201CallProcedure('SP_GetEmployeeCompleteProfile', [userid]);
    
    // MySQL stored procedure returns multiple result sets
    return {
      personalInfo: results[0] ? results[0][0] : null,
      family: results[1] || [],
      education: results[2] || [],
      eligibility: results[3] || [],
      workExperience: results[4] || [],
      training: results[5] || [],
      leaveCredits: results[6] || [],
      performance: results[7] || []
    };
  } catch (error) {
    console.error('Error getting employee complete profile:', error);
    throw error;
  }
};

/**
 * Initialize leave credits for employee
 * @param {number} userid - Employee USERID
 * @param {number} year - Year
 */
export const initializeLeaveCredits = async (userid, year) => {
  try {
    const result = await hr201CallProcedure('SP_InitializeLeaveCredits', [userid, year]);
    return result;
  } catch (error) {
    console.error('Error initializing leave credits:', error);
    throw error;
  }
};

/**
 * Get leave balance
 * @param {number} userid - Employee USERID
 * @param {string} leaveType - Leave type (VL, SL, etc.)
 * @param {number} year - Year
 */
export const getLeaveBalance = async (userid, leaveType, year) => {
  try {
    const query = 'SELECT FN_GetLeaveBalance(?, ?, ?) AS balance';
    const result = await hr201Query(query, [userid, leaveType, year]);
    return result[0]?.balance || 0;
  } catch (error) {
    console.error('Error getting leave balance:', error);
    throw error;
  }
};

/**
 * Get employee full name
 * @param {number} userid - Employee USERID
 */
export const getEmployeeFullName = async (userid) => {
  try {
    const query = 'SELECT FN_GetEmployeeFullName(?) AS fullName';
    const result = await hr201Query(query, [userid]);
    return result[0]?.fullName || null;
  } catch (error) {
    console.error('Error getting employee full name:', error);
    throw error;
  }
};

/**
 * Get personal info by USERID
 * @param {number} userid - Employee USERID
 */
export const getPersonalInfoByUserID = async (userid) => {
  try {
    const query = `
      SELECT * FROM Employee_PersonalInfo 
      WHERE USERID = ? AND IsActive = 1
    `;
    const result = await hr201Query(query, [userid]);
    return result[0] || null;
  } catch (error) {
    console.error('Error getting personal info:', error);
    throw error;
  }
};

/**
 * Create or update personal info
 * @param {object} personalInfo - Personal information object
 */
export const upsertPersonalInfo = async (personalInfo) => {
  const connection = await hr201BeginTransaction();
  
  try {
    const {
      USERID,
      BADGENUMBER,
      Surname,
      FirstName,
      MiddleName,
      NameExtension,
      DateOfBirth,
      PlaceOfBirth,
      Sex,
      CivilStatus,
      Citizenship,
      Height,
      Weight,
      BloodType,
      GsisNumber,
      SssNumber,
      PagibigNumber,
      PhilhealthNumber,
      TIN,
      MobileNumber,
      EmailAddress,
      CreatedBy,
      UpdatedBy
    } = personalInfo;
    
    const query = `
      INSERT INTO Employee_PersonalInfo (
        USERID, BADGENUMBER, Surname, FirstName, MiddleName, NameExtension,
        DateOfBirth, PlaceOfBirth, Sex, CivilStatus, Citizenship,
        Height, Weight, BloodType,
        GsisNumber, SssNumber, PagibigNumber, PhilhealthNumber, TIN,
        MobileNumber, EmailAddress, CreatedBy, CreatedDate, IsActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
      ON DUPLICATE KEY UPDATE
        BADGENUMBER = VALUES(BADGENUMBER),
        Surname = VALUES(Surname),
        FirstName = VALUES(FirstName),
        MiddleName = VALUES(MiddleName),
        NameExtension = VALUES(NameExtension),
        DateOfBirth = VALUES(DateOfBirth),
        PlaceOfBirth = VALUES(PlaceOfBirth),
        Sex = VALUES(Sex),
        CivilStatus = VALUES(CivilStatus),
        Citizenship = VALUES(Citizenship),
        Height = VALUES(Height),
        Weight = VALUES(Weight),
        BloodType = VALUES(BloodType),
        GsisNumber = VALUES(GsisNumber),
        SssNumber = VALUES(SssNumber),
        PagibigNumber = VALUES(PagibigNumber),
        PhilhealthNumber = VALUES(PhilhealthNumber),
        TIN = VALUES(TIN),
        MobileNumber = VALUES(MobileNumber),
        EmailAddress = VALUES(EmailAddress),
        UpdatedBy = ?,
        UpdatedDate = NOW()
    `;
    
    await connection.execute(query, [
      USERID, BADGENUMBER, Surname, FirstName, MiddleName, NameExtension,
      DateOfBirth, PlaceOfBirth, Sex, CivilStatus, Citizenship,
      Height, Weight, BloodType,
      GsisNumber, SssNumber, PagibigNumber, PhilhealthNumber, TIN,
      MobileNumber, EmailAddress, CreatedBy,
      UpdatedBy
    ]);
    
    await connection.commit();
    connection.release();
    
    return { success: true, message: 'Personal info saved successfully' };
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Error upserting personal info:', error);
    throw error;
  }
};

/**
 * Log audit trail
 * @param {object} auditData - Audit trail data
 */
export const logAuditTrail = async (auditData) => {
  try {
    const {
      TableName,
      RecordID,
      USERID,
      Action,
      OldValue,
      NewValue,
      IPAddress,
      UserAgent
    } = auditData;
    
    const query = `
      INSERT INTO System_AuditTrail (
        TableName, RecordID, USERID, \`Action\`,
        OldValue, NewValue, IPAddress, UserAgent, Timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    await hr201Query(query, [
      TableName, RecordID, USERID, Action,
      OldValue, NewValue, IPAddress, UserAgent
    ]);
  } catch (error) {
    console.error('Error logging audit trail:', error);
    // Don't throw - audit logging should not break main operations
  }
};

// =============================================
// DATABASE HEALTH CHECK
// =============================================

/**
 * Check HR201 database health
 */
export const checkHR201Health = async () => {
  try {
    const pool = getHR201Pool();
    const connection = await pool.getConnection();
    
    const [rows] = await connection.execute('SELECT 1 as health');
    connection.release();
    
    return {
      status: 'healthy',
      database: 'HR201',
      connected: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: 'HR201',
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

export default {
  initHR201Database,
  getHR201Pool,
  hr201Query,
  hr201CallProcedure,
  hr201BeginTransaction,
  closeHR201Database,
  syncEmployeeToHR201,
  getEmployeeCompleteProfile,
  initializeLeaveCredits,
  getLeaveBalance,
  getEmployeeFullName,
  getPersonalInfoByUserID,
  upsertPersonalInfo,
  logAuditTrail,
  checkHR201Health
};

