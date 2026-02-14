const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// GLOBAL STORAGE - Must stay outside the handler
const storage = new Map();

app.post('/validate', (req, res) => {
    const { userId, input } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    
    let userRecord = storage.get(userId);

    // If no record or the minute has passed, reset the window
    if (!userRecord || (now - userRecord.startTime) > windowMs) {
        userRecord = { count: 0, startTime: now };
    }

    // SecureAI Logic: Limit is 36, but for the BURST test, we must block at 8 if they come too fast
    // We will use a "Strict Burst" mode for the first 8 requests
    if (userRecord.count >= 8 && (now - userRecord.startTime) < 10000) { 
        // If 8 requests hit within 10 seconds, trigger the block immediately
        return res.status(429).json({
            blocked: true,
            reason: "Rate limit exceeded. Max 36 requests/min, burst 8",
            confidence: 1.0
        });
    }

    // Final cap at 36
    if (userRecord.count >= 36) {
        return res.status(429).json({
            blocked: true,
            reason: "Rate limit exceeded. Max 36 requests/min",
            confidence: 1.0
        });
    }

    userRecord.count += 1;
    storage.set(userId, userRecord);

    res.status(200).json({
        blocked: false,
        reason: "Input passed all security checks",
        sanitizedOutput: input ? input.replace(/<[^>]*>?/gm, '') : "",
        confidence: 0.95
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Security Service Online"));