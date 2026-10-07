import type { PlayerTool } from "@/content/site";
import { RecordingVideo } from "./recording-video";
import { isSideways, Screenshot } from "./screenshot";

const frameClass = "overflow-hidden rounded-xl border border-fog bg-dusk";

/**
 * The Player tools' device stage: each tool's desktop shot (or its recording,
 * where it has one) with its phone shot overlapping it, one tool at a time,
 * and a progress mark through the set (never a count). A visual layer only,
 * so it is hidden from assistive technology (each tool's copy carries its own
 * images) and holds nothing focusable. Shown only while the scene pins.
 */
export function ToolStage({ tools }: { tools: readonly PlayerTool[] }) {
  return (
    <div
      data-tool-stage
      aria-hidden="true"
      className="sticky top-24 hidden h-[calc(100vh-6rem)] items-center self-start pinned:flex"
    >
      <div className="relative aspect-[4/3] w-full max-w-[calc((100vh-8rem)*4/3)]">
        {tools.map((tool, i) => {
          const { desktop, phone } = tool.screenshots;
          return (
            <div
              key={tool.name}
              data-stage-tool={tool.name}
              className={`absolute inset-0 ${i === 0 ? "" : "invisible opacity-0"}`}
            >
              <div
                className={`absolute top-0 left-0 aspect-[16/10] w-[88%] ${frameClass}`}
              >
                {tool.recording ? (
                  <RecordingVideo
                    recording={tool.recording}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Screenshot
                    image={desktop}
                    decorative
                    className="h-full w-full object-cover object-top"
                  />
                )}
              </div>
              <div
                className={`absolute right-0 bottom-0 shadow-[0_0_2rem_var(--color-night)] ${frameClass} ${isSideways(phone) ? "w-[55%]" : "h-[70%]"}`}
                style={{ aspectRatio: `${phone.width} / ${phone.height}` }}
              >
                <Screenshot
                  image={phone}
                  decorative
                  className="h-full w-full object-cover object-top"
                />
              </div>
            </div>
          );
        })}
        <div className="absolute bottom-1 left-0 h-1 w-1/3 overflow-hidden rounded-full bg-fog">
          <div
            data-stage-progress
            className="h-full w-full origin-left scale-x-0 bg-cyan"
          />
        </div>
      </div>
    </div>
  );
}
