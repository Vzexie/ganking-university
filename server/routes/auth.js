const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// Public: submit a request to apply. This does NOT create a login-able account yet —
// it just reserves a username/password and waits for an admin to confirm the in-game
// moonseye payment before the account is activated.
router.post('/request-admission', async (req, res) => {
  const { desired_username, password, roblox_link, note } = req.body || {};
  if (!desired_username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const existingUser = await db.query('SELECT id FROM users WHERE username = $1', [desired_username]);
  if (existingUser.rows.length) return res.status(409).json({ error: 'That username is already taken.' });

  const existingRequest = await db.query(
    `SELECT id, status FROM admission_requests WHERE desired_username = $1 ORDER BY created_at DESC LIMIT 1`,
    [desired_username]
  );
  if (existingRequest.rows.length && existingRequest.rows[0].status === 'pending') {
    return res.status(409).json({ error: 'A request for that username is already pending review.' });
  }

  const hash = await bcrypt.hash(password, 10);
  const settingsResult = await db.query(`SELECT value FROM settings WHERE key = 'application_fee_moonseyes'`);
  const fee = settingsResult.rows[0]?.value || '1';

  const inserted = await db.query(
    `INSERT INTO admission_requests (desired_username, password_hash, roblox_link, note)
     VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
    [desired_username, hash, roblox_link || null, note || null]
  );

  res.json({
    request: inserted.rows[0],
    message: `Request submitted. Send ${fee} moonseye(s) in-game as instructed, and a staff member will confirm it before your account is activated.`
  });
});

// Public: check the status of a previously-submitted request, by username.
router.get('/request-status/:username', async (req, res) => {
  const result = await db.query(
    `SELECT status, created_at, decided_at FROM admission_requests WHERE desired_username = $1 ORDER BY created_at DESC LIMIT 1`,
    [req.params.username]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'No request found for that username.' });
  res.json({ request: result.rows[0] });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  const result = await db.query('SELECT id, password_hash, account_status FROM users WHERE username = $1', [username]);
  if (!result.rows.length) return res.status(401).json({ error: 'Incorrect username or password.' });

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });

  req.session.userId = user.id;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.currentUser || null });
});

module.exports = router;
