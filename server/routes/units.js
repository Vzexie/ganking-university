const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/request', requireAuth, async (req, res) => {
  const amount = Number(req.body?.requested_units);
  if (!(amount > 0)) return res.status(400).json({ error: 'requested_units must be a positive number.' });
  const inserted = await db.query(
    `INSERT INTO unit_requests (user_id, requested_units) VALUES ($1,$2) RETURNING *`,
    [req.currentUser.id, amount]
  );
  res.json({ request: inserted.rows[0] });
});

router.get('/mine', requireAuth, async (req, res) => {
  const result = await db.query('SELECT * FROM unit_requests WHERE user_id = $1 ORDER BY created_at DESC', [req.currentUser.id]);
  res.json({ requests: result.rows });
});

module.exports = router;
