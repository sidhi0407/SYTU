const mongoose = require("mongoose");

const githubIntegrationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },
        accessTokenEnc: {
            type: String,
            required: true
        },
        githubUserId: {
            type: String,
            default: ""
        },
        reposData: {
            type: mongoose.Schema.Types.Mixed,
            default: []
        },
        contributionData: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        languagesData: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        lastSyncedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("GithubIntegration", githubIntegrationSchema);
