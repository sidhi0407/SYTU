const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
    getPlans,
    createOrder,
    verifyPayment,
    getStatus,
    cancelSubscription,
    handleWebhook
} = require("../controllers/subscriptionController");

const router = express.Router();

router.get("/plans", getPlans);
router.post("/create", auth, createOrder);
router.post("/verify", auth, verifyPayment);
router.get("/status", auth, getStatus);
router.post("/cancel", auth, cancelSubscription);

// Webhook endpoint (system verification)
router.post("/webhooks/razorpay", handleWebhook);

module.exports = router;
