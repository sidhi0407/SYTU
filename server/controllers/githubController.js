const GithubIntegration = require("../models/GithubIntegration");
const Project = require("../models/Project");

// 1. Initiate Github connection (GET /github/connect)
const connectGithub = async (req, res) => {
    try {
        // Return a redirect URL simulating GitHub OAuth login page
        // Redirects back to our mock callback endpoint
        const redirectUrl = `${req.protocol}://${req.get("host")}/api/auth/github/callback?code=mock_github_code_xyz`;
        res.status(200).json({
            success: true,
            redirectUrl
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Disconnect Github (POST /github/disconnect)
const disconnectGithub = async (req, res) => {
    try {
        const userId = req.user._id;

        const integration = await GithubIntegration.findOneAndDelete({ userId });
        
        // Remove github tags from User model
        req.user.githubId = undefined;
        req.user.githubUsername = "";
        await req.user.save();

        res.status(200).json({
            success: true,
            message: "GitHub account disconnected and credentials removed successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Get Cached GitHub Repositories (GET /github/repos)
const getGithubRepos = async (req, res) => {
    try {
        const userId = req.user._id;

        let integration = await GithubIntegration.findOne({ userId });
        
        // Mock connection if not connected yet for demo purposes
        if (!integration) {
            integration = new GithubIntegration({
                userId,
                accessTokenEnc: "mock_encrypted_token_9999",
                githubUserId: "github_mock_123",
                reposData: [
                    { id: "1", name: "sytu-collaboration-hub", description: "Modern MERN networking application for developers.", language: "JavaScript", stars: 15, url: "https://github.com/mock/sytu" },
                    { id: "2", name: "data-science-nlp", description: "Python machine learning project to run text classification.", language: "Python", stars: 45, url: "https://github.com/mock/nlp" },
                    { id: "3", name: "portfolio-nextjs", description: "Gorgeous tailwind powered portfolio design template.", language: "TypeScript", stars: 3, url: "https://github.com/mock/portfolio" }
                ],
                contributionData: {
                    totalCommits: 342,
                    activeWeeks: 42,
                    history: [12, 18, 5, 23, 14, 2, 0, 8, 19, 33, 10, 11]
                },
                languagesData: {
                    "JavaScript": 45,
                    "TypeScript": 30,
                    "Python": 15,
                    "HTML/CSS": 10
                },
                lastSyncedAt: new Date()
            });
            await integration.save();

            req.user.githubId = "github_mock_123";
            req.user.githubUsername = "github_dev_mock";
            await req.user.save();
        }

        res.status(200).json({
            success: true,
            repos: integration.reposData,
            lastSyncedAt: integration.lastSyncedAt
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Import Repos as Projects (POST /github/repos/import)
const importGithubRepos = async (req, res) => {
    try {
        const userId = req.user._id;
        const { repoIds } = req.body;

        if (!repoIds || !Array.isArray(repoIds)) {
            return res.status(400).json({ success: false, message: "List of repo IDs is required" });
        }

        const integration = await GithubIntegration.findOne({ userId });
        if (!integration) {
            return res.status(400).json({ success: false, message: "GitHub account not integrated. Connect first." });
        }

        const selectedRepos = integration.reposData.filter(repo => repoIds.includes(repo.id));
        const importedProjects = [];

        for (const repo of selectedRepos) {
            // Check if already imported
            const existingProj = await Project.findOne({ userId, title: repo.name });
            if (existingProj) continue;

            const newProj = new Project({
                userId,
                title: repo.name,
                description: repo.description || "Imported from GitHub.",
                category: repo.language === "JavaScript" || repo.language === "TypeScript" ? "Web" : "Other",
                techStack: [repo.language].filter(Boolean),
                githubUrl: repo.url || "",
                demoUrl: "",
                status: "completed",
                isFeatured: false
            });

            await newProj.save();
            importedProjects.push(newProj);
        }

        res.status(200).json({
            success: true,
            message: `Successfully imported ${importedProjects.length} repositories as showcase projects.`,
            projects: importedProjects
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Get GitHub Stats Cache (GET /github/stats)
const getGithubStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const integration = await GithubIntegration.findOne({ userId });

        if (!integration) {
            return res.status(200).json({
                success: true,
                stats: null,
                message: "GitHub not connected"
            });
        }

        res.status(200).json({
            success: true,
            contributionData: integration.contributionData,
            languagesData: integration.languagesData
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    connectGithub,
    disconnectGithub,
    getGithubRepos,
    importGithubRepos,
    getGithubStats
};
