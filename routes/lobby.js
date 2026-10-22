import express from 'express';
import { Message } from '../models/Message.js';
import { Match } from '../models/Match.js';
import { User } from '../models/User.js';

const router = express.Router();

function isLobbyParticipant(lobby, userId) {
    return [lobby.user1, lobby.user2].some(participant => {
        const id = participant?._id || participant;
        return id && id.toString() === userId.toString();
    });
}

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
        if (!isLobbyParticipant(lobby, req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(lobby);

    } catch (error) {
        console.error('Get lobby error:', error);
        res.status(500).json({ error: 'Failed to get lobby' });
    }
});

router.put('/:lobbyId/kosmi-room', async (req, res) => {
    try {
        const lobby = await Match.findOne({ matchId: req.params.lobbyId });
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }
        if (!isLobbyParticipant(lobby, req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const roomUrl = typeof req.body.roomUrl === 'string' ? req.body.roomUrl.trim() : '';
        if (roomUrl) {
            let parsedUrl;
            try {
                parsedUrl = new URL(roomUrl);
            } catch {
                return res.status(400).json({ error: 'Enter a valid Kosmi room URL' });
            }
            if (parsedUrl.protocol !== 'https:' ||
                (parsedUrl.hostname !== 'kosmi.io' && !parsedUrl.hostname.endsWith('.kosmi.io'))) {
                return res.status(400).json({ error: 'Room link must be an HTTPS link hosted on kosmi.io' });
            }
            lobby.kosmiRoomUrl = parsedUrl.toString();
        } else {
            lobby.kosmiRoomUrl = undefined;
        }

        await lobby.save();
        res.json({ kosmiRoomUrl: lobby.kosmiRoomUrl || null });
    } catch (error) {
        console.error('Update Kosmi room error:', error);
        res.status(500).json({ error: 'Failed to update Kosmi room' });
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
        if (!isLobbyParticipant(lobby, userId)) {
            return res.status(403).json({ error: 'Access denied' });
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
        const lobby = await Match.findOne({ matchId: lobbyId });
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }
        if (!isLobbyParticipant(lobby, req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

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
        if (!isLobbyParticipant(lobby, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (lobby.status === 'active') {
            const completedMatch = await Match.findOneAndUpdate(
                { _id: lobby._id, status: 'active' },
                { $set: { status: 'ended', endedAt: new Date() } },
                { new: true }
            );
            if (completedMatch) {
                await User.updateMany(
                    { _id: { $in: [completedMatch.user1, completedMatch.user2] } },
                    { $inc: { 'stats.matchesCompleted': 1 } }
                );
            }
        }

        res.json({ message: 'Left lobby' });

    } catch (error) {
        console.error('Leave lobby error:', error);
        res.status(500).json({ error: 'Failed to leave lobby' });
    }
});

export default router;
