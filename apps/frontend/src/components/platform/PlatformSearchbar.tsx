interface PlatformSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function PlatformSearchBar({
  value,
  onChange,
  placeholder = "Buscar…",
}: PlatformSearchBarProps) {
  return (
    <div className="relative flex-1 max-w-sm">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4
          text-sm text-gray-700 placeholder:text-gray-400 outline-none transition
          focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10
          dark:border-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500"
      />
    </div>
  );
}