/** Fixed, aggregate-only usage events. No player or browser-ranking data is accepted. */
export const USAGE_EVENTS = [
  "vote",
  "skip",
  "export-csv",
  "export-txt",
  "export-json",
  "reset-ranking",
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

interface GoatCounter {
  count(event: { path: string; title: string; event: true }): void;
}

export interface AnalyticsEnvironment {
  goatcounter?: GoatCounter;
  navigator?: Pick<Navigator, "doNotTrack">;
}

const EVENT_DETAILS: Record<UsageEvent, { path: UsageEvent; title: string }> = {
  vote: { path: "vote", title: "Vote" },
  skip: { path: "skip", title: "Skip" },
  "export-csv": { path: "export-csv", title: "Export CSV" },
  "export-txt": { path: "export-txt", title: "Export TXT" },
  "export-json": { path: "export-json", title: "Export JSON" },
  "reset-ranking": { path: "reset-ranking", title: "Reset ranking" },
};

function browserAnalyticsEnvironment(): AnalyticsEnvironment {
  const browser = globalThis as typeof globalThis & { goatcounter?: GoatCounter };
  return { goatcounter: browser.goatcounter, navigator: browser.navigator };
}

/**
 * Sends only one fixed aggregate event when GoatCounter is available. Analytics
 * failures are deliberately isolated from the browser-local ranking experience.
 */
export function trackUsageEvent(
  event: UsageEvent,
  environment: AnalyticsEnvironment = browserAnalyticsEnvironment(),
): void {
  if (environment.navigator?.doNotTrack === "1") return;
  const details = EVENT_DETAILS[event];
  if (!details || typeof environment.goatcounter?.count !== "function") return;
  try {
    environment.goatcounter.count({ ...details, event: true });
  } catch {
    // Optional analytics must never affect the user action.
  }
}
