interface LoggerOptions {
  silent?: boolean;
}

export function getLogger({ silent = false }: LoggerOptions = {}) {
  return {
    log: (...args: unknown[]) => {
      if (!silent) {
        console.log(...args);
      }
    },
    error: (...args: unknown[]) => {
      if (!silent) {
        console.error(...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (!silent) {
        console.warn(...args);
      }
    },
    info: (...args: unknown[]) => {
      if (!silent) {
        console.info(...args);
      }
    },
    debug: (...args: unknown[]) => {
      if (!silent) {
        console.debug(...args);
      }
    },
  };
}
