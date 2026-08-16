# Load tests

Scripted load testing for FoodieBus hot paths using
[autocannon](https://github.com/mcollina/autocannon).

## Prerequisites

- Local API running on `:8080` (or set `BASE_URL`).
- Postgres + Redis up.
- For the authed scenarios (`booking`, `food-order`) you need a bearer token:

```bash
# obtain a token, e.g. via the login endpoint
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"student@example.com","password":"..."}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])"
export AUTH_TOKEN=<token>
```

## Run

```bash
# all four scenarios, 10 connections, 5s each
node ops/load/loadtest.mjs

# tune load
CONCURRENCY=50 DURATION=10 node ops/load/loadtest.mjs
```

### Scenario setup

`booking` and `food-order` POST bodies reference entity ids via env vars:

- `TRIP_ID` — an existing scheduled trip id for `booking`.
- `BOOKING_ID` / `DISH_ID` — a confirmed booking and its vendor dish for `food-order`.
- `TXREF` — a payment reference for the `webhook` scenario.

Without these, those scenarios will mostly return validation errors (they
still exercise serialization/validation overhead, but won't test the happy
path). For happy-path runs, populate them first.

## Observability

While testing, scrape `GET /metrics` (Prometheus format) to watch:

- `foodiebus_http_requests_total{method,route,status}`
- `foodiebus_http_request_duration_seconds{method,route}`
- `foodiebus_queue_jobs{queue,status}`

Typical p95 latency budget on a dev machine: trip search < 50ms, booking < 150ms.
