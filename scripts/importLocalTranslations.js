const fs = require("fs");
const path = require("path");

const { connectDatabase, closeDatabase } = require("../src/config/database");
const translationRepository = require("../src/repositories/translationRepository");
const usageRepository = require("../src/repositories/usageRepository");

const LOCAL_TRANSLATIONS_FILE = path.resolve(process.cwd(), ".data/translations.json");
const LOCAL_USAGE_FILE = path.resolve(process.cwd(), ".data/translation-usage.json");

async function main() {
  await connectDatabase();

  try {
    await importTranslations();
    await importUsage();
  } catch (error) {
    console.error("[Import] failed", error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

async function importTranslations() {
  if (!fs.existsSync(LOCAL_TRANSLATIONS_FILE)) {
    console.log("[Import] no local translations file found");
    return;
  }

  const rows = JSON.parse(fs.readFileSync(LOCAL_TRANSLATIONS_FILE, "utf8"));
  let importedCount = 0;

  for (const row of rows) {
    await translationRepository.upsertTranslation({
      sourceText: row.sourceText,
      normalizedSourceText: row.normalizedSourceText,
      sourceLanguage: row.sourceLanguage,
      targetLanguage: row.targetLanguage,
      translatedText: row.translatedText,
      provider: row.provider || "unknown",
    });

    importedCount += 1;
  }

  console.log(`[Import] imported ${importedCount} translations`);
}

async function importUsage() {
  if (!fs.existsSync(LOCAL_USAGE_FILE)) {
    console.log("[Import] no local usage file found, usage counters will start fresh");
    return;
  }

  const usage = JSON.parse(fs.readFileSync(LOCAL_USAGE_FILE, "utf8"));

  if (usage.daily?.date) {
    await usageRepository.upsertUsageRecord(
      "daily",
      usage.daily.date,
      usage.daily.charactersUsed || 0,
      usage.daily.requestsUsed || 0
    );
  }

  if (usage.monthly?.month) {
    await usageRepository.upsertUsageRecord(
      "monthly",
      usage.monthly.month,
      usage.monthly.charactersUsed || 0,
      usage.monthly.requestsUsed || 0
    );
  }

  console.log("[Import] usage counters imported");
}

main();
