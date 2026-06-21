require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./db');

// Create Express App
const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
  res.send("EcoTrack AI Backend Running 🚀");
});
// API Routes
app.use('/api', require('./routes'));


// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
// your API routes here


// Set default JWT Secret fallback
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ecotrack_ai_super_secret_fallback_key_2026';

// Middleware
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

// Mount Routes
const routes = require('./routes');
app.use('/api', routes);

// Global Error Handler Middleware (Prevents exposing stack traces)
app.use((err, req, res, next) => {
  console.error("🚨 [Express Error Handler]:", err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: err.message && err.status ? err.message : "An internal server error occurred.",
    success: false
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
