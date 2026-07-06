#!/usr/bin/env python3
"""
fix-separators.py
Limpia los separadores de sección rotos ('â”€') que quedaron en archivos
donde el script anterior solo corrigió las vocales con tilde.

Los separadores Unicode ─ (U+2500) cuando se guardan mal como Latin-1
producen la secuencia 'â\u0080\u0094' (E2 94 80 reinterpretado).
"""
import re
import sys
from pathlib import Path


def fix(path: Path) -> int:
    text = path.read_text(encoding='utf-8-sig')

    # Patrón: 'â' seguido de 2+ chars Latin-1 (rango 0x80-0xFF) → ─
    # Esto captura 'â”€' (= ─) y secuencias largas como 'â”€â”€â”€'
    new_text, n = re.subn(r'â[\u0080-\u00ff]{2,}', '─', text)

    if n == 0:
        print(f"Sin separadores rotos en: {path}")
        return 0

    bak = path.with_suffix(path.suffix + '.sep.bak')
    if not bak.exists():
        bak.write_text(text, encoding='utf-8-sig')
    path.write_text(new_text, encoding='utf-8-sig')

    print(f"OK: {path} ({n} secuencias de separadores corregidas, backup en {bak})")
    return n


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        fix(Path(arg))