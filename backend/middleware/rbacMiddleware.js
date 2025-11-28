import { getHR201Pool } from '../config/hr201Database.js';

const ROOT_ADMIN_ID = 1; // Supreme bypass - usertype.id = 1
const ROOT_ADMIN_USER_ID = 1; // Supreme bypass - sysusers.id = 1

/**
 * Check if user has permission for a specific component and action
 * Root Admin (usertype=1 or sysusers.id=1) always returns true
 * @param {Object} req - Express request object with req.user (from JWT)
 * @param {string} componentName - Component name (e.g., 'dtr-shifts', '201-locator')
 * @param {string} action - Action: 'read', 'create', 'update', 'delete'
 * @returns {Promise<boolean>} - true if permission granted, false otherwise
 */
export const checkPermission = async (req, componentName, action) => {
  const userId = req.user?.USERID || req.user?.id || req.user?.userid;
  let usertype = req.user?.usertype || req.user?.usertype_id || req.user?.usertypeid;
  
  if (!userId || !componentName || !action) {
    console.warn('[RBAC] Missing required parameters:', { userId, componentName, action, user: req.user });
    return false;
  }
  
  // Root Admin bypass - supreme access (sysusers.id = 1)
  const userIdNum = Number(userId);
  if (userIdNum === ROOT_ADMIN_USER_ID || userId === '1') {
    return true;
  }
  
  try {
    const pool = getHR201Pool();
    
    // If usertype is not in the JWT, fetch it from the database
    if (!usertype && userId) {
      try {
        const [userRows] = await pool.execute(
          `SELECT usertype FROM sysusers WHERE id = ? LIMIT 1`,
          [userId]
        );
        if (userRows.length > 0) {
          usertype = userRows[0].usertype;
        }
      } catch (error) {
        console.error('[RBAC] Error fetching usertype:', error);
      }
    }
    
    // Root Admin bypass - supreme access (usertype.id = 1)
    if (usertype === ROOT_ADMIN_ID || usertype === '1') {
      return true;
    }
    
    if (!usertype) {
      console.warn('[RBAC] Missing usertype after fetch attempt:', { userId, componentName, action });
      return false;
    }
    
    // First, get the component ID from syscomponents table
    const [componentRows] = await pool.execute(
      `SELECT id FROM syscomponents WHERE componentname = ? LIMIT 1`,
      [componentName]
    );
    
    if (componentRows.length === 0) {
      console.warn(`[RBAC] Component '${componentName}' not found in syscomponents`);
      return false; // Component not registered, no access
    }
    const componentId = componentRows[0].id;
    
    // Then, fetch permissions from sysusers_roles table using componentId
    const [permissionRows] = await pool.execute(
      `SELECT canread, cancreate, canupdate, candelete
       FROM sysusers_roles
       WHERE sysroleid = ? AND component = ? LIMIT 1`,
      [usertype, componentId]
    );
    
    if (permissionRows.length === 0) {
      // No permission record = no access
      return false;
    }
    
    const perm = permissionRows[0];
    
    // Map action to column
    const actionMap = {
      'read': perm.canread,
      'create': perm.cancreate,
      'update': perm.canupdate,
      'delete': perm.candelete
    };
    
    const allowed = actionMap[action] === 1;
    
    if (!allowed) {
      console.log(`[RBAC] Permission denied: user=${userId}, component=${componentName}, action=${action}`);
    }
    
    return allowed;
  } catch (error) {
    console.error('[RBAC] Error checking permission:', error);
    return false;
  }
};

/**
 * Check if user can access a page/component in the menu
 * @param {number} userId - sysusers.id
 * @param {string} componentName - Component name (e.g., 'dtr-shifts', '201-locator')
 * @param {number} usertype - The usertype (for Root Admin check)
 * @returns {Promise<boolean>} - true if page accessible, false otherwise
 */
export const canAccessPage = async (userId, componentName, usertype) => {
  // Root Admin bypass - supreme access (sysusers.id = 1)
  const userIdNum = Number(userId);
  if (userIdNum === ROOT_ADMIN_USER_ID || userId === '1') {
    return true;
  }
  
  // Root Admin can access all pages (usertype.id = 1)
  if (usertype === ROOT_ADMIN_ID || usertype === '1') {
    return true;
  }
  
  if (!userId || !componentName) {
    return false;
  }
  
  if (!usertype) {
    console.warn('[RBAC] Missing usertype in canAccessPage:', { userId, componentName });
    return false;
  }
  
  try {
    const pool = getHR201Pool();
    
    // First, get the component ID from syscomponents table
    const [componentRows] = await pool.execute(
      `SELECT id FROM syscomponents WHERE componentname = ? LIMIT 1`,
      [componentName]
    );
    
    if (componentRows.length === 0) {
      console.warn(`[RBAC] Component '${componentName}' not found in syscomponents for page access check`);
      return false; // Component not registered, no access
    }
    const componentId = componentRows[0].id;
    
    // Then, fetch page access permission from sysusers_roles table
    const [rows] = await pool.execute(
      `SELECT canaccesspage
       FROM sysusers_roles
       WHERE sysroleid = ? AND component = ? LIMIT 1`,
      [usertype, componentId]
    );
    
    return rows.length > 0 && rows[0].canaccesspage === 1;
  } catch (error) {
    console.error('[RBAC] Error checking page access:', error);
    return false;
  }
};

/**
 * Express middleware to require specific permission
 * @param {string} componentName - Component name (e.g., 'dtr-shifts', '201-locator')
 * @param {string} action - Action: 'read', 'create', 'update', 'delete'
 * @returns {Function} Express middleware
 */
export const requirePermission = (componentName, action) => {
  return async (req, res, next) => {
    try {
      const allowed = await checkPermission(req, componentName, action);
      if (allowed) {
        return next();
      }
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden: Insufficient permissions',
        component: componentName,
        action 
      });
    } catch (error) {
      console.error('[RBAC] Permission middleware error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error checking permissions',
        error: error.message 
      });
    }
  };
};

/**
 * Express middleware to require either of two permissions (e.g., create OR update)
 * @param {string} componentName - Component name (e.g., '201-pds')
 * @param {string} action1 - First action to check (e.g., 'create')
 * @param {string} action2 - Second action to check (e.g., 'update')
 * @returns {Function} Express middleware
 */
export const requirePermissionOr = (componentName, action1, action2) => {
  return async (req, res, next) => {
    try {
      const allowed1 = await checkPermission(req, componentName, action1);
      const allowed2 = await checkPermission(req, componentName, action2);
      if (allowed1 || allowed2) {
        return next();
      }
      return res.status(403).json({ 
        success: false,
        message: 'Forbidden: Insufficient permissions',
        component: componentName,
        required: `${action1} OR ${action2}`
      });
    } catch (error) {
      console.error('[RBAC] Permission middleware error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error checking permissions',
        error: error.message 
      });
    }
  };
};

/**
 * Get all permissions for a user (for frontend use)
 * Uses JOIN to get componentname and componentgroup from syscomponents via component FK
 * @param {number} userId - sysusers.id
 * @param {number} usertype - The usertype (for Root Admin check)
 * @returns {Promise<Object>} Object with component permissions keyed by componentname, and componentgroups array
 */
export const getUserPermissions = async (userId, usertype) => {
  // Root Admin bypass - supreme access (sysusers.id = 1)
  const userIdNum = Number(userId);
  if (userIdNum === ROOT_ADMIN_USER_ID || userId === '1') {
    try {
      const pool = getHR201Pool();
      // Get all unique componentgroups for Root Admin
      const [groupRows] = await pool.execute(
        `SELECT DISTINCT componentgroup FROM syscomponents WHERE componentgroup IS NOT NULL AND componentgroup != ''`
      );
      const componentgroups = groupRows.map(row => row.componentgroup);
      
      return { 
        '*': { canaccesspage: true, canread: true, cancreate: true, canupdate: true, candelete: true },
        componentgroups: componentgroups // All groups for Root Admin
      };
    } catch (error) {
      console.error('[RBAC] Error fetching componentgroups for Root Admin:', error);
      return { 
        '*': { canaccesspage: true, canread: true, cancreate: true, canupdate: true, candelete: true },
        componentgroups: []
      };
    }
  }
  
  // Root Admin - return wildcard permissions and all componentgroups (usertype.id = 1)
  if (usertype === ROOT_ADMIN_ID || usertype === '1') {
    try {
      const pool = getHR201Pool();
      // Get all unique componentgroups for Root Admin
      const [groupRows] = await pool.execute(
        `SELECT DISTINCT componentgroup FROM syscomponents WHERE componentgroup IS NOT NULL AND componentgroup != ''`
      );
      const componentgroups = groupRows.map(row => row.componentgroup);
      
      return { 
        '*': { canaccesspage: true, canread: true, cancreate: true, canupdate: true, candelete: true },
        componentgroups: componentgroups // All groups for Root Admin
      };
    } catch (error) {
      console.error('[RBAC] Error fetching componentgroups for Root Admin:', error);
      return { 
        '*': { canaccesspage: true, canread: true, cancreate: true, canupdate: true, candelete: true },
        componentgroups: []
      };
    }
  }
  
  if (!userId || !usertype) {
    return { componentgroups: [] };
  }
  
  try {
    const pool = getHR201Pool();
    
    // Fetch user type roles (sysroleid) - these apply to all users of this type
    // Relationship: sysusers.usertype -> usertypes.id -> sysusers_roles.sysroleid
    // Note: There are NO user-specific roles - only user type roles exist
    // Don't filter by canaccesspage in SQL - do it in JavaScript for better type handling
    const [userTypeRowsRaw] = await pool.execute(
      `SELECT
         sc.componentname,
         sc.componentgroup,
         sur.canaccesspage,
         sur.canread,
         sur.cancreate,
         sur.canupdate,
         sur.candelete,
         sur.canapprove,
         sur.canprint,
         sur.cansoftdelete,
         sur.canreturn,
         sur.cancancel,
         sur.sysroleid,
         sur.component
       FROM sysusers_roles sur
       INNER JOIN syscomponents sc ON sur.component = sc.id
       WHERE sur.sysroleid = ?`,
      [usertype]
    );
    
    // Filter to ensure canaccesspage is truthy (handles 1, "1", true, and converts to number)
    // MySQL might return canaccesspage as a number or string depending on column type
    const filteredUserTypeRows = userTypeRowsRaw.filter(row => {
      // Convert to number if it's a string, then check if it's truthy
      const canAccessValue = typeof row.canaccesspage === 'string' 
        ? parseInt(row.canaccesspage, 10) 
        : row.canaccesspage;
      const canAccess = canAccessValue === 1 || canAccessValue === true || canAccessValue === '1';
      return canAccess;
    });
    
    // No user-specific rows - only user type roles exist
    const filteredUserSpecificRows = [];
    
    // Debug logging
    console.log(`[RBAC] getUserPermissions for userId=${userId}, usertype=${usertype}`);
    console.log(`[RBAC] User type roles found (raw): ${userTypeRowsRaw.length}`);
    console.log(`[RBAC] User type roles found (after filter canaccesspage=1): ${filteredUserTypeRows.length}`);
    
    // Debug: Show sample raw rows to see what canaccesspage values look like
    if (userTypeRowsRaw.length > 0) {
      console.log(`[RBAC] Sample raw userTypeRows (first 3):`, userTypeRowsRaw.slice(0, 3).map(r => ({
        componentname: r.componentname,
        canaccesspage: r.canaccesspage,
        canaccesspageType: typeof r.canaccesspage,
        canaccesspageValue: r.canaccesspage
      })));
    }
    
    // Diagnostic query: Check all roles for this usertype regardless of canaccesspage
    const [allUserTypeRoles] = await pool.execute(
      `SELECT sur.id, sur.sysroleid, sur.component, sur.canaccesspage, sc.componentname, sc.componentgroup
       FROM sysusers_roles sur
       INNER JOIN syscomponents sc ON sur.component = sc.id
       WHERE sur.sysroleid = ?`,
      [usertype]
    );
    
    // Also check if dtr-cdo component exists in syscomponents table
    const [dtrCdoComponent] = await pool.execute(
      `SELECT id, componentname, componentgroup FROM syscomponents WHERE componentname LIKE '%cdo%' OR componentname LIKE '%CDO%'`
    );
    if (dtrCdoComponent.length > 0) {
      console.log(`[RBAC] 🔍 Components with 'cdo' in name:`, dtrCdoComponent);
    }
    console.log(`[RBAC] All roles for usertype ${usertype} (${allUserTypeRoles.length} total):`, allUserTypeRoles.map(r => ({
      id: r.id,
      componentname: r.componentname,
      componentgroup: r.componentgroup,
      canaccesspage: r.canaccesspage,
      canaccesspageType: typeof r.canaccesspage,
      canaccesspageValue: r.canaccesspage
    })));
    
    // Check if any have canaccesspage = 1
    const withAccessPage = allUserTypeRoles.filter(r => r.canaccesspage === 1);
    console.log(`[RBAC] Roles with canaccesspage=1: ${withAccessPage.length}`);
    if (withAccessPage.length > 0) {
      console.log(`[RBAC] Sample roles with canaccesspage=1:`, withAccessPage.slice(0, 3).map(r => ({
        componentname: r.componentname,
        componentgroup: r.componentgroup
      })));
    }
    
    if (filteredUserTypeRows.length > 0) {
      console.log(`[RBAC] User type roles sample (filtered):`, filteredUserTypeRows.slice(0, 3).map(r => ({
        componentname: r.componentname,
        componentgroup: r.componentgroup,
        canaccesspage: r.canaccesspage
      })));
    }
    
    // Build permissions from user type roles only (no user-specific roles exist)
    const permissions = {};
    const componentgroupsSet = new Set();
    
    // Add user type roles
    filteredUserTypeRows.forEach(row => {
      permissions[row.componentname] = {
        canaccesspage: row.canaccesspage === 1 || row.canaccesspage === '1' || row.canaccesspage === true,
        canread: row.canread === 1 || row.canread === '1' || row.canread === true,
        cancreate: row.cancreate === 1 || row.cancreate === '1' || row.cancreate === true,
        canupdate: row.canupdate === 1 || row.canupdate === '1' || row.canupdate === true,
        candelete: row.candelete === 1 || row.candelete === '1' || row.candelete === true,
        canapprove: row.canapprove === 1 || row.canapprove === '1' || row.canapprove === true,
        canprint: row.canprint === 1 || row.canprint === '1' || row.canprint === true,
        cansoftdelete: row.cansoftdelete === 1 || row.cansoftdelete === '1' || row.cansoftdelete === true,
        canreturn: row.canreturn === 1 || row.canreturn === '1' || row.canreturn === true,
        cancancel: row.cancancel === 1 || row.cancancel === '1' || row.cancancel === true,
      };
      
      if (row.componentgroup && row.componentgroup.trim() !== '') {
        componentgroupsSet.add(row.componentgroup);
      }
    });
    
    const result = {
      ...permissions,
      componentgroups: Array.from(componentgroupsSet)
    };
    
    // Debug logging
    console.log(`[RBAC] Final permissions count: ${Object.keys(permissions).length}`);
    console.log(`[RBAC] Component groups collected:`, Array.from(componentgroupsSet));
    console.log(`[RBAC] Component groups array length:`, componentgroupsSet.size);
    console.log(`[RBAC] Permission keys:`, Object.keys(permissions).slice(0, 10));
    
    // Additional diagnostic: Check what componentgroups were found in the rows
    const allComponentgroups = filteredUserTypeRows
      .map(r => r.componentgroup)
      .filter(g => g && g.trim() !== '');
    console.log(`[RBAC] All componentgroups from rows (before Set):`, allComponentgroups);
    console.log(`[RBAC] Unique componentgroups:`, [...new Set(allComponentgroups)]);
    
    // Check if dtr-cdo permission was added
    if (permissions['dtr-cdo']) {
      console.log(`[RBAC] ✅ dtr-cdo permission found in final permissions:`, permissions['dtr-cdo']);
    } else {
      console.log(`[RBAC] ⚠️ dtr-cdo permission NOT found in final permissions`);
      console.log(`[RBAC] Available component permissions:`, Object.keys(permissions).filter(k => k !== 'componentgroups'));
    }
    
    // Debug: Show sample rows to check componentgroup values
    if (filteredUserTypeRows.length > 0) {
      console.log(`[RBAC] Sample filteredUserTypeRows componentgroups:`, filteredUserTypeRows.slice(0, 5).map(r => ({
        componentname: r.componentname,
        componentgroup: r.componentgroup,
        componentgroupType: typeof r.componentgroup,
        componentgroupIsNull: r.componentgroup === null,
        componentgroupIsEmpty: r.componentgroup === ''
      })));
      
      // Special check for dtr-cdo
      const dtrCdoRow = filteredUserTypeRows.find(r => r.componentname === 'dtr-cdo');
      if (dtrCdoRow) {
        console.log(`[RBAC] 🔍 Found dtr-cdo in filteredUserTypeRows:`, {
          componentname: dtrCdoRow.componentname,
          componentgroup: dtrCdoRow.componentgroup,
          canaccesspage: dtrCdoRow.canaccesspage,
          willBeAddedToPermissions: true,
          willBeAddedToComponentgroups: !!(dtrCdoRow.componentgroup && dtrCdoRow.componentgroup.trim() !== '')
        });
      } else {
        console.log(`[RBAC] ⚠️ dtr-cdo NOT found in filteredUserTypeRows`);
        // Check if it exists in allUserTypeRoles but was filtered out
        const dtrCdoInAll = allUserTypeRoles.find(r => r.componentname === 'dtr-cdo');
        if (dtrCdoInAll) {
          console.log(`[RBAC] ⚠️ dtr-cdo exists in allUserTypeRoles but was filtered out:`, {
            componentname: dtrCdoInAll.componentname,
            canaccesspage: dtrCdoInAll.canaccesspage,
            canaccesspageType: typeof dtrCdoInAll.canaccesspage,
            componentgroup: dtrCdoInAll.componentgroup
          });
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('[RBAC] Error fetching user permissions from DB:', error);
    return { componentgroups: [] };
  }
};

