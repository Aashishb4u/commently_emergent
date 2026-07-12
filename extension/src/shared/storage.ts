/**
 * Chrome storage wrapper for user preferences.
 * Only non-sensitive settings are stored. No cookies, tokens, or credentials.
 */
import type { UserSettings } from "./types";

const DEFAULTS: UserSettings = {
  enabled: true,
  tone: "professional",
  length: "medium",
  customInstructions: "",
  backendUrl: "https://fa11e900-0ed5-478d-b3c5-52e75643b8b9.preview.emergentagent.com",
  keywords: "",
  maxPosts: 5,
};

const KEY = "commently.settings.v2";

export async function getSettings(): Promise<UserSettings> {
  const raw = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(raw[KEY] ?? {}) };
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChange(cb: (s: UserSettings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== "local" || !changes[KEY]) return;
    cb({ ...DEFAULTS, ...(changes[KEY].newValue ?? {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export { DEFAULTS };
