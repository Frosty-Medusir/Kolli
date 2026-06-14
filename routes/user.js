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

        res.json(user);
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
        const { partnerId, rating, comment, tags } = req.body;

        if (!partnerId || !rating || !['up', 'down'].includes(rating)) {
            return res.status(400).json({ error: 'Partner ID and rating (up/down) required' });
        }

        // Find the latest match between these users
        const match = await Match.findOne({
            $or: [
                { user1: req.user.id, user2: partnerId },
                { user1: partnerId, user2: req.user.id }
            ],
            status: 'ended'
        }).sort({ createdAt: -1 });

        // Create rating
        const newRating = new Rating({
            fromUser: req.user.id,
            toUser: partnerId,
            matchId: match?._id,
            rating,
            comment: comment?.substring(0, 500),
            tags: tags || []
        });

        await newRating.save();

        // Update user stats
        const toUser = await User.findById(partnerId);
        if (toUser) {
            const allRatings = await Rating.find({ toUser: partnerId });
            const upRatings = allRatings.filter(r => r.rating === 'up').length;
            const avgRating = upRatings / allRatings.length;

            toUser.stats.totalRatingsReceived = allRatings.length;
            toUser.stats.averageRating = parseFloat(avgRating.toFixed(2));
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

export default router;
