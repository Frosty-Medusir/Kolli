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
router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', { failureRedirect: '/' }, (err, user, info) => {
        if (err) {
            console.error('Google OAuth callback error:', err);
            return res.redirect('/?auth_error=1');
        }

        if (!user) {
            console.error('Google OAuth callback: no user returned', info);
            return res.redirect('/?auth_error=1');
        }

        req.logIn(user, (loginErr) => {
            if (loginErr) {
                console.error('Failed to log in user after Google auth:', loginErr);
                return res.redirect('/?auth_error=1');
            }

            // Generate JWT token
            const token = jwt.sign(
                {
                    id: user._id,
                    email: user.email,
                    username: user.username
                },
                process.env.JWT_SECRET || 'dev-secret',
                { expiresIn: '24h' }
            );

            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 24 * 60 * 60 * 1000
            };

            res.cookie('kolli_auth', token, cookieOptions);

            let clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
            if (!clientUrl.startsWith('http://') && !clientUrl.startsWith('https://')) {
                clientUrl = `https://${clientUrl}`;
            }
            clientUrl = clientUrl.replace(/\/$/, '');
            return res.redirect(`${clientUrl}/dashboard.html`);
        });
    })(req, res, next);
});

/**
 * Logout
 */
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.clearCookie('kolli_auth', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
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
