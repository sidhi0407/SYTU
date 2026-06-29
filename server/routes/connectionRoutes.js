const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const {
    sendConnectionRequest,
    acceptConnection,
    rejectConnection,
    deleteConnection,
    blockUser,
    followUser,
    unfollowUser,
    getAcceptedConnections,
    getPendingRequests
} = require("../controllers/connectionController");

const router = express.Router();

router.post("/request", auth, sendConnectionRequest);
router.post("/:id/accept", auth, acceptConnection);
router.post("/:id/reject", auth, rejectConnection);
router.delete("/:id", auth, deleteConnection);
router.get("/", auth, getAcceptedConnections);
router.get("/pending", auth, getPendingRequests);

// Block, follow and unfollow are mapped under /users/ routing namespaces as per REST specification
router.post("/block/:id", auth, blockUser); // POST /connections/block/:id
router.post("/follow/:id", auth, followUser); // POST /connections/follow/:id
router.delete("/follow/:id", auth, unfollowUser); // DELETE /connections/follow/:id

module.exports = router;
