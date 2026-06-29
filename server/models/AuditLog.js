const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        action: {
            type: String,
            required: true // 'suspend_user', 'ban_user', 'resolve_report', etc.
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true // includes createdAt
    }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
