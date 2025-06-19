# Dust Game Bot

Autonomous bot for the Dust game built on the MUD (Autonomous Worlds) framework. This bot can automatically perform various in-game actions like movement, farming, building, mining, and crafting.

## Architecture

The bot uses a modular architecture with specialized systems for different game functions:

### Core Systems

- **MoveSystem** - `move`, `moveDirections`
- **ActivateSystem** - `activate`, `activatePlayer`  
- **BucketSystem** - `fillBucket`, `wetFarmland`
- **BuildSystem** - `build`, `buildWithOrientation`, `jumpBuild`, `jumpBuildWithOrientation`
- **MineSystem** - `mine`, `mineUntilDestroyed`, `getRandomOreType`
- **FarmingSystem** - `till`
- **CraftSystem** - `craft`, `craftWithStation`
- **SpawnSystem** - `spawn`, `randomSpawn`

### Project Structure

```
src/
├── core/
│   └── base.ts           # Base class with shared functionality
├── modules/
│   ├── movement.ts       # Movement and activation
│   ├── farming.ts        # Farming, bucket operations, and tilling
│   ├── building.ts       # Building and mining operations
│   └── crafting.ts       # Item crafting and recipes
├── index.ts              # Main DustBot orchestrator
├── types.ts              # TypeScript type definitions
└── utils.ts              # Helper functions

scripts/
├── simple-move.ts        # Basic movement demo
├── farming-demo.ts       # Farming automation demo
├── building-demo.ts      # Building automation demo
├── crafting-demo.ts      # Crafting demonstration
└── find-system-ids.ts    # Helper to find actual System IDs
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy the environment template:
```bash
cp env.template .env
```

3. Fill in your environment variables in `.env`:
```bash
PRIVATE_KEY=your_wallet_private_key
RPC_URL=https://redstone.xyz/rpc
WORLD_ADDRESS=0x253eb85B3C953bFE3827CC14a151262482E7189C
CHARACTER_ENTITY_ID=your_character_entity_id
```

## Usage

### Basic Bot Usage

```typescript
import { DustBot } from './src/index.js';

const bot = new DustBot();

// Spawn character (if not already spawned)
await bot.movement.spawn();

// Activate character
await bot.movement.activate();

// Move to coordinates
await bot.movement.moveToCoordinate({ x: 10, y: 64, z: 10 });

// Farm workflow
const waterSource = { x: 0, y: 64, z: 0 };
const farmCoords = [
  { x: 5, y: 64, z: 5 },
  { x: 6, y: 64, z: 5 }
];
await bot.farming.setupMultipleFarms(waterSource, farmCoords);

// Build a simple house
await bot.building.buildSimpleHouse({ x: 20, y: 64, z: 20 }, 5, 5, 3);

// Craft tools
await bot.crafting.createToolkit('wood');
```

### Run Demo Scripts

```bash
# Character spawning (optimized for low-funded wallets)
npm run spawn         # Full spawn demo with wallet info
npm run quick-spawn   # Minimal spawn script

# Movement demonstration
npm run demo:move

# Farming automation
npm run demo:farming

# Building automation  
npm run demo:building

# Crafting demonstration
npm run demo:crafting

# Find system IDs helper
npm run find-systems
```

## Gas Optimization

The bot is optimized for low-funded wallets on Redstone chain:

### Optimized Gas Settings
- **Gas Limit**: 200,000 (vs 35,000,000 default)
- **Max Fee Per Gas**: 0.000002 gwei (very low for Redstone)
- **Priority Fee**: 0.0000001 gwei (minimal)

### Usage
All spawn and system calls use optimized gas by default. To use standard gas estimation:

```typescript
// Use optimized gas (default)
await bot.movement.spawn(); 

// Use gas estimation (higher cost)
await bot.movement.executeSystemCall(systemId, functionSig, params, description, false);
```

### Troubleshooting Low Balance
If you get "insufficient funds" errors:
1. Check your balance: the scripts will warn if < 0.001 ETH
2. Add more ETH to your wallet  
3. Try the quick-spawn script: `npm run quick-spawn`
4. Check current Redstone gas prices: https://explorer.redstone.xyz

## System IDs

⚠️ **Important**: The System IDs in `src/core/base.ts` are estimated based on common MUD patterns. You may need to find the actual System IDs from the Dust game deployment.

Use the helper script to find real System IDs:
```bash
npm run find-systems
```

## Module Features

### Movement Module (`src/modules/movement.ts`)
- Character activation (`activate`, `activatePlayer`)
- Character spawning (`spawn`, `randomSpawn`) - optimized for low gas
- Single coordinate movement (`moveToCoordinate`)
- Path-based movement (`moveAlongPath`)
- Direction-based movement (`moveDirections`)
- Path generation utilities (square, line, directions)

### Farming Module (`src/modules/farming.ts`)
- Bucket operations (`fillBucket`, `wetFarmland`)
- Farmland tilling (`till`)
- Complete farming cycles (till → fill → water → plant)
- Multi-plot farming automation
- Farm grid generation

### Building Module (`src/modules/building.ts`)
- Mining operations (`mine`, `mineUntilDestroyed`, `getRandomOreType`)
- Building placement (`build`, `buildWithOrientation`)
- Jump building (`jumpBuild`, `jumpBuildWithOrientation`)
- Area operations (clear, fill)
- Structure building (walls, houses)

### Crafting Module (`src/modules/crafting.ts`)
- Item crafting (`craft`, `craftWithStation`)
- Tool creation (`craftTool`)
- Block crafting (`craftBlocks`)
- Mass crafting workflows
- Building material preparation

## Game Integration

This bot integrates with the Dust game on Redstone chain:
- **Network**: Redstone (https://redstone.xyz/rpc)
- **World Contract**: `0x253eb85B3C953bFE3827CC14a151262482E7189C`
- **Framework**: MUD (Autonomous Worlds)

## Development

### Build
```bash
npm run build
```

### Type Checking
```bash
npm run type-check
```

### Run Development Scripts
```bash
npm run dev:move
npm run dev:farming
npm run dev:building
npm run dev:crafting
```

## Notes

- All coordinates use Vec3 format: `{ x: number, y: number, z: number }`
- The bot includes safety delays between operations to avoid overwhelming the network
- Game state reading functions are placeholders - actual implementation requires MUD table reading
- System IDs need to be verified against the actual game deployment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add appropriate tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 