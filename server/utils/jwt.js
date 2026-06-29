const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "sytu_secret_key_12345";
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

const signAccessToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });
};

const signRefreshToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        console.warn("[JWT Verification Failed]", err.message);
        return null;
    }
};

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyToken
};
