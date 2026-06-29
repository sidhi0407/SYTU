const mongoose = require("mongoose");

const collaborationSaveSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CollaborationPost",
            required: true,
            index: true
        }
    },
    {
        timestamps: true
    }
);

// Unique bookmark compound index
collaborationSaveSchema.index({ userId: 1, postId: 1 }, { unique: true });

module.exports = mongoose.model("CollaborationSave", collaborationSaveSchema);
