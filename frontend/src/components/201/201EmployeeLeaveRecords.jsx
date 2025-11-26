import React, { useState, useEffect } from 'react';
import { useAuth } from '../../authContext.jsx';
import api from '../../utils/api.js';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';
import { getPhotoUrl } from '../../utils/urls';

const EmployeeLeaveRecords = () => {
  const { user } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({
    total_earned_vl: '',
    total_earned_sl: '',
    balance_vl: '',
    balance_sl: ''
  });
  const [saving, setSaving] = useState(false);

  const canReadLeaveCredits = can('201-leave-credits', 'read') || can('201-leave', 'read');
  const canCreateLeaveCredits = can('201-leave-credits', 'create') || can('201-leave', 'create');
  const canUpdateLeaveCredits = can('201-leave-credits', 'update') || can('201-leave', 'update');
  const canDeleteLeaveCredits = can('201-leave-credits', 'delete') || can('201-leave', 'delete');

  // Fetch all employees with leave records
  const fetchEmployees = async () => {
    if (!canReadLeaveCredits) return;
    try {
      setLoading(true);
      const response = await api.get('/employee-leave-records');
      
      if (response.data.success) {
        setEmployees(response.data.employees);
      } else {
        setError('Failed to fetch employees');
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canReadLeaveCredits) {
      fetchEmployees();
    }
  }, [canReadLeaveCredits]);

  // Determine eligible employees (must have designation with canleave = 1)
  const eligibleEmployees = employees.filter(employee => {
    const hasDesignation = !!employee.designation_objid;
    if (!hasDesignation) {
      return false;
    }
    const canLeaveRaw = employee.appointment_canleave;
    const canLeaveValue = canLeaveRaw === null || canLeaveRaw === undefined ? null : Number(canLeaveRaw);
    if (canLeaveValue !== null && canLeaveValue !== 1) {
      return false;
    }
    return true;
  });

  // Filter employees based on search term
  const filteredEmployees = eligibleEmployees.filter(employee => {
    const employeeName = formatEmployeeNameFromObject(employee) || '';
    const employeeId = employee.employee_id || '';
    const searchLower = searchTerm.toLowerCase();
    return employeeName.toLowerCase().includes(searchLower) ||
           employeeId.toLowerCase().includes(searchLower);
  });

  // Handle opening modal for add/edit
  const handleOpenModal = (employee, mode) => {
    if (mode === 'add' && !canCreateLeaveCredits) {
      alert('You do not have permission to add leave credits.');
      return;
    }
    if (mode === 'edit' && !canUpdateLeaveCredits) {
      alert('You do not have permission to update leave credits.');
      return;
    }
    setSelectedEmployee(employee);
    setModalMode(mode);
    
    if (mode === 'add') {
      setFormData({
        total_earned_vl: employee.total_earned_vl || '',
        total_earned_sl: employee.total_earned_sl || '',
        balance_vl: '',
        balance_sl: ''
      });
    } else {
      setFormData({
        total_earned_vl: employee.total_earned_vl || '',
        total_earned_sl: employee.total_earned_sl || '',
        balance_vl: employee.balance_vl || '',
        balance_sl: employee.balance_sl || ''
      });
    }
    
    setShowModal(true);
  };

  // Handle closing modal
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
    setFormData({
      total_earned_vl: '',
      total_earned_sl: '',
      balance_vl: '',
      balance_sl: ''
    });
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Validate form data
  const validateForm = () => {
    const errors = [];
    
    if (modalMode === 'add') {
      if (!formData.balance_vl || formData.balance_vl < 0) {
        errors.push('Balance VL must be a positive number');
      }
      if (!formData.balance_sl || formData.balance_sl < 0) {
        errors.push('Balance SL must be a positive number');
      }
    }
    
    if (formData.total_earned_vl < 0) {
      errors.push('Total Earned VL must be a positive number');
    }
    if (formData.total_earned_sl < 0) {
      errors.push('Total Earned SL must be a positive number');
    }
    
    return errors;
  };

  // Handle save (create or update)
  const handleSave = async () => {
    if (modalMode === 'add' && !canCreateLeaveCredits) {
      alert('You do not have permission to create leave credits.');
      return;
    }
    if (modalMode === 'edit' && !canUpdateLeaveCredits) {
      alert('You do not have permission to update leave credits.');
      return;
    }
    const errors = validateForm();
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }

    try {
      setSaving(true);
      
      if (modalMode === 'add') {
        // Create new leave record
        const payload = {
          emp_objid: selectedEmployee.emp_objid,
          balance_vl: parseFloat(formData.balance_vl),
          balance_sl: parseFloat(formData.balance_sl),
          total_earned_vl: parseFloat(formData.total_earned_vl),
          total_earned_sl: parseFloat(formData.total_earned_sl),
          updated_by: user.user_objid
        };
        
        await api.post('/employee-leave-records', payload);
        alert('Leave record created successfully!');
      } else {
        // Update existing leave record
        const payload = {
          balance_vl: parseFloat(formData.balance_vl),
          balance_sl: parseFloat(formData.balance_sl),
          total_earned_vl: parseFloat(formData.total_earned_vl),
          total_earned_sl: parseFloat(formData.total_earned_sl),
          updated_by: user.user_objid
        };
        
        await api.put(`/employee-leave-records/${selectedEmployee.leave_objid}`, payload);
        alert('Leave record updated successfully!');
      }
      
      handleCloseModal();
      fetchEmployees(); // Refresh the list
      
    } catch (err) {
      console.error('Error saving leave record:', err);
      alert('Failed to save leave record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (employee) => {
    if (!canDeleteLeaveCredits) {
      alert('You do not have permission to delete leave credits.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the leave record for ${formatEmployeeNameFromObject(employee)}?`)) {
      return;
    }

    try {
      await api.delete(`/employee-leave-records/${employee.leave_objid}`);
      alert('Leave record deleted successfully!');
      fetchEmployees(); // Refresh the list
    } catch (err) {
      console.error('Error deleting leave record:', err);
      alert('Failed to delete leave record. Please try again.');
    }
  };

  // Format number to 3 decimal places
  const formatNumber = (value) => {
    return value ? parseFloat(value).toFixed(3) : '0.000';
  };

  // getPhotoUrl is now imported from '../../utils/urls'

  if (permissionsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="bg-white shadow rounded-lg p-6 text-gray-600">Loading permissions…</div>
      </div>
    );
  }

  if (!canReadLeaveCredits) {
    return (
      <div className="bg-white shadow rounded-lg p-6 text-center text-gray-600">
        You do not have permission to view leave credits.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search employees by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Earned VL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Earned SL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance VL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance SL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.emp_objid} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 h-10 w-10">
                        {getPhotoUrl(employee.photo_path) ? (
                          <img
                            className="h-10 w-10 rounded-full object-cover"
                            src={getPhotoUrl(employee.photo_path)}
                            alt={formatEmployeeNameFromObject(employee)}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium"
                          style={{ display: getPhotoUrl(employee.photo_path) ? 'none' : 'flex' }}
                        >
                          {formatEmployeeNameFromObject(employee).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {formatEmployeeNameFromObject(employee)}
                        </div>
                        {employee.designation_objid && employee.department_name && employee.position_title ? (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {employee.department_name} - {employee.position_title}
                          </div>
                        ) : employee.designation_objid && employee.department_name ? (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {employee.department_name}
                          </div>
                        ) : employee.designation_objid && employee.position_title ? (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {employee.position_title}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(employee.total_earned_vl)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(employee.total_earned_sl)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(employee.balance_vl)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(employee.balance_sl)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {employee.updatedby && (employee.updated_by_employee_name || employee.updated_by_username) ? (
                      <div className="h-8 w-8">
                        {employee.updated_by_photo_path ? (
                          <img
                            src={employee.updated_by_photo_path}
                            alt={`${employee.updated_by_employee_name || employee.updated_by_username || ''}`}
                            className="h-8 w-8 rounded-full object-cover cursor-pointer"
                            title={(() => {
                              // Construct name in "Last Name, First Name" format
                              if (employee.updated_by_surname && employee.updated_by_firstname) {
                                const middleInitial = employee.updated_by_middlename ? ` ${employee.updated_by_middlename.charAt(0)}.` : '';
                                return `${employee.updated_by_surname}, ${employee.updated_by_firstname}${middleInitial}`;
                              }
                              // Fallback to concatenated name if available
                              if (employee.updated_by_employee_name) {
                                return employee.updated_by_employee_name;
                              }
                              // Last resort: use username
                              return employee.updated_by_username || 'Unknown';
                            })()}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className={`h-8 w-8 rounded-full bg-gray-300 items-center justify-center ${employee.updated_by_photo_path ? 'hidden' : 'flex'}`}
                          title={(() => {
                            // Construct name in "Last Name, First Name" format
                            if (employee.updated_by_surname && employee.updated_by_firstname) {
                              const middleInitial = employee.updated_by_middlename ? ` ${employee.updated_by_middlename.charAt(0)}.` : '';
                              return `${employee.updated_by_surname}, ${employee.updated_by_firstname}${middleInitial}`;
                            }
                            // Fallback to concatenated name if available
                            if (employee.updated_by_employee_name) {
                              return employee.updated_by_employee_name;
                            }
                            // Last resort: use username
                            return employee.updated_by_username || 'Unknown';
                          })()}
                        >
                          <span className="text-gray-600 text-xs font-medium">
                            {(() => {
                              // Try to get initials from individual fields first
                              if (employee.updated_by_surname && employee.updated_by_firstname) {
                                return `${employee.updated_by_surname.charAt(0)}${employee.updated_by_firstname.charAt(0)}`;
                              }
                              // Fallback to extracting from concatenated name
                              if (employee.updated_by_employee_name) {
                                const parts = employee.updated_by_employee_name.split(',').map(p => p.trim());
                                if (parts.length >= 2) {
                                  const surname = parts[0];
                                  const firstname = parts[1].split(' ')[0];
                                  return `${surname.charAt(0)}${firstname.charAt(0)}`;
                                }
                              }
                              // Last resort: use username
                              if (employee.updated_by_username) {
                                return employee.updated_by_username.substring(0, 2).toUpperCase();
                              }
                              return '??';
                            })()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2 items-center">
                      {employee.has_leave_record ? (
                        <>
                          {canUpdateLeaveCredits && (
                            <button
                              onClick={() => handleOpenModal(employee, 'edit')}
                              className="px-2 py-1 text-blue-600 hover:text-blue-800"
                              title="Edit Leave Record"
                            >
                              ✏️
                            </button>
                          )}
                          {canDeleteLeaveCredits && (
                            <button
                              onClick={() => handleDelete(employee)}
                              className="px-2 py-1 text-red-600 hover:text-red-800"
                              title="Delete Leave Record"
                            >
                              🗑️
                            </button>
                          )}
                          {!canUpdateLeaveCredits && !canDeleteLeaveCredits && (
                            <span className="text-xs text-gray-400 italic">View only</span>
                          )}
                        </>
                      ) : canCreateLeaveCredits ? (
                        <button
                          onClick={() => handleOpenModal(employee, 'add')}
                          className="text-green-600 hover:text-green-900"
                          title="Add Leave Record"
                        >
                          ➕
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No actions</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredEmployees.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No employees found matching your search criteria.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {modalMode === 'add' ? 'Add Leave Record' : 'Edit Leave Record'}
              </h3>
              
              {/* Employee Info */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Employee Information</h4>
                <div className="flex items-center space-x-3">
                  {getPhotoUrl(selectedEmployee?.photo_path) ? (
                    <img
                      className="h-12 w-12 rounded-full object-cover"
                      src={getPhotoUrl(selectedEmployee?.photo_path)}
                      alt={selectedEmployee?.name}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium">
                      {selectedEmployee?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{selectedEmployee?.name}</div>
                    <div className="text-sm text-gray-500">ID: {selectedEmployee?.employee_id}</div>
                  </div>
                </div>
              </div>

              {/* Leave Information */}
              <div className="space-y-6">
                {/* Total Earned Credits Section */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-3">Total Earned Credits</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Earned VL
                      </label>
                      <input
                        type="number"
                        name="total_earned_vl"
                        value={formData.total_earned_vl}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="9999.999"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Earned SL
                      </label>
                      <input
                        type="number"
                        name="total_earned_sl"
                        value={formData.total_earned_sl}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="9999.999"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Leave Balances Section */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-3">Leave Balances</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        VL
                      </label>
                      <input
                        type="number"
                        name="balance_vl"
                        value={formData.balance_vl}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="9999.999"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SL
                      </label>
                      <input
                        type="number"
                        name="balance_sl"
                        value={formData.balance_sl}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="9999.999"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeLeaveRecords;
