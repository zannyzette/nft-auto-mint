#!/usr/bin/env python3
"""Audit a Hermes skill directory for health (SKILL.md limit, dead links, orphan files, duplicates).

Usage:
  python3 audit-skill-health.py [skill_dir] [--threshold 0.55]

Default skill_dir = ~/.hermes/skills/nft/nft-auto-mint.
Checks:
  1. SKILL.md size vs 100,000-char hard limit (over → must move fat sections to references/)
  2. Biggest sections (candidates to move to references/ when near limit)
  3. Dead links in SKILL.md (references/scripts/templates paths that don't exist on disk)
  4. Orphan files (on disk but never mentioned in SKILL.md)
  5. Near-duplicate reference pairs (word-set overlap > threshold)

Lesson (2026-08-15): a programmatic splice during consolidation silently deleted
~40K chars of SKILL.md sections. ALWAYS `cp SKILL.md SKILL.md.bak` before large
programmatic edits, and re-run this audit after every edit to confirm sections survived.
"""
import os
import re
import sys

BASE = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.expanduser('~/.hermes/skills/nft/nft-auto-mint')
LIMIT = 100000
THRESH = 0.55
if '--threshold' in sys.argv:
    i = sys.argv.index('--threshold')
    if i + 1 < len(sys.argv):
        THRESH = float(sys.argv[i + 1])

skill = os.path.join(BASE, 'SKILL.md')
if not os.path.exists(skill):
    print(f"❌ SKILL.md tidak ada di {BASE}")
    sys.exit(1)
s = open(skill).read()

print(f"=== AUDIT SKILL: {BASE} ===")
print(f"1. SKILL.md: {len(s):,} chars / {LIMIT:,} limit — {'✅ OK' if len(s) < LIMIT else '❌ OVER LIMIT — pindahkan section gendut ke references/ dulu'}")
print(f"   Ruang sisa: {LIMIT - len(s):,} chars")

sections = re.split(r'(?=^## )', s, flags=re.M)
big = sorted(((len(sec), sec.split('\n')[0][:60]) for sec in sections), reverse=True)[:6]
print("2. Section terbesar (kandidat pindah ke references/ kalau mendekati limit):")
for size, title in big:
    if size > 3000:
        print(f"   {size:>6} | {title}")

dead = []
for r in set(re.findall(r'references/([a-z0-9-]+\.md)', s)):
    if not os.path.exists(os.path.join(BASE, 'references', r)):
        dead.append('references/' + r)
for x in set(re.findall(r'scripts/([a-z0-9-]+\.(?:js|sh|py|mjs|cu))', s)):
    if not os.path.exists(os.path.join(BASE, 'scripts', x)):
        dead.append('scripts/' + x)
for t in set(re.findall(r'templates/([a-z0-9-]+\.(?:js|sh))', s)):
    if not os.path.exists(os.path.join(BASE, 'templates', t)):
        dead.append('templates/' + t)
print("3. Link mati:", dead if dead else "tidak ada ✅")

yatim = []
for sub in ['references', 'scripts', 'templates']:
    d = os.path.join(BASE, sub)
    if not os.path.isdir(d):
        continue
    for f in os.listdir(d):
        if sub == 'references' and not f.endswith('.md'):
            continue
        if f'{sub}/{f}' not in s:
            yatim.append(f'{sub}/{f}')
print("4. File yatim (di disk, gak disebut SKILL.md):", yatim if yatim else "tidak ada ✅")

refs = [f for f in os.listdir(os.path.join(BASE, 'references')) if f.endswith('.md')]
contents = {}
for r in refs:
    try:
        contents[r] = open(os.path.join(BASE, 'references', r)).read().lower().split()
    except OSError:
        contents[r] = []
pairs = []
for i in range(len(refs)):
    for j in range(i + 1, len(refs)):
        sa, sb = set(contents[refs[i]]), set(contents[refs[j]])
        if sa and sb:
            sim = len(sa & sb) / min(len(sa), len(sb))
            if sim > THRESH:
                pairs.append((round(sim, 2), refs[i], refs[j]))
pairs.sort(reverse=True)
print(f"5. Pasangan mirip (> {THRESH:.0%}):", pairs if pairs else "tidak ada ✅")
