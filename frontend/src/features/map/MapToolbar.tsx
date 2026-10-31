import type { ReactNode } from 'react';
import { useMap } from 'react-map-gl/maplibre';

import type { Route } from '../../api/types';
import { FrameIcon, MinusIcon, PlusIcon } from '../../components/icons';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useUiStore } from '../../store/uiStore';
import { planBounds } from './geojson';
import { fitToBounds } from './useFitBounds';

export function MapToolbar({ routes }: { routes: readonly Route[] | null }) {
  const { current: map } = useMap();
  const prefersReducedMotion = usePrefersReducedMotion();
  const bounds = routes ? planBounds(routes) : null;

  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 sm:top-3 sm:right-3">
      <div className="glass flex flex-col overflow-hidden rounded-xl">
        <ToolButton label="Zoom in" onClick={() => map?.zoomIn()}>
          <PlusIcon className="size-[18px]" />
        </ToolButton>
        <span aria-hidden className="mx-2 h-px bg-slate-200" />
        <ToolButton label="Zoom out" onClick={() => map?.zoomOut()}>
          <MinusIcon className="size-[18px]" />
        </ToolButton>
      </div>
      {bounds && (
        <div className="glass flex flex-col overflow-hidden rounded-xl">
          <ToolButton
            label="Show the whole trip"
            onClick={() => {
              if (!map) return;
              useUiStore.getState().setFollowingDriver(false);
              fitToBounds(map.getMap(), bounds, prefersReducedMotion);
            }}
          >
            <FrameIcon className="size-[18px]" />
          </ToolButton>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:bg-brand-50 focus-visible:text-brand-700 focus-visible:outline-none active:bg-brand-100"
    >
      {children}
    </button>
  );
}
