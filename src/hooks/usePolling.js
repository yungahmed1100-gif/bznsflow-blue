import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_INTERVAL_MS = 5000;

/**
 * A live resource. Today it polls every five seconds while the tab is visible;
 * components depend only on { data, error, loading, refresh }, so a Convex
 * subscription can replace the polling without changing them.
 */
export function usePolling(load, deps = [], { interval = POLL_INTERVAL_MS, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  // Each change of `deps` starts a new generation. A response from an older generation
  // (a filter the owner has already changed) is dropped instead of shown under the new one.
  const inFlight = useRef(null), generation = useRef(0), active = useRef(true), loader = useRef(load);
  loader.current = load;
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    const gen = generation.current;
    if (inFlight.current === gen) return;
    inFlight.current = gen;
    if (!quiet) setState(s => ({ ...s, loading: true }));
    try {
      const data = await loader.current();
      if (active.current && gen === generation.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (active.current && gen === generation.current) setState(s => ({ ...s, error, loading: false }));
    } finally { if (inFlight.current === gen) inFlight.current = null; }
  }, []);
  useEffect(() => {
    active.current = true;
    generation.current += 1;
    if (!enabled) return () => { active.current = false; };
    setState(s => ({ ...s, data: null, loading: true }));
    refresh();
    const timer = interval ? setInterval(() => { if (document.visibilityState === 'visible') refresh({ quiet: true }); }, interval) : null;
    const onVisible = () => { if (document.visibilityState === 'visible') refresh({ quiet: true }); };
    // Back/forward cache: a page restored after leaving for another site (e.g.
    // Instagram's login) shows its old data until refreshed.
    const onShow = (event) => { if (event.persisted) refresh({ quiet: true }); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onShow);
    return () => { active.current = false; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onShow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval, ...deps]);
  return { ...state, refresh, setData: data => setState(s => ({ ...s, data })) };
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}
