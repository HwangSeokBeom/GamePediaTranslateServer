function normalizeLanguageCode(value, fallback = "") {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  const aliases = {
    en: "en",
    ko: "ko",
    kr: "ko",
  };

  return aliases[normalized] || normalized;
}

module.exports = {
  normalizeLanguageCode,
};
