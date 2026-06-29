const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },
        razorpayOrderId: {
            type: String,
            default: ""
        },
        razorpayPaymentId: {
            type: String,
            default: ""
        },
        razorpaySubscriptionId: {
            type: String,
            default: ""
        },
        plan: {
            type: String,
            enum: ["monthly"],
            default: "monthly"
        },
        amountPaise: {
            type: Number,
            default: 4900 // 4900 Paise = ₹49
        },
        status: {
            type: String,
            enum: ["active", "cancelled", "expired", "trial"],
            default: "trial"
        },
        startDate: {
            type: Date,
            default: Date.now
        },
        expiryDate: {
            type: Date,
            required: true,
            index: true
        },
        autoRenew: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Indexes
subscriptionSchema.index({ expiryDate: 1, status: 1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
