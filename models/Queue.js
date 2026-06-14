import mongoose from 'mongoose';

/**
 * Queue Entry Schema (for matching algorithm)
 */
const queueSchema = new mongoose.Schema({
    queueId: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    contentId: {
        type: Number,
        required: true,
        index: true
    },
    contentTitle: String,
    contentType: {
        type: String,
        enum: ['movie', 'tv'],
        default: 'movie'
    },
    
    genres: [Number],
    genreId: Number,
    
    joinedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    status: {
        type: String,
        enum: ['waiting', 'matched', 'expired'],
        default: 'waiting'
    },
    
    matchedWith: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

// Auto-delete queue entries older than 30 minutes
queueSchema.index(
    { joinedAt: 1 },
    { expireAfterSeconds: 1800 }
);

export const Queue = mongoose.model('Queue', queueSchema);
