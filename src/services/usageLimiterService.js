const { getClient } = require("../config/database");
const limits = require("../config/limits");
const usageRepository = require("../repositories/usageRepository");
const env = require("../config/env");

function createBlockedResult(reason) {
  return {
    allowed: false,
    reason,
  };
}

async function checkPapagoAccess({
  normalizedText,
  sourceLanguage,
  targetLanguage,
  routePath,
  fieldName,
}) {
  const languagePair = `${sourceLanguage}:${targetLanguage}`;

  if (!limits.allowedRoutes.has(routePath)) {
    console.log("[Translation] blocked by route allowlist");
    return createBlockedResult("route_not_allowed");
  }

  if (typeof fieldName === "string" && fieldName.trim().length > 0) {
    const normalizedFieldName = fieldName.trim().toLowerCase();

    if (!limits.allowedFields.has(normalizedFieldName)) {
      console.log("[Translation] blocked by field allowlist");
      return createBlockedResult("field_not_allowed");
    }
  }

  if (!limits.enablePapago) {
    console.log("[Translation] Papago disabled by feature flag");
    return createBlockedResult("papago_disabled");
  }

  if (!env.papagoClientId || !env.papagoClientSecret) {
    console.log("[Papago] credentials missing");
    return createBlockedResult("missing_credentials");
  }

  if (!limits.allowedPapagoPairs.has(languagePair)) {
    console.log(
      `[Translation] blocked by unsupported language pair sourceLanguage=${sourceLanguage} targetLanguage=${targetLanguage}`
    );
    return createBlockedResult("unsupported_language");
  }

  console.log(
    `[Translation] provider selected=papago sourceLanguage=${sourceLanguage} targetLanguage=${targetLanguage}`
  );

  const characterCount = normalizedText.length;
  const periodKey = buildPeriodKeys();

  try {
    const dailyUsage =
      (await usageRepository.getDailyUsage(periodKey.daily, {
        createIfMissing: true,
      })) || usageRepository.makeEmptyUsage("daily", periodKey.daily);
    const monthlyUsage =
      (await usageRepository.getMonthlyUsage(periodKey.monthly, {
        createIfMissing: true,
      })) || usageRepository.makeEmptyUsage("monthly", periodKey.monthly);

    const usedCharacters = dailyUsage.charactersUsed;
    const remainingCharacters = Math.max(
      limits.dailyCharacterLimit - usedCharacters,
      0
    );

    console.log("[Daily Limit Check]");
    console.log(`usedCharacters: ${usedCharacters}`);
    console.log(`incomingLength: ${characterCount}`);
    console.log(`dailyLimit: ${limits.dailyCharacterLimit}`);
    console.log(`remainingCharacters: ${remainingCharacters}`);

    if (usedCharacters + characterCount > limits.dailyCharacterLimit) {
      return createBlockedResult("daily_character_limit");
    }

    if (monthlyUsage.charactersUsed + characterCount > limits.monthlyCharacterLimit) {
      console.log("[Translation] blocked by monthly character limit");
      return createBlockedResult("monthly_character_limit");
    }

    if (dailyUsage.requestsUsed + 1 > limits.dailyRequestsLimit) {
      console.log("[Translation] blocked by daily request limit");
      return createBlockedResult("daily_request_limit");
    }

    return {
      allowed: true,
      characterCount,
    };
  } catch (error) {
    console.error("[Translation] db error", error.message);
    return createBlockedResult("usage_tracking_unavailable");
  }
}

async function recordPapagoUsage(characterCount) {
  const periodKey = buildPeriodKeys();
  let client;

  try {
    client = await getClient();
    await client.query("BEGIN");

    const updatedDailyUsage = await usageRepository.incrementDailyUsage(
      periodKey.daily,
      characterCount,
      1,
      { client }
    );
    const updatedMonthlyUsage = await usageRepository.incrementMonthlyUsage(
      periodKey.monthly,
      characterCount,
      1,
      { client }
    );

    await client.query("COMMIT");

    return {
      dailyCharactersUsed: updatedDailyUsage.charactersUsed,
      monthlyCharactersUsed: updatedMonthlyUsage.charactersUsed,
      dailyRequestsUsed: updatedDailyUsage.requestsUsed,
    };
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("[Translation] db error", error.message);
    return null;
  } finally {
    client?.release();
  }
}

async function getUsageStatus() {
  const periodKey = buildPeriodKeys();
  const [dailyUsage, monthlyUsage] = await Promise.all([
    usageRepository.getDailyUsage(periodKey.daily),
    usageRepository.getMonthlyUsage(periodKey.monthly),
  ]);

  return {
    papagoEnabled: limits.enablePapago,
    dailyCharactersUsed: dailyUsage?.charactersUsed || 0,
    dailyCharacterLimit: limits.dailyCharacterLimit,
    monthlyCharactersUsed: monthlyUsage?.charactersUsed || 0,
    monthlyCharacterLimit: limits.monthlyCharacterLimit,
    dailyRequestsUsed: dailyUsage?.requestsUsed || 0,
    dailyRequestsLimit: limits.dailyRequestsLimit,
  };
}

function buildPeriodKeys(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return {
    daily: `${year}-${month}-${day}`,
    monthly: `${year}-${month}`,
  };
}

module.exports = {
  checkPapagoAccess,
  recordPapagoUsage,
  getUsageStatus,
};
