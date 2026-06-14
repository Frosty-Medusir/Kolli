import mongoose from 'mongoose';

/**
 * Rating/Feedback Schema
 */
const ratingSchema = new mongoose.Schema({
    fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    toUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    matchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match',
        required: true
    },
    
    rating: {
        type: String,
        enum: ['up', 'down'],
        required: true
    },
    
    comment: {
        type: String,
        maxlength: 500
    },
    
    tags: [String], // e.g., ['respectful', 'good-taste', 'chatty']
    
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

// Prevent duplicate ratings for same match
ratingSchema.index(
    { fromUser: 1, matchId: 1 },
    { unique: true }
);

export const Rating = mongoose.model('Rating', ratingSchema);
