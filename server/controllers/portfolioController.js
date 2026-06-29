const Portfolio = require("../models/Portfolio");
const User = require("../models/User");
const { redisClient } = require("../config/redis");
const { addJob } = require("../config/queues");

// 1. Get Public Portfolio (GET /portfolio/:username) - Cached 5 mins
const getPublicPortfolio = async (req, res) => {
    try {
        const { username } = req.params;
        const cacheKey = `portfolio:${username.toLowerCase()}`;

        const cachedPortfolio = await redisClient.get(cacheKey);
        if (cachedPortfolio) {
            console.log(`[Cache HIT] Serving public portfolio for: ${username}`);
            return res.status(200).json(JSON.parse(cachedPortfolio));
        }

        const user = await User.findOne({ username: username.toLowerCase(), isSuspended: false });
        if (!user) {
            return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        const portfolio = await Portfolio.findOne({ userId: user._id, isPublished: true });
        if (!portfolio) {
            return res.status(404).json({ success: false, code: "PORTFOLIO_NOT_PUBLISHED", message: "Portfolio is not published" });
        }

        const responseData = {
            success: true,
            user: {
                name: user.name,
                username: user.username,
                headline: user.headline,
                bio: user.bio,
                profileImageUrl: user.profileImageUrl,
                skills: user.skills,
                interests: user.interests,
                university: user.university,
                branch: user.branch,
                semester: user.semester
            },
            portfolio
        };

        // Cache for 5 mins (300s)
        await redisClient.set(cacheKey, JSON.stringify(responseData), "EX", 300);

        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 2. Get User's Own Portfolio (GET /portfolio/me)
const getMyPortfolio = async (req, res) => {
    try {
        const userId = req.user._id;

        let portfolio = await Portfolio.findOne({ userId });
        if (!portfolio) {
            // Auto-create a default empty portfolio draft
            portfolio = new Portfolio({
                userId,
                about: "",
                headline: req.user.headline || "",
                experience: [],
                education: [],
                achievements: [],
                certifications: [],
                theme: "default",
                isPublished: false
            });
            await portfolio.save();
        }

        res.status(200).json({
            success: true,
            portfolio
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 3. Update User's Portfolio (PATCH /portfolio/me)
const updateMyPortfolio = async (req, res) => {
    try {
        const userId = req.user._id;
        const { about, headline, experience, education, achievements, certifications, theme } = req.body;

        let portfolio = await Portfolio.findOne({ userId });
        if (!portfolio) {
            portfolio = new Portfolio({ userId });
        }

        let normalizedEducation = education;
        if (education && Array.isArray(education)) {
            normalizedEducation = education.map(edu => ({
                institution: edu.institution || edu.college,
                degree: edu.degree,
                from: edu.from,
                to: edu.to
            }));
        }

        if (about !== undefined) portfolio.about = about;
        if (headline !== undefined) portfolio.headline = headline;
        if (experience !== undefined) portfolio.experience = experience;
        if (normalizedEducation !== undefined) portfolio.education = normalizedEducation;
        if (achievements !== undefined) portfolio.achievements = achievements;
        if (certifications !== undefined) portfolio.certifications = certifications;
        if (theme !== undefined) portfolio.theme = theme;

        await portfolio.save();

        // Invalidate cache
        await redisClient.del(`portfolio:${req.user.username}`);

        res.status(200).json({
            success: true,
            message: "Portfolio updated successfully",
            portfolio
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 4. Publish Portfolio (POST /portfolio/me/publish)
const publishPortfolio = async (req, res) => {
    try {
        const userId = req.user._id;

        const portfolio = await Portfolio.findOne({ userId });
        if (!portfolio) {
            return res.status(404).json({ success: false, message: "Portfolio draft not found. Update your portfolio first." });
        }

        portfolio.isPublished = true;
        await portfolio.save();

        // Invalidate cache
        await redisClient.del(`portfolio:${req.user.username}`);

        res.status(200).json({
            success: true,
            message: "Portfolio published successfully. It is now live!",
            portfolio
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 5. Unpublish Portfolio (POST /portfolio/me/unpublish)
const unpublishPortfolio = async (req, res) => {
    try {
        const userId = req.user._id;

        const portfolio = await Portfolio.findOne({ userId });
        if (!portfolio) {
            return res.status(404).json({ success: false, message: "Portfolio not found" });
        }

        portfolio.isPublished = false;
        await portfolio.save();

        // Invalidate cache
        await redisClient.del(`portfolio:${req.user.username}`);

        res.status(200).json({
            success: true,
            message: "Portfolio unpublished. It is now hidden from the public.",
            portfolio
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 6. Trigger Portfolio PDF Generation (GET /portfolio/me/pdf)
const generatePdfJob = async (req, res) => {
    try {
        const userId = req.user._id;
        const jobId = `pdf_job_${userId}_${Date.now()}`;

        // Store status in Redis
        const jobStatus = {
            status: "completed", // Complete immediately for quick mock download
            downloadUrl: `/api/portfolio/me/pdf/download/${jobId}`
        };
        await redisClient.set(`pdfjob:${jobId}`, JSON.stringify(jobStatus), "EX", 1800); // 30 mins

        // Enqueue background worker job in BullMQ/fallback
        await addJob("pdf-queue", "generate_portfolio_pdf", { userId, jobId });

        res.status(200).json({
            success: true,
            jobId
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 7. Poll PDF Job Status (GET /portfolio/me/pdf/:jobId)
const getPdfJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const statusData = await redisClient.get(`pdfjob:${jobId}`);

        if (!statusData) {
            return res.status(404).json({ success: false, message: "PDF generation job not found or expired" });
        }

        res.status(200).json(JSON.parse(statusData));
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 8. Download Generated PDF (GET /portfolio/me/pdf/download/:jobId)
const downloadPdf = async (req, res) => {
    try {
        // Send a mockup text resume representation as a PDF response
        const userId = req.user._id;
        const portfolio = await Portfolio.findOne({ userId });
        
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=resume_${req.user.username}.pdf`);

        // Send a minimal PDF stream / mockup binary file bytes
        res.send(Buffer.from("%PDF-1.4 ... (Generated Resume PDF Mockup Data) ..."));
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

// 9. Get Portfolio Analytics (GET /portfolio/me/analytics - Premium)
const getPortfolioAnalytics = async (req, res) => {
    try {
        // Mock premium analytics logs
        res.status(200).json({
            success: true,
            views: {
                total: 245,
                byDay: [
                    { date: "Mon", count: 12 },
                    { date: "Tue", count: 19 },
                    { date: "Wed", count: 32 },
                    { date: "Thu", count: 45 },
                    { date: "Fri", count: 28 },
                    { date: "Sat", count: 55 },
                    { date: "Sun", count: 54 }
                ],
                topReferrers: [
                    { source: "LinkedIn", count: 120 },
                    { source: "GitHub", count: 85 },
                    { source: "Direct/Search", count: 40 }
                ],
                geography: [
                    { country: "India", count: 180 },
                    { country: "United States", count: 45 },
                    { country: "Others", count: 20 }
                ]
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, code: "SERVER_ERROR", message: error.message });
    }
};

module.exports = {
    getPublicPortfolio,
    getMyPortfolio,
    updateMyPortfolio,
    publishPortfolio,
    unpublishPortfolio,
    generatePdfJob,
    getPdfJobStatus,
    downloadPdf,
    getPortfolioAnalytics
};
