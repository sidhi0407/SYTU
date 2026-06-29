const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { redisClient } = require("../config/redis");
const { addJob } = require("../config/queues");
const { signAccessToken, signRefreshToken, verifyToken } = require("../utils/jwt");

// 1. Register
const registerUser = async (req, res) => {
    try {
        const { email, password, username, mobile } = req.body;
        const name = req.body.name || req.body.fullName;

        if (!name || !email || !password || !username) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Please fill all required fields" });
        }

        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(400).json({ success: false, code: "EMAIL_EXISTS", message: "Email already exists" });
        }

        const existingUsername = await User.findOne({ username: username.toLowerCase() });
        if (existingUsername) {
            return res.status(400).json({ success: false, code: "USERNAME_EXISTS", message: "Username already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        
        const newUser = new User({
            name,
            email: email.toLowerCase(),
            username: username.toLowerCase(),
            passwordHash: hashedPassword,
            isEmailVerified: false,
            role: "user"
        });

        await newUser.save();

        // Sign dynamic email verification token (expires in 24 hours)
        const verificationToken = signAccessToken(newUser._id);
        
        // Queue background verification email
        await addJob("email-queue", "send_verification_email", {
            email: newUser.email,
            name: newUser.name,
            token: verificationToken
        });

        res.status(201).json({
            success: true,
            message: "User registered successfully. Verification email queued."
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Login
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Please provide email and password" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.passwordHash) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        if (user.isSuspended) {
            return res.status(403).json({ success: false, code: "USER_SUSPENDED", message: "Your account has been suspended" });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
        }

        const accessToken = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);

        // Set HttpOnly Cookie for Refresh Token
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(200).json({
            success: true,
            message: "Login successful",
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                isPremium: user.isPremium
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Logout
const logoutUser = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Add Access Token JTI / user ID to blocklist
        await redisClient.set(`blocklist:${userId}`, "true", "EX", 15 * 60); // 15 mins blocklist

        // Clear Cookie
        res.clearCookie("refreshToken");

        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Refresh Token
const refreshToken = async (req, res) => {
    try {
        const cookieToken = req.cookies ? req.cookies.refreshToken : null;
        if (!cookieToken) {
            return res.status(401).json({ success: false, code: "REFRESH_TOKEN_REQUIRED", message: "Refresh token is missing" });
        }

        const decoded = verifyToken(cookieToken);
        if (!decoded || !decoded.id) {
            return res.status(401).json({ success: false, code: "INVALID_REFRESH_TOKEN", message: "Invalid or expired refresh token" });
        }

        const user = await User.findById(decoded.id);
        if (!user || user.isSuspended) {
            return res.status(401).json({ success: false, code: "UNAUTHORIZED", message: "User suspended or not found" });
        }

        const newAccessToken = signAccessToken(user._id);
        res.status(200).json({
            success: true,
            accessToken: newAccessToken
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Verify Email
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, code: "TOKEN_REQUIRED", message: "Token is required" });
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.id) {
            return res.status(400).json({ success: false, code: "INVALID_TOKEN", message: "Invalid or expired token" });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        user.isEmailVerified = true;
        await user.save();

        // Enqueue welcome email
        await addJob("email-queue", "send_welcome", {
            email: user.email,
            name: user.name
        });

        res.status(200).json({
            success: true,
            message: "Email verified successfully!"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 6. Send OTP
const sendOtp = async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) {
            return res.status(400).json({ success: false, code: "MOBILE_REQUIRED", message: "Mobile number is required" });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Cache OTP in Redis with 10 minutes expiry (600s)
        await redisClient.set(`otp:${mobile}`, otp, "EX", 600);

        // Queue background job simulating OTP send
        await addJob("email-queue", "send_otp", { mobile, otp });

        res.status(200).json({
            success: true,
            message: `OTP sent successfully. (Mock OTP: ${otp})`
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 7. Verify OTP
const verifyOtp = async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        if (!mobile || !otp) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Mobile and OTP are required" });
        }

        const cachedOtp = await redisClient.get(`otp:${mobile}`);
        if (!cachedOtp) {
            return res.status(400).json({ success: false, code: "OTP_EXPIRED", message: "OTP has expired or is invalid" });
        }

        if (cachedOtp !== otp) {
            return res.status(400).json({ success: false, code: "INVALID_OTP", message: "Invalid OTP" });
        }

        // Remove OTP cache on success
        await redisClient.del(`otp:${mobile}`);

        res.status(200).json({
            success: true,
            message: "OTP verified successfully!"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 8. Forgot Password
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, code: "EMAIL_REQUIRED", message: "Email is required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "Email not registered" });
        }

        // Sign password reset token (1 hour expiry)
        const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "sytu_secret_key_12345", { expiresIn: "1h" });

        await addJob("email-queue", "send_reset_password_link", {
            email: user.email,
            name: user.name,
            token: resetToken
        });

        res.status(200).json({
            success: true,
            message: "Password reset link queued successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 9. Reset Password
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Token and new password are required" });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || "sytu_secret_key_12345");
        } catch (err) {
            return res.status(400).json({ success: false, code: "INVALID_TOKEN", message: "Reset token is invalid or expired" });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password updated successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 10. Mock GitHub OAuth Redirect
const initiateGithubOAuth = async (req, res) => {
    // Simply return github mock authorize URL
    res.status(200).json({
        success: true,
        redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/github/callback?code=mock_github_code_abc123`
    });
};

// 11. Mock GitHub Callback
const handleGithubCallback = async (req, res) => {
    try {
        const { code } = req.query;
        // Mock profile fetch using code
        const mockGithubUser = {
            id: "github_id_99999",
            login: "github_dev_mock",
            email: "github_dev@sytu.com",
            name: "Mock GitHub Developer"
        };

        let user = await User.findOne({ githubId: mockGithubUser.id });
        if (!user) {
            // Check if email already registered
            user = await User.findOne({ email: mockGithubUser.email });
            if (user) {
                // Link account
                user.githubId = mockGithubUser.id;
                user.githubUsername = mockGithubUser.login;
                await user.save();
            } else {
                // Signup
                user = new User({
                    name: mockGithubUser.name,
                    email: mockGithubUser.email,
                    username: mockGithubUser.login.toLowerCase(),
                    githubId: mockGithubUser.id,
                    githubUsername: mockGithubUser.login,
                    isEmailVerified: true
                });
                await user.save();
            }
        }

        const accessToken = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({
            success: true,
            message: "GitHub Auth successful",
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                isPremium: user.isPremium
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    refreshToken,
    verifyEmail,
    sendOtp,
    verifyOtp,
    forgotPassword,
    resetPassword,
    initiateGithubOAuth,
    handleGithubCallback
};