const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  email: { type: String, required: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  lastStreakUpdate: { type: String, default: "" },
  carbonScore: { type: Number, default: 100 },
  monthlyEmissions: { type: Number, default: 0 },
  badges: [{ type: String }],
  targetEmissions: { type: Number, default: 300 }
});

// Calculator Result Schema
const CalculatorResultSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  timestamp: { type: String, required: true },
  emissions: {
    transportation: { type: Number, required: true },
    energy: { type: Number, required: true },
    food: { type: Number, required: true },
    waste: { type: Number, required: true },
    water: { type: Number, required: true },
    shopping: { type: Number, required: true },
    total: { type: Number, required: true }
  },
  suggestions: [{ type: String }]
});

// Challenge Schema
const ChallengeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  xp: { type: Number, required: true },
  description: { type: String, required: true },
  completed: { type: Boolean, default: false },
  daily: { type: Boolean, default: true }
});

// Community Post Schema
const CommentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  username: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: String, default: () => new Date().toISOString() }
});

const CommunityPostSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  content: { type: String, required: true },
  likes: { type: Number, default: 0 },
  comments: [CommentSchema],
  timestamp: { type: String, required: true }
});

// Offset Transaction Schema
const OffsetTransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  projectName: { type: String, required: true },
  costXP: { type: Number, required: true },
  offsetKg: { type: Number, required: true },
  timestamp: { type: String, required: true }
});

// Register models
mongoose.model('User', UserSchema);
mongoose.model('CalculatorResult', CalculatorResultSchema);
mongoose.model('Challenge', ChallengeSchema);
mongoose.model('CommunityPost', CommunityPostSchema);
mongoose.model('OffsetTransaction', OffsetTransactionSchema);

console.log("📂 [Database Models] Mongoose schemas successfully compiled and registered.");
