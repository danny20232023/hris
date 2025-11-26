import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import api from '../../utils/api';
import { useAuth } from '../../authContext';

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) {
      return new Date(direct.getFullYear(), direct.getMonth(), direct.getDate());
    }
    const parts = value.split('-').map((part) => Number(part));
    if (parts.length === 3 && parts.every((num) => !Number.isNaN(num))) {
      const [year, month, day] = parts;
      return new Date(year, month - 1, day);
    }
  }
  return null;
};

const formatDate = (date) => {
  const normalized = normalizeDate(date);
  if (!normalized) return '';
  const yyyy = normalized.getFullYear();
  const mm = String(normalized.getMonth() + 1).padStart(2, '0');
  const dd = String(normalized.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatDisplayDate = (date) => {
  const normalized = normalizeDate(date);
  if (!normalized) return '';
  const mm = String(normalized.getMonth() + 1).padStart(2, '0');
  const dd = String(normalized.getDate()).padStart(2, '0');
  const yyyy = normalized.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const statusBadgeClass = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700';
    case 'RETURNED':
      return 'bg-yellow-100 text-yellow-700';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'FOR APPROVAL':
    default:
      return 'bg-blue-100 text-blue-700';
  }
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
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
        {name || 'N/A'}
      </div>
    </div>
  );
};

const isCdoExpired = (record) => {
  if (!record) return false;
  if (record.isExpired) return true;
  if (!record.expirydate) return false;
  const expiryTime = new Date(record.expirydate).getTime();
  if (Number.isNaN(expiryTime)) return false;
  return Date.now() > expiryTime;
};

const MyDtrCdoCredit = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [employeeObjId, setEmployeeObjId] = useState(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', title: '', status: 'All' });
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyTitle, setApplyTitle] = useState('');
  const [applyPurpose, setApplyPurpose] = useState('');
  const [applyDescription, setApplyDescription] = useState('');
  const [applyRemarks, setApplyRemarks] = useState('');
  const [applyDates, setApplyDates] = useState([]);

  const [consumeModalOpen, setConsumeModalOpen] = useState(false);
  const [consumeTarget, setConsumeTarget] = useState(null);
  const [consumeDates, setConsumeDates] = useState([]);
  const [consumeReason, setConsumeReason] = useState('');
  const [consumeSubmitting, setConsumeSubmitting] = useState(false);
  const [consumeEditingEntry, setConsumeEditingEntry] = useState(null);

  const ensureEmployeeObjId = useCallback(async () => {
    if (employeeObjId) return employeeObjId;
    try {
      const response = await api.get('/pds-dtrchecker/me');
      const empObjId = response.data?.data?.employee?.objid;
      if (empObjId) {
        setEmployeeObjId(empObjId);
        return empObjId;
      }
    } catch (error) {
      console.error('Failed to resolve employee objid:', error);
    }
    return null;
  }, [employeeObjId]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = { scope: 'self' };
      if (filters.status && filters.status !== 'All') params.status = filters.status;
      if (filters.title) params.title = filters.title;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      const response = await api.get('/dtr/employee-cdo/transactions', { params });
      const list = Array.isArray(response.data?.data) ? response.data.data : [];
      setRecords(list);
      if (!employeeObjId && list.length) {
        setEmployeeObjId(list[0].emp_objid || null);
      }
    } catch (error) {
      console.error('Failed to load CDO records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filters, employeeObjId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => records, [records]);

  const totalRemainingCredits = useMemo(() => {
    return filteredRecords.reduce((sum, record) => {
      if (isCdoExpired(record)) return sum;
      if ((record.cdostatus || '').toUpperCase() !== 'APPROVED') return sum;
      const remaining = record.remainingCredits != null
        ? Number(record.remainingCredits)
        : Math.max((Number(record.earnedcredit) || 0) - (Number(record.usedcredit) || 0), 0);
      return sum + Math.max(remaining, 0);
    }, 0);
  }, [filteredRecords]);

  const remainingCredits = useMemo(() => {
    if (!consumeTarget) return 0;
    const earned = Number(consumeTarget.earnedcredit) || 0;
    const used = Number(consumeTarget.usedcredit) || 0;
    if (isCdoExpired(consumeTarget)) return 0;
    return Math.max(earned - used, 0);
  }, [consumeTarget]);

  const consumeDateItems = useMemo(
    () => consumeDates.map((date) => ({ value: formatDate(date), label: formatDisplayDate(date) })),
    [consumeDates]
  );

  const handleApplyDateSelect = (selected) => {
    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    const normalized = [];
    const seen = new Set();
    list.forEach((value) => {
      const normalizedDate = normalizeDate(value);
      if (normalizedDate) {
        const key = normalizedDate.getTime();
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(normalizedDate);
        }
      }
    });
    normalized.sort((a, b) => a.getTime() - b.getTime());
    setApplyDates(normalized);
  };

  const removeApplyDate = (value) => {
    setApplyDates((prev) => prev.filter((date) => formatDate(date) !== value));
  };

  const handleConsumeDateSelect = (selected) => {
    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    const normalized = [];
    const seen = new Set();
    list.forEach((value) => {
      const normalizedDate = normalizeDate(value);
      if (normalizedDate) {
        const key = normalizedDate.getTime();
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(normalizedDate);
        }
      }
    });
    normalized.sort((a, b) => a.getTime() - b.getTime());
    const limit = consumeEditingEntry ? 1 : remainingCredits > 0 ? remainingCredits : 1;
    if (limit > 0 && normalized.length > limit) {
      normalized.splice(limit);
    }
    setConsumeDates(normalized);
  };

  const removeConsumeDate = (value) => {
    setConsumeDates((prev) => prev.filter((date) => formatDate(date) !== value));
  };

  const openApplyModal = async () => {
    const resolved = await ensureEmployeeObjId();
    if (!resolved) {
      alert('Unable to determine employee reference.');
      return;
    }
    setApplyTitle('');
    setApplyPurpose('');
    setApplyDescription('');
    setApplyRemarks('');
    setApplyDates([]);
    setApplyModalOpen(true);
  };

  const closeApplyModal = () => {
    setApplyModalOpen(false);
    setApplySubmitting(false);
  };

  const handleApplySubmit = async (event) => {
    event.preventDefault();
    const empObj = await ensureEmployeeObjId();
    if (!empObj) {
      alert('Employee information not available.');
      return;
    }
    if (!applyTitle.trim()) {
      alert('Please provide a title for the credit.');
      return;
    }
    if (!applyPurpose.trim()) {
      alert('Please provide the purpose.');
      return;
    }
    if (!applyDates.length) {
      alert('Please select at least one work date.');
      return;
    }

    const workdates = Array.from(new Set(applyDates.map((date) => formatDate(date)))).sort();
    setApplySubmitting(true);
    try {
      await api.post('/dtr/employee-cdo/transactions', {
        emp_objid: empObj,
        cdotitle: applyTitle.trim(),
        cdopurpose: applyPurpose.trim(),
        cdodescription: applyDescription.trim() || null,
        cdoremarks: applyRemarks.trim() || null,
        earnedcredit: workdates.length,
        workdates,
      });
      alert('CDO credit application submitted.');
      closeApplyModal();
      fetchRecords();
    } catch (error) {
      console.error('Failed to apply CDO credit:', error);
      alert(error.response?.data?.message || 'Failed to apply CDO credit');
    } finally {
      setApplySubmitting(false);
    }
  };

  const openConsumeModal = (record) => {
    setConsumeEditingEntry(null);
    setConsumeTarget(record);
    setConsumeDates([]);
    setConsumeReason('');
    setConsumeModalOpen(true);
  };

  const closeConsumeModal = () => {
    setConsumeModalOpen(false);
    setConsumeTarget(null);
    setConsumeDates([]);
    setConsumeReason('');
    setConsumeSubmitting(false);
    setConsumeEditingEntry(null);
  };

  const handleConsumeSubmit = async (event) => {
    event.preventDefault();
    if (!consumeTarget) return;
    if (isCdoExpired(consumeTarget)) {
      alert('This CDO credit has expired and can no longer be used.');
      return;
    }
    if (!consumeDates.length) {
      alert('Please select at least one consume date.');
      return;
    }
    if (!consumeReason.trim()) {
      alert('Please provide a reason.');
      return;
    }
    if (!consumeEditingEntry && consumeDates.length > remainingCredits) {
      alert(`Only ${remainingCredits} credit(s) remain for this CDO.`);
      return;
    }

    const dateStrings = Array.from(new Set(consumeDates.map((date) => formatDate(date))));
    setConsumeSubmitting(true);
    try {
      if (consumeEditingEntry) {
        const payload = {
          reason: consumeReason.trim(),
          cdodates: dateStrings.length ? [dateStrings[0]] : [],
        };
        await api.put(`/dtr/employee-cdo/usedates/${consumeEditingEntry.id}`, payload);
        alert('Consume record updated.');
      } else {
        await api.post(`/dtr/employee-cdo/transactions/${consumeTarget.id}/consume`, {
          dates: dateStrings,
          reason: consumeReason.trim(),
        });
        alert('Consume request submitted.');
      }
      closeConsumeModal();
      fetchRecords();
    } catch (error) {
      console.error('Failed to consume CDO credits:', error);
      alert(error.response?.data?.message || 'Failed to consume CDO credits');
    } finally {
      setConsumeSubmitting(false);
    }
  };

  const applySelectedDateItems = useMemo(
    () => applyDates.map((date) => ({ value: formatDate(date), label: formatDisplayDate(date) })),
    [applyDates]
  );

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetFilters = () => {
    setFilters({ dateFrom: '', dateTo: '', title: '', status: 'All' });
  };

  const handleEditConsumeEntry = (entry, record) => {
    if (!entry || Number(entry.isportal) !== 1) return;
    const status = (entry.cdodatestatus || '').toUpperCase();
    if (status === 'APPROVED') return;

    setConsumeTarget(record);
    const entryDate = normalizeDate(entry.cdodate);
    setConsumeDates(entryDate ? [entryDate] : []);
    setConsumeReason(entry.reason || '');
    setConsumeEditingEntry(entry);
    setConsumeModalOpen(true);
  };

  const handleCancelConsumeEntry = async (entry) => {
    if (!entry || Number(entry.isportal) !== 1) return;
    const status = (entry.cdodatestatus || '').toUpperCase();
    if (status === 'APPROVED') return;
    if (!window.confirm('Cancel this consume record request?')) return;
    try {
      await api.put(`/dtr/employee-cdo/usedates/${entry.id}/status`, { status: 'Cancelled' });
      alert('Consume record cancelled.');
      fetchRecords();
    } catch (error) {
      console.error('Failed to cancel consume record:', error);
      alert(error.response?.data?.message || 'Failed to cancel consume record');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-4 border-b flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-700">My CDO Credits</h2>
              {loading && <span className="text-sm text-gray-500">Loading…</span>}
            </div>
            <span className="text-sm text-gray-500">Available Credits: <span className="font-semibold text-gray-800">{totalRemainingCredits}</span></span>
          </div>
          <button
            onClick={openApplyModal}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700"
          >
            Apply CDO Credit
          </button>
        </div>
        <div className="px-4 py-4 border-b bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
              <input
                type="text"
                value={filters.title}
                onChange={(e) => handleFilterChange('title', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Search title"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="All">All</option>
                <option value="For Approval">For Approval</option>
                <option value="Approved">Approved</option>
                <option value="Returned">Returned</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={fetchRecords}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Apply Filters
              </button>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 border text-sm rounded hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-12"></th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference Credit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Earned Credits</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Consumed Credits</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Remaining Credits</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {!filteredRecords.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">No CDO credits found.</td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const remaining = record.remainingCredits != null
                    ? Number(record.remainingCredits)
                    : Math.max((Number(record.earnedcredit) || 0) - (Number(record.usedcredit) || 0), 0);
                  const expired = isCdoExpired(record);
                  const statusApproved = (record.cdostatus || '').toUpperCase() === 'APPROVED';
                  const consumeDisabled = !statusApproved || expired || remaining <= 0 || Number(record.isconsume) === 1;
                  const isExpanded = record._expanded || false;

                  return (
                    <React.Fragment key={record.id}>
                      <tr className="align-top">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setRecords((prev) => prev.map((item) => (
                                item.id === record.id ? { ...item, _expanded: !item._expanded } : item
                              )));
                            }}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title={isExpanded ? 'Collapse details' : 'Expand details'}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{record.cdono}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium text-gray-800">{record.cdotitle || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.earnedcredit}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{record.usedcredit}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {expired ? (
                            <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                              0 <span className="text-xs uppercase tracking-wide">(Expired)</span>
                            </span>
                          ) : (
                            remaining
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {Number(record.isportal) === 0 && (record.createdByPhoto || record.createdByName) ? (
                            <AvatarWithTooltip photo={record.createdByPhoto} name={record.createdByName || 'Creator'} />
                          ) : (
                            <span className="text-xs text-gray-500">Portal</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(record.cdostatus)}`}>
                            {record.cdostatus || 'For Approval'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            type="button"
                            onClick={() => openConsumeModal(record)}
                            disabled={consumeDisabled}
                            className="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Use Credits
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="px-4 pb-4 bg-gray-50">
                            {record.consumeEntries && record.consumeEntries.length ? (
                              <table className="min-w-full divide-y divide-gray-200 bg-white rounded">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Use Date</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Created By</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {record.consumeEntries.map((entry) => (
                                    <tr key={entry.id}>
                                      <td className="px-3 py-2 text-sm text-gray-900">{entry.cdodate || '—'}</td>
                                      <td className="px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{entry.reason || '—'}</td>
                                      <td className="px-3 py-2 text-sm text-gray-700">
                                        {Number(entry.isportal) === 1 ? (
                                          <span className="text-blue-600 font-semibold">Portal</span>
                                        ) : (
                                          <AvatarWithTooltip photo={entry.createdByPhoto} name={entry.createdByName || 'Creator'} />
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-sm">
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(entry.cdodatestatus)}`}>
                                          {entry.cdodatestatus || 'For Approval'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-sm">
                                        {Number(entry.isportal) === 1 && (!entry.cdodatestatus || entry.cdodatestatus.toUpperCase() !== 'APPROVED') ? (
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleEditConsumeEntry(entry, record)}
                                              className="text-blue-600 hover:text-blue-800 transition-colors"
                                              title="Edit consume record"
                                            >
                                              ✏️
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleCancelConsumeEntry(entry)}
                                              className="text-red-600 hover:text-red-800 transition-colors"
                                              title="Cancel consume record"
                                            >
                                              ✖
                                            </button>
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="text-sm text-gray-500">No consume records.</div>
                            )}
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

      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Apply CDO Credit</h3>
              <button onClick={closeApplyModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <form onSubmit={handleApplySubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input
                    type="text"
                    value={applyTitle}
                    onChange={(e) => setApplyTitle(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Purpose</label>
                  <input
                    type="text"
                    value={applyPurpose}
                    onChange={(e) => setApplyPurpose(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Work Date(s)</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
                  <div className="border rounded-md p-3 bg-white overflow-x-auto">
                    <DayPicker
                      mode="multiple"
                      selected={applyDates}
                      onSelect={handleApplyDateSelect}
                      weekStartsOn={1}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 1}
                      className="min-w-[280px]"
                    />
                  </div>
                  <div className="border rounded-md p-3 bg-gray-50 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Selected Dates</span>
                      <span className="text-xs text-gray-600">{applyDates.length} day(s)</span>
                    </div>
                    <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                      {applySelectedDateItems.length > 0 ? (
                        applySelectedDateItems.map((item) => (
                          <li key={item.value} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                            <span>{item.label}</span>
                            <button
                              type="button"
                              onClick={() => removeApplyDate(item.value)}
                              className="text-red-600 text-xs hover:underline"
                            >
                              Remove
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="text-xs text-gray-500">No dates selected</li>
                      )}
                    </ul>
                    {applySelectedDateItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setApplyDates([])}
                        className="mt-3 text-xs text-red-600 hover:underline self-start"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 border-t pt-4">
                <button
                  type="button"
                  onClick={closeApplyModal}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applySubmitting || applyDates.length === 0}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applySubmitting ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {consumeModalOpen && consumeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Use CDO Credits</h3>
              <button onClick={closeConsumeModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <form onSubmit={handleConsumeSubmit} className="px-6 py-5 space-y-4">
              <div className="space-y-2 text-sm">
                <div><span className="font-semibold text-gray-700">Reference:</span> {consumeTarget.cdono}</div>
                <div className="flex items-center gap-3">
                  <AvatarWithTooltip photo={consumeTarget.employeePhoto} name={consumeTarget.employeeName} />
                  <div className="font-semibold text-gray-800">{consumeTarget.employeeName || 'N/A'}</div>
                </div>
                <div className="text-xs text-gray-500">
                  Remaining credits: {Math.max(remainingCredits - consumeDates.length, 0)} / {remainingCredits}
                </div>
                {consumeTarget.expirydate && (
                  <div className={`text-xs font-semibold ${isCdoExpired(consumeTarget) ? 'text-red-600' : 'text-gray-500'}`}>
                    Expiry: {formatDisplayDate(consumeTarget.expirydate)}
                    {isCdoExpired(consumeTarget) ? ' (Expired)' : ''}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border rounded-md p-3 bg-white overflow-x-auto">
                  <DayPicker
                    mode="multiple"
                    selected={consumeDates}
                    onSelect={handleConsumeDateSelect}
                    weekStartsOn={1}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 1}
                    toYear={new Date().getFullYear() + 1}
                    className="min-w-[280px]"
                  />
                </div>
                <div className="border rounded-md p-3 bg-gray-50 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Selected Dates</span>
                    <span className="text-xs text-gray-600">{consumeDates.length} day(s)</span>
                  </div>
                  <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                    {consumeDateItems.length > 0 ? (
                      consumeDateItems.map((item) => (
                        <li key={item.value} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                          <span>{item.label}</span>
                          <button
                            type="button"
                            onClick={() => removeConsumeDate(item.value)}
                            className="text-red-600 text-xs hover:underline"
                          >
                            Remove
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-gray-500">No dates selected</li>
                    )}
                  </ul>
                  {consumeDateItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConsumeDates([])}
                      className="mt-3 text-xs text-red-600 hover:underline self-start"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Reason</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={consumeReason}
                  onChange={(e) => setConsumeReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 border-t pt-4">
                <button
                  type="button"
                  onClick={closeConsumeModal}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={consumeSubmitting || consumeDates.length === 0 || !consumeReason.trim()}
                  className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {consumeSubmitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyDtrCdoCredit;
