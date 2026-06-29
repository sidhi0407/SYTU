const { Queue } = require("bullmq");
const { isRedisConnected } = require("./redis");

const activeQueues = {};
const registeredWorkers = {};

// Default mock handlers for logging
const defaultHandlers = {
    "email-queue": async (job) => {
        console.log(`[Mock Email Queue] Sending email for job: ${job.name}`, job.data);
    },
    "pdf-queue": async (job) => {
        console.log(`[Mock PDF Queue] Generating PDF for job: ${job.name}`, job.data);
    },
    "github-sync-queue": async (job) => {
        console.log(`[Mock GitHub Sync Queue] Syncing repos for job: ${job.name}`, job.data);
    },
    "discovery-queue": async (job) => {
        console.log(`[Mock Discovery Queue] Precomputing feed for job: ${job.name}`, job.data);
    },
    "analytics-queue": async (job) => {
        console.log(`[Mock Analytics Queue] Recording views for job: ${job.name}`, job.data);
    },
    "moderation-queue": async (job) => {
        console.log(`[Mock Moderation Queue] Processing report for job: ${job.name}`, job.data);
    },
    "cleanup-queue": async (job) => {
        console.log(`[Mock Cleanup Queue] Subscription cleanup for job: ${job.name}`, job.data);
    }
};

const registerJobHandler = (queueName, handlerFn) => {
    registeredWorkers[queueName] = handlerFn;
};

const addJob = async (queueName, jobName, data) => {
    const redisAvailable = isRedisConnected();
    
    if (!redisAvailable) {
        console.log(`[Queue Fallback] Enqueuing job '${jobName}' on '${queueName}' (In-Memory)...`);
        
        // Execute asynchronously to simulate a background job queue
        setTimeout(async () => {
            try {
                const handler = registeredWorkers[queueName] || defaultHandlers[queueName];
                if (handler) {
                    await handler({ name: jobName, data });
                } else {
                    console.log(`[Queue Fallback Warning] No handler found for queue: ${queueName}`);
                }
            } catch (err) {
                console.error(`[Queue Fallback Error] Executing job '${jobName}' failed:`, err.message);
            }
        }, 500);
        
        return { id: `mock-job-${Date.now()}` };
    }

    try {
        if (!activeQueues[queueName]) {
            activeQueues[queueName] = new Queue(queueName, {
                connection: {
                    host: "127.0.0.1",
                    port: 6379
                }
            });
        }
        const job = await activeQueues[queueName].add(jobName, data, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000
            }
        });
        return job;
    } catch (err) {
        console.warn(`[BullMQ Warning] Failed to add job to queue '${queueName}'. Running inline fallback.`);
        const handler = registeredWorkers[queueName] || defaultHandlers[queueName];
        if (handler) {
            await handler({ name: jobName, data });
        }
        return { id: `mock-job-fallback-${Date.now()}` };
    }
};

module.exports = {
    addJob,
    registerJobHandler
};
