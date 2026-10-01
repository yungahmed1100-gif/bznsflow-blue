import React, { createContext, useContext, useMemo } from 'react';
import { createHasibStrings } from '../../lib/hasib/strings';

const HasibContext = createContext(null);

/**
 * Makes Hasib available to Layla's own views (chat thread, contact panel)
 * without threading props through them. `overview` is null when Hasib is off
 * for this account, and every consumer then renders nothing.
 */
export function HasibProvider({ lang, overview, business, timezone, onChanged, children }) {
  const value = useMemo(() => overview ? { overview, h: createHasibStrings(lang, overview.pack?.id), business, timezone, onChanged } : null, [overview, lang, business, timezone, onChanged]);
  return <HasibContext.Provider value={value}>{children}</HasibContext.Provider>;
}
export const useHasib = () => useContext(HasibContext);
