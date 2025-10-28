/**
 * Structured Logger
 * Centralized logging with structured output
 */

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  service?: string;
  environment?: string;
  context?: LogContext;
  correlationId?: string;
  userId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class StructuredLogger {
  private serviceName: string;
  private environment: string;

  constructor() {
    this.serviceName = 'integrated-credit-system';
    this.environment = process.env.NODE_ENV || 'development';
  }

  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    context?: LogContext
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      environment: this.environment,
      context
    };
  }

  private output(entry: LogEntry): void {
    const logString = JSON.stringify(entry);
    
    switch (entry.level) {
      case 'error':
        console.error(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      case 'info':
        console.info(logString);
        break;
      case 'debug':
        if (this.environment !== 'production') {
          console.debug(logString);
        }
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('debug', message, context);
    this.output(entry);
  }

  info(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('info', message, context);
    this.output(entry);
  }

  warn(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('warn', message, context);
    this.output(entry);
  }

  error(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('error', message, context);
    this.output(entry);
  }

  logError(error: Error, message?: string, context?: LogContext): void {
    const entry = this.createLogEntry('error', message || error.message, {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
    this.output(entry);
  }
}

export const logger = new StructuredLogger();