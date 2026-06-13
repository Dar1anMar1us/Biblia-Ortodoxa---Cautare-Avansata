#!/usr/bin/env python3
"""Parse calendar data from noutati-ortodoxe.ro and seed SQLite database."""

import re
import sqlite3
import subprocess
import sys
import os
from html.parser import HTMLParser

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'bible.db')


class DayParser(HTMLParser):
    """Parse a single month's HTML table into structured data.

    The source HTML uses unclosed <td> tags (no </td>), so we must
    finalize each td when encountering the next <td> or </tr>.
    """

    def __init__(self):
        super().__init__()
        self.month = 0
        self.days = []
        self._day = None  # current day being built
        self._in_td = False
        self._td_class = ''
        self._td_text = ''
        self._in_sinaxar = False
        self._saint_text = ''
        self._in_comentariu = False
        self._com_text = ''
        self._in_title = False
        self._title_text = ''
        self._in_subtitle = False
        self._subtitle_text = ''
        self._comentarii = []
        self._duminica_title = ''
        self._duminica_subtitle = ''
        self._in_tr = False

    def _finalize_td(self):
        """Save current td data into the active day record."""
        if not self._in_td or self._day is None:
            self._in_td = False
            return

        text = self._td_text.strip()
        cls = self._td_class

        if cls == 'ziua':
            try:
                self._day['zi'] = int(text)
            except:
                pass
        elif cls == 'sapt':
            self._day['zi_sapt'] = text
        elif cls == '':
            # Saint info: either from sinaxar link or from raw text
            if self._saint_text:
                self._day['sfinti'] = re.sub(r'\s+', ' ', self._saint_text).strip()
            elif text:
                # No sinaxar link - use raw text (e.g. "Sf. Treime")
                self._day['sfinti'] = re.sub(r'\s+', ' ', text).strip()
            if self._comentarii:
                self._day['comentarii'] = list(self._comentarii)

        self._in_td = False
        self._td_text = ''
        self._td_class = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)

        if tag == 'tr':
            cls = a.get('class', '')
            if cls == 'luna':
                self.month += 1
                return
            # Finalize previous row's last td
            if self._in_tr and self._day is not None:
                self._finalize_td()
                self._save_day()
            self._in_tr = True
            self._tr_class = cls
            self._day = {'zi': None, 'zi_sapt': None, 'sfinti': '',
                         'comentarii': [], 'tip': 'normal',
                         'duminica_titlu': '', 'duminica_subtitlu': ''}
            self._saint_text = ''
            self._comentarii = []
            self._duminica_title = ''
            self._duminica_subtitle = ''
            return

        if tag == 'td' and self._in_tr:
            # Finalize previous td in this row
            self._finalize_td()
            self._in_td = True
            self._td_class = a.get('class', '')
            self._td_text = ''
            self._saint_text = ''
            return

        if tag == 'a' and self._in_td and 'sinaxar' in a.get('class', ''):
            self._in_sinaxar = True
            return

        if tag == 'span':
            cls = a.get('class', '')
            if cls == 'comentariu':
                self._in_comentariu = True
                self._com_text = ''
            elif cls == 'title':
                self._in_title = True
                self._title_text = ''
            elif cls == 'subtitle':
                self._in_subtitle = True
                self._subtitle_text = ''

    def handle_endtag(self, tag):
        if tag == 'a' and self._in_sinaxar:
            self._in_sinaxar = False
            return

        if tag == 'span':
            if self._in_comentariu:
                self._in_comentariu = False
                t = self._com_text.strip()
                if t:
                    self._comentarii.append(t)
            if self._in_title:
                self._in_title = False
                self._duminica_title = self._title_text.strip()
            if self._in_subtitle:
                self._in_subtitle = False
                self._duminica_subtitle = self._subtitle_text.strip()
            return

        if tag == 'tr' and self._in_tr:
            self._finalize_td()
            self._save_day()
            self._in_tr = False
            self._day = None
            return

    def _save_day(self):
        if self._day is None or self._day.get('zi') is None:
            return
        
        cls = self._tr_class if hasattr(self, '_tr_class') else ''
        tip = 'normal'
        if 'sarbatoare' in cls and 'saptamana' not in cls:
            tip = 'sarbatoare'
        elif 'sarbatoare saptamana' in cls:
            tip = 'sarbatoare'
        elif 'duminica' in cls:
            tip = 'duminica'

        self._day['tip'] = tip
        self._day['duminica_titlu'] = self._duminica_title
        self._day['duminica_subtitlu'] = self._duminica_subtitle
        self.days.append(dict(self._day))

    def handle_data(self, data):
        if self._in_sinaxar:
            self._saint_text += data
        elif self._in_comentariu:
            self._com_text += data
        elif self._in_title:
            self._title_text += data
        elif self._in_subtitle:
            self._subtitle_text += data
        elif self._in_td:
            self._td_text += data


def parse_month_table(html, start_idx):
    """Extract a single month's table HTML."""
    table_start = html.find('<table', start_idx)
    if table_start == -1:
        return None
    table_end = html.find('</table>', table_start)
    if table_end == -1:
        return None
    return html[table_start:table_end + 8]


def download_calendar(year):
    """Download calendar HTML for a specific year."""
    url = f"https://www.noutati-ortodoxe.ro/calendar-ortodox/?year={year}"
    result = subprocess.run(
        ['curl', '-s', url],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0 or not result.stdout:
        return None
    return result.stdout


def parse_calendar_page(html, year):
    """Parse HTML calendar."""
    months_data = {}

    for month_num in range(1, 13):
        marker = f'id="month{month_num}"'
        idx = html.find(marker)
        if idx == -1:
            continue

        table_html = parse_month_table(html, idx)
        if not table_html:
            continue

        parser = DayParser()
        try:
            parser.feed(table_html)
            if parser.days:
                months_data[month_num] = parser.days
        except Exception as e:
            print(f"    ⚠ Error month {month_num}: {e}")

    return months_data


def seed_database(db_path, all_data):
    """Seed SQLite database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS calendar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            an INTEGER NOT NULL,
            luna INTEGER NOT NULL,
            zi INTEGER NOT NULL,
            zi_sapt TEXT,
            sfinti TEXT,
            tip TEXT DEFAULT 'normal',
            comentarii TEXT DEFAULT '',
            duminica_titlu TEXT DEFAULT '',
            duminica_subtitlu TEXT DEFAULT '',
            UNIQUE(an, luna, zi)
        )
    ''')

    existing = cursor.execute('SELECT COUNT(*) FROM calendar').fetchone()[0]
    if existing > 0:
        cursor.execute('DROP TABLE IF EXISTS calendar')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS calendar (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                an INTEGER NOT NULL,
                luna INTEGER NOT NULL,
                zi INTEGER NOT NULL,
                zi_sapt TEXT,
                sfinti TEXT,
                tip TEXT DEFAULT 'normal',
                comentarii TEXT DEFAULT '',
                duminica_titlu TEXT DEFAULT '',
                duminica_subtitlu TEXT DEFAULT '',
                UNIQUE(an, luna, zi)
            )
        ''')

    count = 0
    for year, months in all_data.items():
        for month_num, days in months.items():
            for day in days:
                # Handle M (both Marți and Miercuri)
                zi_sapt = day.get('zi_sapt', '')
                # The site uses 'M' for both Tuesday and Wednesday
                # We can't differentiate, store as-is

                comentarii_text = ''
                if isinstance(day.get('comentarii'), list):
                    comentarii_text = '; '.join(day['comentarii'])
                elif day.get('comentarii'):
                    comentarii_text = str(day['comentarii'])

                cursor.execute('''
                    INSERT OR IGNORE INTO calendar (an, luna, zi, zi_sapt, sfinti, tip, comentarii, duminica_titlu, duminica_subtitlu)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    year, month_num, day['zi'],
                    zi_sapt,
                    day.get('sfinti', ''),
                    day.get('tip', 'normal'),
                    comentarii_text,
                    day.get('duminica_titlu', ''),
                    day.get('duminica_subtitlu', ''),
                ))
                count += 1

    conn.commit()
    conn.close()
    print(f"  ✓ Inserted {count} calendar entries")


def main():
    years = list(range(2025, 2038))
    print(f"🔄 Downloading calendar data for {len(years)} years...")
    all_data = {}

    for year in years:
        print(f"  Year {year}...", end=' ', flush=True)
        html = download_calendar(year)
        if html:
            months = parse_calendar_page(html, year)
            if months:
                all_data[year] = months
                total = sum(len(days) for days in months.values())
                print(f"{len(months)} months, {total} days ✓")
            else:
                print("no data parsed ✗")
        else:
            print("download failed ✗")

    if not all_data:
        print("❌ No data collected. Aborting.")
        sys.exit(1)

    print(f"\n📦 Seeding database at {DB_PATH}...")
    seed_database(DB_PATH, all_data)

    conn = sqlite3.connect(DB_PATH)
    count = conn.execute('SELECT COUNT(*) FROM calendar').fetchone()[0]
    years_count = conn.execute('SELECT COUNT(DISTINCT an) FROM calendar').fetchone()[0]
    print(f"\n✅ Database ready: {count} entries across {years_count} years")

    # Sample
    rows = conn.execute('''
        SELECT an, luna, zi, zi_sapt, substr(sfinti,1,60), tip, substr(comentarii,1,40)
        FROM calendar WHERE luna = 6 AND zi = 13 ORDER BY an LIMIT 5
    ''').fetchall()
    for r in rows:
        print(f"  {r[0]}-{r[1]:02d}-{r[2]:02d} ({r[3]}): {r[4]} — [{r[5]}] — {r[6]}")
    conn.close()


if __name__ == '__main__':
    main()
