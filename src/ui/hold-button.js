import { createHoldConfirmation } from "../engine/hold-confirmation.js";

export function bindHoldButton(button, onConfirm) {
  const confirmation = createHoldConfirmation();
  let frame = null;
  let suppressClick = false;
  const render = () => {
    const state = confirmation.snapshot(performance.now());
    button.querySelector("span").textContent = state.armed ? "Hold to confirm" : "Delete";
    button.style.setProperty("--hold-progress", `${state.progress * 100}%`);
    button.classList.toggle("is-armed", state.armed);
    if (state.confirmed) {
      confirmation.cancel(true);
      onConfirm();
      render();
    } else if (state.holding) frame = requestAnimationFrame(render);
  };
  const cancel = (disarm = false) => {
    cancelAnimationFrame(frame);
    confirmation.cancel(disarm);
    render();
  };
  const start = () => {
    if (!confirmation.snapshot(performance.now()).armed) return;
    suppressClick = true;
    confirmation.start(performance.now());
    render();
  };
  button.addEventListener("click", () => {
    if (suppressClick) { suppressClick = false; return; }
    confirmation.arm();
    render();
  });
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    start();
  });
  button.addEventListener("pointerup", () => cancel());
  button.addEventListener("pointercancel", () => cancel(true));
  button.addEventListener("lostpointercapture", () => cancel());
  button.addEventListener("pointerleave", () => cancel());
  button.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat) return;
    if (confirmation.snapshot(performance.now()).armed) start();
    else { confirmation.arm(); render(); }
  });
  button.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      suppressClick = false;
      cancel();
    }
  });
  button.addEventListener("blur", () => cancel(true));
  window.addEventListener("blur", () => cancel(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(true); });
  return () => cancel(true);
}
