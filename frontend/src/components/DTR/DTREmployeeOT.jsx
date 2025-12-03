import React, { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName } from '../../utils/employeenameFormatter';

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

const DTREmployeeOT = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = 'dtr-employee-ot';
  const componentPermissions = useMemo(
    () => ({
      read: can(COMPONENT_ID, 'read'),
      create: can(COMPONENT_ID, 'create'),
      update: can(COMPONENT_ID, 'update'),
      delete: can(COMPONENT_ID, 'delete'),
    }),
    [can]
  );

  const { read: canRead, create: canCreate, update: canUpdate, delete: canDelete } = componentPermissions;

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [expandedEmployees, setExpandedEmployees] = useState({});
  const [expandedTransactions, setExpandedTransactions] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchEmployees = async () => {
    if (!canRead) return;
    try {
      setLoading(true);
      const response = await api.get('/dtr/employee-ot/employees', {
        params: {
          status: statusFilter || undefined,
        },
      });
      setEmployees(response.data.data || []);
    } catch (error) {
      console.error('Error fetching employees with OT:', error);
      alert(error.response?.data?.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [canRead, statusFilter]);

  const toggleEmployee = (empObjId) => {
    setExpandedEmployees((prev) => ({
      ...prev,
      [empObjId]: !prev[empObjId],
    }));
  };

  const toggleTransaction = (otid) => {
    setExpandedTransactions((prev) => ({
      ...prev,
      [otid]: !prev[otid],
    }));
  };

  const filteredEmployees = useMemo(() => {
    let filtered = [...employees];

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((emp) => {
        const name = (emp.employeeName || '').toLowerCase();
        return name.includes(searchLower);
      });
    }

    return filtered;
  }, [employees, searchTerm]);

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
        You do not have permission to view overtime records.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-5 border-b bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Employee</label>
                <input
                  type="text"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  placeholder="Search by employee name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-12"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total OT Transactions</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total OT Hours</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                      {employees.length === 0 ? 'No employees with overtime records found.' : 'No employees match the search.'}
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((employee) => {
                    const isExpanded = expandedEmployees[employee.emp_objid];
                    const otTransactions = employee.otTransactions || [];

                    return (
                      <React.Fragment key={employee.emp_objid}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleEmployee(employee.emp_objid)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <AvatarWithTooltip photo={employee.employeePhoto} name={employee.employeeName} />
                              <div className="font-medium text-gray-800">{employee.employeeName || 'N/A'}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{otTransactions.length}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {employee.totalOvertimeHours ? employee.totalOvertimeHours.toFixed(2) : '0.00'} hours
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={4} className="px-4 py-4 bg-gray-50">
                              <div className="ml-8">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase w-12"></th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">OT No</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Date Issued</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Total Hours</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">OT Dates Count</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {otTransactions.length === 0 ? (
                                      <tr>
                                        <td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-500">
                                          No OT transactions found for this employee.
                                        </td>
                                      </tr>
                                    ) : (
                                      otTransactions.map((transaction) => {
                                        const isTxExpanded = expandedTransactions[transaction.otid];
                                        // Filter OT dates to only show dates for this employee
                                        const otDates = (transaction.otDates || []).filter(
                                          (date) => date.emp_objid === employee.emp_objid
                                        );

                                        return (
                                          <React.Fragment key={transaction.otid}>
                                            <tr className="hover:bg-gray-50">
                                              <td className="px-3 py-2">
                                                <button
                                                  type="button"
                                                  onClick={() => toggleTransaction(transaction.otid)}
                                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                                  title={isTxExpanded ? 'Collapse' : 'Expand'}
                                                >
                                                  {isTxExpanded ? '−' : '+'}
                                                </button>
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-900 font-medium">{transaction.otno}</td>
                                              <td className="px-3 py-2 text-sm text-gray-900">{formatDisplayDate(transaction.otdateissued)}</td>
                                              <td className="px-3 py-2 text-sm">
                                                <span
                                                  className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(transaction.otstatus)}`}
                                                >
                                                  {transaction.otstatus || 'For Approval'}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-900">
                                                {transaction.total_renderedtime ? Number(transaction.total_renderedtime).toFixed(2) : '0.00'} hours
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-900">{otDates.length}</td>
                                            </tr>
                                            {isTxExpanded && (
                                              <tr>
                                                <td colSpan={6} className="px-3 py-4 bg-gray-50">
                                                  <div className="ml-8">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                      <thead className="bg-gray-100">
                                                        <tr>
                                                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                                            OT Date
                                                          </th>
                                                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                                            AM Time From
                                                          </th>
                                                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                                            AM Time To
                                                          </th>
                                                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                                            PM Time From
                                                          </th>
                                                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                                            PM Time To
                                                          </th>
                                                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                                            Status
                                                          </th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="bg-white divide-y divide-gray-200">
                                                        {otDates.length === 0 ? (
                                                          <tr>
                                                            <td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-500">
                                                              No OT dates found for this transaction.
                                                            </td>
                                                          </tr>
                                                        ) : (
                                                          otDates.map((date) => (
                                                            <tr key={date.id} className="hover:bg-gray-50">
                                                              <td className="px-3 py-2 text-sm text-gray-900">{formatDisplayDate(date.otdate)}</td>
                                                              <td className="px-3 py-2 text-sm text-gray-900">
                                                                {date.am_timerendered_from ? formatDateTime(date.am_timerendered_from) : '—'}
                                                              </td>
                                                              <td className="px-3 py-2 text-sm text-gray-900">
                                                                {date.am_timerendered_to ? formatDateTime(date.am_timerendered_to) : '—'}
                                                              </td>
                                                              <td className="px-3 py-2 text-sm text-gray-900">
                                                                {date.pm_timerendered_from ? formatDateTime(date.pm_timerendered_from) : '—'}
                                                              </td>
                                                              <td className="px-3 py-2 text-sm text-gray-900">
                                                                {date.pm_timerendered_to ? formatDateTime(date.pm_timerendered_to) : '—'}
                                                              </td>
                                                              <td className="px-3 py-2 text-sm">
                                                                <span
                                                                  className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(date.otdatestatus)}`}
                                                                >
                                                                  {date.otdatestatus || 'N/A'}
                                                                </span>
                                                              </td>
                                                            </tr>
                                                          ))
                                                        )}
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
    </div>
  );
};

export default DTREmployeeOT;

