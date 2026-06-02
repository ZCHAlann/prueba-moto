// src/components/ui/map/LocationPicker.tsx
import { useCallback, useEffect, useRef, useState } from "react";

type LocationResult = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  value: string;
  onChange: (result: LocationResult) => void;
  placeholder?: string;
  className?: string;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

async function searchNominatim(query: string): Promise<NominatimResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "es", "User-Agent": "gentrack/1.0" },
  });
  if (!res.ok) throw new Error("Nominatim error");
  return res.json();
}

const inputCls =
  "w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors";

function IconLocation({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  );
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

// ── Mini-mapa ─────────────────────────────────────────────────────────────────
function MiniMap({
  selected,
  onMapClick,
}: {
  selected: { lat: number; lng: number; label: string } | null;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markerRef    = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    import("leaflet").then((L) => {
      const map = L.map(containerRef.current!, {
        center: [-2.1894, -79.8891],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });

      const dark = document.documentElement.classList.contains("dark");
      L.tileLayer(
        dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19 }
      ).addTo(map);

      map.on("click", (e: any) => { onMapClick(e.latlng.lat, e.latlng.lng); });
      mapRef.current = map;
    });
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker on selection change
  useEffect(() => {
    if (!mapRef.current || !selected) return;
    import("leaflet").then((L) => {
      markerRef.current?.remove();
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:26px;height:26px;border-radius:50%;
          background:#6366f1;border:3px solid white;
          box-shadow:0 2px 10px rgba(99,102,241,.5);
        "></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      markerRef.current = L.marker([selected.lat, selected.lng], { icon }).addTo(mapRef.current);
      mapRef.current.flyTo([selected.lat, selected.lng], 16, { duration: 0.6 });
    });
  }, [selected]);

  return (
    <div className="location-picker-minimap">
      {/* Scope Leaflet z-indices inside the mini-map so they don't escape */}
      <style>{`
        .location-picker-minimap .leaflet-pane         { z-index: 1 !important; }
        .location-picker-minimap .leaflet-tile-pane    { z-index: 1 !important; }
        .location-picker-minimap .leaflet-overlay-pane { z-index: 2 !important; }
        .location-picker-minimap .leaflet-marker-pane  { z-index: 4 !important; }
        .location-picker-minimap .leaflet-popup-pane   { z-index: 6 !important; }
        .location-picker-minimap .leaflet-control      { z-index: 7 !important; }
        .location-picker-minimap .leaflet-top,
        .location-picker-minimap .leaflet-bottom       { z-index: 7 !important; }
      `}</style>
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.06]"
        style={{ height: 220 }}
      />
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
export function LocationPickerModal({ value, onChange, placeholder, className }: Props) {
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<NominatimResult[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [confirmed, setConfirmed] = useState(!!value);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  function openModal() {
    setQuery("");
    setResults([]);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    try   { const data = await searchNominatim(q); setResults(data); }
    catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 420);
  }

  function handleSelect(item: NominatimResult) {
    setSelected({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), label: item.display_name });
    setQuery(item.display_name);
    setResults([]);
  }

  function handleMapClick(lat: number, lng: number) {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
      headers: { "Accept-Language": "es", "User-Agent": "gentrack/1.0" },
    })
      .then((r) => r.json())
      .then((d) => {
        const label = d.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setSelected({ lat, lng, label });
        setQuery(label);
        setResults([]);
      })
      .catch(() => {
        setSelected({ lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
      });
  }

  function handleConfirm() {
    if (!selected) return;
    onChange({ address: selected.label, latitude: selected.lat, longitude: selected.lng });
    setConfirmed(true);
    setOpen(false);
  }

  function handleClear() {
    setConfirmed(false);
    setSelected(null);
    onChange({ address: "", latitude: 0, longitude: 0 });
  }

  return (
    <div className={className}>
      {/* Trigger */}
      <button
        type="button"
        onClick={openModal}
        className={`${inputCls} flex items-center gap-2 text-left cursor-pointer`}
      >
        <IconLocation className={`h-4 w-4 shrink-0 ${confirmed ? "text-brand-500 dark:text-brand-400" : "text-gray-400 dark:text-gray-500"}`} />
        <span className={`flex-1 truncate ${value ? "text-gray-800 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
          {value || (placeholder ?? "Busca la dirección…")}
        </span>
        {value && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <IconClose className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {confirmed && value && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          <p className="text-[11px] text-brand-600 dark:text-brand-400">Coordenadas guardadas correctamente</p>
        </div>
      )}

      {/* Modal — z-[70] puts it above the parent modal (z-50) */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-4 py-3.5">
              <div className="flex items-center gap-2">
                <IconLocation className="h-4 w-4 text-brand-500 dark:text-brand-400" />
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">Seleccionar ubicación</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-200 dark:border-white/[0.06] p-1.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              {/* search input */}
              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                  {loading
                    ? <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    : <IconSearch className="h-4 w-4 text-gray-400" />
                  }
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInput}
                  placeholder="Busca una dirección o haz clic en el mapa…"
                  className={`${inputCls} pl-9`}
                  autoComplete="off"
                />
              </div>

              {/* results */}
              {results.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden divide-y divide-gray-100 dark:divide-white/[0.04] max-h-36 overflow-y-auto">
                  {results.map((item) => (
                    <button
                      key={item.place_id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <IconLocation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-2">
                        {item.display_name}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* mini map */}
              <MiniMap selected={selected} onMapClick={handleMapClick} />

              <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                También puedes hacer clic directamente en el mapa para fijar la ubicación
              </p>
            </div>

            {/* footer */}
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/[0.06] px-4 py-3.5 gap-3">
              <div className="flex-1 min-w-0">
                {selected && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    📍 {selected.label}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-gray-200 dark:border-white/[0.06] px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selected}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  Confirmar ubicación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}