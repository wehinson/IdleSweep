export function chordingLevel(player) {
  return player.chordingLevel ?? (player.chordingUnlocked ? 2 : 0);
}

export function purchaseChording(player, costs) {
  const level = chordingLevel(player);
  const cost = costs[level];
  if (player.safetyRadius < 1 || player.shovelTier < 3 || !Number.isFinite(cost) || player.mines < cost) return false;
  player.mines -= cost;
  player.chordingLevel = level + 1;
  player.chordingUnlocked = true;
  return true;
}
