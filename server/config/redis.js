const Redis = require("ioredis");

let client;
let useFallback = false;

const store = new Map();
const ttls = new Map();

function checkExpiry(key) {
    if (ttls.has(key)) {
        const expiry = ttls.get(key);
        if (Date.now() > expiry) {
            store.delete(key);
            ttls.delete(key);
        }
    }
}

const fallbackClient = {
    async get(key) {
        checkExpiry(key);
        return store.get(key) || null;
    },
    async set(key, value, mode, duration) {
        store.set(key, value);
        if (mode === "EX" && duration) {
            ttls.set(key, Date.now() + parseInt(duration) * 1000);
        } else {
            ttls.delete(key);
        }
        return "OK";
    },
    async del(key) {
        const deleted = store.delete(key);
        ttls.delete(key);
        return deleted ? 1 : 0;
    },
    async exists(key) {
        checkExpiry(key);
        return store.has(key) ? 1 : 0;
    }
};

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

try {
    console.log("Initializing Redis connection to:", redisUrl);
    client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => {
            // Do not retry, trigger error immediately to fallback
            return null;
        }
    });

    client.on("connect", () => {
        console.log("Redis connection established successfully.");
    });

    client.on("error", (err) => {
        if (!useFallback) {
            console.warn("Redis connection failed. Switching caching interface to IN-MEMORY fallback.");
            useFallback = true;
        }
    });
} catch (error) {
    console.warn("Unable to initialize Redis client. Using IN-MEMORY fallback.");
    useFallback = true;
}

// Delegator wrapper
const redisClient = {
    async get(key) {
        if (useFallback) return fallbackClient.get(key);
        try {
            return await client.get(key);
        } catch (err) {
            useFallback = true;
            return fallbackClient.get(key);
        }
    },
    async set(key, value, mode, duration) {
        if (useFallback) return fallbackClient.set(key, value, mode, duration);
        try {
            if (mode && duration) {
                return await client.set(key, value, mode, duration);
            }
            return await client.set(key, value);
        } catch (err) {
            useFallback = true;
            return fallbackClient.set(key, value, mode, duration);
        }
    },
    async del(key) {
        if (useFallback) return fallbackClient.del(key);
        try {
            return await client.del(key);
        } catch (err) {
            useFallback = true;
            return fallbackClient.del(key);
        }
    },
    async exists(key) {
        if (useFallback) return fallbackClient.exists(key);
        try {
            return await client.exists(key);
        } catch (err) {
            useFallback = true;
            return fallbackClient.exists(key);
        }
    }
};

module.exports = {
    redisClient,
    isRedisConnected: () => !useFallback
};
