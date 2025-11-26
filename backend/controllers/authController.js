import { getDb } from '../config/db.js';
import { getHR201Pool } from '../config/hr201Database.js';
import { formatEmployeeName as formatEmployeeNameUtil } from '../utils/employeenameFormatter.js';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import DigitalPersonaWin32PowerShell from '../utils/digitalPersonaWin32PowerShell.js';
import DigitalPersonaVerification from '../utils/digitalPersonaVerification.js';
import BiometricGuiHelper from '../utils/biometricGuiHelper.js';
import { readMediaAsBase64 } from '../utils/fileStorage.js';

dotenv.config();

// Feature flag to enable/disable DigitalPersona biometric service
const ENABLE_DIGITALPERSONA = process.env.ENABLE_DIGITALPERSONA === 'true' || process.env.ENABLE_DIGITALPERSONA === '1';

// Initialize the Win32 DigitalPersona SDK (using PowerShell interface)
const digitalPersonaSDK = ENABLE_DIGITALPERSONA ? new DigitalPersonaWin32PowerShell() : null;

// Initialize SDK on startup (with fallback)
if (ENABLE_DIGITALPERSONA && digitalPersonaSDK) {
digitalPersonaSDK.initialize().catch((error) => {
  console.error('❌ Failed to initialize DigitalPersona Native SDK:', error);
  console.log('⚠️ DigitalPersona will run in fallback mode');
});
} else {
  console.log('ℹ️ DigitalPersona service is disabled (ENABLE_DIGITALPERSONA=false)');
}

// Note: Fingerprint comparison is now handled by the native SDK

// Add this helper function at the top of the file, after the imports
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 100;
  
  let matches = 0;
  const minLen = Math.min(len1, len2);
  
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) {
      matches++;
    }
  }
  
  return (matches / maxLen) * 100;
}

const normalizeUserId = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? trimmed : numeric;
};

// formatEmployeeNameUtil is imported and used directly where needed

// --- User Login ---
export const login = async (req, res) => {
  const { username, password, loginMode = 'employee' } = req.body;

  console.log('=== LOGIN DEBUG ===');
  console.log('Login attempt for username:', username, 'Mode:', loginMode);
  console.log('Password length:', password ? password.length : 0);

  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter both username and password.' });
  }

  try {
    const hr201Pool = getHR201Pool();
    let role = loginMode === 'admin' ? 'admin' : 'employee';
    let authMethod = loginMode === 'admin' ? 'admin' : 'portal';
    let userRecord = null;

    if (loginMode === 'admin') {
      // Admin login: Use sysusers table from MySQL hr201
      console.log('Admin login: Using sysusers table from MySQL hr201');
      
      // Query sysusers table - check status = 1 (active)
      const [userRows] = await hr201Pool.execute(
        `SELECT s.id, s.username, s.password, s.usertype, s.emp_objid, s.status,
                u.id AS usertype_id, u.typename
         FROM sysusers s
         LEFT JOIN usertypes u ON s.usertype = u.id
         WHERE s.username = ? AND s.status = 1 LIMIT 1`,
        [username]
      );

      if (userRows.length === 0) {
        console.log('No active admin user found with username:', username);
        return res.status(401).json({ message: 'Invalid credentials or account is inactive' });
      }

      const sysUser = userRows[0];
      const storedPassword = sysUser.password;
      
      if (!storedPassword) {
        console.log('No password stored for admin user:', username);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      console.log('=== ADMIN PASSWORD VERIFICATION ===');
      console.log('Input password length:', password ? password.length : 0);
      console.log('Stored password type:', typeof storedPassword);
      console.log('Stored password length:', storedPassword ? storedPassword.length : 0);

      // DUAL AUTHENTICATION METHOD: Check multiple encryption methods
      let isPasswordValid = false;
      let authMethod = '';

      // Method 1: Try bcrypt comparison (primary method for sysusers)
        try {
          const bcryptResult = await bcrypt.compare(password, storedPassword);
          if (bcryptResult) {
            isPasswordValid = true;
            authMethod = 'bcrypt';
          console.log('✅ Admin password verified using bcrypt');
          }
        } catch (bcryptError) {
          console.log('❌ Bcrypt comparison failed:', bcryptError.message);
      }

      // Method 2: Try SHA-256 comparison (for migrated passwords)
      if (!isPasswordValid) {
        try {
          const hash = crypto.createHash('sha256').update(password).digest('hex');
          const truncatedHash = hash.substring(0, 50);
          if (truncatedHash === storedPassword) {
          isPasswordValid = true;
            authMethod = 'sha256_truncated';
            console.log('✅ Admin password verified using SHA-256 (truncated)');
        }
        } catch (sha256Error) {
          console.log('❌ SHA-256 comparison failed:', sha256Error.message);
        }
      }

      // Method 3: Try plain text comparison (for legacy/admin override)
      if (!isPasswordValid) {
        if (password === storedPassword) {
          isPasswordValid = true;
          authMethod = 'plain_text';
          console.log('✅ Admin password verified using plain text');
        }
      }
      
      console.log('=== ADMIN AUTHENTICATION RESULT ===');
      console.log('Password valid:', isPasswordValid);
      console.log('Authentication method:', authMethod);
      
      if (!isPasswordValid) {
        console.log('❌ All admin authentication methods failed');
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Password is correct - create user object compatible with existing code
      // For admin, we use sysusers data but format it similar to USERINFO structure
      const adminUser = {
        USERID: sysUser.id,
        BADGENUMBER: sysUser.username,
        NAME: sysUser.username, // Will need to fetch from employees if emp_objid exists
        privilege: sysUser.usertype || 0,
        PHOTO: null, // Will need to fetch from employees_media if emp_objid exists
        TITLE: sysUser.typename || 'Administrator',
        usertype: sysUser.usertype, // Critical for RBAC
        typename: sysUser.typename,
        emp_objid: sysUser.emp_objid
      };
      
      // ALWAYS load photo from sysusers.photo FIRST (before any employee details)
      // This ensures photo is loaded regardless of employee linking or errors
      try {
        const [sysUserPhotoRows] = await hr201Pool.execute(
          `SELECT photo FROM sysusers WHERE id = ? LIMIT 1`,
          [sysUser.id]
        );
        
        if (sysUserPhotoRows.length > 0 && sysUserPhotoRows[0].photo) {
          try {
            // Convert blob to base64 (photos are stored as PNG format)
            // MySQL2 returns MEDIUMBLOB as Buffer
            const photoBlob = sysUserPhotoRows[0].photo;
            
            // Convert to Buffer if not already
            let photoBuffer;
            if (Buffer.isBuffer(photoBlob)) {
              photoBuffer = photoBlob;
            } else if (photoBlob instanceof Uint8Array) {
              photoBuffer = Buffer.from(photoBlob);
            } else if (Array.isArray(photoBlob)) {
              photoBuffer = Buffer.from(photoBlob);
    } else {
              photoBuffer = Buffer.from(photoBlob);
            }
            
            if (photoBuffer.length === 0) {
              throw new Error('Photo buffer is empty');
            }
            
            const photoBase64 = `data:image/png;base64,${photoBuffer.toString('base64')}`;
            adminUser.PHOTO = photoBase64;
          } catch (photoError) {
            console.error('Error loading admin photo from sysusers.photo:', photoError.message);
            adminUser.PHOTO = null;
          }
        } else {
          adminUser.PHOTO = null;
        }
      } catch (photoQueryError) {
        console.error('Error querying sysusers.photo:', photoQueryError.message);
        adminUser.PHOTO = null;
      }
      
      // If admin has linked employee, fetch employee details (name, title)
      if (sysUser.emp_objid) {
        try {
          const [empRows] = await hr201Pool.execute(
            `SELECT e.surname, e.firstname, e.middlename, e.nameextension, e.title
             FROM employees e
             WHERE e.objid = ? LIMIT 1`,
            [sysUser.emp_objid]
          );
          
          if (empRows.length > 0) {
            const emp = empRows[0];
            // Construct fullname from individual name parts
            const fullname = formatEmployeeNameUtil(
              emp.surname || '',
              emp.firstname || '',
              emp.middlename || '',
              emp.nameextension || ''
            );
            adminUser.NAME = fullname || sysUser.username;
            adminUser.TITLE = emp.title || sysUser.typename || 'Administrator';
          }
        } catch (empError) {
          console.log('Could not fetch employee details for admin:', empError.message);
          // Photo is already loaded above, so continue
        }
      }
      
      userRecord = adminUser;

    } else {
      const trimmedUsername = String(username ?? '').trim();
      const rawPin = String(password ?? '').trim();
      const digitsOnlyPin = rawPin.replace(/\D/g, '');

      if (!trimmedUsername || !digitsOnlyPin) {
        return res.status(401).json({ message: 'Invalid Portal Access' });
      }

      const normalizedUsername = trimmedUsername.toLowerCase();
      const normalizedPinString = digitsOnlyPin;

      console.log('[Portal Login] Attempt', {
        username: normalizedUsername,
        pinLength: normalizedPinString.length,
        rawPinLength: rawPin.length
      });

      const [portalRows] = await hr201Pool.query(
        `
          SELECT 
            sp.userportalid,
            sp.emp_objid,
            sp.dtruserid,
            sp.dtrname,
            sp.username,
            sp.pin,
            sp.emailaddress,
            sp.status,
            sp.createdby,
            COALESCE(e.surname, e2.surname) AS surname,
            COALESCE(e.firstname, e2.firstname) AS firstname,
            COALESCE(e.middlename, e2.middlename) AS middlename,
            COALESCE(e.email, e2.email) AS employee_email,
            COALESCE(em.photo_path, em2.photo_path) AS photo_path
          FROM sysusers_portal sp
          LEFT JOIN employees e ON e.objid = sp.emp_objid
          LEFT JOIN employees e2 ON e2.dtruserid = sp.dtruserid
          LEFT JOIN employees_media em ON em.emp_objid = e.objid
          LEFT JOIN employees_media em2 ON em2.emp_objid = e2.objid
          WHERE LOWER(TRIM(sp.username)) = ?
            AND TRIM(sp.pin) = ?
            AND sp.status = 1
          LIMIT 1
        `,
        [normalizedUsername, normalizedPinString]
      );

      console.log('[Portal Login] Query rows:', portalRows?.length || 0);

      if (!portalRows || portalRows.length === 0) {
        console.log('[Portal Login] No matching portal user found');
        return res.status(401).json({ message: 'Invalid Portal Access' });
    }

      const portalRow = portalRows[0];
      const storedPin = portalRow.pin ? String(portalRow.pin) : '';

      console.log('[Portal Login] Row match', {
        dbUsername: portalRow.username,
        dbPin: storedPin,
        dbStatus: portalRow.status,
        empObjId: portalRow.emp_objid,
        dtruserid: portalRow.dtruserid
      });

      if (storedPin !== digitsOnlyPin) {
        console.log('[Portal Login] Pin mismatch', { storedPin, submittedPin: digitsOnlyPin });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

      if (Number(portalRow.status) !== 1) {
        return res.status(403).json({ message: 'Portal Access is Inactive' });
      }

      const employeeName =
        portalRow.dtrname ||
        formatEmployeeNameUtil(portalRow.surname, portalRow.firstname, portalRow.middlename) ||
        trimmedUsername;

      let photoData = null;
      if (portalRow.photo_path) {
        try {
          photoData = await readMediaAsBase64(portalRow.photo_path);
        } catch (photoError) {
          console.warn('Unable to read portal user photo:', photoError.message);
          photoData = null;
        }
      }

      const normalizedUserId = normalizeUserId(portalRow.dtruserid ?? portalRow.userportalid);

      userRecord = {
        USERID: normalizedUserId,
        BADGENUMBER: portalRow.username,
        NAME: employeeName,
        privilege: 0,
        PHOTO: photoData,
        TITLE: employeeName,
        emailaddress: portalRow.emailaddress || null,
        userportalid: portalRow.userportalid,
        emp_objid: portalRow.emp_objid,
        dtruserid: portalRow.dtruserid,
        portalStatus: portalRow.status,
        createdby: portalRow.createdby
      };
    }

    if (!userRecord) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = userRecord;

    const tokenPayload = {
      USERID: user.USERID,
      role: role,
      authMethod: loginMode === 'admin' ? 'admin' : 'portal',
      isPortal: loginMode !== 'admin'
    };
    
    // Add usertype if present (from sysusers admin login)
    if (user.usertype !== undefined) {
      tokenPayload.usertype = user.usertype;
    }

    if (user.userportalid) {
      tokenPayload.userportalid = user.userportalid;
    }

    if (user.emp_objid) {
      tokenPayload.emp_objid = user.emp_objid;
    }

    if (user.BADGENUMBER) {
      tokenPayload.username = user.BADGENUMBER;
    }

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
      { expiresIn: '8h' } // Extended expiry for admin sessions
    );


    // Convert photo to base64 if it exists (handle both MSSQL binary and MySQL path)
    let photoData = null;
    if (user.PHOTO) {
      if (typeof user.PHOTO === 'string' && user.PHOTO.startsWith('data:')) {
        // Already base64 from MySQL path (sysusers.photo or employees_media)
        photoData = user.PHOTO;
      } else {
        // MSSQL binary data
      try {
        const base64Photo = Buffer.from(user.PHOTO).toString('base64');
        photoData = `data:image/jpeg;base64,${base64Photo}`;
      } catch (error) {
          console.error('Error converting MSSQL photo:', error.message);
        photoData = null;
      }
    }
    }
    
    const userResponse = {
        id: user.USERID ?? user.userportalid,
        username: user.BADGENUMBER,
        employeeId: user.USERID ?? user.userportalid,
        role: role,
        USERID: user.USERID ?? user.userportalid,
        NAME: user.NAME,
        name: user.NAME,
        TITLE: user.TITLE,
        title: user.TITLE,
        PHOTO: photoData,
        privilege: user.privilege
    };
    
    // Add usertype to response if present (for admin RBAC)
    if (user.usertype !== undefined) {
      userResponse.usertype = user.usertype;
      userResponse.typename = user.typename;
    }

    if (user.emailaddress) {
      userResponse.emailaddress = user.emailaddress;
    }

    if (user.userportalid) {
      userResponse.userportalid = user.userportalid;
    }

    if (user.emp_objid) {
      userResponse.emp_objid = user.emp_objid;
    }

    if (user.dtruserid !== undefined) {
      userResponse.dtruserid = user.dtruserid;
    }

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const createPortalSessionFromAdmin = async (req, res) => {
  try {
    if (!req.authMethod || req.authMethod !== 'admin') {
      return res.status(403).json({ message: 'Portal session bridge is only available for admin logins.' });
    }

    const adminUserId = req.user?.USERID;
    if (!adminUserId) {
      return res.status(400).json({ message: 'Invalid admin token payload.' });
    }

    const hr201Pool = getHR201Pool();

    let empObjId = req.user?.emp_objid;
    if (!empObjId) {
      const [adminRows] = await hr201Pool.execute(
        'SELECT emp_objid FROM sysusers WHERE id = ? LIMIT 1',
        [adminUserId]
      );
      if (!adminRows || adminRows.length === 0 || !adminRows[0].emp_objid) {
        return res.status(404).json({
          message: 'Admin account is not linked to an employee record (emp_objid). Please update sysusers.'
        });
      }
      empObjId = adminRows[0].emp_objid;
    }

    const [portalRows] = await hr201Pool.query(
      `
        SELECT 
          sp.userportalid,
          sp.emp_objid,
          sp.dtruserid,
          sp.dtrname,
          sp.username,
          sp.emailaddress,
          sp.status,
          sp.createdby,
          COALESCE(e.surname, e2.surname) AS surname,
          COALESCE(e.firstname, e2.firstname) AS firstname,
          COALESCE(e.middlename, e2.middlename) AS middlename,
          COALESCE(em.photo_path, em2.photo_path) AS photo_path
        FROM sysusers_portal sp
        LEFT JOIN employees e ON e.objid = sp.emp_objid
        LEFT JOIN employees e2 ON e2.dtruserid = sp.dtruserid
        LEFT JOIN employees_media em ON em.emp_objid = e.objid
        LEFT JOIN employees_media em2 ON em2.emp_objid = e2.objid
        WHERE sp.emp_objid = ?
          AND sp.status = 1
        LIMIT 1
      `,
      [empObjId]
    );

    if (!portalRows || portalRows.length === 0) {
      return res.status(404).json({
        message: 'No active portal account (sysusers_portal) is linked to this admin. Please create one in Portal Users.'
      });
    }

    const portalRow = portalRows[0];

    const employeeName =
      portalRow.dtrname ||
      formatEmployeeNameUtil(portalRow.surname, portalRow.firstname, portalRow.middlename) ||
      portalRow.username;

    let photoData = null;
    if (portalRow.photo_path) {
      try {
        photoData = await readMediaAsBase64(portalRow.photo_path);
      } catch (photoError) {
        console.warn('Unable to load portal user photo for bridge session:', photoError.message);
      }
    }

    const normalizedUserId = normalizeUserId(portalRow.dtruserid ?? portalRow.userportalid);

    const portalUserResponse = {
      USERID: normalizedUserId,
      id: normalizedUserId,
      employeeId: normalizedUserId,
      role: 'employee',
      NAME: employeeName,
      name: employeeName,
      BADGENUMBER: portalRow.username,
      TITLE: employeeName,
      title: employeeName,
      PHOTO: photoData,
      privilege: 0,
      userportalid: portalRow.userportalid,
      emp_objid: portalRow.emp_objid,
      dtruserid: portalRow.dtruserid,
      emailaddress: portalRow.emailaddress || null,
    };

    const portalTokenPayload = {
      USERID: normalizedUserId,
      role: 'employee',
      authMethod: 'portal',
      isPortal: true,
      userportalid: portalRow.userportalid,
      emp_objid: portalRow.emp_objid,
      dtruserid: portalRow.dtruserid,
      username: portalRow.username,
    };

    const portalToken = jwt.sign(
      portalTokenPayload,
      process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      token: portalToken,
      user: portalUserResponse,
    });
  } catch (error) {
    console.error('Error creating portal session for admin:', error);
    return res.status(500).json({ message: 'Unable to create portal session.', error: error.message });
  }
};

// Helper function to process and compress photo to PNG format
// Target: Under 64KB for BLOB compatibility (or 500KB if using MEDIUMBLOB)
const processUserPhoto = async (inputBuffer) => {
  const sharp = (await import('sharp')).default;
  // Use 64KB to be safe with BLOB type (max 65,535 bytes)
  // Change to 500 if using MEDIUMBLOB
  const MAX_SIZE_KB = 64;
  const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;
  
  try {
    // Start with smaller dimensions to fit in BLOB (64KB limit)
    let width = 400;
    let height = 400;
    let compressionLevel = 9; // PNG compression level (0-9, 9 is maximum compression)
    
    let processedBuffer;
    let iterations = 0;
    const maxIterations = 10;
    
    // Get initial image dimensions
    const metadata = await sharp(inputBuffer).metadata();
    const aspectRatio = metadata.width / metadata.height;
    
    // Calculate initial dimensions maintaining aspect ratio (max 400px for BLOB compatibility)
    if (metadata.width > width || metadata.height > height) {
      if (metadata.width > metadata.height) {
        width = 400;
        height = Math.round(400 / aspectRatio);
      } else {
        height = 400;
        width = Math.round(400 * aspectRatio);
      }
    } else {
      width = metadata.width;
      height = metadata.height;
    }
    
    // Iteratively resize and compress until under 64KB (for BLOB compatibility)
    while (iterations < maxIterations) {
      processedBuffer = await sharp(inputBuffer)
        .resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .png({
          compressionLevel: compressionLevel,
          adaptiveFiltering: true,
          force: true
        })
        .toBuffer();
      
      console.log(`🔄 Photo processing attempt ${iterations + 1}: ${width}x${height}, compression ${compressionLevel}, size: ${(processedBuffer.length / 1024).toFixed(2)}KB`);
      
      if (processedBuffer.length <= MAX_SIZE_BYTES) {
        console.log(`✅ Photo processed successfully: ${(processedBuffer.length / 1024).toFixed(2)}KB`);
        return processedBuffer;
      }
      
      // Reduce size progressively
      if (iterations < 3) {
        // First 3 iterations: reduce dimensions more aggressively
        width = Math.round(width * 0.8);
        height = Math.round(height * 0.8);
      } else if (iterations < 6) {
        // Next 3 iterations: increase compression
        compressionLevel = Math.min(9, compressionLevel + 1);
      } else {
        // Final iterations: reduce both dimensions and increase compression
        width = Math.round(width * 0.9);
        height = Math.round(height * 0.9);
        compressionLevel = Math.min(9, compressionLevel + 1);
      }
      
      iterations++;
    }
    
    // If still too large after all iterations, use maximum compression
    if (processedBuffer.length > MAX_SIZE_BYTES) {
      console.log(`⚠️ Photo still too large after ${maxIterations} iterations, applying maximum compression`);
      processedBuffer = await sharp(inputBuffer)
        .resize(Math.round(width * 0.7), Math.round(height * 0.7), {
          fit: 'inside',
          withoutEnlargement: true
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          force: true
        })
        .toBuffer();
      
      if (processedBuffer.length > MAX_SIZE_BYTES) {
        console.log(`⚠️ Warning: Final photo size is ${(processedBuffer.length / 1024).toFixed(2)}KB, exceeding ${MAX_SIZE_KB}KB limit`);
      }
    }
    
    return processedBuffer;
  } catch (error) {
    console.error('Error processing photo:', error);
    throw error;
  }
};

// POST /api/auth/upload-photo - Upload or change user photo
export const uploadUserPhoto = async (req, res) => {
  try {
    const userId = req.user?.USERID;
    const userRole = req.user?.role;
    const userUsertype = req.user?.usertype;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo file uploaded' });
    }

    const originalBuffer = req.file.buffer;
    const originalMimeType = req.file.mimetype;

    console.log('=== USER PHOTO UPLOAD ===');
    console.log('User ID:', userId);
    console.log('Role:', userRole);
    console.log('UserType:', userUsertype);
    console.log('Original photo size:', originalBuffer.length, 'bytes');
    console.log('Original MIME type:', originalMimeType);

    // Process photo: convert to PNG and compress to under 500KB
    const photoBuffer = await processUserPhoto(originalBuffer);
    const mimeType = 'image/png'; // Always PNG after processing

    console.log('Processed photo size:', photoBuffer.length, 'bytes');
    console.log('Processed MIME type:', mimeType);

    // For ALL system users (from sysusers table) - regardless of role or usertype
    // This applies to all users who logged in via admin mode (sysusers table)
    if (userRole === 'admin' && userUsertype !== undefined) {
      const { getHR201Pool } = await import('../config/hr201Database.js');
      const hr201Pool = getHR201Pool();

      // Get system user details
      const [sysUserRows] = await hr201Pool.execute(
        `SELECT id, emp_objid FROM sysusers WHERE id = ? LIMIT 1`,
        [userId]
      );

      if (sysUserRows.length === 0) {
        return res.status(404).json({ success: false, message: 'System user not found' });
      }

      const sysUser = sysUserRows[0];

      // Save photo directly to sysusers.photo column only (no filesystem storage)
      // This applies to ALL system users (Root Admin, Editor, Viewer, etc.)
      // Note: Column should be MEDIUMBLOB or BLOB to hold up to 64KB
      try {
        await hr201Pool.execute(
          `UPDATE sysusers SET photo = ? WHERE id = ?`,
          [photoBuffer, userId]
        );
      } catch (dbError) {
        if (dbError.code === 'ER_DATA_TOO_LONG') {
          console.error('❌ Database column type error: sysusers.photo column is too small (likely TINYBLOB)');
          console.error('❌ Please run the SQL script: database/alter_sysusers_photo_column.sql');
          console.error('❌ This will alter the column from TINYBLOB to MEDIUMBLOB or BLOB');
          return res.status(500).json({
            success: false,
            message: 'Database column type is too small. Please contact administrator to run the database migration script.',
            error: 'Column sysusers.photo must be altered from TINYBLOB to BLOB or MEDIUMBLOB',
            sqlScript: 'database/alter_sysusers_photo_column.sql'
          });
        }
        throw dbError;
      }

      // Convert to base64 for response (always PNG after processing)
      const photoBase64 = `data:image/png;base64,${photoBuffer.toString('base64')}`;

      return res.json({
        success: true,
        message: 'Photo uploaded successfully',
        photo: photoBase64
      });
    } else {
      // Employee users (from USERINFO table - MSSQL)
      const pool = getDb();
      
      // Convert buffer to binary for MSSQL
      const photoBinary = photoBuffer;

      // Update USERINFO.PHOTO
      await pool.request()
        .input('USERID', sql.Int, userId)
        .input('PHOTO', sql.VarBinary(sql.MAX), photoBinary)
        .query(`
          UPDATE USERINFO 
          SET PHOTO = @PHOTO 
          WHERE USERID = @USERID
        `);

      // Convert to base64 for response (always PNG after processing)
      const photoBase64 = `data:image/png;base64,${photoBuffer.toString('base64')}`;

      return res.json({
        success: true,
        message: 'Photo uploaded successfully',
        photo: photoBase64
      });
    }
  } catch (error) {
    console.error('Error uploading user photo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error uploading photo',
      error: error.message
    });
  }
};

// GET /api/auth/permissions - Get user permissions from sysusers_roles table
export const getUserPermissions = async (req, res) => {
  try {
    const userId = req.user?.USERID || req.user?.id;
    let usertype = req.user?.usertype;

    console.log('[Auth] getUserPermissions - req.user:', {
      USERID: req.user?.USERID,
      id: req.user?.id,
      usertype: req.user?.usertype,
      fullUser: Object.keys(req.user || {})
    });

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // If usertype is not in JWT, fetch it from database
    if (!usertype) {
      try {
        const { getHR201Pool } = await import('../config/hr201Database.js');
        const pool = getHR201Pool();
        const [userRows] = await pool.execute(
          `SELECT usertype FROM sysusers WHERE id = ? LIMIT 1`,
          [userId]
        );
        if (userRows.length > 0) {
          usertype = userRows[0].usertype;
          console.log(`[Auth] Fetched usertype from DB: ${usertype} for userId: ${userId}`);
        } else {
          console.warn(`[Auth] User ${userId} not found in sysusers table`);
        }
      } catch (dbError) {
        console.error('[Auth] Error fetching usertype from DB:', dbError);
      }
    }

    // Import here to avoid circular dependency
    const { getUserPermissions: getPermissions } = await import('../middleware/rbacMiddleware.js');
    const permissions = await getPermissions(userId, usertype);

    console.log('[Auth] Returning permissions:', {
      userId,
      usertype,
      permissionCount: Object.keys(permissions).filter(k => k !== 'componentgroups').length,
      componentgroups: permissions.componentgroups
    });

    res.json({
      success: true,
      permissions,
      usertype,
      isRootAdmin: usertype === 1
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching permissions',
      error: error.message
    });
  }
};

// --- User Registration (if needed) ---
export const register = async (req, res) => {
  res.status(501).json({ message: 'Registration not implemented for MSSQL setup' });
};

// POST /api/auth/verify-password
export const verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        valid: false, 
        message: 'Password is required' 
      });
    }

    // Get the current user from the request (set by auth middleware)
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ 
        valid: false, 
        message: 'User not authenticated' 
      });
    }

    // For admin users, verify against their stored password
    if (currentUser.role === 'admin') {
      try {
        const pool = getDb();
        const result = await pool
          .request()
          .input('userid', sql.Int, currentUser.USERID)
          .query(`
            SELECT PASSWORD 
            FROM USERINFO 
            WHERE USERID = @userid
          `);

        if (result.recordset.length === 0) {
          return res.status(401).json({ 
            valid: false, 
            message: 'User not found' 
          });
        }

        const storedPassword = result.recordset[0].PASSWORD;
        
        if (!storedPassword) {
          return res.status(401).json({ 
            valid: false, 
            message: 'No password stored for this user' 
          });
        }

        // DUAL AUTHENTICATION METHOD: Check multiple encryption methods
        let isValid = false;
        let authMethod = '';

        // Method 1: Try SHA-256 comparison (for new encrypted passwords from employee form)
        try {
          const hash = crypto.createHash('sha256').update(password).digest('hex');
          const truncatedHash = hash.substring(0, 50);
          if (truncatedHash === storedPassword) {
            isValid = true;
            authMethod = 'sha256_truncated';
          }
        } catch (sha256Error) {
          console.log('SHA-256 comparison failed:', sha256Error.message);
        }

        // Method 2: Try bcrypt comparison (for old bcrypt passwords)
        if (!isValid) {
          try {
            const bcryptResult = await bcrypt.compare(password, storedPassword);
            if (bcryptResult) {
              isValid = true;
              authMethod = 'bcrypt';
            }
          } catch (bcryptError) {
            console.log('Bcrypt comparison failed:', bcryptError.message);
          }
        }

        // Method 3: Try plain text comparison (for legacy passwords)
        if (!isValid) {
          // Remove tab character if present (legacy format)
          const cleanStoredPassword = storedPassword.replace(/^\t/, '');
          if (password === cleanStoredPassword) {
            isValid = true;
            authMethod = 'plain_text_clean';
          }
        }

        // Method 4: Try with tab character (legacy format)
        if (!isValid) {
          const passwordWithTab = '\t' + password;
          if (passwordWithTab === storedPassword) {
            isValid = true;
            authMethod = 'plain_text_with_tab';
          }
        }

        // Method 5: Try exact match (for plain text passwords without tab)
        if (!isValid) {
          if (password === storedPassword) {
            isValid = true;
            authMethod = 'plain_text_exact';
          }
        }

        if (isValid) {
          res.json({ 
            valid: true, 
            message: 'Password verified successfully',
            authMethod: authMethod
          });
        } else {
          res.status(401).json({ 
            valid: false, 
            message: 'Invalid password' 
          });
        }
      } catch (error) {
        console.error('Error verifying admin password:', error);
        res.status(500).json({ 
          valid: false, 
          message: 'Error verifying password' 
        });
      }
    } else {
      // For employee users, use a different verification method
      // You can implement this based on your requirements
      res.status(403).json({ 
        valid: false, 
        message: 'Password verification not available for employee accounts' 
      });
    }

  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ 
      valid: false, 
      message: 'Error verifying password' 
    });
  }
};

// POST /api/auth/change-pin
export const changePin = async (req, res) => {
  try {
    const { currentSsn, newPin, confirmPin } = req.body;
    const userId = req.user.USERID; // From JWT token (dtruserid)
    const userportalid = req.user.userportalid; // From JWT token if available

    console.log('=== PIN CHANGE DEBUG ===');
    console.log('User ID (dtruserid):', userId);
    console.log('User Portal ID:', userportalid);
    console.log('Current PIN provided:', currentSsn ? '***' : 'null');
    console.log('New PIN length:', newPin ? newPin.length : 0);
    console.log('Confirm PIN length:', confirmPin ? confirmPin.length : 0);

    // Validation
    if (!currentSsn || !newPin || !confirmPin) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    if (newPin !== confirmPin) {
      return res.status(400).json({ 
        success: false, 
        message: 'New PIN and confirm PIN do not match' 
      });
    }

    // PIN validation: 4-6 digits (matching portal requirements)
    const normalizedNewPin = String(newPin).replace(/\D/g, '');
    if (normalizedNewPin.length < 4 || normalizedNewPin.length > 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN must be between 4 and 6 digits' 
      });
    }

    const hr201Pool = getHR201Pool();

    // Find the portal user record using dtruserid or userportalid
    let portalUser;
    if (userportalid) {
      const [rows] = await hr201Pool.query(
        'SELECT userportalid, pin, dtruserid FROM sysusers_portal WHERE userportalid = ? LIMIT 1',
        [userportalid]
      );
      portalUser = rows[0];
    } else if (userId) {
      const [rows] = await hr201Pool.query(
        'SELECT userportalid, pin, dtruserid FROM sysusers_portal WHERE dtruserid = ? LIMIT 1',
        [userId]
      );
      portalUser = rows[0];
    }

    if (!portalUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Portal user account not found' 
      });
    }

    // Verify the current PIN
    const currentPinNormalized = String(currentSsn).replace(/\D/g, '').trim();
    const storedPin = portalUser.pin ? String(portalUser.pin).trim() : '';

    if (currentPinNormalized !== storedPin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Current PIN is incorrect' 
      });
    }

    // Update the PIN in sysusers_portal
    await hr201Pool.query(
      'UPDATE sysusers_portal SET pin = ?, updateddate = NOW() WHERE userportalid = ?',
      [normalizedNewPin, portalUser.userportalid]
    );

    console.log('✅ PIN updated successfully for portal user:', portalUser.userportalid);

    res.json({
      success: true,
      message: 'PIN changed successfully. You can now use your new PIN to login.'
    });

  } catch (error) {
    console.error('Error changing PIN:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error changing PIN' 
    });
  }
};

// POST /api/auth/verify-pin
export const verifyPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const userId = req.user.USERID; // From JWT token

    if (!pin) {
      return res.status(400).json({ 
        valid: false, 
        message: 'PIN is required' 
      });
    }

    const pool = getDb();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('pin', sql.VarChar, pin)
      .query(`
        SELECT USERID, SSN
        FROM USERINFO 
        WHERE USERID = @userId AND LTRIM(RTRIM(SSN)) = LTRIM(RTRIM(@pin))
      `);

    const isValid = result.recordset.length > 0;

    res.json({
      valid: isValid,
      message: isValid ? 'PIN is valid' : 'Invalid PIN'
    });

  } catch (error) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ 
      valid: false, 
      message: 'Error verifying PIN' 
    });
  }
};

// POST /api/auth/change-password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.USERID; // From JWT token
    const authMethod = req.authMethod || req.user.authMethod; // Check if admin or portal user

    console.log('=== PASSWORD CHANGE DEBUG ===');
    console.log('User ID:', userId);
    console.log('Auth Method:', authMethod);
    console.log('Current password provided:', currentPassword ? '***' : 'null');
    console.log('New password length:', newPassword ? newPassword.length : 0);

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    let user = null;
    let storedPassword = null;
    let isAdmin = false;

    // Check if user is admin (stored in sysusers table) or portal/employee (stored in USERINFO table)
    if (authMethod === 'admin' || req.isPortal === false) {
      // Admin user - use sysusers table from MySQL
      isAdmin = true;
      const hr201Pool = getHR201Pool();
      
      const [adminRows] = await hr201Pool.execute(
        `SELECT id, username, password FROM sysusers WHERE id = ? AND status = 1 LIMIT 1`,
        [userId]
      );

      if (adminRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin user not found'
        });
      }

      user = adminRows[0];
      storedPassword = user.password;
    } else {
      // Portal/Employee user - use USERINFO table from MSSQL
    const pool = getDb();

    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT PASSWORD, BADGENUMBER, NAME
        FROM USERINFO 
        WHERE USERID = @userId
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

      user = userResult.recordset[0];
      storedPassword = user.PASSWORD;
    }

    // Check if password exists
    if (!storedPassword) {
      const userName = isAdmin ? (user.username || 'Unknown') : (user.NAME || 'Unknown');
      console.log('No password stored for user:', userName);
      return res.status(400).json({
        success: false,
        message: 'No password stored for this user'
      });
    }

    console.log('=== CURRENT PASSWORD VERIFICATION ANALYSIS ===');
    console.log('User type:', isAdmin ? 'Admin' : 'Portal/Employee');
    console.log('Input password:', currentPassword);
    console.log('Stored password type:', typeof storedPassword);
    console.log('Stored password length:', storedPassword.length);
    if (!isAdmin) {
    console.log('Stored password starts with tab:', storedPassword.startsWith('\t'));
    }

    // DUAL AUTHENTICATION METHOD: Check multiple encryption methods (same as login)
    let isCurrentPasswordValid = false;
    let verifiedAuthMethod = '';

    if (isAdmin) {
      // Admin password verification (bcrypt, SHA-256, plain text)
      // Method 1: Try bcrypt comparison (primary method for sysusers)
      try {
        const bcryptResult = await bcrypt.compare(currentPassword, storedPassword);
        if (bcryptResult) {
          isCurrentPasswordValid = true;
          verifiedAuthMethod = 'bcrypt';
          console.log('✅ Admin password verified using bcrypt');
        }
      } catch (bcryptError) {
        console.log('❌ Bcrypt comparison failed:', bcryptError.message);
      }

      // Method 2: Try SHA-256 comparison (for migrated passwords)
      if (!isCurrentPasswordValid) {
        try {
          const hash = crypto.createHash('sha256').update(currentPassword).digest('hex');
          const truncatedHash = hash.substring(0, 50);
          if (truncatedHash === storedPassword) {
            isCurrentPasswordValid = true;
            verifiedAuthMethod = 'sha256_truncated';
            console.log('✅ Admin password verified using SHA-256 (truncated)');
          }
        } catch (sha256Error) {
          console.log('❌ SHA-256 comparison failed:', sha256Error.message);
        }
      }

      // Method 3: Try plain text comparison (for legacy passwords)
      if (!isCurrentPasswordValid) {
        if (currentPassword === storedPassword) {
          isCurrentPasswordValid = true;
          verifiedAuthMethod = 'plain_text';
          console.log('✅ Admin password verified using plain text');
        }
      }
    } else {
      // Portal/Employee password verification (SHA-256, plain text with/without tab)
    // Method 1: Try SHA-256 comparison (for new encrypted passwords from employee form)
    try {
      const hash = crypto.createHash('sha256').update(currentPassword).digest('hex');
      const truncatedHash = hash.substring(0, 50);
      if (truncatedHash === storedPassword) {
        isCurrentPasswordValid = true;
          verifiedAuthMethod = 'sha256_truncated';
        console.log('✅ Current password verified using SHA-256 (truncated)');
      }
    } catch (sha256Error) {
      console.log('❌ SHA-256 comparison failed:', sha256Error.message);
    }

    // Method 2: Try bcrypt comparison (for old bcrypt passwords)
    if (!isCurrentPasswordValid) {
      try {
        const bcryptResult = await bcrypt.compare(currentPassword, storedPassword);
        if (bcryptResult) {
          isCurrentPasswordValid = true;
            verifiedAuthMethod = 'bcrypt';
          console.log('✅ Current password verified using bcrypt');
        }
      } catch (bcryptError) {
        console.log('❌ Bcrypt comparison failed:', bcryptError.message);
      }
    }

    // Method 3: Try plain text comparison (for legacy passwords)
    if (!isCurrentPasswordValid) {
      // Remove tab character if present (legacy format)
      const cleanStoredPassword = storedPassword.replace(/^\t/, '');
      if (currentPassword === cleanStoredPassword) {
        isCurrentPasswordValid = true;
          verifiedAuthMethod = 'plain_text_clean';
        console.log('✅ Current password verified using plain text (clean)');
      }
    }

    // Method 4: Try with tab character (legacy format)
    if (!isCurrentPasswordValid) {
      const passwordWithTab = '\t' + currentPassword;
      if (passwordWithTab === storedPassword) {
        isCurrentPasswordValid = true;
          verifiedAuthMethod = 'plain_text_with_tab';
        console.log('✅ Current password verified using plain text (with tab)');
      }
    }

    // Method 5: Try exact match (for plain text passwords without tab)
    if (!isCurrentPasswordValid) {
      if (currentPassword === storedPassword) {
        isCurrentPasswordValid = true;
          verifiedAuthMethod = 'plain_text_exact';
        console.log('✅ Current password verified using plain text (exact match)');
        }
      }
    }

    if (!isCurrentPasswordValid) {
      console.log('❌ All password verification methods failed');
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    console.log('✅ Current password verified using method:', verifiedAuthMethod);

    // Update password in appropriate database
    if (isAdmin) {
      // Admin: Update in sysusers table (MySQL) using bcrypt
      const hr201Pool = getHR201Pool();
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await hr201Pool.execute(
        `UPDATE sysusers SET password = ? WHERE id = ?`,
        [hashedPassword, userId]
      );

      console.log('Admin password updated successfully for user:', user.username);
      console.log('New password stored using bcrypt');
    } else {
      // Portal/Employee: Update in USERINFO table (MSSQL) using SHA-256
      const pool = getDb();
    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    const truncatedNewPasswordHash = newPasswordHash.substring(0, 50);

    await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('newPassword', sql.VarChar(255), truncatedNewPasswordHash)
      .query(`
        UPDATE USERINFO 
        SET PASSWORD = @newPassword
        WHERE USERID = @userId
      `);

    console.log('Password updated successfully for user:', user.NAME);
    console.log('New password stored using SHA-256 (truncated) method');
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// GET /api/auth/check-admin-access - Check if portal user has active sysusers record
export const checkAdminAccess = async (req, res) => {
  try {
    const userId = req.user?.USERID;
    const empObjId = req.user?.emp_objid;
    const userportalid = req.user?.userportalid;

    if (!empObjId && !userportalid) {
      return res.json({
        hasAdminAccess: false,
        message: 'No employee object ID found'
      });
    }

    const hr201Pool = getHR201Pool();

    // First, get emp_objid from sysusers_portal if not available
    let finalEmpObjId = empObjId;
    if (!finalEmpObjId && userportalid) {
      const [portalRows] = await hr201Pool.execute(
        'SELECT emp_objid FROM sysusers_portal WHERE userportalid = ? LIMIT 1',
        [userportalid]
      );
      if (portalRows.length > 0) {
        finalEmpObjId = portalRows[0].emp_objid;
      }
    }

    if (!finalEmpObjId) {
      return res.json({
        hasAdminAccess: false,
        message: 'No employee object ID found'
      });
    }

    // Check if there's an active sysusers record with this emp_objid AND status = 1
    const [sysUserRows] = await hr201Pool.execute(
      `SELECT id, username, status 
       FROM sysusers 
       WHERE emp_objid = ? AND status = 1 
       LIMIT 1`,
      [finalEmpObjId]
    );

    if (sysUserRows.length > 0) {
      const sysUser = sysUserRows[0];
      return res.json({
        hasAdminAccess: true,
        sysUserId: sysUser.id,
        username: sysUser.username,
        message: 'Active admin account found'
      });
    }

    return res.json({
      hasAdminAccess: false,
      message: 'No active admin account found. Admin account must have status = 1.'
    });
  } catch (error) {
    console.error('Error checking admin access:', error);
    res.status(500).json({
      hasAdminAccess: false,
      message: 'Error checking admin access',
      error: error.message
    });
  }
};

// POST /api/auth/portal/admin-session - Create admin session from portal user
// This allows portal users with active admin accounts to automatically authenticate as admin
export const createAdminSessionFromPortal = async (req, res) => {
  try {
    // Verify this is a portal user
    // Check both isPortal flag and authMethod to ensure it's a portal session
    const isPortalUser = req.isPortal === true || req.authMethod === 'portal';
    
    if (!isPortalUser) {
      console.log('❌ Bridge access denied - not a portal user:', {
        isPortal: req.isPortal,
        authMethod: req.authMethod,
        user: req.user
      });
      return res.status(403).json({ 
        message: 'Admin session bridge is only available for portal users.',
        debug: {
          isPortal: req.isPortal,
          authMethod: req.authMethod
        }
      });
    }
    
    console.log('✅ Portal user verified for bridge:', {
      isPortal: req.isPortal,
      authMethod: req.authMethod,
      userId: req.user?.USERID
    });

    const userId = req.user?.USERID;
    const empObjId = req.user?.emp_objid;
    const userportalid = req.user?.userportalid;

    if (!empObjId && !userportalid) {
      return res.status(400).json({ 
        message: 'No employee object ID found in portal session.' 
      });
    }

    const hr201Pool = getHR201Pool();

    // Get emp_objid from portal user
    let finalEmpObjId = empObjId;
    if (!finalEmpObjId && userportalid) {
      const [portalRows] = await hr201Pool.execute(
        'SELECT emp_objid FROM sysusers_portal WHERE userportalid = ? LIMIT 1',
        [userportalid]
      );
      if (portalRows.length > 0) {
        finalEmpObjId = portalRows[0].emp_objid;
      }
    }

    if (!finalEmpObjId) {
      return res.status(404).json({
        message: 'No employee object ID found. Portal account must be linked to an employee.'
      });
    }

    // Get admin account linked to this emp_objid with status = 1
    const [sysUserRows] = await hr201Pool.execute(
      `SELECT s.id, s.username, s.usertype, s.emp_objid, s.status,
              u.id AS usertype_id, u.typename
       FROM sysusers s
       LEFT JOIN usertypes u ON s.usertype = u.id
       WHERE s.emp_objid = ? AND s.status = 1 
       LIMIT 1`,
      [finalEmpObjId]
    );

    if (!sysUserRows || sysUserRows.length === 0) {
      return res.status(404).json({
        message: 'No active admin account found. Admin account must have status = 1.'
      });
    }

    const sysUser = sysUserRows[0];

    // Build admin user object (similar to login function)
    const adminUser = {
      USERID: sysUser.id,
      BADGENUMBER: sysUser.username,
      NAME: sysUser.username, // Will be updated if employee record exists
      privilege: sysUser.usertype || 0,
      PHOTO: null,
      TITLE: sysUser.typename || 'Administrator',
      usertype: sysUser.usertype,
      typename: sysUser.typename,
      emp_objid: sysUser.emp_objid
    };

    // Try to load photo from sysusers.photo
    try {
      const [photoRows] = await hr201Pool.execute(
        'SELECT photo FROM sysusers WHERE id = ? LIMIT 1',
        [sysUser.id]
      );
      if (photoRows.length > 0 && photoRows[0].photo) {
        try {
          const photoBlob = photoRows[0].photo;
          let photoBuffer;
          if (Buffer.isBuffer(photoBlob)) {
            photoBuffer = photoBlob;
          } else if (typeof photoBlob === 'string') {
            photoBuffer = Buffer.from(photoBlob);
          } else if (Array.isArray(photoBlob)) {
            photoBuffer = Buffer.from(photoBlob);
          } else {
            photoBuffer = Buffer.from(photoBlob);
          }
          
          if (photoBuffer.length > 0) {
            const photoBase64 = `data:image/png;base64,${photoBuffer.toString('base64')}`;
            adminUser.PHOTO = photoBase64;
          }
        } catch (photoError) {
          console.error('Error loading admin photo:', photoError.message);
          adminUser.PHOTO = null;
        }
      }
    } catch (photoQueryError) {
      console.error('Error querying sysusers.photo:', photoQueryError.message);
      adminUser.PHOTO = null;
    }

    // If admin has linked employee, fetch employee details
    if (sysUser.emp_objid) {
      try {
          const [empRows] = await hr201Pool.execute(
            `SELECT e.surname, e.firstname, e.middlename, e.extension, e.title
             FROM employees e
             WHERE e.objid = ? LIMIT 1`,
            [sysUser.emp_objid]
          );
          
          if (empRows.length > 0) {
            const emp = empRows[0];
            // Construct fullname from individual name parts
            const fullname = formatEmployeeNameUtil(
              emp.surname || '',
              emp.firstname || '',
              emp.middlename || '',
              emp.extension || ''
            );
            adminUser.NAME = fullname || sysUser.username;
            adminUser.TITLE = emp.title || sysUser.typename || 'Administrator';
          }
      } catch (empError) {
        console.log('Could not fetch employee details for admin:', empError.message);
      }
    }

    // Create admin token payload
    const adminTokenPayload = {
      USERID: adminUser.USERID,
      role: 'admin',
      authMethod: 'admin',
      isPortal: false,
      usertype: adminUser.usertype,
      emp_objid: adminUser.emp_objid,
      username: adminUser.BADGENUMBER
    };

    const adminToken = jwt.sign(
      adminTokenPayload,
      process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
      { expiresIn: '8h' }
    );

    // Convert photo to base64 if needed
    let photoData = null;
    if (adminUser.PHOTO) {
      if (typeof adminUser.PHOTO === 'string' && adminUser.PHOTO.startsWith('data:')) {
        photoData = adminUser.PHOTO;
      } else {
        try {
          const base64Photo = Buffer.from(adminUser.PHOTO).toString('base64');
          photoData = `data:image/jpeg;base64,${base64Photo}`;
        } catch (error) {
          console.error('Error converting admin photo:', error.message);
          photoData = null;
        }
      }
    }

    const adminUserResponse = {
      id: adminUser.USERID,
      username: adminUser.BADGENUMBER,
      employeeId: adminUser.USERID,
      role: 'admin',
      USERID: adminUser.USERID,
      NAME: adminUser.NAME,
      name: adminUser.NAME,
      TITLE: adminUser.TITLE,
      title: adminUser.TITLE,
      PHOTO: photoData,
      privilege: adminUser.privilege,
      usertype: adminUser.usertype,
      typename: adminUser.typename,
      emp_objid: adminUser.emp_objid
    };

    return res.json({
      success: true,
      token: adminToken,
      user: adminUserResponse,
      message: 'Admin session created successfully'
    });
  } catch (error) {
    console.error('Error creating admin session from portal:', error);
    return res.status(500).json({ 
      message: 'Unable to create admin session.', 
      error: error.message 
    });
  }
};

// POST /api/auth/biometric-login
export const biometricLogin = async (req, res) => {
  try {
    const { fingerprintData } = req.body;
    
    console.log('=== BIOMETRIC LOGIN ATTEMPT (Native SDK) ===');
    console.log('Fingerprint data:', fingerprintData);
    
    // Use DataStable for verification (more reliable than encrypted templates)
    const actualFingerprintData = fingerprintData?.DataStable || fingerprintData?.captureData || fingerprintData?.fingerprintData || fingerprintData;
    console.log('Fingerprint data length:', actualFingerprintData ? actualFingerprintData.length : 0);
    
    if (!fingerprintData) {
      return res.status(400).json({ 
        success: false,
        message: 'Fingerprint data is required' 
      });
    }

    // Check if DigitalPersona is enabled
    if (!ENABLE_DIGITALPERSONA || !digitalPersonaSDK) {
      return res.status(503).json({
        success: false,
        message: 'Biometric authentication service is disabled. Please use username and password login.',
        disabled: true
      });
    }

    // Check if native SDK is initialized
    if (!digitalPersonaSDK.isInitialized()) {
      console.log('🔧 Native SDK not initialized, attempting to initialize...');
      await digitalPersonaSDK.initialize();
    }

    const pool = getDb();
    
    // Get all fingerprint templates from FingerTemplates database
    const templatesResult = await pool.request().query(`
      SELECT 
        t.FUID,
        t.USERID,
        t.FINGERID,
        t.NAME as FINGER_NAME,
        t.FINGERTEMPLATE,
        t.FINGERIMAGE,
        t.CREATEDDATE,
        u.BADGENUMBER,
        u.NAME,
        u.privilege,
        u.PHOTO,
        u.TITLE,
        u.SSN
      FROM FingerTemplates t
      INNER JOIN USERINFO u ON t.USERID = u.USERID
      WHERE u.privilege != -1
        AND t.FINGERTEMPLATE IS NOT NULL
        AND DATALENGTH(t.FINGERTEMPLATE) > 0
      ORDER BY t.USERID, t.FINGERID
    `);
    
    const templates = templatesResult.recordset;
    console.log(`Found ${templates.length} valid fingerprint templates in FingerTemplates database`);
    
    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No fingerprint templates found in database'
      });
    }

    // Server-side fingerprint matching using native SDK
    let matchedUser = null;
    let bestScore = 0;
    
    for (const template of templates) {
      try {
        console.log(`🔍 Checking template for user ${template.USERID} (finger ${template.FINGERID})`);
        
        // Use the correct fingerprint data
        const capturedFmd = actualFingerprintData;
        
        // Parse the stored template from FingerTemplates table (FINGERTEMPLATE column)
        // Prefer EncryptedTemplate > DataStable > Data
        let storedTemplateData = template.FINGERTEMPLATE;
        let storedVerificationValue = null;
        try {
          // FINGERTEMPLATE is stored as binary data, convert to string first
          if (template.FINGERTEMPLATE && template.FINGERTEMPLATE.toString) {
            const templateString = template.FINGERTEMPLATE.toString('utf8');
            try {
              const parsedTemplate = JSON.parse(templateString);
              // Choose best available verification payload (prefer DataStable for consistency)
              if (parsedTemplate.DataStable) {
                storedVerificationValue = parsedTemplate.DataStable;
              } else if (parsedTemplate.Data) {
                storedVerificationValue = parsedTemplate.Data;
              } else if (parsedTemplate.EncryptedTemplate) {
                storedVerificationValue = `DP_ENCRYPTED_TEMPLATE_${parsedTemplate.EncryptedTemplate}`;
              } else {
                storedVerificationValue = templateString; // fallback raw
              }
              console.log(`📊 FINGERTEMPLATE data extracted for user ${template.USERID} (FUID: ${template.FUID}): ${storedVerificationValue.length} bytes`);
            } catch (parseError) {
              console.warn(`⚠️ FINGERTEMPLATE JSON parsing failed for user ${template.USERID}:`, parseError.message);
              storedVerificationValue = templateString;
            }
          }
        } catch (parseError) {
          console.log(`⚠️ Failed to parse FINGERTEMPLATE for user ${template.USERID}:`, parseError.message);
          continue;
        }
        
        console.log('🔐 Verifying fingerprint via PowerShell Win32 SDK...');
        console.log('🔧 Executing PowerShell command: powershell.exe -ExecutionPolicy Bypass -File "C:\\laragon\\www\\dtr-Checker-App2\\backend\\utils\\DigitalPersonaRealSDK.ps1" -Command "verify" -capturedFmd "' + capturedFmd + '" -storedFmd "' + storedVerificationValue + '"');
        
        const isMatch = ENABLE_DIGITALPERSONA && digitalPersonaSDK 
          ? await digitalPersonaSDK.verifyFingerprint(capturedFmd, storedVerificationValue)
          : false;
        
        if (isMatch) {
          console.log(`✅ Fingerprint match found for user ${template.USERID}`);
          matchedUser = template;
          break; // Found exact match, no need to continue
        } else {
          console.log(`❌ Fingerprint verification failed - NO MATCH`);
        }
      } catch (error) {
        console.log(`⚠️ Verification failed for user ${template.USERID}:`, error.message);
        // Continue checking other templates
      }
    }

    if (!matchedUser) {
      return res.status(401).json({
        success: false,
        message: 'Fingerprint not recognized'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { USERID: matchedUser.USERID, role: 'employee' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('✅ Biometric authentication successful for:', matchedUser.NAME);

    res.json({
      success: true,
      message: 'Biometric authentication successful',
      token,
      user: {
        USERID: matchedUser.USERID,
        BADGENUMBER: matchedUser.BADGENUMBER,
        NAME: matchedUser.NAME,
        privilege: matchedUser.privilege,
        PHOTO: matchedUser.PHOTO,
        TITLE: matchedUser.TITLE,
        SSN: matchedUser.SSN
      }
    });

  } catch (error) {
    console.error('Biometric login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during biometric authentication',
      error: error.message 
    });
  }
};

// POST /api/auth/biometric-login-direct
// Direct PowerShell biometric login - captures fingerprint and verifies against SQL Server
export const biometricLoginDirect = async (req, res) => {
  try {
    // Check if DigitalPersona is enabled
    if (!ENABLE_DIGITALPERSONA) {
      return res.status(503).json({
        success: false,
        message: 'Biometric authentication service is disabled. Please use username and password login.',
        disabled: true,
        authenticated: false
      });
    }

    // Generate unique session ID for this login attempt
    const loginSessionId = crypto.randomBytes(16).toString('hex');
    const loginTimestamp = new Date().toISOString();
    
    console.log('=== DIRECT BIOMETRIC LOGIN (DPFP.Gui SDK) ===');
    console.log('🆔 Login Session ID:', loginSessionId);
    console.log('⏰ Timestamp:', loginTimestamp);
    console.log('🔒 NEW CAPTURE REQUIRED - Previous results are invalid');
    console.log('Initiating fingerprint capture and verification...');
    
    // Fetch all enrolled templates from database
    const pool = getDb();
    const templatesResult = await pool.request().query(`
      SELECT 
        ft.USERID,
        ft.FINGERID,
        u.NAME,
        ft.FINGERTEMPLATE
      FROM FingerTemplates ft
      INNER JOIN USERINFO u ON ft.USERID = u.USERID
      WHERE ft.FINGERTEMPLATE IS NOT NULL
        AND LEN(ft.FINGERTEMPLATE) > 0
        AND u.privilege != -1
    `);
    
    if (templatesResult.recordset.length === 0) {
      console.log('❌ No fingerprint templates found in database');
      return res.status(404).json({
        success: false,
        message: 'No fingerprint templates enrolled in the system',
        authenticated: false,
        errorType: 'no_templates_enrolled'
      });
    }
    
    console.log(`📋 Loaded ${templatesResult.recordset.length} enrolled templates`);
    
    // Prepare templates for verification
    const templates = templatesResult.recordset.map(row => ({
      userId: row.USERID.toString(),
      fingerId: row.FINGERID.toString(),
      name: row.NAME,
      templateBase64: Buffer.from(row.FINGERTEMPLATE).toString('base64')
    }));
    
    console.log('🚀 Starting DPFP.Gui fingerprint verification...');
    console.log('⏳ Place your finger on the scanner...');
    
    // Initialize BiometricGuiHelper
    const guiHelper = new BiometricGuiHelper();
    
    // Execute DPFP.Gui verification (opens verification window)
    const verificationResult = await guiHelper.verifyFingerprint(templates);
    
    if (!verificationResult.success || !verificationResult.authenticated) {
      console.log('❌ Authentication failed:', verificationResult.message);
      
      // Determine appropriate status code and error type
      let statusCode = 401; // Default: Unauthorized
      let errorType = 'authentication_failed';
      
      if (verificationResult.message?.includes('Timeout')) {
        statusCode = 400; // Bad Request - timeout
        errorType = 'verification_timeout';
        console.log('❌ Error type: Verification timeout');
      } else {
        console.log('❌ Error type: Fingerprint not recognized');
        errorType = 'not_recognized';
      }
      
      return res.status(statusCode).json({
        success: false,
        message: verificationResult.message || 'Authentication failed',
        authenticated: false,
        errorType: errorType
      });
    }
    
    // Fingerprint verified - get full user details
    console.log('✅ Fingerprint verified!');
    console.log('   User ID:', verificationResult.userId);
    console.log('   Finger ID:', verificationResult.fingerId);
    console.log('   Name:', verificationResult.name);
    
    const userResult = await pool.request()
      .input('userid', sql.Int, parseInt(verificationResult.userId))
      .query(`
        SELECT 
          USERID,
          BADGENUMBER,
          NAME,
          privilege,
          PHOTO,
          TITLE,
          SSN
        FROM USERINFO
        WHERE USERID = @userid AND privilege != -1
      `);
    
    if (userResult.recordset.length === 0) {
      console.log('❌ User not found in USERINFO table');
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive',
        authenticated: false
      });
    }
    
    const user = userResult.recordset[0];
    
    // Generate JWT token
    const token = jwt.sign(
      { USERID: user.USERID, role: 'employee' },
      process.env.JWT_SECRET || 'dtr-checker-app-secret-key-2024',
      { expiresIn: '1h' }
    );
    
    console.log('✅ Direct biometric authentication successful for:', user.NAME);
    console.log('   Session ID:', loginSessionId);
    console.log('   User ID:', user.USERID);
    console.log('   Finger ID:', verificationResult.fingerId);
    console.log('   Method:', verificationResult.method);
    console.log('   ✅ DPFP.Gui SDK verification successful');
    
    // Convert photo to base64 if exists
    let photoData = null;
    if (user.PHOTO) {
      try {
        if (Buffer.isBuffer(user.PHOTO)) {
          photoData = `data:image/jpeg;base64,${user.PHOTO.toString('base64')}`;
        } else if (typeof user.PHOTO === 'string') {
          photoData = user.PHOTO.startsWith('data:') ? user.PHOTO : `data:image/jpeg;base64,${user.PHOTO}`;
        }
      } catch (photoError) {
        console.warn('Failed to process photo:', photoError.message);
        photoData = null;
      }
    }
    
    res.json({
      success: true,
      message: 'Direct biometric authentication successful',
      authenticated: true,
      loginSessionId: loginSessionId, // Unique session ID for this login attempt
      loginTimestamp: loginTimestamp, // When this login occurred
      freshCapture: true, // Confirms this was a new capture, not cached
      token,
      user: {
        USERID: user.USERID,
        id: user.USERID,
        employeeId: user.USERID,
        BADGENUMBER: user.BADGENUMBER,
        username: user.BADGENUMBER,
        NAME: user.NAME,
        name: user.NAME,
        privilege: user.privilege,
        role: 'employee',
        PHOTO: photoData,
        TITLE: user.TITLE,
        title: user.TITLE,
        SSN: user.SSN
      },
      biometricInfo: {
        fingerId: verificationResult.fingerId,
        userName: verificationResult.name,
        verificationMethod: verificationResult.method || 'dpfp_gui_sdk',
        loginSessionId: loginSessionId,
        loginTimestamp: loginTimestamp
      }
    });
    
  } catch (error) {
    console.error('Direct biometric login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during direct biometric authentication',
      authenticated: false,
      error: error.message 
    });
  }
};

// GET /api/auth/digitalpersona-status
export const getDigitalPersonaStatus = async (req, res) => {
  try {
    if (!ENABLE_DIGITALPERSONA || !digitalPersonaSDK) {
      return res.json({
        success: false,
        initialized: false,
        deviceConnected: false,
        devices: [],
        message: 'DigitalPersona service is disabled',
        disabled: true
      });
    }

    console.log('🔍 Checking DigitalPersona status...');
    
    if (!digitalPersonaSDK.isInitialized()) {
      console.log('🔧 Native SDK not initialized, attempting to initialize...');
      await digitalPersonaSDK.initialize();
    }
    
    const deviceInfo = await digitalPersonaSDK.getDeviceInfo();
    
    res.json({
      success: true,
      initialized: digitalPersonaSDK.isInitialized(),
      deviceConnected: digitalPersonaSDK.isDeviceConnected(),
      devices: deviceInfo || [],
      message: 'DigitalPersona Native SDK status retrieved successfully',
      fallbackMode: false
    });
  } catch (error) {
    console.error('DigitalPersona status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check DigitalPersona status',
      error: error.message
    });
  }
};

// GET /api/auth/digitalpersona-devices
export const getDigitalPersonaDevices = async (req, res) => {
  try {
    if (!ENABLE_DIGITALPERSONA || !digitalPersonaSDK) {
      return res.json({
        success: false,
        devices: [],
        deviceCount: 0,
        message: 'DigitalPersona service is disabled',
        disabled: true
      });
    }

    console.log('🔍 Getting DigitalPersona devices...');
    
    if (!digitalPersonaSDK.isInitialized()) {
      console.log('🔧 Java SDK not initialized, attempting to initialize...');
      await digitalPersonaSDK.initialize();
    }
    
    const devices = await digitalPersonaSDK.getDevices();
    
    res.json({
      success: true,
      devices: devices || [],
      deviceCount: devices ? devices.length : 0,
      message: 'DigitalPersona devices retrieved successfully'
    });
  } catch (error) {
    console.error('DigitalPersona devices retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get DigitalPersona devices',
      error: error.message,
      devices: []
    });
  }
};

// POST /api/auth/capture-fingerprint
export const captureFingerprint = async (req, res) => {
  try {
    if (!ENABLE_DIGITALPERSONA || !digitalPersonaSDK) {
      return res.status(503).json({
        success: false,
        message: 'DigitalPersona service is disabled',
        disabled: true,
        fingerprintData: null
      });
    }

    const { timeout = 30000 } = req.body;
    
    console.log('📸 Capturing fingerprint via Java SDK...');
    
    if (!digitalPersonaSDK.isInitialized()) {
      console.log('🔧 Java SDK not initialized, attempting to initialize...');
      await digitalPersonaSDK.initialize();
    }
    
    const fingerprintData = await digitalPersonaSDK.captureFingerprint(timeout);
    
    if (fingerprintData && fingerprintData.status === 'success') {
      const response = {
        success: true,
        fingerprintData: fingerprintData,
        message: fingerprintData.message || 'Fingerprint captured successfully',
        deviceConnected: digitalPersonaSDK?.isDeviceConnected() || false,
        deviceCount: digitalPersonaSDK?.getDeviceInfo()?.ReaderCount || 0
      };
      
      // Add special handling for simulated/fallback responses
      if (fingerprintData.isSimulated || fingerprintData.isFallback) {
        response.isSimulated = true;
        response.note = fingerprintData.note || 'This is a simulated response to avoid native library crashes';
        response.deviceName = fingerprintData.deviceName;
        console.log('📝 Returning simulated fingerprint response:', response.note);
      }
      
      res.json(response);
    } else if (fingerprintData && fingerprintData.status === 'no_finger') {
      // Handle "no finger detected" as a normal response, not an error
      console.log('🔍 No finger detected - returning normal response');
      const response = {
        success: false,
        fingerprintData: fingerprintData,
        message: fingerprintData.message || 'No finger detected on scanner',
        deviceConnected: digitalPersonaSDK?.isDeviceConnected() || false,
        deviceCount: digitalPersonaSDK?.getDeviceInfo()?.ReaderCount || 0,
        requiresFinger: true,
        status: 'no_finger'
      };
      
      res.json(response);
    } else {
      throw new Error(fingerprintData?.message || 'Fingerprint capture failed');
    }
  } catch (error) {
    console.error('❌ Fingerprint capture error:', error);
    
    // Provide more detailed error information
    const errorResponse = {
      success: false,
      message: 'Fingerprint capture failed',
      error: error.message,
      deviceConnected: digitalPersonaSDK.isDeviceConnected(),
      deviceCount: digitalPersonaSDK.getDeviceInfo().ReaderCount
    };
    
    // Add specific handling for native library crashes
    if (error.message.includes('EXCEPTION_ACCESS_VIOLATION') || error.message.includes('Command failed')) {
      errorResponse.nativeLibraryIssue = true;
      errorResponse.suggestion = 'DigitalPersona native library encountered an issue. The device is detected but capture operations are unstable.';
    }
    
    res.status(500).json(errorResponse);
  }
};

// POST /api/auth/verify-fingerprint
export const verifyFingerprint = async (req, res) => {
  try {
    // Check if DigitalPersona is enabled
    if (!ENABLE_DIGITALPERSONA) {
      return res.status(503).json({
        success: false,
        message: 'Biometric authentication service is disabled. Please use username and password login.',
        disabled: true
      });
    }

    const { userId, fingerprintData, matchResult } = req.body;
    
    console.log('=== FINGERPRINT VERIFICATION ===');
    console.log('User ID:', userId);
    console.log('Match result:', matchResult);
    
    if (!userId || !matchResult) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID and match result are required' 
      });
    }

    // If fingerprint matched on client side, authenticate the user
    if (matchResult.matched) {
      const pool = getDb();
      
      const userResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT 
            USERID,
            BADGENUMBER,
            NAME,
            privilege,
            PHOTO,
            TITLE,
            SSN
          FROM USERINFO
          WHERE USERID = @userId AND privilege != -1
        `);
      
      if (userResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      const user = userResult.recordset[0];
      
      // Convert photo to base64 if it exists
      let photoData = null;
      if (user.PHOTO) {
        try {
          const base64Photo = Buffer.from(user.PHOTO).toString('base64');
          photoData = `data:image/jpeg;base64,${base64Photo}`;
        } catch (error) {
          photoData = null;
        }
      }

      // Generate JWT token (employee role only for biometric login)
      const token = jwt.sign(
        { USERID: user.USERID, role: 'employee' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      console.log('✅ Biometric authentication successful for:', user.NAME);

      res.json({
        success: true,
        message: 'Biometric login successful',
        token,
        user: {
          id: user.USERID,
          username: user.BADGENUMBER,
          employeeId: user.USERID,
          role: 'employee',
          USERID: user.USERID,
          NAME: user.NAME,
          name: user.NAME,
          TITLE: user.TITLE,
          title: user.TITLE,
          PHOTO: photoData,
          privilege: user.privilege
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Fingerprint does not match'
      });
    }

  } catch (error) {
    console.error('Fingerprint verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during fingerprint verification',
      error: error.message
    });
  }
};

// Replace the current verifyBiometric function with this updated version for new SDK
export const verifyBiometric = async (req, res) => {
  try {
    const { fingerprintData, format } = req.body;
    
    console.log('=== BIOMETRIC VERIFICATION ===');
    console.log('Format:', format || 'auto-detect');
    console.log('Fingerprint data type:', typeof fingerprintData);
    console.log('Fingerprint data keys:', fingerprintData ? Object.keys(fingerprintData) : 'null');
    
    if (!fingerprintData) {
      return res.status(400).json({ 
        success: false,
        message: 'Fingerprint data is required' 
      });
    }

    // Handle different data formats from the new DigitalPersona SDK
    let capturedFMD;
    
    if (typeof fingerprintData === 'string') {
      try {
        capturedFMD = JSON.parse(fingerprintData);
      } catch (e) {
        // If it's not JSON, treat as raw fingerprint data
        capturedFMD = {
          Data: fingerprintData,
          Header: 'DigitalPersona_Raw',
          Format: 'DigitalPersona_WebSDK',
          Quality: 85,
          Size: fingerprintData.length
        };
      }
    } else if (fingerprintData && typeof fingerprintData === 'object') {
      // Check if it's already in the expected format
      if (fingerprintData.Data && fingerprintData.Header) {
        capturedFMD = fingerprintData;
        console.log('✅ Data already in expected FMD format');
      } else {
        // Handle new SDK format - convert to expected format
        console.log('🔄 Converting new SDK format to expected FMD format');
        
        // The new SDK might return data in different field names
        let data = null;
        let header = 'DigitalPersona_WebSDK';
        let quality = 85;
        let size = 0;
        
        // Try different possible field names from the new SDK
        if (fingerprintData.samples) {
          data = fingerprintData.samples;
        } else if (fingerprintData.data) {
          data = fingerprintData.data;
        } else if (fingerprintData.fingerprint) {
          data = fingerprintData.fingerprint;
        } else if (fingerprintData.template) {
          data = fingerprintData.template;
        } else if (typeof fingerprintData === 'string') {
          data = fingerprintData;
        } else {
          // Try to extract data from the object
          const possibleDataFields = ['value', 'content', 'raw', 'bytes', 'buffer'];
          for (const field of possibleDataFields) {
            if (fingerprintData[field]) {
              data = fingerprintData[field];
              break;
            }
          }
        }
        
        // Extract quality if available
        if (fingerprintData.quality) {
          quality = fingerprintData.quality;
        } else if (fingerprintData.score) {
          quality = fingerprintData.score;
        }
        
        // Extract size
        if (data) {
          size = typeof data === 'string' ? data.length : JSON.stringify(data).length;
        }
        
        if (!data) {
          console.log('❌ Could not extract fingerprint data from SDK response');
          return res.status(400).json({
            success: false,
            message: 'Invalid fingerprint data - no data found in SDK response'
          });
        }
        
        capturedFMD = {
          Data: data,
          Header: header,
          Format: 'DigitalPersona_WebSDK',
          Quality: quality,
          Size: size
        };
        
        console.log('✅ Converted SDK data to FMD format');
        console.log('   Data type:', typeof data);
        console.log('   Data length:', typeof data === 'string' ? data.length : 'object');
        console.log('   Quality:', quality);
        console.log('   Size:', size);
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid fingerprint data type'
      });
    }

    // Validate the converted FMD
    if (!capturedFMD.Data) {
      return res.status(400).json({
        success: false,
        message: 'Invalid FMD structure - missing Data field'
      });
    }

    console.log('✅ Valid captured FMD, Data type:', typeof capturedFMD.Data);
    console.log('✅ Data length:', typeof capturedFMD.Data === 'string' ? capturedFMD.Data.length : 'object');

    // Validate captured fingerprint quality
    const dataLength = typeof capturedFMD.Data === 'string' ? capturedFMD.Data.length : JSON.stringify(capturedFMD.Data).length;
    
    if (dataLength < 50) {
      console.log('🚨 SECURITY: Captured fingerprint data too short');
      return res.status(400).json({
        success: false,
        message: 'Invalid fingerprint quality - data too short',
        securityRejected: true
      });
    }

    if (dataLength > 5000) {
      console.log('🚨 SECURITY: Captured fingerprint data too long');
      return res.status(400).json({
        success: false,
        message: 'Invalid fingerprint quality - data too long',
        securityRejected: true
      });
    }

    const pool = getDb();
    
    // Get all fingerprint templates from FingerTemplates table
    const templatesResult = await pool.request().query(`
      SELECT 
        t.FUID,
        t.USERID,
        t.FINGERID,
        t.NAME as FINGER_NAME,
        t.FINGERTEMPLATE,
        t.FINGERIMAGE,
        t.CREATEDDATE,
        u.BADGENUMBER,
        u.NAME,
        u.privilege,
        u.PHOTO,
        u.TITLE,
        u.SSN
      FROM FingerTemplates t
      INNER JOIN USERINFO u ON t.USERID = u.USERID
      WHERE u.privilege != -1
        AND t.FINGERTEMPLATE IS NOT NULL
        AND DATALENGTH(t.FINGERTEMPLATE) > 0
      ORDER BY t.USERID, t.FINGERID
    `);
    
    const templates = templatesResult.recordset;
    console.log(`Found ${templates.length} fingerprint records for matching in FingerTemplates`);
    
    if (templates.length === 0) {
      console.log('🚨 SECURITY: No enrolled fingerprints found in database');
      return res.status(404).json({
        success: false,
        message: 'No enrolled fingerprints found.',
        securityRejected: true
      });
    }

    // Group templates by user and prepare for matching
    const templatesByUser = {};
    
    for (const template of templates) {
      if (!templatesByUser[template.USERID]) {
        templatesByUser[template.USERID] = {
          USERID: template.USERID,
          BADGENUMBER: template.BADGENUMBER,
          NAME: template.NAME,
          privilege: template.privilege,
          PHOTO: template.PHOTO,
          TITLE: template.TITLE,
          SSN: template.SSN,
          templates: []
        };
      }
      
      // Process FINGERTEMPLATE from FingerTemplates table
      let storedFMD = template.FINGERTEMPLATE;
      
      if (!storedFMD) continue; // Skip null templates
      
      if (Buffer.isBuffer(storedFMD)) {
        storedFMD = storedFMD.toString('utf8');
      }
      
      try {
        if (typeof storedFMD === 'string') {
          if (storedFMD.startsWith('iVBORw0KGg')) {
            console.log(`⚠️ User ${template.NAME} Finger ${template.FINGERID}: Old PNG format, skipping`);
            continue;
          }
          
          const parsedFMD = JSON.parse(storedFMD);
          
          if ((parsedFMD.Data || parsedFMD.DataStable) && parsedFMD.Header) {
            templatesByUser[template.USERID].templates.push({
              FINGERID: template.FINGERID,
              FUID: template.FUID,
              FMD: parsedFMD,
              SOURCE: 'FINGERTEMPLATE',
              CREATEDDATE: template.CREATEDDATE
            });
          }
        }
      } catch (parseError) {
        console.log(`⚠️ Could not parse fingerprint template for user ${template.NAME}:`, parseError.message);
      }
    }

    const templatesCount = Object.keys(templatesByUser).length;

    return res.status(200).json({
        success: false,
      message: 'Fingerprint matching not yet implemented for verifyBiometric.',
      templatesCount
    });
        } catch (error) {
    console.error('verifyBiometric error:', error);
    return res.status(500).json({
          success: false,
      message: 'Server error during biometric verification',
      error: error.message 
    });
  }
};