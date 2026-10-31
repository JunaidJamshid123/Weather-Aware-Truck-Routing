# Weather-Aware Truck Routing — Frontend

React single-page app for the routing API in `../backend`. The driver enters a trip, compares up
to three truck routes on a map, sees the risk at every checkpoint for the moment they will reach
it, and scrubs a 0–48 h weather-risk heatmap while a driver marker travels the selected route.

The frontend **renders and interacts only**. Risk levels, ETAs, rankings and the recommendation
all come from the backend.

## Quick start

```bash
cd frontend
npm install
cp .env.example .env        # points at http://localhost:8000/api by default
npm run dev                 # http://localhost:5173 (start the backend first)
```

To develop without the backend, set `VITE_USE_MOCK=true`. Mock Service Worker then serves a
recorded real response (Seattle → Minneapolis) and a small list of US places.

| Command             | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `npm run test`      | Vitest + React Testing Library + MSW (112 tests)                           |
| `npm run lint`      | ESLint (strict type-checked, react-hooks, jsx-a11y), zero warnings allowed |
| `npm run typecheck` | `tsc --noEmit`, strict mode with `noUncheckedIndexedAccess`                |
| `npm run build`     | Type-check, then build for production into `dist/`                         |
| `npm run format`    | Prettier                                                                   |

## Configuration

| Variable                  | Default                     | Notes                                                                                    |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`       | `http://localhost:8000/api` | The backend's `/api` root.                                                               |
| `VITE_MAP_STYLE_URL`      | OpenFreeMap Positron        | Any MapLibre style URL. For a fallback, use `https://demotiles.maplibre.org/style.json`. |
| `VITE_MAP_DARK_STYLE_URL` | OpenFreeMap Dark            | Basemap used in dark mode.                                                               |
| `VITE_DRIVER_AVATAR_URL`  | `/driver.svg`               | Driver marker image; drop a photo in `public/` and point this at it.                     |
| `VITE_USE_MOCK`           | `false`                     | `true` runs the whole UI against MSW mocks.                                              |

## Architecture

```
src/
  api/         fetch wrapper (timeout, ApiError), zod schemas, inferred types, endpoints
  app/         layout, providers, query client
  features/
    trip-form/ form, Downshift comboboxes, debounced geocode, zod form schema
    plan/      PlanProvider: one TanStack mutation exposed as idle | loading | success | error
    results/   recommendation banner, warnings, route cards, loading and error states
    map/       MapView, GeoJSON builders, paint-expression builders, layers, popup, legend, toolbar
    driver/    trip track (time → position), driver marker, driven-road trail, follow camera
    forecast/  slider, journey risk ribbon, playback, deferred forecast hour
    splash/    responsive splash screen driven by real loading work
  store/       Zustand UI state: selected route, forecast hour, active checkpoint, follow, theme
  lib/         constants, risk metadata, formatting (the only place that converts UTC to local time)
  mocks/       MSW handlers and a recorded real plan
```

- **One contract source.** `api/schemas.ts` mirrors the backend contract, and `api/types.ts`
  infers types from it. Every response is parsed at the boundary, so contract drift fails loudly
  instead of silently breaking the map. The recorded mock fixture goes through the same schema.
- **Server data lives in TanStack Query; UI state lives in Zustand.** The plan is never copied
  into the store.
- **Errors.** Every failure (HTTP, timeout, network, contract drift) becomes an `ApiError` with a
  user-safe message. On a 400, `details` are mapped back onto form fields.
- **Requests.** A new plan request aborts the one still in flight. After 8 s the UI explains
  that the free-tier server may be waking up.

## Map and heatmap performance

- **GPU layers, not DOM markers.** Routes (casing plus line), checkpoints (one `circle`
  layer) and the heatmap are each a single GeoJSON source.
- **Selection changes paint only.** Highlighting a route changes paint/layout expressions
  (`case` on `routeId`), never the source data. Checkpoint colors use a `match` on `riskLevel`.
- **The heatmap source is built once per plan.** Each corridor point carries flat props
  `r0..r48`. The slider only swaps one paint property:

  ```
  heatmap-weight = ["/", ["max", ["get", "r<hour>"], 0], 4]
  ```

  This is a GPU-side change. There is no `setData`, no geometry re-upload and no network
  request. Unknown hours (`-1`) clamp to 0 weight.

- **Smooth scrubbing.** The slider thumb reads the store's hour (urgent update). The heatmap
  reads `useDeferredValue` of it, so React can skip intermediate frames while you drag. **Play**
  steps one hour every 400 ms and pauses as soon as you drag.
- **Risk band.** A blurred circle layer on the same heatmap source colours the corridor by level
  (calm stretches stay faint green). It is driven by the same `r<hour>` property, so it also
  changes by paint expression only.
- **Layer order** is risk band → heatmap → route casing → route line → driven trail →
  checkpoints → popup. All layers stay mounted, with empty data before the first plan, so the
  order never changes. The heatmap fades out above zoom 11 so checkpoints stay readable.
- **The map mounts once** (`reuseMaps`, stable style). MapLibre (~340 kB gzipped) is lazy-loaded
  so the form is usable immediately. Without WebGL, a readable message replaces the map.

## Driver playback

- `features/driver/tripTrack.ts` turns the selected route into a track once: time → mile from
  the checkpoint ETAs, mile → coordinate along the geometry. The risk "at the driver" at hour _h_
  is the checkpoint risk forecast for that ETA, so it is exactly what the driver will meet.
- The marker is a plain MapLibre marker moved on `requestAnimationFrame` between whole hours, so
  playback glides at 60 fps without React re-renders.
- The road already driven is a `line-gradient` on its own `lineMetrics` source; moving it is a
  paint change.
- **Follow driver** eases the camera onto the truck and keeps it centred; dragging the map stops
  following.
- Under the slider, a ribbon shows the risk met hour by hour, with the arrival time marked.

## Light and dark mode

The header switch themes the whole app and swaps the basemap. Components use colour tokens
(`surface`, `mist`, `ink`, `slate`, brand tints) that are re-pointed under `data-theme="dark"`,
so there are no per-component dark styles. The choice is saved; the first visit follows the
system setting. The splash screen always uses the light brand artwork.

## Two different "times"

- **Checkpoint risk** (popups, route stats) is the forecast **at your arrival time** at that
  checkpoint.
- **The heatmap** is the weather risk at **departure + N hours** for the whole corridor. It is
  labelled "Weather risk map for <local time>".

All times are shown in the browser's time zone with its abbreviation, for example
`Tue, Nov 3, 4:00 PM CST`.

## Accessibility

- Every input has a visible label. Errors are announced (`aria-live="polite"`).
- The comboboxes are Downshift `useCombobox`. The interval control uses native radios, and the
  slider is a native range with `aria-valuetext` such as "+12 hours, Tue 4:00 PM".
- Risk is never shown by color alone: badges and the legend always include a text label.
- `prefers-reduced-motion` disables the camera animation and skeleton pulses.

## Deploy (Vercel)

1. Import the repository and set the project **Root Directory** to `frontend`.
2. Set `VITE_API_BASE_URL` to the hosted backend, for example `https://<app>.onrender.com/api`.
3. Add the Vercel origin to the backend's `CORS_ALLOWED_ORIGINS`.

`vercel.json` provides the SPA rewrite and long-term caching for hashed assets.

## Manual check before a release

- Three routes are visible, and selecting a card highlights its route on the map.
- Checkpoint popups show the mile, the ETA, wind, rain and snow, and a risk badge.
- Dragging the slider makes no requests (check DevTools → Network).
- Play moves the driver smoothly; Follow driver tracks it; dark mode themes everything.
- The layout works at 375 px wide.
- The cold-start message appears when the API is slow.

## Attribution

Map tiles © OpenFreeMap, map data © OpenStreetMap contributors. Routing © openrouteservice.org.
Weather by Open-Meteo.com.
