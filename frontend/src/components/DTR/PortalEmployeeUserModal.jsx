import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { formatEmployeeName, formatEmployeeNameFromObject } from '../../utils/employeenameFormatter';

const STATUS_OPTIONS = [
  { value: 1, label: 'Active' },
  { value: 0, label: 'Inactive' }
];

const DEFAULT_FORM = {
  dtruserid: '',
  dtrname: '',
  username: '',
  pin: '1234',
  emailaddress: '',
  status: 1,
  emp_objid: null
};

const formatLookupName = (match) => {
  if (!match) return '';
  if (match.fullName) return match.fullName;
  return formatEmployeeName(match.surname, match.firstname, match.middlename);
};

function PortalEmployeeUserModal({ open, mode, initialData, onClose, onSave }) {
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [lookupState, setLookupState] = useState({
    loading: false,
    error: '',
    match: null
  });
  const [saving, setSaving] = useState(false);
  const [headerMatch, setHeaderMatch] = useState(null);

  const modalTitle = useMemo(
    () => (mode === 'edit' ? 'Edit Portal User' : 'Add Portal User'),
    [mode]
  );

  useEffect(() => {
    if (!open) return;
    const prepared = {
      ...DEFAULT_FORM,
      ...(initialData || {})
    };
    prepared.dtruserid = prepared.dtruserid ? String(prepared.dtruserid) : '';
    prepared.status = Number(prepared.status ?? 1);
    prepared.pin = prepared.pin ? String(prepared.pin) : '1234';
    prepared.dtrname =
      prepared.dtrname ||
      prepared.fullName ||
      formatEmployeeName(prepared.surname, prepared.firstname, prepared.middlename);

    setFormData(prepared);
    setHeaderMatch(null);
  }, [open, initialData]);

  useEffect(() => {
    if (!open) return;
    const dtrId = formData.dtruserid?.trim();
    if (!dtrId) {
      setLookupState({ loading: false, error: '', match: null });
      return;
    }

    let cancelled = false;
    setLookupState((prev) => ({ ...prev, loading: true, error: '' }));

    api
      .get(`/employees/${dtrId}/portal-profile`)
      .then((response) => {
        if (cancelled) return;
        const payload = response.data || {};
        const match = payload.match || payload.data || null;
        setLookupState({
          loading: false,
          error: '',
          match
        });
        setHeaderMatch(match);

        if (match?.objid) {
          setFormData((prev) => ({
            ...prev,
            emp_objid: match.objid,
            dtrname: prev.dtrname || formatLookupName(match)
          }));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[PortalEmployeeUserModal] Lookup failed:', error);
        setLookupState({
          loading: false,
          error: error.response?.data?.message || 'Unable to retrieve employee profile.',
          match: null
        });
        setHeaderMatch(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, formData.dtruserid]);

  const handleChange = (field, value) => {
    if (field === 'pin') {
      const sanitized = value.replace(/\D/g, '').slice(0, 6);
      setFormData((prev) => ({ ...prev, pin: sanitized }));
      return;
    }

    if (field === 'dtruserid') {
      const sanitized = value.replace(/\D/g, '');
      setFormData((prev) => ({
        ...prev,
        dtruserid: sanitized,
        emp_objid: mode === 'edit' ? prev.emp_objid : null
      }));
      return;
    }

    if (field === 'status') {
      setFormData((prev) => ({ ...prev, status: Number(value) === 1 ? 1 : 0 }));
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.dtruserid) {
      alert('Please provide a DTR ID.');
      return;
    }

    if (!formData.username) {
      alert('Please provide a username.');
      return;
    }

    if (!formData.pin) {
      alert('Please provide a PIN.');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        ...formData,
        status: Number(formData.status) === 1 ? 1 : 0
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const statusText = Number(formData.status) === 1 ? 'Active' : 'Inactive';
  const headerName = headerMatch ? formatLookupName(headerMatch) : formData.dtrname || 'Portal User';
  const headerPhoto = headerMatch?.photo || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {headerPhoto ? (
              <img
                src={headerPhoto}
                alt={headerName}
                className="w-14 h-14 rounded-full object-cover border border-gray-200"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-600 text-base font-semibold">
                {(headerName || 'NA')
                  .split(/[ ,]+/)
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'NA'}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{headerName}</h3>
              <p className="text-sm text-gray-500">
                {mode === 'edit'
                  ? 'Update portal account information stored in sysusers_portal.'
                  : 'Create a new portal account entry in sysusers_portal.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close portal user modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DTR ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.dtruserid}
                onChange={(event) => handleChange('dtruserid', event.target.value)}
                placeholder="Enter biometric user ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                The DTR user identifier from the biometric system.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Portal User Name</label>
              <input
                type="text"
                value={formData.dtrname || ''}
                onChange={(event) => handleChange('dtrname', event.target.value)}
                placeholder="Portal display name (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(event) => handleChange('username', event.target.value)}
                placeholder="Portal username"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                disabled={mode === 'edit'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PIN <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pin}
                onChange={(event) => handleChange('pin', event.target.value)}
                placeholder="4-6 digit PIN"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.emailaddress || ''}
                onChange={(event) => handleChange('emailaddress', event.target.value)}
                placeholder="name@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleChange('status', Number(formData.status) === 1 ? 0 : 1)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                    Number(formData.status) === 1 ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  aria-pressed={Number(formData.status) === 1}
                  aria-label="Toggle portal user status"
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      Number(formData.status) === 1 ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-gray-700">{statusText}</span>
              </div>
            </div>
          </div>

          {lookupState.loading && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 text-sm text-gray-500">
              Looking up employee profile…
            </div>
          )}
          {!lookupState.loading && !lookupState.match && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 text-sm text-gray-500">
              {lookupState.error || 'No matching HR employee found for this DTR ID.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PortalEmployeeUserModal;

