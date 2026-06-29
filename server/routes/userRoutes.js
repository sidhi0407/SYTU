const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
    getPublicProfile,
    getMe,
    updateMe,
    getAvatarPresignedUrl,
    handleMockAvatarUpload,
    addSkill,
    deleteSkill,
    addInterest,
    deleteInterest,
    searchUsers,
    reportProfile
} = require("../controllers/userController");

const router = express.Router();

router.get("/me", auth, getMe);
router.patch("/me", auth, updateMe);
router.post("/me/avatar", auth, getAvatarPresignedUrl);
router.put("/me/avatar/mock-upload", handleMockAvatarUpload); // Mock direct S3 PUT upload
router.post("/me/skills", auth, addSkill);
router.delete("/me/skills/:name", auth, deleteSkill);
router.post("/me/interests", auth, addInterest);
router.delete("/me/interests/:name", auth, deleteInterest);
router.get("/search", auth, searchUsers);
router.post("/:id/report", auth, reportProfile);

// Public profile route (put at the bottom so it doesn't hijack /me or others)
router.get("/:username", getPublicProfile);

module.exports = router;
