const translationRepository = require("../repositories/translationRepository");
const normalizeText = require("../utils/normalizeText");
const cacheService = require("./cacheService");
const papagoService = require("./papagoService");
const usageLimiterService = require("./usageLimiterService");

const inFlightRequests = new Map();

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
  console.log(
    `[Translation] sourceLanguage=${sourceLanguage} targetLanguage=${targetLanguage}`
  );
  console.log(`[Translation] provider selected=${provider}`);
  console.log(`[Translation] skipped=${skipped ? "true" : "false"}`);
  console.log(`[Translation] fallback reason=${reason}`);
}

async function translateText({
  text,
  sourceLanguage = "en",
  targetLanguage,
  routePath,
  fieldName,
}) {
  const normalizedText = normalizeText(text);

  console.log(`[Translation] request length=${normalizedText.length}`);
  console.log(
    `[Translation] sourceLanguage=${sourceLanguage} targetLanguage=${targetLanguage}`
  );

  if (normalizedText.length === 0) {
    console.log("[Papago Fallback]");
    console.log("reason: empty_text");
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
    console.error("[Translation] redis unavailable fallback", error.message);
  }

  if (typeof cachedTranslation === "string" && cachedTranslation.trim().length > 0) {
    console.log("[Cache Hit]");
    console.log(`key: ${cacheKey}`);
    return {
      translatedText: cachedTranslation,
      cached: true,
    };
  }

  console.log("[Cache Miss]");
  console.log(`key: ${cacheKey}`);

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
    console.log("[Cache Hit]");
    console.log(`key: ${cacheKey}`);
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

    console.log("[Translation] translation success");
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
    console.log("[Translation] in-flight reuse");
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
    console.log("[Papago Blocked]");
    console.log(`reason: ${accessCheck.reason}`);
    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "papago",
      skipped: true,
      reason: accessCheck.reason,
    });
    return createSkippedResponse(text, accessCheck.reason);
  }

  console.log("[Papago Request]");
  console.log(`textLength: ${normalizedText.length}`);
  console.log(
    `[Translation] provider selected=papago sourceLanguage=${sourceLanguage} targetLanguage=${targetLanguage}`
  );

  const papagoResult = await papagoService.translateText({
    text: normalizedText,
    sourceLanguage,
    targetLanguage,
  });

  if (papagoResult.translationSkipped) {
    console.log("[Papago Fallback]");
    console.log(`reason: ${papagoResult.reason}`);
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
    console.log("[Papago Fallback]");
    console.log("reason: empty_translation");
    logTranslationOutcome({
      sourceLanguage,
      targetLanguage,
      provider: "papago",
      skipped: true,
      reason: "empty_translation",
    });
    return createSkippedResponse(text, "empty_translation");
  }

  console.log("[Papago Response]");
  console.log(`translatedLength: ${translatedText.length}`);
  console.log("[Papago Success]");
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
    console.error("[Translation] db save skipped", error.message);
  }

  await cacheService.setTranslation(cacheKey, translatedText);
}

module.exports = {
  translateText,
  translateBatch,
};
