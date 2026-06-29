const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
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
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", auth, logoutUser);
router.post("/refresh", refreshToken);
router.post("/verify-email", verifyEmail);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/github", initiateGithubOAuth);
router.get("/github/callback", handleGithubCallback);

module.exports = router;