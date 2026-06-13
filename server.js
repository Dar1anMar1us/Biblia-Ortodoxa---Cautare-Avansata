const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'bible.db');

app.use(cors());
app.use(express.json());

// Database connection (singleton)
function getDb() {
  if (!getDb._db) {
    getDb._db = new Database(DB_PATH);
    getDb._db.pragma('journal_mode = WAL');
    getDb._db.pragma('cache_size = -32000'); // 32MB cache
  }
  return getDb._db;
}

// ─── Helper: Parse FTS5 search query ─────────────────────────
// Supports: words, "phrase", AND, OR, NOT, prefix*
function buildFtsQuery(input) {
  if (!input || !input.trim()) return null;

  // If already has FTS operators, use as-is
  if (/[()*"]/.test(input) || /\b(AND|OR|NOT)\b/i.test(input)) {
    return input.trim();
  }

  // Simple case: split into tokens, join with AND
  const tokens = input.trim().split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return `"${tokens[0]}"`;
  return tokens.map(t => `"${t}"`).join(' AND ');
}

// ─── GET /api/books ──────────────────────────────────────────
app.get('/api/books', (req, res) => {
  const db = getDb();
  const { testament } = req.query;

  let sql = `SELECT id, nume, testament,
    (SELECT COUNT(*) FROM versete WHERE carte_id = c.id) as versete_total,
    (SELECT MAX(capitol) FROM versete WHERE carte_id = c.id) as capitole_total
    FROM carti c`;
  const params = [];

  if (testament) {
    sql += ' WHERE testament = ?';
    params.push(testament.toUpperCase());
  }

  sql += ' ORDER BY ordine';
  const books = db.prepare(sql).all(...params);
  res.json({ books });
});

// ─── Helper: resolve book by ID or name ──────────────────────
function resolveBook(db, idOrName) {
  // Load book list cache
  if (!getDb._books) {
    getDb._books = db.prepare('SELECT id, nume, testament, ordine FROM carti').all();
  }
  const books = getDb._books;

  // By numeric ID
  const num = parseInt(idOrName);
  if (!isNaN(num) && num > 0) return books.find(b => b.id === num);

  // By name (case-insensitive)
  const name = idOrName.toLowerCase();
  let match = books.find(b => b.nume.toLowerCase() === name);
  if (match) return match;

  // Try alternate names
  const altNames = {
    'geneza': 'Facerea',
    'exodul': 'Ieșirea',
    'exod': 'Ieșirea',
    'levitic': 'Leviticul',
    'numeri': 'Numerii',
    'deuteronom': 'Deuteronomul',
    'iosua': 'Iosua Navi',
    'judecatori': 'Judecători',
    '1 regi': 'I Regi', '2 regi': 'II Regi', '3 regi': 'III Regi', '4 regi': 'IV Regi',
    'cronici': 'I Paralipomena',
    '1 cronici': 'I Paralipomena', '2 cronici': 'II Paralipomena',
    'ezra': 'I Ezdra',
    'neemia': 'Neemia',
    'estera': 'Esterei',
    'psalm': 'Psalmi',
    'proverbe': 'Pilde',
    'eclesiast': 'Ecclesiastul',
    'cantarea cantarilor': 'Cântări', 'cântarea cântărilor': 'Cântări',
    'isaia': 'Isaia',
    'plangeri': 'Plangeri',
    'iezechiel': 'Iezechiel', 'ezechiel': 'Iezechiel',
    'daniel': 'Daniel',
    'osea': 'Osea',
    'ioil': 'Ioil',
    'avdie': 'Avdie',
    'iona': 'Iona',
    'naum': 'Naum',
    'avacum': 'Avacum',
    'sofonie': 'Sofonie',
    'agheu': 'Agheu',
    'zaharia': 'Zaharia',
    'maleahi': 'Maleahi',
    'tobit': 'Tobit',
    'iudita': 'Iudita',
    'baruh': 'Baruh',
    '1 macabei': 'I Macabei', '2 macabei': 'II Macabei', '3 macabei': 'III Macabei',
    'macabei': 'I Macabei',
    'manase': 'Manase',
    'matei': 'Matei',
    'marcu': 'Marcu',
    'luca': 'Luca',
    'ioan': 'Ioan',
    'fapte': 'Faptele Apostolilor', 'faptele apostolilor': 'Faptele Apostolilor',
    'romani': 'Romani',
    '1 corinteni': 'I Corinteni', '2 corinteni': 'II Corinteni',
    'corinteni': 'I Corinteni',
    'galateni': 'Galateni',
    'efeseni': 'Efeseni',
    'filipeni': 'Filipeni',
    'coloseni': 'Coloseni',
    '1 tesaloniceni': 'I Tesaloniceni', '2 tesaloniceni': 'II Tesaloniceni',
    'tesaloniceni': 'I Tesaloniceni',
    '1 timotei': 'I Timotei', '2 timotei': 'II Timotei',
    'timotei': 'I Timotei',
    'tit': 'Tit',
    'filimon': 'Filimon',
    'evrei': 'Evrei',
    'iacov': 'Iacov',
    '1 petru': 'I Petru', '2 petru': 'II Petru',
    'petru': 'I Petru',
    'iuda': 'Iuda',
    'apocalipsa': 'Apocalipsa', 'apocalips': 'Apocalipsa',
    'solomon intelepciunea': 'Cartea lui Solomon (Înțelepciunea)',
    'intelepciunea lui solomon': 'Cartea lui Solomon (Înțelepciunea)',
    'ecclesiastic': 'Ecclesiasticul',
    'susana': 'Susanei',
    'balaur': 'Istoria Balaurului și a lui Bel',
  };
  const altName = altNames[name];
  if (altName) {
    match = books.find(b => b.nume.toLowerCase() === altName.toLowerCase());
    if (match) return match;
  }

  // Try prefix match
  return books.find(b => b.nume.toLowerCase().startsWith(name));
}

// ─── GET /api/books/:id ──────────────────────────────────────
app.get('/api/books/:id', (req, res) => {
  const db = getDb();
  const book = resolveBook(db, req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const chapters = db.prepare(
    'SELECT DISTINCT capitol FROM versete WHERE carte_id = ? ORDER BY capitol'
  ).all(book.id).map(r => r.capitol);

  res.json({ ...book, capitole: chapters });
});

// ─── GET /api/books/:bookId/chapters/:chapter ────────────────
app.get('/api/books/:bookId/chapters/:chapter', (req, res) => {
  const db = getDb();
  const { bookId, chapter } = req.params;

  const book = resolveBook(db, bookId);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const verses = db.prepare(
    'SELECT v.id, v.verset as numar, v.text FROM versete v WHERE v.carte_id = ? AND v.capitol = ? ORDER BY v.verset'
  ).all(book.id, chapter);

  if (verses.length === 0) return res.status(404).json({ error: 'Chapter not found' });

  // Navigation: previous/next chapter
  const chapters = db.prepare(
    'SELECT DISTINCT capitol FROM versete WHERE carte_id = ? ORDER BY capitol'
  ).all(book.id).map(r => r.capitol);

  const currentIdx = chapters.indexOf(parseInt(chapter));
  const prevChapter = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  res.json({
    book,
    capitol: parseInt(chapter),
    total_capitole: chapters.length,
    total_versete: verses.length,
    versete: verses,
    navigare: {
      precedent: prevChapter,
      urmator: nextChapter
    }
  });
});

// ─── GET /api/search ─────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const db = getDb();
  const { q, carte, capitol, limit = 20, offset = 0 } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const ftsQuery = buildFtsQuery(q);
  if (!ftsQuery) return res.status(400).json({ error: 'Invalid query' });

  let sql, countSql, params;

  // Search with optional filters
  const filters = [];
  const ftsParams = [ftsQuery];

  if (carte) {
    filters.push('v.carte_id = ?');
    ftsParams.push(parseInt(carte));
  }
  if (capitol) {
    filters.push('v.capitol = ?');
    ftsParams.push(parseInt(capitol));
  }

  const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

  countSql = `
    SELECT COUNT(*) as total FROM versete_fts f
    JOIN versete v ON v.id = f.rowid
    WHERE versete_fts MATCH ? ${filterClause}
  `;

  sql = `
    SELECT v.id, c.nume as carte, c.id as carte_id, c.testament,
           v.capitol, v.verset as verset_numar, v.text,
           1 as relevanta
    FROM versete_fts f
    JOIN versete v ON v.id = f.rowid
    JOIN carti c ON c.id = v.carte_id
    WHERE versete_fts MATCH ? ${filterClause}
    ORDER BY rank
    LIMIT ? OFFSET ?
  `;

  const resultParams = [...ftsParams, parseInt(limit), parseInt(offset)];

  // Get total count
  const countResult = db.prepare(countSql).get(...ftsParams);
  const total = countResult.total;

  // Get results
  let rows;
  try {
    rows = db.prepare(sql).all(...resultParams);
  } catch (e) {
    return res.status(500).json({ error: 'Search failed', detail: e.message });
  }

  // Format results (skip per-row highlights to avoid SQLite memory issues)
  const formatted = rows.map(r => ({
    id: r.id,
    referinta: `${r.carte} ${r.capitol}:${r.verset_numar}`,
    carte: r.carte,
    carte_id: r.carte_id,
    testament: r.testament,
    capitol: r.capitol,
    verset: r.verset_numar,
    text: r.text,
    url: `/carte/${r.carte_id}/capitol/${r.capitol}#${r.verset_numar}`
  }));

  // Get book facet counts
  let facets = [];
  try {
    facets = db.prepare(
      `SELECT c.nume, c.id, COUNT(*) as count FROM versete_fts f
       JOIN versete v ON v.id = f.rowid
       JOIN carti c ON c.id = v.carte_id
       WHERE versete_fts MATCH ?
       GROUP BY c.id ORDER BY count DESC`
    ).all(ftsQuery);
  } catch (e) {
    // Facet query may fail on complex queries, that's ok
    facets = [];
  }

  res.json({
    query: q,
    fts_query: ftsQuery,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
    results: formatted,
    filtre: facets
  });
});

// ─── GET /api/reference ───────────────────────────────────────
// Resolves "Ioan 1:1", "Geneza 2:15", "Matei 5" etc. to book/chapter/verse
app.get('/api/reference', (req, res) => {
  const db = getDb();
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Query required' });

  // Match patterns: "Book Chapter:Verse", "Book Chapter"
  const refMatch = q.trim().match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
  if (!refMatch) return res.json({ found: false });

  const bookName = refMatch[1].toLowerCase().trim();
  const chapter = parseInt(refMatch[2]);
  const verse = refMatch[3] ? parseInt(refMatch[3]) : null;

  // Use resolveBook helper
  const book = resolveBook(db, bookName);
  if (!book) return res.json({ found: false });

  // Verify chapter exists
  const chapterExists = db.prepare(
    'SELECT COUNT(*) as cnt FROM versete WHERE carte_id = ? AND capitol = ?'
  ).get(book.id, chapter);

  if (!chapterExists.cnt) return res.json({ found: false, book, error: 'Chapter not found' });

  // Build URL with book name (URL-encoded)
  const bookSlug = encodeURIComponent(book.nume);

  // If verse specified, verify it exists
  if (verse) {
    const verseExists = db.prepare(
      'SELECT verset, text FROM versete WHERE carte_id = ? AND capitol = ? AND verset = ?'
    ).get(book.id, chapter, verse);

    if (!verseExists) return res.json({ found: false, book, capitol: chapter, error: 'Verse not found' });

    return res.json({
      found: true,
      book,
      capitol: chapter,
      verset: verse,
      text: verseExists.text,
      url: `/carte/${bookSlug}/capitol/${chapter}#${verse}`
    });
  }

  return res.json({
    found: true,
    book,
    capitol: chapter,
    verset: null,
    url: `/carte/${bookSlug}/capitol/${chapter}`
  });
});

// ─── GET /api/search/suggest ─────────────────────────────────
app.get('/api/search/suggest', (req, res) => {
  const db = getDb();
  const { q } = req.query;

  if (!q || q.length < 2) return res.json({ suggestions: [] });

  // Use prefix search for autocomplete
  const suggestions = db.prepare(`
    SELECT DISTINCT v.text, c.nume as carte, c.id as carte_id, v.capitol, v.verset
    FROM versete_fts f
    JOIN versete v ON v.id = f.rowid
    JOIN carti c ON c.id = v.carte_id
    WHERE versete_fts MATCH ?
    ORDER BY rank
    LIMIT 5
  `).all(`"${q}"*`);

  res.json({
  query: q,
  suggestions: suggestions.map(s => ({
    referinta: `${s.carte} ${s.capitol}:${s.verset}`,
    carte_id: s.carte_id,
    carte_nume: s.carte,
    capitol: s.capitol,
    verset: s.verset,
    preview: s.text.substring(0, 80) + (s.text.length > 80 ? '...' : '')
  }))
  });
});

// ─── GET /api/calendar ────────────────────────────────────────
// ─── GET /api/calendar/:an/:luna ──────────────────────────────
app.get('/api/calendar', (req, res) => {
  const now = new Date();
  res.redirect(`/api/calendar/${now.getFullYear()}/${now.getMonth() + 1}`);
});

app.get('/api/calendar/:an/:luna', (req, res) => {
  const db = getDb();
  const now = new Date();
  const an = parseInt(req.params.an);
  const luna = parseInt(req.params.luna);

  // Validate
  if (isNaN(an) || an < 2025 || an > 2037) return res.status(400).json({ error: 'An invalid. 2025-2037.' });
  if (isNaN(luna) || luna < 1 || luna > 12) return res.status(400).json({ error: 'Luna invalidă. 1-12.' });

  const monthNames = [
    'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
    'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'
  ];

  const days = db.prepare(`
    SELECT zi, zi_sapt, sfinti, tip, comentarii, duminica_titlu, duminica_subtitlu
    FROM calendar
    WHERE an = ? AND luna = ?
    ORDER BY zi
  `).all(an, luna);

  // Get today's info
  const today = db.prepare(`
    SELECT zi, zi_sapt, sfinti, tip, comentarii
    FROM calendar WHERE an = ? AND luna = ? AND zi = ?
  `).get(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // Determine post info for the month — extract unique fasting rules
  const postDays = days.filter(d => d.comentarii && (
    d.comentarii.toLowerCase().includes('post')
  )).map(d => ({ zi: d.zi, info: d.comentarii }));

  res.json({
    an,
    luna,
    luna_nume: monthNames[luna - 1],
    total_zile: days.length,
    astazi: today || null,
    zile: days,
    posturi: postDays.slice(0, 10) // top fasting days
  });
});

// ─── GET /api/sinaxar/:an/:luna/:zi ───────────────────────────
app.get('/api/sinaxar/:an/:luna/:zi', (req, res) => {
  const db = getDb();
  let { an, luna, zi } = req.params;
  an = parseInt(an); luna = parseInt(luna); zi = parseInt(zi);

  // Try requested year first
  let row = db.prepare(`
    SELECT titlu, text, img_local, img_original
    FROM sinaxar WHERE an = ? AND luna = ? AND zi = ?
  `).get(an, luna, zi);

  // Fallback to 2026 (saint texts are the same every year)
  if (!row) {
    row = db.prepare(`
      SELECT titlu, text, img_local, img_original
      FROM sinaxar WHERE an = 2026 AND luna = ? AND zi = ?
    `).get(luna, zi);
  }

  if (!row) return res.json({ found: false });
  res.json({ found: true, ...row });
});

// ─── Serve static files (public/) ──────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── GET /robots.txt ────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: https://bibliaortodoxa.org/sitemap.xml
`);
});

// ─── GET /sitemap.xml ───────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const db = getDb();

  // Get all books with chapter counts
  const books = db.prepare(`
    SELECT c.id, c.nume, c.testament,
           (SELECT MAX(capitol) FROM versete WHERE carte_id = c.id) as capitole
    FROM carti c ORDER BY c.ordine
  `).all();

  let urls = '';

  // Homepage
  urls += `  <url>\n    <loc>https://bibliaortodoxa.org/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

  // Calendar page
  urls += `  <url>\n    <loc>https://bibliaortodoxa.org/calendar</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;

  // Each book + chapters
  for (const book of books) {
    urls += `  <url>\n    <loc>https://bibliaortodoxa.org/carte/${encodeURIComponent(book.nume)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

    for (let ch = 1; ch <= book.capitole; ch++) {
      urls += `  <url>\n    <loc>https://bibliaortodoxa.org/carte/${encodeURIComponent(book.nume)}/capitol/${ch}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }
  }

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}</urlset>
`);
});

// ─── SPA catch-all: serve index.html for all non-API/seo routes ──
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/robots.txt' || req.path === '/sitemap.xml') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`📖 Bible API running at http://localhost:${PORT}`);
  console.log(`   Browse:    http://localhost:${PORT}/`);
  console.log(`   API docs:  http://localhost:${PORT}/api/books`);
  console.log(`   Search:    http://localhost:${PORT}/api/search?q=iubire`);
});
