import { Color, Vector3, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { ADRIAN, createMii, ROBOT, type Mii } from "./mii";

const STEP = 1 / 60;

/** Runs the figure's motions on for `seconds`, standing still with no ball near. */
function run(mii: Mii, seconds: number, speed = 0) {
  for (let t = 0; t < seconds - 1e-9; t += STEP) mii.update(STEP, speed, null);
}

const part = (mii: Mii, name: string) => mii.group.getObjectByName(name) as Object3D;

const where = (object: Object3D) => {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(new Vector3());
};

const adrian = () => createMii({ color: new Color("#3df2e6"), build: ADRIAN, name: "ADRIAN" });
const robot = () => createMii({ color: new Color("#ff6fd8"), build: ROBOT, robot: true });

describe("a light-built Mii", () => {
  it("turns its shoulders into a forehand one way and a backhand the other", () => {
    const fore = adrian();
    fore.swing(1);
    run(fore, 0.08);
    const back = adrian();
    back.swing(-1);
    run(back, 0.08);
    expect(part(fore, "upper").rotation.y).toBeGreaterThan(0.2);
    expect(part(back, "upper").rotation.y).toBeLessThan(-0.2);
    // And comes back square once the swing's done.
    run(fore, 1);
    expect(Math.abs(part(fore, "upper").rotation.y)).toBeLessThan(0.05);
  });

  it("cheers a point won: both arms up overhead, hopping", () => {
    const mii = adrian();
    mii.cheer();
    let highest = 0;
    for (let t = 0; t < 0.5; t += STEP) {
      mii.update(STEP, 0, null);
      highest = Math.max(highest, part(mii, "body").position.y);
    }
    expect(part(mii, "armLeft").rotation.z).toBeLessThan(-2);
    expect(part(mii, "armRight").rotation.z).toBeGreaterThan(2);
    expect(highest).toBeGreaterThan(0.2);
  });

  it("slumps at a point lost: the head drops", () => {
    const mii = robot();
    mii.slump();
    run(mii, 0.55);
    expect(part(mii, "head").rotation.x).toBeLessThan(-0.2);
  });

  it("strides while it runs, and stands still in a neutral pose when told to hold still", () => {
    const moving = adrian();
    let stride = 0;
    for (let t = 0; t < 0.5; t += STEP) {
      moving.update(STEP, 12, null);
      stride = Math.max(stride, Math.abs(part(moving, "legLeft").rotation.x));
    }
    expect(stride).toBeGreaterThan(0.3);

    const still = adrian();
    still.setStill(true);
    still.cheer();
    for (let t = 0; t < 0.5; t += STEP) {
      still.update(STEP, 12, null);
      expect(part(still, "legLeft").rotation.x).toBe(0);
      expect(part(still, "body").position.y).toBe(0);
    }
    expect(Math.abs(part(still, "armLeft").rotation.z)).toBeLessThan(0.5);
  });

  it("holds both hands on a point it reaches for, as a batter grips the bat", () => {
    const mii = adrian();
    const grip = new Vector3(0.2, 2.7, -1.1);
    mii.reachFor(grip);
    run(mii, 0.5);
    for (const hand of ["handLeft", "handRight"]) {
      expect(where(part(mii, hand)).distanceTo(grip)).toBeLessThan(0.1);
    }
    mii.reachFor(null);
    run(mii, 1);
    expect(where(part(mii, "handRight")).distanceTo(grip)).toBeGreaterThan(0.5);
  });

  it("throws: the arm comes from back behind the head through over the top to the front", () => {
    const mii = robot();
    mii.throw();
    run(mii, 0.08);
    expect(part(mii, "armRight").rotation.x).toBeLessThan(-1.5);
    run(mii, 0.3);
    expect(part(mii, "armRight").rotation.x).toBeGreaterThan(1);
  });
});
