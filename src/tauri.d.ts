// Minimal type declarations for Tauri API used by the Next.js frontend.
// This prevents TypeScript from failing builds when running in a browser-only
// context (where the module may not actually be available).
//
// Runtime availability is still handled via dynamic import + try/catch.

declare module "@tauri-apps/api/core" {
  export function invoke<T>(
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export type UnlistenFn = () => void;

  export function listen<T>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void
  ): Promise<UnlistenFn>;
}
