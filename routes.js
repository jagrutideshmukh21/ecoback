const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('./db');
const ai = require('./aiService');
const { 
  rateLimiter, 
  validateAiPrompt,
  validateCalculatorInputs,
  validatePostInput,
  validateCommentInput,
  validatePurchaseInput,
  hashPassword,
  verifyPassword,
  sanitizeText
} = require('./security');

// ─── JWT Verification Middleware ─────────────────────────────────────────────
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.getUserById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

// ─── Helper: Award XP & Handle Level Up ──────────────────────────────────────
function awardXP(user, xpAmount) {
  user.xp = (user.xp || 0) + xpAmount;
  let nextLevelThreshold = user.level * 500;
  while (user.xp >= nextLevelThreshold) {
    user.xp -= nextLevelThreshold;
    user.level += 1;
    nextLevelThreshold = user.level * 500;
    
    const badgeName = `Level ${user.level} Graduate`;
    if (!user.badges.includes(badgeName)) {
      user.badges.push(badgeName);
    }
  }
  return xpAmount;
}

// ─── Helper: Update Daily Streak ─────────────────────────────────────────────
function updateStreak(user) {
  const now = new Date();
  if (!user.lastStreakUpdate) {
    user.streak = 1;
    user.lastStreakUpdate = now.toISOString();
    return;
  }
  
  const lastUpdate = new Date(user.lastStreakUpdate);
  const diffTime = Math.abs(now - lastUpdate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) {
    user.streak += 1;
    if (user.streak >= 7 && !user.badges.includes("7-Day Streak")) {
      user.badges.push("7-Day Streak");
    }
  } else if (diffDays > 1) {
    user.streak = 1;
  }
  user.lastStreakUpdate = now.toISOString();
}

// ─── 1. Authentication Routes (Register & Login) ──────────────────────────────
router.post('/auth/register', rateLimiter({ windowMs: 60000, maxRequests: 10 }), async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }
    
    const cleanUsername = sanitizeText(username, 30);
    const cleanEmail = sanitizeText(email, 100).toLowerCase();
    
    if (cleanUsername.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters.' });
    }
    if (!cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    
    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }
    
    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      email: cleanEmail,
      password: hashPassword(password),
      xp: 0,
      level: 1,
      streak: 0,
      lastStreakUpdate: "",
      carbonScore: 100,
      monthlyEmissions: 0,
      badges: ['Eco Starter'],
      targetEmissions: 300
    };
    
    const savedUser = await db.saveUser(newUser);
    const token = jwt.sign({ id: savedUser.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Hide password hash in output
    const { password: _, ...userOutput } = savedUser;
    res.status(201).json({ token, user: userOutput });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/login', rateLimiter({ windowMs: 60000, maxRequests: 10 }), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    
    const cleanEmail = email.trim().toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Hide password hash
    let userOutput = user;
    if (user.toObject) userOutput = user.toObject();
    delete userOutput.password;
    
    res.json({ token, user: userOutput });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. User Profile Routes ──────────────────────────────────────────────────
router.get('/user', verifyToken, async (req, res) => {
  try {
    let userOutput = req.user;
    if (req.user.toObject) userOutput = req.user.toObject();
    delete userOutput.password;
    res.json(userOutput);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/user/reset', verifyToken, async (req, res) => {
  try {
    const user = req.user;
    user.xp = 0;
    user.level = 1;
    user.streak = 0;
    user.lastStreakUpdate = "";
    user.carbonScore = 100;
    user.monthlyEmissions = 0;
    user.badges = ['Eco Starter'];
    user.targetEmissions = 300;
    
    const updated = await db.saveUser(user);
    let userOutput = updated;
    if (updated.toObject) userOutput = updated.toObject();
    delete userOutput.password;
    
    res.json({ message: "User stats reset successfully", user: userOutput });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Calculator & Reports Routes ──────────────────────────────────────────
router.get('/calculator/history', verifyToken, async (req, res) => {
  try {
    const history = await db.getResults(req.userId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calculator', verifyToken, rateLimiter({ windowMs: 60000, maxRequests: 15 }), validateCalculatorInputs, async (req, res) => {
  try {
    const inputs = req.validatedBody;
    const emissions = ai.calculateEmissions(inputs);
    const aiReport = await ai.generateReport(inputs);
    
    const result = {
      userId: req.userId,
      timestamp: new Date().toISOString(),
      emissions,
      suggestions: aiReport.suggestions || [],
      roadmap: aiReport.roadmap || [],
      trends: aiReport.trends || { prediction: "Stabilizing carbon output", projectedReductionPercentage: 10 }
    };
    
    const savedResult = await db.saveResult(result);
    
    const user = req.user;
    user.monthlyEmissions = Math.round(emissions.total);
    let score = Math.round(100 - (emissions.total / 15));
    user.carbonScore = Math.max(0, Math.min(100, score));
    
    if (!user.badges.includes("Carbon Conscious")) {
      user.badges.push("Carbon Conscious");
    }
    
    awardXP(user, 150);
    const updatedUser = await db.saveUser(user);
    
    let userOutput = updatedUser;
    if (updatedUser.toObject) userOutput = updatedUser.toObject();
    delete userOutput.password;
    
    res.json({ result: savedResult, user: userOutput });
  } catch (err) {
    console.error("Calculator Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. AI Assistant Chat Route ──────────────────────────────────────────────
router.post('/chat', verifyToken, rateLimiter({ windowMs: 60000, maxRequests: 10 }), async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Chat logs are empty or invalid." });
    }
    
    const lastMessageObj = messages[messages.length - 1];
    if (!lastMessageObj || !lastMessageObj.content) {
      return res.status(400).json({ error: "Last message content is missing." });
    }
    
    // AI Prompt Security check
    const promptCheck = validateAiPrompt(lastMessageObj.content);
    if (!promptCheck.valid) {
      return res.status(400).json({ error: promptCheck.error });
    }
    
    // Sanitize message feeds for safety
    const sanitizedMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: sanitizeText(m.content, 1000)
    }));
    
    const reply = await ai.chat(sanitizedMessages, req.user);
    res.json({ content: reply, role: 'assistant', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. Challenges & Gamification Routes ─────────────────────────────────────
router.get('/challenges', verifyToken, async (req, res) => {
  try {
    const challenges = await db.getChallenges();
    res.json({ 
      challenges, 
      userStreak: req.user.streak, 
      xp: req.user.xp, 
      level: req.user.level 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/challenges/complete', verifyToken, async (req, res) => {
  try {
    const { challengeId } = req.body;
    const user = req.user;
    const challenges = await db.getChallenges();
    
    const challengeIndex = challenges.findIndex(c => c.id === challengeId);
    if (challengeIndex === -1) {
      return res.status(404).json({ error: "Challenge not found." });
    }
    
    const challenge = challenges[challengeIndex];
    if (challenge.completed) {
      let userOutput = user;
      if (user.toObject) userOutput = user.toObject();
      delete userOutput.password;
      return res.json({ message: "Challenge already completed", user: userOutput });
    }
    
    challenge.completed = true;
    const xpEarned = awardXP(user, challenge.xp);
    updateStreak(user);
    
    if (challenge.category === "Transportation" && !user.badges.includes("Transit Hero")) {
      user.badges.push("Transit Hero");
    }
    
    const updatedUser = await db.saveUser(user);
    let userOutput = updatedUser;
    if (updatedUser.toObject) userOutput = updatedUser.toObject();
    delete userOutput.password;
    
    res.json({
      message: `Completed challenge! Earned ${xpEarned} XP.`,
      challenge,
      user: userOutput
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/challenges/qr', verifyToken, async (req, res) => {
  try {
    const { qrCode } = req.body;
    if (!qrCode || typeof qrCode !== 'string') {
      return res.status(400).json({ error: "Invalid QR code format." });
    }
    const cleanCode = qrCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    
    const user = req.user;
    let xpAwarded = 0;
    let message = "";
    let badgeEarned = "";
    
    if (cleanCode === 'METRO_GREEN') {
      xpAwarded = 250;
      message = "Metro ticket verified! Thank you for choosing public transit.";
      badgeEarned = "Commute Champion";
    } else if (cleanCode === 'RECYCLE_BIN_4') {
      xpAwarded = 150;
      message = "Eco-bin recycling verified! Proper waste sorting confirmed.";
      badgeEarned = "Recycling Champ";
    } else if (cleanCode === 'CUP_RETURN_OK') {
      xpAwarded = 100;
      message = "Reusable mug verified! Coffee cup waste prevented.";
      badgeEarned = "Zero Waste Hero";
    } else {
      return res.status(400).json({ error: "Invalid or unrecognized EcoTrack QR Code." });
    }
    
    awardXP(user, xpAwarded);
    if (badgeEarned && !user.badges.includes(badgeEarned)) {
      user.badges.push(badgeEarned);
    }
    
    const updatedUser = await db.saveUser(user);
    let userOutput = updatedUser;
    if (updatedUser.toObject) userOutput = updatedUser.toObject();
    delete userOutput.password;
    
    res.json({
      message,
      xpAwarded,
      user: userOutput,
      badge: badgeEarned
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. Community Feed Routes ────────────────────────────────────────────────
router.get('/community/posts', verifyToken, async (req, res) => {
  try {
    const posts = await db.getPosts();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/community/posts', verifyToken, validatePostInput, async (req, res) => {
  try {
    const content = req.validatedContent;
    const user = req.user;
    
    const newPost = {
      userId: user.id,
      username: user.username,
      content,
      likes: 0,
      comments: []
    };
    
    const savedPost = await db.savePost(newPost);
    awardXP(user, 50);
    const updatedUser = await db.saveUser(user);
    
    let userOutput = updatedUser;
    if (updatedUser.toObject) userOutput = updatedUser.toObject();
    delete userOutput.password;
    
    res.json({ post: savedPost, user: userOutput });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/community/posts/:id/like', verifyToken, async (req, res) => {
  try {
    const updatedPost = await db.toggleLike(req.params.id);
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found." });
    }
    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/community/posts/:id/comment', verifyToken, validateCommentInput, async (req, res) => {
  try {
    const content = req.validatedContent;
    const user = req.user;
    const comment = {
      username: user.username,
      content
    };
    
    const updatedPost = await db.addComment(req.params.id, comment);
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found." });
    }
    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. Carbon Offset Marketplace ────────────────────────────────────────────
router.get('/marketplace/transactions', verifyToken, async (req, res) => {
  try {
    const transactions = await db.getOffsetTransactions(req.userId);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/marketplace/purchase', verifyToken, validatePurchaseInput, async (req, res) => {
  try {
    const { projectName, costXP, offsetKg } = req.validatedPurchase;
    const user = req.user;
    
    if (user.xp < costXP) {
      return res.status(400).json({ 
        error: `Insufficient XP. You need ${costXP} XP but only have ${user.xp} XP in your current level.` 
      });
    }
    
    user.xp -= costXP;
    const transaction = {
      userId: user.id,
      projectName,
      costXP,
      offsetKg,
      timestamp: new Date().toISOString()
    };
    
    const savedTx = await db.saveOffsetTransaction(transaction);
    if (!user.badges.includes("Carbon Offseter")) {
      user.badges.push("Carbon Offseter");
    }
    
    const updatedUser = await db.saveUser(user);
    let userOutput = updatedUser;
    if (updatedUser.toObject) userOutput = updatedUser.toObject();
    delete userOutput.password;
    
    res.json({
      message: `Successfully purchased offset! Offsetting ${offsetKg} kg of CO2.`,
      transaction: savedTx,
      user: userOutput
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. Weather-based Eco Suggestions (Cached in-memory) ─────────────────────
let cachedWeather = null;
let cacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

router.get('/weather/suggestions', (req, res) => {
  const now = Date.now();
  if (cachedWeather && (now - cacheTime < CACHE_DURATION)) {
    return res.json(cachedWeather);
  }
  
  const suggestions = [
    { condition: "Sunny", temp: "75°F", tip: "Hang dry laundry on a rack outside. Dryers are high emission appliances.", icon: "Sun" },
    { condition: "Warm", temp: "78°F", tip: "Open windows for cross-ventilation instead of turning on air conditioning.", icon: "Wind" },
    { condition: "Rainy", temp: "62°F", tip: "Deploy rain barrels for garden watering, lowering municipal water filter load.", icon: "CloudRain" },
    { condition: "Breezy", temp: "68°F", tip: "Perfect day for walking or cycling commutes; the tailwinds will make it a breeze!", icon: "Wind" }
  ];
  
  cachedWeather = suggestions[Math.floor(Math.random() * suggestions.length)];
  cacheTime = now;
  res.json(cachedWeather);
});

module.exports = router;
