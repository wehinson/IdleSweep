export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function exponentialCost(base, growth, step) {
  return Math.ceil(base * growth ** step);
}

export function randomInteger(minimum, maximum, rng = Math.random) {
  return Math.floor(rng() * (maximum - minimum + 1)) + minimum;
}

export function formatCurrency(value, symbol = "$") {
  return `${symbol}${Math.max(0, Math.floor(value))}`;
}
