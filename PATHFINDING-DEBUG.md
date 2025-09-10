# A* Pathfinding Visualizer

A visual debugging tool for the A* pathfinding algorithm in DUST. This helps you understand how the algorithm explores the search space, makes decisions, and finds paths.

## Features

- **Step-by-step visualization** of the A* algorithm
- **2D layer-based view** of the 3D world
- **Color-coded nodes** showing algorithm state
- **Cost information** display (F, G, H costs)
- **Interactive playback** with play/pause/step controls
- **Multiple Y-layer views** for 3D pathfinding
- **Real-time iteration tracking**

## Quick Start

### 1. Enable Debug Mode

In your pathfinding code, enable debug mode:

```typescript
import { PathfindingModule } from './src/modules/pathfinding.js';

const pathfinding = new PathfindingModule();

// Enable debug data collection
pathfinding.enableDebug();

// Run your pathfinding
const path = await pathfinding.pathfindTo(targetX, targetY, targetZ);

// Export debug data for visualization
await pathfinding.exportDebugData("my-pathfinding-debug.json");
```

### 2. Generate Debug Data

Run your pathfinding code to generate a JSON file with debug data.

### 3. Visualize

1. Open `pathfinding-visualizer.html` in your web browser
2. Click "Choose File" and select your JSON debug file
3. Use the controls to step through the algorithm

## Visualization Legend

| Color | Meaning |
|-------|---------|
| 🟢 Green | Start position |
| 🔴 Red | End position |
| 🟡 Yellow | Current node being processed |
| 🔵 Light Blue | Open set (nodes to be evaluated) |
| 🟥 Light Red | Closed set (already evaluated) |
| 🟠 Orange | Neighbors of current node |
| 🟣 Purple | Final path (if found) |

## Controls

- **Play/Pause**: Auto-advance through iterations
- **Step Forward/Back**: Manual step-by-step control
- **Iteration Slider**: Jump to any iteration
- **Layer Select**: View different Y levels
- **Show Costs**: Display F-costs on nodes
- **Grid Size**: Adjust visualization cell size

## Understanding the Algorithm

### What to Look For

1. **Search Direction**: Watch how the algorithm expands from start toward the target
2. **Heuristic Influence**: Higher heuristic weights make the search more direct
3. **Cost Calculations**: F-cost = G-cost (distance from start) + H-cost (heuristic to goal)
4. **Backtracking**: When the algorithm finds a better path to a node
5. **Obstacles**: How the algorithm navigates around blocked areas

### Debugging Tips

1. **Check Early Iterations**: See if the algorithm starts in the right direction
2. **Look for Bottlenecks**: Areas where the search gets stuck or slows down
3. **Verify Cost Calculations**: Make sure costs make sense for the terrain
4. **Watch Search Cone**: See how directional filtering affects exploration
5. **Final Path Quality**: Compare the found path to what you'd expect

## Debug Data Structure

The exported JSON contains:

```typescript
interface DebugData {
  start: Vec3;              // Starting position
  end: Vec3;                // Target position
  steps: DebugStep[];       // Algorithm steps
  finalPath: Vec3[] | null; // Found path (if any)
  success: boolean;         // Whether path was found
  iterations: number;       // Total iterations
  bounds: {                 // World bounds explored
    minX, maxX, minY, maxY, minZ, maxZ: number;
  };
}

interface DebugStep {
  iteration: number;        // Step number
  currentNode: Vec3;        // Node being processed
  openSet: Vec3[];         // Nodes to evaluate
  closedSet: Vec3[];       // Evaluated nodes
  neighbors: Vec3[];       // Current neighbors
  fCosts: {[key: string]: number}; // F-cost values
  gCosts: {[key: string]: number}; // G-cost values
  hCosts: {[key: string]: number}; // H-cost values
}
```

## Performance Notes

- Debug mode collects data every 10 iterations to avoid excessive memory usage
- Large search areas will create large JSON files
- The visualizer works best with searches under 1000 iterations

## Troubleshooting

### No Data Shows Up
- Check that debug mode was enabled before running pathfinding
- Verify the JSON file was created and is valid
- Make sure the pathfinding ran for at least one iteration

### Visualization is Too Small/Large
- Use the Grid Size control to adjust cell size
- Try different browser zoom levels
- Check that the bounds in your data are reasonable

### Missing Nodes
- Some nodes might be on different Y layers - check the Layer Select dropdown
- Very short paths might only have a few recorded steps

## Example Usage

See `example-debug-pathfinding.ts` for a complete example of how to set up debugging in your code.
