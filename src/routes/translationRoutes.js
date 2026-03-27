const express = require("express");

const translationController = require("../controllers/translationController");

const router = express.Router();

router.post("/translate", translationController.translate);
router.post("/translations/text", translationController.translate);
router.post("/translations/batch", translationController.translateBatch);
router.get("/translation-usage", translationController.getUsageStatus);

module.exports = router;
