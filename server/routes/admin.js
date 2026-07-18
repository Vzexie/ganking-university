const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

/* ---------------- Admission request queue ---------------- */
router.get('/admission-requests', requireAuth, requirePermission('can_approve_admissions'), async (req, res) => {
  const result = await db.query(`SELECT * FROM admission_requests ORDER BY created_at DESC`);
  res.json({ requests: result.rows });
});

router.post('/admission-requests/:id/approve', requireAuth, requirePermission('can_approve_admissions'), async (req, res) => {
  const reqRow = await db.query('SELECT * FROM admission_requests WHERE id = $1', [req.params.id]);
  if (!reqRow.rows.length) return res.status(404).json({ error: 'Request not found.' });
  const request = reqRow.rows[0];
  if (request.status !== 'pending') return res.status(400).json({ error: 'That request has already been decided.' });

  const existingUser = await db.query('SELECT id FROM users WHERE username = $1', [request.desired_username]);
  if (existingUser.rows.length) return res.status(409).json({ error: 'That username was registered in the meantime — deny this request.' });

  const newUser = await db.query(
    `INSERT INTO users (username, password_hash, roblox_link, account_status) VALUES ($1,$2,$3,'active') RETURNING id`,
    [request.desired_username, request.password_hash, request.roblox_link]
  );
  const studentRole = await db.query(`SELECT id FROM roles WHERE name = 'Student'`);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [newUser.rows[0].id, studentRole.rows[0].id]);

  await db.query(
    `UPDATE admission_requests SET status = 'approved', decided_at = now(), decided_by = $1 WHERE id = $2`,
    [req.currentUser.id, request.id]
  );
  res.json({ ok: true, message: `${request.desired_username} can now log in and start their application.` });
});

router.post('/admission-requests/:id/deny', requireAuth, requirePermission('can_approve_admissions'), async (req, res) => {
  const result = await db.query(
    `UPDATE admission_requests SET status = 'denied', decided_at = now(), decided_by = $1 WHERE id = $2 AND status = 'pending' RETURNING id`,
    [req.currentUser.id, req.params.id]
  );
  if (!result.rows.length) return res.status(400).json({ error: 'That request could not be denied (already decided, or not found).' });
  res.json({ ok: true });
});

/* ---------------- Unit request queue (admin only, financial-adjacent) ---------------- */
router.get('/unit-requests', requireAuth, requirePermission('can_manage_units'), async (req, res) => {
  const result = await db.query(
    `SELECT ur.*, u.username FROM unit_requests ur JOIN users u ON u.id = ur.user_id ORDER BY ur.created_at DESC`
  );
  res.json({ requests: result.rows });
});

router.post('/unit-requests/:id/approve', requireAuth, requirePermission('can_manage_units'), async (req, res) => {
  const reqRow = await db.query('SELECT * FROM unit_requests WHERE id = $1', [req.params.id]);
  if (!reqRow.rows.length) return res.status(404).json({ error: 'Request not found.' });
  const request = reqRow.rows[0];
  if (request.status !== 'pending') return res.status(400).json({ error: 'Already decided.' });

  const grantAmount = Number(req.body?.granted_units) || request.requested_units;
  await db.query('UPDATE users SET unit_cap = unit_cap + $1 WHERE id = $2', [grantAmount, request.user_id]);
  await db.query(
    `UPDATE unit_requests SET status = 'approved', decided_at = now(), decided_by = $1 WHERE id = $2`,
    [req.currentUser.id, request.id]
  );
  res.json({ ok: true });
});

router.post('/unit-requests/:id/deny', requireAuth, requirePermission('can_manage_units'), async (req, res) => {
  const result = await db.query(
    `UPDATE unit_requests SET status = 'denied', decided_at = now(), decided_by = $1 WHERE id = $2 AND status = 'pending' RETURNING id`,
    [req.currentUser.id, req.params.id]
  );
  if (!result.rows.length) return res.status(400).json({ error: 'Could not deny (already decided, or not found).' });
  res.json({ ok: true });
});

/* ---------------- Settings (application fee etc.) ---------------- */
router.get('/settings', requireAuth, requirePermission('can_manage_settings'), async (req, res) => {
  const result = await db.query('SELECT key, value FROM settings');
  res.json({ settings: result.rows });
});

router.post('/settings', requireAuth, requirePermission('can_manage_settings'), async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key is required.' });
  await db.query(
    `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
  res.json({ ok: true });
});

// Public: read the current application fee so the request-admission page can show it.
router.get('/public-fee', async (req, res) => {
  const result = await db.query(`SELECT value FROM settings WHERE key = 'application_fee_moonseyes'`);
  res.json({ fee: result.rows[0]?.value || '1' });
});

module.exports = router;
