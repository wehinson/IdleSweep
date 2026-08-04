export function performPurchase({ registry, id, isAvailable, handlers }) {
  const purchaseable = registry[id];
  if (!purchaseable || !isAvailable()) return false;

  const handler = handlers[purchaseable.kind];
  return Boolean(handler?.(purchaseable));
}
