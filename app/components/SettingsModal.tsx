"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserSettings } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings | null;
  onSave: (settings: UserSettings) => Promise<void>;
}

type TabId = "general" | "formats" | "sponsorblock" | "subtitles" | "updates" | "network";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "formats", label: "Formats" },
  { id: "sponsorblock", label: "SponsorBlock" },
  { id: "subtitles", label: "Subtitles" },
  { id: "updates", label: "Updates" },
  { id: "network", label: "Network" },
];

const SPONSORBLOCK_CATEGORIES = [
  { id: "sponsor", label: "Sponsor" },
  { id: "intro", label: "Intro" },
  { id: "outro", label: "Outro" },
  { id: "selfpromo", label: "Self-promo" },
  { id: "interaction", label: "Interaction" },
  { id: "music_offtopic", label: "Non-music" },
];

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize local settings when modal opens
  useEffect(() => {
    if (isOpen && settings) {
      setLocalSettings(JSON.parse(JSON.stringify(settings)));
      setError(null);
    }
  }, [isOpen, settings]);

  const handleSave = useCallback(async () => {
    if (!localSettings) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(localSettings);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }, [localSettings, onSave, onClose]);

  const updateGeneral = useCallback(
    <K extends keyof UserSettings["general"]>(key: K, value: UserSettings["general"][K]) => {
      setLocalSettings((prev) =>
        prev ? { ...prev, general: { ...prev.general, [key]: value } } : prev
      );
    },
    []
  );

  const updateFormats = useCallback(
    <K extends keyof UserSettings["formats"]>(key: K, value: UserSettings["formats"][K]) => {
      setLocalSettings((prev) =>
        prev ? { ...prev, formats: { ...prev.formats, [key]: value } } : prev
      );
    },
    []
  );

  const updateSponsorblock = useCallback(
    <K extends keyof UserSettings["sponsorblock"]>(
      key: K,
      value: UserSettings["sponsorblock"][K]
    ) => {
      setLocalSettings((prev) =>
        prev ? { ...prev, sponsorblock: { ...prev.sponsorblock, [key]: value } } : prev
      );
    },
    []
  );

  const updateSubtitles = useCallback(
    <K extends keyof UserSettings["subtitles"]>(key: K, value: UserSettings["subtitles"][K]) => {
      setLocalSettings((prev) =>
        prev ? { ...prev, subtitles: { ...prev.subtitles, [key]: value } } : prev
      );
    },
    []
  );

  const updateUpdates = useCallback(
    <K extends keyof UserSettings["updates"]>(key: K, value: UserSettings["updates"][K]) => {
      setLocalSettings((prev) =>
        prev ? { ...prev, updates: { ...prev.updates, [key]: value } } : prev
      );
    },
    []
  );

  const updateNetwork = useCallback(
    <K extends keyof UserSettings["network"]>(key: K, value: UserSettings["network"][K]) => {
      setLocalSettings((prev) =>
        prev ? { ...prev, network: { ...prev.network, [key]: value } } : prev
      );
    },
    []
  );

  const toggleSponsorblockCategory = useCallback((category: string) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      const categories = prev.sponsorblock.categories;
      const newCategories = categories.includes(category)
        ? categories.filter((c) => c !== category)
        : [...categories, category];
      return {
        ...prev,
        sponsorblock: { ...prev.sponsorblock, categories: newCategories },
      };
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex min-h-[400px]">
          {/* Sidebar */}
          <div className="w-48 shrink-0 border-r border-zinc-200 p-4 dark:border-zinc-800">
            <nav className="flex flex-col gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${activeTab === tab.id
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            {localSettings && (
              <>
                {/* General Tab */}
                {activeTab === "general" && (
                  <div className="space-y-6">
                    <div>
                      <label className="mb-2 block text-sm font-medium">Download Folder</label>
                      <input
                        type="text"
                        value={localSettings.general.download_folder}
                        onChange={(e) => updateGeneral("download_folder", e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Concurrent Downloads</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={localSettings.general.concurrency}
                        onChange={(e) => updateGeneral("concurrency", parseInt(e.target.value) || 2)}
                        className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={localSettings.general.auto_start}
                          onChange={(e) => updateGeneral("auto_start", e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Auto-start downloads when added</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={localSettings.general.notify_on_complete}
                          onChange={(e) => updateGeneral("notify_on_complete", e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Show notification when download completes</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={localSettings.general.show_advanced_by_default}
                          onChange={(e) =>
                            updateGeneral("show_advanced_by_default", e.target.checked)
                          }
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Show advanced options by default</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Formats Tab */}
                {activeTab === "formats" && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={localSettings.formats.prefer_mp4}
                          onChange={(e) => updateFormats("prefer_mp4", e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Prefer MP4 container when possible</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={localSettings.formats.embed_metadata}
                          onChange={(e) => updateFormats("embed_metadata", e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Embed metadata in files</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={localSettings.formats.embed_thumbnail}
                          onChange={(e) => updateFormats("embed_thumbnail", e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Embed thumbnail in files</span>
                      </label>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Max Video Height (0 = no limit)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={120}
                        value={localSettings.formats.max_video_height}
                        onChange={(e) =>
                          updateFormats("max_video_height", parseInt(e.target.value) || 0)
                        }
                        className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Filename Template</label>
                      <input
                        type="text"
                        value={localSettings.formats.filename_template}
                        onChange={(e) => updateFormats("filename_template", e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono dark:border-zinc-800 dark:bg-zinc-950"
                      />
                      <p className="mt-1 text-xs text-zinc-500">
                        Variables: %(title)s, %(id)s, %(uploader)s, %(ext)s
                      </p>
                    </div>
                  </div>
                )}

                {/* SponsorBlock Tab */}
                {activeTab === "sponsorblock" && (
                  <div className="space-y-6">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.sponsorblock.enabled_by_default}
                        onChange={(e) =>
                          updateSponsorblock("enabled_by_default", e.target.checked)
                        }
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Enable SponsorBlock by default</span>
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Mode</label>
                      <select
                        value={localSettings.sponsorblock.mode}
                        onChange={(e) => updateSponsorblock("mode", e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <option value="remove">Remove segments</option>
                        <option value="mark">Mark as chapters</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Categories</label>
                      <div className="space-y-2">
                        {SPONSORBLOCK_CATEGORIES.map((cat) => (
                          <label key={cat.id} className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={localSettings.sponsorblock.categories.includes(cat.id)}
                              onChange={() => toggleSponsorblockCategory(cat.id)}
                              className="h-4 w-4 rounded"
                            />
                            <span className="text-sm">{cat.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Subtitles Tab */}
                {activeTab === "subtitles" && (
                  <div className="space-y-6">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.subtitles.enabled_by_default}
                        onChange={(e) => updateSubtitles("enabled_by_default", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Download subtitles by default</span>
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Default Language</label>
                      <input
                        type="text"
                        value={localSettings.subtitles.default_language}
                        onChange={(e) => updateSubtitles("default_language", e.target.value)}
                        placeholder="en"
                        className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.subtitles.include_auto_captions}
                        onChange={(e) => updateSubtitles("include_auto_captions", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Include auto-generated captions</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.subtitles.embed_subtitles}
                        onChange={(e) => updateSubtitles("embed_subtitles", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Embed subtitles in video file</span>
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Preferred Format</label>
                      <select
                        value={localSettings.subtitles.preferred_format}
                        onChange={(e) => updateSubtitles("preferred_format", e.target.value)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <option value="srt">SRT</option>
                        <option value="vtt">VTT</option>
                        <option value="ass">ASS</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Updates Tab */}
                {activeTab === "updates" && (
                  <div className="space-y-6">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.updates.auto_update_app}
                        onChange={(e) => updateUpdates("auto_update_app", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Auto-update application</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.updates.auto_update_ytdlp}
                        onChange={(e) => updateUpdates("auto_update_ytdlp", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Auto-update yt-dlp</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.updates.auto_update_ffmpeg}
                        onChange={(e) => updateUpdates("auto_update_ffmpeg", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Auto-update ffmpeg</span>
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Check Interval (hours)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={localSettings.updates.check_interval_hours}
                        onChange={(e) =>
                          updateUpdates("check_interval_hours", parseInt(e.target.value) || 24)
                        }
                        className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>
                  </div>
                )}

                {/* Network Tab */}
                {activeTab === "network" && (
                  <div className="space-y-6">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localSettings.network.use_proxy}
                        onChange={(e) => updateNetwork("use_proxy", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Use proxy</span>
                    </label>

                    {localSettings.network.use_proxy && (
                      <div>
                        <label className="mb-2 block text-sm font-medium">Proxy URL</label>
                        <input
                          type="text"
                          value={localSettings.network.proxy_url}
                          onChange={(e) => updateNetwork("proxy_url", e.target.value)}
                          placeholder="socks5://127.0.0.1:9050"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Rate Limit (bytes/sec, 0 = no limit)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={localSettings.network.rate_limit_bps}
                        onChange={(e) =>
                          updateNetwork("rate_limit_bps", parseInt(e.target.value) || 0)
                        }
                        className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Retries on Failure</label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={localSettings.network.retries}
                        onChange={(e) => updateNetwork("retries", parseInt(e.target.value) || 3)}
                        className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Socket Timeout (seconds)</label>
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={localSettings.network.socket_timeout}
                        onChange={(e) =>
                          updateNetwork("socket_timeout", parseInt(e.target.value) || 30)
                        }
                        className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          {error && <span className="text-sm text-red-500">{error}</span>}
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isSaving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
