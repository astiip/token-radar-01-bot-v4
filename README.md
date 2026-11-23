[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun · rank](https://make.fun/badge/token-radar-01/astiip/token-radar-01-bot-v4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![make.fun · reward](https://make.fun/badge/token-radar-01/astiip/token-radar-01-bot-v4/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar v4 — radar-6

Rebuild of `token-radar-bot` (radar-5, "Level Obelisk", rank 909/16,596, judge
93.84%) for token-radar-01 ($1,325, top 10; closes 14 Dec 2026 17:00 WIB).
Target: 96.2%+ (top-10 bar 96.13% live 22 Nov 2026). Study:
`~/workspace/makefun/token-radar-01-v4-study.md`. Brief:
`~/workspace/makefun/token-radar-01-v4-brief.md`.

## What changed from radar-5

1. **Kin factor 0.5× (6th multiplier).** `implied = curve × factor × growth ×
   maturity × breadth × kin`. Kin is read off the eligibility table's status,
   never off a name: 16 rows are marked `kin: true` in `lib/eligibility.ts` —
   the 4 flagged rows (USDD, Bittensor dTAO, BitFi, Doppler Finance) plus 12
   unresolved rows whose related token trades (Plume Vaults PLUME, Theo thUSD,
   Aegis YUSD, Avant avUSD, GMX Solana, Plasma One XPL, Bitlayer BTR, Plasma
   Saving Vaults XPL, XION Finance, Katana pre-launch KAT, Katana DEX KAT,
   Flying Tulip FTUSD). NOT kin: listed-with-no-market-data rows (Curvance,
   Infinifi, Shift DeFi, Makina, Predict Fun) and the Sygnum FIUSD fund share
   ($0 volume). Shown as a 6th tile in the detail breakdown, in the method
   formula, as a `KIN 0.5×` badge on rows, and with a "Hide kin rows" toggle.
   The ablation table gains a "No kin" column.
2. **Family effects replace the global 1.00 fallback.** New parent mapping:
   Prediction Market → Dexs. A thin category (1–2 own peers, no qualifying
   parent) takes a family factor `(n·median + 4·1.00)/(n+4)`, clamped
   0.25–3.00, source `family` in the factor table. A category with no peers
   at all still falls to 1.00. Revert = set `family_effects: false` in
   `lib/model.ts` (restores radar-5 behaviour). Kin does NOT affect LOO
   (LOO is scored on live protocols; kin applies only to pre-token rows).
3. **Row-specific farm steps.** 4 of 7 steps now carry the row's own content:
   step 1 by eligibility status (flagged → yield-only; unresolved → verify
   token first); step 2 = action + the audit note's venue/rewards line for
   the 10 deep-checked rows (AUDIT `farm`); step 5 = category risk + a
   concrete incident where the audit records one (Gauntlet, Mar 2026 Resolv
   USR loss — AUDIT `riskNote`); step 6 = claim status from the audit
   (AUDIT `claim`) or the eligibility status. Steps 3, 4, 7 stay generic
   process steps. Each step stays 20–600 chars (gate-checked).
4. **New headline + denser cover.** Headline: "Which launch is worth farming
   next — priced off the tokens that already trade." (v2's headline was near
   identical to gentle-badger/ronigrv — replaced in full.) One-line lede,
   scatter 150→110 px, tighter hero/strip/controls padding, table 13.5→13 px,
   row padding 6→4 px, 7-chip strip (new "early finds" chip: "158 early
   finds — below the floor, the radar's job"). Screenshots at 1440×1000.
   Cover target: ≥8 rows in the first viewport.
5. **Farm Next gains a watchlist section** ("Best per hands-on hour on the
   watchlist", `farm_next_watchlist` in data.js).

Untouched: value scale (curve TVL^0.45–0.49; Steakhouse $74M in v2 already
in the $66–126M band), OLS log-log curve, category factor + clamp + 20-peer
shrink, growth/maturity/breadth, fitted P25–P75 band, $1,000-plan verdicts,
eligibility audit depth (176 genuine / 4 flag / 18 unresolved), dark+gold
palette, all filters/sorts/detail views.

## Run (parent only — this repo is file-tools-only, no shell here)

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ~/workspace/makefun/token-radar-01-kit/input/snapshot.json
```

`main.ts` prints the gate numbers to stdout (LOO median + within-×3, time-split
median + within-×3, curve R², band, kin-row count). The dummy run writes
`out/board.json` + `out/data.js`, then exits at the screenshot check (only
`.gitkeep` ships in `screenshots/` — v2's screenshots were NOT copied; they
would mismatch the v4 dashboard and fail criterion 1).

```sh
python3 shot.py out screenshots/   # 1440x1000: 1-board (verified), 2-detail, 3-filtered (FARM), 4-farm-next
# NOTE: shot 2 targets steakhouse-financial — check out/board.json first; if a
# family effect lifted another watchlist protocol (e.g. Polymarket) to rank 1,
# point shot 2 at that slug instead.
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ~/workspace/makefun/token-radar-01-kit/input/snapshot.json
python3 gate-check.py out
```

## Gate (radar-6, measured at build time)

- LOO median ≤ ×3.20 (radar-5: ×3.45) and within-×3 ≥ 48% (radar-5: 45.3%)
- Time-split median ≤ ×2.90 (radar-5: ×2.91)
- R² ≥ 0.20 (radar-5: 0.19)
- If the gate fails: set `family_effects: false`, re-run, ship radar-5
  factors + kin + dashboard, and report the numbers — do not force it.
- `dashboard/` ≈ 63,300 bytes as written, by file-write counts (app.js
  ~49,200 + app.css ~13,900 + index.html 448) — under the 65,536 hard cap but
  above the 60,000 soft target. MEASURE exactly before submit; do not trust
  this estimate.
- Each screenshot 300–350 KB, ≤512 KiB, long side ≤1440, short side ≥800.
- Cover shows ≥8 rows; detail + filtered screenshots re-read (no clipped
  text, numbers match board.json).
- gate-check.py 7/7 PASS + dossier byte-match + board 198 rows + 2 runs
  byte-identical.

## Before submit (parent)

- Check why v3.1 was NOT ranked (status "superseded") via kit CLI — do not
  repeat that failure mode.
- Report Polymarket's rank + implied under radar-6 (do NOT force it up).
- Pairwise self-check v4 cover vs v2 and vs ronigrv's cover (Xingchi is dead —
  `radar_sim.py` cannot run; use 100milionseek vision or a manual walk-through
  per the 5 criteria).
- No text/layout copied from top-10 (headline, hero copy, farm-step template
  are original; patterns/methods only).

## Files

- `main.ts` — entry, Node 22 stdlib only; prints LOO/time-split/R²/kin count.
- `lib/model.ts` — radar-6 model, board, farm plans, verdicts, dossier data.
- `lib/eligibility.ts` — CoinGecko audit 2026-11-14, 198 rows, 16 kin markers.
- `dashboard/` — `index.html`, `app.css`, `app.js` (static, no network).
- `vendor/makefun-board.ts` — make.fun dossier library, byte-identical copy.
- `gate-check.py` — local mirror of the 7 server gate checks.
- `shot.py` — Playwright screenshots, viewport 1440×1000.
- `radar_sim.py` — pairwise vision sim (Xingchi dead — see note in file).
- `screenshots/` — ships with `.gitkeep` only; real PNGs are taken at run time.
- `LICENSE` — MIT + SPDX line, copyright 2026 DEXSSLvd2CSRPhHjwXNNCMAYGXoDs3ENfy7zaY9QVNmj.

Repo target on GitHub: `astiip/token-radar-01-bot-v4` (parent commits/pushes).
