const Project = require("../models/Project");

// Helper to normalize category input to schema enum values
const normalizeCategory = (category) => {
    if (!category) return "Other";
    const lowerCat = category.toLowerCase().trim();
    if (lowerCat.includes("web")) return "Web";
    if (lowerCat.includes("mobile") || lowerCat.includes("app")) return "Mobile";
    if (lowerCat.includes("ml") || lowerCat.includes("ai") || lowerCat.includes("machine") || lowerCat.includes("deep")) return "ML";
    if (lowerCat.includes("design") || lowerCat.includes("ui") || lowerCat.includes("ux")) return "Design";
    return "Other";
};

// 1. Get Projects list (GET /projects)
const getProjects = async (req, res) => {
    try {
        const { category, tech, userId } = req.query;
        const queryObj = {};

        if (category) queryObj.category = category;
        if (tech) queryObj.techStack = { $in: tech.split(",").map(t => t.trim()) };
        if (userId) queryObj.userId = userId;

        const projects = await Project.find(queryObj)
            .populate("userId", "name username profileImageUrl")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            projects
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Get Single Project Details (GET /projects/:id)
const getProjectById = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate("userId", "name username bio profileImageUrl headline");

        if (!project) {
            return res.status(404).json({ success: false, code: "PROJECT_NOT_FOUND", message: "Project not found" });
        }

        res.status(200).json({
            success: true,
            project
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Create Project (POST /projects)
const createProject = async (req, res) => {
    try {
        const { title, description, category, techStack, githubUrl, demoUrl, teamSize, status } = req.body || {};
        const userId = req.user._id;

        if (!title) {
            return res.status(400).json({ success: false, code: "VALIDATION_ERROR", message: "Project title is required" });
        }

        const project = new Project({
            userId,
            title,
            description: description || "",
            category: normalizeCategory(category),
            techStack: techStack || [],
            githubUrl: githubUrl || "",
            demoUrl: demoUrl || "",
            teamSize: teamSize || 1,
            status: status || "in_progress",
            isFeatured: false
        });

        await project.save();

        res.status(201).json({
            success: true,
            message: "Project created successfully",
            project
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Update Project (PATCH /projects/:id)
const updateProject = async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const { title, description, category, techStack, githubUrl, demoUrl, teamSize, status } = req.body || {};

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, code: "PROJECT_NOT_FOUND", message: "Project not found" });
        }

        // Ownership check
        if (project.userId.toString() !== userId) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You are not authorized to edit this project" });
        }

        if (title !== undefined) project.title = title;
        if (description !== undefined) project.description = description;
        if (category !== undefined) project.category = normalizeCategory(category);
        if (techStack !== undefined) project.techStack = techStack;
        if (githubUrl !== undefined) project.githubUrl = githubUrl;
        if (demoUrl !== undefined) project.demoUrl = demoUrl;
        if (teamSize !== undefined) project.teamSize = teamSize;
        if (status !== undefined) project.status = status;

        await project.save();

        res.status(200).json({
            success: true,
            message: "Project updated successfully",
            project
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Delete Project (DELETE /projects/:id)
const deleteProject = async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, code: "PROJECT_NOT_FOUND", message: "Project not found" });
        }

        // Ownership check
        if (project.userId.toString() !== userId) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "You are not authorized to delete this project" });
        }

        await Project.findByIdAndDelete(projectId);

        res.status(200).json({
            success: true,
            message: "Project deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 6. Upload Project Screenshots (POST /projects/:id/screenshots)
const uploadScreenshots = async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, code: "PROJECT_NOT_FOUND", message: "Project not found" });
        }

        // Ownership check
        if (project.userId.toString() !== userId) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "Forbidden" });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: "No screenshots were uploaded" });
        }

        const urls = req.files.map(file => `/uploads/${file.filename}`);
        
        // Append to existing screenshots (limit to max 5 as per SRS)
        project.screenshotUrls = [...project.screenshotUrls, ...urls].slice(0, 5);
        await project.save();

        res.status(200).json({
            success: true,
            message: "Screenshots uploaded successfully",
            screenshotUrls: project.screenshotUrls
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 7. Toggle Feature Project (PATCH /projects/:id/feature)
const toggleFeatureProject = async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, code: "PROJECT_NOT_FOUND", message: "Project not found" });
        }

        if (project.userId.toString() !== userId) {
            return res.status(403).json({ success: false, code: "UNAUTHORIZED", message: "Forbidden" });
        }

        project.isFeatured = !project.isFeatured;
        await project.save();

        res.status(200).json({
            success: true,
            message: `Project ${project.isFeatured ? "pinned to" : "unpinned from"} portfolio homepage.`,
            project
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    uploadScreenshots,
    toggleFeatureProject
};
