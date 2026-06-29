const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
    getNotifications,
    markRead,
    readAll,
    deleteNotification
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", auth, getNotifications);
router.patch("/read-all", auth, readAll);
router.patch("/:id/read", auth, markRead);
router.delete("/:id", auth, deleteNotification);

module.exports = router;
