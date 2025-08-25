import { ethers } from "ethers";
import { Vec3, EntityId } from "./types";

// Encode EntityId (bytes32)
export function encodeEntityId(entityId: EntityId): string {
  // Ensure it's a valid bytes32
  if (!entityId.startsWith("0x")) {
    entityId = "0x" + entityId;
  }
  return ethers.zeroPadValue(entityId, 32);
}

export function packVec3(coord: Vec3): bigint {
  // Convert each signed 32-bit integer into an unsigned 32-bit number,
  // then to BigInt for safe 64-bit+ operations.
  const ux = BigInt(coord.x >>> 0);
  const uy = BigInt(coord.y >>> 0);
  const uz = BigInt(coord.z >>> 0);

  // Pack the three numbers into a single 96-bit integer:
  // Shift ux left by 64 bits, uy left by 32 bits, and then OR them together.
  return (ux << 64n) | (uy << 32n) | uz;
}

// Decode Vec3 from uint96
export function decodeVec3(encoded: bigint): Vec3 {
  const x = Number(encoded & 0xffffffffn);
  const y = Number((encoded >> 32n) & 0xffffffffn);
  const z = Number((encoded >> 64n) & 0xffffffffn);

  return { x, y, z };
}

// Encode array of Vec3 coordinates
export function encodeVec3Array(coords: Vec3[]): string {
  const encoded = coords.map((coord) => packVec3(coord));
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint96[]"], [encoded]);
}

// Create function call data for move function
export function encodeMoveCall(caller: EntityId, newCoords: Vec3[]): string {
  const callerEncoded = encodeEntityId(caller);
  const coordsEncoded = encodeVec3Array(newCoords);

  // Function signature: move(bytes32,uint96[])
  const functionSelector = ethers.id("move(bytes32,uint96[])").slice(0, 10);
  const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint96[]"],
    [callerEncoded, newCoords.map((coord) => packVec3(coord))]
  );

  return functionSelector + encodedParams.slice(2);
}

// Create function call data for any function
export function encodeCall(functionSig: string, params: any[]): string {
  const functionSelector = ethers.id(functionSig).slice(0, 10);
  const types = functionSig
    .split("(")[1]
    .split(")")[0]
    .split(",")
    .filter((t) => t.length > 0);

  let encodedParams = "0x";
  if (types.length > 0 && params.length > 0) {
    encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(types, params);
  }

  return (
    functionSelector + (encodedParams === "0x" ? "" : encodedParams.slice(2))
  );
}

// Validate coordinates
export function isValidCoordinate(coord: Vec3): boolean {
  return (
    Number.isInteger(coord.x) &&
    coord.x >= -2147483648 &&
    coord.x <= 2147483647 &&
    Number.isInteger(coord.y) &&
    coord.y >= -2147483648 &&
    coord.y <= 2147483647 &&
    Number.isInteger(coord.z) &&
    coord.z >= -2147483648 &&
    coord.z <= 2147483647
  );
}

// Calculate distance between two coordinates
export function distance(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getItemCount(itemId: number, inventory: { type: number; amount: number }[]): number {
  return inventory.filter((item) => item.type === itemId).reduce((acc, item) => acc + item.amount, 0);
}
