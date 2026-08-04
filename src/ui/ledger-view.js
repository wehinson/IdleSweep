export function renderStatsLedger({ stats, gridElement, fastestElement, formatCurrency, formatDuration }) {
  const entries = [
    ["Boards completed", stats.boardsCompleted],
    ["Boards lost", stats.boardsLost],
    ["Safe tiles dug", stats.safeTilesDug],
    ["Mines triggered", stats.minesTriggered],
    ["Mines correctly flagged", stats.minesCorrectlyFlagged],
    ["Mines recovered", stats.minesRecovered],
    ["Treasure caches found", stats.treasureCachesFound],
    ["Mine curios found", stats.curiosFound],
    ["Coins earned", formatCurrency(stats.coinsEarned)],
    ["Shovels broken", stats.shovelsBroken],
    ["Largest board completed", stats.largestBoardCompleted ? `${stats.largestBoardCompleted} tiles` : "—"],
    ["Highest mine density completed", `${(stats.highestMineDensityCompleted * 100).toFixed(1)}%`],
    ["Current win streak", stats.currentWinStreak],
    ["Longest win streak", stats.longestWinStreak],
    ["Contracts completed", stats.contractsCompleted ?? stats.contractsWon ?? 0],
    ["Contracts lost", stats.contractsLost],
    ["Challenges completed", stats.challengesCompleted ?? stats.challengesWon ?? 0],
  ];
  gridElement.innerHTML = entries.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  const fastest = Object.entries(stats.fastestClears).sort(([, a], [, b]) => a - b).slice(0, 5);
  fastestElement.innerHTML = fastest.length > 0
    ? fastest.map(([configuration, time]) => `<li><span>${configuration}</span><strong>${formatDuration(time)}</strong></li>`).join("")
    : '<li class="fastest-empty">No completed boards yet.</li>';
}

export function renderCurioLedger({ curios, chance, itemCount, chanceElement, gridElement, noteElement, formatPercent }) {
  const collectedKinds = curios.filter((count) => count > 0).length;
  const totalCollected = curios.reduce((total, count) => total + count, 0);
  chanceElement.textContent = formatPercent(chance, 1);
  gridElement.innerHTML = curios.map((count, index) => {
    const item = index + 1;
    const label = count > 0
      ? `Curio treasure ${item}, collected ${count} time${count === 1 ? "" : "s"}`
      : `Curio treasure ${item}, not collected`;
    const countBadge = count > 1 ? `<span class="curio-slot__count">x${count}</span>` : "";
    return `<div class="curio-slot${count > 0 ? " is-found" : ""}" aria-label="${label}"><span>${item}</span>${countBadge}</div>`;
  }).join("");
  noteElement.textContent = `${collectedKinds}/${itemCount} types logged · ${totalCollected} total`;
}
