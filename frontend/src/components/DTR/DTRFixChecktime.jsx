import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { getPhotoUrl } from '../../utils/urls';

const statusColors = {
  'For Approval': 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-100 text-red-800',
  Cancel: 'bg-red-100 text-red-800'
};

const defaultFilters = {
  employeeSearch: '',
  dateFrom: '',
  dateTo: '',
  status: 'All'
};

const emptyForm = {
  emp_objid: '',
  employeeName: '',
  checktimedate: '',
  am_checkin: '',
  am_checkout: '',
  pm_checkin: '',
  pm_checkout: '',
  remarks: ''
};

// Format date without timezone conversion - extract date part directly
const formatDate = (value) => {
  if (!value) return 'N/A';
  
  // Convert to string first
  const dateStr = String(value).trim();
  if (!dateStr) return 'N/A';
  
  // Handle "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD" format - extract date part only
  // Match: YYYY-MM-DD (with optional time part after space or T)
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s|T|$)/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    // Return in MM/DD/YYYY format without any timezone conversion
    return `${month}/${day}/${year}`;
  }
  
  // If no match found, return as-is
  return dateStr;
};

const getInitials = (value = '') => {
  const cleaned = value.trim();
  if (!cleaned) return 'NA';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Normalize time value from "HH:mm:ss" or "HH:mm" to "HH:mm" format
const normalizeTimeValue = (timeValue) => {
  if (!timeValue || timeValue === '-') return '';
  const trimmed = String(timeValue).trim();
  if (!trimmed) return '';
  // Extract HH:mm from HH:mm:ss format
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hour = String(parseInt(match[1], 10)).padStart(2, '0');
    const minute = match[2];
    return `${hour}:${minute}`;
  }
  return trimmed;
};

// Generate time options in 24-hour format (HH:mm) - every 15 minutes
// Also includes current log values if they don't match 15-minute intervals
const generateTimeOptions = (currentLogValues = []) => {
  const options = [{ value: '', label: '-- Select Time --' }];
  const timeSet = new Set();
  
  // Add standard 15-minute interval options
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hourStr = String(hour).padStart(2, '0');
      const minuteStr = String(minute).padStart(2, '0');
      const timeValue = `${hourStr}:${minuteStr}`;
      timeSet.add(timeValue);
      options.push({ value: timeValue, label: timeValue });
    }
  }
  
  // Add current log values if they're not already in the options
  currentLogValues.forEach((timeValue) => {
    if (timeValue && timeValue.trim() && !timeSet.has(timeValue)) {
      timeSet.add(timeValue);
      options.push({ value: timeValue, label: timeValue });
    }
  });
  
  // Sort options by time value (except the first "-- Select Time --" option)
  const selectOption = options[0];
  const timeOptions = options.slice(1).sort((a, b) => {
    const [aHour, aMin] = a.value.split(':').map(Number);
    const [bHour, bMin] = b.value.split(':').map(Number);
    if (aHour !== bHour) return aHour - bHour;
    return aMin - bMin;
  });
  
  return [selectOption, ...timeOptions];
};

// getPhotoUrl is now imported from '../../utils/urls'

const StatusPill = ({ status }) => {
  const colorClass = statusColors[status] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {status || 'For Approval'}
    </span>
  );
};

const DTRFixChecktime = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = 'dtr-fix-checktimes';

  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  const canApprove = can(componentId, 'approve') || canUpdate;

  const [filters, setFilters] = useState(defaultFilters);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editingRecord, setEditingRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState(null); // 'approve' or 'cancel'
  const [actionRecord, setActionRecord] = useState(null);
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const fetchRecords = useCallback(async () => {
    if (!canRead) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = {};
      if (filters.employeeSearch) params.search = filters.employeeSearch;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.status !== 'All') params.status = filters.status;

      const { data } = await api.get('/dtr-fix-checktime', { params });
      setRecords(data?.data || []);
    } catch (err) {
      console.error('Error fetching fix records:', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [canRead, filters.employeeSearch, filters.dateFrom, filters.dateTo, filters.status]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  const openEditModal = (record) => {
    if (!canUpdate) {
      window.alert('You do not have permission to edit fix logs.');
      return;
    }
    setEditingRecord(record);
    
    // Extract date without timezone conversion - get YYYY-MM-DD part only
    let dateValue = '';
    if (record?.checktimedate) {
      const dateStr = String(record.checktimedate).trim();
      // Match YYYY-MM-DD format (with optional time part)
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        dateValue = dateMatch[0]; // Use YYYY-MM-DD format directly
      } else {
        // Fallback: try splitting by T or space
        dateValue = dateStr.split(/[T\s]/)[0];
      }
    }
    
    setFormData({
      emp_objid: record?.emp_objid || '',
      employeeName: record?.employeeName || '',
      checktimedate: dateValue,
      am_checkin: normalizeTimeValue(record?.am_checkin || ''),
      am_checkout: normalizeTimeValue(record?.am_checkout || ''),
      pm_checkin: normalizeTimeValue(record?.pm_checkin || ''),
      pm_checkout: normalizeTimeValue(record?.pm_checkout || ''),
      remarks: record?.remarks || ''
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormData(emptyForm);
    setEditingRecord(null);
    setError('');
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.emp_objid || !formData.checktimedate) {
      setError('Employee ObjID and Fix Log Date are required.');
      return;
    }

    if (!editingRecord) {
      setError('Edit mode only. Cannot create new entries.');
      return;
    }

    if (!canUpdate) {
      window.alert('You do not have permission to update fix logs.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const payload = {
        emp_objid: formData.emp_objid,
        checktimedate: formData.checktimedate,
        am_checkin: formData.am_checkin || null,
        am_checkout: formData.am_checkout || null,
        pm_checkin: formData.pm_checkin || null,
        pm_checkout: formData.pm_checkout || null,
        remarks: formData.remarks || null
      };

      if (editingRecord?.fixid) {
        await api.put(`/dtr-fix-checktime/${editingRecord.fixid}`, payload);
      } else {
        await api.post('/dtr-fix-checktime', payload);
      }

      closeModal();
      await fetchRecords();
    } catch (err) {
      console.error('Error saving fix log:', err);
      setError(err.response?.data?.message || 'Failed to save fix log.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (!canDelete) {
      window.alert('You do not have permission to delete fix logs.');
      return;
    }
    if (!record?.fixid) return;

    if (!window.confirm('Delete this fix log entry?')) return;

    try {
      await api.delete(`/dtr-fix-checktime/${record.fixid}`);
      await fetchRecords();
    } catch (err) {
      console.error('Error deleting fix log:', err);
      window.alert('Failed to delete fix log.');
    }
  };

  const handleApprove = async (record) => {
    if (!canApprove) {
      window.alert('You do not have permission to approve fix logs.');
      return;
    }
    if (!record?.fixid) return;
    
    setActionType('approve');
    setActionRecord(record);
    setActionRemarks('');
    setActionModalOpen(true);
  };

  const handleCancel = async (record) => {
    if (!canApprove) {
      window.alert('You do not have permission to cancel fix logs.');
      return;
    }
    if (!record?.fixid) return;
    
    setActionType('cancel');
    setActionRecord(record);
    setActionRemarks('');
    setActionModalOpen(true);
  };

  const closeActionModal = () => {
    setActionModalOpen(false);
    setActionType(null);
    setActionRecord(null);
    setActionRemarks('');
  };

  const handleActionSubmit = async () => {
    if (!actionRecord?.fixid || !actionType) return;
    
    // Check permissions
    if (!canApprove) {
      window.alert(`You do not have permission to ${actionType} fix logs.`);
      return;
    }
    
    // For cancel, remarks are required
    if (actionType === 'cancel' && !actionRemarks.trim()) {
      return;
    }
    
    try {
      setActionSaving(true);
      const payload = {
        remarks: actionRemarks.trim() || null
      };
      
      if (actionType === 'approve') {
        await api.put(`/dtr-fix-checktime/${actionRecord.fixid}/approve`, payload);
      } else if (actionType === 'cancel') {
        await api.put(`/dtr-fix-checktime/${actionRecord.fixid}/cancel`, payload);
      }
      
      closeActionModal();
      await fetchRecords();
    } catch (err) {
      console.error(`Error ${actionType}ing fix log:`, err);
      window.alert(`Failed to ${actionType} fix log.`);
    } finally {
      setActionSaving(false);
    }
  };

  const handleAction = (action, record) => {
    switch (action) {
      case 'edit':
        openEditModal(record);
        break;
      case 'delete':
        handleDelete(record);
        break;
      case 'approve':
        handleApprove(record);
        break;
      case 'cancel':
        handleCancel(record);
        break;
      default:
        console.log('[DTR FIX LOG] Unknown action:', action, record);
    }
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
          You do not have permission to view fix logs.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
            <input
              type="text"
              value={filters.employeeSearch}
              onChange={(e) => handleFilterChange('employeeSearch', e.target.value)}
              placeholder="Search by name, badge, or ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="All">All</option>
              <option value="For Approval">For Approval</option>
              <option value="Approved">Approved</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Cancel">Cancel</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={fetchRecords}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Apply Filters
          </button>
          <button
            onClick={resetFilters}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Fix Logs</h3>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading fix logs...</div>
        ) : records.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No fix logs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fix Log Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AM-CheckIn</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AM-CheckOut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PM-CheckIn</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PM-CheckOut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((record, index) => {
                  const rowKey = record.fixid ?? `${record.emp_objid || 'emp'}-${record.checktimedate || index}`;
                  const displayName =
                    record.employeeName ||
                    [record.LASTNAME, record.FIRSTNAME].filter(Boolean).join(', ') ||
                    'N/A';
                  const badgeNo = record.BADGENO || record.badgeno || record.badgeNo || '';
                  const photoPath = record.PHOTOPATH || record.photopath || record.photo_path || record.photo || '';
                  const photoUrl = getPhotoUrl(photoPath);
                  const statusLabel = record.fixstatus || record.status || 'For Approval';

                  return (
                    <tr key={rowKey} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={displayName}
                              className="h-10 w-10 rounded-full object-cover border-2 border-gray-200"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className={`h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 border-2 border-gray-200 ${
                              photoUrl ? 'hidden' : ''
                            }`}
                          >
                            {getInitials(displayName)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{displayName}</div>
                            {badgeNo && <div className="text-xs text-gray-500">{badgeNo}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(record.checktimedate)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{record.am_checkin || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{record.am_checkout || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{record.pm_checkin || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{record.pm_checkout || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          {record.created_by_photo_path ? (
                            <img
                              src={record.created_by_photo_path}
                              alt={record.created_by_employee_name || record.created_by_name || record.createdByName || 'Creator'}
                              className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 cursor-pointer"
                              title={record.created_by_employee_name || record.created_by_name || record.createdByName || 'Creator'}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-gray-200 cursor-pointer ${
                              record.created_by_photo_path ? 'hidden' : ''
                            }`}
                            title={record.created_by_employee_name || record.created_by_name || record.createdByName || 'Creator'}
                          >
                            {getInitials(record.created_by_employee_name || record.created_by_name || record.createdByName || 'NA')}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={statusLabel} />
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <div className="flex items-center justify-center gap-2">
                          {statusLabel === 'For Approval' && canApprove && (
                            <>
                              <button
                                onClick={() => handleAction('approve', record)}
                                className="text-green-600 hover:text-green-800 transition-colors"
                                title="Approve"
                              >
                                👍
                              </button>
                              <button
                                onClick={() => handleAction('cancel', record)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                                title="Cancel"
                              >
                                ✖
                              </button>
                            </>
                          )}
                          {canUpdate && (
                            <button
                              onClick={() => handleAction('edit', record)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Edit"
                            >
                              ✏️
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleAction('delete', record)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          )}
                          {!canUpdate && !canDelete && !(statusLabel === 'For Approval' && canApprove) && (
                            <span className="text-xs text-gray-400">No actions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="flex items-center gap-4 flex-1">
                  {(() => {
                    const photoPath = editingRecord.PHOTOPATH || editingRecord.photopath || editingRecord.photo_path || '';
                    const photoUrl = photoPath ? getPhotoUrl(photoPath) : null;
                    const displayName = editingRecord.employeeName || 
                      [editingRecord.LASTNAME, editingRecord.FIRSTNAME].filter(Boolean).join(', ') || 
                      'Employee';
                    return (
                      <>
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={displayName}
                            className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) {
                                e.target.nextSibling.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 border-2 border-gray-200 ${
                            photoUrl ? 'hidden' : ''
                          }`}
                        >
                          {getInitials(displayName)}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">Edit Fix Log</h3>
                          <p className="text-sm text-gray-500">{displayName}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
              {/* Hidden Employee ObjID field - needed for form submission */}
                <input
                  type="hidden"
                  name="emp_objid"
                  value={formData.emp_objid}
                />
              
              {/* Single line: Fix Log Date | AM-CheckIn | AM-CheckOut | PM-CheckIn | PM-CheckOut */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fix Log Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="checktimedate"
                    value={formData.checktimedate}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={!canUpdate}
                  />
                </div>
                {['am_checkin', 'am_checkout', 'pm_checkin', 'pm_checkout'].map((field) => {
                  // Collect current time values to include in dropdown options
                  const currentTimeValues = [
                    normalizeTimeValue(formData.am_checkin),
                    normalizeTimeValue(formData.am_checkout),
                    normalizeTimeValue(formData.pm_checkin),
                    normalizeTimeValue(formData.pm_checkout)
                  ].filter(Boolean);
                  const timeOptions = generateTimeOptions(currentTimeValues);
                  
                  return (
                    <div key={field} className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.toUpperCase().replace('_', '-')}
                      </label>
                      <select
                        name={field}
                        value={formData[field] || ''}
                        onChange={handleFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                        disabled={!canUpdate}
                      >
                        {timeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              
              {/* Remarks below */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                <textarea
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleFormChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Add remarks or notes..."
                  disabled={!canUpdate}
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  disabled={saving || !canUpdate}
                  title={!canUpdate ? 'You do not have permission to update fix logs' : ''}
                >
                  {saving ? 'Saving...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approval/Cancellation Modal */}
      {actionModalOpen && actionRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {actionType === 'approve' ? 'Approve Fix Log' : 'Cancel Fix Log'}
              </h3>
              <button
                onClick={closeActionModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
                disabled={actionSaving}
              >
                ×
              </button>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Remarks {actionType === 'approve' ? '(optional)' : <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={actionType === 'approve' ? 'Add approval remarks (optional)...' : 'Provide reason for cancellation...'}
                  disabled={actionSaving}
                />
              </div>
              {actionType === 'cancel' && !actionRemarks.trim() && (
                <p className="text-sm text-red-600">Please provide a reason for cancellation.</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={closeActionModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={actionSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActionSubmit}
                className={`px-4 py-2 rounded-lg text-white ${
                  actionType === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:bg-gray-400`}
                disabled={actionSaving || (actionType === 'cancel' && !actionRemarks.trim())}
              >
                {actionSaving ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DTRFixChecktime;

