// backend/src/controllers/uploadController.js
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xlsb'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Upload handler
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const jobId = uuidv4();
    const { customerName } = req.body;
    
    console.log('Processing file:', req.file.originalname);
    console.log('Customer:', customerName);
    console.log('Job ID:', jobId);
    
    // For now, just return success
    res.json({
      job_id: jobId,
      status: 'processing',
      rows_uploaded: 100,
      message: 'File received and processing'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Status handler
const getJobStatus = async (req, res) => {
  const { jobId } = req.params;
  
  // Mock response for testing
  res.json({
    status: 'completed',
    job_id: jobId,
    rows_processed: 100,
    results: {
      findings: ['Test finding 1', 'Test finding 2']
    }
  });
};

// Results handler
const getResults = async (req, res) => {
  const { jobId } = req.params;
  
  // Mock data for testing
  res.json({
    products: [
      {
        mfg: 'Cisco',
        category: 'Network',
        asset_type: 'Router',
        type: 'Hardware',
        product_id: 'ISR-4431',
        description: 'Cisco ISR Router',
        ship_date: '2023-01-15',
        qty: 5,
        total_value: 25000,
        support_coverage: 'Active',
        end_of_sale: '2025-12-31',
        last_day_support: '2027-12-31'
      }
    ],
    summary: {
      total_items: 1,
      total_quantity: 5,
      total_value: 25000,
      total_manufacturers: 1
    }
  });
};

// Export handler
const exportResults = async (req, res) => {
  res.json({ message: 'Export functionality not yet implemented' });
};

module.exports = {
  upload: upload.single('file'),
  uploadFile,
  getJobStatus,
  getResults,
  exportResults
};
