/**
 * Structured logger.
 * Masks sensitive values (cookies, auth tokens) to prevent leakage.
 */

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

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    info(message: string): void {
      console.error(`${prefix} INFO: ${maskSensitive(message)}`);
    },
    warn(message: string): void {
      console.warn(`${prefix} WARN: ${maskSensitive(message)}`);
    },
    error(message: string, err?: Error): void {
      console.error(`${prefix} ERROR: ${maskSensitive(message)}`, err !== undefined ? maskSensitive(err.message) : '');
    },
  };
}
