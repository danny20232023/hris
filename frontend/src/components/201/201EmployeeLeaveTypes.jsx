import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

const EmployeeLeaveTypes = () => {
  // State management
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Questions management state
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionText, setQuestionText] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    leavecode: '',
    leavetype: '',
    leavedescription: '',
    coverage: '',
    annualentitlement: '',
    accrual: '',
    cycle: '',
    isconverttocash: false,
    hasquestion: false
  });
  
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [showMessage, setShowMessage] = useState(false);
  
  // Questions modal state
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [modalLeaveType, setModalLeaveType] = useState(null);
  const [modalQuestions, setModalQuestions] = useState([]);
  const { can, loading: permissionsLoading } = usePermissions();
  const COMPONENT_ID = '201-leave';
  const canReadLeave = can(COMPONENT_ID, 'read');
  const canCreateLeave = can(COMPONENT_ID, 'create');
  const canUpdateLeave = can(COMPONENT_ID, 'update');
  const canDeleteLeave = can(COMPONENT_ID, 'delete');
  const canPrintLeave = can(COMPONENT_ID, 'print');
  const canManageQuestions = canCreateLeave || canUpdateLeave || canDeleteLeave;

  // Fetch leave types on component mount
  useEffect(() => {
    if (!canReadLeave) return;
    fetchLeaveTypes();
  }, [canReadLeave]);

  // Fetch leave types from API
  const fetchLeaveTypes = async () => {
    if (!canReadLeave) return;
    try {
      setLoading(true);
      const response = await api.get('/leave-types');
      if (response.data.success) {
        setLeaveTypes(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching leave types:', error);
      displayMessage('Failed to fetch leave types', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show message helper
  const displayMessage = (msg, type = 'success') => {
    setMessage(msg);
    setShowMessage(true);
    setTimeout(() => setShowMessage(false), 3000);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.leavecode.trim()) {
      newErrors.leavecode = 'Leave code is required';
    } else if (formData.leavecode.length > 10) {
      newErrors.leavecode = 'Leave code must be 10 characters or less';
    }
    
    if (!formData.leavetype.trim()) {
      newErrors.leavetype = 'Leave type is required';
    } else if (formData.leavetype.length > 25) {
      newErrors.leavetype = 'Leave type must be 25 characters or less';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleOpenCreateForm = () => {
    if (!canCreateLeave) {
      alert('You do not have permission to create leave types.');
      return;
    }
    setShowForm(true);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingLeaveType && !canUpdateLeave) {
      alert('You do not have permission to update leave types.');
      return;
    }
    if (!editingLeaveType && !canCreateLeave) {
      alert('You do not have permission to create leave types.');
      return;
    }
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setLoading(true);
      
      if (editingLeaveType) {
        // Update existing leave type
        const response = await api.put(`/leave-types/${editingLeaveType.leaveid}`, formData);
        if (response.data.success) {
          displayMessage('Leave type updated successfully');
          fetchLeaveTypes();
          handleCloseForm();
        }
      } else {
        // Create new leave type
        const response = await api.post('/leave-types', formData);
        if (response.data.success) {
          displayMessage('Leave type created successfully');
          fetchLeaveTypes();
          handleCloseForm();
        }
      }
    } catch (error) {
      console.error('Error saving leave type:', error);
      const errorMsg = error.response?.data?.message || 'Failed to save leave type';
      displayMessage(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (leaveType) => {
    if (!canUpdateLeave) {
      alert('You do not have permission to update leave types.');
      return;
    }
    setEditingLeaveType(leaveType);
    setFormData({
      leavecode: leaveType.leavecode || '',
      leavetype: leaveType.leavetype || '',
      leavedescription: leaveType.leavedescription || '',
      coverage: leaveType.coverage || '',
      annualentitlement: leaveType.annualentitlement || '',
      accrual: leaveType.accrual || '',
      cycle: leaveType.cycle || '',
      isconverttocash: leaveType.isconverttocash === 1,
      hasquestion: leaveType.hasquestion === 1
    });
    setShowForm(true);
  };

  // Handle delete
  const handleDelete = async (leaveType) => {
    if (!canDeleteLeave) {
      alert('You do not have permission to delete leave types.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete "${leaveType.leavetype}"? This will also delete all associated questions.`)) {
      try {
        setLoading(true);
        const response = await api.delete(`/leave-types/${leaveType.leaveid}`);
        if (response.data.success) {
          displayMessage('Leave type deleted successfully');
          fetchLeaveTypes();
        }
      } catch (error) {
        console.error('Error deleting leave type:', error);
        displayMessage('Failed to delete leave type', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle close form
  const handleCloseForm = () => {
    setShowForm(false);
    setEditingLeaveType(null);
    setFormData({
      leavecode: '',
      leavetype: '',
      leavedescription: '',
      coverage: '',
      annualentitlement: '',
      accrual: '',
      cycle: '',
      isconverttocash: false,
      hasquestion: false
    });
    setErrors({});
  };

  // Handle opening questions modal
  const handleOpenQuestionsModal = async (leaveType) => {
    if (!canReadLeave) {
      alert('You do not have permission to view leave type questions.');
      return;
    }
    try {
      setModalLeaveType(leaveType);
      setLoading(true);
      
      // Fetch questions for this leave type
      const response = await api.get(`/leave-types/${leaveType.leaveid}/questions`);
      if (response.data.success) {
        setModalQuestions(response.data.data);
        setShowQuestionsModal(true);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
      displayMessage('Failed to fetch questions', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle closing questions modal
  const handleCloseQuestionsModal = () => {
    setShowQuestionsModal(false);
    setModalLeaveType(null);
    setModalQuestions([]);
    setQuestionText('');
    setEditingQuestion(null);
  };

  // Handle add question in modal
  const handleAddQuestionModal = async () => {
    if (!canCreateLeave) {
      alert('You do not have permission to add questions.');
      return;
    }
    if (!questionText.trim()) {
      displayMessage('Question text is required', 'error');
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.post(`/leave-types/${modalLeaveType.leaveid}/questions`, {
        question: questionText.trim()
      });
      
      if (response.data.success) {
        displayMessage('Question added successfully');
        setQuestionText('');
        // Refresh modal questions
        const refreshResponse = await api.get(`/leave-types/${modalLeaveType.leaveid}/questions`);
        if (refreshResponse.data.success) {
          setModalQuestions(refreshResponse.data.data);
        }
        // Refresh main leave types list to update hasquestion status
        fetchLeaveTypes();
      }
    } catch (error) {
      console.error('Error adding question:', error);
      displayMessage('Failed to add question', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit question in modal
  const handleEditQuestionModal = async (question) => {
    if (!canUpdateLeave) {
      alert('You do not have permission to update questions.');
      return;
    }
    try {
      setLoading(true);
      const response = await api.put(`/leave-types/questions/${question.objid}`, {
        question: questionText.trim()
      });
      
      if (response.data.success) {
        displayMessage('Question updated successfully');
        setQuestionText('');
        setEditingQuestion(null);
        // Refresh modal questions
        const refreshResponse = await api.get(`/leave-types/${modalLeaveType.leaveid}/questions`);
        if (refreshResponse.data.success) {
          setModalQuestions(refreshResponse.data.data);
        }
        // Refresh main leave types list for consistency
        fetchLeaveTypes();
      }
    } catch (error) {
      console.error('Error updating question:', error);
      displayMessage('Failed to update question', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete question in modal
  const handleDeleteQuestionModal = async (question) => {
    if (!canDeleteLeave) {
      alert('You do not have permission to delete questions.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this question?')) {
      try {
        setLoading(true);
        const response = await api.delete(`/leave-types/questions/${question.objid}`);
        
        if (response.data.success) {
          displayMessage('Question deleted successfully');
          // Refresh modal questions
          const refreshResponse = await api.get(`/leave-types/${modalLeaveType.leaveid}/questions`);
          if (refreshResponse.data.success) {
            setModalQuestions(refreshResponse.data.data);
          }
          // Refresh main leave types list to update hasquestion status
          fetchLeaveTypes();
        }
      } catch (error) {
        console.error('Error deleting question:', error);
        displayMessage('Failed to delete question', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // Filter leave types based on search term
  const filteredLeaveTypes = leaveTypes.filter(leaveType =>
    leaveType.leavecode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    leaveType.leavetype.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (leaveType.leavedescription && leaveType.leavedescription.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (permissionsLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">Loading permissions…</p>
        </div>
      </div>
    );
  }

  if (!canReadLeave) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">You do not have permission to view leave types.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        {canCreateLeave ? (
          <button
            onClick={handleOpenCreateForm}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Add Leave Type
          </button>
        ) : (
          <span className="text-sm text-gray-500">No permission to add leave types</span>
        )}
      </div>

      {/* Message */}
      {showMessage && (
        <div className={`mb-4 p-4 rounded-md ${
          message.includes('error') || message.includes('Failed') 
            ? 'bg-red-100 text-red-700' 
            : 'bg-green-100 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search leave types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Leave Types Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Leave Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Leave Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Annual Entitlement
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Accrual
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Has Question
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredLeaveTypes.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                  No leave types found
                </td>
              </tr>
            ) : (
              filteredLeaveTypes.map((leaveType) => (
                <tr key={leaveType.leaveid}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {leaveType.leavecode}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {leaveType.leavetype}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {leaveType.leavedescription || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {leaveType.annualentitlement || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {leaveType.accrual || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center justify-between">
                      <span>{leaveType.hasquestion ? 'Yes' : 'No'}</span>
                      <button
                        onClick={() => handleOpenQuestionsModal(leaveType)}
                        className="ml-2 text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={leaveType.hasquestion ? "Manage Questions" : "Add Questions"}
                        disabled={!canReadLeave}
                      >
                        {leaveType.hasquestion ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {canUpdateLeave && (
                        <button
                          onClick={() => handleEdit(leaveType)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit Leave Type"
                        >
                          ✏️
                        </button>
                      )}
                      {canPrintLeave && (
                        <button
                          onClick={() => {
                            // Print functionality can be added here if needed
                            console.log('Print leave type:', leaveType);
                          }}
                          className="text-green-600 hover:text-green-800 transition-colors"
                          title="Print Leave Type"
                        >
                          🖨️
                        </button>
                      )}
                      {canDeleteLeave && (
                        <button
                          onClick={() => handleDelete(leaveType)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Delete Leave Type"
                        >
                          🗑️
                        </button>
                      )}
                      {!canUpdateLeave && !canPrintLeave && !canDeleteLeave && (
                        <span className="text-xs text-gray-400">No actions available</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingLeaveType ? 'Edit Leave Type' : 'Add Leave Type'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Leave Code *
                  </label>
                  <input
                    type="text"
                    name="leavecode"
                    value={formData.leavecode}
                    onChange={handleInputChange}
                    maxLength="10"
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.leavecode ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.leavecode && (
                    <p className="text-red-500 text-xs mt-1">{errors.leavecode}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Leave Type *
                  </label>
                  <input
                    type="text"
                    name="leavetype"
                    value={formData.leavetype}
                    onChange={handleInputChange}
                    maxLength="25"
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.leavetype ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.leavetype && (
                    <p className="text-red-500 text-xs mt-1">{errors.leavetype}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="leavedescription"
                  value={formData.leavedescription}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coverage
                </label>
                <textarea
                  name="coverage"
                  value={formData.coverage}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Entitlement & Accrual */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Annual Entitlement
                  </label>
                  <input
                    type="number"
                    name="annualentitlement"
                    value={formData.annualentitlement}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Accrual
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    name="accrual"
                    value={formData.accrual}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cycle
                  </label>
                  <input
                    type="number"
                    name="cycle"
                    value={formData.cycle}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="flex gap-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="isconverttocash"
                    checked={formData.isconverttocash}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Convert to Cash</span>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="hasquestion"
                    checked={formData.hasquestion}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Has Question</span>
                </label>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (editingLeaveType ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Questions Modal */}
      {showQuestionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {modalLeaveType?.hasquestion ? 'Questions for' : 'Add Questions to'} {modalLeaveType?.leavetype}
              </h2>
              <button
                onClick={handleCloseQuestionsModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Add Question Form */}
            <div className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter question text..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  disabled={!canManageQuestions}
                  className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !canManageQuestions ? 'bg-gray-100 cursor-not-allowed border-gray-200' : 'border-gray-300'
                  }`}
                />
                <button
                  onClick={editingQuestion ? () => handleEditQuestionModal(editingQuestion) : handleAddQuestionModal}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!(editingQuestion ? canUpdateLeave : canCreateLeave)}
                >
                  {editingQuestion ? 'Update' : 'Add'} Question
                </button>
                {editingQuestion && canUpdateLeave && (
                  <button
                    onClick={() => {
                      setEditingQuestion(null);
                      setQuestionText('');
                    }}
                    className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {!canManageQuestions && (
                <p className="text-xs text-gray-500 mt-2">You do not have permission to modify questions.</p>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-2">
              {modalQuestions.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  {modalLeaveType?.hasquestion ? 'No questions found for this leave type.' : 'No questions added yet. Add your first question below.'}
                </p>
              ) : (
                modalQuestions.map((question) => (
                  <div key={question.objid} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-900 flex-1">{question.question}</span>
                    <div className="flex gap-2 ml-4">
                      {canUpdateLeave && (
                        <button
                          onClick={() => {
                            setEditingQuestion(question);
                            setQuestionText(question.question);
                          }}
                          className="px-2 py-1 text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          ✎
                        </button>
                      )}
                      {canDeleteLeave && (
                        <button
                          onClick={() => handleDeleteQuestionModal(question)}
                          className="px-2 py-1 text-red-600 hover:text-red-800 ml-1"
                          title="Delete"
                        >
                          🗑
                        </button>
                      )}
                      {!canUpdateLeave && !canDeleteLeave && (
                        <span className="text-xs text-gray-400 italic">View only</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end mt-6 pt-4 border-t">
              <button
                onClick={handleCloseQuestionsModal}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeLeaveTypes;
