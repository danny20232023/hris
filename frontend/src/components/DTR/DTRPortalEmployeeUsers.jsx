import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../../utils/api';
import PortalEmployeeUserModal from './PortalEmployeeUserModal';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

// Use centralized name formatter
const formatFullName = (record = {}) => {
  // Try to format from individual name parts first
  if (record.surname || record.firstname || record.middlename) {
    return formatEmployeeNameFromObject({
      surname: record.surname || record.last_name,
      firstname: record.firstname || record.first_name,
      middlename: record.middlename || record.middle_name
    }) || record.fullName || record.dtrname || 'Unknown';
  }
  // Fallback to dtrname or fullName if available
  return record.dtrname || record.fullName || 'Unknown';
};

function DTRPortalEmployeeUsers() {
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = 'portal-employee-users';
  const componentPermissions = useMemo(() => ({
    read: can(COMPONENT_ID, 'read'),
    create: can(COMPONENT_ID, 'create'),
    update: can(COMPONENT_ID, 'update'),
    delete: can(COMPONENT_ID, 'delete'),
    print: can(COMPONENT_ID, 'print'),
    approve: can(COMPONENT_ID, 'approve')
  }), [can]);

  const {
    read: canReadPortalEmployeeUsers,
    create: canCreatePortalEmployeeUsers,
    update: canUpdatePortalEmployeeUsers,
    delete: canDeletePortalEmployeeUsers,
    print: canPrintPortalEmployeeUsers
  } = componentPermissions;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalState, setModalState] = useState({ open: false, mode: 'create', record: null });
  const [actionLoading, setActionLoading] = useState({ reset: false, delete: false });
  const [statusUpdating, setStatusUpdating] = useState({});
  const renderEmployeeAvatar = useCallback((record = {}) => {
    const photoSrc = record.photo || record.photo_path || record.employee_photo;
    if (photoSrc) {
      return (
        <img
          src={photoSrc}
          alt={formatFullName(record)}
          className="w-10 h-10 rounded-full object-cover border border-gray-200"
        />
      );
    }

    const fallbackInitials = (record.dtrname || formatFullName(record) || 'NA')
      .split(/[ ,]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div className="w-10 h-10 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-600 text-sm font-semibold">
        {fallbackInitials || 'NA'}
      </div>
    );
  }, []);

  const loadPortalUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/portal-employee-users', {
        params: {
          search: search.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined
        }
      });

      const payload = response.data?.data || response.data || {};
      const users = payload.users || payload.rows || [];
      const sanitizedUsers = Array.isArray(users) ? users : [];

      setRecords(sanitizedUsers);
    } catch (error) {
      console.error('[PortalEmployeeUsers] Failed to load records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    if (!permissionsLoading && canReadPortalEmployeeUsers) {
      loadPortalUsers();
    }
  }, [loadPortalUsers, permissionsLoading, canReadPortalEmployeeUsers]);

  const openCreateModal = () => {
    if (!canCreatePortalEmployeeUsers) {
      alert('You do not have permission to create portal employee users.');
      return;
    }
    setModalState({
      open: true,
      mode: 'create',
      record: null
    });
  };

  const openEditModal = (record) => {
    if (!canUpdatePortalEmployeeUsers) {
      alert('You do not have permission to update portal employee users.');
      return;
    }
    setModalState({
      open: true,
      mode: 'edit',
      record
    });
  };

  const closeModal = () => {
    setModalState({
      open: false,
      mode: 'create',
      record: null
    });
  };

  const handleModalSave = async (formData) => {
    if (modalState.mode === 'edit') {
      if (!canUpdatePortalEmployeeUsers) {
        alert('You do not have permission to update portal employee users.');
        return;
      }
    } else if (!canCreatePortalEmployeeUsers) {
      alert('You do not have permission to create portal employee users.');
      return;
    }

    try {
      if (modalState.mode === 'edit' && modalState.record) {
        await api.put(`/portal-employee-users/${modalState.record.userportalid}`, formData);
      } else {
        await api.post('/portal-employee-users', formData);
      }
      closeModal();
      await loadPortalUsers();
    } catch (error) {
      console.error('[PortalEmployeeUsers] Failed to save record:', error);
      const message = error.response?.data?.message || 'Unable to save portal user record.';
      alert(message);
    }
  };

  const handleResetPin = async (record) => {
    if (!canUpdatePortalEmployeeUsers) {
      alert('You do not have permission to update portal employee users.');
      return;
    }
    if (!record?.userportalid) return;
    const confirmed = window.confirm(`Reset PIN for ${record.dtrname || formatFullName(record)}?`);
    if (!confirmed) return;

    const input = window.prompt('Enter the new PIN (4-6 digits):', '');
    if (input === null) {
      return;
    }

    const normalized = input.replace(/\D/g, '');
    if (normalized.length < 4 || normalized.length > 6) {
      alert('PIN must be between 4 and 6 digits.');
      return;
    }

    try {
      setActionLoading((prev) => ({ ...prev, reset: true }));
      await api.post(`/portal-employee-users/${record.userportalid}/reset-pin`, { pin: normalized });
      alert('PIN has been reset successfully.');
      await loadPortalUsers();
    } catch (error) {
      console.error('[PortalEmployeeUsers] Failed to reset PIN:', error);
      const message = error.response?.data?.message || 'Unable to reset PIN.';
      alert(message);
    } finally {
      setActionLoading((prev) => ({ ...prev, reset: false }));
    }
  };

  const handleDelete = async (record) => {
    if (!canDeletePortalEmployeeUsers) {
      alert('You do not have permission to delete portal employee users.');
      return;
    }
    if (!record?.userportalid) return;
    const confirmed = window.confirm(`Delete portal user ${record.dtrname || formatFullName(record)}?`);
    if (!confirmed) return;
    try {
      setActionLoading((prev) => ({ ...prev, delete: true }));
      await api.delete(`/portal-employee-users/${record.userportalid}`);
      await loadPortalUsers();
    } catch (error) {
      console.error('[PortalEmployeeUsers] Failed to delete user:', error);
      const message = error.response?.data?.message || 'Unable to delete portal user.';
      alert(message);
    } finally {
      setActionLoading((prev) => ({ ...prev, delete: false }));
    }
  };

  const handlePrint = (record) => {
    if (!canPrintPortalEmployeeUsers) {
      alert('You do not have permission to print portal employee users.');
      return;
    }
    const fullName = formatFullName(record);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      alert('Please allow pop-ups to print.');
      return;
    }

    const photoMarkup = (() => {
      const photoSrc = record.photo || record.photo_path || record.employee_photo;
      if (!photoSrc) return '';
      return `<img src="${photoSrc}" alt="Employee Photo" style="width: 96px; height: 96px; object-fit: cover; border-radius: 9999px; border: 1px solid #ddd;" />`;
    })();

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Portal User Record - ${fullName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { font-size: 20px; margin-bottom: 16px; }
            .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
            .meta { font-size: 14px; color: #4B5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #E5E7EB; padding: 10px; text-align: left; font-size: 14px; }
            th { background-color: #F3F4F6; color: #374151; }
          </style>
        </head>
        <body>
          <div class="header">
            ${photoMarkup}
            <div>
              <h1>${fullName}</h1>
              <div class="meta">Portal User ID: ${record.userportalid || '—'}</div>
            </div>
          </div>
          <table>
            <tbody>
              <tr>
                <th>DTR ID</th>
                <td>${record.dtruserid || '—'}</td>
              </tr>
              <tr>
                <th>Username</th>
                <td>${record.username || '—'}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>${record.emailaddress || '—'}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>${Number(record.status) === 1 ? 'Active' : 'Inactive'}</td>
              </tr>
              <tr>
                <th>Created By</th>
                <td>${record.created_by_name || record.createdby || '—'}</td>
              </tr>
              <tr>
                <th>Created Date</th>
                <td>${record.createddate ? new Date(record.createddate).toLocaleString() : '—'}</td>
              </tr>
              <tr>
                <th>Updated Date</th>
                <td>${record.updateddate ? new Date(record.updateddate).toLocaleString() : '—'}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleSearchChange = (event) => {
    setSearch(event.target.value);
  };

  const handleStatusChange = (event) => {
    setStatusFilter(event.target.value);
  };

  const rowsEnd = useMemo(() => records.length, [records.length]);

  const canShowPortalModal = useMemo(() => {
    if (!modalState.open) return false;
    if (modalState.mode === 'edit') {
      return canUpdatePortalEmployeeUsers;
    }
    return canCreatePortalEmployeeUsers;
  }, [modalState, canCreatePortalEmployeeUsers, canUpdatePortalEmployeeUsers]);

  const handleStatusToggle = async (record) => {
    if (!canUpdatePortalEmployeeUsers) {
      alert('You do not have permission to update portal employee users.');
      return;
    }
    if (!record?.userportalid) return;
    const currentStatus = Number(record.status) === 1 ? 1 : 0;
    const newStatus = currentStatus === 1 ? 0 : 1;

    const sanitizedPin =
      record.pin !== undefined && record.pin !== null && record.pin !== ''
        ? String(record.pin).replace(/\D/g, '').slice(0, 6)
        : null;

    const payload = {
      dtruserid: record.dtruserid,
      dtrname: record.dtrname,
      username: record.username,
      pin: sanitizedPin && sanitizedPin.length >= 4 ? sanitizedPin : undefined,
      emailaddress: record.emailaddress,
      status: newStatus,
      emp_objid: record.emp_objid
    };

    setStatusUpdating((prev) => ({ ...prev, [record.userportalid]: true }));
    try {
      await api.put(`/portal-employee-users/${record.userportalid}`, payload);
      setRecords((prev) =>
        prev.map((item) =>
          item.userportalid === record.userportalid ? { ...item, status: newStatus } : item
        )
      );
    } catch (error) {
      console.error('[PortalEmployeeUsers] Failed to update status:', error);
      const message = error.response?.data?.message || 'Unable to update portal user status.';
      alert(message);
    } finally {
      setStatusUpdating((prev) => {
        const copy = { ...prev };
        delete copy[record.userportalid];
        return copy;
      });
    }
  };

  const renderCreatedByCell = (record) => {
    const photoSrc = record.created_by_photo || record.created_by_photo_path;
    const name = record.created_by_name || record.created_by_username || '—';

    const initial = (name || 'N').trim().charAt(0) || 'N';
    const className =
      'w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 text-sm font-semibold bg-gray-200';

    if (!photoSrc) {
      return (
        <div className={className} title={name}>
          {initial.toUpperCase()}
        </div>
      );
    }

    return (
      <img
        src={photoSrc}
        alt={name}
        title={name}
        className="w-10 h-10 rounded-full object-cover border border-gray-200"
      />
    );
  };

  if (permissionsLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center text-gray-600">
        Loading portal employee permissions...
      </div>
    );
  }

  if (!canReadPortalEmployeeUsers) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-100 p-6 text-center text-red-600">
        You do not have permission to view portal employee users.
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex items-center justify-between py-5 px-6 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Employee Portal Users</h2>
          <p className="text-sm text-gray-500">
            Manage portal login credentials
          </p>
        </div>
        {canCreatePortalEmployeeUsers && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            + Add Portal User
          </button>
        )}
      </div>

      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 w-full md:max-w-md">
            <div className="relative flex-1">
              <input
                type="search"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search by name, DTR ID, username, or email"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                🔍
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="portal-status-filter" className="text-sm text-gray-700">
              Status
            </label>
            <select
              id="portal-status-filter"
              value={statusFilter}
              onChange={handleStatusChange}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    DTR ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      Loading portal users…
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      No portal user records found.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.userportalid} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {renderEmployeeAvatar(record)}
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {formatFullName(record)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Portal ID: {record.userportalid || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {record.dtruserid || '—'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{record.username || '—'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {renderCreatedByCell(record)}
                      </td>
                      <td className="px-4 py-4">
                        {canUpdatePortalEmployeeUsers ? (
                          <div className="flex items-center justify-start">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={Number(record.status) === 1}
                                onChange={() => handleStatusToggle(record)}
                                disabled={Boolean(statusUpdating[record.userportalid])}
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-emerald-500 rounded-full peer peer-checked:bg-emerald-500 transition-colors"></div>
                              <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                              <span className="ml-3 text-xs font-medium text-gray-700">
                                {Number(record.status) === 1 ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">
                            {Number(record.status) === 1 ? 'Active' : 'Inactive'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          {(() => {
                            const buttons = [];

                            if (canUpdatePortalEmployeeUsers) {
                              buttons.push(
                                <button
                                  key="reset"
                                  onClick={() => handleResetPin(record)}
                                  className="text-purple-600 hover:text-purple-800 transition-colors"
                                  title="Reset PIN"
                                  disabled={actionLoading.reset}
                                >
                                  🔄
                                </button>
                              );
                            }

                            if (canUpdatePortalEmployeeUsers) {
                              buttons.push(
                                <button
                                  key="edit"
                                  onClick={() => openEditModal(record)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                  title="Edit Portal User"
                                >
                                  ✏️
                                </button>
                              );
                            }

                            if (canPrintPortalEmployeeUsers) {
                              buttons.push(
                                <button
                                  key="print"
                                  onClick={() => handlePrint(record)}
                                  className="text-green-600 hover:text-green-800 transition-colors"
                                  title="Print Portal User"
                                >
                                  🖨️
                                </button>
                              );
                            }

                            if (canDeletePortalEmployeeUsers) {
                              buttons.push(
                                <button
                                  key="delete"
                                  onClick={() => handleDelete(record)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete Portal User"
                                  disabled={actionLoading.delete}
                                >
                                  🗑️
                                </button>
                              );
                            }

                            if (buttons.length === 0) {
                              return <span className="text-xs text-gray-400">No actions</span>;
                            }

                            return buttons;
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            Showing {records.length === 0 ? 0 : rowsEnd} portal user{rowsEnd === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {canShowPortalModal && (
        <PortalEmployeeUserModal
          open={modalState.open}
          mode={modalState.mode}
          initialData={modalState.record}
          onClose={closeModal}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}

export default DTRPortalEmployeeUsers;

