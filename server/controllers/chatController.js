const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

// 1. Get All Conversations (GET /conversations)
const getConversations = async (req, res) => {
    try {
        const userId = req.user._id;

        const conversations = await Conversation.find({
            participants: userId
        }).sort({ "lastMessage.sentAt": -1 });

        const results = [];
        for (const convo of conversations) {
            // Find other participant details
            const peerId = convo.participants.find(p => p.toString() !== userId.toString());
            const peer = await User.findById(peerId).select("name username bio profileImageUrl headline lastSeen");

            if (!peer) continue;

            // Count unread messages sent by peer
            const unreadCount = await Message.countDocuments({
                conversationId: convo._id,
                senderId: peerId,
                isRead: false
            });

            results.push({
                id: convo._id,
                peer,
                lastMessage: convo.lastMessage,
                unreadCount
            });
        }

        res.status(200).json({
            success: true,
            conversations: results
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Get Messages with Cursor Pagination (GET /conversations/:id/messages)
const getMessages = async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.user._id;
        const { before, limit = 50 } = req.query;

        // Check if conversation exists and user is a participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" });
        }

        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You cannot access this conversation" });
        }

        const queryObj = { conversationId };
        
        // Cursor-based pagination using before (messageId)
        if (before) {
            queryObj._id = { $lt: before };
        }

        const messages = await Message.find(queryObj)
            .sort({ createdAt: -1 }) // get newest first
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            messages: messages.reverse() // send in chronological order to frontend
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Mark Conversation as Read (PATCH /conversations/:id/read)
const markAsRead = async (req, res) => {
    try {
        const conversationId = req.params.id;
        const userId = req.user._id;

        // Mark all messages sent by peer as read
        await Message.updateMany(
            { conversationId, senderId: { $ne: userId }, isRead: false },
            { $set: { isRead: true } }
        );

        // Fetch other participant to notify
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
            const peerId = conversation.participants.find(p => p.toString() !== userId.toString());
            
            // Emit chat:read_ack socket event to peer
            if (global.io && peerId) {
                global.io.to(peerId.toString()).emit("chat:read_ack", { conversationId, readerId: userId });
            }
        }

        res.status(200).json({
            success: true,
            message: "Messages marked as read"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Send Message with File Attachment (POST /conversations/:id/files)
const uploadMessageFile = async (req, res) => {
    try {
        const conversationId = req.params.id;
        const senderId = req.user._id;

        if (!req.file) {
            return res.status(400).json({ success: false, code: "FILE_REQUIRED", message: "No file was uploaded" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" });
        }

        if (!conversation.participants.includes(senderId)) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "Forbidden" });
        }

        // Determine file type
        let fileType = "file";
        if (req.file.mimetype.startsWith("image/")) {
            fileType = "image";
        } else if (req.file.mimetype === "application/pdf") {
            fileType = "pdf";
        }

        // Store relative url path
        const fileUrl = `/uploads/${req.file.filename}`;

        // Create Message
        const message = new Message({
            conversationId,
            senderId,
            content: null,
            fileUrl,
            fileType,
            isRead: false
        });

        await message.save();

        // Update Conversation lastMessage
        conversation.lastMessage = {
            content: `Sent a ${fileType} attachment.`,
            senderId,
            sentAt: new Date()
        };
        await conversation.save();

        // Emit Socket.IO event to recipient room
        const recipientId = conversation.participants.find(p => p.toString() !== senderId.toString());
        if (global.io && recipientId) {
            global.io.to(recipientId.toString()).emit("chat:receive", message);
        }

        res.status(201).json({
            success: true,
            message
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getConversations,
    getMessages,
    markAsRead,
    uploadMessageFile
};
