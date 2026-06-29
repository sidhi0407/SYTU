const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

const registerSocketServer = (io) => {
    // Save socket server instance globally so HTTP controllers can broadcast events
    global.io = io;

    // Socket.IO Handshake Auth Middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth ? socket.handshake.auth.token : null;
            if (!token) {
                return next(new Error("Authentication token required"));
            }

            const decoded = verifyToken(token);
            if (!decoded || !decoded.id) {
                return next(new Error("Invalid session token"));
            }

            const user = await User.findById(decoded.id);
            if (!user) {
                return next(new Error("User account not found"));
            }

            if (user.isSuspended) {
                return next(new Error("User account suspended"));
            }

            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication connection error"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.user._id.toString();
        console.log(`[Socket.IO] Client connected: ${socket.user.name} (${userId})`);

        // Join user's personal channel room
        socket.join(userId);

        // Update presence online state
        socket.broadcast.emit("presence:online", { userId });

        // Event: chat:send
        socket.on("chat:send", async (data) => {
            try {
                const { conversationId, content, fileUrl, fileType } = data;
                
                const Conversation = require("../models/Conversation");
                const Message = require("../models/Message");

                const conversation = await Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.includes(socket.user._id)) {
                    return;
                }

                // Create message document
                const message = new Message({
                    conversationId,
                    senderId: socket.user._id,
                    content: content || null,
                    fileUrl: fileUrl || null,
                    fileType: fileType || null,
                    isRead: false
                });
                await message.save();

                // Update conversation's lastMessage
                conversation.lastMessage = {
                    content: content || `Sent a ${fileType} attachment.`,
                    senderId: socket.user._id,
                    sentAt: new Date()
                };
                await conversation.save();

                // Emit event to other participants
                const recipientId = conversation.participants.find(p => p.toString() !== userId).toString();
                
                io.to(recipientId).emit("chat:receive", message);
                socket.emit("chat:receive", message); // send back to sender
            } catch (err) {
                console.error("[Socket chat:send error]", err);
            }
        });

        // Event: chat:typing
        socket.on("chat:typing", async (data) => {
            try {
                const { conversationId } = data;
                const Conversation = require("../models/Conversation");
                const conversation = await Conversation.findById(conversationId);
                
                if (conversation && conversation.participants.includes(socket.user._id)) {
                    const recipientId = conversation.participants.find(p => p.toString() !== userId).toString();
                    io.to(recipientId).emit("chat:typing", { conversationId, userId });
                }
            } catch (err) {
                console.error("[Socket chat:typing error]", err);
            }
        });

        // Event: chat:typing_stop
        socket.on("chat:typing_stop", async (data) => {
            try {
                const { conversationId } = data;
                const Conversation = require("../models/Conversation");
                const conversation = await Conversation.findById(conversationId);
                
                if (conversation && conversation.participants.includes(socket.user._id)) {
                    const recipientId = conversation.participants.find(p => p.toString() !== userId).toString();
                    io.to(recipientId).emit("chat:typing_stop", { conversationId, userId });
                }
            } catch (err) {
                console.error("[Socket chat:typing_stop error]", err);
            }
        });

        // Event: chat:read (Marking messages as read)
        socket.on("chat:read", async (data) => {
            try {
                const { conversationId } = data;
                const Conversation = require("../models/Conversation");
                const Message = require("../models/Message");

                const conversation = await Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.includes(socket.user._id)) {
                    return;
                }

                const peerId = conversation.participants.find(p => p.toString() !== userId);
                if (peerId) {
                    await Message.updateMany(
                        { conversationId, senderId: peerId, isRead: false },
                        { $set: { isRead: true } }
                    );

                    io.to(peerId.toString()).emit("chat:read_ack", { conversationId, readerId: userId });
                }
            } catch (err) {
                console.error("[Socket chat:read error]", err);
            }
        });

        // Event: disconnect
        socket.on("disconnect", async () => {
            console.log(`[Socket.IO] Client disconnected: ${socket.user.name}`);
            
            // Broadcast offline state
            socket.broadcast.emit("presence:offline", { userId });

            try {
                // Update user lastSeen timestamp in MongoDB
                await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
            } catch (err) {
                console.error("[Socket disconnect presence update error]", err);
            }
        });
    });
};

module.exports = { registerSocketServer };
