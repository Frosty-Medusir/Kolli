import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { Queue } from '../models/Queue.js';
import { Match } from '../models/Match.js';
import { User } from '../models/User.js';

dotenv.config();

const router = express.Router();

/**
 * Join queue to find a match for content
 */
router.post('/join', async (req, res) => {
    try {
        const { contentId, contentTitle, genre, genreId } = req.body;
        const userId = req.user.id;

        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (currentUser.shadowBannedUntil && new Date(currentUser.shadowBannedUntil) > new Date()) {
            return res.status(403).json({
                error: 'You are temporarily shadow banned due to multiple poor ratings. Please try again later.'
            });
        }

        const parsedContentId = parseInt(contentId);
        if (!parsedContentId || !contentTitle) {
            return res.status(400).json({ error: 'Content ID and title required' });
        }

        const parsedGenreId = parseInt(genreId);
        const queueGenres = genre ? [parsedGenreId].filter(id => !Number.isNaN(id)) : [];
        const queueData = {
            queueId: uuidv4(),
            userId,
            contentId: parsedContentId,
            contentTitle,
            contentType: req.body.contentType || 'movie',
            posterUrl: req.body.posterUrl || null,
            releaseYear: req.body.releaseYear ? parseInt(req.body.releaseYear) : null,
            genres: queueGenres,
            genreId: Number.isInteger(parsedGenreId) ? parsedGenreId : null,
            joinedAt: new Date()
        };

        // Try to atomically lock an existing waiting entry for the same content
        const existingEntry = await Queue.findOneAndUpdate({
            contentId: parsedContentId,
            contentType: queueData.contentType,
            userId: { $ne: userId },
            status: 'waiting',
            joinedAt: {
                $gte: new Date(Date.now() - 5 * 60 * 1000) // 5 min window
            }
        }, {
            $set: {
                status: 'matched',
                matchedWith: userId
            }
        }, {
            sort: { joinedAt: 1 },
            new: true
        });

        const queueEntry = new Queue({
            ...queueData,
            status: existingEntry ? 'matched' : 'waiting',
            matchedWith: existingEntry ? existingEntry.userId : undefined
        });

        await queueEntry.save();

        if (existingEntry) {
            // Found a match
            const match = new Match({
                matchId: uuidv4(),
                contentId: parsedContentId,
                contentTitle,
                contentType: queueData.contentType,
                posterUrl: queueData.posterUrl,
                releaseYear: queueData.releaseYear,
                genres: queueGenres,
                user1: userId,
                user2: existingEntry.userId,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min session
            });

            await match.save();

            // Ensure the matched waiting entry has the right partner stored
            existingEntry.matchedWith = userId;
            await existingEntry.save();

            return res.json({
                status: 'matched',
                matchId: match.matchId,
                queueId: queueEntry.queueId
            });
        }

        res.json({
            status: 'queued',
            queueId: queueEntry.queueId,
            message: 'Waiting for a match...'
        });

    } catch (error) {
        console.error('Queue join error:', error);
        res.status(500).json({ error: 'Failed to join queue' });
    }
});

/**
 * Check queue status
 */
router.get('/status', async (req, res) => {
    try {
        const { contentId } = req.query;
        const userId = req.user.id;

        // Check if user has an active match
        const match = await Match.findOne({
            $or: [
                { user1: userId },
                { user2: userId }
            ],
            status: 'active',
            expiresAt: { $gt: new Date() }
        });

        if (match) {
            return res.json({
                status: 'matched',
                matchId: match.matchId,
                message: 'Match found!'
            });
        }

        const queueQuery = {
            userId,
            status: 'waiting'
        };
        if (contentId) {
            queueQuery.contentId = parseInt(contentId);
        }

        // Check if still in queue
        const queueEntry = await Queue.findOne(queueQuery);

        if (queueEntry) {
            return res.json({
                status: 'queued',
                queueId: queueEntry.queueId,
                message: 'Still looking for a match...'
            });
        }

        res.json({
            status: 'none',
            message: 'No active queue or match'
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

/**
 * Leave queue
 */
router.post('/leave', async (req, res) => {
    try {
        const { queueId } = req.body;
        const userId = req.user.id;

        // Remove waiting queue entries for this user
        const queueQuery = queueId ? { queueId, userId, status: 'waiting' } : { userId, status: 'waiting' };
        await Queue.updateMany(queueQuery, { status: 'expired' });

        // Remove any active match for this user
        const match = await Match.findOne({
            $or: [
                { user1: userId },
                { user2: userId }
            ],
            status: 'active'
        });

        if (match) {
            match.status = 'ended';
            match.endedAt = new Date();
            await match.save();
        }

        res.json({ message: 'Left queue' });

    } catch (error) {
        console.error('Leave queue error:', error);
        res.status(500).json({ error: 'Failed to leave queue' });
    }
});

/**
 * Get similar content matches (for genre/year filtering)
 */
router.get('/similar', async (req, res) => {
    try {
        const { filter, genreId, year } = req.query;
        
        // Get all active matches that match the filter
        let query = {
            status: 'active',
            expiresAt: { $gt: new Date() }
        };

        if (filter === 'genre' && genreId) {
            query.genres = parseInt(genreId);
        }
        if (filter === 'year' && year) {
            query.releaseYear = year;
        }

        const similarMatches = await Match
            .find(query)
            .limit(10)
            .exec();

        res.json({ results: similarMatches });

    } catch (error) {
        console.error('Similar matches error:', error);
        res.status(500).json({ error: 'Failed to fetch similar matches' });
    }
});

export default router;
