import { describe, expect, it } from "vitest";
import { stageToolNamed } from "./player-tools-markup";

describe("the selector for a tool's frame on the stage", () => {
  it("quotes the tool's name as a CSS string", () => {
    expect(stageToolNamed("On Deck")).toBe('[data-stage-tool="On Deck"]');
    // Backslashes and quotes escaped with a backslash, a line break by its
    // code point: JSON's \n would read in CSS as a plain "n".
    expect(stageToolNamed('Say "hi"\\\nnow')).toBe(
      '[data-stage-tool="Say \\"hi\\"\\\\\\a now"]',
    );
  });
});
