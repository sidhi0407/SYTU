// Trigger nodemon reload - restored atlas
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");

// Configuration imports
const connectDB = require("./config/db");
const { registerSocketServer } = require("./sockets/socketServer");

// Route imports
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const discoveryRoutes = require("./routes/discoveryRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const chatRoutes = require("./routes/chatRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");
const projectRoutes = require("./routes/projectRoutes");
const collaborationRoutes = require("./routes/collaborationRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const githubRoutes = require("./routes/githubRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const server = http.createServer(app);

// Bind Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: "*", // allow all origins for dev/testing ease
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
    }
});

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static uploads serving (local avatar/screenshot/file serving)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Debug logger
app.use((req, res, next) => {
    console.log(`[API REQUEST] ${req.method} ${req.url}`);
    next();
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/conversations", chatRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/collaboration", collaborationRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

// Root Status check
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "SYTU Full-Stack Backend is Running Successfully!",
        time: new Date()
    });
});

// Global Express Error-handling Middleware
app.use((err, req, res, next) => {
    console.error("[Global Error Middleware]", err);
    res.status(err.status || 500).json({
        success: false,
        code: err.code || "SERVER_ERROR",
        message: err.message || "An internal server error occurred"
    });
});

// Port Setup
const PORT = process.env.PORT || 5000;

// Connect Database & Start server
(async () => {
    try {
        await connectDB();
        registerSocketServer(io);

        server.listen(PORT, () => {
            console.log(`=================================================`);
            console.log(`  SYTU API Server running on port ${PORT}`);
            console.log(`  Socket.IO active and listening on client events`);
            console.log(`=================================================`);
        });
    } catch (err) {
        console.error("Critical: Failed to connect dependencies at startup:", err);
        process.exit(1);
    }
})();