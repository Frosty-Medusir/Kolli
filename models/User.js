import mongoose from 'mongoose';

/**
 * User Schema
 */
const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    avatar: String,
    bio: String,
    
    preferences: {
        genres: [Number],
        watchedMovies: [Number],
        notifications: {
            type: Boolean,
            default: true
        }
    },
    
    stats: {
        matchesCompleted: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        totalRatingsReceived: { type: Number, default: 0 }
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
