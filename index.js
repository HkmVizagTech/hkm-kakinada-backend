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
  res.send('Welcome to the home page');
});

app.use("/users", CandidateRouter);
app.use("/admin/users", userRouter)


const PORT = process.env.PORT || 3300;
app.listen(PORT,'0.0.0.0', async () => {
  try {
    await Connection();
    console.log(`Server connected on port ${PORT}`);
  } catch (error) {
    console.error('Database connection failed:', error);
  }
});