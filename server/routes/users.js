const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requirePermission('can_manage_users'), async (req, res) => {
  const usersResult = await db.query('SELECT id, username, guild, account_status, unit_cap, detention_active FROM users ORDER BY username');
  const rolesResult = await db.query('SELECT ur.user_id, r.id AS role_id, r.name, r.tier FROM user_roles ur JOIN roles r ON r.id = ur.role_id');
  const byUser = {};
  rolesResult.rows.forEach(r => { (byUser[r.user_id] = byUser[r.user_id] || []).push({ id: r.role_id, name: r.name, tier: r.tier }); });
  const users = usersResult.rows.map(u => ({ ...u, roles: byUser[u.id] || [] }));
  res.json({ users });
});

router.post('/:id/roles', requireAuth, requirePermission('can_assign_roles'), async (req, res) => {
  const { role_id, action } = req.body || {};
  if (!role_id || !['add', 'remove'].includes(action)) return res.status(400).json({ error: 'role_id and action (add/remove) are required.' });
  if (action === 'add') {
    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, role_id]);
  } else {
    await db.query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [req.params.id, role_id]);
  }
  res.json({ ok: true });
});

// Create a staff/admin account directly (internal staff skip the public admission-request flow).
router.post('/', requireAuth, requirePermission('can_manage_users'), async (req, res) => {
  const { username, password, guild, role_id } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required.' });
  const existing = await db.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length) return res.status(409).json({ error: 'That username is already taken.' });
  const hash = await bcrypt.hash(password, 10);
  const inserted = await db.query(
    `INSERT INTO users (username, password_hash, guild, account_status) VALUES ($1,$2,$3,'active') RETURNING id`,
    [username, hash, guild || null]
  );
  if (role_id) await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [inserted.rows[0].id, role_id]);
  res.json({ ok: true, id: inserted.rows[0].id });
});

// Self profile update (any logged-in user).
router.patch('/me', requireAuth, async (req, res) => {
  const { guild, description, pic } = req.body || {};
  await db.query(
    `UPDATE users SET guild = COALESCE($1, guild), description = COALESCE($2, description), pic = COALESCE($3, pic) WHERE id = $4`,
    [guild, description, pic, req.currentUser.id]
  );
  res.json({ ok: true });
});

module.exports = router;
