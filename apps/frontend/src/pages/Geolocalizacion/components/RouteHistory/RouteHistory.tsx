import { useMemo, useState } from 'react';
import { Loader2, Route as RouteIcon } from 'lucide-react';
import { useRouteHistory } from '../../hooks/useRouteHistory';
import { useSelectionStore } from '../../store/selectionStore';
import { RouteItem } from './RouteItem';
import { RouteFilterBar, type DateFilter, type SortBy } from './RouteFilterBar';

const LoadingState = () => (
  <div className="flex items-center justify-center py-10">
    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
  </div>
);

const EmptyState = () => (
  <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
    <RouteIcon className="mx-auto h-8 w-8 text-slate-300" />
    <div className="mt-2 text-sm font-semibold text-slate-700">Sin rutas</div>
    <div className="mt-1 text-xs text-slate-500">
      Este vehículo aún no tiene rutas registradas.
    </div>
  </div>
);

export const RouteHistory = () => {
  const { routes, loading } = useRouteHistory();
  const selectedRouteId = useSelectionStore((s) => s.selectedRoute?.id);
  const selectRoute     = useSelectionStore((s) => s.selectRoute);
  const clearRoute      = useSelectionStore((s) => s.clearRoute);

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortBy, setSortBy]         = useState<SortBy>('newest');

  const filtered = useMemo(() => {
    let result = [...routes];
    const now = Date.now();

    if (dateFilter !== 'all') {
      const cutoff =
        dateFilter === 'today' ? new Date().setHours(0, 0, 0, 0) :
        dateFilter === 'week'  ? now - 7  * 24 * 60 * 60 * 1000 :
                                  now - 30 * 24 * 60 * 60 * 1000;
      result = result.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':  return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        case 'oldest':  return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
        case 'longest': return b.distanceMeters - a.distanceMeters;
        case 'shortest':return a.distanceMeters - b.distanceMeters;
      }
    });

    return result;
  }, [routes, dateFilter, sortBy]);

  if (loading) return <LoadingState />;
  if (routes.length === 0) return <EmptyState />;

  return (
    <div className="space-y-3">
      <RouteFilterBar
        dateFilter={dateFilter}
        onDateChange={setDateFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        total={filtered.length}
      />

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
            No hay rutas en este rango.
          </div>
        ) : (
          filtered.map((route) => (
            <RouteItem
              key={route.id}
              route={route}
              isSelected={selectedRouteId === route.id}
              onSelect={() => selectRoute(route)}
              onClose={clearRoute}
            />
          ))
        )}
      </div>
    </div>
  );
};