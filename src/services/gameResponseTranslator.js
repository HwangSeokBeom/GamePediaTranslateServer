const { resolveTranslatedText } = require("./translationUseCase");
const truncateText = require("../utils/truncateText");

const HOME_SUMMARY_PREVIEW_LENGTH = 220;
const SEARCH_SUMMARY_PREVIEW_LENGTH = 220;

async function buildHomeGameDto(game, targetLanguage) {
  const summaryPreview = truncateText(game?.summary, HOME_SUMMARY_PREVIEW_LENGTH);

  const [translatedTitle, translatedSummary] = await Promise.all([
    resolveTranslatedText(game?.title, targetLanguage, {
      fieldName: "title",
      routePath: "internal:home",
    }),
    resolveTranslatedText(summaryPreview, targetLanguage, {
      fieldName: "summary",
      routePath: "internal:home",
    }),
  ]);

  return {
    ...game,
    translatedTitle,
    translatedSummary,
  };
}

async function buildSearchGameDto(game, targetLanguage) {
  const summaryPreview = truncateText(game?.summary, SEARCH_SUMMARY_PREVIEW_LENGTH);

  const [translatedTitle, translatedSummary] = await Promise.all([
    resolveTranslatedText(game?.title, targetLanguage, {
      fieldName: "title",
      routePath: "internal:search",
    }),
    resolveTranslatedText(summaryPreview, targetLanguage, {
      fieldName: "summary",
      routePath: "internal:search",
    }),
  ]);

  return {
    ...game,
    translatedTitle,
    translatedSummary,
  };
}

async function buildGameDetailDto(game, targetLanguage) {
  const [translatedTitle, translatedSummary, translatedStoryline] = await Promise.all([
    resolveTranslatedText(game?.title, targetLanguage, {
      fieldName: "title",
      routePath: "internal:game-detail",
    }),
    resolveTranslatedText(game?.summary, targetLanguage, {
      fieldName: "summary",
      routePath: "internal:game-detail",
    }),
    resolveTranslatedText(game?.storyline, targetLanguage, {
      fieldName: "storyline",
      routePath: "internal:game-detail",
    }),
  ]);

  return {
    ...game,
    translatedTitle,
    translatedSummary,
    translatedStoryline,
  };
}

async function buildProfileDto(profile, targetLanguage) {
  const translatedBadgeTitle = await resolveTranslatedText(profile?.badgeTitle, targetLanguage, {
    fieldName: "badgeTitle",
    routePath: "internal:profile",
  });

  return {
    ...profile,
    translatedBadgeTitle,
  };
}

async function buildHomeGameDtos(games, targetLanguage) {
  return Promise.all((games || []).map((game) => buildHomeGameDto(game, targetLanguage)));
}

async function buildSearchGameDtos(games, targetLanguage) {
  return Promise.all((games || []).map((game) => buildSearchGameDto(game, targetLanguage)));
}

module.exports = {
  buildHomeGameDto,
  buildHomeGameDtos,
  buildSearchGameDto,
  buildSearchGameDtos,
  buildGameDetailDto,
  buildProfileDto,
};
