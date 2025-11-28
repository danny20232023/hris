import React, { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import DTROTModal from './DTROTModal';

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

const formatDateTime = (dateTime) => {
  if (!dateTime) return '';
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}`;
};

// Helper function to format time only (HH:MM) from datetime or TIME datatype string
const formatTime = (dateTimeOrTime) => {
  if (!dateTimeOrTime) return '';
  
  const str = String(dateTimeOrTime).trim();
  if (!str) return '';
  
  // PRIORITY 1: Handle TIME datatype strings (HH:MM:SS or HH:MM format)
  // Extract directly from time strings like "18:05:00" or "18:05"
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const hours = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    const minutes = timeMatch[2];
    return `${hours}:${minutes}`; // Returns "HH:MM" format
  }
  
  // PRIORITY 2: Handle datetime strings - parse as Date object
  const d = new Date(dateTimeOrTime);
  if (!Number.isNaN(d.getTime())) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  
  return '';
};

// Helper function to convert TIME string (HH:MM:SS or HH:MM) to minutes of day
const timeStringToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const str = String(timeStr).trim();
  
  // Handle TIME datatype strings (HH:MM:SS or HH:MM)
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }
  
  // Handle datetime strings - extract time component
  const d = new Date(timeStr);
  if (!Number.isNaN(d.getTime())) {
    return d.getHours() * 60 + d.getMinutes();
  }
  
  return null;
};

// Helper function to calculate rendered hours from AM and PM times
// Accepts TIME strings (HH:MM:SS or HH:MM) or datetime strings
const calculateRenderedHours = (amFrom, amTo, pmFrom, pmTo) => {
  let totalHours = 0;
  
  // Calculate AM hours
  if (amFrom && amTo) {
    const amFromMinutes = timeStringToMinutes(amFrom);
    const amToMinutes = timeStringToMinutes(amTo);
    if (amFromMinutes !== null && amToMinutes !== null) {
      let amDiffMinutes = amToMinutes - amFromMinutes;
      // Handle case where time wraps around midnight
      if (amDiffMinutes < 0) {
        amDiffMinutes += 24 * 60; // Add 24 hours
      }
      if (amDiffMinutes > 0) {
        totalHours += amDiffMinutes / 60;
      }
    }
  }
  
  // Calculate PM hours
  if (pmFrom && pmTo) {
    const pmFromMinutes = timeStringToMinutes(pmFrom);
    const pmToMinutes = timeStringToMinutes(pmTo);
    if (pmFromMinutes !== null && pmToMinutes !== null) {
      let pmDiffMinutes = pmToMinutes - pmFromMinutes;
      // Handle case where time wraps around midnight
      if (pmDiffMinutes < 0) {
        pmDiffMinutes += 24 * 60; // Add 24 hours
      }
      if (pmDiffMinutes > 0) {
        totalHours += pmDiffMinutes / 60;
      }
    }
  }
  
  return totalHours > 0 ? totalHours : 0;
};

// Helper function to calculate hours difference between two TIME or datetime values
const calculateHoursDifference = (timeFrom, timeTo) => {
  if (!timeFrom || !timeTo) return 0;
  
  const fromMinutes = timeStringToMinutes(timeFrom);
  const toMinutes = timeStringToMinutes(timeTo);
  
  if (fromMinutes === null || toMinutes === null) {
    return 0;
  }
  
  // Calculate difference in minutes, then convert to hours
  let diffMinutes = toMinutes - fromMinutes;
  
  // Handle case where time wraps around midnight (e.g., 22:00 to 06:00 = next day)
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // Add 24 hours
  }
  
  const diffHours = diffMinutes / 60;
  
  return diffHours > 0 ? diffHours : 0;
};

const AvatarWithTooltip = ({ photo, name }) => {
  const initials = (name || 'NA')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasPhoto = !!photo && (photo.startsWith('data:') || photo.startsWith('http'));
  return (
    <div className="relative group" title={name || 'N/A'}>
      {hasPhoto && (
        <img
          src={photo}
          alt={name || 'Person'}
          className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 hover:border-blue-400"
          onError={(e) => {
            e.target.style.display = 'none';
            const fallback = e.target.nextElementSibling;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      )}
      <div
        className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-gray-200 hover:border-blue-400 ${
          hasPhoto ? 'hidden' : ''
        }`}
      >
        {initials}
      </div>
    </div>
  );
};

const statusBadgeClass = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700';
    case 'RETURNED':
      return 'bg-yellow-100 text-yellow-700';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'RENDERED':
      return 'bg-blue-100 text-blue-700';
    case 'NOT RENDERED':
      return 'bg-gray-100 text-gray-700';
    case 'FOR APPROVAL':
    default:
      return 'bg-blue-100 text-blue-700';
  }
};

const isForApprovalStatus = (status) => (status || '').toUpperCase() === 'FOR APPROVAL';

const DtrOTTransactions = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = 'dtr-overtime-transactions';
  const componentPermissions = useMemo(
    () => ({
      read: can(COMPONENT_ID, 'read'),
      create: can(COMPONENT_ID, 'create'),
      update: can(COMPONENT_ID, 'update'),
      delete: can(COMPONENT_ID, 'delete'),
      approve: can(COMPONENT_ID, 'approve'),
      return: can(COMPONENT_ID, 'return'),
      cancel: can(COMPONENT_ID, 'cancel'),
    }),
    [can]
  );

  const {
    read: canRead,
    create: canCreate,
    update: canUpdate,
    delete: canDelete,
    approve: canApprove,
    return: canReturn,
    cancel: canCancel,
  } = componentPermissions;

  const [loading, setLoading] = useState(false);
  const [otTransactions, setOtTransactions] = useState([]);
  const [expandedTransactions, setExpandedTransactions] = useState({});
  const [searchEmployee, setSearchEmployee] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [otTypeFilter, setOtTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [actionModal, setActionModal] = useState({ open: false, action: null, record: null, remarks: '' });

  const fetchTransactions = async () => {
    if (!canRead) return;
    try {
      setLoading(true);
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (searchEmployee) params.employee = searchEmployee;
      if (otTypeFilter) params.otType = otTypeFilter;

      const response = await api.get('/dtr/employee-ot/transactions', { params });
      setOtTransactions(response.data.data || []);
    } catch (error) {
      console.error('Error fetching OT transactions:', error);
      alert(error.response?.data?.message || 'Failed to load OT transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [canRead, statusFilter, searchEmployee, otTypeFilter]);

  const toggleTransaction = (otid) => {
    setExpandedTransactions((prev) => ({
      ...prev,
      [otid]: !prev[otid],
    }));
  };

  const handleOpenModal = (transaction = null) => {
    if (transaction) {
      if (!canUpdate) {
        alert('You do not have permission to update OT transactions.');
        return;
      }
      setEditingTransaction(transaction);
    } else {
      if (!canCreate) {
        alert('You do not have permission to create OT transactions.');
        return;
      }
      setEditingTransaction(null);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTransaction(null);
    fetchTransactions();
  };

  const handleDelete = async (transaction) => {
    if (!canDelete) {
      alert('You do not have permission to delete OT transactions.');
      return;
    }
    if (!window.confirm(`Delete OT transaction ${transaction.otno}?`)) return;

    try {
      await api.delete(`/dtr/employee-ot/transactions/${transaction.otid}`);
      alert('OT transaction deleted successfully');
      fetchTransactions();
    } catch (error) {
      console.error('Failed to delete OT transaction:', error);
      alert(error.response?.data?.message || 'Failed to delete OT transaction');
    }
  };

  const handlePrint = (transaction) => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    
    // Get all employees for this transaction
    const employees = transaction.employees || [];
    const employeesList = employees.length > 0 
      ? employees.map(emp => emp.name).join(', ')
      : transaction.employeeName || 'N/A';
    
    // Format OT dates
    const otDates = transaction.otDates || [];
    const datesList = otDates.length > 0
      ? otDates.map(date => formatDisplayDate(date.otdate)).join(', ')
      : 'N/A';
    
    // Build print content
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OT Transaction - ${transaction.otno}</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                font-size: 12px;
              }
              .no-print {
                display: none !important;
              }
            }
            body {
              font-family: Arial, sans-serif;
              font-size: 12px;
              padding: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
            }
            .header h1 {
              margin: 0 0 5px 0;
              font-size: 18px;
              font-weight: bold;
            }
            .header h2 {
              margin: 0;
              font-size: 14px;
              font-weight: normal;
            }
            .details {
              margin: 20px 0;
            }
            .details table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
            }
            .details table td {
              padding: 8px;
              border-bottom: 1px solid #ddd;
            }
            .details table td:first-child {
              font-weight: bold;
              width: 30%;
            }
            .dates-table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            .dates-table th,
            .dates-table td {
              padding: 8px;
              border: 1px solid #000;
              text-align: left;
            }
            .dates-table th {
              background-color: #f0f0f0;
              font-weight: bold;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 10px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>OVERTIME TRANSACTION</h1>
            <h2>OT No: ${transaction.otno || 'N/A'}</h2>
          </div>
          
          <div class="details">
            <table>
              <tr>
                <td>Date Issued:</td>
                <td>${formatDisplayDate(transaction.otdateissued)}</td>
              </tr>
              <tr>
                <td>Employee(s):</td>
                <td>${employeesList}</td>
              </tr>
              <tr>
                <td>Time From:</td>
                <td>${transaction.ottimefrom ? formatDateTime(transaction.ottimefrom) : 'N/A'}</td>
              </tr>
              <tr>
                <td>Time To:</td>
                <td>${transaction.ottimeto ? formatDateTime(transaction.ottimeto) : 'N/A'}</td>
              </tr>
              <tr>
                <td>Total Hours:</td>
                <td>${transaction.total_renderedtime ? Number(transaction.total_renderedtime).toFixed(2) : '0.00'} hours</td>
              </tr>
              <tr>
                <td>Status:</td>
                <td>${transaction.otstatus || 'N/A'}</td>
              </tr>
              <tr>
                <td>Details:</td>
                <td>${transaction.otdetails || 'N/A'}</td>
              </tr>
            </table>
          </div>
          
          ${otDates.length > 0 ? `
            <h3 style="margin-top: 20px;">OT Dates:</h3>
            <table class="dates-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>AM From</th>
                  <th>AM To</th>
                  <th>PM From</th>
                  <th>PM To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${otDates.map(date => {
                  const dateEmployee = employees.find(emp => emp.emp_objid === date.emp_objid);
                  const dateEmployeeName = dateEmployee ? dateEmployee.name : 'N/A';
                  return `
                    <tr>
                      <td>${formatDisplayDate(date.otdate)}</td>
                      <td>${dateEmployeeName}</td>
                      <td>${date.am_timerendered_from ? formatDateTime(date.am_timerendered_from) : '—'}</td>
                      <td>${date.am_timerendered_to ? formatDateTime(date.am_timerendered_to) : '—'}</td>
                      <td>${date.pm_timerendered_from ? formatDateTime(date.pm_timerendered_from) : '—'}</td>
                      <td>${date.pm_timerendered_to ? formatDateTime(date.pm_timerendered_to) : '—'}</td>
                      <td>${date.otdatestatus || 'N/A'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ` : ''}
          
          <div class="footer">
            System Generated: ${new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  };

  const handleDeleteOtDate = async (dateId) => {
    if (!canDelete) {
      alert('You do not have permission to delete OT dates.');
      return;
    }

    try {
      await api.delete(`/dtr/employee-ot/dates/${dateId}`);
      alert('OT date deleted successfully');
      fetchTransactions(); // Refresh to update the list
    } catch (error) {
      console.error('Failed to delete OT date:', error);
      alert(error.response?.data?.message || 'Failed to delete OT date');
    }
  };

  const handleCancelOtDate = async (dateId, otdate) => {
    if (!canCancel) {
      alert('You do not have permission to cancel OT dates.');
      return;
    }

    try {
      // Update the OT date status to 'Cancelled'
      await api.put(`/dtr/employee-ot/dates/${dateId}`, {
        otdatestatus: 'Cancelled',
      });
      alert(`OT date ${formatDisplayDate(otdate)} cancelled successfully`);
      fetchTransactions(); // Refresh to update the list
    } catch (error) {
      console.error('Failed to cancel OT date:', error);
      alert(error.response?.data?.message || 'Failed to cancel OT date');
    }
  };

  const openActionModal = (action, record) => {
    if (action === 'approve' && !canApprove) {
      alert('You do not have permission to approve OT transactions.');
      return;
    }
    if (action === 'return' && !canReturn) {
      alert('You do not have permission to return OT transactions.');
      return;
    }
    if (action === 'cancel' && !canCancel) {
      alert('You do not have permission to cancel OT transactions.');
      return;
    }
    setActionModal({ open: true, action, record, remarks: record?.otremarks || '' });
  };

  const closeActionModal = () => {
    setActionModal({ open: false, action: null, record: null, remarks: '' });
  };

  const submitAction = async () => {
    const { action, record, remarks } = actionModal;
    if (!action || !record?.otid) return;
    const statusMap = { approve: 'Approved', return: 'Returned', cancel: 'Cancelled' };
    const newStatus = statusMap[action];
    if (!newStatus) {
      closeActionModal();
      return;
    }
    if (!remarks.trim()) {
      alert('Please enter remarks before proceeding.');
      return;
    }

    try {
      await api.put(`/dtr/employee-ot/transactions/${record.otid}/status`, {
        status: newStatus,
        remarks: remarks.trim(),
      });
      alert(`OT transaction ${newStatus.toLowerCase()} successfully`);
      closeActionModal();
      fetchTransactions();
    } catch (error) {
      console.error('Failed to update OT transaction status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = [...otTransactions];

    if (searchEmployee.trim()) {
      const searchLower = searchEmployee.toLowerCase();
      filtered = filtered.filter((tx) => {
        // Search across all employees for this transaction
        const employees = tx.employees || [];
        if (employees.length > 0) {
          return employees.some((emp) => 
            (emp.name || '').toLowerCase().includes(searchLower)
          );
        }
        // Fallback to single employee name for backward compatibility
        const name = (tx.employeeName || '').toLowerCase();
        return name.includes(searchLower);
      });
    }

    return filtered;
  }, [otTransactions, searchEmployee]);

  if (permissionsLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center text-gray-600">
        Loading permissions...
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-100 p-6 text-center text-red-600">
        You do not have permission to view OT transactions.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-6">
        {/* New OT Transaction Button - Above Main Grid */}
        {canCreate && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow hover:bg-blue-700"
            >
              + New OT Transaction
            </button>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-5 border-b bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Employee</label>
                <input
                  type="text"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  placeholder="Search by employee name..."
                  value={searchEmployee}
                  onChange={(e) => setSearchEmployee(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="For Approval">For Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Returned">Returned</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">OT Type</label>
                <input
                  type="text"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  placeholder="Filter by OT type..."
                  value={otTypeFilter}
                  onChange={(e) => setOtTypeFilter(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-12"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">OT No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee(s)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date Issued</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time From</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                      {otTransactions.length === 0 ? 'No OT transactions found.' : 'No transactions match the filters.'}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction) => {
                    const isExpanded = expandedTransactions[transaction.otid];
                    const otDates = transaction.otDates || [];

                    return (
                      <React.Fragment key={transaction.otid}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleTransaction(transaction.otid)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">{transaction.otno}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              // Get all employees for this transaction
                              const employees = transaction.employees || [];
                              // Fallback to single employee for backward compatibility
                              if (employees.length === 0 && transaction.employeeName) {
                                return (
                                  <div className="flex items-center gap-3">
                                    <AvatarWithTooltip photo={transaction.employeePhoto} name={transaction.employeeName} />
                                    <div className="font-medium text-gray-800">{transaction.employeeName || 'N/A'}</div>
                                  </div>
                                );
                              }
                              
                              // Display all employees
                              if (employees.length === 0) {
                                return <div className="text-gray-500">N/A</div>;
                              }
                              
                              return (
                                <div className="flex flex-col gap-2">
                                  {employees.map((emp, idx) => (
                                    <div key={emp.emp_objid || idx} className="flex items-center gap-2">
                                      <AvatarWithTooltip photo={emp.photo} name={emp.name} />
                                      <span className="font-medium text-gray-800 text-sm">{emp.name || 'N/A'}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatDisplayDate(transaction.otdateissued)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.ottimefrom ? formatTime(transaction.ottimefrom) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.ottimeto ? formatTime(transaction.ottimeto) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {(() => {
                              const hours = calculateHoursDifference(transaction.ottimefrom, transaction.ottimeto);
                              return hours > 0 ? `${hours.toFixed(2)} hours` : '—';
                            })()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(transaction.otstatus)}`}
                            >
                              {transaction.otstatus || 'For Approval'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              {isForApprovalStatus(transaction.otstatus) && (
                                <>
                                  {canApprove && (
                                    <button
                                      onClick={() => openActionModal('approve', transaction)}
                                      className="text-green-600 hover:text-green-800 transition-colors"
                                      title="Approve"
                                    >
                                      👍
                                    </button>
                                  )}
                                  {canReturn && (
                                    <button
                                      onClick={() => openActionModal('return', transaction)}
                                      className="text-orange-600 hover:text-orange-800 transition-colors"
                                      title="Return"
                                    >
                                      ↩
                                    </button>
                                  )}
                                  {canCancel && (
                                    <button
                                      onClick={() => openActionModal('cancel', transaction)}
                                      className="text-red-600 hover:text-red-800 transition-colors"
                                      title="Cancel"
                                    >
                                      ✖
                                    </button>
                                  )}
                                </>
                              )}
                              {canUpdate && (
                                <button
                                  onClick={() => handleOpenModal(transaction)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                              )}
                              <button
                                onClick={() => handlePrint(transaction)}
                                className="text-green-600 hover:text-green-800 transition-colors"
                                title="Print OT Transaction"
                              >
                                🖨️
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(transaction)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="px-4 py-4 bg-gray-50">
                              <div className="ml-8">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">OT Dates</h4>
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">OT Date</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Employee</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">AM FROM-TO</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">PM FROM-TO</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Rendered (Hrs)</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {otDates.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="px-3 py-4 text-center text-sm text-gray-500">
                                          No OT dates found for this transaction.
                                        </td>
                                      </tr>
                                    ) : (() => {
                                      // Create employee lookup map from transaction's employees array
                                      const employeeMap = new Map();
                                      if (transaction.employees && Array.isArray(transaction.employees)) {
                                        transaction.employees.forEach((emp) => {
                                          if (emp.emp_objid) {
                                            employeeMap.set(emp.emp_objid, emp);
                                          }
                                        });
                                      }
                                      // Fallback to single employee if employees array is not available
                                      if (employeeMap.size === 0 && transaction.emp_objid && transaction.employeeName) {
                                        employeeMap.set(transaction.emp_objid, {
                                          emp_objid: transaction.emp_objid,
                                          name: transaction.employeeName,
                                          photo: transaction.employeePhoto,
                                        });
                                      }
                                      
                                      return otDates.map((date) => {
                                        const employee = date.emp_objid ? employeeMap.get(date.emp_objid) : null;
                                        const photo = employee?.photo || null;
                                        const name = employee?.name || 'N/A';
                                        
                                        // Format AM FROM-TO
                                        const amFrom = date.am_timerendered_from ? formatTime(date.am_timerendered_from) : null;
                                        const amTo = date.am_timerendered_to ? formatTime(date.am_timerendered_to) : null;
                                        const amFromTo = (amFrom && amTo) ? `${amFrom} - ${amTo}` : (amFrom || amTo || '—');
                                        
                                        // Format PM FROM-TO
                                        const pmFrom = date.pm_timerendered_from ? formatTime(date.pm_timerendered_from) : null;
                                        const pmTo = date.pm_timerendered_to ? formatTime(date.pm_timerendered_to) : null;
                                        const pmFromTo = (pmFrom && pmTo) ? `${pmFrom} - ${pmTo}` : (pmFrom || pmTo || '—');
                                        
                                        // Calculate rendered hours
                                        const renderedHours = calculateRenderedHours(
                                          date.am_timerendered_from,
                                          date.am_timerendered_to,
                                          date.pm_timerendered_from,
                                          date.pm_timerendered_to
                                        );
                                        
                                        return (
                                          <tr key={date.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-sm text-gray-900">{formatDisplayDate(date.otdate)}</td>
                                            <td className="px-3 py-2">
                                              <AvatarWithTooltip photo={photo} name={name} />
                                            </td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{amFromTo}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{pmFromTo}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">
                                              {renderedHours > 0 ? renderedHours.toFixed(2) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-sm">
                                              <span
                                                className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(date.otdatestatus)}`}
                                              >
                                                {date.otdatestatus || 'N/A'}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <div className="flex items-center justify-center gap-2">
                                                {canCancel && (
                                                  <button
                                                    onClick={() => {
                                                      if (window.confirm(`Cancel OT date ${formatDisplayDate(date.otdate)}?`)) {
                                                        handleCancelOtDate(date.id, date.otdate);
                                                      }
                                                    }}
                                                    className="text-red-600 hover:text-red-800 transition-colors"
                                                    title="Cancel OT Date"
                                                  >
                                                    ✖
                                                  </button>
                                                )}
                                                {canDelete && (
                                                  <button
                                                    onClick={() => {
                                                      if (window.confirm(`Delete OT date ${formatDisplayDate(date.otdate)}?`)) {
                                                        handleDeleteOtDate(date.id);
                                                      }
                                                    }}
                                                    className="text-red-600 hover:text-red-800 transition-colors"
                                                    title="Delete OT Date"
                                                  >
                                                    🗑️
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      });
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <DTROTModal
          isOpen={showModal}
          onClose={handleCloseModal}
          transaction={editingTransaction}
          onSave={fetchTransactions}
        />
      )}

      {actionModal.open && actionModal.record && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Confirm Action</h3>
              <button onClick={closeActionModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 text-sm text-gray-700">
              <div>
                Are you sure you want to {actionModal.action === 'approve' ? 'approve' : actionModal.action === 'return' ? 'return' : 'cancel'} this OT transaction?
              </div>
              <div>
                <span className="font-semibold">Reference:</span> {actionModal.record.otno || 'N/A'}
              </div>
              <div>
                <span className="font-semibold">Employee(s):</span>
                <div className="mt-2 space-y-2">
                  {(() => {
                    const employees = actionModal.record.employees || [];
                    // Fallback to single employee for backward compatibility
                    if (employees.length === 0 && actionModal.record.employeeName) {
                      return (
                        <div className="flex items-center gap-3">
                          <AvatarWithTooltip
                            photo={actionModal.record.employeePhoto}
                            name={actionModal.record.employeeName}
                          />
                          <div className="font-semibold text-gray-800">{actionModal.record.employeeName || 'N/A'}</div>
                        </div>
                      );
                    }
                    return employees.length > 0 ? (
                      employees.map((emp, idx) => (
                        <div key={emp.emp_objid || idx} className="flex items-center gap-3">
                          <AvatarWithTooltip photo={emp.photo} name={emp.name} />
                          <div className="font-semibold text-gray-800">{emp.name || 'N/A'}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-500">N/A</div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
                <textarea
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={actionModal.remarks}
                  onChange={(e) => setActionModal({ ...actionModal, remarks: e.target.value })}
                  placeholder="Enter remarks"
                  required
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={closeActionModal}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAction}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DtrOTTransactions;

