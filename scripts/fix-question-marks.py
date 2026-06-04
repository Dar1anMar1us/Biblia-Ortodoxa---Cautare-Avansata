#!/usr/bin/env python3
"""Fix orphan ? artifacts in verses and rebuild FTS index."""
import sqlite3
import re

conn = sqlite3.connect('/root/bible-api/bible.db')
conn.execute('PRAGMA journal_mode=WAL')
cur = conn.execute('SELECT id, carte_id, capitol, verset, text FROM versete')

count = 0
examples = []
total_checked = 0

for row in cur:
    total_checked += 1
    text = row[4]
    new_text = re.sub(r'(?<=[\s:;,!.\-])\?([A-ZĂÂÎȘȚăâîșț])', r'\1', text)
    new_text = re.sub(r'^\?([A-ZĂÂÎȘȚăâîșț])', r'\1', new_text)
    
    if new_text != text:
        count += 1
        conn.execute('UPDATE versete SET text = ? WHERE id = ?', (new_text, row[0]))
        if len(examples) < 5:
            examples.append({'id': row[0], 'cap': row[2], 'v': row[3], 
                           'before': text[:80], 'after': new_text[:80]})

# Rebuild FTS index
print('Rebuilding FTS5 index...')
conn.execute("INSERT INTO versete_fts(versete_fts) VALUES('rebuild')")
conn.commit()
conn.close()

print(f'Total verses checked: {total_checked}')
print(f'Total verses fixed: {count}')
print()
for ex in examples:
    print(f'  ID={ex["id"]} cap{ex["cap"]}:{ex["v"]}')
    print(f'    BEFORE: {ex["before"]}')
    print(f'    AFTER:  {ex["after"]}')
    print()
