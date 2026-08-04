import { BOARD_CATEGORIES } from "./camp-progression.js";
import { createStableId } from "./seeded-random.js";

export const BOARD_SESSION_STATUS = Object.freeze({
  preview: "PREVIEW",
  committed: "COMMITTED",
  won: "WON",
  lost: "LOST",
});

export function createBoardSession(options) {
  const seed = String(options.seed || `${Date.now()}:${Math.random()}`);
  return {
    id: options.id || createStableId("board", seed, options.ordinal || 0),
    category: options.category || BOARD_CATEGORIES.standard,
    owner: options.owner || { type: "main", id: "main" },
    seed,
    settings: { ...options.settings },
    status: BOARD_SESSION_STATUS.preview,
    modeState: options.modeState || null,
    entrances: options.entrances ? JSON.parse(JSON.stringify(options.entrances)) : [],
    campDiscovery: Boolean(options.campDiscovery),
    contractInstanceId: options.contractInstanceId || null,
    parcelId: options.parcelId || null,
    digBudget: null,
    createdOrdinal: options.ordinal || 0,
  };
}

export function commitBoardSession(session) {
  if (session.status !== BOARD_SESSION_STATUS.preview) return session;
  return { ...session, status: BOARD_SESSION_STATUS.committed };
}

export function reserveContractDigs(session, player, shovelTier, requiredDigs) {
  if (session.category !== BOARD_CATEGORIES.standardContract && session.category !== BOARD_CATEGORIES.campContract) {
    return { ok: true, session, player };
  }
  if (session.digBudget) return { ok: true, session, player };
  if (player.shovelUses < requiredDigs) return { ok: false, reason: "insufficientDigs", session, player };
  return {
    ok: true,
    session: { ...session, digBudget: { tier: shovelTier, remaining: requiredDigs, reserved: requiredDigs } },
    player: {
      ...player,
      shovelUses: player.shovelUses - requiredDigs,
      shovels: Math.ceil((player.shovelUses - requiredDigs) / player.shovelDurability),
    },
  };
}

export function consumeBoardDig(session, player, cost = 1) {
  if (session.digBudget) {
    if (session.digBudget.remaining < cost) return { ok: false, session, player };
    return {
      ok: true,
      session: { ...session, digBudget: { ...session.digBudget, remaining: session.digBudget.remaining - cost } },
      player,
    };
  }
  if (player.shovelUses < cost) return { ok: false, session, player };
  const remaining = player.shovelUses - cost;
  return {
    ok: true,
    session,
    player: { ...player, shovelUses: remaining, shovels: Math.ceil(remaining / player.shovelDurability) },
  };
}

export function releaseContractDigs(session, player, shovelDurability, { breakCurrent = false } = {}) {
  if (!session.digBudget) return { session, player, refunded: 0, broken: 0 };
  let refund = session.digBudget.remaining;
  let broken = 0;
  if (breakCurrent && refund > 0) {
    broken = refund % shovelDurability || Math.min(shovelDurability, refund);
    refund = Math.max(0, refund - broken);
  }
  const uses = player.shovelUses + refund;
  return {
    session: { ...session, digBudget: null },
    player: { ...player, shovelUses: uses, shovels: Math.ceil(uses / shovelDurability) },
    refunded: refund,
    broken,
  };
}

export function resolveBoardSession(session, won) {
  return { ...session, status: won ? BOARD_SESSION_STATUS.won : BOARD_SESSION_STATUS.lost };
}
