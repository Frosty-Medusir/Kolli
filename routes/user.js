import express from 'express';
import { User } from '../models/User.js';
import { Rating } from '../models/Rating.js';
import { Report } from '../models/Report.js';
import { Match } from '../models/Match.js';

const router = express.Router();

/**
 * Get user profile
 */
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-_id -__v');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            preferences: user.preferences,
            watchingNow: user.watchingNow,
            onboarded: user.onboarded,
            shadowBannedUntil: user.shadowBannedUntil,
            stats: user.stats
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

/**
 * Update user preferences (genres, etc)
 */
router.put('/preferences', async (req, res) => {
    try {
        const { genres, watchedMovies } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (genres && Array.isArray(genres)) {
            user.preferences.genres = genres;
        }
        if (watchedMovies && Array.isArray(watchedMovies)) {
            user.preferences.watchedMovies = watchedMovies;
        }

        await user.save();

        res.json({ 
            message: 'Preferences updated', 
            preferences: user.preferences 
        });

    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

/**
 * Rate a user/watch party experience
 */
router.post('/rate', async (req, res) => {
    try {
        const { partnerId, stars, comment, tags } = req.body;

        if (!partnerId || typeof stars !== 'number' || stars < 1 || stars > 5) {
            return res.status(400).json({ error: 'Partner ID and star rating (1-5) required' });
        }

        const match = await Match.findOne({
            $or: [
                { user1: req.user.id, user2: partnerId },
                { user1: partnerId, user2: req.user.id }
            ],
            status: 'ended'
        }).sort({ createdAt: -1 });

        if (!match) {
            return res.status(400).json({ error: 'No completed match found for rating' });
        }

        const newRating = new Rating({
            fromUser: req.user.id,
            toUser: partnerId,
            matchId: match._id,
            stars,
            comment: comment?.substring(0, 500),
            tags: tags || []
        });

        await newRating.save();

        const toUser = await User.findById(partnerId);
        if (toUser) {
            const allRatings = await Rating.find({ toUser: partnerId });
            const total = allRatings.length;
            const avgStars = allRatings.reduce((sum, item) => sum + item.stars, 0) / total;
            const badRatings = await Rating.countDocuments({ toUser: partnerId, stars: { $lte: 2 } });

            toUser.stats.totalRatingsReceived = total;
            toUser.stats.averageRating = parseFloat(avgStars.toFixed(2));
            toUser.stats.badRatings = badRatings;

            if (badRatings > 3) {
                const existingBan = toUser.shadowBannedUntil && new Date(toUser.shadowBannedUntil) > new Date();
                const banExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
                toUser.shadowBannedUntil = existingBan ? new Date(Math.max(new Date(toUser.shadowBannedUntil).getTime(), banExpiration.getTime())) : banExpiration;
            }

            await toUser.save();
        }

        res.json({ 
            message: 'Rating submitted',
            rating: newRating
        });

    } catch (error) {
        console.error('Rate user error:', error);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
});

/**
 * Report a user
 */
router.post('/report', async (req, res) => {
    try {
        const { userId, reason, description } = req.body;

        if (!userId || !reason) {
            return res.status(400).json({ error: 'User ID and reason required' });
        }

        const validReasons = [
            'inappropriate-behavior',
            'harassment',
            'spam',
            'fake-profile',
            'other'
        ];

        if (!validReasons.includes(reason)) {
            return res.status(400).json({ error: 'Invalid reason' });
        }

        // Create report
        const report = new Report({
            reportedUser: userId,
            reportedBy: req.user.id,
            reason,
            description: description?.substring(0, 1000),
            status: 'open'
        });

        await report.save();

        res.json({ 
            message: 'Report submitted',
            reportId: report._id
        });

    } catch (error) {
        console.error('Report user error:', error);
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

/**
 * Get active matches / lobbies for current user
 */
router.get('/matches', async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { user1: req.user.id },
                { user2: req.user.id }
            ],
            status: 'active'
        })
        .populate('user1', 'username avatar')
        .populate('user2', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(20);

        const results = matches.map(match => {
            const partner = match.user1._id.toString() === req.user.id
                ? match.user2
                : match.user1;

            return {
                matchId: match.matchId,
                contentTitle: match.contentTitle,
                posterUrl: match.posterUrl,
                genres: match.genres,
                releaseYear: match.releaseYear,
                partner: {
                    username: partner.username,
                    avatar: partner.avatar
                },
                messageCount: match.messageCount || 0,
                expiresAt: match.expiresAt,
                status: match.status
            };
        });

        res.json({ matches: results });
    } catch (error) {
        console.error('Fetch matches error:', error);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

/**
 * Get user ratings/reviews
 */
router.get('/:userId/ratings', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const ratings = await Rating
            .find({ toUser: userId })
            .populate('fromUser', 'username avatar')
            .sort({ createdAt: -1 })
            .limit(20);

        const stats = {
            total: ratings.length,
            upRatings: ratings.filter(r => r.rating === 'up').length,
            downRatings: ratings.filter(r => r.rating === 'down').length,
            averageRating: ratings.length > 0 
                ? (ratings.filter(r => r.rating === 'up').length / ratings.length * 100).toFixed(1) + '%'
                : 'N/A'
        };

        res.json({ ratings, stats });

    } catch (error) {
        console.error('Get ratings error:', error);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

/**
 * Get user watch history
 */
router.get('/history/watched', async (req, res) => {
    try {
        const matches = await Match
            .find({
                $or: [
                    { user1: req.user.id },
                    { user2: req.user.id }
                ],
                status: 'ended'
            })
            .sort({ endedAt: -1 })
            .limit(20);

        res.json({ 
            watched: matches.length,
            history: matches 
        });

    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * Check if username is available
 */
router.get('/check-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        if (!username || username.length < 3) {
            return res.json({ available: false, reason: 'Username must be at least 3 characters' });
        }
        
        const exists = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
        
        res.json({ 
            available: !exists,
            reason: exists ? 'Username already taken' : null
        });
    } catch (error) {
        console.error('Username check error:', error);
        res.status(500).json({ error: 'Failed to check username' });
    }
});

/**
 * Complete onboarding (username + watching shows)
 */
router.put('/onboard', async (req, res) => {
    try {
        const { username, watchingNow, genres } = req.body;
        
        if (!username || username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }
        
        if (!Array.isArray(watchingNow) || watchingNow.length === 0) {
            return res.status(400).json({ error: 'At least one show must be selected' });
        }
        
        // Check username availability
        const exists = await User.findOne({ 
            username: new RegExp(`^${username}$`, 'i'),
            _id: { $ne: req.user.id }
        });
        
        if (exists) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.username = username;
        user.watchingNow = watchingNow;
        if (genres && Array.isArray(genres)) {
            user.preferences.genres = genres;
        }
        user.onboarded = true;
        
        await user.save();
        
        res.json({ 
            message: 'Onboarding completed',
            user: {
                username: user.username,
                onboarded: user.onboarded,
                watchingNow: user.watchingNow,
                genres: user.preferences.genres
            }
        });
    } catch (error) {
        console.error('Onboard error:', error);
        res.status(500).json({ error: 'Failed to complete onboarding' });
    }
});

/**
 * Update user profile (username, avatar, genres)
 */
router.put('/profile', async (req, res) => {
    try {
        const { username, avatar, bio, genres } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (username && username !== user.username) {
            if (username.length < 3) {
                return res.status(400).json({ error: 'Username must be at least 3 characters' });
            }
            const exists = await User.findOne({ 
                username: new RegExp(`^${username}$`, 'i'),
                _id: { $ne: req.user.id }
            });
            if (exists) {
                return res.status(400).json({ error: 'Username already taken' });
            }
            user.username = username;
        }
        
        if (avatar) user.avatar = avatar;
        if (bio) user.bio = bio.substring(0, 500);
        if (genres && Array.isArray(genres)) {
            user.preferences.genres = genres;
        }
        
        await user.save();
        
        res.json({ 
            message: 'Profile updated',
            user: {
                username: user.username,
                avatar: user.avatar,
                bio: user.bio,
                genres: user.preferences.genres
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * Add/remove shows from watching list
 */
router.put('/watching', async (req, res) => {
    try {
        const { action, show, shows } = req.body;
        
        if (!['add', 'remove'].includes(action) || (!show && !shows)) {
            return res.status(400).json({ error: 'Action and show(s) required' });
        }
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (action === 'add') {
            const itemsToAdd = Array.isArray(shows) ? shows : [show];
            itemsToAdd.forEach(item => {
                if (!item || !item.tmdbId) return;
                const exists = user.watchingNow.some(s => s.tmdbId === item.tmdbId);
                if (!exists) {
                    user.watchingNow.push({
                        tmdbId: item.tmdbId,
                        title: item.title,
                        poster: item.poster || ''
                    });
                }
            });
        } else if (action === 'remove') {
            user.watchingNow = user.watchingNow.filter(s => s.tmdbId !== show.tmdbId);
        }
        
        await user.save();
        
        res.json({ 
            message: `Show ${action}ed`,
            watchingNow: user.watchingNow
        });
    } catch (error) {
        console.error('Update watching error:', error);
        res.status(500).json({ error: 'Failed to update watching list' });
    }
});

export default router;
