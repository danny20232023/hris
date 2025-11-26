import React, { useState, useEffect } from 'react';

const Address_Mgmt = ({ 
  value, 
  onChange, 
  disabled = false, 
  placeholder = "Search Philippine addresses...",
  className = "",
  showLabel = true,
  label = "Destination",
  maxLength = 200,
  showCharCount = true
}) => {
  const [addressSearchTerm, setAddressSearchTerm] = useState(value || '');
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [filteredAddresses, setFilteredAddresses] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fallback static list for when API fails
  const fallbackAddresses = [
    // Metro Manila (Complete)
    'Manila, Metro Manila',
    'Quezon City, Metro Manila',
    'Caloocan City, Metro Manila',
    'Las Piñas City, Metro Manila',
    'Makati City, Metro Manila',
    'Malabon City, Metro Manila',
    'Mandaluyong City, Metro Manila',
    'Marikina City, Metro Manila',
    'Muntinlupa City, Metro Manila',
    'Navotas City, Metro Manila',
    'Parañaque City, Metro Manila',
    'Pasay City, Metro Manila',
    'Pasig City, Metro Manila',
    'Pateros, Metro Manila',
    'San Juan City, Metro Manila',
    'Taguig City, Metro Manila',
    'Valenzuela City, Metro Manila',
    
    // Cebu Province (Complete)
    'Cebu City, Cebu',
    'Bogo City, Cebu',
    'Carcar City, Cebu',
    'Danao City, Cebu',
    'Lapu-Lapu City, Cebu',
    'Mandaue City, Cebu',
    'Naga City, Cebu',
    'Talisay City, Cebu',
    'Toledo City, Cebu',
    'Alcantara, Cebu',
    'Alcoy, Cebu',
    'Alegria, Cebu',
    'Aloguinsan, Cebu',
    'Argao, Cebu',
    'Asturias, Cebu',
    'Badian, Cebu',
    'Balamban, Cebu',
    'Bantayan, Cebu',
    'Barili, Cebu',
    'Boljoon, Cebu',
    'Borbon, Cebu',
    'Carmen, Cebu',
    'Catmon, Cebu',
    'Compostela, Cebu',
    'Consolacion, Cebu',
    'Cordova, Cebu',
    'Daanbantayan, Cebu',
    'Dalaguete, Cebu',
    'Dumanjug, Cebu',
    'Ginatilan, Cebu',
    'Liloan, Cebu',
    'Madridejos, Cebu',
    'Malabuyoc, Cebu',
    'Medellin, Cebu',
    'Minglanilla, Cebu',
    'Moalboal, Cebu',
    'Oslob, Cebu',
    'Pilar, Cebu',
    'Pinamungahan, Cebu',
    'Poro, Cebu',
    'Ronda, Cebu',
    'Samboan, Cebu',
    'San Fernando, Cebu',
    'San Francisco, Cebu',
    'San Remigio, Cebu',
    'Santa Fe, Cebu',
    'Santander, Cebu',
    'Sibonga, Cebu',
    'Sogod, Cebu',
    'Tabogon, Cebu',
    'Tabuelan, Cebu',
    'Tuburan, Cebu',
    'Tudela, Cebu',
    
    // Other Major Cities
    'Baguio City, Benguet',
    'Dagupan City, Pangasinan',
    'San Fernando City, La Union',
    'Vigan City, Ilocos Sur',
    'Cabanatuan City, Nueva Ecija',
    'Malolos City, Bulacan',
    'Meycauayan City, Bulacan',
    'San Jose del Monte City, Bulacan',
    'Tarlac City, Tarlac',
    'Olongapo City, Zambales',
    'Angeles City, Pampanga',
    'Mabalacat City, Pampanga',
    'San Fernando City, Pampanga',
    'Batangas City, Batangas',
    'Lipa City, Batangas',
    'Tanauan City, Batangas',
    'Cavite City, Cavite',
    'Dasmariñas City, Cavite',
    'General Trias City, Cavite',
    'Imus City, Cavite',
    'Tagaytay City, Cavite',
    'Trece Martires City, Cavite',
    'Antipolo City, Rizal',
    'Calamba City, Laguna',
    'San Pablo City, Laguna',
    'Santa Rosa City, Laguna',
    'Lucena City, Quezon',
    'Tayabas City, Quezon',
    'Legazpi City, Albay',
    'Ligao City, Albay',
    'Tabaco City, Albay',
    'Iriga City, Camarines Sur',
    'Naga City, Camarines Sur',
    'Sorsogon City, Sorsogon',
    'Masbate City, Masbate',
    'Roxas City, Capiz',
    'Iloilo City, Iloilo',
    'Passi City, Iloilo',
    'Bacolod City, Negros Occidental',
    'Bago City, Negros Occidental',
    'Cadiz City, Negros Occidental',
    'Escalante City, Negros Occidental',
    'Himamaylan City, Negros Occidental',
    'Kabankalan City, Negros Occidental',
    'La Carlota City, Negros Occidental',
    'Sagay City, Negros Occidental',
    'San Carlos City, Negros Occidental',
    'Silay City, Negros Occidental',
    'Sipalay City, Negros Occidental',
    'Talisay City, Negros Occidental',
    'Victorias City, Negros Occidental',
    'Tagbilaran City, Bohol',
    'Dumaguete City, Negros Oriental',
    'Guihulngan City, Negros Oriental',
    'Tanjay City, Negros Oriental',
    'Bayawan City, Negros Oriental',
    'Canlaon City, Negros Oriental',
    'Siquijor, Siquijor',
    'Boracay, Aklan',
    'Kalibo, Aklan',
    'Zamboanga City, Zamboanga del Sur',
    'Pagadian City, Zamboanga del Sur',
    'Dipolog City, Zamboanga del Norte',
    'Dapitan City, Zamboanga del Norte',
    'Cagayan de Oro City, Misamis Oriental',
    'Gingoog City, Misamis Oriental',
    'El Salvador City, Misamis Oriental',
    'Iligan City, Lanao del Norte',
    'Oroquieta City, Misamis Occidental',
    'Ozamiz City, Misamis Occidental',
    'Tangub City, Misamis Occidental',
    'Marawi City, Lanao del Sur',
    'Butuan City, Agusan del Norte',
    'Cabadbaran City, Agusan del Norte',
    'Bayugan City, Agusan del Sur',
    'Surigao City, Surigao del Norte',
    'Bislig City, Surigao del Sur',
    'Tandag City, Surigao del Sur',
    'Davao City, Davao del Sur',
    'Digos City, Davao del Sur',
    'Mati City, Davao Oriental',
    'Tagum City, Davao del Norte',
    'Panabo City, Davao del Norte',
    'Island Garden City of Samal, Davao del Norte',
    'General Santos City, South Cotabato',
    'Koronadal City, South Cotabato',
    'Tacurong City, Sultan Kudarat',
    'Kidapawan City, Cotabato',
    'Cotabato City, Maguindanao',
    
    // Palawan Cities and Municipalities
    'Puerto Princesa City, Palawan',
    'Aborlan, Palawan',
    'Agutaya, Palawan',
    'Araceli, Palawan',
    'Balabac, Palawan',
    'Bataraza, Palawan',
    'Brooke\'s Point, Palawan',
    'Busuanga, Palawan',
    'Cagayancillo, Palawan',
    'Coron, Palawan',
    'Culion, Palawan',
    'Cuyo, Palawan',
    'Dumaran, Palawan',
    'El Nido, Palawan',
    'Kalayaan, Palawan',
    'Linapacan, Palawan',
    'Magsaysay, Palawan',
    'Narra, Palawan',
    'Quezon, Palawan',
    'Rizal, Palawan',
    'Roxas, Palawan',
    'San Vicente, Palawan',
    'Sofronio Española, Palawan',
    'Taytay, Palawan'
  ];

  // Initialize addresses with fallback data only (API disabled)
  const initializeAddresses = () => {
    setLoading(true);
    
    // Use fallback addresses as primary data source
    const formattedAddresses = fallbackAddresses.map(addr => {
      const [name, province] = addr.split(', ');
      return {
        name: name,
        province: province,
        type: 'City/Municipality',
        fullAddress: addr,
        original: { name, province }
      };
    });
    
    console.log(`Loaded ${formattedAddresses.length} addresses from fallback data`);
    setAddresses(formattedAddresses);
    setError(`Using offline data (${formattedAddresses.length} locations available)`);
    setLoading(false);
  };

  // Load addresses on component mount (using fallback only)
  useEffect(() => {
    initializeAddresses();
  }, []);

  // Filter addresses based on search term
  useEffect(() => {
    if (!addressSearchTerm.trim()) {
      setFilteredAddresses([]);
      return;
    }

    const filtered = addresses
      .filter(addr => 
        addr.name.toLowerCase().includes(addressSearchTerm.toLowerCase()) ||
        addr.province.toLowerCase().includes(addressSearchTerm.toLowerCase()) ||
        addr.fullAddress.toLowerCase().includes(addressSearchTerm.toLowerCase())
      )
      .slice(0, 15);

    setFilteredAddresses(filtered);
  }, [addressSearchTerm, addresses]);

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    
    if (newValue.length <= maxLength) {
      setAddressSearchTerm(newValue);
      setShowAddressDropdown(true);
      
      if (onChange) {
        onChange(newValue);
      }
    }
  };

  // Handle address selection
  const handleAddressSelect = (address) => {
    setAddressSearchTerm(address.fullAddress);
    setShowAddressDropdown(false);
    
    if (onChange) {
      onChange(address.fullAddress);
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (addressSearchTerm.trim()) {
      setShowAddressDropdown(true);
    }
  };

  // Handle input blur
  const handleInputBlur = () => {
    setTimeout(() => {
      setShowAddressDropdown(false);
    }, 200);
  };

  // Handle key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredAddresses.length > 0) {
        handleAddressSelect(filteredAddresses[0]);
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        <input
          type="text"
          value={addressSearchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
          } ${error ? 'border-yellow-500' : ''}`}
          maxLength={maxLength}
        />
        
        {showCharCount && (
          <div className="absolute right-2 top-2 text-xs text-gray-500">
            {addressSearchTerm.length}/{maxLength}
          </div>
        )}
        
        {loading && (
          <div className="absolute right-8 top-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>

      {/* Info message showing offline mode */}
      {error && (
        <div className="mt-1 text-sm text-yellow-600">
          {error}
        </div>
      )}

      {/* Dropdown */}
      {showAddressDropdown && filteredAddresses.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredAddresses.map((address, index) => (
            <div
              key={index}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
              onClick={() => handleAddressSelect(address)}
            >
              <div className="font-medium text-gray-900">{address.name}</div>
              <div className="text-sm text-gray-600">{address.province}</div>
              {address.type && (
                <div className="text-xs text-blue-600">{address.type}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No results message */}
      {showAddressDropdown && addressSearchTerm.trim() && filteredAddresses.length === 0 && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="px-3 py-2 text-gray-500 text-sm">
            No addresses found for "{addressSearchTerm}"
          </div>
        </div>
      )}
    </div>
  );
};

export default Address_Mgmt;