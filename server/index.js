const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const { pool } = require('./db');
const seed = require('./seed');
const { loadUser } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const rolesRoutes = require('./routes/roles');
const usersRoutes = require('./routes/users');
const applicationsRoutes = require('./routes/applications');
const boardRoutes = require('./routes/board');
const classesRoutes = require('./routes/classes');
const chatRoutes = require('./routes/chat');
const feedRoutes = require('./routes/feed');
const yearbookRoutes = require('./routes/yearbook');
const blogRoutes = require('./routes/blog');
const detentionRoutes = require('./routes/detention');
const unitsRoutes = require('./routes/units');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1); // needed so secure cookies work behind Render's proxy

app.use(express.json({ limit: '3mb' })); // generous-ish limit for base64 profile pics / screenshots

app.use(session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
}));

app.use(loadUser);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/yearbook', yearbookRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/detention', detentionRoutes);
app.use('/api/units', unitsRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback — anything not matched above (and not /api/*) gets the frontend shell.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Basic error handler so a thrown error becomes JSON, not a stack trace to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;

seed.run()
  .then(() => {
    app.listen(PORT, () => console.log(`Ganking University server listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to run startup seed:', err);
    process.exit(1);
  });
