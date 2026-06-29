const express = require("express");
const { auth, requirePremium } = require("../middleware/authMiddleware");
const {
    getPublicPortfolio,
    getMyPortfolio,
    updateMyPortfolio,
    publishPortfolio,
    unpublishPortfolio,
    generatePdfJob,
    getPdfJobStatus,
    downloadPdf,
    getPortfolioAnalytics
} = require("../controllers/portfolioController");

const router = express.Router();

router.get("/me", auth, getMyPortfolio);
router.patch("/me", auth, updateMyPortfolio);
router.post("/me/publish", auth, publishPortfolio);
router.post("/me/unpublish", auth, unpublishPortfolio);
router.get("/me/pdf", auth, generatePdfJob);
router.get("/me/pdf/download/:jobId", auth, downloadPdf);
router.get("/me/pdf/:jobId", auth, getPdfJobStatus);
router.get("/me/analytics", auth, requirePremium, getPortfolioAnalytics);

// Public route at the bottom
router.get("/:username", getPublicPortfolio);

module.exports = router;
