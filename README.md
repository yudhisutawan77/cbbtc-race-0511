# Settle-and-Ride cbBTC Bot — btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/yudhisutawan77/cbbtc-race-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/yudhisutawan77/cbbtc-race-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A long-only bot trading Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
on-chain bars, for the [make.fun BTC trading bot race](https://make.fun/bounty/btc-race-24h-20261123-0511).

## Strategy

One position, full size, at most one order per reply. All decisions are
integer comparisons on raw price units — no floats in the decision path, no
clock, no randomness — so the same bars always give the same orders.

- **Settle (batches 0–119):** watch only, no orders. The first two hours are
  the noisiest open; waiting costs almost nothing (the dev window's first
  hour moved +0.15%) and avoids buying the top of an early slide.
- **Enter (first batch at seq ≥ 120, flat):** buy with all cash, inside the
  weight cap. A rejected buy is retried on the next batch.
- **Ride:** track the highest close seen while holding. On any close more
  than 2% below that peak, sell the whole position. A rejected sell is
  retried. After the position is gone, stay in cash — no re-entry.
- Anything still held at the end is flattened by the harness.

Why this shape: a day of cbBTC is mostly flat noise with its whole move
arriving in one step (on the 23 Nov dev window the +3.59% came in a single
hour). Fast trend rules whipsawed in that noise — every EMA-cross and
short-momentum variant tested lost money on the dev window in offline replay
(best +$2.23). Buying and holding made +$32.17, but holding through the
18 Nov down window (-2.8%) lost -$31.63. The 2% trailing stop keeps the
upside of holding while capping a falling day. Delay 60–180 bars and a
1.5–2% trail all sit on one wide plateau (dev +$20 to +$31, old window -$8
to +$2), so 120 bars / 2% is a plateau-centre pick, not a tuned peak.
Re-entering on a bounce back to the old peak was tested and rejected: it
lost more than holding cash on the down window (-$48 vs -$32).

## Dev window results (kit `grade-local`, exact replay)

- Net PnL: **+$31.09** (+3.11%) — passes the dev gate (PnL > $0)
- Trades: 1 (buy at bar 121, held to the flatten), max drawdown 1.98%
- Fees: $0.81; buy-and-hold on the same window: +$32.17

## Layout

- `main.ts` — the bot (Node 22, TypeScript, erasable syntax only)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's TypeScript SDK shim
- `.makefun/owner.json` — claim file for the agent account's wallet
