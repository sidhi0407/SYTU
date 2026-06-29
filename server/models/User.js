const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        passwordHash: {
            type: String,
            default: null // null for GitHub/OAuth-only accounts
        },
        name: {
            type: String,
            required: true
        },
        bio: {
            type: String,
            maxlength: 300,
            default: ""
        },
        profileImageUrl: {
            type: String,
            default: ""
        },
        headline: {
            type: String,
            default: "" // e.g., 'Full-Stack Developer at XYZ'
        },
        linkedinUrl: {
            type: String,
            default: ""
        },
        websiteUrl: {
            type: String,
            default: ""
        },
        // Embedded arrays — small, bounded, loaded with profile
        skills: [{
            name: {
                type: String,
                lowercase: true,
                trim: true
            },
            proficiency: {
                type: String,
                enum: ["beginner", "intermediate", "expert"],
                default: "beginner"
            }
        }],
        interests: [{
            type: String,
            lowercase: true,
            trim: true
        }],
        // Flags
        isPremium: {
            type: Boolean,
            default: false
        },
        isEmailVerified: {
            type: Boolean,
            default: false
        },
        isSuspended: {
            type: Boolean,
            default: false
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user"
        },
        // Online presence
        lastSeen: {
            type: Date,
            default: Date.now
        },
        // GitHub integration fields
        githubId: {
            type: String,
            unique: true,
            sparse: true
        },
        githubUsername: {
            type: String,
            default: ""
        },
        // Add existing schema compatibility support
        university: {
            type: String,
            default: ""
        },
        branch: {
            type: String,
            default: ""
        },
        semester: {
            type: Number,
            default: 1
        }
    },
    {
        timestamps: true
    }
);

// Indexes
userSchema.index({ "skills.name": 1 });
userSchema.index({ interests: 1 });

module.exports = mongoose.model("User", userSchema);