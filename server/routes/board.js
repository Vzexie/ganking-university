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

// For the "assign a candidate" dropdown — only exposed to people who can manage the board.
router.get('/assignable-users', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.username, u.guild,
       COALESCE((SELECT bs.id FROM board_slots bs WHERE bs.user_id = u.id LIMIT 1), NULL) AS existing_slot_id
     FROM users u ORDER BY u.username`
  );
  res.json({ users: result.rows });
});

router.post('/:id/reveal', async (req, res) => {
  const result = await db.query('UPDATE board_slots SET revealed = true WHERE id = $1 AND name IS NOT NULL RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(400).json({ error: 'Nothing to reveal in that slot.' });
  res.json({ ok: true });
});

// Assigning a slot to a real account is the actual "admission" moment — it's what
// unlocks that student's chat/gank-log/bank/yearbook/schedule/gradebook access.
// A slot can still be given a manual, unlinked name (e.g. a placeholder or joke
// entry) — that grants no portal access, since there's no account to link to.
router.post('/:id/edit', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  const { user_id, name, guild, note } = req.body || {};

  if (user_id) {
    const userResult = await db.query('SELECT id, username, guild FROM users WHERE id = $1', [user_id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'That account was not found.' });
    const already = await db.query('SELECT id FROM board_slots WHERE user_id = $1 AND id != $2', [user_id, req.params.id]);
    if (already.rows.length) return res.status(409).json({ error: 'That account is already assigned to another slot.' });
    const u = userResult.rows[0];
    await db.query(
      'UPDATE board_slots SET name = $1, guild = $2, note = $3, user_id = $4, revealed = false WHERE id = $5',
      [u.username, guild || u.guild, note || null, u.id, req.params.id]
    );
  } else {
    if (!name) return res.status(400).json({ error: 'Provide either an account to admit, or a manual name.' });
    await db.query(
      'UPDATE board_slots SET name = $1, guild = $2, note = $3, user_id = NULL, revealed = false WHERE id = $4',
      [name, guild || null, note || null, req.params.id]
    );
  }
  res.json({ ok: true });
});

router.post('/:id/clear', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  await db.query('UPDATE board_slots SET name = NULL, guild = NULL, note = NULL, user_id = NULL, revealed = false WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/add-slot', requireAuth, requirePermission('can_manage_board'), async (req, res) => {
  const maxPos = await db.query('SELECT COALESCE(MAX(position), -1) AS max FROM board_slots');
  const nextPos = Number(maxPos.rows[0].max) + 1;
  const inserted = await db.query('INSERT INTO board_slots (position) VALUES ($1) RETURNING *', [nextPos]);
  res.json({ slot: inserted.rows[0] });
});

module.exports = router;
