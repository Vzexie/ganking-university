const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Public: anyone (students, staff, or outside visitors) can read published posts.
router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT bp.id, bp.title, bp.body, bp.published_at, u.username AS author
     FROM blog_posts bp JOIN users u ON u.id = bp.author_id
     WHERE bp.status = 'published' ORDER BY bp.published_at DESC`
  );
  res.json({ posts: result.rows });
});

router.get('/pending', requireAuth, requirePermission('can_review_blog'), async (req, res) => {
  const result = await db.query(
    `SELECT bp.*, u.username AS author FROM blog_posts bp JOIN users u ON u.id = bp.author_id
     WHERE bp.status = 'pending' ORDER BY bp.created_at`
  );
  res.json({ posts: result.rows });
});

router.get('/mine', requireAuth, requirePermission('can_write_blog'), async (req, res) => {
  const result = await db.query('SELECT * FROM blog_posts WHERE author_id = $1 ORDER BY created_at DESC', [req.currentUser.id]);
  res.json({ posts: result.rows });
});

router.post('/', requireAuth, requirePermission('can_write_blog'), async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });
  const inserted = await db.query(
    `INSERT INTO blog_posts (author_id, title, body, status) VALUES ($1,$2,$3,'pending') RETURNING *`,
    [req.currentUser.id, title, body]
  );
  res.json({ post: inserted.rows[0] });
});

router.post('/:id/publish', requireAuth, requirePermission('can_review_blog'), async (req, res) => {
  await db.query(
    `UPDATE blog_posts SET status = 'published', reviewed_by = $1, published_at = now() WHERE id = $2 AND status = 'pending'`,
    [req.currentUser.id, req.params.id]
  );
  res.json({ ok: true });
});

router.post('/:id/reject', requireAuth, requirePermission('can_review_blog'), async (req, res) => {
  await db.query(
    `UPDATE blog_posts SET status = 'rejected', reviewed_by = $1 WHERE id = $2 AND status = 'pending'`,
    [req.currentUser.id, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
