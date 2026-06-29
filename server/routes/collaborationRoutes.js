const express = require("express");
const { auth, requirePremium } = require("../middleware/authMiddleware");
const {
    getCollaborationPosts,
    createCollaborationPost,
    getCollaborationPostById,
    closeCollaborationPost,
    applyToCollaborationPost,
    saveCollaborationPost
} = require("../controllers/collaborationController");

const router = express.Router();

router.get("/", auth, getCollaborationPosts);
router.post("/", auth, requirePremium, createCollaborationPost);
router.get("/:id", auth, getCollaborationPostById);
router.patch("/:id/close", auth, closeCollaborationPost);
router.post("/:id/apply", auth, applyToCollaborationPost);
router.post("/:id/save", auth, saveCollaborationPost);

module.exports = router;
