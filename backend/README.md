# Weather-Aware Truck Routing — Backend

Django + DRF API that plans truck trips around the weather. Given origin, destination,
departure time, load weight and a checkpoint interval, it returns up to three routes.
Each route has checkpoints with ETAs, the forecast at each ETA, a risk level per
checkpoint, and per-route statistics. The response also names a recommended route with
a one-line reason, and includes a 0–48 h risk heatmap of the trip corridor.

The backend owns **all** business logic. The React frontend only renders the response.

## Quick start

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                 # then set ORS_API_KEY
python manage.py runserver           # http://localhost:8000/api/health
```

Get a free openrouteservice key at <https://openrouteservice.org/dev/#/signup>. The app
refuses to start without one (except in tests). Open-Meteo needs no key.

| Command | Purpose |
|---|---|
| `pytest --cov=routing` | 206 tests, ~99 % coverage, no network |
| `ruff check . && ruff format --check .` | Lint and formatting |
| `mypy routing config` | Strict type check |

Production: `gunicorn config.wsgi --workers 2 --threads 4 --timeout 60`. A Render
blueprint is at the repository root (`render.yaml`).

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `ORS_API_KEY` | — | Required. |
| `DJANGO_SECRET_KEY` | dev-only fallback | Required in production. |
| `DJANGO_DEBUG` | `false` (`true` in dev settings) | |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Add the deployed frontend origin. |
| `GEOCODE_COUNTRY` | `US` | Autocomplete country filter. |
| `ORS_APPLY_WEIGHT_RESTRICTION` | `false` | Send the load as an ORS weight restriction. |
| `MAX_DEPARTURE_LOOKAHEAD_DAYS` | `5` | Forecast-range guard. |
| `REDIS_URL` | empty | Shared cache across workers. Local memory if empty. |
| `NUM_PROXIES` | empty | Set `1` behind Render's proxy so throttling sees client IPs. |

## Architecture

Dependencies point inward only:

```
api       views, serializers, error handler, throttle     -> services
services  plan, alternatives, checkpoints, assessment,     -> domain, geo, client interfaces
          recommendation, heatmap, geocode, container
clients   ORS + Open-Meteo adapters, HTTP plumbing         -> domain types only
geo       haversine, interpolation, bearings, D-P, overlap -> domain types only
domain    risk rules, value types, constants               -> nothing (pure Python)
```

- **The domain is pure:** no Django, no HTTP, no `datetime.now()`. Frozen, slotted
  dataclasses, with units in names (`distance_mi`, `wind_mph`, `load_lb`, `duration_s`).
- **Dependency injection:** services receive `RoutingProvider`, `WeatherProvider` and
  `CacheBackend` (Protocols). `services/container.py` is the only place that wires
  production objects. Tests inject in-memory fakes.
- **Views are thin:** validate, call one service, shape the response.

### Request flow (`POST /api/plan`)

1. **Routes**: the fastest ORS `driving-hgv` route, plus up to two alternatives (below).
2. **Checkpoints**: placed at mile 0, N, 2N, … and the destination, using binary search
   on the cumulative-miles array. The ETA interpolates linearly inside the ORS step that
   contains the checkpoint. Steps are anchored to geometry vertices, so step times and
   checkpoint distances use the same miles.
3. **Weather in one pass**: grid cells for every route's checkpoints and every heatmap
   point are deduplicated and fetched together, 50 locations per Open-Meteo request,
   with chunks in parallel. Each cell's hourly series is cached for 30 min.
4. **Risk and stats**: risk is assessed at each checkpoint's ETA, using the forecast hour
   nearest to the ETA. Owned miles are summed per level.
5. **Ranking** with a reason, then the **heatmap**. The whole plan is cached for 10 minutes.

## API

All times are ISO 8601 UTC with a `Z` suffix. Geometry is `[lon, lat]`. Responses are
gzipped.

- `GET /api/health` returns `{"status": "ok"}`.
- `GET /api/geocode?q=dal&size=5` returns `{"results": [{"label", "lat", "lon"}]}`. `q` needs at least 3 characters; results are cached for 24 h.
- `POST /api/plan` takes and returns the shapes below.

```json
{
  "origin":      {"label": "Dallas, TX", "lat": 32.7767, "lon": -96.797},
  "destination": {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
  "departure_time": "2026-11-02T14:00:00Z",
  "load_weight_lb": 42000,
  "checkpoint_interval_mi": 25
}
```

Validation:
- Coordinates must be in range.
- Load must be an integer from 1 to 80,000 lb.
- Interval must be 10, 25 or 50.
- Departure must fall between the current hour and 5 days ahead.
- Origin and destination must be at least 1 mile apart.

The response contains `recommended_route_id`, `all_blocked`, `warnings` and `routes`. Routes
are **ranked**, so index 0 is the recommendation. Each route has an `id`, a `label`,
simplified `geometry`, a `summary` with miles per level, `avg_risk`, `max_risk`, `rank`
and `reason`, and its `checkpoints`. The `heatmap` field holds
`{start_time, hours: 49, points: [{lat, lon, risk: [49 ints]}]}`. See
`routing/tests/api/test_api.py` for an asserted example.

### Errors

Every error has the shape `{"error": {"code", "message", "details"}}`.

| Situation | Status | `code` |
|---|---|---|
| Invalid input | 400 | `validation_error` (field errors in `details`) |
| No route between the points | 422 | `no_route_found` |
| ORS quota or rate limit hit | 503 | `routing_limit_exceeded` |
| Upstream timeout, 5xx or malformed data | 502 | `upstream_unavailable` |
| Our own throttle (plan 20/min, geocode 60/min per IP) | 429 | `throttled` |
| Weather unavailable | 200 | `weather: null`, `unknown_miles`, plus a warning |

Upstream error bodies and API keys are logged, never returned to the client.

## Risk rules and interpretations

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind (mph) | < 25 | 25–34 | 35–44 | 45–54 | ≥ 55 |
| Rain (in/hr) | < 0.10 | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow (in/hr) | < 0.5 | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 |

- **Boundaries:** lower bounds are inclusive, so a value on a shared boundary takes the
  higher level (rain 0.25 is HIGH, snow 1.0 is HIGH). The No Travel cut is `≥` for wind
  and strictly `>` for rain and snow, exactly as the table states. Rain 1.00 and snow 3.0
  are therefore still SEVERE. The table is stored as data (`Thresholds`) and read by one
  `classify` function.
- **Combination:** a checkpoint takes the worst of wind, rain and snow. The wind load
  rules are applied after that and can only raise the level:
  - 45–54 mph and more than 30,000 lb is No Travel.
  - 35–44 mph and more than 40,000 lb is at least Severe.
  - Exactly 30,000 or 40,000 lb is not over a limit.
- **Wind variable:** sustained `wind_speed_10m`. Switching to gusts is a one-line change
  (`WIND_VARIABLE` in `clients/open_meteo.py`).
- **Rain and snow:** Open-Meteo `rain` and `snowfall` (in inches). `precipitation` is not
  used because it already includes snow water equivalent and would double count.
- **Unknown weather is never LOW.** Forecast gaps, null hours and fetch failures produce
  `risk: null`. Those miles are reported as `unknown_miles` and excluded from `avg_risk`.

### Miles and recommendation

- Each checkpoint owns the road from the midpoint with its previous neighbour to the
  midpoint with its next one. Owned miles always sum to the route distance (tested).
- Ranking sorts ascending on
  `(blocked, no_travel_miles, severe_miles, high_miles, avg_risk, duration)`. Miles are
  rounded to 0.1 and the average to 0.001, so float noise cannot decide a rank.
- **Interpretation:** the brief lists "fewest Severe miles" first. We go further: a
  route with any No Travel segment is never preferred over one without. If every route
  is blocked, we still recommend the least bad one, set `all_blocked: true` and add a
  warning.
- The reason names the first criterion that differs, for example
  `"0 severe miles vs 18.4 on Alternative A"`. For equally safe routes it reads
  `"Fastest of equally safe routes: 25 min faster than Alternative A"`.

### Heatmap vs checkpoint risk

These answer two different questions, and the code keeps them apart:

- **Checkpoint risk** is the weather *when the truck arrives* (at each checkpoint's ETA).
- **Heatmap risk** is the weather *at departure + h hours* for every corridor point,
  for h from 0 to 48. Corridor points are sampled every max(10 mi, length/150) along
  each route and deduplicated on the 0.1° weather grid. Each point carries 49 small
  integers (-1 means unknown), so the frontend slider never needs the network.

## Getting three routes from ORS

ORS's public API only returns native `alternative_routes` for trips of about 100 km, so
the backend builds alternatives with via points:

1. Compute the fastest route.
2. At 50 % of its length, take the local bearing. Offset a via point perpendicular to
   the left and to the right by `clamp(12 % of trip, 25 km, 120 km)`. Route
   origin → via → destination in parallel, with `radiuses: -1` so ORS snaps each via
   point to the nearest road.
3. Reject a candidate if any of these hold:
   - it takes more than 1.6× the fastest duration;
   - more than 10 % of it is driven twice (backtracking from a via point on a spur);
   - it shares more than 80 % with an accepted route.
   Overlap uses 2 km samples and a uniform grid index, so it stays linear-time.
4. Only a side that produced nothing is retried, once, at 35 % and 65 % of the trip with
   a 1.5× offset. The worst case is 7 ORS calls per plan; the quota is 2,000 per day.
5. Routes are never fabricated. If fewer than 3 survive, a warning says so.

## Performance

- Plan compute is about 0.3 s for three ~12,000-vertex routes (local benchmark,
  excluding network). A cached plan returns in under 1 ms.
- One weather pass per plan. Shared `requests.Session` objects with connection pooling.
  Timeouts are 3 s connect and 15 s read, with 2 retries and backoff on 429/5xx.
- Geometry sent to clients is Douglas–Peucker simplified (0.0005°). Statistics always
  use the full-resolution line.
- Responses are gzipped. A typical plan is about 60 KB raw and 3–5 KB compressed.

## Known limitations

- Each Open-Meteo forecast is for a 0.1° grid cell and comes in hourly steps. It is not
  a road-surface forecast.
- ETAs come from ORS truck travel times. They ignore traffic, rest breaks and HOS rules.
- Via-point alternatives depend on the road network. In sparse regions, fewer than three
  distinct routes may exist.
- With the default local-memory cache, each gunicorn worker has its own cache. Set
  `REDIS_URL` to share it.
- `manage.py check --deploy` reports that CSRF middleware is absent. That is intended:
  this is a cookieless, unauthenticated JSON API.

## Attribution

Routing and geocoding: © [openrouteservice.org](https://openrouteservice.org) by HeiGIT,
map data © OpenStreetMap contributors. Weather: [Open-Meteo.com](https://open-meteo.com)
(CC BY 4.0, free tier for non-commercial use).
