const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const DEFAULT_PAPAGO_ENDPOINT =
  'https://papago.apigw.ntruss.com/nmt/v1/translation';
const DEFAULT_PAPAGO_TIMEOUT_MS = 5000;
const envFilePath = path.resolve(process.cwd(), '.env');
const envFileLoaded = fs.existsSync(envFilePath);

if (envFileLoaded) {
  dotenv.config({ path: envFilePath });
}

function readString(name) {
  return process.env[name]?.trim() || '';
}

function readBoolean(name, fallback = false) {
  const value = readString(name);

  if (!value) {
    return fallback;
  }

  return value === 'true';
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getServerPort() {
  return readPositiveInteger(readString('PORT') || readString('SERVER_PORT'), 3000);
}

const env = {
  envFilePath,
  envFileLoaded,
  serverHost: readString('HOST') || '0.0.0.0',
  serverPort: getServerPort(),
  papagoClientId: readString('PAPAGO_CLIENT_ID'),
  papagoClientSecret: readString('PAPAGO_CLIENT_SECRET'),
  papagoEndpoint: readString('PAPAGO_ENDPOINT') || DEFAULT_PAPAGO_ENDPOINT,
  papagoTimeoutMs: readPositiveInteger(
    readString('PAPAGO_TIMEOUT_MS'),
    DEFAULT_PAPAGO_TIMEOUT_MS
  ),
  enablePapago: readBoolean('ENABLE_PAPAGO'),
  papagoDailyCharacterLimit: readString('PAPAGO_DAILY_CHARACTER_LIMIT'),
  papagoMonthlyCharacterLimit: readString('PAPAGO_MONTHLY_CHARACTER_LIMIT'),
  papagoMaxRequestsPerDay: readString('PAPAGO_MAX_REQUESTS_PER_DAY'),
  redisUrl: readString('REDIS_URL'),
  databaseUrl: readString('DATABASE_URL'),
  databaseSsl: readBoolean('DATABASE_SSL'),
  translationCacheTtlSeconds: readString('TRANSLATION_CACHE_TTL_SECONDS'),
};

env.startupWarnings = buildStartupWarnings(env);

function buildStartupWarnings(config) {
  const warnings = [];

  if (!config.envFileLoaded) {
    warnings.push(
      '.env file not found; relying on process environment for configuration.'
    );
  }

  if (!config.databaseUrl) {
    warnings.push('DATABASE_URL is missing; database startup will fail.');
  }

  if (!config.redisUrl) {
    warnings.push('REDIS_URL is missing; Redis cache will stay disabled.');
  }

  if (config.enablePapago && (!config.papagoClientId || !config.papagoClientSecret)) {
    warnings.push(
      'ENABLE_PAPAGO is true but Papago credentials are missing; provider calls will be skipped.'
    );
  }

  return warnings;
}

module.exports = env;
