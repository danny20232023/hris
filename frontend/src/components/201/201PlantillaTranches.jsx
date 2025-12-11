import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

const PlantillaTranches = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = '201-plantilla-tranches';
  
  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  
  const [tranches, setTranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [salaryClasses, setSalaryClasses] = useState([]);
  const [loadingSalaryClasses, setLoadingSalaryClasses] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState({}); // Track which tranche is being updated
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    implement_year: new Date().getFullYear(),
    tranche: '',
    tranche_percent: '',
    tranche_percent_increase: '',
    salaryclassid: '',
    supportingid: '',
    tranchestatus: 'Active'
  });
  
  // Fetch tranches
  const fetchTranches = async () => {
    try {
      setLoading(true);
      const response = await api.get('/201-plantilla-tranches', {
        params: {
          page: currentPage,
          limit: recordsPerPage,
          search: searchTerm,
          status: statusFilter
        }
      });
      
      setTranches(response.data.data || []);
      setTotalRecords(response.data.pagination?.total || 0);
      setTotalPages(response.data.pagination?.totalPages || 0);
    } catch (error) {
      console.error('Error fetching tranches:', error);
      alert('Failed to load tranches');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch salary classes for dropdown
  const fetchSalaryClasses = async () => {
    try {
      setLoadingSalaryClasses(true);
      const response = await api.get('/201-plantilla-tranches/salary-classes');
      const classes = response.data.data || [];
      // Sort by classname in ascending order
      const sortedClasses = [...classes].sort((a, b) => {
        const nameA = (a.classname || '').toLowerCase();
        const nameB = (b.classname || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setSalaryClasses(sortedClasses);
    } catch (error) {
      console.error('Error fetching salary classes:', error);
      alert('Failed to load salary classes');
    } finally {
      setLoadingSalaryClasses(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      fetchTranches();
      fetchSalaryClasses();
    }
  }, [currentPage, recordsPerPage, searchTerm, statusFilter, canRead]);
  
  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };
  
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, recordsPerPage]);
  
  // Create handler
  const handleCreate = () => {
    if (!canCreate) {
      alert('You do not have permission to create tranches.');
      return;
    }
                    setFormData({
                      implement_year: new Date().getFullYear(),
                      tranche: '',
                      tranche_percent: '',
                      tranche_percent_increase: '',
                      salaryclassid: '',
                      supportingid: '',
                      tranchestatus: 'Active'
                    });
    setSelectedRecord(null);
    setShowCreateModal(true);
  };
  
  // Edit handler
  const handleEdit = (record) => {
    if (!canUpdate) {
      alert('You do not have permission to edit tranches.');
      return;
    }
    setFormData({
      implement_year: record.implement_year || new Date().getFullYear(),
      tranche: record.tranche || '',
      tranche_percent: record.tranche_percent || '',
      tranche_percent_increase: record.tranche_percent_increase || '',
      salaryclassid: record.salaryclassid || '',
      supportingid: record.supportingid || '',
      tranchestatus: record.tranchestatus || 'Active'
    });
    setSelectedRecord(record);
    setShowEditModal(true);
  };
  
  // Toggle status handler
  const handleToggleStatus = async (tranche) => {
    if (!canUpdate) {
      alert('You do not have permission to update tranches.');
      return;
    }
    
    const newStatus = tranche.tranchestatus === 'Active' ? 'Inactive' : 'Active';
    
    try {
      setUpdatingStatus({ ...updatingStatus, [tranche.tranche_id]: true });
      
      await api.put(`/201-plantilla-tranches/${tranche.tranche_id}`, {
        tranchestatus: newStatus
      });
      
      // Refresh the list to show updated status
      fetchTranches();
    } catch (error) {
      console.error('Error updating status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingStatus({ ...updatingStatus, [tranche.tranche_id]: false });
    }
  };
  
  // Delete handler
  const handleDelete = async (record) => {
    if (!canDelete) {
      alert('You do not have permission to delete tranches.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete tranche "${record.tranche}"?`)) {
      try {
        await api.delete(`/201-plantilla-tranches/${record.tranche_id}`);
        fetchTranches();
        alert('Tranche deleted successfully');
      } catch (error) {
        console.error('Error deleting tranche:', error);
        alert(error.response?.data?.message || 'Failed to delete tranche');
      }
    }
  };
  
  // Save handler
  const handleSave = async () => {
    const errors = [];
    
    if (!formData.tranche || !formData.tranche.trim()) {
      errors.push('Tranche Name');
    }
    if (!formData.implement_year) {
      errors.push('Implement Year');
    }
    
    if (errors.length > 0) {
      alert(`Please fill in the following required fields:\n${errors.join('\n')}`);
      return;
    }
    
    const submitData = {
      implement_year: parseInt(formData.implement_year),
      tranche: formData.tranche.trim(),
      tranche_percent: formData.tranche_percent ? parseFloat(formData.tranche_percent) : null,
      tranche_percent_increase: formData.tranche_percent_increase ? parseFloat(formData.tranche_percent_increase) : null,
      salaryclassid: formData.salaryclassid ? parseInt(formData.salaryclassid) : null,
      supportingid: formData.supportingid ? parseInt(formData.supportingid) : null,
      tranchestatus: formData.tranchestatus || 'Active'
    };
    
    try {
      setSaving(true);
      if (selectedRecord) {
        await api.put(`/201-plantilla-tranches/${selectedRecord.tranche_id}`, submitData);
        alert('Tranche updated successfully');
        setShowEditModal(false);
      } else {
        await api.post('/201-plantilla-tranches', submitData);
        alert('Tranche created successfully');
        setShowCreateModal(false);
      }
      setSelectedRecord(null);
      fetchTranches();
    } catch (error) {
      console.error('Error saving tranche:', error);
      alert(error.response?.data?.message || 'Failed to save tranche');
    } finally {
      setSaving(false);
    }
  };
  
  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '₱0.00';
    return `₱${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          Loading permissions...
        </div>
      </div>
    );
  }
  
  if (!canRead) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You do not have permission to view tranches.
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 p-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-md shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tranche name, year..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
        {canCreate && (
          <div className="flex justify-end mt-4">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Add Tranche
            </button>
          </div>
        )}
      </div>
      
      {/* Data Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : tranches.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No tranches found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Implement Year</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tranche Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tranche Percentage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tranches.map((tranche) => (
                  <tr key={tranche.tranche_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{tranche.implement_year || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{tranche.tranche}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {tranche.classname && tranche.classtype && tranche.salaryclass_percentage
                        ? `${tranche.classname} ${tranche.classtype} (${tranche.salaryclass_percentage}%)`
                        : tranche.classname && tranche.salaryclass_percentage
                        ? `${tranche.classname} (${tranche.salaryclass_percentage}%)`
                        : tranche.classtype && tranche.salaryclass_percentage
                        ? `${tranche.classtype} (${tranche.salaryclass_percentage}%)`
                        : tranche.salaryclass_percentage
                        ? `${tranche.salaryclass_percentage}%`
                        : tranche.tranche_percent
                        ? `${tranche.tranche_percent}%`
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {canUpdate ? (
                        <div className="flex items-center">
                          <button
                            onClick={() => handleToggleStatus(tranche)}
                            disabled={updatingStatus[tranche.tranche_id]}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                              tranche.tranchestatus === 'Active' 
                                ? 'bg-green-600' 
                                : 'bg-gray-300'
                            }`}
                            title={tranche.tranchestatus === 'Active' ? 'Click to set Inactive' : 'Click to set Active'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                tranche.tranchestatus === 'Active' 
                                  ? 'translate-x-6' 
                                  : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className="ml-2 text-xs text-gray-600">
                            {updatingStatus[tranche.tranche_id] ? 'Updating...' : tranche.tranchestatus || 'N/A'}
                          </span>
                        </div>
                      ) : (
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          tranche.tranchestatus === 'Active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {tranche.tranchestatus || 'N/A'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        {canUpdate && (
                          <button
                            onClick={() => handleEdit(tranche)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Edit Tranche"
                          >
                            ✏️
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(tranche)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete Tranche"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {totalRecords > 0 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-700">Show:</label>
                <select
                  value={recordsPerPage}
                  onChange={(e) => setRecordsPerPage(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-700">entries</span>
              </div>
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{((currentPage - 1) * recordsPerPage) + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * recordsPerPage, totalRecords)}</span> of{' '}
                <span className="font-medium">{totalRecords}</span> results
              </div>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === pageNum
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
      
      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">
                  {showEditModal ? 'Edit Tranche' : 'Create Tranche'}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setSelectedRecord(null);
                    setFormData({
                      implement_year: new Date().getFullYear(),
                      tranche: '',
                      tranche_percent: '',
                      tranche_percent_increase: '',
                      salaryclassid: '',
                      supportingid: '',
                      tranchestatus: 'Active'
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                {/* First Line: Implement Year, Tranche Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Implement Year *</label>
                    <input
                      type="number"
                      value={formData.implement_year}
                      onChange={(e) => setFormData({ ...formData, implement_year: e.target.value })}
                      min="2000"
                      max="2100"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tranche Name *</label>
                    <input
                      type="text"
                      value={formData.tranche}
                      onChange={(e) => setFormData({ ...formData, tranche: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                {/* Second Line: Salary Class, Tranche Percentage */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salary Class</label>
                    <select
                      value={formData.salaryclassid}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selectedClass = salaryClasses.find(sc => sc.id === parseInt(selectedId));
                        setFormData({ 
                          ...formData, 
                          salaryclassid: selectedId,
                          tranche_percent: selectedClass ? (selectedClass.percentage || '') : ''
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">-- Select Salary Class --</option>
                      {salaryClasses.map((salaryClass) => {
                        const percentage = parseFloat(salaryClass.percentage || 100);
                        const classname = salaryClass.classname || '';
                        const classtype = salaryClass.classtype || '';
                        // Format: classname + classtype (percentage)
                        let displayText = '';
                        if (classname && classtype) {
                          displayText = `${classname} ${classtype} (${percentage}%)`;
                        } else if (classname) {
                          displayText = `${classname} (${percentage}%)`;
                        } else if (classtype) {
                          displayText = `${classtype} (${percentage}%)`;
                        } else {
                          displayText = `${percentage}%`;
                        }
                        return (
                          <option key={salaryClass.id} value={salaryClass.id}>
                            {displayText}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tranche Percentage</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.tranche_percent}
                      onChange={(e) => setFormData({ ...formData, tranche_percent: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                {/* Third Line: Increase */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Increase</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tranche_percent_increase}
                    onChange={(e) => setFormData({ ...formData, tranche_percent_increase: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Supporting ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supporting ID</label>
                  <input
                    type="number"
                    value={formData.supportingid}
                    onChange={(e) => setFormData({ ...formData, supportingid: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                      setSelectedRecord(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlantillaTranches;

