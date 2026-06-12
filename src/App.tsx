/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

import {
  LayoutGrid, HardDrive, Settings as SettingsIcon, LogOut, Loader, Search, RefreshCw, Key, Shield, User as UserIcon, HelpCircle,
  Database as DbIcon,
  Database,
  Globe,
  Bell,
  Sun,
  Laptop,
  AlertTriangle,
  Sparkles,
  Flame,
  Ghost,
  Menu
} from 'lucide-react';

import Dashboard from './components/Dashboard';
import DriveFoldersPage from './components/DriveFoldersPage';
import PublicIndexPages from './components/PublicIndexPages';
import SettingsPage from './components/SettingsPage';
import RequestedMoviesPage from './components/RequestedMoviesPage';
import ProfileModal from './components/ProfileModal';
import DownloadLandingPage from './components/DownloadLandingPage';
import { Folder } from './types';

// Load Firebase from Config
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// Request Drive ReadOnly API access Scopes as confirmed by user in UI
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

export default function App() {
  // Navigation
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'folders' | 'settings' | 'requests'>('dashboard');
  const [isConsoleSidebarOpen, setIsConsoleSidebarOpen] = useState(true);
  
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('kino_admin_token'));
  const [adminUser, setAdminUser] = useState<any | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(localStorage.getItem('kino_google_access_token'));
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showIframeAuthModal, setShowIframeAuthModal] = useState(false);

  // Form Inputs for Login
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');

  // User Registration State
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState('');
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState('');
  const [recoveredCreds, setRecoveredCreds] = useState<{ username: string; tempPass: string } | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');
    setRegisterLoading(true);

    if (!registerName || !registerEmail || !registerUsername || !registerPassword) {
      setRegisterError('All fields are required to register');
      setRegisterLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          username: registerUsername,
          password: registerPassword
        })
      });

      if (res.ok) {
        const data = await res.json();
        setRegisterSuccess('Registration successful! Auto-logging you in...');
        setTimeout(() => {
          setToken(data.token);
          setAdminUser(data.user);
          localStorage.setItem('kino_admin_token', data.token);
          
          // Clear inputs
          setRegisterName('');
          setRegisterEmail('');
          setRegisterUsername('');
          setRegisterPassword('');
          setIsSigningUp(false);
        }, 1500);
      } else {
        const data = await res.json();
        setRegisterError(data.error || 'Registration failed.');
      }
    } catch (err) {
      setRegisterError('Failed to connect to registration servers.');
    } finally {
      setRegisterLoading(false);
    }
  };

  // Active public view check (e.g. if path is /s/marvel-movies)
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [downloadFileId, setDownloadFileId] = useState<string | null>(null);

  // Check path router for preview pages and download pages
  useEffect(() => {
    document.title = 'KinoMM Movie Index – Browse Movies A–Z';
    const handleLocationChange = () => {
      const path = window.location.pathname;
      if (path.startsWith('/s/')) {
        const slug = path.replace('/s/', '');
        setPublicSlug(slug);
        setDownloadFileId(null);
      } else if (path.startsWith('/download/')) {
        const fileId = path.replace('/download/', '');
        setDownloadFileId(fileId);
        setPublicSlug(null);
      } else {
        setPublicSlug(null);
        setDownloadFileId(null);
      }
    };

    // Initial load
    handleLocationChange();

    // Check on push states
    const handlePushState = () => {
      handleLocationChange();
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const changeUrlPath = (path: string) => {
    window.history.pushState({}, '', path);
    // Force callback check
    const popEvent = new PopStateEvent('popstate');
    window.dispatchEvent(popEvent);
  };

  // Fetch /auth/me on reload
  useEffect(() => {
    const checkMe = async () => {
      if (!token) {
        setCheckingAuth(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setAdminUser(data.user);
        } else {
          // Token expired or invalid
          setToken(null);
          localStorage.removeItem('kino_admin_token');
        }
      } catch (err) {
        console.error('Error fetching admin details:', err);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkMe();
  }, [token]);

  // Prevent unauthorized access to settings page
  useEffect(() => {
    if (currentPage === 'settings' && adminUser && adminUser.role !== 'Super Admin') {
      setCurrentPage('dashboard');
    }
  }, [currentPage, adminUser]);

  // Monitor Google Auth state changes
  useEffect(() => {
    return onAuthStateChanged(auth, async (gUser) => {
      if (gUser) {
        setGoogleUser(gUser);
      } else {
        setGoogleUser(null);
      }
    });
  }, []);

  // Standard username login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    if (!usernameOrEmail || !password) {
      setLoginError('Please enter username/email and password');
      setLoginLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ usernameOrEmail, password })
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setAdminUser(data.user);
        localStorage.setItem('kino_admin_token', data.token);
      } else {
        const data = await res.json();
        setLoginError(data.error || 'Login failed. Please check credentials.');
      }
    } catch (err) {
      setLoginError('Failed to connect to full-stack server.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Recover Password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordError('');
    setForgotPasswordSuccess('');
    setRecoveredCreds(null);
    setForgotPasswordLoading(true);

    if (!forgotPasswordEmail) {
      setForgotPasswordError('Please enter your email address');
      setForgotPasswordLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: forgotPasswordEmail })
      });

      const data = await res.json();
      if (res.ok) {
        setForgotPasswordSuccess('Password reset link sent (simulated). Account recovery successful!');
        setRecoveredCreds({ username: data.username, tempPass: data.tempPassword });
        setForgotPasswordEmail('');
      } else {
        setForgotPasswordError(data.error || 'Failed to process forgot password request.');
      }
    } catch (err) {
      setForgotPasswordError('Failed to connect to full-stack server.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  // Google OAuth Auth popup trigger
  const handleGoogleSignInPopup = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (accessToken) {
        setGoogleToken(accessToken);
        localStorage.setItem('kino_google_access_token', accessToken);
        setGoogleUser(result.user);
        alert('Successfully authorized Google Drive API! You can now crawl folders recursively.');
      }
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      
      const isIframe = window.self !== window.top;
      const isPopupErr = err.code?.includes('popup-blocked') || 
                          err.code?.includes('cancelled-popup-request') || 
                          err.message?.includes('popup') || 
                          err.message?.includes('cancelled') ||
                          err.message?.includes('assertion');
      
      if (isIframe || isPopupErr) {
        setShowIframeAuthModal(true);
      } else {
        alert(`Google Connection Failed: ${err.message || 'Check firestore setup'}`);
      }
    }
  };

  // Logouts
  const handleLogoutAdmin = () => {
    setToken(null);
    setAdminUser(null);
    localStorage.removeItem('kino_admin_token');
  };

  const handleClearGoogleCredentials = async () => {
    await auth.signOut();
    setGoogleToken(null);
    setGoogleUser(null);
    localStorage.removeItem('kino_google_access_token');
    alert('Cleared cached Google credentials.');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center p-6 text-gray-400">
        <Loader className="w-8 h-8 text-cyan-400 animate-spin mb-4" />
        <p className="font-display font-medium text-white tracking-wide">Initializing KinoIndex Workspace...</p>
      </div>
    );
  }

  // PUBLIC RENDERING ROUTE PREVIEW
  if (publicSlug) {
    return (
      <PublicIndexPages
        slug={publicSlug}
        googleToken={googleToken}
        onBack={token ? () => changeUrlPath('/') : undefined}
        user={adminUser}
        googleUser={googleUser}
        setGoogleToken={setGoogleToken}
        setGoogleUser={setGoogleUser}
        onGoogleSignIn={async (email, name, fid) => {
          try {
            const res = await fetch('/api/auth/google-callback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, name, fileId: fid })
            });
            if (res.ok) {
              const data = await res.json();
              setToken(data.token);
              setAdminUser(data.user);
              localStorage.setItem('kino_admin_token', data.token);
              return data.user;
            }
          } catch (err) {
            console.error('Google callback error:', err);
          }
          return null;
        }}
      />
    );
  }

  // DOWNLOAD PORTAL LANDING PAGE
  if (downloadFileId) {
    return (
      <DownloadLandingPage
        fileId={downloadFileId}
        googleToken={googleToken}
        googleUser={googleUser}
        user={adminUser}
        setGoogleToken={(tok) => {
          setGoogleToken(tok);
          if (tok) {
            localStorage.setItem('kino_google_access_token', tok);
          } else {
            localStorage.removeItem('kino_google_access_token');
          }
        }}
        setGoogleUser={setGoogleUser}
        onGoogleSignIn={async (email, name, fid) => {
          try {
            const res = await fetch('/api/auth/google-callback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, name, fileId: fid })
            });
            if (res.ok) {
              const data = await res.json();
              setToken(data.token);
              setAdminUser(data.user);
              localStorage.setItem('kino_admin_token', data.token);
              return data.user;
            }
          } catch (err) {
            console.error('Google callback error:', err);
          }
          return null;
        }}
        onBack={() => {
          changeUrlPath('/');
        }}
      />
    );
  }

  // ADMINISTRATIVE SECURE LOGIN / REGISTER
  if (!token) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center p-4 md:p-6 font-sans">
        <div className="max-w-md w-full bg-brand-card rounded-3xl p-6 md:p-8 border border-slate-800 space-y-6 shadow-2xl relative select-none">
          
          <div className="text-center space-y-1.5 cursor-default">
            {/* Logo */}
            <span className="p-3 bg-gradient-to-tr from-cyan-500 to-indigo-600 text-slate-950 rounded-2xl font-black text-xl tracking-tighter inline-block mb-2">
              KI
            </span>
            <h2 className="text-2xl font-display font-bold text-white tracking-tight animate-fade-in">
              {isSigningUp ? 'Join KinoIndex' : 'KinoIndex Auth Gate'}
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              {isSigningUp 
                ? 'Sign up with a new account to request indexes access from administrators.' 
                : 'Sign in with your credentials to catalog drives, view metrics, and publish indexes.'}
            </p>
          </div>

          {showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4 text-sm animate-fade-in">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Registered Email Address
                </label>
                <input
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              {forgotPasswordError && (
                <div className="p-3 bg-red-955/20 border border-red-900/60 text-red-350 text-xs rounded-xl text-center font-medium">
                  {forgotPasswordError}
                </div>
              )}

              {forgotPasswordSuccess && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-xl space-y-1.5 font-medium">
                  <div>{forgotPasswordSuccess}</div>
                  {recoveredCreds && (
                    <div className="mt-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-mono space-y-1 text-left select-all">
                      <div><strong className="text-cyan-400">Username:</strong> @{recoveredCreds.username}</div>
                      <div><strong className="text-cyan-400">Temp Password:</strong> {recoveredCreds.tempPass}</div>
                      <div className="text-[10px] text-gray-500 pt-1">Please log in and update your password in account settings immediately.</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotPasswordError('');
                    setForgotPasswordSuccess('');
                    setRecoveredCreds(null);
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-755 text-gray-300 font-semibold py-3 rounded-xl text-center cursor-pointer text-xs border-0"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  disabled={forgotPasswordLoading}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-3 rounded-xl text-center glow-btn cursor-pointer disabled:opacity-50 text-xs border-0"
                >
                  {forgotPasswordLoading ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Reset Password'}
                </button>
              </div>
            </form>
          ) : !isSigningUp ? (
            <form onSubmit={handleLogin} className="space-y-4 text-sm animate-fade-in">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Username or Email
                </label>
                <input
                  type="text"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="e.g. superadmin"
                  className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(true);
                      setForgotPasswordError('');
                      setForgotPasswordSuccess('');
                    }}
                    className="text-[10px] text-cyan-400 hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-slate-900 border border-slate-755 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              {loginError && (
                <div className="p-3 bg-red-950/20 border border-red-900/60 text-red-400 text-xs rounded-xl text-center font-medium">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-cyan-500 hover:bg-cyan-600 hover:scale-[1.01] transition active:scale-95 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 text-sm glow-btn cursor-pointer disabled:opacity-50"
              >
                {loginLoading ? <Loader className="w-4 h-4 animate-spin mr-1" /> : 'Enter Dashboard'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4 text-sm animate-fade-in">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  placeholder="e.g. johndoe"
                  className="w-full bg-slate-900 border border-slate-750 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-slate-900 border border-slate-755 rounded-xl px-4 py-3 text-white placeholder-slate-650 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              {registerError && (
                <div className="p-3 bg-red-950/20 border border-red-900/60 text-red-400 text-xs rounded-xl text-center font-medium">
                  {registerError}
                </div>
              )}

              {registerSuccess && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-xl text-center font-medium">
                  {registerSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={registerLoading}
                className="w-full bg-cyan-500 hover:bg-cyan-600 hover:scale-[1.01] transition active:scale-95 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 text-sm glow-btn cursor-pointer disabled:opacity-50"
              >
                {registerLoading ? <Loader className="w-4 h-4 animate-spin mr-1" /> : 'Create Account'}
              </button>
            </form>
          )}

          {/* Switch toggle layout */}
          <div className="text-center pt-2">
            <button
              onClick={() => {
                setIsSigningUp(!isSigningUp);
                setShowForgotPassword(false);
                setLoginError('');
                setRegisterError('');
                setRegisterSuccess('');
              }}
              className="text-xs text-cyan-400 hover:underline bg-transparent border-none cursor-pointer"
            >
              {isSigningUp ? 'Already have credentials? Sign In instead' : 'Need an account? Sign Up from URL'}
            </button>
          </div>


        </div>
      </div>
    );
  }

  const renderUserAvatar = (user: any) => {
    if (user?.avatarUrl) {
      if (user.avatarUrl.startsWith('preset:')) {
        const parts = user.avatarUrl.replace('preset:', '').split('::');
        const gradientClass = parts[0];
        const iconName = parts[1] || 'user';
        return (
          <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-white border border-slate-750 shadow-sm shrink-0`}>
            {iconName === 'sparkles' && <Sparkles className="w-4 h-4" />}
            {iconName === 'flame' && <Flame className="w-4 h-4" />}
            {iconName === 'ghost' && <Ghost className="w-4 h-4" />}
            {iconName === 'shield' && <Shield className="w-4 h-4" />}
            {iconName === 'user' && <UserIcon className="w-4 h-4" />}
          </div>
        );
      }
      return (
        <img 
          src={user.avatarUrl} 
          alt={user.name} 
          referrerPolicy="no-referrer"
          className="w-8 h-8 rounded-full object-cover border border-slate-750 shadow-sm shrink-0"
        />
      );
    }
    const initials = (user?.name || '?').substring(0, 2).toUpperCase();
    return (
      <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 font-display font-semibold text-xs shrink-0 select-none">
        {initials}
      </div>
    );
  };

  // RESTFUL MASTER ACCESS CONTROL - Only permit Super Admin and Admin roles inside the Main Console
  if (adminUser && adminUser.role !== 'Super Admin' && adminUser.role !== 'Admin') {
    const isPremium = adminUser.role === 'Premium';
    
    // Callback to refresh the user from App component's token state when upgraded
    const handleRefreshUser = async () => {
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          setAdminUser(meData.user);
        }
      } catch (err) {
        console.error('Error refreshing member info:', err);
      }
    };

    return (
      <div className="min-h-screen bg-brand-dark text-gray-200 flex flex-col font-sans select-text">
        {/* Header */}
        <header className="bg-brand-card border-b border-slate-900 px-4 md:px-6 py-3.5 sticky top-0 z-40 flex items-center justify-between select-none">
          <div className="flex items-center gap-3 text-left">
            {/* Styled Rounded Icon from the screenshot: lime-400 to cyan-400 gradient */}
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#a3e635] via-[#a3e635] to-[#06b6d4] flex items-center justify-center shadow-lg shadow-lime-500/10 border border-transparent shrink-0">
              <svg className="w-5 h-5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v12a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6Z" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="flex items-baseline gap-0.5 select-none font-display">
                <span className="text-md md:text-lg font-black italic tracking-tight text-[#a2d645] drop-shadow-sm font-sans uppercase">Kino</span>
                <span className="text-md md:text-lg font-black italic tracking-wide text-[#3fc1f5] drop-shadow-sm font-sans uppercase">MM</span>
              </div>
              <span className="text-[8px] font-bold text-gray-400 tracking-wide block leading-none select-none uppercase">
                {isPremium ? 'Premium Lounge' : 'Member Portal'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-1.5 pr-3">
              <div className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs uppercase select-none ${isPremium ? 'bg-indigo-500 text-slate-950' : 'bg-slate-700 text-gray-300'}`}>
                {adminUser.name ? adminUser.name.charAt(0) : 'U'}
              </div>
              <div className="text-left leading-none">
                <span className="text-xs font-semibold text-white block select-text">{adminUser.name}</span>
                <span className="text-[9px] uppercase font-mono text-cyan-400 font-bold block">
                  {isPremium ? 'Premium User' : 'Standard Viewer'}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogoutAdmin}
              className="bg-slate-850 hover:bg-slate-800 text-gray-400 hover:text-white p-2 rounded-xl transition cursor-pointer border-0 inline-flex items-center justify-center"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Space */}
        <main className="flex-1 max-w-lg w-full mx-auto p-4 md:p-6 space-y-6">
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="text-left">
              <h2 className="text-xl font-bold text-white max-w-sm tracking-tight leading-relaxed select-none">
                Welcome to KinoIndex {isPremium ? 'Premium Lounge!' : 'Member Console'}
              </h2>
              <p className="text-xs text-gray-400 max-w-lg mt-1 select-none">
                {isPremium 
                  ? 'As our premium member, you possess exclusive request privileges. Enter movie specifications below to broadcast high-priority requests.'
                  : 'Submit high priority media requests below, or redeem a coupon to upgrade to a premium account.'
                }
              </p>
            </div>
            <div className={`p-2.5 rounded-xl text-[10px] font-mono select-none border whitespace-nowrap ${isPremium ? 'bg-indigo-950/20 text-indigo-400 border-indigo-900/55' : 'bg-slate-900/40 text-slate-500 border-slate-800'}`}>
              STATUS: {isPremium ? 'PREMIUM ACTIVE' : 'STANDARD VIEWER'}
            </div>
          </div>

          <RequestedMoviesPage token={token} user={adminUser} onUserUpdate={handleRefreshUser} />
        </main>

        <footer className="bg-brand-card/30 border-t border-slate-900 py-3 text-center text-[10px] font-mono uppercase tracking-wider text-slate-500">
          KinoIndex Member Console • Stable Client Side Context
        </footer>
      </div>
    );
  }

  // SECURE MASTER ADMINISTRATION LAYOUT
  return (
    <div className="min-h-screen bg-brand-dark text-gray-200 flex flex-col font-sans">
      {/* Top Main Admin Header */}
      <header className="bg-brand-card border-b border-slate-900 px-4 md:px-6 py-3.5 sticky top-0 z-40 flex items-center justify-between">
        
        <div className="flex items-center gap-3 text-left">
          {/* 3-dash hamburger toggle button for Main Console sidebar */}
          <button
            onClick={() => setIsConsoleSidebarOpen(!isConsoleSidebarOpen)}
            className="p-1 px-1.5 text-gray-400 hover:text-white hover:bg-slate-900/40 rounded-lg transition cursor-pointer border-0 bg-transparent flex items-center justify-center shrink-0"
            title={isConsoleSidebarOpen ? "Hide Console Sidebar" : "Show Console Sidebar"}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Styled Rounded Icon from the screenshot: lime-400 to cyan-400 gradient */}
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#a3e635] via-[#a3e635] to-[#06b6d4] flex items-center justify-center shadow-lg shadow-lime-500/10 border border-transparent shrink-0">
            <svg className="w-5 h-5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v12a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6Z" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="flex items-baseline gap-0.5 select-none font-display">
              <span className="text-md md:text-lg font-black italic tracking-tight text-[#a2d645] drop-shadow-sm font-sans uppercase">Kino</span>
              <span className="text-md md:text-lg font-black italic tracking-wide text-[#3fc1f5] drop-shadow-sm font-sans uppercase">MM</span>
            </div>
            <span className="text-[8px] font-bold text-gray-400 tracking-wide block leading-none select-none uppercase">
              Every Movie. One Place. 🎬
            </span>
          </div>
          {adminUser?.role === 'Super Admin' && (
            <span className="ml-1.5 font-mono text-[9px] bg-cyan-950/45 text-cyan-400 border border-cyan-900/65 rounded px-1.5 py-0.5 uppercase font-semibold select-none">ADMIN PANEL</span>
          )}
        </div>

        {/* Action Widgets */}
        <div className="flex items-center gap-4">
          
          {/* Google Credentials Status sync */}
          {adminUser?.role === 'Super Admin' && (
            <div className="hidden sm:flex items-center gap-2">
              {googleToken ? (
                <div className="flex items-center gap-2 bg-emerald-950/20 border border-emerald-900/40 px-3 py-1.5 rounded-xl">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-xs text-emerald-300 font-mono">Google Synced</span>
                  <button
                    onClick={handleClearGoogleCredentials}
                    className="text-[10px] text-gray-400 hover:text-red-400 font-semibold border-0 bg-transparent ml-1 hover:underline cursor-pointer"
                  >
                    Clear Auth
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleSignInPopup}
                  className="bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/60 text-indigo-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer font-sans"
                >
                  Sync Google Drive API
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {adminUser?.role === 'Super Admin' && (
              <>
                <Bell className="w-4.5 h-4.5 text-gray-400 hover:text-white cursor-pointer" />
                <span className="w-px h-5 bg-slate-800" />
              </>
            )}
            
            <div 
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 select-none hover:opacity-85 active:scale-98 transition cursor-pointer p-0.5 rounded-xl hover:bg-slate-900/40"
              title="My Account Settings"
            >
              {renderUserAvatar(adminUser)}
              <div className="hidden md:block text-left">
                <span className="text-xs font-semibold text-white block select-text">{adminUser?.name || 'Admin'}</span>
                <span className="text-[10px] uppercase font-mono text-gray-500 font-bold block">{adminUser?.role}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Admin body partition layout with sidebar and content area */}
      <div className="flex flex-1">
        {/* Navigation Sidebar */}
        {isConsoleSidebarOpen && (
          <aside className="w-64 bg-brand-card border-r border-slate-900/80 p-5 shrink-0 flex flex-col justify-between animate-fade-in">
            <div className="space-y-6">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 font-mono px-3">
                  Main Console
                </span>

                <nav className="space-y-1 pt-1 font-medium text-sm">
                  <button
                    onClick={() => setCurrentPage('dashboard')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer border-0 ${
                      currentPage === 'dashboard' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-gray-400 hover:text-white hover:bg-slate-900/60'
                    }`}
                  >
                    <LayoutGrid className="w-4.5 h-4.5" /> Dashboard
                  </button>

                  {(adminUser?.role === 'Super Admin' || adminUser?.role === 'Admin') && (
                    <button
                      onClick={() => setCurrentPage('folders')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer border-0 ${
                        currentPage === 'folders' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-gray-400 hover:text-white hover:bg-slate-900/60'
                      }`}
                    >
                      <HardDrive className="w-4.5 h-4.5" /> Drive Folders
                    </button>
                  )}

                  {(adminUser?.role === 'Super Admin' || adminUser?.role === 'Admin') && (
                    <button
                      onClick={() => setCurrentPage('requests')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer border-0 ${
                        currentPage === 'requests' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-gray-400 hover:text-white hover:bg-slate-900/60'
                      }`}
                    >
                      <Sparkles className="w-4.5 h-4.5 text-amber-400 animate-pulse" /> Requested Movies
                    </button>
                  )}

                  {adminUser?.role === 'Super Admin' && (
                    <button
                      onClick={() => setCurrentPage('settings')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer border-0 ${
                        currentPage === 'settings' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-gray-400 hover:text-white hover:bg-slate-900/60'
                      }`}
                    >
                      <SettingsIcon className="w-4.5 h-4.5" /> Settings
                    </button>
                  )}
                </nav>
              </div>
            </div>

            {/* Sidebar bottom */}
            <div className="space-y-4">
              {/* Google credentials mobile status sync */}
              {adminUser?.role === 'Super Admin' && (
                <div className="sm:hidden border-t border-slate-850 pt-3">
                  {googleToken ? (
                    <span className="text-[10px] text-emerald-400 font-mono block">Google synced</span>
                  ) : (
                    <button
                      onClick={handleGoogleSignInPopup}
                      className="w-full text-center bg-indigo-900/10 text-indigo-300 border border-indigo-805 text-[11px] py-1 px-2 rounded"
                    >
                      Sync Google Drive
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleLogoutAdmin}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-955/10 rounded-xl transition cursor-pointer text-sm font-semibold border-0 bg-transparent"
              >
                <LogOut className="w-4.5 h-4.5 text-red-400" /> Sign Out Session
              </button>
            </div>
          </aside>
        )}

        {/* Content main block viewport */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full transition">
          {currentPage === 'dashboard' && (
            <Dashboard
              token={token}
              googleToken={googleToken}
              onNavigate={(page) => setCurrentPage(page as any)}
              onOpenFolder={(fol) => changeUrlPath(`/s/${fol.slug}`)}
              userRole={adminUser?.role || 'Viewer'}
            />
          )}

          {currentPage === 'folders' && (
            <DriveFoldersPage
              token={token}
              googleToken={googleToken}
              onOpenFolder={(fol) => changeUrlPath(`/s/${fol.slug}`)}
              userRole={adminUser?.role || 'Viewer'}
            />
          )}

          {currentPage === 'settings' && adminUser?.role === 'Super Admin' && (
            <SettingsPage
              token={token}
              userRole={adminUser?.role || 'Viewer'}
            />
          )}

          {currentPage === 'requests' && (adminUser?.role === 'Super Admin' || adminUser?.role === 'Admin') && (
            <RequestedMoviesPage
              token={token}
              user={adminUser}
            />
          )}
        </main>
      </div>

      {/* Footer information bar */}
      <footer className="bg-brand-card/30 border-t border-slate-900 py-3 text-center text-[10px] text-gray-600 font-mono uppercase tracking-wider text-slate-500">
        KinoIndex Engine v1.0.0 • Persistent storage local DB • Cloudflare workers-ready
      </footer>

      {/* Iframe Login Warning Dialog Modals */}
      {showIframeAuthModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 text-left">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm md:max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-2.5 bg-amber-950/45 rounded-xl border border-amber-900/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide">Google Sign-In notice</h4>
                <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Iframe Sandbox Blocked Popup</p>
              </div>
            </div>
            
            <p className="text-xs text-gray-300 leading-relaxed">
              Because the application is running nested inside AI Studio's sandbox frame, Google's popup authenticator is blocked by browser cross-origin constraints.
            </p>

            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-850 space-y-1.5 text-[11px] text-slate-400">
              <span className="font-bold text-gray-300 uppercase tracking-wide text-[10px] block font-mono">Instant Fix:</span>
              <p>1. Open the application directly in a **new top-level browser tab**.</p>
              <p>2. Then click the <strong className="text-cyan-400 font-semibold">"Sync Google Drive API"</strong> button there.</p>
              <p>3. This securely caches your authentication credentials so you can refresh this page and continue.</p>
            </div>

            <div className="flex gap-2.5 pt-1 text-xs">
              <button
                type="button"
                onClick={() => setShowIframeAuthModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-755 border border-slate-700 text-white font-medium py-2 rounded-xl transition cursor-pointer"
              >
                Go Back
              </button>
              
              <a
                href={window.location.origin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-slate-950 font-bold py-2 rounded-xl text-center transition flex items-center justify-center gap-1 cursor-pointer"
              >
                Open App in New Tab
              </a>
            </div>
          </div>
        </div>
      )}

      {adminUser && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={adminUser}
          token={token}
          onUpdateUser={(updated) => {
            setAdminUser(updated);
          }}
        />
      )}
    </div>
  );
}
