# TanStack Start Server Functions — Recon & Direct Call (claim/eligibility sites)

Untuk situs claim/eligibility berbasis TanStack Start (Solid). Contoh nyata: playbandits.xyz/claim ("The Bandit List").

## Detection dari JS bundle
- Chunk fungsi (claim.functions-*.js) berisi: `var w=h({method:"POST"}).handler(e("<64-hex>"))` — hex itu = **server fn id**. Export map di akhir chunk memetakan nama → id.
- Runtime (chunk index besar): `function us(e){let t="/_serverFn/"+e; return Object.assign((...e)=>{...is(t,e,n??fetch)},...)}` → **endpoint = `/_serverFn/<id>`**
- Fetch helper `is()`: set header **`x-tsr-serverFn: true`**, accept `application/x-ndjson, application/json`. Body POST = `JSON.stringify({data: <args>})` — untuk objek sederhana Seroval output = JSON biasa (verified: `serialize({data:{...}})` dari npm `seroval` = `{"data":{...}}`).

## Cara call
```
POST https://site/_serverFn/<64-hex-id>
Headers: x-tsr-serverFn: true · content-type: application/json · accept: application/json · Origin/Referer same-site
Body: {"data":{"address":"0x...","purpose":"claim"}}
```
- GET fn (no-arg): GET path yang sama (args via query `?payload=` untuk yang butuh arg).
- Response: Seroval-tagged `{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[...]}}` — t:1=string, t:0=number, t:9=array, t:10=object, t:25=error.

## Pitfalls
- Method salah → `"expected GET method. Got POST"` (routing VALIDASI method — bagus buat konfirmasi protokol).
- POST tanpa header `x-tsr-serverFn` → balikin HTML SSR halaman.
- **`"Seroval Error (step: 3)"` HTTP 500 = server fn THROW di dalam** — seringnya **Cloudflare bot management** nge-block IP datacenter/TLS pada endpoint sensitif (GET publik jalan, POST flow claim 500). Body yang sama persis dengan client tetap 500 → bukan masalah format payload.
- Path yang bisa lolos: fetch dari **page context browser asli** (same-origin, CF clearance). Flow claim butuh wallet signature (personal_sign message dari server fn) — sign LOKAL pake PK, terus pass signature ke fn check. Feasible headless HANYA kalau POST-nya gak ke-CF-block.
- Kalau semua POST 500 dari semua variasi → lapor ke operator "proteksi bot, butuh browser" dan STOP (jangan grind); bersihkan file temp.
