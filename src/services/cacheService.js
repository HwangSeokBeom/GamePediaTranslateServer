const limits = require("../config/limits");
const { getRedisClient } = require("../config/redis");
const hashText = require("../utils/hashText");

function makeTranslationCacheKey({ sourceLanguage, targetLanguage, normalizedText }) {
  return `translation:${hashText(`${normalizedText}:${targetLanguage}`)}`;
}

async function getTranslation(cacheKey) {
  const redisClient = getRedisClient();

  if (!redisClient) {
    return null;
  }

  try {
    return await redisClient.get(cacheKey);
  } catch (error) {
    console.error("[Translation] redis unavailable fallback", error.message);
    return null;
  }
}

async function setTranslation(cacheKey, translatedText) {
  const redisClient = getRedisClient();

  if (!redisClient) {
    return false;
  }

  try {
    await redisClient.set(cacheKey, translatedText, {
      EX: limits.translationCacheTtlSeconds,
    });

    return true;
  } catch (error) {
    console.error("[Translation] redis unavailable fallback", error.message);
    return false;
  }
}

async function deleteTranslation(cacheKey) {
  const redisClient = getRedisClient();

  if (!redisClient) {
    return false;
  }

  try {
    await redisClient.del(cacheKey);
    return true;
  } catch (error) {
    console.error("[Translation] redis unavailable fallback", error.message);
    return false;
  }
}

module.exports = {
  makeTranslationCacheKey,
  getTranslation,
  setTranslation,
  deleteTranslation,
};
