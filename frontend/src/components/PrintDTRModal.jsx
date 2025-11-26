import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';

const emptyFormState = {
  USERID: '',
  CHECKTIME: '',
  CHECKTYPE: 'I',
  VERIFYCODE: 1,
  SENSORID: '',
  WORKCODE: 0,
  SN: ''
};

const encodeCheckTime = (value = '') => encodeURIComponent(value.replace(/ /g, '_'));
const todayISO = () => new Date().toISOString().substring(0, 10);

const getDateTimeParts = (checkTime = '') => {
  if (!checkTime) {
    return { datePart: '-', timePart: '-' };
  }

  let normalized = checkTime;
  if (normalized.includes('T')) {
    normalized = normalized.replace('T', ' ');
  }

  const segments = normalized.trim().split(' ').filter(Boolean);
  let datePart = '-';
  let timePart = '-';

  if (segments.length >= 2) {
    [datePart, timePart] = segments;
  } else if (segments.length === 1) {
    if (segments[0].includes(':')) {
      timePart = segments[0];
    } else {
      datePart = segments[0];
    }
  }

  return { datePart, timePart };
};

const parseTimeSegments = (timePart = '') => {
  if (!timePart || timePart === '-') {
    return { hour: '00', minute: '00' };
  }
  const [hour = '00', minute = '00'] = timePart.split(':');
  return {
    hour: hour.padStart(2, '0'),
    minute: minute.padStart(2, '0')
  };
};

const getRandomSecond = () => String(Math.floor(Math.random() * 60)).padStart(2, '0');

const PrintDTRModal = ({ isOpen = true, onClose, embedded = false }) => {
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState(emptyFormState);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [dateInput, setDateInput] = useState(todayISO());
  const [hourInput, setHourInput] = useState('00');
  const [minuteInput, setMinuteInput] = useState('00');
  const [machineOptions, setMachineOptions] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0
  });

  const shouldRender = embedded || isOpen;
  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, idx) => String(idx).padStart(2, '0')), []);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0')), []);

  useEffect(() => {
    if (!employeeSearch.trim()) {
      setEmployees([]);
      return;
    }

    const handler = setTimeout(async () => {
      try {
        const response = await api.get('/print-dtr-modal/employees', {
          params: { search: employeeSearch.trim() }
        });
        setEmployees(response.data.data || []);
      } catch (err) {
        console.error('Error searching employees:', err);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [employeeSearch]);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const response = await api.get('/machines');
        const data = Array.isArray(response.data?.data)
          ? response.data.data
          : Array.isArray(response.data)
            ? response.data
            : [];
        setMachineOptions(data);
      } catch (err) {
        console.error('Error fetching machines:', err);
        setMachineOptions([]);
      }
    };
    fetchMachines();
  }, []);

  const fetchRecords = async (page = pagination.currentPage) => {
    if (!selectedEmployee) {
      setRecords([]);
      setPagination((prev) => ({ ...prev, totalRecords: 0, totalPages: 1, currentPage: 1 }));
      return;
    }

    if (!dateFrom || !dateTo) {
      setError('Please provide both start and end dates.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.get('/print-dtr-modal/records', {
        params: {
          userId: selectedEmployee.USERID,
          dateFrom,
          dateTo,
          page,
          limit: recordsPerPage
        }
      });

      setRecords(response.data.data || []);
      setPagination(response.data.pagination || {
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0
      });
    } catch (err) {
      console.error('Error fetching records:', err);
      setError('Failed to load records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!shouldRender) return;
    fetchRecords(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, dateFrom, dateTo, recordsPerPage, shouldRender]);

  const handleEmployeeSelect = (employee) => {
    setSelectedEmployee(employee);
    setEmployeeSearch('');
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setFormData({
      USERID: record.USERID,
      CHECKTIME: record.CHECKTIME,
      CHECKTYPE: record.CHECKTYPE,
      VERIFYCODE: record.VERIFYCODE,
      SENSORID: record.SENSORID,
      WORKCODE: record.WORKCODE,
      SN: record.SN
    });
    const { datePart, timePart } = getDateTimeParts(record.CHECKTIME);
    const { hour, minute } = parseTimeSegments(timePart);
    setDateInput(datePart !== '-' ? datePart : todayISO());
    setHourInput(hour);
    setMinuteInput(minute);
    setEditModalOpen(true);
  };

  const handleCreateFromRow = (record) => {
    setEditingRecord(null);
    const { datePart, timePart } = getDateTimeParts(record.CHECKTIME);
    const { hour, minute } = parseTimeSegments(timePart);
    setFormData({
      USERID: record.USERID,
      CHECKTYPE: record.CHECKTYPE || 'I',
      VERIFYCODE: record.VERIFYCODE ?? 1,
      SENSORID: record.SENSORID || '',
      WORKCODE: record.WORKCODE ?? 0,
      SN: record.SN || '',
      CHECKTIME: datePart && datePart !== '-' ? `${datePart} ` : ''
    });
    setDateInput(datePart && datePart !== '-' ? datePart : todayISO());
    setHourInput(hour);
    setMinuteInput(minute);
    setEditModalOpen(true);
  };

  const handleDeleteRecord = async (record) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await api.delete(`/print-dtr-modal/records/${record.USERID}/${encodeCheckTime(record.CHECKTIME)}`);
      fetchRecords();
    } catch (err) {
      console.error('Error deleting record:', err);
      setError('Failed to delete record.');
    }
  };

  const handleSaveRecord = async () => {
    if (!formData.USERID || !dateInput) {
      setError('USERID and Date are required.');
      return;
    }

    const randomSecond = getRandomSecond();
    const constructedTime = `${hourInput || '00'}:${minuteInput || '00'}:${randomSecond}`;
    const checkTimeValue = `${dateInput} ${constructedTime}`;

    const payload = {
      USERID: Number(formData.USERID),
      CHECKTIME: checkTimeValue,
      CHECKTYPE: formData.CHECKTYPE || 'I',
      VERIFYCODE: Number(formData.VERIFYCODE) || 1,
      SENSORID: formData.SENSORID || '',
      WORKCODE: Number(formData.WORKCODE) || 0,
      SN: formData.SN || ''
    };

    try {
      if (editingRecord) {
        await api.put(
          `/print-dtr-modal/records/${editingRecord.USERID}/${encodeCheckTime(editingRecord.CHECKTIME)}`,
          payload
        );
      } else {
        await api.post('/print-dtr-modal/records', payload);
      }
      setEditModalOpen(false);
      setEditingRecord(null);
      setFormData(emptyFormState);
      setDateInput(todayISO());
      setHourInput('00');
      setMinuteInput('00');
      fetchRecords();
    } catch (err) {
      console.error('Error saving record:', err);
      setError(err.response?.data?.message || 'Failed to save record.');
    }
  };

  const handleSensorChange = (value) => {
    setFormData((prev) => {
      const selected = machineOptions.find((machine) => String(machine.MachineNumber) === value);
      return {
        ...prev,
        SENSORID: value,
        SN: selected?.sn || prev.SN
      };
    });
  };

  const closeModal = () => {
    if (embedded) return;
    setSelectedEmployee(null);
    setRecords([]);
    setEmployeeSearch('');
    setEditModalOpen(false);
    onClose?.();
  };

  const selectedEmployeeLabel = useMemo(() => {
    if (!selectedEmployee) return 'No employee selected';
    return `${selectedEmployee.NAME || 'Unknown'} (Badge: ${selectedEmployee.BADGENUMBER || 'N/A'})`;
  }, [selectedEmployee]);

  if (!shouldRender) {
    return null;
  }

  const content = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">DTR RAW Records</h2>
          <p className="text-sm text-gray-600">Search DTR RAW</p>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={closeModal}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            ✕ Close
          </button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Search Employee</label>
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Type employee name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {employeeSearch && employees.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border border-gray-200 bg-white shadow">
              {employees.map((employee) => (
                <button
                  type="button"
                  key={`${employee.USERID}-${employee.BADGENUMBER}`}
                  onClick={() => handleEmployeeSelect(employee)}
                  className="flex w-full flex-col px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="font-medium text-gray-800">{employee.NAME || 'Unnamed'}</span>
                  <span className="text-sm text-gray-500">
                    Badge: {employee.BADGENUMBER || 'N/A'} • USERID: {employee.USERID}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Selected Employee</label>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {selectedEmployeeLabel}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Date From</label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Date To</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Actions</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fetchRecords(1)}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Apply Filter
            </button>
            <select
              value={recordsPerPage}
              onChange={(e) => {
                setRecordsPerPage(Number(e.target.value));
                fetchRecords(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {[10, 30, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Checktime', 'Checktype', 'Verifycode', 'Sensor ID', 'Workcode', 'SN', 'Actions'].map((header) => (
                <th
                  key={header}
                  className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white text-sm">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  Loading records...
                </td>
              </tr>
            )}

            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  No records found. Select an employee and adjust the date range.
                </td>
              </tr>
            )}

            {!loading && records.map((record) => {
              const { datePart, timePart } = getDateTimeParts(record.CHECKTIME);
              return (
                <tr key={`${record.USERID}-${record.CHECKTIME}`}>
                  <td className="px-4 py-2">{datePart || '-'}</td>
                  <td className="px-4 py-2">{timePart || '-'}</td>
                  <td className="px-4 py-2">{record.CHECKTYPE || '-'}</td>
                  <td className="px-4 py-2">{record.VERIFYCODE ?? '-'}</td>
                  <td className="px-4 py-2">{record.SENSORID || '-'}</td>
                  <td className="px-4 py-2">{record.WORKCODE ?? '-'}</td>
                  <td className="px-4 py-2">{record.SN || '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCreateFromRow(record)}
                        className="rounded-full border border-green-500 px-3 py-1 text-xs font-semibold text-green-600 hover:bg-green-50"
                        title="Create new record based on this row"
                      >
                        ➕
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditRecord(record)}
                        className="rounded-full border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        title="Edit record"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(record)}
                        className="rounded-full border border-red-500 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        title="Delete record"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4 text-sm text-gray-600">
        <div>
          Showing page {pagination.currentPage} of {pagination.totalPages} • {pagination.totalRecords} total records
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchRecords(1)}
            disabled={pagination.currentPage === 1}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            « First
          </button>
          <button
            type="button"
            onClick={() => fetchRecords(Math.max(1, pagination.currentPage - 1))}
            disabled={pagination.currentPage === 1}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            onClick={() => fetchRecords(Math.min(pagination.totalPages, pagination.currentPage + 1))}
            disabled={pagination.currentPage === pagination.totalPages}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next ›
          </button>
          <button
            type="button"
            onClick={() => fetchRecords(pagination.totalPages)}
            disabled={pagination.currentPage === pagination.totalPages}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Last »
          </button>
        </div>
      </div>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-xl font-semibold text-gray-900">
                {editingRecord ? 'Edit Record' : 'Create Record'}
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">USERID</label>
                <input
                  type="text"
                  value={formData.USERID}
                  readOnly
                  className="mt-1 w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Hour (HH)</label>
                  <select
                    value={hourInput}
                    onChange={(e) => setHourInput(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {hourOptions.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Minutes (MM)</label>
                  <select
                    value={minuteInput}
                    onChange={(e) => setMinuteInput(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {minuteOptions.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Checktype</label>
                  <select
                    value={formData.CHECKTYPE}
                    onChange={(e) => setFormData((prev) => ({ ...prev, CHECKTYPE: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="I">I (In)</option>
                    <option value="O">O (Out)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">VerifyCode</label>
                  <input
                    type="number"
                    value={formData.VERIFYCODE}
                    onChange={(e) => setFormData((prev) => ({ ...prev, VERIFYCODE: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Workcode</label>
                  <input
                    type="number"
                    value={formData.WORKCODE}
                    onChange={(e) => setFormData((prev) => ({ ...prev, WORKCODE: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">Sensor ID</label>
                  <select
                    value={formData.SENSORID || ''}
                    onChange={(e) => handleSensorChange(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Select Sensor</option>
                    {!machineOptions.some((machine) => String(machine.MachineNumber) === String(formData.SENSORID)) && formData.SENSORID && (
                      <option value={formData.SENSORID}>{formData.SENSORID}</option>
                    )}
                    {machineOptions.map((machine) => (
                      <option key={machine.ID ?? machine.MachineNumber} value={machine.MachineNumber}>
                        {`${machine.MachineAlias || 'Machine'} (${machine.MachineNumber})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">SN</label>
                  <input
                    type="text"
                    value={formData.SN || ''}
                    readOnly
                    className="mt-1 w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRecord}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return embedded ? (
    content
  ) : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        {content}
      </div>
    </div>
  );
};

export default PrintDTRModal;