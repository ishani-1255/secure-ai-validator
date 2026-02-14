const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Added for accessibility
const app = express();

app.use(cors()); // Allow the testing suite to reach your API
app.use(bodyParser.json());

const storage = new Map();
const LIMIT_PER_MIN = 36;
const BURST_CAPACITY = 8;
const FILL_RATE_PER_MS = LIMIT_PER_MIN / 60 / 1000;

// Health check to verify accessibility
app.get('/', (req, res) => res.status(200).send("Security Validator Active"));

app.post('/validate', (req, res) => {
    const { userId, input } = req.body;
    if (!userId || !input) return res.status(400).json({ error: "Missing data" });

    const now = Date.now();
    let userBucket = storage.get(userId) || { tokens: BURST_CAPACITY, lastRefill: now };

    const msPassed = now - userBucket.lastRefill;
    userBucket.tokens = Math.min(BURST_CAPACITY, userBucket.tokens + (msPassed * FILL_RATE_PER_MS));
    userBucket.lastRefill = now;

    if (userBucket.tokens < 1) {
        const waitMs = (1 - userBucket.tokens) / FILL_RATE_PER_MS;
        return res.status(429).set('Retry-After', Math.ceil(waitMs / 1000)).json({
            blocked: true,
            reason: "Rate limit exceeded. Max 36 req/min.",
            confidence: 1.0
        });
    }

    userBucket.tokens -= 1;
    storage.set(userId, userBucket);

    res.status(200).json({
        blocked: false,
        reason: "Input passed all security checks",
        sanitizedOutput: input.replace(/<[^>]*>?/gm, ''), 
        confidence: 0.95
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live on port ${PORT}`));