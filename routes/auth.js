import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

/**
 * Google OAuth login
 */
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

/**
 * Google OAuth callback
 */
router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Generate JWT token
        const token = jwt.sign(
            {
                id: req.user.id,
                email: req.user.email,
                username: req.user.username
            },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '24h' }
        );

        // Redirect to dashboard with token
        res.redirect(`/dashboard?token=${token}`);
    }
);

/**
 * Logout
 */
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.json({ message: 'Logged out successfully' });
    });
});

/**
 * Get current user
 */
router.get('/me', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.user);
});

export default router;
