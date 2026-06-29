const User = require("../models/User");
const Report = require("../models/Report");
const Portfolio = require("../models/Portfolio");
const { redisClient } = require("../config/redis");
const { addJob } = require("../config/queues");

// 1. Get Public Profile (Cached for 2 min)
const getPublicProfile = async (req, res) => {
    try {
        const { username } = req.params;
        const cacheKey = `profile:${username.toLowerCase()}`;

        // Attempt Redis cache lookup
        const cachedProfile = await redisClient.get(cacheKey);
        if (cachedProfile) {
            console.log(`[Cache HIT] Serving profile for: ${username}`);
            return res.status(200).json(JSON.parse(cachedProfile));
        }

        console.log(`[Cache MISS] Querying DB for profile: ${username}`);
        const user = await User.findOne({ username: username.toLowerCase() })
            .select("name username bio profileImageUrl headline linkedinUrl websiteUrl skills interests isPremium lastSeen university branch semester");

        if (!user || user.isSuspended) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        // Fetch associated portfolio link/ID if it exists
        const portfolio = await Portfolio.findOne({ userId: user._id, isPublished: true }).select("_id theme");
        
        const profileData = {
            success: true,
            user,
            portfolioLink: portfolio ? `/u/${user.username}` : null,
            theme: portfolio ? portfolio.theme : "default"
        };

        // Cache response in Redis for 2 min (120s)
        await redisClient.set(cacheKey, JSON.stringify(profileData), "EX", 120);

        res.status(200).json(profileData);
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Get Authenticated User Details (GET /users/me)
const getMe = async (req, res) => {
    try {
        const user = req.user; // already loaded in auth middleware
        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Update User Profile (PATCH /users/me)
const updateMe = async (req, res) => {
    try {
        const { name, bio, headline, linkedinUrl, websiteUrl, university, branch, semester } = req.body;
        const user = req.user;

        if (name) user.name = name;
        if (bio !== undefined) user.bio = bio;
        if (headline !== undefined) user.headline = headline;
        if (linkedinUrl !== undefined) user.linkedinUrl = linkedinUrl;
        if (websiteUrl !== undefined) user.websiteUrl = websiteUrl;
        if (university !== undefined) user.university = university;
        if (branch !== undefined) user.branch = branch;
        if (semester !== undefined) user.semester = semester;

        await user.save();

        // Invalidate public profile cache in Redis
        await redisClient.del(`profile:${user.username}`);

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Request Avatar Presigned URL (POST /users/me/avatar)
const getAvatarPresignedUrl = async (req, res) => {
    try {
        const userId = req.user.id;
        const fileKey = `avatars/${userId}_${Date.now()}`;
        
        // Return a mock presigned S3 url redirecting back to our mock upload endpoint
        const mockPresignedUrl = `${req.protocol}://${req.get("host")}/api/users/me/avatar/mock-upload`;

        res.status(200).json({
            success: true,
            presignedUrl: mockPresignedUrl,
            fileKey
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Mock Upload Handler (simulating PUT directly to S3)
const handleMockAvatarUpload = async (req, res) => {
    try {
        // Since we are bypass uploading, we will just return success.
        // On success, client will patch their user profileImageUrl with the key returned.
        res.status(200).send("Upload Mock S3 Success!");
    } catch (error) {
        res.status(500).send(error.message);
    }
};

// 6. Add Skill (POST /users/me/skills)
const addSkill = async (req, res) => {
    try {
        const { name, proficiency } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Skill name is required" });
        }

        const user = req.user;
        
        // Prevent duplicate skill addition
        const skillIndex = user.skills.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
        if (skillIndex > -1) {
            user.skills[skillIndex].proficiency = proficiency || "beginner";
        } else {
            user.skills.push({ name: name.toLowerCase(), proficiency: proficiency || "beginner" });
        }

        await user.save();

        // Invalidate caches
        await redisClient.del(`profile:${user.username}`);
        await redisClient.del(`feed:${user._id}`); // invalidate discovery feed cache since skills changed

        res.status(200).json({
            success: true,
            message: "Skill added successfully",
            skills: user.skills
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 7. Delete Skill (DELETE /users/me/skills/:name)
const deleteSkill = async (req, res) => {
    try {
        const { name } = req.params;
        const user = req.user;

        user.skills = user.skills.filter(s => s.name.toLowerCase() !== name.toLowerCase());
        await user.save();

        // Invalidate caches
        await redisClient.del(`profile:${user.username}`);
        await redisClient.del(`feed:${user._id}`);

        res.status(200).json({
            success: true,
            message: "Skill removed successfully",
            skills: user.skills
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 8. Add Interest (POST /users/me/interests)
const addInterest = async (req, res) => {
    try {
        const { interest } = req.body;
        if (!interest) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Interest is required" });
        }

        const user = req.user;
        const normalizedInterest = interest.toLowerCase().trim();

        if (!user.interests.includes(normalizedInterest)) {
            user.interests.push(normalizedInterest);
            await user.save();
        }

        // Invalidate caches
        await redisClient.del(`profile:${user.username}`);
        await redisClient.del(`feed:${user._id}`);

        res.status(200).json({
            success: true,
            message: "Interest added successfully",
            interests: user.interests
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 9. Delete Interest (DELETE /users/me/interests/:name)
const deleteInterest = async (req, res) => {
    try {
        const { name } = req.params;
        const user = req.user;

        user.interests = user.interests.filter(i => i.toLowerCase() !== name.toLowerCase());
        await user.save();

        // Invalidate caches
        await redisClient.del(`profile:${user.username}`);
        await redisClient.del(`feed:${user._id}`);

        res.status(200).json({
            success: true,
            message: "Interest removed successfully",
            interests: user.interests
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 10. Search Users (GET /users/search)
const searchUsers = async (req, res) => {
    try {
        const { q, skills, interests } = req.query;
        const queryObj = { isSuspended: false };

        // Advanced filter checking (skills or interests filter requires Premium according to SRS 6.2)
        const isFilteringSkillsOrInterests = skills || interests;
        if (isFilteringSkillsOrInterests && !req.user.isPremium) {
            return res.status(403).json({
                success: false,
                code: "PREMIUM_REQUIRED",
                message: "Advanced filters (skills/interests) require a premium SYTU membership."
            });
        }

        // text search query
        if (q) {
            queryObj.$or = [
                { name: { $regex: q, $options: "i" } },
                { username: { $regex: q, $options: "i" } },
                { bio: { $regex: q, $options: "i" } },
                { headline: { $regex: q, $options: "i" } }
            ];
        }

        if (skills) {
            const skillsList = skills.split(",").map(s => s.trim().toLowerCase());
            queryObj["skills.name"] = { $in: skillsList };
        }

        if (interests) {
            const interestsList = interests.split(",").map(i => i.trim().toLowerCase());
            queryObj.interests = { $in: interestsList };
        }

        // Exclude current user from results
        queryObj._id = { $ne: req.user._id };

        const users = await User.find(queryObj)
            .select("name username bio profileImageUrl headline skills interests isPremium lastSeen")
            .limit(20);

        res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 11. Report Profile (POST /users/:id/report)
const reportProfile = async (req, res) => {
    try {
        const reporterId = req.user.id;
        const targetUserId = req.params.id;
        const { reason, description } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Reason is required" });
        }

        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "Target user not found" });
        }

        const newReport = new Report({
            reporterId,
            targetUserId,
            reason,
            description,
            status: "open"
        });

        await newReport.save();

        // Queue background moderation precomputations / alerts
        await addJob("moderation-queue", "process_report", {
            reportId: newReport._id,
            reason,
            targetUserId
        });

        res.status(201).json({
            success: true,
            message: "Report filed successfully. Our moderation team will review this shortly.",
            reportId: newReport._id
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getPublicProfile,
    getMe,
    updateMe,
    getAvatarPresignedUrl,
    handleMockAvatarUpload,
    addSkill,
    deleteSkill,
    addInterest,
    deleteInterest,
    searchUsers,
    reportProfile
};
