const express = require('express');
const db = require('../db');
const { requireAuth, requirePortalAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requirePortalAccess, async (req, res) => {
  const categories = await db.query('SELECT * FROM yearbook_categories ORDER BY id');
  const votes = await db.query('SELECT category_id, nominee, COUNT(*) AS count FROM yearbook_votes GROUP BY category_id, nominee');
  const myVotes = await db.query('SELECT category_id, nominee FROM yearbook_votes WHERE user_id = $1', [req.currentUser.id]);

  const tallyByCategory = {};
  votes.rows.forEach(v => { (tallyByCategory[v.category_id] = tallyByCategory[v.category_id] || []).push({ nominee: v.nominee, count: Number(v.count) }); });
  const myVoteByCategory = {};
  myVotes.rows.forEach(v => { myVoteByCategory[v.category_id] = v.nominee; });

  const result = categories.rows.map(c => ({
    ...c,
    tally: c.fixed_winner ? [{ nominee: c.fixed_winner, count: 9999 }] : (tallyByCategory[c.id] || []).sort((a, b) => b.count - a.count),
    myVote: c.fixed_winner || myVoteByCategory[c.id] || null
  }));

  res.json({ categories: result });
});

router.post('/:categoryId/vote', requireAuth, requirePortalAccess, async (req, res) => {
  const { nominee } = req.body || {};
  if (!nominee || !nominee.trim()) return res.status(400).json({ error: 'Nominee cannot be empty.' });

  const cat = await db.query('SELECT * FROM yearbook_categories WHERE id = $1', [req.params.categoryId]);
  if (!cat.rows.length) return res.status(404).json({ error: 'Category not found.' });
  if (cat.rows[0].fixed_winner) return res.status(400).json({ error: `${cat.rows[0].fixed_winner} has this locked up. No voting needed.` });

  await db.query(
    `INSERT INTO yearbook_votes (user_id, category_id, nominee) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, category_id) DO UPDATE SET nominee = EXCLUDED.nominee`,
    [req.currentUser.id, req.params.categoryId, nominee.trim()]
  );
  res.json({ ok: true });
});

module.exports = router;
