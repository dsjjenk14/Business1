import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';

import { fetchOutsInbox } from './api';

// Shared by the tab bar and the Outs tab: how many Outs are waiting to be opened.
let count = 0;
const listeners = new Set<(n: number) => void>();

function set(n: number) {
  count = n;
  listeners.forEach((l) => l(n));
}

export async function refreshNewOuts() {
  try {
    const inbox = await fetchOutsInbox();
    set(inbox.received.reduce((sum, r) => sum + r.unopened, 0));
  } catch {
    // keep the last count
  }
}

/** Unopened Outs, checked every 30 seconds and when the app comes back. */
export function useNewOuts() {
  const { session } = useAuth();
  const [n, setN] = useState(count);
  useEffect(() => {
    listeners.add(setN);
    return () => {
      listeners.delete(setN);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    refreshNewOuts();
    const timer = setInterval(refreshNewOuts, 30_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refreshNewOuts());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [session]);
  return n;
}
