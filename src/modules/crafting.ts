import { DustGameBase } from "../core/base.js";
import { SlotAmount } from "../types.js";
import { Vec3, ObjectType } from "../types.js";
import { packVec3, isValidCoordinate } from "../utils.js";

export interface Recipe {
  id: string;
  name: string;
  inputs: SlotAmount[];
  description?: string;
}

export class CraftingModule extends DustGameBase {
  // Predefined common recipes (these may need to be updated based on actual game recipes)
  private commonRecipes: Record<string, Recipe> = {
    WOODEN_PICKAXE: {
      id: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      name: "Wooden Pickaxe",
      inputs: [
        { slot: 0, amount: 3 }, // wood planks
        { slot: 1, amount: 2 }, // sticks
      ],
      description: "Basic mining tool",
    },
    WOODEN_SHOVEL: {
      id: "0x2345678901abcdef2345678901abcdef2345678901abcdef2345678901abcdef",
      name: "Wooden Shovel",
      inputs: [
        { slot: 0, amount: 1 }, // wood planks
        { slot: 1, amount: 2 }, // sticks
      ],
      description: "Basic digging tool",
    },
    BUCKET: {
      id: "0x3456789012abcdef3456789012abcdef3456789012abcdef3456789012abcdef",
      name: "Bucket",
      inputs: [
        { slot: 0, amount: 3 }, // iron ingots
      ],
      description: "For carrying water",
    },
  };

  // Craft an item using inventory materials (CraftSystem)
  async craft(
    recipeId: number,
    quantity: number = 1,
    inputSlots: number[] = [],
    outputSlot: number = 0
  ): Promise<void> {
    console.log(
      `🔨 Crafting recipe ${recipeId} x${quantity} with inputs from slots [${inputSlots.join(
        ","
      )}] to slot ${outputSlot}`
    );

    // Encode input slots as bytes if needed
    const encodedInputs =
      inputSlots.length > 0
        ? "0x" +
          inputSlots.map((slot) => slot.toString(16).padStart(2, "0")).join("")
        : "0x";

    await this.executeSystemCall(
      this.SYSTEM_IDS.CRAFT_SYSTEM,
      "craft(bytes32,uint16,uint16,uint16[],uint16,bytes)",
      [
        this.characterEntityId,
        recipeId,
        quantity,
        inputSlots,
        outputSlot,
        encodedInputs, // extra data for recipe details
      ],
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

  // Mass craft multiple items in sequence
  async craftMultipleItems(
    recipes: Array<{
      recipeId: number;
      quantity: number;
      inputSlots: number[];
      outputSlot: number;
      stationCoord?: Vec3;
    }>
  ): Promise<void> {
    console.log(`🔨 Mass crafting ${recipes.length} different items...`);

    for (const [index, recipe] of recipes.entries()) {
      console.log(
        `🔨 Crafting item ${index + 1}/${recipes.length}: Recipe ${
          recipe.recipeId
        } x${recipe.quantity}`
      );

      if (recipe.stationCoord) {
        await this.craftWithStation(
          recipe.stationCoord,
          recipe.recipeId,
          recipe.quantity,
          recipe.inputSlots,
          recipe.outputSlot
        );
      } else {
        await this.craft(
          recipe.recipeId,
          recipe.quantity,
          recipe.inputSlots,
          recipe.outputSlot
        );
      }

      // Small delay between crafting operations
      if (index < recipes.length - 1) {
        console.log("⏳ Waiting 2 seconds before next craft...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log("✅ All items crafted!");
  }

  // Craft tools (example recipes - would need actual recipe IDs)
  async craftTool(
    toolType: "pickaxe" | "axe" | "hoe" | "sword",
    material: "wood" | "stone" | "iron" = "wood"
  ): Promise<void> {
    console.log(`🔨 Crafting ${material} ${toolType}...`);

    // These are placeholder recipe IDs - would need actual game recipe IDs
    const recipeMap = {
      wood_pickaxe: 101,
      wood_axe: 102,
      wood_hoe: 103,
      wood_sword: 104,
      stone_pickaxe: 201,
      stone_axe: 202,
      stone_hoe: 203,
      stone_sword: 204,
      iron_pickaxe: 301,
      iron_axe: 302,
      iron_hoe: 303,
      iron_sword: 304,
    };

    const recipeKey = `${material}_${toolType}` as keyof typeof recipeMap;
    const recipeId = recipeMap[recipeKey];

    if (!recipeId) {
      throw new Error(`Unknown recipe: ${material} ${toolType}`);
    }

    // Default input slots for basic tools (would need actual slot mappings)
    const inputSlots = material === "wood" ? [0, 1] : [0, 1, 2]; // Handle, material, possibly binding

    await this.craft(recipeId, 1, inputSlots, 0);
  }

  // Craft building blocks (example recipes)
  async craftBlocks(
    blockType: ObjectType,
    quantity: number = 64,
    inputSlots: number[] = [0]
  ): Promise<void> {
    console.log(`🧱 Crafting ${quantity} ${ObjectType[blockType]} blocks...`);

    // Placeholder recipe IDs for blocks
    const blockRecipeMap: Record<ObjectType, number> = {
      [ObjectType.EMPTY]: 0,
      [ObjectType.DIRT]: 1,
      [ObjectType.WATER]: 2,
      [ObjectType.GRASS]: 3,
      [ObjectType.STONE]: 4,
      [ObjectType.WOOD]: 5,
      [ObjectType.SAND]: 6,
    };

    const recipeId = blockRecipeMap[blockType];
    if (!recipeId || recipeId === 0) {
      throw new Error(`No crafting recipe for ${ObjectType[blockType]}`);
    }

    await this.craft(recipeId, quantity, inputSlots, 0);
  }

  // Auto-craft based on available materials (would need inventory reading)
  async autoCraftTools(): Promise<void> {
    console.log("🤖 Auto-crafting tools based on available materials...");
    console.log(
      "🔍 Material checking not implemented yet - need to read from inventory tables"
    );

    // Placeholder logic - would need to read actual inventory
    const availableMaterials = ["wood"]; // This would come from inventory reading

    for (const material of availableMaterials) {
      try {
        await this.craftTool("pickaxe", material as "wood" | "stone" | "iron");
        await this.craftTool("axe", material as "wood" | "stone" | "iron");
        console.log(`✅ Crafted ${material} tools`);
      } catch (error) {
        console.log(`⚠️ Failed to craft ${material} tools: ${error}`);
      }
    }
  }

  // Setup crafting station and craft items
  async setupCraftingWorkflow(
    stationCoord: Vec3,
    recipes: Array<{
      recipeId: number;
      quantity: number;
      inputSlots: number[];
    }>
  ): Promise<void> {
    console.log(
      `🏭 Setting up crafting workflow at station (${stationCoord.x}, ${stationCoord.y}, ${stationCoord.z})`
    );

    for (const [index, recipe] of recipes.entries()) {
      console.log(`🔨 Crafting workflow step ${index + 1}/${recipes.length}`);

      await this.craftWithStation(
        stationCoord,
        recipe.recipeId,
        recipe.quantity,
        recipe.inputSlots,
        index // Use index as output slot for organization
      );

      // Delay between crafting steps
      if (index < recipes.length - 1) {
        console.log("⏳ Waiting 3 seconds before next workflow step...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    console.log("✅ Crafting workflow completed!");
  }

  // Create a full toolkit (multiple tools)
  async createToolkit(
    material: "wood" | "stone" | "iron" = "wood"
  ): Promise<void> {
    console.log(`🛠️ Creating complete ${material} toolkit...`);

    const tools = ["pickaxe", "axe", "hoe", "sword"] as const;

    for (const [index, tool] of tools.entries()) {
      console.log(
        `🔨 Creating ${material} ${tool} (${index + 1}/${tools.length})`
      );

      await this.craftTool(tool, material);

      if (index < tools.length - 1) {
        console.log("⏳ Waiting 2 seconds before next tool...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(`✅ Complete ${material} toolkit created!`);
  }

  // Bulk craft building materials for construction
  async craftBuildingMaterials(): Promise<void> {
    console.log("🏗️ Crafting building materials...");

    const materials = [
      { type: ObjectType.WOOD, quantity: 64 },
      { type: ObjectType.STONE, quantity: 64 },
      { type: ObjectType.DIRT, quantity: 128 },
    ];

    for (const material of materials) {
      console.log(
        `🧱 Crafting ${material.quantity} ${ObjectType[material.type]} blocks`
      );

      try {
        await this.craftBlocks(material.type, material.quantity);
        console.log(
          `✅ Crafted ${material.quantity} ${ObjectType[material.type]} blocks`
        );
      } catch (error) {
        console.log(
          `⚠️ Failed to craft ${ObjectType[material.type]}: ${error}`
        );
      }

      // Small delay between different materials
      console.log("⏳ Waiting 2 seconds before next material...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("✅ All building materials crafted!");
  }

  // Check if recipe is available (would need actual game state reading)
  async isRecipeAvailable(recipeId: number): Promise<boolean> {
    console.log(
      "🔍 Recipe availability checking not implemented yet - need to read from game tables"
    );
    console.log(`🎯 Checking recipe: ${recipeId}`);
    return true; // Placeholder - assume available
  }

  // Check crafting station type (would need actual game state reading)
  async getStationType(coord: Vec3): Promise<string | null> {
    console.log(
      "🔍 Station type checking not implemented yet - need to read from game tables"
    );
    console.log(`🎯 Checking station at: (${coord.x}, ${coord.y}, ${coord.z})`);
    return null; // Placeholder
  }

  // Get current inventory (would need actual game state reading)
  async getCurrentInventory(): Promise<any[]> {
    console.log(
      "🔍 Inventory reading not implemented yet - need to read from inventory tables"
    );
    return []; // Placeholder
  }

  // Get available recipes
  getAvailableRecipes(): Record<string, Recipe> {
    return { ...this.commonRecipes };
  }

  // Add a custom recipe
  addRecipe(key: string, recipe: Recipe): void {
    this.commonRecipes[key] = recipe;
    console.log(`📝 Added recipe: ${recipe.name} (${key})`);
  }

  // Remove a recipe
  removeRecipe(key: string): void {
    if (this.commonRecipes[key]) {
      const recipeName = this.commonRecipes[key].name;
      delete this.commonRecipes[key];
      console.log(`🗑️ Removed recipe: ${recipeName} (${key})`);
    }
  }

  // Display all available recipes
  listRecipes(): void {
    console.log("📋 Available Recipes:");
    console.log("==================");

    Object.entries(this.commonRecipes).forEach(([key, recipe]) => {
      console.log(`🔨 ${recipe.name} (${key})`);
      console.log(`   Recipe ID: ${recipe.id}`);
      console.log(
        `   Inputs: ${recipe.inputs
          .map((i) => `slot ${i.slot}(${i.amount})`)
          .join(", ")}`
      );
      if (recipe.description) {
        console.log(`   Description: ${recipe.description}`);
      }
      console.log("");
    });
  }

  // Validate recipe inputs (check if player has required materials)
  // Note: This would need to be implemented with actual game state reading
  async validateRecipeInputs(inputs: SlotAmount[]): Promise<boolean> {
    // Placeholder - in a real implementation, this would check the player's inventory
    console.log("🔍 Validating recipe inputs...");
    console.log(
      "⚠️ Note: Input validation not implemented - assuming materials are available"
    );
    return true;
  }

  // Get inventory state (would need actual game state reading)
  async getInventory(): Promise<any> {
    console.log(
      "🔍 Inventory reading not implemented yet - need to read from inventory tables"
    );
    return {}; // Placeholder
  }

  // Check if player has required materials for a recipe
  async canCraftRecipe(
    recipeName: keyof typeof this.commonRecipes
  ): Promise<boolean> {
    const recipe = this.commonRecipes[recipeName];
    if (!recipe) {
      return false;
    }

    console.log(`🔍 Checking if can craft ${recipe.name}...`);
    console.log(
      "⚠️ Note: Material checking not implemented - assuming available"
    );
    return true; // Placeholder
  }
}
