const translationService = require("../services/translationService");
const usageLimiterService = require("../services/usageLimiterService");
const limits = require("../config/limits");
const { normalizeLanguageCode } = require("../utils/language");

async function translate(req, res, next) {
  const { text, targetLanguage, sourceLanguage, fieldName } = req.body ?? {};
  const validation = validateTranslationPayload({ text, targetLanguage, sourceLanguage });

  if (!validation.ok) {
    return res.status(validation.statusCode).json(validation.body);
  }

  try {
    const result = await translationService.translateText({
      text,
      sourceLanguage: validation.sourceLanguage,
      targetLanguage: validation.targetLanguage,
      routePath: req.route?.path || req.path,
      fieldName,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function translateBatch(req, res, next) {
  const { texts, targetLanguage, sourceLanguage } = req.body ?? {};

  if (!Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({
      error: "texts_required",
      message: "texts must be a non-empty array.",
    });
  }

  const invalidText = texts.some((text) => typeof text !== "string");

  if (invalidText) {
    return res.status(400).json({
      error: "text_required",
      message: "Every item in texts must be a string.",
    });
  }

  const validation = validateTranslationPayload({
    text: texts[0],
    targetLanguage,
    sourceLanguage,
  });

  if (!validation.ok) {
    return res.status(validation.statusCode).json(validation.body);
  }

  try {
    const translations = await translationService.translateBatch({
      texts,
      sourceLanguage: validation.sourceLanguage,
      targetLanguage: validation.targetLanguage,
      routePath: req.route?.path || req.path,
    });

    return res.json({ translations });
  } catch (error) {
    return next(error);
  }
}

async function getUsageStatus(req, res, next) {
  try {
    const usageStatus = await usageLimiterService.getUsageStatus();
    return res.json(usageStatus);
  } catch (error) {
    return next(error);
  }
}

function validateTranslationPayload({ text, targetLanguage, sourceLanguage }) {
  if (typeof text !== "string") {
    console.log("[Translation] blocked by empty text");

    return {
      ok: false,
      statusCode: 400,
      body: {
        error: "text_required",
        message: "text must be a non-empty string.",
      },
    };
  }

  if (typeof targetLanguage !== "string" || targetLanguage.trim().length === 0) {
    console.log("[Translation] blocked by missing target language");

    return {
      ok: false,
      statusCode: 400,
      body: {
        error: "target_language_required",
        message: "targetLanguage is required.",
      },
    };
  }

  const normalizedSourceLanguage = normalizeLanguageCode(sourceLanguage, "en");
  const normalizedTargetLanguage = normalizeLanguageCode(targetLanguage);

  if (!limits.supportedSourceLanguages.has(normalizedSourceLanguage)) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: "unsupported_source_language",
        message: "sourceLanguage is not supported.",
      },
    };
  }

  if (!limits.supportedTargetLanguages.has(normalizedTargetLanguage)) {
    return {
      ok: false,
      statusCode: 400,
      body: {
        error: "unsupported_target_language",
        message: "targetLanguage is not supported.",
      },
    };
  }

  return {
    ok: true,
    statusCode: 200,
    sourceLanguage: normalizedSourceLanguage,
    targetLanguage: normalizedTargetLanguage,
  };
}

module.exports = {
  translate,
  translateBatch,
  getUsageStatus,
};
