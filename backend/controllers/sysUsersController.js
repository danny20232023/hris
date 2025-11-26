import { getHR201Pool } from '../config/hr201Database.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';

// Configure multer for photo uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Helper function to process and compress photo to PNG format
// Target: Under 64KB for MEDIUMBLOB compatibility
const processUserPhoto = async (inputBuffer) => {
  const sharp = (await import('sharp')).default;
  const MAX_SIZE_KB = 64;
  const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;
  
  try {
    let width = 400;
    let height = 400;
    let compressionLevel = 9;
    
    let processedBuffer;
    let iterations = 0;
    const maxIterations = 10;
    
    const metadata = await sharp(inputBuffer).metadata();
    const aspectRatio = metadata.width / metadata.height;
    
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
      
      if (processedBuffer.length <= MAX_SIZE_BYTES) {
        return processedBuffer;
      }
      
      if (iterations < 3) {
        width = Math.round(width * 0.8);
        height = Math.round(height * 0.8);
      } else if (iterations < 6) {
        compressionLevel = Math.min(9, compressionLevel + 1);
      } else {
        width = Math.round(width * 0.9);
        height = Math.round(height * 0.9);
        compressionLevel = Math.min(9, compressionLevel + 1);
      }
      
      iterations++;
    }
    
    if (processedBuffer.length > MAX_SIZE_BYTES) {
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
    }
    
    return processedBuffer;
  } catch (error) {
    console.error('Error processing photo:', error);
    throw error;
  }
};

// ============================================
// SYSUSERS CRUD OPERATIONS
// ============================================

// GET /api/sys-users - List all system users (excluding Root Admin usertype = 1)
export const getSysUsers = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const [rows] = await pool.execute(
      `SELECT 
        s.id,
        s.username,
        s.usertype,
        s.emp_objid,
        s.status,
        s.photo,
        u.typename,
        e.surname,
        e.firstname,
        e.middlename
      FROM sysusers s
      LEFT JOIN usertypes u ON s.usertype = u.id
      LEFT JOIN employees e ON s.emp_objid = e.objid
      WHERE (s.usertype != 1 OR s.usertype IS NULL)
      ORDER BY s.username ASC`
    );
    
    // Convert photos to base64 if present
    const usersWithPhotos = rows.map((user) => {
      if (user.photo) {
        try {
          let photoBuffer;
          if (Buffer.isBuffer(user.photo)) {
            photoBuffer = user.photo;
          } else if (user.photo instanceof Uint8Array) {
            photoBuffer = Buffer.from(user.photo);
          } else {
            photoBuffer = Buffer.from(user.photo);
          }
          
          const photoBase64 = `data:image/png;base64,${photoBuffer.toString('base64')}`;
          return { ...user, photo: photoBase64 };
        } catch (error) {
          console.error('Error converting photo:', error);
          return { ...user, photo: null };
        }
      }
      return { ...user, photo: null };
    });
    
    res.json({
      success: true,
      data: usersWithPhotos
    });
  } catch (error) {
    console.error('Error fetching sysusers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system users',
      error: error.message
    });
  }
};

// GET /api/sys-users/:id - Get single system user
export const getSysUserById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      `SELECT 
        s.id,
        s.username,
        s.usertype,
        s.emp_objid,
        s.status,
        s.photo,
        u.typename,
        e.surname,
        e.firstname,
        e.middlename
      FROM sysusers s
      LEFT JOIN usertypes u ON s.usertype = u.id
      LEFT JOIN employees e ON s.emp_objid = e.objid
      WHERE s.id = ? AND (s.usertype != 1 OR s.usertype IS NULL)
      LIMIT 1`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    let user = rows[0];
    
    // Convert photo to base64 if present
    if (user.photo) {
      try {
        let photoBuffer;
        if (Buffer.isBuffer(user.photo)) {
          photoBuffer = user.photo;
        } else if (user.photo instanceof Uint8Array) {
          photoBuffer = Buffer.from(user.photo);
        } else {
          photoBuffer = Buffer.from(user.photo);
        }
        
        user.photo = `data:image/png;base64,${photoBuffer.toString('base64')}`;
      } catch (error) {
        console.error('Error converting photo:', error);
        user.photo = null;
      }
    } else {
      user.photo = null;
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching sysuser:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system user',
      error: error.message
    });
  }
};

// POST /api/sys-users - Create new system user
export const createSysUser = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { username, password, usertype, emp_objid, status = 1 } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    // Check if username already exists
    const [existingUsers] = await pool.execute(
      `SELECT id FROM sysusers WHERE username = ? LIMIT 1`,
      [username]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    
    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Handle photo upload if present
    let photoBuffer = null;
    if (req.file) {
      photoBuffer = await processUserPhoto(req.file.buffer);
    }
    
    // Insert user
    const insertQuery = photoBuffer
      ? `INSERT INTO sysusers (username, password, usertype, emp_objid, status, photo) 
         VALUES (?, ?, ?, ?, ?, ?)`
      : `INSERT INTO sysusers (username, password, usertype, emp_objid, status) 
         VALUES (?, ?, ?, ?, ?)`;
    
    const insertValues = photoBuffer
      ? [username, hashedPassword, usertype || null, emp_objid || null, status, photoBuffer]
      : [username, hashedPassword, usertype || null, emp_objid || null, status];
    
    const [result] = await pool.execute(insertQuery, insertValues);
    
    res.json({
      success: true,
      message: 'System user created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error creating sysuser:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create system user',
      error: error.message
    });
  }
};

// PUT /api/sys-users/:id - Update system user
export const updateSysUser = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { username, usertype, emp_objid, status } = req.body;
    
    // Check if user exists and is not Root Admin
    const [existingUser] = await pool.execute(
      `SELECT id, usertype FROM sysusers WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    if (existingUser[0].usertype === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify Root Admin user'
      });
    }
    
    // Check if username is being changed and if new username already exists
    if (username) {
      const [usernameCheck] = await pool.execute(
        `SELECT id FROM sysusers WHERE username = ? AND id != ? LIMIT 1`,
        [username, id]
      );
      
      if (usernameCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }
    }
    
    // Handle photo upload if present
    let photoBuffer = null;
    if (req.file) {
      photoBuffer = await processUserPhoto(req.file.buffer);
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (username) {
      updates.push('username = ?');
      values.push(username);
    }
    
    if (usertype !== undefined) {
      updates.push('usertype = ?');
      values.push(usertype || null);
    }
    
    if (emp_objid !== undefined) {
      updates.push('emp_objid = ?');
      values.push(emp_objid || null);
    }
    
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    
    if (photoBuffer) {
      updates.push('photo = ?');
      values.push(photoBuffer);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE sysusers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    res.json({
      success: true,
      message: 'System user updated successfully'
    });
  } catch (error) {
    console.error('Error updating sysuser:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system user',
      error: error.message
    });
  }
};

// POST /api/sys-users/:id/change-password - Change user password
export const changeSysUserPassword = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }
    
    // Check if user exists and is not Root Admin
    const [existingUser] = await pool.execute(
      `SELECT id, usertype FROM sysusers WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    if (existingUser[0].usertype === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot change Root Admin password through this interface'
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.execute(
      `UPDATE sysusers SET password = ? WHERE id = ?`,
      [hashedPassword, id]
    );
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

// DELETE /api/sys-users/:id - Delete system user
export const deleteSysUser = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    // Check if user exists and is not Root Admin
    const [existingUser] = await pool.execute(
      `SELECT id, usertype FROM sysusers WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    if (existingUser[0].usertype === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete Root Admin user'
      });
    }
    
    await pool.execute(
      `DELETE FROM sysusers WHERE id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      message: 'System user deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting sysuser:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete system user',
      error: error.message
    });
  }
};

// ============================================
// SYSCOMPONENTS CRUD OPERATIONS
// ============================================

// GET /api/sys-components - List all system components
export const getSysComponents = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const [rows] = await pool.execute(
      `SELECT id, componentgroup, componentname, panelmenuname, \`desc\` 
       FROM syscomponents 
       ORDER BY componentgroup ASC, componentname ASC`
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching syscomponents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system components',
      error: error.message
    });
  }
};

// GET /api/sys-components/:id - Get single component
export const getSysComponentById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      `SELECT id, componentname 
       FROM syscomponents 
       WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System component not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching syscomponent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system component',
      error: error.message
    });
  }
};

// POST /api/sys-components - Create new component
export const createSysComponent = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { componentname, componentgroup, panelmenuname, desc } = req.body;
    
    if (!componentname || !componentname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Component name is required'
      });
    }
    
    // Check if component name already exists
    const [existingComponents] = await pool.execute(
      `SELECT id FROM syscomponents WHERE componentname = ? LIMIT 1`,
      [componentname.trim()]
    );
    
    if (existingComponents.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Component name already exists'
      });
    }
    
    const [result] = await pool.execute(
      `INSERT INTO syscomponents (componentname, componentgroup, panelmenuname, \`desc\`) VALUES (?, ?, ?, ?)`,
      [
        componentname.trim(), 
        componentgroup || null, 
        panelmenuname || null, 
        desc || null
      ]
    );
    
    res.json({
      success: true,
      message: 'System component created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error creating syscomponent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create system component',
      error: error.message
    });
  }
};

// PUT /api/sys-components/:id - Update component
export const updateSysComponent = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { componentname, componentgroup, panelmenuname, desc } = req.body;
    
    if (!componentname || !componentname.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Component name is required'
      });
    }
    
    // Check if component exists
    const [existingComponent] = await pool.execute(
      `SELECT id FROM syscomponents WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (existingComponent.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System component not found'
      });
    }
    
    // Check if new component name already exists
    const [nameCheck] = await pool.execute(
      `SELECT id FROM syscomponents WHERE componentname = ? AND id != ? LIMIT 1`,
      [componentname.trim(), id]
    );
    
    if (nameCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Component name already exists'
      });
    }
    
    await pool.execute(
      `UPDATE syscomponents SET componentname = ?, componentgroup = ?, panelmenuname = ?, \`desc\` = ? WHERE id = ?`,
      [
        componentname.trim(), 
        componentgroup || null, 
        panelmenuname || null, 
        desc || null, 
        id
      ]
    );
    
    res.json({
      success: true,
      message: 'System component updated successfully'
    });
  } catch (error) {
    console.error('Error updating syscomponent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system component',
      error: error.message
    });
  }
};

// DELETE /api/sys-components/:id - Delete component
export const deleteSysComponent = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    // Check if component is being used in sysusers_roles
    const [usageCheck] = await pool.execute(
      `SELECT COUNT(*) as count FROM sysusers_roles WHERE component = ?`,
      [id]
    );
    
    if (usageCheck[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete component that is assigned to users'
      });
    }
    
    await pool.execute(
      `DELETE FROM syscomponents WHERE id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      message: 'System component deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting syscomponent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete system component',
      error: error.message
    });
  }
};

// ============================================
// USERTYPES CRUD OPERATIONS
// ============================================

// GET /api/user-types - List all user types
export const getUserTypes = async (req, res) => {
  try {
    const pool = getHR201Pool();
    
    const [rows] = await pool.execute(
      `SELECT id, typename 
       FROM usertypes 
       ORDER BY id ASC`
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching usertypes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user types',
      error: error.message
    });
  }
};

// GET /api/user-types/:id - Get single user type
export const getUserTypeById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      `SELECT id, typename 
       FROM usertypes 
       WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User type not found'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching usertype:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user type',
      error: error.message
    });
  }
};

// POST /api/user-types - Create new user type
export const createUserType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { typename } = req.body;
    
    if (!typename || !typename.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Type name is required'
      });
    }
    
    // Check if type name already exists
    const [existingTypes] = await pool.execute(
      `SELECT id FROM usertypes WHERE typename = ? LIMIT 1`,
      [typename.trim()]
    );
    
    if (existingTypes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User type name already exists'
      });
    }
    
    const [result] = await pool.execute(
      `INSERT INTO usertypes (typename) VALUES (?)`,
      [typename.trim()]
    );
    
    res.json({
      success: true,
      message: 'User type created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error creating usertype:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user type',
      error: error.message
    });
  }
};

// PUT /api/user-types/:id - Update user type
export const updateUserType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { typename } = req.body;
    
    if (!typename || !typename.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Type name is required'
      });
    }
    
    // Prevent updating Root Admin (id = 1)
    if (parseInt(id) === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify Root Admin user type'
      });
    }
    
    // Check if user type exists
    const [existingType] = await pool.execute(
      `SELECT id FROM usertypes WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (existingType.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User type not found'
      });
    }
    
    // Check if new type name already exists
    const [nameCheck] = await pool.execute(
      `SELECT id FROM usertypes WHERE typename = ? AND id != ? LIMIT 1`,
      [typename.trim(), id]
    );
    
    if (nameCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User type name already exists'
      });
    }
    
    await pool.execute(
      `UPDATE usertypes SET typename = ? WHERE id = ?`,
      [typename.trim(), id]
    );
    
    res.json({
      success: true,
      message: 'User type updated successfully'
    });
  } catch (error) {
    console.error('Error updating usertype:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user type',
      error: error.message
    });
  }
};

// DELETE /api/user-types/:id - Delete user type
export const deleteUserType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    // Prevent deleting Root Admin (id = 1)
    if (parseInt(id) === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete Root Admin user type'
      });
    }
    
    // Check if user type is being used in sysusers
    const [usageCheck] = await pool.execute(
      `SELECT COUNT(*) as count FROM sysusers WHERE usertype = ?`,
      [id]
    );
    
    if (usageCheck[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user type that is assigned to users'
      });
    }
    
    await pool.execute(
      `DELETE FROM usertypes WHERE id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      message: 'User type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting usertype:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user type',
      error: error.message
    });
  }
};

// ============================================
// SYSUSERS_ROLES CRUD OPERATIONS
// ============================================

// GET /api/sys-users-roles/user/:userId - Get all permissions for a user
export const getUserRolesByUserId = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { userId } = req.params;
    
    const [rows] = await pool.execute(
      `SELECT 
        sur.sysuderid,
        sur.component,
        sur.canaccesspage,
        sur.canread,
        sur.cancreate,
        sur.canupdate,
        sur.candelete,
        sur.canapprove,
        sur.canreturn,
        sur.cancancel,
        sur.canprint,
        sur.cansoftdelete,
        sc.componentname
      FROM sysusers_roles sur
      INNER JOIN syscomponents sc ON sur.component = sc.id
      WHERE sur.sysuderid = ?
      ORDER BY sc.componentname ASC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user roles',
      error: error.message
    });
  }
};

// GET /api/sys-users/user-roles-by-type/:usertypeid - Get all roles for a user type
export const getUserRolesByUserType = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { usertypeid } = req.params;
    
    const [rows] = await pool.execute(
      `SELECT 
        sur.id,
        sur.sysroleid,
        sur.component,
        sur.canaccesspage,
        sur.canapprove,
        sur.canreturn,
        sur.cancancel,
        sur.canprint,
        sur.canread,
        sur.cancreate,
        sur.canupdate,
        sur.candelete,
        sur.cansoftdelete,
        sc.id as component_id,
        sc.componentgroup,
        sc.componentname,
        sc.panelmenuname,
        sc.\`desc\` as component_desc
      FROM sysusers_roles sur
      INNER JOIN syscomponents sc ON sur.component = sc.id
      WHERE sur.sysroleid = ?
      ORDER BY sc.componentgroup, sc.componentname`,
      [usertypeid]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching user roles by type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user roles by type',
      error: error.message
    });
  }
};

// POST /api/sys-users-roles - Bulk assign/update permissions
export const bulkAssignUserRoles = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { userId, permissions } = req.body; // permissions: [{ componentId, canaccesspage, canread, cancreate, canupdate, candelete }, ...]
    
    if (!userId || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'User ID and permissions array are required'
      });
    }
    
    console.log('📝 [bulkAssignUserRoles] Received permissions:', {
      userId,
      permissionsCount: permissions.length,
      permissions: permissions.slice(0, 5) // Log first 5 for debugging
    });
    
    // Check if user exists and is not Root Admin
    const [existingUser] = await pool.execute(
      `SELECT id, usertype FROM sysusers WHERE id = ? LIMIT 1`,
      [userId]
    );
    
    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    if (existingUser[0].usertype === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify Root Admin permissions'
      });
    }
    
    // Filter permissions - only save those with at least one permission checked
    // OR if it's explicitly in the permissions array (even if all false, we want to track it)
    const permissionsToSave = permissions.filter(perm => perm.componentId);
    
    console.log('💾 [bulkAssignUserRoles] Total permissions to save:', permissionsToSave.length);
    console.log('💾 [bulkAssignUserRoles] Sample permissions:', JSON.stringify(permissionsToSave.slice(0, 3), null, 2));
    
    // Remove duplicates from permissionsToSave (same componentId)
    const uniquePermissions = [];
    const seenComponents = new Set();
    for (const perm of permissionsToSave) {
      if (!seenComponents.has(perm.componentId)) {
        seenComponents.add(perm.componentId);
        uniquePermissions.push(perm);
      } else {
        console.log(`⚠️ Duplicate component ${perm.componentId} found, skipping`);
      }
    }
    
    console.log(`📋 Processing ${uniquePermissions.length} unique components (removed ${permissionsToSave.length - uniquePermissions.length} duplicates)`);
    
    // Start transaction - use INSERT ... ON DUPLICATE KEY UPDATE approach
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Get list of component IDs that will be saved
      const componentsToKeep = uniquePermissions
        .filter(perm => perm.canaccesspage || perm.canread || perm.cancreate || perm.canupdate || perm.candelete)
        .map(perm => perm.componentId);
      
      console.log(`📝 Components to keep: ${componentsToKeep.length}`, componentsToKeep.slice(0, 10));
      
      // First, delete ALL existing permissions for this user to start fresh
      const [deleteAllResult] = await connection.execute(
        `DELETE FROM sysusers_roles WHERE sysuderid = ?`,
        [userId]
      );
      console.log(`🗑️ Deleted ${deleteAllResult.affectedRows} existing permissions for user ${userId} (starting fresh)`);
      
      // Use INSERT to add all new permissions
      let savedCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (const perm of uniquePermissions) {
        // Only save if at least one permission is checked
        if (perm.canaccesspage || perm.canread || perm.cancreate || perm.canupdate || perm.candelete) {
          try {
            const [result] = await connection.execute(
              `INSERT INTO sysusers_roles 
               (sysuderid, component, canaccesspage, canread, cancreate, canupdate, candelete) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                userId,
                perm.componentId,
                perm.canaccesspage ? 1 : 0,
                perm.canread ? 1 : 0,
                perm.cancreate ? 1 : 0,
                perm.canupdate ? 1 : 0,
                perm.candelete ? 1 : 0
              ]
            );
            savedCount++;
            console.log(`✅ Inserted permission for component ${perm.componentId} (${savedCount}/${componentsToKeep.length}) - Insert ID: ${result.insertId}, Affected rows: ${result.affectedRows}`);
          } catch (insertError) {
            errorCount++;
            errors.push({
              componentId: perm.componentId,
              error: insertError.message,
              code: insertError.code
            });
            console.error(`❌ Error inserting permission for component ${perm.componentId}:`, insertError.message);
            console.error(`❌ SQL Error Code:`, insertError.code);
            console.error(`❌ Full error:`, insertError);
            // Continue processing other components instead of stopping
          }
        } else {
          console.log(`⏭️ Skipping component ${perm.componentId} - no permissions checked`);
        }
      }
      
      // If there were errors but some succeeded, log warning but continue
      if (errorCount > 0) {
        console.warn(`⚠️ ${errorCount} components failed to save:`, errors);
        if (savedCount === 0) {
          // If nothing was saved and we have errors, throw the first error
          throw new Error(`Failed to save any permissions. First error: ${errors[0]?.error || 'Unknown error'}`);
        }
      }
      
      console.log(`✅ Total saved: ${savedCount} out of ${uniquePermissions.length} components processed`);
      if (errorCount > 0) {
        console.warn(`⚠️ ${errorCount} components had errors during save`);
      }
      
      // Verify what records exist before commit
      const [verifyBefore] = await connection.execute(
        `SELECT COUNT(*) as count FROM sysusers_roles WHERE sysuderid = ?`,
        [userId]
      );
      console.log(`🔍 Before commit: ${verifyBefore[0].count} records exist for user ${userId}`);
      
      await connection.commit();
      
      // Verify what records exist after commit
      const [verifyAfter] = await pool.execute(
        `SELECT COUNT(*) as count FROM sysusers_roles WHERE sysuderid = ?`,
        [userId]
      );
      console.log(`🔍 After commit: ${verifyAfter[0].count} records exist for user ${userId}`);
      
      // Also check for any unique constraint issues
      const [allRecords] = await pool.execute(
        `SELECT id, sysuderid, component FROM sysusers_roles WHERE sysuderid = ? ORDER BY component`,
        [userId]
      );
      console.log(`📊 All records for user ${userId}:`, allRecords.map(r => `id=${r.id}, component=${r.component}`));
      
      console.log(`✅ Transaction committed. Successfully saved ${savedCount} permissions for user ${userId}`);
      
      res.json({
        success: true,
        message: `User permissions updated successfully. ${savedCount} components saved${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
        savedCount,
        errorCount
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating user roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user roles',
      error: error.message
    });
  }
};

// POST /api/sys-users-roles/user-type - Create a single role for a user type
export const createUserTypeRole = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { sysroleid, component, canaccesspage, canapprove, canreturn, cancancel, canprint, canread, cancreate, canupdate, candelete, cansoftdelete } = req.body;
    
    if (!sysroleid || !component) {
      return res.status(400).json({
        success: false,
        message: 'User type ID and Component ID are required'
      });
    }

    // Check if user type exists and is not Root Admin
    const [userType] = await pool.execute(
      `SELECT id FROM usertypes WHERE id = ? LIMIT 1`,
      [sysroleid]
    );
    
    if (userType.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User type not found'
      });
    }

    if (userType[0].id === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify Root Admin roles'
      });
    }

    // Check for duplicate entry
    const [existing] = await pool.execute(
      `SELECT id FROM sysusers_roles WHERE sysroleid = ? AND component = ? LIMIT 1`,
      [sysroleid, component]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'This component is already assigned to this user type'
      });
    }

    // Check if component exists
    const [compCheck] = await pool.execute(
      `SELECT id FROM syscomponents WHERE id = ? LIMIT 1`,
      [component]
    );

    if (compCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Component not found'
      });
    }

    // Insert the role
    await pool.execute(
      `INSERT INTO sysusers_roles 
       (sysroleid, component, canaccesspage, canapprove, canreturn, cancancel, canprint, canread, cancreate, canupdate, candelete, cansoftdelete) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sysroleid,
        component,
        canaccesspage ? 1 : 0,
        canapprove ? 1 : 0,
        canreturn ? 1 : 0,
        cancancel ? 1 : 0,
        canprint ? 1 : 0,
        canread ? 1 : 0,
        cancreate ? 1 : 0,
        canupdate ? 1 : 0,
        candelete ? 1 : 0,
        cansoftdelete ? 1 : 0
      ]
    );

    res.json({
      success: true,
      message: 'Role added successfully'
    });
  } catch (error) {
    console.error('Error creating user type role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: error.message
    });
  }
};

// GET /api/sys-components/:id/controls - Get all controls for a component
export const getSysComponentControls = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    const [rows] = await pool.execute(
      `SELECT controlid, syscomponentid, controlname, displayname 
       FROM syscomponents_controls 
       WHERE syscomponentid = ? 
       ORDER BY controlname`,
      [id]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching component controls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch component controls',
      error: error.message
    });
  }
};

// POST /api/sys-components-controls - Create a new component control
export const createSysComponentControl = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { syscomponentid, controlname, displayname } = req.body;
    
    if (!syscomponentid || !controlname) {
      return res.status(400).json({
        success: false,
        message: 'Component ID and Control Name are required'
      });
    }
    
    // Check if control name already exists for this component
    const [existing] = await pool.execute(
      `SELECT controlid FROM syscomponents_controls 
       WHERE syscomponentid = ? AND controlname = ?`,
      [syscomponentid, controlname.trim()]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Control name already exists for this component'
      });
    }
    
    // Insert new control
    const [result] = await pool.execute(
      `INSERT INTO syscomponents_controls (syscomponentid, controlname, displayname) 
       VALUES (?, ?, ?)`,
      [syscomponentid, controlname.trim(), displayname?.trim() || null]
    );
    
    res.json({
      success: true,
      message: 'Control created successfully',
      data: {
        controlid: result.insertId,
        syscomponentid,
        controlname: controlname.trim(),
        displayname: displayname?.trim() || null
      }
    });
  } catch (error) {
    console.error('Error creating component control:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create component control',
      error: error.message
    });
  }
};

// PUT /api/sys-components-controls/:id - Update a component control
export const updateSysComponentControl = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { controlname, displayname } = req.body;
    
    if (!controlname) {
      return res.status(400).json({
        success: false,
        message: 'Control name is required'
      });
    }
    
    // Get the control to check its component
    const [control] = await pool.execute(
      `SELECT syscomponentid FROM syscomponents_controls WHERE controlid = ?`,
      [id]
    );
    
    if (control.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Control not found'
      });
    }
    
    const syscomponentid = control[0].syscomponentid;
    
    // Check if control name already exists for this component (excluding current control)
    const [existing] = await pool.execute(
      `SELECT controlid FROM syscomponents_controls 
       WHERE syscomponentid = ? AND controlname = ? AND controlid != ?`,
      [syscomponentid, controlname.trim(), id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Control name already exists for this component'
      });
    }
    
    // Update control
    await pool.execute(
      `UPDATE syscomponents_controls 
       SET controlname = ?, displayname = ? 
       WHERE controlid = ?`,
      [controlname.trim(), displayname?.trim() || null, id]
    );
    
    res.json({
      success: true,
      message: 'Control updated successfully',
      data: {
        controlid: parseInt(id),
        syscomponentid,
        controlname: controlname.trim(),
        displayname: displayname?.trim() || null
      }
    });
  } catch (error) {
    console.error('Error updating component control:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update component control',
      error: error.message
    });
  }
};

// DELETE /api/sys-components-controls/:id - Delete a component control
export const deleteSysComponentControl = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    
    // Check if control exists
    const [control] = await pool.execute(
      `SELECT controlid FROM syscomponents_controls WHERE controlid = ?`,
      [id]
    );
    
    if (control.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Control not found'
      });
    }
    
    // Delete control
    await pool.execute(
      `DELETE FROM syscomponents_controls WHERE controlid = ?`,
      [id]
    );
    
    res.json({
      success: true,
      message: 'Control deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting component control:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete component control',
      error: error.message
    });
  }
};

// DELETE /api/sys-users-roles - Delete user permission
export const deleteUserRole = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { userId, componentId, sysroleid } = req.query;
    
    // Support both user-specific roles (sysuderid) and user type roles (sysroleid)
    if (sysroleid && componentId) {
      // Delete user type role
      await pool.execute(
        `DELETE FROM sysusers_roles WHERE sysroleid = ? AND component = ?`,
        [sysroleid, componentId]
      );
    } else if (userId && componentId) {
      // Delete user-specific role
      await pool.execute(
        `DELETE FROM sysusers_roles WHERE sysuderid = ? AND component = ?`,
        [userId, componentId]
      );
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either (User ID and Component ID) or (User Type ID and Component ID) are required'
      });
    }
    
    res.json({
      success: true,
      message: 'User permission deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user role',
      error: error.message
    });
  }
};

// PUT /api/sys-users-roles/:id - Update a user type role
export const updateUserTypeRole = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const { id } = req.params;
    const { canaccesspage, canapprove, canreturn, cancancel, canprint, canread, cancreate, canupdate, candelete, cansoftdelete } = req.body;
    
    // Check if role exists
    const [existing] = await pool.execute(
      `SELECT id, sysroleid FROM sysusers_roles WHERE id = ? LIMIT 1`,
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }
    
    // Check if trying to modify Root Admin role
    if (existing[0].sysroleid === 1) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify Root Admin roles'
      });
    }
    
    // Update the role
    await pool.execute(
      `UPDATE sysusers_roles 
       SET canaccesspage = ?, canapprove = ?, canreturn = ?, cancancel = ?, canprint = ?, canread = ?, 
           cancreate = ?, canupdate = ?, candelete = ?, cansoftdelete = ?
       WHERE id = ?`,
      [
        canaccesspage ? 1 : 0,
        canapprove ? 1 : 0,
        canreturn ? 1 : 0,
        cancancel ? 1 : 0,
        canprint ? 1 : 0,
        canread ? 1 : 0,
        cancreate ? 1 : 0,
        canupdate ? 1 : 0,
        candelete ? 1 : 0,
        cansoftdelete ? 1 : 0,
        id
      ]
    );
    
    res.json({
      success: true,
      message: 'Role updated successfully'
    });
  } catch (error) {
    console.error('Error updating user type role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: error.message
    });
  }
};

