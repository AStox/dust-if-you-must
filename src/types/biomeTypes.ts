export type BiomeType = {
  name: string;
  multipliers: {
    coal: number;
    copper: number;
    iron: number;
    gold: number;
    diamond: number;
    neptunium: number;
  };
};

export const BiomeTypes: Record<number, BiomeType> = {
  0: {
    name: "Badlands",
    multipliers: {
      coal: 158630,
      copper: 40481,
      iron: 38193,
      gold: 64501,
      diamond: 0,
      neptunium: 10,
    },
  },
  1: {
    name: "Bamboo Jungle",
    multipliers: {
      coal: 57471,
      copper: 31767,
      iron: 4289,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  3: {
    name: "Beach",
    multipliers: {
      coal: 27683,
      copper: 21550,
      iron: 10145,
      gold: 399,
      diamond: 47,
      neptunium: 1,
    },
  },
  4: {
    name: "Birch Forest",
    multipliers: {
      coal: 10803,
      copper: 7176,
      iron: 1527,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  6: {
    name: "Cold Ocean",
    multipliers: {
      coal: 14560,
      copper: 16742,
      iron: 15917,
      gold: 3239,
      diamond: 1175,
      neptunium: 1,
    },
  },
  8: {
    name: "Dark Forest",
    multipliers: {
      coal: 53449,
      copper: 28113,
      iron: 5193,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  9: {
    name: "Deep Cold Ocean",
    multipliers: {
      coal: 1899,
      copper: 14055,
      iron: 56715,
      gold: 39434,
      diamond: 23289,
      neptunium: 0,
    },
  },
  10: {
    name: "Deep Dark",
    multipliers: {
      coal: 283659,
      copper: 326206,
      iron: 372641,
      gold: 128409,
      diamond: 75506,
      neptunium: 0,
    },
  },
  11: {
    name: "Deep Frozen Ocean",
    multipliers: {
      coal: 124,
      copper: 1076,
      iron: 3544,
      gold: 3066,
      diamond: 3200,
      neptunium: 0,
    },
  },
  12: {
    name: "Deep Lukewarm Ocean",
    multipliers: {
      coal: 81,
      copper: 653,
      iron: 1702,
      gold: 1671,
      diamond: 880,
      neptunium: 0,
    },
  },
  13: {
    name: "Deep Ocean",
    multipliers: {
      coal: 877,
      copper: 7499,
      iron: 22198,
      gold: 12122,
      diamond: 5262,
      neptunium: 0,
    },
  },
  14: {
    name: "Desert",
    multipliers: {
      coal: 24979,
      copper: 11337,
      iron: 5129,
      gold: 267,
      diamond: 36,
      neptunium: 0,
    },
  },
  15: {
    name: "Dripstone Caves",
    multipliers: {
      coal: 1944385,
      copper: 2575960,
      iron: 615503,
      gold: 69362,
      diamond: 39301,
      neptunium: 268,
    },
  },
  19: {
    name: "Eroded Badlands",
    multipliers: {
      coal: 145324,
      copper: 13519,
      iron: 33882,
      gold: 54786,
      diamond: 16,
      neptunium: 3,
    },
  },
  20: {
    name: "Flower Forest",
    multipliers: {
      coal: 8624,
      copper: 5506,
      iron: 1095,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  21: {
    name: "Forest",
    multipliers: {
      coal: 83114,
      copper: 32743,
      iron: 15175,
      gold: 126,
      diamond: 7,
      neptunium: 4,
    },
  },
  22: {
    name: "Frozen Ocean",
    multipliers: {
      coal: 4771,
      copper: 6153,
      iron: 7345,
      gold: 1963,
      diamond: 1296,
      neptunium: 0,
    },
  },
  23: {
    name: "Frozen Peaks",
    multipliers: {
      coal: 6038,
      copper: 0,
      iron: 3155,
      gold: 0,
      diamond: 0,
      neptunium: 181,
    },
  },
  24: {
    name: "Frozen River",
    multipliers: {
      coal: 11816,
      copper: 11806,
      iron: 6657,
      gold: 216,
      diamond: 32,
      neptunium: 0,
    },
  },
  26: {
    name: "Ice Spikes",
    multipliers: {
      coal: 6,
      copper: 54,
      iron: 8,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  27: {
    name: "Jagged Peaks",
    multipliers: {
      coal: 29774,
      copper: 0,
      iron: 17387,
      gold: 0,
      diamond: 0,
      neptunium: 997,
    },
  },
  28: {
    name: "Jungle",
    multipliers: {
      coal: 171088,
      copper: 35114,
      iron: 37347,
      gold: 55,
      diamond: 0,
      neptunium: 12,
    },
  },
  29: {
    name: "Lukewarm Ocean",
    multipliers: {
      coal: 42689,
      copper: 51221,
      iron: 52918,
      gold: 10300,
      diamond: 2874,
      neptunium: 0,
    },
  },
  30: {
    name: "Lush Caves",
    multipliers: {
      coal: 1433781,
      copper: 1173465,
      iron: 1366742,
      gold: 428359,
      diamond: 369632,
      neptunium: 135,
    },
  },
  31: {
    name: "Mangrove Swamp",
    multipliers: {
      coal: 108941,
      copper: 17131,
      iron: 15688,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  32: {
    name: "Meadow",
    multipliers: {
      coal: 76,
      copper: 54,
      iron: 5,
      gold: 0,
      diamond: 0,
      neptunium: 1,
    },
  },
  35: {
    name: "Ocean",
    multipliers: {
      coal: 103206,
      copper: 113110,
      iron: 91257,
      gold: 9939,
      diamond: 2272,
      neptunium: 0,
    },
  },
  36: {
    name: "Old Growth Birch Forest",
    multipliers: {
      coal: 9927,
      copper: 4335,
      iron: 1846,
      gold: 14,
      diamond: 0,
      neptunium: 0,
    },
  },
  37: {
    name: "Old Growth Pine Taiga",
    multipliers: {
      coal: 20109,
      copper: 8862,
      iron: 2825,
      gold: 6,
      diamond: 0,
      neptunium: 1,
    },
  },
  38: {
    name: "Old Growth Spruce Taiga",
    multipliers: {
      coal: 82084,
      copper: 2807,
      iron: 23332,
      gold: 0,
      diamond: 0,
      neptunium: 6,
    },
  },
  39: {
    name: "Plains",
    multipliers: {
      coal: 51709,
      copper: 35117,
      iron: 8474,
      gold: 50,
      diamond: 0,
      neptunium: 0,
    },
  },
  40: {
    name: "River",
    multipliers: {
      coal: 118554,
      copper: 114143,
      iron: 55566,
      gold: 1656,
      diamond: 47,
      neptunium: 1,
    },
  },
  41: {
    name: "Savanna",
    multipliers: {
      coal: 235597,
      copper: 60799,
      iron: 50702,
      gold: 629,
      diamond: 51,
      neptunium: 0,
    },
  },
  42: {
    name: "Savanna Plateau",
    multipliers: {
      coal: 122850,
      copper: 21487,
      iron: 27411,
      gold: 192,
      diamond: 11,
      neptunium: 9,
    },
  },
  44: {
    name: "Snowy Beach",
    multipliers: {
      coal: 938,
      copper: 872,
      iron: 538,
      gold: 42,
      diamond: 0,
      neptunium: 1,
    },
  },
  45: {
    name: "Snowy Plains",
    multipliers: {
      coal: 207954,
      copper: 71349,
      iron: 33988,
      gold: 77,
      diamond: 3,
      neptunium: 8,
    },
  },
  46: {
    name: "Snowy Slopes",
    multipliers: {
      coal: 7303,
      copper: 0,
      iron: 2929,
      gold: 0,
      diamond: 0,
      neptunium: 201,
    },
  },
  47: {
    name: "Snowy Taiga",
    multipliers: {
      coal: 71081,
      copper: 39136,
      iron: 12169,
      gold: 93,
      diamond: 3,
      neptunium: 2,
    },
  },
  49: {
    name: "Sparse Jungle",
    multipliers: {
      coal: 260045,
      copper: 128533,
      iron: 27375,
      gold: 38,
      diamond: 0,
      neptunium: 0,
    },
  },
  50: {
    name: "Stony Peaks",
    multipliers: {
      coal: 254920,
      copper: 0,
      iron: 187421,
      gold: 4,
      diamond: 0,
      neptunium: 9636,
    },
  },
  52: {
    name: "Sunflower Plains",
    multipliers: {
      coal: 95,
      copper: 88,
      iron: 19,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  53: {
    name: "Swamp",
    multipliers: {
      coal: 18145,
      copper: 4713,
      iron: 2704,
      gold: 1,
      diamond: 0,
      neptunium: 0,
    },
  },
  54: {
    name: "Taiga",
    multipliers: {
      coal: 4708,
      copper: 1429,
      iron: 1411,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  57: {
    name: "Warm Ocean",
    multipliers: {
      coal: 4193,
      copper: 5809,
      iron: 6773,
      gold: 1554,
      diamond: 379,
      neptunium: 0,
    },
  },
  59: {
    name: "Windswept Forest",
    multipliers: {
      coal: 11644,
      copper: 6600,
      iron: 1000,
      gold: 0,
      diamond: 0,
      neptunium: 219,
    },
  },
  60: {
    name: "Windswept Gravelly Hills",
    multipliers: {
      coal: 763,
      copper: 946,
      iron: 532,
      gold: 50,
      diamond: 20,
      neptunium: 15,
    },
  },
  61: {
    name: "Windswept Hills",
    multipliers: {
      coal: 7117,
      copper: 5073,
      iron: 1067,
      gold: 0,
      diamond: 0,
      neptunium: 146,
    },
  },
  63: {
    name: "Wooded Badlands",
    multipliers: {
      coal: 12160,
      copper: 10851,
      iron: 4567,
      gold: 7064,
      diamond: 4,
      neptunium: 0,
    },
  },
  65: {
    name: "Andesite Caves",
    multipliers: {
      coal: 607673,
      copper: 423945,
      iron: 383418,
      gold: 76794,
      diamond: 38956,
      neptunium: 3,
    },
  },
  67: {
    name: "Deep Caves",
    multipliers: {
      coal: 109319,
      copper: 141845,
      iron: 285160,
      gold: 177931,
      diamond: 223616,
      neptunium: 0,
    },
  },
  69: {
    name: "Diorite Caves",
    multipliers: {
      coal: 200901,
      copper: 150917,
      iron: 137323,
      gold: 23369,
      diamond: 10666,
      neptunium: 9,
    },
  },
  70: {
    name: "Frostfire Caves",
    multipliers: {
      coal: 3032,
      copper: 4257,
      iron: 15727,
      gold: 10087,
      diamond: 10967,
      neptunium: 0,
    },
  },
  71: {
    name: "Fungal Caves",
    multipliers: {
      coal: 999188,
      copper: 136396,
      iron: 105961,
      gold: 22242,
      diamond: 13792,
      neptunium: 42,
    },
  },
  72: {
    name: "Granite Caves",
    multipliers: {
      coal: 941030,
      copper: 436557,
      iron: 363609,
      gold: 59301,
      diamond: 28370,
      neptunium: 122,
    },
  },
  74: {
    name: "Infested Caves",
    multipliers: {
      coal: 116609,
      copper: 104126,
      iron: 123571,
      gold: 38410,
      diamond: 25798,
      neptunium: 1,
    },
  },
  75: {
    name: "Mantle Caves",
    multipliers: {
      coal: 748748,
      copper: 566093,
      iron: 778619,
      gold: 342314,
      diamond: 313924,
      neptunium: 25,
    },
  },
  76: {
    name: "Thermal Caves",
    multipliers: {
      coal: 236770,
      copper: 127777,
      iron: 126447,
      gold: 34498,
      diamond: 22813,
      neptunium: 59,
    },
  },
  77: {
    name: "Tuff Caves",
    multipliers: {
      coal: 0,
      copper: 389,
      iron: 25936,
      gold: 29314,
      diamond: 45757,
      neptunium: 0,
    },
  },
  78: {
    name: "Underground Jungle",
    multipliers: {
      coal: 1188059,
      copper: 173213,
      iron: 177469,
      gold: 55380,
      diamond: 46659,
      neptunium: 0,
    },
  },
  82: {
    name: "Alpine Highlands",
    multipliers: {
      coal: 119229,
      copper: 64409,
      iron: 13800,
      gold: 24,
      diamond: 0,
      neptunium: 0,
    },
  },
  84: {
    name: "Amethyst Rainforest",
    multipliers: {
      coal: 66788,
      copper: 28984,
      iron: 2889,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  86: {
    name: "Arid Highlands",
    multipliers: {
      coal: 234757,
      copper: 74873,
      iron: 39135,
      gold: 84,
      diamond: 0,
      neptunium: 0,
    },
  },
  87: {
    name: "Ashen Savanna",
    multipliers: {
      coal: 18133,
      copper: 0,
      iron: 7054,
      gold: 0,
      diamond: 0,
      neptunium: 17,
    },
  },
  89: {
    name: "Birch Taiga",
    multipliers: {
      coal: 8708,
      copper: 722,
      iron: 2568,
      gold: 2,
      diamond: 0,
      neptunium: 0,
    },
  },
  91: {
    name: "Blooming Valley",
    multipliers: {
      coal: 165,
      copper: 86,
      iron: 58,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  92: {
    name: "Brushland",
    multipliers: {
      coal: 413920,
      copper: 164927,
      iron: 86133,
      gold: 874,
      diamond: 64,
      neptunium: 15,
    },
  },
  96: {
    name: "Cold Shrubland",
    multipliers: {
      coal: 81455,
      copper: 35975,
      iron: 8905,
      gold: 106,
      diamond: 12,
      neptunium: 1,
    },
  },
  100: {
    name: "Forested Highlands",
    multipliers: {
      coal: 237795,
      copper: 97146,
      iron: 29175,
      gold: 32,
      diamond: 0,
      neptunium: 0,
    },
  },
  103: {
    name: "Glacial Chasm",
    multipliers: {
      coal: 52750,
      copper: 21697,
      iron: 4579,
      gold: 66,
      diamond: 4,
      neptunium: 0,
    },
  },
  105: {
    name: "Gravel Beach",
    multipliers: {
      coal: 18221,
      copper: 14444,
      iron: 5236,
      gold: 384,
      diamond: 22,
      neptunium: 0,
    },
  },
  108: {
    name: "Highlands",
    multipliers: {
      coal: 145699,
      copper: 90692,
      iron: 16966,
      gold: 30,
      diamond: 0,
      neptunium: 0,
    },
  },
  109: {
    name: "Hot Shrubland",
    multipliers: {
      coal: 21814,
      copper: 7571,
      iron: 2482,
      gold: 34,
      diamond: 2,
      neptunium: 0,
    },
  },
  110: {
    name: "Ice Marsh",
    multipliers: {
      coal: 20087,
      copper: 9800,
      iron: 4161,
      gold: 180,
      diamond: 21,
      neptunium: 0,
    },
  },
  113: {
    name: "Lavender Valley",
    multipliers: {
      coal: 10894,
      copper: 4897,
      iron: 521,
      gold: 0,
      diamond: 0,
      neptunium: 2,
    },
  },
  115: {
    name: "Lush Valley",
    multipliers: {
      coal: 3005,
      copper: 1919,
      iron: 656,
      gold: 11,
      diamond: 0,
      neptunium: 0,
    },
  },
  121: {
    name: "Painted Mountains",
    multipliers: {
      coal: 111780,
      copper: 60,
      iron: 52729,
      gold: 211,
      diamond: 0,
      neptunium: 3067,
    },
  },
  122: {
    name: "Red Oasis",
    multipliers: {
      coal: 436,
      copper: 5306,
      iron: 1365,
      gold: 46,
      diamond: 0,
      neptunium: 0,
    },
  },
  123: {
    name: "Rocky Jungle",
    multipliers: {
      coal: 166294,
      copper: 63442,
      iron: 7068,
      gold: 0,
      diamond: 0,
      neptunium: 10,
    },
  },
  124: {
    name: "Rocky Mountains",
    multipliers: {
      coal: 50559,
      copper: 15,
      iron: 19955,
      gold: 0,
      diamond: 0,
      neptunium: 1284,
    },
  },
  126: {
    name: "Sakura Grove",
    multipliers: {
      coal: 3769,
      copper: 2136,
      iron: 336,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  127: {
    name: "Sakura Valley",
    multipliers: {
      coal: 5332,
      copper: 3662,
      iron: 812,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  133: {
    name: "Shield",
    multipliers: {
      coal: 33,
      copper: 10,
      iron: 0,
      gold: 0,
      diamond: 0,
      neptunium: 1,
    },
  },
  136: {
    name: "Siberian Taiga",
    multipliers: {
      coal: 19346,
      copper: 8388,
      iron: 1456,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  137: {
    name: "Skylands Autumn",
    multipliers: {
      coal: 17,
      copper: 21,
      iron: 88,
      gold: 86,
      diamond: 75,
      neptunium: 0,
    },
  },
  138: {
    name: "Skylands Spring",
    multipliers: {
      coal: 548,
      copper: 857,
      iron: 3842,
      gold: 2416,
      diamond: 1880,
      neptunium: 0,
    },
  },
  142: {
    name: "Snowy Badlands",
    multipliers: {
      coal: 511,
      copper: 57,
      iron: 81,
      gold: 222,
      diamond: 0,
      neptunium: 2,
    },
  },
  143: {
    name: "Snowy Cherry Grove",
    multipliers: {
      coal: 28414,
      copper: 1521,
      iron: 7796,
      gold: 7,
      diamond: 0,
      neptunium: 710,
    },
  },
  146: {
    name: "Steppe",
    multipliers: {
      coal: 48251,
      copper: 30340,
      iron: 5903,
      gold: 19,
      diamond: 0,
      neptunium: 0,
    },
  },
  148: {
    name: "Temperate Highlands",
    multipliers: {
      coal: 56394,
      copper: 30594,
      iron: 7983,
      gold: 35,
      diamond: 0,
      neptunium: 0,
    },
  },
  149: {
    name: "Tropical Jungle",
    multipliers: {
      coal: 166016,
      copper: 84063,
      iron: 12838,
      gold: 0,
      diamond: 0,
      neptunium: 6,
    },
  },
  152: {
    name: "Volcanic Peaks",
    multipliers: {
      coal: 312563,
      copper: 65,
      iron: 2211,
      gold: 0,
      diamond: 0,
      neptunium: 9711,
    },
  },
  153: {
    name: "Warm River",
    multipliers: {
      coal: 91,
      copper: 75,
      iron: 82,
      gold: 0,
      diamond: 0,
      neptunium: 0,
    },
  },
  160: {
    name: "Yellowstone",
    multipliers: {
      coal: 125109,
      copper: 32588,
      iron: 35424,
      gold: 265,
      diamond: 0,
      neptunium: 4,
    },
  },
} as const;

// Helper function to find biome ID by name
export function getBiomeIdByName(name: string): number | undefined {
  const entry = Object.entries(BiomeTypes).find(
    ([_, biome]) => biome.name.toLowerCase() === name.toLowerCase()
  );
  return entry ? Number(entry[0]) : undefined;
}

// Helper function to get the highest multiplier mineral for a biome
export function getHighestMultiplierMineral(
  biomeId: number
): { mineral: string; multiplier: number } | undefined {
  const biome = BiomeTypes[biomeId];
  if (!biome) return undefined;

  const minerals = Object.entries(biome.multipliers);
  const highest = minerals.reduce(
    (max, [mineral, multiplier]) =>
      multiplier > max.multiplier ? { mineral, multiplier } : max,
    { mineral: "", multiplier: 0 }
  );

  return highest.multiplier > 0 ? highest : undefined;
}
