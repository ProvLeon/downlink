"use client";

import { useCallback, useState } from "react";

export interface AdvancedOptionsState {
  // Format options
  formatId: string;
  preferredQuality: string;
  preferredFormat: string;

  // Output options
  filenameTemplate: string;

  // Subtitle options
  subtitlesEnabled: boolean;
  subtitlesLanguage: string;
  subtitlesEmbed: boolean;
  subtitlesAutoCaptions: boolean;

  // SponsorBlock options
  sponsorBlockEnabled: boolean;
  sponsorBlockMode: "remove" | "mark";
  sponsorBlockCategories: string[];

  // Metadata options
  embedMetadata: boolean;
  embedThumbnail: boolean;
  writeInfoJson: boolean;

  // Network options
  useProxy: boolean;
  proxyUrl: string;
  rateLimit: string;
  retries: number;

  // Post-processing
  remuxVideo: boolean;
  preferredRemuxFormat: string;
}

const DEFAULT_OPTIONS: AdvancedOptionsState = {
  formatId: "",
  preferredQuality: "best",
  preferredFormat: "mp4",
  filenameTemplate: "%(title)s [%(id)s].%(ext)s",
  subtitlesEnabled: false,
  subtitlesLanguage: "en",
  subtitlesEmbed: false,
  subtitlesAutoCaptions: false,
  sponsorBlockEnabled: false,
  sponsorBlockMode: "remove",
  sponsorBlockCategories: ["sponsor"],
  embedMetadata: true,
  embedThumbnail: true,
  writeInfoJson: false,
  useProxy: false,
  proxyUrl: "",
  rateLimit: "",
  retries: 3,
  remuxVideo: false,
  preferredRemuxFormat: "mp4",
};

const QUALITY_OPTIONS = [
  { value: "best", label: "Best available" },
  { value: "2160", label: "4K (2160p)" },
  { value: "1440", label: "1440p" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
  { value: "audio", label: "Audio only" },
];

const FORMAT_OPTIONS = [
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WebM" },
  { value: "m4a", label: "M4A (audio)" },
  { value: "mp3", label: "MP3 (audio)" },
  { value: "opus", label: "Opus (audio)" },
];

const SPONSORBLOCK_CATEGORIES = [
  { id: "sponsor", label: "Sponsor", description: "Paid promotion" },
  { id: "intro", label: "Intro", description: "Intro animation/sequence" },
  { id: "outro", label: "Outro", description: "Outro/end cards" },
  { id: "selfpromo", label: "Self-promo", description: "Self-promotion" },
  { id: "interaction", label: "Interaction", description: "Subscribe reminders" },
  { id: "music_offtopic", label: "Non-music", description: "Non-music in music videos" },
  { id: "preview", label: "Preview", description: "Preview/recap" },
  { id: "filler", label: "Filler", description: "Filler content" },
];

const SUBTITLE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "ru", label: "Russian" },
];

interface AdvancedOptionsProps {
  isOpen: boolean;
  onClose: () => void;
  options: AdvancedOptionsState;
  onOptionsChange: (options: AdvancedOptionsState) => void;
  onApply: (options: AdvancedOptionsState) => void;
}

type TabId = "format" | "subtitles" | "sponsorblock" | "metadata" | "network";

export function AdvancedOptions({
  isOpen,
  onClose,
  options,
  onOptionsChange,
  onApply,
}: AdvancedOptionsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("format");
  const [localOptions, setLocalOptions] = useState<AdvancedOptionsState>(options);

  const updateOption = useCallback(
    <K extends keyof AdvancedOptionsState>(key: K, value: AdvancedOptionsState[K]) => {
      setLocalOptions((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const toggleSponsorBlockCategory = useCallback((category: string) => {
    setLocalOptions((prev) => {
      const categories = prev.sponsorBlockCategories;
      const newCategories = categories.includes(category)
        ? categories.filter((c) => c !== category)
        : [...categories, category];
      return { ...prev, sponsorBlockCategories: newCategories };
    });
  }, []);

  const handleApply = useCallback(() => {
    onOptionsChange(localOptions);
    onApply(localOptions);
    onClose();
  }, [localOptions, onOptionsChange, onApply, onClose]);

  const handleReset = useCallback(() => {
    setLocalOptions(DEFAULT_OPTIONS);
  }, []);

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "format",
      label: "Format",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: "subtitles",
      label: "Subtitles",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
    },
    {
      id: "sponsorblock",
      label: "SponsorBlock",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "metadata",
      label: "Metadata",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "network",
      label: "Network",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">Advanced Options</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 px-4 dark:border-zinc-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                  ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto p-6">
          {/* Format Tab */}
          {activeTab === "format" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Quality</label>
                  <select
                    value={localOptions.preferredQuality}
                    onChange={(e) => updateOption("preferredQuality", e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {QUALITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Format</label>
                  <select
                    value={localOptions.preferredFormat}
                    onChange={(e) => updateOption("preferredFormat", e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Specific Format ID (optional)
                </label>
                <input
                  type="text"
                  value={localOptions.formatId}
                  onChange={(e) => updateOption("formatId", e.target.value)}
                  placeholder="e.g., 137+140 or bestvideo+bestaudio"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Override preset with a specific yt-dlp format string
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Filename Template</label>
                <input
                  type="text"
                  value={localOptions.filenameTemplate}
                  onChange={(e) => updateOption("filenameTemplate", e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono dark:border-zinc-800 dark:bg-zinc-950"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Variables: %(title)s, %(id)s, %(uploader)s, %(upload_date)s, %(ext)s
                </p>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localOptions.remuxVideo}
                    onChange={(e) => updateOption("remuxVideo", e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-sm">Remux to different container</span>
                </label>

                {localOptions.remuxVideo && (
                  <select
                    value={localOptions.preferredRemuxFormat}
                    onChange={(e) => updateOption("preferredRemuxFormat", e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <option value="mp4">MP4</option>
                    <option value="mkv">MKV</option>
                    <option value="webm">WebM</option>
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Subtitles Tab */}
          {activeTab === "subtitles" && (
            <div className="space-y-6">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={localOptions.subtitlesEnabled}
                  onChange={(e) => updateOption("subtitlesEnabled", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-medium">Download subtitles</span>
              </label>

              {localOptions.subtitlesEnabled && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Language</label>
                    <select
                      value={localOptions.subtitlesLanguage}
                      onChange={(e) => updateOption("subtitlesLanguage", e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      {SUBTITLE_LANGUAGES.map((lang) => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localOptions.subtitlesAutoCaptions}
                        onChange={(e) => updateOption("subtitlesAutoCaptions", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <div>
                        <span className="text-sm">Include auto-generated captions</span>
                        <p className="text-xs text-zinc-500">
                          Download auto-generated subtitles if manual ones aren&apos;t available
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={localOptions.subtitlesEmbed}
                        onChange={(e) => updateOption("subtitlesEmbed", e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <div>
                        <span className="text-sm">Embed subtitles in video</span>
                        <p className="text-xs text-zinc-500">
                          Embed subtitles directly into the video file (MP4/MKV)
                        </p>
                      </div>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SponsorBlock Tab */}
          {activeTab === "sponsorblock" && (
            <div className="space-y-6">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={localOptions.sponsorBlockEnabled}
                  onChange={(e) => updateOption("sponsorBlockEnabled", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-medium">Enable SponsorBlock</span>
              </label>

              {localOptions.sponsorBlockEnabled && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Mode</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="sponsorblock-mode"
                          checked={localOptions.sponsorBlockMode === "remove"}
                          onChange={() => updateOption("sponsorBlockMode", "remove")}
                          className="h-4 w-4"
                        />
                        <div>
                          <span className="text-sm">Remove segments</span>
                          <p className="text-xs text-zinc-500">Cut out matched segments</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="sponsorblock-mode"
                          checked={localOptions.sponsorBlockMode === "mark"}
                          onChange={() => updateOption("sponsorBlockMode", "mark")}
                          className="h-4 w-4"
                        />
                        <div>
                          <span className="text-sm">Mark as chapters</span>
                          <p className="text-xs text-zinc-500">Add chapter markers</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="mb-3 block text-sm font-medium">Categories to process</label>
                    <div className="grid grid-cols-2 gap-2">
                      {SPONSORBLOCK_CATEGORIES.map((cat) => (
                        <label
                          key={cat.id}
                          className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                        >
                          <input
                            type="checkbox"
                            checked={localOptions.sponsorBlockCategories.includes(cat.id)}
                            onChange={() => toggleSponsorBlockCategory(cat.id)}
                            className="mt-0.5 h-4 w-4 rounded"
                          />
                          <div>
                            <span className="text-sm font-medium">{cat.label}</span>
                            <p className="text-xs text-zinc-500">{cat.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Metadata Tab */}
          {activeTab === "metadata" && (
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={localOptions.embedMetadata}
                  onChange={(e) => updateOption("embedMetadata", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <div>
                  <span className="text-sm font-medium">Embed metadata</span>
                  <p className="text-xs text-zinc-500">
                    Add title, artist, description, etc. to the file
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={localOptions.embedThumbnail}
                  onChange={(e) => updateOption("embedThumbnail", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <div>
                  <span className="text-sm font-medium">Embed thumbnail</span>
                  <p className="text-xs text-zinc-500">
                    Add the video thumbnail as album art
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={localOptions.writeInfoJson}
                  onChange={(e) => updateOption("writeInfoJson", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <div>
                  <span className="text-sm font-medium">Write info.json file</span>
                  <p className="text-xs text-zinc-500">
                    Save video metadata to a separate JSON file
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Network Tab */}
          {activeTab === "network" && (
            <div className="space-y-6">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={localOptions.useProxy}
                  onChange={(e) => updateOption("useProxy", e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-medium">Use proxy</span>
              </label>

              {localOptions.useProxy && (
                <div>
                  <label className="mb-2 block text-sm font-medium">Proxy URL</label>
                  <input
                    type="text"
                    value={localOptions.proxyUrl}
                    onChange={(e) => updateOption("proxyUrl", e.target.value)}
                    placeholder="socks5://127.0.0.1:9050 or http://proxy:8080"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Rate limit (optional)
                </label>
                <input
                  type="text"
                  value={localOptions.rateLimit}
                  onChange={(e) => updateOption("rateLimit", e.target.value)}
                  placeholder="e.g., 1M, 500K, or leave empty for no limit"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Limit download speed (K = kilobytes, M = megabytes per second)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Retries on failure
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={localOptions.retries}
                  onChange={(e) => updateOption("retries", parseInt(e.target.value) || 3)}
                  className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_OPTIONS };
export default AdvancedOptions;
