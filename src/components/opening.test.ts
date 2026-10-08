import { describe, expect, it, vi } from "vitest";
import {
  createOpening,
  type CardPlacement,
  type Flight,
  type OpeningPhase,
  type OpeningStage,
  type PlayFlight,
  type StageLayout,
} from "./opening";
import { FLIGHT_START_RIG, SETTLED_RIG } from "./world/rigs";

/** A flight timeline the test moves on by hand. */
function manualTimeline() {
  let flight: Flight | null = null;
  const playing = () => {
    if (!flight) throw new Error("no flight is playing");
    return flight;
  };
  const timeline = {
    finish: vi.fn(() => {
      const f = playing();
      Object.assign(f.rig, SETTLED_RIG);
      for (const c of f.credits) c.opacity = 0;
      f.onUpdate();
      f.onComplete();
    }),
    stop: vi.fn(),
  };
  const play = vi.fn<PlayFlight>((f) => {
    flight = f;
    return timeline;
  });
  return {
    play,
    timeline,
    /** One step of the timeline: `change` moves its values on. */
    step(change: (flight: Flight) => void) {
      const f = playing();
      change(f);
      f.onUpdate();
    },
    /** It runs out. */
    runOut() {
      playing().onComplete();
    },
  };
}

const card = { left: 400, top: 300, width: 200, height: 100 };

/** A hero 1000 by 800, Skip's top at 700, its four cards laid out at `card`. */
function heroStage(layout: Partial<StageLayout> = {}) {
  const cards = new Map<number, { opacity: number; at?: CardPlacement }>();
  const stage = {
    cards: 4,
    measure: () => ({
      width: 1000,
      height: 800,
      skipTop: 700,
      cards: [card, card, card, card],
      ...layout,
    }),
    project: vi.fn<OpeningStage["project"]>(() => null),
    show: vi.fn<OpeningStage["show"]>((i, opacity, at) => {
      cards.set(i, { opacity, at: at ?? cards.get(i)?.at });
    }),
    clear: vi.fn(),
    focusAction: vi.fn(),
  } satisfies OpeningStage;
  return { stage, cards };
}

function setup({
  rejoined = false,
  reduced = false,
  load,
}: {
  rejoined?: boolean;
  reduced?: boolean;
  load?: () => Promise<PlayFlight>;
} = {}) {
  const director = {
    openingStarts: vi.fn(),
    openingAt: vi.fn(),
    openingLands: vi.fn(),
  };
  const manual = manualTimeline();
  const loads = vi.fn(load ?? (async () => manual.play));
  const opening = createOpening({ rejoined, reduced, director, load: loads });
  const phases: OpeningPhase[] = [];
  opening.subscribe(() => phases.push(opening.phase()));
  const { stage, cards } = heroStage();
  return { opening, director, manual, loads, phases, stage, cards };
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("the Opening", () => {
  it("starts the camera at the flight's start, flies once its timeline has loaded, and settles when it runs out", async () => {
    const { opening, director, manual, phases, stage } = setup();
    expect(opening.phase()).toBe("loading");
    opening.prepare();
    expect(director.openingStarts).toHaveBeenCalledOnce();

    await opening.fly(stage);
    expect(opening.phase()).toBe("flight");
    manual.step((f) => (f.rig.flight = 0.5));
    expect(director.openingAt).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...FLIGHT_START_RIG, flight: 0.5 }),
    );

    manual.runOut();
    expect(opening.phase()).toBe("settled");
    expect(director.openingLands).toHaveBeenCalledOnce();
    expect(phases).toEqual(["flight", "settled"]);
  });

  it("joining a live world has landed: the camera settled, and it never flies", async () => {
    const { opening, director, loads, stage } = setup({ rejoined: true });
    expect(opening.phase()).toBe("settled");
    opening.prepare();
    expect(director.openingLands).toHaveBeenCalledOnce();
    expect(director.openingStarts).not.toHaveBeenCalled();
    await opening.fly(stage);
    expect(loads).not.toHaveBeenCalled();
  });

  it("never flies under reduced motion", async () => {
    const { opening, director, loads, stage } = setup({ reduced: true });
    expect(opening.phase()).toBe("reduced");
    opening.prepare();
    expect(director.openingLands).toHaveBeenCalledOnce();
    await opening.fly(stage);
    expect(loads).not.toHaveBeenCalled();
  });

  it("Skip hands focus on to the hero's action and finishes the flight, the cards gone", async () => {
    const { opening, manual, stage, cards } = setup();
    await opening.fly(stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    opening.skip();
    expect(stage.focusAction).toHaveBeenCalledOnce();
    expect(manual.timeline.finish).toHaveBeenCalledOnce();
    expect(opening.phase()).toBe("settled");
    expect(cards.get(0)?.opacity).toBe(0);
  });

  it("Skip does nothing once it has landed", async () => {
    const { opening, manual, stage } = setup();
    await opening.fly(stage);
    manual.runOut();
    opening.skip();
    expect(stage.focusAction).not.toHaveBeenCalled();
    expect(manual.timeline.finish).not.toHaveBeenCalled();
  });

  it("reducing motion mid-flight stops the timeline, hands the cards back to the page, and lands", async () => {
    const { opening, director, manual, phases, stage } = setup();
    await opening.fly(stage);
    opening.reducedMotion(true);
    expect(manual.timeline.stop).toHaveBeenCalledOnce();
    expect(stage.clear).toHaveBeenCalledOnce();
    expect(director.openingLands).toHaveBeenCalledOnce();
    expect(phases).toEqual(["flight", "reduced"]);
  });

  it("allowing motion again settles rather than replaying the opening", async () => {
    const { opening, loads, stage } = setup({ reduced: true });
    opening.reducedMotion(false);
    expect(opening.phase()).toBe("settled");
    await opening.fly(stage);
    expect(loads).not.toHaveBeenCalled();
  });

  it("a timeline still loading when motion is reduced never plays", async () => {
    const loading = deferred<PlayFlight>();
    const { opening, manual, stage } = setup({ load: () => loading.promise });
    const flying = opening.fly(stage);
    opening.reducedMotion(true);
    loading.resolve(manual.play);
    await flying;
    expect(manual.play).not.toHaveBeenCalled();
    expect(opening.phase()).toBe("reduced");
  });

  it("a timeline that fails to load lands without the flight", async () => {
    const { opening, director, stage } = setup({
      load: () => Promise.reject(new Error("stale chunk")),
    });
    await opening.fly(stage);
    expect(opening.phase()).toBe("settled");
    expect(director.openingLands).toHaveBeenCalledOnce();
  });

  it("with no world to fly through it lands, the timeline loaded or not", async () => {
    const loading = deferred<PlayFlight>();
    const early = setup({ load: () => loading.promise });
    const flying = early.opening.fly(early.stage);
    early.opening.end();
    expect(early.opening.phase()).toBe("settled");
    loading.resolve(early.manual.play);
    await flying;
    expect(early.manual.play).not.toHaveBeenCalled();

    const late = setup();
    await late.opening.fly(late.stage);
    late.opening.end();
    expect(late.manual.timeline.finish).toHaveBeenCalledOnce();
    expect(late.opening.phase()).toBe("settled");
  });

  it("the hero leaving stops the timeline; coming back flies again from the start", async () => {
    const { opening, director, manual, stage } = setup();
    await opening.fly(stage);
    manual.step((f) => (f.rig.flight = 0.5));
    opening.stop();
    expect(manual.timeline.stop).toHaveBeenCalledOnce();
    expect(director.openingLands).not.toHaveBeenCalled();

    await opening.fly(stage);
    expect(manual.play).toHaveBeenCalledTimes(2);
    expect(manual.play.mock.calls[1][0].rig).toEqual(FLIGHT_START_RIG);
  });
});

describe("the Opening's credits", () => {
  it("places only the cards that show, each flush to its side of the frame", async () => {
    const { opening, manual, stage, cards } = setup();
    await opening.fly(stage);
    manual.step((f) => (f.credits[0].opacity = 0.6));
    expect(cards.get(0)).toMatchObject({ opacity: 0.6, at: { align: "left" } });
    for (const i of [1, 2, 3]) expect(cards.get(i)).toEqual({ opacity: 0 });

    manual.step((f) => {
      f.credits[0].opacity = 0;
      f.credits[1].opacity = 1;
    });
    expect(cards.get(1)).toMatchObject({ opacity: 1, at: { align: "right" } });
    expect(cards.get(0)?.opacity).toBe(0);
  });

  it("on a narrow screen they stand centred, above and below the plate", async () => {
    const { opening, manual, cards } = setup();
    const narrow = heroStage({ width: 400, height: 800 });
    await opening.fly(narrow.stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    expect(narrow.cards.get(0)?.at?.align).toBe("center");
    expect(narrow.stage.project).toHaveBeenCalledWith(0, { x: 0, y: 0.5 });
    expect(cards.size).toBe(0);
  });

  it("without a world, a card stands at its spot on the hero", async () => {
    const { opening, manual, stage, cards } = setup();
    await opening.fly(stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    // Spot (-0.42, -0.42) on a 1000 by 800 hero: 290, 568.
    expect(cards.get(0)?.at).toEqual({
      dx: expect.closeTo(290 - (card.left + card.width / 2)),
      dy: expect.closeTo(568 - (card.top + card.height / 2)),
      scale: 1,
      align: "left",
    });
  });

  it("keeps a card clear of the hero's edges, and its foot above Skip", async () => {
    const { opening, manual, stage, cards } = setup();
    stage.project.mockReturnValue({ x: 2000, y: 2000, scale: 1 });
    await opening.fly(stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    // Right edge: 1000 - 100 - 24. Foot: Skip's top, 700, less 24.
    expect(cards.get(0)?.at).toMatchObject({
      dx: 876 - (card.left + card.width / 2),
      dy: 676 - 50 - (card.top + card.height / 2),
    });

    stage.project.mockReturnValue({ x: -50, y: -50, scale: 1 });
    manual.step((f) => (f.credits[0].opacity = 0.9));
    expect(cards.get(0)?.at).toMatchObject({
      dx: 124 - (card.left + card.width / 2),
      dy: 74 - (card.top + card.height / 2),
    });
  });

  it("shrinks a card that wouldn't fit across the hero", async () => {
    const { opening, manual } = setup();
    const small = heroStage({ width: 248, height: 200 });
    small.stage.project.mockReturnValue({ x: 124, y: 100, scale: 1.1 });
    await opening.fly(small.stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    // 248 less 24 each side, over a 200-wide card.
    expect(small.cards.get(0)?.at?.scale).toBe(1);
    const wide = heroStage({
      width: 248,
      height: 200,
      cards: Array(4).fill({ ...card, width: 400 }),
    });
    wide.stage.project.mockReturnValue({ x: 124, y: 100, scale: 1.1 });
    opening.stop();
    await opening.fly(wide.stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    expect(wide.cards.get(0)?.at?.scale).toBe(0.5);
  });

  it("without Skip on screen, the foot is the hero's own", async () => {
    const { opening, manual } = setup();
    const noSkip = heroStage({ skipTop: null });
    noSkip.stage.project.mockReturnValue({ x: 500, y: 2000, scale: 1 });
    await opening.fly(noSkip.stage);
    manual.step((f) => (f.credits[0].opacity = 1));
    expect(noSkip.cards.get(0)?.at?.dy).toBe(
      800 - 24 - 50 - (card.top + card.height / 2),
    );
  });
});
