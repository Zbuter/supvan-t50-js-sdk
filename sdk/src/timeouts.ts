/** Shared timeout names used by transports and printer backends. */
export interface TimeoutOptions {
  scanTimeoutMs?: number;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  commandTimeoutMs?: number;
  printTimeoutMs?: number;
}
