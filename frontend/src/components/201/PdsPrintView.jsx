import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import PdsPrint from './PdsPrint';

const PdsPrintView = () => {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pdsData, setPdsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Get page parameter from URL, default to null (show all pages)
  const pageNumber = searchParams.get('page') ? parseInt(searchParams.get('page')) : null;

  useEffect(() => {
    const fetchPDSData = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/201-employees/pds/${employeeId}`);
        
        if (response.data.success) {
          setPdsData(response.data.data);
        } else {
          setError('Failed to load PDS data');
        }
      } catch (err) {
        console.error('Error fetching PDS data:', err);
        setError('Error loading PDS data');
      } finally {
        setLoading(false);
      }
    };

    if (employeeId) {
      fetchPDSData();
    }
  }, [employeeId]);

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    console.log('Close button clicked - navigating to 201-employees');
    try {
      // Navigate directly to 201-employees page
      navigate('/201-employees');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: use window location
      window.location.href = '/201-employees';
    }
  };

  const handleCloseAlternative = () => {
    console.log('Alternative close method - navigating to 201-employees');
    // Direct navigation to 201-employees
    window.location.href = '/201-employees';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading PDS data...</p>
        </div>
      </div>
    );
  }

  if (error || !pdsData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">Error</div>
          <p className="text-gray-600 mb-4">{error || 'PDS data not found'}</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const printStyles = `
    @media print {
      body * {
        visibility: hidden;
      }
      
      .print-content, .print-content * {
        visibility: visible;
      }
      
      .print-content {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
      
      .no-print {
        display: none !important;
      }
      
      @page {
        size: 8.5in 13in;
        margin: 0.25in;
      }
    }
    
    @media screen {
      .print-controls {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: white;
        border-bottom: 1px solid #ccc;
        padding: 10px 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .print-controls button {
        pointer-events: auto !important;
        cursor: pointer !important;
        z-index: 1001 !important;
        position: relative !important;
      }
      
      .print-preview {
        margin-top: 60px;
        padding: 20px;
      }
    }
  `;

  return (
    <div>
      <style>{printStyles}</style>
      
      {/* Print Controls - Hidden during print */}
      <div className="no-print print-controls">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">PDS Print Preview</h1>
          <div className="space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Print PDS
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Close button clicked - event:', e);
                handleClose();
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 cursor-pointer"
              type="button"
              style={{ zIndex: 9999, position: 'relative' }}
            >
              Close
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Alternative close button clicked');
                handleCloseAlternative();
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
              type="button"
              style={{ zIndex: 9999, position: 'relative' }}
            >
              X
            </button>
          </div>
        </div>
      </div>

      {/* Print Content */}
      <div className="print-content print-preview">
        <PdsPrint
          formData={pdsData.employee}
          children={pdsData.children}
          education={pdsData.education}
          civilServiceEligibility={pdsData.eligibility}
          workExperience={pdsData.workExperience}
          voluntaryWork={pdsData.voluntaryWork}
          trainings={pdsData.trainings}
          skills={pdsData.skills}
          recognitions={pdsData.recognitions}
          memberships={pdsData.memberships}
          declarations={pdsData.declarations}
          references={pdsData.references}
          governmentIds={pdsData.governmentIds}
          signatureData={pdsData.media?.signature}
          photoData={pdsData.media?.photo}
          thumbmarkData={pdsData.media?.thumb}
          dateAccomplished={pdsData.media?.date_accomplished}
          pageNumber={pageNumber}
        />
      </div>
    </div>
  );
};

export default PdsPrintView;
