# Tuning the opening

The settings that shape the home page's opening: the camera's pan, swoop and swing-in, and the credits over it. Each one is named by its symbol, so search for it rather than trusting a line number.

To try a change: edit the value, run `npm run dev`, and reload `localhost:3000`. Then run `npx vitest run`. If a test fails, its name says which rule the change broke (the "Guarded by" columns below). Loosening a test is fine when the new feel is what you want; say why in the test's comment.

## How the opening runs

1. **Pan:** high and level, sweeping right to left across the canyon's shoulder at a steady speed.
2. **Swoop:** dives, banks right and speeds up through one long bend, then eases off.
3. **Swing-in:** glides round to rest on the name, at the pace of the 20th Century Fox intro.

The timeline runs the flight (pan and swoop) for `FLIGHT_TIMING.flight` seconds, then the swing-in for `FLIGHT_TIMING.turn`. The credits play over both.

Distances are world units. For scale, the camera flies 22 units above the canyon floor and the name plate stands 90 units ahead of where it settles.

## The pan

`PAN` in `src/components/world/flight.ts`.

| Setting | Now | What it does | Guarded by |
| --- | --- | --- | --- |
| `start` | `80` | How far right of the canyon's centre the pan starts. | "starts about 80 units right of the canyon's centre" (update it with the value) |
| `speed` | `40` | The pan's speed, units a second. Faster leaves the swoop more time, so its peak drops. | "pans steadily, then swoops ... 1.5 times the pan's speed" |
| `lift` | `40` | How high above cruise height the pan flies, which is also how far the swoop dives. | "stays well above the ground ...", "sees the plate the whole way ..." |
| `from` / `to` | `75°` / `35°` | The pan's heading at its start and end, off the canyon's line. A higher `from` slides more sideways at first. | "opens on a pan: sliding sideways ...", "swings the view through no more than 55 degrees ..." |
| `side` | `20` | How far left of the canyon's mouth the pan ends and the bank begins. | "banks right into the bend ... never left ..." |

## The swoop and the bank

Constants in `src/components/world/flight.ts`.

| Setting | Now | What it does | Guarded by |
| --- | --- | --- | --- |
| `MAX_BANK` | `0.32` | The steepest tilt, in radians (0.32 is about 18°). | "banks right into the bend ..." (under 35°) |
| `BANK_PER_CURVATURE` | `60` | How hard the camera leans into a given turn. | "banks right into the bend ..." |
| `BANK_IN` | `80` | Over how many units after the pan the tilt eases in. Higher is gentler. | "pans level, then rolls into the bends no faster than 65 degrees a second" |
| `RUN_IN_HANDLE` | `{ exit: 0.3, entry: 0.55 }` | The bend's shape: a higher `exit` swings wider left before turning back. | "flies it like a plane: no turn tighter than a 24-unit radius", "stays well above the ground ..." |
| `CRUISE_HEIGHT` | `22` | The flying height above the canyon floor, after the swoop's dive. | "stays well above the ground ..." |

## The swing-in

| Setting | Where | Now | What it does |
| --- | --- | --- | --- |
| `FLIGHT_TIMING.turn` | `src/components/world/rigs.ts` | `4` | How long the swing-in takes, in seconds. Longer is slower and more Fox-like. |
| `TURN_EASE` | `src/components/world/rigs.ts` | `sine.out`, `Math.PI / 2` | The swing's easing curve and its opening speed over its average. Change both together (see below). |
| `TURN_IN` | `src/components/world/flight.ts` | `40°` | How far round the swing starts from the final view. |
| `TURN_RADIUS` | `src/components/world/flight.ts` | `125` | How wide the swing's arc is at its start. |

`TURN_EASE.opening` has to match `TURN_EASE.name`, or the camera jumps in speed as the swing begins:

| `name` | `opening` | Feel |
| --- | --- | --- |
| `"sine.out"` | `Math.PI / 2` | Gentle glide (now) |
| `"power1.out"` | `2` | A little firmer |
| `"power2.out"` | `3` | Brakes hard |

Guarded by "eases off into the turn-in at its speed: no lurch at the join", which assumes `sine.out`. Update its `clock` helper if you change the ease.

## Timing and credits

| Setting | Where | Now | What it does |
| --- | --- | --- | --- |
| `FLIGHT_TIMING.flight` | `src/components/world/rigs.ts` | `6.5` | Seconds from the start to the swing-in. The pan's speed is fixed, so a longer flight gives a gentler swoop. |
| `CREDIT.first` | `src/components/flight-timeline.ts` | `2` | When the first credit appears, in seconds. |
| `CREDIT.every` | `src/components/flight-timeline.ts` | `2` | The gap between credits. Each is fully up for `every - fade`. |
| `CREDIT.fade` | `src/components/flight-timeline.ts` | `0.2` | Each credit's fade in and out. |
| `credits.lines` | `src/content/site.ts` | | The credits' copy, as `Role: name`. |
| `EDGE` | `src/components/hero-world.tsx` | `24` | The gap, in CSS pixels, between a credit card and the screen's edges and Skip. |

Keep `CREDIT.first + 4 × CREDIT.every + CREDIT.fade` at or below `FLIGHT_TIMING.flight + FLIGHT_TIMING.turn`, or the last credit is still up when the opening ends. Guarded by "shows the credits one at a time ..." and "runs 10.25 to 10.75 seconds ..." in `src/components/flight-timeline.test.ts`, and the e2e check that the opening settles within 12 seconds in `e2e/flight.spec.ts`. Update those ranges when you change the length on purpose.

## Where the rules live

- `src/components/world/flight.test.ts`: the camera's path, speed and bank, for a desktop and a phone layout.
- `src/components/flight-timeline.test.ts`: the opening's length and the credits' timing.
- `e2e/flight.spec.ts`: the opening in a real browser, including that no credit card ever covers Skip.
- `docs/HANDOFF.md`: the opening's description; keep it in step with big changes.
