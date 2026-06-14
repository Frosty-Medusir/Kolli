import mongoose from 'mongoose';

/**
 * Message Schema
 */
const messageSchema = new mongoose.Schema({
    lobbyId: {
        type: String,
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: String,
    senderAvatar: String,
    text: {
        type: String,
        required: true,
        minlength: 1,
        maxlength: 1000
    },
    messageType: {
        type: String,
        enum: ['text', 'system', 'typing'],
        default: 'text'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Auto-delete messages older than 24 hours
messageSchema.index(
    { timestamp: 1 },
    { expireAfterSeconds: 86400 }
);

export const Message = mongoose.model('Message', messageSchema);
