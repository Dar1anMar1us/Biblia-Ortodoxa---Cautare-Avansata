const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// ─── Config ─────────────────────────────────────────────────
const ANALYTICS_PATH = path.join(__dirname, 'analytics.db');
const GEO_CACHE_MAX = 500;       // don't re-lookup same IP too often
const GEO_BATCH_SIZE = 10;        // ips batched between responses
const SESSION_SECRET = process.env.ANALYTICS_SECRET || 'schimba-ma-in-prod';

// ─── DB init ────────────────────────────────────────────────
let _db;
function getDb() {
  if (!_db) {
    _db = new Database(ANALYTICS_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS pageviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT DEFAULT (datetime('now')),
        path TEXT,
        ip TEXT,
        country TEXT DEFAULT '',
        city TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        referrer TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_path ON pageviews(path);
      CREATE INDEX IF NOT EXISTS ts ON pageviews(ts);
      CREATE INDEX IF NOT EXISTS idx_country ON pageviews(country);

      CREATE TABLE IF NOT EXISTS geo_cache (
        ip TEXT PRIMARY KEY,
        country TEXT,
        city TEXT,
        ts TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return _db;
}

// ─── Geo lookup (ip-api.com — free tier) ────────────────────
const axios = require('axios');
const geoQueue = [];
let geoTimer = null;

function lookupGeo(ip) {
  // Skip private / loopback
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
    return Promise.resolve({ country: '', city: '' });
  }

  const db = getDb();
  const cached = db.prepare('SELECT country, city FROM geo_cache WHERE ip = ?').get(ip);
  if (cached) return Promise.resolve({ country: cached.country, city: cached.city });

  // Batch: queue IP and process after short delay
  return new Promise(resolve => {
    geoQueue.push({ ip, resolve });
    if (!geoTimer) {
      geoTimer = setTimeout(processGeoQueue, 200);
    }
  });
}

async function processGeoQueue() {
  geoTimer = null;
  const batch = geoQueue.splice(0, GEO_BATCH_SIZE);
  if (batch.length === 0) return;

  const ips = batch.map(b => b.ip);
  try {
    const resp = await axios.post('http://ip-api.com/batch', ips, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 4000
    });
    const results = resp.data || [];
    const db = getDb();
    const upsert = db.prepare('INSERT OR REPLACE INTO geo_cache (ip, country, city) VALUES (?, ?, ?)');

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r && r.status === 'success') {
        upsert.run(batch[i].ip, r.country || '', r.city || '');
        batch[i].resolve({ country: r.country || '', city: r.city || '' });
      } else {
        // Still cache failures to avoid hammering
        upsert.run(batch[i].ip, '', '');
        batch[i].resolve({ country: '', city: '' });
      }
    }
  } catch (e) {
    batch.forEach(b => b.resolve({ country: '', city: '' }));
  }

  // Process remaining
  if (geoQueue.length > 0) {
    geoTimer = setTimeout(processGeoQueue, 200);
  }
}

// ─── Log a pageview ─────────────────────────────────────────
async function logPageview(req) {
  const db = getDb();
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.ip || req.socket?.remoteAddress || '';

  const ua = req.headers['user-agent'] || '';
  const ref = req.headers['referer'] || req.headers['referrer'] || '';

  // Get geo (may be async)
  const geo = await lookupGeo(ip);

  db.prepare(
    'INSERT INTO pageviews (path, ip, country, city, user_agent, referrer) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.path, ip, geo.country, geo.city, ua, ref);
}

// ─── Stats endpoints ────────────────────────────────────────

function getStats(range = '7d') {
  const db = getDb();
  let since = '';
  if (range === '24h') since = "datetime('now', '-1 day')";
  else if (range === '7d') since = "datetime('now', '-7 days')";
  else if (range === '30d') since = "datetime('now', '-30 days')";
  else since = "datetime('now', '-7 days')";

  const total = db.prepare(`SELECT COUNT(*) as n FROM pageviews WHERE ts >= ${since}`).get().n;

  const today = db.prepare(`SELECT COUNT(*) as n FROM pageviews WHERE ts >= datetime('now', 'start of day')`).get().n;

  const uniqueIps = db.prepare(`SELECT COUNT(DISTINCT ip) as n FROM pageviews WHERE ts >= ${since} AND ip != ''`).get().n;

  const byCountry = db.prepare(`
    SELECT COALESCE(NULLIF(country,''), 'Unknown') as country, COUNT(*) as views
    FROM pageviews WHERE ts >= ${since}
    GROUP BY country ORDER BY views DESC
  `).all();

  const byPath = db.prepare(`
    SELECT path, COUNT(*) as views
    FROM pageviews WHERE ts >= ${since}
    GROUP BY path ORDER BY views DESC LIMIT 50
  `).all();

  const byDay = db.prepare(`
    SELECT date(ts) as day, COUNT(*) as views
    FROM pageviews WHERE ts >= ${since}
    GROUP BY day ORDER BY day
  `).all();

  return { total, today, unique_ips: uniqueIps, by_country: byCountry, by_path: byPath, by_day: byDay };
}

// ─── Auth helpers ───────────────────────────────────────────
function createSession() {
  const db = getDb();
  const sid = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sid);
  return sid;
}

function validateSession(sid) {
  if (!sid) return false;
  const db = getDb();
  const row = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sid);
  return !!row;
}

function deleteSession(sid) {
  if (!sid) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
}

// ─── Cleanup old geo cache entries ─────────────────────────
function cleanup() {
  const db = getDb();
  db.prepare("DELETE FROM geo_cache WHERE ts < datetime('now', '-30 days')").run();
  db.prepare("DELETE FROM sessions WHERE created < datetime('now', '-7 days')").run();
}

// Run cleanup every hour
setInterval(cleanup, 3600000);
cleanup();

module.exports = {
  logPageview,
  getStats,
  createSession,
  validateSession,
  deleteSession
};
