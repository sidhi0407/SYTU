const express = require("express");
const { auth } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    uploadScreenshots,
    toggleFeatureProject
} = require("../controllers/projectController");

const router = express.Router();

router.get("/", getProjects);
router.post("/", auth, createProject);
router.get("/:id", getProjectById);
router.patch("/:id", auth, updateProject);
router.delete("/:id", auth, deleteProject);
router.post("/:id/screenshots", auth, upload.array("screenshots", 5), uploadScreenshots);
router.patch("/:id/feature", auth, toggleFeatureProject);

module.exports = router;
