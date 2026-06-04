const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');

const BASE = 'https://www.bibliaortodoxa.ro';
const db = new Database('/root/bible-api/bible.db');
db.pragma('journal_mode = WAL');

// Find all contaminated chapters
const contaminated = db.prepare(`
  SELECT DISTINCT v.carte_id, v.capitol, c.nume as carte
  FROM versete v
  JOIN carti c ON c.id = v.carte_id
  WHERE v.text LIKE '%verset%' OR v.text LIKE '%document.location%' OR v.text LIKE '%getElementById%'
  ORDER BY c.ordine, v.capitol
`).all();

console.log(`Contaminated chapters: ${contaminated.length}`);

// Functions from scraper
function hasTableVerses($) {
  return $('tr[id^=verset]').length > 0;
}

function parseTableVerses($) {
  const verses = [];
  $('tr[id^=verset]').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length >= 2) {
      const num = parseInt($(tds[0]).find('.nr').text().trim());
      const text = $(tds[1]).text().trim();
      if (num && text) verses.push({ num, text });
    }
  });
  return verses;
}

function parseTextVerses($) {
  $('.css_main script').remove();
  const fullText = $('.css_main').text();
  let capMatch = fullText.match(/Capitolul\s+(\d+)/);
  if (!capMatch) capMatch = fullText.match(/Psalmul\s+(\d+)/);
  if (!capMatch) return [];

  const versesText = fullText.substring(capMatch.index + capMatch[0].length);
  const verses = [];
  const verseRegex = /(\d+)\.\s*/g;
  let lastIndex = 0, lastNum = null;

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

const updateVerse = db.prepare('UPDATE versete SET text = ? WHERE carte_id = ? AND capitol = ? AND verset = ?');
const getVerseCount = db.prepare('SELECT COUNT(*) as cnt FROM versete WHERE carte_id = ? AND capitol = ?');

let fixed = 0;
let errors = 0;

async function main() {
  for (const ch of contaminated) {
  try {
    const { data: html } = await axios.get(`${BASE}/carte.php?id=${ch.carte_id}&cap=${ch.capitol}`, {
      headers: { 'User-Agent': 'BibleScraper/1.0' },
      timeout: 15000,
    });
    const $ = cheerio.load(html);

    let verses;
    if (hasTableVerses($)) {
      verses = parseTableVerses($);
    } else {
      verses = parseTextVerses($);
    }

    if (verses.length === 0) {
      console.log(`  ⚠️  ${ch.carte} ${ch.capitol}: no verses parsed`);
      errors++;
      continue;
    }

    // Check if count matches
    const existing = getVerseCount.get(ch.carte_id, ch.capitol).cnt;
    if (verses.length !== existing) {
      console.log(`  ⚠️  ${ch.carte} ${ch.capitol}: parsed ${verses.length}, expected ${existing}`);
    }

    // Update verses
    const tx = db.transaction((vs) => {
      for (const v of vs) {
        updateVerse.run(v.text, ch.carte_id, ch.capitol, v.num);
      }
    });
    tx(verses);
    fixed += verses.length;
    process.stdout.write(`  ✓ ${ch.carte} ${ch.capitol}: ${verses.length} verses\r`);
  } catch (err) {
    console.log(`  ❌ ${ch.carte} ${ch.capitol}: ${err.message}`);
    errors++;
  }

  // Be polite
  await new Promise(r => setTimeout(r, 300));
  }
}

main().then(() => {
  console.log(`\n\nDone! Fixed ${fixed} verses, errors: ${errors}`);

  // Verify
  const remaining = db.prepare(`
    SELECT COUNT(*) as cnt FROM versete
    WHERE text LIKE '%verset%' OR text LIKE '%document.location%' OR text LIKE '%getElementById%'
  `).get();
  console.log(`Remaining contaminated: ${remaining.cnt}`);

  db.close();
}).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
