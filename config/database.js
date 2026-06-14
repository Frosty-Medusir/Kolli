import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MongoDB Connection Handler
 */
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

let retryCount = 0;

export async function connectDB() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    try {
        console.log('🔗 Connecting to MongoDB...');

        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });

        console.log('✓ MongoDB connected successfully');
        retryCount = 0;

        // Set up connection event listeners
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
        });

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB error:', err);
        });

        return mongoose.connection;

    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);

        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retrying in ${RETRY_DELAY}ms... (Attempt ${retryCount}/${MAX_RETRIES})`);
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return connectDB();
        }

        throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
    }
}

/**
 * Close MongoDB connection
 */
export async function disconnectDB() {
    try {
        await mongoose.disconnect();
        console.log('MongoDB disconnected');
    } catch (error) {
        console.error('Error disconnecting from MongoDB:', error);
    }
}

/**
 * Get connection status
 */
export function getDBStatus() {
    return mongoose.connection.readyState;
    // 0: disconnected
    // 1: connected
    // 2: connecting
    // 3: disconnecting
}

/**
 * Health check
 */
export async function checkDBHealth() {
    try {
        await mongoose.connection.db.admin().ping();
        return { healthy: true, status: 'MongoDB is healthy' };
    } catch (error) {
        return { healthy: false, status: error.message };
    }
}

export default {
    connectDB,
    disconnectDB,
    getDBStatus,
    checkDBHealth
};
