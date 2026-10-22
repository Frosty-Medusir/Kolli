import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { User } from '../models/User.js';
import { rateLimit } from '../middleware/auth.js';
import { googleOAuthEnabled } from '../middleware/passport.js';

dotenv.config();

const router = express.Router();

function setAuthCookie(res, user) {
    const token = jwt.sign(
        { id: user._id, email: user.email, username: user.username, isGuest: user.isGuest },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '24h' }
    );
    res.cookie('kolli_auth', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
}

function clientUrl() {
    const url = process.env.CLIENT_URL || 'http://localhost:3000';
    return `${url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`}`.replace(/\/$/, '');
}

function validAccountLinkState(state) {
    try {
        const payload = jwt.verify(state, process.env.JWT_SECRET || 'dev-secret');
        return payload.purpose === 'account-link' && typeof payload.guestId === 'string'
            ? payload.guestId
            : null;
    } catch {
        return null;
    }
}

router.get('/config', (req, res) => {
    res.json({ googleOAuthEnabled, guestWatchPartyLimit: 3 });
});

router.post('/guest', rateLimit, async (req, res) => {
    try {
        const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
        if (!/^[\p{L}\p{N}_ -]{3,24}$/u.test(username)) {
            return res.status(400).json({
                error: 'Choose a display name with 3–24 letters, numbers, spaces, hyphens, or underscores.'
            });
        }

        if (req.body.adultConfirmed !== true || req.body.privacyNoticeAccepted !== true) {
            return res.status(400).json({ error: 'Confirm that you are 18 or older and accept the privacy notice to continue.' });
        }

        const user = await User.create({
            username,
            email: `${uuidv4()}@guest.kolli`,
            isGuest: true,
            onboarded: true,
            adultConfirmedAt: new Date(),
            privacyNoticeVersion: '2026-10-16'
        });
        setAuthCookie(res, user);
        res.status(201).json({
            user: { id: user._id, username: user.username, isGuest: true }
        });
    } catch (error) {
        console.error('Guest sign-in error:', error);
        res.status(500).json({ error: 'Could not start a guest session' });
    }
});

router.get('/google/link', (req, res, next) => {
    if (!googleOAuthEnabled) {
        return res.redirect('/dashboard.html?account_link_error=google_not_configured');
    }
    try {
        const token = req.cookies?.kolli_auth;
        const user = token && jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        if (!user?.isGuest || typeof user.id !== 'string') {
            return res.redirect('/dashboard.html?account_link_error=guest_session_required');
        }

        const state = jwt.sign(
            { purpose: 'account-link', guestId: user.id, nonce: randomBytes(16).toString('hex') },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '10m' }
        );
        return passport.authenticate('google', {
            scope: ['profile', 'email'],
            state,
            prompt: 'select_account'
        })(req, res, next);
    } catch (error) {
        console.error('Account-link start error:', error);
        return res.redirect('/dashboard.html?account_link_error=invalid_guest_session');
    }
});

/**
 * Google OAuth login
 */
router.get('/google', (req, res, next) => {
    if (!googleOAuthEnabled) {
        return res.redirect('/dashboard.html?auth_error=google_not_configured');
    }
    return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

/**
 * Google OAuth callback
 */
router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) {
            console.error('Google OAuth callback error:', err);
            return res.redirect('/dashboard.html?auth_error=1');
        }

        if (!user) {
            console.error('Google OAuth callback: no user returned', info);
            return res.redirect('/dashboard.html?auth_error=1');
        }

        (async () => {
            const guestId = validAccountLinkState(req.query.state);
            let linkedAccount = false;
            let account;

            if (guestId) {
                const profile = user.googleProfile;
                const email = profile?.emails?.[0]?.value;
                if (!profile?.id || !email) {
                    return res.redirect('/dashboard.html?account_link_error=google_email_required');
                }

                const guest = await User.findOne({ _id: guestId, isGuest: true });
                if (!guest) {
                    return res.redirect('/dashboard.html?account_link_error=guest_not_found');
                }
                const existingGoogle = await User.findOne({ googleId: profile.id });
                if (existingGoogle && existingGoogle._id.toString() !== guest._id.toString()) {
                    return res.redirect('/dashboard.html?account_link_error=google_already_linked');
                }
                const existingEmail = await User.findOne({ email, _id: { $ne: guest._id } });
                if (existingEmail) {
                    return res.redirect('/dashboard.html?account_link_error=email_already_used');
                }

                guest.googleId = profile.id;
                guest.email = email;
                guest.avatar = profile.photos?.[0]?.value || guest.avatar;
                guest.isGuest = false;
                await guest.save();
                account = guest;
                linkedAccount = true;
            } else if (user.googleProfile) {
                const profile = user.googleProfile;
                const email = profile.emails?.[0]?.value;
                if (!profile.id || !email) {
                    return res.redirect('/dashboard.html?auth_error=google_email_required');
                }
                account = await User.findOne({ googleId: profile.id });
                if (!account) {
                    return res.redirect('/dashboard.html?auth_error=account_not_found');
                }
            } else {
                account = user;
            }

            req.logIn(account, (loginErr) => {
                if (loginErr) {
                    console.error('Failed to log in user after Google auth:', loginErr);
                    return res.redirect('/dashboard.html?auth_error=1');
                }
                setAuthCookie(res, account);
                const result = linkedAccount ? 'account_linked=1' : 'signed_in=1';
                return res.redirect(`${clientUrl()}/dashboard.html?${result}`);
            });
        })().catch(error => {
            console.error('Google account callback error:', error);
            res.redirect('/dashboard.html?auth_error=1');
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
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
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
