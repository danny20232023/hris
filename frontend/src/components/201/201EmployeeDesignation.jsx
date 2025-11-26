import React, { useEffect, useMemo, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const Filters = ({ filters, onFilterChange, ranks, appointments, onCreate, canCreate }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <input
        type="text"
        value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
        placeholder="Search employee name"
        className="px-3 py-2 border rounded"
      />
      <select
        value={filters.rankId}
          onChange={(e) => onFilterChange('rankId', e.target.value)}
        className="px-3 py-2 border rounded"
      >
        <option value="">All Designation</option>
        {(ranks || []).map((r) => (
          <option key={r.rankid} value={r.rankid}>{r.rankname}</option>
        ))}
      </select>
      <select
        value={filters.appointmentId}
          onChange={(e) => onFilterChange('appointmentId', e.target.value)}
        className="px-3 py-2 border rounded"
      >
        <option value="">All Appointments</option>
        {(appointments || []).map((a) => (
          <option key={a.id} value={a.id}>{a.appointmentname}</option>
        ))}
      </select>
        <div className="flex items-center justify-end gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Create Designation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const RowPhoto = ({ src, name }) => {
  return src ? (
    <img src={src} alt={name} className="w-10 h-10 rounded-full object-cover" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600">
      {(name || 'NA').split(' ').map(n=>n[0]).join('').substring(0,2)}
    </div>
  );
};

const DesignationPage = () => {
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState('designations');
  const [filters, setFilters] = useState({ search: '', rankId: '', appointmentId: '' });
  const [ranks, setRanks] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [formData, setFormData] = useState({
    emp_objid: '',
    designationid: '',
    position: '',
    jobdescription: '',
    appointmentdate: '',
    appointmentstatus: '',
    assigneddept: '',
    plantillano: '',
    salarygrade: '',
    gradeincrement: '',
    salary: ''
  });
  const [expandedEmployees, setExpandedEmployees] = useState({});

  const handleTogglePresent = async (record, nextValue, siblingRecords = []) => {
    try {
      console.log('[Designation Toggle] handleTogglePresent start', {
        recordId: record.objid,
        nextValue,
        siblingCount: siblingRecords?.length,
        ispresent: record.ispresent
      });
      const payload = nextValue
        ? { ispresent: 1, emp_objid: record.emp_objid }
        : { ispresent: 0 };
      console.log('[Designation Toggle] sending payload', payload);
      if (nextValue) {
        await api.put(`/employee-designations/${record.objid}`, payload);
        const others = (siblingRecords || [])
          .filter((r) => r.objid !== record.objid && String(r.ispresent) === '1');
        if (others.length > 0) {
          await Promise.all(
            others.map((r) =>
              api.put(`/employee-designations/${r.objid}`, { ispresent: 0 })
            )
          );
        }
      } else {
        await api.put(`/employee-designations/${record.objid}`, { ispresent: 0 });
      }
      await fetchList('all');
    } catch (error) {
      console.error('Failed to update designation status', error?.response?.data || error);
      alert('Failed to update designation status');
    }
    console.log('[Designation Toggle] handleTogglePresent end');
  };

  const fetchLookups = async () => {
    const [r1, r2, r3] = await Promise.all([
      api.get('/employee-designations/ranks'),
      api.get('/employee-designations/appointment-types'),
      api.get('/departments')
    ]);
    setRanks(Array.isArray(r1.data) ? r1.data : []);
    setAppointments(Array.isArray(r2.data) ? r2.data : []);
    setDepartments(Array.isArray(r3.data) ? r3.data : (r3.data?.data || []));
  };

  const fetchList = async (status = 'active', overrideFilters = null) => {
    setLoading(true);
    try {
      const source = overrideFilters ?? filters;
      const { search, rankId, appointmentId } = source;
      const resp = await api.get('/employee-designations', { params: { status, search, rankId, appointmentId } });
      setItems(resp.data?.data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => {
      const updated = { ...prev, [field]: value };
      fetchList('all', updated);
      return updated;
    });
  };

  useEffect(() => {
    fetchLookups();
    fetchList('all');
    // bootstrap employees for selector
    (async () => {
      try {
        const resp = await api.get('/201-employees');
        setEmployees(resp.data?.data || []);
      } catch (e) {}
    })();
  }, []);

  // When editing, hydrate form with selected row and show selected employee
  useEffect(() => {
    if (editing) {
      const rawGradeIncrement = editing.gradeincrement ?? '';
      const normalizedGradeIncrement = rawGradeIncrement === ''
        ? ''
        : String(rawGradeIncrement).padStart(2, '0');
      setFormData(f => ({
        ...f,
        emp_objid: editing.emp_objid || editing.employee_objid || '',
        designationid: editing.rankid || '',
        position: editing.position || '',
        appointmentstatus: editing.appointmentid || '',
        appointmentdate: editing.appointmentdate ? String(editing.appointmentdate).slice(0,10) : '',
        assigneddept: editing.assigneddept || editing.deptid || '',
        plantillano: editing.plantillano || '',
        salarygrade: editing.salarygrade || '',
        gradeincrement: normalizedGradeIncrement,
        dailywage: editing.dailywage ?? '',
        salary: editing.salary ?? '',
        jobdescription: editing.jobdescription || ''
      }));
      const name = formatEmployeeName(editing.surname, editing.firstname, editing.middlename);
      setEmployeeQuery(name);
    }
  }, [editing]);

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach((r) => {
      const key = r.emp_objid;
      if (!map.has(key)) {
        map.set(key, { employee: r, records: [] });
      }
      map.get(key).records.push(r);
    });
    return Array.from(map.values());
  }, [items]);

  const toggleExpand = (empId) => {
    setExpandedEmployees((prev) => ({ ...prev, [empId]: !prev[empId] }));
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6">
          <div className="flex space-x-8">
            <button
              onClick={() => {
                setActiveTab('designations');
                fetchList('all');
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'designations'
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500'
              }`}
            >
              Designations
            </button>
            <button
              onClick={() => {
                setActiveTab('records');
                fetchList('all');
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'records'
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500'
              }`}
            >
              Designation Records
            </button>
          </div>
        </div>
      </div>

      <Filters
        filters={filters}
        onFilterChange={handleFilterChange}
        ranks={ranks}
        appointments={appointments}
        onCreate={() => {
            setEditing(null);
            setEmployeeQuery('');
            setFormData({
              emp_objid: '',
              designationid: '',
              position: '',
              jobdescription: '',
              appointmentdate: '',
              appointmentstatus: '',
              assigneddept: '',
              plantillano: '',
              salarygrade: '',
              gradeincrement: '',
              dailywage: '',
              salary: ''
            });
            setShowModal(true); 
          }} 
        canCreate={can('201-designation', 'create')}
      />

      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : activeTab === 'designations' ? (
        grouped.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No designation records found.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-1 py-2 w-10"></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Appointment</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {grouped.map(({ employee, records }) => {
                  const expanded = !!expandedEmployees[employee.emp_objid];
                  const presentRecord = records.find((rec) => Number(rec.ispresent) === 1) || null;
                  const noDesignation = !presentRecord;
                  return (
                    <React.Fragment key={employee.emp_objid}>
                      <tr className="bg-white">
                        <td className="px-1 py-2 w-10 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(employee.emp_objid)}
                            className="inline-flex items-center justify-center w-6 h-6 border rounded-full text-sm text-gray-600 hover:bg-gray-100"
                            aria-label={expanded ? 'Collapse details' : 'Expand details'}
                          >
                            {expanded ? '-' : '+'}
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <RowPhoto src={employee.photo_path} name={formatEmployeeNameFromObject(employee)} />
                            <div className="text-sm text-gray-800 font-medium">
                              {formatEmployeeNameFromObject(employee)}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {noDesignation ? 'No Designation' : (presentRecord?.departmentname || '-')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {noDesignation ? 'No Designation' : (presentRecord?.position || '-')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {noDesignation ? 'No Designation' : (presentRecord?.appointmentname || '-')}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={5} className="bg-gray-50 px-4 py-4">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Appointment</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Salary Grade</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {records.map((rec) => (
                                    <tr key={rec.objid}>
                                      <td className="px-4 py-2 text-sm">{rec.rankname || '-'}</td>
                                      <td className="px-4 py-2 text-sm">{rec.position || '-'}</td>
                                      <td className="px-4 py-2 text-sm">{rec.departmentname || '-'}</td>
                                      <td className="px-4 py-2 text-sm">{rec.appointmentname || '-'}</td>
                                      <td className="px-4 py-2 text-sm">{
                                        rec.salarygrade
                                          ? (() => {
                                              const incrementRaw = rec.gradeincrement;
                                              const hasIncrement = incrementRaw !== null && incrementRaw !== undefined && String(incrementRaw).trim() !== '';
                                              if (!hasIncrement) {
                                                return `${rec.salarygrade}`;
                                              }
                                              const paddedIncrement = String(incrementRaw).padStart(2, '0');
                                              return `${rec.salarygrade}-${paddedIncrement}`;
                                            })()
                                          : '-'
                                      }</td>
                                      <td className="px-4 py-2 text-sm">
                                        <label
                                          className={`inline-flex items-center ${
                                            Number(rec.ispresent) === 1 ? 'cursor-pointer' : 'cursor-pointer'
                                          }`}
                                        >
                                          <span className="relative inline-flex items-center">
                                            <input
                                              type="checkbox"
                                              checked={Number(rec.ispresent) === 1}
                                              disabled={records.length <= 1 && Number(rec.ispresent) === 1}
                                              onChange={(e) => handleTogglePresent(rec, e.target.checked, records)}
                                              className="sr-only peer"
                                              aria-label={`Mark ${rec.rankname || 'designation'} as active`}
                                            />
                                            <span className="w-11 h-6 bg-gray-200 rounded-full transition-colors peer-focus:outline-none peer-checked:bg-green-500"></span>
                                            <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform transform peer-checked:translate-x-5"></span>
                                          </span>
                                          <span className="ml-3 text-xs uppercase tracking-wide text-gray-500">Present</span>
                                        </label>
                                      </td>
                                      <td className="px-4 py-2 text-sm">
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            title="View"
                                            aria-label="View"
                                            onClick={() => {
                                              setEditing(rec);
                                              setViewMode(true);
                                              setShowModal(true);
                                            }}
                                            className="text-indigo-600 hover:text-indigo-900 p-1 rounded"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                              <path d="M12 5c-7.633 0-11 6.5-11 7s3.367 7 11 7 11-6.5 11-7-3.367-7-11-7zm0 12c-3.314 0-6-2.239-6-5s2.686-5 6-5 6 2.239 6 5-2.686 5-6 5zm0-8a3 3 0 100 6 3 3 0 000-6z" />
                                            </svg>
                                          </button>
                                          {can('201-designation', 'update') && (
                                            <button
                                              type="button"
                                              title="Edit"
                                              aria-label="Edit"
                                              onClick={() => {
                                                setEditing(rec);
                                                setViewMode(false);
                                                setShowModal(true);
                                              }}
                                              className="text-blue-600 hover:text-blue-900 p-1 rounded"
                                            >
                                              ✎
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Appointment</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((record) => (
                <tr key={record.objid}>
                  <td className="px-4 py-2">
                    <RowPhoto
                      src={record.photo_path}
                      name={formatEmployeeNameFromObject(record)}
                    />
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-800">
                    {formatEmployeeNameFromObject(record)}
                  </td>
                  <td className="px-4 py-2 text-sm">{record.rankname || '-'}</td>
                  <td className="px-4 py-2 text-sm">{record.position || '-'}</td>
                  <td className="px-4 py-2 text-sm">{record.departmentname || '-'}</td>
                  <td className="px-4 py-2 text-sm">{record.appointmentname || '-'}</td>
                  <td className="px-4 py-2 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        String(record.ispresent) === '1'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {String(record.ispresent) === '1' ? 'Present' : 'Not Present'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="View"
                        aria-label="View"
                        onClick={() => {
                          setEditing(record);
                          setViewMode(true);
                          setShowModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-900 p-1 rounded"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                          <path d="M12 5c-7.633 0-11 6.5-11 7s3.367 7 11 7 11-6.5 11-7-3.367-7-11-7zm0 12c-3.314 0-6-2.239-6-5s2.686-5 6-5 6 2.239 6 5-2.686 5-6 5zm0-8a3 3 0 100 6 3 3 0 000-6z" />
                        </svg>
                      </button>
                      {can('201-designation', 'update') && (
                        <button
                          type="button"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => {
                            setEditing(record);
                            setViewMode(false);
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded"
                        >
                          ✎
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

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">{viewMode ? 'View Designation' : (editing ? 'Edit Designation' : 'Add Designation')}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Employee selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <div className="relative">
                  <input
                    type="text"
                    value={employeeQuery}
                    onChange={(e)=> {
                      setEmployeeQuery(e.target.value);
                      setFormData(f=>({ ...f, emp_objid: '' })); // Clear selection when typing
                    }}
                    placeholder="Type employee name to search..."
                    className={`w-full px-3 py-2 border rounded ${editing || viewMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={!!editing || viewMode}
                  />
                  {employeeQuery && !formData.emp_objid && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {employees
                        .filter(emp => {
                          const formattedName = formatEmployeeNameFromObject(emp);
                          return formattedName.toLowerCase().includes(employeeQuery.toLowerCase());
                        })
                        .slice(0,10)
                        .map(emp => {
                          const formattedName = formatEmployeeNameFromObject(emp);
                          return (
                          <div
                            key={emp.objid}
                            onClick={() => {
                              setFormData(f=>({ ...f, emp_objid: emp.objid }));
                                setEmployeeQuery(formattedName);
                            }}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center space-x-3"
                          >
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                              {emp.photo_path ? (
                                <img 
                                  src={emp.photo_path} 
                                  alt="Employee" 
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                                  {emp.firstname?.charAt(0) || '?'}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                  {formattedName}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      {employees.filter(emp => {
                        const formattedName = formatEmployeeNameFromObject(emp);
                        return formattedName.toLowerCase().includes(employeeQuery.toLowerCase());
                      }).length === 0 && (
                        <div className="px-3 py-2 text-gray-500">No employees found</div>
                      )}
                    </div>
                  )}
                </div>
                {formData.emp_objid && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                        {(() => {
                          const selectedEmp = employees.find(emp => emp.objid === formData.emp_objid);
                          return selectedEmp?.photo_path ? (
                            <img 
                              src={selectedEmp.photo_path} 
                              alt="Selected Employee" 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 text-lg font-medium">
                              {selectedEmp?.firstname?.charAt(0) || '?'}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-green-800">
                          ✓ Selected Employee
                        </div>
                        <div className="text-lg font-semibold text-gray-900">
                          {(() => {
                            const selectedEmp = employees.find(emp => emp.objid === formData.emp_objid);
                            return selectedEmp ? formatEmployeeNameFromObject(selectedEmp) : 'Unknown Employee';
                          })()}
                        </div>
                        <div className="text-sm text-gray-600">
                          DTR User ID: {(() => {
                            const selectedEmp = employees.find(emp => emp.objid === formData.emp_objid);
                            return selectedEmp?.dtruserid || '-';
                          })()}
                        </div>
                      </div>
                      {!editing && !viewMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(f => ({ ...f, emp_objid: '' }));
                          setEmployeeQuery('');
                        }}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        ✕ Clear
                      </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 1 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                  <select value={formData.designationid} onChange={(e)=> setFormData(f=>({...f, designationid: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode}>
                    <option value="">Select</option>
                    {(ranks||[]).map(r => (<option key={r.rankid} value={r.rankid}>{r.rankname}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Status</label>
                  <select value={formData.appointmentstatus} onChange={(e)=> setFormData(f=>({...f, appointmentstatus: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode}>
                    <option value="">Select</option>
                    {(appointments||[]).map(a => (<option key={a.id} value={a.id}>{a.appointmentname}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                  <input type="date" value={formData.appointmentdate} onChange={(e)=> setFormData(f=>({...f, appointmentdate: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode} />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                  <input type="text" value={formData.position} onChange={(e)=> setFormData(f=>({...f, position: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Department</label>
                  <select value={formData.assigneddept} onChange={(e)=> setFormData(f=>({...f, assigneddept: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode}>
                    <option value="">Select</option>
                    {(departments||[]).map(d => {
                      const id = d.deptid;
                      const name = d.departmentshortname || d.departmentname || 'Unnamed Department';
                      return (<option key={id} value={id}>{name}</option>);
                    })}
                  </select>
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla No.</label>
                  <input type="text" value={formData.plantillano} onChange={(e)=> setFormData(f=>({...f, plantillaNo: e.target.value, plantillano: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salary Grade</label>
                  <select
                    value={formData.salarygrade || ''}
                    onChange={(e)=> setFormData(f=>({...f, salarygrade: e.target.value}))}
                    className="w-full px-3 py-2 border rounded"
                    disabled={viewMode}
                  >
                    <option value="">Select</option>
                    {Array.from({ length: 33 }, (_, i) => i + 1).map(grade => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Step (Increment)</label>
                  <select
                    value={formData.gradeincrement || ''}
                    onChange={(e)=> setFormData(f=>({...f, gradeincrement: e.target.value}))}
                    className="w-full px-3 py-2 border rounded"
                    disabled={viewMode}
                  >
                    <option value="">Select</option>
                    {Array.from({ length: 9 }, (_, i) => String(i + 1).padStart(2, '0')).map(step => (
                      <option key={step} value={step}>{step}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Wage</label>
                  <input type="number" step="0.01" value={formData.dailywage || ''} onChange={(e)=> setFormData(f=>({...f, dailywage: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salary</label>
                  <input type="number" step="0.01" value={formData.salary} onChange={(e)=> setFormData(f=>({...f, salary: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <div className="border rounded">
                  <ReactQuill
                    value={formData.jobdescription || ''}
                    onChange={(value) => setFormData(f => ({ ...f, jobdescription: value }))}
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'indent': '-1'}, { 'indent': '+1' }],
                        [{ 'align': [] }],
                        ['link'],
                        ['clean']
                      ],
                    }}
                    formats={[
                      'header', 'bold', 'italic', 'underline', 'strike',
                      'list', 'bullet', 'indent', 'align', 'link'
                    ]}
                    placeholder="Enter job description..."
                    style={{ minHeight: '120px' }}
                    readOnly={viewMode}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setViewMode(false); }} className="px-4 py-2 rounded border">{viewMode ? 'Close' : 'Cancel'}</button>
                {!viewMode && (editing ? can('201-designation', 'update') : can('201-designation', 'create')) && (
                <button
                  type="button"
                  onClick={async ()=>{
                    // minimal validation
                    if (!formData.emp_objid || !formData.designationid || !formData.appointmentstatus) return;
                    const payload = {
                      emp_objid: formData.emp_objid,
                      rankid: formData.designationid,
                      position: formData.position,
                      appointmentid: formData.appointmentstatus ? parseInt(formData.appointmentstatus, 10) : null,
                      appointmentdate: formData.appointmentdate || null,
                      assigneddept: formData.assigneddept || null,
                      plantillano: formData.plantillano || null,
                      salarygrade: formData.salarygrade ? parseInt(formData.salarygrade, 10) : null,
                      gradeincrement: formData.gradeincrement ? parseInt(formData.gradeincrement, 10) : null,
                      dailywage: formData.dailywage === '' || formData.dailywage == null ? null : parseFloat(formData.dailywage),
                      salary: formData.salary === '' || formData.salary == null ? null : parseFloat(formData.salary),
                      jobdescription: formData.jobdescription || null
                    };
                    try {
                      if (editing) {
                        await api.put(`/employee-designations/${editing.objid}`, {
                          rankid: payload.rankid,
                          position: payload.position,
                          appointmentid: payload.appointmentid,
                          dailywage: payload.dailywage,
                          salary: payload.salary,
                          assigneddept: payload.assigneddept,
                          jobdescription: payload.jobdescription
                        });
                      } else {
                        await api.post('/employee-designations', payload);
                      }
                      setShowModal(false);
                      fetchList('active');
                    } catch (e) {
                      console.error('Save failed', e);
                    }
                  }}
                  className="px-4 py-2 rounded bg-indigo-600 text-white"
                >
                  Save
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignationPage;


