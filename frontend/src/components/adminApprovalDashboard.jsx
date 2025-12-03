import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

const AdminApprovalDashboard = () => {
  const { can, canAccessPage, loading: permissionsLoading } = usePermissions();
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchEmployee, setSearchEmployee] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [viewingTransaction, setViewingTransaction] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState({ open: false, action: null, approval: null });
  const [actionRemarks, setActionRemarks] = useState('');
  const [updatingAction, setUpdatingAction] = useState(false);
  const [bulkActionModal, setBulkActionModal] = useState({ open: false, action: null, approvals: [] });
  const [bulkActionRemarks, setBulkActionRemarks] = useState('');

  // Map transaction types to component names
  const getComponentName = (type) => {
    const typeMap = {
      'travel': '201-travel',
      'cdo': 'dtr-cdo',
      'locator': '201-locator',
      'leave': '201-leave',
      'fixlog': 'dtr-fix-checktimes',
      'overtime': 'dtr-ot-transactions'
    };
    return typeMap[type.toLowerCase()] || null;
  };

  // Check if user has any approval-related permission
  const hasAnyApprovalPermission = useMemo(() => {
    if (permissionsLoading) return false;
    
    const components = ['201-travel', 'dtr-cdo', '201-locator', '201-leave', 'dtr-fix-checktimes', 'dtr-ot-transactions'];
    
    for (const component of components) {
      if (can(component, 'approve') || can(component, 'return') || can(component, 'cancel')) {
        return true;
      }
    }
    
    return false;
  }, [can, permissionsLoading]);

  // Check if user has canaccesspage for the admin approval dashboard component
  const hasAccessPagePermission = useMemo(() => {
    if (permissionsLoading) return false;
    
    // First check: canaccesspage for the admin approval dashboard component itself
    const ADMIN_DASHBOARD_COMPONENT = 'admin-approval-dashboard';
    const hasDashboardAccess = canAccessPage(ADMIN_DASHBOARD_COMPONENT);
    
    // If component doesn't exist in permissions, fall back to checking individual approval components
    // This provides backward compatibility if the component hasn't been created in the database yet
    if (!hasDashboardAccess) {
      const approvalComponents = ['201-travel', 'dtr-cdo', '201-locator', '201-leave', 'dtr-fix-checktimes', 'dtr-ot-transactions'];
      // Check if user has canaccesspage for at least one approval component
      for (const component of approvalComponents) {
        if (canAccessPage(component)) {
          return true; // Fall back to individual component check
        }
      }
      return false;
    }
    
    return hasDashboardAccess;
  }, [canAccessPage, permissionsLoading]);

  // Fetch pending approvals
  const fetchPendingApprovals = async () => {
    try {
      setLoading(true);
      // No pagination params - backend sends all records, frontend handles pagination
      const response = await api.get('/admin-approvals');
      
      if (response.data.success) {
        const approvals = response.data.data || [];
        console.log('[AdminApprovalDashboard] Received approvals:', approvals.length);
        const fixLogs = approvals.filter(a => a.type === 'fixlog');
        const cdos = approvals.filter(a => a.type === 'cdo');
        console.log('[AdminApprovalDashboard] Fix logs in response:', fixLogs.length);
        console.log('[AdminApprovalDashboard] CDOs in response:', cdos.length);
        if (fixLogs.length > 0) {
          console.log('[AdminApprovalDashboard] Fix log details:', fixLogs[0]);
        }
        if (cdos.length > 0) {
          console.log('[AdminApprovalDashboard] CDO details:', cdos[0]);
        }
        setPendingApprovals(approvals);
        // Clear selection when data refreshes
        setSelectedItems(new Set());
      } else {
        setMessage({ text: response.data.message || 'Failed to load approvals', type: 'error' });
        setPendingApprovals([]);
      }
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to load approvals';
      if (error.response) {
        // Server responded with error status
        if (error.response.status === 403) {
          errorMessage = 'You do not have permission to access the approval dashboard';
        } else if (error.response.status === 401) {
          errorMessage = 'Unauthorized. Please log in again.';
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        } else {
          errorMessage = `Server error (${error.response.status}): ${error.response.statusText || 'Unknown error'}`;
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'Network error. Please check your connection.';
      } else {
        // Error setting up the request
        errorMessage = error.message || 'Failed to load approvals';
      }
      
      setMessage({ text: errorMessage, type: 'error' });
      setPendingApprovals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if user has both approval permissions AND canaccesspage permission
    // Fetch once when permissions are loaded, not on page change (frontend handles pagination)
    if (!permissionsLoading && hasAnyApprovalPermission && hasAccessPagePermission) {
      fetchPendingApprovals();
    } else if (!permissionsLoading && (!hasAnyApprovalPermission || !hasAccessPagePermission)) {
      // Clear approvals if user doesn't have permissions
      setPendingApprovals([]);
      setLoading(false);
    }
  }, [permissionsLoading, hasAnyApprovalPermission, hasAccessPagePermission]);

  // Format employee name as "Last Name, First Name"
  const formatEmployeeName = (employee) => {
    if (!employee) return 'N/A';
    const { surname, firstname, middlename } = employee;
    if (surname && firstname) {
      let name = `${surname}, ${firstname}`;
      if (middlename) {
        name += ` ${middlename}`;
      }
      return name;
    }
    return 'N/A';
  };

  // Filter approvals
  const filteredApprovals = useMemo(() => {
    let filtered = pendingApprovals;
    
    console.log('[AdminApprovalDashboard] Filtering approvals. Total:', filtered.length);
    const fixLogsBeforeFilter = filtered.filter(a => a.type === 'fixlog');
    const cdosBeforeFilter = filtered.filter(a => a.type === 'cdo');
    console.log('[AdminApprovalDashboard] Fix logs before permission filter:', fixLogsBeforeFilter.length);
    console.log('[AdminApprovalDashboard] CDOs before permission filter:', cdosBeforeFilter.length);

    // Filter by permissions - only show transactions where user has at least one permission
    // Root admin will have all flags set to true by backend, so they'll see everything
    filtered = filtered.filter(approval => {
      const hasPermission = approval.canApprove || approval.canReturn || approval.canCancel;
      if ((approval.type === 'fixlog' || approval.type === 'cdo') && !hasPermission) {
        console.log(`[AdminApprovalDashboard] ${approval.type} filtered out - no permissions:`, {
          id: approval.id,
          type: approval.type,
          canApprove: approval.canApprove,
          canReturn: approval.canReturn,
          canCancel: approval.canCancel
        });
      }
      return hasPermission;
    });
    
    const fixLogsAfterFilter = filtered.filter(a => a.type === 'fixlog');
    const cdosAfterFilter = filtered.filter(a => a.type === 'cdo');
    console.log('[AdminApprovalDashboard] Fix logs after permission filter:', fixLogsAfterFilter.length);
    console.log('[AdminApprovalDashboard] CDOs after permission filter:', cdosAfterFilter.length);

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(approval => approval.type === filterType);
    }

    // Filter by employee search
    if (searchEmployee.trim()) {
      const searchLower = searchEmployee.toLowerCase();
      filtered = filtered.filter(approval => {
        // For travel/overtime, check all employees
        if (approval.type === 'travel' || approval.type === 'overtime') {
          const allEmployees = approval.employees || (approval.employee ? [approval.employee] : []);
          return allEmployees.some(emp => {
            const employeeName = formatEmployeeName(emp).toLowerCase();
            return employeeName.includes(searchLower);
          });
        }
        // For other types, check single employee
        const employeeName = formatEmployeeName(approval.employee).toLowerCase();
        return employeeName.includes(searchLower);
      });
    }

    // Filter by month (Month + Year)
    if (filterMonth) {
      filtered = filtered.filter(approval => {
        if (!approval.createdDate) return false;
        const createdDate = new Date(approval.createdDate);
        const createdMonthYear = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
        return createdMonthYear === filterMonth;
      });
    }

    return filtered;
  }, [pendingApprovals, filterType, searchEmployee, filterMonth]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredApprovals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedApprovals = filteredApprovals.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, searchEmployee, filterMonth, itemsPerPage]);

  // Clear selection when page changes
  useEffect(() => {
    setSelectedItems(new Set());
  }, [currentPage, filterType, searchEmployee, filterMonth]);

  // Open action modal
  const openActionModal = (action, approval) => {
    setActionRemarks('');
    setActionModal({ open: true, action, approval });
  };

  // Close action modal
  const closeActionModal = () => {
    setActionModal({ open: false, action: null, approval: null });
    setActionRemarks('');
  };

  // Submit action (approve/return/cancel)
  const submitAction = async () => {
    if (!actionModal.open || !actionModal.action || !actionModal.approval) return;
    
    const { approval, action } = actionModal;
    const componentName = getComponentName(approval.type);
    
    // Check permissions
    if (action === 'approve' && (!componentName || !can(componentName, 'approve'))) {
      setMessage({ text: 'You do not have permission to approve this transaction', type: 'error' });
      closeActionModal();
      return;
    }
    if (action === 'return' && (!componentName || !can(componentName, 'return'))) {
      setMessage({ text: 'You do not have permission to return this transaction', type: 'error' });
      closeActionModal();
      return;
    }
    if (action === 'cancel' && (!componentName || !can(componentName, 'cancel'))) {
      setMessage({ text: 'You do not have permission to cancel this transaction', type: 'error' });
      closeActionModal();
      return;
    }

    // Require remarks for return and cancel
    if ((action === 'return' || action === 'cancel') && !actionRemarks.trim()) {
      setMessage({ text: 'Please enter remarks for ' + (action === 'return' ? 'return' : 'cancellation'), type: 'error' });
      return;
    }

    setUpdatingAction(true);
    try {
      const response = await api.post(`/admin-approvals/${approval.type}/${approval.id}/${action}`, {
        remarks: actionRemarks.trim() || null
      });
      
      if (response.data.success) {
        const actionText = action === 'approve' ? 'approved' : action === 'return' ? 'returned' : 'cancelled';
        setMessage({ text: `Transaction ${actionText} successfully`, type: 'success' });
        closeActionModal();
        fetchPendingApprovals();
      } else {
        setMessage({ text: response.data.message || `Failed to ${action} transaction`, type: 'error' });
      }
    } catch (error) {
      console.error(`Error ${action}ing transaction:`, error);
      setMessage({ text: error.response?.data?.message || `Failed to ${action} transaction`, type: 'error' });
    } finally {
      setUpdatingAction(false);
    }
  };

  // Format transaction details for display in grid (returns structured data)
  const getTransactionDetails = (approval) => {
    const { type, details } = approval;
    const result = {
      purpose: null,
      destination: null,
      dates: null,
      other: []
    };
    
    switch (type) {
      case 'travel':
        if (details.purpose) result.purpose = details.purpose;
        if (details.destination) result.destination = details.destination;
        if (details.startDate && details.endDate) {
          result.dates = details.startDate === details.endDate ? details.startDate : `${details.startDate} to ${details.endDate}`;
        }
        break;
      case 'cdo':
        if (details.title) result.purpose = details.title;
        if (details.startDate && details.endDate) {
          result.dates = details.startDate === details.endDate ? details.startDate : `${details.startDate} to ${details.endDate}`;
        }
        break;
      case 'locator':
        if (details.purpose) result.purpose = details.purpose;
        if (details.destination) result.destination = details.destination;
        if (details.date) result.dates = details.date;
        break;
      case 'leave':
        // Don't set purpose for leave - we'll display it separately
        if (details.startDate && details.endDate) {
          result.dates = details.startDate === details.endDate ? details.startDate : `${details.startDate} to ${details.endDate}`;
        }
        break;
      case 'fixlog':
        // Don't set dates or other for fixlog - we'll display it separately
        break;
      case 'overtime':
        if (details.otNumber) result.other.push(`OT #: ${details.otNumber}`);
        if (details.totalHours) result.other.push(`Hours: ${details.totalHours}`);
        if (details.startDate && details.endDate) {
          result.dates = details.startDate === details.endDate ? details.startDate : `${details.startDate} to ${details.endDate}`;
        }
        break;
    }
    
    return result;
  };

  // Handle view transaction
  const handleView = (approval) => {
    setViewingTransaction(approval);
    setShowViewModal(true);
  };

  // Handle close view modal
  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setViewingTransaction(null);
  };

  // Handle checkbox selection
  const handleSelectItem = (itemKey) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = (checked) => {
    if (checked) {
      const allKeys = paginatedApprovals.map(approval => `${approval.type}-${approval.id}`);
      setSelectedItems(new Set(allKeys));
    } else {
      setSelectedItems(new Set());
    }
  };

  // Check if all items on current page are selected
  const isAllSelected = paginatedApprovals.length > 0 && 
    paginatedApprovals.every(approval => selectedItems.has(`${approval.type}-${approval.id}`));

  // Check if some items are selected
  const hasSelectedItems = selectedItems.size > 0;

  // Get selected approvals with permissions
  const getSelectedApprovalsWithPermissions = () => {
    return paginatedApprovals.filter(approval => {
      const itemKey = `${approval.type}-${approval.id}`;
      if (!selectedItems.has(itemKey)) return false;
      
      const componentName = getComponentName(approval.type);
      return componentName && (
        (approval.canApprove && can(componentName, 'approve')) ||
        (approval.canReturn && can(componentName, 'return')) ||
        (approval.canCancel && can(componentName, 'cancel'))
      );
    });
  };

  // Open bulk action modal
  const openBulkActionModal = (action) => {
    const selected = getSelectedApprovalsWithPermissions();
    let actionable = [];
    
    if (action === 'approve') {
      actionable = selected.filter(a => {
        const componentName = getComponentName(a.type);
        return componentName && can(componentName, 'approve') && a.canApprove;
      });
    } else if (action === 'return') {
      actionable = selected.filter(a => {
        const componentName = getComponentName(a.type);
        return componentName && can(componentName, 'return') && a.canReturn;
      });
    } else if (action === 'cancel') {
      actionable = selected.filter(a => {
        const componentName = getComponentName(a.type);
        return componentName && can(componentName, 'cancel') && a.canCancel;
      });
    }

    if (actionable.length === 0) {
      const actionText = action === 'approve' ? 'approve' : action === 'return' ? 'return' : 'cancel';
      setMessage({ text: `No items selected with ${actionText} permission`, type: 'error' });
      return;
    }

    setBulkActionRemarks('');
    setBulkActionModal({ open: true, action, approvals: actionable });
  };

  // Close bulk action modal
  const closeBulkActionModal = () => {
    setBulkActionModal({ open: false, action: null, approvals: [] });
    setBulkActionRemarks('');
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (!bulkActionModal.open || bulkActionModal.action !== 'approve' || bulkActionModal.approvals.length === 0) return;

    setBulkActionLoading(true);
    const results = { success: 0, failed: 0 };
    const errors = [];

    for (const approval of bulkActionModal.approvals) {
      try {
        const response = await api.post(`/admin-approvals/${approval.type}/${approval.id}/approve`, {
          remarks: bulkActionRemarks.trim() || null
        });
        if (response.data.success) {
          results.success++;
        } else {
          results.failed++;
          errors.push(`${approval.typeLabel} #${approval.id}: ${response.data.message || 'Failed'}`);
        }
      } catch (error) {
        results.failed++;
        errors.push(`${approval.typeLabel} #${approval.id}: ${error.response?.data?.message || 'Failed'}`);
      }
    }

    setBulkActionLoading(false);
    setSelectedItems(new Set());
    closeBulkActionModal();
    
    if (results.failed === 0) {
      setMessage({ text: `Successfully approved ${results.success} transaction(s)`, type: 'success' });
    } else {
      setMessage({ 
        text: `Approved ${results.success}, failed ${results.failed}. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`, 
        type: 'error' 
      });
    }
    
    fetchPendingApprovals();
  };

  // Handle bulk return
  const handleBulkReturn = async () => {
    if (!bulkActionModal.open || bulkActionModal.action !== 'return' || bulkActionModal.approvals.length === 0) return;

    // Require remarks for return
    if (!bulkActionRemarks.trim()) {
      setMessage({ text: 'Please enter remarks for return', type: 'error' });
      return;
    }

    setBulkActionLoading(true);
    const results = { success: 0, failed: 0 };
    const errors = [];

    for (const approval of bulkActionModal.approvals) {
      try {
        const response = await api.post(`/admin-approvals/${approval.type}/${approval.id}/return`, {
          remarks: bulkActionRemarks.trim()
        });
        if (response.data.success) {
          results.success++;
        } else {
          results.failed++;
          errors.push(`${approval.typeLabel} #${approval.id}: ${response.data.message || 'Failed'}`);
        }
      } catch (error) {
        results.failed++;
        errors.push(`${approval.typeLabel} #${approval.id}: ${error.response?.data?.message || 'Failed'}`);
      }
    }

    setBulkActionLoading(false);
    setSelectedItems(new Set());
    closeBulkActionModal();
    
    if (results.failed === 0) {
      setMessage({ text: `Successfully returned ${results.success} transaction(s)`, type: 'success' });
    } else {
      setMessage({ 
        text: `Returned ${results.success}, failed ${results.failed}. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`, 
        type: 'error' 
      });
    }
    
    fetchPendingApprovals();
  };

  // Handle bulk cancel
  const handleBulkCancel = async () => {
    if (!bulkActionModal.open || bulkActionModal.action !== 'cancel' || bulkActionModal.approvals.length === 0) return;

    // Require remarks for cancel
    if (!bulkActionRemarks.trim()) {
      setMessage({ text: 'Please enter remarks for cancellation', type: 'error' });
      return;
    }

    setBulkActionLoading(true);
    const results = { success: 0, failed: 0 };
    const errors = [];

    for (const approval of bulkActionModal.approvals) {
      try {
        const response = await api.post(`/admin-approvals/${approval.type}/${approval.id}/cancel`, {
          remarks: bulkActionRemarks.trim()
        });
        if (response.data.success) {
          results.success++;
        } else {
          results.failed++;
          errors.push(`${approval.typeLabel} #${approval.id}: ${response.data.message || 'Failed'}`);
        }
      } catch (error) {
        results.failed++;
        errors.push(`${approval.typeLabel} #${approval.id}: ${error.response?.data?.message || 'Failed'}`);
      }
    }

    setBulkActionLoading(false);
    setSelectedItems(new Set());
    closeBulkActionModal();
    
    if (results.failed === 0) {
      setMessage({ text: `Successfully cancelled ${results.success} transaction(s)`, type: 'success' });
    } else {
      setMessage({ 
        text: `Cancelled ${results.success}, failed ${results.failed}. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`, 
        type: 'error' 
      });
    }
    
    fetchPendingApprovals();
  };

  // Format date range
  const formatDateRange = (approval) => {
    const { type, details } = approval;
    
    if (type === 'locator' || type === 'fixlog') {
      return details.date || 'N/A';
    }
    
    if (details.startDate && details.endDate) {
      if (details.startDate === details.endDate) {
        return details.startDate;
      }
      return `${details.startDate} to ${details.endDate}`;
    }
    
    return details.startDate || details.endDate || 'N/A';
  };

  // Get type badge color
  const getTypeBadgeColor = (type) => {
    const colors = {
      'travel': 'bg-blue-100 text-blue-800',
      'cdo': 'bg-purple-100 text-purple-800',
      'locator': 'bg-green-100 text-green-800',
      'leave': 'bg-yellow-100 text-yellow-800',
      'fixlog': 'bg-red-100 text-red-800',
      'overtime': 'bg-indigo-100 text-indigo-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  // Get type filter button color (selected state - darker version)
  const getTypeFilterColor = (type, isSelected) => {
    if (!isSelected) {
      return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
    }
    const colors = {
      'all': 'bg-gray-600 text-white',
      'travel': 'bg-blue-600 text-white',
      'cdo': 'bg-purple-600 text-white',
      'locator': 'bg-green-600 text-white',
      'leave': 'bg-yellow-600 text-white',
      'fixlog': 'bg-red-600 text-white',
      'overtime': 'bg-indigo-600 text-white'
    };
    return colors[type] || 'bg-gray-600 text-white';
  };

  // Get type icon (using same icons from left menu panel)
  const getTypeIcon = (type) => {
    const icons = {
      'all': (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      'travel': <span className="text-base">🚌</span>,
      'cdo': <span className="text-base">🏄</span>,
      'locator': <span className="text-base">📍</span>,
      'leave': <span className="text-base">🏖️</span>,
      'fixlog': <span className="text-base">🛠️</span>,
      'overtime': <span className="text-base">🧭</span>
    };
    return icons[type] || null;
  };

  // Clear message after 5 seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => setMessage({ text: '', type: '' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasAnyApprovalPermission || !hasAccessPagePermission) {
    return (
      <div className="p-6 bg-yellow-50 border-l-4 border-yellow-400 rounded">
        <div className="flex">
          <div className="ml-3">
            <p className="text-yellow-700">You do not have permission to access the approval dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Modern Header with Stats */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Approval Dashboard</h1>
              <p className="text-gray-600">Review and manage pending transactions</p>
            </div>
            <div className="mt-4 sm:mt-0 flex items-center gap-2">
              <button
                onClick={fetchPendingApprovals}
                disabled={loading}
                className="bg-white rounded-xl px-4 py-2 shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 flex items-center gap-2"
                title="Refresh data"
              >
                <svg 
                  className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm font-medium text-gray-700">Refresh</span>
              </button>
              <div className="bg-white rounded-xl px-4 py-2 shadow-sm">
                <div className="text-xs text-gray-500">Pending</div>
                <div className="text-2xl font-bold text-blue-600">{filteredApprovals.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Toast Notification */}
        {message.text && (
          <div className={`mb-4 rounded-xl shadow-lg p-4 flex items-center gap-3 animate-slide-down ${
            message.type === 'success' ? 'bg-green-50 border-l-4 border-green-500' :
            message.type === 'error' ? 'bg-red-50 border-l-4 border-red-500' :
            'bg-blue-50 border-l-4 border-blue-500'
          }`}>
            <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
              message.type === 'success' ? 'bg-green-500' :
              message.type === 'error' ? 'bg-red-500' :
              'bg-blue-500'
            }`}></div>
            <p className={`font-medium ${
              message.type === 'success' ? 'text-green-800' :
              message.type === 'error' ? 'text-red-800' :
              'text-blue-800'
            }`}>{message.text}</p>
          </div>
        )}

        {/* Floating Bulk Actions (Mobile App Style) */}
        {hasSelectedItems && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl p-4 border border-gray-200 max-w-md w-full mx-4 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">
                {selectedItems.size} selected
              </span>
              <button
                onClick={() => setSelectedItems(new Set())}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => openBulkActionModal('approve')}
                disabled={bulkActionLoading}
                className="flex flex-col items-center justify-center p-3 bg-green-50 hover:bg-green-100 rounded-xl transition-colors disabled:opacity-50"
              >
                <svg className="w-6 h-6 text-green-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-medium text-green-700">Approve</span>
              </button>
              <button
                onClick={() => openBulkActionModal('return')}
                disabled={bulkActionLoading}
                className="flex flex-col items-center justify-center p-3 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors disabled:opacity-50"
              >
                <svg className="w-6 h-6 text-orange-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-xs font-medium text-orange-700">Return</span>
              </button>
              <button
                onClick={() => openBulkActionModal('cancel')}
                disabled={bulkActionLoading}
                className="flex flex-col items-center justify-center p-3 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50"
              >
                <svg className="w-6 h-6 text-red-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs font-medium text-red-700">Cancel</span>
              </button>
            </div>
          </div>
        )}

        {/* Modern Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 sticky top-4 z-30">
          {/* First Row: Search and Month Filter */}
          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            {/* Search with Icon */}
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchEmployee}
                onChange={(e) => setSearchEmployee(e.target.value)}
                placeholder="Search employees..."
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
              />
            </div>

            {/* Month Filter */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Second Row: Type Filter Pills */}
          <div className="flex flex-wrap gap-2">
            {['all', 'travel', 'cdo', 'locator', 'leave', 'fixlog', 'overtime'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 shadow-sm ${
                  filterType === type
                    ? `${getTypeFilterColor(type, true)} shadow-md`
                    : getTypeFilterColor(type, false)
                }`}
              >
                {getTypeIcon(type)}
                <span>{type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
              </button>
            ))}
          </div>

          {/* Active Filters Display */}
          {(filterType !== 'all' || searchEmployee.trim() || filterMonth) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Active filters:</span>
              {filterType !== 'all' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  Type: {filterType}
                  <button onClick={() => setFilterType('all')} className="hover:text-blue-600">×</button>
                </span>
              )}
              {searchEmployee.trim() && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  Search: {searchEmployee}
                  <button onClick={() => setSearchEmployee('')} className="hover:text-blue-600">×</button>
                </span>
              )}
              {filterMonth && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  Month: {new Date(filterMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  <button onClick={() => setFilterMonth('')} className="hover:text-blue-600">×</button>
                </span>
              )}
              <button
                onClick={() => {
                  setFilterType('all');
                  setSearchEmployee('');
                  setFilterMonth('');
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Card-Based Transaction List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-96">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading approvals...</p>
          </div>
        ) : filteredApprovals.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Pending Approvals</h3>
              <p className="text-gray-500">All transactions have been processed or there are no matching results.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Select All Checkbox */}
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
              />
              <label className="text-sm font-medium text-gray-700">
                Select all ({paginatedApprovals.length})
              </label>
            </div>

            <div className="space-y-4">
              {paginatedApprovals.map((approval) => {
                const componentName = getComponentName(approval.type);
                const canApprove = componentName && can(componentName, 'approve');
                const canReturn = componentName && can(componentName, 'return');
                const canCancel = componentName && can(componentName, 'cancel');
                const itemKey = `${approval.type}-${approval.id}`;
                const isSelected = selectedItems.has(itemKey);
                const details = getTransactionDetails(approval);
                
                return (
                  <div
                    key={itemKey}
                    className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 border-2 ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent'
                    }`}
                  >
                    <div className="p-5">
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3 flex-1">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectItem(itemKey)}
                            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                          />
                          
                          {/* Employee(s) */}
                          <div className="flex-1 min-w-0">
                            {approval.type === 'travel' || approval.type === 'overtime' ? (
                              <div className="space-y-2">
                                {(approval.employees || (approval.employee ? [approval.employee] : [])).map((emp, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    {emp?.photo ? (
                                      <img
                                        src={emp.photo}
                                        alt={formatEmployeeName(emp)}
                                        className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center ring-2 ring-white">
                                        <span className="text-white text-sm font-semibold">
                                          {formatEmployeeName(emp).split(' ').map(n => n[0]).join('').substring(0, 2)}
                                        </span>
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-semibold text-gray-900">{formatEmployeeName(emp)}</div>
                                      {idx === 0 && (
                                        <div className="text-xs text-gray-500">
                                          {approval.employees?.length || 1} {approval.employees?.length === 1 ? 'employee' : 'employees'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                {approval.employee?.photo ? (
                                  <img
                                    src={approval.employee.photo}
                                    alt={formatEmployeeName(approval.employee)}
                                    className="h-12 w-12 rounded-full object-cover ring-2 ring-white shadow-sm"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center ring-2 ring-white shadow-sm">
                                    <span className="text-white font-semibold">
                                      {formatEmployeeName(approval.employee).split(' ').map(n => n[0]).join('').substring(0, 2)}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold text-gray-900">{formatEmployeeName(approval.employee)}</div>
                                  <div className="text-sm text-gray-500">
                                    {approval.createdDate ? new Date(approval.createdDate).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    }) : 'N/A'}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Type Badge */}
                        <span className={`px-3 py-1.5 text-xs font-bold rounded-full ${getTypeBadgeColor(approval.type)}`}>
                          {approval.typeLabel}
                        </span>
                      </div>

                      {/* Transaction Details */}
                      <div className="ml-8 mb-4 space-y-2">
                        {approval.type === 'fixlog' ? (
                          <>
                            {/* Fix Date */}
                            {approval.details?.date && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Fix Date:</span>{' '}
                                  <span>
                                    {new Date(approval.details.date).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: '2-digit', 
                                      year: 'numeric' 
                                    })}
                                  </span>
                                </div>
                              </div>
                            )}
                            {/* Fix Log Times */}
                            {(approval.details?.amCheckin || approval.details?.amCheckout || approval.details?.pmCheckin || approval.details?.pmCheckout) && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Fix Log Times:</span>{' '}
                                  <span>
                                    {[
                                      approval.details.amCheckin && `AM In: ${approval.details.amCheckin}`,
                                      approval.details.amCheckout && `AM Out: ${approval.details.amCheckout}`,
                                      approval.details.pmCheckin && `PM In: ${approval.details.pmCheckin}`,
                                      approval.details.pmCheckout && `PM Out: ${approval.details.pmCheckout}`
                                    ].filter(Boolean).join(', ')}
                                  </span>
                                </div>
                              </div>
                            )}
                            {/* Reasons/Remarks */}
                            {approval.details?.remarks && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Reasons/Remarks:</span>{' '}
                                  <span>{approval.details.remarks}</span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : approval.type === 'leave' ? (
                          <>
                            {/* Purpose */}
                            {approval.details?.leavePurpose && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Purpose:</span>{' '}
                                  <span dangerouslySetInnerHTML={{ __html: approval.details.leavePurpose }} />
                                </div>
                              </div>
                            )}
                            {approval.details?.leaveType && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Leave Type:</span>{' '}
                                  <span>{approval.details.leaveType}</span>
                                </div>
                              </div>
                            )}
                            {details.dates && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Leave Dates:</span> {details.dates}
                                </div>
                              </div>
                            )}
                          </>
                        ) : approval.type === 'cdo' ? (
                          <>
                            {/* Title */}
                            {approval.details?.title && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10m-7 4h7" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Title:</span>{' '}
                                  <span>{approval.details.title}</span>
                                </div>
                              </div>
                            )}
                            {/* Purpose */}
                            {approval.details?.purpose && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Purpose:</span>{' '}
                                  <span>{approval.details.purpose}</span>
                                </div>
                              </div>
                            )}
                            {/* Work Date(s) */}
                            {approval.details?.workDates && approval.details.workDates.length > 0 && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Work Date(s):</span>{' '}
                                  <span>
                                    {approval.details.workDates.map((date, idx) => {
                                      try {
                                        const dateObj = new Date(date);
                                        return dateObj.toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: '2-digit', 
                                          year: 'numeric' 
                                        });
                                      } catch (e) {
                                        return date;
                                      }
                                    }).join(', ')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : approval.type === 'locator' ? (
                          <>
                            {details.purpose && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Purpose:</span>{' '}
                                  <span>{details.purpose}</span>
                                </div>
                              </div>
                            )}
                            {details.destination && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Destination:</span> {details.destination}
                                </div>
                              </div>
                            )}
                            {details.dates && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Locator Date:</span>{' '}
                                  <span>
                                    {details.dates ? (() => {
                                      try {
                                        const dateObj = new Date(details.dates);
                                        return dateObj.toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: '2-digit', 
                                          year: 'numeric' 
                                        });
                                      } catch (e) {
                                        return details.dates;
                                      }
                                    })() : 'N/A'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : approval.type === 'overtime' ? (
                          <>
                            {/* Number */}
                            {approval.details?.otNumber && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Number:</span>{' '}
                                  <span>{approval.details.otNumber}</span>
                                </div>
                              </div>
                            )}
                            {/* OT Details */}
                            {approval.details?.otDetails && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">OT Details:</span>{' '}
                                  <span>{approval.details.otDetails}</span>
                                </div>
                              </div>
                            )}
                            {/* Hours to Render */}
                            {approval.details?.calculatedHours !== null && approval.details?.calculatedHours !== undefined && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Hours to Render:</span>{' '}
                                  <span>
                                    {approval.details.otTimeFrom && approval.details.otTimeTo 
                                      ? `${approval.details.otTimeFrom} - ${approval.details.otTimeTo} (${approval.details.calculatedHours}${approval.details.calculatedHours === 1 ? ' hour' : 'hrs'})`
                                      : approval.details.calculatedHours 
                                        ? `${approval.details.calculatedHours}${approval.details.calculatedHours === 1 ? ' hour' : 'hrs'}`
                                        : 'N/A'}
                                  </span>
                                </div>
                              </div>
                            )}
                            {/* OT Date(s) */}
                            {approval.details?.otDates && approval.details.otDates.length > 0 && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">OT Date(s):</span>{' '}
                                  <span>
                                    {approval.details.otDates.map((date, idx) => {
                                      try {
                                        const dateObj = new Date(date);
                                        return dateObj.toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: '2-digit', 
                                          year: 'numeric' 
                                        });
                                      } catch (e) {
                                        return date;
                                      }
                                    }).join(', ')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : approval.type === 'travel' ? (
                          <>
                            {/* Travel No. */}
                            {approval.details?.travelNo && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Travel No.:</span>{' '}
                                  <span>{approval.details.travelNo}</span>
                                </div>
                              </div>
                            )}
                            {/* Purpose */}
                            {details.purpose && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Purpose:</span>{' '}
                                  <span dangerouslySetInnerHTML={{ __html: details.purpose }} />
                                </div>
                              </div>
                            )}
                            {details.destination && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Destination:</span> {details.destination}
                                </div>
                              </div>
                            )}
                            {/* Travel Date(s) */}
                            {approval.details?.travelDates && approval.details.travelDates.length > 0 && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Travel Date(s):</span>{' '}
                                  <span>
                                    {approval.details.travelDates.map((date, idx) => {
                                      try {
                                        const dateObj = new Date(date);
                                        return dateObj.toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: '2-digit', 
                                          year: 'numeric' 
                                        });
                                      } catch (e) {
                                        return date;
                                      }
                                    }).join(', ')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {details.purpose && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Purpose:</span>{' '}
                                  <span>{details.purpose}</span>
                                </div>
                              </div>
                            )}
                            {details.destination && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Destination:</span> {details.destination}
                                </div>
                              </div>
                            )}
                            {details.dates && (
                              <div className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div className="text-sm text-gray-700">
                                  <span className="font-medium">Date:</span> {details.dates}
                                </div>
                              </div>
                            )}
                            {details.other.map((item, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div className="text-sm text-gray-700">{typeof item === 'object' ? `${item.label}: ${item.value}` : item}</div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>

                      {/* Action Buttons - Mobile App Style */}
                      <div className="ml-8 flex flex-wrap items-center gap-2 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => handleView(approval)}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View
                        </button>
                        {canApprove && (
                          <button
                            onClick={() => openActionModal('approve', approval)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium shadow-sm hover:shadow transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Approve
                          </button>
                        )}
                        {canReturn && (
                          <button
                            onClick={() => openActionModal('return', approval)}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium shadow-sm hover:shadow transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Return
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => openActionModal('cancel', approval)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium shadow-sm hover:shadow transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Cancel
                          </button>
                        )}
                      </div>

                      {/* Created By Footer */}
                      <div className="ml-8 mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                        <span>Created by:</span>
                        {approval.createdBy?.isPortal ? (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Portal</span>
                        ) : (
                          <span>{approval.createdBy?.username || 'System'}</span>
                        )}
                        <span className="mx-1">•</span>
                        <span>{approval.createdDate ? new Date(approval.createdDate).toLocaleDateString() : 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modern Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 bg-white rounded-2xl shadow-sm p-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      Showing <span className="font-semibold">{startIndex + 1}</span> to <span className="font-semibold">{Math.min(endIndex, filteredApprovals.length)}</span> of <span className="font-semibold">{filteredApprovals.length}</span>
                    </span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    >
                      <option value={10}>10 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      }`}
                    >
                      Previous
                    </button>
                    <div className="px-4 py-2 bg-gray-50 rounded-lg text-sm font-medium text-gray-700">
                      Page {currentPage} of {totalPages}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* View Transaction Modal */}
        {showViewModal && viewingTransaction && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl">
              <div className="p-6">
                {/* Modal Header */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    {viewingTransaction.employee?.photo && (
                      <img
                        src={viewingTransaction.employee.photo}
                        alt={formatEmployeeName(viewingTransaction.employee)}
                        className="h-12 w-12 rounded-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        View {viewingTransaction.typeLabel} Transaction
                      </h3>
                      <div className="text-sm text-gray-600">
                        {formatEmployeeName(viewingTransaction.employee)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseViewModal}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Modal Body */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <div className="text-sm text-gray-900">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadgeColor(viewingTransaction.type)}`}>
                          {viewingTransaction.typeLabel}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <div className="text-sm text-gray-900">{viewingTransaction.status || 'N/A'}</div>
                    </div>
                  </div>

                  {/* Transaction Type Specific Details */}
                  {viewingTransaction.type === 'travel' && (
                    <>
                      {viewingTransaction.details?.travelNo && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Travel No.</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.travelNo}</div>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                        <div 
                          className="text-sm text-gray-900"
                          dangerouslySetInnerHTML={{ __html: viewingTransaction.details.purpose || 'N/A' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                        <div className="text-sm text-gray-900">{viewingTransaction.details.destination || 'N/A'}</div>
                      </div>
                      {viewingTransaction.details?.travelDates && viewingTransaction.details.travelDates.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Travel Date(s)</label>
                          <div className="text-sm text-gray-900">
                            {viewingTransaction.details.travelDates.map((date, idx) => {
                              try {
                                const dateObj = new Date(date);
                                return dateObj.toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: '2-digit', 
                                  year: 'numeric' 
                                });
                              } catch (e) {
                                return date;
                              }
                            }).join(', ')}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {viewingTransaction.type === 'cdo' && (
                    <>
                      {viewingTransaction.details?.title && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.title}</div>
                        </div>
                      )}
                      {viewingTransaction.details?.purpose && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.purpose}</div>
                        </div>
                      )}
                      {viewingTransaction.details?.workDates && viewingTransaction.details.workDates.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Work Date(s)</label>
                          <div className="text-sm text-gray-900">
                            {viewingTransaction.details.workDates.map((date, idx) => {
                              try {
                                const dateObj = new Date(date);
                                return dateObj.toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: '2-digit', 
                                  year: 'numeric' 
                                });
                              } catch (e) {
                                return date;
                              }
                            }).join(', ')}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {viewingTransaction.type === 'locator' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                        <div className="text-sm text-gray-900">{viewingTransaction.details.purpose || 'N/A'}</div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                        <div className="text-sm text-gray-900">{viewingTransaction.details.destination || 'N/A'}</div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Locator Date</label>
                        <div className="text-sm text-gray-900">
                          {viewingTransaction.details.date 
                            ? (() => {
                                try {
                                  const dateObj = new Date(viewingTransaction.details.date);
                                  return dateObj.toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: '2-digit', 
                                    year: 'numeric' 
                                  });
                                } catch (e) {
                                  return viewingTransaction.details.date;
                                }
                              })()
                            : 'N/A'}
                        </div>
                      </div>
                    </>
                  )}

                  {viewingTransaction.type === 'leave' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Credits</label>
                        <div className="text-sm text-gray-900">{viewingTransaction.details.credits || 0}</div>
                      </div>
                      {viewingTransaction.details.leavePurpose && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                          <div 
                            className="text-sm text-gray-900"
                            dangerouslySetInnerHTML={{ __html: viewingTransaction.details.leavePurpose }}
                          />
                        </div>
                      )}
                      {viewingTransaction.details.leaveType && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.leaveType}</div>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                        <div className="text-sm text-gray-900">{formatDateRange(viewingTransaction)}</div>
                      </div>
                    </>
                  )}

                  {viewingTransaction.type === 'fixlog' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fix Date</label>
                        <div className="text-sm text-gray-900">
                          {viewingTransaction.details.date 
                            ? new Date(viewingTransaction.details.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: '2-digit', 
                                year: 'numeric' 
                              })
                            : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fix Log Times</label>
                        <div className="text-sm text-gray-900">
                          {[
                            viewingTransaction.details.amCheckin && `AM In: ${viewingTransaction.details.amCheckin}`,
                            viewingTransaction.details.amCheckout && `AM Out: ${viewingTransaction.details.amCheckout}`,
                            viewingTransaction.details.pmCheckin && `PM In: ${viewingTransaction.details.pmCheckin}`,
                            viewingTransaction.details.pmCheckout && `PM Out: ${viewingTransaction.details.pmCheckout}`
                          ].filter(Boolean).join(', ') || 'N/A'}
                        </div>
                      </div>
                      {viewingTransaction.details?.remarks && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Reasons/Remarks</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.remarks}</div>
                        </div>
                      )}
                    </>
                  )}

                  {viewingTransaction.type === 'overtime' && (
                    <>
                      {viewingTransaction.details?.otNumber && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Number</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.otNumber}</div>
                        </div>
                      )}
                      {viewingTransaction.details?.otDetails && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">OT Details</label>
                          <div className="text-sm text-gray-900">{viewingTransaction.details.otDetails}</div>
                        </div>
                      )}
                      {viewingTransaction.details?.calculatedHours !== null && viewingTransaction.details?.calculatedHours !== undefined && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Hours to Render</label>
                          <div className="text-sm text-gray-900">
                            {viewingTransaction.details.otTimeFrom && viewingTransaction.details.otTimeTo 
                              ? `${viewingTransaction.details.otTimeFrom} - ${viewingTransaction.details.otTimeTo} (${viewingTransaction.details.calculatedHours}${viewingTransaction.details.calculatedHours === 1 ? ' hour' : 'hrs'})`
                              : viewingTransaction.details.calculatedHours 
                                ? `${viewingTransaction.details.calculatedHours}${viewingTransaction.details.calculatedHours === 1 ? ' hour' : 'hrs'}`
                                : 'N/A'}
                          </div>
                        </div>
                      )}
                      {viewingTransaction.details?.otDates && viewingTransaction.details.otDates.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">OT Date(s)</label>
                          <div className="text-sm text-gray-900">
                            {viewingTransaction.details.otDates.map((date, idx) => {
                              try {
                                const dateObj = new Date(date);
                                return dateObj.toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: '2-digit', 
                                  year: 'numeric' 
                                });
                              } catch (e) {
                                return date;
                              }
                            }).join(', ')}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Created Date</label>
                      <div className="text-sm text-gray-900">
                        {viewingTransaction.createdDate ? new Date(viewingTransaction.createdDate).toLocaleString() : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Created By</label>
                      <div className="flex items-center gap-2">
                        {viewingTransaction.createdBy?.isPortal ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                            Portal
                          </span>
                        ) : viewingTransaction.createdBy?.photo ? (
                          <img
                            src={viewingTransaction.createdBy.photo}
                            alt={viewingTransaction.createdBy.username || 'Created by'}
                            className="h-8 w-8 rounded-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : null}
                        <span className="text-sm text-gray-900">
                          {viewingTransaction.createdBy?.username || (viewingTransaction.createdBy?.isPortal ? 'Portal User' : 'N/A')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleCloseViewModal}
                    className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Modal: Approve / Return / Cancel */}
        {actionModal.open && actionModal.approval && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {actionModal.action === 'approve' && `Approve ${actionModal.approval.typeLabel}`}
                      {actionModal.action === 'return' && `Return ${actionModal.approval.typeLabel}`}
                      {actionModal.action === 'cancel' && `Cancel ${actionModal.approval.typeLabel}`}
                    </h3>
                    <div className="text-sm text-gray-600 mt-1">
                      {formatEmployeeName(actionModal.approval.employee)}
                    </div>
                  </div>
                  <button 
                    onClick={closeActionModal} 
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Transaction Information */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4">Transaction Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <div className="text-sm text-gray-900">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadgeColor(actionModal.approval.type)}`}>
                          {actionModal.approval.typeLabel}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <div className="text-sm text-gray-900">{actionModal.approval.status || 'N/A'}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
                      <div className="text-sm text-gray-900 space-y-1">
                        {(() => {
                          const details = getTransactionDetails(actionModal.approval);
                          return (
                            <>
                              {details.purpose && (
                                <div><span className="font-medium">Purpose/Reasons:</span> {details.purpose}</div>
                              )}
                              {details.destination && (
                                <div><span className="font-medium">Destination:</span> {details.destination}</div>
                              )}
                              {details.dates && (
                                <div><span className="font-medium">Dates:</span> {details.dates}</div>
                              )}
                              {details.other.map((item, idx) => (
                                <div key={idx}>{item}</div>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date/Date Range</label>
                      <div className="text-sm text-gray-900">{formatDateRange(actionModal.approval)}</div>
                    </div>
                    {actionModal.approval.details?.destination && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                        <div className="text-sm text-gray-900">{actionModal.approval.details.destination}</div>
                      </div>
                    )}
                    {actionModal.approval.details?.purpose && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                        <div 
                          className="text-sm text-gray-900"
                          dangerouslySetInnerHTML={{ __html: actionModal.approval.details.purpose }}
                        />
                      </div>
                    )}
                    {actionModal.approval.type === 'leave' && actionModal.approval.details?.leavePurpose && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                        <div 
                          className="text-sm text-gray-900"
                          dangerouslySetInnerHTML={{ __html: actionModal.approval.details.leavePurpose }}
                        />
                      </div>
                    )}
                    {actionModal.approval.type === 'leave' && actionModal.approval.details?.leaveType && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                        <div className="text-sm text-gray-900">{actionModal.approval.details.leaveType}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Remarks Section */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4">
                    {actionModal.action === 'approve' ? 'Approval Information' : actionModal.action === 'return' ? 'Return Information' : 'Cancellation Information'}
                  </h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Remarks {actionModal.action !== 'approve' && <span className="text-red-500">*</span>}
                    </label>
                    <textarea
                      value={actionRemarks}
                      onChange={(e) => setActionRemarks(e.target.value)}
                      rows={4}
                      placeholder={actionModal.action === 'approve' ? 'Optional remarks...' : 'Enter the reason...'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={closeActionModal}
                    disabled={updatingAction}
                    className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Close
                  </button>
                  {actionModal.action === 'approve' && (
                    <button
                      type="button"
                      onClick={submitAction}
                      disabled={updatingAction}
                      className="px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {updatingAction ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                  {actionModal.action === 'return' && (
                    <button
                      type="button"
                      onClick={submitAction}
                      disabled={updatingAction || !actionRemarks.trim()}
                      className="px-6 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {updatingAction ? 'Returning…' : 'Return'}
                    </button>
                  )}
                  {actionModal.action === 'cancel' && (
                    <button
                      type="button"
                      onClick={submitAction}
                      disabled={updatingAction || !actionRemarks.trim()}
                      className="px-6 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {updatingAction ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Action Modal: Approve / Return / Cancel */}
        {bulkActionModal.open && bulkActionModal.approvals.length > 0 && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl">
              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {bulkActionModal.action === 'approve' && `Bulk Approve Transactions`}
                      {bulkActionModal.action === 'return' && `Bulk Return Transactions`}
                      {bulkActionModal.action === 'cancel' && `Bulk Cancel Transactions`}
                    </h3>
                    <div className="text-sm text-gray-600 mt-1">
                      {bulkActionModal.approvals.length} transaction(s) selected
                    </div>
                  </div>
                  <button 
                    onClick={closeBulkActionModal} 
                    disabled={bulkActionLoading}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100 disabled:opacity-50"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Selected Transactions List */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6 max-h-64 overflow-y-auto">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Selected Transactions</h4>
                  <div className="space-y-2">
                    {bulkActionModal.approvals.map((approval, idx) => (
                      <div key={`${approval.type}-${approval.id}`} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-500">{idx + 1}.</span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getTypeBadgeColor(approval.type)}`}>
                            {approval.typeLabel}
                          </span>
                          <span className="text-sm text-gray-900 truncate">
                            {approval.type === 'travel' || approval.type === 'overtime' 
                              ? (approval.employees || []).map(emp => formatEmployeeName(emp)).join(', ')
                              : formatEmployeeName(approval.employee)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 ml-2">
                          ID: {approval.id}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Remarks Section */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-semibold text-gray-800 mb-4">
                    {bulkActionModal.action === 'approve' ? 'Approval Information' : bulkActionModal.action === 'return' ? 'Return Information' : 'Cancellation Information'}
                  </h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Remarks {bulkActionModal.action !== 'approve' && <span className="text-red-500">*</span>}
                    </label>
                    <textarea
                      value={bulkActionRemarks}
                      onChange={(e) => setBulkActionRemarks(e.target.value)}
                      rows={4}
                      placeholder={bulkActionModal.action === 'approve' ? 'Optional remarks for all transactions...' : 'Enter the reason for all transactions...'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      disabled={bulkActionLoading}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {bulkActionModal.action === 'approve' 
                        ? 'These remarks will be applied to all selected transactions.' 
                        : 'These remarks are required and will be applied to all selected transactions.'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={closeBulkActionModal}
                    disabled={bulkActionLoading}
                    className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                  {bulkActionModal.action === 'approve' && (
                    <button
                      type="button"
                      onClick={handleBulkApprove}
                      disabled={bulkActionLoading}
                      className="px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {bulkActionLoading ? 'Approving…' : `Approve ${bulkActionModal.approvals.length} Transaction(s)`}
                    </button>
                  )}
                  {bulkActionModal.action === 'return' && (
                    <button
                      type="button"
                      onClick={handleBulkReturn}
                      disabled={bulkActionLoading || !bulkActionRemarks.trim()}
                      className="px-6 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {bulkActionLoading ? 'Returning…' : `Return ${bulkActionModal.approvals.length} Transaction(s)`}
                    </button>
                  )}
                  {bulkActionModal.action === 'cancel' && (
                    <button
                      type="button"
                      onClick={handleBulkCancel}
                      disabled={bulkActionLoading || !bulkActionRemarks.trim()}
                      className="px-6 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {bulkActionLoading ? 'Cancelling…' : `Cancel ${bulkActionModal.approvals.length} Transaction(s)`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminApprovalDashboard;

