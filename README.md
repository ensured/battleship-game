# Battleship Multiplayer Game

A polished, real-time multiplayer Battleship game built with WebSockets, HTML5, and Node.js.

## Features

🚀 **Real-time Multiplayer**: Battle against friends in real-time using WebSocket connections  
🎮 **Intuitive Gameplay**: Simple drag-and-drop ship placement with visual feedback  
🎨 **Modern UI**: Responsive design with smooth animations and transitions  
⚡ **Live Updates**: Instant shot results and turn-based gameplay  
🏆 **Score Tracking**: Track hits and see victory/defeat screens  

## Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```
   For development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Open Browser**:
   Navigate to `http://localhost:3000`

4. **Play Multiplayer**:
   - Open two browser tabs/windows for two players
   - Each player enters their name and joins
   - Place your ships strategically
   - Take turns firing at enemy positions
   - First to sink all enemy ships wins!

## How to Play

### Ship Placement
- **Carrier**: 5 cells
- **Battleship**: 4 cells  
- **Cruiser**: 3 cells
- **Submarine**: 3 cells
- **Destroyer**: 2 cells

Click a ship type, then click on your board to place. Use the Rotate button to change orientation.

### Combat
- Players take turns firing shots
- Click on enemy waters to attack
- Red cells = Hit, Gray cells = Miss
- Destroy all enemy ships to win!

## Project Structure

```
battleship-game/
├── index.html      # Game interface
├── style.css       # Responsive styling
├── game.js         # Client-side game logic
├── server.js       # WebSocket server
├── package.json    # Dependencies & scripts
└── README.md      # This file
```

## Technologies Used

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Real-time Communication**: WebSocket (ws library)
- **Styling**: CSS Grid, Flexbox, CSS animations

## Game Features

### Multiplayer Architecture
- Automatic room matching
- Player state management
- Turn-based gameplay enforcement
- Real-time shot synchronization
- Graceful disconnection handling

### UI/UX Polish
- Ship placement preview
- Hover effects and transitions
- Connection status indicators
- Responsive design for mobile/desktop
- Victory/defeat animations
- Score tracking display

## Development

The server supports multiple concurrent games and handles:
- Player matchmaking
- Game state synchronization
- Shot validation
- Victory detection
- Room cleanup

Health check endpoint: `GET /health`

## License

MIT License