// Browser-only: keeps the browser's install offer (beforeinstallprompt) so both the
// occasional banner and the button in Settings can use it.

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function canInstall() {
  return deferred !== null;
}

// Already running as an installed app (home screen / desktop window)
export function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iPhone/iPad Safari never offers an install prompt: users add it via Share → Add to Home Screen
export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null;
  notify();
  return outcome === "accepted";
}

// ---- Banner pacing (per browser) ----
const SHOWN_KEY = "vh.pwa.bannerShownAt";
const DISMISSED_KEY = "vh.pwa.bannerDismissedAt";
const DAY = 24 * 60 * 60 * 1000;
// At most once a day, and after "Later" not again for two weeks
const SHOW_EVERY = DAY;
const QUIET_AFTER_DISMISS = 14 * DAY;

function readTime(key: string) {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeNow(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // storage unavailable: the banner just follows its in-memory state
  }
}

export function bannerAllowed() {
  const now = Date.now();
  return now - readTime(SHOWN_KEY) > SHOW_EVERY && now - readTime(DISMISSED_KEY) > QUIET_AFTER_DISMISS;
}
export const markBannerShown = () => writeNow(SHOWN_KEY);
export const markBannerDismissed = () => writeNow(DISMISSED_KEY);
