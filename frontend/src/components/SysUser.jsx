import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../authContext';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../utils/employeenameFormatter';

const SysUser = () => {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users'); // users, roles, usertypes, parameters
  
  // Tab 1: System Users states
  const [sysUsers, setSysUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    usertype: '',
    emp_objid: '',
    status: 1
  });
  const [userPhotoFile, setUserPhotoFile] = useState(null);
  const [userPhotoPreview, setUserPhotoPreview] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [userTypes, setUserTypes] = useState([]);
  
  // Employee lookup states
  const [employees, setEmployees] = useState([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  
  // Tab 2: User Roles states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [components, setComponents] = useState([]);
  const [userPermissions, setUserPermissions] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({}); // Track which groups are expanded
  // New states for user types grid
  const [expandedUserTypes, setExpandedUserTypes] = useState(new Set());
  const [userRolesMap, setUserRolesMap] = useState(new Map()); // Maps usertypeid -> array of role records
  const [roleCountsMap, setRoleCountsMap] = useState(new Map()); // Maps usertypeid -> count
  const [expandedComponentGroups, setExpandedComponentGroups] = useState(new Map()); // Maps usertypeid -> Set of expanded group names
  const [loadingUserRoles, setLoadingUserRoles] = useState(false);
  // Add Role modal states
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [selectedUserTypeForRole, setSelectedUserTypeForRole] = useState(null);
  const [editingRole, setEditingRole] = useState(null); // For editing a single role
  const [selectedComponents, setSelectedComponents] = useState([]); // Array of component IDs
  const [roleFormData, setRoleFormData] = useState({
    canaccesspage: false,
    canapprove: false,
    canreturn: false,
    cancancel: false,
    canprint: false,
    canread: false,
    cancreate: false,
    canupdate: false,
    candelete: false,
    cansoftdelete: false
  });
  
  // Tab 3: User Parameters states
  // SysComponents
  const [sysComponents, setSysComponents] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState(null);
  const [componentFormData, setComponentFormData] = useState({ 
    componentname: '', 
    componentgroup: '', 
    panelmenuname: '', 
    desc: '' 
  });
  // Component Controls states
  const [expandedComponents, setExpandedComponents] = useState(new Set());
  const [componentControlsMap, setComponentControlsMap] = useState(new Map()); // Maps componentid -> array of control records
  const [controlCountsMap, setControlCountsMap] = useState(new Map()); // Maps componentid -> count
  const [loadingControls, setLoadingControls] = useState(false);
  // Add Control modal states
  const [showAddControlModal, setShowAddControlModal] = useState(false);
  const [selectedComponentForControl, setSelectedComponentForControl] = useState(null);
  const [editingControl, setEditingControl] = useState(null);
  const [controlFormData, setControlFormData] = useState({
    controlname: '',
    displayname: ''
  });
  // Component filter states
  const [componentSearchTerm, setComponentSearchTerm] = useState('');
  const [componentGroupFilter, setComponentGroupFilter] = useState('all');
  // UserTypes
  const [userTypesParams, setUserTypesParams] = useState([]);
  const [loadingUserTypes, setLoadingUserTypes] = useState(false);
  const [showUserTypeModal, setShowUserTypeModal] = useState(false);
  const [editingUserType, setEditingUserType] = useState(null);
  const [userTypeFormData, setUserTypeFormData] = useState({ typename: '' });
  
  // Message states
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  // Fetch all data on mount
  useEffect(() => {
    fetchSysUsers();
    fetchUserTypes();
    fetchSysComponents();
    fetchUserTypesParams();
  }, []);

  // Fetch permission counts when roles tab is opened
  useEffect(() => {
    if (activeTab === 'roles' && userTypes.length > 0) {
      // Only fetch if counts haven't been loaded yet for all user types
      const needsFetch = userTypes.some(userType => !roleCountsMap.has(userType.id));
      if (needsFetch) {
        fetchAllPermissionCounts(userTypes);
      }
    }
  }, [activeTab, userTypes.length]);

  // Fetch employees for lookup
  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const response = await api.get('/201-employees');
      if (response.data.success) {
        setEmployees(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Update employee search term when employees are loaded and we're editing a user with emp_objid
  useEffect(() => {
    if (editingUser && editingUser.emp_objid && employees.length > 0) {
      const selectedEmployee = employees.find(emp => emp.objid === editingUser.emp_objid);
      if (selectedEmployee && !employeeSearchTerm) {
        setEmployeeSearchTerm(formatEmployeeName(selectedEmployee.surname, selectedEmployee.firstname, selectedEmployee.middlename));
      }
    }
  }, [employees, editingUser]);

  // ============================================
  // TAB 1: SYSTEM USERS
  // ============================================
  
  const fetchSysUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get('/sys-users');
      if (response.data.success) {
        setSysUsers(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching sysusers:', error);
      showMessage('Failed to fetch system users', 'error');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchUserTypes = async () => {
    try {
      const response = await api.get('/user-types');
      if (response.data.success) {
        setUserTypes(response.data.data || []);
        // Fetch permission counts for all user types
        fetchAllPermissionCounts(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching user types:', error);
    }
  };

  // Fetch permission counts for all user types
  const fetchAllPermissionCounts = async (userTypesList) => {
    if (!userTypesList || userTypesList.length === 0) return;
    
    try {
      // Fetch permission counts for all user types in parallel
      const countPromises = userTypesList.map(async (userType) => {
        try {
          const response = await api.get(`/sys-users/user-roles-by-type/${userType.id}`);
          if (response.data.success) {
            const roles = response.data.data || [];
            return { usertypeid: userType.id, count: roles.length };
          }
          return { usertypeid: userType.id, count: 0 };
        } catch (error) {
          console.error(`Error fetching permission count for user type ${userType.id}:`, error);
          return { usertypeid: userType.id, count: 0 };
        }
      });
      
      const counts = await Promise.all(countPromises);
      const newCountsMap = new Map();
      counts.forEach(({ usertypeid, count }) => {
        newCountsMap.set(usertypeid, count);
      });
      setRoleCountsMap(newCountsMap);
    } catch (error) {
      console.error('Error fetching permission counts:', error);
    }
  };

  const handleUserInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUserFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value) : value)
    }));
  };

  const handleUserPhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUserPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const openUserModal = (user = null) => {
    // Fetch employees when modal opens
    fetchEmployees();
    
    if (user) {
      setEditingUser(user);
      setUserFormData({
        username: user.username || '',
        password: '',
        usertype: user.usertype || '',
        emp_objid: user.emp_objid || '',
        status: user.status !== undefined ? user.status : 1
      });
      setUserPhotoPreview(user.photo || null);
      setUserPhotoFile(null);
      
      // Set employee search term if employee exists (will be updated when employees load)
      if (user.emp_objid) {
        const selectedEmployee = employees.find(emp => emp.objid === user.emp_objid);
        if (selectedEmployee) {
          setEmployeeSearchTerm(formatEmployeeName(selectedEmployee.surname, selectedEmployee.firstname, selectedEmployee.middlename));
        } else {
          setEmployeeSearchTerm('');
        }
      } else {
        setEmployeeSearchTerm('');
      }
    } else {
      setEditingUser(null);
      setUserFormData({
        username: '',
        password: '',
        usertype: '',
        emp_objid: '',
        status: 1
      });
      setUserPhotoPreview(null);
      setUserPhotoFile(null);
      setEmployeeSearchTerm('');
    }
    setShowEmployeeDropdown(false);
    setShowUserModal(true);
  };
  
  // Filter employees based on search term
  const filteredEmployees = employees.filter(emp => {
    const fullName = formatEmployeeName(emp.surname, emp.firstname, emp.middlename).toLowerCase();
    const searchLower = employeeSearchTerm.toLowerCase();
    return fullName.includes(searchLower) || 
           (emp.objid && emp.objid.toLowerCase().includes(searchLower));
  });

  // Group components by componentgroup
  const groupedComponents = useMemo(() => {
    const grouped = {};
    components.forEach(comp => {
      const group = comp.componentgroup || 'Uncategorized';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(comp);
    });
    return grouped;
  }, [components]);

  // Toggle group expansion
  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // Toggle user type expansion and fetch roles if needed
  const toggleUserTypeExpand = async (usertypeid) => {
    const newExpanded = new Set(expandedUserTypes);
    if (newExpanded.has(usertypeid)) {
      newExpanded.delete(usertypeid);
      setExpandedUserTypes(newExpanded);
    } else {
      newExpanded.add(usertypeid);
      setExpandedUserTypes(newExpanded);
      
      // Fetch roles if not already loaded
      if (!userRolesMap.has(usertypeid)) {
        setLoadingUserRoles(true);
        try {
          const response = await api.get(`/sys-users/user-roles-by-type/${usertypeid}`);
          if (response.data.success) {
            const roles = response.data.data || [];
            setUserRolesMap(prev => new Map(prev).set(usertypeid, roles));
            setRoleCountsMap(prev => new Map(prev).set(usertypeid, roles.length));
          }
        } catch (error) {
          console.error('Error fetching user roles by type:', error);
          showMessage('Failed to fetch user roles', 'error');
        } finally {
          setLoadingUserRoles(false);
        }
      }
    }
  };

  // Filter out Root Admin (id = 1) from user types
  const filteredUserTypes = useMemo(() => {
    return userTypesParams.filter(type => type.id !== 1);
  }, [userTypesParams]);

  // Get unique component groups for filter dropdown
  const componentGroups = useMemo(() => {
    if (!sysComponents || sysComponents.length === 0) return [];
    const groups = new Set();
    sysComponents.forEach(comp => {
      if (comp.componentgroup) {
        groups.add(comp.componentgroup);
      }
    });
    return Array.from(groups).sort();
  }, [sysComponents]);

  // Filter components based on search term and group filter
  const filteredComponents = useMemo(() => {
    if (!sysComponents || sysComponents.length === 0) return [];
    
    return sysComponents.filter(comp => {
      // Search filter - check componentname, panelmenuname, and desc
      const matchesSearch = componentSearchTerm.trim() === '' || 
        comp.componentname?.toLowerCase().includes(componentSearchTerm.toLowerCase()) ||
        comp.panelmenuname?.toLowerCase().includes(componentSearchTerm.toLowerCase()) ||
        comp.desc?.toLowerCase().includes(componentSearchTerm.toLowerCase());
      
      // Group filter
      const matchesGroup = componentGroupFilter === 'all' || 
        (componentGroupFilter === 'uncategorized' && !comp.componentgroup) ||
        comp.componentgroup === componentGroupFilter;
      
      return matchesSearch && matchesGroup;
    });
  }, [sysComponents, componentSearchTerm, componentGroupFilter]);

  // Open Add Role modal
  const openAddRoleModal = (userType, role = null) => {
    setSelectedUserTypeForRole(userType);
    setEditingRole(role);
    if (role) {
      // Edit mode - pre-fill with role data
      setSelectedComponents([role.component_id || role.component]);
      setRoleFormData({
        canaccesspage: role.canaccesspage === 1,
        canapprove: role.canapprove === 1,
        canreturn: role.canreturn === 1,
        cancancel: role.cancancel === 1,
        canprint: role.canprint === 1,
        canread: role.canread === 1,
        cancreate: role.cancreate === 1,
        canupdate: role.canupdate === 1,
        candelete: role.candelete === 1,
        cansoftdelete: role.cansoftdelete === 1
      });
    } else {
      // Add mode
      setSelectedComponents([]);
      setRoleFormData({
        canaccesspage: false,
        canapprove: false,
        canreturn: false,
        cancancel: false,
        canprint: false,
        canread: false,
        cancreate: false,
        canupdate: false,
        candelete: false,
        cansoftdelete: false
      });
    }
    setShowAddRoleModal(true);
  };

  // Close Add Role modal
  const closeAddRoleModal = () => {
    setShowAddRoleModal(false);
    setSelectedUserTypeForRole(null);
    setEditingRole(null);
    setSelectedComponents([]);
    setRoleFormData({
      canaccesspage: false,
      canapprove: false,
      canreturn: false,
      cancancel: false,
      canprint: false,
      canread: false,
      cancreate: false,
      canupdate: false,
      candelete: false,
      cansoftdelete: false
    });
  };

  // Toggle component selection
  const toggleComponentSelection = (componentId) => {
    setSelectedComponents(prev => {
      if (prev.includes(componentId)) {
        return prev.filter(id => id !== componentId);
      } else {
        return [...prev, componentId];
      }
    });
  };

  // Toggle component expand and fetch controls if needed
  const toggleComponentExpand = async (componentId) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(componentId)) {
      newExpanded.delete(componentId);
      setExpandedComponents(newExpanded);
    } else {
      newExpanded.add(componentId);
      setExpandedComponents(newExpanded);
      
      // Fetch controls if not already loaded
      if (!componentControlsMap.has(componentId)) {
        setLoadingControls(true);
        try {
          const response = await api.get(`/sys-components/${componentId}/controls`);
          if (response.data.success) {
            const controls = response.data.data || [];
            setComponentControlsMap(prev => new Map(prev).set(componentId, controls));
            setControlCountsMap(prev => new Map(prev).set(componentId, controls.length));
          }
        } catch (error) {
          console.error('Error fetching component controls:', error);
          showMessage('Failed to fetch component controls', 'error');
        } finally {
          setLoadingControls(false);
        }
      }
    }
  };

  // Open Add Control modal
  const openAddControlModal = (component, control = null) => {
    setSelectedComponentForControl(component);
    setEditingControl(control);
    if (control) {
      // Edit mode
      setControlFormData({
        controlname: control.controlname || '',
        displayname: control.displayname || ''
      });
    } else {
      // Add mode
      setControlFormData({
        controlname: '',
        displayname: ''
      });
    }
    setShowAddControlModal(true);
  };

  // Close Add Control modal
  const closeAddControlModal = () => {
    setShowAddControlModal(false);
    setSelectedComponentForControl(null);
    setEditingControl(null);
    setControlFormData({
      controlname: '',
      displayname: ''
    });
  };

  // Handle Add/Edit Control save
  const handleAddControlSave = async () => {
    if (!controlFormData.controlname.trim()) {
      showMessage('Control name is required', 'error');
      return;
    }

    try {
      if (editingControl) {
        // Update existing control
        const response = await api.put(`/sys-components-controls/${editingControl.controlid}`, {
          controlname: controlFormData.controlname.trim(),
          displayname: controlFormData.displayname.trim() || null
        });

        if (response.data.success) {
          showMessage('Control updated successfully');
          closeAddControlModal();
          // Refresh controls for this component
          const refreshResponse = await api.get(`/sys-components/${selectedComponentForControl.id}/controls`);
          if (refreshResponse.data.success) {
            const controls = refreshResponse.data.data || [];
            setComponentControlsMap(prev => new Map(prev).set(selectedComponentForControl.id, controls));
            setControlCountsMap(prev => new Map(prev).set(selectedComponentForControl.id, controls.length));
          }
        }
      } else {
        // Create new control
        const response = await api.post('/sys-components-controls', {
          syscomponentid: selectedComponentForControl.id,
          controlname: controlFormData.controlname.trim(),
          displayname: controlFormData.displayname.trim() || null
        });

        if (response.data.success) {
          showMessage('Control added successfully');
          closeAddControlModal();
          // Refresh controls for this component
          const refreshResponse = await api.get(`/sys-components/${selectedComponentForControl.id}/controls`);
          if (refreshResponse.data.success) {
            const controls = refreshResponse.data.data || [];
            setComponentControlsMap(prev => new Map(prev).set(selectedComponentForControl.id, controls));
            setControlCountsMap(prev => new Map(prev).set(selectedComponentForControl.id, controls.length));
          }
        }
      }
    } catch (error) {
      console.error('Error saving control:', error);
      showMessage(error.response?.data?.message || `Failed to ${editingControl ? 'update' : 'add'} control`, 'error');
    }
  };

  // Handle Delete Control
  const handleDeleteControl = async (component, control) => {
    if (!window.confirm(`Are you sure you want to delete the control "${control.controlname}"?`)) {
      return;
    }

    try {
      const response = await api.delete(`/sys-components-controls/${control.controlid}`);
      if (response.data.success) {
        showMessage('Control deleted successfully');
        // Refresh controls for this component
        const refreshResponse = await api.get(`/sys-components/${component.id}/controls`);
        if (refreshResponse.data.success) {
          const controls = refreshResponse.data.data || [];
          setComponentControlsMap(prev => new Map(prev).set(component.id, controls));
          setControlCountsMap(prev => new Map(prev).set(component.id, controls.length));
        }
      }
    } catch (error) {
      console.error('Error deleting control:', error);
      showMessage(error.response?.data?.message || 'Failed to delete control', 'error');
    }
  };

  // Handle Add Role save
  const handleAddRoleSave = async () => {
    if (editingRole) {
      // Edit mode - update single role
      try {
        await api.put(`/sys-users-roles/${editingRole.id}`, {
          canaccesspage: roleFormData.canaccesspage ? 1 : 0,
          canapprove: roleFormData.canapprove ? 1 : 0,
          canreturn: roleFormData.canreturn ? 1 : 0,
          cancancel: roleFormData.cancancel ? 1 : 0,
          canprint: roleFormData.canprint ? 1 : 0,
          canread: roleFormData.canread ? 1 : 0,
          cancreate: roleFormData.cancreate ? 1 : 0,
          canupdate: roleFormData.canupdate ? 1 : 0,
          candelete: roleFormData.candelete ? 1 : 0,
          cansoftdelete: roleFormData.cansoftdelete ? 1 : 0
        });
        
        showMessage('Role updated successfully');
        closeAddRoleModal();
        // Refresh roles for this user type
        const refreshResponse = await api.get(`/sys-users/user-roles-by-type/${selectedUserTypeForRole.id}`);
        if (refreshResponse.data.success) {
          const roles = refreshResponse.data.data || [];
          setUserRolesMap(prev => new Map(prev).set(selectedUserTypeForRole.id, roles));
          setRoleCountsMap(prev => new Map(prev).set(selectedUserTypeForRole.id, roles.length));
        }
      } catch (error) {
        console.error('Error updating role:', error);
        showMessage(error.response?.data?.message || 'Failed to update role', 'error');
      }
      return;
    }

    // Add mode - create new roles
    if (selectedComponents.length === 0) {
      showMessage('Please select at least one component', 'error');
      return;
    }

    // Check for duplicate entries
    const existingRoles = userRolesMap.get(selectedUserTypeForRole.id) || [];
    const existingComponentIds = existingRoles.map(role => Number(role.component_id || role.component));
    const duplicates = selectedComponents.filter(compId => existingComponentIds.includes(Number(compId)));
    
    if (duplicates.length > 0) {
      const duplicateNames = sysComponents
        .filter(comp => duplicates.includes(Number(comp.id)))
        .map(comp => comp.componentname)
        .join(', ');
      showMessage(`The following components are already assigned: ${duplicateNames}`, 'error');
      return;
    }

    try {
      // Create roles for all selected components
      const promises = selectedComponents.map(componentId => 
        api.post('/sys-users-roles/user-type', {
          sysroleid: selectedUserTypeForRole.id,
          component: Number(componentId),
          canaccesspage: roleFormData.canaccesspage ? 1 : 0,
          canapprove: roleFormData.canapprove ? 1 : 0,
          canreturn: roleFormData.canreturn ? 1 : 0,
          cancancel: roleFormData.cancancel ? 1 : 0,
          canprint: roleFormData.canprint ? 1 : 0,
          canread: roleFormData.canread ? 1 : 0,
          cancreate: roleFormData.cancreate ? 1 : 0,
          canupdate: roleFormData.canupdate ? 1 : 0,
          candelete: roleFormData.candelete ? 1 : 0,
          cansoftdelete: roleFormData.cansoftdelete ? 1 : 0
        })
      );

      const results = await Promise.all(promises);
      const failed = results.filter(r => !r.data.success);
      
      if (failed.length > 0) {
        showMessage(`Failed to add ${failed.length} role(s)`, 'error');
      } else {
        showMessage(`${selectedComponents.length} role(s) added successfully`);
        closeAddRoleModal();
        // Refresh roles for this user type
        const refreshResponse = await api.get(`/sys-users/user-roles-by-type/${selectedUserTypeForRole.id}`);
        if (refreshResponse.data.success) {
          const roles = refreshResponse.data.data || [];
          setUserRolesMap(prev => new Map(prev).set(selectedUserTypeForRole.id, roles));
          setRoleCountsMap(prev => new Map(prev).set(selectedUserTypeForRole.id, roles.length));
        }
      }
    } catch (error) {
      console.error('Error adding roles:', error);
      showMessage(error.response?.data?.message || 'Failed to add roles', 'error');
    }
  };

  // Handle Delete Role
  const handleDeleteRole = async (userType, role) => {
    if (!window.confirm(`Are you sure you want to delete the role for "${role.componentname}"?`)) {
      return;
    }

    try {
      await api.delete(`/sys-users-roles?sysroleid=${userType.id}&componentId=${role.component_id || role.component}`);
      showMessage('Role deleted successfully');
      // Refresh roles for this user type
      const refreshResponse = await api.get(`/sys-users/user-roles-by-type/${userType.id}`);
      if (refreshResponse.data.success) {
        const roles = refreshResponse.data.data || [];
        setUserRolesMap(prev => new Map(prev).set(userType.id, roles));
        setRoleCountsMap(prev => new Map(prev).set(userType.id, roles.length));
      }
    } catch (error) {
      console.error('Error deleting role:', error);
      showMessage(error.response?.data?.message || 'Failed to delete role', 'error');
    }
  };

  // Handle quick toggle update for a single permission field
  const handlePermissionToggle = async (userType, role, fieldName, newValue) => {
    try {
      const updateData = {
        canaccesspage: role.canaccesspage === 1,
        canapprove: role.canapprove === 1,
        canreturn: role.canreturn === 1,
        cancancel: role.cancancel === 1,
        canprint: role.canprint === 1,
        canread: role.canread === 1,
        cancreate: role.cancreate === 1,
        canupdate: role.canupdate === 1,
        candelete: role.candelete === 1,
        cansoftdelete: role.cansoftdelete === 1
      };
      
      // Update the specific field
      updateData[fieldName] = newValue;
      
      await api.put(`/sys-users-roles/${role.id}`, {
        canaccesspage: updateData.canaccesspage ? 1 : 0,
        canapprove: updateData.canapprove ? 1 : 0,
        canreturn: updateData.canreturn ? 1 : 0,
        cancancel: updateData.cancancel ? 1 : 0,
        canprint: updateData.canprint ? 1 : 0,
        canread: updateData.canread ? 1 : 0,
        cancreate: updateData.cancreate ? 1 : 0,
        canupdate: updateData.canupdate ? 1 : 0,
        candelete: updateData.candelete ? 1 : 0,
        cansoftdelete: updateData.cansoftdelete ? 1 : 0
      });
      
      // Update local state immediately for better UX
      const updatedRoles = (userRolesMap.get(userType.id) || []).map(r => 
        r.id === role.id 
          ? { ...r, [fieldName]: newValue ? 1 : 0 }
          : r
      );
      setUserRolesMap(prev => new Map(prev).set(userType.id, updatedRoles));
    } catch (error) {
      console.error('Error updating permission:', error);
      showMessage(error.response?.data?.message || 'Failed to update permission', 'error');
      // Refresh roles on error to revert UI
      const refreshResponse = await api.get(`/sys-users/user-roles-by-type/${userType.id}`);
      if (refreshResponse.data.success) {
        const roles = refreshResponse.data.data || [];
        setUserRolesMap(prev => new Map(prev).set(userType.id, roles));
      }
    }
  };

  // Expand all groups by default when components load
  useEffect(() => {
    if (components.length > 0 && Object.keys(expandedGroups).length === 0) {
      const groups = Object.keys(groupedComponents);
      const expanded = {};
      groups.forEach(group => {
        expanded[group] = true; // Default to expanded
      });
      setExpandedGroups(expanded);
    }
  }, [components, groupedComponents]);
  
  // Handle employee selection
  const handleEmployeeSelect = (employee) => {
    setEmployeeSearchTerm(formatEmployeeName(employee.surname, employee.firstname, employee.middlename));
    setUserFormData(prev => ({
      ...prev,
      emp_objid: employee.objid
    }));
    setShowEmployeeDropdown(false);
  };

  const handleUserSave = async () => {
    if (!userFormData.username) {
      showMessage('Username is required', 'error');
      return;
    }

    if (!editingUser && !userFormData.password) {
      showMessage('Password is required for new users', 'error');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('username', userFormData.username);
      if (userFormData.password) formData.append('password', userFormData.password);
      formData.append('usertype', userFormData.usertype || '');
      formData.append('emp_objid', userFormData.emp_objid || '');
      formData.append('status', userFormData.status);
      if (userPhotoFile) formData.append('photo', userPhotoFile);

      if (editingUser) {
        await api.put(`/sys-users/${editingUser.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        showMessage('User updated successfully');
      } else {
        await api.post('/sys-users', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        showMessage('User created successfully');
      }

      setShowUserModal(false);
      fetchSysUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      showMessage(error.response?.data?.message || 'Failed to save user', 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.delete(`/sys-users/${userId}`);
      showMessage('User deleted successfully');
      fetchSysUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      showMessage(error.response?.data?.message || 'Failed to delete user', 'error');
    }
  };

  const openPasswordModal = (userId) => {
    setPasswordUserId(userId);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      showMessage('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      await api.post(`/sys-users/${passwordUserId}/change-password`, {
        newPassword
      });
      showMessage('Password changed successfully');
      setShowPasswordModal(false);
      setNewPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      showMessage(error.response?.data?.message || 'Failed to change password', 'error');
    }
  };

  // ============================================
  // TAB 2: USER ROLES
  // ============================================
  
  const fetchSysComponents = async () => {
    setLoadingComponents(true);
    try {
      const response = await api.get('/sys-components');
      if (response.data.success) {
        setSysComponents(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching components:', error);
    } finally {
      setLoadingComponents(false);
    }
  };

  const fetchUserPermissions = async (userId) => {
    if (!userId) {
      setUserPermissions([]);
      return;
    }

    setLoadingRoles(true);
    try {
      const response = await api.get(`/sys-users-roles/user/${userId}`);
      if (response.data.success) {
        // Load actual permissions from database
        const permissions = response.data.data || [];
        
        // If user has saved permissions, use those actual values
        // Only apply default Administrator permissions if NO permissions exist in database
        const selectedUser = sysUsers.find(u => u.id === parseInt(userId));
        
        if (permissions.length > 0) {
          // User has saved permissions - use actual values from database
          setUserPermissions(permissions);
        } else if (selectedUser && selectedUser.typename === 'Administrator' && components.length > 0) {
          // No permissions in database but user is Administrator - set all to checked as default
          const allAdminPermissions = components.map(comp => ({
            component: comp.id,
            componentname: comp.componentname,
            canaccesspage: 1,
            canread: 1,
            cancreate: 1,
            canupdate: 1,
            candelete: 1
          }));
          setUserPermissions(allAdminPermissions);
        } else {
          // No permissions and not Administrator - empty array
          setUserPermissions([]);
        }
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    } finally {
      setLoadingRoles(false);
    }
  };

  // Helper function to get permission value from actual saved permissions
  const getPermissionValue = (componentId, permission) => {
    const userPerm = userPermissions.find(p => p.component === componentId);
    if (userPerm) {
      // Use actual saved value from database
      return userPerm[permission] === 1;
    }
    
    // No permission found in database - return false (don't default to checked)
    return false;
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchUserPermissions(selectedUserId);
    } else {
      setUserPermissions([]);
    }
  }, [selectedUserId, components.length, sysUsers.length]);

  const handlePermissionChange = (componentId, permission) => {
    setUserPermissions(prev => {
      const existing = prev.find(p => p.component === componentId);
      if (existing) {
        return prev.map(p =>
          p.component === componentId
            ? { ...p, [permission]: !p[permission] }
            : p
        );
      } else {
        return [...prev, {
          component: componentId,
          componentname: components.find(c => c.id === componentId)?.componentname || '',
          canaccesspage: permission === 'canaccesspage' ? 1 : 0,
          canread: permission === 'canread' ? 1 : 0,
          cancreate: permission === 'cancreate' ? 1 : 0,
          canupdate: permission === 'canupdate' ? 1 : 0,
          candelete: permission === 'candelete' ? 1 : 0
        }];
      }
    });
  };

  const handleGroupPermissionChange = (permission) => {
    // Check if all components have this permission enabled
    const allEnabled = components.every(comp => {
      const userPerm = userPermissions.find(p => p.component === comp.id);
      return userPerm?.[permission] === 1;
    });

    // Toggle: if all enabled, disable all; otherwise enable all
    const newValue = !allEnabled;

    setUserPermissions(prev => {
      const updated = [...prev];
      components.forEach(comp => {
        const existingIndex = updated.findIndex(p => p.component === comp.id);
        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            [permission]: newValue ? 1 : 0
          };
        } else {
          updated.push({
            component: comp.id,
            componentname: comp.componentname,
            canaccesspage: permission === 'canaccesspage' ? (newValue ? 1 : 0) : 0,
            canread: permission === 'canread' ? (newValue ? 1 : 0) : 0,
            cancreate: permission === 'cancreate' ? (newValue ? 1 : 0) : 0,
            canupdate: permission === 'canupdate' ? (newValue ? 1 : 0) : 0,
            candelete: permission === 'candelete' ? (newValue ? 1 : 0) : 0
          });
        }
      });
      return updated;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedUserId) {
      showMessage('Please select a user first', 'error');
      return;
    }

    try {
      // Use actual saved permissions from state
      const permissions = components.map(comp => {
        const userPerm = userPermissions.find(p => p.component === comp.id);
        
        // Use actual saved values from database if they exist
        if (userPerm) {
          return {
            componentId: comp.id,
            canaccesspage: userPerm.canaccesspage === 1,
            canread: userPerm.canread === 1,
            cancreate: userPerm.cancreate === 1,
            canupdate: userPerm.canupdate === 1,
            candelete: userPerm.candelete === 1
          };
        }
        
        // No permission in state - all false
        return {
          componentId: comp.id,
          canaccesspage: false,
          canread: false,
          cancreate: false,
          canupdate: false,
          candelete: false
        };
      });

      // Filter out components with no permissions checked (to reduce payload size)
      const permissionsToSend = permissions.filter(perm => 
        perm.canaccesspage || perm.canread || perm.cancreate || perm.canupdate || perm.candelete
      );
      
      console.log('📤 [handleSavePermissions] Sending permissions:', {
        userId: selectedUserId,
        totalComponents: components.length,
        permissionsWithChecks: permissionsToSend.length,
        permissionsTotal: permissions.length,
        samplePermissions: permissionsToSend.slice(0, 5),
        allComponentIds: permissionsToSend.map(p => p.componentId)
      });

      const response = await api.post('/sys-users-roles', {
        userId: selectedUserId,
        permissions: permissionsToSend
      });
      
      console.log('✅ [handleSavePermissions] Response:', response.data);

      showMessage('Permissions saved successfully');
      
      // Refresh permissions after saving
      fetchUserPermissions(selectedUserId);
    } catch (error) {
      console.error('Error saving permissions:', error);
      showMessage(error.response?.data?.message || 'Failed to save permissions', 'error');
    }
  };

  // ============================================
  // TAB 3: USER PARAMETERS
  // ============================================
  
  const fetchUserTypesParams = async () => {
    setLoadingUserTypes(true);
    try {
      const response = await api.get('/user-types');
      if (response.data.success) {
        setUserTypesParams(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching user types:', error);
    } finally {
      setLoadingUserTypes(false);
    }
  };

  // SysComponents CRUD
  const openComponentModal = (component = null) => {
    if (component) {
      setEditingComponent(component);
      setComponentFormData({ 
        componentname: component.componentname || '', 
        componentgroup: component.componentgroup || '', 
        panelmenuname: component.panelmenuname || '', 
        desc: component.desc || '' 
      });
    } else {
      setEditingComponent(null);
      setComponentFormData({ 
        componentname: '', 
        componentgroup: '', 
        panelmenuname: '', 
        desc: '' 
      });
    }
    setShowComponentModal(true);
  };

  const handleComponentSave = async () => {
    if (!componentFormData.componentname.trim()) {
      showMessage('Component name is required', 'error');
      return;
    }

    try {
      if (editingComponent) {
        await api.put(`/sys-components/${editingComponent.id}`, componentFormData);
        showMessage('Component updated successfully');
      } else {
        await api.post('/sys-components', componentFormData);
        showMessage('Component created successfully');
      }
      setShowComponentModal(false);
      fetchSysComponents();
    } catch (error) {
      console.error('Error saving component:', error);
      showMessage(error.response?.data?.message || 'Failed to save component', 'error');
    }
  };

  const handleDeleteComponent = async (componentId) => {
    if (!window.confirm('Are you sure you want to delete this component?')) return;

    try {
      await api.delete(`/sys-components/${componentId}`);
      showMessage('Component deleted successfully');
      fetchSysComponents();
    } catch (error) {
      console.error('Error deleting component:', error);
      showMessage(error.response?.data?.message || 'Failed to delete component', 'error');
    }
  };

  // UserTypes CRUD
  const openUserTypeModal = (userType = null) => {
    if (userType) {
      setEditingUserType(userType);
      setUserTypeFormData({ typename: userType.typename || '' });
    } else {
      setEditingUserType(null);
      setUserTypeFormData({ typename: '' });
    }
    setShowUserTypeModal(true);
  };

  const handleUserTypeSave = async () => {
    if (!userTypeFormData.typename.trim()) {
      showMessage('Type name is required', 'error');
      return;
    }

    try {
      if (editingUserType) {
        await api.put(`/user-types/${editingUserType.id}`, userTypeFormData);
        showMessage('User type updated successfully');
      } else {
        await api.post('/user-types', userTypeFormData);
        showMessage('User type created successfully');
      }
      setShowUserTypeModal(false);
      fetchUserTypesParams();
      fetchUserTypes(); // Refresh for dropdown
    } catch (error) {
      console.error('Error saving user type:', error);
      showMessage(error.response?.data?.message || 'Failed to save user type', 'error');
    }
  };

  const handleDeleteUserType = async (userTypeId) => {
    if (!window.confirm('Are you sure you want to delete this user type?')) return;

    try {
      await api.delete(`/user-types/${userTypeId}`);
      showMessage('User type deleted successfully');
      fetchUserTypesParams();
      fetchUserTypes();
    } catch (error) {
      console.error('Error deleting user type:', error);
      showMessage(error.response?.data?.message || 'Failed to delete user type', 'error');
    }
  };

  // Helper function
  const showMessage = (msg, type = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">System Users Management</h2>
        <p className="text-sm text-gray-600 mt-1">Manage system users, roles, and permissions</p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-4 p-3 rounded-md ${
          messageType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            System Users
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'roles'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            User Permission
          </button>
          <button
            onClick={() => setActiveTab('usertypes')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'usertypes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            User Types
          </button>
          <button
            onClick={() => setActiveTab('parameters')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'parameters'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Menu Components
          </button>
        </nav>
      </div>

      {/* Tab 1: System Users */}
      {activeTab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">System Users</h3>
            <button
              onClick={() => openUserModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add User
            </button>
          </div>

          {loadingUsers ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Photo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sysUsers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      sysUsers.map(user => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="h-10 w-10 rounded-full overflow-hidden bg-gray-200">
                              {user.photo ? (
                                <img src={user.photo} alt={user.username} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-gray-400 text-xs">
                                  {user.username.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {user.username}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.typename || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.surname && user.firstname
                              ? formatEmployeeName(user.surname, user.firstname, user.middlename)
                              : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              user.status === 1
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {user.status === 1 ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => openUserModal(user)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                              title="Edit"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => openPasswordModal(user.id)}
                              className="text-yellow-600 hover:text-yellow-900 mr-3"
                              title="Change Password"
                            >
                              🔑
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: User Roles */}
      {activeTab === 'roles' && (
        <div>
          {loadingUserTypes ? (
            <div className="text-center py-8">Loading user types...</div>
          ) : (
            <div className="space-y-4">
              {filteredUserTypes.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No user types found
                </div>
              ) : (
                filteredUserTypes.map(userType => (
                  <div key={userType.id} className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                    {/* Main Grid Row */}
                    <div className="p-4 flex items-center justify-between border-b">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleUserTypeExpand(userType.id)}
                          className="inline-flex items-center justify-center w-6 h-6 border rounded-full text-sm text-gray-600 hover:bg-gray-100"
                          aria-label={expandedUserTypes.has(userType.id) ? 'Collapse details' : 'Expand details'}
                        >
                          {expandedUserTypes.has(userType.id) ? '-' : '+'}
                        </button>
                        <div>
                          <div className="font-semibold">{userType.typename}</div>
                          <div className="text-xs text-gray-500">{(roleCountsMap.get(userType.id) || 0)} permission{(roleCountsMap.get(userType.id) || 0) !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => openAddRoleModal(userType)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      >
                        Add Permission
                      </button>
                    </div>
                    {/* Nested Grid - Grouped by Component Group */}
                    {expandedUserTypes.has(userType.id) && (
                      <div className="overflow-x-auto">
                        {loadingUserRoles ? (
                          <div className="p-4 text-center text-gray-500">Loading roles...</div>
                        ) : (() => {
                          const roles = userRolesMap.get(userType.id) || [];
                          
                          // Group roles by componentgroup
                          const groupedRoles = roles.reduce((acc, role) => {
                            const groupName = role.componentgroup || 'Uncategorized';
                            if (!acc[groupName]) {
                              acc[groupName] = [];
                            }
                            acc[groupName].push(role);
                            return acc;
                          }, {});
                          
                          const groupNames = Object.keys(groupedRoles).sort();
                          
                          if (groupNames.length === 0) {
                            return (
                              <div className="p-4 text-center text-gray-500">
                                No roles found
                              </div>
                            );
                          }
                          
                          return (
                            <div className="divide-y divide-gray-200">
                              {groupNames.map((groupName) => {
                                const groupRoles = groupedRoles[groupName];
                                const expandedGroupsForType = expandedComponentGroups.get(userType.id) || new Set();
                                const isGroupExpanded = expandedGroupsForType.has(groupName);
                                
                                return (
                                  <div key={groupName} className="border-b border-gray-200">
                                    {/* Component Group Header */}
                                    <div 
                                      className="px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                                      onClick={() => {
                                        const newMap = new Map(expandedComponentGroups);
                                        const groupsSet = new Set(expandedGroupsForType);
                                        
                                        if (isGroupExpanded) {
                                          groupsSet.delete(groupName);
                                        } else {
                                          groupsSet.add(groupName);
                                        }
                                        
                                        newMap.set(userType.id, groupsSet);
                                        setExpandedComponentGroups(newMap);
                                      }}
                                    >
                                      <div className="flex items-center gap-3">
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center w-5 h-5 text-gray-600 hover:text-gray-800 transition-transform"
                                          style={{ transform: isGroupExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newMap = new Map(expandedComponentGroups);
                                            const groupsSet = new Set(expandedGroupsForType);
                                            
                                            if (isGroupExpanded) {
                                              groupsSet.delete(groupName);
                                            } else {
                                              groupsSet.add(groupName);
                                            }
                                            
                                            newMap.set(userType.id, groupsSet);
                                            setExpandedComponentGroups(newMap);
                                          }}
                                        >
                                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                          </svg>
                                        </button>
                                        <div>
                                          <div className="font-semibold text-gray-900">{groupName}</div>
                                          <div className="text-xs text-gray-500">{groupRoles.length} permission{groupRoles.length !== 1 ? 's' : ''}</div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Grouped Roles Table */}
                                    {isGroupExpanded && (
                                      <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-50">
                                            <tr>
                                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Component Name</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Menu Panel</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Approve</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Return</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cancel</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Print</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Read</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Create</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Update</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Delete</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Soft Delete</th>
                                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                                            </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                            {groupRoles.map((role) => (
                                              <tr key={role.id}>
                                                <td className="px-4 py-2">
                                                  <div>
                                                    <div className="font-semibold text-gray-900">
                                                      {role.panelmenuname || 'Untitled Panel'}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                      {role.componentname || '—'}
                                                    </div>
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.canaccesspage === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'canaccesspage', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.canapprove === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'canapprove', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.canreturn === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'canreturn', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.cancancel === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'cancancel', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.canprint === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'canprint', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.canread === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'canread', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.cancreate === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'cancreate', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.canupdate === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'canupdate', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">{role.candelete === 1 ? '✓' : '—'}</td>
                                                <td className="px-4 py-2 text-center">
                                                  <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="sr-only peer"
                                                      checked={role.cansoftdelete === 1}
                                                      onChange={(e) => handlePermissionToggle(userType, role, 'cansoftdelete', e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                                                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                                                  </label>
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                  <div className="flex items-center justify-center space-x-2">
                                                    <button
                                                      onClick={() => openAddRoleModal(userType, role)}
                                                      className="text-blue-600 hover:text-blue-800 transition-colors"
                                                      title="Edit Role"
                                                    >
                                                      ✏️
                                                    </button>
                                                    <button
                                                      onClick={() => handleDeleteRole(userType, role)}
                                                      className="text-red-600 hover:text-red-800 transition-colors"
                                                      title="Delete Role"
                                                    >
                                                      🗑️
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: User Types */}
      {activeTab === 'usertypes' && (
        <div className="space-y-8">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">User Types</h3>
              <button
                onClick={() => openUserTypeModal()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add User Type
              </button>
            </div>

            {loadingUserTypes ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUserTypes.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="px-6 py-8 text-center text-gray-500">
                            No user types found
                          </td>
                        </tr>
                      ) : (
                        filteredUserTypes.map(type => (
                          <tr key={type.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{type.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{type.typename}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openUserTypeModal(type)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                  title="Edit User Type"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteUserType(type.id)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete User Type"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: User Parameters */}
      {activeTab === 'parameters' && (
        <div className="space-y-8">
          {/* SysComponents Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">System Components</h3>
              <button
                onClick={() => openComponentModal()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Component
              </button>
            </div>

            {/* Search and Filter Bar */}
            <div className="mb-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Search Box */}
                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search components..."
                      value={componentSearchTerm}
                      onChange={(e) => setComponentSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Group Filter */}
                <div>
                  <select
                    value={componentGroupFilter}
                    onChange={(e) => setComponentGroupFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Groups</option>
                    <option value="uncategorized">Uncategorized</option>
                    {componentGroups.map(group => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Results Count */}
              <div className="mt-3 text-sm text-gray-600">
                Showing {filteredComponents.length} of {sysComponents.length} components
              </div>
            </div>

            {loadingComponents ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="space-y-4">
                {filteredComponents.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                    {sysComponents.length === 0 ? 'No components found' : 'No components match your filters'}
                  </div>
                ) : (
                  filteredComponents.map(comp => (
                    <div key={comp.id} className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                      {/* Main Grid Row */}
                      <div className="p-4 flex items-center justify-between border-b">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleComponentExpand(comp.id)}
                            className="inline-flex items-center justify-center w-6 h-6 border rounded-full text-sm text-gray-600 hover:bg-gray-100"
                            aria-label={expandedComponents.has(comp.id) ? 'Collapse details' : 'Expand details'}
                          >
                            {expandedComponents.has(comp.id) ? '-' : '+'}
                          </button>
                          <div>
                            <div className="font-semibold">{comp.componentname}</div>
                            <div className="text-xs text-gray-500">
                              {comp.componentgroup || 'Uncategorized'} • {(controlCountsMap.get(comp.id) || 0)} control{(controlCountsMap.get(comp.id) || 0) !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openAddControlModal(comp)}
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                          >
                            Add Control
                          </button>
                          <button
                            onClick={() => openComponentModal(comp)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Edit Component"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteComponent(comp.id)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete Component"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      {/* Nested Grid */}
                      {expandedComponents.has(comp.id) && (
                        <div className="overflow-x-auto">
                          {loadingControls ? (
                            <div className="p-4 text-center text-gray-500">Loading controls...</div>
                          ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Control ID</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Control Name</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Display Name</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {(componentControlsMap.get(comp.id) || []).length === 0 ? (
                                  <tr>
                                    <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                                      No controls found
                                    </td>
                                  </tr>
                                ) : (
                                  (componentControlsMap.get(comp.id) || []).map((control) => (
                                    <tr key={control.controlid}>
                                      <td className="px-4 py-2">{control.controlid || '—'}</td>
                                      <td className="px-4 py-2">{control.controlname || '—'}</td>
                                      <td className="px-4 py-2">{control.displayname || '—'}</td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        <button
                                          onClick={() => openAddControlModal(comp, control)}
                                          className="text-blue-600 hover:text-blue-800 transition-colors mr-2"
                                          title="Edit Control"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => handleDeleteControl(comp, control)}
                                          className="text-red-600 hover:text-red-800 transition-colors"
                                          title="Delete Control"
                                        >
                                          🗑️
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEmployeeDropdown(false);
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingUser ? 'Edit User' : 'Add User'}
            </h3>
            
            <div className="space-y-4">
              {/* Employee Object ID - Moved to top as lookup */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <div className="relative">
                  <input
                    type="text"
                    value={employeeSearchTerm}
                    onChange={(e) => {
                      setEmployeeSearchTerm(e.target.value);
                      setShowEmployeeDropdown(true);
                      // Clear emp_objid if search term is cleared
                      if (!e.target.value) {
                        setUserFormData(prev => ({ ...prev, emp_objid: '' }));
                      }
                    }}
                    onFocus={() => setShowEmployeeDropdown(true)}
                    placeholder="Search employee by name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {showEmployeeDropdown && employeeSearchTerm && filteredEmployees.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {filteredEmployees.slice(0, 20).map(employee => (
                        <div
                          key={employee.objid}
                          onClick={() => handleEmployeeSelect(employee)}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0 flex items-center space-x-3"
                        >
                          {employee.photo_path ? (
                            <img
                              src={employee.photo_path}
                              alt={employee.surname}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600">
                              {(employee.surname?.charAt(0) || '') + (employee.firstname?.charAt(0) || '')}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {formatEmployeeName(employee.surname, employee.firstname, employee.middlename)}
                            </div>
                            {employee.dtruserid && (
                              <div className="text-sm text-gray-500">ID: {employee.dtruserid}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {userFormData.emp_objid && (
                  <p className="mt-1 text-xs text-gray-500">Selected: {employeeSearchTerm}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  name="username"
                  value={userFormData.username}
                  onChange={handleUserInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingUser ? '' : '*'}
                </label>
                <input
                  type="password"
                  name="password"
                  value={userFormData.password}
                  onChange={handleUserInputChange}
                  placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                <select
                  name="usertype"
                  value={userFormData.usertype}
                  onChange={handleUserInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select --</option>
                  {userTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.typename}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  value={userFormData.status}
                  onChange={handleUserInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUserPhotoChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {userPhotoPreview && (
                  <div className="mt-2">
                    <img src={userPhotoPreview} alt="Preview" className="h-20 w-20 rounded-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowUserModal(false);
                  setShowEmployeeDropdown(false);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEmployeeDropdown(false);
                  handleUserSave();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Change Password</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Component Modal */}
      {showComponentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingComponent ? 'Edit Component' : 'Add Component'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Component Name *</label>
                <input
                  type="text"
                  value={componentFormData.componentname}
                  onChange={(e) => setComponentFormData({ ...componentFormData, componentname: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Component Group</label>
                <select
                  value={componentFormData.componentgroup}
                  onChange={(e) => setComponentFormData({ ...componentFormData, componentgroup: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select Component Group --</option>
                  <option value="DTR">DTR</option>
                  <option value="201 Files">201 Files</option>
                  <option value="Payroll">Payroll</option>
                  <option value="Reports">Reports</option>
                  <option value="System Setup">System Setup</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Panel Menu Name</label>
                <input
                  type="text"
                  value={componentFormData.panelmenuname}
                  onChange={(e) => setComponentFormData({ ...componentFormData, panelmenuname: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={componentFormData.desc}
                  onChange={(e) => setComponentFormData({ ...componentFormData, desc: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowComponentModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleComponentSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Type Modal */}
      {showUserTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">
              {editingUserType ? 'Edit User Type' : 'Add User Type'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type Name *</label>
                <input
                  type="text"
                  value={userTypeFormData.typename}
                  onChange={(e) => setUserTypeFormData({ typename: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowUserTypeModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUserTypeSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && selectedUserTypeForRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingRole ? 'Edit Role' : 'Add Role'} for {selectedUserTypeForRole.typename}
            </h3>
            
            <div className="space-y-4">
              {!editingRole && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Components *</label>
                <div className="border border-gray-300 rounded-md p-4 max-h-64 overflow-y-auto bg-gray-50">
                  {(() => {
                    // Get existing component IDs for this user type
                    const existingRoles = userRolesMap.get(selectedUserTypeForRole.id) || [];
                    const existingComponentIds = existingRoles.map(role => Number(role.component_id || role.component));
                    
                    // Group components by componentgroup
                    const grouped = sysComponents.reduce((acc, comp) => {
                      const group = comp.componentgroup || 'Uncategorized';
                      if (!acc[group]) acc[group] = [];
                      acc[group].push(comp);
                      return acc;
                    }, {});
                    
                    return Object.keys(grouped).sort().map(groupName => (
                      <div key={groupName} className="mb-4 last:mb-0">
                        <div className="font-semibold text-sm text-gray-700 mb-2 border-b border-gray-300 pb-1">
                          {groupName}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {grouped[groupName].map(comp => {
                            const compId = Number(comp.id);
                            const isAlreadyAssigned = existingComponentIds.includes(compId);
                            return (
                              <label
                                key={comp.id}
                                className={`flex items-start space-x-2 p-2 rounded hover:bg-gray-100 ${
                                  isAlreadyAssigned ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedComponents.includes(compId)}
                                  onChange={() => !isAlreadyAssigned && toggleComponentSelection(compId)}
                                  disabled={isAlreadyAssigned}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-700">
                                    {comp.componentname}
                                    {isAlreadyAssigned && (
                                      <span className="ml-2 text-xs text-gray-500 italic">(already assigned)</span>
                                    )}
                                  </div>
                                  {comp.panelmenuname && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {comp.panelmenuname}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                  {sysComponents.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-4">No components available</div>
                  )}
                </div>
                {selectedComponents.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    {selectedComponents.length} component(s) selected
                  </div>
                )}
              </div>
              )}
              {editingRole && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Component</label>
                <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                  <div className="text-sm font-medium text-gray-700">
                    {sysComponents.find(c => Number(c.id) === Number(editingRole.component_id || editingRole.component))?.componentname || '—'}
                  </div>
                  {sysComponents.find(c => Number(c.id) === Number(editingRole.component_id || editingRole.component))?.panelmenuname && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {sysComponents.find(c => Number(c.id) === Number(editingRole.component_id || editingRole.component))?.panelmenuname}
                    </div>
                  )}
                </div>
              </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Can Access this Page</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.canaccesspage}
                      onChange={(e) => setRoleFormData({ ...roleFormData, canaccesspage: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Approver</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.canapprove}
                      onChange={(e) => setRoleFormData({ ...roleFormData, canapprove: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Return</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.canreturn}
                      onChange={(e) => setRoleFormData({ ...roleFormData, canreturn: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Cancel</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.cancancel}
                      onChange={(e) => setRoleFormData({ ...roleFormData, cancancel: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Can Print</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.canprint}
                      onChange={(e) => setRoleFormData({ ...roleFormData, canprint: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Create/Add</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.cancreate}
                      onChange={(e) => setRoleFormData({ ...roleFormData, cancreate: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Read/View</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.canread}
                      onChange={(e) => setRoleFormData({ ...roleFormData, canread: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Can Edit/Update</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.canupdate}
                      onChange={(e) => setRoleFormData({ ...roleFormData, canupdate: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Can Record Delete</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={roleFormData.cansoftdelete}
                      onChange={(e) => setRoleFormData({ ...roleFormData, cansoftdelete: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                  </label>
                </div>

                {currentUser?.usertype === 1 && (
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">Can Delete</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={roleFormData.candelete}
                        onChange={(e) => setRoleFormData({ ...roleFormData, candelete: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-500"></div>
                      <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={closeAddRoleModal}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingRole ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Control Modal */}
      {showAddControlModal && selectedComponentForControl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">
              {editingControl ? 'Edit Control' : 'Add Control'} for {selectedComponentForControl.componentname}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Control Name *</label>
                <input
                  type="text"
                  value={controlFormData.controlname}
                  onChange={(e) => setControlFormData({ ...controlFormData, controlname: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., transactions, used"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={controlFormData.displayname}
                  onChange={(e) => setControlFormData({ ...controlFormData, displayname: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Credit Transactions, Used Credits"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={closeAddControlModal}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddControlSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingControl ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SysUser;

