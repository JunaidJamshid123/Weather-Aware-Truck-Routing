import type { Route } from '../../api/types';
import { useUiStore } from '../../store/uiStore';
import { RouteCard } from './RouteCard';

/** Routes arrive ranked; index 0 is the recommendation. */
export function RouteList({ routes }: { routes: readonly Route[] }) {
  const selectedRouteId = useUiStore((state) => state.selectedRouteId);
  const selectRoute = useUiStore((state) => state.selectRoute);
  return (
    <section aria-labelledby="routes-heading">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 id="routes-heading" className="section-heading">
          Route options ({routes.length})
        </h2>
        <span className="text-xs text-slate-400">Ranked safest first</span>
      </div>
      <ul className="space-y-3">
        {routes.map((route) => (
          <li key={route.id}>
            <RouteCard
              route={route}
              isSelected={route.id === selectedRouteId}
              onSelect={selectRoute}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
