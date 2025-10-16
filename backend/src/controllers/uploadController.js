// backend/src/controllers/uploadController.js
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Papa = require('papaparse');
const ExcelJS = require('exceljs');

// Import columnMapper - if this doesn't exist, the normalization functions are included below
let processData;
try {
  const columnMapper = require('../utils/columnMapper');
  processData = columnMapper.processData;
} catch (error) {
  console.log('Column mapper not found, using built-in processing');
  // Built-in normalization if columnMapper doesn't exist
  // Built-in normalization if columnMapper doesn't exist
  processData = (data) => {
    return data.map((row, index) => {
      const normalizeSupport = (value) => {
        // Handle null/undefined/empty
        if (!value || value === '' || value === null || value === undefined) {
          return 'Expired';
        }
        
        // Convert to string and clean up
        const strValue = value.toString().trim();
        const upperValue = strValue.toUpperCase();
        
        // Handle placeholder values
        if (strValue === '-' || strValue === '.' || strValue === '?' || strValue === '0' || strValue === '') {
          return 'Expired';
        }
        
        // ONLY these values mean Active
        if (upperValue === 'ACTIVE' || upperValue === 'COVERED') {
          return 'Active';
        }
        
        // EVERYTHING ELSE is Expired
        return 'Expired';
      };

      // Debug the raw quantity value
      const rawQty = row['Item Quantity'];
      if (index < 3) {
        console.log(`DEBUG Row ${index + 1}: Raw 'Item Quantity' = ${rawQty}, type = ${typeof rawQty}`);
      }

      const normalizedItem = {
        id: index + 1,
        mfg: row.mfg || row.Manufacturer || row.manufacturer || row.vendor || '-',
        category: row.category || row['Business Entity'] || row.business_entity || '-',
        asset_type: row.asset_type || row['Asset Type'] || row.AssetType || '-',
        type: row.type || row.Type || row['Product Type'] || '-',
        product_id: row.product_id || row['Product ID'] || row.productid || row.pid || '-',
        description: row.description || row['Product Description'] || row.product_description || '-',
        ship_date: row.ship_date || row['Ship Date'] || row.ShipDate || row.ship_dt || '-',
        qty: parseInt(row['Item Quantity']) || parseInt(row.qty) || parseInt(row.Qty) || parseInt(row.quantity) || parseInt(row.Quantity) || 0,
        total_value: parseFloat(row.total_value || row['Total Value'] || row.totalvalue || row.value || 0) || 0,
        support_coverage: (() => {
          const coveredLineStatus = row['Covered Line Status'];
          const coverage = row.Coverage;
          
          // Try Covered Line Status FIRST (exact case match)
          if (coveredLineStatus) {
            return normalizeSupport(coveredLineStatus);
          }
          
          // Then try Coverage
          if (coverage) {
            return normalizeSupport(coverage);
          }
          
          // Default to Expired if no coverage columns found
          return 'Expired';
        })(),
        end_of_sale: row['End of Product Sale Date'] || row['End of Product Sale'] || row.end_of_sale || row.end_of_product_sale || '-',
        last_day_support: row['Last Date of Support'] || row.last_day_support || row.last_date_of_support || row['Last Support'] || '-'
      };

      // Debug the normalized quantity
      if (index < 3) {
        console.log(`  -> Normalized qty = ${normalizedItem.qty}`);
      }

      return normalizedItem;
    });
  };;     // Closes the processData function
}        // Closes the catch block


// Store uploads in memory for processing
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xlsb', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Store job data in memory (replace with database in production)
const jobStorage = {};

// Parse Excel file
async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const worksheet = workbook.worksheets[0]; // Get first worksheet
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file');
  }
  
  const data = [];
  const headers = [];
  
  // Get headers from first row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = cell.value ? cell.value.toString() : '';
  });
  
  console.log('Excel headers found:', headers);
  
  // Process data rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) { // Skip header row
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          // Handle different cell types
          let value = cell.value;
          if (cell.type === ExcelJS.ValueType.Date) {
            value = cell.value.toISOString().split('T')[0]; // Format date as YYYY-MM-DD
          } else if (cell.type === ExcelJS.ValueType.RichText) {
            value = cell.value.richText.map(rt => rt.text).join('');
          } else if (typeof value === 'object' && value !== null) {
            value = value.toString();
          }
          rowData[header] = value;
        }
      });
      if (Object.keys(rowData).length > 0) {
        data.push(rowData);
      }
    }
  });
  
  return data;
}

// Upload handler
// LOCATION: backend/src/controllers/uploadController.js
// FIND the uploadFile function (starts at line 120)
// REPLACE the ENTIRE uploadFile function with this:

// LOCATION: backend/src/controllers/uploadController.js
// REPLACE the ENTIRE uploadFile function (line 120) with this:

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const jobId = uuidv4();
    const { customerName } = req.body;
    
    console.log('Processing file:', req.file.originalname);
    console.log('Customer:', customerName);
    console.log('File size:', req.file.size, 'bytes');
    
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let parsedData = [];
    
    try {
      if (fileExt === '.csv') {
        // Parse CSV file
        const fileContent = req.file.buffer.toString('utf8');
        const results = await new Promise((resolve, reject) => {
          Papa.parse(fileContent, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (error) => reject(error)
          });
        });
        parsedData = results;
        console.log('CSV parsed rows:', parsedData.length);
        
      } else if (fileExt === '.xlsx' || fileExt === '.xlsb' || fileExt === '.xls') {
        // Parse Excel file
        parsedData = await parseExcel(req.file.buffer);
        console.log('Excel parsed rows:', parsedData.length);
      } else {
        return res.status(400).json({ error: 'Unsupported file type' });
      }
      
      // ============ CRITICAL COLUMN DEBUG ============
      console.log('\n🔍 CRITICAL DEBUG - RAW FILE STRUCTURE:');
      if (parsedData.length > 0) {
        console.log('Column names found:', Object.keys(parsedData[0]));
        console.log('\nFirst 3 rows RAW DATA:');
        parsedData.slice(0, 3).forEach((row, idx) => {
          console.log(`\nRow ${idx + 1}:`);
          Object.keys(row).forEach(key => {
            console.log(`  "${key}": "${row[key]}"`);
          });
        });
      }
      console.log('================================\n');

      // Process data with column mapper
      const normalizedData = processData(parsedData);
      // COMPREHENSIVE QUANTITY DEBUG
      console.log('\n========== RAW DATA QUANTITY CHECK ==========');
      
      // Check what columns exist related to quantity
      if (parsedData.length > 0) {
        const firstRow = parsedData[0];
        const qtyRelatedColumns = Object.keys(firstRow).filter(key => 
          key.toLowerCase().includes('qty') || 
          key.toLowerCase().includes('quant') ||
          key.toLowerCase().includes('item')
        );
        console.log('Quantity-related columns found:', qtyRelatedColumns);
        
        // Show actual values for first 3 rows
        console.log('\nFirst 3 rows - Item Quantity values:');
        parsedData.slice(0, 3).forEach((row, idx) => {
          console.log(`Row ${idx + 1}:`);
          console.log(`  "Item Quantity": ${row['Item Quantity']}`);
          console.log(`  Type of value: ${typeof row['Item Quantity']}`);
          console.log(`  Parsed as int: ${parseInt(row['Item Quantity'])}`);
        });
      }
      
      // Check normalized data
      console.log('\nNormalized data - first 3 items:');
      normalizedData.slice(0, 3).forEach((item, idx) => {
        console.log(`Item ${idx + 1}: qty = ${item.qty}`);
      });
      
      // Count non-zero quantities
      const nonZero = normalizedData.filter(item => item.qty > 0).length;
      console.log(`\nItems with qty > 0: ${nonZero} out of ${normalizedData.length}`);
      console.log('==============================================\n');

      // Debug logging to check support coverage mapping
      console.log('First 5 rows of parsed data columns:', parsedData.slice(0, 5).map(row => Object.keys(row)));
      console.log('First 5 rows Coverage values:', parsedData.slice(0, 5).map(row => ({
        Coverage: row.Coverage,
        coverage: row.coverage,
        'Covered line status': row['Covered line status'],
        'Support Coverage': row['Support Coverage']
      })));

      // Debug normalized support values
      const supportValues = normalizedData.map(item => item.support_coverage);
      const supportCounts = supportValues.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {});
      console.log('Support coverage distribution:', supportCounts);
      console.log('Sample normalized items (first 3):', normalizedData.slice(0, 3).map(item => ({
        product_id: item.product_id,
        support_coverage: item.support_coverage
      })));
      console.log('Normalized rows:', normalizedData.length);
      
      // Calculate REFINED analytics (removed value, added service contracts and categories)
      const totalRecords = normalizedData.length;
      const totalQuantity = normalizedData.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);
      const activeSupport = normalizedData.filter(item => item.support_coverage === 'Active').length;
      const expiredSupport = normalizedData.filter(item => item.support_coverage === 'Expired').length;
      // NEW: Calculate End of Sale, SW Vulnerability, and Last Day Support counts
      const currentDate = new Date();
      const totalEndOfSale = normalizedData.filter(item => {
        if (!item.end_of_sale || item.end_of_sale === '-') return false;
        try {
          const eosDate = new Date(item.end_of_sale);
          return !isNaN(eosDate.getTime()) && eosDate <= currentDate;
        } catch (e) {
          return false;
        }
      }).length;
      
      const totalEndOfSWVuln = normalizedData.filter(item => {
        const vulnField = item['End of Vulnerability/Security Support'] || 
                         item.end_of_vulnerability_support || 
                         item['End of Security Support'] || '-';
        if (!vulnField || vulnField === '-') return false;
        try {
          const vulnDate = new Date(vulnField);
          return !isNaN(vulnDate.getTime()) && vulnDate <= currentDate;
        } catch (e) {
          return false;
        }
      }).length;
      
      const totalLastDaySupport = normalizedData.filter(item => {
        if (!item.last_day_support || item.last_day_support === '-') return false;
        try {
          const ldosDate = new Date(item.last_day_support);
          return !isNaN(ldosDate.getTime()) && ldosDate <= currentDate;
        } catch (e) {
          return false;
        }
      }).length;
      
      // NEW: Manufacturer Breakdown
      const manufacturerBreakdown = {};
      normalizedData.forEach(item => {
        const mfg = item.mfg && item.mfg !== '-' ? item.mfg : 'Unknown';
        if (!manufacturerBreakdown[mfg]) {
          manufacturerBreakdown[mfg] = {
            count: 0,
            quantity: 0,
            activeCount: 0,
            expiredCount: 0
          };
        }
        manufacturerBreakdown[mfg].count++;
        manufacturerBreakdown[mfg].quantity += parseInt(item.qty) || 0;
        
        if (item.support_coverage === 'Active') {
          manufacturerBreakdown[mfg].activeCount++;
        } else if (item.support_coverage === 'Expired') {
          manufacturerBreakdown[mfg].expiredCount++;
        }
      });
      // NEW: Total unique categories
      const uniqueCategories = [...new Set(normalizedData.map(item => item.category || 'Uncategorized'))];
      const totalCategories = uniqueCategories.length;
      
      // NEW: Total Service Contracts (items with Active support)
     // NEW: Total Service Contracts (items with Active support)
      const totalServiceContracts = activeSupport;
      
      // Log the calculation for verification
      console.log(`CALCULATION CHECK: Active Support = ${activeSupport}, Total Items = ${totalRecords}`);
      console.log(`Percentage with support: ${totalRecords > 0 ? Math.round((activeSupport / totalRecords) * 100) : 0}%`);
      
      // Total unique manufacturers
      const totalManufacturers = [...new Set(normalizedData.map(item => item.mfg).filter(m => m && m !== '-'))].length;
      
      // REFINED: Category Breakdown - focus on quantity only
      const categoryBreakdown = {};
      normalizedData.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categoryBreakdown[cat]) {
          categoryBreakdown[cat] = { 
            count: 0,  // Number of unique items
            quantity: 0, // Total quantity
            activeCount: 0,
            expiredCount: 0
          };
        }
        categoryBreakdown[cat].count++;
        categoryBreakdown[cat].quantity += parseInt(item.qty) || 0;
        
        if (item.support_coverage === 'Active') {
          categoryBreakdown[cat].activeCount++;
        } else if (item.support_coverage === 'Expired') {
          categoryBreakdown[cat].expiredCount++;
        }
      });

      // DEBUG category breakdown quantities
      console.log('\n=== CATEGORY BREAKDOWN DEBUG ===');
      Object.entries(categoryBreakdown).forEach(([cat, data]) => {
        console.log(`${cat}: quantity=${data.quantity}, count=${data.count}`);
      });
      console.log('================================\n');
      
      // REFINED: Data Completeness - removed qty and total_value
      const requiredFields = [
        'mfg', 
        'category', 
        'product_id', 
        'description', 
        'support_coverage', 
        'end_of_sale', 
        'last_day_support', 
        'asset_type', 
        'ship_date'
      ];
      
      const fieldCompleteness = {};
      requiredFields.forEach(field => {
        const filled = normalizedData.filter(item => 
          item[field] && 
          item[field] !== '-' && 
          item[field] !== '' &&
          item[field] !== 'N/A'
        ).length;
        fieldCompleteness[field] = Math.round((filled / normalizedData.length) * 100);
      });
      
      // Lifecycle Status by Category
// Lifecycle Status by Category - UPDATED
      const lifecycleByCategory = {};
      Object.keys(categoryBreakdown).forEach(category => {
        const categoryItems = normalizedData.filter(item => 
          (item.category || 'Uncategorized') === category
        );
        
        let totalQty = 0;
        let endOfSaleCount = 0;
        let endOfSWVulnCount = 0;
        let lastDaySupportCount = 0;
        
        categoryItems.forEach(item => {
          totalQty += parseInt(item.qty) || 0;
          
          // Check End of Sale
          if (item.end_of_sale && item.end_of_sale !== '-') {
            try {
              const eosDate = new Date(item.end_of_sale);
              if (!isNaN(eosDate.getTime()) && eosDate <= currentDate) {
                endOfSaleCount++;
              }
            } catch (e) {}
          }
          
          // Check End of SW Vulnerability Support
          const vulnField = item['End of Vulnerability/Security Support'] || 
                           item.end_of_vulnerability_support || 
                           item['End of Security Support'] || '-';
          if (vulnField && vulnField !== '-') {
            try {
              const vulnDate = new Date(vulnField);
              if (!isNaN(vulnDate.getTime()) && vulnDate <= currentDate) {
                endOfSWVulnCount++;
              }
            } catch (e) {}
          }
          
          // Check Last Day of Support
          if (item.last_day_support && item.last_day_support !== '-') {
            try {
              const ldosDate = new Date(item.last_day_support);
              if (!isNaN(ldosDate.getTime()) && ldosDate <= currentDate) {
                lastDaySupportCount++;
              }
            } catch (e) {}
          }
        });
        
        lifecycleByCategory[category] = {
          totalQty,
          endOfSale: endOfSaleCount,
          endOfSWVuln: endOfSWVulnCount,
          lastDaySupport: lastDaySupportCount,
          total: categoryItems.length
        };
      });
      
      // Create refined summary
      const summary = {
        // Keep original fields for compatibility
        total_items: totalRecords,
        total_quantity: totalQuantity,
        total_value: 0, // Keep for compatibility but set to 0
        total_manufacturers: totalManufacturers,
        active_support: activeSupport,
        expired_support: expiredSupport,
        // Add new fields
        total_categories: totalCategories,
        total_service_contracts: totalServiceContracts,
        totalRecords,
        supportCoverage: totalRecords > 0 ? Math.round((activeSupport / totalRecords) * 100) : 0,
        categoryBreakdown,
        manufacturerBreakdown,
        fieldCompleteness,
        lifecycleByCategory
      };
      
      // Store job data in memory with analytics
      jobStorage[jobId] = {
        jobId,
        customerName: customerName || 'Unknown',
        filename: req.file.originalname,
        status: 'completed',
        data: normalizedData,
        summary,
        analytics: {
          categories: categoryBreakdown,
          manufacturerBreakdown,  // Make sure this is included
          completeness: fieldCompleteness,
          lifecycle: lifecycleByCategory,
          totalCategories,
          totalServiceContracts,
          totalEndOfSale,
          totalEndOfSWVuln,
          totalLastDaySupport
        },
        timestamp: new Date(),
        rows_processed: normalizedData.length
      };
      
      console.log('Job stored with ID:', jobId);
      console.log('Refined summary:', summary);
      
      res.json({
        job_id: jobId,
        status: 'processing',
        rows_uploaded: normalizedData.length,
        message: 'File uploaded successfully'
      });
      
    } catch (parseError) {
      console.error('File parsing error:', parseError);
      res.status(500).json({ 
        error: 'Failed to parse file', 
        details: parseError.message,
        fileType: fileExt
      });
    }
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Status handler
const getJobStatus = async (req, res) => {
  const { jobId } = req.params;
  const job = jobStorage[jobId];
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    status: job.status,
    job_id: jobId,
    customer_name: job.customerName,
    filename: job.filename,
    rows_processed: job.rows_processed,
    timestamp: job.timestamp,
    results: {
      findings: [
        `Processed ${job.rows_processed} items`,
        `${job.summary.active_support} items with active support`,
        `${job.summary.expired_support} items with expired support`
      ]
    }
  });
};

// Results handler - return actual processed data
const getResults = async (req, res) => {
  const { jobId } = req.params;
  const job = jobStorage[jobId];
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  // Support pagination if needed in future
  const limit = parseInt(req.query.limit) || job.data.length;
  const offset = parseInt(req.query.offset) || 0;
  
  // Return the processed data
  res.json({
    products: job.data.slice(offset, offset + limit),
    summary: job.summary,
    pagination: {
      total: job.data.length,
      limit: limit,
      offset: offset
    }
  });
};

// Export handler
const exportResults = async (req, res) => {
  const { jobId } = req.params;
  const job = jobStorage[jobId];
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  try {
    const format = req.query.format || 'csv';
    
    if (format === 'excel' || format === 'xlsx') {
      // Export as Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Analysis Results');
      
      // Add headers
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Manufacturer', key: 'mfg', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Asset Type', key: 'asset_type', width: 15 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Product ID', key: 'product_id', width: 20 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Ship Date', key: 'ship_date', width: 12 },
        { header: 'Quantity', key: 'qty', width: 10 },
        { header: 'Total Value', key: 'total_value', width: 15 },
        { header: 'Support Coverage', key: 'support_coverage', width: 15 },
        { header: 'End of Sale', key: 'end_of_sale', width: 12 },
        { header: 'Last Support', key: 'last_day_support', width: 12 }
      ];
      
      // Add data
      job.data.forEach(row => {
        worksheet.addRow(row);
      });
      
      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      
      const filename = `export_${job.customerName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      await workbook.xlsx.write(res);
      res.end();
      
    } else {
      // Export as CSV (default)
      const csv = Papa.unparse(job.data);
      const filename = `export_${job.customerName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed', details: error.message });
  }
};

// Clear old jobs from memory (cleanup function)
const cleanupOldJobs = () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  Object.keys(jobStorage).forEach(jobId => {
    if (jobStorage[jobId].timestamp < oneHourAgo) {
      delete jobStorage[jobId];
      console.log(`Cleaned up old job: ${jobId}`);
    }
  });
};

// Run cleanup every 30 minutes
setInterval(cleanupOldJobs, 30 * 60 * 1000);

module.exports = {
  upload: upload.single('file'),
  uploadFile,
  getJobStatus,
  getResults,
  exportResults
};