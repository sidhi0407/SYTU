const mongoose = require("mongoose");

const collaborationPostSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        type: {
            type: String,
            enum: ["developer", "designer", "startup", "freelance", "hackathon"],
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        skillsNeeded: {
            type: [String],
            default: [],
            index: true
        },
        isRemote: {
            type: Boolean,
            default: false
        },
        isOpen: {
            type: Boolean,
            default: true
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days
        }
    },
    {
        timestamps: true
    }
);

// Indexes
collaborationPostSchema.index({ expiresAt: 1, isOpen: 1 });

module.exports = mongoose.model("CollaborationPost", collaborationPostSchema);
