import React, { useEffect, useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const toArrayFromMultiline = (value) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date?.getTime?.())) {
    return null;
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatDate = (date) => {
  const normalized = normalizeDate(date);
  if (!normalized) return '';
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date) => {
  const normalized = normalizeDate(date);
  if (!normalized) return '';
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  const year = normalized.getFullYear();
  return `${month}/${day}/${year}`;
};

const parseDateString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const parts = value.split('-').map((part) => Number(part));
    if (parts.length === 3 && parts.every((num) => !Number.isNaN(num))) {
      const [year, month, day] = parts;
      return normalizeDate(new Date(year, month - 1, day));
    }
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : normalizeDate(fallback);
  }
  if (value instanceof Date) {
    return normalizeDate(value);
  }
  return null;
};

const EmployeeAvatar = ({ photo, name }) => {
  if (photo) {
    return <img src={photo} alt={name || 'Employee'} className="w-10 h-10 rounded-full object-cover border" />;
  }
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'NA';
  return (
    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 border">
      {initials}
    </div>
  );
};

const AvatarWithTooltip = ({ photo, name }) => {
  const initials = (name || 'NA')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasPhoto = !!photo && (photo.startsWith('data:') || photo.startsWith('http'));
  return (
    <div className="relative group" title={name || 'N/A'}>
      {hasPhoto && (
        <img
          src={photo}
          alt={name || 'Person'}
          className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 hover:border-blue-400"
          onError={(e) => {
            e.target.style.display = 'none';
            const fallback = e.target.nextElementSibling;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      )}
      <div
        className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-gray-200 hover:border-blue-400 ${
          hasPhoto ? 'hidden' : ''
        }`}
      >
        {initials}
      </div>
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
        {name || 'N/A'}
      </div>
    </div>
  );
};

const statusBadgeClass = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700';
    case 'RETURNED':
      return 'bg-yellow-100 text-yellow-700';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    case 'FOR APPROVAL':
    default:
      return 'bg-blue-100 text-blue-700';
  }
};

const ActionIconButton = ({ title, onClick, color = 'blue', children, disabled }) => {
  const baseColor =
    color === 'green'
      ? 'text-green-600 hover:text-green-900 hover:bg-green-50'
      : color === 'red'
      ? 'text-red-600 hover:text-red-900 hover:bg-red-50'
      : color === 'yellow'
      ? 'text-yellow-600 hover:text-yellow-900 hover:bg-yellow-50'
      : 'text-blue-600 hover:text-blue-900 hover:bg-blue-50';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1 rounded transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${baseColor}`}
    >
      {children}
    </button>
  );
};

const isForApprovalStatus = (status) => (status || '').toUpperCase() === 'FOR APPROVAL';
const isCdoExpired = (record) => {
  if (!record) return false;
  if (record.isExpired) return true;
  if (!record.expirydate) return false;
  const expiryTime = new Date(record.expirydate).getTime();
  if (Number.isNaN(expiryTime)) return false;
  return Date.now() > expiryTime;
};

const initialCdoForm = {
  emp_objid: '',
  cdotitle: '',
  cdopurpose: '',
  cdodescription: '',
  cdoremarks: '',
  earnedcredit: 1,
  workdatesInput: '',
};

const initialUsedForm = {
  cdo_id: '',
  reason: '',
  cdodateremarks: '',
  cdodatesInput: '',
};

const DTREmployee_cdo = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = 'dtr-cdo';
  const componentPermissions = useMemo(() => ({
    read: can(COMPONENT_ID, 'read'),
    create: can(COMPONENT_ID, 'create'),
    update: can(COMPONENT_ID, 'update'),
    delete: can(COMPONENT_ID, 'delete'),
    print: can(COMPONENT_ID, 'print'),
    approve: can(COMPONENT_ID, 'approve'),
    return: can(COMPONENT_ID, 'return'),
    cancel: can(COMPONENT_ID, 'cancel'),
  }), [can]);

  const {
    read: canReadCdo,
    create: canCreateCdo,
    update: canUpdateCdo,
    delete: canDeleteCdo,
    print: canPrintCdo,
    approve: canApproveCdo,
    return: canReturnCdo,
    cancel: canCancelCdo,
  } = componentPermissions;
  const [activeTab, setActiveTab] = useState('transactions');

  const [loading, setLoading] = useState(false);
  const [cdoList, setCdoList] = useState([]);
  const [searchEmployee, setSearchEmployee] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' means all statuses

  const [showCdoModal, setShowCdoModal] = useState(false);
  const [editingCdo, setEditingCdo] = useState(null);
  const [cdoForm, setCdoForm] = useState(initialCdoForm);

  const [showUsedModal, setShowUsedModal] = useState(false);
  const [editingUsed, setEditingUsed] = useState(null);
  const [usedForm, setUsedForm] = useState(initialUsedForm);
  const [selectedWorkDates, setSelectedWorkDates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployeeInfo, setSelectedEmployeeInfo] = useState(null);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [expandedUsedMap, setExpandedUsedMap] = useState({});
  const [showConsumeModal, setShowConsumeModal] = useState(false);
  const [consumeTarget, setConsumeTarget] = useState(null);
  const [consumeSelectedDates, setConsumeSelectedDates] = useState([]);
  const [consumeReason, setConsumeReason] = useState('');
  const [consumeSubmitting, setConsumeSubmitting] = useState(false);
  const [transactionActionModal, setTransactionActionModal] = useState({ open: false, action: null, record: null });
  const [transactionActionRemarks, setTransactionActionRemarks] = useState('');

  const fetchData = useMemo(
    () => ({
      loadCdo: async (retryCount = 0) => {
        setLoading(true);
        try {
      const response = await api.get('/dtr/employee-cdo/transactions');
          setCdoList(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (error) {
          console.error('Failed to load CDO records:', error);
          if (error.code === 'ECONNABORTED' && retryCount < 1) {
            setTimeout(() => fetchData.loadCdo(retryCount + 1), 1000);
          } else {
          setCdoList([]);
          }
        } finally {
          setLoading(false);
        }
      },
    }),
    []
  );

  useEffect(() => {
    if (!permissionsLoading && canReadCdo) {
      fetchData.loadCdo();
    }
  }, [fetchData, permissionsLoading, canReadCdo]);

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

    const position = employee.position || employee.POSITION || employee.jobtitle || employee.JOBTITLE || '';
    const department = employee.department || employee.DEPARTMENT || employee.office || employee.OFFICE || '';
    const photo =
      employee.photo ||
      employee.photo_path ||
      employee.PHOTO ||
      employee.PHOTO_PATH ||
      employee.profilephoto ||
      '';

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
      position,
      department,
      photo,
      searchKey: searchKeyParts,
    };
  };

  const handleOpenCdoModal = (record = null) => {
    if (record) {
      if (!canUpdateCdo) {
        alert('You do not have permission to update CDO records.');
        return;
      }
    } else if (!canCreateCdo) {
      alert('You do not have permission to create CDO records.');
      return;
    }
    if (!employeesLoaded) {
      fetchEmployees();
    }
    setEditingCdo(record);
    if (record) {
      const workdatesArray = Array.isArray(record.workdates) ? record.workdates : [];
      const parsedDates = workdatesArray.map(parseDateString).filter(Boolean);
      parsedDates.sort((a, b) => a.getTime() - b.getTime());
      setSelectedWorkDates(parsedDates);
      setCdoForm({
        emp_objid: record.emp_objid || '',
        cdotitle: record.cdotitle || '',
        cdopurpose: record.cdopurpose || '',
        cdodescription: record.cdodescription || '',
        cdoremarks: record.cdoremarks || '',
      });
      const infoFromRecord = buildEmployeeInfo({
        objid: record.emp_objid,
        OBJID: record.emp_objid,
        badge: record.badgenumber,
        BADGENUMBER: record.badgenumber,
        name: record.employeeName,
        NAME: record.employeeName,
        position: record.position,
        POSITION: record.position,
        department: record.department,
        DEPARTMENT: record.department,
        photo: record.employeePhoto,
        PHOTO: record.employeePhoto,
      });
      setEmployeeSearchTerm(infoFromRecord?.name || '');
      setSelectedEmployeeInfo(infoFromRecord ? { ...infoFromRecord, raw: record } : null);
    } else {
      setSelectedWorkDates([]);
      setCdoForm(initialCdoForm);
      setEmployeeSearchTerm('');
      setSelectedEmployeeInfo(null);
    }
    setShowCdoModal(true);
  };

  const handleOpenUsedModal = (record = null) => {
    if (record) {
      if (!canUpdateCdo) {
        alert('You do not have permission to update consume records.');
        return;
      }
    } else if (!canCreateCdo) {
      alert('You do not have permission to create consume records.');
      return;
    }
    setEditingUsed(record);
    if (record) {
      setUsedForm({
        cdo_id: record.cdo_id || '',
        reason: record.reason || '',
        cdodateremarks: record.cdodateremarks || '',
        cdodatesInput: record.cdodate || '',
      });
    } else {
      setUsedForm(initialUsedForm);
    }
    setShowUsedModal(true);
  };

  const closeCdoModal = () => {
    setShowCdoModal(false);
    setEditingCdo(null);
    setSelectedWorkDates([]);
    setEmployeeSearchTerm('');
    setSelectedEmployeeInfo(null);
    setShowEmployeeDropdown(false);
  };

  const closeUsedModal = () => {
    setShowUsedModal(false);
    setEditingUsed(null);
  };

  const handleCdoFormSubmit = async (event) => {
    event.preventDefault();
    if (editingCdo) {
      if (!canUpdateCdo) {
        alert('You do not have permission to update CDO records.');
        return;
      }
    } else if (!canCreateCdo) {
      alert('You do not have permission to create CDO records.');
      return;
    }
    if (!cdoForm.emp_objid) {
      alert('Please select an employee.');
      return;
    }

    const workdateStrings = Array.from(
      new Set(selectedWorkDates.map((date) => formatDate(date)).filter(Boolean))
    ).sort();

    if (workdateStrings.length === 0) {
      alert('Please select at least one work date.');
      return;
    }

    const payload = {
      emp_objid: cdoForm.emp_objid,
      cdotitle: cdoForm.cdotitle,
      cdopurpose: cdoForm.cdopurpose,
      cdodescription: cdoForm.cdodescription,
      cdoremarks: cdoForm.cdoremarks,
      earnedcredit: workdateStrings.length,
      workdates: workdateStrings,
    };

    try {
      if (editingCdo) {
        await api.put(`/dtr/employee-cdo/transactions/${editingCdo.id}`, payload);
        alert('CDO record updated successfully');
      } else {
        await api.post('/dtr/employee-cdo/transactions', payload);
        alert('CDO record created successfully');
      }
      closeCdoModal();
      setSelectedWorkDates([]);
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to save CDO record:', error);
      alert(error.response?.data?.message || 'Failed to save CDO record');
    }
  };

  const handleUsedFormSubmit = async (event) => {
    event.preventDefault();
    if (editingUsed) {
      if (!canUpdateCdo) {
        alert('You do not have permission to update consume records.');
        return;
      }
    } else if (!canCreateCdo) {
      alert('You do not have permission to create consume records.');
      return;
    }
    const payload = {
      cdo_id: usedForm.cdo_id,
      reason: usedForm.reason,
      cdodateremarks: usedForm.cdodateremarks,
      cdodates: toArrayFromMultiline(usedForm.cdodatesInput),
    };

    try {
      if (editingUsed) {
        await api.put(`/dtr/employee-cdo/usedates/${editingUsed.id}`, payload);
        alert('Used CDO record updated successfully');
      } else {
        await api.post('/dtr/employee-cdo/usedates', payload);
        alert('Used CDO record created successfully');
      }
      closeUsedModal();
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to save used CDO record:', error);
      alert(error.response?.data?.message || 'Failed to save used CDO record');
    }
  };

  const updateCdoStatus = async (id, status, remarks) => {
    if (status === 'Approved' && !canApproveCdo) {
      alert('You do not have permission to approve CDO records.');
      return;
    }
    if (status === 'Returned' && !canReturnCdo) {
      alert('You do not have permission to return CDO records.');
      return;
    }
    if (status === 'Cancelled' && !canCancelCdo) {
      alert('You do not have permission to cancel CDO records.');
      return;
    }
    try {
      await api.put(`/dtr/employee-cdo/transactions/${id}/status`, { status, remarks });
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const updateUsedStatus = async (id, status) => {
    if (status === 'Approved' && !canApproveCdo) {
      alert('You do not have permission to approve consume records.');
      return;
    }
    if (status === 'Returned' && !canReturnCdo) {
      alert('You do not have permission to return consume records.');
      return;
    }
    if (status === 'Cancelled' && !canCancelCdo) {
      alert('You do not have permission to cancel consume records.');
      return;
    }
    try {
      await api.put(`/dtr/employee-cdo/usedates/${id}/status`, { status });
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to update used status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const deleteUsedRecord = async (id) => {
    if (!canDeleteCdo) {
      alert('You do not have permission to delete consume records.');
      return;
    }
    if (!window.confirm('Delete this used CDO record?')) return;
    try {
      await api.delete(`/dtr/employee-cdo/usedates/${id}`);
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to delete used record:', error);
      alert(error.response?.data?.message || 'Failed to delete record');
    }
  };

  const handlePrintCdo = (record) => {
    if (!canPrintCdo) {
      alert('You do not have permission to print CDO records.');
      return;
    }
    if (!record?.id) return;
    window.open(`/api/dtr/employee-cdo/transactions/${record.id}`, '_blank', 'noopener');
  };

  const handleDeleteCdo = async (record) => {
    if (!canDeleteCdo) {
      alert('You do not have permission to delete CDO records.');
      return;
    }
    if (!record?.id) return;
    if (!window.confirm('Delete this CDO record?')) return;
    try {
      await api.delete(`/dtr/employee-cdo/transactions/${record.id}`);
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to delete CDO record:', error);
      alert(error.response?.data?.message || 'Failed to delete CDO record');
    }
  };

  const openTransactionActionModal = (action, record) => {
    if (action === 'approve' && !canApproveCdo) {
      alert('You do not have permission to approve CDO records.');
      return;
    }
    if (action === 'return' && !canReturnCdo) {
      alert('You do not have permission to return CDO records.');
      return;
    }
    if (action === 'cancel' && !canCancelCdo) {
      alert('You do not have permission to cancel CDO records.');
      return;
    }
    setTransactionActionRemarks(record?.cdoremarks || '');
    setTransactionActionModal({ open: true, action, record });
  };

  const closeTransactionActionModal = () => {
    setTransactionActionModal({ open: false, action: null, record: null });
    setTransactionActionRemarks('');
  };

  const submitTransactionAction = async () => {
    const { action, record } = transactionActionModal;
    if (!action || !record?.id) return;
    const statusMap = { approve: 'Approved', return: 'Returned', cancel: 'Cancelled' };
    const newStatus = statusMap[action];
    if (!newStatus) {
      closeTransactionActionModal();
      return;
    }
    if (!transactionActionRemarks.trim()) {
      alert('Please enter remarks before proceeding.');
      return;
    }
    try {
      await updateCdoStatus(record.id, newStatus, transactionActionRemarks.trim());
      closeTransactionActionModal();
    } catch (error) {
      console.error('Failed to update CDO status:', error);
    }
  };

  const toggleConsumeRow = (id) => {
    setExpandedUsedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const openConsumeModal = (record) => {
    if (!canCreateCdo) {
      alert('You do not have permission to consume CDO credits.');
      return;
    }
    if (!record) return;
    if (isCdoExpired(record)) {
      alert('This CDO credit has expired and can no longer be used.');
      return;
    }
    setConsumeTarget(record);
    setConsumeSelectedDates([]);
    setConsumeReason('');
    setShowConsumeModal(true);
  };

  const closeConsumeModal = () => {
    setShowConsumeModal(false);
    setConsumeTarget(null);
    setConsumeSelectedDates([]);
    setConsumeReason('');
    setConsumeSubmitting(false);
  };

  const handleConsumeDateSelect = (dates) => {
    const list = Array.isArray(dates) ? dates : dates ? [dates] : [];
    const normalized = [];
    const seen = new Set();
    list.forEach((value) => {
      const normalizedDate = normalizeDate(value);
      if (normalizedDate) {
        const key = normalizedDate.getTime();
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(normalizedDate);
        }
      }
    });
    normalized.sort((a, b) => a.getTime() - b.getTime());
    const limit = consumeRemainingCredits;
    if (limit > 0 && normalized.length > limit) {
      normalized.splice(limit);
    }
    setConsumeSelectedDates(normalized);
  };

  const removeConsumeDate = (value) => {
    setConsumeSelectedDates((prev) => prev.filter((date) => formatDate(date) !== value));
  };

  const handleConsumeSubmit = async (event) => {
    event.preventDefault();
    if (!canCreateCdo) {
      alert('You do not have permission to consume CDO credits.');
      return;
    }
    if (!consumeTarget) return;
    if (isCdoExpired(consumeTarget)) {
      alert('This CDO credit has expired and can no longer be used.');
      return;
    }
    if (!consumeSelectedDates.length) {
      alert('Please select at least one consume date.');
      return;
    }
    if (!consumeReason.trim()) {
      alert('Please provide a reason for consuming credits.');
      return;
    }
    if (consumeSelectedDates.length > consumeRemainingCredits) {
      alert(`Only ${consumeRemainingCredits} credit(s) remain for this CDO.`);
      return;
    }

    const dateStrings = Array.from(new Set(consumeSelectedDates.map((date) => formatDate(date))));
    if (!dateStrings.length) {
      alert('Invalid consume dates.');
      return;
    }

    setConsumeSubmitting(true);
    try {
      await api.post(`/dtr/employee-cdo/transactions/${consumeTarget.id}/consume`, {
        dates: dateStrings,
        reason: consumeReason.trim(),
      });
      alert('Consume request recorded.');
      closeConsumeModal();
      fetchData.loadCdo();
    } catch (error) {
      console.error('Failed to consume CDO credits:', error);
      alert(error.response?.data?.message || 'Failed to consume CDO credits');
    } finally {
      setConsumeSubmitting(false);
    }
  };

  const handlePrintUsed = (entry) => {
    if (!canPrintCdo) {
      alert('You do not have permission to print consume records.');
      return;
    }
    if (!entry?.id) return;
    window.open(`/api/dtr/employee-cdo/usedates/${entry.id}`, '_blank', 'noopener');
  };

  const handleSelectWorkDates = (dates) => {
    const normalized = (dates || [])
      .map((date) => normalizeDate(date))
      .filter(Boolean);
    normalized.sort((a, b) => a.getTime() - b.getTime());
    setSelectedWorkDates(normalized);
  };

  const removeSelectedWorkDate = (dateString) => {
    setSelectedWorkDates((prev) => prev.filter((date) => formatDate(date) !== dateString));
  };

  const selectedWorkDateItems = useMemo(
    () =>
      selectedWorkDates
        .map((date) => {
          const value = formatDate(date);
          if (!value) return null;
          return {
            value,
            label: formatDisplayDate(date),
          };
        })
        .filter(Boolean),
    [selectedWorkDates]
  );

  const filteredEmployees = useMemo(() => {
    const list = Array.isArray(employees) ? employees : [];
    if (!employeeSearchTerm) {
      return list.slice(0, 10);
    }
    const term = employeeSearchTerm.toLowerCase().trim();
    if (!term) {
      return list.slice(0, 10);
    }
    return list.filter((employee) => employee.searchKey?.includes(term)).slice(0, 10);
  }, [employeeSearchTerm, employees]);

  useEffect(() => {
    if (!showCdoModal || !cdoForm.emp_objid) return;
    const match = (employees || []).find(
      (employee) => String(employee.objid) === String(cdoForm.emp_objid)
    );
    if (match) {
      setSelectedEmployeeInfo(match);
      setEmployeeSearchTerm(match.name);
    }
  }, [showCdoModal, cdoForm.emp_objid, employees]);

  const handleSelectEmployee = (employee) => {
    if (!employee) return;
    const info = buildEmployeeInfo(employee.raw || employee);
    if (!info) return;
    setCdoForm((prev) => ({ ...prev, emp_objid: info.objid }));
    setSelectedEmployeeInfo({ ...info, raw: employee.raw || employee });
    setEmployeeSearchTerm(info.name);
    setShowEmployeeDropdown(false);
  };

  const approvedCdos = useMemo(
    () => cdoList.filter((record) => (record.cdostatus || '').toUpperCase() === 'APPROVED'),
    [cdoList]
  );

  const consumeSelectedDateItems = useMemo(
    () =>
      consumeSelectedDates.map((date) => ({
        value: formatDate(date),
        label: formatDisplayDate(date),
      })),
    [consumeSelectedDates]
  );

  const consumeRemainingCredits = useMemo(() => {
    if (!consumeTarget) return 0;
    const earned = Number(consumeTarget.earnedcredit) || 0;
    const used = Number(consumeTarget.usedcredit) || 0;
    if (isCdoExpired(consumeTarget)) return 0;
    return Math.max(earned - used, 0);
  }, [consumeTarget]);

  const consumeBalanceAfterSelection = useMemo(
    () => Math.max(consumeRemainingCredits - consumeSelectedDates.length, 0),
    [consumeRemainingCredits, consumeSelectedDates]
  );

  // Filtered CDO list for Credit Transactions tab
  const filteredCdoList = useMemo(() => {
    let filtered = [...cdoList];
    
    // Filter by employee name
    if (searchEmployee.trim()) {
      const searchLower = searchEmployee.toLowerCase().trim();
      filtered = filtered.filter(record => {
        const employeeName = (record.employeeName || '').toLowerCase();
        return employeeName.includes(searchLower);
      });
    }
    
    // Filter by status
    if (statusFilter) {
      filtered = filtered.filter(record => {
        const recordStatus = (record.cdostatus || 'For Approval').toUpperCase();
        return recordStatus === statusFilter.toUpperCase();
      });
    }
    
    return filtered;
  }, [cdoList, searchEmployee, statusFilter]);

  // Filtered approved CDOs for Used Credits tab
  const filteredApprovedCdos = useMemo(() => {
    let filtered = [...approvedCdos];
    
    // Filter by employee name
    if (searchEmployee.trim()) {
      const searchLower = searchEmployee.toLowerCase().trim();
      filtered = filtered.filter(record => {
        const employeeName = (record.employeeName || '').toLowerCase();
        return employeeName.includes(searchLower);
      });
    }
    
    // Filter by status (for used credits, we filter the consume entries)
    if (statusFilter) {
      const statusUpper = statusFilter.toUpperCase();
      filtered = filtered.map(record => {
        // If no consume entries, only show if filtering by "Approved" (the CDO itself is approved)
        if (!record.consumeEntries || !Array.isArray(record.consumeEntries) || record.consumeEntries.length === 0) {
          return statusUpper === 'APPROVED' ? record : null;
        }
        
        // Filter consume entries by status
        const filteredEntries = record.consumeEntries.filter(entry => {
          const entryStatus = (entry.cdodatestatus || 'For Approval').toUpperCase();
          return entryStatus === statusUpper;
        });
        
        // If no matching consume entries, exclude the record
        if (filteredEntries.length === 0) {
          return null;
        }
        
        // Return record with filtered consume entries
        return {
          ...record,
          consumeEntries: filteredEntries
        };
      }).filter(Boolean);
    }
    
    return filtered;
  }, [approvedCdos, searchEmployee, statusFilter]);

  const allowCdoModal = showCdoModal && ((editingCdo && canUpdateCdo) || (!editingCdo && canCreateCdo));
  const allowUsedModal = showUsedModal && ((editingUsed && canUpdateCdo) || (!editingUsed && canCreateCdo));
  const allowConsumeModal = showConsumeModal && canCreateCdo;

  if (permissionsLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center text-gray-600">
        Loading permissions...
      </div>
    );
  }

  if (!canReadCdo) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-100 p-6 text-center text-red-600">
        You do not have permission to view CDO records.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Compensating Day-Off (CDO)</h1>
          <p className="text-sm text-gray-500">Manage CDO credits and usage submissions.</p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'transactions' && canCreateCdo && (
            <button
              type="button"
              onClick={() => handleOpenCdoModal()}
              className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow hover:bg-blue-700"
            >
              + New CDO
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-50 border-b px-6 py-3 flex space-x-4">
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'transactions'
              ? 'bg-white text-blue-600 shadow border border-blue-200'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Credit Transactions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('used')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'used'
              ? 'bg-white text-blue-600 shadow border border-blue-200'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Used Credits
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {activeTab === 'transactions' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {/* Filter Section */}
            <div className="px-4 py-5 border-b bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              {(searchEmployee || statusFilter) && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchEmployee('');
                      setStatusFilter('');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
            
            <div className="px-4 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-700">CDO Credits</h2>
              {loading && <span className="text-sm text-gray-500">Loading...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">CDO No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Purpose</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Credit(s)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Created By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCdoList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                        {cdoList.length === 0 ? 'No CDO records found.' : 'No CDO records match the filters.'}
                      </td>
                    </tr>
                  )}
                  {filteredCdoList.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.cdono}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-3">
                          <AvatarWithTooltip photo={record.employeePhoto} name={record.employeeName} />
                          <div>
                            <div className="font-medium text-gray-800">{record.employeeName || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.cdotitle}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{record.cdopurpose}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{record.earnedcredit}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {record.createdByName || record.createdByPhoto ? (
                          <AvatarWithTooltip photo={record.createdByPhoto} name={record.createdByName || 'Creator'} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(record.cdostatus)}`}>
                          {record.cdostatus || 'For Approval'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {isForApprovalStatus(record.cdostatus) && (
                            <>
                              {canApproveCdo && (
                                <button
                                  onClick={() => openTransactionActionModal('approve', record)}
                                  className="text-green-600 hover:text-green-800 transition-colors"
                                  title="Approve CDO"
                                >
                                  👍
                                </button>
                              )}
                              {Number(record.isportal) === 1 && canReturnCdo && (
                                <button
                                  onClick={() => openTransactionActionModal('return', record)}
                                  className="text-orange-600 hover:text-orange-800 transition-colors"
                                  title="Return CDO"
                                >
                                  ↩
                                </button>
                              )}
                              {canCancelCdo && (
                                <button
                                  onClick={() => openTransactionActionModal('cancel', record)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                  title="Cancel CDO"
                                >
                                  ✖
                                </button>
                              )}
                            </>
                          )}
                          {canUpdateCdo && (
                            <button
                              onClick={() => handleOpenCdoModal(record)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Edit CDO"
                            >
                              ✏️
                            </button>
                          )}
                          {canPrintCdo && (
                            <button
                              onClick={() => handlePrintCdo(record)}
                              className="text-green-600 hover:text-green-800 transition-colors"
                              title="Print CDO"
                            >
                              🖨️
                            </button>
                          )}
                          {canDeleteCdo && (
                            <button
                              onClick={() => handleDeleteCdo(record)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Delete CDO"
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
          </div>
        )}

        {activeTab === 'used' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {/* Filter Section */}
            <div className="px-4 py-5 border-b bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              {(searchEmployee || statusFilter) && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchEmployee('');
                      setStatusFilter('');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
            
            <div className="px-4 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-700">Used Credits</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-12"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference Credit</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Earned Credits</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Consume Credits</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Remaining Credits</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredApprovedCdos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                        {approvedCdos.length === 0 ? 'No approved CDO records found.' : 'No records match the filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredApprovedCdos.map((record) => {
                      const isExpanded = !!expandedUsedMap[record.id];
                      const remaining = record.remainingCredits != null
                        ? Number(record.remainingCredits)
                        : Math.max((Number(record.earnedcredit) || 0) - (Number(record.usedcredit) || 0), 0);
                      const expired = isCdoExpired(record);
                      const consumeDisabled = expired || remaining <= 0 || Number(record.isconsume) === 1;

                      return (
                        <React.Fragment key={record.id}>
                          <tr className="align-top">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => toggleConsumeRow(record.id)}
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                title={isExpanded ? 'Collapse details' : 'Expand details'}
                              >
                                {isExpanded ? '−' : '+'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-medium">{record.cdono}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                              <div className="flex items-center gap-3">
                                <AvatarWithTooltip photo={record.employeePhoto} name={record.employeeName} />
                          <div>
                            <div className="font-medium text-gray-800">{record.employeeName || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{record.earnedcredit}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{record.usedcredit}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                              {expired ? (
                                <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                                  0 <span className="text-xs uppercase tracking-wide">(Expired)</span>
                          </span>
                        ) : (
                                remaining
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-3">
                                {canCreateCdo && (
                                  <button
                                    type="button"
                                    onClick={() => openConsumeModal(record)}
                                    disabled={consumeDisabled}
                                    className="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Consume CDO
                                  </button>
                                )}
                                {canPrintCdo && (
                                  <button
                                    type="button"
                                    onClick={() => handlePrintCdo(record)}
                                    className="text-green-600 hover:text-green-800 transition-colors"
                                    title="Print CDO"
                                  >
                                    🖨️
                                  </button>
                                )}
                                {canDeleteCdo && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCdo(record)}
                                    className="text-red-600 hover:text-red-800 transition-colors"
                                    title="Delete CDO"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="px-4 pb-4 bg-gray-50">
                                {record.consumeEntries && record.consumeEntries.length > 0 ? (
                                  <table className="min-w-full divide-y divide-gray-200 bg-white rounded">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Use Date</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Created By</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {record.consumeEntries.map((entry) => (
                                        <tr key={entry.id}>
                                          <td className="px-3 py-2 text-sm text-gray-900">{entry.cdodate || '—'}</td>
                                          <td className="px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{entry.reason || '—'}</td>
                                          <td className="px-3 py-2 text-sm text-gray-700">
                                            {Number(entry.isportal) === 1 ? (
                                              <span className="text-blue-600 font-semibold">Portal</span>
                                            ) : (
                                              <AvatarWithTooltip photo={entry.createdByPhoto} name={entry.createdByName || 'Creator'} />
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-sm">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(entry.cdodatestatus)}`}>
                                              {entry.cdodatestatus || 'For Approval'}
                        </span>
                      </td>
                                          <td className="px-3 py-2 text-sm">
                                            <div className="flex items-center gap-2">
                                              {isForApprovalStatus(entry.cdodatestatus) && (
                                                <>
                                                  {canApproveCdo && (
                                                    <button
                                                      type="button"
                                                      onClick={() => updateUsedStatus(entry.id, 'Approved')}
                                                      className="text-green-600 hover:text-green-800 transition-colors"
                                                      title="Approve Consume Record"
                                                    >
                                                      👍
                                                    </button>
                                                  )}
                                                  {Number(entry.isportal) === 1 && canReturnCdo && (
                                                    <button
                                                      type="button"
                                                      onClick={() => updateUsedStatus(entry.id, 'Returned')}
                                                      className="text-orange-600 hover:text-orange-800 transition-colors"
                                                      title="Return Consume Record"
                                                    >
                                                      ↩
                                                    </button>
                                                  )}
                                                  {canCancelCdo && (
                                                    <button
                                                      type="button"
                                                      onClick={() => updateUsedStatus(entry.id, 'Cancelled')}
                                                      className="text-red-600 hover:text-red-800 transition-colors"
                                                      title="Cancel Consume Record"
                                                    >
                                                      ✖
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                              {canUpdateCdo && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenUsedModal({ ...entry, cdo_id: record.id })}
                                                  className="text-blue-600 hover:text-blue-800 transition-colors"
                                                  title="Edit Consume Record"
                                                >
                                                  ✏️
                                                </button>
                                              )}
                                              {canPrintCdo && (
                                                <button
                                                  type="button"
                                                  onClick={() => handlePrintUsed(entry)}
                                                  className="text-green-600 hover:text-green-800 transition-colors"
                                                  title="Print Consume Record"
                                                >
                                                  🖨️
                                                </button>
                                              )}
                                              {canDeleteCdo && (
                                                <button
                                                  type="button"
                                                  onClick={() => deleteUsedRecord(entry.id)}
                                                  className="text-red-600 hover:text-red-800 transition-colors"
                                                  title="Delete Consume Record"
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
                                ) : (
                                  <div className="text-sm text-gray-500">No consume records found.</div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CDO Modal */}
      {allowCdoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingCdo ? 'Edit CDO Record' : 'New CDO Record'}
              </h3>
              <button onClick={closeCdoModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <form onSubmit={handleCdoFormSubmit} className="px-6 py-5 space-y-5">
                <div>
                <label className="block text-sm font-medium text-gray-700">Employee</label>
                <div className="mt-2 relative">
                  <input
                    type="text"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-10"
                    value={employeeSearchTerm}
                    onChange={(e) => {
                      setEmployeeSearchTerm(e.target.value);
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
                    onBlur={() => {
                      // Delay hiding to allow click events on dropdown items
                      setTimeout(() => setShowEmployeeDropdown(false), 150);
                    }}
                    placeholder="Search employee by name, badge number, or ObjID"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {loadingEmployees ? (
                      <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                </div>
                  {showEmployeeDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {loadingEmployees ? (
                        <div className="px-4 py-3 text-sm text-gray-500">Loading employees...</div>
                      ) : filteredEmployees.length > 0 ? (
                        filteredEmployees.map((employee) => (
                          <button
                            key={employee.objid || employee.badge || employee.name}
                            type="button"
                            onClick={() => handleSelectEmployee(employee)}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50"
                          >
                            <div className="flex items-center gap-3">
                              <EmployeeAvatar photo={employee.photo} name={employee.name} />
                <div>
                                <div className="font-medium text-gray-800">{employee.name || 'Unnamed Employee'}</div>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500">No employees found.</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  {selectedEmployeeInfo ? (
                    <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar photo={selectedEmployeeInfo.photo} name={selectedEmployeeInfo.name} />
                        <div className="text-sm font-semibold text-blue-900">{selectedEmployeeInfo.name || 'Selected Employee'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                      No employee selected.
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={cdoForm.cdotitle}
                  onChange={(e) => setCdoForm((prev) => ({ ...prev, cdotitle: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Purpose</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={cdoForm.cdopurpose}
                  onChange={(e) => setCdoForm((prev) => ({ ...prev, cdopurpose: e.target.value }))}
                  required
                />
              </div>
                <div>
                <label className="block text-sm font-medium text-gray-700">Work Date(s)</label>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-md p-3 bg-white">
                    <DayPicker
                      mode="multiple"
                      selected={selectedWorkDates}
                      onSelect={handleSelectWorkDates}
                      weekStartsOn={1}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 1}
                  />
                </div>
                  <div className="border rounded-md p-3 bg-gray-50 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Selected Dates</span>
                      <span className="text-xs text-gray-600">{selectedWorkDateItems.length} day(s)</span>
                </div>
                    <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                      {selectedWorkDateItems.length > 0 ? (
                        selectedWorkDateItems.map((item) => (
                          <li
                            key={item.value}
                            className="flex items-center justify-between rounded border bg-white px-2 py-1"
                          >
                            <span>{item.label}</span>
                            <button
                              type="button"
                              onClick={() => removeSelectedWorkDate(item.value)}
                              className="text-red-600 text-xs hover:underline"
                            >
                              Remove
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="text-xs text-gray-500">No dates selected</li>
                      )}
                    </ul>
                    {selectedWorkDateItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedWorkDates([])}
                        className="mt-3 text-xs text-red-600 hover:underline self-start"
                      >
                        Clear all
                      </button>
                    )}
              </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                  <label className="block text-sm font-medium text-gray-700">Earned Credits</label>
                  <input
                    type="number"
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={selectedWorkDateItems.length}
                  />
                  <p className="mt-1 text-xs text-gray-500">Calculated based on selected work date(s).</p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 border-t pt-4">
                <button
                  type="button"
                  onClick={closeCdoModal}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedWorkDateItems.length === 0}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingCdo ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Used CDO Modal */}
      {allowUsedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingUsed ? 'Edit Consume Record' : 'Log Used Credit'}
              </h3>
              <button onClick={closeUsedModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <form onSubmit={handleUsedFormSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">CDO Reference</label>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={usedForm.cdo_id}
                    onChange={(e) => setUsedForm((prev) => ({ ...prev, cdo_id: e.target.value }))}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Reason</label>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={usedForm.reason}
                    onChange={(e) => setUsedForm((prev) => ({ ...prev, reason: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Remarks</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={usedForm.cdodateremarks}
                  onChange={(e) => setUsedForm((prev) => ({ ...prev, cdodateremarks: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CDO Dates (one per line or comma separated)</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={usedForm.cdodatesInput}
                  onChange={(e) => setUsedForm((prev) => ({ ...prev, cdodatesInput: e.target.value }))}
                />
              </div>
              <div className="flex justify-end space-x-3 border-t pt-4">
                <button
                  type="button"
                  onClick={closeUsedModal}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                >
                  {editingUsed ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {allowConsumeModal && consumeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Consume CDO</h3>
              <button onClick={closeConsumeModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <form onSubmit={handleConsumeSubmit} className="px-6 py-5 space-y-4">
              <div className="space-y-2 text-sm">
                <div><span className="font-semibold text-gray-700">Reference:</span> {consumeTarget.cdono}</div>
                <div className="flex items-center gap-3">
                  <AvatarWithTooltip photo={consumeTarget.employeePhoto} name={consumeTarget.employeeName} />
                  <div className="font-semibold text-gray-800">{consumeTarget.employeeName || 'N/A'}</div>
                </div>
                <div className="text-xs text-gray-500">
                  Remaining credits: {consumeBalanceAfterSelection} / {consumeRemainingCredits}
                </div>
                {consumeTarget.expirydate && (
                  <div className={`text-xs font-semibold ${isCdoExpired(consumeTarget) ? 'text-red-600' : 'text-gray-500'}`}>
                    Expiry: {formatDisplayDate(consumeTarget.expirydate)}
                    {isCdoExpired(consumeTarget) ? ' (Expired)' : ''}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border rounded-md p-3 bg-white overflow-x-auto">
                  <DayPicker
                    mode="multiple"
                    selected={consumeSelectedDates}
                    onSelect={handleConsumeDateSelect}
                    weekStartsOn={1}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 1}
                    toYear={new Date().getFullYear() + 1}
                    className="min-w-[280px]"
                  />
                </div>
                <div className="border rounded-md p-3 bg-gray-50 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Selected Dates</span>
                    <span className="text-xs text-gray-600">{consumeSelectedDates.length} day(s)</span>
                  </div>
                  <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                    {consumeSelectedDateItems.length > 0 ? (
                      consumeSelectedDateItems.map((item) => (
                        <li key={item.value} className="flex items-center justify-between rounded border bg-white px-2 py-1">
                          <span>{item.label}</span>
                          <button
                            type="button"
                            onClick={() => removeConsumeDate(item.value)}
                            className="text-red-600 text-xs hover:underline"
                          >
                            Remove
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-gray-500">No dates selected</li>
                    )}
                  </ul>
                  {consumeSelectedDateItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConsumeSelectedDates([])}
                      className="mt-3 text-xs text-red-600 hover:underline self-start"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Reason</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={consumeReason}
                  onChange={(e) => setConsumeReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 border-t pt-4">
                <button
                  type="button"
                  onClick={closeConsumeModal}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={consumeSubmitting || consumeSelectedDates.length === 0 || !consumeReason.trim()}
                  className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {consumeSubmitting ? 'Saving…' : 'Save Consume Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {transactionActionModal.open && transactionActionModal.record && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Confirm Action</h3>
              <button onClick={closeTransactionActionModal} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 text-sm text-gray-700">
              <div>
                Are you sure you want to {transactionActionModal.action === 'approve' ? 'approve' : transactionActionModal.action === 'return' ? 'return' : 'cancel'} this CDO record?
              </div>
              <div>
                <span className="font-semibold">Reference:</span> {transactionActionModal.record.cdono}
              </div>
              <div className="flex items-center gap-3">
                <AvatarWithTooltip
                  photo={transactionActionModal.record.employeePhoto}
                  name={transactionActionModal.record.employeeName}
                />
                <div className="font-semibold text-gray-800">{transactionActionModal.record.employeeName || 'N/A'}</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks</label>
                <textarea
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={transactionActionRemarks}
                  onChange={(e) => setTransactionActionRemarks(e.target.value)}
                  placeholder="Enter remarks"
                  required
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={closeTransactionActionModal}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransactionAction}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DTREmployee_cdo;

