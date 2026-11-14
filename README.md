# BTC cent forecast 01

Forecast Bitcoin's US-dollar price 240 minutes ahead, from the 4,320
one-minute closes of the 72 hours up to each checkpoint.

## Method

The entry is `main.ts` (Node 22, standard library only, no network, fully
deterministic). For each case it:

1. Takes an exponentially weighted mean of the 1-minute log returns with a
   15-minute halflife, extrapolates it 240 minutes, and shrinks it hard
   (×0.2) — raw momentum overshoots badly on this series, the shrunk version
   does not.
2. Pulls the guess 10% toward the trailing 24-hour mean price, trimming the
   worst misses when the price has run far from its recent level.
3. Clamps the result to the price grid (5 decimals) and the scorer's
   (0, 10,000,000) bounds.

## Measured on the practice cases

The kit's practice has six cases; the target of p00–p04 is known from the
next case's last close. Mean absolute error, in cents:

| forecaster | p00–p04 |
|---|---:|
| persistence (last close, the house baseline) | 47,055 |
| this entry | 30,756 |

On 36 checkpoints cut inside the practice series it scores 25,306 cents
against persistence's 31,746. The final is scored on unseen prices, so no
practice number is a promise — but the entry beats the house baseline on
every evaluation that could be run before the deadline.

## Run locally

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `<id>.in` in the input directory and writes `<id>.out` per case:
`{"forecasts":[{"case":"<id>","price":<number>}]}`.

## License

MIT.
