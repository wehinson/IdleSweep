export function createStartingStats() {
  return {
    boardsCompleted: 0,
    boardsLost: 0,
    safeTilesDug: 0,
    minesTriggered: 0,
    minesCorrectlyFlagged: 0,
    minesRecovered: 0,
    treasureCachesFound: 0,
    curiosFound: 0,
    coinsEarned: 0,
    shovelsBroken: 0,
    largestBoardCompleted: 0,
    highestMineDensityCompleted: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    contractsCompleted: 0,
    contractsWon: 0,
    contractsLost: 0,
    challengesCompleted: 0,
    challengesWon: 0,
    fastestClears: {},
  };
}

export function createStartingSpecialists(specialists) {
  return Object.fromEntries(specialists.map((specialist) => [specialist.id, 0]));
}

export function createStartingSpecialEquipment(equipment) {
  return {
    ...Object.fromEntries(equipment.map((item) => [item.id, 0])),
    probeCharge: 2,
    controlledBlast: 1,
  };
}
