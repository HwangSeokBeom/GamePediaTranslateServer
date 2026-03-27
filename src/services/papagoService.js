const env = require('../config/env');

console.log(`[Papago] endpoint: ${env.papagoEndpoint}`);
console.log(`[Papago] client id loaded: ${env.papagoClientId ? 'yes' : 'no'}`);
console.log(
  `[Papago] client secret loaded: ${env.papagoClientSecret ? 'yes' : 'no'}`
);

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
    console.log('[Papago] missing credentials');
    return createSkippedResult(text, 'missing_credentials');
  }

  const headers = buildHeaders();
  const params = new URLSearchParams({
    source: sourceLanguage,
    target: targetLanguage,
    text,
  });

  console.log('[Papago] request');
  console.log(`[Papago] source language: ${sourceLanguage}`);
  console.log(`[Papago] target language: ${targetLanguage}`);
  console.log(`[Papago] text length: ${text.length}`);
  console.log(
    `[Papago] request header keys: ${Object.keys(headers).join(', ')}`
  );

  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    env.papagoTimeoutMs
  );

  let response;
  let responseBodyText = '';
  let responseHeaders = {};

  try {
    response = await fetch(env.papagoEndpoint, {
      method: 'POST',
      headers,
      body: params.toString(),
      signal: abortController.signal,
    });

    responseHeaders = Object.fromEntries(response.headers.entries());
    responseBodyText = await response.text();
  } catch (error) {
    const reason =
      error.name === 'AbortError' ? 'papago_timeout' : 'papago_unavailable';
    console.error('[Papago] request failed', error.message);
    return createSkippedResult(text, reason);
  } finally {
    clearTimeout(timeoutId);
  }

  console.log(`[Papago] response status: ${response.status}`);
  console.log(`[Papago] response headers: ${JSON.stringify(responseHeaders)}`);
  console.log(`[Papago] response body: ${responseBodyText || '[empty]'}`);

  if (!response.ok) {
    return createSkippedResult(text, 'papago_http_error');
  }

  let parsedBody = null;

  try {
    parsedBody = responseBodyText ? JSON.parse(responseBodyText) : null;
  } catch (error) {
    console.error('[Papago] invalid json response');
    return createSkippedResult(text, 'papago_invalid_response');
  }

  const translatedText = parsedBody?.message?.result?.translatedText;

  if (
    typeof translatedText !== 'string' ||
    translatedText.trim().length === 0
  ) {
    console.error('[Papago] malformed response');
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
