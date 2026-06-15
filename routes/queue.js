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

        if (!contentId || !contentTitle) {
            return res.status(400).json({ error: 'Content ID and title required' });
        }

        // Create queue entry
        const queueEntry = new Queue({
            queueId: uuidv4(),
            userId,
            contentId,
            contentTitle,
            genres: genre ? [parseInt(genreId)] : [],
            genreId: parseInt(genreId) || null,
            joinedAt: new Date(),
            status: 'waiting'
        });

        await queueEntry.save();

        // Look for matches with same content
        const existingEntry = await Queue.findOne({
            contentId,
            userId: { $ne: userId },
            status: 'waiting',
            joinedAt: {
                $gte: new Date(Date.now() - 5 * 60 * 1000) // 5 min window
            }
        });

        if (existingEntry) {
            // Found a match!
            const match = new Match({
                matchId: uuidv4(),
                contentId,
                contentTitle,
                genres: genre ? [parseInt(genreId)] : [],
                user1: userId,
                user2: existingEntry.userId,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min session
            });

            await match.save();

            // Update queue entries
            queueEntry.status = 'matched';
            queueEntry.matchedWith = existingEntry.userId;
            await queueEntry.save();

            existingEntry.status = 'matched';
            existingEntry.matchedWith = userId;
            await existingEntry.save();

            return res.json({
                status: 'matched',
                matchId: match.matchId
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

        // Check if still in queue
        const queueEntry = await Queue.findOne({
            userId,
            status: 'waiting'
        });

        if (queueEntry) {
            return res.json({
                status: 'queued',
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

        // Remove from queue
        if (queueId) {
            const entry = await Queue.findOne({ queueId, userId });
            if (entry) {
                entry.status = 'expired';
                await entry.save();
            }
        }

        // Remove any active matches
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
