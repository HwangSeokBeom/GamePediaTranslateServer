const env = require("./env");

function parseLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseMinimumLimit(value, fallback, minimum) {
  return Math.max(parseLimit(value, fallback), minimum);
}

module.exports = {
  enablePapago: env.enablePapago,
  dailyCharacterLimit: parseLimit(env.papagoDailyCharacterLimit, 200000),
  monthlyCharacterLimit: parseLimit(env.papagoMonthlyCharacterLimit, 3000),
  dailyRequestsLimit: parseLimit(env.papagoMaxRequestsPerDay, 10),
  allowedPapagoPairs: new Set(["en:ko", "ko:en"]),
  supportedTargetLanguages: new Set(["ko", "en"]),
  supportedSourceLanguages: new Set(["en", "ko"]),
  allowedRoutes: new Set([
    "/translate",
    "/translations/text",
    "/translations/batch",
    "internal:home",
    "internal:search",
    "internal:game-detail",
    "internal:profile",
  ]),
  allowedFields: new Set([
    "summary",
    "storyline",
    "description",
    "tagline",
    "name",
    "title",
    "badgetitle",
  ]),
  translationCacheTtlSeconds: parseMinimumLimit(
    env.translationCacheTtlSeconds,
    2592000,
    2592000
  ),
};
