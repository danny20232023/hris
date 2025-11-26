import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const fmtTime = (t) => {
  if (!t) return '';
  const s = String(t);
  return s.length >= 5 ? s.slice(0,5) : s;
};

const toImageSrc = (photoPath) => {
  if (!photoPath) return undefined;
  const s = String(photoPath).trim();
  return s.startsWith('data:') ? s : `data:image/jpeg;base64,${s}`;
};

const initials = (surname, firstname) => {
  const a = (surname||'').trim();
  const b = (firstname||'').trim();
  const i1 = a ? a.charAt(0).toUpperCase() : '';
  const i2 = b ? b.charAt(0).toUpperCase() : '';
  return (i1 + i2) || '👤';
};

const DTRAssignShift = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = 'dtr-assign-shift';
  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  const [employees, setEmployees] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [assignmentsByEmp, setAssignmentsByEmp] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState({});
  const [bulkShiftId, setBulkShiftId] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [form, setForm] = useState({ shiftid: '', shiftids: [] });

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canRead) {
      setEmployees([]);
      setAssignmentsByEmp({});
      setShifts([]);
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        const [empRes, shiftsRes, assignsRes] = await Promise.all([
          api.get('/201-employees'),
          api.get('/dtr-shifts'),
          api.get('/dtr-assigned-shifts')
        ]);
        const emps = (empRes.data?.data || []).map(e => ({
          objid: e.objid,
          surname: e.surname || '',
          firstname: e.firstname || '',
          middlename: e.middlename || '',
          extension: e.extension || '',
          fullname: e.fullname || '',
          photo_path: e.photo_path || null
        }));
        setEmployees(emps);
        setShifts(shiftsRes.data?.data || []);
        const allAssigns = assignsRes.data?.data || [];
        const grouped = allAssigns.reduce((acc, r) => {
          const key = r.emp_objid;
          if (!acc[key]) acc[key] = [];
          acc[key].push(r);
          return acc;
        }, {});
        setAssignmentsByEmp(grouped);
      } catch (e) {
        console.error('Init failed', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [permissionsLoading, canRead]);

  const filteredEmployees = useMemo(() => {
    const q = (search || '').toLowerCase();
    return (employees || []).filter(e => {
      const formal = formatEmployeeName(e.surname, e.firstname, e.middlename, e.extension).toLowerCase();
      const full = (e.fullname || '').toLowerCase();
      return formal.includes(q) || full.includes(q);
    });
  }, [employees, search]);

  const toggleExpand = async (emp) => {
    if (!canRead) return;
    const key = emp.objid;
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    if (!assignmentsByEmp[key]) {
      try {
        const res = await api.get(`/dtr-assigned-shifts?emp_objid=${encodeURIComponent(key)}`);
        setAssignmentsByEmp(prev => ({ ...prev, [key]: res.data?.data || [] }));
      } catch (e) {
        console.error('Load assignments failed', e);
      }
    }
  };

  const refreshAllAssignments = async () => {
    if (!canRead) return;
    try {
      const assignsRes = await api.get('/dtr-assigned-shifts');
      const allAssigns = assignsRes.data?.data || [];
      const grouped = allAssigns.reduce((acc, r) => {
        const key = r.emp_objid;
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {});
      setAssignmentsByEmp(grouped);
    } catch (e) {
      console.error('Refresh all assignments failed', e);
    }
  };

  const bulkAssign = async () => {
    if (!canCreate) {
      alert('You do not have permission to assign shifts.');
      return;
    }
    if (!bulkShiftId) { alert('Please select a shift to assign'); return; }
    if (!confirm('Assign this shift to all employees without this shift?')) return;
    setBulkLoading(true);
    try {
      await api.post('/dtr-assigned-shifts/bulk-assign', { shiftid: Number(bulkShiftId) });
      await refreshAllAssignments();
      alert('Bulk assign completed');
    } catch (e) {
      console.error('Bulk assign failed', e);
      alert(e?.response?.data?.message || 'Bulk assign failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const openAdd = (emp) => {
    if (!canCreate) {
      alert('You do not have permission to assign shifts.');
      return;
    }
    setSelectedEmp(emp);
    setEditRow(null);
    setForm({ shiftid: '', shiftids: [] });
    setShowModal(true);
  };

  const openEdit = (emp, row) => {
    if (!canUpdate) {
      alert('You do not have permission to update shift assignments.');
      return;
    }
    setSelectedEmp(emp);
    setEditRow(row);
    setForm({ shiftid: row.shiftid || '', shiftids: [] });
    setShowModal(true);
  };

  const save = async () => {
    if (!selectedEmp) return;
    if (editRow && !canUpdate) {
      alert('You do not have permission to update shift assignments.');
      return;
    }
    if (!editRow && !canCreate) {
      alert('You do not have permission to assign shifts.');
      return;
    }
    if (editRow) {
      if (!form.shiftid) { alert('Please select a shift'); return; }
    } else {
      const ids = Array.isArray(form.shiftids) ? form.shiftids : [];
      if (ids.length === 0) { alert('Please select at least one shift'); return; }
    }
    setSaving(true);
    try {
      if (editRow) {
        await api.put(`/dtr-assigned-shifts/${editRow.objid}`, { shiftid: Number(form.shiftid), emp_objid: selectedEmp.objid });
      } else {
        const ids = Array.isArray(form.shiftids) ? form.shiftids : [];
        for (const id of ids) {
          await api.post('/dtr-assigned-shifts', { emp_objid: selectedEmp.objid, shiftid: Number(id) });
        }
      }
      const res = await api.get(`/dtr-assigned-shifts?emp_objid=${encodeURIComponent(selectedEmp.objid)}`);
      setAssignmentsByEmp(prev => ({ ...prev, [selectedEmp.objid]: res.data?.data || [] }));
      setShowModal(false);
    } catch (e) {
      console.error('Save failed', e);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (emp, row) => {
    if (!canDelete) {
      alert('You do not have permission to delete shift assignments.');
      return;
    }
    if (!confirm('Delete this assignment?')) return;
    try {
      await api.delete(`/dtr-assigned-shifts/${row.objid}`);
      const res = await api.get(`/dtr-assigned-shifts?emp_objid=${encodeURIComponent(emp.objid)}`);
      setAssignmentsByEmp(prev => ({ ...prev, [emp.objid]: res.data?.data || [] }));
    } catch (e) {
      console.error('Delete failed', e);
      alert('Failed to delete');
    }
  };

  const toggleUsed = async (emp, row) => {
    if (!canUpdate) {
      alert('You do not have permission to update shift assignments.');
      return;
    }
    const id = row.objid;
    setToggling(prev => ({ ...prev, [id]: true }));
    try {
      const next = Number(row.is_used) === 1 ? 0 : 1;
      await api.put(`/dtr-assigned-shifts/${id}`, { is_used: next, emp_objid: emp.objid, shiftid: row.shiftid });
      const res = await api.get(`/dtr-assigned-shifts?emp_objid=${encodeURIComponent(emp.objid)}`);
      setAssignmentsByEmp(prev => ({ ...prev, [emp.objid]: res.data?.data || [] }));
    } catch (e) {
      console.error('Toggle is_used failed', e);
      alert('Failed to update In-Used');
    } finally {
      setToggling(prev => ({ ...prev, [id]: false }));
    }
  };

  if (permissionsLoading) {
    return (
      <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
        Loading permissions...
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
        You do not have permission to view or assign shifts.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold">Assign Shift</h2>
      </div>
      <div className="bg-white p-3 rounded-md shadow mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="text-sm text-gray-600">Employee Search</label>
            <input className="mt-1 w-full border rounded px-3 py-2" placeholder="Type name…" value={search} onChange={(e)=>setSearch(e.target.value)} disabled={!canRead} />
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-sm text-gray-600">Assign To All</label>
              <select className="mt-1 w-full border rounded px-3 py-2" value={bulkShiftId} onChange={(e)=>setBulkShiftId(e.target.value)} disabled={!canCreate}>
                <option value="">Select shift…</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>{s.shiftname} ({s.shifttimemode}) {fmtTime(s.shift_checkin)} - {fmtTime(s.shift_checkout)}</option>
                ))}
              </select>
            </div>
            {canCreate && (
              <button className="h-10 px-4 rounded bg-blue-600 text-white disabled:opacity-60" disabled={bulkLoading || !bulkShiftId} onClick={bulkAssign}>
              {bulkLoading ? 'Assigning…' : 'Assign To All'}
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          {(filteredEmployees || []).map(emp => {
            const name = formatEmployeeName(emp.surname, emp.firstname, emp.middlename, emp.extension);
            const isOpen = !!expanded[emp.objid];
            const rows = assignmentsByEmp[emp.objid] || [];
            const actives = rows.filter(r => Number(r.is_used) === 1);
            const toShow = actives.length > 0 ? actives : rows;
            return (
              <div key={emp.objid} className="border-b">
                <div className="sticky top-0 bg-gray-50 px-4 py-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(emp)}
                    className="inline-flex items-center justify-center w-6 h-6 border rounded-full text-sm text-gray-600 hover:bg-gray-100"
                    aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                  >
                    {isOpen ? '-' : '+'}
                  </button>
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                    {toImageSrc(emp.photo_path) ? (
                      <img src={toImageSrc(emp.photo_path)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{initials(emp.surname, emp.firstname)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{name}</div>
                    {toShow.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-green-700 font-semibold">Active:</span>
                        {toShow.map(a => (
                          <span
                            key={a.objid}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border ${Number(a.is_used)===1 ? 'border-green-300 text-green-800 bg-green-50' : 'border-red-300 text-red-600 bg-red-50'}`}
                          >
                            {a.shiftname} ({a.shifttimemode}) {fmtTime(a.shift_checkin)} - {fmtTime(a.shift_checkout)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canCreate && (
                    <button
                      className="ml-2 inline-flex items-center px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                      title="Assign Shift"
                      onClick={()=>openAdd(emp)}
                    >
                      Assign Shift
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="px-4 py-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Shift Name</th>
                          <th className="px-3 py-2 text-left">Period</th>
                          <th className="px-3 py-2 text-left">Check-in</th>
                          <th className="px-3 py-2 text-left">Check-out</th>
                          <th className="px-3 py-2 text-left">In-Used</th>
                          <th className="px-3 py-2 text-left">Assigned By</th>
                          <th className="px-3 py-2 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {rows.length === 0 ? (
                          <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-500">No assignments</td></tr>
                        ) : rows.map(r => (
                          <tr key={r.objid}>
                            <td className="px-3 py-2">{r.shiftname}</td>
                            <td className="px-3 py-2">{r.shifttimemode}</td>
                            <td className="px-3 py-2">{fmtTime(r.shift_checkin)}</td>
                            <td className="px-3 py-2">{fmtTime(r.shift_checkout)}</td>
                            <td className="px-3 py-2">
                              <div className="inline-flex rounded-full border overflow-hidden text-xs">
                                <button
                                  className={`px-3 py-1 ${Number(r.is_used)===1 ? 'bg-green-600 text-white' : 'bg-white text-gray-700'} disabled:opacity-60`}
                                  onClick={() => { if (Number(r.is_used)!==1 && canUpdate) toggleUsed(emp, r); }}
                                  disabled={!!toggling[r.objid] || !canUpdate}
                                >
                                  Yes
                                </button>
                                <button
                                  className={`px-3 py-1 border-l ${Number(r.is_used)===0 ? 'bg-gray-600 text-white' : 'bg-white text-gray-700'} disabled:opacity-60`}
                                  onClick={() => { if (Number(r.is_used)!==0 && canUpdate) toggleUsed(emp, r); }}
                                  disabled={!!toggling[r.objid] || !canUpdate}
                                >
                                  No
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div 
                                className="w-7 h-7 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 cursor-pointer"
                                title={r.createdby_employee_name || r.createdby_username || 'Unknown user'}
                              >
                                {toImageSrc(r.createdby_photo_path) ? (
                                  <img src={toImageSrc(r.createdby_photo_path)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span>{initials(r.createdby_employee_name?.split(',')?.[0] || '', r.createdby_employee_name?.split(',')?.[1] || '')}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                            {canUpdate && (
                              <button
                                className="inline-flex items-center justify-center rounded-full text-blue-600 hover:text-blue-800 transition-colors"
                                  onClick={()=>openEdit(emp, r)}
                                  title="Edit"
                              >
                                ✏️
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="ml-1 inline-flex items-center justify-center rounded-full text-red-600 hover:text-red-800 transition-colors"
                                  onClick={()=>remove(emp, r)}
                                  title="Delete"
                              >
                                🗑️
                              </button>
                            )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && selectedEmp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{editRow ? 'Edit Assignment' : 'Assign Shift'}</h3>
              <button className="text-gray-500" onClick={()=>setShowModal(false)}>✕</button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                {toImageSrc(selectedEmp.photo_path) ? (
                  <img src={toImageSrc(selectedEmp.photo_path)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials(selectedEmp.surname, selectedEmp.firstname)}</span>
                )}
              </div>
              <div className="font-medium">{formatEmployeeName(selectedEmp.surname, selectedEmp.firstname, selectedEmp.middlename, selectedEmp.extension)}</div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {editRow ? (
                <div>
                  <label className="text-sm text-gray-600">Shift</label>
                  <select className="mt-1 w-full border rounded px-3 py-2" value={form.shiftid} onChange={(e)=>setForm(f=>({...f, shiftid: e.target.value}))}>
                    <option value="">Select a shift…</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.shiftname} ({s.shifttimemode}) {fmtTime(s.shift_checkin)} - {fmtTime(s.shift_checkout)}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-600">Select Shifts</label>
                  <div className="mt-2 max-h-64 overflow-auto border rounded p-2">
                    {shifts.map(s => {
                      const alreadyAssignedIds = new Set((assignmentsByEmp[selectedEmp?.objid] || []).map(r => String(r.shiftid)));
                      const isAssigned = alreadyAssignedIds.has(String(s.id));
                      const checked = (form.shiftids || []).includes(String(s.id));
                      return (
                        <label key={s.id} className={`flex items-center gap-2 py-1 ${isAssigned ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isAssigned}
                            onChange={(e)=>{
                              setForm(f=>{
                                const cur = new Set(f.shiftids || []);
                                if (e.target.checked) cur.add(String(s.id)); else cur.delete(String(s.id));
                                return { ...f, shiftids: Array.from(cur) };
                              });
                            }}
                          />
                          <span className="text-sm">
                            {s.shiftname} ({s.shifttimemode}) {fmtTime(s.shift_checkin)} - {fmtTime(s.shift_checkout)}
                            {isAssigned ? ' (Already assigned)' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Active assignment flag removed per request */}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="px-4 py-2 rounded border" onClick={()=>setShowModal(false)}>Cancel</button>
              <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DTRAssignShift;


