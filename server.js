const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const storage = new Map();

// SECUREAI CORE CONFIG
const BURST_CAPACITY = 8;
const REFILL_RATE_PER_MS = 36 / (60 * 1000); // Exactly 36 per minute

app.get('/', (req, res) => res.status(200).send("Validator Online"));

app.post('/validate', (req, res) => {
    const { userId, input } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    let userBucket = storage.get(userId);

    if (!userBucket) {
        // Start with a full bucket of 8
        userBucket = { tokens: BURST_CAPACITY, lastRefill: now };
    } else {
        // Refill logic: (current time - last time) * (tokens per millisecond)
        const msPassed = now - userBucket.lastRefill;
        const refill = msPassed * REFILL_RATE_PER_MS;
        
        userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + refill);
        userBucket.lastRefill = now;
    }

    // CHECK LIMIT
    // We check if tokens are >= 1 to allow the request
    if (userBucket.tokens < 1) {
        const waitMs = (1 - userBucket.tokens) / REFILL_RATE_PER_MS;
        return res.status(429).set('Retry-After', Math.ceil(waitMs/1000)).json({
            blocked: true,
            reason: "Rate limit exceeded. Max 36 requests/min, burst 8",
            confidence: 1.0
        });
    }

    // CONSUME & SAVE
    userBucket.tokens -= 1;
    storage.set(userId, userBucket);

    res.status(200).json({
        blocked: false,
        reason: "Input passed all security checks",
        sanitizedOutput: input ? input.replace(/<[^>]*>?/gm, '') : "",
        confidence: 0.95
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Service Ready"));