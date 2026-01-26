const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup - stored in .data folder (persistent on Glitch)
const db = new Database('.data/qa.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    answer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    answered_at DATETIME
  )
`);

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
app.get('/api/questions', authenticate, (req, res) => {
  const questions = db.prepare(`
    SELECT * FROM questions ORDER BY created_at DESC
  `).all();
  res.json(questions);
});

// Submit a question
app.post('/api/questions', authenticate, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Question text required' });
  }
  
  const result = db.prepare(`
    INSERT INTO questions (text) VALUES (?)
  `).run(text.trim());
  
  const question = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(result.lastInsertRowid);
  res.json(question);
});

// Answer a question (admin only)
app.put('/api/questions/:id/answer', authenticate, adminOnly, (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;
  
  if (!answer || !answer.trim()) {
    return res.status(400).json({ error: 'Answer text required' });
  }
  
  db.prepare(`
    UPDATE questions SET answer = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(answer.trim(), id);
  
  const question = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id);
  res.json(question);
});

// Delete a question (admin only)
app.delete('/api/questions/:id', authenticate, adminOnly, (req, res) => {
  const { id } = req.params;
  db.prepare(`DELETE FROM questions WHERE id = ?`).run(id);
  res.json({ success: true });
});

// Clear answer (admin only)
app.delete('/api/questions/:id/answer', authenticate, adminOnly, (req, res) => {
  const { id } = req.params;
  db.prepare(`UPDATE questions SET answer = NULL, answered_at = NULL WHERE id = ?`).run(id);
  const question = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id);
  res.json(question);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
