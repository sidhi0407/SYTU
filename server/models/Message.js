const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        content: {
            type: String,
            default: null
        },
        fileUrl: {
            type: String,
            default: null
        },
        fileType: {
            type: String,
            enum: ["image", "pdf", "file", null],
            default: null
        },
        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true // includes createdAt which is indexed
    }
);

// Indexes
messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
