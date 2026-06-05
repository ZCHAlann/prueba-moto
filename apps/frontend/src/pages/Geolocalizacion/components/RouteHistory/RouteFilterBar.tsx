import { Filter } from 'lucide-react';

export type DateFilter = 'all' | 'today' | 'week' | 'month';
export type SortBy = 'newest' | 'oldest' | 'longest' | 'shortest';

const DATE_FILTERS: Array<{ id: DateFilter; label: string }> = [
  { id: 'all',   label: 'Todo' },
  { id: 'today', label: 'Hoy' },
  { id: 'week',  label: '7 días' },
  { id: 'month', label: '30 días' },
];

interface Props {
  dateFilter: DateFilter;
  onDateChange: (f: DateFilter) => void;
  sortBy: SortBy;
  onSortChange: (s: SortBy) => void;
  total: number;
}

export const RouteFilterBar = ({
  dateFilter, onDateChange, sortBy, onSortChange, total,
}: Props) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
    <div className="flex flex-wrap items-center gap-1.5">
      <Filter className="h-3.5 w-3.5 text-slate-400" />
      {DATE_FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onDateChange(f.id)}
          className={`
            rounded-full px-2.5 py-1 text-xs font-medium transition
            ${dateFilter === f.id
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
          `}
        >
          {f.label}
        </button>
      ))}
    </div>

    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{total}</span>
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortBy)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <option value="newest">Más reciente</option>
        <option value="oldest">Más antigua</option>
        <option value="longest">Más larga</option>
        <option value="shortest">Más corta</option>
      </select>
    </div>
  </div>
);