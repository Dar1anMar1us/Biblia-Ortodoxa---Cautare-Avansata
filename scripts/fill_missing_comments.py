#!/usr/bin/env python3
"""
Completează DOAR câmpul `comentarii` (marcaje de post/dezlegare/nunți) pentru
zilele care există deja în tabela `calendar`, folosind paginile anuale
noutati-ortodoxe.ro.

GARANȚII (spre deosebire de parse_calendar.py):
  - NU face DROP TABLE, NU șterge, NU inserează rânduri noi
  - NU atinge `sfinti`, `zi_sapt`, `tip`, `duminica_*`
  - scrie DOAR unde `comentarii` este gol ('') și doar dacă sursa are valoare
  - implicit rulează în dry-run; scrie efectiv doar cu --apply

Utilizare:
    python3 scripts/fill_missing_comments.py            # dry-run (nu scrie)
    python3 scripts/fill_missing_comments.py --apply    # scrie
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from parse_calendar import download_calendar, parse_calendar_page  # noqa: E402

DB = os.path.join(ROOT, 'bible.db')
ANI = list(range(2025, 2038))


def main():
    apply = '--apply' in sys.argv
    conn = sqlite3.connect(DB)
    total_fill = 0

    for an in ANI:
        html = download_calendar(an)
        if not html:
            print(f"   {an}: [!] nu am putut descărca pagina")
            continue
        months = parse_calendar_page(html, an)
        if not months:
            print(f"   {an}: [!] parserul nu a întors date")
            continue

        cand = []
        for luna, days in months.items():
            for d in days:
                zi = d.get('zi')
                if not zi:
                    continue
                c = d.get('comentarii') or ''
                if isinstance(c, list):
                    c = ' | '.join(str(x) for x in c)
                c = c.strip()
                if not c:
                    continue
                cand.append((luna, zi, c))

        filled = 0
        for luna, zi, c in cand:
            row = conn.execute(
                "SELECT comentarii FROM calendar WHERE an=? AND luna=? AND zi=?",
                (an, luna, zi),
            ).fetchone()
            if row is None:
                continue                      # ziua nu există la noi -> nu creăm nimic
            if (row[0] or '').strip():
                continue                      # are deja comentariu -> nu suprascriem
            filled += 1
            total_fill += 1
            if apply:
                conn.execute(
                    "UPDATE calendar SET comentarii=? WHERE an=? AND luna=? AND zi=?",
                    (c, an, luna, zi),
                )
            if filled <= 3:
                print(f"      {'✓' if apply else '·'} {an}-{luna:02d}-{zi:02d} <- {c[:55]}")

        if apply:
            conn.commit()
        print(f"   {an}: sursa are {len(cand)} zile cu marcaje, {filled} completabile la noi")

    if apply:
        conn.commit()
    print(f"\n   total completate: {total_fill}" + ("" if apply else "  (DRY-RUN — nimic scris)"))
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
