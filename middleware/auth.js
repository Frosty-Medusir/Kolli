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
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
    points: 100, // 100 requests
    duration: 60 // per minute
});

export async function rateLimit(req, res, next) {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch (err) {
        res.status(429).json({ error: 'Too many requests' });
    }
}
