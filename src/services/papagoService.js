const env = require('../config/env');
const { createLogger } = require('../utils/logger');
const logger = createLogger({ component: 'papago' });

logger.info('papago config loaded', {
  endpoint: env.papagoEndpoint,
  clientIdLoaded: Boolean(env.papagoClientId),
  clientSecretLoaded: Boolean(env.papagoClientSecret),
});

function createSkippedResult(originalText, reason) {
  return {
    translatedText: originalText,
    translationSkipped: true,
    reason,
  };
}

function buildHeaders() {
  return {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-NCP-APIGW-API-KEY-ID': env.papagoClientId,
    'X-NCP-APIGW-API-KEY': env.papagoClientSecret,
  };
}

async function translateText({ text, sourceLanguage, targetLanguage }) {
  if (!env.papagoClientId || !env.papagoClientSecret) {
    logger.warn('papago request skipped', {
      reason: 'missing_credentials',
      sourceLanguage,
      targetLanguage,
    });
    return createSkippedResult(text, 'missing_credentials');
  }

  const headers = buildHeaders();
  const params = new URLSearchParams({
    source: sourceLanguage,
    target: targetLanguage,
    text,
  });

  logger.info('papago request start', {
    sourceLanguage,
    targetLanguage,
    textLength: text.length,
    requestHeaderKeys: Object.keys(headers),
  });

  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    env.papagoTimeoutMs
  );

  let response;
  let responseBodyText = '';

  try {
    response = await fetch(env.papagoEndpoint, {
      method: 'POST',
      headers,
      body: params.toString(),
      signal: abortController.signal,
    });

    responseBodyText = await response.text();
  } catch (error) {
    const reason =
      error.name === 'AbortError' ? 'papago_timeout' : 'papago_unavailable';
    logger.error('papago request failed', {
      reason,
      sourceLanguage,
      targetLanguage,
      textLength: text.length,
      error,
    });
    return createSkippedResult(text, reason);
  } finally {
    clearTimeout(timeoutId);
  }

  logger.info('papago response received', {
    statusCode: response.status,
    sourceLanguage,
    targetLanguage,
  });

  if (!response.ok) {
    logger.warn('papago request failed', {
      reason: 'papago_http_error',
      statusCode: response.status,
      sourceLanguage,
      targetLanguage,
    });
    return createSkippedResult(text, 'papago_http_error');
  }

  let parsedBody = null;

  try {
    parsedBody = responseBodyText ? JSON.parse(responseBodyText) : null;
  } catch (error) {
    logger.error('papago request failed', {
      reason: 'papago_invalid_response',
      sourceLanguage,
      targetLanguage,
      error,
    });
    return createSkippedResult(text, 'papago_invalid_response');
  }

  const translatedText = parsedBody?.message?.result?.translatedText;

  if (
    typeof translatedText !== 'string' ||
    translatedText.trim().length === 0
  ) {
    logger.error('papago request failed', {
      reason: 'papago_malformed_response',
      sourceLanguage,
      targetLanguage,
    });
    return createSkippedResult(text, 'papago_malformed_response');
  }

  return {
    translatedText,
    translationSkipped: false,
    reason: null,
  };
}

module.exports = {
  translateText,
};
