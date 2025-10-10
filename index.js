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
    message: 'Emergency endpoint is working. Use /users/check-pending-payments with proper auth for payment fixes.',
    timestamp: new Date().toISOString(),
    server: 'production'
  });
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

// Start server with better error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server starting on port ${PORT}`);
  console.log(`📅 Server started at: ${new Date().toISOString()}`);
  
  // Connect to database after server starts
  Connection()
    .then(() => {
      console.log('✅ Database connected successfully');
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