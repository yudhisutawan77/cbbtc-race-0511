// Settle-and-ride cbBTC bot for agent-fun/bars-replay/v1.
//
// One sentence: wait out the noisy open, buy the whole stake once, then ride
// the position with a 2% trailing stop and never trade again.
//
// Why this shape, from the two dev windows on record (23 Nov 2026, up +3.6%;
// 18 Nov 2026, down -2.8%):
//
//   - A day of cbBTC is mostly flat noise with its whole move arriving in one
//     step (on the 23 Nov window the +3.6% came in a single hour, hours 4-5).
//     Fast trend rules (EMA crosses, short trailing returns) whipsawed in
//     that noise: every one of them lost money on the 23 Nov window in
//     offline replay, the best only +$2.23.
//   - Buying and holding the 23 Nov window made +$32.17, but holding through
//     the 18 Nov window lost -$31.63. The trailing stop is the difference
//     between the two: it keeps the upside of holding while capping a
//     falling day at roughly the drop already suffered plus the 2% trail.
//   - The first two hours are the noisiest open (the 18 Nov window's early
//     slide is what a buy-at-bar-0 catches). Waiting 120 bars before the
//     single buy cost almost nothing on the up window (first hour: +0.15%)
//     and cut the down window's loss sharply. Delay 60-180 bars and a
//     1.5-2% trail all sit on one wide plateau (new window +$20 to +$31,
//     old window -$8 to +$2), so 120 bars / 2% is a plateau-centre pick,
//     not a tuned peak. No re-entry after a stop-out: re-entering on a
//     bounce back to the old peak lost more than holding cash on the down
//     window (-$48 vs -$32), so once stopped out the bot stays in cash.
//
// Rules, exactly:
//   - Batches 0..119: watch only, no orders (the settle window).
//   - First batch at seq >= 120, flat and not yet exited: buy with all cash
//     (capped by the weight room). A rejected buy is retried on the next
//     batch while the condition holds.
//   - While holding: track the highest close seen. On any close more than
//     2% below that peak, sell the whole position. A rejected sell is
//     retried on the next batch. After the position is gone, never buy
//     again. Anything still held at the end is flattened by the harness.
//   - One asset, one position, at most one order per reply, full size.
//     max_slippage_bps 200 (2% past the decision close) so a fill is only
//     refused on a genuine one-minute spike, and then retried.
//
// Determinism: the decision is a pure function of the closes seen so far,
// compared in BigInt (close * 10000 < peak * 9800). No clock, no randomness,
// no environment, no files. Two runs on the same bars send the same orders.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Bars to watch before the single buy: two hours of 1-minute bars. */
const SETTLE_BARS = 120;
/** Trailing stop, in basis points below the highest close seen while holding. */
const TRAIL_BPS = 200n;
/** Widest fill the bot accepts past the close it decided on, in bps. */
const MAX_SLIP_BPS = 200;

/** Highest close seen while holding (raw price units, null until positioned). */
let peakClose: bigint | null = null;
/** True once a position we held has closed: the bot never buys again. */
let exited = false;
/** True on every batch where we hold a position (lets the exit latch on the
    batch the account first shows empty, even if a sell was once refused). */
let heldBefore = false;

await runBars({
  onBatch(state: BarsState, batch) {
    if (state.warmingUp) return [];

    // Only decide on a fresh bar for our symbol; a batch without one
    // carries no new information.
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const closeNow = BigInt(bar.c);

    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      if (heldBefore) {
        // The position is gone (sold, or flattened): stay in cash.
        exited = true;
      }
      if (exited || batch.seq < SETTLE_BARS) return [];
      // The single buy: everything we hold, inside the weight cap.
      const room = state.weightRoom(SYMBOL);
      const notional = state.cash < room ? state.cash : room;
      if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      const order: OrderInput = {
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: notional,
        max_slippage_bps: MAX_SLIP_BPS,
      };
      return [order];
    }

    heldBefore = true;
    if (peakClose === null || closeNow > peakClose) peakClose = closeNow;
    // Trailing stop, in exact integers: sell when this close is more than
    // TRAIL_BPS below the peak close seen while holding.
    if (closeNow * 10_000n < peakClose * (10_000n - TRAIL_BPS)) {
      const order: OrderInput = {
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIP_BPS,
      };
      return [order];
    }
    return [];
  },
});
