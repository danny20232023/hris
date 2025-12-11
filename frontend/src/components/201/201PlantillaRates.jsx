import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

const PlantillaRates = () => {
  const { can, loading: permissionsLoading } = usePermissions();
  const componentId = '201-plantilla-rates';
  
  const canRead = can(componentId, 'read');
  const canCreate = can(componentId, 'create');
  const canUpdate = can(componentId, 'update');
  const canDelete = can(componentId, 'delete');
  
  const [tranches, setTranches] = useState([]);
  const [selectedTrancheId, setSelectedTrancheId] = useState('');
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTranches, setLoadingTranches] = useState(true);
  const [salaryClasses, setSalaryClasses] = useState([]);
  const [loadingSalaryClasses, setLoadingSalaryClasses] = useState(true);
  const [selectedSalaryClass, setSelectedSalaryClass] = useState(null); // Store selected salary class object
  
  // Auto-compute states
  const [sourceTrancheId, setSourceTrancheId] = useState('');
  const [increasePercentages, setIncreasePercentages] = useState({
    step1: '',
    step2: '',
    step3: '',
    step4: '',
    step5: '',
    step6: '',
    step7: '',
    step8: ''
  });
  const [computing, setComputing] = useState(false);
  const [computedRates, setComputedRates] = useState([]); // Store computed rates before saving
  const [savingComputedRates, setSavingComputedRates] = useState(false);
  
  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSalaryGrade, setSelectedSalaryGrade] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Form state for editing rates (8 steps)
  const [formData, setFormData] = useState({
    step1: '',
    step2: '',
    step3: '',
    step4: '',
    step5: '',
    step6: '',
    step7: '',
    step8: ''
  });
  
  // Fetch tranches for dropdown
  const fetchTranches = async () => {
    try {
      setLoadingTranches(true);
      const response = await api.get('/201-plantilla-tranches', {
        params: { page: 1, limit: 1000, status: 'all' }
      });
      setTranches(response.data.data || []);
    } catch (error) {
      console.error('Error fetching tranches:', error);
      alert('Failed to load tranches');
    } finally {
      setLoadingTranches(false);
    }
  };

  // Fetch salary classes for percentage view
  const fetchSalaryClasses = async () => {
    try {
      setLoadingSalaryClasses(true);
      const response = await api.get('/201-plantilla-tranches/salary-classes');
      const classes = response.data.data || [];
      // Sort by classname in ascending order
      const sortedClasses = [...classes].sort((a, b) => {
        const nameA = (a.classname || '').toLowerCase();
        const nameB = (b.classname || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setSalaryClasses(sortedClasses);
      // Set default to 100% if available, or first class
      const defaultClass = sortedClasses.find(c => parseFloat(c.percentage) === 100) || sortedClasses[0] || null;
      setSelectedSalaryClass(defaultClass);
    } catch (error) {
      console.error('Error fetching salary classes:', error);
      alert('Failed to load salary classes');
    } finally {
      setLoadingSalaryClasses(false);
    }
  };
  
  // Fetch rates for selected tranche
  const fetchRates = async (trancheId) => {
    if (!trancheId) {
      setRates([]);
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.get(`/201-plantilla-tranches/${trancheId}/rates`);
      setRates(response.data.data || []);
    } catch (error) {
      console.error('Error fetching rates:', error);
      alert('Failed to load rates');
      setRates([]);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (canRead) {
      fetchTranches();
      fetchSalaryClasses();
    }
  }, [canRead]);
  
  useEffect(() => {
    if (selectedTrancheId) {
      fetchRates(selectedTrancheId);
    } else {
      setRates([]);
    }
  }, [selectedTrancheId]);
  
  // Handle tranche selection
  const handleTrancheChange = (e) => {
    setSelectedTrancheId(e.target.value);
    setComputedRates([]); // Clear computed rates when changing tranche
    setIncreasePercentages({
      step1: '',
      step2: '',
      step3: '',
      step4: '',
      step5: '',
      step6: '',
      step7: '',
      step8: ''
    });
  };
  
  // Get original rate value (for editing) - prioritize computed rates if available
  const getOriginalRateValue = (salaryGrade, step) => {
    // Check computed rates first
    const computedRate = computedRates.find(
      r => r.salarygrade === salaryGrade && r.stepincrement === step
    );
    if (computedRate) {
      return Math.round(computedRate.rate || 0).toString();
    }
    
    // Fall back to saved rates
    const rate = rates.find(
      r => r.salarygrade === salaryGrade && r.stepincrement === step
    );
    return rate ? Math.round(rate.rate || 0).toString() : '';
  };

  // Get rate value for display (with percentage adjustment from salary class) - prioritize computed rates
  const getRateValue = (salaryGrade, step) => {
    // Check computed rates first
    const computedRate = computedRates.find(
      r => r.salarygrade === salaryGrade && r.stepincrement === step
    );
    let baseRate = null;
    
    if (computedRate && computedRate.rate) {
      baseRate = parseFloat(computedRate.rate || 0);
    } else {
      // Fall back to saved rates
      const rate = rates.find(
        r => r.salarygrade === salaryGrade && r.stepincrement === step
      );
      if (!rate || !rate.rate) return '';
      baseRate = parseFloat(rate.rate || 0);
    }
    
    // Apply percentage from selected salary class
    const percentage = selectedSalaryClass ? parseFloat(selectedSalaryClass.percentage || 100) : 100;
    const adjustedRate = percentage === 100 ? baseRate : baseRate * (percentage / 100);
    return Math.round(adjustedRate).toString();
  };
  
  // Get rate ID for a specific salary grade and step
  const getRateId = (salaryGrade, step) => {
    const rate = rates.find(
      r => r.salarygrade === salaryGrade && r.stepincrement === step
    );
    return rate ? rate.rate_id : null;
  };
  
  // Handle edit
  const handleEdit = (salaryGrade) => {
    if (!canUpdate) {
      alert('You do not have permission to edit rates.');
      return;
    }
    
    setSelectedSalaryGrade(salaryGrade);
    // Use original rate values for editing (not percentage-adjusted)
    setFormData({
      step1: getOriginalRateValue(salaryGrade, '01'),
      step2: getOriginalRateValue(salaryGrade, '02'),
      step3: getOriginalRateValue(salaryGrade, '03'),
      step4: getOriginalRateValue(salaryGrade, '04'),
      step5: getOriginalRateValue(salaryGrade, '05'),
      step6: getOriginalRateValue(salaryGrade, '06'),
      step7: getOriginalRateValue(salaryGrade, '07'),
      step8: getOriginalRateValue(salaryGrade, '08')
    });
    setShowEditModal(true);
  };
  
  // Handle delete
  const handleDelete = async (salaryGrade) => {
    if (!canDelete) {
      alert('You do not have permission to delete rates.');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete all rates for Salary Grade ${salaryGrade}?`)) {
      return;
    }
    
    try {
      // Delete all 8 steps for this salary grade
      const deletePromises = [];
      for (let step = 1; step <= 8; step++) {
        const stepStr = String(step).padStart(2, '0');
        const rateId = getRateId(salaryGrade, stepStr);
        if (rateId) {
          deletePromises.push(
            api.delete(`/201-plantilla-tranches/${selectedTrancheId}/rates/${rateId}`)
          );
        }
      }
      
      await Promise.all(deletePromises);
      alert('Rates deleted successfully');
      fetchRates(selectedTrancheId);
    } catch (error) {
      console.error('Error deleting rates:', error);
      alert(error.response?.data?.message || 'Failed to delete rates');
    }
  };
  
  // Handle save
  const handleSave = async () => {
    if (!selectedTrancheId || !selectedSalaryGrade) {
      alert('Please select a tranche and salary grade');
      return;
    }
    
    try {
      setSaving(true);
      
      // Prepare rates data (all 8 steps)
      const ratesData = [];
      for (let step = 1; step <= 8; step++) {
        const stepStr = String(step).padStart(2, '0');
        const stepKey = `step${step}`;
        const rateValue = formData[stepKey];
        
        if (rateValue && !isNaN(parseFloat(rateValue))) {
          ratesData.push({
            salarygrade: selectedSalaryGrade,
            stepincrement: stepStr,
            rate: parseFloat(rateValue)
          });
        }
      }
      
      // Save all rates at once
      await api.post(`/201-plantilla-tranches/${selectedTrancheId}/rates`, {
        rates: ratesData
      });
      
      alert('Rates saved successfully');
      setShowEditModal(false);
      fetchRates(selectedTrancheId);
    } catch (error) {
      console.error('Error saving rates:', error);
      alert(error.response?.data?.message || 'Failed to save rates');
    } finally {
      setSaving(false);
    }
  };

  // Handle auto-compute
  const handleAutoCompute = async () => {
    if (!selectedTrancheId) {
      alert('Please select a tranche first');
      return;
    }
    
    if (!sourceTrancheId) {
      alert('Please select a source tranche');
      return;
    }
    
    // Validate that at least one step percentage is entered
    const hasValidPercentage = Object.values(increasePercentages).some(
      val => val && !isNaN(parseFloat(val))
    );
    
    if (!hasValidPercentage) {
      alert('Please enter at least one valid increase percentage');
      return;
    }
    
    if (String(selectedTrancheId) === String(sourceTrancheId)) {
      alert('Source tranche cannot be the same as the current tranche');
      return;
    }
    
    const percentagesList = Object.entries(increasePercentages)
      .filter(([_, val]) => val && !isNaN(parseFloat(val)))
      .map(([step, val]) => `${step.replace('step', 'Step ')}: ${val}%`)
      .join(', ');
    
    if (!window.confirm(`This will compute all rates for the current tranche based on the source tranche with the following increases:\n${percentagesList}\n\nContinue?`)) {
      return;
    }
    
    try {
      setComputing(true);
      
      // Fetch rates from source tranche
      const sourceResponse = await api.get(`/201-plantilla-tranches/${sourceTrancheId}/rates`);
      const sourceRates = sourceResponse.data.data || [];
      
      if (sourceRates.length === 0) {
        alert('Source tranche has no rates to compute from');
        return;
      }
      
      // Prepare computed rates data for all salary grades and steps
      const computedRates = [];
      
      // Generate rates for all 33 salary grades and 8 steps
      for (let sg = 1; sg <= 33; sg++) {
        const salaryGrade = String(sg).padStart(2, '0');
        for (let step = 1; step <= 8; step++) {
          const stepStr = String(step).padStart(2, '0');
          const stepKey = `step${step}`;
          const stepPercentage = increasePercentages[stepKey];
          
          // Find corresponding rate from source tranche
          const sourceRate = sourceRates.find(
            r => r.salarygrade === salaryGrade && r.stepincrement === stepStr
          );
          
          if (sourceRate && sourceRate.rate) {
            const baseRate = parseFloat(sourceRate.rate);
            
            // Apply step-specific percentage if provided, otherwise use 0% (no change)
            if (stepPercentage && !isNaN(parseFloat(stepPercentage))) {
              const increaseMultiplier = 1 + (parseFloat(stepPercentage) / 100);
              const computedRate = baseRate * increaseMultiplier;
              
              computedRates.push({
                salarygrade: salaryGrade,
                stepincrement: stepStr,
                rate: Math.round(computedRate)
              });
            } else {
              // If no percentage specified for this step, use the original rate
              computedRates.push({
                salarygrade: salaryGrade,
                stepincrement: stepStr,
                rate: Math.round(baseRate)
              });
            }
          }
        }
      }
      
      if (computedRates.length === 0) {
        alert('No rates could be computed from the source tranche');
        return;
      }
      
      // Store computed rates in state (don't save yet)
      setComputedRates(computedRates);
      setSourceTrancheId('');
      setIncreasePercentages({
        step1: '',
        step2: '',
        step3: '',
        step4: '',
        step5: '',
        step6: '',
        step7: '',
        step8: ''
      });
      alert(`Successfully computed ${computedRates.length} rates. Review the rates below and click "Save Computed Rates" to save them.`);
    } catch (error) {
      console.error('Error auto-computing rates:', error);
      alert(error.response?.data?.message || 'Failed to auto-compute rates');
    } finally {
      setComputing(false);
    }
  };

  // Handle save computed rates
  const handleSaveComputedRates = async () => {
    if (computedRates.length === 0) {
      alert('No computed rates to save');
      return;
    }
    
    if (!window.confirm(`This will save ${computedRates.length} computed rates. Continue?`)) {
      return;
    }
    
    try {
      setSavingComputedRates(true);
      
      // Save all computed rates
      await api.post(`/201-plantilla-tranches/${selectedTrancheId}/rates`, {
        rates: computedRates
      });
      
      alert(`Successfully saved ${computedRates.length} rates`);
      setComputedRates([]); // Clear computed rates
      fetchRates(selectedTrancheId); // Refresh rates from server
    } catch (error) {
      console.error('Error saving computed rates:', error);
      alert(error.response?.data?.message || 'Failed to save computed rates');
    } finally {
      setSavingComputedRates(false);
    }
  };
  
  // Format currency
  const formatCurrency = (value) => {
    if (!value || value === '') return '₱0.00';
    return `₱${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Generate salary grades 01-33
  const salaryGrades = Array.from({ length: 33 }, (_, i) => 
    String(i + 1).padStart(2, '0')
  );
  
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
          You do not have permission to view rates.
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 p-6">
      {/* Tranche Selector and Percentage View */}
      <div className="bg-white p-4 rounded-md shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Tranche *</label>
            <select
              value={selectedTrancheId}
              onChange={handleTrancheChange}
              disabled={loadingTranches}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
            >
              <option value="">-- Select Tranche --</option>
              {tranches.map((tranche) => (
                <option key={tranche.tranche_id} value={tranche.tranche_id}>
                  {tranche.tranche} ({tranche.implement_year || 'N/A'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Percentage View</label>
            {loadingSalaryClasses ? (
              <div className="text-sm text-gray-500">Loading salary classes...</div>
            ) : salaryClasses.length === 0 ? (
              <div className="text-sm text-gray-500">No salary classes available</div>
            ) : (
              <select
                value={selectedSalaryClass ? selectedSalaryClass.id : (salaryClasses[0]?.id || '')}
                onChange={(e) => {
                  const selectedId = parseInt(e.target.value);
                  const selected = salaryClasses.find(sc => sc.id === selectedId);
                  setSelectedSalaryClass(selected || salaryClasses[0] || null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {salaryClasses.map((salaryClass) => {
                  const percentage = parseFloat(salaryClass.percentage || 100);
                  const classname = salaryClass.classname || '';
                  const classtype = salaryClass.classtype || '';
                  // Format: classname + classtype (percentage)
                  let displayText = '';
                  if (classname && classtype) {
                    displayText = `${classname} ${classtype} (${percentage}%)`;
                  } else if (classname) {
                    displayText = `${classname} (${percentage}%)`;
                  } else if (classtype) {
                    displayText = `${classtype} (${percentage}%)`;
                  } else {
                    displayText = `${percentage}%`;
                  }
                  return (
                    <option key={salaryClass.id} value={salaryClass.id}>
                      {displayText}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Auto-Compute Section */}
      {selectedTrancheId && canCreate && (
        <div className="bg-white p-4 rounded-md shadow border-l-4 border-blue-500">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Auto-Compute Rates</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Tranche *</label>
              <select
                value={sourceTrancheId}
                onChange={(e) => setSourceTrancheId(e.target.value)}
                disabled={loadingTranches || computing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">-- Select Source Tranche --</option>
                {tranches
                  .filter(t => t.tranche_id !== parseInt(selectedTrancheId))
                  .map((tranche) => (
                    <option key={tranche.tranche_id} value={tranche.tranche_id}>
                      {tranche.tranche} ({tranche.implement_year || 'N/A'})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Increase Percentage (%) by Step</label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
                  <div key={step}>
                    <label className="block text-xs text-gray-600 mb-1">Step {step}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={increasePercentages[`step${step}`]}
                      onChange={(e) => setIncreasePercentages({
                        ...increasePercentages,
                        [`step${step}`]: e.target.value
                      })}
                      disabled={computing}
                      placeholder="0.00"
                      className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleAutoCompute}
                disabled={computing || !sourceTrancheId}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {computing ? 'Computing...' : 'Auto-Compute'}
              </button>
            </div>
          </div>
          {computedRates.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{computedRates.length} rates computed.</span> Review the rates below and click "Save Computed Rates" to save them.
                </p>
                <button
                  onClick={handleSaveComputedRates}
                  disabled={savingComputedRates}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {savingComputedRates ? 'Saving...' : 'Save Computed Rates'}
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">
            This will compute all rates (33 salary grades × 8 steps) based on the source tranche rates. Each step can have its own increase percentage. Rates will be displayed for review before saving.
          </p>
        </div>
      )}
      
      {/* Rates Grid */}
      {selectedTrancheId ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading rates...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                      Salary Grade
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 1</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 2</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 3</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 4</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 5</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 6</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 7</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Step 8</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {salaryGrades.map((sg) => (
                    <tr key={sg} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                        {sg}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '01'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '02'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '03'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '04'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '05'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '06'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '07'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                        {formatCurrency(getRateValue(sg, '08'))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm sticky right-0 bg-white z-10">
                        <div className="flex items-center justify-center gap-2">
                          {canUpdate && (
                            <button
                              onClick={() => handleEdit(sg)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Edit Rates"
                            >
                              ✏️
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(sg)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Delete Rates"
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
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          Please select a tranche to view rates.
        </div>
      )}
      
      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">
                  Edit Rates - Salary Grade {selectedSalaryGrade}
                </h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedSalaryGrade('');
                    setFormData({
                      step1: '',
                      step2: '',
                      step3: '',
                      step4: '',
                      step5: '',
                      step6: '',
                      step7: '',
                      step8: ''
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
                    <div key={step}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Step {step}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData[`step${step}`]}
                        onChange={(e) => setFormData({ ...formData, [`step${step}`]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setSelectedSalaryGrade('');
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

export default PlantillaRates;

