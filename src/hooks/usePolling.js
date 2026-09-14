import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_INTERVAL_MS = 5000;

/**
 * A live resource. Today it polls every five seconds while the tab is visible;
 * components depend only on { data, error, loading, refresh }, so a Convex
 * subscription can replace the polling without changing them.
 */
export function usePolling(load, deps = [], { interval = POLL_INTERVAL_MS, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const inFlight = useRef(false), active = useRef(true), loader = useRef(load);
  loader.current = load;
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!quiet) setState(s => ({ ...s, loading: true }));
    try {
      const data = await loader.current();
      if (active.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (active.current) setState(s => ({ ...s, error, loading: false }));
    } finally { inFlight.current = false; }
  }, []);
  useEffect(() => {
    active.current = true;
    if (!enabled) return () => { active.current = false; };
    setState(s => ({ ...s, data: null, loading: true }));
    refresh();
    const timer = interval ? setInterval(() => { if (document.visibilityState === 'visible') refresh({ quiet: true }); }, interval) : null;
    const onVisible = () => { if (document.visibilityState === 'visible') refresh({ quiet: true }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active.current = false; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval, ...deps]);
  return { ...state, refresh, setData: data => setState(s => ({ ...s, data })) };
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}
