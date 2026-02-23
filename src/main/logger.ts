/**
 * Structured logger.
 * Masks sensitive values (cookies, auth tokens) to prevent leakage.
 * Maintains a ring buffer of recent log entries for the diagnostic console.
 */
import type { DiagLogEntry, DiagLogLevel } from '@shared/diagnostic';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: Error): void;
}

const SENSITIVE_PATTERNS = [
  /cookie[=:]\s*[^\s;]+/gi,
  /sid[=:]\s*[^\s;]+/gi,
  /acorn[=:]\s*[^\s;]+/gi,
  /DMDM[=:]\s*[^\s;]+/gi,
  /MDMD[=:]\s*[^\s;]+/gi,
  /password[=:]\s*[^\s;]+/gi,
];

function maskSensitive(message: string): string {
  let masked = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const eqIndex = match.search(/[=:]/);
      if (eqIndex === -1) return match;
      return match.substring(0, eqIndex + 1) + '***MASKED***';
    });
  }
  return masked;
}

// ---------------------------------------------------------------------------
// Ring buffer for diagnostic console
// ---------------------------------------------------------------------------

const LOG_BUFFER_MAX = 1000;
const logBuffer: DiagLogEntry[] = [];

export function pushEntry(level: DiagLogLevel, tag: string, message: string): void {
  const entry: DiagLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
  };
  if (logBuffer.length >= LOG_BUFFER_MAX) {
    logBuffer.shift();
  }
  logBuffer.push(entry);
}

/**
 * Retrieve all buffered log entries (oldest first).
 */
export function getLogBuffer(): readonly DiagLogEntry[] {
  return [...logBuffer];
}

/**
 * Clear the log buffer.
 */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    info(message: string): void {
      const masked = maskSensitive(message);
      console.error(`${prefix} INFO: ${masked}`);
      pushEntry('info', tag, masked);
    },
    warn(message: string): void {
      const masked = maskSensitive(message);
      console.warn(`${prefix} WARN: ${masked}`);
      pushEntry('warn', tag, masked);
    },
    error(message: string, err?: Error): void {
      const masked = maskSensitive(message);
      const errMsg = err !== undefined ? ` ${maskSensitive(err.message)}` : '';
      console.error(
        `${prefix} ERROR: ${masked}`,
        err !== undefined ? maskSensitive(err.message) : '',
      );
      pushEntry('error', tag, `${masked}${errMsg}`);
    },
  };
}
