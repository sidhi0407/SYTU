const Notification = require("../models/Notification");

// 1. Get List of Notifications (GET /notifications)
const getNotifications = async (req, res) => {
    try {
        const userId = req.user._id;
        const { unreadOnly } = req.query;

        const queryObj = { userId };
        if (unreadOnly === "true") {
            queryObj.isRead = false;
        }

        const notifications = await Notification.find(queryObj)
            .sort({ createdAt: -1 })
            .limit(50); // Fetch top 50 recent notifications

        res.status(200).json({
            success: true,
            notifications
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Mark Single Notification as Read (PATCH /notifications/:id/read)
const markRead = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;

        const notification = await Notification.findOne({ _id: notificationId, userId });
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        notification.isRead = true;
        await notification.save();

        res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Mark All as Read (PATCH /notifications/read-all)
const readAll = async (req, res) => {
    try {
        const userId = req.user._id;

        await Notification.updateMany(
            { userId, isRead: false },
            { $set: { isRead: true } }
        );

        res.status(200).json({
            success: true,
            message: "All notifications marked as read"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Delete Notification (DELETE /notifications/:id)
const deleteNotification = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;

        const result = await Notification.findOneAndDelete({ _id: notificationId, userId });
        if (!result) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getNotifications,
    markRead,
    readAll,
    deleteNotification
};
