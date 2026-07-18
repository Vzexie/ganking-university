const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Create a Neon (or other) Postgres instance and set this env var.');
}

// Neon (and most hosted Postgres providers reachable over the public internet)
// require SSL. We auto-detect Neon by hostname so this works with zero config,
// but PGSSL still lets you force it on/off explicitly if you're using something else.
const url = process.env.DATABASE_URL || '';
const looksLikeNeon = /neon\.tech/i.test(url);
const pgsslEnv = process.env.PGSSL;
const useSSL = pgsslEnv === 'false' ? false : (pgsslEnv === 'true' || looksLikeNeon);

const pool = new Pool({
  connectionString: url,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
