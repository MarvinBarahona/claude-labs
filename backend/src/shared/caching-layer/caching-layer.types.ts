/** One point in a request to attach a `cache_control` breakpoint. */
export type CacheBoundary =
  | { region: 'tools' }
  | { region: 'system' }
  | { region: 'messages'; messageIndex: number };
