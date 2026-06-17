import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Database
import { connectDB } from './config/database.js';

// Routes
import authRoutes from './routes/auth.js';
import searchRoutes from './routes/search.js';
import queueRoutes from './routes/queue.js';
import lobbyRoutes from './routes/lobby.js';
import userRoutes from './routes/user.js';

// Middleware
import { authenticateToken } from './middleware/auth.js';
import { setupWebSocket } from './websocket/handler.js';
import './middleware/passport.js'; // Register Passport strategies

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

// ===== Security & Middleware =====
app.use(helmet());

const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:3000',
    'https://kolli1.netlify.app'
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS origin denied: ${origin}`));
        }
    },
    credentials: true
}));

app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Parse cookies for auth middleware
app.use((req, res, next) => {
    const rawCookies = req.headers.cookie || '';
    req.cookies = rawCookies.split(';').filter(Boolean).reduce((cookies, cookie) => {
        const [name, ...value] = cookie.split('=');
        cookies[name.trim()] = decodeURIComponent(value.join('=').trim());
        return cookies;
    }, {});
    next();
});

// ===== Session & Authentication =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MONGODB_URI ? new MongoStore({
        mongoUrl: MONGODB_URI,
        touchAfter: 24 * 3600 // lazy session update (in seconds)
    }) : undefined,
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// ===== Routes =====
app.use('/auth', authRoutes);
app.use('/api/search', authenticateToken, searchRoutes);
app.use('/api/queue', authenticateToken, queueRoutes);
app.use('/api/lobby', authenticateToken, lobbyRoutes);
app.use('/api/user', authenticateToken, userRoutes);

// ===== Health Check =====
app.get('/health', async (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        env: NODE_ENV,
        mongodb: MONGODB_URI ? 'configured' : 'not configured'
    });
});

// ===== 404 Handler =====
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ===== Error Handler =====
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    const statusCode = err.statusCode || 500;
    const message = NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message;

    res.status(statusCode).json({ 
        error: message,
        ...(NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ===== WebSocket Setup =====
setupWebSocket(wss);

// ===== Database Connection & Server Startup =====
async function startServer() {
    try {
        // Connect to MongoDB
        if (MONGODB_URI) {
            await connectDB();
        } else {
            console.warn('⚠️ MONGODB_URI not set. Using in-memory storage.');
        }

        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`🚀 Kolli server running on port ${PORT} in ${NODE_ENV} mode`);
            console.log(`   API: http://localhost:${PORT}`);
            console.log(`   WebSocket: ws://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// ===== Graceful Shutdown =====
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(async () => {
        console.log('Server closed');
        try {
            await connectDB()?.close();
        } catch (e) {
            // Already closed
        }
        process.exit(0);
    });
});

// Start server
startServer();

export default server;
