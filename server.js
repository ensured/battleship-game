const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

class GameRoom {
    constructor() {
        this.id = uuidv4();
        this.players = [];
        this.playerStates = {};
        this.boards = {};
        this.currentTurn = null;
        this.gameState = 'waiting';
        this.shots = {};
    }

    addPlayer(ws, playerName) {
        if (this.players.length >= 2) {
            console.log(`Room ${this.id} is full, rejecting ${playerName}`);
            return null;
        }

        const playerId = uuidv4();
        const player = {
            id: playerId,
            name: playerName,
            ws: ws,
            index: this.players.length
        };

        this.players.push(player);
        this.playerStates[playerId] = 'setup';
        this.boards[playerId] = Array(10).fill(null).map(() => Array(10).fill(null));
        this.shots[playerId] = [];

        console.log(`Added player ${playerName} (${playerId}) to room ${this.id}`);
        return player;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        delete this.playerStates[playerId];
        delete this.boards[playerId];
        delete this.shots[playerId];
        
        if (this.players.length === 0) {
            this.gameState = 'waiting';
            this.currentTurn = null;
        }
    }

    setPlayerReady(playerId, board) {
        console.log(`Setting player ${playerId} as ready`);
        console.log('Current player states:', this.playerStates);
        this.playerStates[playerId] = 'ready';
        console.log('Updated player states:', this.playerStates);
        this.boards[playerId] = board;

        const allReady = this.players.every(p => this.playerStates[p.id] === 'ready');
        console.log(`All players ready? ${allReady}, Total players: ${this.players.length}`);
        console.log('Player ready status:', this.players.map(p => `${p.name}: ${this.playerStates[p.id]}`));
        
        if (allReady && this.players.length === 2) {
            console.log('Starting game!');
            this.gameState = 'playing';
            this.currentTurn = this.players[0].id;
            this.broadcastStartGame();
        }
    }

    handleShot(playerId, row, col) {
        if (this.gameState !== 'playing' || this.currentTurn !== playerId) {
            return null;
        }

        const opponent = this.players.find(p => p.id !== playerId);
        if (!opponent) return null;

        const shotKey = `${row},${col}`;
        if (this.shots[opponent.id].includes(shotKey)) {
            return null;
        }

        this.shots[opponent.id].push(shotKey);
        
        const targetCell = this.boards[opponent.id][row][col];
        const isHit = targetCell !== null;

        if (isHit) {
            if (this.checkVictory(opponent.id)) {
                this.gameState = 'gameover';
                return {
                    hit: true,
                    shipType: targetCell,
                    gameOver: true,
                    winner: playerId
                };
            }
        }

        this.currentTurn = opponent.id;

        return {
            hit: isHit,
            shipType: targetCell,
            gameOver: false,
            winner: null
        };
    }

    checkVictory(playerId) {
        const board = this.boards[playerId];
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                if (board[row][col] !== null) {
                    const shotKey = `${row},${col}`;
                    if (!this.shots[playerId].includes(shotKey)) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    broadcastToPlayers(message, excludePlayer = null) {
        this.players.forEach(player => {
            if (player.id !== excludePlayer && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }

    broadcastStartGame() {
        this.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'gameStart',
                    gameState: 'playing',
                    currentTurn: this.currentTurn
                }));
            }
        });
    }

    getPlayersList() {
        return this.players.map(p => p.name);
    }
}

const gameRooms = new Map();
const playerToRoom = new Map();

function findOrCreateRoom() {
    for (const [roomId, room] of gameRooms) {
        if (room.players.length < 2 && room.gameState === 'waiting') {
            return room;
        }
    }
    
    const newRoom = new GameRoom();
    gameRooms.set(newRoom.id, newRoom);
    return newRoom;
}

wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    let currentPlayer = null;
    let currentRoom = null;

    ws.on('message', (data) => {
        console.log('Received message from WebSocket:', data.toString());
        try {
            const message = JSON.parse(data.toString());
            console.log('Parsed message:', message);
            
            switch (message.type) {
                case 'joinGame':
                    console.log(`Player "${message.playerName}" trying to join game`);
                    currentRoom = findOrCreateRoom();
                    currentPlayer = currentRoom.addPlayer(ws, message.playerName);
                    console.log(`Room now has ${currentRoom.players.length} players`);
                    
                    if (currentPlayer) {
                        playerToRoom.set(currentPlayer.id, currentRoom.id);
                        
                        ws.send(JSON.stringify({
                            type: 'playerId',
                            playerId: currentPlayer.id
                        }));
                        
                        // Send player list directly to the new player
                        ws.send(JSON.stringify({
                            type: 'playerJoined',
                            players: currentRoom.getPlayersList()
                        }));
                        
                        // Broadcast to other players
                        currentRoom.broadcastToPlayers({
                            type: 'playerJoined',
                            players: currentRoom.getPlayersList()
                        }, currentPlayer.id);
                        
                        if (currentRoom.players.length === 1) {
                            ws.send(JSON.stringify({
                                type: 'waiting',
                                message: 'Waiting for another player to join...'
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Could not join game. Room full.'
                        }));
                    }
                    break;

                case 'playerReady':
                    console.log(`Player ${currentPlayer?.name} marked as ready`);
                    if (currentRoom && currentPlayer) {
                        currentRoom.setPlayerReady(currentPlayer.id, message.board);
                    }
                    break;

                case 'shot':
                    if (currentRoom && currentPlayer) {
                        const result = currentRoom.handleShot(currentPlayer.id, message.row, message.col);
                        
                        if (result) {
                            ws.send(JSON.stringify({
                                type: 'shotResult',
                                row: message.row,
                                col: message.col,
                                hit: result.hit,
                                shipType: result.shipType
                            }));
                            
                            currentRoom.broadcastToPlayers({
                                type: 'enemyShot',
                                row: message.row,
                                col: message.col,
                                hit: result.hit
                            }, currentPlayer.id);
                            
                            currentRoom.broadcastToPlayers({
                                type: 'gameState',
                                gameState: currentRoom.gameState,
                                currentTurn: currentRoom.currentTurn
                            });
                            
                            if (result.gameOver) {
                                currentRoom.broadcastToPlayers({
                                    type: 'gameOver',
                                    winner: result.winner
                                });
                            }
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid shot or not your turn'
                            }));
                        }
                    }
                    break;

                case 'resetGame':
                    if (currentRoom) {
                        currentRoom.gameState = 'waiting';
                        currentRoom.currentTurn = null;
                        currentRoom.players.forEach(player => {
                            currentRoom.playerStates[player.id] = 'setup';
                            currentRoom.boards[player.id] = Array(10).fill(null).map(() => Array(10).fill(null));
                            currentRoom.shots[player.id] = [];
                        });
                        
                        currentRoom.broadcastToPlayers({
                            type: 'resetComplete'
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        
        if (currentPlayer && currentRoom) {
            currentRoom.removePlayer(currentPlayer.id);
            playerToRoom.delete(currentPlayer.id);
            
            currentRoom.broadcastToPlayers({
                type: 'playerDisconnected',
                playerId: currentPlayer.id,
                players: currentRoom.getPlayersList()
            });
            
            if (currentRoom.players.length === 0) {
                gameRooms.delete(currentRoom.id);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        rooms: gameRooms.size,
        players: Array.from(gameRooms.values()).reduce((total, room) => total + room.players.length, 0)
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Battleship Server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} to play`);
    console.log(`🔌 WebSocket server ready for multiplayer connections`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});