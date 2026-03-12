import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { AuthPanel } from './components/AuthPanel';
import { Ledger } from './components/Ledger';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { supabase } from './lib/supabase';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((error: unknown) => {
        console.error('Failed to load auth session', error);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="loading-spinner-wrapper">
          <div className="loading-spinner" />
          <p className="loading-text">KhataPlus</p>
        </div>
      </div>
    );
  }

  const usernameFromEmail =
    session?.user.email && session.user.email.includes('@')
      ? session.user.email.split('@')[0]
      : null;
  const displayName =
    (session?.user.user_metadata?.username as string | undefined) || usernameFromEmail || 'User';

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className={`container ${session?.user ? 'app-container' : 'auth-container'}`}>
          {session?.user ? <Ledger userId={session.user.id} displayName={displayName} /> : <AuthPanel />}
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
