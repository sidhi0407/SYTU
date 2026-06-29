const Connection = require("../models/Connection");
const User = require("../models/User");
const Follow = require("../models/Follow");
const Conversation = require("../models/Conversation");
const Notification = require("../models/Notification");
const Message = require("../models/Message");
const { addJob } = require("../config/queues");

// 1. Send Connection Request (POST /connections/request)
const sendConnectionRequest = async (req, res) => {
    try {
        const senderId = req.user._id;
        const { receiverId } = req.body;

        if (!receiverId) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Receiver ID is required" });
        }

        if (senderId.toString() === receiverId.toString()) {
            return res.status(400).json({ success: false, code: "SELF_CONNECTION", message: "You cannot connect with yourself" });
        }

        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "Receiver not found" });
        }

        // Check for existing connection/request/block
        const existingConnection = await Connection.findOne({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        });

        if (existingConnection) {
            if (existingConnection.status === "accepted") {
                return res.status(400).json({ success: false, code: "ALREADY_CONNECTED", message: "You are already connected" });
            }
            if (existingConnection.status === "blocked") {
                return res.status(403).json({ success: false, code: "BLOCKED", message: "Interaction blocked" });
            }
            return res.status(400).json({ success: false, code: "PENDING_REQUEST", message: "Connection request already pending" });
        }

        const newConnection = new Connection({
            senderId,
            receiverId,
            status: "pending"
        });

        await newConnection.save();

        // Create notification
        const notification = new Notification({
            userId: receiverId,
            type: "connection_req",
            title: "New Connection Request",
            body: `${req.user.name} wants to connect with you.`,
            actionUrl: "/connections"
        });
        await notification.save();

        // Queue background email job
        await addJob("email-queue", "send_connection_request_alert", {
            receiverEmail: receiver.email,
            receiverName: receiver.name,
            senderName: req.user.name
        });

        // Emit Socket.IO notification to receiver (using helper if global io exists)
        if (global.io) {
            global.io.to(receiverId.toString()).emit("notification:new", notification);
        }

        res.status(201).json({
            success: true,
            message: "Connection request sent successfully",
            connection: newConnection
        });
    } catch (error) {
        if (error.code === 11000) {
            // Duplicate compound key write
            return res.status(409).json({
                success: false,
                code: "DUPLICATE_CONNECTION_REQUEST",
                message: "A connection request already exists between these users."
            });
        }
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Accept Connection (POST /connections/:id/accept)
const acceptConnection = async (req, res) => {
    try {
        const connectionId = req.params.id;
        const receiverId = req.user._id;

        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({ success: false, code: "CONNECTION_NOT_FOUND", message: "Connection request not found" });
        }

        if (connection.receiverId.toString() !== receiverId.toString()) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You cannot accept this connection request" });
        }

        if (connection.status !== "pending") {
            return res.status(400).json({ success: false, code: "INVALID_STATUS", message: "Connection request is not pending" });
        }

        connection.status = "accepted";
        await connection.save();

        // Create 1-to-1 conversation for the pair
        let conversation = await Conversation.findOne({
            participants: { $all: [connection.senderId, connection.receiverId] }
        });

        if (!conversation) {
            conversation = new Conversation({
                participants: [connection.senderId, connection.receiverId],
                lastMessage: {
                    content: "Connection established. Start chatting!",
                    senderId: receiverId,
                    sentAt: new Date()
                }
            });
            await conversation.save();
        }

        // Create Notification for the sender
        const sender = await User.findById(connection.senderId);
        const notification = new Notification({
            userId: connection.senderId,
            type: "connection_req",
            title: "Connection Request Accepted",
            body: `${req.user.name} accepted your connection request.`,
            actionUrl: "/chat"
        });
        await notification.save();

        if (global.io) {
            global.io.to(connection.senderId.toString()).emit("notification:new", notification);
            // Notify presence updates
            global.io.to(connection.senderId.toString()).emit("presence:online", { userId: receiverId });
            global.io.to(receiverId.toString()).emit("presence:online", { userId: connection.senderId });
        }

        res.status(200).json({
            success: true,
            message: "Connection request accepted",
            connection,
            conversationId: conversation._id
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Reject Connection (POST /connections/:id/reject)
const rejectConnection = async (req, res) => {
    try {
        const connectionId = req.params.id;
        const receiverId = req.user._id;

        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({ success: false, code: "CONNECTION_NOT_FOUND", message: "Connection request not found" });
        }

        if (connection.receiverId.toString() !== receiverId.toString()) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You cannot reject this connection request" });
        }

        connection.status = "rejected";
        await connection.save();

        res.status(200).json({
            success: true,
            message: "Connection request rejected",
            connection
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Remove Connection (DELETE /connections/:id)
const deleteConnection = async (req, res) => {
    try {
        const connectionId = req.params.id;
        const userId = req.user._id;

        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({ success: false, code: "CONNECTION_NOT_FOUND", message: "Connection not found" });
        }

        // Validate user belongs to this connection
        if (connection.senderId.toString() !== userId.toString() && connection.receiverId.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You cannot modify this connection" });
        }

        await Connection.findByIdAndDelete(connectionId);

        res.status(200).json({
            success: true,
            message: "Connection removed successfully. Chat history is retained."
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Block User (POST /users/:id/block)
const blockUser = async (req, res) => {
    try {
        const senderId = req.user._id;
        const receiverId = req.params.id;

        if (senderId.toString() === receiverId.toString()) {
            return res.status(400).json({ success: false, code: "SELF_BLOCK", message: "You cannot block yourself" });
        }

        // Find and update, or create block status connection
        let connection = await Connection.findOne({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        });

        if (connection) {
            connection.status = "blocked";
            // Ensure sender is the one who blocked
            connection.senderId = senderId;
            connection.receiverId = receiverId;
            await connection.save();
        } else {
            connection = new Connection({
                senderId,
                receiverId,
                status: "blocked"
            });
            await connection.save();
        }

        res.status(200).json({
            success: true,
            message: "User blocked successfully",
            connection
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 6. One-way Follow (POST /users/:id/follow)
const followUser = async (req, res) => {
    try {
        const followerId = req.user._id;
        const followeeId = req.params.id;

        if (followerId.toString() === followeeId.toString()) {
            return res.status(400).json({ success: false, code: "SELF_FOLLOW", message: "You cannot follow yourself" });
        }

        const targetUser = await User.findById(followeeId);
        if (!targetUser) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        const existingFollow = await Follow.findOne({ followerId, followeeId });
        if (existingFollow) {
            return res.status(400).json({ success: false, code: "ALREADY_FOLLOWING", message: "You are already following this user" });
        }

        const newFollow = new Follow({ followerId, followeeId });
        await newFollow.save();

        res.status(201).json({
            success: true,
            message: "Followed successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 7. Unfollow (DELETE /users/:id/follow)
const unfollowUser = async (req, res) => {
    try {
        const followerId = req.user._id;
        const followeeId = req.params.id;

        const follow = await Follow.findOneAndDelete({ followerId, followeeId });
        if (!follow) {
            return res.status(400).json({ success: false, code: "NOT_FOLLOWING", message: "You are not following this user" });
        }

        res.status(200).json({
            success: true,
            message: "Unfollowed successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 8. Get All Accepted Connections with Presence & Message Counts (GET /connections)
const getAcceptedConnections = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch accepted connections
        const connections = await Connection.find({
            status: "accepted",
            $or: [{ senderId: userId }, { receiverId: userId }]
        });

        const connectionList = [];

        for (const conn of connections) {
            const peerId = conn.senderId.toString() === userId.toString() ? conn.receiverId : conn.senderId;
            const peer = await User.findById(peerId).select("name username bio profileImageUrl headline lastSeen isPremium");

            if (!peer) continue;

            // Fetch unread messages count in the conversation between peer and user
            const conversation = await Conversation.findOne({
                participants: { $all: [userId, peerId] }
            });

            let unreadCount = 0;
            if (conversation) {
                unreadCount = await Message.countDocuments({
                    conversationId: conversation._id,
                    senderId: peerId,
                    isRead: false
                });
            }

            connectionList.push({
                connectionId: conn._id,
                peer,
                lastSeen: peer.lastSeen,
                unreadCount
            });
        }

        res.status(200).json({
            success: true,
            connections: connectionList
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 9. Get Incoming Pending Connection Requests (GET /connections/pending)
const getPendingRequests = async (req, res) => {
    try {
        const userId = req.user._id;

        // Connections where the user is the receiver and the status is pending
        const pending = await Connection.find({
            receiverId: userId,
            status: "pending"
        }).populate("senderId", "name username bio profileImageUrl headline");

        res.status(200).json({
            success: true,
            requests: pending
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    sendConnectionRequest,
    acceptConnection,
    rejectConnection,
    deleteConnection,
    blockUser,
    followUser,
    unfollowUser,
    getAcceptedConnections,
    getPendingRequests
};
