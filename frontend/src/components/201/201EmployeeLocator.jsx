import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { useAuth } from '../../authContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const StatusPill = ({ status }) => {
  const color = status === 'Approved'
    ? 'bg-green-100 text-green-800'
    : status === 'Returned'
    ? 'bg-yellow-100 text-yellow-800'
    : status === 'Cancelled'
    ? 'bg-red-100 text-red-800'
    : 'bg-blue-100 text-blue-800';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{status}</span>;
};

const LocatorModal = ({ isOpen, onClose, onSaved, initial, emp }) => {
  const [saving, setSaving] = useState(false);
  // Helper to extract time value (HH:MM or HH:MM:SS format)
  const extractTimeValue = (timeValue) => {
    if (!timeValue) return '';
    const str = String(timeValue);
    // If it's already in HH:MM format, return it
    if (/^\d{2}:\d{2}$/.test(str)) return str;
    // If it's in HH:MM:SS format, extract HH:MM
    if (/^\d{2}:\d{2}:\d{2}$/.test(str)) return str.slice(0, 5);
    // If it includes 'T' (ISO datetime format), extract time portion
    if (str.includes('T')) {
      const match = str.match(/T(\d{2}:\d{2})/);
      if (match) return match[1];
    }
    // If it's a datetime string, try to extract time portion
    if (str.includes(' ') || str.includes('T')) {
      const parts = str.split(/[ T]/);
      if (parts.length > 1 && /^\d{2}:\d{2}/.test(parts[1])) {
        return parts[1].slice(0, 5);
      }
    }
    // Return as-is if it matches HH:MM pattern at the start
    const timeMatch = str.match(/^(\d{2}:\d{2})/);
    return timeMatch ? timeMatch[1] : '';
  };

  const [form, setForm] = useState(() => ({
    emp_objid: initial?.emp_objid || emp?.objid || '',
    locpurpose: initial?.locpurpose || '',
    locatordate: initial?.locatordate ? String(initial.locatordate).slice(0,10) : '',
    locdestination: initial?.locdestination || '',
    loctimedeparture: extractTimeValue(initial?.loctimedeparture),
    loctimearrival: extractTimeValue(initial?.loctimearrival),
    locstatus: initial?.locstatus || 'For Approval'
  }));

  // Parse time string (HH:MM) into hours and minutes
  const parseTime = (timeStr) => {
    if (!timeStr) return { hours: '', minutes: '' };
    const match = String(timeStr).match(/(\d{2}):(\d{2})/);
    if (match) {
      return { hours: match[1], minutes: match[2] };
    }
    // If time string includes 'T', try to extract from ISO format
    if (timeStr.includes('T')) {
      const isoMatch = String(timeStr).match(/T(\d{2}):(\d{2})/);
      if (isoMatch) {
        return { hours: isoMatch[1], minutes: isoMatch[2] };
      }
    }
    return { hours: '', minutes: '' };
  };

  // Get time values for form
  const departureTimeValues = parseTime(form.loctimedeparture);
  const arrivalTimeValues = parseTime(form.loctimearrival);

  // Generate time options for 24-hour format
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Handle time change
  const handleTimeChange = (field, type, value) => {
    setForm((f) => {
      const currentTimeStr = f[field] || '';
      const currentValues = parseTime(currentTimeStr);
      const newValues = { ...currentValues, [type]: value };
      
      if (newValues.hours && newValues.minutes) {
        const timeString = `${newValues.hours}:${newValues.minutes}`;
        return { ...f, [field]: timeString };
      } else if (!newValues.hours && !newValues.minutes) {
        return { ...f, [field]: '' };
      } else {
        // Keep partial time in form state (for validation purposes)
        const timeString = newValues.hours && newValues.minutes 
          ? `${newValues.hours}:${newValues.minutes}` 
          : '';
        return { ...f, [field]: timeString };
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      setForm({
        emp_objid: initial?.emp_objid || emp?.objid || '',
        locpurpose: initial?.locpurpose || '',
        locatordate: initial?.locatordate ? String(initial.locatordate).slice(0,10) : '',
        locdestination: initial?.locdestination || '',
        loctimedeparture: extractTimeValue(initial?.loctimedeparture),
        loctimearrival: extractTimeValue(initial?.loctimearrival),
        locstatus: initial?.locstatus || 'For Approval'
      });
    }
  }, [isOpen, initial, emp]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    if (!form.emp_objid || !form.locpurpose || !form.locatordate || !form.loctimedeparture || !form.loctimearrival) {
      alert('Please fill required fields');
      return;
    }
    setSaving(true);
    try {
      // Pass time values directly as-is (HH:MM format) without any conversion
      const payload = {
        locpurpose: form.locpurpose,
        locatordate: form.locatordate,
        locdestination: form.locdestination,
        loctimedeparture: form.loctimedeparture, // Pass directly as HH:MM
        loctimearrival: form.loctimearrival // Pass directly as HH:MM
      };

      if (initial?.objid) {
        await api.put(`/employee-locators/${initial.objid}`, payload);
      } else {
        await api.post('/employee-locators', {
          emp_objid: form.emp_objid,
          ...payload,
          // locstatus ignored server-side; defaults to For Approval
        });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Failed to save locator', e);
      alert('Failed to save locator');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
              {emp?.photo ? <img src={emp.photo} alt={emp?.name || 'Employee'} className="w-full h-full object-cover" /> : null}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{initial?.objid ? 'Edit Locator' : 'Add Locator'}</h3>
              {emp?.name ? <div className="text-sm text-gray-600">{emp.name}</div> : null}
            </div>
          </div>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600">Locator Date</label>
            <input name="locatordate" type="date" className="mt-1 w-full border rounded px-3 py-2" value={form.locatordate} onChange={onChange} />
          </div>
          <div>
            <label className="text-sm text-gray-600">Destination</label>
            <input name="locdestination" className="mt-1 w-full border rounded px-3 py-2" value={form.locdestination} onChange={onChange} />
          </div>
          <div>
            <label className="text-sm text-gray-600">Time Departure</label>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={departureTimeValues.hours}
                onChange={(e) => handleTimeChange('loctimedeparture', 'hours', e.target.value)}
                className="flex-1 border rounded px-3 py-2"
              >
                <option value="">HH</option>
                {hours.map(hour => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
              <span className="text-gray-500">:</span>
              <select
                value={departureTimeValues.minutes}
                onChange={(e) => handleTimeChange('loctimedeparture', 'minutes', e.target.value)}
                className="flex-1 border rounded px-3 py-2"
              >
                <option value="">MM</option>
                {minutes.map(minute => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-600">Time Arrival</label>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={arrivalTimeValues.hours}
                onChange={(e) => handleTimeChange('loctimearrival', 'hours', e.target.value)}
                className="flex-1 border rounded px-3 py-2"
              >
                <option value="">HH</option>
                {hours.map(hour => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
              <span className="text-gray-500">:</span>
              <select
                value={arrivalTimeValues.minutes}
                onChange={(e) => handleTimeChange('loctimearrival', 'minutes', e.target.value)}
                className="flex-1 border rounded px-3 py-2"
              >
                <option value="">MM</option>
                {minutes.map(minute => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm text-gray-600">Purpose</label>
            <textarea name="locpurpose" className="mt-1 w-full border rounded px-3 py-2" rows={1} value={form.locpurpose} onChange={onChange} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="px-4 py-2 rounded border" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const ApproveModal = ({ isOpen, onClose, onApprove, locatorNo }) => {
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRemarks('');
    }
  }, [isOpen]);

  const handleApprove = async () => {
    if (!remarks.trim()) {
      alert('Please enter remarks');
      return;
    }
    setSaving(true);
    try {
      await onApprove(remarks);
      onClose();
    } catch (e) {
      console.error('Approve failed', e);
      alert('Failed to approve locator');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Approve Locator</h3>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">Are you sure you want to approve locator <strong>{locatorNo}</strong>?</p>
          <label className="block text-sm text-gray-600 mb-1">Remarks</label>
          <textarea
            className="w-full border rounded px-3 py-2"
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter remarks..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded border" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60" onClick={handleApprove} disabled={saving}>
            {saving ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
};

const EmployeeGroupHeader = ({ employee, count, onAdd }) => {
  return (
    <tr className="sticky top-0 bg-gray-50">
      <td className="px-4 py-2 hidden sm:table-cell">
        {employee?.photo ? (
          <img src={employee.photo} alt="emp" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200" />
        )}
      </td>
      <td className="px-4 py-2 font-semibold" colSpan={2}>{employee?.name || 'Employee'}</td>
      <td className="px-4 py-2 text-sm text-gray-500" colSpan={3}>{count} record{count !== 1 ? 's' : ''}</td>
      <td className="px-4 py-2 text-right" colSpan={2}>
        <button onClick={onAdd} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
          <span>＋</span> Add
        </button>
      </td>
    </tr>
  );
};

const EmployeeLocator = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('info');
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [txRows, setTxRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // Filter states for Employee Transactions tab
  const [searchEmployee, setSearchEmployee] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [activeEmp, setActiveEmp] = useState(null);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveRow, setApproveRow] = useState(null);

  const fetchLocatorCounts = async (empList) => {
    try {
      const countsMap = new Map();
      // Fetch counts for all employees in parallel
      const countPromises = empList.map(async (emp) => {
        try {
          const res = await api.get('/employee-locators', { params: { emp_objid: emp.objid } });
          const count = (res.data?.data || []).length;
          return { objid: emp.objid, count };
        } catch (e) {
          console.error(`Failed to load count for employee ${emp.objid}`, e);
          return { objid: emp.objid, count: 0 };
        }
      });
      const results = await Promise.all(countPromises);
      results.forEach(({ objid, count }) => {
        countsMap.set(objid, count);
      });
      setEmpLocCounts(countsMap);
    } catch (e) {
      console.error('Failed to load locator counts', e);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const empRes = await api.get('/201-employees');
      const empList = empRes.data?.data || [];
      setEmployees(empList);
      setRows([]); // locators will be lazy-loaded per employee
      // Fetch locator counts for all employees
      await fetchLocatorCounts(empList);
    } catch (e) {
      console.error('Failed to load locators', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/employee-locators');
      const items = (res.data?.data || []).sort((a, b) => new Date(b.locatordate) - new Date(a.locatordate));
      setTxRows(items);
    } catch (e) {
      console.error('Failed to load transactions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (activeTab === 'tx') fetchTransactions(); }, [activeTab]);

  const [expanded, setExpanded] = useState(new Set());
  const [empLocMap, setEmpLocMap] = useState(new Map());
  const [empLocCounts, setEmpLocCounts] = useState(new Map());

  const groups = useMemo(() => {
    const filtered = (employees || []).filter(e => {
      if (!search) return true;
      const name = (e.fullname || formatEmployeeName(e.surname, e.firstname, e.middlename)).toLowerCase();
      return name.includes(search.toLowerCase());
    });
    return filtered.map(e => ({
      employee: {
        objid: e.objid,
        name: e.fullname || formatEmployeeName(e.surname, e.firstname, e.middlename),
        photo: e.photo_path || null,
      },
      items: empLocMap.get(e.objid) || []
    }));
  }, [employees, empLocMap, search]);

  const refreshLocatorCount = async (empObjId) => {
    try {
      const res = await api.get('/employee-locators', { params: { emp_objid: empObjId } });
      const count = (res.data?.data || []).length;
      setEmpLocCounts(prev => new Map(prev).set(empObjId, count));
    } catch (e) {
      console.error('Failed to refresh locator count', e);
      setEmpLocCounts(prev => new Map(prev).set(empObjId, 0));
    }
  };

  const toggleExpand = async (empObjId) => {
    const next = new Set(expanded);
    if (next.has(empObjId)) {
      next.delete(empObjId);
      setExpanded(next);
      return;
    }
    next.add(empObjId);
    setExpanded(next);
    if (!empLocMap.has(empObjId)) {
      try {
        const res = await api.get('/employee-locators', { params: { emp_objid: empObjId } });
        const items = (res.data?.data || []).sort((a,b)=> new Date(b.locatordate) - new Date(a.locatordate));
        setEmpLocMap(prev => new Map(prev).set(empObjId, items));
        // Update count when loading locators
        setEmpLocCounts(prev => new Map(prev).set(empObjId, items.length));
      } catch (e) {
        console.error('Failed to load employee locators', e);
        setEmpLocMap(prev => new Map(prev).set(empObjId, []));
        setEmpLocCounts(prev => new Map(prev).set(empObjId, 0));
      }
    }
  };

  const openAddForGroup = (group) => {
    setActiveEmp({ objid: group.employee.objid, name: group.employee.name, photo: group.employee.photo });
    setEditRow(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setActiveEmp({ objid: row.emp_objid });
    setEditRow(row);
    setModalOpen(true);
  };

  const openApprove = (row) => {
    setApproveRow(row);
    setApproveModalOpen(true);
  };

  const handleApprove = async (remarks) => {
    if (!approveRow) return;
    try {
      await api.put(`/employee-locators/${approveRow.objid}`, {
        locstatus: 'Approved',
        locremarks: remarks
      });
      if (activeTab === 'info') {
        // Refresh the specific employee's locators
        const empObjId = approveRow.emp_objid;
        await refreshLocatorCount(empObjId);
        if (empLocMap.has(empObjId)) {
          const res = await api.get('/employee-locators', { params: { emp_objid: empObjId } });
          const items = (res.data?.data || []).sort((a,b)=> new Date(b.locatordate) - new Date(a.locatordate));
          setEmpLocMap(prev => new Map(prev).set(empObjId, items));
          setEmpLocCounts(prev => new Map(prev).set(empObjId, items.length));
        }
      } else {
        fetchTransactions();
      }
    } catch (e) {
      console.error('Approve failed', e);
      throw e;
    }
  };

  const formatDateMMDDYYYY = (value) => {
    if (!value) return '';
    const str = String(value).slice(0, 10);
    if (str.length === 10 && str.includes('-')) {
      const [y, m, d] = str.split('-');
      return `${m}/${d}/${y}`;
    }
    return str;
  };

  // Format time value to display HH:MM only (no seconds)
  const formatTimeHHMM = (timeValue) => {
    if (!timeValue) return '—';
    const str = String(timeValue);
    // If it's already in HH:MM format, return it
    if (/^\d{2}:\d{2}$/.test(str)) return str;
    // If it's in HH:MM:SS format, extract HH:MM
    if (/^\d{2}:\d{2}:\d{2}$/.test(str)) return str.slice(0, 5);
    // If it includes 'T' (ISO datetime format), extract time portion
    if (str.includes('T')) {
      const match = str.match(/T(\d{2}:\d{2})/);
      if (match) return match[1];
    }
    // If it's a datetime string, try to extract time portion
    if (str.includes(' ') || str.includes('T')) {
      const parts = str.split(/[ T]/);
      if (parts.length > 1 && /^\d{2}:\d{2}/.test(parts[1])) {
        return parts[1].slice(0, 5);
      }
    }
    // Return as-is if it matches HH:MM pattern at the start
    const timeMatch = str.match(/^(\d{2}:\d{2})/);
    return timeMatch ? timeMatch[1] : '—';
  };

  // Filtered transactions for Employee Transactions tab
  const filteredTxRows = useMemo(() => {
    let filtered = [...txRows];
    
    // Filter by employee name
    if (searchEmployee.trim()) {
      const searchLower = searchEmployee.toLowerCase().trim();
      filtered = filtered.filter(record => {
        const employeeName = (
          record.employee?.name || 
          record.employee?.fullname || 
          record.employee_name || 
          ''
        ).toLowerCase();
        return employeeName.includes(searchLower);
      });
    }
    
    // Filter by date range
    if (dateFrom) {
      filtered = filtered.filter(record => {
        const recordDate = String(record.locatordate || '').slice(0, 10);
        return recordDate >= dateFrom;
      });
    }
    
    if (dateTo) {
      filtered = filtered.filter(record => {
        const recordDate = String(record.locatordate || '').slice(0, 10);
        return recordDate <= dateTo;
      });
    }
    
    // Filter by status
    if (statusFilter) {
      filtered = filtered.filter(record => {
        const recordStatus = (record.locstatus || 'For Approval').toUpperCase();
        return recordStatus === statusFilter.toUpperCase();
      });
    }
    
    return filtered;
  }, [txRows, searchEmployee, dateFrom, dateTo, statusFilter]);

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6">
          <div className="flex space-x-8">
            <button onClick={() => { setActiveTab('info'); }} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'info' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500'}`}>Employee Locators</button>
            <button onClick={() => { setActiveTab('tx'); }} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'tx' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500'}`}>Transactions</button>
          </div>
        </div>
      </div>

      {activeTab === 'info' && (
        <div className="mt-4">
          <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Search employee name</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Dela Cruz, Juan"
              className="w-full px-3 py-2 border rounded text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSearch(search)}
              className="px-4 py-2 bg-indigo-600 text-white rounded text-sm"
            >
              Filter
            </button>
            {search && (
              <button
                className="px-4 py-2 border rounded text-sm"
                onClick={() => setSearch('')}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No employees found.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g, gi) => (
            <div key={gi} className="bg-white rounded-lg shadow">
              <div className="p-4 flex items-center justify-between border-b">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(g.employee.objid)}
                    className="inline-flex items-center justify-center w-6 h-6 border rounded-full text-sm text-gray-600 hover:bg-gray-100"
                    aria-label={expanded.has(g.employee.objid) ? 'Collapse details' : 'Expand details'}
                  >
                    {expanded.has(g.employee.objid) ? '-' : '+'}
                  </button>
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                    {g.employee.photo ? (
                      <img src={g.employee.photo} alt="emp" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <div className="font-semibold">{g.employee.name}</div>
                    <div className="text-xs text-gray-500">{(empLocCounts.get(g.employee.objid) || 0)} record{(empLocCounts.get(g.employee.objid) || 0) !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {can('201-locator', 'create') && (
                    <button onClick={() => openAddForGroup(g)} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"><span>＋</span> Add</button>
                  )}
                </div>
              </div>
              {expanded.has(g.employee.objid) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                                             <tr>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Locator No.</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Locator Date</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                       </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                                                                           {(empLocMap.get(g.employee.objid) || []).map((r) => (
                                                   <tr key={r.objid}>
                             <td className="px-4 py-2">{r.locatorno || '—'}</td>
                             <td className="px-4 py-2">{formatDateMMDDYYYY(r.locatordate) || '—'}</td>
                            <td className="px-4 py-2 max-w-xs whitespace-pre-wrap break-words" title={r.locdestination}>{r.locdestination || '—'}</td>
                            <td className="px-4 py-2 max-w-xs whitespace-pre-wrap break-words" title={r.locpurpose}>{r.locpurpose || '—'}</td>
                           <td className="px-4 py-2"><StatusPill status={r.locstatus || 'For Approval'} /></td>
                          <td className="px-4 py-2">
                            {r.createdby_photo_path ? (
                              <img src={r.createdby_photo_path} alt={r.createdby_name || 'Creator'} className="w-8 h-8 rounded-full object-cover" title={r.createdby_name || ''} />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200" title={r.createdby_name || ''} />
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              {can('201-locator', 'update') && (
                                <button
                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                  onClick={() => openEdit(r)}
                                  title="Edit Locator"
                                >
                                  ✏️
                                </button>
                              )}
                              {can('201-locator', 'delete') && (
                                <button 
                                  className="text-red-600 hover:text-red-800 transition-colors" 
                                  onClick={async () => {
                                    if (window.confirm('Delete this locator?')) {
                                      try {
                                        await api.delete(`/employee-locators/${r.objid}`);
                                        const empObjId = r.emp_objid;
                                        // Refresh the specific employee's locators
                                        if (empLocMap.has(empObjId)) {
                                          const res = await api.get('/employee-locators', { params: { emp_objid: empObjId } });
                                          const items = (res.data?.data || []).sort((a,b)=> new Date(b.locatordate) - new Date(a.locatordate));
                                          setEmpLocMap(prev => new Map(prev).set(empObjId, items));
                                          setEmpLocCounts(prev => new Map(prev).set(empObjId, items.length));
                                        } else {
                                          await refreshLocatorCount(empObjId);
                                        }
                                      } catch (e) {
                                        console.error('Delete failed', e);
                                        alert('Delete failed');
                                      }
                                    }
                                  }} 
                                  title="Delete Locator"
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
          ))}
        </div>
      )}
        </div>
      )}

      {activeTab === 'tx' && (
        <div className="mt-4">
          {loading ? (<div className="text-center py-10">Loading…</div>) : (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow">
                {/* Filter Section */}
                <div className="px-4 py-5 border-b bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Search Employee Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2.5">
                        Search Employee
                      </label>
                      <input
                        type="text"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3"
                        placeholder="Search by employee name..."
                        value={searchEmployee}
                        onChange={(e) => setSearchEmployee(e.target.value)}
                      />
                    </div>
                    
                    {/* Date From Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2.5">
                        Date From
                      </label>
                      <input
                        type="date"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </div>
                    
                    {/* Date To Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2.5">
                        Date To
                      </label>
                      <input
                        type="date"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        min={dateFrom || undefined}
                      />
                    </div>
                    
                    {/* Status Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2.5">
                        Status
                      </label>
                      <select
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3"
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
                  
                  {/* Clear Filters Button */}
                  {(searchEmployee || dateFrom || dateTo || statusFilter) && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchEmployee('');
                          setDateFrom('');
                          setDateTo('');
                          setStatusFilter('');
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="p-4 flex items-center justify-between border-b">
                  <div className="font-semibold">Locator Transactions</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                                             <tr>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Locator No.</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Locator Date</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time Departure - Arrival</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                       </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                      {filteredTxRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                            {txRows.length === 0 ? 'No locator transactions found.' : 'No transactions match the filters.'}
                          </td>
                        </tr>
                      ) : (
                        filteredTxRows.map(r => (
                         <tr key={r.objid}>
                           <td className="px-4 py-2">
                             <div className="flex items-center gap-2">
                               <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200">
                                 {(r.employee?.photo_path || r.employee_photo_path) ? <img src={r.employee?.photo_path || r.employee_photo_path} alt="emp" className="w-full h-full object-cover" /> : null}
                               </div>
                               <div>{r.employee?.name || r.employee?.fullname || r.employee_name || '—'}</div>
                             </div>
                           </td>
                                                                                                                                                                                                                         <td className="px-4 py-2">{r.locatorno || '—'}</td>
                              <td className="px-4 py-2">{formatDateMMDDYYYY(r.locatordate) || '—'}</td>
                            <td className="px-4 py-2 max-w-xs whitespace-pre-wrap break-words" title={r.locdestination}>{r.locdestination || '—'}</td>
                            <td className="px-4 py-2 max-w-xs whitespace-pre-wrap break-words" title={r.locpurpose}>{r.locpurpose || '—'}</td>
                             <td className="px-4 py-2">
                               {(() => {
                                 const dep = formatTimeHHMM(r.loctimedeparture);
                                 const arr = formatTimeHHMM(r.loctimearrival);
                                 if (dep !== '—' && arr !== '—') {
                                   return `${dep}-${arr}`;
                                 } else if (dep !== '—') {
                                   return dep;
                                 } else if (arr !== '—') {
                                   return arr;
                                 }
                                                                 return '—';
                              })()}
                            </td>
                          <td className="px-4 py-2">
                            {r.isportal === 1 || r.isPortal === 1 ? (
                              <span className="text-sm text-blue-600 font-medium">Portal</span>
                            ) : r.createdby_photo_path ? (
                              <img src={r.createdby_photo_path} alt={r.createdby_name || 'Creator'} className="w-8 h-8 rounded-full object-cover" title={r.createdby_name || ''} />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200" title={r.createdby_name || ''} />
                            )}
                          </td>
                          <td className="px-4 py-2"><StatusPill status={r.locstatus || 'For Approval'} /></td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              {can('201-locator', 'update') && r.locstatus !== 'Approved' && (
                                <button 
                                  className="text-green-600 hover:text-green-800 transition-colors" 
                                  onClick={() => openApprove(r)}
                                  title="Approve Locator"
                                >
                                  👍
                                </button>
                              )}
                              {can('201-locator', 'update') && (
                                <button className="text-blue-600 hover:text-blue-800 transition-colors" onClick={() => {
                                  setActiveEmp({ 
                                    objid: r.emp_objid,
                                    name: r.employee?.name || r.employee?.fullname || r.employee_name,
                                    photo: r.employee?.photo_path || r.employee_photo_path
                                  });
                                  setEditRow(r);
                                  setModalOpen(true);
                                }} title="Edit Locator">
                                  ✏️
                                </button>
                              )}
                              {can('201-locator', 'delete') && (
                                <button
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  onClick={async () => {
                                    if (window.confirm('Delete this locator?')) {
                                      try {
                                        await api.delete(`/employee-locators/${r.objid}`);
                                        fetchTransactions();
                                      } catch (e) {
                                        console.error('Delete failed', e);
                                        alert('Delete failed');
                                      }
                                    }
                                  }}
                                  title="Delete Locator"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                         </div>
         </div>
       )}
        </div>
      )}

                                                       <LocatorModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={async () => { 
                 const empObjId = activeEmp?.objid || editRow?.emp_objid;
                 
                 // Always refresh the locator count for the employee
                 if (empObjId) {
                   await refreshLocatorCount(empObjId);
                 }
                 
                 if (activeTab === 'info') {
                   // Refresh the Employee Locator tab grid
                   if (empObjId) {
                     // Always refresh the employee's locators in the map (regardless of expanded state)
                     // This ensures the grid reflects changes even if not currently expanded
                     try {
                       const res = await api.get('/employee-locators', { params: { emp_objid: empObjId } });
                       const items = (res.data?.data || []).sort((a,b)=> new Date(b.locatordate) - new Date(a.locatordate));
                       setEmpLocMap(prev => new Map(prev).set(empObjId, items));
                       setEmpLocCounts(prev => new Map(prev).set(empObjId, items.length));
                     } catch (e) {
                       console.error('Failed to refresh employee locators', e);
                     }
                   }
                 } else {
                   // Refresh the Transactions tab grid
                   await fetchTransactions();
                 }
               }} initial={editRow} emp={activeEmp} />
       <ApproveModal 
         isOpen={approveModalOpen} 
         onClose={() => { setApproveModalOpen(false); setApproveRow(null); }} 
         onApprove={handleApprove}
         locatorNo={approveRow?.locatorno || ''}
       />
     </div>
   );
 };

export default EmployeeLocator;


