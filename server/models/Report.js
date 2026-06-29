const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
    {
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        reason: {
            type: String,
            enum: ["spam", "fake_profile", "harassment", "inappropriate"],
            required: true
        },
        description: {
            type: String,
            default: ""
        },
        status: {
            type: String,
            enum: ["open", "resolved", "dismissed"],
            default: "open"
        },
        adminNote: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Report", reportSchema);
