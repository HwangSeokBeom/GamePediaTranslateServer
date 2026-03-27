const translationService = require("./translationService");
const { normalizeLanguageCode } = require("../utils/language");
const normalizeText = require("../utils/normalizeText");

async function resolveTranslatedText(
  text,
  targetLanguage,
  {
    sourceLanguage = "en",
    fieldName,
    routePath = "/translate",
  } = {}
) {
  if (typeof text !== "string") {
    return text;
  }

  const normalizedText = normalizeText(text);

  if (normalizedText.length === 0) {
    return "";
  }

  const normalizedTargetLanguage = normalizeLanguageCode(targetLanguage);
  const normalizedSourceLanguage = normalizeLanguageCode(sourceLanguage, "en");

  if (!normalizedTargetLanguage) {
    return normalizedText;
  }

  const translationResult = await translationService.translateText({
    text: normalizedText,
    sourceLanguage: normalizedSourceLanguage,
    targetLanguage: normalizedTargetLanguage,
    routePath,
    fieldName,
  });

  return translationResult.translatedText;
}

module.exports = {
  resolveTranslatedText,
};
