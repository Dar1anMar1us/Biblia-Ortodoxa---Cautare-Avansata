#!/usr/bin/env python3
"""
Parser corect pentru noutati-ortodoxe.ro/calendar-ortodox/?year=<an> + completarea
câmpurilor lipsă din tabela `calendar`.

DE CE: parserul vechi (parse_calendar.py) rata zile (ultima zi din multe luni) și
NU lua deloc titlurile de duminică. Structura reală a paginii:
    <div class="nume_luna"><a name="luna11">noiembrie</a> (30 zile)</div>
    <tr class="normal|sarbatoare|sarbatoare saptamana|duminica">
        <td class="ziua">30
        <td class="sapt">L
        <td><a class="sinaxar" href="...">SFINȚII ZILEI</a>
        <span class="comentariu">(Post. Nu se fac nunți)</span>
        <span class="title">Titlul Duminicii</span>        (doar duminici)
        <span class="subtitle">Evanghelia</span>           (doar duminici)
    (rândurile NU se închid cu </tr> — se separă prin '<tr class=')

Scrie DOAR acolo unde câmpul nostru e gol; nu șterge, nu inserează rânduri,
nu atinge `sfinti`. Dry-run implicit; scrie cu --apply.
"""
import html as H
import os
import re
import sqlite3
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'bible.db')
ANI = list(range(2025, 2038))

RE_LUNA = re.compile(r'<a name="luna(\d{1,2})"')
RE_ROW = re.compile(r'<tr class="([^"]*)"(.*?)(?=<tr class=|</table>)', re.S)
RE_ZIUA = re.compile(r'<td class="ziua">\s*(\d{1,2})')
RE_SAPT = re.compile(r'<td class="sapt">\s*([^\s<]{1,4})')
RE_SINAXAR = re.compile(r'<a class="sinaxar"[^>]*>(.*?)</a>', re.S)
RE_COMENT = re.compile(r'<span class="comentariu">(.*?)</span>', re.S)
RE_TITLE = re.compile(r'<span class="title">(.*?)</span>', re.S)
RE_SUBTITLE = re.compile(r'<span class="subtitle">(.*?)</span>', re.S)


def curata(t):
    t = re.sub(r'(?is)<br\s*/?>', ' ', t)
    t = H.unescape(re.sub(r'<[^>]+>', '', t))
    return re.sub(r'\s+', ' ', t).strip()


def descarca(an):
    url = f"https://www.noutati-ortodoxe.ro/calendar-ortodox/?year={an}"
    r = subprocess.run(['curl', '-s', '-L', '--max-time', '40', url], capture_output=True)
    return r.stdout.decode('utf-8', 'replace') if r.stdout else ''


def parseaza(h):
    """-> {(luna, zi): {'sfinti':..., 'comentarii':..., 'title':..., 'subtitle':..., 'tip':...}}"""
    out = {}
    # împart pe luni, folosind ancorele <a name="lunaN">
    parti = list(RE_LUNA.finditer(h))
    for idx, m in enumerate(parti):
        luna = int(m.group(1))
        start = m.end()
        end = parti[idx + 1].start() if idx + 1 < len(parti) else len(h)
        seg = h[start:end]
        ultimul = None
        for rm in RE_ROW.finditer(seg):
            cls, body = rm.group(1), rm.group(2)
            zm = RE_ZIUA.search(body)
            if not zm:
                # rând de duminică (fără celulă de zi): titlul + Evanghelia
                # aparțin zilei precedente (rândul <tr class="duminica"> o urmează)
                if 'duminica' in cls and ultimul is not None and (luna, ultimul) in out:
                    ti = RE_TITLE.search(body)
                    su = RE_SUBTITLE.search(body)
                    if ti:
                        out[(luna, ultimul)]['title'] = curata(ti.group(1))
                    if su:
                        # tot textul de după span (epistola, evanghelia, glasul)
                        rest = body[su.end():]
                        out[(luna, ultimul)]['subtitle'] = curata(su.group(1) + ' ' + rest)
                continue
            zi = int(zm.group(1))
            ultimul = zi
            sm = RE_SAPT.search(body)
            sx = RE_SINAXAR.search(body)
            coms = [curata(c) for c in RE_COMENT.findall(body)]
            ti = RE_TITLE.search(body)
            su = RE_SUBTITLE.search(body)
            out[(luna, zi)] = {
                'sfinti': curata(sx.group(1)) if sx else '',
                'comentarii': '; '.join(c for c in coms if c),
                'title': curata(ti.group(1)) if ti else '',
                'subtitle': curata(su.group(1)) if su else '',
                'tip': 'sarbatoare' if 'sarbatoare' in cls else ('duminica' if 'duminica' in cls else 'normal'),
                'zi_sapt': curata(sm.group(1)) if sm else '',
            }
    return out


def main():
    apply = '--apply' in sys.argv
    conn = sqlite3.connect(DB)
    tot_com = tot_dum = 0

    for an in ANI:
        h = descarca(an)
        if not h:
            print(f"   {an}: [!] descărcare eșuată")
            continue
        date = parseaza(h)
        zile = len(date)
        n_com = n_dum = 0
        for (luna, zi), d in date.items():
            row = conn.execute(
                "SELECT comentarii, duminica_titlu, duminica_subtitlu FROM calendar WHERE an=? AND luna=? AND zi=?",
                (an, luna, zi)).fetchone()
            if row is None:
                continue                       # ziua nu există la noi -> nu creăm
            com, dt, ds = row
            sets, vals = [], []
            if not (com or '').strip() and d['comentarii']:
                sets.append("comentarii=?"); vals.append(d['comentarii']); n_com += 1
            if not (dt or '').strip() and d['title']:
                sets.append("duminica_titlu=?"); vals.append(d['title']); n_dum += 1
            if not (ds or '').strip() and d['subtitle']:
                sets.append("duminica_subtitlu=?"); vals.append(d['subtitle'])
            if not sets:
                continue
            if apply:
                conn.execute(f"UPDATE calendar SET {', '.join(sets)} WHERE an=? AND luna=? AND zi=?",
                             (*vals, an, luna, zi))
        if apply:
            conn.commit()
        tot_com += n_com; tot_dum += n_dum
        print(f"   {an}: sursa are {zile} zile | completabile: {n_com} marcaje, {n_dum} titluri de duminică")

    if apply:
        conn.commit()
    print(f"\n   TOTAL: {tot_com} marcaje + {tot_dum} titluri de duminică"
          + ("" if apply else "   (DRY-RUN — nimic scris)"))
    conn.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
