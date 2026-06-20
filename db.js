/**
 * db.js — EcoTrack AI Database Layer
 *
 * Priority:
 *  1. MongoDB Atlas (or any MongoDB) — when MONGODB_URI is set in .env
 *  2. NeDB embedded persistent database — automatic fallback, no setup needed
 */

require('dotenv').config();
const path = require('path');
const fs   = require('fs');

// ─── Ensure data directory ────────────────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ─── State ────────────────────────────────────────────────────────────────────
let mode = 'nedb'; // 'mongodb' | 'nedb'
let mongoose = null;

// ─── NeDB setup ───────────────────────────────────────────────────────────────
const Datastore = require('@seald-io/nedb');
const nedb = {
  users:        new Datastore({ filename: path.join(dataDir, 'users.db'),        autoload: true }),
  results:      new Datastore({ filename: path.join(dataDir, 'results.db'),      autoload: true }),
  challenges:   new Datastore({ filename: path.join(dataDir, 'challenges.db'),   autoload: true }),
  posts:        new Datastore({ filename: path.join(dataDir, 'posts.db'),        autoload: true }),
  transactions: new Datastore({ filename: path.join(dataDir, 'transactions.db'), autoload: true }),
};

// ─── NeDB promisified helpers ─────────────────────────────────────────────────
const nFind    = (s, q={})  => new Promise((res, rej) => s.find(q,   (e,d) => e ? rej(e) : res(d)));
const nFindOne = (s, q)     => new Promise((res, rej) => s.findOne(q,(e,d) => e ? rej(e) : res(d)));
const nInsert  = (s, doc)   => new Promise((res, rej) => s.insert(doc,(e,d)=> e ? rej(e) : res(d)));
const nUpdate  = (s, q, u, opts={}) => new Promise((res, rej) =>
  s.update(q, u, { returnUpdatedDocs: true, ...opts }, (e, _n, d) => e ? rej(e) : res(d))
);
const nUpsert = async (s, q, data) => {
  const { _id, ...clean } = data;
  await nUpdate(s, q, { $set: clean }, { upsert: true });
  return nFindOne(s, q);
};

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED = {
  users: [{
    id: 'usr_default', username: 'EcoWarrior', email: 'warrior@ecotrack.ai',
    xp: 1250, level: 4, streak: 5, lastStreakUpdate: new Date().toISOString(),
    carbonScore: 72, monthlyEmissions: 320, targetEmissions: 250,
    badges: ['Eco Starter', 'Transit Hero', 'Recycling Champion'],
  }],
  challenges: [
    { id:'ch_1', title:'Meatless Day',       category:'Food',           xp:150, description:'Have a fully vegetarian or vegan day.',                                        completed:false, daily:true },
    { id:'ch_2', title:'Ditch the Car',      category:'Transportation', xp:200, description:'Walk, cycle, or take public transport instead of driving.',                   completed:false, daily:true },
    { id:'ch_3', title:'Unplug Idle Devices',category:'Energy',         xp:100, description:'Unplug chargers, appliances, and electronics when not in use.',               completed:false, daily:true },
    { id:'ch_4', title:'Cold Water Wash',    category:'Water',          xp:120, description:'Run a load of laundry using only cold water.',                                completed:false, daily:true },
    { id:'ch_5', title:'Zero Waste Hero',    category:'Waste',          xp:180, description:'Do not use single-use plastics today.',                                       completed:false, daily:true },
    { id:'ch_6', title:'Green Shopping',     category:'Shopping',       xp:220, description:'Choose a sustainable or second-hand item instead of new.',                   completed:false, daily:true },
  ],
  posts: [
    { id:'post_1', userId:'usr_default', username:'EcoWarrior',
      content:"Just completed the 'Ditch the Car' challenge! Rode my bike 8km. Saved 2.4kg CO2! 🚲🌱",
      likes:12, comments:[
        { id:'c_1', username:'GreenTerra',  content:'Awesome job! Keep it up! 🙌',              timestamp: new Date().toISOString() },
        { id:'c_2', username:'SolarPower',  content:'Biking is best for health and planet!',    timestamp: new Date().toISOString() },
      ], timestamp: new Date(Date.now() - 2*3600*1000).toISOString() },
    { id:'post_2', userId:'usr_other', username:'NatureLover',
      content:'Planted three tomato plants in my backyard garden. Growing own food cuts food miles! 🍅✨',
      likes:24, comments:[], timestamp: new Date(Date.now() - 5*3600*1000).toISOString() },
  ],
  results: [
    { id:'res_1', userId:'usr_default', timestamp: new Date(Date.now()-30*86400*1000).toISOString(),
      emissions:{ transportation:180, energy:120, food:90, waste:40, water:20, shopping:50, total:500 },
      suggestions:['Consider public transit twice a week.','Swap bulbs for LEDs.','Cut red meat 2 days/week.'] },
    { id:'res_2', userId:'usr_default', timestamp: new Date().toISOString(),
      emissions:{ transportation:110, energy:90, food:60, waste:30, water:15, shopping:15, total:320 },
      suggestions:['Walk instead of driving short distances.','Compost food waste.','Try local organic produce.'],
      roadmap:[
        { milestone:'Short-term (Week 1-4)',   actions:['Ditch car 2x weekly','Wash laundry on cold cycle'],           impact:'Saves 12kg CO2' },
        { milestone:'Medium-term (Month 2-6)', actions:['Buy energy saving bulbs','Draft proof windows'],              impact:'Saves 35kg CO2' },
        { milestone:'Long-term (Year 1+)',      actions:['Invest in home battery or solar charging'],                  impact:'Cuts energy output by 40%' },
      ],
      trends:{ prediction:'A 20% future drop with proposed roadmaps.', projectedReductionPercentage:20 } },
  ],
  transactions: [
    { id:'tx_1', userId:'usr_default', projectName:'Amazon Rainforest Conservation',
      costXP:800, offsetKg:100, timestamp: new Date(Date.now()-10*86400*1000).toISOString() },
  ],
};

// ─── NeDB seeding ─────────────────────────────────────────────────────────────
async function seedNeDB() {
  const map = { users: nedb.users, challenges: nedb.challenges, posts: nedb.posts, results: nedb.results, transactions: nedb.transactions };
  for (const [col, store] of Object.entries(map)) {
    const existing = await nFind(store);
    if (existing.length === 0 && SEED[col]) {
      console.log(`🌱 [NeDB] Seeding ${col} (${SEED[col].length} records)...`);
      for (const doc of SEED[col]) await nInsert(store, doc);
    }
  }
  console.log('✅ [NeDB] Ready — data persisted at ./data/*.db');
}

// ─── MongoDB seeding ──────────────────────────────────────────────────────────
async function seedMongoDB() {
  const User       = mongoose.model('User');
  const Challenge  = mongoose.model('Challenge');
  const CommunityPost = mongoose.model('CommunityPost');
  const CalculatorResult = mongoose.model('CalculatorResult');
  const OffsetTransaction = mongoose.model('OffsetTransaction');

  if (await User.countDocuments() === 0) {
    console.log('🌱 [MongoDB] Seeding initial data...');
    await User.insertMany(SEED.users);
    await Challenge.insertMany(SEED.challenges);
    await CommunityPost.insertMany(SEED.posts);
    await CalculatorResult.insertMany(SEED.results);
    await OffsetTransaction.insertMany(SEED.transactions);
    console.log('✅ [MongoDB] Seed complete.');
  }
}

// ─── Connect ──────────────────────────────────────────────────────────────────
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      mongoose = require('mongoose');
      require('./models'); // register schemas
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      console.log('✅ [Database] MongoDB Atlas connected successfully!');
      mode = 'mongodb';
      await seedMongoDB();
      return 'mongodb';
    } catch (err) {
      console.warn(`⚠️  [MongoDB] Connection failed: ${err.message}`);
      console.log('🔄 [Database] Switching to NeDB embedded database...');
      mongoose = null;
    }
  } else {
    console.log('ℹ️  [Database] No MONGODB_URI set.');
  }

  // Fall back to NeDB
  mode = 'nedb';
  console.log('💾 [Database] Using NeDB embedded database (persistent file storage).');
  await seedNeDB();
  return 'nedb';
}

// ─── Helpers: pick correct model/store ───────────────────────────────────────
function useMongo() { return mode === 'mongodb' && mongoose !== null; }

// ─── dbAdapter ────────────────────────────────────────────────────────────────
const dbAdapter = {
  connect: connectDB,
  getMode: () => mode,
  isConnected: () => true,

  // ── Users ────────────────────────────────────────────────────────────────────
  async getUserById(id) {
    if (useMongo()) {
      const User = mongoose.model('User');
      return (await User.findOne({ id })) || (await User.findOne({}));
    }
    return (await nFindOne(nedb.users, { id })) || (await nFind(nedb.users)).shift() || null;
  },

  async saveUser(userData) {
    let clean = userData;
    if (userData && typeof userData.toObject === 'function') {
      clean = userData.toObject();
    } else if (userData && userData._doc) {
      clean = { ...userData._doc };
    } else {
      clean = { ...userData };
    }
    const { _id, __v, ...updateData } = clean;
    if (useMongo()) {
      const User = mongoose.model('User');
      return User.findOneAndUpdate({ id: updateData.id }, updateData, { upsert: true, new: true });
    }
    return nUpsert(nedb.users, { id: updateData.id }, updateData);
  },

  // ── Calculator Results ────────────────────────────────────────────────────────
  async getResults(userId) {
    if (useMongo()) {
      const CalculatorResult = mongoose.model('CalculatorResult');
      return CalculatorResult.find({ userId }).sort({ timestamp: -1 });
    }
    const all = await nFind(nedb.results, { userId });
    return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async saveResult(data) {
    data.id        = data.id        || `res_${Date.now()}`;
    data.timestamp = data.timestamp || new Date().toISOString();
    if (useMongo()) {
      const CalculatorResult = mongoose.model('CalculatorResult');
      const doc = new CalculatorResult(data);
      return doc.save();
    }
    const { _id, ...clean } = data;
    return nInsert(nedb.results, clean);
  },

  // ── Challenges ────────────────────────────────────────────────────────────────
  async getChallenges() {
    if (useMongo()) return mongoose.model('Challenge').find({});
    return nFind(nedb.challenges);
  },

  async updateChallenge(id, fields) {
    if (useMongo()) {
      return mongoose.model('Challenge').findOneAndUpdate({ id }, { $set: fields }, { new: true });
    }
    await nUpdate(nedb.challenges, { id }, { $set: fields });
    return nFindOne(nedb.challenges, { id });
  },

  // ── Community Posts ───────────────────────────────────────────────────────────
  async getPosts() {
    if (useMongo()) {
      const posts = await mongoose.model('CommunityPost').find({}).sort({ timestamp: -1 });
      return posts;
    }
    const all = await nFind(nedb.posts);
    return all.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async savePost(data) {
    data.id        = data.id        || `post_${Date.now()}`;
    data.timestamp = data.timestamp || new Date().toISOString();
    data.likes     = data.likes     || 0;
    data.comments  = data.comments  || [];
    if (useMongo()) {
      const doc = new (mongoose.model('CommunityPost'))(data);
      return doc.save();
    }
    const { _id, ...clean } = data;
    return nInsert(nedb.posts, clean);
  },

  async addComment(postId, commentData) {
    commentData.id        = commentData.id        || `c_${Date.now()}`;
    commentData.timestamp = commentData.timestamp || new Date().toISOString();
    if (useMongo()) {
      return mongoose.model('CommunityPost').findOneAndUpdate(
        { id: postId },
        { $push: { comments: commentData } },
        { new: true }
      );
    }
    const post = await nFindOne(nedb.posts, { id: postId });
    if (!post) return null;
    const updated = [...(post.comments || []), commentData];
    await nUpdate(nedb.posts, { id: postId }, { $set: { comments: updated } });
    return nFindOne(nedb.posts, { id: postId });
  },

  async toggleLike(postId) {
    if (useMongo()) {
      return mongoose.model('CommunityPost').findOneAndUpdate(
        { id: postId },
        { $inc: { likes: 1 } },
        { new: true }
      );
    }
    const post = await nFindOne(nedb.posts, { id: postId });
    if (!post) return null;
    await nUpdate(nedb.posts, { id: postId }, { $set: { likes: (post.likes || 0) + 1 } });
    return nFindOne(nedb.posts, { id: postId });
  },

  // ── Offset Transactions ───────────────────────────────────────────────────────
  async getOffsetTransactions(userId) {
    if (useMongo()) {
      return mongoose.model('OffsetTransaction').find({ userId }).sort({ timestamp: -1 });
    }
    const all = await nFind(nedb.transactions, { userId });
    return all.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async saveOffsetTransaction(data) {
    data.id        = data.id        || `tx_${Date.now()}`;
    data.timestamp = data.timestamp || new Date().toISOString();
    if (useMongo()) {
      const doc = new (mongoose.model('OffsetTransaction'))(data);
      return doc.save();
    }
    const { _id, ...clean } = data;
    return nInsert(nedb.transactions, clean);
  },
};

module.exports = dbAdapter;
