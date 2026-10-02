// Sweeper Inc. tuning and copy file.
//
// Upgrade ids are internal and should not be changed after players have started a save.
// Edit `name`, `description`, `baseCost`, `growth`, and the messages below to rebalance or
// rename the game without changing game.js. The message guide describes where each message appears.
const SWEEPER_INC_CONFIG = {
  version: "0.2.7",
  currencySymbol: "$",
  startingCoins: 100,
  startingShovels: 10,
  startingFlags: 15,
  startingHints: 3,
  startingMines: 0,
  digCostPerTile: 1,
  gridLimits: { min: 3 },

  runs: {
    startingRunOrdinal: 1,
    scoreEligibleCategories: ["STANDARD", "STANDARD_CONTRACT", "CAMP_CONTRACT", "DISTRICT_PARCEL"],
  },

  crossCosts: {
    categories: {
      tallerGrid: "height",
      widerGrid: "width",
      addMine: "mines",
      addTreasure: "treasure",
    },
    matrix: {
      height: { width: 1.01, mines: 1.02, treasure: 1.03 },
      width: { height: 1.01, mines: 1.02, treasure: 1.03 },
      mines: { height: 1.01, width: 1.01, treasure: 1.05 },
      treasure: { height: 1.01, width: 1.01, mines: 1.06 },
    },
  },

  blueprints: {
    baseChance: 0.05,
    pityIncrease: 0.02,
    maxChance: 0.25,
    secondSlotLevel: 5,
  },

  automation: {
    defaultRiskThreshold: 0.15,
    workerMineRecoveryMultiplier: 0.5,
    analyst: { hireCost: 250, upgradeMineCost: 5, upgradeGrowth: 1.6 },
    speculation: {
      baseCoinCost: 1000,
      referenceArea: 100,
      areaExponent: 0.5,
      densityWeight: 2,
      repeatedGuessGrowth: 1.5,
    },
    viewport: { cellSize: 34, overscan: 2 },
  },

  flags: {
    failureRecoveryChance: 0.5,
    regenerationIntervalMs: 30000,
    replacementFraction: 0.5,
  },

  reveal: {
    tileDelayMs: 48,
    waveDelayMs: 42,
  },

  shovel: {
    supplyCost: 25,
    flagBundleSize: 5,
    flagSupplyCost: 10,
    hintBundleSize: 5,
    hintSupplyCost: 1000,
    supplyCostMultiplierPerTier: 1.5,
    tiers: [
      { name: "Wooden", durability: 10 },
      { name: "Copper", durability: 12 },
      { name: "Iron", durability: 25 },
      { name: "Steel", durability: 45 },
      { name: "Titanium", durability: 75 },
      { name: "Obsidian", durability: 120 },
      { name: "Diamond", durability: 200 },
    ],
  },

  treasure: {
    startingMinimumCoins: 6,
    startingMaximumCoins: 16,
    minimumGrowth: 2,
    maximumGrowth: 4,
  },

  curio: {
    itemCount: 10,
    baseChance: 0.001,
    maxChance: 0.05,
    missDecay: 0.96,
  },

  upgrades: {
    shovelCapacityCosts: [120, 260, 520],
    flagCapacityCosts: [160, 350, 800],
    betterFlagsChancePerLevel: 0.05,
    mineYieldPercentPerLevel: 0.01,
  },

  abilities: {
    safetyRadiusCosts: [40],
    safetyRadiusMineCost: 10,
    chordingMineCosts: [3, 8],
  },

  mineCollection: {
    steelBaseChance: 0.05,
    betterShovelChancePerTier: 0.05,
  },

  capacity: {
    shovel: [10, 20, 35, 50],
    flags: [15, 100, 250, 500],
  },

  emergencyShovel: {
    enabled: true,
    durability: 5,
    warning: "There will be no more handouts. Use your money wisely.",
  },

  contracts: {
    firstAfterBoards: 10,
    minBoardsBetween: 10,
    maxBoardsBetween: 30,
    lossCooldownGames: 150,
    types: [
      {
        id: "abandonedYard",
        name: "Abandoned Yard",
        description: "A tight salvage lot with a few buried charges.",
        rows: 10,
        cols: 15,
        mines: { min: 5, max: 8 },
        rewardCoins: 250,
        rewardMines: 2,
      },
      {
        id: "coalSeam",
        name: "Coal Seam",
        description: "A wide seam with pressure pockets through the whole run.",
        rows: 7,
        cols: 20,
        mines: { min: 10, max: 15 },
        rewardCoins: 650,
        rewardMines: 4,
      },
      {
        id: "floodedQuarry",
        name: "Flooded Quarry",
        description: "A tall quarry shaft with old blasting caps still underfoot.",
        rows: 25,
        cols: 10,
        mines: { min: 17, max: 30 },
        rewardCoins: 1400,
        rewardMines: 7,
      },
      {
        id: "crystalCavern",
        name: "Crystal Cavern",
        description: "A glittering cavern where caches tend to cluster near danger.",
        rows: 20,
        cols: 20,
        mines: { min: 36, max: 44 },
        rewardCoins: 3000,
        rewardMines: 12,
        bonusTreasures: 4,
        nearMineTreasureWeight: 5,
      },
      {
        id: "ruinedArmory",
        name: "Ruined Armory",
        description: "A ruined depot with recoverable ordnance everywhere.",
        rows: 25,
        cols: 20,
        mines: { min: 45, max: 55 },
        rewardCoins: 5000,
        rewardMines: 20,
        recoveryBonus: 0.25,
      },
      {
        id: "battlefield",
        name: "Battlefield",
        description: "A huge field of overlapping charges and buried scrap.",
        rows: 30,
        cols: 40,
        mines: { min: 150, max: 220 },
        rewardCoins: 10000,
        rewardMines: 35,
      },
    ],
  },

  campDiscovery: {
    firstEligibleAttempt: 100,
    retryMinimum: 25,
    retryMaximum: 75,
    debugDelay: 5,
    entranceWidths: [2, 3],
    contract: {
      id: "establishCamp",
      name: "Establish a Camp",
      description: "You’ve come across a flat shelf in the granite. This seems like a good place to establish a camp, but clearing the mines may be difficult.",
      rows: 10,
      cols: 15,
      mines: 30,
      treasureCount: 1,
    },
  },

  district: {
    initialViewportWidth: 9,
    initialViewportHeight: 9,
    defaultSurveyDurationMs: 60000,
    recovery: { digCost: 500, baseDurationMs: 300000 },
    clearance: {
      preparation: { id: "preparation", name: "Extra preparation", digCost: 200, baseDurationMs: 120000 },
      flooding: { id: "flooding", name: "Flooding", digCost: 300, baseDurationMs: 180000 },
      collapsed: { id: "collapsed", name: "Collapsed access", digCost: 400, baseDurationMs: 240000 },
    },
    passageGeneration: {
      chances: [0.9, 0.6, 0.3],
      blockedSidePenalty: 0.3,
      directionOrder: ["north", "east", "south", "west"],
    },
    parcelTypes: [
      { id: "abandonedQuarry", displayName: "Abandoned Quarry", weight: 14, width: [12, 18], height: [10, 14], mineDensity: [0.12, 0.18], treasure: [2, 4], curios: [0, 1], hazards: ["Loose ground"], blocker: { type: "preparation", chance: 0.2 } },
      { id: "ironSeam", displayName: "Iron Seam", weight: 16, width: [12, 18], height: [8, 12], mineDensity: [0.15, 0.21], treasure: [1, 3], curios: [0, 1], hazards: [], blocker: { type: "preparation", chance: 0.1 } },
      { id: "collapsedTunnel", displayName: "Collapsed Tunnel", weight: 10, width: [14, 22], height: [6, 9], mineDensity: [0.18, 0.24], treasure: [1, 3], curios: [0, 1], hazards: ["Unstable entrance"], blocker: { type: "collapsed", chance: 0.5 } },
      { id: "crystalChamber", displayName: "Crystal Chamber", weight: 8, width: [10, 16], height: [10, 16], mineDensity: [0.16, 0.22], treasure: [3, 6], curios: [1, 2], hazards: [], blocker: null },
      { id: "oldMilitaryArsenal", displayName: "Old Military Arsenal", weight: 5, width: [14, 22], height: [12, 18], mineDensity: [0.22, 0.28], treasure: [3, 5], curios: [0, 2], hazards: ["Military debris"], blocker: { type: "preparation", chance: 0.2 } },
      { id: "goldVein", displayName: "Gold Vein", weight: 6, width: [12, 20], height: [8, 12], mineDensity: [0.18, 0.24], treasure: [4, 7], curios: [0, 1], hazards: [], blocker: null },
      { id: "unstableFault", displayName: "Unstable Fault", weight: 7, width: [8, 12], height: [12, 20], mineDensity: [0.24, 0.3], treasure: [1, 3], curios: [0, 1], hazards: ["Structural fault"], blocker: { type: "collapsed", chance: 0.25 } },
      { id: "looseSediment", displayName: "Loose Sediment", weight: 14, width: [10, 16], height: [8, 14], mineDensity: [0.1, 0.16], treasure: [1, 3], curios: [0, 1], hazards: ["Loose ground"], blocker: { type: "preparation", chance: 0.35 } },
      { id: "bedrock", displayName: "Bedrock", weight: 12, width: [10, 18], height: [10, 16], mineDensity: [0.14, 0.2], treasure: [1, 2], curios: [0, 1], hazards: [], blocker: null },
      { id: "floodedPocket", displayName: "Flooded Pocket", weight: 8, width: [10, 18], height: [8, 14], mineDensity: [0.13, 0.2], treasure: [2, 4], curios: [0, 1], hazards: ["Flooding"], blocker: { type: "flooding", chance: 0.6 } },
    ],
  },

  messageBoard: {
    challenges: {
      maxActive: 4,
      minSecondsBetween: 300,
      maxSecondsBetween: 900,
      minLifetimeSeconds: 900,
      maxLifetimeSeconds: 3600,
      lifetimeStepSeconds: 300,
      rewardBaseCoins: 80,
      rewardCoinsPerTile: 3,
      rewardCoinsPerMine: 18,
      sizeAnyChance: 0.22,
      mineAnyChance: 0.15,
      types: [
        { id: "flagLimit", name: "Flag Discipline" },
        { id: "noChording", name: "Manual Sweep" },
        { id: "speedClear", name: "Rush Job", seconds: 90 },
      ],
    },
  },

  // This is the only reveal order used by the Workshop. Internal ids stay stable.
  progression: {
    order: ["tallerGrid", "widerGrid", "improveShovel", "addMine", "addTreasure", "mineYield", "treasureValue", "betterFlags", "shovelCapacity", "flagCapacity"],
    items: {
      tallerGrid: { name: "Taller Grid", description: "Unlock {next} rows for future rounds.", baseCost: 80, growth: 1.5 },
      widerGrid: { name: "Wider Grid", description: "Unlock {next} columns for future rounds.", baseCost: 80, growth: 1.5 },
      addMine: { name: "Add Mine", description: "Unlock {next} mines per board.", baseCost: 90, growth: 1.8 },
      addTreasure: { name: "Add Treasure", description: "Unlock another chest on an eligible safe tile.", baseCost: 120, growth: 2.0 },
      improveShovel: { name: "Improve Shovel", description: "Advance from {current} to {next}.", finalDescription: "{current} is the final shovel tier.", baseCost: 60, growth: 2.2 },
      mineYield: { name: "Mine Yield", description: "Increase the end-of-round bonus per extra mine.", baseCost: 180, growth: 1.9 },
      treasureValue: { name: "Richer Caches", description: "Increase the average value of treasure caches.", baseCost: 100, growth: 1.8 },
      betterFlags: { name: "Better Flags", description: "Improve mine recovery, but increase the cost of new flags.", baseCost: 150, growth: 2 },
    },
  },

  copy: {
    tooltips: {
      shovel: "Needed to dig. Upgrade for more powerful tools.",
      flags: "Reusable company equipment. Deployed flags return after a successful Board. Missing flags are replaced over time.",
      minesLocked: "Purchase a Steel Shovel to unlock.",
      minesUnlocked: "Used to purchase Upgrades and Abilities.",
    },
    upgradeLabels: {
      shovelLocker: "Shovel Locker",
      flagLocker: "Flag Locker",
      buyShovel: "Buy Shovels",
      buyFlags: "Replace Flags",
    },
    messageGuide: {
      status: "Shown in the status line below the HUD.",
      resourceTooltips: "Shown when hovering over the Shovels, Flags, or Mines resource card.",
      settingsNote: "Shown below the board selectors in the Operator Panel.",
      storeNote: "Shown below the supply purchase buttons.",
      upgradeDescriptions: "Shown inside each upgrade button.",
    },
  },

  messages: {
    idle: "Sweep the grid. Right-click or long-press to flag.",
    idleNoShovels: "No shovels left. Visit the Quartermaster before digging.",
    noShovels: "Your shovels are spent. Buy a fresh one between rounds.",
    cleanHit: "Clean hit. Keep sweeping.",
    shovelsSpent: "Shovels spent. Restock between rounds to keep sweeping.",
    finishRound: "Finish this round before changing the board choice.",
    flagPouchEmpty: "No company flags are available. Return, replace, or wait for a missing flag.",
    flagLimitReached: "No more flags than mines in the field ({count} max).",
    flagPlanted: "Flag planted.",
    flagCleared: "Flag cleared.",
    chordNeedsFlags: "Chording needs {required} nearby flags; {actual} planted.",
    chordNoShovel: "No shovels left. Restock between rounds.",
    chordingComplete: "Chording complete.",
    treasureFound: "Treasure found: +{value} at round end.",
    curioFound: " Mine Curio #{item} logged.",
    boomWaiting: "Boom. The shovel shattered. Sweeper Inc. reset is waiting.",
    boardClear: "Board clear.{reward}{recovery}",
    rewardSuffix: " +{value} earned.",
    noTreasurePayout: " No treasure payout.",
    recoverySuffix: " {count} mine{plural} recovered.",
    suppliesShovel: "Fresh shovel stocked. Back to work.",
    suppliesFlags: "Company flags replaced: +{count}.",
    upgradeInstalled: "{name} upgraded.",
    storageExpanded: "{kind} storage expanded.",
    tallerUnlocked: "Taller Grid unlocked: {value} rows available.",
    widerUnlocked: "Wider Grid unlocked: {value} columns available.",
    safetyInstalled: "Safety area {value} installed.",
    chordingUnlocked: "Chording unlocked. Click an open numbered tile.",
    abilityInstalled: "Ability installed.",
    progressReset: "Progress reset. Fresh purse, fresh tools, fresh ledger.",
    emergency: "{prefix}Quartermaster comped one emergency shovel: {count} digs. {warning}",
    suppliesReady: "Supplies available. {name} shovels last {durability} digs.",
    suppliesLocked: "Supplies are locked until this round ends.",
    finalShovel: "{name} is the final shovel tier.",
    safetyMax: "5x5 is the current cap",
    chordingReady: "Click a numbered tile",
    chordingDescription: "Regular Minesweeper chording",
    noCompletedBoards: "No completed boards yet.",
    settingsNote: "{mines} mine{plural}, placed after the first click. {safety}",
    safetyNote: "{size} safety.",
    firstTileSafe: "First tile is safe.",
    contractReady: "Contract ready: {name}. Check the Message Board.",
    contractStarted: "Contract started: {name}. Clear it to claim the reward.",
    contractNeedsShovels: "Need {needed} digs to accept {name}. Current capacity: {available}.",
    contractWon: "Contract complete: {name}. +{coins} and +{mines} mine{plural}.",
    contractLost: "Contract failed: {name}. That contract type is unavailable for {count} games.",
    challengeReady: "Challenge posted: {name}.",
    challengeClaimable: " Challenge complete: {name}. Claim your reward!",
    challengeWon: "Challenge reward claimed: {name}. +{coins}.",
  },
};

export default SWEEPER_INC_CONFIG;
