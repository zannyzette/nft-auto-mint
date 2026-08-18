import { artFor } from './engine.js';
import crypto from 'crypto';
import fs from 'fs';

// Parse SVG grid 32x32 dari artFor (rect merged — pakai point-in-rect)
function gridFromSvg(svg) {
  const rects = [];
  for (const m of svg.matchAll(/<rect(?:\s+x="(\d+)")?(?:\s+y="(\d+)")?(?:\s+width="(\d+)")?(?:\s+height="(\d+)")?\s+fill="#([0-9a-f]{6})"/g)) {
    rects.push({x: Number(m[1] || 0), y: Number(m[2] || 0), w: Number(m[3] || 512), h: Number(m[4] || 512), fill: m[5]});
  }
  const grid = Array.from({length: 32}, () => Array(32).fill(null));
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 32; col++) {
      const px = col * 16 + 8, py = row * 16 + 8; // titik tengah cell
      // rect terkecil yang contain titik = paling spesifik
      let best = null, bestArea = Infinity;
      for (const r of rects) {
        if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
          const area = r.w * r.h;
          if (area < bestArea) { best = r.fill; bestArea = area; }
        }
      }
      grid[row][col] = best;
    }
  }
  return grid;
}

// Solve puzzle relic: statement + grid art
function solveRelic(stmt, grid) {
  const pairs = [...stmt.matchAll(/row (\d+), column (\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!pairs.length) return {err: 'no pairs'};
  let key = '';
  for (const [row, col] of pairs) {
    const c = grid[row][col];
    if (!c) return {err: `no color at ${row},${col}`};
    key += c;
  }
  const tokenMatch = stmt.match(/"(\d+)\|key\|0"/);
  if (!tokenMatch) return {err: 'no iv token'};
  // IV = first 16 bytes of sha256("<tokenId>|key|0") — LITERAL "key" (bukan nilai key!)
  const iv = crypto.createHash('sha256').update(`${tokenMatch[1]}|key|0`).digest().slice(0, 16);
  const aesKey = crypto.createHash('sha256').update(key).digest();
  const sealedMatch = stmt.match(/\n\s+([A-Za-z0-9+/=]{20,})\n/);
  if (!sealedMatch) return {err: 'no sealed line'};
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    const plain = Buffer.concat([decipher.update(Buffer.from(sealedMatch[1], 'base64')), decipher.final()]).toString('utf8');
    return {key, plain: plain.trim()};
  } catch (e) {
    return {err: 'decrypt gagal: ' + e.message.slice(0, 50)};
  }
}

// Main
const tid = parseInt(process.argv[2]);
const band = String(Math.ceil(tid / 101)).padStart(2, '0');
const corpus = JSON.parse(fs.readFileSync(`/tmp/inference-angels/corpus/v3/public/band-${band}.json`, 'utf8'));
const angel = corpus.find(a => a.tokenId === tid);
const t = angel.trials[0];
console.log(`angel ${tid}: kind=${t.kind}`);

const refMatch = t.statement.match(/angel No\. (\d+)/);
const refId = refMatch ? parseInt(refMatch[1]) : tid;
console.log(`art referensi: angel ${refId}`);
const {svg} = artFor(refId);
console.log(`svg: ${svg.length} chars`);
const grid = gridFromSvg(svg);
const filled = grid.flat().filter(Boolean).length;
console.log(`grid terisi: ${filled}/1024`);
const result = solveRelic(t.statement, grid);
if (result.err) {
  console.log('ERR:', result.err);
} else {
  console.log('KEY:', result.key);
  console.log('PLAINTEXT:', JSON.stringify(result.plain));
  const words = result.plain.split(/\s+/).filter(Boolean);
  fs.writeFileSync(`/tmp/ans-${tid}.txt`, words.join('|'));
  console.log('answers:', words.join('|'));
}
