const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            default: ""
        },
        category: {
            type: String,
            enum: ["Web", "Mobile", "ML", "Design", "Other"],
            default: "Other",
            index: true
        },
        techStack: {
            type: [String],
            default: [],
            index: true
        },
        githubUrl: {
            type: String,
            default: ""
        },
        demoUrl: {
            type: String,
            default: ""
        },
        screenshotUrls: {
            type: [String],
            default: [] // up to 5 S3 keys
        },
        teamSize: {
            type: Number,
            default: 1
        },
        status: {
            type: String,
            enum: ["in_progress", "completed", "abandoned"],
            default: "in_progress"
        },
        isFeatured: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Project", projectSchema);
