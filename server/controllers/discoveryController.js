const User = require("../models/User");
const Connection = require("../models/Connection");
const { redisClient } = require("../config/redis");
const matchScore = require("../utils/matchScore");

// 1. Get Discovery Feed (Premium Only, Cached for 5 min)
const getDiscoveryFeed = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `feed:${userId}`;

        // Check Redis Cache
        const cachedFeed = await redisClient.get(cacheKey);
        if (cachedFeed) {
            console.log(`[Cache HIT] Serving discovery feed for: ${userId}`);
            return res.status(200).json(JSON.parse(cachedFeed));
        }

        console.log(`[Cache MISS] Precomputing discovery feed for: ${userId}`);

        // Fetch user's existing connections to filter them out
        const connections = await Connection.find({
            $or: [{ senderId: userId }, { receiverId: userId }]
        });

        const excludedUserIds = new Set();
        excludedUserIds.add(userId.toString()); // exclude self
        connections.forEach(conn => {
            excludedUserIds.add(conn.senderId.toString());
            excludedUserIds.add(conn.receiverId.toString());
        });

        // Load candidates (non-suspended users)
        const candidates = await User.find({
            _id: { $nin: Array.from(excludedUserIds) },
            isSuspended: false
        });

        // Compute scores
        let scoredCandidates = candidates.map(candidate => {
            const score = matchScore(req.user, candidate);
            return {
                user: {
                    id: candidate._id,
                    name: candidate.name,
                    username: candidate.username,
                    headline: candidate.headline,
                    bio: candidate.bio,
                    profileImageUrl: candidate.profileImageUrl,
                    skills: candidate.skills,
                    interests: candidate.interests,
                    isPremium: candidate.isPremium,
                    lastSeen: candidate.lastSeen
                },
                score
            };
        });

        // Fallback for new user (no skills) or zero overlap candidates: use random sampling
        const hasSkillsOrInterests = req.user.skills.length > 0 || req.user.interests.length > 0;
        const maxScore = scoredCandidates.reduce((max, c) => Math.max(max, c.score), 0);
        
        if (!hasSkillsOrInterests || maxScore === 0) {
            console.log("[Discovery Feed] Falling back to random sampling (no skills or zero overlap).");
            // Shuffle scoredCandidates randomly
            scoredCandidates.sort(() => 0.5 - Math.random());
        } else {
            // Sort by match score descending
            scoredCandidates.sort((a, b) => b.score - a.score);
        }

        // Limit to top 20 recommendations
        const feedResults = scoredCandidates.slice(0, 20);

        const responseData = {
            success: true,
            feed: feedResults
        };

        // Cache precomputations in Redis for 5 minutes (300 seconds)
        await redisClient.set(cacheKey, JSON.stringify(responseData), "EX", 300);

        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Get Random Single User (Free Feature)
const getRandomUser = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch user's existing connections to filter them out
        const connections = await Connection.find({
            $or: [{ senderId: userId }, { receiverId: userId }]
        });

        const excludedUserIds = new Set();
        excludedUserIds.add(userId.toString()); // exclude self
        connections.forEach(conn => {
            excludedUserIds.add(conn.senderId.toString());
            excludedUserIds.add(conn.receiverId.toString());
        });

        // Get 1 random candidate not connected
        const count = await User.countDocuments({
            _id: { $nin: Array.from(excludedUserIds) },
            isSuspended: false
        });

        if (count === 0) {
            return res.status(200).json({
                success: true,
                user: null,
                message: "No new users available at the moment."
            });
        }

        const randomIndex = Math.floor(Math.random() * count);
        const randomUser = await User.findOne({
            _id: { $nin: Array.from(excludedUserIds) },
            isSuspended: false
        })
            .select("name username bio profileImageUrl headline skills interests isPremium lastSeen")
            .skip(randomIndex);

        res.status(200).json({
            success: true,
            user: randomUser
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getDiscoveryFeed,
    getRandomUser
};
