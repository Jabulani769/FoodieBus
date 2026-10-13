# EasyPay Mobile Contract (Flutter hand-off)

Base URL root `/` (not `/api/v1`). All money is `double`. All keys `snake_case`.
Auth: `POST /auth/request-otp {phone}` → `POST /auth/verify-otp {phone, code}` → `{token, user}`. Send `Authorization: Bearer <token>`.

Error envelope (BFF only): `{status: "error", error_code, message}`.
Codes: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `500 INTERNAL_ERROR`.

## 1. Home selector + feed + in-store menu

- `GET /kitchens/categories` → `[{id, name, slug, sort_order}]`. Render horizontal selector in `sort_order, name` order.
- `GET /kitchens?lat=&lng=&category=&page=&limit=` (page default 1, limit default 50, max 100). `lat`+`lng` must come together or `400`. `category` is slug or name (case-insensitive).
  → `[{id, name, logo_url, banner_url, cuisine_type, rating, delivery_time, description, is_open, status: OPEN|CLOSED|BUSY, store_label, is_paused, distance_km, distance_m, eta_min, distance_label}]`, sorted by `distance_km` when located, paginated slice.
  - With `lat/lng`: kitchens outside `delivery_radius_km` (default 5) are silently hidden. Empty array can mean out-of-range — compare against unfiltered call to distinguish.
  - Without `lat/lng`: distance fields are `null`; unlocated vendors included.
- `GET /kitchens/:id/menu-grouped` → `{groups: [{header, slug, items: [card]}]}` for in-store headers.
- Core alt (dashboards): `GET /api/v1/vendors/:vendorId/menu-grouped` → `{groups: [{id, name, slug, sortOrder, items}]}` (camelCase).

## 2. Menu cards + customization sheet

`GET /kitchens/:id/menu` → `[{id, name, price, base_price, image_url, category, category_slug, description, is_available, badge: "Unavailable Today"|null, locked: bool, customizations: [{group_id, name, type: SINGLE|MULTI, is_required, min_select, max_select, options: [{option_id, label, price_delta}]}]}]`.
- Never hides OOS: browse-all, `locked=true` disables Add.
- Sheet rules: `SINGLE` = radio exactly 1; `MULTI` = checkbox `min_select..max_select`. Customer must settle all `is_required` groups before Add to Cart.
- Local total: `(base_price + Σ price_delta) × qty`. Server is source of truth on preview/create.
- `POST /orders/food/preview {kitchen_id, items: [{item_id, quantity, selected_options?}]}` (auth) → `{kitchen_id, lines: [{item_id, quantity, unit, line_total}], total, is_open, status, store_label}`. Same validation/math as create, no write. Use before checkout to avoid drift (`total_price` on create is accepted but ignored).

## 3. Orders + live tracker

- `POST /orders/food {kitchen_id, items, booking_id?, delivery_address?, delivery_lat?, delivery_lng?}` (auth) → `201 {order_id, status: lower, status_lower, status_upper: UPPER, estimated_delivery_minutes, estimated_ready_at, created_at}`. `booking_id` optional → latest `CONFIRMED` booking used. Statuses: `pending|preparing|ready|delivered|cancelled` (lower) + `PLACED|PREPARING|READY|DELIVERED_TO_BUS|CANCELLED` (upper).
- `GET /orders/food/:id/tracking` (auth) → `{order_id, status: UPPER, status_upper, status_lower, tracker_message, prep_minutes, estimated_ready_at}`.
  Copy: `PLACED` “Waiting for restaurant confirmation...”, `PREPARING` “Kitchen is preparing your order”, `READY` “Your food is ready! Driver is on the way.”, `DELIVERED_TO_BUS` “Delivered to bus. Enjoy!”, `CANCELLED` “Order was cancelled”.
- Socket: `io(url, {auth: {token}})` → auto-joins `user:{id}`. Event `food:order-status {orderId, status: UPPER, vendorName, prepMinutes?, estimatedReadyAt?}` fires on vendor status updates only (not on create). Poll tracking as fallback. Socket auth failures: `Authentication required` / `Invalid or expired token` (no numeric code).

## 4. Closed / Busy + cart lock

- Status helper: `isPaused → BUSY / Busy - Not Accepting Orders`; `!isActive | hours closed | outside open–close (overnight-aware) → CLOSED / Currently Closed`; else `OPEN / Open`.
- BFF: `status/is_open/store_label/is_paused` on each kitchen. Core: `storeStatus/storeLabel/isOpen`.
- `GET /kitchens/:id/status` → `{id, is_open, status, status_lower, store_label, is_paused, delivery_radius_km}`. Call before checkout.
- Lock: `POST /orders/food` → `409` when closed/busy (`Store is Currently Closed|Busy - Not Accepting Orders`), OOS dish (`Dish "X" is currently unavailable`), trip issues, or multi-kitchen carts (`All items must come from the same kitchen`). Browse stays allowed. No `kitchen:status` socket — poll status + menu.

## 5. Geofence + ETA

- Formula (`shared/geo.ts`): haversine km; `eta = travel(30km/h) + deliveryTime (min 5)`; label `"X m/km away • Lo–Lo+5 min"`.
- Feed hides out-of-radius; order guard needs both `delivery_lat+lng` or ignored: `409 Delivery location X km away — outside Y km delivery radius`.

## Key map (BFF vs core)

BFF `snake_case`, lower create-status, `header/store_label/distance_km`; core `/api/v1` camelCase, `UPPER` status, `name/storeStatus/distanceKm`. Normalize order status case-insensitively in Flutter.

## Smoke flow

OTP → `GET /kitchens/categories` → `GET /kitchens?lat&lng` → `GET /kitchens/:id/menu-grouped` → `POST /orders/food/preview` → `POST /orders/food` → socket + `GET /orders/food/:id/tracking`.
