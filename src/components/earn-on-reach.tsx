"use client";

import { useEffect } from "react";
import { earnAchievement, type AchievementId } from "./achievements";

/**
 * Earns `achievement` once the element `target` names is reached: its top
 * past the screen's middle. Renders nothing; works with reduced motion and
 * without WebGL, since it reads the page, not the world.
 */
export function EarnOnReach({
  target,
  achievement,
}: {
  target: string;
  achievement: Exclude<AchievementId, "first-blood">;
}) {
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) earnAchievement(achievement);
      },
      { rootMargin: "0px 0px -50% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, achievement]);
  return null;
}
