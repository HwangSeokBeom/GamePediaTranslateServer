CREATE TABLE IF NOT EXISTS translations (
  id BIGSERIAL PRIMARY KEY,
  source_text TEXT NOT NULL,
  normalized_source_text TEXT NOT NULL,
  source_language VARCHAR(16) NOT NULL,
  target_language VARCHAR(16) NOT NULL,
  translated_text TEXT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_source_text, source_language, target_language)
);

CREATE INDEX IF NOT EXISTS idx_translations_lookup
  ON translations (source_language, target_language, normalized_source_text);

CREATE TABLE IF NOT EXISTS translation_usage (
  id BIGSERIAL PRIMARY KEY,
  period_type VARCHAR(16) NOT NULL,
  period_key VARCHAR(32) NOT NULL,
  characters_used INTEGER NOT NULL DEFAULT 0,
  requests_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_translation_usage_lookup
  ON translation_usage (period_type, period_key);
