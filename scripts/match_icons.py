#!/usr/bin/env python3
"""
Potrivește zilele fără icoană (2026) cu produsele de pe sfinteleicoane.ro.

Indexul se construiește direct din paginile de categorie (pe luni), care conțin
URL-urile imaginilor de forma:
    https://www.sfinteleicoane.ro/<id_imagine>-thickbox_default/<slug>.jpg
Deci nu e nevoie să descarc paginile de produs.

Implicit: dry-run (listează potrivirile).
Cu --download: descarcă în public/images/sinaxar/NNLL.jpg (nu scrie în DB).
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'bible.db')
IMG = os.path.join(ROOT, 'public/images/sinaxar')
CACHE = '/tmp/icoane2'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

LUNI = {1: 'cat01p1', 2: 'cat02p1', 3: 'cat03p1', 4: 'cat04p1', 5: 'cat05p1', 6: 'cat06p1',
        7: 'cat07p1', 8: 'cat08p1', 9: 'cat09p1', 10: 'cat10p1', 11: 'cat11p1', 12: 'cat12p1'}

STOP = set("""sf sfantul sfanta sfintii cuv cuvios cuvioasa cuviosul mc mucenic mucenita mucenici
ier ierarh ierarhul ap apostol apostolul mare marea marii cel cea cei de la din al a si sau sotia
sotul fiul fiica parintele parintelui nostru preacuviosul preacuvioasa drept dreapta intai chemat
episcop arhiepiscop patriarh mitropolit preot diacon fecioara proroc prooroc eg egumen imparat
imparateasa domn domnul maica domnului hristos iisus celui cele""".split())


def norm(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def tokeni(nume):
    t = re.split(r'[^A-Za-zĂÂÎȘȚăâîșț0-9]+', nume)
    return [norm(x) for x in t if len(x) > 2 and norm(x) not in STOP]


def index_produse():
    """{slug: {'url':..., 'luna':..., 'img_id':...}} din paginile de categorie."""
    produse = {}
    for luna, base in LUNI.items():
        p = os.path.join(CACHE, base + '.html')
        if not os.path.exists(p):
            continue
        h = open(p, encoding='utf-8', errors='replace').read()
        for iid, slug in re.findall(
                r'https://www\.sfinteleicoane\.ro/(\d+)-thickbox_default/([a-z0-9\-]+)\.jpg', h):
            if slug not in produse:
                produse[slug] = {'luna': luna, 'img_id': iid,
                                 'url': f'https://www.sfinteleicoane.ro/{iid}-thickbox_default/{slug}.jpg'}
    return produse


def main():
    download = '--download' in sys.argv
    conn = sqlite3.connect(DB)
    rows = conn.execute("""
        SELECT c.luna, c.zi, c.sfinti FROM calendar c
        WHERE c.an=2026 AND NOT EXISTS (
            SELECT 1 FROM sinaxar s WHERE s.an=2026 AND s.luna=c.luna AND s.zi=c.zi
              AND COALESCE(s.img_local,'')<>'')
        ORDER BY c.luna, c.zi""").fetchall()

    produse = index_produse()
    print(f"   zile fără icoană: {len(rows)} | produse indexate: {len(produse)}")

    potriviri, lipsa = [], []
    for luna, zi, sfinti in rows:
        nume = re.split(r';', sfinti or '')[0]
        tok = tokeni(nume)
        if not tok:
            lipsa.append((luna, zi, nume.strip()[:60], 0, 0))
            continue
        principal = tok[0][:7]                    # numele sfântului, trunchiat (stem)
        best, score, strong = None, 0, False
        for slug, info in produse.items():
            if info['luna'] != luna:
                continue
            s = sum(1 for x in tok if x[:6] in slug)
            if s == 0:
                continue
            # preferăm potrivirile în care apare numele principal
            is_strong = principal in slug
            if (is_strong, s) > (strong, score):
                best, score, strong = (slug, info), s, is_strong
        if best and score >= max(1, (len(tok) + 1) // 2):
            potriviri.append((luna, zi, nume.strip(), best[0], best[1]['url'], score, len(tok)))
        else:
            lipsa.append((luna, zi, nume.strip()[:60], score, len(tok)))

    print(f"   potriviri: {len(potriviri)} | nepotrivite: {len(lipsa)}")
    print()
    for l, z, nume, slug, url, sc, tot in potriviri:
        print(f"   {l:02d}-{z:02d} [{sc}/{tot}] {nume[:36]:36s} -> {slug[:52]}")

    if lipsa:
        print()
        print("   ── fără potrivire ──")
        for l, z, nume, sc, tot in lipsa:
            print(f"   {l:02d}-{z:02d} [{sc}/{tot}] {nume}")

    if download and potriviri:
        print()
        print("   ── descarc ──")
        os.makedirs(IMG, exist_ok=True)
        ok = 0
        for l, z, nume, slug, url, _, _ in potriviri:
            dst = os.path.join(IMG, f"{l:02d}{z:02d}.jpg")
            subprocess.run(['curl', '-sL', '-A', UA, '--max-time', '60', '-o', dst, url], capture_output=True)
            size = os.path.getsize(dst) if os.path.exists(dst) else 0
            kind = subprocess.run(['file', '-b', dst], capture_output=True).stdout.decode().strip()
            if size > 15000 and 'image' in kind.lower():
                ok += 1
                print(f"      [+] {l:02d}{z:02d}.jpg  {size//1024} KB  {slug[:44]}")
            else:
                print(f"      [-] {l:02d}{z:02d} respins ({size} b) — {slug[:40]}")
                if os.path.exists(dst):
                    os.remove(dst)
        print(f"\n   descărcate: {ok}/{len(potriviri)}")

    json.dump([{'luna': l, 'zi': z, 'nume': n, 'slug': s, 'url': u}
               for l, z, n, s, u, _, _ in potriviri],
              open('/tmp/potriviri.json', 'w'), ensure_ascii=False, indent=1)
    print(f"   salvat: /tmp/potriviri.json")
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
