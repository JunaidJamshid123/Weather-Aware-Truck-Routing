import type { Map as MaplibreMap } from 'maplibre-gl';
import { useEffect } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useUiStore } from '../../store/uiStore';
import type { TrackPosition } from './tripTrack';

const FOLLOW_MIN_ZOOM = 6.5;
const FOLLOW_SETTLE_MS = 900;
// Chase time constant: small enough to feel locked on, big enough to be smooth.
const FOLLOW_SMOOTHING_MS = 140;
const STILL_THRESHOLD_PX = 0.25;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Glides onto the driver once, then keeps them centred each frame; any drag stops following. */
export function useFollowCamera(
  map: MaplibreMap,
  positionRef: { readonly current: TrackPosition | null },
): void {
  const isFollowing = useUiStore((state) => state.isFollowingDriver);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!isFollowing) return undefined;
    const stopFollowing = () => {
      useUiStore.getState().setFollowingDriver(false);
    };
    map.on('dragstart', stopFollowing);

    const startZoom = map.getZoom();
    const targetZoom = Math.max(startZoom, FOLLOW_MIN_ZOOM);
    const { lng: startLng, lat: startLat } = map.getCenter();
    let startedAt: number | null = null;
    let lastFrameAt: number | null = null;
    let frame = requestAnimationFrame(function step(now) {
      startedAt ??= now;
      const position = positionRef.current;
      if (position) {
        const [lng, lat] = position.lngLat;
        const settle = prefersReducedMotion ? 1 : Math.min(1, (now - startedAt) / FOLLOW_SETTLE_MS);
        if (settle < 1) {
          // Settling: one eased flight onto the moving driver.
          const t = easeInOutCubic(settle);
          map.jumpTo({
            center: [startLng + (lng - startLng) * t, startLat + (lat - startLat) * t],
            zoom: startZoom + (targetZoom - startZoom) * t,
          });
        } else {
          // Locked on: exponential chase blends playback steps into a glide.
          const elapsed = now - (lastFrameAt ?? now);
          const chase = prefersReducedMotion ? 1 : 1 - Math.exp(-elapsed / FOLLOW_SMOOTHING_MS);
          const center = map.getCenter();
          const next: [number, number] = [
            center.lng + (lng - center.lng) * chase,
            center.lat + (lat - center.lat) * chase,
          ];
          if (map.project(next).dist(map.project(center)) > STILL_THRESHOLD_PX) {
            map.jumpTo({ center: next });
          }
        }
      }
      lastFrameAt = now;
      frame = requestAnimationFrame(step);
    });

    return () => {
      cancelAnimationFrame(frame);
      map.off('dragstart', stopFollowing);
    };
  }, [map, isFollowing, positionRef, prefersReducedMotion]);
}
