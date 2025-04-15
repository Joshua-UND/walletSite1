const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 9001;

// MongoDB connection
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('[MongoDB] Connected successfully'))
.catch(err => console.error('[MongoDB] Connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  accessId: String,
  password: String,
  totalBalance: Number,
  name: String
});
const User = mongoose.model('User', userSchema);

// Transfer Schema
const transferSchema = new mongoose.Schema({
  userAccessId: String,
  transactionId: String,
  fromAccount: String,
  toAccount: String,
  status: String,
  bankName: String,
  amount: String,
  description: String,
  frequency: String,
  createdAt: { type: Date, default: Date.now }
});
const Transfer = mongoose.model('Transfer', transferSchema);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Session storage
const sessions = {};
const SESSION_TIMEOUT = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const sessionId in sessions) {
    if (now - sessions[sessionId].createdAt > SESSION_TIMEOUT) {
      console.log(`[Session Expired] Removing ${sessionId}`);
      delete sessions[sessionId];
    }
  }
}, 60000);

// Routes

// Login
app.post('/login', async (req, res) => {
  const { accessId, password } = req.body;
  console.log('[Login Attempt]', accessId);

  if (!accessId || !password) {
    return res.status(400).json({ success: false, message: 'Access ID and Passcode are required.' });
  }

  try {
    const user = await User.findOne({ accessId });
    console.log('[User Found]', user);

    if (user && user.password === password) {
      const sessionId = uuidv4();
      sessions[sessionId] = { accessId, createdAt: Date.now() };

      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        sameSite: 'None',
        secure: true,
        maxAge: SESSION_TIMEOUT
      });

      return res.json({ success: true, message: 'Login successful' });
    } else {
      return res.status(401).json({ success: false, message: 'Incorrect Access ID or Passcode.' });
    }
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Check Session
app.get('/check-session', (req, res) => {
  const sessionId = req.cookies.sessionId;
  console.log('[Check Session] Cookies:', req.cookies);

  if (sessionId && sessions[sessionId]) {
    const sessionAge = Date.now() - sessions[sessionId].createdAt;
    if (sessionAge <= SESSION_TIMEOUT) {
      return res.json({ loggedIn: true });
    } else {
      delete sessions[sessionId];
    }
  }

  return res.status(401).json({ loggedIn: false });
});

// Logout
app.post('/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
  res.clearCookie('sessionId');
  return res.json({ success: true });
});

// Save Transfer
app.post('/save-transfer', async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ success: false, error: 'Not logged in' });
  }

  const { accessId } = sessions[sessionId];

  try {
    const generateId = () => `TRX-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    const newTransfer = new Transfer({
      ...req.body,
      transactionId: generateId(),
      userAccessId: accessId,
      status: "Processing"
    });

    await newTransfer.save();
    res.json({ success: true });
  } catch (error) {
    console.error('[Save Transfer Error]', error);
    res.status(500).json({ success: false, error: 'Failed to save transfer' });
  }
});

// Get Transfers
app.get('/get-transfers', async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { accessId } = sessions[sessionId];

  try {
    const transfers = await Transfer.find({ userAccessId: accessId }).sort({ createdAt: -1 });
    res.json(transfers);
  } catch (error) {
    console.error('[Get Transfers Error]', error);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Dashboard Info
app.get('/dashboard', async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { accessId } = sessions[sessionId];
  const user = await User.findOne({ accessId });

  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    accessId: user.accessId,
    totalBalance: user.totalBalance,
    name: user.name
  });
});

// Quick Balance Route
app.get('/balance', async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { accessId } = sessions[sessionId];
  const user = await User.findOne({ accessId });

  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ totalBalance: user.totalBalance });
});

// Start Server
app.listen(PORT, () => {
  console.log(`[Server Started] Listening on port ${PORT}`);
});
