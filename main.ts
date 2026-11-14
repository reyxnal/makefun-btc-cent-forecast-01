// btc-cent-forecast-01: forecast Bitcoin's price 240 minutes ahead from the
// 4,320 one-minute closes of the 72 hours up to the checkpoint.
//
// Method (chosen after measuring on the kit's practice cases, where the
// checkpoint 240 minutes later is known from the next case's last close):
//   1. Short-horizon momentum: an exponentially weighted mean of the 1-minute
//      log returns with a 15-minute halflife, extrapolated 240 minutes and
//      shrunk hard (x0.2). Raw momentum overshoots on this series: on the
//      practice cases the unshrunk extrapolation scores far worse than
//      persistence, while the shrunk version beats it.
//   2. A small pull (10%) toward the trailing 24-hour mean, which trims the
//      worst misses when the price has run far from its recent level.
//   3. The guess is clamped to the price grid (5 decimals) and the scorer's
//      (0, 10,000,000) bounds.
//
// Measured on the five practice cases whose target is known (p00..p04):
//   persistence (last close):            mean error 47,055 cents
//   this forecaster:                      mean error 30,756 cents
// On 36 in-series checkpoints cut from the practice cases it scores
// 25,306 cents against persistence's 31,746. The final is scored on unseen
// prices, so no practice number is a promise — but the forecaster beats the
// house baseline on every evaluation we could run before the deadline.
//
// Deterministic: no randomness, no network, no clock, no state between runs.
// Node 22 standard library only. Reads every <id>.in in the input directory
// and writes <id>.out per case, exactly {"forecasts":[{"case":id,"price":n}]}.
//
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Halflife, in minutes, of the EWMA over 1-minute log returns. */
const MOMENTUM_HALFLIFE_MIN = 15;
/** Shrinkage applied to the 240-minute momentum extrapolation. */
const MOMENTUM_SHRINK = 0.2;
/** Weight pulled toward the trailing 24-hour mean price. */
const MEAN_REVERSION_WEIGHT = 0.1;
/** Length, in minutes, of the trailing mean window. */
const MEAN_WINDOW_MIN = 1440;
/** Forecast horizon, in minutes, fixed by the competition. */
const HORIZON_MIN = 240;
/** Cap on the extrapolated log move, so a violent quarter-hour spike can
 *  never throw the guess far from the last price (never binds on the
 *  practice cases, where the largest move is well under 1%). */
const MAX_LOG_MOVE = 0.02;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/**
 * Forecast one market's close HORIZON_MIN minutes after its last price.
 * Momentum term: EWMA of log returns, extrapolated and shrunk. Mean term:
 * trailing MEAN_WINDOW_MIN-minute arithmetic mean. The two are blended so
 * the guess stays near the last price unless the recent drift is persistent.
 */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const prices = m.prices;
  const last = prices[prices.length - 1] as number;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) {
    throw new Error(`market ${m.id}'s last price is not a finite positive number`);
  }

  // EWMA of 1-minute log returns. A flat stretch contributes zero drift,
  // a steady climb contributes a positive one; the halflife keeps the
  // estimate anchored to the last quarter-hour of trading.
  const alpha = 1 - Math.pow(0.5, 1 / MOMENTUM_HALFLIFE_MIN);
  let drift = 0;
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1] as number;
    const cur = prices[i] as number;
    if (prev > 0 && cur > 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
      drift = alpha * Math.log(cur / prev) + (1 - alpha) * drift;
    }
  }
  const move = Math.min(MAX_LOG_MOVE, Math.max(-MAX_LOG_MOVE, drift * HORIZON_MIN * MOMENTUM_SHRINK));
  const momentumPrice = last * Math.exp(move);

  // Trailing 24-hour mean (or the whole series when shorter).
  const window = Math.min(MEAN_WINDOW_MIN, prices.length);
  let sum = 0;
  for (let i = prices.length - window; i < prices.length; i++) sum += prices[i] as number;
  const meanPrice = sum / window;

  const guess = (1 - MEAN_REVERSION_WEIGHT) * momentumPrice + MEAN_REVERSION_WEIGHT * meanPrice;
  return price5(guess);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
