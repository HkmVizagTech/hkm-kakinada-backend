const express = require('express');
const cors = require('cors');
const gupshup=require('@api/gupshup');
const Candidate = require('./src/models/Candidate.model');
const cron = require('node-cron');
const { Connection } = require('./src/config/db');
const { CandidateRouter } = require('./src/routes/candidate.routes');
const bodyParser = require('body-parser');
const { CandidateController } = require('./src/controllers/Candidate.controller');
const {userRouter} = require('./src/routes/user.Routes');

const app = express();

app.use(cors());


app.post('/users/webhook', bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}), CandidateController.webhook);

// Test endpoint to verify webhook connectivity
app.get('/users/webhook-test', (req, res) => {
  console.log('🧪 Webhook test endpoint called at:', new Date().toISOString());
  res.json({ 
    status: 'ok', 
    message: 'Webhook endpoint is reachable',
    timestamp: new Date().toISOString(),
    server: 'production'
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HKM Vanabhojan Backend Server',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Simple health check and emergency status endpoint
app.get('/emergency-payment-fix', (req, res) => {
  console.log('🚨 Emergency payment fix endpoint called at:', new Date().toISOString());
  res.json({ 
    status: 'ok', 
    message: 'Emergency endpoint is working. Use /check-pending-payments for payment fixes.',
    timestamp: new Date().toISOString(),
    server: 'production'
  });
});

// Emergency payment fix endpoint (direct route to avoid conflicts)
app.get('/check-pending-payments', async (req, res) => {
  try {
    console.log('🚨 Check pending payments called at:', new Date().toISOString());
    const { CandidateController } = require('./src/controllers/Candidate.controller');
    
    // Create a mock authenticated request
    const mockReq = { user: { role: 'admin' } };
    const mockRes = {
      json: (data) => {
        console.log('📊 Payment check results:', JSON.stringify(data, null, 2));
        res.json(data);
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ Payment check error (${code}):`, data);
          res.status(code).json(data);
        }
      })
    };
    
    await CandidateController.checkPendingPayments(mockReq, mockRes);
  } catch (error) {
    console.error('💥 Check pending payments error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use("/users", CandidateRouter);
app.use("/admin/users", userRouter)


const PORT = process.env.PORT || 3300;

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Automatic payment status checker - runs every 10 seconds
const startAutomaticPaymentChecker = () => {
  console.log('🤖 Starting automatic payment status checker...');
  
  // Run every 10 seconds
  cron.schedule('*/10 * * * * *', async () => {
    try {
      console.log('🔄 Auto-checking pending payments...', new Date().toISOString());
      
      const { CandidateController } = require('./src/controllers/Candidate.controller');
      
      // Create a mock request/response for the controller
      const mockReq = { user: { role: 'admin' } };
      const mockRes = {
        json: (data) => {
          if (data.totalUpdated > 0) {
            console.log(`✅ Auto-updated ${data.totalUpdated} payments automatically`);
          } else {
            console.log('ℹ️ No pending payments to update');
          }
        },
        status: (code) => ({
          json: (data) => {
            console.log(`⚠️ Auto-payment check error (${code}):`, data.message);
          }
        })
      };
      
      await CandidateController.checkPendingPayments(mockReq, mockRes);
    } catch (error) {
      console.error('❌ Auto payment check failed:', error.message);
    }
  });
};

// Start server with better error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server starting on port ${PORT}`);
  console.log(`📅 Server started at: ${new Date().toISOString()}`);
  
  // Connect to database after server starts
  Connection()
    .then(() => {
      console.log('✅ Database connected successfully');
      
      // Start automatic payment checker after DB is connected
      setTimeout(() => {
        startAutomaticPaymentChecker();
        console.log('🤖 Automatic payment checker started - will run every 10 seconds');
      }, 5000); // Wait 5 seconds after server starts
      
    })
    .catch((error) => {
      console.error('❌ Database connection failed:', error);
      // Don't exit on DB error, let the server continue
    });
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});