import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@accountbook.local`;
}

function normalizeUsername(value: string): string | null {
  const cleaned = value.trim();
  if (!USERNAME_REGEX.test(cleaned)) return null;

  return cleaned;
}

export function AuthPanel() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      setMessage(
        'Username must be 3–30 chars: letters, numbers, dot, underscore, or hyphen.'
      );
      return;
    }
    const email = usernameToEmail(normalizedUsername);

    setSubmitting(true);

    try {
      const action = isSignUp
        ? supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: normalizedUsername,
            },
          },
        })
        : supabase.auth.signInWithPassword({ email, password });

      const { error } = await action;
      if (error) {
        if (!isSignUp && error.message.toLowerCase().includes('invalid login credentials')) {
          setMessage('Invalid credentials. Create account first or check username/password.');
        } else {
          setMessage(error.message);
        }
        return;
      }

      if (isSignUp) {
        // Force explicit login after sign-up.
        await supabase.auth.signOut();
        toast.show('Account created successfully! Please sign in.', 'success');
        setMessage('Account created. Please sign in with your username and password.');
        setIsSignUp(false);
        setPassword('');
      } else {
        // Keep dashboard header exactly as user typed on latest login.
        const { error: updateError } = await supabase.auth.updateUser({
          data: { username: normalizedUsername },
        });
        if (updateError) {
          console.error('Failed to update username casing in metadata', updateError);
        }
        setMessage('Signed in.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card auth-card animate-fade-in">
      <div className="auth-brand">
        <h1 className="auth-title">KhataPlus</h1>
        <p className="muted auth-subtitle">Know where your money is</p>
      </div>
      <p className="auth-mode-text">{isSignUp ? 'Create account' : 'Welcome back'}</p>
      <form onSubmit={handleSubmit} className="stack auth-form">
        <div className="input-group">
          <label className="input-label" htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            type="text"
            placeholder="e.g. Krish_01"
            autoCapitalize="words"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="auth-password">Password</label>
          <div className="password-wrapper">
            <input
              id="auth-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 6 characters"
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <button type="submit" className="auth-submit-btn" disabled={submitting}>
          {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button className="link auth-toggle-btn" onClick={() => setIsSignUp((s) => !s)}>
        {isSignUp ? 'Already have an account? Sign in' : 'New user? Create account'}
      </button>
      {message && <p className="auth-message muted">{message}</p>}
    </div>
  );
}
