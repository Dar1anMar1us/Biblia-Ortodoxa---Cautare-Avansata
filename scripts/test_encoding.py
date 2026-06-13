#!/usr/bin/env python3
"""Test robust encoding decode."""
import subprocess

result = subprocess.run(['curl', '-s', 'https://www.noutati-ortodoxe.ro/calendar-ortodox/sinaxar.php?date=1772323200'], capture_output=True, timeout=30)
raw = result.stdout

repl_char = '\ufffd'

# Approach 1: pure UTF-8 with replace
t1 = raw.decode('utf-8', errors='replace')
print('UTF-8 replace: has replacement char =', repl_char in t1)

# Approach 2: try UTF-8 strict, fallback to W1250 for bad bytes
def robust_decode(data):
    """UTF-8 with intelligent fallback: bad bytes treated as Windows-1250"""
    result = []
    i = 0
    while i < len(data):
        byte = data[i]
        if byte < 0x80:
            result.append(chr(byte))
            i += 1
        elif 0xC0 <= byte <= 0xDF:
            if i + 1 < len(data) and 0x80 <= data[i+1] <= 0xBF:
                result.append(chr(((byte & 0x1F) << 6) | (data[i+1] & 0x3F)))
                i += 2
            else:
                result.append(chr(byte))
                i += 1
        elif 0xE0 <= byte <= 0xEF:
            if i + 2 < len(data) and 0x80 <= data[i+1] <= 0xBF and 0x80 <= data[i+2] <= 0xBF:
                result.append(chr(((byte & 0x0F) << 12) | ((data[i+1] & 0x3F) << 6) | (data[i+2] & 0x3F)))
                i += 3
            else:
                result.append(chr(byte))
                i += 1
        else:
            result.append(chr(byte))
            i += 1
    return ''.join(result)

t2 = robust_decode(raw)
print('Robust decode: has replacement char =', repl_char in t2)
has_romanian = any(c in t2 for c in ['\u0103', '\u00e2', '\u00ee', '\u0219', '\u021b'])
print('Has Romanian chars:', has_romanian)

# Check a snippet around "aceast"
start = t2.find('aceast')
if start > 0:
    print('Snippet:', t2[max(0,start-20):start+100])

# Approach 3: pure Windows-1250
t3 = raw.decode('windows-1250', errors='replace')
has_romanian3 = any(c in t3 for c in ['\u0103', '\u00e2', '\u00ee', '\u0219', '\u021b'])
print('Windows-1250: has Romanian chars =', has_romanian3)
print('W1250 snippet:', t3[max(0,start-20):start+100])
print('W1250 has replacement char =', repl_char in t3)
