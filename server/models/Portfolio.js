const mongoose = require("mongoose");

const portfolioSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },
        about: {
            type: String,
            default: ""
        },
        headline: {
            type: String,
            default: ""
        },
        experience: [{
            company: { type: String, required: true },
            role: { type: String, required: true },
            from: { type: Date },
            to: { type: Date, default: null }, // null means Current
            description: { type: String, default: "" }
        }],
        education: [{
            institution: { type: String, required: true },
            degree: { type: String, required: true },
            from: { type: Date },
            to: { type: Date, default: null }
        }],
        achievements: [{
            title: { type: String, required: true },
            description: { type: String, default: "" },
            date: { type: Date }
        }],
        certifications: [{
            name: { type: String, required: true },
            issuer: { type: String, required: true },
            url: { type: String, default: "" },
            date: { type: Date }
        }],
        theme: {
            type: String,
            enum: ["default", "minimal", "dark"],
            default: "default"
        },
        isPublished: {
            type: Boolean,
            default: false
        },
        viewCount: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Portfolio", portfolioSchema);
