function truncateText(text, maxLength) {
  if (typeof text !== "string") {
    return text;
  }

  const normalizedText = text.trim();

  if (!Number.isInteger(maxLength) || maxLength <= 0 || normalizedText.length <= maxLength) {
    return normalizedText;
  }

  const breakpoint = normalizedText.lastIndexOf(" ", maxLength - 1);
  const safeIndex = breakpoint > Math.floor(maxLength * 0.6) ? breakpoint : maxLength - 1;

  return `${normalizedText.slice(0, safeIndex).trimEnd()}...`;
}

module.exports = truncateText;
