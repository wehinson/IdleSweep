export function createCellInputController({ longPressMs = 450, swapped = false } = {}) {
  let longPressTimer = null;
  let ignoreNextClick = false;
  let isSwapped = swapped;

  function cancel() {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function setSwapped(value) {
    isSwapped = Boolean(value);
  }

  function bind(button, { onActivate, onFlag, enableLongPress = true }) {
    const primaryAction = () => (isSwapped ? onFlag() : onActivate());
    const secondaryAction = () => (isSwapped ? onActivate() : onFlag());
    button.addEventListener("click", () => {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        return;
      }
      primaryAction();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      secondaryAction();
    });
    button.addEventListener("pointerdown", () => {
      if (!enableLongPress) return;
      cancel();
      longPressTimer = window.setTimeout(() => {
        secondaryAction();
        ignoreNextClick = true;
        longPressTimer = null;
      }, longPressMs);
    });
    button.addEventListener("pointerup", cancel);
    button.addEventListener("pointerleave", cancel);
    button.addEventListener("pointercancel", cancel);
  }

  return { bind, cancel, setSwapped };
}
