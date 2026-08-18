# Eligibility/Claim Sites — TanStack Start server functions (direct API)

Beberapa WL/claim/eligible site (SolidStart + TanStack Start) menjalankan logika via server functions — bisa di-call langsung tanpa browser:

## Protocol
- URL: `POST /_serverFn/<fnId>` — fnId = hash 64-hex yang ke-embed di bundle JS
- Header WAJIB: `x-tsr-serverFn: true` (+ `content-type: application/json`, `accept: application/json`, `Origin`/`Referer` same-site)
- Body: `{"data": {args}}` — plain JSON cukup untuk objek simpel (seroval serialize objek polos = JSON biasa)
- GET fn (tanpa args, mis. leaderboard): `GET /_serverFn/<fnId>` + header yang sama
- Response: seroval-tagged `{"t":10,"p":{"k":["result","error","context"],"v":[...]}}` — hasil di `v[0]`

## Cara dapet fnId
Bundle JS → cari `function us(e){let t="/_serverFn/"+e` (TanStack runtime) → fnId = argumen `e(<hash>)` di `createServerFn().handler(...)` per fungsi. Header/body exact: cari `x-tsr-serverFn` di fetch helper (`is()`).

## PITFALL — Cloudflare bot management
POST endpoints claim/message sering 500 `{"c":"$TSR/Error","s":{"message":{"t":1,"s":"Seroval Error (step: 3)"}}}` dari curl walau format body bener — biasanya server fn-nya throw karena visitor datacenter IP/TLS ke-flag. GET publik (leaderboard/stats) biasanya tetap jalan. Kalau kena: butuh call dari page context browser asli (camoufox) yang sudah lewat CF, atau serahin kalau user minta stop.
