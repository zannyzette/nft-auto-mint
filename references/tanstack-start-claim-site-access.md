# Claim-Site Eligibility Check — TanStack Start server functions (reverse-engineered 2026-08-17)

Banyak claim/eligibility site NFT dibangun pake **TanStack Start (SolidStart)** — e.g. playbandits.xyz/claim ("The Bandit List"). Server functions ke-compile jadi hashed handlers; protocol-nya bisa dipanggil langsung tanpa browser.

## Deteksi
- HTML = Vite shell (~13KB), JS di `/assets/*.js` (chunks: `index-*.js` runtime besar, `<route>.functions-*.js` berisi stub server fn, `<route>App-*.js` berisi logic).
- Di app chunk: `import{a as e,...}from"./claim.functions-*.js"` lalu `h({method:"POST"}).handler(e(<64-hex-hash>))` — tiap server fn = 1 hash.
- Export map di tail `claim.functions-*.js`: `export{k as a, O as i, ...}` → petakan nama export ke hash + method.
- Runtime fetch helper di `index-*.js`: cari `function us(e){let t="/_serverFn/"+e;...}` — itu yang bikin URL.

## Call format (verified)
```
POST https://site/_serverFn/<hash>
Headers: x-tsr-serverFn: true   ← WAJIB (tanpa ini → Forbidden/HTML)
         content-type: application/json
         accept: application/json
         Origin: https://site / Referer: https://site/claim / UA browser
Body: {"data": {"address": "0x...", "purpose": "claim"}}   ← plain JSON cukup
```
- GET fn: panggil GET /_serverFn/<hash> (tanpa body; method salah → "expected GET method. Got POST").
- Response = **Seroval-tagged JSON**: envelope `{t:10,i,p:{k:["result","error","context"],v:[...]}}`; result di `p.v[0]`. Type tags: t:1=string, t:0=number, t:2=boolean, t:9=array, t:10=object, t:25=error.

## Pitfall: Cloudflare bot management (SIN datacenter IP)
- GET (leaderboard) jalan dari curl; **POST sensitif (mis. fn yang ngeluarin signable message) bisa 500 `{"c":"$TSR/Error","s":{"message":{"t":1,"s":"Seroval Error (step: 3)"}}}`** untuk IP datacenter — error di dalam fn, bukan format request (body `{}` / `{"data":null}` / tagged → error sama).
- Coba dulu: header browser lengkap + `__cf_bm` cookie dari load halaman.
- Fallback yang jalan: **drive browser asli (camoufox) dan call fetch dari page context** (`page.evaluate`) — same-origin + TLS asli lolos bot check. Cookies dari browser juga bisa bikin curl lolos.
- Flow eligibility yang umum: server fn #1 → `{message}` (buat di-sign) → sign LOKAL pake PK wallet (PK gak pernah dikirim) → server fn #2 `{message, signature}` → status `eligible|not_eligible|already_claimed|closed|rate_limited` (+ `claimToken`, `communities[]`) → server fn #3 `{claimToken, community}` → `claimed`.

## Contoh hash (playbandits.xyz/claim, 2026-08-17)
- GET leaderboard: `1615536e23a86f8f8c435f8471ce449b9db06943e03f450f9f8a4a86a772c84d` → `{showCounts, rows:[{community,count}]}` (h00dle 206, script_kiddies 123, onchain_hoodies 113, monkeyhood 64…)
- POST message: `8cbbfcd133b745f69b54cf8c63e7599811bb46b047bc66d7d98d35e0b551c38d`
- POST check: `c58f025f9092201568166838548ca90f680bf5d52597ce82aa945f66c026fdbe`
- POST claim: `593cc06804831969e0dcf45bf793e023b0287675f785505363cfb12a3f53ebe4`
