const { query } = require("../config/database");

function mapTranslationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceText: row.source_text,
    normalizedSourceText: row.normalized_source_text,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    translatedText: row.translated_text,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findTranslation(normalizedSourceText, sourceLanguage, targetLanguage, options = {}) {
  try {
    const result = await query(
      `SELECT id, source_text, normalized_source_text, source_language, target_language,
              translated_text, provider, created_at, updated_at
         FROM translations
        WHERE normalized_source_text = $1
          AND source_language = $2
          AND target_language = $3
        LIMIT 1`,
      [normalizedSourceText, sourceLanguage, targetLanguage],
      options.client
    );

    return mapTranslationRow(result.rows[0]);
  } catch (error) {
    console.error("[Translation] db error", error.message);
    throw error;
  }
}

async function saveTranslation(record, options = {}) {
  return upsertTranslation(record, options);
}

async function upsertTranslation(
  {
    sourceText,
    normalizedSourceText,
    sourceLanguage,
    targetLanguage,
    translatedText,
    provider,
  },
  options = {}
) {
  try {
    const result = await query(
      `INSERT INTO translations (
         source_text,
         normalized_source_text,
         source_language,
         target_language,
         translated_text,
         provider
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (normalized_source_text, source_language, target_language)
       DO UPDATE SET
         source_text = EXCLUDED.source_text,
         translated_text = EXCLUDED.translated_text,
         provider = EXCLUDED.provider,
         updated_at = NOW()
       RETURNING id, source_text, normalized_source_text, source_language, target_language,
                 translated_text, provider, created_at, updated_at`,
      [
        sourceText,
        normalizedSourceText,
        sourceLanguage,
        targetLanguage,
        translatedText,
        provider,
      ],
      options.client
    );

    return mapTranslationRow(result.rows[0]);
  } catch (error) {
    console.error("[Translation] db error", error.message);
    throw error;
  }
}

module.exports = {
  findTranslation,
  saveTranslation,
  upsertTranslation,
};
