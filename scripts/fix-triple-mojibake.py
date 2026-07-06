#!/usr/bin/env python3
"""
fix-triple-mojibake.py
El archivo fue UTF-8 → Latin-1 → UTF-8 → Latin-1 → UTF-8 (triple).
Los separadores ─ (E2 94 80) se ven como la secuencia de bytes
C3 A2 E2 80 9D E2 82 AC cuando se interpretan así.

Patrón objetivo: C3 A2 E2 80 9D E2 82 AC → ─ (E2 94 80)
"""
import sys
from pathlib import Path


def fix(path: Path) -> int:
    data = path.read_bytes()

    # El byte sequence del mojibake triple del separador ─
    # Encontrado con debug: b'\xc3\xa2\xe2\x80\x9d\xe2\x82\xac'
    triple = b'\xc3\xa2\xe2\x80\x9d\xe2\x82\xac'
    replacement = '\u2500'.encode('utf-8')  # ─

    count = data.count(triple)
    if count == 0:
        print(f"Sin triple mojibake en: {path}")
        return 0

    new_data = data.replace(triple, replacement)

    bak = path.with_suffix(path.suffix + '.triple.bak')
    if not bak.exists():
        bak.write_bytes(data)
    path.write_bytes(new_data)

    print(f"OK: {path} ({count} secuencias corregidas, backup en {bak})")
    return count


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        fix(Path(arg))