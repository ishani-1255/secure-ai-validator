const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

// In-memory store for rate limiting (User/IP -> Bucket)
const storage = new Map();

// Configuration
const LIMIT_PER_MIN = 36;
const BURST_CAPACITY = 8;
const FILL_RATE_PER_MS = LIMIT_PER_MIN / 60 / 1000; // Tokens per millisecond

app.post('/validate', (req, res) => {
    const { userId, input, category } = req.body;

    // 1. Basic Validation
    if (!userId || !input) {
        return res.status(400).json({ error: "Missing userId or input" });
    }

    const now = Date.now();
    let userBucket = storage.get(userId) || { tokens: BURST_CAPACITY, lastRefill: now };

    // 2. Refill Logic
    const msPassed = now - userBucket.lastRefill;
    userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + (msPassed * FILL_RATE_PER_MS));
    userBucket.lastRefill = now;

    // 3. Security Check (Rate Limiting)
    if (userBucket.tokens < 1) {
        // Calculate wait time for the next token
        const waitMs = (1 - userBucket.tokens) / FILL_RATE_PER_MS;
        const retryAfterSeconds = Math.ceil(waitMs / 1000);

        console.log(`[LOG] Security Event: Rate limit blocked for ${userId}`);

        return res.status(429)
            .set('Retry-After', retryAfterSeconds)
            .json({
                blocked: true,
                reason: `Rate limit exceeded. Max ${LIMIT_PER_MIN} req/min.`,
                confidence: 1.0
            });
    }

    // 4. Consume Token & Sanitize
    userBucket.tokens -= 1;
    storage.set(userId, userBucket);

    // Basic XSS Sanitization for the 'sanitizedOutput' requirement
    const sanitized = input.replace(/<[^>]*>?/gm, ''); 

    return res.status(200).json({
        blocked: false,
        reason: "Input passed all security checks",
        sanitizedOutput: sanitized,
        confidence: 0.95
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Security Service running on port ${PORT}`));