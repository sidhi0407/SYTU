const mongoose = require("mongoose");

const connectionSchema = new mongoose.Schema(
    {
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "blocked"],
            default: "pending"
        }
    },
    {
        timestamps: true
    }
);

// Indexes
connectionSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });
connectionSchema.index({ receiverId: 1, status: 1 });

module.exports = mongoose.model("Connection", connectionSchema);
