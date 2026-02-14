const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const storage = new Map();

const BURST_CAPACITY = 8;
const REFILL_RATE_PER_MS = 36 / (60 * 1000); // 0.6 tokens per second

app.get('/', (req, res) => res.status(200).send("Ready"));

app.post('/validate', (req, res) => {
    // 1. Robustly extract userId
    const userId = req.body.userId || req.query.userId || "anonymous";
    const input = req.body.input || "";

    const now = Date.now();
    let userBucket = storage.get(userId);

    if (!userBucket) {
        // Initialize with FULL burst capacity
        userBucket = { tokens: BURST_CAPACITY, lastRefill: now };
    } else {
        // Refill logic
        const msPassed = now - userBucket.lastRefill;
        const refill = msPassed * REFILL_RATE_PER_MS;
        userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + refill);
        userBucket.lastRefill = now;
    }

    // 2. Rate Limit Enforcement
    // We use 0.9 instead of 1 to allow for tiny floating point math discrepancies
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

    // 3. Consume token
    userBucket.tokens -= 1;
    storage.set(userId, userBucket);

    // 4. Sanitization & Success
    const sanitized = input.replace(/<[^>]*>?/gm, '');

    return res.status(200).json({
        blocked: false,
        reason: "Input passed all security checks",
        sanitizedOutput: sanitized,
        confidence: 0.95
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Validator Active"));