const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Public: everyone can see the sealed board and reveal slots. Only revealed info is
// ever sent for non-managers; managers see everything so they can edit.
router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM board_slots ORDER BY position');
  const canManage = req.currentUser && req.currentUser.permissions.can_manage_board;
  const slots = result.rows.map(s => {
    if (canManage || s.revealed) return s;
    return { id: s.id, position: s.position, revealed: false, name: s.name ? '(sealed)' : null };
  });
  res.json({ slots, canManage: !!canManage });
});

router.post('/:id/reveal', async (req, res) => {
  const result = await db.query('UPDATE board_slots SET revealed = true WHERE id = $1 AND name IS NOT NULL RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(400).json({ error: 'Nothing to reveal in that slot.' });
  res.json({ ok: true });
});

router.post('/:id/edit', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  const { name, guild, note } = req.body || {};
  await db.query('UPDATE board_slots SET name = $1, guild = $2, note = $3, revealed = false WHERE id = $4', [name, guild || null, note || null, req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/clear', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  await db.query('UPDATE board_slots SET name = NULL, guild = NULL, note = NULL, revealed = false WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/add-slot', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  const maxPos = await db.query('SELECT COALESCE(MAX(position), -1) AS max FROM board_slots');
  const nextPos = Number(maxPos.rows[0].max) + 1;
  const inserted = await db.query('INSERT INTO board_slots (position) VALUES ($1) RETURNING *', [nextPos]);
  res.json({ slot: inserted.rows[0] });
});

module.exports = router;
