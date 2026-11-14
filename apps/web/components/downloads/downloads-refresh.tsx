"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

type DownloadsRefresh = { added: number; notifyAdded: () => void };

const Context = createContext<DownloadsRefresh>({ added: 0, notifyAdded: () => {} });

/** Lets the add modal tell the list a download was added, so it shows it without waiting for its next poll. */
export function DownloadsRefreshProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState(0);
  return <Context value={{ added, notifyAdded: () => setAdded((n) => n + 1) }}>{children}</Context>;
}

export function useDownloadsRefresh(): DownloadsRefresh {
  return useContext(Context);
}
