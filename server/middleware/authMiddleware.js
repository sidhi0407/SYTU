const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const { redisClient } = require("../config/redis");

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                code: "UNAUTHORIZED",
                message: "Access token required"
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = verifyToken(token);
        
        if (!decoded || !decoded.id) {
            return res.status(401).json({
                success: false,
                code: "INVALID_TOKEN",
                message: "Session expired or invalid token"
            });
        }

        // Check if token's user ID is in Redis blocklist (logout revocation)
        const isBlocklisted = await redisClient.get(`blocklist:${decoded.id}`);
        if (isBlocklisted) {
            return res.status(401).json({
                success: false,
                code: "TOKEN_REVOKED",
                message: "You have been logged out. Please sign in again."
            });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                code: "USER_NOT_FOUND",
                message: "User account no longer exists"
            });
        }

        if (user.isSuspended) {
            return res.status(403).json({
                success: false,
                code: "USER_SUSPENDED",
                message: "Your account is temporarily suspended. Please contact admin."
            });
        }

        // Update lastSeen presence timestamps on API requests
        user.lastSeen = new Date();
        await user.save();

        req.user = user;
        next();
    } catch (err) {
        return res.status(500).json({
            success: false,
            code: "AUTH_ERROR",
            message: err.message
        });
    }
};

const requirePremium = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            code: "UNAUTHORIZED",
            message: "Authentication required"
        });
    }

    // Bypass premium check in development mode for testing
    if (process.env.NODE_ENV !== "production") {
        return next();
    }

    if (!req.user.isPremium) {
        return res.status(403).json({
            success: false,
            code: "PREMIUM_REQUIRED",
            message: "This feature requires a premium SYTU subscription (₹49/mo)."
        });
    }

    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            code: "UNAUTHORIZED",
            message: "Authentication required"
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            code: "FORBIDDEN",
            message: "Administrator privileges required"
        });
    }

    next();
};

module.exports = {
    auth,
    requirePremium,
    requireAdmin
};
