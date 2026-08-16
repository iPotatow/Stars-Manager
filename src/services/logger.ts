/**
 * Runtime logger.
 *
 * Logs are forwarded to the browser or Worker console only. The application
 * does not retain, expose, or persist application logs.
 */

import { sanitizeForLog, sanitizeError } from '../utils/logSanitizer';

type LogLevel = 'info' | 'warn' | 'error';

class RuntimeLogger {
  log(level: LogLevel, module: string, message: string, data?: unknown): void {
    const sanitizedMessage = typeof message === 'string' ? sanitizeForLog(message) as string : String(message);
    const sanitizedData = data === undefined ? undefined : sanitizeForLog(data);
    const prefix = `[${module}]`;

    switch (level) {
      case 'info':
        console.info(prefix, sanitizedMessage, sanitizedData ?? '');
        break;
      case 'warn':
        console.warn(prefix, sanitizedMessage, sanitizedData ?? '');
        break;
      case 'error':
        console.error(prefix, sanitizedMessage, sanitizedData ?? '');
        break;
    }
  }

  info(module: string, message: string, data?: unknown): void {
    this.log('info', module, message, data);
  }

  warn(module: string, message: string, data?: unknown): void {
    this.log('warn', module, message, data);
  }

  error(module: string, message: string, data?: unknown): void {
    this.log('error', module, message, data);
  }

  errorFromError(module: string, message: string, err: unknown, extra?: unknown): void {
    const sanitizedExtra = extra !== undefined && typeof extra === 'object' && extra !== null && !Array.isArray(extra)
      ? sanitizeForLog(extra) as Record<string, unknown>
      : extra !== undefined
        ? { extra: sanitizeForLog(extra) }
        : {};
    this.error(module, message, { ...sanitizeError(err), ...sanitizedExtra });
  }
}

export const logger = new RuntimeLogger();
