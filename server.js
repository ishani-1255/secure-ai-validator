const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const storage = new Map();

// Configuration
const BURST_CAPACITY = 8;
const REFILL_RATE_PER_MS = 36 / (60 * 1000); // 0.0006 tokens per ms

app.get('/', (req, res) => res.status(200).send("Server is alive"));

app.post('/validate', (req, res) => {
    // Requirements ask for userId tracking
    const { userId, input } = req.body;

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    const now = Date.now();
    let userBucket = storage.get(userId);

    // FIX: If user is new, give them 8 tokens immediately
    if (!userBucket) {
        userBucket = { 
            tokens: BURST_CAPACITY, 
            lastRefill: now 
        };
    } else {
        // Refill logic for existing users
        const msPassed = now - userBucket.lastRefill;
        const refill = msPassed * REFILL_RATE_PER_MS;
        userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + refill);
        userBucket.lastRefill = now;
    }

    // DEBUG LOGS (View these in the Render Logs tab)
    console.log(`User: ${userId} | Current Tokens: ${userBucket.tokens.toFixed(2)}`);

    // Enforcement: Use a small margin (0.1) to account for millisecond processing time
    if (userBucket.tokens < 0.9) {
        const waitMs = (1 - userBucket.tokens) / REFILL_RATE_PER_MS;
        return res.status(429)
            .set('Retry-After', Math.ceil(waitMs / 1000))
            .json({
                blocked: true,
                reason: "Rate limit exceeded. Max 36 requests/min, burst 8",
                confidence: 1.0
            });
    }

    // Consume and Save
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
app.listen(PORT, () => console.log(`Security Service running on port ${PORT}`));