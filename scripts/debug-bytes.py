#!/usr/bin/env python3
"""Debug bytes del archivo."""
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = path.read_bytes()
needle = 'â”€'.encode('utf-8')
print(f'Bytes UTF-8 de "â”€": {needle!r}')
print(f'Conteo en archivo: {data.count(needle)}')

import re
matches = re.findall(b'\xc3\xa2[\x80-\xff]+', data)
print(f'Patrones â+X encontrados: {len(matches)}')
if matches[:3]:
    for m in matches[:3]:
        print(f'  bytes: {m[:10]!r}')