const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function withRatingsAndComments(app) {
  const ratings = await db.query('SELECT rating FROM app_ratings WHERE application_id = $1', [app.id]);
  const comments = await db.query(
    `SELECT ac.id, ac.body, ac.created_at, u.username FROM app_comments ac JOIN users u ON u.id = ac.user_id
     WHERE ac.application_id = $1 ORDER BY ac.created_at DESC`,
    [app.id]
  );
  return { ...app, ratings: ratings.rows.map(r => r.rating), comments: comments.rows };
}

// Public: submitted applications only.
router.get('/', async (req, res) => {
  const result = await db.query(`SELECT * FROM applications WHERE status = 'submitted' ORDER BY submitted_at DESC`);
  const withExtras = await Promise.all(result.rows.map(withRatingsAndComments));
  res.json({ applications: withExtras });
});

router.get('/:id', async (req, res) => {
  const result = await db.query(`SELECT * FROM applications WHERE id = $1 AND status = 'submitted'`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Application not found.' });
  res.json({ application: await withRatingsAndComments(result.rows[0]) });
});

// The logged-in applicant's own application, draft or submitted — lets them resume.
router.get('/mine/current', requireAuth, async (req, res) => {
  const result = await db.query('SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [req.currentUser.id]);
  res.json({ application: result.rows[0] || null });
});

// Create-or-update the applicant's draft, optionally submitting it.
router.put('/mine/current', requireAuth, async (req, res) => {
  const { name, guild, roblox, role, weapon, special, elo, online, culture, bonus, submit } = req.body || {};
  const existing = await db.query(
    `SELECT id, status FROM applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [req.currentUser.id]
  );

  if (existing.rows.length && existing.rows[0].status === 'draft') {
    const id = existing.rows[0].id;
    await db.query(
      `UPDATE applications SET name=$1, guild=$2, roblox=$3, role=$4, weapon=$5, special=$6, elo=$7, online=$8, culture=$9, bonus=$10,
       status = CASE WHEN $11::boolean THEN 'submitted' ELSE status END,
       submitted_at = CASE WHEN $11::boolean THEN now() ELSE submitted_at END
       WHERE id = $12`,
      [name, guild, roblox, role, weapon, special, elo, online, culture, bonus, !!submit, id]
    );
    const result = await db.query('SELECT * FROM applications WHERE id = $1', [id]);
    return res.json({ application: result.rows[0] });
  }

  if (existing.rows.length && existing.rows[0].status === 'submitted') {
    return res.status(400).json({ error: 'You already have a submitted application.' });
  }

  const inserted = await db.query(
    `INSERT INTO applications (user_id, name, guild, roblox, role, weapon, special, elo, online, culture, bonus, status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $12::boolean THEN 'submitted' ELSE 'draft' END, CASE WHEN $12::boolean THEN now() ELSE NULL END)
     RETURNING *`,
    [req.currentUser.id, name, guild, roblox, role, weapon, special, elo, online, culture, bonus, !!submit]
  );
  res.json({ application: inserted.rows[0] });
});

router.post('/:id/ratings', requireAuth, async (req, res) => {
  const { rating } = req.body || {};
  const n = Number(rating);
  if (!(n >= 1 && n <= 5)) return res.status(400).json({ error: 'Rating must be 1-5.' });
  await db.query('INSERT INTO app_ratings (application_id, rating, rater_user_id) VALUES ($1,$2,$3)', [req.params.id, n, req.currentUser.id]);
  res.json({ ok: true });
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });
  await db.query('INSERT INTO app_comments (application_id, user_id, body) VALUES ($1,$2,$3)', [req.params.id, req.currentUser.id, body.trim()]);
  res.json({ ok: true });
});

module.exports = router;
