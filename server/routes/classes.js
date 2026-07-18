const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

async function classWithRoster(cls) {
  const roster = await db.query(
    `SELECT u.id, u.username, cr.grade FROM class_roster cr JOIN users u ON u.id = cr.user_id WHERE cr.class_id = $1 ORDER BY u.username`,
    [cls.id]
  );
  return { ...cls, roster: roster.rows };
}

router.get('/', requireAuth, async (req, res) => {
  const result = await db.query('SELECT * FROM classes ORDER BY created_at DESC');
  const withRoster = await Promise.all(result.rows.map(classWithRoster));
  res.json({ classes: withRoster });
});

router.post('/', requireAuth, requirePermission('can_manage_classes'), async (req, res) => {
  const { name, teacher, time, link, description, units } = req.body || {};
  if (!name) return res.status(400).json({ error: 'A class name is required.' });
  const inserted = await db.query(
    `INSERT INTO classes (name, teacher, time, link, description, units) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, teacher || null, time || null, link || null, description || null, Number(units) || 3]
  );
  res.json({ class: await classWithRoster(inserted.rows[0]) });
});

router.delete('/:id', requireAuth, requirePermission('can_manage_classes'), async (req, res) => {
  await db.query('DELETE FROM classes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/enroll', requireAuth, async (req, res) => {
  const classResult = await db.query('SELECT * FROM classes WHERE id = $1', [req.params.id]);
  if (!classResult.rows.length) return res.status(404).json({ error: 'Class not found.' });
  const cls = classResult.rows[0];

  const already = await db.query('SELECT 1 FROM class_roster WHERE class_id = $1 AND user_id = $2', [req.params.id, req.currentUser.id]);
  if (already.rows.length) return res.status(400).json({ error: 'Already enrolled.' });

  const usedResult = await db.query(
    `SELECT COALESCE(SUM(c.units),0) AS used FROM class_roster cr JOIN classes c ON c.id = cr.class_id WHERE cr.user_id = $1`,
    [req.currentUser.id]
  );
  const used = Number(usedResult.rows[0].used);
  if (used + cls.units > req.currentUser.unit_cap) {
    return res.status(400).json({ error: `Not enough units. You have ${req.currentUser.unit_cap - used} of ${req.currentUser.unit_cap} left, this class costs ${cls.units}.` });
  }

  await db.query('INSERT INTO class_roster (class_id, user_id) VALUES ($1,$2)', [req.params.id, req.currentUser.id]);
  res.json({ ok: true });
});

router.post('/:id/drop', requireAuth, async (req, res) => {
  await db.query('DELETE FROM class_roster WHERE class_id = $1 AND user_id = $2', [req.params.id, req.currentUser.id]);
  res.json({ ok: true });
});

// Staff enrolling a specific student (e.g. from the class roster admin view).
router.post('/:id/enroll-user', requireAuth, requirePermission('can_manage_classes'), async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  await db.query('INSERT INTO class_roster (class_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, user_id]);
  res.json({ ok: true });
});

router.post('/:id/grade', requireAuth, requirePermission('can_grade'), async (req, res) => {
  const { user_id, grade } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  await db.query('UPDATE class_roster SET grade = $1 WHERE class_id = $2 AND user_id = $3', [grade, req.params.id, user_id]);
  res.json({ ok: true });
});

// The logged-in user's own units + classes summary.
router.get('/mine/summary', requireAuth, async (req, res) => {
  const rosterResult = await db.query(
    `SELECT c.* FROM class_roster cr JOIN classes c ON c.id = cr.class_id WHERE cr.user_id = $1`,
    [req.currentUser.id]
  );
  const used = rosterResult.rows.reduce((sum, c) => sum + c.units, 0);
  res.json({ enrolled: rosterResult.rows, unitsUsed: used, unitCap: req.currentUser.unit_cap });
});

module.exports = router;
