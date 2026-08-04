/**
 * Small deterministic state container used by the game systems. The engine has
 * no browser dependencies; callers provide time, randomness, and the reducer.
 */
export function createGame({ config, initialState, clock = () => 0, rng = Math.random, reducer = defaultReducer }) {
  let state = initialState;
  const listeners = new Set();

  function publish(action, effects) {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot, action, effects));
  }

  function dispatch(action) {
    if (!action || typeof action.type !== "string") {
      throw new TypeError("Game actions require a string type.");
    }
    const result = reducer(state, action, { config, clock, rng });
    state = result?.state ?? result;
    const effects = result?.effects ?? [];
    publish(action, effects);
    return { state: getState(), effects };
  }

  function tick(deltaMs) {
    return dispatch({ type: "tick", deltaMs: Math.max(0, Number(deltaMs) || 0) });
  }

  function getState() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { dispatch, tick, getState, subscribe };
}

function defaultReducer(state, action) {
  if (action.type === "replaceState") return action.state;
  return state;
}
