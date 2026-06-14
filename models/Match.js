import mongoose from 'mongoose';

/**
 * Match/Lobby Schema
 */
const matchSchema = new mongoose.Schema({
    matchId: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    
    contentId: {
        type: Number,
        required: true
    },
    contentTitle: {
        type: String,
        required: true
    },
    contentType: {
        type: String,
        enum: ['movie', 'tv'],
        default: 'movie'
    },
    posterUrl: String,
    genres: [Number],
    rating: Number,
    releaseYear: Number,
    description: String,
    
    user1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    user2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    status: {
        type: String,
        enum: ['active', 'ended', 'expired'],
        default: 'active'
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // Auto-delete expired matches
    },
    
    endedAt: Date,
    
    messageCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Index for finding active matches
matchSchema.index({ status: 1, expiresAt: 1 });

export const Match = mongoose.model('Match', matchSchema);
