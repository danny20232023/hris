import fs from 'fs/promises';
import path from 'path';
import { getHR201Pool } from '../config/hr201Database.js';
import { refreshMediaPaths } from '../config/uploadsConfig.js';
import { testSmbConnection } from '../utils/networkShareTest.js';
import crypto from 'crypto';

export const getMediaStorageConfig = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    // Get network share config directly
    let networkShare = null;
    try {
      const [tables] = await pool.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'network_FSC'
      `);
      
      if (tables.length > 0) {
        const [networkRows] = await pool.execute('SELECT * FROM network_FSC LIMIT 1');
        if (networkRows.length > 0) {
          networkShare = {
            ...networkRows[0],
            password: networkRows[0].password ? '***HIDDEN***' : ''
          };
        }
      }
    } catch (error) {
      console.warn('Could not fetch network share config:', error.message);
    }
    
    // Get all folders
    const [folderRows] = await pool.execute('SELECT * FROM media_path ORDER BY pathid');
    
    // Legacy compatibility: return old structure if needed
    // For now, return new structure with network share and folders
    res.json({
      success: true,
      data: {
        networkShare: networkShare,
        folders: folderRows,
        // Legacy fields for backward compatibility
        base_path: path.join(process.cwd(), 'uploads'),
        photopath: '',
        signaturepath: '',
        thumbpath: '',
        educationpath: '',
        cscpath: '',
        workcertpath: '',
        certificatepath: '',
        leavepath: ''
      }
    });
  } catch (error) {
    console.error('Error fetching media storage config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateMediaStorageConfig = async (req, res) => {
  try {
    const { base_path, photopath, signaturepath, thumbpath, educationpath, 
            cscpath, workcertpath, certificatepath, leavepath } = req.body;
    
    const pool = getHR201Pool();
    
    // Construct complete paths by combining base_path with folder names
    const basePath = base_path || path.join(process.cwd(), 'uploads');
    
    const completePaths = {
      photopath: photopath ? (photopath.includes('\\') || photopath.includes('/') ? photopath : path.join(basePath, photopath)) : null,
      signaturepath: signaturepath ? (signaturepath.includes('\\') || signaturepath.includes('/') ? signaturepath : path.join(basePath, signaturepath)) : null,
      thumbpath: thumbpath ? (thumbpath.includes('\\') || thumbpath.includes('/') ? thumbpath : path.join(basePath, thumbpath)) : null,
      educationpath: educationpath ? (educationpath.includes('\\') || educationpath.includes('/') ? educationpath : path.join(basePath, educationpath)) : null,
      cscpath: cscpath ? (cscpath.includes('\\') || cscpath.includes('/') ? cscpath : path.join(basePath, cscpath)) : null,
      workcertpath: workcertpath ? (workcertpath.includes('\\') || workcertpath.includes('/') ? workcertpath : path.join(basePath, workcertpath)) : null,
      certificatepath: certificatepath ? (certificatepath.includes('\\') || certificatepath.includes('/') ? certificatepath : path.join(basePath, certificatepath)) : null,
      leavepath: leavepath ? (leavepath.includes('\\') || leavepath.includes('/') ? leavepath : path.join(basePath, leavepath)) : null
    };
    
    console.log('💾 Saving complete paths to database:', completePaths);
    
    // Check if record exists (using pathid as primary key)
    const [existing] = await pool.execute('SELECT pathid FROM media_path LIMIT 1');
    
    if (existing.length === 0) {
      // Insert new record (only one record should exist)
      await pool.execute(`
        INSERT INTO media_path 
        (photopath, signaturepath, thumbpath, educationpath, 
         cscpath, workcertpath, certificatepath, leavepath)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        completePaths.photopath,
        completePaths.signaturepath,
        completePaths.thumbpath,
        completePaths.educationpath,
        completePaths.cscpath,
        completePaths.workcertpath,
        completePaths.certificatepath,
        completePaths.leavepath
      ]);
      
      console.log('✅ Created new media_path configuration record with complete paths');
    } else {
      // Update existing record (replace the single settings record)
      await pool.execute(`
        UPDATE media_path SET 
          photopath=?, signaturepath=?, thumbpath=?, 
          educationpath=?, cscpath=?, workcertpath=?, certificatepath=?, leavepath=?
        WHERE pathid=?
      `, [
        completePaths.photopath,
        completePaths.signaturepath,
        completePaths.thumbpath,
        completePaths.educationpath,
        completePaths.cscpath,
        completePaths.workcertpath,
        completePaths.certificatepath,
        completePaths.leavepath,
        existing[0].pathid
      ]);
      
      console.log('✅ Updated existing media_path configuration record with complete paths');
    }
    
    // Refresh in-memory paths
    await refreshMediaPaths();
    
    res.json({ success: true, message: 'Media storage paths updated successfully' });
  } catch (error) {
    console.error('Error updating media storage config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const validateMediaPath = async (req, res) => {
  try {
    const { path: pathToValidate, type, basePath } = req.body;
    
    console.log(`🔍 Validating path: "${pathToValidate}" for type: ${type}`);
    console.log(`📁 Base path: "${basePath}"`);
    
    if (!pathToValidate) {
      console.log('❌ Path is empty');
      return res.json({ success: true, valid: false, message: 'Path is empty' });
    }
    
    // Construct the full path: basePath + pathToValidate
    let fullPath = pathToValidate;
    
    // If pathToValidate is just a folder name (no full path), combine with basePath
    if (basePath && !pathToValidate.includes('\\') && !pathToValidate.includes('/')) {
      fullPath = path.join(basePath, pathToValidate);
      console.log(`🔗 Constructed full path: "${fullPath}"`);
    } else if (basePath && !pathToValidate.startsWith(basePath)) {
      // If pathToValidate doesn't start with basePath, combine them
      fullPath = path.join(basePath, pathToValidate);
      console.log(`🔗 Constructed full path: "${fullPath}"`);
    }
    
    // Check if path exists
    try {
      console.log('📁 Checking if path exists...');
      await fs.access(fullPath);
      console.log('✅ Path exists');
      
      // Check if writable
      console.log('✍️ Checking if path is writable...');
      await fs.access(fullPath, fs.constants.W_OK);
      console.log('✅ Path is writable');
      
      res.json({ 
        success: true, 
        valid: true, 
        message: `Path "${fullPath}" is valid and writable` 
      });
    } catch (error) {
      console.log(`❌ Path validation failed:`, error);
      
      if (error.code === 'ENOENT') {
        console.log('❌ Path does not exist');
        res.json({ 
          success: true, 
          valid: false, 
          message: `Path "${fullPath}" does not exist` 
        });
      } else if (error.code === 'EACCES') {
        console.log('❌ Path exists but is not writable');
        res.json({ 
          success: true, 
          valid: false, 
          message: `Path "${fullPath}" exists but is not writable` 
        });
      } else {
        console.log(`❌ Other error: ${error.message}`);
        res.json({ 
          success: true, 
          valid: false, 
          message: `Error: ${error.message}` 
        });
      }
    }
  } catch (error) {
    console.error('❌ Error validating media path:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// Network Share Configuration Functions
// ============================================

/**
 * Simple encryption/decryption for passwords
 * In production, use a proper encryption library
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (key) {
    // Validate key is valid hex and at least 64 chars (32 bytes)
    if (key.length >= 64 && /^[0-9a-fA-F]+$/.test(key)) {
      return key.slice(0, 64); // Use first 64 hex chars (32 bytes)
    } else {
      console.warn('⚠️ ENCRYPTION_KEY is not valid hex or too short, generating new key');
    }
  }
  // Generate a key and warn (in production, this should be set in env)
  const generatedKey = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️ ENCRYPTION_KEY not set in environment. Generated key will change on restart!');
  console.warn('⚠️ Set ENCRYPTION_KEY in .env file for production use.');
  return generatedKey;
}

const ENCRYPTION_KEY = getEncryptionKey();
const ALGORITHM = 'aes-256-cbc';

function encryptPassword(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(16);
    const keyBuffer = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error('Invalid encryption key length');
    }
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Error encrypting password:', error);
    throw error;
  }
}

function decryptPassword(encryptedText) {
  if (!encryptedText) return null;
  
  try {
    // Check if the text is in the encrypted format (iv:encrypted)
    const parts = encryptedText.split(':');
    
    // If it doesn't have the colon separator, it might be plain text (backward compatibility)
    if (parts.length !== 2) {
      console.warn('⚠️ Password does not appear to be encrypted, treating as plain text');
      return encryptedText;
    }
    
    const ivHex = parts[0];
    const encrypted = parts[1];
    
    // Validate IV is valid hex and correct length (16 bytes = 32 hex chars)
    if (!ivHex || ivHex.length !== 32 || !/^[0-9a-fA-F]+$/.test(ivHex)) {
      console.warn('⚠️ Invalid IV format, treating password as plain text');
      return encryptedText;
    }
    
    // Validate encrypted part is valid hex
    if (!encrypted || !/^[0-9a-fA-F]+$/.test(encrypted)) {
      console.warn('⚠️ Invalid encrypted format, treating password as plain text');
      return encryptedText;
    }
    
    // Create IV buffer and validate it's exactly 16 bytes
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16) {
      console.warn(`⚠️ IV buffer length is ${iv.length} bytes, expected 16. Treating as plain text.`);
      return encryptedText;
    }
    
    // Create key buffer and validate it's exactly 32 bytes
    const keyBuffer = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    if (keyBuffer.length !== 32) {
      console.warn(`⚠️ Key buffer length is ${keyBuffer.length} bytes, expected 32. Treating as plain text.`);
      return encryptedText;
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // If decryption fails, check if it looks encrypted
    const looksEncrypted = encryptedText.includes(':') && encryptedText.split(':').length === 2;
    
    if (looksEncrypted) {
      // If it looks encrypted but we can't decrypt it, return null
      // This indicates the key has changed or the data is corrupted
      console.error('❌ Password decryption failed - password appears to be encrypted but cannot be decrypted:', error.message);
      console.error('❌ This usually means the ENCRYPTION_KEY has changed. User must re-enter the password.');
      return null;
    } else {
      // If it doesn't look encrypted, treat as plain text (backward compatibility)
      console.warn('⚠️ Password does not appear to be encrypted, treating as plain text');
      return encryptedText;
    }
  }
}

/**
 * Get network share configuration
 */
export const getNetworkShareConfig = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    // Check if network_FSC table exists
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'network_FSC'
    `);
    
    if (tables.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'Network share not configured'
      });
    }
    
    const [rows] = await pool.execute('SELECT * FROM network_FSC LIMIT 1');
    
    if (rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'Network share not configured'
      });
    }
    
    const config = rows[0];
    
    // Hide password in response
    const responseData = {
      ...config,
      password: config.password ? '***HIDDEN***' : ''
    };
    
    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Error fetching network share config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Save network share configuration
 */
export const saveNetworkShareConfig = async (req, res) => {
  try {
    const { server_ip, share_name, share_path, username, password, domain, is_enabled } = req.body;
    
    // Validate required fields
    if (!server_ip || !share_name || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: server_ip, share_name, username, password'
      });
    }
    
    const pool = getHR201Pool();
    
    // Check if network_FSC table exists, create if not
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'network_FSC'
    `);
    
    if (tables.length === 0) {
      // Create table
      await pool.execute(`
        CREATE TABLE network_FSC (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_ip VARCHAR(255) NOT NULL,
          share_name VARCHAR(255) NOT NULL,
          share_path VARCHAR(255) DEFAULT '',
          username VARCHAR(255) NOT NULL,
          password TEXT NOT NULL,
          domain VARCHAR(255) DEFAULT '',
          is_enabled BOOLEAN DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Created network_FSC table');
    }
    
    // Encrypt password
    const encryptedPassword = encryptPassword(password);
    
    // Check if record exists
    const [existing] = await pool.execute('SELECT id FROM network_FSC LIMIT 1');
    
    if (existing.length === 0) {
      // Insert new record
      await pool.execute(`
        INSERT INTO network_FSC 
        (server_ip, share_name, share_path, username, password, domain, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [server_ip, share_name, share_path || '', username, encryptedPassword, domain || '', is_enabled ? 1 : 0]);
      
      console.log('✅ Created new network share configuration');
    } else {
      // Update existing record
      // If password is ***HIDDEN***, don't update it
      if (password === '***HIDDEN***') {
        await pool.execute(`
          UPDATE network_FSC SET 
            server_ip=?, share_name=?, share_path=?, username=?, domain=?, is_enabled=?
          WHERE id=?
        `, [server_ip, share_name, share_path || '', username, domain || '', is_enabled ? 1 : 0, existing[0].id]);
      } else {
        await pool.execute(`
          UPDATE network_FSC SET 
            server_ip=?, share_name=?, share_path=?, username=?, password=?, domain=?, is_enabled=?
          WHERE id=?
        `, [server_ip, share_name, share_path || '', username, encryptedPassword, domain || '', is_enabled ? 1 : 0, existing[0].id]);
      }
      
      console.log('✅ Updated network share configuration');
    }
    
    res.json({ success: true, message: 'Network share configuration saved successfully' });
  } catch (error) {
    console.error('Error saving network share config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Test network share connection
 */
export const testNetworkShareConnection = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    // Get network share config
    const [rows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
    
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Network share not configured or disabled'
      });
    }
    
    const config = rows[0];
    
    // Decrypt password
    const decryptedPassword = decryptPassword(config.password);
    
    // Check if password decryption was successful
    if (!decryptedPassword || decryptedPassword === config.password) {
      // If decryption failed or returned the same value, it might be encrypted with a different key
      // or it's already plain text but we couldn't decrypt it
      const isEncryptedFormat = config.password && config.password.includes(':') && config.password.split(':').length === 2;
      
      if (isEncryptedFormat) {
        return res.status(400).json({
          success: false,
          message: 'Password decryption failed. This may happen if the encryption key has changed. Please re-enter the password and save the configuration again.'
        });
      }
      // If it's not in encrypted format, use it as-is (plain text)
    }
    
    // Test connection
    const result = await testSmbConnection(
      config.server_ip,
      config.share_name,
      config.username,
      decryptedPassword || config.password, // Fallback to original if decryption returned null
      config.domain || '',
      config.share_path || ''
    );
    
    res.json({
      success: result.success,
      message: result.message,
      details: result.details
    });
  } catch (error) {
    console.error('Error testing network share connection:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// Folder Management Functions
// ============================================

/**
 * Get all media folders
 */
export const getMediaFolders = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM media_path ORDER BY pathid');
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching media folders:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Add new media folder
 */
export const addMediaFolder = async (req, res) => {
  try {
    const { foldername, folderfor, mediapath } = req.body;
    
    if (!foldername || !folderfor) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: foldername, folderfor'
      });
    }
    
    const pool = getHR201Pool();
    
    // Construct mediapath if not provided
    let finalMediaPath = mediapath;
    
    if (!finalMediaPath) {
      // Get network share config to construct path
      const [networkRows] = await pool.execute('SELECT * FROM network_FSC WHERE is_enabled = 1 LIMIT 1');
      
      if (networkRows.length > 0) {
        const networkConfig = networkRows[0];
        const isWindows = process.platform === 'win32';
        
        if (isWindows) {
          const sharePath = networkConfig.share_path ? `${networkConfig.share_path}\\${foldername}` : foldername;
          finalMediaPath = `\\\\${networkConfig.server_ip}\\${networkConfig.share_name}\\${sharePath}`;
        } else {
          const sharePath = networkConfig.share_path ? `${networkConfig.share_path}/${foldername}` : foldername;
          const mountPoint = process.env.NETWORK_SHARE_MOUNT_POINT || '/mnt/hris';
          finalMediaPath = `${mountPoint}/${sharePath}`;
        }
      } else {
        // Fallback to local path
        finalMediaPath = path.join(process.cwd(), 'uploads', foldername);
      }
    }
    
    // Insert new folder
    const [result] = await pool.execute(`
      INSERT INTO media_path (foldername, folderfor, mediapath)
      VALUES (?, ?, ?)
    `, [foldername, folderfor, finalMediaPath]);
    
    // Refresh in-memory paths
    await refreshMediaPaths();
    
    // Get the created folder
    const [newFolder] = await pool.execute('SELECT * FROM media_path WHERE pathid = ?', [result.insertId]);
    
    res.json({
      success: true,
      message: 'Folder added successfully',
      data: newFolder[0]
    });
  } catch (error) {
    console.error('Error adding media folder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update media folder
 */
export const updateMediaFolder = async (req, res) => {
  try {
    const { pathid } = req.params;
    const { foldername, folderfor, mediapath } = req.body;
    
    if (!pathid) {
      return res.status(400).json({
        success: false,
        message: 'Missing pathid parameter'
      });
    }
    
    const pool = getHR201Pool();
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (foldername !== undefined) {
      updates.push('foldername = ?');
      values.push(foldername);
    }
    
    if (folderfor !== undefined) {
      updates.push('folderfor = ?');
      values.push(folderfor);
    }
    
    if (mediapath !== undefined) {
      updates.push('mediapath = ?');
      values.push(mediapath);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    values.push(pathid);
    
    await pool.execute(`
      UPDATE media_path SET ${updates.join(', ')}
      WHERE pathid = ?
    `, values);
    
    // Refresh in-memory paths
    await refreshMediaPaths();
    
    // Get updated folder
    const [updatedFolder] = await pool.execute('SELECT * FROM media_path WHERE pathid = ?', [pathid]);
    
    res.json({
      success: true,
      message: 'Folder updated successfully',
      data: updatedFolder[0]
    });
  } catch (error) {
    console.error('Error updating media folder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete media folder
 */
export const deleteMediaFolder = async (req, res) => {
  try {
    const { pathid } = req.params;
    
    if (!pathid) {
      return res.status(400).json({
        success: false,
        message: 'Missing pathid parameter'
      });
    }
    
    const pool = getHR201Pool();
    
    // Check if folder is in use (columns are now INT, so direct comparison works)
    const [inUse] = await pool.execute(`
      SELECT COUNT(*) as count FROM employees_media 
      WHERE signature_path = ? OR photo_path = ? OR thumb_path = ?
    `, [Number(pathid), Number(pathid), Number(pathid)]);
    
    if (inUse[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete folder: It is currently in use by ${inUse[0].count} employee record(s)`
      });
    }
    
    // Delete folder
    await pool.execute('DELETE FROM media_path WHERE pathid = ?', [pathid]);
    
    // Refresh in-memory paths
    await refreshMediaPaths();
    
    res.json({
      success: true,
      message: 'Folder deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting media folder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
