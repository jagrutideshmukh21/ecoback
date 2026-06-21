const crypto = require('crypto');

// ─── 1. Password Hashing (PBKDF2) ────────────────────────────────────────────
function hashPassword(password) {
  if (!password || typeof password !== 'string') return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword || typeof password !== 'string' || typeof storedPassword !== 'string') {
    return false;
  }
  const parts = storedPassword.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
}

// ─── 2. Text Sanitization (XSS & HTML strip) ──────────────────────────────────
function sanitizeText(input, maxLength = 2000) {
  if (!input || typeof input !== 'string') return '';
  let sanitized = input
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // Strip inline JS handlers
    .trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  return sanitized;
}

// ─── 3. In-Memory Rate Limiter Middleware ─────────────────────────────────────
const rateLimitStore = new Map();

function rateLimiter({ windowMs = 60000, maxRequests = 100, message = 'Too many requests. Please try again later.' }) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    
    let record = rateLimitStore.get(key);
    if (!record || now >= record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({ 
        error: message, 
        success: false,
        retryAfter: Math.ceil((record.resetAt - now) / 1000)
      });
    }
    
    record.count += 1;
    next();
  };
}

// ─── 4. AI Prompt Validation (Injection Shield) ──────────────────────────────
const BLOCKED_PROMPT_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*:\s*/i,
  /you\s+are\s+now/i,
  /<script/i,
  /javascript:/i,
];

function validateAiPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return { valid: false, error: 'Prompt must be a string.' };
  const sanitized = sanitizeText(prompt, 1000);
  if (!sanitized) return { valid: false, error: 'Empty message content.' };
  
  for (const pattern of BLOCKED_PROMPT_PATTERNS) {
    if (pattern.test(sanitized)) {
      return { valid: false, error: 'Unacceptable message content detected.' };
    }
  }
  return { valid: true, sanitized };
}

// ─── 5. Request Validators ───────────────────────────────────────────────────
function validateCalculatorInputs(req, res, next) {
  const { transportation, energy, food, shopping, water, waste } = req.body;
  if (!transportation || !energy || !food || !shopping || !water || !waste) {
    return res.status(400).json({ error: 'Invalid or missing calculator inputs.' });
  }

  // Parse values safely
  const clamp = (val, min, max, fallback) => {
    const num = parseFloat(val);
    return isNaN(num) ? fallback : Math.min(max, Math.max(min, num));
  };

  req.validatedBody = {
    transportation: {
      carMiles: clamp(transportation.carMiles, 0, 500, 0),
      carType: ['gas', 'hybrid', 'electric'].includes(transportation.carType) ? transportation.carType : 'gas',
      publicTransitHours: clamp(transportation.publicTransitHours, 0, 40, 0),
      yearlyFlights: clamp(transportation.yearlyFlights, 0, 50, 0)
    },
    energy: {
      electricityBill: clamp(energy.electricityBill, 0, 2000, 0),
      gasBill: clamp(energy.gasBill, 0, 2000, 0),
      renewableSource: Boolean(energy.renewableSource)
    },
    food: {
      dietType: ['meat-heavy', 'balanced', 'vegetarian', 'vegan'].includes(food.dietType) ? food.dietType : 'balanced',
      organicLocal: ['never', 'sometimes', 'always'].includes(food.organicLocal) ? food.organicLocal : 'sometimes'
    },
    shopping: {
      frequency: ['low', 'average', 'high'].includes(shopping.frequency) ? shopping.frequency : 'average',
      secondHand: ['never', 'sometimes', 'always'].includes(shopping.secondHand) ? shopping.secondHand : 'sometimes'
    },
    water: {
      showerTime: clamp(water.showerTime, 2, 30, 8),
      waterSavingFixtures: Boolean(water.waterSavingFixtures)
    },
    waste: {
      recyclePlastic: Boolean(waste.recyclePlastic),
      recyclePaper: Boolean(waste.recyclePaper),
      recycleMetal: Boolean(waste.recycleMetal),
      compost: Boolean(waste.compost)
    }
  };

  next();
}

function validatePostInput(req, res, next) {
  const { content } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a valid string.' });
  }
  const sanitized = sanitizeText(content, 500);
  if (sanitized.length < 2) {
    return res.status(400).json({ error: 'Post must be at least 2 characters.' });
  }
  req.validatedContent = sanitized;
  next();
}

function validateCommentInput(req, res, next) {
  const { content } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Comment must be a valid string.' });
  }
  const sanitized = sanitizeText(content, 300);
  if (sanitized.length < 1) {
    return res.status(400).json({ error: 'Comment cannot be empty.' });
  }
  req.validatedContent = sanitized;
  next();
}

function validatePurchaseInput(req, res, next) {
  const { projectName, costXP, offsetKg } = req.body;
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'Invalid project name.' });
  }
  const cost = parseInt(costXP, 10);
  const offset = parseInt(offsetKg, 10);
  if (isNaN(cost) || cost < 1 || cost > 10000) {
    return res.status(400).json({ error: 'Invalid cost parameter.' });
  }
  if (isNaN(offset) || offset < 1 || offset > 10000) {
    return res.status(400).json({ error: 'Invalid offset parameter.' });
  }
  req.validatedPurchase = {
    projectName: sanitizeText(projectName, 200),
    costXP: cost,
    offsetKg: offset
  };
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  sanitizeText,
  rateLimiter,
  validateAiPrompt,
  validateCalculatorInputs,
  validatePostInput,
  validateCommentInput,
  validatePurchaseInput
};
