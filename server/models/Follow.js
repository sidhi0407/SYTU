const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
    {
        followerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        followeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        }
    },
    {
        timestamps: true
    }
);

// Indexes
followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });

module.exports = mongoose.model("Follow", followSchema);
