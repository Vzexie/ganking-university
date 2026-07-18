const express = require('express');
const db = require('../db');
const { requireAuth, blockIfDetained } = require('../middleware/auth');

const router = express.Router();

function validKind(req, res, next) {
  if (!['gank', 'bank'].includes(req.params.kind)) return res.status(400).json({ error: 'Invalid feed.' });
  next();
}

router.get('/:kind', requireAuth, validKind, async (req, res) => {
  const result = await db.query(
    `SELECT fp.*, u.username FROM feed_posts fp JOIN users u ON u.id = fp.user_id
     WHERE fp.kind = $1 ORDER BY fp.created_at DESC LIMIT 200`,
    [req.params.kind]
  );
  res.json({ posts: result.rows });
});

router.post('/:kind', requireAuth, validKind, blockIfDetained, async (req, res) => {
  const { title, note, img } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (img && img.length > 2_000_000) return res.status(400).json({ error: 'Image is too large.' });
  await db.query(
    'INSERT INTO feed_posts (kind, user_id, title, note, img) VALUES ($1,$2,$3,$4,$5)',
    [req.params.kind, req.currentUser.id, title.trim(), note || '', img || null]
  );
  res.json({ ok: true });
});

module.exports = router;
