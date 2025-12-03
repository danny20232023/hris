"use client";

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import api from '../../utils/api';
import { formatEmployeeName } from '../../utils/employeenameFormatter';

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

const formatDate = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value || '';
  return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const formatTime = (value) => {
  if (!value) return '';
  const str = String(value);
  // Extract HH:MM from datetime string
  const match = str.match(/(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  return str;
};

const LocatorPrintTemplate = ({ locator, company }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Locator Slip - {locator.locatorno || ''}</title>
      <style>{`
        body {
          margin: 0;
          font-family: Arial, sans-serif;
        }
        .table-container {
          width: 90%;
          max-width: 1000px;
          margin: 20px auto 0 auto;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          margin-top: 30px;
          margin-bottom: 30px;
        }
        .header img {
          position: absolute;
          left: 0;
          max-width: 80px;
          height: auto;
        }
        .header h1 {
          font-family: Broadway, sans-serif;
          font-size: 2rem;
          margin: 0;
          text-align: center;
        }
        .bottom-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
          font-size: 1rem;
          font-family: 'Broadway', sans-serif;
          font-weight: bold;
          color: black;
          margin-bottom: 10px;
        }
        .bottom-line span:first-child {
          text-align: left;
          flex: 1;
        }
        .bottom-line span:last-child {
          text-align: right;
          flex: 1;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          text-align: center;
          margin-bottom: 20px;
          box-sizing: border-box;
        }
        th, td {
          border: 1px solid #333;
          padding: 8px 12px;
          vertical-align: middle;
        }
        th:first-child,
        td:first-child {
          text-align: left;
          padding-left: 12px;
        }
        th {
          background-color: White;
        }
        input {
          width: 90%;
          padding: 4px;
          box-sizing: border-box;
          border: none;
          background-color: transparent;
          outline: none;
          font-family: inherit;
          font-size: inherit;
          text-align: center;
        }
        input[type="date"] {
          text-align: center;
          font-family: inherit;
          font-size: inherit;
        }
        span {
          display: block;
          width: 100%;
          text-align: left;
          margin-bottom: 4px;
        }
        .center-label {
          text-align: center;
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
        @media print {
          .actions-bar {
            display: none;
          }
        }
        @media (max-width: 768px) {
          .header img {
            max-width: 60px;
          }
          .header h1 {
            font-size: 1.5rem;
          }
          .bottom-line {
            font-size: 0.9rem;
            margin-bottom: 10px;
          }
        }
      `}</style>
    </head>
    <body>
      <div className="actions-bar">
        <button type="button" className="btn" id="closePreviewBtn">Close</button>
        <button type="button" className="btn btn-print" id="printPreviewBtn">Print</button>
      </div>
      <div className="table-container">
        <div className="header">
          {company.logoPreview && (
            <img src={company.logoPreview} alt="Logo" />
          )}
          <h1>{company.lguName || 'Municipality of Dalaguete'}</h1>
        </div>

        <div className="bottom-line">
          <span>LOCATOR SLIP</span>
          <span>HRMO Form 01</span>
        </div>

        <table>
          <tr>
            <th>Office/Unit</th>
            <th>
              <input 
                type="text" 
                value={locator.employee_department_shortname || locator.employee_department_name || ''} 
                readOnly 
              />
            </th>
            <th>
              <span>Date:</span>
              <input 
                type="date" 
                value={locator.locatordate || ''} 
                readOnly 
              />
            </th>
          </tr>
          <tr>
            <td rowSpan="2">
              <span>Requesting Employee</span>
            </td>
            <td colSpan="2">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  value={locator.employee_name || ''} 
                  readOnly 
                  style={{ flex: 1 }} 
                />
                <input 
                  type="text" 
                  value={locator.employee_designation_name || ''} 
                  readOnly 
                  style={{ flex: 1 }} 
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <span className="center-label"><b>(Name)</b></span>
            </td>
            <td>
              <span className="center-label"><b>(Designation)</b></span>
            </td>
          </tr>
          <tr>
            <td>
              <span>Destination</span>
            </td>
            <td colSpan="2">
              <input 
                type="text" 
                value={locator.locdestination || ''} 
                readOnly 
              />
            </td>
          </tr>
          <tr>
            <td>
              <span>Purpose</span>
            </td>
            <td colSpan="2">
              <input 
                type="text" 
                value={locator.locpurpose || ''} 
                readOnly 
              />
            </td>
          </tr>
          <tr>
            <td>
              <span>Time</span>
            </td>
            <td>
              <span>Departure:</span>
              <input 
                type="text" 
                value={formatTime(locator.loctimedeparture) || ''} 
                readOnly 
              />
            </td>
            <td colSpan="2">
              <span>Estimated arrival back to station:</span>
              <input 
                type="text" 
                value={formatTime(locator.loctimearrival) || ''} 
                readOnly 
                style={{ width: '95%' }} 
              />
            </td>
          </tr>
          <tr>
            <td>
              <span>Requested By:</span>
              <input 
                type="text" 
                value={locator.createdby_employee_name || ''} 
                readOnly 
              />
            </td>
            <td colSpan="2">
              <span>Approved By:</span>
              <input 
                type="text" 
                value={locator.approvedby_employee_name || ''} 
                readOnly 
              />
            </td>
          </tr>
          <tr>
            <td>
              <span className="center-label"><b>(Employee)</b></span>
            </td>
            <td colSpan="2">
              <span className="center-label"><b>(Authorized Official)</b></span>
            </td>
          </tr>
        </table>
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

export const openLocatorPrintWindow = async (locator) => {
  if (!locator) {
    console.warn('Locator print invoked without locator data');
    return;
  }

  // Fetch full locator data with designation and department info
  // Use /print endpoint to bypass RBAC for printing own records
  let fullLocatorData = locator;
  try {
    const response = await api.get(`/employee-locators/${locator.objid}/print`);
    if (response?.data?.success && response.data.data) {
      fullLocatorData = { ...locator, ...response.data.data };
    }
  } catch (error) {
    console.error('Failed to load full locator data for print:', error);
    // Continue with partial data if fetch fails
  }

  let company = { ...defaultCompanyInfo };
  try {
    const response = await api.get('/company/info');
    if (response?.data?.success && response.data.data) {
      company = { ...company, ...response.data.data };
    }
  } catch (error) {
    console.error('Failed to load company info for locator print:', error);
  }

  const htmlString = `<!DOCTYPE html>${renderToStaticMarkup(
    <LocatorPrintTemplate locator={fullLocatorData} company={company} />
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

export default openLocatorPrintWindow;

