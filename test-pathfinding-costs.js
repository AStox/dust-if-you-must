// Quick test to verify pathfinding cost calculations
console.log("Testing pathfinding cost calculations...");

// Test vertical movement penalty
function calculateDistance(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  
  // Base Euclidean distance
  const baseDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // Apply heavy penalty for vertical movement (especially upward)
  let verticalPenalty = 0;
  if (dy > 0) {
    // Upward movement (jumping) - very expensive
    verticalPenalty = dy * 5.0; // 5x penalty for each block climbed
  } else if (dy < 0) {
    // Downward movement (falling) - moderate penalty
    verticalPenalty = Math.abs(dy) * 0.5; // 0.5x penalty for falling
  }
  
  return baseDistance + verticalPenalty;
}

// Test cases
const start = { x: 0, y: 70, z: 0 };
const horizontalMove = { x: 1, y: 70, z: 0 }; // 1 block horizontally
const jumpMove = { x: 1, y: 71, z: 0 }; // 1 block horizontally + 1 up
const treeCanopyMove = { x: 1, y: 75, z: 0 }; // High altitude move

console.log("Horizontal move cost:", calculateDistance(start, horizontalMove).toFixed(2));
console.log("Jump move cost:", calculateDistance(start, jumpMove).toFixed(2));
console.log("Tree canopy move cost:", calculateDistance(start, treeCanopyMove).toFixed(2));

// Test jump penalty calculation
function calculateJumpPenalty(jumpCount) {
  return Math.pow(jumpCount + 1, 2) * 2.0;
}

console.log("\nJump penalties:");
for (let i = 0; i < 5; i++) {
  console.log(`${i} jumps penalty: ${calculateJumpPenalty(i).toFixed(2)}`);
}

console.log("\n✅ Cost calculation test completed!");
