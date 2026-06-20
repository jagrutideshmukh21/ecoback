require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./db');

// Note: models are registered inside db.js when MongoDB is active

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Allow all client queries during development
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

// Mount Routes
const routes = require('./routes');
app.use('/api', routes);

// Base Route
app.get('/', (req, res) => {
  const dbMode = process.env.MONGODB_URI ? 'MongoDB Atlas / Remote' : 'NeDB Embedded (persistent)';
  res.json({
    status: 'online',
    message: 'Welcome to EcoTrack AI API Server',
    database: dbMode,
    docs: 'http://localhost:5000/api'
  });
});

// Start Server after Database connection check
async function startServer() {
  await db.connect();
  app.listen(PORT, () => {
    console.log(`🚀 [Server] EcoTrack AI backend listening on port ${PORT}`);
    console.log(`📡 [Server] API available at http://localhost:${PORT}/api`);
  });
}

startServer().catch(err => {
  console.error("Critical: Failed to launch backend server:", err);
});
