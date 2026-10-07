#!/usr/bin/env python3
"""Completează sinaxarul pentru zilele cu text gol.

Reguli (cerute de DMC):
- dacă ziua are deja imagine  -> păstrăm imaginea, adăugăm DOAR textul (dacă îl găsim)
- dacă nu are nici imagine, nici text -> aducem amândouă
- sursă primară: noutati-ortodoxe.ro (via fetch_sinaxar); alternativele se adaugă separat
"""
import os
import sqlite3
import sys

sys.path.insert(0, '/root/bible-api/scripts')
from fetch_sinaxar import fetch_sinaxar, download_image  # noqa: E402

DB = '/root/bible-api/bible.db'

conn = sqlite3.connect(DB)
rows = conn.execute("""
    SELECT an, luna, zi, COALESCE(img_local,'')
    FROM sinaxar
    WHERE an = 2026 AND (text IS NULL OR TRIM(text) = '')
    ORDER BY luna, zi
""").fetchall()

print("   de completat: %d zile" % len(rows))
texts, imgs, fails = 0, 0, []

for an, luna, zi, img_local in rows:
    title, text, img_url = fetch_sinaxar(an, luna, zi)
    sets, vals, note = [], [], []

    if text and len(text.strip()) > 80:
        sets.append("text=?")
        vals.append(text.strip())
        texts += 1
        note.append("text %d car." % len(text.strip()))

    if not img_local.strip() and img_url:
        local = download_image(img_url, "%02d%02d" % (luna, zi))
        if local:
            sets.append("img_local=?")
            vals.append(local)
            sets.append("img_original=?")
            vals.append(img_url)
            imgs += 1
            note.append("+ imagine")

    if sets:
        vals += [an, luna, zi]
        conn.execute("UPDATE sinaxar SET %s WHERE an=? AND luna=? AND zi=?" % ", ".join(sets), vals)
        print("   %02d/%02d: %s" % (luna, zi, ", ".join(note)))
    else:
        fails.append("%02d/%02d" % (luna, zi))
        print("   %02d/%02d: ✗ nimic găsit la sursa primară" % (luna, zi))

conn.commit()

print()
print("   --- rezumat ---")
print("   texte adăugate:   %d" % texts)
print("   imagini adăugate: %d" % imgs)
print("   rămase fără date: %d %s" % (len(fails), ("(" + ", ".join(fails) + ")") if fails else ""))

# verificare finală
left = conn.execute("""
    SELECT COUNT(*) FROM sinaxar WHERE an = 2026 AND (text IS NULL OR TRIM(text) = '')
""").fetchone()[0]
noimg = conn.execute("""
    SELECT COUNT(*) FROM sinaxar WHERE an = 2026 AND (img_local IS NULL OR TRIM(img_local) = '')
""").fetchone()[0]
print("   în DB acum: text gol = %d | fără imagine = %d" % (left, noimg))
conn.close()
