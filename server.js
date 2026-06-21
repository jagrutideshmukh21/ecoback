require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./db');
const routes = require('./routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Root Route
app.get('/', (req, res) => {
  res.send('EcoTrack AI Backend Running 🚀');
});

// API Routes
app.use('/api', routes);

// Error Handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

// Start Server
async function startServer() {
  try {
    await db.connect();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Server startup failed:', error);
  }
}

startServer();