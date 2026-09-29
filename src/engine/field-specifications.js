export function selectionAfterCapacityUpgrade(selectedValue, previousMaximum, newMaximum) {
  return selectedValue === previousMaximum ? newMaximum : selectedValue;
}

export function integerOptions(minimum, maximum) {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) return [];
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
}
