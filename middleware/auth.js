import jwt from 'jsonwebtoken';

/**
 * Verify and extract JWT token from Authorization header or cookies
 */
export function authenticateToken(req, res, next) {
    // Check Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token && !req.isAuthenticated()) {
        // If no token and not authenticated via session, allow public access
        if (req.path.startsWith('/auth')) {
            return next();
        }
        return res.status(401).json({ error: 'Access token required' });
    }

    if (token) {
        jwt.verify(token, process.env.JWT_SECRET || 'dev-secret', (err, user) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid token' });
            }
            req.user = user;
            next();
        });
    } else {
        // Session-based authentication already verified by Passport
        next();
    }
}

/**
 * Check if user has required role
 */
export function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

/**
 * Rate limiting middleware
 */
// Lightweight in-memory rate limiter (per-IP sliding window)
const RATE_LIMIT_POINTS = 100; // max requests
const RATE_LIMIT_WINDOW = 60 * 1000; // window in ms
const ipCounters = new Map();

export function rateLimit(req, res, next) {
    try {
        const now = Date.now();
        const ip = req.ip || req.connection.remoteAddress || 'local';
        const entry = ipCounters.get(ip) || { count: 0, windowStart: now };

        if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
            // reset window
            entry.count = 1;
            entry.windowStart = now;
        } else {
            entry.count += 1;
        }

        ipCounters.set(ip, entry);

        if (entry.count > RATE_LIMIT_POINTS) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        next();
    } catch (err) {
        // If anything goes wrong, allow the request (fail-open)
        next();
    }
}
