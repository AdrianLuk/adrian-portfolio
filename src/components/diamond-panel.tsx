import { diamondPanel } from "@/content/site";
import { accents, holoPanel, PanelCorners, PlayButton } from "./highlight-panel";
import { Recording } from "./recording";

const { bracket, glow } = accents.cyan;

/**
 * The Diamond's panel on home, after the Highlights: a way into the Home Run
 * Derby, with a clip of it and a play button, in the Diamond's own cyan.
 * Like a Highlight's, it stands left on a wide screen with the park framed
 * right of it, lights (data-lit) as it enters and drifts with the park; but
 * the Diamond is no Lit site, so nothing in the world lights for it.
 */
export function DiamondPanel() {
  const { id, eyebrow, heading, line, clip, link } = diamondPanel;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`${holoPanel} ${glow}`}>
      <PanelCorners className={bracket} />
      <p className="font-display text-sm tracking-[0.3em] text-cyan uppercase [font-stretch:75%]">
        {eyebrow}
      </p>
      <h2
        id={`${id}-heading`}
        className="mt-2 font-display text-3xl font-bold [font-stretch:120%]"
      >
        {heading}
      </h2>
      <p className="mt-4 leading-relaxed text-ink/90">{line}</p>
      <div className="mt-6">
        <Recording recording={clip} />
      </div>
      <p className="mt-4">
        <PlayButton link={link} light="cyan" />
      </p>
    </section>
  );
}
