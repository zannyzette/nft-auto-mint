# Reading Telegram screenshots without a vision tool (tesseract + PIL)

The operator frequently sends Telegram screenshots (mint stats, floor prices, bot dashboards, game challenges). When `vision_analyze` is unavailable (or delegation returns only the tool call, not the result), **tesseract + PIL preprocessing reliably extracts the text** — proven twice in one session (read a drpc endpoint URL + latency from a 766×74 banner; read a Telegram "guess the collection" game screenshot).

## Recipe

1. Baseline: `tesseract img.jpg stdout` — works on clean light UI, fails on dark/stylized text.
2. Preprocess with PIL (see `/tmp/ocr-pre.py` pattern):
   - Upscale 3-4x (`Image.LANCZOS`) — small screenshots are the #1 OCR killer
   - Grayscale + `ImageEnhance.Contrast(...).enhance(2-3)` + `ImageOps.autocontrast`
   - ALSO try the **inverted** version (dark-mode UI: invert makes light-on-dark → dark-on-light)
3. Run each variant through several psm modes: `3` (default), `6` (uniform block), `11` (sparse text), `13` (raw line), and for URL/key extraction add `-c tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.:-_`
4. Read all variants together — the same string repeating across variants is trustworthy; single-variant readings may be noise (e.g. "irpc" vs "rpc" — an "i" was OCR noise; verify by testing the candidate against reality).

## Caveats

- OCR reads TEXT, not artwork — for "which NFT collection is this art" questions, OCR only gets you the text layer; match DOMINANT COLORS (PIL `Counter` on quantized pixels) against collection art fetched from `i2c.seadn.io` to corroborate (worked: dark-navy GreedCats preview matched a dark screenshot grid).
- Truncated keys/URLs in the image can't be reconstructed — ask the operator for the full value instead of guessing domains.
- `delegate_task` with toolsets `["vision"]` did NOT provide vision_analyze in this environment (leaf got only file tools) — don't burn a round-trip on it; OCR first.
- **vision_analyze fails with `RuntimeError: No LLM provider configured for task=vision provider=auto` when the auxiliary LLM (OpenRouter) is out of credit / no auth** (2026-08-18, RWAKERS/Bunkerhood session). Don't treat it as a broken tool — fall back to OCR immediately. Also note the gateway log will show the root cause (`payment / credit error`). Works for terminal screenshots too: OCR of a 1005×89 terminal strip correctly read `cd ~/.hermes/profiles/agp` + `No such file or directory`, and a 989×205 terminal capture read `hermes profile list` output — upscale 3x + `--psm 6` is the reliable combo for terminal text.
