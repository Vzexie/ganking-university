const db = require('../db');

const TIER_RANK = { student: 1, staff: 2, admission_counselor: 3, admin: 4 };

// Loads the current session's user (if any) plus their roles and a merged
// permissions object, and attaches it to req.currentUser. Runs on every request.
async function loadUser(req, res, next) {
  try {
    if (!req.session || !req.session.userId) { req.currentUser = null; return next(); }

    const userResult = await db.query(
      `SELECT id, username, email, guild, pic, description, roblox_link, account_status, unit_cap, detention_active
       FROM users WHERE id = $1`,
      [req.session.userId]
    );
    if (userResult.rows.length === 0) { req.currentUser = null; return next(); }
    const user = userResult.rows[0];

    const rolesResult = await db.query(
      `SELECT r.id, r.name, r.tier, r.permissions
       FROM roles r JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [user.id]
    );
    const roles = rolesResult.rows;

    let tier = 'student';
    let tierRank = 0;
    const permissions = {};
    for (const r of roles) {
      const rank = TIER_RANK[r.tier] || 0;
      if (rank > tierRank) { tierRank = rank; tier = r.tier; }
      Object.entries(r.permissions || {}).forEach(([k, v]) => { if (v) permissions[k] = true; });
    }
    // Admin tier always implicitly has every permission — avoids "Admin but forgot a checkbox" lockouts.
    if (tier === 'admin') {
      ['can_assign_roles', 'can_approve_admissions', 'can_manage_classes', 'can_grade', 'can_write_blog',
        'can_review_blog', 'can_issue_detention', 'can_manage_board', 'can_manage_users', 'can_manage_units',
        'can_manage_settings', 'can_create_roles'].forEach(p => { permissions[p] = true; });
    }

    // units currently in use (enrolled classes * 3, computed on demand elsewhere), roles list for display
    const enrolledUnitsResult = await db.query(
      `SELECT COALESCE(SUM(c.units), 0) AS used FROM class_roster cr JOIN classes c ON c.id = cr.class_id WHERE cr.user_id = $1`,
      [user.id]
    );

    req.currentUser = {
      ...user,
      roles: roles.map(r => r.name),
      tier,
      permissions,
      unitsUsed: Number(enrolledUnitsResult.rows[0].used)
    };
    next();
  } catch (err) {
    console.error('loadUser error', err);
    req.currentUser = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: 'You must be logged in.' });
  if (req.currentUser.account_status !== 'active') return res.status(403).json({ error: 'Your account is not active yet.' });
  next();
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.currentUser) return res.status(401).json({ error: 'You must be logged in.' });
    if (!req.currentUser.permissions[perm]) return res.status(403).json({ error: 'You do not have permission to do that.' });
    next();
  };
}

function requireTier(minTier) {
  const minRank = TIER_RANK[minTier] || 0;
  return (req, res, next) => {
    if (!req.currentUser) return res.status(401).json({ error: 'You must be logged in.' });
    const rank = TIER_RANK[req.currentUser.tier] || 0;
    if (rank < minRank) return res.status(403).json({ error: 'Your role does not have access to this.' });
    next();
  };
}

function blockIfDetained(req, res, next) {
  if (req.currentUser && req.currentUser.detention_active) {
    return res.status(403).json({ error: 'You are in detention and cannot post to chat, the Gank Log, or the Bank right now.' });
  }
  next();
}

module.exports = { loadUser, requireAuth, requirePermission, requireTier, blockIfDetained, TIER_RANK };
