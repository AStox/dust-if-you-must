import { DustGameBase } from "../core/base.js";
import { SlotAmount, Vec3, ObjectTypes } from "../types";
import { packVec3, isValidCoordinate } from "../utils.js";

export interface Recipe {
  id: string;
  name: string;
  inputs: SlotAmount[];
  description?: string;
}

export class CraftingModule extends DustGameBase {
  // Predefined common recipes (these may need to be updated based on actual game recipes)
  public recipes: Record<string, Recipe> = {
    WheatSlop: {
      id: "0xf05253d91fb7242ec0a2d42363ab669ae8aa483b2e7c683cf175dce5f7f4242e",
      name: "Wheat Slop",
      inputs: [{ slot: 92, amount: 16 }],
    },
  };

  // Craft an item using inventory materials (CraftSystem)
  async craft(recipeId: string, inputs: [number, number][]): Promise<void> {
    console.log(
      `🔨 Crafting recipe ${recipeId} with inputs from slots [${inputs
        .map(([slot, amount]) => `${slot}(${amount})`)
        .join(", ")}]`
    );
    console.log(this.characterEntityId, recipeId, inputs);
    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.CRAFT_SYSTEM,
      "craft(bytes32,bytes32,(uint16,uint16)[])",
      [this.characterEntityId, recipeId, inputs],
      "Crafting item"
    );
  }

  // Craft an item using a crafting station (CraftSystem)
  async craftWithStation(
    stationCoord: Vec3,
    recipeId: number,
    quantity: number = 1,
    inputSlots: number[] = [],
    outputSlot: number = 0
  ): Promise<void> {
    if (!isValidCoordinate(stationCoord)) {
      throw new Error(
        `Invalid station coordinate: ${JSON.stringify(stationCoord)}`
      );
    }

    console.log(
      `🏭 Crafting recipe ${recipeId} x${quantity} at station (${stationCoord.x}, ${stationCoord.y}, ${stationCoord.z})`
    );

    // Encode input slots as bytes if needed
    const encodedInputs =
      inputSlots.length > 0
        ? "0x" +
          inputSlots.map((slot) => slot.toString(16).padStart(2, "0")).join("")
        : "0x";

    await this.executeSystemCall(
      this.SYSTEM_IDS.CRAFT_SYSTEM,
      "craftWithStation(bytes32,uint96,uint16,uint16,uint16[],uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(stationCoord),
        recipeId,
        quantity,
        inputSlots,
        outputSlot,
        encodedInputs, // extra data for recipe details
      ],
      "Crafting with station"
    );
  }
}
