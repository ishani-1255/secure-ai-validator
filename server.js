const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// GLOBAL STORAGE - Must be outside the app.post
const storage = new Map();

// SECUREAI CONFIG
const BURST_CAPACITY = 8;
const REFILL_RATE_PER_SEC = 36 / 60; // 0.6 tokens per second

app.post('/validate', (req, res) => {
    const { userId, input } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    let userBucket = storage.get(userId);

    if (!userBucket) {
        // Initialize new user with 8 tokens
        userBucket = { tokens: BURST_CAPACITY, lastRefill: now };
    } else {
        // Refill logic: (current time - last time) * (tokens per millisecond)
        const msPassed = now - userBucket.lastRefill;
        const refillAmount = msPassed * (REFILL_RATE_PER_SEC / 1000);
        
        userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + refillAmount);
        userBucket.lastRefill = now;
    }

    // LOGGING: Check your Render console to see this!
    console.log(`User: ${userId} | Tokens: ${userBucket.tokens.toFixed(2)}`);

    // RATE LIMIT CHECK
    if (userBucket.tokens < 1) {
        return res.status(429).json({
            blocked: true,
            reason: "Rate limit exceeded. Max 36 requests/min, burst 8",
            confidence: 1.0
        });
    }

    // CONSUME TOKEN
    userBucket.tokens -= 1;
    storage.set(userId, userBucket);

    // OUTPUT SANITIZATION
    const sanitized = input ? input.replace(/<[^>]*>?/gm, '') : "";

    return res.status(200).json({
        blocked: false,
        reason: "Input passed all security checks",
        sanitizedOutput: sanitized,
        confidence: 0.95
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SecureAI Validator Online on Port ${PORT}`));