const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
    {
        participants: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }],
        lastMessage: {
            content: {
                type: String,
                default: ""
            },
            senderId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            sentAt: {
                type: Date,
                default: Date.now
            }
        }
    },
    {
        timestamps: true
    }
);

// Indexes
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
