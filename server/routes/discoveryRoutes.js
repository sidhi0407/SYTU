const express = require("express");
const { auth, requirePremium } = require("../middleware/authMiddleware");
const { getDiscoveryFeed, getRandomUser } = require("../controllers/discoveryController");

const router = express.Router();

router.get("/feed", auth, requirePremium, getDiscoveryFeed);
router.get("/random", auth, getRandomUser);

module.exports = router;
