const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_PERMISSIONS = [
  'can_assign_roles', 'can_approve_admissions', 'can_manage_classes', 'can_grade',
  'can_write_blog', 'can_review_blog', 'can_issue_detention', 'can_manage_board',
  'can_manage_users', 'can_manage_units', 'can_manage_settings', 'can_create_roles'
];
const ALLOWED_TIERS = ['student', 'staff', 'admission_counselor', 'admin'];

router.get('/', requireAuth, async (req, res) => {
  const result = await db.query('SELECT id, name, tier, system, permissions FROM roles ORDER BY tier, name');
  res.json({ roles: result.rows, allowedPermissions: ALLOWED_PERMISSIONS, allowedTiers: ALLOWED_TIERS });
});

router.post('/', requireAuth, requirePermission('can_create_roles'), async (req, res) => {
  const { name, tier, permissions } = req.body || {};
  if (!name || !ALLOWED_TIERS.includes(tier)) return res.status(400).json({ error: 'A name and a valid tier are required.' });
  const cleanPerms = {};
  Object.keys(permissions || {}).forEach(k => { if (ALLOWED_PERMISSIONS.includes(k) && permissions[k]) cleanPerms[k] = true; });
  try {
    const inserted = await db.query(
      `INSERT INTO roles (name, tier, system, permissions) VALUES ($1,$2,false,$3) RETURNING id, name, tier, system, permissions`,
      [name, tier, JSON.stringify(cleanPerms)]
    );
    res.json({ role: inserted.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A role with that name already exists.' });
    throw err;
  }
});

router.patch('/:id', requireAuth, requirePermission('can_create_roles'), async (req, res) => {
  const roleRow = await db.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
  if (!roleRow.rows.length) return res.status(404).json({ error: 'Role not found.' });
  if (roleRow.rows[0].system) return res.status(400).json({ error: 'Built-in roles cannot be edited, only custom roles you create.' });

  const { tier, permissions } = req.body || {};
  const cleanPerms = {};
  Object.keys(permissions || {}).forEach(k => { if (ALLOWED_PERMISSIONS.includes(k) && permissions[k]) cleanPerms[k] = true; });
  const nextTier = ALLOWED_TIERS.includes(tier) ? tier : roleRow.rows[0].tier;

  const updated = await db.query(
    `UPDATE roles SET tier = $1, permissions = $2 WHERE id = $3 RETURNING id, name, tier, system, permissions`,
    [nextTier, JSON.stringify(cleanPerms), req.params.id]
  );
  res.json({ role: updated.rows[0] });
});

module.exports = router;
