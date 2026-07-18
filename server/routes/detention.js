const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requirePermission('can_issue_detention'), async (req, res) => {
  const students = await db.query(
    `SELECT u.id, u.username, u.detention_active FROM users u
     JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE r.tier = 'student' GROUP BY u.id ORDER BY u.username`
  );
  const active = await db.query(
    `SELECT d.*, u.username AS student_username, iu.username AS issued_by_username
     FROM detentions d JOIN users u ON u.id = d.student_id LEFT JOIN users iu ON iu.id = d.issued_by
     WHERE d.active = true ORDER BY d.created_at DESC`
  );
  res.json({ students: students.rows, active: active.rows });
});

router.post('/issue', requireAuth, requirePermission('can_issue_detention'), async (req, res) => {
  const { user_id, reason } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  await db.query('INSERT INTO detentions (student_id, issued_by, reason) VALUES ($1,$2,$3)', [user_id, req.currentUser.id, reason || null]);
  await db.query('UPDATE users SET detention_active = true WHERE id = $1', [user_id]);
  res.json({ ok: true });
});

router.post('/:id/lift', requireAuth, requirePermission('can_issue_detention'), async (req, res) => {
  const row = await db.query('UPDATE detentions SET active = false, lifted_at = now() WHERE id = $1 RETURNING student_id', [req.params.id]);
  if (!row.rows.length) return res.status(404).json({ error: 'Detention not found.' });
  const stillActive = await db.query('SELECT 1 FROM detentions WHERE student_id = $1 AND active = true', [row.rows[0].student_id]);
  if (!stillActive.rows.length) await db.query('UPDATE users SET detention_active = false WHERE id = $1', [row.rows[0].student_id]);
  res.json({ ok: true });
});

module.exports = router;
