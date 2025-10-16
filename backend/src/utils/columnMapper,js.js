// backend/src/utils/columnMapper.js
// Column mapping utility for normalizing various column name formats

/**
 * Map of possible column name variations to standardized field names
 */
const COLUMN_MAPPINGS = {
  // Manufacturer mappings
  mfg: ['mfg', 'manufacturer', 'vendor', 'supplier', 'make', 'brand'],
  
  // Category/Business Entity mappings
  category: ['category', 'business entity', 'business_entity', 'businessentity', 'bus_entity', 'product category', 'product_category'],
  
  // Asset Type mappings
  asset_type: ['asset type', 'asset_type', 'assettype', 'type of asset', 'equipment type', 'equipment_type'],
  
  // Type mappings
  type: ['type', 'product type', 'product_type', 'model type', 'model_type'],
  
  // Product ID mappings
  product_id: ['product id', 'product_id', 'productid', 'pid', 'product number', 'product_number', 'part number', 'part_number', 'sku'],
  
  // Description mappings
  description: ['description', 'product description', 'product_description', 'productdescription', 'desc', 'details', 'product details'],
  
  // Ship Date mappings
  ship_date: ['ship date', 'ship_date', 'shipdate', 'ship dt', 'ship_dt', 'shipped date', 'shipped_date', 'date shipped', 'date_shipped'],
  
  // Quantity mappings
  qty: ['qty', 'quantity', 'count', 'amount', 'units', 'total qty', 'total_qty'],
  
  // Total Value mappings
  total_value: ['total value', 'total_value', 'totalvalue', 'value', 'cost', 'price', 'total cost', 'total_cost', 'total price', 'total_price', 'extended price', 'extended_price'],
  
  // Support Coverage mappings
  support_coverage: ['support coverage', 'support_coverage', 'supportcoverage', 'coverage', 'maintenance', 'support status', 'support_status', 'maintenance status', 'maintenance_status', 'covered'],
  
  // End of Sale mappings
  end_of_sale: ['end of sale', 'end_of_sale', 'endofsale', 'end of product sale', 'end_of_product_sale', 'eos', 'sale end date', 'sale_end_date', 'discontinued date', 'discontinued_date'],
  
  // Last Support mappings
  last_day_support: ['last day support', 'last_day_support', 'lastdaysupport', 'last support', 'last_support', 'last date of support', 'last_date_of_support', 'end of support', 'end_of_support', 'support end date', 'support_end_date', 'eosl']
};

/**
 * Normalize column names to match standard field names
 * @param {Object} row - Raw data row from CSV/Excel
 * @returns {Object} - Normalized row with standard field names
 */
function normalizeRow(row) {
  const normalized = {};
  
  // Process each field in the row
  Object.keys(row).forEach(originalKey => {
    const lowerKey = originalKey.toLowerCase().trim();
    let matched = false;
    
    // Check each mapping category
    for (const [standardName, variations] of Object.entries(COLUMN_MAPPINGS)) {
      if (variations.some(variation => variation === lowerKey)) {
        normalized[standardName] = row[originalKey];
        matched = true;
        break;
      }
    }
    
    // If no mapping found, keep the original key (lowercased and underscored)
    if (!matched) {
      const cleanKey = lowerKey.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      normalized[cleanKey] = row[originalKey];
    }
  });
  
  // Apply special transformations
  normalized.support_coverage = normalizeSupport(normalized.support_coverage);
  normalized.ship_date = formatDate(normalized.ship_date);
  normalized.end_of_sale = formatDate(normalized.end_of_sale);
  normalized.last_day_support = formatDate(normalized.last_day_support);
  normalized.qty = normalizeNumber(normalized.qty);
  normalized.total_value = normalizeNumber(normalized.total_value);
  
  return normalized;
}

/**
 * Normalize support/coverage status values
 * @param {string} value - Raw support coverage value
 * @returns {string} - Normalized status: 'Active', 'Expired', or original value
 */
function normalizeSupport(value) {
  if (!value || value === '-' || value === 'N/A' || value === 'n/a') {
    return '-';
  }
  
  const lowerValue = value.toString().toLowerCase().trim();
  
  // Check for covered/active variations
  if (
    lowerValue.includes('covered') ||
    lowerValue.includes('active') ||
    lowerValue.includes('yes') ||
    lowerValue.includes('valid') ||
    lowerValue.includes('current') ||
    lowerValue.includes('maintenance') ||
    lowerValue === 'y' ||
    lowerValue === '1' ||
    lowerValue === 'true'
  ) {
    return 'Active';
  }
  
  // Check for not covered/expired variations
  if (
    lowerValue.includes('not covered') ||
    lowerValue.includes('no coverage') ||
    lowerValue.includes('expired') ||
    lowerValue.includes('none') ||
    lowerValue.includes('no') ||
    lowerValue === 'n' ||
    lowerValue === '0' ||
    lowerValue === 'false'
  ) {
    return 'Expired';
  }
  
  // Return original value if can't determine
  return value;
}

/**
 * Format date values consistently
 * @param {string} value - Raw date value
 * @returns {string} - Formatted date or original value
 */
function formatDate(value) {
  if (!value || value === '-' || value === 'N/A' || value === 'n/a') {
    return '-';
  }
  
  // Try to parse the date
  const date = new Date(value);
  
  if (isNaN(date.getTime())) {
    // If can't parse, return original value
    return value;
  }
  
  // Format as YYYY-MM-DD
  return date.toISOString().split('T')[0];
}

/**
 * Normalize numeric values
 * @param {string|number} value - Raw numeric value
 * @returns {number} - Normalized number or 0
 */
function normalizeNumber(value) {
  if (!value || value === '-' || value === 'N/A' || value === 'n/a') {
    return 0;
  }
  
  // Remove currency symbols and commas
  const cleanValue = value.toString().replace(/[$,]/g, '').trim();
  const number = parseFloat(cleanValue);
  
  return isNaN(number) ? 0 : number;
}

/**
 * Process an array of rows and normalize all column names
 * @param {Array} data - Array of raw data rows
 * @returns {Array} - Array of normalized rows
 */
function processData(data) {
  if (!Array.isArray(data)) {
    console.error('processData expects an array of data rows');
    return [];
  }
  
  return data.map((row, index) => {
    try {
      const normalized = normalizeRow(row);
      // Add a row ID if not present
      if (!normalized.id) {
        normalized.id = index + 1;
      }
      return normalized;
    } catch (error) {
      console.error(`Error processing row ${index}:`, error);
      return row; // Return original row if processing fails
    }
  });
}

/**
 * Get column headers from the first row and map them
 * @param {Array} data - Array of data rows
 * @returns {Object} - Map of original headers to standard field names
 */
function getColumnMapping(data) {
  if (!data || data.length === 0) {
    return {};
  }
  
  const firstRow = data[0];
  const mapping = {};
  
  Object.keys(firstRow).forEach(originalKey => {
    const lowerKey = originalKey.toLowerCase().trim();
    
    for (const [standardName, variations] of Object.entries(COLUMN_MAPPINGS)) {
      if (variations.some(variation => variation === lowerKey)) {
        mapping[originalKey] = standardName;
        break;
      }
    }
    
    // If no mapping found, use cleaned original key
    if (!mapping[originalKey]) {
      mapping[originalKey] = lowerKey.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
  });
  
  return mapping;
}

module.exports = {
  normalizeRow,
  normalizeSupport,
  formatDate,
  normalizeNumber,
  processData,
  getColumnMapping,
  COLUMN_MAPPINGS
};