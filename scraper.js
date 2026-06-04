const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');

const BASE = 'https://www.bibliaortodoxa.ro';
const DB_PATH = path.join(__dirname, 'bible.db');

// ---- Database setup ----
function initDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS carti (
      id INTEGER PRIMARY KEY,
      nume TEXT NOT NULL,
      testament TEXT NOT NULL CHECK(testament IN ('OT','NT','DEUTERO'))
    );

    CREATE TABLE IF NOT EXISTS versete (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carte_id INTEGER NOT NULL REFERENCES carti(id),
      capitol INTEGER NOT NULL,
      verset INTEGER NOT NULL,
      text TEXT NOT NULL
    );

    -- FTS5 virtual table for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS versete_fts USING fts5(
      text,
      content='versete',
      content_rowid='id',
      tokenize='unicode61'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS versete_ai AFTER INSERT ON versete BEGIN
      INSERT INTO versete_fts(rowid, text) VALUES (new.id, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS versete_ad AFTER DELETE ON versete BEGIN
      INSERT INTO versete_fts(versete_fts, rowid, text) VALUES('delete', old.id, old.text);
    END;

    CREATE TRIGGER IF NOT EXISTS versete_au AFTER UPDATE ON versete BEGIN
      INSERT INTO versete_fts(versete_fts, rowid, text) VALUES('delete', old.id, old.text);
      INSERT INTO versete_fts(rowid, text) VALUES (new.id, new.text);
    END;

    CREATE INDEX IF NOT EXISTS idx_versete_carte_cap ON versete(carte_id, capitol, verset);
  `);

  return db;
}

// ---- Book list from homepage ----
async function scrapeBookList() {
  const { data: html } = await axios.get(BASE + '/', {
    headers: { 'User-Agent': 'BibleScraper/1.0' },
    timeout: 10000,
  });
  const $ = cheerio.load(html);

  // Maps from the select options
  const books = [];
  $('#CFTOP select option').each((_, el) => {
    const val = parseInt($(el).attr('value'));
    if (val <= 0) return; // skip "TOATA BIBLIA", "VECHIUL TESTAMENT", "NOUL TESTAMENT"
    let name = $(el).text().replace(/^[»\s&raquo;\s]+/, '').trim();
    // Determine testament from position in select
    books.push({ id: val, name, raw: $(el).text().trim() });
  });

  // Determine testament: everything between -1 (OT header) and -2 (NT header) is OT
  // Everything after -2 is NT. But we need to match by position.
  // Simpler: use the homepage listing which has explicit categories.
  const otBooks = new Set();
  const ntBooks = new Set();
  const deuteroBooks = new Set();

  // Known Orthodox OT books (canonical)
  const otCanon = [25, 32, 47, 59, 17, 41, 46, 71, 66, 67, 68, 69, 14, 15, 23, 58, 21, 42, 65, 63, 18, 9, 43, 31, 64, 33, 16, 60, 3, 56, 39, 6, 40, 57, 5, 73, 2, 82, 52];
  // Deuterocanonical / Anagignoskomena
  const deuteroCanon = [81, 45, 8, 20, 1, 24, 74, 72, 75, 7, 49, 50, 51, 54];
  // NT
  const ntCanon = [55, 53, 48, 35, 26, 70, 12, 13, 29, 19, 28, 10, 76, 77, 78, 79, 80, 27, 22, 30, 61, 62, 36, 37, 38, 44, 4];

  // Book name overrides (some raw names are misleading)
  const nameOverrides = {
    63: 'Pilde',
    74: 'Cartea lui Solomon (Înțelepciunea)',
    20: 'Epistola lui Ieremia',
    1: 'Cântarea celor trei tineri',
    7: 'Istoria Balaurului și a lui Bel'
  };

  return books.map(b => {
    let testament;
    if (otCanon.includes(b.id)) testament = 'OT';
    else if (deuteroCanon.includes(b.id)) testament = 'DEUTERO';
    else if (ntCanon.includes(b.id)) testament = 'NT';
    else testament = 'OT'; // fallback
    return { id: b.id, name: nameOverrides[b.id] || b.name, testament };
  });
}

// ---- Scrape a single book - get chapter list ----
async function scrapeChapters(bookId) {
  const { data: html } = await axios.get(`${BASE}/carte.php?id=${bookId}&cap=1`, {
    headers: { 'User-Agent': 'BibleScraper/1.0' },
    timeout: 10000,
  });
  const $ = cheerio.load(html);
  const chapters = [];
  $('.css_navbar_cap').each((_, el) => {
    const cap = parseInt($(el).text().trim());
    if (!isNaN(cap)) chapters.push(cap);
  });
  return chapters;
}

// ---- Check if page uses table-based verses (like Psalms) ----
function hasTableVerses($) {
  return $('tr[id^=verset]').length > 0;
}

// ---- Parse table-based verses (Psalms style) ----
function parseTableVerses($) {
  const verses = [];
  $('tr[id^=verset]').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length >= 2) {
      const num = parseInt($(tds[0]).find('.nr').text().trim());
      const text = $(tds[1]).text().trim();
      if (num && text) {
        verses.push({ num, text });
      }
    }
  });
  return verses;
}

// ---- Parse text-based verses (regular chapter style) ----
function parseTextVerses($) {
  // Remove script tags before extracting text
  $('.css_main script').remove();

  const fullText = $('.css_main').text();

  // Try "Capitolul X" first
  let capMatch = fullText.match(/Capitolul\s+(\d+)/);
  // For Psalms, try "Psalmul X"
  if (!capMatch) {
    capMatch = fullText.match(/Psalmul\s+(\d+)/);
  }

  if (!capMatch) return [];

  const versesText = fullText.substring(capMatch.index + capMatch[0].length);

  const verses = [];
  const verseRegex = /(\d+)\.\s*/g;
  let lastIndex = 0;
  let lastNum = null;

  while (true) {
    const match = verseRegex.exec(versesText);
    if (!match) {
      if (lastNum !== null) {
        const text = versesText.substring(lastIndex).trim();
        if (text) verses.push({ num: lastNum, text });
      }
      break;
    }

    if (lastNum !== null) {
      const text = versesText.substring(lastIndex, match.index).trim();
      if (text) verses.push({ num: lastNum, text });
    }

    lastNum = parseInt(match[1]);
    lastIndex = match.index + match[0].length;
  }

  return verses;
}

// ---- Scrape a single chapter - get all verses ----
async function scrapeChapter(bookId, bookName, chapter) {
  const { data: html } = await axios.get(`${BASE}/carte.php?id=${bookId}&cap=${chapter}`, {
    headers: { 'User-Agent': 'BibleScraper/1.0' },
    timeout: 15000,
  });
  const $ = cheerio.load(html);

  const mainHtml = $('.css_main').html();
  if (!mainHtml) return [];

  // Detect format
  if (hasTableVerses($)) {
    return parseTableVerses($);
  }

  return parseTextVerses($);
}

// ---- Main ----
async function main() {
  console.log('📖 Initializing database...');
  const db = initDb();
  console.log('📚 Scraping book list...');
  const books = await scrapeBookList();
  console.log(`Found ${books.length} books`);

  // Insert books
  const insertBook = db.prepare('INSERT OR REPLACE INTO carti (id, nume, testament, ordine) VALUES (?, ?, ?, ?)');
  const insertVerse = db.prepare('INSERT INTO versete (carte_id, capitol, verset, text) VALUES (?, ?, ?, ?)');

  const txBook = db.transaction((books) => {
    for (const b of books) {
      insertBook.run(b.id, b.name, b.testament, b.ordine || 999);
    }
  });
  txBook(books);

  let totalVerses = 0;
  let totalChapters = 0;

  for (const book of books) {
    console.log(`\n📖 ${book.name} (id=${book.id}, ${book.testament})`);
    try {
      const chapters = await scrapeChapters(book.id);
      console.log(`   Chapters: ${chapters.length}`);
      totalChapters += chapters.length;

      for (const chapter of chapters) {
        try {
          const verses = await scrapeChapter(book.id, book.name, chapter);
          if (verses.length === 0) {
            console.log(`   ⚠️  Chapter ${chapter}: no verses found`);
            continue;
          }

          const tx = db.transaction((verses) => {
            for (const v of verses) {
              insertVerse.run(book.id, chapter, v.num, v.text);
            }
          });
          tx(verses);
          totalVerses += verses.length;

          process.stdout.write(`   Chapter ${chapter}: ${verses.length} verses ✓\r`);
          // Be polite - small delay between chapters
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          console.error(`   ❌ Chapter ${chapter} error: ${err.message}`);
        }
      }
      // Be polite between books
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`   ❌ Book error: ${err.message}`);
    }
  }

  console.log(`\n\n✅ Done! Total: ${totalChapters} chapters, ${totalVerses} verses`);
  console.log(`Database: ${DB_PATH}`);

  // Populate FTS index from existing data (in case triggers missed something)
  console.log('Rebuilding FTS index...');
  db.exec(`INSERT INTO versete_fts(versete_fts, rowid, text)
           SELECT 'rebuild', id, text FROM versete WHERE id NOT IN (SELECT rowid FROM versete_fts)`);

  const stats = db.prepare('SELECT COUNT(*) as cnt FROM versete').get();
  const ftsStats = db.prepare('SELECT COUNT(*) as cnt FROM versete_fts').get();
  console.log(`Verses in DB: ${stats.cnt}, FTS index: ${ftsStats.cnt}`);

  db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
