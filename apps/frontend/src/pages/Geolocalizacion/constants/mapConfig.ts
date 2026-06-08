export const MAP_CONFIG = {
  defaultCenter: [34.0522, -118.2437] as [number, number], // LA
  defaultZoom: 11,
  minZoom: 3,
  maxZoom: 19,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileUrlDark:
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

/** Devuelve el tile URL correspondiente al tema activo. */
export const tileUrlForTheme = (dark: boolean): string =>
  dark ? MAP_CONFIG.tileUrlDark : MAP_CONFIG.tileUrl;
