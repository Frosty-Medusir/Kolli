import express from 'express';
import { Message } from '../models/Message.js';
import { Match } from '../models/Match.js';

const router = express.Router();

/**
 * Get lobby details
 */
router.get('/:lobbyId', async (req, res) => {
    try {
        const { lobbyId } = req.params;
        const lobby = await Match.findOne({ matchId: lobbyId })
            .populate('user1', 'username avatar')
            .populate('user2', 'username avatar');

        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        // Check if user is part of this lobby
        if (lobby.user1._id !== req.user.id && lobby.user2._id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(lobby);

    } catch (error) {
        console.error('Get lobby error:', error);
        res.status(500).json({ error: 'Failed to get lobby' });
    }
});

/**
 * Send a message in the lobby
 */
router.post('/:lobbyId/message', async (req, res) => {
    try {
        const { lobbyId } = req.params;
        const { text } = req.body;
        const userId = req.user.id;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Verify lobby exists
        const lobby = await Match.findOne({ matchId: lobbyId });
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        // Create message
        const message = new Message({
            lobbyId,
            senderId: userId,
            senderName: req.user.username,
            senderAvatar: req.user.avatar,
            text: text.trim(),
            messageType: 'text',
            timestamp: new Date()
        });

        await message.save();

        // Update match message count
        lobby.messageCount = (lobby.messageCount || 0) + 1;
        await lobby.save();

        res.json({ 
            message: {
                id: message._id,
                text: message.text,
                sender: message.senderName,
                timestamp: message.timestamp
            },
            status: 'sent'
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

/**
 * Get messages from lobby (for polling)
 */
router.get('/:lobbyId/messages', async (req, res) => {
    try {
        const { lobbyId } = req.params;
        const { since } = req.query;

        let query = { lobbyId };

        // Filter by timestamp if provided
        if (since) {
            const sinceTime = new Date(parseInt(since));
            query.timestamp = { $gt: sinceTime };
        }

        const messages = await Message
            .find(query)
            .sort({ timestamp: 1 })
            .limit(100)
            .exec();

        res.json({ 
            messages: messages.map(m => ({
                id: m._id,
                senderId: m.senderId,
                senderName: m.senderName,
                text: m.text,
                timestamp: m.timestamp
            })),
            total: messages.length 
        });

    } catch (error) {
        console.error('Fetch messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * End/leave lobby
 */
router.post('/:lobbyId/leave', async (req, res) => {
    try {
        const { lobbyId } = req.params;
        const userId = req.user.id;

        const lobby = await Match.findOne({ matchId: lobbyId });
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        // End the match
        lobby.status = 'ended';
        lobby.endedAt = new Date();
        await lobby.save();

        res.json({ message: 'Left lobby' });

    } catch (error) {
        console.error('Leave lobby error:', error);
        res.status(500).json({ error: 'Failed to leave lobby' });
    }
});

export default router;
