import api from '../../utils/api';
import QRCode from 'qrcode';

const CSS_STYLES = `
body {
  font-family: Arial, sans-serif;
  background: #fff;
  padding: 20px;
}

table {
  border-collapse: collapse;
  width: 100%;
  box-sizing: border-box;
}

tr:not(:first-child) td {
  border: 1px solid #000;
}

td {
  padding: 8px;
  font-size: 14px;
  vertical-align: middle;
}

.form-info-block {
  font-size: 12px;
  font-weight: bold;
  line-height: 1.2em;
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-top: 6px;
  width: 100%;
}

.logo-box {
  margin-left: 200px;
  text-align: center;
  flex-shrink: 0;
}

.logo-box img {
  max-width: 120px;
  max-height: 80px;
  width: 100%;
  height: auto;
  object-fit: contain;
}

.center-group-global {
  text-align: center;
  font-size: 12px;
  font-weight: bold;
  line-height: 1.2em;
  white-space: nowrap;
  flex-grow: 1;
}

.center-group-global .bottom {
  font-size: 11px;
}

.center-group-global .agency {
  font-size: 11px;
  font-style: italic;
}

.extra-line {
  font-size: 11px;
  margin-top: 2px;
  height: 1em;
}

.form-title {
  margin: 8px 0 0;
  font-size: 20px;
  font-weight: bold;
}

.stamp-box {
  border: 1px dashed #000;
  padding: 6px 10px;
  font-size: 12px;
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
}

.label {
  font-weight: bold;
  margin-right: 6px;
  white-space: nowrap;
}

input[type="text"],
input[type="date"] {
  padding: 4px;
  font-size: 14px;
  border: 1px solid #ccc;
  background: #f9f9f9;
  box-sizing: border-box;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.row-three {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.row-three > div {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}

.small-note {
  font-size: 0.8em;
  color: #555;
  margin-left: 4px;
}

@media print {
  body {
    background: #fff;
    color: #000;
    padding: 0;
    margin: 0;
    font-size: 12pt;
  }

  input[type="text"],
  input[type="date"],
  [contenteditable="true"] {
    border: none;
    border-bottom: 1px solid #000;
    background: transparent;
    color: #000;
    font-size: 12pt;
    padding: 2px 4px;
  }

  input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: black;
  }

  .print-button {
    display: none !important;
  }

  .logo-box img {
    max-width: 100px;
    max-height: 60px;
  }

  @page {
    size: 8.5in 13in;
    margin: 1cm;
  }
}

.certification-grid {
  width: 50%;
  margin: 12px auto;
  border-collapse: collapse;
  table-layout: fixed;
}

.certification-grid td {
  border: 1px solid #000;
  height: 1.6em;
  padding: 4px;
  vertical-align: top;
}

.approval-table td {
  border: none;
  padding: 4px;
}
`;

const defaultCompanyInfo = {
  lguDtrName: '',
  lguName: '',
  lguType: '',
  lguAddress: '',
  lguHrmo: '',
  lguMayor: '',
  logoPreview: '',
  logo: ''
};

const sanitize = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatDateDisplay = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return sanitize(value);
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatInputDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatCurrency = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  });
};

const splitEmployeeName = (employee, transaction) => {
  const raw =
    employee?.employee_name ||
    employee?.fullname ||
    transaction?.employee_name ||
    '';
  if (!raw) return { last: '', first: '', middle: '' };
  const [lastPart, restPart = ''] = raw.split(',');
  const last = (lastPart || '').trim();
  const [first = '', middle = ''] = restPart.trim().split(/\s+/);
  return {
    last: sanitize(last),
    first: sanitize(first),
    middle: sanitize(middle)
  };
};

const mapLeaveTypes = (transaction) => {
  const typeName = (transaction?.leave_type_name || transaction?.leave_type || '').toLowerCase();
  const leaveCategory = (transaction?.leavetypecategory || transaction?.leave_category || '').toLowerCase();
  const includes = (keyword) => typeName.includes(keyword) || leaveCategory.includes(keyword);

  const typeId = String(
    transaction?.leavetypeid ||
      transaction?.leavetype ||
      transaction?.leave_type_id ||
      transaction?.leavecode ||
      ''
  ).toLowerCase();

  const isMatch = (...keywords) => keywords.some((kw) => includes(kw) || typeId.includes(kw));

  return {
    vacation: isMatch('vacation', 'vl', 'privilege'),
    mandatory: isMatch('mandatory', 'force', 'forced'),
    sick: isMatch('sick', 'sl'),
    maternity: isMatch('maternity'),
    paternity: isMatch('paternity'),
    specialPrivilege: isMatch('special privilege', 'priv'),
    soloParent: isMatch('solo parent'),
    study: isMatch('study'),
    vawc: isMatch('vawc', 'violence against women'),
    rehabilitation: isMatch('rehabilitation', 'rehab'),
    specialWomen: isMatch('women', 'ra 9710'),
    specialEmergency: isMatch('emergency', 'special emergency'),
    adoption: isMatch('adoption')
  };
};

const INCLUSIVE_DATE_KEYS = [
  'inclusiveDate',
  'inclusive_date',
  'inclusivedate',
  'LeaveDate',
  'Leave_Dates',
  'leaveDate',
  'leavedate',
  'leave_date',
  'deducteddate',
  'deducted_date',
  'deductdate',
  'date',
  'value'
];

const extractDateValue = (entry) => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    for (const key of INCLUSIVE_DATE_KEYS) {
      if (entry[key]) return String(entry[key]).trim();
    }
  }
  return '';
};

const normalizeDateString = (value) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed.split(' ')[0];
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split('/');
    return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return trimmed;
};

const formatInclusiveDate = (value) => {
  if (!value) return '';
  const normalized = normalizeDateString(value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return sanitize(value);
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const formatAsOfDate = (value) => {
  if (!value) return '';
  const normalized = normalizeDateString(value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${month}/${day}/${year}`;
};

const formatLeaveBalance = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return sanitize(String(value));
  return num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const pickFirstValue = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === 'string' && candidate.trim() === '') continue;
    return candidate;
  }
  return '';
};

const parseStringDates = (raw) => {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Attempt JSON parse if looks like array
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.dates)) return parsed.dates;
        if (Array.isArray(parsed.details)) return parsed.details;
      }
    } catch (error) {
      // fall through to split
    }
  }

  return trimmed.split(/[,;]+/);
};

const buildInclusiveDates = (transaction) => {
  const raw =
    (Array.isArray(transaction?.details) && transaction.details.length ? transaction.details : null) ||
    transaction?.leave_dates ||
    transaction?.inclusivedates ||
    '';
  if (!raw) return '';

  let entries = [];

  if (Array.isArray(raw)) {
    entries = raw;
  } else if (typeof raw === 'string') {
    entries = parseStringDates(raw);
  } else if (typeof raw === 'object') {
    if (Array.isArray(raw.dates)) {
      entries = raw.dates;
    } else if (Array.isArray(raw.details)) {
      entries = raw.details;
    } else {
      entries = Object.values(raw);
    }
  }

  return entries
    .map(extractDateValue)
    .filter(Boolean)
    .map(formatInclusiveDate)
    .join(', ');
};

const getLogoSrc = (company) => {
  if (company.logoPreview) return company.logoPreview;
  if (company.logoBase64) return company.logoBase64;
  if (company.logo) return company.logo;
  return '';
};

const buildHtmlTemplate = ({ company, transaction, employee, qrDataUrl }) => {
  const nameParts = splitEmployeeName(employee, transaction);
  const office =
    employee?.department_name ||
    employee?.department ||
    transaction?.department ||
    company?.lguName ||
    '';
  const position =
    employee?.position_title ||
    employee?.position ||
    transaction?.position ||
    '';
  const salary =
    employee?.monthly_salary ||
    employee?.salary ||
    transaction?.salary ||
    '';
  const leaveTypeName = transaction?.leave_type_name || transaction?.leave_type || '';
  const leaveFlags = mapLeaveTypes(transaction);
  const inclusiveDates = buildInclusiveDates(transaction);
  const workingDays = transaction?.deductedcredit || transaction?.days || '';
  const commutation =
    (transaction?.commutation || '').toLowerCase() === 'requested';
  const recommendation = (transaction?.status || '').toLowerCase();
  const leavePurpose = transaction?.leavepurpose || '';
  const dateFiled =
    transaction?.createddate ||
    transaction?.created_date ||
    transaction?.datecreated ||
    transaction?.created_at ||
    transaction?.deductdate ||
    transaction?.date_created ||
    '';
  const approvedDateRaw =
    transaction?.approveddate ||
    transaction?.approved_date ||
    transaction?.dateapproved ||
    transaction?.approvaldate ||
    '';
  const approvedDateDisplay = formatAsOfDate(approvedDateRaw);
  const rawVacationBalance = pickFirstValue(
    transaction?.vl_balance,
    transaction?.balance_vl,
    transaction?.vlbal,
    transaction?.vl,
    transaction?.VL,
    employee?.vl_balance,
    employee?.balance_vl,
    employee?.vl,
    employee?.VL
  );
  const rawSickBalance = pickFirstValue(
    transaction?.sl_balance,
    transaction?.balance_sl,
    transaction?.slbal,
    transaction?.sl,
    transaction?.SL,
    employee?.sl_balance,
    employee?.balance_sl,
    employee?.sl,
    employee?.SL
  );
  const vacationLeaveBalance = formatLeaveBalance(rawVacationBalance);
  const sickLeaveBalance = formatLeaveBalance(rawSickBalance);
  const logoSrc = getLogoSrc(company);
  const hrmoName = company?.lguHrmo || '';
  const mayorName = company?.lguMayor || '';
  const qrHtml = qrDataUrl
    ? `<div style="text-align:right;margin-bottom:8px;"><img src="${qrDataUrl}" alt="QR Code" style="width:80px;height:80px;object-fit:contain;" /></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CS Form No. 6 — Application for Leave</title>
  <style>${CSS_STYLES}</style>
</head>
<body>
  <table>
    <tr>
      <td colspan="3" style="border: none;">
        <div class="form-info-block">
          <div>Civil Service Form No. 6</div>
          <div>Revised 2020</div>
        </div>
        <button class="print-button" onclick="window.print()" style="margin-bottom: 20px;">Print Form</button>
        <div class="header-container">
          <div class="logo-box">
            ${
              logoSrc
                ? `<img src="${logoSrc}" alt="Agency Logo" />`
                : '<div style="font-size:12px;color:#999;">No Logo</div>'
            }
          </div>
          <div class="center-group-global">
            <div class="top">Republic of the Philippines</div>
            <div class="bottom">${sanitize(
              company.lguDtrName || company.lguName || ''
            )}</div>
            <div class="agency">${sanitize(
              company.lguAddress || company.lguType || ''
            )}</div>
            <div class="extra-line">&nbsp;</div>
            <div class="extra-line">&nbsp;</div>
            <h1 class="form-title">APPLICATION FOR LEAVE</h1>
          </div>
          <div class="stamp-box">Stamp of Date of Receipt</div>
        </div>
        ${qrHtml}
      </td>
    </tr>

    <tr>
      <td colspan="3">
        <div style="display:flex; justify-content:space-between; gap:40px;">
          <div style="flex:1;">
            <span class="label">1. OFFICE/DEPARTMENT</span><br />
            <input type="text" value="${sanitize(office)}" readonly style="width:100%; text-align:center;" />
          </div>
          <div style="flex:1;">
            <span class="label">2. NAME (Last, First, Middle)</span>
            <div style="display:flex; gap:10px;">
              <input type="text" value="${nameParts.last}" readonly style="flex:1; text-align:center;" />
              <input type="text" value="${nameParts.first}" readonly style="flex:1; text-align:center;" />
              <input type="text" value="${nameParts.middle}" readonly style="flex:1; text-align:center;" />
            </div>
          </div>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="3">
        <div class="row-three">
          <div class="inline-field">
            <span class="label">3. DATE OF FILING</span>
            <input type="date" value="${formatInputDate(dateFiled)}" readonly />
          </div>
          <div class="inline-field">
            <span class="label">4. POSITION</span>
            <input type="text" value="${sanitize(position)}" readonly />
          </div>
          <div class="inline-field">
            <span class="label">5. SALARY</span>
            <input type="text" value="${sanitize(
              formatCurrency(salary) || salary
            )}" readonly />
          </div>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="3" style="text-align:center;font-weight:bold;">6. DETAILS OF APPLICATION</td>
    </tr>

    <tr>
      <td style="width: 56.5%; vertical-align: top;">
        <div style="padding-left:5px;">
          <span class="label">6.A TYPE OF LEAVE TO BE AVAILED OF</span>
          <div style="height:8px;"></div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label><input type="checkbox" ${leaveFlags.vacation ? 'checked' : ''} /> Vacation Leave <span class="small-note">(Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></label>
            <label><input type="checkbox" ${leaveFlags.mandatory ? 'checked' : ''} /> Mandatory/Forced Leave <span class="small-note">(Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></label>
            <label><input type="checkbox" ${leaveFlags.sick ? 'checked' : ''} /> Sick Leave <span class="small-note">(Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></label>
            <label><input type="checkbox" ${leaveFlags.maternity ? 'checked' : ''} /> Maternity Leave <span class="small-note">(R.A. No. 11210 / IRR issued by CSC, DOLE and SSS)</span></label>
            <label><input type="checkbox" ${leaveFlags.paternity ? 'checked' : ''} /> Paternity Leave <span class="small-note">(R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended)</span></label>
            <label><input type="checkbox" ${leaveFlags.specialPrivilege ? 'checked' : ''} /> Special Privilege Leave <span class="small-note">(Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></label>
            <label><input type="checkbox" ${leaveFlags.soloParent ? 'checked' : ''} /> Solo Parent Leave <span class="small-note">(RA No. 8972 / CSC MC No. 8, s. 2004)</span></label>
            <label><input type="checkbox" ${leaveFlags.study ? 'checked' : ''} /> Study Leave <span class="small-note">(Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></label>
            <label><input type="checkbox" ${leaveFlags.vawc ? 'checked' : ''} /> 10-Day VAWC Leave <span class="small-note">(RA No. 9262 / CSC MC No. 15, s. 2005)</span></label>
            <label><input type="checkbox" ${leaveFlags.rehabilitation ? 'checked' : ''} /> Rehabilitation Leave <span class="small-note">(Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292)</span></label>
            <label><input type="checkbox" ${leaveFlags.specialWomen ? 'checked' : ''} /> Special Leave Benefits for Women <span class="small-note">(RA No. 9710 / CSC MC No. 25, s. 2010)</span></label>
            <label><input type="checkbox" ${leaveFlags.specialEmergency ? 'checked' : ''} /> Special Emergency <span class="small-note">(CSC MC No. 2, s. 2012, as amended)</span></label>
            <label><input type="checkbox" ${leaveFlags.adoption ? 'checked' : ''} /> Adoption Leave <span class="small-note">(R.A. No. 8552)</span></label>
            <div style="margin-top:10px;">
              <span class="label">Others:</span>
              <div contenteditable="true" role="textbox" style="border-bottom:1px solid #000;min-height:1em;padding:4px 2px;background:#fff;">${
                !Object.values(leaveFlags).some(Boolean)
                  ? sanitize(leaveTypeName)
                  : ''
              }</div>
            </div>
          </div>
        </div>
      </td>
      <td style="width:43.5%;vertical-align:top;">
        <div style="padding-left:0;">
          <span class="label">6.B DETAILS OF LEAVE</span>
          <div style="height:12px;"></div>
          <span class="label">In case of Vacation/Special Privilege Leave:</span>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:5px;">
            <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" /> <span>In the morning only</span></label>
            <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" /> <span>Whole day</span></label>
          </div>
          <span class="label" style="margin-top:8px;display:block;">In case of Sick Leave:</span>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
            <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" /> <span>In Hospital (Specify Illness)</span></label>
            <div contenteditable="true" style="padding:4px 6px;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 1.8em,#000 1.8em,#000 1.9em);line-height:1.8em;min-height:1.8em;">${sanitize(
              leavePurpose
            )}</div>
            <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" /> <span>Out Patient (Specify Illness)</span></label>
            <div contenteditable="true" style="padding:4px 6px;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 1.8em,#000 1.8em,#000 1.9em);line-height:1.8em;min-height:1.8em;"></div>
          </div>
          <span class="label" style="margin-top:8px;display:block;">In case of Special Leave Benefits for Women:</span>
          <div contenteditable="true" style="padding:4px 6px;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 1.8em,#000 1.8em,#000 1.9em);line-height:1.8em;min-height:1.8em;"></div>
          <div style="height:8px;"></div>
          <label><input type="checkbox" /> Completion of Master's Degree</label>
          <label><input type="checkbox" /> BAR/Board Examination Review</label>
          <span class="label" style="margin-top:6px;display:block;">Other purpose:</span>
          <div contenteditable="true" style="padding:4px 6px;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 1.8em,#000 1.8em,#000 1.9em);line-height:1.8em;min-height:1.8em;">${sanitize(
            leavePurpose
          )}</div>
          <label style="margin-top:10px;"><input type="checkbox" /> Monetization of Leave Credits</label>
          <label><input type="checkbox" /> Terminal Leave</label>
        </div>
      </td>
    </tr>

    <tr>
      <td style="width:56.5%;vertical-align:top;">
        <div style="padding-left:5px;">
          <span class="label" style="display:block;margin-bottom:6px;">6.C NUMBER OF WORKING DAYS APPLIED FOR</span>
          <div contenteditable="true" style="padding:4px 6px;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 1.6em,#000 1.6em,#000 1.7em);line-height:1.6em;min-height:1.6em;">${sanitize(
            workingDays
          )}</div>
          <span class="label" style="display:block;margin:8px 0 4px;">INCLUSIVE DATES:</span>
          <div contenteditable="true" style="padding:4px 6px;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 1.6em,#000 1.6em,#000 1.7em);line-height:1.6em;min-height:1.6em;">${sanitize(
            inclusiveDates
          )}</div>
        </div>
      </td>
      <td style="width:43.5%;vertical-align:top;">
        <div style="padding-left:0;">
          <span class="label">6.D COMMUTATION</span>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
            <label><input type="checkbox" ${commutation ? '' : 'checked'} /> Not Requested</label>
            <label><input type="checkbox" ${commutation ? 'checked' : ''} /> Requested</label>
          </div>
          <div style="margin-top:16px;text-align:center;">
            <div contenteditable="true" style="display:inline-block;width:60%;height:1.8em;padding:2px 4px;line-height:1.8em;background:#fff;border-bottom:1px solid #000;white-space:nowrap;overflow:hidden;">${sanitize(
              nameParts.first
                ? `${nameParts.first} ${nameParts.middle} ${nameParts.last}`.trim()
                : ''
            )}</div>
            <div style="font-size:12px;margin-top:4px;">(Signature over printed name)</div>
          </div>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="3" style="text-align:center;font-weight:bold;">7. DETAILS OF ACTION ON APPLICATION</td>
    </tr>

    <tr>
      <td style="width:56.5%;vertical-align:top;">
        <div style="padding-left:5px;">
          <span class="label">7.A CERTIFICATION OF LEAVE CREDITS</span>
        </div>
        <div style="text-align:center;margin-top:8px;">
          <span style="font-weight:bold;">As of</span>
          <div contenteditable="true" style="display:inline-block;width:140px;height:1.8em;margin-left:6px;border-bottom:1px solid #000;line-height:1.8em;text-align:center;">
            ${sanitize(approvedDateDisplay)}
          </div>
        </div>
        <table class="certification-grid">
          <tr>
            <td></td>
            <td>Vacation Leave</td>
            <td>Sick Leave</td>
          </tr>
          <tr>
            <td>Total Earned</td>
            <td contenteditable="true">${sanitize(vacationLeaveBalance)}</td>
            <td contenteditable="true">${sanitize(sickLeaveBalance)}</td>
          </tr>
          <tr>
            <td>Less this application</td>
            <td contenteditable="true"></td>
            <td contenteditable="true"></td>
          </tr>
          <tr>
            <td>Balance</td>
            <td contenteditable="true"></td>
            <td contenteditable="true"></td>
          </tr>
        </table>
        <div style="margin-top:16px;text-align:center;">
          <div contenteditable="true" style="display:inline-block;width:60%;height:1.8em;padding:2px 4px;line-height:1.8em;background:#fff;border-bottom:1px solid #000;">
            ${sanitize(hrmoName)}
          </div>
          <div style="font-size:12px;margin-top:4px;">(Signature over printed name)</div>
        </div>
      </td>
      <td style="width:43.5%;vertical-align:top;">
        <div style="padding-left:0;">
          <span class="label">7.B RECOMMENDATION</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
          <label><input type="checkbox" ${
            recommendation === 'approved' || recommendation === 'for approval'
              ? 'checked'
              : ''
          } /> For approval</label>
          <label style="display:flex;align-items:flex-start;gap:6px;">
            <span style="white-space:nowrap;"><input type="checkbox" ${
              recommendation === 'returned' || recommendation === 'cancelled'
                ? 'checked'
                : ''
            } /> For disapproval due to</span>
            <div contenteditable="true" style="flex-grow:1;min-height:4em;padding:0 6px;border:none;background-image:repeating-linear-gradient(to bottom,#000 0px,#000 1px,transparent 1px,transparent 1.4em);line-height:1.4em;font-size:14px;white-space:pre-wrap;word-break:break-word;"></div>
          </label>
        </div>
        <div style="margin-top:48px;text-align:center;">
          <div contenteditable="true" style="display:inline-block;width:60%;height:1.8em;padding:2px 4px;line-height:1.8em;background:#fff;border-bottom:1px solid #000;"></div>
          <div style="font-size:12px;margin-top:4px;">(Signature over printed name)</div>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="3" style="padding:12px 8px;">
        <div style="display:flex;justify-content:space-between;gap:40px;font-weight:bold;font-size:14px;">
          <span>7.C APPROVED FOR:</span>
          <span>7.D DISAPPROVED DUE TO:</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div contenteditable="true" style="width:20%;height:1.4em;border-bottom:1px solid #000;"></div>
              <span>days with pay</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div contenteditable="true" style="width:20%;height:1.4em;border-bottom:1px solid #000;"></div>
              <span>days without pay</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div contenteditable="true" style="width:20%;height:1.4em;border-bottom:1px solid #000;"></div>
              <span>others (specify)</span>
            </div>
          </div>
          <div style="flex:1;">
            <div contenteditable="true" style="width:100%;height:4.5em;border-bottom:1px solid #000;"></div>
          </div>
        </div>
        <div style="margin-top:24px;text-align:center;">
          <div contenteditable="true" style="display:inline-block;width:60%;height:1.8em;padding:2px 4px;line-height:1.8em;background:#fff;border-bottom:1px solid #000;">
            ${sanitize(mayorName)}
          </div>
          <div style="font-size:12px;margin-top:4px;">(Authorized Official)</div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const fetchActiveDesignation = async (empObjId) => {
  if (!empObjId) return null;
  try {
    const response = await api.get('/employee-designations', {
      params: { status: 'active', search: '' }
    });
    const designations = response?.data?.data || [];
    return (
      designations.find(
        (d) => String(d.emp_objid) === String(empObjId) && Number(d.ispresent) === 1
      ) || null
    );
  } catch (error) {
    console.error('Failed to fetch designation for leave print:', error);
    return null;
  }
};

const mergeDesignationData = (employee, designation) => {
  if (!employee || !designation) return employee;
  return {
    ...employee,
    position_title: designation.position || employee.position_title || employee.position,
    salary:
      designation.salary ??
      employee.salary ??
      employee.rate ??
      employee.monthly_salary ??
      employee.SALARY,
    __designationLoaded: true
  };
};

const ensureDesignationData = async (employee, transaction) => {
  if (!employee) return null;
  if (employee.__designationLoaded) return employee;
  const empObjId = employee.objid || employee.emp_objid || transaction?.emp_objid;
  if (!empObjId) return employee;
  const designation = await fetchActiveDesignation(empObjId);
  return mergeDesignationData(employee, designation);
};

const getEmployeeFromTransaction = async (transaction) => {
  if (!transaction?.emp_objid) return null;
  try {
    const employeeResp = await api.get('/201-employees');
    const employees = employeeResp?.data?.data || [];
    const employee =
      employees.find((emp) => String(emp.objid) === String(transaction.emp_objid)) || null;
    if (!employee) return null;
    return await ensureDesignationData(employee, transaction);
  } catch (error) {
    console.error('Failed to fetch employees for leave print:', error);
    return null;
  }
};

export const openLeavePrintWindow = async (transaction, employee = null) => {
  if (!transaction) {
    console.warn('openLeavePrintWindow called without transaction');
    return;
  }

  let company = { ...defaultCompanyInfo };
  try {
    const response = await api.get('/company/info');
    if (response?.data?.success && response.data.data) {
      company = { ...company, ...response.data.data };
    }
  } catch (error) {
    console.error('Failed to fetch company info for leave print:', error);
  }

  let employeeInfo = employee;
  employeeInfo = employeeInfo || (await getEmployeeFromTransaction(transaction));
  employeeInfo = await ensureDesignationData(employeeInfo, transaction);

  let qrDataUrl = '';
  if (transaction?.leaveno) {
    try {
      qrDataUrl = await QRCode.toDataURL(String(transaction.leaveno), { width: 256, margin: 1 });
    } catch (error) {
      console.error('Failed to generate QR code for leave print:', error);
    }
  }

  const htmlString = buildHtmlTemplate({
    company,
    transaction,
    employee: employeeInfo,
    qrDataUrl
  });

  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    alert('Pop-up blocked. Please allow pop-ups to print.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlString);
  printWindow.document.close();

  printWindow.onload = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error('Failed to print leave application:', error);
    }
  };
};

export default openLeavePrintWindow;