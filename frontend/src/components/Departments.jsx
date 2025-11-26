import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../utils/employeenameFormatter';

function Departments() {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = 'departments';
  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [formData, setFormData] = useState({
    departmentname: '',
    departmentshortname: '',
    parentdept: 0,
    isdepartment: 1,
    emp_objid: null,
    officehead: '',
    accountcode: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const initializedExpansion = useRef(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const normalizeDepartment = (dept) => {
    const normalizeIsDepartment = (value) => {
      if (value === null || value === undefined) {
        return 1;
      }
      return Number(value) === 1 ? 1 : 0;
    };

    const deptid = Number(dept.deptid ?? dept.DEPTID ?? 0);
    const departmentname = dept.departmentname ?? dept.DEPARTMENTNAME ?? dept.DEPTNAME ?? '';
    const departmentshortname = dept.departmentshortname ?? dept.DEPARTMENTSHORTNAME ?? '';
    const superdeptid = Number(dept.superdeptid ?? dept.SUPDEPTID ?? 0) || 0;
    const parentdept = Number(dept.parentdept ?? dept.PARENTDEPT ?? 0) || 0;
    const isdepartment = normalizeIsDepartment(dept.isdepartment ?? dept.ISDEPARTMENT);
    const emp_objid = dept.emp_objid ?? dept.EMP_OBJID ?? null;
    const officehead = dept.officehead ?? dept.OFFICEHEAD ?? null;

    return {
      deptid,
      departmentname,
      departmentshortname,
      superdeptid,
      parentdept,
      isdepartment,
      emp_objid,
      officehead
    };
  };

  const getEffectiveParentId = (dept) => {
    const parentId = Number(dept.parentdept || 0);
    const superId = Number(dept.superdeptid || 0);

    if (parentId && parentId !== dept.deptid) {
      return parentId;
    }

    if (superId && superId !== dept.deptid) {
      return superId;
    }

    return 0;
  };

  const getDefaultParentDeptId = () => {
    const preferred = departments.find((dept) => dept.deptid === 1);
    if (preferred) return preferred.deptid;
    return departments[0]?.deptid ?? 0;
  };

  // Format office head name: FirstName MiddleInitial. LastName
  const formatOfficeHeadName = (employee) => {
    if (!employee) return '';
    
    const firstName = (employee.firstname || '').trim();
    const middleName = (employee.middlename || '').trim();
    const lastName = (employee.surname || '').trim();
    
    let formatted = firstName;
    
    if (middleName) {
      const middleInitial = middleName.charAt(0).toUpperCase() + '.';
      formatted += ` ${middleInitial}`;
    }
    
    if (lastName) {
      formatted += ` ${lastName}`;
    }
    
    return formatted.trim();
  };

  // Fetch employees for search
  const fetchEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      console.log('🔄 [DEPARTMENTS] Fetching employees for search...');
      const response = await api.get('/201-employees');
      console.log('✅ [DEPARTMENTS] Employees API response:', response.data);
      const employees = response.data?.data || response.data || [];
      console.log('✅ [DEPARTMENTS] Loaded employees:', employees.length);
      setAllEmployees(employees);
    } catch (error) {
      console.error('❌ [DEPARTMENTS] Error fetching employees:', error);
      setAllEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Filter employees based on search term
  useEffect(() => {
    if (!employeeSearch.trim()) {
      setFilteredEmployees([]);
      return;
    }
    
    // Don't filter if employees haven't been loaded yet
    if (allEmployees.length === 0) {
      setFilteredEmployees([]);
      return;
    }
    
    const searchLower = employeeSearch.toLowerCase();
    const filtered = allEmployees.filter(emp => {
      const surname = String(emp.surname || '').toLowerCase();
      const firstname = String(emp.firstname || '').toLowerCase();
      const middlename = String(emp.middlename || '').toLowerCase();
      const fullname = formatEmployeeName(emp.surname, emp.firstname, emp.middlename).toLowerCase();
      const badgeNumber = String(emp.dtrbadgenumber || emp.badgenumber || emp.BadgeNumber || '').toLowerCase();
      const dtrUserId = String(emp.dtruserid || emp.DTRuserID || '').toLowerCase();
      const idno = String(emp.idno || '').toLowerCase();
      
      return fullname.includes(searchLower) || 
             surname.includes(searchLower) ||
             firstname.includes(searchLower) ||
             middlename.includes(searchLower) ||
             badgeNumber.includes(searchLower) ||
             dtrUserId.includes(searchLower) ||
             idno.includes(searchLower);
    });
    
    setFilteredEmployees(filtered.slice(0, 10)); // Limit to 10 results
  }, [employeeSearch, allEmployees]);

  // Handle employee selection
  const handleEmployeeSelect = (employee) => {
    setSelectedEmployee(employee);
    const formattedName = formatOfficeHeadName(employee);
    setFormData(prev => ({
      ...prev,
      emp_objid: employee.objid,
      officehead: formattedName
    }));
    setEmployeeSearch('');
    setFilteredEmployees([]);
  };

  // Clear employee selection
  const handleClearEmployee = () => {
    setSelectedEmployee(null);
    setFormData(prev => ({
      ...prev,
      emp_objid: null,
      officehead: ''
    }));
    setEmployeeSearch('');
  };

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    if (!canRead) {
      setDepartments([]);
      return;
    }
    try {
      setLoading(true);
      console.log('🔄 [DEPARTMENTS] Fetching departments...');
      
      const response = await api.get('/departments');
      console.log('✅ [DEPARTMENTS] API Response:', response.data);
      
      if (response.data && response.data.success && response.data.data) {
        const normalized = response.data.data.map(normalizeDepartment);
        setDepartments(normalized);
        setExpandedNodes(new Set());
        initializedExpansion.current = false;
        console.log('✅ [DEPARTMENTS] Loaded departments:', normalized.length);
      } else {
        console.log('❌ [DEPARTMENTS] No data in response');
        setDepartments([]);
      }
    } catch (error) {
      console.error('❌ [DEPARTMENTS] Error fetching departments:', error);
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  // Load departments on component mount
  useEffect(() => {
    if (permissionsLoading) return;
    fetchDepartments();
  }, [permissionsLoading, fetchDepartments]);

  // Fetch employees when component mounts (needed for head of office display)
  useEffect(() => {
    if (permissionsLoading || !canRead) return;
    if (allEmployees.length === 0) {
      fetchEmployees();
    }
  }, [permissionsLoading, canRead, allEmployees.length, fetchEmployees]);

  // Build tree structure from flat departments array
  const buildTree = (departments) => {
    const departmentMap = new Map();
    const rootDepartments = [];

    // Create a map of all departments
    departments.forEach(dept => {
      departmentMap.set(dept.deptid, { ...dept, children: [] });
    });

    // Build the tree structure
    departments.forEach(dept => {
      const department = departmentMap.get(dept.deptid);
      if (!department) return;

      const parentId = getEffectiveParentId(dept);

      if (!parentId) {
        // Root department
        rootDepartments.push(department);
      } else {
        // Child department
        const parent = departmentMap.get(parentId);
        if (parent) {
          parent.children.push(department);
        } else {
          // Parent not found, treat as root
          rootDepartments.push(department);
        }
      }
    });

    return rootDepartments;
  };

  // Filter departments based on search term
  const filterDepartments = (departments, searchTerm) => {
    return departments
      .map((dept) => {
        const childrenFiltered = dept.children ? filterDepartments(dept.children, searchTerm) : [];
        const matchesSearch = searchTerm
          ? (dept.departmentname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            dept.departmentshortname?.toLowerCase().includes(searchTerm.toLowerCase()))
          : true;

        if (matchesSearch || childrenFiltered.length > 0) {
          return { ...dept, children: childrenFiltered };
        }
        return null;
      })
      .filter(Boolean);
  };

  const isTopLevel = (dept) => {
    return getEffectiveParentId(dept) === 0;
  };

  // Toggle node expansion
  const toggleNode = (deptId) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(deptId)) {
      newExpanded.delete(deptId);
    } else {
      newExpanded.add(deptId);
    }
    setExpandedNodes(newExpanded);
  };

  // Get parent department name
  const getParentDepartmentName = (dept) => {
    const parentId = getEffectiveParentId(dept);
    if (!parentId) return 'None';
    const parent = departments.find(item => item.deptid === parentId);
    return parent ? parent.departmentname : 'Unknown';
  };

  // Get head of office display
  const getHeadOfOfficeDisplay = (dept) => {
    if (dept.emp_objid && allEmployees.length > 0) {
      const employee = allEmployees.find(emp => emp.objid === dept.emp_objid);
      if (employee) {
        return formatOfficeHeadName(employee);
      }
    }
    // If no employee found or emp_objid is null, return officehead
    return dept.officehead || '—';
  };

  // Render tree node
  const renderTreeNode = (department, level = 0) => {
    const hasChildren = department.children && department.children.length > 0;
    const isExpanded = expandedNodes.has(department.deptid);
    const indentStyle = { paddingLeft: `${level * 24}px` };
    const isProtectedLevel = level <= 0; // Disable delete for top level
    const isDepartment = Number(department.isdepartment) === 1;
    const recordLabel = isDepartment ? 'Department' : 'Unit';
    const canDeleteLevel = !isProtectedLevel;

    return (
      <React.Fragment key={department.deptid}>
        <tr className="hover:bg-gray-50 border-b border-gray-200">
          {/* Expand/Collapse Column */}
          <td className="px-4 py-3 text-center">
            {hasChildren ? (
              <button
                onClick={() => toggleNode(department.deptid)}
                className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
              >
                {isExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ) : (
              <div className="w-6 h-6"></div>
            )}
          </td>

          {/* Department Name with Hierarchy */}
          <td className="px-4 py-3">
            <div className="flex items-center" style={indentStyle}>
              {/* Hierarchy Lines */}
              <div className="flex items-center mr-2">
                {Array.from({ length: level }, (_, i) => (
                  <div key={i} className="w-6 h-px bg-gray-300 mr-2"></div>
                ))}
              </div>
              
              {/* Department Name */}
              <div className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm mr-3 ${
                    isDepartment ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'
                  }`}
                >
                  {department.departmentname.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{department.departmentname}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                        isDepartment ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {recordLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </td>

          {/* Short Name */}
          <td className="px-4 py-3 text-sm text-gray-500">
            {department.departmentshortname || '—'}
          </td>

          {/* Parent Department */}
          <td className="px-4 py-3 text-sm text-gray-500">
            {getParentDepartmentName(department)}
          </td>

          {/* Head of Office */}
          <td className="px-4 py-3 text-sm text-gray-500">
            {getHeadOfOfficeDisplay(department)}
          </td>

          {/* Actions */}
          <td className="px-4 py-3 text-sm font-medium text-center">
            <div className="flex items-center justify-center space-x-3">
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => openEditModal(department)}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                  title={`Edit ${recordLabel}`}
                >
                  ✏️
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteDepartment(department.deptid)}
                  disabled={!canDeleteLevel}
                  className={`transition-colors ${
                    canDeleteLevel ? 'text-red-600 hover:text-red-800' : 'text-gray-300 cursor-not-allowed'
                  }`}
                  title={
                    !canDeleteLevel
                      ? 'Cannot delete top-level records'
                      : `Delete ${recordLabel}`
                  }
                >
                  🗑️
                </button>
              )}
            </div>
          </td>
        </tr>

        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <>
            {department.children.map(child => renderTreeNode(child, level + 1))}
          </>
        )}
      </React.Fragment>
    );
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const numericFields = new Set(['parentdept', 'isdepartment']);

    let nextValue = value;
    if (type === 'checkbox') {
      nextValue = checked ? 1 : 0;
    }

    setFormData(prev => ({
      ...prev,
      [name]: numericFields.has(name) ? Number(nextValue) : nextValue
    }));
  };

  // Handle employee search input change
  const handleEmployeeSearchChange = (e) => {
    setEmployeeSearch(e.target.value);
  };

  // Handle add department
  const handleAddDepartment = async (e) => {
    e.preventDefault();
    if (!canCreate) {
      alert('You do not have permission to create departments.');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        departmentname: formData.departmentname?.trim(),
        departmentshortname: formData.departmentshortname?.trim() || null,
        superdeptid: null,
        parentdept: Number(formData.parentdept) || 0,
        isdepartment: Number(formData.isdepartment) === 1 ? 1 : 0,
        emp_objid: formData.emp_objid || null,
        officehead: formData.officehead?.trim() || null,
        accountcode: formData.accountcode?.trim() || null
      };

      const response = await api.post('/departments', payload);
      
      if (response.data.success) {
        alert('Department added successfully!');
        setShowAddModal(false);
        setFormData({
          departmentname: '',
          departmentshortname: '',
          parentdept: getDefaultParentDeptId(),
          isdepartment: 1,
          emp_objid: null,
          officehead: '',
          accountcode: ''
        });
        setSelectedEmployee(null);
        setEmployeeSearch('');
        setFilteredEmployees([]);
        fetchDepartments();
      } else {
        alert('Error adding department: ' + response.data.message);
      }
    } catch (error) {
      console.error('Error adding department:', error);
      alert('Error adding department. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit department
  const handleEditDepartment = async (e) => {
    e.preventDefault();
    if (!canUpdate) {
      alert('You do not have permission to update departments.');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        departmentname: formData.departmentname?.trim(),
        departmentshortname: formData.departmentshortname?.trim() || null,
        superdeptid: null,
        parentdept: Number(formData.parentdept) || 0,
        isdepartment: Number(formData.isdepartment) === 1 ? 1 : 0,
        emp_objid: formData.emp_objid || null,
        officehead: formData.officehead?.trim() || null,
        accountcode: formData.accountcode?.trim() || null
      };

      const response = await api.put(`/departments/${selectedDepartment.deptid}`, payload);
      
      if (response.data.success) {
        alert('Department updated successfully!');
        setShowEditModal(false);
        setSelectedDepartment(null);
        setFormData({
          departmentname: '',
          departmentshortname: '',
          parentdept: getDefaultParentDeptId(),
          isdepartment: 1,
          emp_objid: null,
          officehead: '',
          accountcode: ''
        });
        setSelectedEmployee(null);
        setEmployeeSearch('');
        setFilteredEmployees([]);
        fetchDepartments();
      } else {
        alert('Error updating department: ' + response.data.message);
      }
    } catch (error) {
      console.error('Error updating department:', error);
      alert('Error updating department. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete department
  const handleDeleteDepartment = async (departmentId) => {
    if (!canDelete) {
      alert('You do not have permission to delete departments.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this department?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await api.delete(`/departments/${departmentId}`);
      
      if (response.data.success) {
        alert('Department deleted successfully!');
        fetchDepartments();
      } else {
        alert('Error deleting department: ' + response.data.message);
      }
    } catch (error) {
      console.error('Error deleting department:', error);
      alert('Error deleting department. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Open edit modal
  const openEditModal = async (department) => {
    if (!canUpdate) {
      alert('You do not have permission to update departments.');
      return;
    }
    setSelectedDepartment(department);
    
    // Fetch employees if not already loaded
    if (allEmployees.length === 0) {
      await fetchEmployees();
    }
    
    // Load employee if emp_objid exists
    let employee = null;
    if (department.emp_objid) {
      employee = allEmployees.find(emp => emp.objid === department.emp_objid);
      // If not found in cached list, try fetching
      if (!employee) {
        try {
          const response = await api.get('/201-employees');
          const employees = response.data?.data || response.data || [];
          employee = employees.find(emp => emp.objid === department.emp_objid);
        } catch (error) {
          console.error('Error loading employee:', error);
        }
      }
    }
    
    setSelectedEmployee(employee);
    setEmployeeSearch('');
    setFilteredEmployees([]);
    setFormData({
      departmentname: department.departmentname || '',
      departmentshortname: department.departmentshortname || '',
      parentdept: getEffectiveParentId(department) || 0,
      isdepartment: department.isdepartment ?? 1,
      emp_objid: department.emp_objid || null,
      officehead: department.officehead || '',
      accountcode: department.accountcode || ''
    });
    setShowEditModal(true);
  };

  // Close modals
  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setSelectedDepartment(null);
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setFilteredEmployees([]);
    setFormData({
      departmentname: '',
      departmentshortname: '',
      parentdept: getDefaultParentDeptId(),
      isdepartment: 1,
      emp_objid: null,
      officehead: '',
      accountcode: ''
    });
  };

  // Toggle department flag in form
  const toggleFormDepartmentFlag = () => {
    setFormData((prev) => ({
      ...prev,
      isdepartment: prev.isdepartment === 1 ? 0 : 1
    }));
  };

  const handleOpenAddModal = async () => {
    if (!canCreate) {
      alert('You do not have permission to create departments.');
      return;
    }
    setFormData({
      departmentname: '',
      departmentshortname: '',
      parentdept: getDefaultParentDeptId(),
      isdepartment: 1,
      emp_objid: null,
      officehead: '',
      accountcode: ''
    });
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setFilteredEmployees([]);
    // Fetch employees when modal opens
    if (allEmployees.length === 0) {
      await fetchEmployees();
    }
    setShowAddModal(true);
  };

  // Build tree and filter
  const treeData = buildTree(departments);
  const filteredTreeData = filterDepartments(treeData, searchTerm);

  useEffect(() => {
    if (!initializedExpansion.current && filteredTreeData.length > 0) {
      const next = new Set();
      const walk = (nodes) => {
        nodes.forEach((node) => {
          if (node.children && node.children.length > 0) {
            next.add(node.deptid);
            walk(node.children);
          }
        });
      };
      walk(filteredTreeData);
      setExpandedNodes(next);
      initializedExpansion.current = true;
    }
  }, [filteredTreeData]);

  if (permissionsLoading) {
    return (
      <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
        Loading permissions...
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
        You do not have permission to view departments.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search departments..."
              className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={!canRead}
            />
          </div>
          
          {canCreate && (
            <button
              onClick={handleOpenAddModal}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition duration-200 ease-in-out flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Add Department</span>
            </button>
          )}
        </div>
      </div>

      {/* Tree Grid */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading && (
          <div className="p-4 text-center">
            <div className="inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-gray-600">Loading departments...</span>
            </div>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Short Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parent Department
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Head of Office
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTreeData.length === 0 && !loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    {searchTerm ? 'No departments found matching your search.' : 'No departments available.'}
                  </td>
                </tr>
              ) : (
                filteredTreeData.map(department => renderTreeNode(department))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {departments.length}
            </div>
            <div className="text-sm text-gray-600">Total Records</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">
              {departments.filter(dept => Number(dept.isdepartment) === 1).length}
            </div>
            <div className="text-sm text-gray-600">Departments</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {departments.filter(dept => Number(dept.isdepartment) === 0).length}
            </div>
            <div className="text-sm text-gray-600">Units</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {departments.filter(dept => getEffectiveParentId(dept) === 0).length}
            </div>
            <div className="text-sm text-gray-600">Top-Level Entries</div>
          </div>
        </div>
      </div>

      {/* Add Department Modal */}
      {showAddModal && canCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Add New Department</h3>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAddDepartment} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    name="departmentname"
                    value={formData.departmentname}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter department name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Name
                  </label>
                  <input
                    type="text"
                    name="departmentshortname"
                    value={formData.departmentshortname}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={10}
                    placeholder="Optional short code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Department
                  </label>
                  <select
                    name="parentdept"
                    value={formData.parentdept}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {departments.length === 0 && <option value={0}>None</option>}
                    {departments.map((dept) => (
                      <option key={dept.deptid} value={dept.deptid}>
                        {dept.departmentname}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Employee Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search Employee
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={employeeSearch}
                      onChange={handleEmployeeSearchChange}
                      placeholder={loadingEmployees ? "Loading employees..." : "Search by name, badge number, or DTR ID..."}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={loadingEmployees}
                    />
                    {loadingEmployees && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                    {filteredEmployees.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredEmployees.map((emp) => {
                          const displayName = formatOfficeHeadName(emp) || 'Unnamed Employee';
                          const photoPath = emp.photo_path || null;
                          return (
                            <div
                              key={emp.objid}
                              onClick={() => handleEmployeeSelect(emp)}
                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0 flex items-center gap-3"
                            >
                              {photoPath ? (
                                <img
                                  src={photoPath}
                                  alt={displayName}
                                  className="w-10 h-10 rounded-full object-cover border border-gray-200"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const fallback = e.target.nextElementSibling;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-10 h-10 rounded-full bg-gray-200 border border-gray-200 flex items-center justify-center text-xs text-gray-600 ${photoPath ? 'hidden' : ''}`}
                              >
                                {displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900">{displayName}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  {/* Selected Employee Display */}
                  {selectedEmployee && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {selectedEmployee.photo_path ? (
                            <img
                              src={selectedEmployee.photo_path}
                              alt={formatOfficeHeadName(selectedEmployee)}
                              className="w-10 h-10 rounded-full object-cover border border-gray-200"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                const fallback = e.target.nextElementSibling;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-10 h-10 rounded-full bg-gray-200 border border-gray-200 flex items-center justify-center text-xs text-gray-600 ${selectedEmployee.photo_path ? 'hidden' : ''}`}
                          >
                            {formatOfficeHeadName(selectedEmployee).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs text-gray-600">Selected Employee:</span>
                            <div className="font-medium text-sm text-gray-900">
                              {formatOfficeHeadName(selectedEmployee)}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearEmployee}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Office Head */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Office Head
                  </label>
                  <input
                    type="text"
                    name="officehead"
                    value={formData.officehead}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Office head name (auto-filled when employee selected)"
                  />
                </div>

                {/* Account Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Code
                  </label>
                  <input
                    type="text"
                    name="accountcode"
                    value={formData.accountcode}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Account code for payroll (future feature)"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-gray-700 font-medium">Record Type</span>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold tracking-wide ${
                        Number(formData.isdepartment) === 1 ? 'text-blue-600' : 'text-emerald-600'
                      }`}
                    >
                      {Number(formData.isdepartment) === 1 ? 'Department' : 'Unit'}
                    </span>
                    <button
                      type="button"
                      onClick={toggleFormDepartmentFlag}
                      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                        Number(formData.isdepartment) === 1 ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                      aria-pressed={Number(formData.isdepartment) === 1}
                      aria-label="Toggle department type"
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          Number(formData.isdepartment) === 1 ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Adding...' : 'Add Department'}
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Department Modal */}
      {showEditModal && canUpdate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Edit Department</h3>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleEditDepartment} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    name="departmentname"
                    value={formData.departmentname}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter department name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Name
                  </label>
                  <input
                    type="text"
                    name="departmentshortname"
                    value={formData.departmentshortname}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={10}
                    placeholder="Optional short code"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Department
                  </label>
                  <select
                    name="parentdept"
                    value={formData.parentdept}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={0}>None</option>
                    {departments
                      .filter(dept => dept.deptid !== selectedDepartment?.deptid)
                      .map(dept => (
                        <option key={dept.deptid} value={dept.deptid}>
                          {dept.departmentname}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Employee Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Employee
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={employeeSearch}
                    onChange={handleEmployeeSearchChange}
                    placeholder={loadingEmployees ? "Loading employees..." : "Search by name, badge number, or DTR ID..."}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loadingEmployees}
                  />
                  {loadingEmployees && (
                    <div className="absolute right-3 top-2.5">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                    {filteredEmployees.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredEmployees.map((emp) => {
                          const displayName = formatOfficeHeadName(emp) || 'Unnamed Employee';
                          const photoPath = emp.photo_path || null;
                          return (
                            <div
                              key={emp.objid}
                              onClick={() => handleEmployeeSelect(emp)}
                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0 flex items-center gap-3"
                            >
                              {photoPath ? (
                                <img
                                  src={photoPath}
                                  alt={displayName}
                                  className="w-10 h-10 rounded-full object-cover border border-gray-200"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const fallback = e.target.nextElementSibling;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-10 h-10 rounded-full bg-gray-200 border border-gray-200 flex items-center justify-center text-xs text-gray-600 ${photoPath ? 'hidden' : ''}`}
                              >
                                {displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900">{displayName}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>
                
                {/* Selected Employee Display */}
                {selectedEmployee && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {selectedEmployee.photo_path ? (
                          <img
                            src={selectedEmployee.photo_path}
                            alt={formatOfficeHeadName(selectedEmployee)}
                            className="w-10 h-10 rounded-full object-cover border border-gray-200"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              const fallback = e.target.nextElementSibling;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-10 h-10 rounded-full bg-gray-200 border border-gray-200 flex items-center justify-center text-xs text-gray-600 ${selectedEmployee.photo_path ? 'hidden' : ''}`}
                        >
                          {formatOfficeHeadName(selectedEmployee).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-xs text-gray-600">Selected Employee:</span>
                          <div className="font-medium text-sm text-gray-900">
                            {formatOfficeHeadName(selectedEmployee)}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearEmployee}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Office Head */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Office Head
                  </label>
                  <input
                    type="text"
                    name="officehead"
                    value={formData.officehead}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Office head name (auto-filled when employee selected)"
                  />
                </div>

                {/* Account Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Code
                  </label>
                  <input
                    type="text"
                    name="accountcode"
                    value={formData.accountcode}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Account code for payroll (future feature)"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-gray-700 font-medium">Record Type</span>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-semibold tracking-wide ${
                      Number(formData.isdepartment) === 1 ? 'text-blue-600' : 'text-emerald-600'
                    }`}
                  >
                    {Number(formData.isdepartment) === 1 ? 'Department' : 'Unit'}
                  </span>
                  <button
                    type="button"
                    onClick={toggleFormDepartmentFlag}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                      Number(formData.isdepartment) === 1 ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                    aria-pressed={Number(formData.isdepartment) === 1}
                    aria-label="Toggle department type"
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        Number(formData.isdepartment) === 1 ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Updating...' : 'Update Department'}
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Departments;