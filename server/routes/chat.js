const express = require('express');
const db = require('../db');
const { requireAuth, blockIfDetained, requirePermission, requirePortalAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requirePortalAccess, async (req, res) => {
  const result = await db.query(
    `SELECT cm.id, cm.body, cm.created_at, u.username FROM chat_messages cm JOIN users u ON u.id = cm.user_id
     ORDER BY cm.created_at DESC LIMIT 200`
  );
  res.json({ messages: result.rows.reverse() });
});

router.post('/', requireAuth, requirePortalAccess, blockIfDetained, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  await db.query('INSERT INTO chat_messages (user_id, body) VALUES ($1,$2)', [req.currentUser.id, body.trim().slice(0, 1000)]);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requirePermission('can_delete_chat'), async (req, res) => {
  const result = await db.query('DELETE FROM chat_messages WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Message not found.' });
  res.json({ ok: true });
});

module.exports = router;
