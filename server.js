const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database table
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      answer TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      answered_at TIMESTAMP
    )
  `);
  console.log('Database initialized');
}

initDB().catch(console.error);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Valid credentials
const CREDENTIALS = {
  'GUEST': 'QUESTION',
  'ADMIN': 'ANSWER711'
};

// Auth middleware
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: 'No credentials' });
  }
  
  const [username, password] = Buffer.from(auth.split(' ')[1], 'base64')
    .toString()
    .split(':');
  
  const upperUser = username.toUpperCase().trim();
  const upperPass = password.toUpperCase().trim();
  
  if (CREDENTIALS[upperUser] === upperPass) {
    req.user = upperUser === 'ADMIN' ? 'admin' : 'guest';
    next();
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

// Admin-only middleware
function adminOnly(req, res, next) {
  if (req.user !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// Routes

// Login check
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const upperUser = (username || '').toUpperCase().trim();
  const upperPass = (password || '').toUpperCase().trim();
  
  if (CREDENTIALS[upperUser] === upperPass) {
    res.json({ 
      success: true, 
      role: upperUser === 'ADMIN' ? 'admin' : 'guest' 
    });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Get all questions
app.get('/api/questions', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM questions ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Submit a question
app.post('/api/questions', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Question text required' });
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO questions (text) VALUES ($1) RETURNING *',
      [text.trim()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Answer a question (admin only)
app.put('/api/questions/:id/answer', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;
  
  if (!answer || !answer.trim()) {
    return res.status(400).json({ error: 'Answer text required' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE questions SET answer = $1, answered_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [answer.trim(), id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete a question (admin only)
app.delete('/api/questions/:id', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM questions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Clear answer (admin only)
app.delete('/api/questions/:id/answer', authenticate, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE questions SET answer = NULL, answered_at = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
