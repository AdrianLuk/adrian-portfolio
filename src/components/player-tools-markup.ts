/**
 * The Player tools scene's markup: the attributes the page writes and its
 * scripts (and tests) find it by, each named once. A name comes as a JSX prop
 * object to write it and a selector to find it, or as a function where it
 * carries a value.
 *
 * Two stay literal in CSS, where nothing can import them: the `pinned`
 * variant in globals.css (a test holds it to `data-scene`), and the toggle's
 * `group-data-paused:` classes.
 */

const PLAYER_TOOLS = "data-player-tools";
const TOOL_COPY = "data-tool-copy";
const TOOL_STAGE = "data-tool-stage";
const STAGE_TOOL = "data-stage-tool";
const STAGE_PROGRESS = "data-stage-progress";
const STAGE_TOGGLE = "data-stage-toggle";

/**
 * A value as a quoted CSS string: backslashes and quotes escaped, and line
 * breaks by their code points. Written out, as `CSS.escape` is browser-only
 * and the e2e tests build selectors in Node.
 */
const cssString = (value: string) =>
  `"${value
    .replace(/[\\"]/g, "\\$&")
    .replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;

/** The scene's root. */
export const playerTools = { [PLAYER_TOOLS]: "" } as const;
export const playerToolsSelector = `[${PLAYER_TOOLS}]`;

/**
 * On the scene's root while it pins: "pending" from the page's early script,
 * "loading" once the island has taken it over, "pinned" once the motion
 * runs. Without it, the scene is the stacked list.
 */
export const SCENE = "data-scene";
export const SCENE_STATES = {
  pending: "pending",
  loading: "loading",
  pinned: "pinned",
} as const;

/** One tool's copy block. */
export const toolCopy = { [TOOL_COPY]: "" } as const;
export const toolCopySelector = `[${TOOL_COPY}]`;

/** The stage beside the copy. */
export const toolStage = { [TOOL_STAGE]: "" } as const;
export const toolStageSelector = `[${TOOL_STAGE}]`;

/** One tool's frame on the stage, named for its tool. */
export const stageTool = (name: string) => ({ [STAGE_TOOL]: name }) as const;
export const stageToolSelector = `[${STAGE_TOOL}]`;
export const stageToolNamed = (name: string) =>
  `[${STAGE_TOOL}=${cssString(name)}]`;

/** The progress bar through the set. */
export const stageProgress = { [STAGE_PROGRESS]: "" } as const;
export const stageProgressSelector = `[${STAGE_PROGRESS}]`;

/** A tool's Pause/Play button for its recording on the stage. */
export const stageToggle = { [STAGE_TOGGLE]: "" } as const;
export const stageToggleSelector = `[${STAGE_TOGGLE}]`;

/** On a tool's toggle while its reader has paused it. */
export const PAUSED = "data-paused";
