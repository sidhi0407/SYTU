const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
    getConversations,
    getMessages,
    markAsRead,
    uploadMessageFile
} = require("../controllers/chatController");

const router = express.Router();

router.get("/", auth, getConversations);
router.get("/:id/messages", auth, getMessages);
router.patch("/:id/read", auth, markAsRead);
router.post("/:id/files", auth, upload.single("file"), uploadMessageFile);

module.exports = router;
