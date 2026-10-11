import type { CSSProperties } from "react";
import { encore } from "@/content/site";

/**
 * The wall of light tickets, one per K-pop concert Adrian has been to: a
 * plain list of text, there from the first paint, each ticket lit in its
 * group's colour once the About page's scroll route sets `data-lit` on the
 * K-pop panel round it (src/app/globals.css).
 */
export function TicketWall({ className = "" }: { className?: string }) {
  return (
    <ul
      aria-label={encore.wallLabel}
      className={`grid grid-cols-2 gap-1.5 md:max-w-md ${className}`}
    >
      {encore.tickets.map((ticket, i) => (
        <li
          key={`${ticket.group}-${ticket.year}`}
          className="ticket"
          style={
            {
              "--ticket": ticket.colors[0],
              "--ticket-2": ticket.colors.at(-1),
              "--i": i,
            } as CSSProperties
          }
        >
          <span className="font-display text-xs font-bold sm:text-sm sm:[font-stretch:110%]">
            {ticket.group}
          </span>{" "}
          <span className="text-sm text-ink/80">{ticket.year}</span>
        </li>
      ))}
    </ul>
  );
}
