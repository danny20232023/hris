import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

const StatusBadge = ({ status }) => {
  const color = status === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  const text = status === 1 ? 'Active' : 'Inactive';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{text}</span>;
};

const RecurringBadge = ({ isRecurring }) => {
  const color = isRecurring ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800';
  const text = isRecurring ? 'Yes' : 'No';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{text}</span>;
};

const HolidayModal = ({ isOpen, onClose, onSaved, initial, canCreate, canUpdate }) => {
  const [saving, setSaving] = useState(false);
  const [holidayTypes, setHolidayTypes] = useState([]);
  const [form, setForm] = useState({
    holidayname: '',
    holidaycategory: 'Local',
    holidaytype: '',
    holidaydesc: '',
    holidaydate: '',
    isrecurring: false,
    status: 1
  });

  useEffect(() => {
    if (isOpen) {
      const fetchTypes = async () => {
        try {
          const res = await api.get('/dtr-holidays/types');
          setHolidayTypes(res.data?.data || []);
        } catch (e) {
          console.error('Failed to load holiday types', e);
        }
      };
      fetchTypes();
      
      if (initial) {
        setForm({
          holidayname: initial.holidayname || '',
          holidaycategory: initial.holidaycategory || 'Local',
          holidaytype: initial.holidaytype || '',
          holidaydesc: initial.holidaydesc || '',
          holidaydate: initial.holidaydate ? String(initial.holidaydate).slice(0,10) : '',
          isrecurring: initial.isrecurring === 1,
          status: initial.status !== undefined ? initial.status : 1
        });
      } else {
        setForm({
          holidayname: '',
          holidaycategory: 'Local',
          holidaytype: '',
          holidaydesc: '',
          holidaydate: '',
          isrecurring: false,
          status: 1
        });
      }
    }
  }, [isOpen, initial]);

  const onChange = (e) => {
    if (e.target.type === 'checkbox') {
      setForm(f => ({ ...f, [e.target.name]: e.target.checked }));
    } else {
      setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    }
  };

  const handleSave = async () => {
    if (initial?.id && !canUpdate) {
      alert('You do not have permission to update holidays.');
      return;
    }
    if (!initial?.id && !canCreate) {
      alert('You do not have permission to create holidays.');
      return;
    }
    if (!form.holidayname?.trim()) { alert('Holiday name is required'); return; }
    if (!form.holidaycategory) { alert('Category is required'); return; }
    if (!form.holidaytype) { alert('Holiday type is required'); return; }
    if (!form.holidaydate) { alert('Holiday date is required'); return; }
    
    setSaving(true);
    try {
      const payload = {
        ...form,
        isrecurring: form.isrecurring ? 1 : 0,
        status: form.status ? 1 : 0
      };
      
      if (initial?.id) {
        await api.put(`/dtr-holidays/${initial.id}`, payload);
      } else {
        await api.post('/dtr-holidays', payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Failed to save holiday', e);
      alert('Failed to save holiday');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{initial?.id ? 'Edit Holiday' : 'Add Holiday'}</h3>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Holiday Name</label>
            <input name="holidayname" className="mt-1 w-full border rounded px-3 py-2" value={form.holidayname} onChange={onChange} />
          </div>
          <div>
            <label className="text-sm text-gray-600">Category</label>
            <select name="holidaycategory" className="mt-1 w-full border rounded px-3 py-2" value={form.holidaycategory} onChange={onChange}>
              <option value="Local">Local</option>
              <option value="National">National</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Holiday Type</label>
            <select name="holidaytype" className="mt-1 w-full border rounded px-3 py-2" value={form.holidaytype} onChange={onChange}>
              <option value="">Select type...</option>
              {holidayTypes.map(t => <option key={t.id} value={t.id}>{t.typesname}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Holiday Date</label>
            <input name="holidaydate" type="date" className="mt-1 w-full border rounded px-3 py-2" value={form.holidaydate} onChange={onChange} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-gray-600">Description</label>
            <textarea name="holidaydesc" className="mt-1 w-full border rounded px-3 py-2" rows={3} value={form.holidaydesc} onChange={onChange} />
          </div>
          <div>
            <label className="text-sm text-gray-600">Is Recurring</label>
            <input type="checkbox" name="isrecurring" className="mt-2" checked={form.isrecurring} onChange={onChange} />
          </div>
          <div>
            <label className="text-sm text-gray-600">Status</label>
            <select name="status" className="mt-1 w-full border rounded px-3 py-2" value={form.status} onChange={onChange}>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
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

const HolidayTypeModal = ({ isOpen, onClose, onSaved, initial, canCreate, canUpdate }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ typesname: '' });

  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setForm({ typesname: initial.typesname || '' });
      } else {
        setForm({ typesname: '' });
      }
    }
  }, [isOpen, initial]);

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    if (initial?.id && !canUpdate) {
      alert('You do not have permission to update holiday types.');
      return;
    }
    if (!initial?.id && !canCreate) {
      alert('You do not have permission to create holiday types.');
      return;
    }
    if (!form.typesname?.trim()) { alert('Type name is required'); return; }
    setSaving(true);
    try {
      if (initial?.id) {
        await api.put(`/dtr-holidays/types/${initial.id}`, form);
      } else {
        await api.post('/dtr-holidays/types', form);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Failed to save holiday type', e);
      alert('Failed to save holiday type');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{initial?.id ? 'Edit Holiday Type' : 'Add Holiday Type'}</h3>
          <button className="text-gray-500" onClick={onClose}>✕</button>
        </div>
        <div>
          <label className="text-sm text-gray-600">Type Name</label>
          <input name="typesname" className="mt-1 w-full border rounded px-3 py-2" value={form.typesname} onChange={onChange} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="px-4 py-2 rounded border" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const DTRHolidays = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = 'dtr-holidays';
  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  const [activeTab, setActiveTab] = useState('holidays'); // holidays or types
  const [holidays, setHolidays] = useState([]);
  const [holidayTypes, setHolidayTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editHoliday, setEditHoliday] = useState(null);
  const [editType, setEditType] = useState(null);

  const fetchHolidays = async () => {
    if (!canRead) return;
    try {
      const res = await api.get('/dtr-holidays');
      setHolidays(res.data?.data || []);
    } catch (e) {
      console.error('Failed to load holidays', e);
    }
  };

  const fetchTypes = async () => {
    if (!canRead) return;
    try {
      const res = await api.get('/dtr-holidays/types');
      setHolidayTypes(res.data?.data || []);
    } catch (e) {
      console.error('Failed to load holiday types', e);
    }
  };

  useEffect(() => {
    if (!canRead || permissionsLoading) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchHolidays(), fetchTypes()]);
      setLoading(false);
    };
    init();
  }, [canRead, permissionsLoading]);

  const filteredHolidays = useMemo(() => {
    const q = (search || '').toLowerCase();
    return (holidays || []).filter(h => {
      const name = (h.holidayname || '').toLowerCase();
      const cat = (h.holidaycategory || '').toLowerCase();
      const typeName = (h.holiday_type_name || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || typeName.includes(q);
    });
  }, [holidays, search]);

  const filteredTypes = useMemo(() => {
    const q = (search || '').toLowerCase();
    return (holidayTypes || []).filter(t => (t.typesname || '').toLowerCase().includes(q));
  }, [holidayTypes, search]);

  const openAddHoliday = () => {
    if (!canCreate) {
      alert('You do not have permission to create holidays.');
      return;
    }
    setEditHoliday(null);
    setShowHolidayModal(true);
  };

  const openEditHoliday = (h) => {
    if (!canUpdate) {
      alert('You do not have permission to update holidays.');
      return;
    }
    setEditHoliday(h);
    setShowHolidayModal(true);
  };

  const openAddType = () => {
    if (!canCreate) {
      alert('You do not have permission to create holiday types.');
      return;
    }
    setEditType(null);
    setShowTypeModal(true);
  };

  const openEditType = (t) => {
    if (!canUpdate) {
      alert('You do not have permission to update holiday types.');
      return;
    }
    setEditType(t);
    setShowTypeModal(true);
  };

  const handleDeleteHoliday = async (h) => {
    if (!canDelete) {
      alert('You do not have permission to delete holidays.');
      return;
    }
    if (!confirm('Delete this holiday?')) return;
    try {
      await api.delete(`/dtr-holidays/${h.id}`);
      fetchHolidays();
    } catch (e) {
      console.error('Failed to delete holiday', e);
      alert('Failed to delete holiday');
    }
  };

  const handleDeleteType = async (t) => {
    if (!canDelete) {
      alert('You do not have permission to delete holiday types.');
      return;
    }
    if (!confirm('Delete this holiday type?')) return;
    try {
      await api.delete(`/dtr-holidays/types/${t.id}`);
      fetchTypes();
    } catch (e) {
      console.error('Failed to delete holiday type', e);
      alert(e?.response?.data?.message || 'Failed to delete holiday type');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    } catch {
      return dateStr;
    }
  };

  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 text-gray-600">Loading permissions…</div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 text-gray-600">
          You do not have permission to view holidays.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('holidays')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'holidays' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'
              }`}
            >
              Holidays
            </button>
            <button
              onClick={() => setActiveTab('types')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'types' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'
              }`}
            >
              Holiday Types
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'holidays' && (
        <div className="mt-4">
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Search holiday</label>
              <input
                className="w-full px-3 py-2 border rounded text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, or type..."
              />
            </div>
            {canCreate ? (
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={openAddHoliday}>
                + Add Holiday
              </button>
            ) : (
              <span className="text-xs text-gray-400 italic pb-2">No create permission</span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-10">Loading…</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Holiday Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Recurring</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredHolidays.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No holidays found
                      </td>
                    </tr>
                  ) : (
                    filteredHolidays.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2">{h.holidayname}</td>
                        <td className="px-4 py-2">{h.holidaycategory}</td>
                        <td className="px-4 py-2">{h.holiday_type_name || '—'}</td>
                        <td className="px-4 py-2">{h.holidaydate ? formatDate(h.holidaydate) : '—'}</td>
                        <td className="px-4 py-2">{h.holidaydesc || '—'}</td>
                        <td className="px-4 py-2"><RecurringBadge isRecurring={h.isrecurring === 1} /></td>
                        <td className="px-4 py-2"><StatusBadge status={h.status} /></td>
                        <td className="px-4 py-2">
                          {h.createdby_photo ? (
                            <img 
                              src={h.createdby_photo} 
                              alt="creator" 
                              className="w-8 h-8 rounded-full object-cover mx-auto cursor-pointer" 
                              title={h.createdby_employee_name || h.createdby_username || 'Unknown user'}
                            />
                          ) : (
                            <div 
                              className="w-8 h-8 rounded-full bg-gray-200 mx-auto cursor-pointer" 
                              title={h.createdby_employee_name || h.createdby_username || 'Unknown user'}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {canUpdate && (
                              <button className="text-blue-600 hover:text-blue-800 transition-colors" onClick={() => openEditHoliday(h)} title="Edit Holiday">
                                ✏️
                              </button>
                            )}
                            {canDelete && (
                              <button className="text-red-600 hover:text-red-800 transition-colors" onClick={() => handleDeleteHoliday(h)} title="Delete Holiday">
                                🗑️
                              </button>
                            )}
                            {!canUpdate && !canDelete && (
                              <span className="text-xs text-gray-400 italic">No actions</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'types' && (
        <div className="mt-4">
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Search type</label>
              <input
                className="w-full px-3 py-2 border rounded text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by type name..."
              />
            </div>
            {canCreate ? (
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={openAddType}>
                + Add Holiday Type
              </button>
            ) : (
              <span className="text-xs text-gray-400 italic pb-2">No create permission</span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-10">Loading…</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTypes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No holiday types found
                      </td>
                    </tr>
                  ) : (
                    filteredTypes.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-2">{t.id}</td>
                        <td className="px-4 py-2">{t.typesname}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {canUpdate && (
                              <button className="text-blue-600 hover:text-blue-800 transition-colors" onClick={() => openEditType(t)} title="Edit Holiday Type">
                                ✏️
                              </button>
                            )}
                            {canDelete && (
                              <button className="text-red-600 hover:text-red-800 transition-colors" onClick={() => handleDeleteType(t)} title="Delete Holiday Type">
                                🗑️
                              </button>
                            )}
                            {!canUpdate && !canDelete && (
                              <span className="text-xs text-gray-400 italic">No actions</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <HolidayModal
        isOpen={showHolidayModal}
        onClose={() => setShowHolidayModal(false)}
        onSaved={fetchHolidays}
        initial={editHoliday}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />
      <HolidayTypeModal
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onSaved={fetchTypes}
        initial={editType}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />
    </div>
  );
};

export default DTRHolidays;
