#!/usr/bin/env python3
"""
Completează DOAR zilele lipsă din tabela `calendar` (ex. zilele de final de lună
care nu au fost prinse la seed) — folosește parserul din parse_calendar.py, dar
nu șterge tabela (parse_calendar.py face DROP TABLE și descarcă 13 ani).

Utilizare:
    python3 scripts/fill_missing_calendar.py 2026

Sursă: noutati-ortodoxe.ro/calendar-ortodox/?year=<an>
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from parse_calendar import download_calendar, parse_calendar_page  # noqa: E402

DB = os.path.join(ROOT, 'bible.db')


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026

    print(f"descarc calendarul pentru {year}...")
    html = download_calendar(year)
    if not html:
        print("   [!] nu am putut descărca pagina")
        return 1
    months = parse_calendar_page(html, year)
    if not months:
        print("   [!] parserul nu a întors date")
        return 1

    conn = sqlite3.connect(DB)
    added = 0
    for luna, days in sorted(months.items()):
        for day in days:
            zi = day.get('zi')
            if zi is None:
                continue
            exists = conn.execute(
                "SELECT 1 FROM calendar WHERE an=? AND luna=? AND zi=?",
                (year, luna, zi),
            ).fetchone()
            if exists:
                continue

            comentarii = day.get('comentarii') or ''
            if isinstance(comentarii, list):
                comentarii = ' | '.join(str(c) for c in comentarii)

            conn.execute(
                """INSERT OR IGNORE INTO calendar
                   (an, luna, zi, zi_sapt, sfinti, tip, comentarii, duminica_titlu, duminica_subtitlu)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    year, luna, zi,
                    day.get('zi_sapt') or '',
                    day.get('sfinti') or '',
                    day.get('tip') or 'normal',
                    comentarii,
                    day.get('duminica_titlu') or '',
                    day.get('duminica_subtitlu') or '',
                ),
            )
            added += 1
            print(f"   [+] {year}-{luna:02d}-{zi:02d} ({day.get('zi_sapt')}) — "
                  f"{(day.get('sfinti') or '(fără sfinți)')[:60]}")

    conn.commit()

    total = conn.execute(
        "SELECT COUNT(*) FROM calendar WHERE an=?", (year,)
    ).fetchone()[0]
    maxes = conn.execute(
        "SELECT luna, COUNT(*) FROM calendar WHERE an=? GROUP BY luna ORDER BY luna",
        (year,),
    ).fetchall()
    conn.close()

    print(f"\n   adăugate: {added} zile | total {year}: {total}")
    print("   zile/lună: " + ", ".join(f"{l}:{c}" for l, c in maxes))
    return 0


if __name__ == '__main__':
    sys.exit(main())
