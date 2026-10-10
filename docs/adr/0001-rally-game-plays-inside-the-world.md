# The Rally game plays inside the world

The Rally game draws its ball, players and Dinkbot into the one world's own scene, on the Juice Bros court, rather than into a scene and canvas of its own. `/rally` is a second view of the court's Place (behind the player's baseline, as the game's camera framed it), so navigations to and from it are Transits, and Case study ↔ `/rally` moves the camera round the court between its two views.

We rejected three alternatives:

- **A separate scene behind a crossfade** (what `/rally` had): every navigation to the game cut away from the world, and phones held a second scene's GPU memory and shaders.
- **The live world behind the game's own canvas**: two GPU scenes drawing at once on a phone, which is where most visitors play.
- **Flying to the court, then parking the world behind a still while the game draws its own scene**: the hand-over shows as a swap, and the Place the camera flew to stops being live.

One scene keeps phones to one GPU context and one set of shaders, the camera hands over to the game without a seam, and every Place the camera flies to stays live (Toronto's weather included). The cost: the world's frame loop now carries the game's objects while it plays, and the game's code must wait for the camera to land before it builds them, so a Transit to `/rally` doesn't stutter.
