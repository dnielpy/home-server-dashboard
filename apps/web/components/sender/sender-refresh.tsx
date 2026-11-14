"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

type SenderRefresh = { sent: number; notifySent: () => void };

const Context = createContext<SenderRefresh>({ sent: 0, notifySent: () => {} });

/** Lets the new package modal tell the list a package was sent, so it shows it without waiting for its next poll. */
export function SenderRefreshProvider({ children }: { children: ReactNode }) {
  const [sent, setSent] = useState(0);
  return <Context value={{ sent, notifySent: () => setSent((n) => n + 1) }}>{children}</Context>;
}

export function useSenderRefresh(): SenderRefresh {
  return useContext(Context);
}
