const { query } = require("../config/database");

function mapUsageRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    periodType: row.period_type,
    periodKey: row.period_key,
    charactersUsed: Number(row.characters_used),
    requestsUsed: Number(row.requests_used),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeEmptyUsage(periodType, periodKey) {
  return {
    id: null,
    periodType,
    periodKey,
    charactersUsed: 0,
    requestsUsed: 0,
    createdAt: null,
    updatedAt: null,
  };
}

async function ensureUsageRow(periodType, periodKey, options = {}) {
  await query(
    `INSERT INTO translation_usage (period_type, period_key, characters_used, requests_used)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (period_type, period_key) DO NOTHING`,
    [periodType, periodKey],
    options.client
  );
}

async function getUsage(periodType, periodKey, options = {}) {
  try {
    if (options.createIfMissing) {
      await ensureUsageRow(periodType, periodKey, options);
    }

    const result = await query(
      `SELECT id, period_type, period_key, characters_used, requests_used, created_at, updated_at
         FROM translation_usage
        WHERE period_type = $1
          AND period_key = $2
        ${options.forUpdate ? "FOR UPDATE" : ""}`,
      [periodType, periodKey],
      options.client
    );

    return mapUsageRow(result.rows[0]);
  } catch (error) {
    console.error("[Translation] db error", error.message);
    throw error;
  }
}

async function getDailyUsage(periodKey, options = {}) {
  return getUsage("daily", periodKey, options);
}

async function getMonthlyUsage(periodKey, options = {}) {
  return getUsage("monthly", periodKey, options);
}

async function incrementUsage(periodType, periodKey, charactersDelta, requestsDelta, options = {}) {
  try {
    const result = await query(
      `INSERT INTO translation_usage (period_type, period_key, characters_used, requests_used)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (period_type, period_key)
       DO UPDATE SET
         characters_used = translation_usage.characters_used + EXCLUDED.characters_used,
         requests_used = translation_usage.requests_used + EXCLUDED.requests_used,
         updated_at = NOW()
       RETURNING id, period_type, period_key, characters_used, requests_used, created_at, updated_at`,
      [periodType, periodKey, charactersDelta, requestsDelta],
      options.client
    );

    return mapUsageRow(result.rows[0]);
  } catch (error) {
    console.error("[Translation] db error", error.message);
    throw error;
  }
}

async function incrementDailyUsage(periodKey, charactersDelta, requestsDelta, options = {}) {
  return incrementUsage("daily", periodKey, charactersDelta, requestsDelta, options);
}

async function incrementMonthlyUsage(periodKey, charactersDelta, requestsDelta, options = {}) {
  return incrementUsage("monthly", periodKey, charactersDelta, requestsDelta, options);
}

async function upsertUsageRecord(
  periodType,
  periodKey,
  charactersUsed,
  requestsUsed,
  options = {}
) {
  try {
    const result = await query(
      `INSERT INTO translation_usage (period_type, period_key, characters_used, requests_used)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (period_type, period_key)
       DO UPDATE SET
         characters_used = EXCLUDED.characters_used,
         requests_used = EXCLUDED.requests_used,
         updated_at = NOW()
       RETURNING id, period_type, period_key, characters_used, requests_used, created_at, updated_at`,
      [periodType, periodKey, charactersUsed, requestsUsed],
      options.client
    );

    return mapUsageRow(result.rows[0]);
  } catch (error) {
    console.error("[Translation] db error", error.message);
    throw error;
  }
}

module.exports = {
  getDailyUsage,
  getMonthlyUsage,
  incrementDailyUsage,
  incrementMonthlyUsage,
  upsertUsageRecord,
  makeEmptyUsage,
};
