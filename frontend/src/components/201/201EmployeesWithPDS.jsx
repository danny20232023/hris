import React, { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeNameFromObject, formatEmployeeNameFromString } from '../../utils/employeenameFormatter';

const isPresent = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'number') return value === 1;
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return false;
  return ['1', 'true', 'yes', 'y', 'present', 'current', 'active'].includes(s);
};

const ensureArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const arrProps = ['data', 'items', 'rows', 'list', 'results'];
    for (const prop of arrProps) {
      if (Array.isArray(value[prop])) return value[prop];
    }
    return Object.values(value);
  }
  return [];
};

const pickFirstTruth = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const value = Array.isArray(candidate) ? candidate.find(Boolean) : candidate;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const splitFullName = (fullName) => {
  if (!fullName) return { lastName: '', firstName: '', middleName: '' };
  const parts = String(fullName).split(',').map((part) => part.trim());
  const lastName = parts[0] || '';
  const remaining = parts[1] || '';
  const nameParts = remaining.split(' ').filter(Boolean);
  const firstName = nameParts[0] || '';
  const middleName = nameParts.slice(1).join(' ') || '';
  return { lastName, firstName, middleName };
};

const formatDateForInput = (value) => {
  if (!value) return '';
  const str = typeof value === 'string' ? value.trim() : value;
  if (typeof str === 'string') {
    const isoMatch = str.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const slashMatch = str.match(/\d{2}\/\d{2}\/\d{4}/);
    if (slashMatch) {
      return `${slashMatch[0].slice(6,10)}-${slashMatch[0].slice(0,2)}-${slashMatch[0].slice(3,5)}`;
    }
  }
  try {
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
};

const COMPONENT_ID = '201-employees-with-pds';
const FALLBACK_COMPONENT_ID = '201-employees';

const EmployeesWithPDS = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadEmployeesWithPds =
    can(COMPONENT_ID, 'read') || can(FALLBACK_COMPONENT_ID, 'read');
  const canCreateEmployeesWithPds =
    can(COMPONENT_ID, 'create') || can(FALLBACK_COMPONENT_ID, 'create');
  const canUpdateEmployeesWithPds =
    can(COMPONENT_ID, 'update') || can(FALLBACK_COMPONENT_ID, 'update');
  const canDeleteEmployeesWithPds =
    can(COMPONENT_ID, 'delete') || can(FALLBACK_COMPONENT_ID, 'delete');
  const canPrintEmployeesWithPds =
    can(COMPONENT_ID, 'print') || can(FALLBACK_COMPONENT_ID, 'print');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTitle, setFilterTitle] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterAppointment, setFilterAppointment] = useState('');
  const [filterLockStatus, setFilterLockStatus] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [civilStatusOptions, setCivilStatusOptions] = useState([]);
  const [togglingLockId, setTogglingLockId] = useState(null);

  const fetchList = useCallback(async () => {
    if (!canReadEmployeesWithPds) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get('/201-employees-with-pds');
      const payload = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      setRows(payload);
    } catch (e) {
      console.error('Failed to load employees with PDS', e);
    } finally { setLoading(false); }
  }, [canReadEmployeesWithPds]);

  useEffect(() => {
    if (permissionsLoading) return;
    fetchList();
  }, [fetchList, permissionsLoading]);

  useEffect(() => {
    if (permissionsLoading || !canReadEmployeesWithPds) return;
    const loadCivilStatuses = async () => {
      try {
        const resp = await api.get('/201-employees/lookup/civil-statuses');
        const data = Array.isArray(resp.data?.data)
          ? resp.data.data
          : Array.isArray(resp.data)
          ? resp.data
          : [];
        const options = data
          .map((item) => ({
            id: item?.id ?? item?.ID ?? item?.value ?? item?.civil_status,
            label: item?.civil_status || item?.label || item?.value || ''
          }))
          .filter((item) => item.label);
        setCivilStatusOptions(options);
      } catch (error) {
        console.error('Failed to load civil status options', error);
        setCivilStatusOptions([]);
      }
    };
    loadCivilStatuses();
  }, [permissionsLoading, canReadEmployeesWithPds]);

  const normalizedRows = useMemo(() => {
    return (rows || []).map((row, idx) => {
      const designations = [
        row.designations,
        row.employeeDesignations,
        row.employee_designations,
        row.Designations,
        row.empdesignations
      ].map(ensureArray).flat();
      const appointments = [
        row.appointments,
        row.employeeAppointments,
        row.employee_appointments,
        row.Appointments
      ].map(ensureArray).flat();
      const assignedShifts = [
        row.assignedShifts,
        row.employeeAssignedShifts,
        row.employee_assignedshifts,
        row.AssignedShifts,
        row.assigned_shift,
        row.shifts
      ].map(ensureArray).flat();

      const presentDesignation = designations.find((item) => isPresent(item?.ispresent));
      const presentAppointment = appointments.find((item) => isPresent(item?.ispresent));
      const activeShift = assignedShifts.find((item) => isPresent(item?.is_used));

      const designationFallback = designations.length > 0 ? designations[0] : null;
      const appointmentFallback = appointments.length > 0 ? appointments[0] : null;
      const shiftFallback = assignedShifts.length > 0 ? assignedShifts[0] : null;

      const presentDesignationName = pickFirstTruth(
        presentDesignation?.rankname,
        presentDesignation?.designationname,
        presentDesignation?.rank_name,
        presentDesignation?.designation,
        presentDesignation?.position,
        designationFallback?.rankname,
        designationFallback?.designationname,
        designationFallback?.rank_name,
        designationFallback?.designation,
        designationFallback?.position,
        row.presentDesignation,
        row.presentdesignation,
        row.designation,
        row.rankname,
        row.rank_name,
        row.position
      );

      const positionName = pickFirstTruth(
        presentDesignation?.position,
        designationFallback?.position,
        row.position,
        row.presentPosition
      );

      const departmentName = pickFirstTruth(
        presentDesignation?.departmentname,
        presentDesignation?.department,
        presentDesignation?.department_name,
        presentDesignation?.deptname,
        designationFallback?.departmentname,
        designationFallback?.department,
        designationFallback?.department_name,
        designationFallback?.deptname,
        row.department,
        row.departmentname,
        row.deptname,
        row.department_name
      );

      const appointmentName = pickFirstTruth(
        presentAppointment?.appointmentstatus,
        presentAppointment?.appointmentname,
        presentAppointment?.appointment_status,
        presentAppointment?.appointment,
        presentAppointment?.name,
        appointmentFallback?.appointmentstatus,
        appointmentFallback?.appointmentname,
        appointmentFallback?.appointment_status,
        appointmentFallback?.appointment,
        appointmentFallback?.name,
        row.appointment,
        row.appointmentstatus,
        row.appointmentname,
        row.appointment_status,
        row.appointmenttype
      );

      const shiftDisplay = pickFirstTruth(
        activeShift?.shiftname,
        activeShift?.shift_name,
        activeShift?.shiftSchedule,
        activeShift?.shift_schedule,
        activeShift?.shiftdescription,
        activeShift?.shift_description,
        activeShift?.shift,
        shiftFallback?.shiftname,
        shiftFallback?.shift_name,
        shiftFallback?.shiftSchedule,
        shiftFallback?.shift_schedule,
        shiftFallback?.shiftdescription,
        shiftFallback?.shift_description,
        shiftFallback?.shift,
        row.shiftSchedule,
        row.shiftname,
        row.shift,
        row.shift_schedule,
        row.shift_sched,
        row.shift_description
      );

      return {
        ...row,
        presentDesignationName,
        positionName,
        departmentName,
        appointmentName,
        shiftDisplay
      };
    });
  }, [rows]);

  // Extract unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const titles = new Set();
    const departments = new Set();
    const appointments = new Set();

    normalizedRows.forEach((row) => {
      if (row.positionName && row.positionName.trim()) {
        titles.add(row.positionName.trim());
      }
      if (row.departmentName && row.departmentName.trim()) {
        departments.add(row.departmentName.trim());
      }
      if (row.appointmentName && row.appointmentName.trim()) {
        appointments.add(row.appointmentName.trim());
      }
    });

    return {
      titles: Array.from(titles).sort(),
      departments: Array.from(departments).sort(),
      appointments: Array.from(appointments).sort()
    };
  }, [normalizedRows]);

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase();
    return normalizedRows.filter((row) => {
      // Search Employee filter - format the name for consistent searching
      const formattedName = formatEmployeeNameFromString(row.fullname || '');
      const matchesSearch = !q || formattedName.toLowerCase().includes(q);
      
      // Title filter
      const matchesTitle = !filterTitle || (row.positionName || '').trim() === filterTitle;
      
      // Department filter
      const matchesDepartment = !filterDepartment || (row.departmentName || '').trim() === filterDepartment;
      
      // Appointment filter
      const matchesAppointment = !filterAppointment || (row.appointmentName || '').trim() === filterAppointment;
      
      // Lock Status filter
      const matchesLockStatus = !filterLockStatus || 
        (filterLockStatus === 'locked' && row.ispdsentrylock === 1) ||
        (filterLockStatus === 'unlocked' && (row.ispdsentrylock === 0 || !row.ispdsentrylock));

      return matchesSearch && matchesTitle && matchesDepartment && matchesAppointment && matchesLockStatus;
    });
  }, [normalizedRows, search, filterTitle, filterDepartment, filterAppointment, filterLockStatus]);

  const initialFormState = {
    surname: '',
    firstname: '',
    middlename: '',
    extension: '',
    birthdate: '',
    birth_place: '',
    gender: '',
    civilstatus: '',
    height: '',
    weight: '',
    bloodtype: '',
    gsis: '',
    pagibig: '',
    philhealth: '',
    sss: '',
    tin: '',
    telephone: '',
    mobileno: '',
    email: '',
    agency_no: ''
  };

  const [form, setForm] = useState(initialFormState);
  const openEdit = (row) => {
    if (!canUpdateEmployeesWithPds) {
      alert('You do not have permission to update employee records.');
      return;
    }
    setEditRow(row);
    setForm({
      surname: row.surname || '',
      firstname: row.firstname || '',
      middlename: row.middlename || '',
      extension: row.extension || '',
      birthdate: formatDateForInput(row.birthdate_iso || row.birthdate || row.birthdate_raw || row.birthdateOriginal || ''),
      birth_place: row.birth_place || row.birthplace || '',
      gender: row.gender || '',
      civilstatus: row.civilstatus || row.civil_status || '',
      height: row.height || '',
      weight: row.weight || '',
      bloodtype: row.bloodtype || row.blood_type || '',
      gsis: row.gsis || '',
      pagibig: row.pagibig || '',
      philhealth: row.philhealth || '',
      sss: row.sss || '',
      tin: row.tin || '',
      telephone: row.telephone || row.telno || '',
      mobileno: row.mobileno || row.mobilenumber || '',
      email: row.email || row.emailaddress || '',
      agency_no: row.agency_no || row.agencyno || ''
    });
    setShowModal(true);
  };

  const handleToggleLockPDS = async (employeeObjId, isLocked) => {
    if (!canUpdateEmployeesWithPds) {
      alert('You do not have permission to update employee records.');
      return;
    }

    setTogglingLockId(employeeObjId);
    
    // Optimistic update
    setRows(prevRows => 
      prevRows.map(row => 
        row.objid === employeeObjId 
          ? { ...row, ispdsentrylock: isLocked ? 1 : 0 }
          : row
      )
    );

    try {
      await api.put(`/201-employees-with-pds/${employeeObjId}/toggle-lock-pds`, { isLocked });
      // Refresh list to get updated data
      await fetchList();
    } catch (error) {
      console.error('Error toggling PDS lock:', error);
      // Revert optimistic update on error
      await fetchList();
      alert(error.response?.data?.message || 'Failed to toggle PDS lock. Please try again.');
    } finally {
      setTogglingLockId(null);
    }
  };

  const handleSave = async () => {
    if (editRow && !canUpdateEmployeesWithPds) {
      alert('You do not have permission to update employee records.');
      return;
    }
    if (!editRow && !canCreateEmployeesWithPds) {
      alert('You do not have permission to create employee records.');
      return;
    }
    setSaving(true);
    try {
      if (editRow) {
        await api.put(`/201-employees-with-pds/${editRow.objid}`, form);
      } else {
        await api.post('/201-employees-with-pds', form);
      }
      setShowModal(false);
      fetchList();
    } catch (e) {
      console.error('Save error', e);
      alert('Failed to save');
    } finally { setSaving(false); }
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

  if (!canReadEmployeesWithPds) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You do not have permission to view Employees with PDS.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search Employee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Employee
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!canReadEmployeesWithPds}
            />
          </div>

          {/* Title Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <select
              value={filterTitle}
              onChange={(e) => setFilterTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!canReadEmployeesWithPds}
            >
              <option value="">All Titles</option>
              {filterOptions.titles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!canReadEmployeesWithPds}
            >
              <option value="">All Departments</option>
              {filterOptions.departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Appointment Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Appointment
            </label>
            <select
              value={filterAppointment}
              onChange={(e) => setFilterAppointment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!canReadEmployeesWithPds}
            >
              <option value="">All Appointments</option>
              {filterOptions.appointments.map((appt) => (
                <option key={appt} value={appt}>
                  {appt}
                </option>
              ))}
            </select>
          </div>

          {/* Lock Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lock Status
            </label>
            <select
              value={filterLockStatus}
              onChange={(e) => setFilterLockStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!canReadEmployeesWithPds}
            >
              <option value="">All</option>
              <option value="locked">Locked</option>
              <option value="unlocked">Unlocked</option>
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {(search || filterTitle || filterDepartment || filterAppointment || filterLockStatus) && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                setSearch('');
                setFilterTitle('');
                setFilterDepartment('');
                setFilterAppointment('');
                setFilterLockStatus('');
              }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Designation</th>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Department</th>
              <th className="px-4 py-2 text-left">Appointment</th>
              <th className="px-4 py-2 text-left">Shift Schedules</th>
              <th className="px-4 py-2 text-left">Lock PDS</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No records</td></tr>
            ) : (
              filtered.map(r => (
                <tr key={r.objid}>
                  <td className="px-4 py-2">
                    {(() => {
                      const formattedName = formatEmployeeNameFromString(r.fullname || '');
                      const { lastName, firstName } = splitFullName(formattedName);
                      const displayName = [lastName, firstName].filter(Boolean).join(', ') || formattedName || 'Employee';
                      const departmentPosition = [r.departmentName || '', r.positionName || ''].filter(Boolean).join(' - ');
                      return (
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 border border-gray-300 flex items-center justify-center">
                            {r.photo_path ? (
                              <img src={r.photo_path} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-gray-500 px-2 text-center">No Photo</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{displayName}</div>
                            {departmentPosition && (
                              <div className="text-xs text-gray-500 truncate">
                                {departmentPosition}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2">{r.presentDesignationName || '—'}</td>
                  <td className="px-4 py-2">{r.positionName || '—'}</td>
                  <td className="px-4 py-2">{r.departmentName || '—'}</td>
                  <td className="px-4 py-2">{r.appointmentName || '—'}</td>
                  <td className="px-4 py-2">
                    {(() => {
                      const shifts = String(r.shiftDisplay || '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (!shifts.length) return '—';
                      return (
                        <div className="flex flex-col gap-1">
                          {shifts.map((shift, index) => (
                            <span key={`${shift}-${index}`} className="text-sm text-gray-700">
                              {shift}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.ispdsentrylock === 1}
                        onChange={(e) => handleToggleLockPDS(r.objid, e.target.checked)}
                        disabled={togglingLockId === r.objid || !canUpdateEmployeesWithPds}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {canUpdateEmployeesWithPds && (
                        <button
                          onClick={() => openEdit(r)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit Employee"
                        >
                          ✏️
                        </button>
                      )}
                      {canPrintEmployeesWithPds && (
                        <button
                          onClick={() => alert('Print functionality not yet implemented')}
                          className="text-green-600 hover:text-green-800 transition-colors"
                          title="Print"
                        >
                          🖨️
                        </button>
                      )}
                      {canDeleteEmployeesWithPds && (
                        <button
                          onClick={() => alert('Delete functionality not yet implemented')}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      )}
                      {!canUpdateEmployeesWithPds &&
                        !canPrintEmployeesWithPds &&
                        !canDeleteEmployeesWithPds && (
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
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                  {editRow?.photo_path ? (
                    <img src={editRow.photo_path} alt={formatEmployeeNameFromString(editRow.fullname || '') || 'Employee'} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-500 text-xs text-center px-2">No Photo</span>
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {editRow ? 'Edit Employee' : 'Add Employee'}
                  </div>
                  <div className="text-lg font-semibold text-gray-800">
                    {(() => {
                      if (form.surname || form.firstname || editRow?.surname || editRow?.firstname) {
                        return formatEmployeeNameFromObject({
                          surname: form.surname || editRow?.surname,
                          firstname: form.firstname || editRow?.firstname,
                          middlename: form.middlename || editRow?.middlename
                        }) || 'Employee';
                      }
                      return formatEmployeeNameFromString(editRow?.fullname || '') || 'Employee';
                    })()}
                  </div>
                  <div className="text-sm text-gray-500">
                    {form.agency_no || editRow?.agency_no || '—'}
                  </div>
                </div>
              </div>
              <button className="text-gray-500" onClick={()=>setShowModal(false)}>✕</button>
            </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-sm text-gray-600">ID No (Agency No)</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.agency_no} onChange={(e)=>setForm(f=>({...f, agency_no:e.target.value}))} />
                    </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm text-gray-600">Last Name</label>
                        <input className="mt-1 w-full border rounded px-3 py-2" value={form.surname} onChange={(e)=>setForm(f=>({...f, surname:e.target.value}))} />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">First Name</label>
                        <input className="mt-1 w-full border rounded px-3 py-2" value={form.firstname} onChange={(e)=>setForm(f=>({...f, firstname:e.target.value}))} />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Middle Name</label>
                        <input className="mt-1 w-full border rounded px-3 py-2" value={form.middlename} onChange={(e)=>setForm(f=>({...f, middlename:e.target.value}))} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-gray-600">Birth Date</label>
                      <input type="date" className="mt-1 w-full border rounded px-3 py-2" value={form.birthdate} onChange={(e)=>setForm(f=>({...f, birthdate:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Birth Place</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.birth_place} onChange={(e)=>setForm(f=>({...f, birth_place:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Gender</label>
                      <select className="mt-1 w-full border rounded px-3 py-2" value={form.gender} onChange={(e)=>setForm(f=>({...f, gender:e.target.value}))}>
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Civil Status</label>
                      <select
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={form.civilstatus}
                        onChange={(e)=>setForm(f=>({...f, civilstatus:e.target.value}))}
                      >
                        <option value="">Select status</option>
                        {civilStatusOptions.map((option) => (
                          <option key={option.id || option.label} value={option.label}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Height (cm)</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.height} onChange={(e)=>setForm(f=>({...f, height:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Weight (kg)</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.weight} onChange={(e)=>setForm(f=>({...f, weight:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Blood Type</label>
                      <select
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={form.bloodtype}
                        onChange={(e)=>setForm(f=>({...f, bloodtype:e.target.value}))}
                      >
                        <option value="">Select blood type</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">GSIS</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.gsis} onChange={(e)=>setForm(f=>({...f, gsis:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">PAG-IBIG</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.pagibig} onChange={(e)=>setForm(f=>({...f, pagibig:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">PHILHEALTH</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.philhealth} onChange={(e)=>setForm(f=>({...f, philhealth:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">SSS</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.sss} onChange={(e)=>setForm(f=>({...f, sss:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">TIN</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.tin} onChange={(e)=>setForm(f=>({...f, tin:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Telephone</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.telephone} onChange={(e)=>setForm(f=>({...f, telephone:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Mobile No</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.mobileno} onChange={(e)=>setForm(f=>({...f, mobileno:e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">Email</label>
                      <input className="mt-1 w-full border rounded px-3 py-2" value={form.email} onChange={(e)=>setForm(f=>({...f, email:e.target.value}))} />
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
              <button className="px-4 py-2 rounded border" onClick={()=>setShowModal(false)}>Cancel</button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                onClick={handleSave}
                disabled={
                  saving ||
                  (editRow ? !canUpdateEmployeesWithPds : !canCreateEmployeesWithPds)
                }
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeesWithPDS;


