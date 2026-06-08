/**
 * Siluetas laterales de vehículos (vista de perfil).
 *
 * Cada SVG está dibujado con la CABEZA del carro apuntando
 * hacia la IZQUIERDA (heading 270° / oeste). El módulo
 * `utils/heading.ts` se encarga de calcular la rotación CSS
 * necesaria para que la cabeza apunte a la dirección de la
 * ruta activa.
 *
 * Estos assets reemplazan la dependencia de archivos en
 * `/public/cars/` y se distribuyen como data URIs listos
 * para usarse como `src` de un `<img>`.
 */

const buildSvg = (svg: string): string => {
  // quita saltos de línea y comillas dobles innecesarias para
  // mantener la data URI compacta
  const compact = svg.replace(/\n\s*/g, ' ').trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`;
};

const white = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#f8fafc" stroke="#0f172a" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#bae6fd" opacity="0.85" stroke="#0f172a" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#0f172a" stroke-width="0.4" opacity="0.5"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#f1f5f9" stroke="#0f172a" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#0f172a" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#0f172a" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#0f172a"/><circle cx="30" cy="46" r="4" fill="#64748b"/><circle cx="30" cy="46" r="1.5" fill="#0f172a"/>
  <circle cx="90" cy="46" r="8" fill="#0f172a"/><circle cx="90" cy="46" r="4" fill="#64748b"/><circle cx="90" cy="46" r="1.5" fill="#0f172a"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#0f172a" opacity="0.5"/>
</svg>`;

const black = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#1e293b" stroke="#020617" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#0f172a" stroke="#020617" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#475569" opacity="0.85" stroke="#020617" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#020617" stroke-width="0.4" opacity="0.7"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#1e293b" stroke="#020617" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#020617" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#020617" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#020617"/><circle cx="30" cy="46" r="4" fill="#475569"/><circle cx="30" cy="46" r="1.5" fill="#020617"/>
  <circle cx="90" cy="46" r="8" fill="#020617"/><circle cx="90" cy="46" r="4" fill="#475569"/><circle cx="90" cy="46" r="1.5" fill="#020617"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#475569" opacity="0.7"/>
</svg>`;

const gray = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#94a3b8" stroke="#1e293b" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#64748b" stroke="#1e293b" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#cbd5e1" opacity="0.85" stroke="#1e293b" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#1e293b" stroke-width="0.4" opacity="0.5"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#94a3b8" stroke="#1e293b" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#1e293b" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#1e293b" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#1e293b"/><circle cx="30" cy="46" r="4" fill="#475569"/><circle cx="30" cy="46" r="1.5" fill="#1e293b"/>
  <circle cx="90" cy="46" r="8" fill="#1e293b"/><circle cx="90" cy="46" r="4" fill="#475569"/><circle cx="90" cy="46" r="1.5" fill="#1e293b"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#1e293b" opacity="0.5"/>
</svg>`;

const blue = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#1d4ed8" stroke="#0c1f5c" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#1e40af" stroke="#0c1f5c" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#bfdbfe" opacity="0.85" stroke="#0c1f5c" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#0c1f5c" stroke-width="0.4" opacity="0.5"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#1d4ed8" stroke="#0c1f5c" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#0c1f5c" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#0c1f5c" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#0c1f5c"/><circle cx="30" cy="46" r="4" fill="#475569"/><circle cx="30" cy="46" r="1.5" fill="#0c1f5c"/>
  <circle cx="90" cy="46" r="8" fill="#0c1f5c"/><circle cx="90" cy="46" r="4" fill="#475569"/><circle cx="90" cy="46" r="1.5" fill="#0c1f5c"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#0c1f5c" opacity="0.5"/>
</svg>`;

const red = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#b91c1c" stroke="#450a0a" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#991b1b" stroke="#450a0a" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#fecaca" opacity="0.85" stroke="#450a0a" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#450a0a" stroke-width="0.4" opacity="0.5"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#b91c1c" stroke="#450a0a" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#450a0a" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#fbbf24" stroke="#450a0a" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#450a0a"/><circle cx="30" cy="46" r="4" fill="#475569"/><circle cx="30" cy="46" r="1.5" fill="#450a0a"/>
  <circle cx="90" cy="46" r="8" fill="#450a0a"/><circle cx="90" cy="46" r="4" fill="#475569"/><circle cx="90" cy="46" r="1.5" fill="#450a0a"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#450a0a" opacity="0.5"/>
</svg>`;

const silver = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#cbd5e1" stroke="#334155" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#94a3b8" stroke="#334155" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#e0f2fe" opacity="0.85" stroke="#334155" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#334155" stroke-width="0.4" opacity="0.5"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#cbd5e1" stroke="#334155" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#334155" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#334155" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#334155"/><circle cx="30" cy="46" r="4" fill="#475569"/><circle cx="30" cy="46" r="1.5" fill="#334155"/>
  <circle cx="90" cy="46" r="8" fill="#334155"/><circle cx="90" cy="46" r="4" fill="#475569"/><circle cx="90" cy="46" r="1.5" fill="#334155"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#334155" opacity="0.5"/>
</svg>`;

const dark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#18181b" stroke="#000" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#27272a" stroke="#000" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#52525b" opacity="0.85" stroke="#000" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#000" stroke-width="0.4" opacity="0.7"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#18181b" stroke="#000" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#000" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#000" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#000"/><circle cx="30" cy="46" r="4" fill="#52525b"/><circle cx="30" cy="46" r="1.5" fill="#000"/>
  <circle cx="90" cy="46" r="8" fill="#000"/><circle cx="90" cy="46" r="4" fill="#52525b"/><circle cx="90" cy="46" r="1.5" fill="#000"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#52525b" opacity="0.7"/>
</svg>`;

const green = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <ellipse cx="60" cy="56" rx="48" ry="2.5" fill="#000" opacity="0.25"/>
  <path d="M 8 38 L 8 46 L 112 46 L 112 38 L 108 30 L 88 26 L 36 26 L 16 30 Z" fill="#15803d" stroke="#052e16" stroke-width="0.8"/>
  <path d="M 36 26 L 40 14 L 70 14 L 78 26 Z" fill="#166534" stroke="#052e16" stroke-width="0.8"/>
  <path d="M 42 16 L 68 16 L 74 25 L 40 25 Z" fill="#bbf7d0" opacity="0.85" stroke="#052e16" stroke-width="0.5"/>
  <line x1="58" y1="14.5" x2="58" y2="38" stroke="#052e16" stroke-width="0.4" opacity="0.5"/>
  <path d="M 78 26 L 112 30 L 112 38 L 78 38 Z" fill="#15803d" stroke="#052e16" stroke-width="0.6"/>
  <circle cx="10" cy="34" r="2.2" fill="#fef9c3" stroke="#052e16" stroke-width="0.4"/>
  <rect x="108" y="33" width="3" height="4" rx="0.5" fill="#dc2626" stroke="#052e16" stroke-width="0.3"/>
  <circle cx="30" cy="46" r="8" fill="#052e16"/><circle cx="30" cy="46" r="4" fill="#475569"/><circle cx="30" cy="46" r="1.5" fill="#052e16"/>
  <circle cx="90" cy="46" r="8" fill="#052e16"/><circle cx="90" cy="46" r="4" fill="#475569"/><circle cx="90" cy="46" r="1.5" fill="#052e16"/>
  <rect x="50" y="20" width="5" height="1.2" rx="0.4" fill="#052e16" opacity="0.5"/>
</svg>`;

export const CAR_SILHOUETTES: Record<string, string> = {
  white:  buildSvg(white),
  black:  buildSvg(black),
  gray:   buildSvg(gray),
  blue:   buildSvg(blue),
  red:    buildSvg(red),
  silver: buildSvg(silver),
  dark:   buildSvg(dark),
  green:  buildSvg(green),
};

/** Normaliza el `color` del carro a una key de la paleta de siluetas. */
export const silhouetteForColor = (color: string | undefined): string | null => {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('blanco')) return CAR_SILHOUETTES.white;
  if (c.includes('negro'))  return CAR_SILHOUETTES.black;
  if (c.includes('gris'))   return CAR_SILHOUETTES.gray;
  if (c.includes('azul'))   return CAR_SILHOUETTES.blue;
  if (c.includes('rojo'))   return CAR_SILHOUETTES.red;
  if (c.includes('plata') || c.includes('plateado') || c.includes('silver'))
    return CAR_SILHOUETTES.silver;
  if (c.includes('verde'))  return CAR_SILHOUETTES.green;
  return CAR_SILHOUETTES.silver;
};
