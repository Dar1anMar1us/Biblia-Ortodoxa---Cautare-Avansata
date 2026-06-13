#!/usr/bin/env python3
"""Fetch sinaxar pages for 2026 — download text + images."""

import os
import re
import sqlite3
import subprocess
import sys
import datetime
import calendar
from html.parser import HTMLParser

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'bible.db')
IMG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'images', 'sinaxar')

# Month names for building URLs
MONTHS_RO = ['ianuarie','februarie','martie','aprilie','mai','iunie',
             'iulie','august','septembrie','octombrie','noiembrie','decembrie']

class SinaxarParser(HTMLParser):
    """Parse the sinaxar page HTML."""
    def __init__(self):
        super().__init__()
        self.title = ''
        self.paragraphs = []
        self.img_url = ''
        self._in_title = False
        self._in_p = False
        self._p_text = ''
        self._skip_p = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'p':
            cls = a.get('class', '')
            # Skip navigation paragraphs
            if 'nota' in cls or 'subtitlu' in cls:
                self._skip_p = True
                return
            align = a.get('align', '')
            style = a.get('style', '')
            if align == 'CENTER' and style and 'font-size' in style:
                # Title paragraph
                self._in_title = True
                self._skip_p = False
                self._p_text = ''
                self._in_p = True
                return
            self._in_p = True
            self._p_text = ''
        if tag == 'img' and not self.img_url:
            src = a.get('src', '')
            if src and not src.startswith('data:'):
                self.img_url = src

    def handle_endtag(self, tag):
        if tag == 'p':
            if self._in_title:
                self._in_title = False
                self._skip_p = False
            elif self._in_p and not self._skip_p:
                text = self._p_text.strip()
                if text and len(text) > 50:  # Only substantial paragraphs
                    self.paragraphs.append(text)
            self._in_p = False
            self._skip_p = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_p and not self._skip_p:
            self._p_text += data

    def get_text(self):
        """Get the full saint description."""
        return '\n\n'.join(self.paragraphs)


def fetch_sinaxar(year, month, day):
    """Fetch and parse a sinaxar page."""
    dt = datetime.datetime(year, month, day, tzinfo=datetime.timezone.utc)
    ts = int(dt.timestamp())

    url = f"https://www.noutati-ortodoxe.ro/calendar-ortodox/sinaxar.php?date={ts}"
    
    result = subprocess.run(['curl', '-s', url], capture_output=True, timeout=30)
    if result.returncode != 0 or not result.stdout:
        return None, None, None
    
    raw = result.stdout
    # Detect encoding from meta tag or default to iso-8859-2
    # Site uses UTF-8 (confirmed from meta charset tag)
    html = raw.decode('utf-8', errors='replace')
    
    parser = SinaxarParser()
    try:
        parser.feed(html)
    except Exception as e:
        print(f"    ⚠ Parse error: {e}")
        return None, None, None
    
    # Clean title
    title = re.sub(r'\s+', ' ', parser.title).strip() if parser.title else ''
    
    # Get image URL (make absolute)
    img_url = ''
    if parser.img_url:
        if parser.img_url.startswith('http'):
            img_url = parser.img_url
        else:
            img_url = f"http://calendar-ortodox.ro/luna/{MONTHS_RO[month-1]}/{parser.img_url}"
    
    text = parser.get_text()
    
    return title, text, img_url


def download_image(img_url, day_key):
    """Download an image to local storage."""
    if not img_url:
        return ''
    
    os.makedirs(IMG_DIR, exist_ok=True)
    
    # Determine extension from URL
    ext = os.path.splitext(img_url.split('/')[-1])[1] or '.jpg'
    local_name = f"{day_key}{ext}"
    local_path = os.path.join(IMG_DIR, local_name)
    
    if os.path.exists(local_path):
        return f"/images/sinaxar/{local_name}"
    
    result = subprocess.run(
        ['curl', '-s', '-o', local_path, img_url],
        capture_output=True, timeout=30
    )
    
    if result.returncode == 0 and os.path.exists(local_path) and os.path.getsize(local_path) > 100:
        return f"/images/sinaxar/{local_name}"
    
    return ''


def init_db():
    """Ensure sinaxar table exists."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS sinaxar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            an INTEGER NOT NULL,
            luna INTEGER NOT NULL,
            zi INTEGER NOT NULL,
            titlu TEXT DEFAULT '',
            text TEXT DEFAULT '',
            img_local TEXT DEFAULT '',
            img_original TEXT DEFAULT '',
            UNIQUE(an, luna, zi)
        )
    ''')
    conn.commit()
    conn.close()


def sinaxar_exists(an, luna, zi):
    """Check if sinaxar data already exists for this date."""
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        'SELECT text FROM sinaxar WHERE an = ? AND luna = ? AND zi = ?',
        (an, luna, zi)
    ).fetchone()
    conn.close()
    return row is not None and bool(row[0])


def save_sinaxar(an, luna, zi, titlu, text, img_local, img_original):
    """Store sinaxar data in the database."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        INSERT OR REPLACE INTO sinaxar (an, luna, zi, titlu, text, img_local, img_original)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (an, luna, zi, titlu, text, img_local, img_original))
    conn.commit()
    conn.close()


def main():
    print("🔧 Initializing database...")
    init_db()
    os.makedirs(IMG_DIR, exist_ok=True)
    
    year = 2026
    
    total_days = 0
    skipped = 0
    fetched = 0
    images = 0
    
    for month in range(1, 13):
        days_in_month = calendar.monthrange(year, month)[1]
        month_name = MONTHS_RO[month - 1]
        
        for day in range(1, days_in_month + 1):
            total_days += 1
            
            # Check if already have text
            if sinaxar_exists(year, month, day):
                skipped += 1
                continue
            
            day_key = f"{month:02d}{day:02d}"
            print(f"  {year}-{month:02d}-{day:02d} ({month_name} {day})...", end=' ', flush=True)
            
            title, text, img_url = fetch_sinaxar(year, month, day)
            
            if not text and not title:
                print(f"no data ✗")
                continue
            
            # Download image
            img_local = download_image(img_url, day_key) if img_url else ''
            if img_local:
                images += 1
            
            save_sinaxar(year, month, day, title or '', text or '', img_local, img_url or '')
            fetched += 1
            
            # Truncate text for display
            preview = text[:80] + '...' if text and len(text) > 80 else (text or '')
            print(f"✓ {len(text or '')} chars, img={'yes' if img_local else 'no'}")
    
    print(f"\n📊 Summary:")
    print(f"  Total days: {total_days}")
    print(f"  Already had: {skipped}")
    print(f"  Fetched new: {fetched}")
    print(f"  Images downloaded: {images}")
    
    # Count total in DB
    conn = sqlite3.connect(DB_PATH)
    cnt = conn.execute('SELECT COUNT(*) FROM sinaxar').fetchone()[0]
    with_text = conn.execute('SELECT COUNT(*) FROM sinaxar WHERE text != ""').fetchone()[0]
    with_img = conn.execute('SELECT COUNT(*) FROM sinaxar WHERE img_local != ""').fetchone()[0]
    conn.close()
    print(f"\n  Total in DB: {cnt}")
    print(f"  With text: {with_text}")
    print(f"  With image: {with_img}")


if __name__ == '__main__':
    main()
