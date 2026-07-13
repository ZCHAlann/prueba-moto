// components/platform/IconPicker.tsx
//
// Selector visual de íconos Lucide. Muestra un grid con los íconos
// más usados en la app + un campo de búsqueda para filtrar. La
// forma del valor que se persiste es el nombre PascalCase de Lucide
// (ej. "Wrench"), que es lo que el form ya venía almacenando.
//
// Props:
//   value:    nombre del ícono actual (PascalCase) o string vacío.
//   onChange: callback con el nuevo nombre de ícono.
//   label:    opcional, etiqueta del campo.

import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, Archive, Award, BarChart3,
  Battery, Bell, Bike, Box, Briefcase, Building2, Calculator, Calendar,
  Camera, Car, ChartBar, ChartLine, ChartPie, Check, CheckCircle,
  ChevronRight, ClipboardList, Clock, Cloud, Cog, Compass, CreditCard,
  Database, DollarSign, Download, Droplet, Edit, File, FileText, Filter,
  Flag, Folder, Fuel, Gauge, Globe, HardDrive, Headphones, Heart, Home,
  Image, Inbox, Info, Key, Layers, LayoutDashboard, LifeBuoy, Lightbulb,
  Link, ListChecks, Loader, Lock, LogIn, LogOut, Mail, Map, MapPin,
  Megaphone, Menu, MessageCircle, MessageSquare, Monitor, Moon, MoreHorizontal,
  Navigation, Newspaper, Package, PaintBucket, Paperclip, PenSquare, Percent,
  Phone, PieChart, Pill, Pin, Plane, Plug, Plus, Power, Printer, Puzzle,
  Radio, Receipt, RefreshCcw, Rocket, Route, Save, Search, Send, Server,
  Settings, Share2, Shield, ShieldCheck, ShoppingBag, ShoppingCart, Shuffle,
  Sliders, Smartphone, Sparkles, Speaker, Star, Stethoscope, Store, Sun,
  Tag, Target, Tent, ThumbsUp, ToggleLeft, Trash2, Truck, Tv, Upload,
  User, Users, Video, Volume2, Wallet, Watch, Wifi, Wrench, X, Zap,
  type LucideIcon,
} from "lucide-react";

interface IconDef {
  name: string;
  Icon: LucideIcon;
}

// Set curado (~130 íconos) — los que más se usan en el sistema.
// Mantenerlo acotado: si se mostraran todos los ~1500 de Lucide el
// grid se vuelve inmanejable. Si el admin necesita uno que no está,
// puede tipearlo en el campo "Avanzado" de abajo.
const ICONS: IconDef[] = [
  { name: "Activity",         Icon: Activity },
  { name: "AlertCircle",      Icon: AlertCircle },
  { name: "AlertTriangle",    Icon: AlertTriangle },
  { name: "Archive",          Icon: Archive },
  { name: "Award",            Icon: Award },
  { name: "BarChart3",        Icon: BarChart3 },
  { name: "Battery",          Icon: Battery },
  { name: "Bell",             Icon: Bell },
  { name: "Bike",             Icon: Bike },
  { name: "Box",              Icon: Box },
  { name: "Briefcase",        Icon: Briefcase },
  { name: "Building2",        Icon: Building2 },
  { name: "Calculator",       Icon: Calculator },
  { name: "Calendar",         Icon: Calendar },
  { name: "Camera",           Icon: Camera },
  { name: "Car",              Icon: Car },
  { name: "ChartBar",         Icon: ChartBar },
  { name: "ChartLine",        Icon: ChartLine },
  { name: "ChartPie",         Icon: ChartPie },
  { name: "Check",            Icon: Check },
  { name: "CheckCircle",      Icon: CheckCircle },
  { name: "ChevronRight",     Icon: ChevronRight },
  { name: "ClipboardList",    Icon: ClipboardList },
  { name: "Clock",            Icon: Clock },
  { name: "Cloud",            Icon: Cloud },
  { name: "Cog",              Icon: Cog },
  { name: "Compass",          Icon: Compass },
  { name: "CreditCard",       Icon: CreditCard },
  { name: "Database",         Icon: Database },
  { name: "DollarSign",       Icon: DollarSign },
  { name: "Download",         Icon: Download },
  { name: "Droplet",          Icon: Droplet },
  { name: "Edit",             Icon: Edit },
  { name: "File",             Icon: File },
  { name: "FileText",         Icon: FileText },
  { name: "Filter",           Icon: Filter },
  { name: "Flag",             Icon: Flag },
  { name: "Folder",           Icon: Folder },
  { name: "Fuel",             Icon: Fuel },
  { name: "Gauge",            Icon: Gauge },
  { name: "Globe",            Icon: Globe },
  { name: "HardDrive",        Icon: HardDrive },
  { name: "Headphones",       Icon: Headphones },
  { name: "Heart",            Icon: Heart },
  { name: "Home",             Icon: Home },
  { name: "Image",            Icon: Image },
  { name: "Inbox",            Icon: Inbox },
  { name: "Info",             Icon: Info },
  { name: "Key",              Icon: Key },
  { name: "Layers",           Icon: Layers },
  { name: "LayoutDashboard",  Icon: LayoutDashboard },
  { name: "LifeBuoy",         Icon: LifeBuoy },
  { name: "Lightbulb",        Icon: Lightbulb },
  { name: "Link",             Icon: Link },
  { name: "ListChecks",       Icon: ListChecks },
  { name: "Loader",           Icon: Loader },
  { name: "Lock",             Icon: Lock },
  { name: "LogIn",            Icon: LogIn },
  { name: "LogOut",           Icon: LogOut },
  { name: "Mail",             Icon: Mail },
  { name: "Map",              Icon: Map },
  { name: "MapPin",           Icon: MapPin },
  { name: "Megaphone",        Icon: Megaphone },
  { name: "Menu",             Icon: Menu },
  { name: "MessageCircle",    Icon: MessageCircle },
  { name: "MessageSquare",    Icon: MessageSquare },
  { name: "Monitor",          Icon: Monitor },
  { name: "Moon",             Icon: Moon },
  { name: "MoreHorizontal",   Icon: MoreHorizontal },
  { name: "Navigation",       Icon: Navigation },
  { name: "Newspaper",        Icon: Newspaper },
  { name: "Package",          Icon: Package },
  { name: "PaintBucket",      Icon: PaintBucket },
  { name: "Paperclip",        Icon: Paperclip },
  { name: "PenSquare",        Icon: PenSquare },
  { name: "Percent",          Icon: Percent },
  { name: "Phone",            Icon: Phone },
  { name: "PieChart",         Icon: PieChart },
  { name: "Pill",             Icon: Pill },
  { name: "Pin",              Icon: Pin },
  { name: "Plane",            Icon: Plane },
  { name: "Plug",             Icon: Plug },
  { name: "Plus",             Icon: Plus },
  { name: "Power",            Icon: Power },
  { name: "Printer",          Icon: Printer },
  { name: "Puzzle",           Icon: Puzzle },
  { name: "Radio",            Icon: Radio },
  { name: "Receipt",          Icon: Receipt },
  { name: "RefreshCcw",       Icon: RefreshCcw },
  { name: "Rocket",           Icon: Rocket },
  { name: "Route",            Icon: Route },
  { name: "Save",             Icon: Save },
  { name: "Search",           Icon: Search },
  { name: "Send",             Icon: Send },
  { name: "Server",           Icon: Server },
  { name: "Settings",         Icon: Settings },
  { name: "Share2",           Icon: Share2 },
  { name: "Shield",           Icon: Shield },
  { name: "ShieldCheck",      Icon: ShieldCheck },
  { name: "ShoppingBag",      Icon: ShoppingBag },
  { name: "ShoppingCart",     Icon: ShoppingCart },
  { name: "Shuffle",          Icon: Shuffle },
  { name: "Sliders",          Icon: Sliders },
  { name: "Smartphone",       Icon: Smartphone },
  { name: "Sparkles",         Icon: Sparkles },
  { name: "Speaker",          Icon: Speaker },
  { name: "Star",             Icon: Star },
  { name: "Stethoscope",      Icon: Stethoscope },
  { name: "Store",            Icon: Store },
  { name: "Sun",              Icon: Sun },
  { name: "Tag",              Icon: Tag },
  { name: "Target",           Icon: Target },
  { name: "Tent",             Icon: Tent },
  { name: "ThumbsUp",         Icon: ThumbsUp },
  { name: "ToggleLeft",       Icon: ToggleLeft },
  { name: "Trash2",           Icon: Trash2 },
  { name: "Truck",            Icon: Truck },
  { name: "Tv",               Icon: Tv },
  { name: "Upload",           Icon: Upload },
  { name: "User",             Icon: User },
  { name: "Users",            Icon: Users },
  { name: "Video",            Icon: Video },
  { name: "Volume2",          Icon: Volume2 },
  { name: "Wallet",           Icon: Wallet },
  { name: "Watch",            Icon: Watch },
  { name: "Wifi",             Icon: Wifi },
  { name: "Wrench",           Icon: Wrench },
  { name: "X",                Icon: X },
  { name: "Zap",              Icon: Zap },
];

// Resuelve un nombre a su componente. Si el admin tipeó uno que no
// está en la lista curada, caemos a Package como fallback para que
// la UI no rompa.
function resolveIcon(name: string): LucideIcon {
  const found = ICONS.find((i) => i.name === name);
  return found?.Icon ?? Package;
}

interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
  label?: string;
  /** Color del acento activo (ej. "emerald", "sky"). Default "brand". */
  accent?: string;
}

const ACCENT_RING: Record<string, string> = {
  brand:   "ring-brand-500 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300",
  emerald: "ring-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  sky:     "ring-sky-500 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
  violet:  "ring-violet-500 bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  rose:    "ring-rose-500 bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
  orange:  "ring-orange-500 bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  amber:   "ring-amber-500 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  teal:    "ring-teal-500 bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300",
  lime:    "ring-lime-500 bg-lime-50 dark:bg-lime-500/15 text-lime-700 dark:text-lime-300",
  cyan:    "ring-cyan-500 bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
};

const ACCENT_BORDER: Record<string, string> = {
  brand:   "border-brand-300 dark:border-brand-500/40",
  emerald: "border-emerald-300 dark:border-emerald-500/40",
  sky:     "border-sky-300 dark:border-sky-500/40",
  violet:  "border-violet-300 dark:border-violet-500/40",
  rose:    "border-rose-300 dark:border-rose-500/40",
  orange:  "border-orange-300 dark:border-orange-500/40",
  amber:   "border-amber-300 dark:border-amber-500/40",
  teal:    "border-teal-300 dark:border-teal-500/40",
  lime:    "border-lime-300 dark:border-lime-500/40",
  cyan:    "border-cyan-300 dark:border-cyan-500/40",
};

export function IconPicker({ value, onChange, label = "Ícono", accent = "brand" }: IconPickerProps) {
  const [q, setQ] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return ICONS;
    return ICONS.filter((i) => i.name.toLowerCase().includes(query));
  }, [q]);

  const CurrentIcon = resolveIcon(value);
  const activeRing = ACCENT_RING[accent] ?? ACCENT_RING.brand;
  const activeBorder = ACCENT_BORDER[accent] ?? ACCENT_BORDER.brand;

  return (
    <div>
      {/* Header: ícono actual + nombre + toggle "Avanzado" */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {label}
        </p>
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ring-2 ${activeRing}`}>
            <CurrentIcon size={14} />
          </div>
          <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
            {value || "—"}
          </span>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-2">
        <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="text"
          placeholder="Filtrar íconos…"
          className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-2 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      </div>

      {/* Grid scrollable */}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50 p-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-gray-400">
            Sin resultados. Probá con otro nombre o usá el modo Avanzado.
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filtered.map(({ name, Icon }) => {
              const selected = name === value;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(name)}
                  title={name}
                  aria-label={name}
                  aria-pressed={selected}
                  className={
                    selected
                      ? `flex h-8 w-8 items-center justify-center rounded-md border-2 ${activeBorder} bg-white text-gray-800 shadow-sm transition dark:bg-white/[0.05] dark:text-gray-100`
                      : "flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white text-gray-500 transition hover:border-gray-200 hover:bg-gray-50 hover:text-gray-700 dark:bg-white/[0.02] dark:text-gray-400 dark:hover:border-white/10 dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
                  }
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modo avanzado: input libre */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        {advanced ? "Ocultar" : "Mostrar"} modo avanzado
      </button>
      {advanced && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nombre PascalCase de Lucide (ej. Wrench)"
          className="mt-1.5 h-8 w-full rounded-lg border border-gray-200 bg-white px-2 font-mono text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        />
      )}
    </div>
  );
}
