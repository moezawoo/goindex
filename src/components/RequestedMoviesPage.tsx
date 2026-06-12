/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Film, Calendar, Loader, Send, Bell, Plus, Shield, Check, Clock, RefreshCw } from 'lucide-react';
import { User } from '../types';

interface MovieRequest {
  id: string;
  movieName: string;
  releaseYear: number;
  requestedByUserId: string;
  requestedByUsername: string;
  requestedByEmail: string;
  requestedAt: string;
  uploaded: boolean;
  uploadedAt: string | null;
  uploadedByUserId: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
}

interface RequestedMoviesPageProps {
  token: string | null;
  user: User | null;
  onUserUpdate?: () => void;
}

export default function RequestedMoviesPage({ token, user, onUserUpdate }: RequestedMoviesPageProps) {
  const [requests, setRequests] = useState<MovieRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Submit Form States for Premium / Viewer user
  const [movieName, setMovieName] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Coupon States as requested to be displayed below the form
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponSuccess, setCouponSuccess] = useState('');
  const [couponError, setCouponError] = useState('');

  // General Error / Info State
  const [errorMsg, setErrorMsg] = useState('');

  const isAdminOrSuper = user?.role === 'Super Admin' || user?.role === 'Admin';
  const isSuperAdmin = user?.role === 'Super Admin';

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/movie-requests', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      } else {
        setErrorMsg('Failed to load movie requests list');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error fetching requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchRequests();
    }
  }, [token]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (user?.role === 'Viewer') {
      setSubmitError('Movie requested is available only for premium user.');
      return;
    }

    if (!movieName.trim()) {
      setSubmitError('Movie title is required.');
      return;
    }
    const yearNum = Number(releaseYear);
    if (!releaseYear || isNaN(yearNum) || yearNum < 1880 || yearNum > 2100) {
      setSubmitError('Please enter a valid release year (between 1880 and 2100).');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/movie-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          movieName: movieName.trim(),
          releaseYear: yearNum
        })
      });

      if (res.ok) {
        setSubmitSuccess('Movie request successfully submitted! Admins have been notified.');
        setMovieName('');
        setReleaseYear('');
        fetchRequests();
      } else {
        const errData = await res.json().catch(() => ({}));
        setSubmitError(errData.error || 'Failed to submit movie request');
      }
    } catch (err) {
      console.error(err);
      setSubmitError('Network failure submitting request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUploaded = async (reqId: string, currentVal: boolean) => {
    if (!isAdminOrSuper) return;
    try {
      const res = await fetch(`/api/movie-requests/${reqId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uploaded: !currentVal
        })
      });
      if (res.ok) {
        fetchRequests();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to update uploaded state');
      }
    } catch (err) {
      console.error(err);
      alert('Network failure toggling uploaded.');
    }
  };

  const handleToggleConfirmed = async (reqId: string, currentVal: boolean) => {
    if (!isSuperAdmin) {
      alert('Only Super Admins can confirm movie uploads.');
      return;
    }
    try {
      const res = await fetch(`/api/movie-requests/${reqId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          confirmed: !currentVal
        })
      });
      if (res.ok) {
        fetchRequests();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to update confirmed state');
      }
    } catch (err) {
      console.error(err);
      alert('Network failure toggling confirmed.');
    }
  };

  // Helper lists
  const myRequests = requests.filter(r => r.requestedByUserId === user?.id);
  
  // Completed requests that are NOT yet 48 hours old (or active in state) and have both checked
  const myNotifications = myRequests.filter(r => r.uploaded && r.confirmed);

  return (
    <div className="space-y-6">
      {isAdminOrSuper ? (
        /* ADMIR/SUPER ADMIN VIEW: ONLY core active queue table */
        <div id="admin-movie-requests-panel" className="space-y-4">
          <div className="bg-brand-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-850 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white select-none">Active Media Requests Queue</h3>
                <p className="text-xs text-gray-400 select-none">
                  Audit requested movies, mark as uploaded, and confirm availability.
                </p>
              </div>
              <button 
                onClick={fetchRequests}
                className="p-1 px-1.5 text-gray-400 hover:text-white transition rounded-lg border border-slate-800 hover:bg-slate-900 flex items-center gap-1 text-[10px] uppercase font-mono cursor-pointer"
                title="Refresh queue"
              >
                <RefreshCw className="w-3" /> Refresh
              </button>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left text-slate-300">
                <thead className="bg-slate-900/60 font-mono text-[10px] uppercase text-gray-500 border-b border-slate-805">
                  <tr>
                    <th className="py-2.5 px-4 select-none">Movie Name</th>
                    <th className="py-2.5 px-4 select-none">Release Year</th>
                    <th className="py-2.5 px-4 select-none">Requester</th>
                    <th className="py-2.5 px-4 select-none text-center">Uploaded</th>
                    <th className="py-2.5 px-4 select-none text-center whitespace-nowrap">Confirmed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <Loader className="w-4 h-4 animate-spin inline-block mr-2 text-cyan-400" /> Loading request matrix...
                      </td>
                    </tr>
                  ) : requests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 leading-relaxed select-none">
                        No movie requests are currently active.
                      </td>
                    </tr>
                  ) : (
                    requests.map(req => (
                      <tr 
                        key={req.id} 
                        className={`hover:bg-slate-900/25 transition duration-150 ${
                          req.uploaded && req.confirmed ? 'bg-slate-950/20 text-gray-500' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <span className="flex items-center gap-1.5">
                            <Film className="w-3.5 h-3.5 text-slate-500" />
                            {req.movieName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono select-all">
                          {req.releaseYear}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-[10px] text-gray-400">
                            <span className="text-white block font-semibold">{req.requestedByUsername}</span>
                            <span className="text-slate-500 block text-[9px] font-mono">{req.requestedByEmail}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={req.uploaded}
                              onChange={() => handleToggleUploaded(req.id, req.uploaded)}
                              className="w-4.5 h-4.5 text-cyan-600 bg-slate-950 border-slate-800 rounded focus:ring-cyan-500 focus:ring-opacity-25 transition cursor-pointer"
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              disabled={!isSuperAdmin}
                              checked={req.confirmed}
                              onChange={() => handleToggleConfirmed(req.id, req.confirmed)}
                              className="w-4.5 h-4.5 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 focus:ring-opacity-25 transition cursor-pointer disabled:opacity-50"
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Simulated 48 Hours Accelerator for evaluation testing */}
            {requests.some(req => req.uploaded && req.confirmed) && (
              <div className="p-3 bg-slate-950/80 border-t border-slate-850 flex items-center justify-between text-[11px] text-gray-400 select-none">
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-amber-500" /> Admin Sandbox Simulation Mode
                </span>
                <button
                  onClick={async () => {
                    const ans = window.confirm("Do you want to simulate setting the confirmation time of these requests to 48 hours ago to trigger instant auto-cleanup removal?");
                    if (!ans) return;
                    try {
                      const res = await fetch('/api/movie-requests/simulate-expiration', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (res.ok) {
                        alert("Successfully simulated 48 hours passing! Completed requests have been automatically cleaned up.");
                        fetchRequests();
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="bg-amber-600/20 text-amber-400 border border-amber-900/50 hover:bg-amber-600 hover:text-white transition px-2 py-1 rounded cursor-pointer font-bold text-[10px]"
                >
                  Accelerate Time (Fast Forward 48 Hours)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* STANDARD MEMBER VIEW (Viewer or Premium): Form & Coupon block, NO Queue table */
        <div id="standard-movie-requests-panel" className="space-y-6">
          {/* Notifications banner for active Premium user */}
          {user?.role === 'Premium' && myNotifications.length > 0 && (
            <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase font-mono text-cyan-400 flex items-center gap-1.5 select-none text-left">
                <Bell className="w-4 h-4 text-cyan-400 animate-pulse" /> Active Notification Matrix
              </h4>
              <div className="space-y-2">
                {myNotifications.map(notif => (
                  <div 
                    key={notif.id} 
                    className="bg-brand-dark/50 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-100"
                  >
                    <div className="space-y-0.5 text-left">
                      <p>
                        Your requested movie <strong className="text-white font-semibold">{notif.movieName} ({notif.releaseYear})</strong> is now available on our drive.
                      </p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-500" /> Auto-removing from request pool 48 hours after confirmation.
                      </p>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400 border border-emerald-900/50 bg-emerald-950/20 px-2 py-0.5 rounded uppercase select-none">
                      Available
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-brand-card rounded-2xl border border-slate-800 p-5 space-y-4 text-left">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 select-none">
                  <Send className="w-4 h-4 text-cyan-400" /> Send Movie Request
                </h3>
                <p className="text-xs text-gray-400 select-none">
                  Submit a high-priority media request. Our curation team will find and process it.
                </p>
              </div>

              <form onSubmit={handleSubmitRequest} className="space-y-3">
                {submitSuccess && (
                  <div className="bg-emerald-955/30 border border-emerald-900 text-emerald-400 p-2.5 rounded-xl text-xs">
                    {submitSuccess}
                  </div>
                )}
                {submitError && (
                  <div className="bg-red-955/30 border border-red-900 text-red-400 p-2.5 rounded-xl text-xs">
                    {submitError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] uppercase font-mono text-gray-400 font-bold mb-1 select-none">
                    Movie Name
                  </label>
                  <div className="relative">
                    <Film className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={movieName}
                      onChange={(e) => {
                        setMovieName(e.target.value);
                        setSubmitError('');
                        setSubmitSuccess('');
                      }}
                      placeholder="e.g. Inception"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 pointer-events-auto"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono text-gray-400 font-bold mb-1 select-none">
                    Release Year
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="number"
                      required
                      min="1880"
                      max="2100"
                      value={releaseYear}
                      onChange={(e) => {
                        setReleaseYear(e.target.value);
                        setSubmitError('');
                        setSubmitSuccess('');
                      }}
                      placeholder="e.g. 2010"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 pointer-events-auto"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 transition text-slate-950 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer border-0 mt-2"
                >
                  {submitting ? (
                    <>
                      <Loader className="w-3.5 h-3.5 animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Submit Request
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Request Premium by Coupon card right below the request form - only shown to standard Viewer roles */}
            {user?.role === 'Viewer' && (
              <div className="bg-brand-card rounded-2xl border border-slate-800 p-5 space-y-4 text-left">
                <div className="space-y-1">
                  <span className="font-bold text-white uppercase tracking-wide text-xs block font-display">
                    Request Premium by Coupon
                  </span>
                  <p className="text-xs text-gray-450 select-none leading-relaxed">
                    Redeem a valid promotion coupon code here to instantly upgrade your account role to <strong className="text-cyan-400 font-semibold">Premium</strong> status.
                  </p>
                </div>

                <div className="flex gap-1.5 pt-1.5">
                  <input
                    type="text"
                    placeholder="ENTER PROMO CODE"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponError('');
                      setCouponSuccess('');
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white flex-1 focus:ring-1 focus:ring-cyan-500 focus:outline-none uppercase placeholder-slate-600 pointer-events-auto"
                  />
                  <button
                    type="button"
                    disabled={couponLoading}
                    onClick={async () => {
                      const code = couponCode.trim();
                      if (!code) {
                        setCouponError('Please enter a coupon code.');
                        return;
                      }
                      setCouponLoading(true);
                      setCouponError('');
                      setCouponSuccess('');
                      try {
                        const res = await fetch('/api/coupons/redeem', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({ code })
                        });
                        if (res.ok) {
                          setCouponSuccess('Success! Your account has been upgraded to Premium.');
                          setCouponCode('');
                          if (onUserUpdate) {
                            onUserUpdate();
                          }
                        } else {
                          const errData = await res.json().catch(() => ({}));
                          setCouponError(errData.error || 'Failed to redeem coupon.');
                        }
                      } catch (err) {
                        console.error(err);
                        setCouponError('Network error redeeming coupon.');
                      } finally {
                        setCouponLoading(false);
                      }
                    }}
                    className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 font-bold px-4 rounded-xl text-xs text-slate-950 transition cursor-pointer border-0 shrink-0 font-semibold"
                  >
                    {couponLoading ? 'Redeeming...' : 'Redeem'}
                  </button>
                </div>

                {couponSuccess && (
                  <div className="p-2.5 bg-emerald-955/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-xl font-mono">
                    {couponSuccess}
                  </div>
                )}
                {couponError && (
                  <div className="p-2.5 bg-red-955/20 border border-red-900/60 text-red-500 text-xs rounded-xl font-mono">
                    {couponError}
                  </div>
                )}
                
                <p className="text-[10px] text-gray-500 italic mt-1">
                  "Promo codes can be generated under standard Settings &gt; Promotion Coupons tab as Super Admin"
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
