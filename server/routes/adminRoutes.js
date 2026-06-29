const express = require("express");
const { auth, requireAdmin } = require("../middleware/authMiddleware");
const {
    getUsers,
    suspendUser,
    unsuspendUser,
    deleteUser,
    getReports,
    resolveReport,
    getAnalytics
} = require("../controllers/adminController");

const router = express.Router();

// Apply auth and requireAdmin globally to this router
router.use(auth, requireAdmin);

router.get("/users", getUsers);
router.patch("/users/:id/suspend", suspendUser);
router.patch("/users/:id/unsuspend", unsuspendUser);
router.delete("/users/:id", deleteUser);

router.get("/reports", getReports);
router.patch("/reports/:id", resolveReport);

router.get("/analytics", getAnalytics);

module.exports = router;
