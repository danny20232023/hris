import React, { useCallback, useEffect, useMemo, useState } from 'react';
// Calendar control for multi-date selection
// Make sure to install: npm i react-day-picker
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../utils/api';
import { openTravelPrintWindow } from './print_201EmployeeTravel';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const StatusPill = ({ status }) => {
  let color = 'bg-gray-100 text-gray-800';
  switch (status) {
    case 'For Approval': color = 'bg-yellow-100 text-yellow-800'; break;
    case 'Returned': color = 'bg-blue-100 text-blue-800'; break;
    case 'Approved': color = 'bg-green-100 text-green-800'; break;
    case 'Cancelled': color = 'bg-red-100 text-red-800'; break;
    default: color = 'bg-gray-100 text-gray-800';
  }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{status}</span>;
};

const TravelModal = ({ isOpen, onClose, onSaved, travel, defaultIsPortal = 0, portalCanCreateTravel = null }) => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = '201-travel';
  // For portal users, check the cancreatetravel flag; for admin users, check RBAC permissions
  const rbacCanCreateTravel = can(componentId, 'create');
  const rbacCanUpdateTravel = can(componentId, 'update');
  // If portalCanCreateTravel is provided (not null), use it for portal users; otherwise use RBAC
  const canCreateTravel = defaultIsPortal === 1 && portalCanCreateTravel !== null 
    ? portalCanCreateTravel 
    : rbacCanCreateTravel;
  const canUpdateTravel = defaultIsPortal === 1 && portalCanCreateTravel !== null 
    ? portalCanCreateTravel 
    : rbacCanUpdateTravel;
  const canEditCurrentRecord = travel ? canUpdateTravel : canCreateTravel;
  
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ purpose: '', traveldestination: '', dates: [], employees: [] });
  const [selectedDates, setSelectedDates] = useState([]);
  const [calendarDates, setCalendarDates] = useState([]); // normalized yyyy-mm-dd picked via calendar
  const [selectedDate, setSelectedDate] = useState('');
  const [bulkDatesText, setBulkDatesText] = useState('');
  const [allEmployees, setAllEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [disabledEmployees, setDisabledEmployees] = useState(new Set()); // Set of emp_objids that are disabled
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const isEditMode = !!travel;

  useEffect(() => {
    if (isOpen) {
      if (travel) {
        // Edit mode: populate form with travel data
        const dates = travel.travel_dates ? travel.travel_dates.split(', ').map(d => {
          // Convert mm/dd/yyyy to yyyy-mm-dd
          const [mm, dd, yy] = d.split('/');
          return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }) : [];
        const dateObjects = dates.map(d => {
          const [yy, mm, dd] = d.split('-');
          return new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
        });
        setForm({
          purpose: travel.purpose || '',
          traveldestination: travel.traveldestination || '',
          dates: dates,
          employees: travel.employees || []
        });
        setSelectedDates(dateObjects);
        setCalendarDates(dates);
      } else {
        // Add mode: reset form
        setForm({ purpose: '', traveldestination: '', dates: [], employees: [] });
        setSelectedDate('');
        setSelectedDates([]);
        setCalendarDates([]);
      }
      setBulkDatesText('');
      setEmployeeSearch('');
    }
    // Fetch employees when modal opens
    if (isOpen) {
      const loadEmployees = async () => {
        setLoadingEmployees(true);
        try {
          const response = await api.get('/201-employees');
          setAllEmployees(response.data?.data || []);
        } catch (e) {
          console.error('Failed to fetch employees', e);
        } finally {
          setLoadingEmployees(false);
        }
      };
      loadEmployees();
    }
  }, [isOpen, travel]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return allEmployees;
    const searchLower = employeeSearch.toLowerCase();
    return allEmployees.filter(emp => {
      const fullname = formatEmployeeName(emp.surname, emp.firstname, emp.middlename);
      return fullname.toLowerCase().includes(searchLower) || 
             (emp.employee_id || '').toLowerCase().includes(searchLower);
    });
  }, [allEmployees, employeeSearch]);

  const handleEmployeeToggle = (emp) => {
    // Prevent selection if employee is disabled
    if (disabledEmployees.has(emp.objid)) {
      return;
    }
    setForm(f => {
      const isSelected = f.employees.some(e => e.objid === emp.objid);
      if (isSelected) {
        return { ...f, employees: f.employees.filter(e => e.objid !== emp.objid) };
      } else {
        return { ...f, employees: [...f.employees, emp] };
      }
    });
  };

  const isEmployeeDisabled = (empObjid) => {
    return disabledEmployees.has(empObjid);
  };

  const isEmployeeSelected = (empObjid) => {
    return form.employees.some(e => e.objid === empObjid);
  };

  const addDate = (d) => {
    if (!d) return;
    const norm = normalizeToYmd(d);
    if (!norm) return;
    setForm(f => ({ ...f, dates: Array.from(new Set([...(f.dates||[]), norm])) }));
  };
  const removeDate = (d) => {
    setForm(f => ({ ...f, dates: (f.dates||[]).filter(x => x !== d) }));
    // If this date came from calendar selection, unselect it there too
    if (calendarDates.includes(d)) {
      setSelectedDates(prev => prev.filter(dt => {
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}` !== d;
      }));
      setCalendarDates(prev => prev.filter(x => x !== d));
    }
  };

  const normalizeToYmd = (val) => {
    if (!val) return '';
    // already yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // mm/dd/yyyy -> yyyy-mm-dd
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mm = m[1].padStart(2,'0');
      const dd = m[2].padStart(2,'0');
      const yy = m[3];
      return `${yy}-${mm}-${dd}`;
    }
    return '';
  };

  const addBulkDates = () => {
    if (!bulkDatesText.trim()) return;
    const parts = bulkDatesText.split(/[,\n\s]+/).map(s=>s.trim()).filter(Boolean);
    const normalized = parts.map(normalizeToYmd).filter(Boolean);
    if (!normalized.length) return;
    setForm(f => ({ ...f, dates: Array.from(new Set([...(f.dates||[]), ...normalized])) }));
    setBulkDatesText('');
  };

  // Sync selectedDates (Date[]) into form.dates (yyyy-mm-dd[]) when changed
  useEffect(() => {
    if (!selectedDates || !Array.isArray(selectedDates)) return;
    const ymd = selectedDates
      .filter(Boolean)
      .map(d => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      });
    const prevCalendar = calendarDates;
    setCalendarDates(ymd);
    setForm(f => {
      const others = (f.dates || []).filter(x => !prevCalendar.includes(x));
      return { ...f, dates: Array.from(new Set([...others, ...ymd])) };
    });
  }, [selectedDates]);

  // Check for conflicts when dates change
  useEffect(() => {
    const checkConflicts = async () => {
      if (!form.dates || form.dates.length === 0) {
        setDisabledEmployees(new Set());
        return;
      }

      setLoadingConflicts(true);
      try {
        const dateFrom = form.dates.sort()[0];
        const dateTo = form.dates.sort()[form.dates.length - 1];

        // Fetch approved leave transactions
        const leaveParams = new URLSearchParams();
        leaveParams.append('dateFrom', dateFrom);
        leaveParams.append('dateTo', dateTo);
        leaveParams.append('status', 'Approved');
        
        const leaveResponse = await api.get(`/employee-leave-transactions/all?${leaveParams.toString()}`);
        const approvedLeaves = leaveResponse.data?.data || leaveResponse.data || [];

        // Fetch approved travel transactions
        const travelParams = new URLSearchParams();
        travelParams.append('dateFrom', dateFrom);
        travelParams.append('dateTo', dateTo);
        travelParams.append('status', 'Approved');
        
        const travelResponse = await api.get(`/employee-travels/transactions?${travelParams.toString()}`);
        const approvedTravels = travelResponse.data?.data || [];

        // Build set of disabled employee objids
        const disabled = new Set();

        // Check leave conflicts
        approvedLeaves.forEach(leave => {
          // Skip current leave transaction in edit mode (if editing a leave, not applicable here but kept for consistency)
          // Note: This is for travel modal, so we don't have a current leave to skip
          
          if (leave.details && Array.isArray(leave.details)) {
            leave.details.forEach(detail => {
              const leaveDate = detail.leavedate || detail.deducteddate;
              if (leaveDate) {
                const leaveDateStr = leaveDate.slice(0, 10); // yyyy-mm-dd
                if (form.dates.includes(leaveDateStr)) {
                  if (leave.emp_objid) {
                    disabled.add(leave.emp_objid);
                  }
                }
              }
            });
          }
        });

        // Check travel conflicts
        approvedTravels.forEach(travelRecord => {
          // Skip current travel record in edit mode
          if (isEditMode && travel && travelRecord.objid === travel.objid) {
            return;
          }
          
          if (travelRecord.travel_dates && travelRecord.employees) {
            const travelDates = travelRecord.travel_dates.split(', ').map(d => {
              const [mm, dd, yy] = d.split('/');
              return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            });
            
            // Check if any selected date matches travel dates
            const hasDateConflict = form.dates.some(date => travelDates.includes(date));
            
            if (hasDateConflict && travelRecord.employees) {
              travelRecord.employees.forEach(emp => {
                if (emp.objid) {
                  disabled.add(emp.objid);
                }
              });
            }
          }
        });

        setDisabledEmployees(disabled);
        
        // Remove any already-selected employees that are now disabled
        setForm(f => ({
          ...f,
          employees: f.employees.filter(emp => {
            const empObjid = typeof emp === 'object' ? emp.objid : emp;
            return !disabled.has(empObjid);
          })
        }));
      } catch (e) {
        console.error('Failed to check conflicts', e);
        setDisabledEmployees(new Set());
      } finally {
        setLoadingConflicts(false);
      }
    };

    checkConflicts();
  }, [form.dates, isEditMode, travel]);

  const handleSave = async () => {
    if (!canEditCurrentRecord) {
      alert('You do not have permission to save travel records.');
      return;
    }
    if (!(form.dates||[]).length) { alert('Please select at least one date'); return; }
    if (!form.purpose || !form.purpose.trim()) { alert('Please enter purpose'); return; }
    if (!form.traveldestination || !form.traveldestination.trim()) { alert('Please enter destination'); return; }
    if (!(form.employees||[]).length) { alert('Please select at least one employee'); return; }
    setSaving(true);
    try {
      const payload = {
        employees: form.employees.map(e => e.objid || e),
        purpose: form.purpose,
        traveldestination: form.traveldestination,
        dates: form.dates,
        isportal: isEditMode ? (travel?.isportal || 0) : defaultIsPortal,
      };
      if (isEditMode) {
        await api.put(`/employee-travels/${travel.objid}`, payload);
      } else {
        await api.post('/employee-travels', payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error(`Failed to ${isEditMode ? 'update' : 'create'} travel`, e);
      alert(`Failed to ${isEditMode ? 'update' : 'create'} travel`);
    } finally { setSaving(false); }
  };

  if (!isOpen) return null;

  // For portal users, don't wait for RBAC permissions loading if portalCanCreateTravel is provided
  if (permissionsLoading && (defaultIsPortal !== 1 || portalCanCreateTravel === null)) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 text-center text-gray-500">
          Loading permissions...
        </div>
      </div>
    );
  }

  if (!canEditCurrentRecord) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 text-center text-gray-500">
          You do not have permission to {isEditMode ? 'edit' : 'create'} travel records.
          <div className="mt-4">
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl my-8">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="font-semibold text-lg">{isEditMode ? 'Edit Travel' : 'Add Travel'}</div>
          <button className="text-gray-600 hover:text-gray-800" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* 1. Date(s) - First field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date(s) *</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <DayPicker
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={setSelectedDates}
                  weekStartsOn={1}
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear() - 1}
                  toYear={new Date().getFullYear() + 1}
                />
              </div>
              <div className="border rounded p-3 bg-gray-50 max-h-64 overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Selected Dates</span>
                  <span className="text-xs text-gray-600">Total: {(form.dates||[]).length}</span>
                </div>
                <ul className="space-y-1 text-sm">
                  {(form.dates||[]).sort().map(d => {
                    const mm = d.slice(5,7); const dd = d.slice(8,10); const yy = d.slice(0,4);
                    const label = `${mm}/${dd}/${yy}`;
                    return (
                      <li key={d} className="flex items-center justify-between bg-white rounded border px-2 py-1">
                        <span>{label}</span>
                        <button onClick={()=>removeDate(d)} className="text-red-600 text-xs hover:text-red-800">Remove</button>
                      </li>
                    );
                  })}
                  {(!(form.dates||[]).length) && (
                    <li className="text-xs text-gray-500">No dates selected</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* 2. Purpose - Second field (Rich Text) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Purpose *</label>
            <ReactQuill
              theme="snow"
              value={form.purpose}
              onChange={(value) => {
                if (canEditCurrentRecord) {
                  setForm(f => ({ ...f, purpose: value }));
                }
              }}
              placeholder="Enter travel purpose..."
              className="bg-white"
              readOnly={!canEditCurrentRecord}
            />
          </div>

          {/* 3. Destination - Third field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Destination *</label>
            <input 
              className="w-full border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed" 
              value={form.traveldestination} 
              onChange={(e)=>{
                if (canEditCurrentRecord) {
                  setForm(f=>({...f, traveldestination:e.target.value}));
                }
              }}
              placeholder="Enter travel destination"
              disabled={!canEditCurrentRecord}
            />
          </div>

          {/* 4. Employee(s) - Fourth field (Checkbox with search) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Employee(s) *
              {loadingConflicts && form.dates.length > 0 && (
                <span className="ml-2 text-xs text-gray-500">(Checking availability...)</span>
              )}
            </label>
            <div className="border rounded-lg overflow-hidden">
              {/* Search bar */}
              <div className="p-3 border-b bg-gray-50">
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search employees by name..."
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              
              {/* Employee list with checkboxes */}
              <div className="max-h-64 overflow-y-auto">
                {loadingEmployees ? (
                  <div className="p-4 text-center text-gray-500">Loading employees...</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">No employees found</div>
                ) : (
                  filteredEmployees.map(emp => {
                    const fullname = formatEmployeeName(emp.surname, emp.firstname, emp.middlename);
                    const isDisabled = isEmployeeDisabled(emp.objid);
                    return (
                      <div
                        key={emp.objid}
                        className={`px-4 py-2 flex items-center space-x-3 border-b last:border-b-0 ${
                          isDisabled 
                            ? 'bg-gray-100 cursor-not-allowed opacity-60' 
                            : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                        onClick={() => !isDisabled && handleEmployeeToggle(emp)}
                      >
                        <input
                          type="checkbox"
                          checked={isEmployeeSelected(emp.objid)}
                          onChange={() => handleEmployeeToggle(emp)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isDisabled}
                          className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${
                            isDisabled ? 'cursor-not-allowed' : ''
                          }`}
                        />
                        <div className="flex-1 flex items-center space-x-3">
                          {emp.photo_path ? (
                            <img src={emp.photo_path} alt={fullname} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                              {fullname.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className={`font-medium text-sm ${isDisabled ? 'text-gray-400' : ''}`}>
                              {fullname}
                              {isDisabled && (
                                <span className="ml-2 text-xs text-red-600" title="Has approved leave or travel on selected dates">
                                  (Unavailable)
                                </span>
                              )}
                            </div>
                            {emp.employee_id && (
                              <div className={`text-xs ${isDisabled ? 'text-gray-400' : 'text-gray-500'}`}>ID: {emp.employee_id}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* Selected count footer */}
              {form.employees.length > 0 && (
                <div className="p-2 border-t bg-blue-50">
                  <div className="text-xs text-blue-700 text-center">
                    {form.employees.length} employee(s) selected
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button className="px-4 py-2 border rounded hover:bg-gray-50" onClick={onClose}>Cancel</button>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60 hover:bg-blue-700" 
            disabled={saving || !canEditCurrentRecord} 
            onClick={handleSave}
          >
            {saving ? (isEditMode ? 'Updating…' : 'Saving…') : (isEditMode ? 'Update' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
};

const EmployeeTravel = () => {
  const { can, canAccessPage, loading: permissionsLoading } = usePermissions();
  const componentId = '201-travel';
  const canReadTravel = can(componentId, 'read') || canAccessPage(componentId);
  const canCreateTravel = can(componentId, 'create');
  const canUpdateTravel = can(componentId, 'update');
  const canDeleteTravel = can(componentId, 'delete');
  const canPrintTravel = can(componentId, 'print');
  const canApproveTravel = can(componentId, 'approve') || canUpdateTravel; // Approve is typically an update action
  
  const [activeTab, setActiveTab] = useState('tx');
  const [loading, setLoading] = useState(true);
  const [txRows, setTxRows] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTravel, setEditingTravel] = useState(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '', searchEmployee: '' });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [liaisonRows, setLiaisonRows] = useState([]);
  const [liaisonOriginalMap, setLiaisonOriginalMap] = useState(() => new Map());
  const [liaisonLoading, setLiaisonLoading] = useState(false);
  const [liaisonSaving, setLiaisonSaving] = useState(false);
  const [liaisonSearch, setLiaisonSearch] = useState('');

  const fetchTx = useCallback(async () => {
    if (!canReadTravel) {
      setTxRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.status && filters.status !== 'All' && filters.status !== '') params.append('status', filters.status);
      const url = `/employee-travels/transactions${params.toString() ? '?' + params.toString() : ''}`;
      const r = await api.get(url);
      setTxRows(r.data?.data||[]);
    } catch(e){ console.error(e);} finally{ setLoading(false);}
  }, [canReadTravel, filters.dateFrom, filters.dateTo, filters.status]);

  const fetchTravelLiaisons = useCallback(async () => {
    if (!canReadTravel) {
      setLiaisonRows([]);
      setLiaisonLoading(false);
      return;
    }
    setLiaisonLoading(true);
    try {
      const response = await api.get('/employee-travels/liaisons');
      const list = (response.data?.data || []).map((emp) => ({
        ...emp,
        cancreatetravel: !!emp.cancreatetravel,
      }));
      setLiaisonRows(list);
      const original = new Map();
      list.forEach((emp) => {
        original.set(emp.objid, emp.cancreatetravel ? 1 : 0);
      });
      setLiaisonOriginalMap(original);
    } catch (error) {
      console.error('Failed to load travel liaisons', error);
      alert('Failed to load travel liaisons.');
    } finally {
      setLiaisonLoading(false);
    }
  }, [canReadTravel]);

  const handleDelete = async (travelId) => {
    if (!canDeleteTravel) {
      alert('You do not have permission to delete travel records.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this travel record?')) {
      try {
        await api.delete(`/employee-travels/${travelId}`);
        fetchTx(); // Refresh the list
      } catch (e) {
        console.error('Failed to delete travel', e);
        alert('Failed to delete travel record');
      }
    }
  };

  const [actionModal, setActionModal] = useState({ open: false, action: null, travel: null });
  const [actionRemarks, setActionRemarks] = useState('');
  const [updatingAction, setUpdatingAction] = useState(false);

  const openActionModal = (action, travel) => {
    setActionRemarks('');
    setActionModal({ open: true, action, travel });
  };

  const closeActionModal = () => {
    setActionModal({ open: false, action: null, travel: null });
    setActionRemarks('');
  };

  const submitAction = async () => {
    if (!actionModal.open || !actionModal.action || !actionModal.travel) return;
    if (!canApproveTravel) {
      alert('You do not have permission to approve, return, or cancel travel records.');
      return;
    }
    const travel = actionModal.travel;
    const action = actionModal.action; // 'approve' | 'return' | 'cancel'
    const statusMap = { approve: 'Approved', return: 'Returned', cancel: 'Cancelled' };
    const newStatus = statusMap[action];
    if (!newStatus) return;

    // Require remarks for return and cancel (match leave audit UX); optional for approve
    if ((action === 'return' || action === 'cancel') && !actionRemarks.trim()) {
      alert('Please enter remarks.');
      return;
    }

    setUpdatingAction(true);
    try {
      await api.put(`/employee-travels/${travel.objid}`, {
        travelstatus: newStatus,
        remarks: actionRemarks || null
      });
      closeActionModal();
      fetchTx();
    } catch (e) {
      console.error(`Failed to ${action} travel`, e);
      alert(`Failed to ${action} travel record`);
    } finally {
      setUpdatingAction(false);
    }
  };

  const handleEdit = (travel) => {
    if (!canUpdateTravel) {
      alert('You do not have permission to edit travel records.');
      return;
    }
    setEditingTravel(travel);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingTravel(null);
  };

  // Client-side filtering for employee search
  const filteredTxRows = useMemo(() => {
    if (!filters.searchEmployee || !filters.searchEmployee.trim()) {
      return txRows;
    }
    const searchLower = filters.searchEmployee.toLowerCase().trim();
    return txRows.filter(travel => {
      if (!travel.employees || !Array.isArray(travel.employees)) return false;
      return travel.employees.some(emp => {
        const empName = (emp.name || '').toLowerCase();
        const empId = (emp.employee_id || emp.idno || '').toLowerCase();
        return empName.includes(searchLower) || empId.includes(searchLower);
      });
    });
  }, [txRows, filters.searchEmployee]);

  // Auto-fetch when filters change (only for Transactions and Calendar tabs)
  useEffect(() => {
    if (activeTab === 'tx' || activeTab === 'calendar') {
      fetchTx();
    }
  }, [activeTab, fetchTx]);
  useEffect(() => {
    if (activeTab === 'liaisons' && !liaisonLoading && liaisonRows.length === 0) {
      fetchTravelLiaisons();
    }
  }, [activeTab, liaisonLoading, liaisonRows.length, fetchTravelLiaisons]);

  const liaisonFilteredRows = useMemo(() => {
    if (!liaisonSearch.trim()) return liaisonRows;
    const query = liaisonSearch.toLowerCase();
    return liaisonRows.filter((emp) => {
      const fullname = (emp.fullname || '').toLowerCase();
      const idno = String(emp.idno || '').toLowerCase();
      const dtruserid = String(emp.dtruserid || '').toLowerCase();
      return fullname.includes(query) || idno.includes(query) || dtruserid.includes(query);
    });
  }, [liaisonRows, liaisonSearch]);

  const liaisonGrantedCount = useMemo(() => liaisonRows.filter((emp) => emp.cancreatetravel).length, [liaisonRows]);

  const liaisonHasChanges = useMemo(() => {
    return liaisonRows.some((emp) => {
      const original = liaisonOriginalMap.get(emp.objid) ?? 0;
      return original !== (emp.cancreatetravel ? 1 : 0);
    });
  }, [liaisonRows, liaisonOriginalMap]);

  const toggleLiaisonEmployee = (objid) => {
    setLiaisonRows((prev) => prev.map((emp) => (
      emp.objid === objid ? { ...emp, cancreatetravel: !emp.cancreatetravel } : emp
    )));
  };

  const handleLiaisonReset = () => {
    setLiaisonRows((prev) => prev.map((emp) => {
      const original = liaisonOriginalMap.get(emp.objid) ?? 0;
      return { ...emp, cancreatetravel: original === 1 };
    }));
  };

  const handleLiaisonSave = async () => {
    if (!canUpdateTravel) {
      alert('You do not have permission to update travel liaison settings.');
      return;
    }
    const updates = liaisonRows.reduce((acc, emp) => {
      const original = liaisonOriginalMap.get(emp.objid) ?? 0;
      const current = emp.cancreatetravel ? 1 : 0;
      if (original !== current) {
        acc.push({ objid: emp.objid, cancreatetravel: emp.cancreatetravel });
      }
      return acc;
    }, []);

    if (updates.length === 0) {
      alert('No changes to save.');
      return;
    }

    setLiaisonSaving(true);
    try {
      await api.put('/employee-travels/liaisons', { updates });
      await fetchTravelLiaisons();
      alert('Travel liaison access updated.');
    } catch (error) {
      console.error('Failed to save travel liaisons', error);
      alert('Failed to save travel liaison changes.');
    } finally {
      setLiaisonSaving(false);
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

  if (!canReadTravel) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You do not have permission to view travel records.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6">
          <div className="flex space-x-8">
            <button onClick={()=>{setActiveTab('tx');}} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab==='tx'?'border-green-600 text-green-700':'border-transparent text-gray-500'}`}>Transactions</button>
            <button onClick={()=>{setActiveTab('calendar');}} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab==='calendar'?'border-green-600 text-green-700':'border-transparent text-gray-500'}`}>Calendar</button>
            {canUpdateTravel && (
              <button onClick={()=>{setActiveTab('liaisons');}} className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab==='liaisons'?'border-green-600 text-green-700':'border-transparent text-gray-500'}`}>Travel Liaisons</button>
            )}
          </div>
        </div>
      </div>

      {activeTab==='tx' && (
        <div className="mt-4">
          {loading ? (<div className="text-center py-10">Loading…</div>) : (
            <div className="space-y-4">
              {/* Filters Section */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2.5">Search Employee</label>
                    <input
                      type="text"
                      value={filters.searchEmployee}
                      onChange={(e) => setFilters(f => ({ ...f, searchEmployee: e.target.value }))}
                      placeholder="Search by name or ID..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2.5">Date From</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2.5">Date To</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                      min={filters.dateFrom}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2.5">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="">All Statuses</option>
                      <option value="For Approval">For Approval</option>
                      <option value="Approved">Approved</option>
                      <option value="Returned">Returned</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
                {(filters.searchEmployee || filters.dateFrom || filters.dateTo || filters.status) && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setFilters({ dateFrom: '', dateTo: '', status: '', searchEmployee: '' });
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow">
                <div className="p-4 flex items-center justify-between border-b">
                  <div className="font-semibold">Travel Transactions</div>
                  {canCreateTravel && (
                    <button
                      onClick={() => setModalOpen(true)}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                    >
                      ＋ Create Travel
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Travel No</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee(s)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Travel Date(s)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                      {filteredTxRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                            {txRows.length === 0 ? 'No travel transactions found.' : 'No transactions match the filters.'}
                          </td>
                        </tr>
                      ) : (
                        filteredTxRows.map(r => (
                        <tr key={r.objid}>
                          <td className="px-4 py-2">{r.travelno}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {(r.employees || []).map((emp, idx) => {
                                const hasPhoto = emp.photo_path && (emp.photo_path.startsWith('data:') || emp.photo_path.startsWith('http'));
                                return (
                                  <div
                                    key={emp.objid || idx}
                                    className="relative group"
                                    title={emp.name}
                                  >
                                    {hasPhoto ? (
                                      <img
                                        src={emp.photo_path}
                                        alt={emp.name || 'Employee'}
                                        className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 hover:border-blue-400"
                                        onError={(e) => {
                                          // Hide broken image and show fallback
                                          e.target.style.display = 'none';
                                          const fallback = e.target.nextElementSibling;
                                          if (fallback) fallback.style.display = 'flex';
                                        }}
                                      />
                                    ) : null}
                                    <div 
                                      className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-gray-200 hover:border-blue-400 ${hasPhoto ? 'hidden' : ''}`}
                                    >
                                      {(emp.name || 'NA').split(' ').map(n => n[0]).join('').substring(0, 2)}
                                    </div>
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                      {emp.name}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-2">{r.travel_dates}</td>
                          <td className="px-4 py-2">
                            <div
                              dangerouslySetInnerHTML={{ __html: r.purpose }}
                              className="max-w-sm whitespace-pre-wrap break-words"
                            />
                          </td>
                          <td className="px-4 py-2">{r.traveldestination}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              {r.created_by_photo_path ? (
                                <img
                                  src={r.created_by_photo_path}
                                  alt={r.created_by_employee_name || r.created_by_username || 'Creator'}
                                  className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                                  title={r.created_by_employee_name || r.created_by_username || 'Creator'}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const fallback = e.target.nextElementSibling;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-gray-200 ${r.created_by_photo_path ? 'hidden' : ''}`}
                                title={r.created_by_employee_name || r.created_by_username || 'Creator'}
                              >
                                {(r.created_by_employee_name || r.created_by_username || 'NA').split(' ').map(n => n[0]).join('').substring(0, 2)}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2"><StatusPill status={r.travelstatus} /></td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              {r.travelstatus === 'For Approval' && canApproveTravel && (
                                <>
                                  <button
                                    onClick={() => openActionModal('approve', r)}
                                    className="text-green-600 hover:text-green-800 transition-colors"
                                    title="Approve Travel"
                                  >
                                    👍
                                  </button>
                                  {r.isportal === 1 && (
                                    <button
                                      onClick={() => openActionModal('return', r)}
                                      className="text-orange-600 hover:text-orange-800 transition-colors"
                                      title="Return Travel"
                                    >
                                      ↩
                                    </button>
                                  )}
                                  <button
                                    onClick={() => openActionModal('cancel', r)}
                                    className="text-red-600 hover:text-red-800 transition-colors"
                                    title="Cancel Travel"
                                  >
                                    ✖
                                  </button>
                                </>
                              )}
                              {canUpdateTravel && (
                                <button
                                  onClick={() => handleEdit(r)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                  title="Edit Travel"
                                >
                                  ✏️
                                </button>
                              )}
                              {canPrintTravel && (
                                <button
                                  onClick={() => {
                                    openTravelPrintWindow(r);
                                  }}
                                  className="text-green-600 hover:text-green-800 transition-colors"
                                  title="Print Travel"
                                >
                                  🖨️
                                </button>
                              )}
                              {canDeleteTravel && (
                                <button
                                  onClick={() => handleDelete(r.objid)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Delete Travel"
                                >
                                  🗑️
                                </button>
                              )}
                              {!canUpdateTravel && !canPrintTravel && !canDeleteTravel && !canApproveTravel && (
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
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab==='calendar' && (
        <div className="mt-4">
          {loading ? (<div className="text-center py-10">Loading…</div>) : (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Travel Calendar View</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const prev = new Date(currentMonth);
                      prev.setMonth(prev.getMonth() - 1);
                      setCurrentMonth(prev);
                    }}
                    className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setCurrentMonth(new Date())}
                    className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      const next = new Date(currentMonth);
                      next.setMonth(next.getMonth() + 1);
                      setCurrentMonth(next);
                    }}
                    className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                  >
                    Next →
                  </button>
                </div>
              </div>
              <div className="text-center mb-4 text-lg font-medium">
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <CalendarGrid
                month={currentMonth}
                travels={txRows}
              />
            </div>
          )}
        </div>
      )}

      {activeTab==='liaisons' && (
        <div className="mt-4">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-gray-900">Travel Liaisons</div>
                <div className="text-sm text-gray-500">Grant or revoke employee access to create travel records via the employee portal.</div>
                <div className="text-xs text-gray-400 mt-1">{liaisonGrantedCount} employee(s) enabled</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleLiaisonReset}
                  disabled={!liaisonHasChanges || liaisonSaving}
                >
                  Reset
                </button>
                <button
                  className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={handleLiaisonSave}
                  disabled={!liaisonHasChanges || liaisonSaving}
                >
                  {liaisonSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
            <div className="p-4 border-b">
              <input
                type="text"
                value={liaisonSearch}
                onChange={(e) => setLiaisonSearch(e.target.value)}
                placeholder="Search employees by name, ID, or DTR ID"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {liaisonLoading ? (
                <div className="p-6 text-center text-gray-500">Loading employees…</div>
              ) : liaisonFilteredRows.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No employees found.</div>
              ) : (
                liaisonFilteredRows.map((emp) => {
                  const initials = (emp.fullname || 'NA').split(' ').map(part => part[0]).join('').slice(0, 2);
                  return (
                    <div
                      key={emp.objid}
                      className="px-4 py-3 flex items-center space-x-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleLiaisonEmployee(emp.objid)}
                    >
                      <input
                        type="checkbox"
                        checked={!!emp.cancreatetravel}
                        onChange={() => toggleLiaisonEmployee(emp.objid)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 text-green-600 border-gray-300 rounded"
                      />
                      <div className="flex items-center gap-3 flex-1">
                        {emp.photo_path ? (
                          <img src={emp.photo_path} alt={emp.fullname || 'Employee'} className="w-9 h-9 rounded-full object-cover border" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gray-200 border flex items-center justify-center text-xs text-gray-600">
                            {initials}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900">{emp.fullname || 'Unnamed Employee'}</div>
                          <div className="text-xs text-gray-500 space-x-2">
                            {emp.idno ? <span>ID: {emp.idno}</span> : null}
                            {emp.dtruserid ? <span>DTR ID: {emp.dtruserid}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Modal: Approve / Return / Cancel */}
      {actionModal.open && actionModal.travel && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {actionModal.action === 'approve' && 'Approve Travel Record'}
                    {actionModal.action === 'return' && 'Return Travel Record'}
                    {actionModal.action === 'cancel' && 'Cancel Travel Record'}
                  </h3>
                  <div className="text-sm text-gray-600">{actionModal.travel.travelno}</div>
                </div>
                <button onClick={closeActionModal} className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100">✕</button>
              </div>

              {/* Travel Information */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-gray-800 mb-4">Travel Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Travel No.</label>
                    <div className="text-sm text-gray-900">{actionModal.travel.travelno || '—'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <div className="text-sm text-gray-900"><StatusPill status={actionModal.travel.travelstatus} /></div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Travel Dates</label>
                    <div className="text-sm text-gray-900">{actionModal.travel.travel_dates || '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                    <div className="text-sm text-gray-900">{actionModal.travel.traveldestination || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Remarks Section */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-gray-800 mb-4">
                  {actionModal.action === 'approve' ? 'Approval Information' : actionModal.action === 'return' ? 'Return Information' : 'Cancellation Information'}
                </h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks {actionModal.action !== 'approve' && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    value={actionRemarks}
                    onChange={(e) => setActionRemarks(e.target.value)}
                    rows={4}
                    placeholder={actionModal.action === 'approve' ? 'Optional remarks...' : 'Enter the reason...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeActionModal}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                {actionModal.action === 'approve' && (
                  <button
                    type="button"
                    onClick={submitAction}
                    disabled={updatingAction}
                    className="px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updatingAction ? 'Approving…' : 'Approve'}
                  </button>
                )}
                {actionModal.action === 'return' && (
                  <button
                    type="button"
                    onClick={submitAction}
                    disabled={updatingAction}
                    className="px-6 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updatingAction ? 'Returning…' : 'Return'}
                  </button>
                )}
                {actionModal.action === 'cancel' && (
                  <button
                    type="button"
                    onClick={submitAction}
                    disabled={updatingAction}
                    className="px-6 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updatingAction ? 'Cancelling…' : 'Cancel Travel'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <TravelModal 
        isOpen={modalOpen} 
        onClose={handleCloseModal} 
        onSaved={()=>{fetchTx(); handleCloseModal();}}
        travel={editingTravel}
      />
    </div>
  );
};

const CalendarGrid = ({ month, travels }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'For Approval': return 'bg-yellow-100 text-yellow-800';
      case 'Returned': return 'bg-blue-100 text-blue-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Monday
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (7 - endDate.getDay())); // Sunday

  const days = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const getTravelsForDate = (date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return travels.filter(t => {
      if (!t.travel_dates) return false;
      const dates = t.travel_dates.split(', ').map(d => {
        const [mm, dd, yy] = d.split('/');
        return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      });
      return dates.includes(dateStr);
    });
  };

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="grid grid-cols-7 gap-1">
      {weekDays.map(day => (
        <div key={day} className="p-2 text-center text-xs font-semibold text-gray-600 bg-gray-50">
          {day}
        </div>
      ))}
      {days.map((day, idx) => {
        const isCurrentMonth = day.getMonth() === month.getMonth();
        const dayTravels = getTravelsForDate(day);
        return (
          <div
            key={idx}
            className={`min-h-24 p-1 border border-gray-200 ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}`}
          >
            <div className={`text-xs mb-1 ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
              {day.getDate()}
            </div>
            <div className="space-y-1">
              {dayTravels.slice(0, 3).map((travel, tIdx) => (
                <div
                  key={travel.objid || tIdx}
                  className={`text-xs px-1 py-0.5 rounded truncate ${getStatusColor(travel.travelstatus)}`}
                  title={`${travel.travelno}: ${travel.traveldestination}`}
                >
                  {travel.travelno}
                </div>
              ))}
              {dayTravels.length > 3 && (
                <div className="text-xs text-gray-500">+{dayTravels.length - 3} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EmployeeTravel;
export { TravelModal };


