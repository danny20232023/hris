import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import DTRAssignShift from './DTRAssignShift';
import { usePermissions } from '../../hooks/usePermissions';

const DTRShifts = ({ canViewShifts: canViewShiftsProp, canAssignShift: canAssignShiftProp, initialTab = 'shifts' }) => {
  const { can, canAccessPage, loading: permissionsLoading } = usePermissions();
  const componentId = 'dtr-shifts';
  const assignComponentId = 'dtr-assign-shift';
  const canReadShifts = can(componentId, 'read');
  const canCreateShifts = can(componentId, 'create');
  const canUpdateShifts = can(componentId, 'update');
  const canDeleteShifts = can(componentId, 'delete');
  const canPrintShifts = can(componentId, 'print');
  const resolvedCanViewShifts =
    typeof canViewShiftsProp === 'boolean'
      ? canViewShiftsProp
      : canReadShifts;
  const resolvedCanAssignShift =
    typeof canAssignShiftProp === 'boolean'
      ? canAssignShiftProp
      : can(assignComponentId, 'read');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ shiftname: '', shifttimemode: 'AM' });

  const getDefaultTab = useCallback(() => {
    if (initialTab === 'assign' && resolvedCanAssignShift) return 'assign';
    if (initialTab === 'shifts' && resolvedCanViewShifts) return 'shifts';
    if (resolvedCanViewShifts) return 'shifts';
    if (resolvedCanAssignShift) return 'assign';
    return 'shifts';
  }, [initialTab, resolvedCanAssignShift, resolvedCanViewShifts]);

  const [activeTab, setActiveTab] = useState(() => getDefaultTab());

  useEffect(() => {
    const nextTab = getDefaultTab();
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [getDefaultTab]);

  const toHHMM = (v) => {
    if (!v) return '';
    const s = String(v);
    return s.length >= 5 ? s.slice(0,5) : s;
  };

  const TimeField = ({ name, value, onChange }) => {
    const hhmm = toHHMM(value);
    const [h, m] = hhmm ? hhmm.split(':') : ['', ''];
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    const handleH = (e) => onChange({ target: { name, value: `${e.target.value || '00'}:${m || '00'}` } });
    const handleM = (e) => onChange({ target: { name, value: `${h || '00'}:${e.target.value || '00'}` } });
    return (
      <div className="flex gap-2">
        <select className="mt-1 w-full border rounded px-3 py-2" value={h} onChange={handleH} aria-label={`${name}-hours`}>
          <option value="">HH</option>
          {hours.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="self-center text-gray-500">:</span>
        <select className="mt-1 w-full border rounded px-3 py-2" value={m} onChange={handleM} aria-label={`${name}-minutes`}>
          <option value="">MM</option>
          {minutes.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
    );
  };

  const fetchList = useCallback(async () => {
    if (!resolvedCanViewShifts) return;
    setLoading(true);
    try {
      const r = await api.get('/dtr-shifts');
      setRows(r.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [resolvedCanViewShifts]);

  useEffect(() => {
    if (resolvedCanViewShifts) {
      fetchList();
    } else {
      setRows([]);
      setLoading(false);
    }
  }, [resolvedCanViewShifts, fetchList]);

  const filtered = useMemo(()=> (rows||[]).filter(r => (r.shiftname||'').toLowerCase().includes((search||'').toLowerCase())), [rows, search]);

  const openAdd = () => {
    if (!canCreateShifts) {
      alert('You do not have permission to create shifts.');
      return;
    }
    setEditRow(null);
    setForm({ shiftname: '', shifttimemode: 'AM', shift_checkin: '08:00', shift_checkin_start: '', shift_checkin_end: '', shift_checkout: '', shift_checkout_start: '', shift_checkout_end: '', is_ot: false, credits: '' });
    setShowModal(true);
  };
  const openEdit = (r) => {
    if (!canUpdateShifts) {
      alert('You do not have permission to update shifts.');
      return;
    }
    setEditRow(r);
    setForm({
      ...r,
      shift_checkin: toHHMM(r.shift_checkin),
      shift_checkin_start: toHHMM(r.shift_checkin_start),
      shift_checkin_end: toHHMM(r.shift_checkin_end),
      shift_checkout: toHHMM(r.shift_checkout),
      shift_checkout_start: toHHMM(r.shift_checkout_start),
      shift_checkout_end: toHHMM(r.shift_checkout_end)
    });
    setShowModal(true);
  };

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const onTime = (e) => setForm(f => ({ ...f, [e.target.name]: toHHMM(e.target.value) })); // store HH:mm

  const handleSave = async () => {
    if (editRow && !canUpdateShifts) {
      alert('You do not have permission to update shifts.');
      return;
    }
    if (!editRow && !canCreateShifts) {
      alert('You do not have permission to create shifts.');
      return;
    }
    if (!form.shiftname?.trim()) { alert('Shift Name is required'); return; }
    setSaving(true);
    try {
      const mode = String(form.shifttimemode || 'AM').toUpperCase();
      const allowed = ['AM','PM','AMPM'];
      const payload = { ...form, shifttimemode: allowed.includes(mode) ? mode : 'AM' };
      if (editRow) {
        await api.put(`/dtr-shifts/${editRow.id}`, payload);
      } else {
        await api.post('/dtr-shifts', payload);
      }
      setShowModal(false); fetchList();
    } catch (e) { console.error('Save shift error', e); alert('Failed to save shift'); } finally { setSaving(false); }
  };

  const handleDelete = async (r) => {
    if (!canDeleteShifts) {
      alert('You do not have permission to delete shifts.');
      return;
    }
    if (!confirm('Delete this shift?')) return;
    try { await api.delete(`/dtr-shifts/${r.id}`); fetchList(); } catch (e) { console.error(e); alert('Delete failed'); }
  };

  const fmt = (t) => {
    if (!t) return '';
    const s = String(t);
    // Expect HH:MM or HH:MM:SS → display HH:MM only
    return s.length >= 5 ? s.slice(0,5) : s;
  };

  const tabClass = (tab) =>
    `px-4 py-2 text-sm font-semibold border-b-2 transition-colors duration-150 ${
      activeTab === tab
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  const renderShiftsTab = () => (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">DTR Shifts</h2>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shift name"
            className="px-3 py-2 border rounded text-sm"
            disabled={!resolvedCanViewShifts}
          />
          {canCreateShifts && (
            <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={openAdd}>
              + Add Shift
            </button>
          )}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Shift Name</th>
              <th className="px-4 py-2 text-left">Mode</th>
              <th className="px-4 py-2 text-left">Check-in</th>
              <th className="px-4 py-2 text-left">Check-in Start</th>
              <th className="px-4 py-2 text-left">Check-in End</th>
              <th className="px-4 py-2 text-left">Check-out</th>
              <th className="px-4 py-2 text-left">Check-out Start</th>
              <th className="px-4 py-2 text-left">Check-out End</th>
              <th className="px-4 py-2 text-left">OT</th>
              <th className="px-4 py-2 text-left">Credits</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                  No records
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.shiftname}</td>
                  <td className="px-4 py-2">{r.shifttimemode}</td>
                  <td className="px-4 py-2">{fmt(r.shift_checkin)}</td>
                  <td className="px-4 py-2">{fmt(r.shift_checkin_start)}</td>
                  <td className="px-4 py-2">{fmt(r.shift_checkin_end)}</td>
                  <td className="px-4 py-2">{fmt(r.shift_checkout)}</td>
                  <td className="px-4 py-2">{fmt(r.shift_checkout_start)}</td>
                  <td className="px-4 py-2">{fmt(r.shift_checkout_end)}</td>
                  <td className="px-4 py-2">{r.is_ot ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2">
                    {r.credits != null && r.credits !== ''
                      ? Number(r.credits).toFixed(1)
                      : ''}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {canUpdateShifts && (
                        <button
                          onClick={() => openEdit(r)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit Shift"
                        >
                          ✏️
                        </button>
                      )}
                      {canPrintShifts && (
                        <button
                          onClick={() => {
                            // Print functionality can be added here if needed
                            console.log('Print shift:', r);
                          }}
                          className="text-green-600 hover:text-green-800 transition-colors"
                          title="Print Shift"
                        >
                          🖨️
                        </button>
                      )}
                      {canDeleteShifts && (
                        <button
                          onClick={() => handleDelete(r)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Delete Shift"
                        >
                          🗑️
                        </button>
                      )}
                      {!canUpdateShifts && !canPrintShifts && !canDeleteShifts && (
                        <span className="text-xs text-gray-400">No actions available</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editRow ? 'Edit Shift' : 'Add Shift'}</h3>
              <button className="text-gray-500" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="text-sm text-gray-600">Shift Name</label>
                <input
                  name="shiftname"
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={form.shiftname || ''}
                  onChange={onChange}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Mode (AM/PM)</label>
                <select
                  name="shifttimemode"
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={form.shifttimemode || 'AM'}
                  onChange={onChange}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                  <option value="AMPM">AMPM</option>
                </select>
              </div>
              <div className="md:col-span-3 bg-gray-50 border rounded p-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Check-in Window</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-600">Check-in</label>
                    <TimeField name="shift_checkin" value={form.shift_checkin} onChange={onTime} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Check-in Start</label>
                    <TimeField
                      name="shift_checkin_start"
                      value={form.shift_checkin_start}
                      onChange={onTime}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Check-in End</label>
                    <TimeField name="shift_checkin_end" value={form.shift_checkin_end} onChange={onTime} />
                  </div>
                </div>
              </div>

              <div className="md:col-span-3 bg-gray-50 border rounded p-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Check-out Window</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-600">Check-out</label>
                    <TimeField name="shift_checkout" value={form.shift_checkout} onChange={onTime} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Check-out Start</label>
                    <TimeField
                      name="shift_checkout_start"
                      value={form.shift_checkout_start}
                      onChange={onTime}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Check-out End</label>
                    <TimeField
                      name="shift_checkout_end"
                      value={form.shift_checkout_end}
                      onChange={onTime}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Is OT</label>
                <input
                  type="checkbox"
                  name="is_ot"
                  className="mt-2"
                  checked={!!form.is_ot}
                  onChange={(e) => setForm((f) => ({ ...f, is_ot: e.target.checked }))}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Credits</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  name="credits"
                  className="mt-1 w-full border rounded px-3 py-2"
                  value={form.credits || ''}
                  onChange={onChange}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="px-4 py-2 rounded border" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const hasAnyAccess = resolvedCanViewShifts || resolvedCanAssignShift;

  return (
    <div className="p-6">
      {hasAnyAccess && (
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex flex-wrap gap-4">
            {resolvedCanViewShifts && (
              <button
                type="button"
                className={tabClass('shifts')}
                onClick={() => setActiveTab('shifts')}
              >
                Shifts
              </button>
            )}
            {resolvedCanAssignShift && (
              <button
                type="button"
                className={tabClass('assign')}
                onClick={() => setActiveTab('assign')}
              >
                Assign Shift
              </button>
            )}
          </nav>
        </div>
      )}

      {permissionsLoading && (
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          Loading permissions...
        </div>
      )}

      {!permissionsLoading && activeTab === 'shifts' && resolvedCanViewShifts && renderShiftsTab()}

      {!permissionsLoading && activeTab === 'assign' && resolvedCanAssignShift && (
        <div className="bg-white rounded-lg shadow">
          <DTRAssignShift />
        </div>
      )}

      {!permissionsLoading && !hasAnyAccess && (
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You do not have access to view or assign shifts.
        </div>
      )}
    </div>
  );
};

export default DTRShifts;


