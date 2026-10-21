'use client';

import { useEffect, useState, type ComponentType } from 'react';

export default function ClientApp() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import('../App').then(module => { if (active) setApp(() => module.default); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  if (failed) return <p className="p-8">Veritas could not load. Please refresh the page.</p>;
  return App ? <div id="root"><App /></div> : <p className="p-8" role="status">Loading Veritas…</p>;
}
