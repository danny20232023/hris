import React, { useEffect, useMemo, useState, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

// Wrapper component to suppress findDOMNode warning
const QuillEditor = ({ value, onChange, ...props }) => {
  const quillRef = useRef(null);
  
  // Suppress console warnings for findDOMNode
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0]?.includes?.('findDOMNode') || args[0]?.includes?.('Warning: findDOMNode')) {
        return; // Suppress findDOMNode warnings
      }
      originalError.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
    };
  }, []);
  
  return (
    <div ref={quillRef}>
      <ReactQuill
        value={value}
        onChange={onChange}
        {...props}
      />
    </div>
  );
};

const Filters = ({ filters, onFilterChange, ranks, appointments, departments, onCreate, canCreate }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <input
        type="text"
        value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
        placeholder="Search employee name"
        className="px-3 py-2 border rounded"
      />
      <select
        value={filters.departmentId}
          onChange={(e) => onFilterChange('departmentId', e.target.value)}
        className="px-3 py-2 border rounded"
      >
        <option value="">All Departments</option>
        {(departments || []).map((d) => {
          const name = d.departmentshortname || d.departmentname || 'Unnamed Department';
          return (
            <option key={d.deptid} value={d.deptid}>{name}</option>
          );
        })}
      </select>
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
  const [filters, setFilters] = useState({ search: '', rankId: '', appointmentId: '', departmentId: '' });
  const [ranks, setRanks] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [plantillas, setPlantillas] = useState([]);
  const [tranches, setTranches] = useState([]);
  const [selectedPlantilla, setSelectedPlantilla] = useState(null);
  const [plantillaSearchQuery, setPlantillaSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    emp_objid: '',
    designationid: '',
    position: '',
    jobdescription: '',
    appointmentdate: '',
    appointmentdate_end: '',
    appointmentstatus: '',
    assigneddept: '',
    plantillano: '',
    plantilla_id: '',
    tranche_id: '',
    salarygrade: '',
    stepincrement: '',
    salary: '',
    dailywage: ''
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
      await fetchList('all', null, currentPage);
    } catch (error) {
      console.error('Failed to update designation status', error?.response?.data || error);
      alert('Failed to update designation status');
    }
    console.log('[Designation Toggle] handleTogglePresent end');
  };

  const handleDelete = async (record) => {
    if (!can('201-designation', 'delete')) {
      alert('You do not have permission to delete designations.');
      return;
    }
    
    const employeeName = formatEmployeeNameFromObject(record) || 'this designation';
    const position = record.position || record.rankname || 'designation';
    
    if (window.confirm(`Are you sure you want to delete the designation "${position}" for ${employeeName}?`)) {
      try {
        await api.delete(`/employee-designations/${record.objid}`);
        alert('Designation deleted successfully');
        await fetchList('all', null, currentPage);
      } catch (error) {
        console.error('Error deleting designation:', error);
        alert(error.response?.data?.error || 'Failed to delete designation');
      }
    }
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

  // Fetch all plantillas with employee info
  const fetchPlantillas = async () => {
    try {
      const response = await api.get('/201-plantilla', {
        params: {
          page: 1,
          limit: 1000,
          includeEmployee: 'true'
        }
      });
      const plantillaData = response.data?.data || response.data || [];
      console.log('[Designation] Fetched plantillas:', {
        count: plantillaData.length,
        isArray: Array.isArray(plantillaData),
        responseStructure: {
          hasData: !!response.data,
          hasDataData: !!response.data?.data,
          dataType: typeof response.data,
          dataDataType: typeof response.data?.data
        },
        sample: plantillaData.slice(0, 3).map(p => ({
          id: p.id,
          position_title: p.position_title,
          plantilla_no: p.plantilla_no,
          isvacant: p.isvacant,
          assigned_employee: p.assigned_employee_surname ? formatEmployeeName(
            p.assigned_employee_surname,
            p.assigned_employee_firstname,
            p.assigned_employee_middlename,
            p.assigned_employee_extension
          ) : null
        }))
      });
      setPlantillas(plantillaData);
    } catch (error) {
      console.error('Error fetching plantillas:', error);
      setPlantillas([]);
    }
  };

  // Fetch active tranches
  const fetchActiveTranches = async () => {
    try {
      const response = await api.get('/201-plantilla-tranches', {
        params: {
          page: 1,
          limit: 1000,
          status: 'Active'
        }
      });
      setTranches(response.data.data || []);
    } catch (error) {
      console.error('Error fetching tranches:', error);
      setTranches([]);
    }
  };

  // Fetch rate by tranche, salary grade, and step increment
  const fetchRate = async (trancheId, salarygrade, stepincrement) => {
    if (!trancheId || !salarygrade || !stepincrement) {
      return null;
    }
    try {
      // Format salarygrade as 2-digit string (e.g., "01", "15")
      const formattedSalaryGrade = String(salarygrade).padStart(2, '0');
      // Format stepincrement as 2-digit string (e.g., "01", "08")
      const formattedStepIncrement = String(stepincrement).padStart(2, '0');
      
      const response = await api.get(`/201-plantilla-tranches/${trancheId}/rates/${formattedSalaryGrade}/${formattedStepIncrement}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching rate:', error);
      return null;
    }
  };

  const fetchList = async (status = 'active', overrideFilters = null, page = null) => {
    setLoading(true);
    try {
      const source = overrideFilters ?? filters;
      const { search, rankId, appointmentId, departmentId } = source;
      const pageToUse = page !== null ? page : currentPage;
      const resp = await api.get('/employee-designations', { 
        params: { 
          status, 
          search, 
          rankId, 
          appointmentId,
          departmentId,
          page: pageToUse,
          limit: recordsPerPage
        } 
      });
      setItems(resp.data?.data || []);
      setTotalRecords(resp.data?.pagination?.total || resp.data?.total || 0);
      setTotalPages(resp.data?.pagination?.totalPages || Math.ceil((resp.data?.total || 0) / recordsPerPage));
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => {
      const updated = { ...prev, [field]: value };
      setCurrentPage(1); // Reset to first page when filter changes
      fetchList('all', updated, 1);
      return updated;
    });
  };

  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      fetchList('all', null, page);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      fetchList('all', null, newPage);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      fetchList('all', null, newPage);
    }
  };

  // Reset to page 1 when recordsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
    fetchList('all', null, 1);
  }, [recordsPerPage]);

  useEffect(() => {
    fetchLookups();
    fetchPlantillas();
    fetchActiveTranches();
    fetchList('all', null, 1);
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
      const rawStepIncrement = editing.stepincrement ?? '';
      const normalizedStepIncrement = rawStepIncrement === ''
        ? ''
        : String(rawStepIncrement).padStart(2, '0');
      const plantillaId = editing.plantilla_id ? String(editing.plantilla_id) : '';
      const trancheId = editing.tranche_id ? String(editing.tranche_id) : '';
      
      setFormData(f => ({
        ...f,
        emp_objid: editing.emp_objid || editing.employee_objid || '',
        designationid: editing.rankid || '',
        position: editing.position || '',
        appointmentstatus: editing.appointmentid || '',
        appointmentdate: editing.appointmentdate ? String(editing.appointmentdate).slice(0,10) : '',
        appointmentdate_end: editing.appointmentdate_end ? String(editing.appointmentdate_end).slice(0,10) : '',
        assigneddept: editing.assigneddept || editing.deptid || '',
        plantillano: editing.plantillano || '',
        plantilla_id: plantillaId,
        tranche_id: trancheId,
        salarygrade: editing.salarygrade || '',
        stepincrement: normalizedStepIncrement,
        dailywage: editing.dailywage ? (parseFloat(editing.dailywage).toFixed(2)) : '',
        salary: editing.salary ? (parseFloat(editing.salary).toFixed(2)) : '',
        jobdescription: editing.jobdescription || ''
      }));
      
      // Set selected plantilla if plantilla_id exists
      if (plantillaId) {
        const plantilla = plantillas.find(p => String(p.id) === plantillaId);
        setSelectedPlantilla(plantilla || null);
        if (plantilla) {
          const displayName = `${plantilla.plantilla_no || ''} ${plantilla.position_title || ''} ${plantilla.salarygrade ? `(${plantilla.salarygrade})` : ''}`.trim() || `Plantilla ${plantilla.id}`;
          setPlantillaSearchQuery(displayName);
          // Auto-fill position from plantilla if not already set
          if (!editing.position && plantilla.position_title) {
            setFormData(f => ({ ...f, position: plantilla.position_title }));
          }
        } else {
          setPlantillaSearchQuery('');
        }
      } else {
        setSelectedPlantilla(null);
        setPlantillaSearchQuery('');
      }
      
      const name = formatEmployeeName(editing.surname, editing.firstname, editing.middlename);
      setEmployeeQuery(name);
      
      // Check if appointment has canleave=1
      const selectedAppointment = appointments.find(a => String(a.id) === String(editing.appointmentid));
      const canLeave = selectedAppointment?.canleave === 1;
      
      // Trigger rate lookup if canleave=1 and all required fields are present (plantilla enabled)
      if (canLeave && plantillaId && trancheId && normalizedStepIncrement) {
        const plantilla = plantillas.find(p => String(p.id) === plantillaId);
        if (plantilla && plantilla.salarygrade) {
          fetchRate(trancheId, plantilla.salarygrade, normalizedStepIncrement).then(rate => {
            if (rate) {
              const dailyWageDays = plantilla.dailywagesdays || 22; // Default to 22 if not set
              const calculatedSalary = rate.rate && rate.tranche_percent ? (rate.rate * (rate.tranche_percent / 100)) : null;
              setFormData(f => ({
                ...f,
                salary: calculatedSalary ? String(calculatedSalary.toFixed(2)) : '',
                dailywage: calculatedSalary ? String((calculatedSalary / dailyWageDays).toFixed(2)) : ''
              }));
            }
          });
        }
      } else if (!canLeave) {
        // For canleave=0, clear plantilla fields if they exist (plantilla disabled)
        setFormData(f => ({
          ...f,
          plantilla_id: '',
          tranche_id: '',
          stepincrement: '',
          plantillano: '',
          salarygrade: ''
        }));
        setSelectedPlantilla(null);
        setPlantillaSearchQuery('');
      }
    }
  }, [editing, plantillas, appointments]);

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
                setCurrentPage(1);
                fetchList('all', null, 1);
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
                setCurrentPage(1);
                fetchList('all', null, 1);
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
        departments={departments}
        onCreate={() => {
            setEditing(null);
            setEmployeeQuery('');
            setFormData({
              emp_objid: '',
              designationid: '',
              position: '',
              jobdescription: '',
              appointmentdate: '',
              appointmentdate_end: '',
              appointmentstatus: '',
              assigneddept: '',
              plantillano: '',
              plantilla_id: '',
              tranche_id: '',
              salarygrade: '',
              stepincrement: '',
              dailywage: '',
              salary: ''
            });
            setSelectedPlantilla(null);
            setPlantillaSearchQuery('');
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
          <>
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
                          {noDesignation ? 'No Designation' : (
                            <div>
                              <div>{presentRecord?.position || '-'}</div>
                              {(() => {
                                if (!presentRecord) return null;
                                const salaryGrade = presentRecord.salarygrade;
                                const stepIncrement = presentRecord.stepincrement;
                                
                                if (salaryGrade !== null && salaryGrade !== undefined && String(salaryGrade).trim() !== '') {
                                  const formattedSG = String(salaryGrade).padStart(2, '0');
                                  if (stepIncrement !== null && stepIncrement !== undefined && String(stepIncrement).trim() !== '') {
                                    const formattedStep = String(stepIncrement).padStart(2, '0');
                                    return <div className="text-xs text-gray-500">SG {formattedSG}-{formattedStep}</div>;
                                  }
                                  return <div className="text-xs text-gray-500">SG {formattedSG}</div>;
                                }
                                return null;
                              })()}
                            </div>
                          )}
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
                                      <td className="px-4 py-2 text-sm">
                                        <div>
                                          <div>{rec.position || '-'}</div>
                                          {(() => {
                                            const salaryGrade = rec.salarygrade;
                                            const stepIncrement = rec.stepincrement;
                                            
                                            if (salaryGrade !== null && salaryGrade !== undefined && String(salaryGrade).trim() !== '') {
                                              const formattedSG = String(salaryGrade).padStart(2, '0');
                                              if (stepIncrement !== null && stepIncrement !== undefined && String(stepIncrement).trim() !== '') {
                                                const formattedStep = String(stepIncrement).padStart(2, '0');
                                                return <div className="text-xs text-gray-500">SG {formattedSG}-{formattedStep}</div>;
                                              }
                                              return <div className="text-xs text-gray-500">SG {formattedSG}</div>;
                                            }
                                            return null;
                                          })()}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2 text-sm">{rec.departmentname || '-'}</td>
                                      <td className="px-4 py-2 text-sm">{rec.appointmentname || '-'}</td>
                                      <td className="px-4 py-2 text-sm">{
                                        (() => {
                                          // Get salary grade from plantilla (rec.salarygrade comes from plantilla table via JOIN)
                                          const salaryGrade = rec.salarygrade;
                                          
                                          // Debug log to check what we're getting
                                          if (rec.plantilla_id && !salaryGrade) {
                                            console.log('[Designation Grid] Missing salarygrade for plantilla:', {
                                              objid: rec.objid,
                                              plantilla_id: rec.plantilla_id,
                                              salarygrade: rec.salarygrade,
                                              record: rec
                                            });
                                          }
                                          
                                          if (salaryGrade !== null && salaryGrade !== undefined && String(salaryGrade).trim() !== '') {
                                            const incrementRaw = rec.stepincrement;
                                            const hasIncrement = incrementRaw !== null && incrementRaw !== undefined && String(incrementRaw).trim() !== '';
                                            if (!hasIncrement) {
                                              return String(salaryGrade).padStart(2, '0');
                                            }
                                            const paddedIncrement = String(incrementRaw).padStart(2, '0');
                                            return `${String(salaryGrade).padStart(2, '0')}-${paddedIncrement}`;
                                          }
                                          return '-';
                                        })()
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
                                          {can('201-designation', 'delete') && (
                                            <button
                                              type="button"
                                              title="Delete"
                                              aria-label="Delete"
                                              onClick={() => handleDelete(rec)}
                                              className="text-red-600 hover:text-red-900 p-1 rounded"
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination for Designations tab */}
          {totalRecords > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-700">Show:</label>
                    <select
                      value={recordsPerPage}
                      onChange={(e) => setRecordsPerPage(Number(e.target.value))}
                      className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-sm text-gray-700">entries</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * recordsPerPage) + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * recordsPerPage, totalRecords)}</span> of{' '}
                    <span className="font-medium">{totalRecords}</span> results
                  </div>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
          </>
        )
      ) : (
        <>
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
                  <td className="px-4 py-2 text-sm">
                    <div>
                      <div>{record.position || '-'}</div>
                      {(() => {
                        const salaryGrade = record.salarygrade;
                        const stepIncrement = record.stepincrement;
                        
                        if (salaryGrade !== null && salaryGrade !== undefined && String(salaryGrade).trim() !== '') {
                          const formattedSG = String(salaryGrade).padStart(2, '0');
                          if (stepIncrement !== null && stepIncrement !== undefined && String(stepIncrement).trim() !== '') {
                            const formattedStep = String(stepIncrement).padStart(2, '0');
                            return <div className="text-xs text-gray-500">SG {formattedSG}-{formattedStep}</div>;
                          }
                          return <div className="text-xs text-gray-500">SG {formattedSG}</div>;
                        }
                        return null;
                      })()}
                    </div>
                  </td>
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
                      {can('201-designation', 'delete') && (
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => handleDelete(record)}
                          className="text-red-600 hover:text-red-900 p-1 rounded"
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
          
          {/* Pagination for Designation Records tab */}
          {totalRecords > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-700">Show:</label>
                    <select
                      value={recordsPerPage}
                      onChange={(e) => setRecordsPerPage(Number(e.target.value))}
                      className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-sm text-gray-700">entries</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * recordsPerPage) + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * recordsPerPage, totalRecords)}</span> of{' '}
                    <span className="font-medium">{totalRecords}</span> results
                  </div>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
        </div>
          )}
        </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
            <div className="px-6 py-4 border-b">
              <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{viewMode ? 'View Designation' : (editing ? 'Edit Designation' : 'Add Designation')}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              {/* Employee information in header for edit/view mode */}
              {editing || viewMode ? (() => {
                const selectedEmp = employees.find(emp => emp.objid === formData.emp_objid);
                if (!selectedEmp) return null;
                return (
                  <div className="flex items-center space-x-3 pt-2 border-t">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                      {selectedEmp.photo_path ? (
                        <img 
                          src={selectedEmp.photo_path} 
                          alt="Employee" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-lg font-medium">
                          {selectedEmp.firstname?.charAt(0) || '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-semibold text-gray-900">
                        {formatEmployeeNameFromObject(selectedEmp)}
                      </div>
                      <div className="text-sm text-gray-600">
                        DTR User ID: {selectedEmp.dtruserid || '-'}
                      </div>
                    </div>
                  </div>
                );
              })() : null}
            </div>
            <div className="p-6 space-y-4">
              {/* Employee selector - only show in create mode */}
              {!editing && !viewMode && (
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
                      className="w-full px-3 py-2 border rounded"
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
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Row: Designation, Assigned Department, Appointment Status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                  <select value={formData.designationid} onChange={(e)=> setFormData(f=>({...f, designationid: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode}>
                    <option value="">Select</option>
                    {(ranks||[]).map(r => (<option key={r.rankid} value={r.rankid}>{r.rankname}</option>))}
                  </select>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Status</label>
                  <select 
                    value={formData.appointmentstatus} 
                    onChange={(e) => {
                      const appointmentId = e.target.value;
                      const selectedAppointment = appointments.find(a => String(a.id) === String(appointmentId));
                      const canLeave = selectedAppointment?.canleave === 1;
                      
                      // When switching appointment status:
                      // - If canleave=1: Clear salary/wage (they will be auto-calculated from plantilla)
                      // - If canleave=0: Clear salary/wage (they will be manual entry)
                      if (canLeave) {
                        // canleave=1: Plantilla enabled, salary/wage auto-calculated
                        setFormData(f => ({
                          ...f,
                          appointmentstatus: appointmentId,
                          salary: '',
                          dailywage: ''
                        }));
                      } else {
                        // canleave=0: Plantilla disabled, salary/wage manual entry
                        setFormData(f => ({
                          ...f,
                          appointmentstatus: appointmentId,
                          plantilla_id: '',
                          tranche_id: '',
                          stepincrement: '',
                          plantillano: '',
                          salarygrade: '',
                          salary: '',
                          dailywage: ''
                        }));
                        setSelectedPlantilla(null);
                        setPlantillaSearchQuery('');
                      }
                    }} 
                    className="w-full px-3 py-2 border rounded" 
                    disabled={viewMode}
                  >
                    <option value="">Select</option>
                    {(appointments||[]).map(a => (<option key={a.id} value={a.id}>{a.appointmentname}</option>))}
                  </select>
                </div>
              </div>

              {/* Appointment Date and Appointment Date End - Inline */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                  <input type="date" value={formData.appointmentdate} onChange={(e)=> setFormData(f=>({...f, appointmentdate: e.target.value}))} className="w-full px-3 py-2 border rounded" disabled={viewMode} />
                </div>
                {(() => {
                  const selectedAppointment = appointments.find(a => String(a.id) === String(formData.appointmentstatus));
                  const hasExpiry = selectedAppointment?.has_expiry === 1;
                  
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Appointment Date End
                        {selectedAppointment && !hasExpiry && (
                          <span className="text-xs text-gray-500 ml-2">(Not applicable)</span>
                        )}
                      </label>
                      <input 
                        type="date" 
                        value={formData.appointmentdate_end} 
                        onChange={(e)=> setFormData(f=>({...f, appointmentdate_end: e.target.value}))} 
                        className="w-full px-3 py-2 border rounded disabled:bg-gray-100 disabled:cursor-not-allowed" 
                        disabled={viewMode || !hasExpiry}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Plantilla Section */}
              {(() => {
                const selectedAppointment = appointments.find(a => String(a.id) === String(formData.appointmentstatus));
                const canLeave = selectedAppointment?.canleave === 1;
                
                // Show Plantilla section with conditional field states
                return (
                  <div className="space-y-4">
                    <div className="border-t pt-4">
                        {/* First Row: Search Plantilla, Position Title */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Search Plantilla</label>
                            <div className="relative">
                              <input
                                type="text"
                                value={plantillaSearchQuery}
                                onChange={(e) => {
                                  setPlantillaSearchQuery(e.target.value);
                                  if (!e.target.value) {
                                    setFormData(f => ({ ...f, plantilla_id: '' }));
                                    setSelectedPlantilla(null);
                                  }
                                }}
                                placeholder="Search plantilla by position title..."
                                className={`w-full px-3 py-2 border rounded ${!canLeave ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                disabled={!canLeave || viewMode}
                              />
                              {(() => {
                                // Debug logging
                                const shouldShow = plantillaSearchQuery && !formData.plantilla_id && canLeave;
                                const filteredPlantillas = plantillas.filter(p => {
                                  const searchLower = plantillaSearchQuery.toLowerCase();
                                  const positionTitle = (p.position_title || '').toLowerCase();
                                  const positionShortName = (p.position_shortname || '').toLowerCase();
                                  const plantillaNo = (p.plantilla_no || '').toLowerCase();
                                  return positionTitle.includes(searchLower) || 
                                         positionShortName.includes(searchLower) ||
                                         plantillaNo.includes(searchLower);
                                });
                                
                                console.log('[Plantilla Search] Dropdown state:', {
                                  plantillaSearchQuery,
                                  hasPlantillaId: !!formData.plantilla_id,
                                  canLeave,
                                  shouldShow,
                                  plantillasCount: plantillas.length,
                                  filteredCount: filteredPlantillas.length,
                                  samplePlantilla: plantillas[0],
                                  firstFiltered: filteredPlantillas[0]
                                });
                                
                                if (!shouldShow) {
                                  console.log('[Plantilla Search] Dropdown not showing because:', {
                                    hasQuery: !!plantillaSearchQuery,
                                    hasPlantillaId: !!formData.plantilla_id,
                                    canLeave,
                                    viewMode
                                  });
                                  return null;
                                }
                                
                                return (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {plantillas.length === 0 ? (
                                      <div className="px-3 py-2 text-sm text-gray-500">No plantillas available</div>
                                    ) : filteredPlantillas.length === 0 ? (
                                      <div className="px-3 py-2 text-sm text-gray-500">No plantillas found matching "{plantillaSearchQuery}"</div>
                                    ) : (
                                      filteredPlantillas
                                        .slice(0, 10)
                                        .map(p => {
                                          const plantillaNo = p.plantilla_no || '';
                                          const positionTitle = p.position_title || '';
                                          const salaryGrade = p.salarygrade ? String(p.salarygrade).padStart(2, '0') : '';
                                          const mainLine = positionTitle || `Plantilla ${p.id}`;
                                          const displayName = mainLine;
                                          
                                          // Check if plantilla is vacant
                                          const isVacant = p.isvacant === 1 || p.isvacant === '1';
                                          
                                          // Format assigned employee name if not vacant
                                          const assignedEmployeeName = !isVacant && p.assigned_employee_surname
                                            ? formatEmployeeName(
                                                p.assigned_employee_surname,
                                                p.assigned_employee_firstname,
                                                p.assigned_employee_middlename,
                                                p.assigned_employee_extension
                                              )
                                            : null;
                                          
                                          // Build sub line: "No. {plantilla_no} - SG{salarygrade} - {department_shortname}"
                                          const subLineParts = [];
                                          if (plantillaNo) {
                                            subLineParts.push(`No. ${plantillaNo}`);
                                          }
                                          if (salaryGrade) {
                                            subLineParts.push(`SG${salaryGrade}`);
                                          }
                                          if (p.department_shortname) {
                                            subLineParts.push(p.department_shortname);
                                          }
                                          const subLine = subLineParts.join(' - ');
                                          
                                          // Tooltip text for non-vacant plantillas
                                          const tooltipText = !isVacant && assignedEmployeeName
                                            ? `This plantilla is not vacant. Currently assigned to: ${assignedEmployeeName}`
                                            : null;
                                          
                                          return (
                                            <div
                                              key={p.id}
                                              onClick={async () => {
                                                // Prevent selection if not vacant
                                                if (!isVacant) {
                                                  return;
                                                }
                                                
                                                setSelectedPlantilla(p);
                                                setFormData(f => ({
                                                  ...f,
                                                  plantilla_id: String(p.id),
                                                  plantillano: p.plantilla_no || '',
                                                  salarygrade: p.salarygrade || '',
                                                  position: p.position_title || ''
                                                }));
                                                setPlantillaSearchQuery(displayName);
                                                
                                                // Trigger rate lookup if tranche and step increment are already selected (only when canLeave is true)
                                                if (canLeave && formData.tranche_id && formData.stepincrement && p.salarygrade) {
                                                  const rate = await fetchRate(formData.tranche_id, p.salarygrade, formData.stepincrement);
                                                  if (rate) {
                                                    const dailyWageDays = p.dailywagesdays || 22;
                                                    const calculatedSalary = rate.rate && rate.tranche_percent ? (rate.rate * (rate.tranche_percent / 100)) : null;
                                                    setFormData(f => ({
                                                      ...f,
                                                      salary: calculatedSalary ? String(calculatedSalary.toFixed(2)) : '',
                                                      dailywage: calculatedSalary ? String((calculatedSalary / dailyWageDays).toFixed(2)) : ''
                                                    }));
                                                  }
                                                }
                                              }}
                                              className={`px-3 py-2 border-b border-gray-100 last:border-b-0 ${
                                                isVacant 
                                                  ? 'hover:bg-gray-100 cursor-pointer' 
                                                  : 'cursor-not-allowed opacity-60'
                                              }`}
                                              title={tooltipText || undefined}
                                            >
                                              <div className={`text-sm font-medium ${isVacant ? 'text-gray-900' : 'text-gray-400'}`}>
                                                {mainLine}
                                              </div>
                                              {subLine && (
                                                <div className={`text-xs ${isVacant ? 'text-gray-500' : 'text-gray-400'}`}>
                                                  {subLine}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                    )}
                                  </div>
                                );
                              })()}
              </div>
                          </div>
                <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Position Title</label>
                            <input 
                              type="text" 
                              value={formData.position || (selectedPlantilla ? (selectedPlantilla.position_title || '') : '')} 
                              onChange={(e) => setFormData(f => ({ ...f, position: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded ${!canLeave ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              readOnly={!canLeave}
                              disabled={!canLeave || viewMode}
                            />
                </div>
                        </div>
                        {/* Second Row: Select Tranches, SG, Select Step Increment */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Tranches</label>
                  <select
                              value={formData.tranche_id || ''}
                              onChange={async (e) => {
                                const trancheId = e.target.value;
                                setFormData(f => ({ ...f, tranche_id: trancheId }));
                                
                                // Trigger rate lookup if plantilla and step increment are already selected (only when canLeave is true)
                                if (canLeave && trancheId && selectedPlantilla && formData.stepincrement && selectedPlantilla.salarygrade) {
                                  const rate = await fetchRate(trancheId, selectedPlantilla.salarygrade, formData.stepincrement);
                                  if (rate) {
                                    const dailyWageDays = selectedPlantilla.dailywagesdays || 22;
                                    const calculatedSalary = rate.rate && rate.tranche_percent ? (rate.rate * (rate.tranche_percent / 100)) : null;
                                    setFormData(f => ({
                                      ...f,
                                      salary: calculatedSalary ? String(calculatedSalary.toFixed(2)) : '',
                                      dailywage: calculatedSalary ? String((calculatedSalary / dailyWageDays).toFixed(2)) : ''
                                    }));
                                  }
                                }
                              }}
                              className={`w-full px-3 py-2 border rounded ${!canLeave ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              disabled={!canLeave || viewMode}
                  >
                              <option value="">Select Tranche</option>
                              {tranches.map((t) => (
                                <option key={t.tranche_id} value={t.tranche_id}>
                                  {t.implement_year ? `${t.implement_year} - ${t.tranche}` : t.tranche}
                                </option>
                    ))}
                  </select>
                </div>
                <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">SG</label>
                            <input 
                              type="text" 
                              value={formData.salarygrade ? formData.salarygrade : ''} 
                              className={`w-full px-3 py-2 border rounded bg-gray-100`}
                              readOnly 
                              disabled={!canLeave || viewMode}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Step Increment</label>
                            <select
                              value={formData.stepincrement || ''}
                              onChange={async (e) => {
                                const stepIncrement = e.target.value;
                                setFormData(f => ({ ...f, stepincrement: stepIncrement }));
                                
                                // Trigger rate lookup if plantilla and tranche are already selected (only when canLeave is true)
                                if (canLeave && stepIncrement && selectedPlantilla && formData.tranche_id && selectedPlantilla.salarygrade) {
                                  const rate = await fetchRate(formData.tranche_id, selectedPlantilla.salarygrade, stepIncrement);
                                  if (rate) {
                                    const dailyWageDays = selectedPlantilla.dailywagesdays || 22;
                                    const calculatedSalary = rate.rate && rate.tranche_percent ? (rate.rate * (rate.tranche_percent / 100)) : null;
                                    setFormData(f => ({
                                      ...f,
                                      salary: calculatedSalary ? String(calculatedSalary.toFixed(2)) : '',
                                      dailywage: calculatedSalary ? String((calculatedSalary / dailyWageDays).toFixed(2)) : ''
                                    }));
                                  }
                                }
                              }}
                              className={`w-full px-3 py-2 border rounded ${!canLeave ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              disabled={!canLeave || viewMode}
                            >
                              <option value="">Select Step</option>
                              {Array.from({ length: 8 }, (_, i) => String(i + 1).padStart(2, '0')).map(step => (
                      <option key={step} value={step}>{step}</option>
                    ))}
                  </select>
                </div>
                        </div>
                        {/* Third Row: Plantilla No, Salary, Daily Wage */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla No.</label>
                            <input 
                              type="text" 
                              value={formData.plantillano} 
                              className={`w-full px-3 py-2 border rounded bg-gray-100 cursor-not-allowed`}
                              readOnly 
                              disabled={true}
                            />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salary</label>
                            <input 
                              type="number" 
                              step="0.01" 
                              value={formData.salary ? (parseFloat(formData.salary).toFixed(2)) : ''} 
                              onChange={(e) => setFormData(f => ({ ...f, salary: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded ${!canLeave ? '' : 'bg-gray-100 cursor-not-allowed'}`}
                              readOnly={canLeave}
                              disabled={canLeave || viewMode}
                            />
                </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Daily Wage</label>
                            <input 
                              type="number" 
                              step="0.01" 
                              value={formData.dailywage ? (parseFloat(formData.dailywage).toFixed(2)) : ''} 
                              onChange={(e) => setFormData(f => ({ ...f, dailywage: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded ${!canLeave ? '' : 'bg-gray-100 cursor-not-allowed'}`}
                              readOnly={canLeave}
                              disabled={canLeave || viewMode}
                            />
              </div>
                        </div>
                      </div>
                    </div>
                  );
              })()}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <div className="border rounded">
                  <QuillEditor
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
                    
                    // Check if appointment has canleave=1
                    const selectedAppointment = appointments.find(a => String(a.id) === String(formData.appointmentstatus));
                    const canLeave = selectedAppointment?.canleave === 1;
                    
                    const basePayload = {
                      emp_objid: formData.emp_objid,
                      rankid: formData.designationid,
                      position: formData.position,
                      appointmentid: formData.appointmentstatus ? parseInt(formData.appointmentstatus, 10) : null,
                      appointmentdate: formData.appointmentdate || null,
                      appointmentdate_end: formData.appointmentdate_end || null,
                      assigneddept: formData.assigneddept || null,
                      jobdescription: formData.jobdescription || null
                    };
                    
                    // Build payload based on canleave
                    let payload;
                    
                    // Ensure plantilla_id is properly converted (handle empty strings)
                    // Use selectedPlantilla.id as fallback if formData.plantilla_id is empty
                    let plantillaIdValue = null;
                    if (formData.plantilla_id && String(formData.plantilla_id).trim() !== '') {
                      const parsed = parseInt(String(formData.plantilla_id), 10);
                      plantillaIdValue = isNaN(parsed) ? null : parsed;
                    } else if (selectedPlantilla && selectedPlantilla.id) {
                      // Fallback to selectedPlantilla if formData is empty but plantilla is selected
                      const parsed = parseInt(String(selectedPlantilla.id), 10);
                      plantillaIdValue = isNaN(parsed) ? null : parsed;
                    }
                    
                    if (canLeave) {
                      // For canleave=1: Plantilla enabled, salary/dailywage auto-calculated from plantilla rates
                      payload = {
                        ...basePayload,
                        plantillano: formData.plantillano || null,
                        plantilla_id: plantillaIdValue,
                        tranche_id: formData.tranche_id ? parseInt(formData.tranche_id, 10) : null,
                        stepincrement: formData.stepincrement || null, // Keep as string (char(2) format)
                        dailywage: formData.dailywage === '' || formData.dailywage == null ? null : parseFloat(formData.dailywage),
                        salary: formData.salary === '' || formData.salary == null ? null : parseFloat(formData.salary)
                      };
                    } else {
                      // For canleave=0: Plantilla disabled, salary/dailywage manual entry
                      payload = {
                        ...basePayload,
                        dailywage: formData.dailywage === '' || formData.dailywage == null ? null : parseFloat(formData.dailywage),
                        salary: formData.salary === '' || formData.salary == null ? null : parseFloat(formData.salary),
                        // Don't include plantilla fields for canleave=0
                        plantilla_id: null,
                        tranche_id: null,
                        stepincrement: null,
                        plantillano: null
                      };
                    }
                    
                    console.log('[Designation Save] Plantilla data:', {
                      formDataPlantillaId: formData.plantilla_id,
                      selectedPlantillaId: selectedPlantilla?.id,
                      plantillaIdValue,
                      editing: editing?.objid,
                      isCreate: !editing,
                      canLeave: canLeave
                    });
                    
                    console.log('[Designation Save] Full payload:', payload);
                    
                    try {
                      if (editing) {
                        console.log('[Designation Save] Updating designation:', editing.objid, 'with plantilla_id:', payload.plantilla_id);
                        await api.put(`/employee-designations/${editing.objid}`, payload);
                      } else {
                        await api.post('/employee-designations', payload);
                      }
                      setShowModal(false);
                      setCurrentPage(1);
                      fetchList('all', null, 1);
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


