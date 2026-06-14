import mongoose from 'mongoose';

/**
 * User Report Schema (for moderation)
 */
const reportSchema = new mongoose.Schema({
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    matchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match'
    },
    
    reason: {
        type: String,
        enum: [
            'inappropriate-behavior',
            'harassment',
            'spam',
            'fake-profile',
            'other'
        ],
        required: true
    },
    
    description: {
        type: String,
        maxlength: 1000
    },
    
    status: {
        type: String,
        enum: ['open', 'investigating', 'resolved', 'dismissed'],
        default: 'open',
        index: true
    },
    
    resolution: String,
    
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    resolvedAt: Date
}, { timestamps: true });

export const Report = mongoose.model('Report', reportSchema);
