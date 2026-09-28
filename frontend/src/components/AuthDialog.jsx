import { useEffect, useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, X } from 'lucide-react';

function AuthDialog({ configured, mode, onModeChange, onClose, onEmailSubmit, onProvider, busy, message, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isRegistering = mode === 'signup';

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" aria-label="Close sign in" onClick={onClose}><X size={17} /></button>
        <div className="auth-brand-mark"><span className="brand-mark"><span /></span><span className="brand-name">daymark<span>.</span></span></div>
        <div className="auth-eyebrow">YOUR SPACE, WHEREVER YOU ARE</div>
        <h2 id="auth-title">{isRegistering ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-intro">{isRegistering ? 'Keep your plans close on every device.' : 'Sign in to pick up right where you left off.'}</p>

        <div className="auth-providers">
          <button className="provider-button" type="button" disabled={!configured || busy} onClick={() => onProvider('google')}><span className="google-mark">G</span>Continue with Google</button>
          <button className="provider-button" type="button" disabled={!configured || busy} onClick={() => onProvider('azure')}><span className="microsoft-mark"><i /><i /><i /><i /></span>Continue with Microsoft</button>
        </div>

        <div className="auth-divider"><span />or use email<span /></div>
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onEmailSubmit({ email, password, mode }); }}>
          <label htmlFor="auth-email">Email address</label>
          <div className="auth-input-wrap"><Mail size={16} /><input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!configured || busy} /></div>
          <label htmlFor="auth-password">Password</label>
          <input className="auth-password" id="auth-password" type="password" autoComplete={isRegistering ? 'new-password' : 'current-password'} placeholder="At least 6 characters" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || busy} />
          {message && <div className="auth-message" role="status">{message}</div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {!configured && <div className="auth-setup-note"><ShieldCheck size={16} /><span>Connect a Supabase project to enable secure sign-in. Guest mode and local task saving are still available.</span></div>}
          <button className="auth-submit" type="submit" disabled={!configured || busy || !email || !password}>
            {busy ? <span className="auth-spinner" /> : <>{isRegistering ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></>}
          </button>
        </form>

        <div className="auth-switch">{isRegistering ? 'Already have an account?' : 'New to Daymark?'} <button type="button" onClick={() => onModeChange(isRegistering ? 'login' : 'signup')}>{isRegistering ? 'Sign in' : 'Create an account'}</button></div>
        <div className="auth-privacy"><ShieldCheck size={13} />Your tasks are private to your account.</div>
      </section>
    </div>
  );
}

export default AuthDialog;
