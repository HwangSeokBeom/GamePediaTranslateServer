const os = require('os');
const express = require('express');

const env = require('./config/env');
const {
  connectDatabase,
  closeDatabase,
  pingDatabase,
} = require('./config/database');
const { connectRedis, closeRedis, pingRedis } = require('./config/redis');
const translationRoutes = require('./routes/translationRoutes');

const translationRequestPaths = new Set([
  '/translate',
  '/translations/text',
  '/translations/batch',
]);

function getLanAddress() {
  const networkInterfaces = os.networkInterfaces();

  for (const interfaceAddresses of Object.values(networkInterfaces)) {
    if (!Array.isArray(interfaceAddresses)) {
      continue;
    }

    const lanAddress = interfaceAddresses.find(
      (address) => address.family === 'IPv4' && !address.internal
    );

    if (lanAddress?.address) {
      return lanAddress.address;
    }
  }

  return '';
}

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function isTranslationRequest(req) {
  return req.method === 'POST' && translationRequestPaths.has(req.path);
}

function getTranslationRequestDetails(req) {
  const requestBody = req.body ?? {};
  const targetLanguage =
    typeof requestBody.targetLanguage === 'string'
      ? requestBody.targetLanguage.trim()
      : '';

  if (Array.isArray(requestBody.texts)) {
    const textLength = requestBody.texts.reduce(
      (total, text) => total + (typeof text === 'string' ? text.length : 0),
      0
    );

    return {
      targetLanguage,
      textLength,
      textCount: requestBody.texts.length,
    };
  }

  return {
    targetLanguage,
    textLength: typeof requestBody.text === 'string' ? requestBody.text.length : 0,
    textCount: typeof requestBody.text === 'string' ? 1 : 0,
  };
}

function logTranslationRequest(message, req, details, extra = '') {
  const logLine =
    `[Translation Request] ${message}` +
    ` method=${req.method}` +
    ` path=${req.originalUrl}` +
    ` ip=${getRequestIp(req)}` +
    ` targetLanguage=${details.targetLanguage || 'missing'}` +
    ` textLength=${details.textLength}` +
    (details.textCount > 1 ? ` textCount=${details.textCount}` : '') +
    extra;

  console.log(logLine);
}

function getLanAccessExample(host, port) {
  const lanAddress = getLanAddress();

  if (!lanAddress) {
    return 'unavailable (no external IPv4 address found)';
  }

  if (host === '0.0.0.0' || host === '::') {
    return `http://${lanAddress}:${port}/health`;
  }

  if (host === '127.0.0.1' || host === 'localhost') {
    return `set HOST=0.0.0.0 and use http://${lanAddress}:${port}/health`;
  }

  return `http://${host}:${port}/health`;
}

function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    if (!isTranslationRequest(req)) {
      return next();
    }

    const startedAt = Date.now();
    const requestDetails = getTranslationRequestDetails(req);

    logTranslationRequest('incoming', req, requestDetails);

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const outcome = res.statusCode >= 400 ? 'failure' : 'success';

      logTranslationRequest(
        outcome,
        req,
        requestDetails,
        ` status=${res.statusCode} durationMs=${durationMs}`
      );
    });

    return next();
  });
  app.get('/health', async (req, res) => {
    const databaseUp = await pingDatabase();
    const redisUp = await pingRedis();
    const redisStatus = redisUp ? 'connected' : 'disconnected';
    const databaseStatus = databaseUp ? 'connected' : 'disconnected';

    return res.status(databaseUp ? 200 : 503).json({
      server: 'ok',
      database: databaseStatus,
      redis: redisStatus,
    });
  });
  app.use(translationRoutes);

  app.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: 'Route not found.',
    });
  });

  app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
      if (isTranslationRequest(req)) {
        logTranslationRequest(
          'failure',
          req,
          getTranslationRequestDetails(req),
          ' status=400 reason=invalid_json'
        );
      }

      return res.status(400).json({
        error: 'invalid_json',
        message: 'Request body must be valid JSON.',
      });
    }

    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'internal_server_error';
    const message = error.expose
      ? error.message
      : statusCode >= 500
        ? 'Unexpected server error.'
        : error.message;

    if (statusCode >= 500) {
      console.error('[Server Error]', error.message);
    }

    res.status(statusCode).json({
      error: errorCode,
      message,
    });
  });

  return app;
}

async function startServer() {
  console.log(`[Startup] env file: ${env.envFilePath}`);
  console.log(`[Startup] env file loaded: ${env.envFileLoaded ? 'yes' : 'no'}`);
  console.log(
    `[Startup] DATABASE_URL loaded: ${env.databaseUrl ? 'yes' : 'no'}`
  );
  console.log(`[Startup] REDIS_URL loaded: ${env.redisUrl ? 'yes' : 'no'}`);
  console.log(
    `[Startup] PAPAGO credentials loaded: ${
      env.papagoClientId && env.papagoClientSecret ? 'yes' : 'no'
    }`
  );

  env.startupWarnings.forEach((warning) => {
    console.warn(`[Startup] warning: ${warning}`);
  });

  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.serverPort, env.serverHost, () => {
    console.log('[Startup] Translation server running');
    console.log(`[Startup] host: ${env.serverHost}`);
    console.log(`[Startup] port: ${env.serverPort}`);
    console.log(`[Startup] local access: http://localhost:${env.serverPort}/health`);
    console.log(
      `[Startup] LAN access example: ${getLanAccessExample(
        env.serverHost,
        env.serverPort
      )}`
    );
  });

  const shutdown = async () => {
    server.close(async () => {
      await Promise.allSettled([closeRedis(), closeDatabase()]);
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[Startup] failed', error.message);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  startServer,
};
