const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 1. MUST BE OUTSIDE THE POST HANDLER
const storage = new Map();

// Configuration
const LIMIT_PER_MIN = 36;
const BURST_CAPACITY = 8;
const FILL_RATE_PER_MS = LIMIT_PER_MIN / (60 * 1000); 

app.post('/validate', (req, res) => {
    const { userId, input } = req.body;

    // Basic Validation
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    
    // 2. Retrieve or Initialize User Bucket
    let userBucket = storage.get(userId) || { 
        tokens: BURST_CAPACITY, 
        lastRefill: now 
    };

    // 3. Precise Refill Logic
    const msPassed = now - userBucket.lastRefill;
    const tokensToAdd = msPassed * FILL_RATE_PER_MS;
    
    userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + tokensToAdd);
    userBucket.lastRefill = now;

    // 4. Rate Limit Check
    if (userBucket.tokens < 1) {
        const waitMs = (1 - userBucket.tokens) / FILL_RATE_PER_MS;
        const retryAfter = Math.ceil(waitMs / 1000);

        return res.status(429)
            .set('Retry-After', retryAfter)
            .json({
                blocked: true,
                reason: `Rate limit exceeded. Max ${LIMIT_PER_MIN} req/min.`,
                confidence: 1.0
            });
    }

    // 5. Consume 1 Token and Save
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
app.listen(PORT, () => console.log(`SecureAI Validator running on port ${PORT}`));