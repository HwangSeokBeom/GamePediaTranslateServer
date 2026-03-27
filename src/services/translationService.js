const translationRepository = require("../repositories/translationRepository");
const normalizeText = require("../utils/normalizeText");
const { createLogger } = require("../utils/logger");
const cacheService = require("./cacheService");
const papagoService = require("./papagoService");
const usageLimiterService = require("./usageLimiterService");

const inFlightRequests = new Map();
const logger = createLogger({ component: "translation" });

function createSkippedResponse(originalText, reason) {
  return {
    translatedText: originalText,
    translationSkipped: true,
    reason,
  };
}

function logTranslationOutcome({
  sourceLanguage,
  targetLanguage,
  provider,
  skipped,
  reason = "none",
}) {
  logger.info("translation outcome", {
    sourceLanguage,
    targetLanguage,
    provider,
    skipped,
    reason,
  });
}

async function translateText({
  text,
  sourceLanguage = "en",
  targetLanguage,
  routePath,
  fieldName,
}) {
  const normalizedText = normalizeText(text);

  logger.info("translation request start", {
    sourceLanguage,
    targetLanguage,
    routePath,
    fieldName,
    textLength: normalizedText.length,
  });

  if (normalizedText.length === 0) {
    logger.warn("translation provider failure", {
      provider: "none",
      sourceLanguage,
      targetLanguage,
      reason: "empty_text",
    });
    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "none",
      skipped: true,
      reason: "empty_text",
    });
    return {
      translatedText: text,
      cached: false,
    };
  }

  const cacheKey = cacheService.makeTranslationCacheKey({
    sourceLanguage,
    targetLanguage,
    normalizedText,
  });

  let cachedTranslation = null;

  try {
    cachedTranslation = await cacheService.getTranslation(cacheKey);
  } catch (error) {
    logger.warn("translation cache unavailable", {
      cacheKey,
      error,
    });
  }

  if (typeof cachedTranslation === "string" && cachedTranslation.trim().length > 0) {
    logger.info("translation cache hit", {
      cacheKey,
      cacheSource: "redis",
      sourceLanguage,
      targetLanguage,
    });
    return {
      translatedText: cachedTranslation,
      cached: true,
    };
  }

  logger.info("translation cache miss", {
    cacheKey,
    sourceLanguage,
    targetLanguage,
  });

  let storedTranslation = null;

  try {
    storedTranslation = await translationRepository.findTranslation(
      normalizedText,
      sourceLanguage,
      targetLanguage
    );
  } catch (error) {
    storedTranslation = null;
  }

  if (
    storedTranslation &&
    typeof storedTranslation.translatedText === "string" &&
    storedTranslation.translatedText.trim().length > 0
  ) {
    await cacheService.setTranslation(cacheKey, storedTranslation.translatedText);
    logger.info("translation cache hit", {
      cacheKey,
      cacheSource: "database",
      sourceLanguage,
      targetLanguage,
    });
    return {
      translatedText: storedTranslation.translatedText,
      cached: true,
    };
  }

  if (sourceLanguage === targetLanguage) {
    await saveTranslation({
      cacheKey,
      sourceText: text,
      normalizedText,
      sourceLanguage,
      targetLanguage,
      translatedText: normalizedText,
      provider: "identity",
    });

    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "identity",
      skipped: false,
    });
    return {
      translatedText: normalizedText,
      cached: false,
    };
  }

  if (inFlightRequests.has(cacheKey)) {
    logger.debug("translation in-flight reuse", {
      cacheKey,
      sourceLanguage,
      targetLanguage,
    });
    return inFlightRequests.get(cacheKey);
  }

  const requestPromise = executeTranslation({
    cacheKey,
    text,
    normalizedText,
    sourceLanguage,
    targetLanguage,
    routePath,
    fieldName,
  });

  inFlightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

async function translateBatch({
  texts,
  sourceLanguage = "en",
  targetLanguage,
  routePath,
  fieldName,
}) {
  const results = await Promise.all(
    texts.map((text) =>
      translateText({
        text,
        sourceLanguage,
        targetLanguage,
        routePath,
        fieldName,
      })
    )
  );

  return results.map((result) => result.translatedText);
}

async function executeTranslation({
  cacheKey,
  text,
  normalizedText,
  sourceLanguage,
  targetLanguage,
  routePath,
  fieldName,
}) {
  const accessCheck = await usageLimiterService.checkPapagoAccess({
    normalizedText,
    sourceLanguage,
    targetLanguage,
    routePath,
    fieldName,
  });

  if (!accessCheck.allowed && accessCheck.reason !== "usage_tracking_unavailable") {
    logger.warn("translation provider failure", {
      provider: "papago",
      sourceLanguage,
      targetLanguage,
      reason: accessCheck.reason,
      stage: "precheck",
    });
    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "papago",
      skipped: true,
      reason: accessCheck.reason,
    });
    return createSkippedResponse(text, accessCheck.reason);
  }

  logger.info("translation provider selected", {
    provider: "papago",
    sourceLanguage,
    targetLanguage,
    textLength: normalizedText.length,
  });

  const papagoResult = await papagoService.translateText({
    text: normalizedText,
    sourceLanguage,
    targetLanguage,
  });

  if (papagoResult.translationSkipped) {
    logger.warn("translation provider failure", {
      provider: "papago",
      sourceLanguage,
      targetLanguage,
      reason: papagoResult.reason,
      stage: "provider_response",
    });
    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "papago",
      skipped: true,
      reason: papagoResult.reason,
    });
    return createSkippedResponse(text, papagoResult.reason);
  }

  const translatedText =
    typeof papagoResult.translatedText === "string"
      ? papagoResult.translatedText.trim()
      : "";

  if (!translatedText) {
    logger.warn("translation provider failure", {
      provider: "papago",
      sourceLanguage,
      targetLanguage,
      reason: "empty_translation",
      stage: "provider_response",
    });
    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "papago",
      skipped: true,
      reason: "empty_translation",
    });
    return createSkippedResponse(text, "empty_translation");
  }

  logTranslationOutcome({
    sourceLanguage,
    targetLanguage,
    provider: "papago",
    skipped: false,
  });

  await usageLimiterService.recordPapagoUsage(normalizedText.length);

  await saveTranslation({
    cacheKey,
    sourceText: text,
    normalizedText,
    sourceLanguage,
    targetLanguage,
    translatedText,
    provider: "papago",
  });

  return {
    translatedText,
    cached: false,
  };
}

async function saveTranslation({
  cacheKey,
  sourceText,
  normalizedText,
  sourceLanguage,
  targetLanguage,
  translatedText,
  provider,
}) {
  if (typeof translatedText !== "string" || translatedText.trim().length === 0) {
    return;
  }

  try {
    await translationRepository.upsertTranslation({
      sourceText,
      normalizedSourceText: normalizedText,
      sourceLanguage,
      targetLanguage,
      translatedText,
      provider,
    });
  } catch (error) {
    logger.warn("translation persistence skipped", {
      sourceLanguage,
      targetLanguage,
      provider,
      error,
    });
  }

  await cacheService.setTranslation(cacheKey, translatedText);
}

module.exports = {
  translateText,
  translateBatch,
};
