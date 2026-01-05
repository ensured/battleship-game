class BattleshipGame {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerName = '';
        this.gameState = 'setup';
        this.playerBoard = Array(10).fill(null).map(() => Array(10).fill(null));
        this.enemyBoard = Array(10).fill(null).map(() => Array(10).fill(null));
        this.ships = {
            carrier: { size: 5, placed: false },
            battleship: { size: 4, placed: false },
            cruiser: { size: 3, placed: false },
            submarine: { size: 3, placed: false },
            destroyer: { size: 2, placed: false }
        };
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        this.myTurn = false;
        this.playerHits = 0;
        this.enemyHits = 0;
        
        this.initializeSoundEffects();
        this.initializeEventListeners();
        this.connectWebSocket();
    }

    initializeSoundEffects() {
        // Create audio context for sound effects
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        this.sounds = {
            hit: () => this.playSound(800, 0.1, 'sine'),
            miss: () => this.playSound(200, 0.1, 'triangle'),
            shipPlaced: () => this.playSound(600, 0.1, 'square'),
            gameOver: () => this.playSound(150, 0.5, 'sawtooth'),
            victory: () => this.playVictorySound()
        };
    }

    playSound(frequency, duration, type = 'sine') {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    playVictorySound() {
        const notes = [523, 659, 784, 1047]; // C, E, G, C (octave higher)
        notes.forEach((freq, index) => {
            setTimeout(() => {
                this.playSound(freq, 0.3, 'sine');
            }, index * 150);
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || 3000}`;
        
        console.log('Connecting to WebSocket at:', wsUrl);
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.updateConnectionStatus('Connected', 'connected');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onclose = () => {
            this.updateConnectionStatus('Disconnected', 'disconnected');
        };
        
        this.ws.onerror = () => {
            this.updateConnectionStatus('Connection Error', 'disconnected');
        };
    }

    updateConnectionStatus(text, className) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = text;
        statusElement.parentElement.className = `connection-status ${className}`;
    }

    handleServerMessage(data) {
        console.log('Received message:', data);
        switch (data.type) {
            case 'playerId':
                this.playerId = data.playerId;
                break;
                
            case 'gameState':
                this.updateGameState(data);
                break;
                
            case 'gameStart':
                this.startGame();
                this.myTurn = data.currentTurn === this.playerId;
                this.gameState = data.gameState;
                break;
                
            case 'shotResult':
                this.handleShotResult(data);
                break;
                
            case 'enemyShot':
                this.handleEnemyShot(data);
                break;
                
            case 'gameOver':
                this.handleGameOver(data);
                break;
                
            case 'playerJoined':
                this.updatePlayersList(data.players);
                // Check if both players have joined
                if (data.players.length === 2) {
                    setTimeout(() => {
                        this.transitionToShipPlacement();
                    }, 1000);
                }
                break;
                
            case 'error':
                this.showError(data.message);
                break;
        }
    }

    initializeEventListeners() {
        document.getElementById('joinGame').addEventListener('click', () => this.joinGame());
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
        
        document.getElementById('rotateShip').addEventListener('click', () => this.rotateShip());
        document.getElementById('readyBtn').addEventListener('click', () => this.setReady());
        document.getElementById('playAgain').addEventListener('click', () => this.resetGame());
        
        document.querySelectorAll('.ship-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectShip(e.target.dataset.ship));
        });
        
        this.initializeBoards();
    }

    joinGame() {
        const nameInput = document.getElementById('playerName');
        const name = nameInput.value.trim();
        
        if (!name) {
            nameInput.classList.add('error');
            return;
        }
        
        this.playerName = name;
        this.ws.send(JSON.stringify({
            type: 'joinGame',
            playerName: name
        }));
        
        document.getElementById('waitingArea').style.display = 'block';
        // Show current player's name immediately
        document.getElementById('player1Name').textContent = name;
    }

    transitionToShipPlacement() {
        // Hide setup, show game area
        document.getElementById('gameSetup').style.display = 'none';
        document.getElementById('gameArea').style.display = 'block';
        // Hide enemy board section until game starts
        document.querySelector('.board-section:last-child').style.display = 'none';
        document.getElementById('currentTurn').textContent = 'Place your ships and wait for opponent...';
    }

    selectShip(shipType) {
        if (this.ships[shipType].placed) return;
        
        document.querySelectorAll('.ship-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        document.querySelector(`[data-ship="${shipType}"]`).classList.add('selected');
        this.selectedShip = shipType;
        this.updatePreview();
    }

    rotateShip() {
        this.shipOrientation = this.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        this.updatePreview();
    }

    initializeBoards() {
        const playerBoardElement = document.getElementById('playerBoard');
        const enemyBoardElement = document.getElementById('enemyBoard');
        
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const playerCell = document.createElement('div');
                playerCell.className = 'cell';
                playerCell.dataset.row = row;
                playerCell.dataset.col = col;
                playerCell.addEventListener('click', (e) => this.handlePlayerBoardClick(e));
                playerCell.addEventListener('mouseover', (e) => this.handlePlayerBoardHover(e));
                playerCell.addEventListener('mouseleave', () => this.updatePreview());
                
                const enemyCell = document.createElement('div');
                enemyCell.className = 'cell';
                enemyCell.dataset.row = row;
                enemyCell.dataset.col = col;
                enemyCell.addEventListener('click', (e) => this.handleEnemyBoardClick(e));
                
                playerBoardElement.appendChild(playerCell);
                enemyBoardElement.appendChild(enemyCell);
            }
        }
    }

    handlePlayerBoardClick(e) {
        if (!this.selectedShip || this.gameState !== 'setup') return;
        
        const row = parseInt(e.target.dataset.row);
        const col = parseInt(e.target.dataset.col);
        
        if (this.canPlaceShip(row, col, this.ships[this.selectedShip].size, this.shipOrientation)) {
            this.placeShip(row, col, this.selectedShip, this.shipOrientation);
        }
    }

    handlePlayerBoardHover(e) {
        if (!this.selectedShip || this.gameState !== 'setup') return;
        
        const row = parseInt(e.target.dataset.row);
        const col = parseInt(e.target.dataset.col);
        this.updatePreview(row, col);
    }

    canPlaceShip(row, col, size, orientation) {
        if (orientation === 'horizontal') {
            if (col + size > 10) return false;
            for (let i = 0; i < size; i++) {
                if (this.playerBoard[row][col + i]) return false;
            }
        } else {
            if (row + size > 10) return false;
            for (let i = 0; i < size; i++) {
                if (this.playerBoard[row + i][col]) return false;
            }
        }
        return true;
    }

    placeShip(row, col, shipType, orientation) {
        const size = this.ships[shipType].size;
        
        if (orientation === 'horizontal') {
            for (let i = 0; i < size; i++) {
                this.playerBoard[row][col + i] = shipType;
            }
        } else {
            for (let i = 0; i < size; i++) {
                this.playerBoard[row + i][col] = shipType;
            }
        }
        
        this.ships[shipType].placed = true;
        document.querySelector(`[data-ship="${shipType}"]`).classList.add('placed');
        document.querySelector(`[data-ship="${shipType}"]`).classList.remove('selected');
        this.selectedShip = null;
        this.updatePlayerBoard();
        this.updateReadyButton();
        
        // Play ship placement sound
        this.sounds.shipPlaced();
    }

    updatePreview(hoverRow = null, hoverCol = null) {
        document.querySelectorAll('#playerBoard .cell').forEach(cell => {
            cell.classList.remove('preview-ship', 'preview-invalid');
        });
        
        if (!this.selectedShip || hoverRow === null || hoverCol === null) return;
        
        const size = this.ships[this.selectedShip].size;
        const isValid = this.canPlaceShip(hoverRow, hoverCol, size, this.shipOrientation);
        
        if (this.shipOrientation === 'horizontal') {
            for (let i = 0; i < size; i++) {
                const cell = document.querySelector(`#playerBoard .cell[data-row="${hoverRow}"][data-col="${hoverCol + i}"]`);
                if (cell) {
                    cell.classList.add(isValid ? 'preview-ship' : 'preview-invalid');
                }
            }
        } else {
            for (let i = 0; i < size; i++) {
                const cell = document.querySelector(`#playerBoard .cell[data-row="${hoverRow + i}"][data-col="${hoverCol}"]`);
                if (cell) {
                    cell.classList.add(isValid ? 'preview-ship' : 'preview-invalid');
                }
            }
        }
    }

    updatePlayerBoard() {
        document.querySelectorAll('#playerBoard .cell').forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const cellValue = this.playerBoard[row][col];
            
            cell.classList.remove('ship', 'hit', 'miss');
            if (cellValue) {
                cell.classList.add('ship');
                cell.textContent = this.getShipSymbol(cellValue);
            }
        });
    }

    getShipSymbol(shipType) {
        const symbols = {
            carrier: 'C',
            battleship: 'B',
            cruiser: 'R',
            submarine: 'S',
            destroyer: 'D'
        };
        return symbols[shipType] || '';
    }

    updateReadyButton() {
        const allShipsPlaced = Object.values(this.ships).every(ship => ship.placed);
        console.log('Ships placed:', Object.entries(this.ships).map(([name, ship]) => `${name}: ${ship.placed}`));
        console.log('All ships placed?', allShipsPlaced);
        document.getElementById('readyBtn').disabled = !allShipsPlaced;
    }

    setReady() {
        console.log('Sending playerReady message');
        console.log('Board being sent:', this.playerBoard);
        
        // Validate board has ships
        const shipCount = this.playerBoard.flat().filter(cell => cell !== null).length;
        console.log(`Board contains ${shipCount} ship cells`);
        
        this.ws.send(JSON.stringify({
            type: 'playerReady',
            board: this.playerBoard
        }));
        
        document.getElementById('readyBtn').disabled = true;
        document.getElementById('readyBtn').textContent = 'Waiting for opponent...';
    }

    startGame() {
        this.gameState = 'playing';
        // Show the enemy board section
        document.querySelector('.board-section:last-child').style.display = 'block';
        document.getElementById('currentTurn').textContent = 'Game starting...';
        
        setTimeout(() => {
            this.updateTurnIndicator();
        }, 1000);
    }

    handleEnemyBoardClick(e) {
        if (!this.myTurn || this.gameState !== 'playing') return;
        
        const row = parseInt(e.target.dataset.row);
        const col = parseInt(e.target.dataset.col);
        
        if (this.enemyBoard[row][col]) return;
        
        this.ws.send(JSON.stringify({
            type: 'shot',
            row: row,
            col: col
        }));
        
        this.myTurn = false;
        this.updateTurnIndicator();
    }

    handleShotResult(data) {
        const { row, col, hit, shipType } = data;
        this.enemyBoard[row][col] = hit ? shipType : 'miss';
        
        const cell = document.querySelector(`#enemyBoard .cell[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add(hit ? 'hit' : 'miss');
        if (hit && shipType) {
            cell.textContent = this.getShipSymbol(shipType);
        }
        
        // Play sound effect
        this.sounds[hit ? 'hit' : 'miss']();
        
        if (hit) {
            this.playerHits++;
            document.getElementById('playerHits').textContent = this.playerHits;
        }
        
        this.myTurn = true;
        this.updateTurnIndicator();
    }

    handleEnemyShot(data) {
        const { row, col, hit } = data;
        const cell = document.querySelector(`#playerBoard .cell[data-row="${row}"][data-col="${col}"]`);
        
        cell.classList.add(hit ? 'hit' : 'miss');
        
        // Play sound effect
        this.sounds[hit ? 'hit' : 'miss']();
        
        if (hit) {
            this.enemyHits++;
            document.getElementById('enemyHits').textContent = this.enemyHits;
        }
        
        this.myTurn = false;
        this.updateTurnIndicator();
    }

    updateTurnIndicator() {
        const turnElement = document.getElementById('currentTurn');
        if (this.myTurn) {
            turnElement.textContent = 'Your turn - Fire!';
            turnElement.className = 'current-turn your-turn';
        } else {
            turnElement.textContent = 'Enemy turn - Wait...';
            turnElement.className = 'current-turn enemy-turn';
        }
    }

    handleGameOver(data) {
        this.gameState = 'gameover';
        const gameOverElement = document.getElementById('gameOver');
        const resultElement = document.getElementById('gameResult');
        const messageElement = document.getElementById('gameMessage');
        
        if (data.winner === this.playerId) {
            gameOverElement.className = 'game-over victory';
            resultElement.textContent = '🎉 Victory!';
            messageElement.textContent = 'You destroyed the enemy fleet!';
            this.sounds.victory();
        } else {
            gameOverElement.className = 'game-over defeat';
            resultElement.textContent = '💥 Defeat';
            messageElement.textContent = 'Your fleet was destroyed...';
            this.sounds.gameOver();
        }
        
        document.getElementById('gameArea').style.display = 'none';
        document.getElementById('gameOver').style.display = 'block';
    }

    updateGameState(data) {
        this.gameState = data.gameState;
        if (data.gameState === 'playing') {
            this.myTurn = data.currentTurn === this.playerId;
        }
    }

    updatePlayersList(players) {
        console.log('Updating players list:', players);
        document.getElementById('player1Name').textContent = players[0] || '-';
        document.getElementById('player2Name').textContent = players[1] || '-';
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #e74c3c;
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 1000;
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }

    resetGame() {
        this.playerBoard = Array(10).fill(null).map(() => Array(10).fill(null));
        this.enemyBoard = Array(10).fill(null).map(() => Array(10).fill(null));
        
        Object.keys(this.ships).forEach(ship => {
            this.ships[ship].placed = false;
        });
        
        document.querySelectorAll('.ship-btn').forEach(btn => {
            btn.classList.remove('placed', 'selected');
        });
        
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('ship', 'hit', 'miss', 'preview-ship', 'preview-invalid');
            cell.textContent = '';
        });
        
        this.playerHits = 0;
        this.enemyHits = 0;
        document.getElementById('playerHits').textContent = '0';
        document.getElementById('enemyHits').textContent = '0';
        
        this.selectedShip = null;
        this.shipOrientation = 'horizontal';
        
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('gameArea').style.display = 'block';
        document.getElementById('readyBtn').disabled = true;
        document.getElementById('readyBtn').textContent = 'Ready';
        
        this.ws.send(JSON.stringify({
            type: 'resetGame'
        }));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BattleshipGame();
});