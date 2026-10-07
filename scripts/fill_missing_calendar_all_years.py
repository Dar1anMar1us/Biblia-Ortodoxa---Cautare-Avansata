#!/usr/bin/env python3
"""
Completează zilele lipsă din tabela `calendar` pentru toți anii, folosind
rândurile complete din anul de referință (2026).

De ce e sigur: sărbătorile din tabela `calendar` sunt fixe (sfinții aceleiași
date calendaristice se repetă identic în fiecare an; sărbătorile mobile stau în
câmpurile `duminica_*`, care sunt goale). Deci:
  - `sfinti`  -> copiat din anul de referință pentru aceeași (luna, zi)
  - `zi_sapt` -> RECALCULAT pentru anul țintă (o literă: L/M/J/V/S/D, Miercuri='M')
  - `tip`     -> 'sarbatoare' dacă e duminică în anul țintă, altfel se păstrează
                 'sarbatoare' doar pentru sărbătorile fixe mari (marcate cu † în
                 anul de referință și care NU erau duminici acolo)

Utilizare:
    python3 scripts/fill_missing_calendar_all_years.py            # 2025-2037
    python3 scripts/fill_missing_calendar_all_years.py 2027 2030  # doar anii dați
"""
import calendar as cal
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'bible.db')
REF = 2026                     # anul complet, folosit ca referință
LITERE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']   # Luni..Duminică (Miercuri = 'M')


def main():
    ani = [int(a) for a in sys.argv[1:]] or list(range(2025, 2038))
    conn = sqlite3.connect(DB)

    ref = {}
    for luna, zi, sfinti, tip, zs in conn.execute(
        "SELECT luna, zi, sfinti, tip, zi_sapt FROM calendar WHERE an=?", (REF,)
    ):
        ref[(luna, zi)] = (sfinti, tip, zs)

    total_added = 0
    for an in ani:
        if an == REF:
            continue
        added = 0
        for luna in range(1, 13):
            dim = cal.monthrange(an, luna)[1]
            for zi in range(1, dim + 1):
                exists = conn.execute(
                    "SELECT 1 FROM calendar WHERE an=? AND luna=? AND zi=?",
                    (an, luna, zi),
                ).fetchone()
                if exists:
                    continue

                sursa = ref.get((luna, zi))
                if not sursa:
                    print(f"   [!] {an}-{luna:02d}-{zi:02d}: nu am referință, sar")
                    continue
                sfinti, tip_ref, zs_ref = sursa

                zi_sapt = LITERE[cal.weekday(an, luna, zi)]
                e_duminica = zi_sapt == 'D'
                # sărbătoare: duminica în anul țintă SAU sărbătoare fixă mare
                # (în 2026 era 'sarbatoare', dar NU duminică, deci e fixă)
                if e_duminica:
                    tip = 'sarbatoare'
                elif tip_ref == 'sarbatoare' and zs_ref != 'D':
                    tip = 'sarbatoare'
                else:
                    tip = 'normal'

                conn.execute(
                    """INSERT INTO calendar
                       (an, luna, zi, zi_sapt, sfinti, tip, comentarii, duminica_titlu, duminica_subtitlu)
                       VALUES (?, ?, ?, ?, ?, ?, '', '', '')""",
                    (an, luna, zi, zi_sapt, sfinti, tip),
                )
                added += 1
                total_added += 1
        conn.commit()
        rows = dict(conn.execute(
            "SELECT luna, COUNT(*) FROM calendar WHERE an=? GROUP BY luna", (an,)
        ))
        ok = all(rows.get(l) == cal.monthrange(an, l)[1] for l in range(1, 13))
        print(f"   {an}: +{added} zile -> {sum(rows.values())} zile {'✓' if ok else '✗ INCOMPLET'}")

    print(f"\n   total adăugate: {total_added}")
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
