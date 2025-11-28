import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';
import { formatEmployeeName } from '../../utils/employeenameFormatter';
import { getPhotoUrl } from '../../utils/urls';

// Helper function to get employee photo URL
const getEmployeePhotoUrl = (photoPath) => {
  if (!photoPath) return null;
  // If already a base64 data URL (from API), use it directly
  if (photoPath.startsWith('data:image')) {
    return photoPath;
  }
  // Otherwise, convert file path to URL
  return getPhotoUrl(photoPath);
};

const formatDate = (date) => {
  if (!date) return '';
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return '';
};

const formatDateTimeLocal = (dateTime) => {
  if (!dateTime) return '';
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Helper function to extract hour and minute from datetime
// Extract hour and minute from datetime string or time string (HH:MM:SS or HH:MM)
const extractHourMinute = (dateTimeOrTime) => {
  if (!dateTimeOrTime) return { hour: '', minute: '' };
  
  const str = String(dateTimeOrTime);
  
  // Try to extract from time string format first (HH:MM:SS or HH:MM)
  const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    return {
      hour: String(parseInt(timeMatch[1], 10)).padStart(2, '0'),
      minute: timeMatch[2]
    };
  }
  
  // Fallback: Try to parse as Date object (for legacy datetime strings)
  const d = new Date(dateTimeOrTime);
  if (!Number.isNaN(d.getTime())) {
    return {
      hour: String(d.getHours()).padStart(2, '0'),
      minute: String(d.getMinutes()).padStart(2, '0')
    };
  }
  
  return { hour: '', minute: '' };
};

// Helper function to combine hours and minutes into time string (HH:mm)
const combineHourMinute = (hour, minute) => {
  if (!hour || !minute) return '';
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${h}:${m}`;
};

// Helper function to combine date and time into datetime string
const combineDateAndTime = (date, hour, minute) => {
  if (!date || !hour || !minute) return '';
  const time = combineHourMinute(hour, minute);
  return `${date}T${time}:00`;
};

// Helper function to build employee info with search key (similar to CDO modal)
const buildEmployeeInfo = (employee) => {
  if (!employee) return null;
  const objid = String(
    employee.objid ||
    employee.OBJID ||
    employee.emp_objid ||
    employee.EMP_OBJID ||
    ''
  ).trim();
  const badge = String(
    employee.badge ||
    employee.badgenumber ||
    employee.BADGENUMBER ||
    employee.badge_number ||
    ''
  ).trim();
  const surname = (employee.surname || employee.SURNAME || employee.lastName || '').trim();
  const firstname = (employee.firstname || employee.FIRSTNAME || employee.firstName || '').trim();
  const middlename = (employee.middlename || employee.MIDDLENAME || employee.middleName || '').trim();
  const extension = (employee.extension || employee.EXTENSION || employee.nameExtension || '').trim();

  const hasFullName = surname && firstname;
  const displayName = hasFullName
    ? formatEmployeeName(surname, firstname, middlename, extension)
    : (employee.name || employee.NAME || employee.fullname || employee.FULLNAME || '').trim();
  const fallbackName = displayName || surname || firstname || objid || badge || 'Employee';

  const photo =
    employee.photo ||
    employee.photo_path ||
    employee.PHOTO ||
    employee.PHOTO_PATH ||
    employee.profilephoto ||
    '';

  // Build search key from all searchable fields
  const searchKeyParts = [
    surname,
    firstname,
    middlename,
    extension,
    badge,
    objid,
    employee.fullname || employee.FULLNAME || '',
    employee.name || employee.NAME || '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return {
    objid,
    badge,
    name: fallbackName,
    photo_path: photo,
    searchKey: searchKeyParts,
  };
};

const DTROTModal = ({ isOpen, onClose, transaction, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [otTypes, setOtTypes] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState([]); // Changed to array for multi-select
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  
  const [formData, setFormData] = useState({
    otdateissued: formatDate(new Date()),
    ottype: '',
    otdetails: '',
    ottimefrom_hour: '',
    ottimefrom_minute: '',
    ottimeto_hour: '',
    ottimeto_minute: '',
  });
  
  const [otDates, setOtDates] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchOtTypes();
      if (transaction) {
        loadTransactionData();
      } else {
        resetForm();
      }
    }
  }, [isOpen, transaction]);

  const fetchOtTypes = async () => {
    try {
      console.log('[OT Modal] Fetching OT types...');
      const response = await api.get('/dtr/employee-ot/types');
      console.log('[OT Modal] OT types response:', response.data);
      const types = response.data.data || [];
      console.log(`[OT Modal] Loaded ${types.length} OT types`);
      if (types.length > 0) {
        console.log('[OT Modal] Sample OT type:', types[0]);
      }
      setOtTypes(types);
    } catch (error) {
      console.error('❌ [OT Modal] Error fetching OT types:', error);
      console.error('❌ [OT Modal] Error response:', error.response?.data);
      setOtTypes([]);
    }
  };

  const loadTransactionData = async () => {
    if (!transaction) return;
    try {
      const response = await api.get(`/dtr/employee-ot/transactions/${transaction.otid}`);
      const data = response.data.data;
      
          const timeFrom = extractHourMinute(data.ottimefrom);
          const timeTo = extractHourMinute(data.ottimeto);
          
          setFormData({
            otdateissued: formatDate(data.otdateissued),
            ottype: data.ottype || '',
            otdetails: data.otdetails || '',
            ottimefrom_hour: timeFrom.hour,
            ottimefrom_minute: timeFrom.minute,
            ottimeto_hour: timeTo.hour,
            ottimeto_minute: timeTo.minute,
          });

      // Load employee info - get unique employees from OT dates
      const uniqueEmpObjIds = new Set();
      if (data.otDates && Array.isArray(data.otDates)) {
        data.otDates.forEach(date => {
          if (date.emp_objid) uniqueEmpObjIds.add(date.emp_objid);
        });
      }
      if (data.emp_objid && uniqueEmpObjIds.size === 0) {
        uniqueEmpObjIds.add(data.emp_objid);
      }

      // Load all unique employees
      const loadedEmployees = [];
      for (const empObjId of uniqueEmpObjIds) {
        try {
          const empResponse = await api.get(`/201-employees/${empObjId}`);
          const emp = empResponse.data.data;
          if (emp) {
            const empInfo = buildEmployeeInfo(emp);
            if (empInfo) {
              loadedEmployees.push({
                objid: empInfo.objid,
                name: empInfo.name,
                photo_path: empInfo.photo_path,
              });
            }
          }
        } catch (err) {
          console.warn('Error loading employee:', empObjId, err);
        }
      }
      setSelectedEmployees(loadedEmployees);

      // Load OT dates - get unique dates (since all employees get the same dates)
      if (data.otDates && Array.isArray(data.otDates)) {
        // Get unique dates by otdate (since dates are shared across all employees)
        const uniqueDatesMap = new Map();
        data.otDates.forEach((date) => {
          const dateKey = formatDate(date.otdate);
          if (dateKey && !uniqueDatesMap.has(dateKey)) {
            uniqueDatesMap.set(dateKey, {
              id: date.id,
              otdate: dateKey,
              ottype: date.ottype || data.ottype || '',
            });
          }
        });
        setOtDates(Array.from(uniqueDatesMap.values()));
      } else {
        setOtDates([]);
      }
    } catch (error) {
      console.error('Error loading transaction data:', error);
      alert('Failed to load transaction data');
    }
  };

  const resetForm = () => {
      setFormData({
        otdateissued: formatDate(new Date()),
        ottype: '',
        otdetails: '',
        ottimefrom_hour: '',
        ottimefrom_minute: '',
        ottimeto_hour: '',
        ottimeto_minute: '',
      });
    setOtDates([]);
    setSelectedEmployees([]);
    setEmployeeSearch('');
  };

  const fetchEmployees = async () => {
    if (loadingEmployees) return;
    setLoadingEmployees(true);
    try {
      const response = await api.get('/201-employees');
      const rawList =
        (Array.isArray(response.data?.data) && response.data.data) ||
        (Array.isArray(response.data?.rows) && response.data.rows) ||
        (Array.isArray(response.data?.result) && response.data.result) ||
        (Array.isArray(response.data) && response.data) ||
        [];

      const normalizedEmployees = rawList
        .map((item) => {
          const info = buildEmployeeInfo(item);
          if (!info) return null;
          return { ...info, raw: item };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      setEmployees(normalizedEmployees);
      setEmployeesLoaded(true);
    } catch (error) {
      console.error('Failed to load employees:', error);
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Client-side filtering of employees (similar to CDO modal)
  const filteredEmployees = useMemo(() => {
    const list = Array.isArray(employees) ? employees : [];
    
    // First filter out already selected employees
    const availableEmployees = list.filter(
      emp => !selectedEmployees.some(selected => selected.objid === emp.objid)
    );
    
    // Then filter by search term if provided
    if (!employeeSearch) {
      return availableEmployees.slice(0, 10);
    }
    const term = employeeSearch.toLowerCase().trim();
    if (!term) {
      return availableEmployees.slice(0, 10);
    }
    return availableEmployees.filter((employee) => employee.searchKey?.includes(term)).slice(0, 10);
  }, [employeeSearch, employees, selectedEmployees]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.employee-dropdown-container')) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEmployeeSelect = (employee) => {
    // Add employee if not already selected
    if (!selectedEmployees.some(emp => emp.objid === employee.objid)) {
      setSelectedEmployees([...selectedEmployees, {
        objid: employee.objid,
        name: employee.name,
        photo_path: employee.photo_path || null,
      }]);
    }
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
  };

  const handleEmployeeRemove = (empObjId) => {
    setSelectedEmployees(selectedEmployees.filter(emp => emp.objid !== empObjId));
  };

  const addOtDate = () => {
    // Add a single date entry (not employee-specific)
    // This date will be applied to all selected employees when saving
    setOtDates([
      ...otDates,
      {
        otdate: '',
        ottype: formData.ottype || '',
      },
    ]);
  };

  const removeOtDate = (index) => {
    setOtDates(otDates.filter((_, i) => i !== index));
  };

  const updateOtDate = (index, field, value) => {
    const updated = [...otDates];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-fill OT type if main OT type is selected
    if (field === 'otdate' && formData.ottype && !updated[index].ottype) {
      updated[index].ottype = formData.ottype;
    }
    setOtDates(updated);
  };

  // Auto-update OT dates when main OT type changes
  useEffect(() => {
    if (formData.ottype && otDates.length > 0) {
      setOtDates(
        otDates.map((date) => ({
          ...date,
          ottype: date.ottype || formData.ottype,
        }))
      );
    }
  }, [formData.ottype]);

  // Auto-populate hidden OT type field from first OT date's type
  useEffect(() => {
    if (!formData.ottype && otDates.length > 0) {
      const firstDateWithType = otDates.find(date => date.ottype);
      if (firstDateWithType && firstDateWithType.ottype) {
        setFormData(prev => ({ ...prev, ottype: firstDateWithType.ottype }));
      }
    }
  }, [otDates]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all required fields
    if (selectedEmployees.length === 0) {
      alert('Please select at least one employee.');
      return;
    }

    if (!formData.otdateissued || !formData.otdateissued.trim()) {
      alert('Please enter Date Issued.');
      return;
    }

    if (!formData.otdetails || !formData.otdetails.trim()) {
      alert('Please enter details of the overtime service.');
      return;
    }

    if (!formData.ottimefrom_hour || !formData.ottimefrom_minute) {
      alert('Please enter Allowed Overtime Time From (both hour and minute).');
      return;
    }

    if (!formData.ottimeto_hour || !formData.ottimeto_minute) {
      alert('Please enter Allowed Overtime Time To (both hour and minute).');
      return;
    }

    // Validate OT dates - check for dates with values (not employee-specific yet)
    const validDates = otDates.filter((date) => date.otdate && date.otdate.trim() !== '');
    if (validDates.length === 0) {
      alert('Please add at least one OT date.');
      return;
    }

    // Validate that each OT date has an OT type
    const datesWithoutType = validDates.filter((date) => !date.ottype);
    if (datesWithoutType.length > 0) {
      alert('Please ensure all OT dates have an OT type selected.');
      return;
    }

    setLoading(true);
    try {
      // Combine hour and minute into time string (HH:MM:SS format) - database now uses TIME datatype
      const ottimefrom = combineHourMinute(formData.ottimefrom_hour, formData.ottimefrom_minute) + ':00';
      const ottimeto = combineHourMinute(formData.ottimeto_hour, formData.ottimeto_minute) + ':00';

      // Create date entries for each selected employee × each date combination
      const allOtDates = [];
      selectedEmployees.forEach(employee => {
        validDates.forEach(date => {
          allOtDates.push({
            otdate: date.otdate,
            ottype: date.ottype, // OT type is required per date
            emp_objid: employee.objid, // Assign date to this employee
          });
        });
      });

      const payload = {
        emp_objid: selectedEmployees[0]?.objid || '', // Backend requires this for validation and notifications
        otdetails: formData.otdetails,
        otdateissued: formData.otdateissued,
        ottimefrom: ottimefrom, // Time string in HH:MM:SS format
        ottimeto: ottimeto, // Time string in HH:MM:SS format
        otDates: allOtDates, // All employee × date combinations
      };

      console.log('[OT Modal] Submitting payload:', {
        isEdit: !!transaction,
        otid: transaction?.otid,
        payload: {
          ...payload,
          otDates: payload.otDates.map(d => ({
            otdate: d.otdate,
            ottype: d.ottype,
            emp_objid: d.emp_objid,
          })),
        },
      });

      if (transaction) {
        await api.put(`/dtr/employee-ot/transactions/${transaction.otid}`, payload);
        alert('OT transaction updated successfully');
      } else {
        await api.post('/dtr/employee-ot/transactions', payload);
        alert(`OT transaction created with ${selectedEmployees.length} employee(s)`);
      }
      
      onClose();
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving OT transaction:', error);
      alert(error.response?.data?.message || 'Failed to save OT transaction');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 my-8">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">
            {transaction ? 'Edit OT Transaction' : 'New OT Transaction'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* 1. Employee Selection and Date Issued - Single Line */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Employees * (Select multiple)
                </label>
                
                <div className="relative employee-dropdown-container">
                  <input
                    type="text"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                    placeholder="Search employee to add..."
                    value={employeeSearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEmployeeSearch(value);
                      setShowEmployeeDropdown(true);
                      if (!employeesLoaded) {
                        fetchEmployees();
                      }
                    }}
                    onFocus={() => {
                      setShowEmployeeDropdown(true);
                      if (!employeesLoaded) {
                        fetchEmployees();
                      }
                    }}
                  />
                  {showEmployeeDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {loadingEmployees ? (
                        <div className="px-4 py-3 text-sm text-gray-500">Loading employees...</div>
                      ) : filteredEmployees.length > 0 ? (
                        filteredEmployees.map((emp) => (
                          <button
                            key={emp.objid}
                            type="button"
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3"
                            onClick={() => handleEmployeeSelect(emp)}
                          >
                            {(() => {
                              const photoUrl = getEmployeePhotoUrl(emp.photo_path);
                              return (
                                <>
                                  {photoUrl ? (
                                    <img
                                      src={photoUrl}
                                      alt={emp.name}
                                      className="w-8 h-8 rounded-full object-cover"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                      }}
                                    />
                                  ) : null}
                                  <div 
                                    className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs"
                                    style={{ display: photoUrl ? 'none' : 'flex' }}
                                  >
                                    {emp.name
                                      .split(' ')
                                      .map((n) => n[0])
                                      .join('')
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </div>
                                </>
                              );
                            })()}
                            <span>{emp.name}</span>
                          </button>
                        ))
                      ) : employeeSearch.trim().length >= 2 ? (
                        <div className="px-4 py-3 text-center text-sm text-gray-500">
                          No employees found or all employees already selected
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Selected Employees Chips - Below search control */}
                {selectedEmployees.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedEmployees.map((emp) => (
                      <div
                        key={emp.objid}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {(() => {
                          const photoUrl = getEmployeePhotoUrl(emp.photo_path);
                          return (
                            <>
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt={emp.name}
                                  className="w-6 h-6 rounded-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div 
                                className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs"
                                style={{ display: photoUrl ? 'none' : 'flex' }}
                              >
                                {emp.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                            </>
                          );
                        })()}
                        <span>{emp.name}</span>
                        <button
                          type="button"
                          onClick={() => handleEmployeeRemove(emp.objid)}
                          className="text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Issued *
                </label>
                <input
                  type="date"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                  value={formData.otdateissued}
                  onChange={(e) => setFormData({ ...formData, otdateissued: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Hidden OT Type field - validated in JavaScript, not HTML5 required since it's hidden */}
            <div className="hidden">
              <select
                value={formData.ottype}
                onChange={(e) => setFormData({ ...formData, ottype: e.target.value })}
              >
                <option value="">Select OT Type</option>
                {otTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.typename || type.name || `Type ${type.id}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Details of the Overtime Service */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Details of the Overtime Service *
              </label>
              <textarea
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                rows={3}
                value={formData.otdetails}
                onChange={(e) => setFormData({ ...formData, otdetails: e.target.value })}
                placeholder="Enter details of the overtime service..."
                required
              />
            </div>

            {/* 5. Allowed Overtime Time From - To Time To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Allowed Overtime Time From *
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Hour (HH)</label>
                    <select
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                      value={formData.ottimefrom_hour}
                      onChange={(e) => setFormData({ ...formData, ottimefrom_hour: e.target.value })}
                      required
                    >
                      <option value="">HH</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={String(i).padStart(2, '0')}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-500 mt-6">:</span>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Minute (MM)</label>
                    <select
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                      value={formData.ottimefrom_minute}
                      onChange={(e) => setFormData({ ...formData, ottimefrom_minute: e.target.value })}
                      required
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={String(i).padStart(2, '0')}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Allowed Overtime Time To *
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Hour (HH)</label>
                    <select
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                      value={formData.ottimeto_hour}
                      onChange={(e) => setFormData({ ...formData, ottimeto_hour: e.target.value })}
                      required
                    >
                      <option value="">HH</option>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={String(i).padStart(2, '0')}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-gray-500 mt-6">:</span>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Minute (MM)</label>
                    <select
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                      value={formData.ottimeto_minute}
                      onChange={(e) => setFormData({ ...formData, ottimeto_minute: e.target.value })}
                      required
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={String(i).padStart(2, '0')}>
                          {String(i).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Add OT Date Button and Grid Table */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    OT Dates *
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedEmployees.length > 0 
                      ? `Dates will be applied to all selected employees (${selectedEmployees.length} employee${selectedEmployees.length !== 1 ? 's' : ''})`
                      : 'Select employees first, then add dates that will apply to all of them'
                    }
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addOtDate}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={selectedEmployees.length === 0}
                  title={selectedEmployees.length === 0 ? 'Please select employees first' : ''}
                >
                  + Add OT Date
                </button>
              </div>

              {/* Grid Table Display */}
              {otDates.length > 0 ? (
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date *
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          OT Type
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {otDates.map((date, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="date"
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1 px-2 text-sm"
                              value={date.otdate}
                              onChange={(e) => {
                                updateOtDate(index, 'otdate', e.target.value);
                                // Auto-fill OT type if main OT type is selected
                                if (formData.ottype && !date.ottype) {
                                  updateOtDate(index, 'ottype', formData.ottype);
                                }
                              }}
                              required
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <select
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1 px-2 text-sm"
                              value={date.ottype || formData.ottype || ''}
                              onChange={(e) => updateOtDate(index, 'ottype', e.target.value)}
                            >
                              <option value="">Select OT Type</option>
                              {otTypes.map((type) => (
                                <option key={type.id} value={type.id}>
                                  {type.typename || type.name || `Type ${type.id}`}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => removeOtDate(index)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 border border-gray-300 rounded-md">
                  No OT dates added. Click "Add OT Date" to add dates.
                </div>
              )}
            </div>

          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              disabled={loading}
            >
              {loading ? 'Saving...' : transaction ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DTROTModal;
