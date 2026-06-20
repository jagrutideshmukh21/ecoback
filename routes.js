const express = require('express');
const router = express.Router();
const db = require('./db');
const ai = require('./aiService');

// Helper to award XP and handle level up
function awardXP(user, xpAmount) {
  user.xp = (user.xp || 0) + xpAmount;
  
  // Exponential level threshold: Level * 500 XP required to level up
  let nextLevelThreshold = user.level * 500;
  while (user.xp >= nextLevelThreshold) {
    user.xp -= nextLevelThreshold;
    user.level += 1;
    nextLevelThreshold = user.level * 500;
    
    // Unlock level badge
    const badgeName = `Level ${user.level} Graduate`;
    if (!user.badges.includes(badgeName)) {
      user.badges.push(badgeName);
    }
  }
  return xpAmount;
}

// Helper to update streak
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
    // Badge unlock for streak milestones
    if (user.streak >= 7 && !user.badges.includes("7-Day Streak")) {
      user.badges.push("7-Day Streak");
    }
  } else if (diffDays > 1) {
    user.streak = 1; // Streak reset if missed a day
  }
  
  user.lastStreakUpdate = now.toISOString();
}

// ----------------------------------------------------
// 1. User & Auth Routes
// ----------------------------------------------------

router.get('/user', async (req, res) => {
  try {
    const user = await db.getUserById("usr_default");
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/user/reset', async (req, res) => {
  try {
    const defaultUser = {
      id: "usr_default",
      username: "EcoWarrior",
      email: "warrior@ecotrack.ai",
      xp: 0,
      level: 1,
      streak: 0,
      lastStreakUpdate: "",
      carbonScore: 0,
      monthlyEmissions: 0,
      badges: [],
      targetEmissions: 300
    };
    const user = await db.saveUser(defaultUser);
    res.json({ message: "User stats reset successfully", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. Calculator & Reports Routes
// ----------------------------------------------------

router.get('/calculator/history', async (req, res) => {
  try {
    const history = await db.getResults("usr_default");
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calculator', async (req, res) => {
  try {
    const inputs = req.body;
    const emissions = ai.calculateEmissions(inputs);
    
    // Call AI service to generate sustainability suggestions and carbon roadmap
    const aiReport = await ai.generateReport(inputs);
    
    const result = {
      userId: "usr_default",
      timestamp: new Date().toISOString(),
      emissions,
      suggestions: aiReport.suggestions || [],
      roadmap: aiReport.roadmap || [],
      trends: aiReport.trends || { prediction: "Stabilizing carbon output", projectedReductionPercentage: 10 }
    };
    
    const savedResult = await db.saveResult(result);
    
    // Update user stats
    const user = await db.getUserById("usr_default");
    user.monthlyEmissions = Math.round(emissions.total);
    
    // Sustainability score logic: base 100. Lower emissions = higher score.
    // Let's assume standard monthly target is 300kg.
    // Score = 100 - (emissions.total / 10). Clamped between 0 and 100.
    let score = Math.round(100 - (emissions.total / 15));
    user.carbonScore = Math.max(0, Math.min(100, score));
    
    // First calculator badge award
    if (!user.badges.includes("Carbon Conscious")) {
      user.badges.push("Carbon Conscious");
    }
    
    // Award XP for updating calculator
    awardXP(user, 150);
    await db.saveUser(user);
    
    res.json({ result: savedResult, user });
  } catch (err) {
    console.error("Calculator Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. AI Assistant Chat Routes
// ----------------------------------------------------

router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const user = await db.getUserById("usr_default");
    
    const reply = await ai.chat(messages, user);
    
    res.json({ content: reply, role: 'assistant', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. Challenges & Gamification Routes
// ----------------------------------------------------

router.get('/challenges', async (req, res) => {
  try {
    const challenges = await db.getChallenges();
    const user = await db.getUserById("usr_default");
    res.json({ challenges, userStreak: user.streak, xp: user.xp, level: user.level });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/challenges/complete', async (req, res) => {
  try {
    const { challengeId } = req.body;
    const user = await db.getUserById("usr_default");
    const challenges = await db.getChallenges();
    
    const challengeIndex = challenges.findIndex(c => c.id === challengeId);
    if (challengeIndex === -1) {
      return res.status(404).json({ error: "Challenge not found" });
    }
    
    const challenge = challenges[challengeIndex];
    
    // Check if daily challenges were reset, or just toggle completed
    // In our simplified system, we allow completing and mark it.
    // If it's already completed, we can bypass
    if (challenge.completed) {
      return res.json({ message: "Challenge already completed", user });
    }
    
    challenge.completed = true;
    
    // Award XP and update streak
    const xpEarned = awardXP(user, challenge.xp);
    updateStreak(user);
    
    // Award badges for milestone tasks
    if (challenge.category === "Transportation" && !user.badges.includes("Transit Hero")) {
      user.badges.push("Transit Hero");
    }
    
    await db.saveUser(user);
    
    res.json({
      message: `Completed challenge! Earned ${xpEarned} XP.`,
      challenge,
      user
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// QR Reward claims (Simulate scanning a real recycling bin / public transport QR code)
router.post('/challenges/qr', async (req, res) => {
  try {
    const { qrCode } = req.body;
    const user = await db.getUserById("usr_default");
    
    let xpAwarded = 0;
    let message = "";
    let badgeEarned = "";
    
    const cleanCode = qrCode.trim().toUpperCase();
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
    
    await db.saveUser(user);
    
    res.json({
      message,
      xpAwarded,
      user,
      badge: badgeEarned
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. Community Feed Routes
// ----------------------------------------------------

router.get('/community/posts', async (req, res) => {
  try {
    const posts = await db.getPosts();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/community/posts', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Content is required" });
    }
    
    const user = await db.getUserById("usr_default");
    const newPost = {
      userId: user.id,
      username: user.username,
      content,
      likes: 0,
      comments: []
    };
    
    const savedPost = await db.savePost(newPost);
    
    // Award 50 XP for sharing social updates
    awardXP(user, 50);
    await db.saveUser(user);
    
    res.json({ post: savedPost, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/community/posts/:id/like', async (req, res) => {
  try {
    const updatedPost = await db.toggleLike(req.params.id);
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/community/posts/:id/comment', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "Comment text is required" });
    }
    
    const user = await db.getUserById("usr_default");
    const comment = {
      username: user.username,
      content
    };
    
    const updatedPost = await db.addComment(req.params.id, comment);
    if (!updatedPost) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 6. Carbon Offset Marketplace
// ----------------------------------------------------

router.get('/marketplace/transactions', async (req, res) => {
  try {
    const transactions = await db.getOffsetTransactions("usr_default");
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/marketplace/purchase', async (req, res) => {
  try {
    const { projectName, costXP, offsetKg } = req.body;
    const user = await db.getUserById("usr_default");
    
    // Calculate total XP the user has (level * 500 + current XP)
    // To purchase, they must spend current XP. If XP is less than cost, they cannot purchase
    // Wait, let's keep it simple: we just check user.xp
    if (user.xp < costXP) {
      return res.status(400).json({ error: `Insufficient XP. You need ${costXP} XP but only have ${user.xp} XP in your level buffer.` });
    }
    
    // Deduct XP
    user.xp -= costXP;
    
    const transaction = {
      userId: user.id,
      projectName,
      costXP,
      offsetKg,
      timestamp: new Date().toISOString()
    };
    
    const savedTx = await db.saveOffsetTransaction(transaction);
    
    // Award Offset badge
    if (!user.badges.includes("Carbon Offseter")) {
      user.badges.push("Carbon Offseter");
    }
    
    await db.saveUser(user);
    
    res.json({
      message: `Successfully purchased offset! Offsetting ${offsetKg} kg of CO2.`,
      transaction: savedTx,
      user
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 7. Weather-based Eco Suggestions
// ----------------------------------------------------

router.get('/weather/suggestions', (req, res) => {
  const suggestions = [
    { condition: "Sunny", temp: "75°F", tip: "Hang dry laundry on a rack outside. Dryers are high emission appliances.", icon: "Sun" },
    { condition: "Warm", temp: "78°F", tip: "Open windows for cross-ventilation instead of turning on air conditioning.", icon: "Wind" },
    { condition: "Rainy", temp: "62°F", tip: "Deploy rain barrels for garden watering, lowering municipal water filter load.", icon: "CloudRain" },
    { condition: "Breezy", temp: "68°F", tip: "Perfect day for walking or cycling commutes; the tailwinds will make it a breeze!", icon: "Wind" }
  ];
  
  // Pick one random suggestion based on current time or simple randomizer
  const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
  res.json(randomSuggestion);
});

module.exports = router;
