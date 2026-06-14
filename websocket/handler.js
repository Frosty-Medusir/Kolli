/**
 * WebSocket Handler for Real-time Messaging
 * Handles lobbies, messaging, and presence
 */

const lobbyConnections = new Map(); // lobbyId -> Set of WebSocket connections
const userSessions = new Map(); // userId -> WebSocket session data

/**
 * Setup WebSocket server
 */
export function setupWebSocket(wss) {
    wss.on('connection', (ws, req) => {
        const url = req.url;
        console.log(`🔌 WebSocket connection: ${url}`);

        // Extract lobby ID from URL (e.g., /ws/lobby/ABC123)
        const lobbyIdMatch = url.match(/\/ws\/lobby\/([^/?]+)/);
        if (!lobbyIdMatch) {
            ws.close(1008, 'Invalid URL format');
            return;
        }

        const lobbyId = lobbyIdMatch[1];
        const userId = req.user?.id || `anonymous_${Date.now()}`;

        // Store connection
        if (!lobbyConnections.has(lobbyId)) {
            lobbyConnections.set(lobbyId, new Set());
        }
        lobbyConnections.get(lobbyId).add(ws);

        userSessions.set(userId, {
            ws,
            lobbyId,
            connectedAt: Date.now(),
            isTyping: false
        });

        // Notify others that user joined
        broadcastToLobby(lobbyId, {
            type: 'user-joined',
            userId,
            username: req.user?.username || 'Anonymous',
            timestamp: new Date().toISOString()
        }, ws);

        // Handle messages
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleWebSocketMessage(message, ws, lobbyId, userId);
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        });

        // Handle disconnect
        ws.on('close', () => {
            console.log(`🔌 WebSocket disconnect: ${userId} from ${lobbyId}`);
            
            lobbyConnections.get(lobbyId)?.delete(ws);
            userSessions.delete(userId);

            // Notify others that user left
            broadcastToLobby(lobbyId, {
                type: 'user-left',
                userId,
                username: req.user?.username || 'Anonymous',
                timestamp: new Date().toISOString()
            });

            // Clean up empty lobbies
            if (lobbyConnections.get(lobbyId)?.size === 0) {
                lobbyConnections.delete(lobbyId);
            }
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    console.log('✓ WebSocket server initialized');
}

/**
 * Handle different types of WebSocket messages
 */
function handleWebSocketMessage(message, ws, lobbyId, userId) {
    switch (message.type) {
        case 'chat':
            handleChatMessage(message, lobbyId, userId);
            break;
        
        case 'typing':
            handleTypingIndicator(message, lobbyId, userId);
            break;
        
        case 'presence':
            handlePresenceUpdate(message, lobbyId, userId);
            break;
        
        default:
            console.warn(`Unknown message type: ${message.type}`);
    }
}

/**
 * Handle chat messages
 */
function handleChatMessage(message, lobbyId, userId) {
    const chatMessage = {
        type: 'chat',
        message: {
            id: `msg_${Date.now()}`,
            senderId: userId,
            text: message.text,
            timestamp: message.timestamp || new Date().toISOString()
        }
    };

    broadcastToLobby(lobbyId, chatMessage);

    // Log message (for persistence in production)
    console.log(`💬 [${lobbyId}] ${userId}: ${message.text}`);
}

/**
 * Handle typing indicators
 */
function handleTypingIndicator(message, lobbyId, userId) {
    const session = userSessions.get(userId);
    if (session) {
        session.isTyping = true;
    }

    broadcastToLobby(lobbyId, {
        type: 'typing',
        userId,
        username: message.username
    }, userSessions.get(userId).ws);

    // Auto-clear typing after 3 seconds
    setTimeout(() => {
        if (session && session.isTyping) {
            session.isTyping = false;
        }
    }, 3000);
}

/**
 * Handle presence updates (online/offline status)
 */
function handlePresenceUpdate(message, lobbyId, userId) {
    const session = userSessions.get(userId);
    if (session) {
        session.status = message.status || 'online';
    }

    broadcastToLobby(lobbyId, {
        type: 'presence',
        userId,
        status: message.status
    });
}

/**
 * Broadcast message to all users in a lobby
 */
function broadcastToLobby(lobbyId, message, excludeWs = null) {
    const connections = lobbyConnections.get(lobbyId);
    if (!connections) return;

    const payload = JSON.stringify(message);

    connections.forEach(ws => {
        if (ws !== excludeWs && ws.readyState === 1) { // WebSocket.OPEN = 1
            ws.send(payload);
        }
    });
}

/**
 * Get lobby info (active users, etc)
 */
export function getLobbyInfo(lobbyId) {
    const connections = lobbyConnections.get(lobbyId);
    const activeUsers = connections ? connections.size : 0;

    return {
        lobbyId,
        activeUsers,
        isActive: activeUsers > 0
    };
}

/**
 * Close all connections in a lobby
 */
export function closeLobby(lobbyId, reason = 'Lobby ended') {
    const connections = lobbyConnections.get(lobbyId);
    if (!connections) return;

    const message = JSON.stringify({
        type: 'lobby-ended',
        reason
    });

    connections.forEach(ws => {
        if (ws.readyState === 1) {
            ws.send(message);
            ws.close(1000, reason);
        }
    });

    lobbyConnections.delete(lobbyId);
}
