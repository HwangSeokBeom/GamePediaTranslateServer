const LEVEL_PRIORITY = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const DEFAULT_LEVEL =
  process.env.LOG_LEVEL?.trim().toLowerCase() ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function normalizeValue(value, depth = 0) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, depth + 1));
  }

  if (value && typeof value === "object") {
    if (depth >= 2) {
      return "[object]";
    }

    return Object.entries(value).reduce((result, [key, nestedValue]) => {
      if (nestedValue === undefined) {
        return result;
      }

      result[key] = normalizeValue(nestedValue, depth + 1);
      return result;
    }, {});
  }

  return value;
}

function normalizeMeta(meta = {}) {
  return Object.entries(meta).reduce((result, [key, value]) => {
    if (value === undefined) {
      return result;
    }

    result[key] = normalizeValue(value);
    return result;
  }, {});
}

function shouldLog(level) {
  const configuredPriority =
    LEVEL_PRIORITY[DEFAULT_LEVEL] ?? LEVEL_PRIORITY.info;
  const currentPriority = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.info;

  return currentPriority <= configuredPriority;
}

function writeLog(level, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...normalizeMeta(meta),
  };
  const line = JSON.stringify(payload);

  if (level === "error" || level === "warn") {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
}

function createLogger(defaultMeta = {}) {
  return {
    error(message, meta = {}) {
      writeLog("error", message, { ...defaultMeta, ...meta });
    },
    warn(message, meta = {}) {
      writeLog("warn", message, { ...defaultMeta, ...meta });
    },
    info(message, meta = {}) {
      writeLog("info", message, { ...defaultMeta, ...meta });
    },
    debug(message, meta = {}) {
      writeLog("debug", message, { ...defaultMeta, ...meta });
    },
  };
}

const logger = createLogger();

module.exports = logger;
module.exports.createLogger = createLogger;
