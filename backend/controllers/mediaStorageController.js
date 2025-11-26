import fs from 'fs/promises';
import path from 'path';
import { getHR201Pool } from '../config/hr201Database.js';
import { refreshMediaPaths } from '../config/uploadsConfig.js';

export const getMediaStorageConfig = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM media_path LIMIT 1');
    
    if (rows.length === 0) {
      // Return default config if no record exists
      return res.json({
        success: true,
        data: {
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
    }
    
    // Add base_path to the response for frontend compatibility
    const data = rows[0];
    data.base_path = path.join(process.cwd(), 'uploads'); // Default base path
    
    res.json({ success: true, data });
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
