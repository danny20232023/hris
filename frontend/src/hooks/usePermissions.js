import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../authContext';
import api from '../utils/api';

const ROOT_ADMIN_ID = 1; // Supreme bypass - usertype.id = 1

/**
 * React hook for checking user permissions
 * Uses sysusers_roles table via API
 * Root Admin (usertype=1) always returns true
 */
export const usePermissions = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState({});
  const [componentgroups, setComponentgroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const usertype = user?.usertype;
  const userId = user?.USERID || user?.id;

  // Fetch permissions from backend
  useEffect(() => {
    const fetchPermissions = async () => {
      if (!userId) {
        setPermissions({});
        setComponentgroups([]);
        setLoading(false);
        return;
      }

      // Root Admin - fetch to get all componentgroups
      if (usertype === ROOT_ADMIN_ID) {
        try {
          const response = await api.get('/auth/permissions');
          if (response.data?.success && response.data?.permissions) {
            setPermissions({ isRootAdmin: true, ...response.data.permissions });
            setComponentgroups(response.data.permissions?.componentgroups || []);
          } else {
            setPermissions({ isRootAdmin: true });
            setComponentgroups([]);
          }
        } catch (error) {
          console.error('Error fetching permissions for Root Admin:', error);
          setPermissions({ isRootAdmin: true });
          setComponentgroups([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await api.get('/auth/permissions');
        console.log('[Frontend] Permissions API response:', {
          success: response.data?.success,
          hasPermissions: !!response.data?.permissions,
          permissionKeys: response.data?.permissions ? Object.keys(response.data.permissions).filter(k => k !== 'componentgroups').slice(0, 10) : [],
          componentgroups: response.data?.permissions?.componentgroups || []
        });
        
        if (response.data?.success && response.data?.permissions) {
          setPermissions(response.data.permissions);
          setComponentgroups(response.data.permissions?.componentgroups || []);
        } else {
          setPermissions({});
          setComponentgroups([]);
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setPermissions({});
        setComponentgroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [userId, usertype]);

  /**
   * Check if user has permission for a component and action
   * @param {string} componentName - Component name (e.g., '201-locator', 'dtr-shifts')
   * @param {string} action - Action: 'read', 'create', 'update', 'delete'
   * @returns {boolean} - true if permission granted, false otherwise
   */
  const can = useCallback((componentName, action) => {
    // Root Admin bypass - supreme access
    if (permissions.isRootAdmin || usertype === ROOT_ADMIN_ID) {
      return true;
    }

    if (!componentName || !action || !permissions || Object.keys(permissions).length === 0) {
      return false;
    }

    // Check wildcard permissions (Root Admin case from API)
    if (permissions['*']) {
      return permissions['*'][action] === true;
    }

    // Check component-specific permissions
    const componentPerms = permissions[componentName];
    if (!componentPerms) {
      return false;
    }

    // Handle object format { canread: true, cancreate: false, ... }
    if (typeof componentPerms === 'object' && !Array.isArray(componentPerms)) {
      const actionMap = {
        'read': componentPerms.canread,
        'create': componentPerms.cancreate,
        'update': componentPerms.canupdate,
        'delete': componentPerms.candelete,
        'approve': componentPerms.canapprove,
        'print': componentPerms.canprint,
        'softdelete': componentPerms.cansoftdelete,
        'return': componentPerms.canreturn,
        'cancel': componentPerms.cancancel,
      };
      return actionMap[action] === true;
    }

    // Handle array format ['read', 'create', ...] (legacy, should not happen)
    if (Array.isArray(componentPerms)) {
      return componentPerms.includes(action);
    }

    return false;
  }, [permissions, usertype]);

  /**
   * Check if user can access a page/component in the menu
   * @param {string} componentName - Component name
   * @returns {boolean} - true if page accessible, false otherwise
   */
  const canAccessPage = useCallback((componentName) => {
    // Root Admin can access all pages
    if (permissions.isRootAdmin || usertype === ROOT_ADMIN_ID) {
      return true;
    }

    if (!componentName || !permissions || Object.keys(permissions).length === 0) {
      console.log(`[Frontend] canAccessPage(${componentName}): No permissions or empty`, {
        hasComponentName: !!componentName,
        hasPermissions: !!permissions,
        permissionKeys: permissions ? Object.keys(permissions).filter(k => k !== 'componentgroups') : []
      });
      return false;
    }

    // Check wildcard permissions
    if (permissions['*']) {
      // Handle both boolean true and number 1
      return permissions['*'].canaccesspage === true || permissions['*'].canaccesspage === 1;
    }

    const componentPerms = permissions[componentName];
    if (!componentPerms) {
      // Special logging for dtr-cdo to help debug
      if (componentName === 'dtr-cdo') {
        console.log(`[Frontend] 🔍 canAccessPage('dtr-cdo'): Component NOT found in permissions`, {
          allPermissionKeys: Object.keys(permissions).filter(k => k !== 'componentgroups'),
          searchedFor: 'dtr-cdo',
          permissionsObject: permissions
        });
      } else if (componentName === 'compute-attendance-report') {
        // Check for old name as fallback
        const oldNamePerms = permissions['computed-attendances'];
        if (oldNamePerms) {
          console.log(`[Frontend] ⚠️ canAccessPage('compute-attendance-report'): Using old name 'computed-attendances' as fallback`);
          const result = oldNamePerms.canaccesspage === true || oldNamePerms.canaccesspage === 1;
          return result;
        }
        console.log(`[Frontend] 🔍 canAccessPage('compute-attendance-report'): Component NOT found in permissions`, {
          allPermissionKeys: Object.keys(permissions).filter(k => k !== 'componentgroups'),
          searchedFor: 'compute-attendance-report',
          permissionsObject: permissions
        });
      } else {
        console.log(`[Frontend] canAccessPage(${componentName}): Component not found in permissions`, {
          availableComponents: Object.keys(permissions).filter(k => k !== 'componentgroups').slice(0, 10),
          searchedFor: componentName
        });
      }
      return false;
    }

    // Check canAccessPage flag if present
    if (typeof componentPerms === 'object' && 'canaccesspage' in componentPerms) {
      // Handle both boolean true and number 1
      const result = componentPerms.canaccesspage === true || componentPerms.canaccesspage === 1;
      if (!result) {
        console.log(`[Frontend] canAccessPage(${componentName}): canaccesspage is false/0 - access denied`, componentPerms);
      } else if (componentName === 'dtr-cdo' || componentName === 'dtr-fix-checktimes' || componentName === 'compute-attendance-report') {
        console.log(`[Frontend] ✅ canAccessPage('${componentName}'): TRUE`, componentPerms);
      }
      // Strictly return the canaccesspage value - if it's 0/false, deny access
      return result;
    }

    // If canaccesspage is not present in permissions, deny access (strict check)
    // Don't fall back to checking other permissions - canaccesspage must be explicitly set to 1/true
    console.log(`[Frontend] canAccessPage(${componentName}): canaccesspage not found in permissions - access denied`, componentPerms);
    return false;
  }, [permissions, usertype]);

  /**
   * Check if user has access to a componentgroup (for parent menu visibility)
   * @param {string} componentgroup - Component group name (e.g., 'DTR', '201 Files', 'System Setup')
   * @returns {boolean} - true if user has at least one component in this group, false otherwise
   */
  const hasComponentGroupAccess = useCallback((componentgroup) => {
    // Root Admin has access to all groups
    if (permissions.isRootAdmin || usertype === ROOT_ADMIN_ID) {
      return true;
    }
    
    if (!componentgroup || componentgroups.length === 0) {
      return false;
    }
    
    return componentgroups.includes(componentgroup);
  }, [componentgroups, permissions.isRootAdmin, usertype]);

  return {
    can,
    canAccessPage,
    hasComponentGroupAccess,
    componentgroups,
    permissions,
    loading,
    isRootAdmin: permissions.isRootAdmin || usertype === ROOT_ADMIN_ID
  };
};

export default usePermissions;

