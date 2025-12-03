"use client";

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import api from '../../utils/api';
import QRCode from 'qrcode';

const defaultCompanyInfo = {
  lguDtrName: 'LGU',
  lguName: '',
  lguType: 'Municipal',
  lguAddress: '',
  lguContact: '',
  lguEmail: '',
  lguMayor: '',
  mayorEsigPreview: '',
  logoPreview: '',
};

const stripHtml = (value) => {
  if (!value) return '';
  if (typeof window !== 'undefined' && window.document) {
    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = value;
    return tempDiv.textContent || tempDiv.innerText || '';
  }
  return String(value).replace(/<[^>]*>/g, ' ');
};

const normalizeEmployeeName = (emp) => {
  const raw = emp?.name || emp?.fullname || emp?.display_name || '';
  if (!raw) return null;
  const sanitized = raw.split(':')[0]?.trim();
  if (!sanitized) return null;
  const [lastPart, restPart = ''] = sanitized.split(',');
  const last = (lastPart || '').trim();
  const first = restPart.trim().split(/\s+/)[0] || '';
  if (!last && !first) return null;
  const upperLast = last.toUpperCase();
  const upperFirst = first.toUpperCase();
  const departmentshortname = emp?.departmentshortname || '';
  return {
    boldHtml: `<strong>${upperLast}${upperFirst ? `, ${upperFirst}` : ''}</strong>`,
    plainText: `${upperLast}${upperFirst ? `, ${upperFirst}` : ''}`,
    departmentshortname: departmentshortname,
  };
};

const formatEmployeeNames = (employees = []) => {
  if (!Array.isArray(employees) || employees.length === 0) {
    return { namesHtml: '', namesPlain: '' };
  }

  const formatted = employees
    .map((emp) => normalizeEmployeeName(emp))
    .filter(Boolean);

  if (!formatted.length) {
    return { namesHtml: '', namesPlain: '' };
  }

  const joinWithOxford = (items) => {
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  };

  const htmlParts = formatted.map((f) => f.boldHtml);
  const plainParts = formatted.map((f) => f.plainText);

  return {
    namesHtml: joinWithOxford(htmlParts),
    namesPlain: plainParts.join('; '),
  };
};

const toDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [mm, dd, yyyy] = value.split('/');
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatLongDate = (value) => {
  const dt = toDate(value);
  if (!dt) return value || '';
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatDatesSentence = (dates = []) => {
  if (!Array.isArray(dates) || dates.length === 0) return '';
  const formatted = dates.map((d) => formatLongDate(d)).filter(Boolean);
  if (!formatted.length) return '';
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
};

const getOrdinal = (n) => {
  const value = Number(n);
  if (!Number.isInteger(value)) return '';
  const modTen = value % 10;
  const modHundred = value % 100;
  if (modTen === 1 && modHundred !== 11) return `${value}st`;
  if (modTen === 2 && modHundred !== 12) return `${value}nd`;
  if (modTen === 3 && modHundred !== 13) return `${value}rd`;
  return `${value}th`;
};

const formatIssueDate = (dateValue) => {
  const dt = toDate(dateValue);
  if (!dt) return '';
  const dayWithOrdinal = getOrdinal(dt.getDate());
  const month = dt.toLocaleDateString('en-US', { month: 'long' });
  const year = dt.getFullYear();
  return `${dayWithOrdinal} of ${month}, ${year}`;
};

const resolveMayorTitle = (type) => {
  switch (type) {
    case 'Province':
      return 'Provincial Governor';
    case 'National':
      return 'Agency Head';
    default:
      return 'Municipal Mayor';
  }
};

const resolveOfficeTitle = (type) => {
  switch (type) {
    case 'Province':
      return 'Office of the Provincial Governor';
    case 'National':
      return 'Office of the Agency Head';
    default:
      return 'Office of the Municipal Mayor';
  }
};

const TravelPrintTemplate = ({ travel, company, meta }) => (
  <html>
    <head>
      <meta charSet="utf-8" />
      <title>{`Travel Authorization - ${travel.travelno || ''}`}</title>
      <style>{`
        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Times New Roman', serif;
          margin: 0;
          background: #f7f7f7;
        }
        .actions-bar {
          position: sticky;
          top: 0;
          background: #f7f7f7;
          padding: 0.5in 0.9in;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .btn {
          font-family: 'Inter', sans-serif;
          font-size: 10pt;
          padding: 0.35rem 0.8rem;
          border-radius: 6px;
          border: 1px solid #1f2937;
          cursor: pointer;
          background-color: #fff;
          color: #1f2937;
        }
        .btn-print {
          background-color: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .btn:hover {
          opacity: 0.9;
        }
        .page {
          width: 8.5in;
          min-height: 11in;
          padding: 0.85in 0.9in;
          margin: 0.5in auto;
          background: #ffffff;
          color: #000;
          border: 1px solid #d0d0d0;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .logo {
          flex: 0 0 90px;
        }
        .logo img {
          max-width: 90px;
          max-height: 90px;
        }
        .header-text {
          flex: 1;
          text-align: center;
          line-height: 1.4;
        }
        .header-text .rep {
          font-size: 12pt;
          font-weight: 600;
          text-transform: uppercase;
        }
        .header-text .lgu-name {
          font-size: 14pt;
          font-weight: 700;
          text-transform: uppercase;
        }
        .header-text .office-title {
          font-size: 13pt;
          font-weight: 700;
          margin-top: 0.2rem;
        }
        .header-text .contact-line {
          font-size: 11pt;
          color: #1f2937;
        }
        .divider {
          border-top: 2px solid #111;
          margin: 0.5rem 0 1.1rem;
        }
        .travel-no {
          font-size: 11pt;
          margin-bottom: 1.4rem;
        }
        .title {
          text-align: center;
          font-size: 15pt;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-bottom: 1.8rem;
        }
        .subheading {
          text-align: center;
          font-size: 11pt;
          font-weight: 700;
          margin-bottom: 1.4rem;
        }
        .subheading.left {
          text-align: left;
        }
        .body-text {
          font-size: 12pt;
          text-align: justify;
          margin-bottom: 1rem;
        }
        .employee-list {
          font-size: 12pt;
          margin-top: 1rem;
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .employee-list div {
          margin-bottom: 0.5rem;
        }
        .issued {
          font-size: 12pt;
          margin-top: 2rem;
        }
        .signature {
          text-align: right;
          margin-top: 3rem;
        }
        .signature img {
          max-height: 90px;
          margin-bottom: 0.5rem;
        }
        .signature-text {
          display: inline-block;
          text-align: center;
        }
        .signature-text .name {
          font-size: 12pt;
          font-weight: 700;
          text-transform: uppercase;
        }
        .signature-text .title {
          font-size: 11pt;
        }
        .footer {
          margin-top: 2rem;
          display: flex;
          align-items: flex-end;
          justify-content: flex-start;
          gap: 1.5rem;
        }
        .qr-block {
          text-align: left;
        }
        .qr-block img {
          width: 110px;
          height: 110px;
          object-fit: contain;
        }
        .qr-caption {
          font-size: 9pt;
          margin-top: 0.25rem;
          color: #4b5563;
        }
        .approval-seal {
          margin-left: auto;
          text-align: right;
        }
        .approval-seal svg {
          width: 140px;
          height: 140px;
        }
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            background: #ffffff;
          }
          .actions-bar {
            display: none;
          }
          .page {
            width: 210mm;
            min-height: 297mm;
            margin: auto;
            border: none;
            box-shadow: none;
            padding: 22mm 23mm;
          }
        }
      `}</style>
    </head>
    <body>
      <div className="actions-bar">
        <button type="button" className="btn" id="closePreviewBtn">Close</button>
        <button type="button" className="btn btn-print" id="printPreviewBtn">Print</button>
      </div>
      <div className="page">
        <header className="header">
          <div className="logo">
            {meta.logoSrc ? <img src={meta.logoSrc} alt="LGU Logo" /> : null}
          </div>
          <div className="header-text">
            <div className="rep">Republic of the Philippines</div>
            {meta.headerLocation ? <div className="contact-line">{meta.headerLocation}</div> : null}
            {company.lguName ? <div className="lgu-name">Munipality of Dalaguete</div> : null}
            <div className="office-title">{meta.officeTitle}</div>
            {company.lguContact ? <div className="contact-line">Telephone No. {company.lguContact}</div> : null}
            {company.lguEmail ? <div className="contact-line">{company.lguEmail}</div> : null}
          </div>
        </header>
        <div className="divider" />
        <div className="travel-no">
          Travel Order No.: <strong>{travel.travelno || '—'}</strong>
        </div>
        <div className="title">AUTHORIZATION TO TRAVEL</div>
        <div className="subheading left">TO WHOM IT MAY CONCERN</div>
        <p className="body-text">
          This is to authorize the following personnel to travel on official business on{' '}
          {meta.datesSentence || '________________'}{' '}
          {meta.purposePlain || '________________'}{' '}
          at {travel.traveldestination || '________________'}.
        </p>
        <div className="employee-list">
          {travel?.employees && Array.isArray(travel.employees) && travel.employees.length > 0 ? (
            travel.employees.map((emp, index) => {
              const normalized = normalizeEmployeeName(emp);
              if (!normalized) return null;
              const deptName = normalized.departmentshortname ? ` (${normalized.departmentshortname})` : '';
              return (
                <div key={index}>
                  {index + 1}. {normalized.plainText}{deptName}
                </div>
              );
            })
          ) : (
            <div style={{ fontStyle: 'italic', color: '#666' }}>
              1. ________________
            </div>
          )}
        </div>
        <p className="issued">
          Issued this {meta.issueDate || formatIssueDate(new Date())} at {meta.issuePlace || '________________'}.
        </p>
        <div className="department-head-signature" style={{ marginTop: '2rem', display: 'inline-block', width: 'fit-content' }}>
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: '12pt', fontWeight: 700, textTransform: 'uppercase' }}>
              {meta.departmentHead || '_____________'}
            </div>
            {meta.designationType && (
              <div style={{ fontSize: '11pt', marginTop: '0.25rem', textAlign: 'center' }}>
                {meta.designationType}
              </div>
            )}
          </div>
        </div>
        <div className="signature" align="right">
          {meta.mayorEsig ? <img src={meta.mayorEsig} alt="Mayor Electronic Signature" /> : null}
          <div className="signature-text">
            <div className="name">{company.lguMayor || '________________'}</div>
            <div className="title">{meta.mayorTitle}</div>
          </div>
        </div>
        <div className="footer">
          {meta.qrDataUrl ? (
            <div className="qr-block">
              <img src={meta.qrDataUrl} alt={`QR code for ${travel.travelno || 'Travel Record'}`} />
              <div className="qr-caption">
                Travel No.: {travel.travelno || '—'}
              </div>
            </div>
          ) : null}
          {meta.isApproved ? (
            <div className="approval-seal">
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <path id="seal-top-arc" d="M24 100 A76 76 0 0 0 176 100" />
                  <path id="seal-bottom-arc" d="M24 100 A76 76 0 0 1 176 100" />
                </defs>
                <circle cx="100" cy="100" r="90" fill="none" stroke="#15803d" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="100" cy="100" r="70" fill="none" stroke="#15803d" strokeWidth="3" strokeDasharray="8 6" opacity="0.8"/>
                <text fill="#15803d" fontFamily="'Times New Roman', serif" fontSize="13" fontWeight="700" letterSpacing="2">
                  <textPath startOffset="50%" textAnchor="middle" href="#seal-top-arc" dy="-4">MUNICIPALITY OF DALAGUETE</textPath>
                </text>
                <text fill="#15803d" fontFamily="'Times New Roman', serif" fontSize="13" fontWeight="700" letterSpacing="2">
                  <textPath startOffset="50%" textAnchor="middle" href="#seal-bottom-arc" dy="12">TRAVEL ORDER</textPath>
                </text>
                <rect x="40" y="88" width="120" height="24" rx="12" fill="#15803d" opacity="0.12" />
                <text x="100" y="106" fill="#15803d" fontFamily="'Times New Roman', serif" fontSize="28" fontWeight="700" textAnchor="middle" letterSpacing="4">APPROVED</text>
              </svg>
            </div>
          ) : null}
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              function bindActions() {
                var printBtn = document.getElementById('printPreviewBtn');
                var closeBtn = document.getElementById('closePreviewBtn');
                if (printBtn) {
                  printBtn.addEventListener('click', function () {
                    window.print();
                  });
                }
                if (closeBtn) {
                  closeBtn.addEventListener('click', function () {
                    window.close();
                  });
                }
              }
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bindActions);
              } else {
                bindActions();
              }
            })();
          `,
        }}
      />
    </body>
  </html>
);

const buildMeta = (travel, company, qrDataUrl) => {
  const { namesHtml = '', namesPlain = '' } = formatEmployeeNames(travel?.employees);

  const travelDatesArray = travel?.travel_dates
    ? String(travel.travel_dates)
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

  const datesSentence = formatDatesSentence(travelDatesArray);
  const datesList = travelDatesArray.map((d) => formatLongDate(d)).filter(Boolean).join('; ');

  const purposeText = travel?.purpose || ''; // Keep HTML formatting if present
  const purposePlain = stripHtml(travel?.purpose)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, ''); // Remove trailing periods for sentence composition
  const purposeSentence = purposePlain
    ? purposePlain.endsWith('.')
      ? purposePlain
      : `${purposePlain}.`
    : '';

  const issueDate = formatIssueDate(travel?.createddate);
  const mayorTitle = resolveMayorTitle(company?.lguType);
  const officeTitle = resolveOfficeTitle(company?.lguType);

  // Get department head and designation type from first employee's department
  const firstEmployee = travel?.employees && Array.isArray(travel.employees) && travel.employees.length > 0
    ? travel.employees[0]
    : null;
  const departmentHead = firstEmployee?.officehead || '';
  const designationType = firstEmployee?.designationtype || '';
  
  // Debug: Log to verify officehead and designationtype are available
  if (firstEmployee) {
    console.log('[Travel Print] First employee:', firstEmployee);
    console.log('[Travel Print] Office head:', departmentHead);
    console.log('[Travel Print] Designation type:', designationType);
  }

  return {
    logoSrc: company?.logoPreview || '',
    mayorEsig: company?.mayorEsigPreview || '',
    employeeNamesHtml: namesHtml,
    employeeNamesPlain: namesPlain,
    datesSentence,
    datesList,
    purposeText, // HTML version
    purposePlain, // Plain text version
    purposeSentence,
    issueDate,
    issuePlace: company?.lguAddress || company?.lguName || '',
    mayorTitle,
    officeTitle,
    headerLocation: company?.lguAddress || '',
    qrDataUrl: qrDataUrl || '',
    isApproved: String(travel?.travelstatus || '').toLowerCase() === 'approved',
    departmentHead,
    designationType,
  };
};

export const openTravelPrintWindow = async (travel) => {
  if (!travel) {
    console.warn('Travel print invoked without travel data');
    return;
  }

  let company = { ...defaultCompanyInfo };
  try {
    const response = await api.get('/company/info');
    if (response?.data?.success && response.data.data) {
      company = { ...company, ...response.data.data };
    }
  } catch (error) {
    console.error('Failed to load company info for travel print:', error);
  }

  let qrDataUrl = '';
  if (travel?.travelno) {
    try {
      qrDataUrl = await QRCode.toDataURL(String(travel.travelno), { width: 256, margin: 1 });
    } catch (error) {
      console.error('Failed to generate QR code for travel print:', error);
    }
  }

  const meta = buildMeta(travel, company, qrDataUrl);
  const htmlString = `<!DOCTYPE html>${renderToStaticMarkup(
    <TravelPrintTemplate travel={travel} company={company} meta={meta} />
  )}`;

  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    alert('Pop-up blocked. Please allow pop-ups to print.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlString);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    try {
      printWindow.focus();
    } catch (error) {
      console.error('Failed to focus print window:', error);
    }
  };
};

export default openTravelPrintWindow;

