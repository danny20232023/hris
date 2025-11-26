import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../authContext';
import api from '../../utils/api';
import { TravelModal } from '../201/201EmployeeTravel';
import { openTravelPrintWindow } from '../201/print_201EmployeeTravel';

const MyTravelPortal = () => {
  const { user } = useAuth();
  const userId = user?.USERID || user?.userid || user?.id || null;

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [employeeObjId, setEmployeeObjId] = useState(null);
  const [canCreateTravel, setCanCreateTravel] = useState(false);
  const [innerTab, setInnerTab] = useState('my');
  const [myTravelRows, setMyTravelRows] = useState([]);
  const [myTravelLoading, setMyTravelLoading] = useState(false);
  const [myTransactionRows, setMyTransactionRows] = useState([]);
  const [myTransactionLoading, setMyTransactionLoading] = useState(false);
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [travelModalKey, setTravelModalKey] = useState(0);
  const [editingTravelRecord, setEditingTravelRecord] = useState(null);
  const [viewTravelRecord, setViewTravelRecord] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setEmployeeObjId(null);
      setCanCreateTravel(false);
      setLoadingProfile(false);
      return;
    }

    try {
      console.log('[MyTravelPortal] Fetching employee profile for userId:', userId);
      const response = await api.get('/201-employees');
      const employees = Array.isArray(response.data?.data) ? response.data.data : [];
      const current = employees.find(emp => String(emp.dtruserid) === String(userId));
      console.log('[MyTravelPortal] Employees fetched:', employees.length);
      console.log('[MyTravelPortal] Matched employee:', current);
      if (current) {
        setEmployeeObjId(current.objid);
        setCanCreateTravel(!!current.cancreatetravel);
      } else {
        setEmployeeObjId(null);
        setCanCreateTravel(false);
      }
    } catch (error) {
      console.error('Failed to load employee profile for travel portal', error);
      setEmployeeObjId(null);
      setCanCreateTravel(false);
    } finally {
      setLoadingProfile(false);
    }
  }, [userId]);

  const fetchMyTravelRecords = useCallback(async () => {
    setMyTravelLoading(true);
    try {
      console.log('[MyTravelPortal] Loading my travel records...');
      const response = await api.get('/employee-travels/my');
      console.log('[MyTravelPortal] /employee-travels/my response:', response.data);
      setMyTravelRows(response.data?.data || []);
    } catch (error) {
      console.error('Failed to load travel records', error);
      setMyTravelRows([]);
    } finally {
      setMyTravelLoading(false);
    }
  }, []);

  const fetchMyTravelTransactions = useCallback(async () => {
    if (!userId) {
      setMyTransactionRows([]);
      return;
    }
    setMyTransactionLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('createdBy', userId);
      const response = await api.get(`/employee-travels/transactions?${params.toString()}`);
      console.log('[MyTravelPortal] My transaction response:', response.data);
      setMyTransactionRows(response.data?.data || []);
    } catch (error) {
      console.error('Failed to load my travel transactions', error);
      setMyTransactionRows([]);
    } finally {
      setMyTransactionLoading(false);
    }
  }, [userId, employeeObjId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!loadingProfile && innerTab === 'my') {
      fetchMyTravelRecords();
    }
  }, [loadingProfile, innerTab, fetchMyTravelRecords]);

  useEffect(() => {
    if (innerTab === 'transactions' && canCreateTravel) {
      fetchMyTravelTransactions();
    }
  }, [innerTab, canCreateTravel, fetchMyTravelTransactions]);

  const refreshActiveTab = () => {
    if (innerTab === 'my') {
      fetchMyTravelRecords();
    } else if (innerTab === 'transactions') {
      fetchMyTravelTransactions();
    }
  };

  const handleCreateTravel = () => {
    setEditingTravelRecord(null);
    setTravelModalKey(prev => prev + 1);
    setShowTravelModal(true);
  };

  const handleEditTravel = (travel) => {
    setEditingTravelRecord(travel || null);
    setTravelModalKey(prev => prev + 1);
    setShowTravelModal(true);
  };

  const closeTravelModal = () => {
    setShowTravelModal(false);
    setEditingTravelRecord(null);
  };

  const handleTravelSaved = () => {
    closeTravelModal();
    fetchMyTravelTransactions();
    fetchMyTravelRecords();
  };

  const employeeColumnContent = useCallback((travel) => {
    const employees = Array.isArray(travel.employees) ? travel.employees : [];
    if (!employees.length) return '—';
    return (
      <div className="flex flex-wrap gap-2">
        {employees.map((emp, idx) => {
          const displayName = (emp.name || emp.fullname || emp.display_name || 'Unknown Employee').replace(/\s+/g, ' ').trim();
          const initials = displayName.split(' ').map(part => part[0] || '').join('').slice(0, 2) || 'NA';
          const hasPhoto = emp.photo_path && (emp.photo_path.startsWith('data:') || emp.photo_path.startsWith('http'));
          const key = emp.objid || `${displayName}-${idx}`;
          return (
            <div key={key} className="relative group">
              {hasPhoto ? (
                <img
                  src={emp.photo_path}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-gray-200"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 border border-gray-200">
                  {initials}
                </div>
              )}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                {displayName}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, []);

  const statusBadge = useCallback((status) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'Returned': return 'bg-orange-100 text-orange-800';
      case 'For Approval': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  }, []);

  const formatCreatorName = (rawName, fallback) => {
    const base = (rawName && rawName.trim()) || (fallback && fallback.trim()) || 'Unknown';
    if (base.includes(',')) {
      const [lastPart, restPart = ''] = base.split(',');
      const lastName = lastPart.trim();
      const firstToken = restPart.trim().split(' ').filter(Boolean)[0] || restPart.trim();
      const firstName = firstToken.trim();
      return [lastName, firstName].filter(Boolean).join(', ') || base;
    }

    const parts = base.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      return `${lastName}, ${firstName}`;
    }

    return base;
  };

  const renderCreatedBy = (travel) => {
    const formattedName = formatCreatorName(travel.created_by_employee_name, travel.created_by_username);
    const photo = travel.created_by_photo_path;
    const initials = formattedName
      .split(',')
      .map(part => part.trim()[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'NA';

    return (
      <div className="relative group inline-block" title={formattedName} aria-label={formattedName}>
        <div className={`w-9 h-9 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600 ${photo ? 'hidden' : ''}`}>
          {initials}
        </div>
        {photo && (
          <img
            src={photo}
            alt={formattedName}
            className="w-9 h-9 rounded-full object-cover border border-gray-200 shadow-sm"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.previousElementSibling;
              if (fallback) {
                fallback.classList.remove('hidden');
              }
            }}
          />
        )}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20 shadow-lg">
          {formattedName}
        </div>
      </div>
    );
  };

  const renderTravelRows = (rows, loading, allowEdit = false) => {
    if (loading) {
      return <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>;
    }
    if (!rows || rows.length === 0) {
      return <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No travel records found.</td></tr>;
    }
    return rows.map((travel) => {
      const approved = String(travel.travelstatus).toLowerCase() === 'approved';
      const canEdit = allowEdit && canCreateTravel && ['pending', 'returned'].includes(String(travel.travelstatus).toLowerCase());
      return (
        <tr key={travel.objid}>
          <td className="px-4 py-2">{travel.travelno}</td>
          <td className="px-4 py-2">{employeeColumnContent(travel)}</td>
          <td className="px-4 py-2">{travel.travel_dates || '—'}</td>
          <td className="px-4 py-2"><div className="max-w-md whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: travel.purpose || '' }} /></td>
          <td className="px-4 py-2">{travel.traveldestination || '—'}</td>
          <td className="px-4 py-2">
            {renderCreatedBy(travel)}
          </td>
          <td className="px-4 py-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(travel.travelstatus)}`}>{travel.travelstatus || '—'}</span>
          </td>
          <td className="px-4 py-2">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setViewTravelRecord(travel)}
                className="text-indigo-600 hover:text-indigo-800"
                title="View details"
              >
                👁
              </button>
              {canEdit ? (
                <button
                  onClick={() => handleEditTravel(travel)}
                  className="text-blue-600 hover:text-blue-800"
                  title="Edit travel"
                >
                  ✏️
                </button>
              ) : null}
              <button
                onClick={() => openTravelPrintWindow(travel)}
                disabled={!approved && !allowEdit}
                className={`text-green-600 hover:text-green-800 ${approved || allowEdit ? '' : 'opacity-40 cursor-not-allowed hover:text-green-600'}`}
                title={approved || allowEdit ? 'Print travel order' : 'Print available once approved'}
              >
                🖨️
              </button>
            </div>
          </td>
        </tr>
      );
    });
  };

  if (loadingProfile) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">Loading travel information…</div>
    );
  }

  if (!employeeObjId) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        Employee record not found. Please contact HR for assistance.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setInnerTab('my')}
              className={`text-sm font-medium px-3 py-2 rounded ${innerTab === 'my' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:text-gray-800'}`}
            >
              My Travel
            </button>
            {canCreateTravel && (
              <button
                onClick={() => setInnerTab('transactions')}
                className={`text-sm font-medium px-3 py-2 rounded ${innerTab === 'transactions' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:text-gray-800'}`}
              >
                My Transactions
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshActiveTab}
              className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
            >
              Refresh
            </button>
            {innerTab === 'transactions' && canCreateTravel && (
              <button
                onClick={handleCreateTravel}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
              >
                <span className="text-lg leading-none">＋</span>
                Create Travel
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Travel No.</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee(s)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Travel Date(s)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-sm">
              {innerTab === 'my'
                ? renderTravelRows(myTravelRows, myTravelLoading, false)
                : renderTravelRows(myTransactionRows, myTransactionLoading, true)}
            </tbody>
          </table>
        </div>
      </div>

      {showTravelModal && (
        <TravelModal
          key={travelModalKey}
          isOpen={showTravelModal}
          onClose={closeTravelModal}
          onSaved={handleTravelSaved}
          travel={editingTravelRecord}
          defaultIsPortal={1}
          portalCanCreateTravel={canCreateTravel}
        />
      )}

      {viewTravelRecord && (
        <TravelDetailsModal
          travel={viewTravelRecord}
          onClose={() => setViewTravelRecord(null)}
        />
      )}
    </div>
  );
};

const TravelDetailsModal = ({ travel, onClose }) => {
  if (!travel) return null;

  const employees = Array.isArray(travel.employees) ? travel.employees : [];
  const badgeClass = (status) => {
    switch (status) {
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'Returned': return 'bg-orange-100 text-orange-800';
      case 'For Approval': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Travel Details</h3>
            <div className="text-sm text-gray-500">Travel Order No. {travel.travelno || '—'}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Destination</h4>
              <div className="text-sm text-gray-900">{travel.traveldestination || '—'}</div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Travel Date(s)</h4>
              <div className="text-sm text-gray-900">{travel.travel_dates || '—'}</div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Status</h4>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass(travel.travelstatus)}`}>{travel.travelstatus || '—'}</span>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Created By</h4>
              <div className="text-sm text-gray-900">{travel.created_by_employee_name || travel.created_by_username || '—'}</div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Purpose</h4>
            <div className="prose prose-sm max-w-none text-gray-900" dangerouslySetInnerHTML={{ __html: travel.purpose || '—' }} />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Employee(s)</h4>
            {employees.length === 0 ? (
              <div className="text-sm text-gray-500">No employees listed.</div>
            ) : (
              <ul className="space-y-2">
                {employees.map((emp) => {
                  const initials = (emp.name || 'NA').split(' ').map(part => part[0]).join('').slice(0, 2);
                  return (
                    <li key={emp.objid} className="flex items-center gap-3">
                      {emp.photo_path ? (
                        <img src={emp.photo_path} alt={emp.name} className="w-8 h-8 rounded-full object-cover border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 border flex items-center justify-center text-xs text-gray-600">
                          {initials}
                        </div>
                      )}
                      <span className="text-sm text-gray-900">{emp.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyTravelPortal;

