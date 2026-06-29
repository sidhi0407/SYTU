const crypto = require("crypto");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const Notification = require("../models/Notification");

// 1. Get Subscription Plans (GET /subscription/plans - Public)
const getPlans = (req, res) => {
    res.status(200).json({
        success: true,
        plans: [
            {
                id: "monthly",
                name: "SYTU Premium Monthly",
                price: 49,
                currency: "INR",
                features: [
                    "Advanced Search (Filter by Skills & Interests)",
                    "High-Priority Discovery Feed (Match overlap scoring)",
                    "Post Unlimited Collaboration Board Openings",
                    "Detailed Portfolio View Analytics Dashboard"
                ]
            }
        ]
    });
};

// 2. Create Razorpay Order (POST /subscription/create)
const createOrder = async (req, res) => {
    try {
        const userId = req.user._id;

        // Razorpay API orders are usually generated via SDK. Let's create a Mock Order ID
        const mockOrderId = "order_" + crypto.randomBytes(8).toString("hex");
        const amount = 4900; // ₹49 in paise

        res.status(200).json({
            success: true,
            orderId: mockOrderId,
            amount,
            currency: "INR",
            key: process.env.RAZORPAY_KEY_ID || "rzp_test_mock_key_12345"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Verify Payment / Create Subscription (POST /subscription/verify)
const verifyPayment = async (req, res) => {
    try {
        const { orderId, paymentId, signature } = req.body;
        const userId = req.user._id;

        if (!orderId || !paymentId) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Order ID and Payment ID are required" });
        }

        // Mock verification validation
        // In real Razorpay, we'd verify HMAC SHA256 of: orderId + "|" + paymentId using the secret
        // For development, we allow any mock signature
        console.log(`[Billing System] Verifying signature: ${signature}`);

        // Set expiry date: 30 days from now
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Save or update subscription
        let subscription = await Subscription.findOne({ userId });
        if (subscription) {
            subscription.razorpayOrderId = orderId;
            subscription.razorpayPaymentId = paymentId;
            subscription.status = "active";
            subscription.expiryDate = expiryDate;
            await subscription.save();
        } else {
            subscription = new Subscription({
                userId,
                razorpayOrderId: orderId,
                razorpayPaymentId: paymentId,
                plan: "monthly",
                amountPaise: 4900,
                status: "active",
                expiryDate,
                autoRenew: true
            });
            await subscription.save();
        }

        // Update User Premium Status
        const user = await User.findById(userId);
        user.isPremium = true;
        await user.save();

        // Create alert notification
        const notification = new Notification({
            userId,
            type: "sub_expiry",
            title: "Premium Subscription Activated",
            body: "Thank you for subscribing to SYTU Premium! Enjoy all advanced benefits.",
            actionUrl: "/settings/subscription"
        });
        await notification.save();

        if (global.io) {
            global.io.to(userId.toString()).emit("notification:new", notification);
        }

        res.status(200).json({
            success: true,
            message: "Payment verified, premium subscription activated successfully!",
            subscription
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Get Subscription Status (GET /subscription/status)
const getStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.status(200).json({
                success: true,
                isPremium: req.user.isPremium,
                status: "inactive",
                expiryDate: null
            });
        }

        res.status(200).json({
            success: true,
            isPremium: req.user.isPremium,
            status: subscription.status,
            expiryDate: subscription.expiryDate,
            autoRenew: subscription.autoRenew
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Cancel Auto-Renewal (POST /subscription/cancel)
const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const subscription = await Subscription.findOne({ userId });

        if (!subscription) {
            return res.status(404).json({ success: false, message: "No active subscription found" });
        }

        subscription.autoRenew = false;
        subscription.status = "cancelled"; // still active until expiryDate
        await subscription.save();

        res.status(200).json({
            success: true,
            message: "Auto-renewal cancelled successfully. Your benefits will continue until the billing expiry date.",
            subscription
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 6. Handle Razorpay Webhook (POST /webhooks/razorpay - System)
const handleWebhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_webhook_secret_key";
        const signature = req.headers["x-razorpay-signature"];

        // Validate webhook HMAC signature if keys are active
        // For now, accept and print webhook payload
        const event = req.body.event;
        console.log(`[Razorpay Webhook] Received Event: ${event}`, req.body);

        // Handle webhook actions
        // payment.captured, subscription.halted, subscription.cancelled
        res.status(200).json({ status: "ok" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getPlans,
    createOrder,
    verifyPayment,
    getStatus,
    cancelSubscription,
    handleWebhook
};
