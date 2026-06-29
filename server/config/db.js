const mongoose = require("mongoose");
const dns = require("dns");

// Set DNS servers to Google and Cloudflare public DNS
// This resolves "querySrv ECONNREFUSED" caused by ISP/local network DNS lookup limits
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1"]);

let mongoMemoryServer = null;

const connectDB = async () => {
    try {
        console.log("Connecting to primary MongoDB URI...");
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 3000,
        });
        console.log("MongoDB Connected to Atlas/Primary:", conn.connection.host);
    } catch (error) {
        console.warn("Primary MongoDB connection failed. Trying local fallback (mongodb://127.0.0.1:27017/sytu)...");
        try {
            const localConn = await mongoose.connect("mongodb://127.0.0.1:27017/sytu", {
                serverSelectionTimeoutMS: 3000,
            });
            console.log("MongoDB Connected to Local Fallback:", localConn.connection.host);
        } catch (localError) {
            console.warn("Local MongoDB connection failed. Attempting to start in-memory database server...");
            try {
                const { MongoMemoryServer } = require("mongodb-memory-server");
                mongoMemoryServer = await MongoMemoryServer.create();
                const uri = mongoMemoryServer.getUri();
                console.log("In-Memory MongoDB Server started successfully!");
                
                const inMemoryConn = await mongoose.connect(uri);
                console.log("MongoDB Connected to In-Memory Database:", inMemoryConn.connection.host);
            } catch (memoryError) {
                console.error("Critical: All MongoDB connection strategies failed.");
                console.error("Primary Error details:", error.message);
                console.error("Local Error details:", localError.message);
                console.error("In-Memory Server Error details:", memoryError.message);
                process.exit(1);
            }
        }
    }
};

module.exports = connectDB;