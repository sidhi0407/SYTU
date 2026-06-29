const CollaborationPost = require("../models/CollaborationPost");
const CollaborationSave = require("../models/CollaborationSave");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { addJob } = require("../config/queues");

// 1. List Collaboration Posts (GET /collaboration)
const getCollaborationPosts = async (req, res) => {
    try {
        const { type, skills, isRemote } = req.query;
        const queryObj = { isOpen: true }; // only show open positions

        if (type) queryObj.type = type;
        if (isRemote !== undefined) queryObj.isRemote = isRemote === "true";
        if (skills) {
            const skillsList = skills.split(",").map(s => s.trim().toLowerCase());
            queryObj.skillsNeeded = { $in: skillsList };
        }

        const posts = await CollaborationPost.find(queryObj)
            .populate("userId", "name username profileImageUrl headline")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            posts
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Create Collaboration Post (POST /collaboration - Premium Only)
const createCollaborationPost = async (req, res) => {
    try {
        const { type, title, description, skillsNeeded, isRemote } = req.body;
        const userId = req.user._id;

        if (!type || !title || !description) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Type, title, and description are required" });
        }

        const post = new CollaborationPost({
            userId,
            type,
            title,
            description,
            skillsNeeded: skillsNeeded || [],
            isRemote: isRemote === true,
            isOpen: true
        });

        await post.save();

        res.status(201).json({
            success: true,
            message: "Collaboration post published successfully",
            post
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Get Single Post Details (GET /collaboration/:id)
const getCollaborationPostById = async (req, res) => {
    try {
        const post = await CollaborationPost.findById(req.params.id)
            .populate("userId", "name username bio profileImageUrl headline skills");

        if (!post) {
            return res.status(404).json({ success: false, code: "POST_NOT_FOUND", message: "Post not found" });
        }

        res.status(200).json({
            success: true,
            post
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Close Collaboration Post (PATCH /collaboration/:id/close)
const closeCollaborationPost = async (req, res) => {
    try {
        const post = await CollaborationPost.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, code: "POST_NOT_FOUND", message: "Post not found" });
        }

        if (post.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You are not authorized to close this post" });
        }

        post.isOpen = false;
        await post.save();

        res.status(200).json({
            success: true,
            message: "Collaboration post closed successfully",
            post
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Apply for Collaboration (POST /collaboration/:id/apply)
const applyToCollaborationPost = async (req, res) => {
    try {
        const postId = req.params.id;
        const applicantId = req.user._id;

        const post = await CollaborationPost.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, code: "POST_NOT_FOUND", message: "Post not found" });
        }

        if (!post.isOpen) {
            return res.status(400).json({ success: false, message: "This listing is closed." });
        }

        if (post.userId.toString() === applicantId.toString()) {
            return res.status(400).json({ success: false, message: "You cannot apply to your own post." });
        }

        const creator = await User.findById(post.userId);
        if (!creator) {
            return res.status(404).json({ success: false, message: "Listing creator not found" });
        }

        // Create Notification
        const notification = new Notification({
            userId: post.userId,
            type: "collab_req",
            title: "New Collaboration Application",
            body: `${req.user.name} applied for your post "${post.title}".`,
            actionUrl: `/collaboration/${post._id}`
        });
        await notification.save();

        // Enqueue email warning
        await addJob("email-queue", "send_collaboration_apply_alert", {
            creatorEmail: creator.email,
            creatorName: creator.name,
            postTitle: post.title,
            applicantName: req.user.name,
            applicantUsername: req.user.username
        });

        // Socket notify
        if (global.io) {
            global.io.to(post.userId.toString()).emit("notification:new", notification);
        }

        res.status(200).json({
            success: true,
            message: "Application submitted successfully! Post owner has been notified."
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 6. Save/Bookmark Post (POST /collaboration/:id/save)
const saveCollaborationPost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user._id;

        const post = await CollaborationPost.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, code: "POST_NOT_FOUND", message: "Post not found" });
        }

        // Check if already bookmarked
        const existingSave = await CollaborationSave.findOne({ userId, postId });
        if (existingSave) {
            // Unsave/Toggle behavior
            await CollaborationSave.findByIdAndDelete(existingSave._id);
            return res.status(200).json({
                success: true,
                saved: false,
                message: "Bookmark removed"
            });
        }

        const newSave = new CollaborationSave({ userId, postId });
        await newSave.save();

        res.status(201).json({
            success: true,
            saved: true,
            message: "Collaboration post bookmarked successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getCollaborationPosts,
    createCollaborationPost,
    getCollaborationPostById,
    closeCollaborationPost,
    applyToCollaborationPost,
    saveCollaborationPost
};
