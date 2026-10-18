import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data and keeps track of loading / error. Reloads when `deps` change.
 *   const { data, error, loading, reload } = useApi(() => staffApi.get('/api/staff/sellers', filters), [filters]);
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const counter = useRef(0);

  const run = useCallback(async () => {
    const mine = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchRef.current();
      if (mine === counter.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (mine === counter.current) setState((s) => ({ data: s.data, error, loading: false }));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, deps);

  return { ...state, reload: run };
}

/** Returns `value` only after it has stopped changing for `ms` (for search boxes). */
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Page title in the browser tab. */
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · TSM Admin` : 'TSM Admin';
  }, [title]);
}
