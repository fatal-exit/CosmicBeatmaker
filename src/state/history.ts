export interface HistoryState<T> {
  present: T;
  past: T[];
  future: T[];
}

export function createHistory<T>(present: T): HistoryState<T> {
  return { present, past: [], future: [] };
}

export function commitHistory<T>(
  history: HistoryState<T>,
  next: T,
  limit = 50,
): HistoryState<T> {
  if (Object.is(history.present, next)) return history;
  return {
    present: next,
    past: [...history.past, history.present].slice(-limit),
    future: [],
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(1),
  };
}
