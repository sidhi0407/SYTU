const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
    connectGithub,
    disconnectGithub,
    getGithubRepos,
    importGithubRepos,
    getGithubStats
} = require("../controllers/githubController");

const router = express.Router();

router.get("/connect", auth, connectGithub);
router.post("/disconnect", auth, disconnectGithub);
router.get("/repos", auth, getGithubRepos);
router.post("/repos/import", auth, importGithubRepos);
router.get("/stats", auth, getGithubStats);

module.exports = router;
