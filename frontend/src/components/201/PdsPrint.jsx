import React from 'react';
import PdsPrintPage1 from './PdsPrintPage1';
import PdsPrintPage2 from './PdsPrintPage2';
import PdsPrintPage3 from './PdsPrintPage3';
import PdsPrintPage4 from './PdsPrintPage4';

const PdsPrint = ({ 
  formData, 
  children = [], 
  education = [], 
  civilServiceEligibility = [], 
  workExperience = [], 
  voluntaryWork = [], 
  trainings = [], 
  skills = [], 
  recognitions = [], 
  memberships = [], 
  declarations = {}, 
  references = [], 
  governmentIds = [], 
  signatureData = '', 
  photoData = '', 
  thumbmarkData = '', 
  dateAccomplished = '',
  pageNumber = null // null means show all pages, number means show only that page
}) => {
  
  // Helper function to display N/A for empty values
  const displayValue = (value) => {
    if (!value || value === '' || value === null || value === undefined || value === '0000-00-00') {
      return 'N/A';
    }
    return value;
  };

  // Helper function to format dates
  const formatDate = (dateString) => {
    if (!dateString || dateString === '' || dateString === '0000-00-00') {
      return 'N/A';
    }
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return displayValue(dateString);
    }
  };

  // Helper function to display boolean values as YES/NO
  const displayYesNo = (value) => {
    if (value === true || value === 'true' || value === 1) return 'YES';
    if (value === false || value === 'false' || value === 0) return 'NO';
    return 'N/A';
  };

  const styles = `
    @media print {
      @page {
        size: legal;
        margin: 0.5in;
      }
      
      body {
        font-family: Arial, sans-serif;
        font-size: 9pt;
        line-height: 1.2;
        margin: 0;
        padding: 0;
      }
      
      .page-break {
        page-break-after: always;
      }
      
      .no-page-break {
        page-break-inside: avoid;
      }
      
      .pds-container {
        width: 100%;
        max-width: none;
      }
      
      .pds-header {
        text-align: center;
        font-weight: bold;
        font-size: 10pt;
        margin-bottom: 20px;
        border-bottom: 2px solid black;
        padding-bottom: 10px;
      }
      
      .pds-header-main {
        text-align: center;
        margin-bottom: 20px;
      }
      
      .form-number {
        font-size: 10pt;
        font-weight: bold;
      }
      
      .form-revision {
        font-size: 9pt;
        font-weight: normal;
      }
      
      .form-title {
        font-size: 16pt;
        font-weight: bold;
        margin: 10px 0;
        text-transform: uppercase;
      }
      
      .warning-text {
        font-size: 9pt;
        margin: 10px 0;
        text-align: left;
      }
      
      .instructions-text {
        font-size: 9pt;
        margin: 10px 0;
        text-align: left;
        font-weight: normal;
      }
      
      .filling-guidelines {
        font-size: 9pt;
        margin: 10px 0;
        text-align: left;
      }
      
      .checkbox-field {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      
      .checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 5px;
      }
      
      .checked-box {
        color: black;
      }
      
      .unchecked-box {
        color: black;
      }
      
      .other-field {
        margin-top: 5px;
        font-size: 8pt;
      }
      
      .citizenship-fields {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      
      .dual-citizenship-details {
        margin-top: 10px;
        font-size: 8pt;
      }
      
      .checkbox {
        font-family: Arial, sans-serif;
        font-size: 12pt;
      }
      
      .pds-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 9pt;
      }
      
      .pds-table td, .pds-table th {
        border: 1px solid black;
        padding: 3px 4px;
        vertical-align: top;
      }
      
      .pds-table th {
        background-color: #f0f0f0;
        font-weight: bold;
        text-align: left;
      }
      
      .field-label {
        font-weight: bold;
        background-color: #f8f8f8;
        width: 25%;
      }
      
      .field-value {
        width: 75%;
      }
      
      .section-title {
        font-weight: bold;
        font-size: 10pt;
        background-color: #e0e0e0;
        text-align: center;
        padding: 5px;
        border: 1px solid black;
      }
      
      .yes-no-box {
        width: 20px;
        height: 15px;
        display: inline-block;
        border: 1px solid black;
        margin: 0 5px;
        text-align: center;
        padding-top: 1px;
      }
      
      .signature-box {
        width: 300px;
        height: 80px;
        border: 1px solid black;
        display: inline-block;
        margin: 5px;
      }
      
      .photo-box {
        width: 140px;
        height: 180px;
        border: 1px solid black;
        display: inline-block;
        text-align: center;
        padding: 5px;
      }
      
      .page-number {
        text-align: center;
        font-size: 8pt;
        margin-top: 20px;
      }
    }
    
    @media screen {
      body {
        font-family: Arial, sans-serif;
        font-size: 9pt;
        line-height: 1.2;
        margin: 20px;
      }
      
      .pds-container {
        width: 100%;
        max-width: 100%;
      }
      
      .pds-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 9pt;
      }
      
      .pds-table td, .pds-table th {
        border: 1px solid black;
        padding: 3px 4px;
        vertical-align: top;
      }
      
      .pds-table th {
        background-color: #f0f0f0;
        font-weight: bold;
        text-align: left;
      }
      
      .field-label {
        font-weight: bold;
        background-color: #f8f8f8;
        width: 25%;
      }
      
      .field-value {
        width: 75%;
      }
      
      .section-title {
        font-weight: bold;
        font-size: 10pt;
        background-color: #e0e0e0;
        text-align: center;
        padding: 5px;
        border: 1px solid black;
      }
      
      .pds-header-main {
        text-align: center;
        margin-bottom: 20px;
      }
      
      .form-number {
        font-size: 10pt;
        font-weight: bold;
      }
      
      .form-revision {
        font-size: 9pt;
        font-weight: normal;
      }
      
      .form-title {
        font-size: 16pt;
        font-weight: bold;
        margin: 10px 0;
        text-transform: uppercase;
      }
      
      .warning-text {
        font-size: 9pt;
        margin: 10px 0;
        text-align: left;
      }
      
      .instructions-text {
        font-size: 9pt;
        margin: 10px 0;
        text-align: left;
        font-weight: normal;
      }
      
      .filling-guidelines {
        font-size: 9pt;
        margin: 10px 0;
        text-align: left;
      }
      
      .checkbox-field {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      
      .checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 5px;
      }
      
      .checked-box {
        color: black;
      }
      
      .unchecked-box {
        color: black;
      }
      
      .other-field {
        margin-top: 5px;
        font-size: 8pt;
      }
      
      .citizenship-fields {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      
      .dual-citizenship-details {
        margin-top: 10px;
        font-size: 8pt;
      }
      
      .checkbox {
        font-family: Arial, sans-serif;
        font-size: 12pt;
      }
      
      .civil-status-layout {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      
      .civil-status-left {
        display: inline-block;
        width: 45%;
      }
      
      .civil-status-right {
        display: inline-block;
        width: 45%;
        margin-left: 10%;
      }
      
      .citizenship-layout {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      
      .citizenship-main {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      
      .dual-citizenship-sub {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-left: 20px;
      }
      
      .citizenship-instruction {
        font-size: 8pt;
        margin-top: 5px;
      }
      
      .citizenship-country {
        font-size: 8pt;
        margin-top: 2px;
      }
      
      .address-label-left {
        font-weight: bold;
        background-color: #f8f8f8;
        width: 25%;
      }
      
      .address-field-left {
        width: 25%;
      }
      
      .address-label-right {
        font-weight: bold;
        background-color: #f8f8f8;
        width: 25%;
      }
      
      .address-field-right {
        width: 25%;
      }
      
      .citizenship-span {
        vertical-align: top;
        height: 100%;
      }
      
      .residential-address-span {
        vertical-align: top;
        height: 100%;
      }
      
      .residential-address-layout {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 8pt;
      }
      
      .address-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1px;
      }
      
      .address-label {
        font-weight: bold;
        font-size: 7pt;
        min-width: 60px;
      }
      
      .address-value {
        flex: 1;
        font-size: 8pt;
        margin-left: 5px;
      }
      
      .residential-address-header {
        vertical-align: top;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      
      .zip-label-in-header {
        font-weight: bold;
        font-size: 8pt;
        text-align: center;
        margin-top: 5px;
      }
      
      .address-label-col4 {
        font-weight: bold;
        font-size: 8pt;
        text-align: center;
      }
      
      .address-label-col5 {
        font-weight: bold;
        font-size: 8pt;
        text-align: center;
      }
      
      .residential-address-content {
        vertical-align: top;
      }
      
      .zip-value-cell {
        font-weight: bold;
        text-align: center;
        vertical-align: middle;
      }
      
      .row-number {
        font-weight: bold;
        text-align: center;
        width: 30px;
        background-color: #f8f8f8;
      }
    }
  `;

  // Render specific page if pageNumber is specified, otherwise render all pages
  const renderPage = (pageNum) => {
    switch (pageNum) {
      case 1:
        return (
          <PdsPrintPage1 
            formData={formData}
            children={children}
            education={education}
            displayValue={displayValue}
            formatDate={formatDate}
          />
        );
      case 2:
        return (
          <PdsPrintPage2 
            formData={formData}
            civilServiceEligibility={civilServiceEligibility}
            workExperience={workExperience}
            displayValue={displayValue}
            formatDate={formatDate}
            displayYesNo={displayYesNo}
          />
        );
      case 3:
        return (
          <PdsPrintPage3 
            voluntaryWork={voluntaryWork}
            trainings={trainings}
            skills={skills}
            recognitions={recognitions}
            memberships={memberships}
            displayValue={displayValue}
            formatDate={formatDate}
          />
        );
      case 4:
        return (
          <PdsPrintPage4 
            declarations={declarations}
            references={references}
            governmentIds={governmentIds}
            signatureData={signatureData}
            photoData={photoData}
            thumbmarkData={thumbmarkData}
            dateAccomplished={dateAccomplished}
            displayValue={displayValue}
            displayYesNo={displayYesNo}
            formatDate={formatDate}
          />
        );
      default:
        // Render all pages if no specific page number
        return (
          <>
            <PdsPrintPage1 
              formData={formData}
              children={children}
              education={education}
              displayValue={displayValue}
              formatDate={formatDate}
            />
            
            {/* Page Break */}
            <div className="page-break"></div>
            
            <PdsPrintPage2 
              formData={formData}
              civilServiceEligibility={civilServiceEligibility}
              workExperience={workExperience}
              displayValue={displayValue}
              formatDate={formatDate}
              displayYesNo={displayYesNo}
            />
            
            {/* Page Break */}
            <div className="page-break"></div>
            
            <PdsPrintPage3 
              voluntaryWork={voluntaryWork}
              trainings={trainings}
              skills={skills}
              recognitions={recognitions}
              memberships={memberships}
              displayValue={displayValue}
              formatDate={formatDate}
            />
            
            {/* Page Break */}
            <div className="page-break"></div>
            
            <PdsPrintPage4 
              declarations={declarations}
              references={references}
              governmentIds={governmentIds}
              signatureData={signatureData}
              photoData={photoData}
              thumbmarkData={thumbmarkData}
              dateAccomplished={dateAccomplished}
              displayValue={displayValue}
              displayYesNo={displayYesNo}
              formatDate={formatDate}
            />
          </>
        );
    }
  };

  return (
    <div className="pds-container">
      <style>{styles}</style>
      {renderPage(pageNumber)}
    </div>
  );
};

export default PdsPrint;
