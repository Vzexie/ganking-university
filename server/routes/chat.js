const express = require('express');
const db = require('../db');
const { requireAuth, blockIfDetained } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT cm.id, cm.body, cm.created_at, u.username FROM chat_messages cm JOIN users u ON u.id = cm.user_id
     ORDER BY cm.created_at DESC LIMIT 200`
  );
  res.json({ messages: result.rows.reverse() });
});

router.post('/', requireAuth, blockIfDetained, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  await db.query('INSERT INTO chat_messages (user_id, body) VALUES ($1,$2)', [req.currentUser.id, body.trim().slice(0, 1000)]);
  res.json({ ok: true });
});

module.exports = router;
