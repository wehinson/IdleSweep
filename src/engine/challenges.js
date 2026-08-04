export function challengeMatchesClear(challenge, result) {
  if (!challenge.sizeAny && (result.rows < challenge.rows || result.cols < challenge.cols)) return false;
  if (!challenge.minesAny && result.mines < challenge.minMines) return false;
  if (challenge.type === "flagLimit") return result.flagPlacements <= challenge.flagLimit;
  if (challenge.type === "noChording") return !result.usedChording;
  if (challenge.type === "speedClear") return result.elapsed <= challenge.seconds * 1000;
  return false;
}

export function advanceChallengeTimers(messageBoard, elapsedMs, maxActive = Number.POSITIVE_INFINITY) {
  const challenges = messageBoard.challenges
    .map((challenge) => (challenge.claimable ? challenge : { ...challenge, expiresInMs: challenge.expiresInMs - elapsedMs }))
    .filter((challenge) => challenge.claimable || challenge.expiresInMs > 0);
  return {
    ...messageBoard,
    challenges,
    nextChallengeInMs: challenges.length < maxActive
      ? messageBoard.nextChallengeInMs - elapsedMs
      : messageBoard.nextChallengeInMs,
  };
}
