const { createHash } = require("crypto");

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

module.exports = hashText;
