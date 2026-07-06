#!/usr/bin/env python3
"""
fix-encoding-double.py
Corrige doble mojibake en archivos UTF-8 con BOM.

Caso: el archivo fue UTF-8 → reinterpretado como Latin-1 → guardado como UTF-8.
Los caracteres como "ó" se ven como "Ã³" en pantalla y los bytes en disco
son la secuencia UTF-8 de "Ã" + "³" (C3 83 + C2 B3).

Uso:
  python scripts/fix-encoding-double.py <archivo>
"""

import sys
from pathlib import Path


# Mapa: clave (mojibake doble) -> carácter correcto
# Las claves son strings que en disco aparecen literalmente como mojibake doble
REPLACEMENTS = {
    'Ã³': 'ó',
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã­': 'í',
    'Ãº': 'ú',
    'Ã±': 'ñ',
    'Ã ': 'à',
    'Ã¨': 'è',
    'Ã¬': 'ì',
    'Ã²': 'ò',
    'Ã¹': 'ù',
    'Ã¤': 'ä',
    'Ã«': 'ë',
    'Ã¯': 'ï',
    'Ã¶': 'ö',
    'Ã¼': 'ü',
    'Ã§': 'ç',
    'â‚¬': '€',
    'â€“': '–',
    'â€”': '—',
    'â€™': "'",
    'â€œ': '"',
    'â€\x9d': '"',
    'â€¦': '…',
    'â†’': '→',
}


def fix_file(path: Path) -> dict:
    """Lee, corrige y reescribe el archivo. Devuelve dict con conteos."""
    if not path.exists():
        print(f"Archivo no encontrado: {path}", file=sys.stderr)
        sys.exit(1)

    # Leer como UTF-8 (BOM se ignora automáticamente en Python)
    text = path.read_text(encoding='utf-8')

    # Backup
    bak = path.with_suffix(path.suffix + '.bak')
    if not bak.exists():
        bak.write_text(text, encoding='utf-8')

    original = text
    counts = {}
    for bad, good in REPLACEMENTS.items():
        if bad in text:
            count = text.count(bad)
            text = text.replace(bad, good)
            counts[bad] = count

    # Separadores de sección rotos: "â”€" secuencias
    # Después de los reemplazos anteriores, si quedó basura similar, la matamos
    import re
    # Patrón: â seguido de bytes Latin-1 que forman separadores rotos
    # Suele verse como "â”€â”€â”€" para "───"
    text = re.sub(r'â[\x80-\xff]+', '─', text)

    if text == original:
        print(f"Sin cambios: {path}")
        return {}

    # Re-guardar como UTF-8 con BOM (consistente con el archivo original)
    path.write_text(text, encoding='utf-8-sig')

    print(f"OK: {path} corregido (backup en {bak})")
    print("Reemplazos aplicados:")
    for bad, count in counts.items():
        print(f"  '{bad}' -> '{REPLACEMENTS[bad]}' : {count} veces")
    return counts


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python fix-encoding-double.py <archivo>")
        sys.exit(1)
    fix_file(Path(sys.argv[1]))