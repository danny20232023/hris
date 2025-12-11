import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

const Plantilla201 = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = '201-plantilla';
  
  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  
  const [plantillaRecords, setPlantillaRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [vacantFilter, setVacantFilter] = useState('all');
  const [lguPlantillaFilter, setLguPlantillaFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState([]);
  
  // Form state
  const [formData, setFormData] = useState({
    plantilla_no: '',
    position_title: '',
    plantilla_cscitemno: '',
    position_shortname: '',
    level: '',
    salarygrade: '',
    islguplantilla: 0,
    eligibilities: '',
    experiences: '',
    educations: '',
    trainings: '',
    competencies: '',
    supporting_id: '',
    department_id: '',
    plantillastatus: 'New'
  });
  
  // Fetch plantilla records
  const fetchPlantilla = async () => {
    try {
      setLoading(true);
      const response = await api.get('/201-plantilla', {
        params: {
          page: currentPage,
          limit: recordsPerPage,
          search: searchTerm,
          department: departmentFilter,
          vacant: vacantFilter,
          islguplantilla: lguPlantillaFilter
        }
      });
      
      setPlantillaRecords(response.data.data || []);
      setTotalRecords(response.data.pagination?.total || 0);
      setTotalPages(response.data.pagination?.totalPages || 0);
    } catch (error) {
      console.error('Error fetching plantilla records:', error);
      alert('Failed to load plantilla records');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch departments for dropdown
  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };
  
  useEffect(() => {
    if (canRead) {
      fetchPlantilla();
      fetchDepartments();
    }
  }, [currentPage, recordsPerPage, searchTerm, departmentFilter, vacantFilter, lguPlantillaFilter, canRead]);
  
  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };
  
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, vacantFilter, lguPlantillaFilter, recordsPerPage]);
  
  // View handler
  const handleView = async (record) => {
    try {
      const response = await api.get(`/201-plantilla/${record.id}`);
      setSelectedRecord(response.data.data);
      setShowViewModal(true);
    } catch (error) {
      console.error('Error fetching plantilla details:', error);
      alert('Failed to load plantilla details');
    }
  };
  
  // Edit handler
  const handleEdit = async (record) => {
    if (!canUpdate) {
      alert('You do not have permission to edit plantilla records.');
      return;
    }
    try {
      const response = await api.get(`/201-plantilla/${record.id}`);
      const data = response.data.data;
      
      setFormData({
        plantilla_no: data.plantilla_no || data.plantillano || '',
        position_title: data.position_title || data.position || '',
        plantilla_cscitemno: data.plantilla_cscitemno || data.positioncode || '',
        position_shortname: data.position_shortname || '',
        level: data.level ? String(data.level) : '',
        salarygrade: data.salarygrade ? String(data.salarygrade).padStart(2, '0') : '',
        islguplantilla: data.islguplantilla !== undefined ? (data.islguplantilla ? 1 : 0) : 0,
        eligibilities: data.eligibilities || '',
        experiences: data.experiences || '',
        educations: data.educations || '',
        trainings: data.trainings || '',
        competencies: data.competencies || '',
        supporting_id: data.supporting_id || data.supportingid || '',
        department_id: data.department_id ? String(data.department_id) : '',
        plantillastatus: data.plantillastatus || 'New'
      });
      setSelectedRecord(record);
      setShowEditModal(true);
    } catch (error) {
      console.error('Error fetching plantilla details:', error);
      alert('Failed to load plantilla details');
    }
  };
  
  // Delete handler
  const handleDelete = async (record) => {
    if (!canDelete) {
      alert('You do not have permission to delete plantilla records.');
      return;
    }
    const positionTitle = record.position_title || record.position || 'this record';
    if (window.confirm(`Are you sure you want to delete plantilla record for "${positionTitle}"?`)) {
      try {
        await api.delete(`/201-plantilla/${record.id}`);
        fetchPlantilla();
        alert('Plantilla record deleted successfully');
      } catch (error) {
        console.error('Error deleting plantilla record:', error);
        alert('Failed to delete plantilla record');
      }
    }
  };
  
  // Print handler
  const handlePrint = (record) => {
    const positionTitle = record.position_title || record.position || 'N/A';
    const printWindow = window.open('', '_blank');
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Plantilla - ${positionTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 20px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Plantilla</h2>
            <p><strong>Position Title:</strong> ${positionTitle}</p>
          </div>
          <table>
            <tr><th>Field</th><th>Value</th></tr>
            <tr><td>Plantilla No.</td><td>${record.plantilla_no || record.plantillano || 'N/A'}</td></tr>
            <tr><td>Position Title</td><td>${positionTitle}</td></tr>
            <tr><td>Position Short Name</td><td>${record.position_shortname || 'N/A'}</td></tr>
            <tr><td>CSC Item No.</td><td>${record.plantilla_cscitemno || record.positioncode || 'N/A'}</td></tr>
            <tr><td>Level</td><td>${record.level}</td></tr>
            <tr><td>Salary Grade</td><td>${record.salarygrade || 'N/A'}</td></tr>
            <tr><td>Eligibilities</td><td>${record.eligibilities || 'N/A'}</td></tr>
            <tr><td>Experiences</td><td>${record.experiences || 'N/A'}</td></tr>
            <tr><td>Educations</td><td>${record.educations || 'N/A'}</td></tr>
            <tr><td>Trainings</td><td>${record.trainings || 'N/A'}</td></tr>
            <tr><td>Competencies</td><td>${record.competencies || 'N/A'}</td></tr>
            <tr><td>Supporting ID</td><td>${record.supporting_id || record.supportingid || 'N/A'}</td></tr>
            <tr><td>Status</td><td>${record.plantillastatus}</td></tr>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };
  
  // Create handler
  const handleCreate = () => {
    if (!canCreate) {
      alert('You do not have permission to create plantilla records.');
      return;
    }
    setFormData({
      plantilla_no: '',
      position_title: '',
      plantilla_cscitemno: '',
      position_shortname: '',
      level: '',
      salarygrade: '',
      islguplantilla: 0,
      eligibilities: '',
      experiences: '',
      educations: '',
      trainings: '',
      competencies: '',
      supporting_id: '',
      department_id: '',
      plantillastatus: 'New'
    });
    setSelectedRecord(null);
    setShowCreateModal(true);
  };
  
  // Save handler
  const handleSave = async () => {
    // Frontend validation - check all required fields
    const errors = [];
    
    if (!formData.position_title || !formData.position_title.trim()) {
      errors.push('Position Title');
    }
    if (!formData.level || formData.level === '') {
      errors.push('Level');
    }
    if (!formData.salarygrade || formData.salarygrade === '') {
      errors.push('Salary Grade');
    }
    
    if (errors.length > 0) {
      alert(`Please fill in the following required fields:\n${errors.join('\n')}`);
      return;
    }
    
    // Prepare data for submission
    const submitData = {
      plantilla_no: formData.plantilla_no || null,
      position_title: formData.position_title.trim(),
      plantilla_cscitemno: formData.plantilla_cscitemno || null,
      position_shortname: formData.position_shortname || null,
      level: parseInt(formData.level),
      salarygrade: String(formData.salarygrade).padStart(2, '0'),
      islguplantilla: formData.islguplantilla ? 1 : 0,
      eligibilities: formData.eligibilities || null,
      experiences: formData.experiences || null,
      educations: formData.educations || null,
      trainings: formData.trainings || null,
      competencies: formData.competencies || null,
      supporting_id: formData.supporting_id ? parseInt(formData.supporting_id) : null,
      department_id: formData.department_id ? parseInt(formData.department_id) : null,
      plantillastatus: formData.plantillastatus || 'New'
    };
    
    try {
      setSaving(true);
      if (selectedRecord) {
        // Update
        await api.put(`/201-plantilla/${selectedRecord.id}`, submitData);
        alert('Plantilla record updated successfully');
        setShowEditModal(false);
      } else {
        // Create
        await api.post('/201-plantilla', submitData);
        alert('Plantilla record created successfully');
        setShowCreateModal(false);
      }
      setSelectedRecord(null);
      fetchPlantilla();
    } catch (error) {
      console.error('Error saving plantilla record:', error);
      alert(error.response?.data?.message || 'Failed to save plantilla record');
    } finally {
      setSaving(false);
    }
  };
  
  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '₱0.00';
    return `₱${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          Loading permissions...
        </div>
      </div>
    );
  }
  
  if (!canRead) {
    return (
      <div className="p-6">
        <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
          You do not have permission to view plantilla records.
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 p-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-md shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Position Title, Position Short Name, Plantilla No..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.deptid} value={dept.deptid}>
                  {dept.departmentshortname || dept.departmentname || `Dept ${dept.deptid}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vacant</label>
            <select
              value={vacantFilter}
              onChange={(e) => setVacantFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LGU Plantilla</label>
            <select
              value={lguPlantillaFilter}
              onChange={(e) => setLguPlantillaFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">ALL</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
        </div>
        {canCreate && (
          <div className="flex justify-end mt-4">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Add Plantilla
            </button>
          </div>
        )}
      </div>
      
      {/* Data Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : plantillaRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No plantilla records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plantilla No.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SG</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vacant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LGU Plantilla</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {plantillaRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {record.position_title || record.position || 'N/A'}
                      {record.position_shortname && (
                        <span className="text-gray-500"> ({record.position_shortname})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{record.plantilla_no || record.plantillano || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {record.department_shortname ? (
                        <span
                          className="cursor-help"
                          title={record.department_name || record.department_shortname}
                        >
                          {record.department_shortname}
                        </span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{record.level}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{record.salarygrade || 'N/A'}</td>
                     <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                       {record.active_salary_rate ? (
                         <span
                           className="cursor-help"
                           title={record.active_tranche_name && record.active_tranche_implement_year
                             ? `Tranche: ${record.active_tranche_name}\nImplement Year: ${record.active_tranche_implement_year}`
                             : 'Active Tranche Information'}
                         >
                           ₱{parseFloat(record.active_salary_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </span>
                       ) : (
                         'N/A'
                       )}
                     </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        record.isvacant === 1
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {record.isvacant === 1 ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center">
                        <div
                          className={`relative inline-flex h-5 w-9 items-center rounded-full ${
                            record.islguplantilla === 1 ? 'bg-indigo-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              record.islguplantilla === 1 ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </div>
                        <span className="ml-2 text-xs text-gray-700">
                          {record.islguplantilla === 1 ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        {canRead && (
                          <button
                            onClick={() => handleView(record)}
                            className="text-indigo-600 hover:text-indigo-800 transition-colors"
                            title="View Plantilla"
                          >
                            👁️
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            onClick={() => handleEdit(record)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Edit Plantilla"
                          >
                            ✏️
                          </button>
                        )}
                        {canRead && (
                          <button
                            onClick={() => handlePrint(record)}
                            className="text-green-600 hover:text-green-800 transition-colors"
                            title="Print Plantilla"
                          >
                            🖨️
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(record)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete Plantilla"
                          >
                            🗑️
                          </button>
                        )}
                        {!canRead && !canUpdate && !canDelete && (
                          <span className="text-xs text-gray-400">No actions available</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination */}
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
      
      {/* View Modal */}
      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Plantilla Details</h3>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedRecord(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><strong>Plantilla No.:</strong> {selectedRecord.plantilla_no || selectedRecord.plantillano || 'N/A'}</div>
                <div><strong>Position Title:</strong> {selectedRecord.position_title || selectedRecord.position || 'N/A'}</div>
                <div><strong>Position Short Name:</strong> {selectedRecord.position_shortname || 'N/A'}</div>
                <div><strong>CSC Item No.:</strong> {selectedRecord.plantilla_cscitemno || selectedRecord.positioncode || 'N/A'}</div>
                <div><strong>Level:</strong> {selectedRecord.level}</div>
                <div><strong>Salary Grade:</strong> {selectedRecord.salarygrade || 'N/A'}</div>
                <div><strong>Department:</strong> {selectedRecord.department_name || 'N/A'}</div>
                <div className="col-span-2"><strong>Eligibilities:</strong> {selectedRecord.eligibilities || 'N/A'}</div>
                <div className="col-span-2"><strong>Experiences:</strong> {selectedRecord.experiences || 'N/A'}</div>
                <div className="col-span-2"><strong>Educations:</strong> {selectedRecord.educations || 'N/A'}</div>
                <div className="col-span-2"><strong>Trainings:</strong> {selectedRecord.trainings || 'N/A'}</div>
                <div className="col-span-2"><strong>Competencies:</strong> {selectedRecord.competencies || 'N/A'}</div>
                <div><strong>Supporting ID:</strong> {selectedRecord.supporting_id || selectedRecord.supportingid || 'N/A'}</div>
                <div><strong>Status:</strong> {selectedRecord.plantillastatus}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">
                  {showEditModal ? 'Edit Plantilla' : 'Create Plantilla'}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setSelectedRecord(null);
                    setFormData({
                      plantilla_no: '',
                      position_title: '',
                      plantilla_cscitemno: '',
                      position_shortname: '',
                      level: '',
                      salarygrade: '',
                      islguplantilla: 0,
                      eligibilities: '',
                      experiences: '',
                      educations: '',
                      trainings: '',
                      competencies: '',
                      supporting_id: '',
                      department_id: '',
                      plantillastatus: 'New'
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                {/* First row: Plantilla No, CSC Item No */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla No.</label>
                    <input
                      type="text"
                      value={formData.plantilla_no}
                      onChange={(e) => setFormData({ ...formData, plantilla_no: e.target.value })}
                      placeholder="01-33"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CSC Item No.</label>
                    <input
                      type="text"
                      value={formData.plantilla_cscitemno}
                      onChange={(e) => setFormData({ ...formData, plantilla_cscitemno: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                {/* Second row: Position Title (full width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position Title *</label>
                  <input
                    type="text"
                    value={formData.position_title}
                    onChange={(e) => setFormData({ ...formData, position_title: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Third row: Position Short Name (full width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position Short Name</label>
                  <input
                    type="text"
                    value={formData.position_shortname}
                    onChange={(e) => setFormData({ ...formData, position_shortname: e.target.value })}
                    maxLength={35}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Department (full width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.deptid} value={dept.deptid}>
                        {dept.departmentname}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Fourth row: Level, Salary Grade */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Level *</label>
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select Level</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salary Grade *</label>
                    <select
                      value={formData.salarygrade}
                      onChange={(e) => setFormData({ ...formData, salarygrade: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select Salary Grade</option>
                      {Array.from({ length: 35 }, (_, i) => {
                        const grade = String(i + 1).padStart(2, '0');
                        return (
                          <option key={grade} value={grade}>
                            {grade}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                
                {/* LGU Plantilla Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LGU Plantilla</label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, islguplantilla: formData.islguplantilla ? 0 : 1 })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        formData.islguplantilla ? 'bg-indigo-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.islguplantilla ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="ml-3 text-sm text-gray-700">
                      {formData.islguplantilla ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                
                {/* Fifth row: Eligibilities (textarea) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Eligibilities</label>
                  <textarea
                    value={formData.eligibilities}
                    onChange={(e) => setFormData({ ...formData, eligibilities: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Sixth row: Experiences (textarea) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Experiences</label>
                  <textarea
                    value={formData.experiences}
                    onChange={(e) => setFormData({ ...formData, experiences: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Seventh row: Educations (textarea) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Educations</label>
                  <textarea
                    value={formData.educations}
                    onChange={(e) => setFormData({ ...formData, educations: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Eighth row: Trainings (textarea) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trainings</label>
                  <textarea
                    value={formData.trainings}
                    onChange={(e) => setFormData({ ...formData, trainings: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Ninth row: Competencies (textarea) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Competencies</label>
                  <textarea
                    value={formData.competencies}
                    onChange={(e) => setFormData({ ...formData, competencies: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                {/* Tenth row: Supporting ID, Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supporting ID</label>
                    <input
                      type="number"
                      value={formData.supporting_id}
                      onChange={(e) => setFormData({ ...formData, supporting_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  {showEditModal && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={formData.plantillastatus}
                        onChange={(e) => setFormData({ ...formData, plantillastatus: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="New">New</option>
                        <option value="Abolished">Abolished</option>
                        <option value="Modified">Modified</option>
                      </select>
                    </div>
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                      setSelectedRecord(null);
                      setFormData({
                        plantilla_no: '',
                        position_title: '',
                        plantilla_cscitemno: '',
                        position_shortname: '',
                        level: '',
                        salarygrade: '',
                        islguplantilla: 0,
                        eligibilities: '',
                        experiences: '',
                        educations: '',
                        trainings: '',
                        competencies: '',
                        supporting_id: '',
                        department_id: '',
                        plantillastatus: 'New'
                      });
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Plantilla201;

