const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEFAULT_ROLES = [
  // name, tier, system, permissions
  ['Student', 'student', true, {}],
  ['Staff', 'staff', true, {}],
  ['Professor', 'staff', true, { can_manage_classes: true, can_grade: true, can_write_blog: true, can_review_blog: true }],
  ['Assistant Professor', 'staff', true, { can_grade: true }],
  ['Janitor', 'staff', true, {}],
  ['Campus Security', 'staff', true, { can_issue_detention: true, can_delete_chat: true }],
  ['Milk Man', 'staff', true, {}],
  ['Lunch Lady', 'staff', true, {}],
  ['Admission Counselor', 'admission_counselor', true, { can_approve_admissions: true, can_manage_board: true }],
  ['Dean', 'admin', true, { can_manage_classes: true, can_grade: true, can_write_blog: true, can_review_blog: true, can_approve_admissions: true, can_assign_roles: true, can_manage_board: true, can_manage_users: true, can_delete_chat: true }],
  ['Admin', 'admin', true, { can_assign_roles: true, can_approve_admissions: true, can_manage_classes: true, can_grade: true, can_write_blog: true, can_review_blog: true, can_issue_detention: true, can_manage_board: true, can_manage_users: true, can_manage_units: true, can_manage_settings: true, can_create_roles: true, can_delete_chat: true } ]
];

const YEARBOOK_CATEGORIES = [
  ['Best Ganker', null],
  ['Valedictorian', null],
  ['Most Diplomatic', null],
  ['Best Duo', null],
  ['Rookie of the Year', null],
  ['Hall of Legends', null],
  ['Most Blatant Spoofer', 'Broshi'] // permanently, unanimously, Broshi.
];

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);

  // Roles
  for (const [name, tier, system, permissions] of DEFAULT_ROLES) {
    await db.query(
      `INSERT INTO roles (name, tier, system, permissions) VALUES ($1,$2,$3,$4)
       ON CONFLICT (name) DO UPDATE SET tier = EXCLUDED.tier, permissions = EXCLUDED.permissions`,
      [name, tier, system, JSON.stringify(permissions)]
    );
  }

  // Bootstrap admin account
  const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
  const existing = await db.query('SELECT id FROM users WHERE username = $1', [adminUsername]);
  let adminId;
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    const inserted = await db.query(
      `INSERT INTO users (username, password_hash, guild, account_status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [adminUsername, hash, 'Ganking University Staff']
    );
    adminId = inserted.rows[0].id;
  } else {
    adminId = existing.rows[0].id;
  }
  const adminRole = await db.query('SELECT id FROM roles WHERE name = $1', ['Admin']);
  await db.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [adminId, adminRole.rows[0].id]
  );

  // Settings
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('application_fee_moonseyes', '1') ON CONFLICT (key) DO NOTHING`
  );

  // Admissions board — start with 30 slots if none exist yet
  const slotCount = await db.query('SELECT COUNT(*) FROM board_slots');
  if (Number(slotCount.rows[0].count) === 0) {
    for (let i = 0; i < 30; i++) {
      await db.query('INSERT INTO board_slots (position) VALUES ($1)', [i]);
    }
  }

  // Yearbook categories
  for (const [name, fixedWinner] of YEARBOOK_CATEGORIES) {
    await db.query(
      `INSERT INTO yearbook_categories (name, fixed_winner) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET fixed_winner = EXCLUDED.fixed_winner`,
      [name, fixedWinner]
    );
  }

  console.log('Database schema ensured and seed data applied.');
}

module.exports = { run };
