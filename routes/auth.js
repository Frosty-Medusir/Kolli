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
                id: req.user._id,
                email: req.user.email,
                username: req.user.username
            },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '24h' }
        );

        const cookieOptions = {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000
        };

        res.cookie('kolli_auth', token, cookieOptions);

        let clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        
        // Ensure URL is absolute (starts with http/https)
        if (!clientUrl.startsWith('http://') && !clientUrl.startsWith('https://')) {
            clientUrl = `https://${clientUrl}`;
        }
        
        // Remove trailing slash to prevent double slashes
        clientUrl = clientUrl.replace(/\/$/, '');
        
        res.redirect(`${clientUrl}/dashboard.html`);
    }
);

/**
 * Logout
 */
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.clearCookie('kolli_auth', {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'none'
        });
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
