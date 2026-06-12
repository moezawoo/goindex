/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Database as DbIcon, Download, Eye, Clock, Layers, Flame, ArrowRight, CheckCircle2, AlertCircle, Loader } from 'lucide-react';
import { Folder } from '../types';

interface DashboardProps {
  token: string | null;
  googleToken: string | null;
  onNavigate: (page: string) => void;
  onOpenFolder: (folder: Folder) => void;
  userRole: string;
}

export default function Dashboard({ token, googleToken, onNavigate, onOpenFolder, userRole }: DashboardProps) {
  const [driveUrl, setDriveUrl] = useState('');
  const [folderName, setFolderName] = useState('');
  const [indexingStatus, setIndexingStatus] = useState<'idle' | 'analyzing' | 'completed' | 'failed'>('idle');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalFolders: 0,
    downloadsToday: 0,
    viewsToday: 0,
    lifetimeViews: 0,
    lifetimeDownloads: 0,
    watchHours: 0
  });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Portal and custom roles state managers
  const [userFolders, setUserFolders] = useState<Folder[]>([]);
  const [loadingUserFolders, setLoadingUserFolders] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      setUpgradeLoading(true);
      setCouponError('');
      setCouponSuccess('');
      const res = await fetch('/api/users/upgrade-with-coupon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: couponCode.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setCouponSuccess(`Successfully upgraded to Premium! Duration is ${data.coupon.durationDays} days. Reloading...`);
        setUpgradeSuccess(true);
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setCouponError(data.error || 'Failed to redeem coupon code.');
      }
    } catch (err) {
      console.error(err);
      setCouponError('Error redeeming coupon code.');
    } finally {
      setUpgradeLoading(false);
    }
  };

  useEffect(() => {
    if (token && (userRole === 'Viewer' || userRole === 'Premium')) {
      const fetchPermittedFolders = async () => {
        try {
          setLoadingUserFolders(true);
          const res = await fetch('/api/folders', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            setUserFolders(await res.json());
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingUserFolders(false);
        }
      };
      fetchPermittedFolders();
    }
  }, [token, userRole]);

  // Date picker states
  const [fromDatePicker, setFromDatePicker] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [toDatePicker, setToDatePicker] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Slices google drive folder ID from URL
  const extractFolderId = (url: string) => {
    try {
      const match = url.match(/[-\w]{25,}/);
      return match ? match[0] : '';
    } catch (_) {
      return '';
    }
  };

  const getDaysCount = () => {
    try {
      const s = new Date(fromDatePicker);
      const e = new Date(toDatePicker);
      const diff = Math.abs(e.getTime() - s.getTime());
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
      return isNaN(days) ? 0 : days;
    } catch {
      return 0;
    }
  };

  const formatRangeDisplay = () => {
    try {
      const s = new Date(fromDatePicker);
      const e = new Date(toDatePicker);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
      
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      const days = getDaysCount();
      return `${s.toLocaleDateString('en-US', options)} - ${e.toLocaleDateString('en-US', options)} (${days} ${days === 1 ? 'day' : 'days'})`;
    } catch {
      return '';
    }
  };

  const loadStats = async (fromDate = fromDatePicker, toDate = toDatePicker) => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (fromDate) queryParams.append('from', fromDate);
      if (toDate) queryParams.append('to', toDate);

      const res = await fetch(`/api/analytics/summary?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.summary);
        setChartData(data.charts);
        setRecentEvents(data.events || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      if (userRole !== 'Viewer' && userRole !== 'Premium') {
        loadStats();
      } else {
        setLoading(false);
      }
    }
  }, [token, userRole]);

  const handleQuickIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    
    if (!driveUrl) {
      setErrorMessage('Please provide a Google Drive folder URL');
      return;
    }

    if (userRole === 'Viewer') {
      setErrorMessage('Viewer accounts do not have permission to index folders');
      return;
    }

    const folderId = extractFolderId(driveUrl);
    if (!folderId) {
      setErrorMessage('Invalid Google Drive folder URL. Could not find folder ID.');
      return;
    }

    const finalName = folderName.trim() || `Drive Folder - ${folderId.substring(0, 6)}`;
    
    // Generate simple slug (e.g., Action Movies -> action-movies)
    const slug = finalName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-');

    setIndexingStatus('analyzing');

    try {
      // 1. Create Folder index placeholder in database
      const resCreate = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          folderId,
          folderName: finalName,
          slug
        })
      });

      if (!resCreate.ok) {
        const errorData = await resCreate.json();
        throw new Error(errorData.error || 'Failed to initialize folder index');
      }

      const createdFolder = await resCreate.json();

      // 2. Trigger crawl/indexing
      // If we have a live Google token, we use it. Otherwise we send a placeholder,
      // and server crawls with active proxy or executes fallback gracefully.
      const crawlRes = await fetch(`/api/folders/${createdFolder.id}/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accessToken: googleToken || 'demo_active_credential'
        })
      });

      if (!crawlRes.ok) {
        throw new Error('Crawl triggering failed.');
      }

      setIndexingStatus('completed');
      setGeneratedUrl(`${window.location.origin}/s/${slug}`);
      setDriveUrl('');
      setFolderName('');
      loadStats(); // reload numbers
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Indexing failed. Please check Drive sharing settings.');
      setIndexingStatus('failed');
    }
  };

  // Helper calculation for SVG path points on charts
  const getSvgPoints = (data: any[], key: string, height: number, width: number) => {
    if (!data || data.length === 0) return '';
    const maxVal = Math.max(...data.map(d => d[key] || 1), 5);
    const stepX = width / (data.length - 1);
    
    return data.map((d, index) => {
      const x = index * stepX;
      const y = height - ((d[key] || 0) / maxVal) * (height - 20) - 10;
      return `${x},${y}`;
    }).join(' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-32">
        <Loader className="w-8 h-8 text-cyan-400 animate-spin mr-3" />
        <span className="text-gray-400 font-medium">Crunching dashboard statistics...</span>
      </div>
    );
  }

  if (userRole === 'Viewer' || userRole === 'Premium') {
    return (
      <div className="space-y-6">
        {/* Banner Card */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-cyan-950/30 via-indigo-950/30 to-brand-card p-6 md:p-8 border border-slate-800/80 shadow-2xl">
          <div className="space-y-3 relative z-10">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" /> KinoIndex Cinema Portal
            </span>
            <h2 className="text-2.5xl md:text-3xl font-display font-bold text-white tracking-tight leading-none">
              Welcome, standard index member!
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
              Browsing movies, music, courses, anime files mirror indexes from fast secured GDrive proxies.
            </p>
            
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full ${
                userRole === 'Premium' ? 'bg-indigo-950/55 text-indigo-300 border border-indigo-900/40' : 'bg-slate-850 text-slate-300 border border-slate-800'
              }`}>
                Role Tier: {userRole}
              </span>

              {userRole === 'Viewer' && (
                <div className="w-full pt-4 border-t border-slate-850 mt-4 space-y-3">
                  <div className="text-[11px] text-gray-400 font-mono">
                    &bull; Contact a Super Admin or Admin user if you need to upgrade, or use a promotional coupon code below.
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl max-w-sm space-y-2.5">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 block font-mono">
                      Promote to Premium Self
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="COUPON CODE"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="bg-slate-900 text-white border border-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 flex-1 font-mono placeholder:text-gray-650 uppercase"
                      />
                      <button
                        onClick={handleRedeemCoupon}
                        disabled={upgradeLoading || !couponCode.trim()}
                        className="bg-cyan-500 hover:bg-cyan-600 font-bold px-4 py-2 rounded-xl text-xs text-slate-950 glow-btn flex items-center gap-1 disabled:opacity-50 cursor-pointer border-0"
                      >
                        {upgradeLoading ? (
                          <Loader className="w-3 animate-spin text-slate-950" />
                        ) : (
                          'Redeem ✨'
                        )}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-[10px] text-rose-450 font-mono italic">{couponError}</p>
                    )}
                    {couponSuccess && (
                      <p className="text-[10px] text-emerald-450 font-mono font-medium">{couponSuccess}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Categories Header */}
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-display font-semibold text-white">Your Authorized Category Indexes</h3>
            <p className="text-xs text-gray-400">These folders have been unlocked for your account. Click any block to view and play indexing streams.</p>
          </div>

          {loadingUserFolders ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-10 justify-center">
              <Loader className="w-4 h-4 animate-spin text-cyan-400" /> Fetching secure folders index...
            </div>
          ) : userFolders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userFolders.map(folder => (
                <div
                  key={folder.id}
                  onClick={() => onOpenFolder(folder)}
                  className="bg-brand-card hover:bg-slate-900/60 transition p-5 rounded-2xl border border-slate-800 cursor-pointer shadow hover:shadow-cyan-950/20 group relative overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <h4 className="text-md font-bold text-white group-hover:text-cyan-400 transition font-display">{folder.folderName}</h4>
                    <p className="text-xs text-gray-500 mt-1 uppercase font-mono">Slug: {folder.slug}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-3 border-t border-slate-850">
                    <span className="text-[10px] text-gray-400">Last Indexed: {folder.lastIndexed ? new Date(folder.lastIndexed).toLocaleDateString() : 'Never'}</span>
                    <span className="text-xs text-cyan-400 group-hover:translate-x-1 transition font-bold block">Enter &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-2xl p-8 text-center border border-slate-855 max-w-md mx-auto space-y-2">
              <AlertCircle className="w-10 h-10 text-gray-500 mx-auto" />
              <h4 className="text-md font-bold text-white">No indexes unlocked yet</h4>
              {userRole === 'Viewer' ? (
                <p className="text-xs text-gray-400 leading-relaxed">
                  Upgrade your standard Viewer account above to Premium to automatically query files in premium-gated indexes.
                </p>
              ) : (
                <p className="text-xs text-gray-400 leading-relaxed">
                  We are waiting for administrators/Super Admin to map folder index authorizations for your user account.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-white flex items-center gap-2">
            <DbIcon className="w-6 h-6 text-cyan-400" /> Dashboard Overview
          </h1>
          <p className="text-sm text-gray-400 mt-1">Real-time summaries and statistics of your films and indexed libraries.</p>
        </div>
        <div className="text-right text-xs text-gray-500 font-mono">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Grid Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Indexed Files */}
        <div id="stat-files-card" className="bg-brand-card rounded-xl p-5 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">Indexed Files</span>
            <h3 className="text-3xl font-display font-bold text-white mt-1">{stats.totalFiles}</h3>
            <span className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Source of truth Google Drive
            </span>
          </div>
          <div className="p-3 bg-cyan-950/40 rounded-xl text-cyan-400">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Indexed Folders */}
        <div id="stat-folders-card" className="bg-brand-card rounded-xl p-5 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">Active Folders</span>
            <h3 className="text-3xl font-display font-bold text-white mt-1">{stats.totalFolders}</h3>
            <span className="text-xs text-cyan-400 mt-1 cursor-pointer hover:underline" onClick={() => onNavigate('folders')}>
              Manage folders &rarr;
            </span>
          </div>
          <div className="p-3 bg-indigo-950/40 rounded-xl text-indigo-400">
            <DbIcon className="w-6 h-6" />
          </div>
        </div>

        {/* Downloads Today */}
        <div id="stat-downloads-card" className="bg-brand-card rounded-xl p-5 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">Downloads Today</span>
            <h3 className="text-3xl font-display font-bold text-white mt-1">{stats.downloadsToday}</h3>
            <span className="text-xs text-purple-400 mt-1 font-mono">
              Lifetime: {stats.lifetimeDownloads} total
            </span>
          </div>
          <div className="p-3 bg-fuchsia-950/40 rounded-xl text-fuchsia-300">
            <Download className="w-6 h-6" />
          </div>
        </div>

        {/* Streams Today */}
        <div id="stat-views-card" className="bg-brand-card rounded-xl p-5 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">Streams Today</span>
            <h3 className="text-3xl font-display font-bold text-white mt-1">{stats.viewsToday}</h3>
            <span className="text-xs text-amber-400 mt-1 font-mono">
              Lifetime: {stats.watchHours} Hours
            </span>
          </div>
          <div className="p-3 bg-amber-950/40 rounded-xl text-amber-400">
            <Eye className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions Widget */}
        <div id="quick-index-widget" className="lg:col-span-1 bg-brand-card rounded-xl p-5 border border-slate-800 flex flex-col justify-between h-full">
          <div>
            <h3 className="text-lg font-display font-semibold text-white mb-2">Quick Folder Indexer</h3>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Register a Google Drive folder link. The system recursively indexes structures with zero local copy buffers.
            </p>

            <form onSubmit={handleQuickIndex} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Drive Folder link</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-550 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Target Folder Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Action Movies"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-550 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-950/20 border border-red-900/60 text-red-400 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={indexingStatus === 'analyzing'}
                className="w-full bg-cyan-500 hover:bg-cyan-600 active:scale-95 transition text-slate-950 text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-1.5 glow-btn mt-4 cursor-pointer disabled:opacity-50"
              >
                {indexingStatus === 'analyzing' ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Crawling Subdirectories...
                  </>
                ) : (
                  <>
                    <DbIcon className="w-4 h-4" /> Index Folder
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Generated Link Result */}
          {generatedUrl && (
            <div className="mt-4 p-4 bg-slate-900 rounded-xl border border-slate-850 space-y-2">
              <span className="text-xs text-teal-400 font-semibold uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Generated Index URL
              </span>
              <p className="text-xs text-gray-300 font-mono select-all break-all bg-brand-card p-2 rounded border border-slate-800">
                {generatedUrl}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedUrl);
                    alert('Copied to clipboard!');
                  }}
                  className="text-[11px] text-cyan-400 font-semibold hover:underline bg-transparent border-0 cursor-pointer"
                >
                  Copy Link
                </button>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-400 font-semibold hover:underline flex items-center gap-0.5"
                >
                  Visit Public Screen <ArrowRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Chart Widget */}
        <div id="chart-widget" className="lg:col-span-2 bg-brand-card rounded-xl p-5 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div>
                <h3 className="text-lg font-display font-semibold text-white">Daily Traffic Graph</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-lg">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 font-mono">From</span>
                  <input
                    type="date"
                    value={fromDatePicker}
                    onChange={(e) => {
                      setFromDatePicker(e.target.value);
                      if (token) loadStats(e.target.value, toDatePicker);
                    }}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded px-2 py-0.5 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 font-mono">To</span>
                  <input
                    type="date"
                    value={toDatePicker}
                    onChange={(e) => {
                      setToDatePicker(e.target.value);
                      if (token) loadStats(fromDatePicker, e.target.value);
                    }}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded px-2 py-0.5 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>
            </div>

            {chartData.length > 0 ? (
              <div className="space-y-4">
                <div className="relative h-44 w-full bg-slate-900/60 rounded-lg p-2 border border-slate-850/60">
                  {/* Floating Interactive Tooltip */}
                  {hoveredIndex !== null && chartData[hoveredIndex] && (
                    <div 
                      className="absolute bg-slate-950/95 border border-slate-800 rounded-lg p-2.5 shadow-xl text-left pointer-events-none z-10 text-xs font-sans space-y-1"
                      style={{
                        left: `${Math.min(Math.max((hoveredIndex / (chartData.length - 1 || 1)) * 100 - 10, 2), 70)}%`,
                        top: '12px'
                      }}
                    >
                      <p className="text-[10px] text-gray-400 font-bold font-mono uppercase tracking-wider">{chartData[hoveredIndex].date}</p>
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Views: {chartData[hoveredIndex].views}
                        </span>
                        <span className="flex items-center gap-1 text-purple-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Downloads: {chartData[hoveredIndex].downloads}
                        </span>
                        <span className="flex items-center gap-1 text-amber-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Hours: {chartData[hoveredIndex].watchHours}h
                        </span>
                      </div>
                    </div>
                  )}

                  <svg className="w-full h-full" viewBox="0 0 500 150" preserveAspectRatio="none">
                    {/* Definitions for gorgeous gradients */}
                    <defs>
                      <linearGradient id="cyanGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="purpleGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Gridlines */}
                    <line x1="0" y1="20" x2="500" y2="20" stroke="#1e293b" strokeDasharray="3,3" />
                    <line x1="0" y1="75" x2="500" y2="75" stroke="#1e293b" strokeDasharray="3,3" />
                    <line x1="0" y1="130" x2="500" y2="130" stroke="#1e293b" strokeDasharray="3,3" />

                    {/* Filled Glow Under Chart Line */}
                    <path
                      d={`M 0,150 L ${getSvgPoints(chartData, 'views', 150, 500)} L 500,150 Z`}
                      fill="url(#cyanGlow)"
                    />
                    
                    {/* Glowing Flow Lines */}
                    <polyline
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                      points={getSvgPoints(chartData, 'views', 150, 500)}
                    />

                    <polyline
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="1.5"
                      points={getSvgPoints(chartData, 'downloads', 150, 500)}
                    />

                    {/* Interactive Hover Guides & Regions */}
                    {chartData.map((d, index) => {
                      const stepX = 500 / (chartData.length - 1 || 1);
                      const x = index * stepX;
                      return (
                        <g key={index}>
                          {hoveredIndex === index && (
                            <line
                              x1={x}
                              y1="0"
                              x2={x}
                              y2="150"
                              stroke="#64748b"
                              strokeOpacity="0.4"
                              strokeWidth="1.5"
                              strokeDasharray="2,2"
                            />
                          )}
                          <rect
                            x={Math.max(0, x - (stepX / 2))}
                            y="0"
                            width={stepX}
                            height="150"
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
                
                {/* Chart Legends */}
                <div className="flex justify-between items-center px-1">
                  <div className="flex gap-4 text-xs font-mono select-none">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-3 h-3 rounded-full bg-cyan-400" /> Streams (Views)
                    </span>
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <span className="w-3 h-3 rounded-full bg-purple-500" /> Direct Downloads
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono italic animate-pulse">Hover chart for daily details</span>
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-gray-500 text-sm">
                No telemetry traffic recorded yet.
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-4 mt-4">
            <div className="text-center">
              <span className="text-[10px] uppercase font-semibold text-gray-500">Streams/Month</span>
              <p className="text-lg font-display font-bold text-white mt-0.5">{stats.lifetimeViews * 8}</p>
            </div>
            <div className="text-center border-x border-slate-850">
              <span className="text-[10px] uppercase font-semibold text-gray-500">Est. Bandwidth</span>
              <p className="text-lg font-display font-bold text-white mt-0.5">{(stats.lifetimeDownloads * 1.8 + stats.lifetimeViews * 0.45).toFixed(1)} GB</p>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase font-semibold text-gray-500">Cache Hits</span>
              <p className="text-lg font-display font-bold text-emerald-400 mt-0.5">99.4%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Events List */}
      <div id="recent-logs-list" className="bg-brand-card rounded-xl p-5 border border-slate-800">
        <h3 className="text-lg font-display font-semibold text-white mb-3">Live Index Telemetry logs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs uppercase text-gray-500 border-b border-slate-805 font-mono">
              <tr>
                <th className="py-2.5 px-3">Date / Time</th>
                <th className="py-2.5 px-3">File Name</th>
                <th className="py-2.5 px-3 task-status">Event Type</th>
                <th className="py-2.5 px-3">Country</th>
                <th className="py-2.5 px-3">Client Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {recentEvents.length > 0 ? (
                recentEvents.map((ev, i) => (
                  <tr key={ev.id || i} className="hover:bg-slate-900/60 font-mono text-xs">
                    <td className="py-3 px-3 text-gray-500">{new Date(ev.createdAt).toLocaleString()}</td>
                    <td className="py-3 px-3 text-white max-w-xs truncate font-sans text-xs">{ev.fileName}</td>
                    <td className="py-3 px-3 uppercase text-xs">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        ev.eventType === 'download' ? 'bg-purple-950/40 text-purple-300' :
                        ev.eventType === 'stream_click' ? 'bg-cyan-950/40 text-cyan-300' : 'bg-emerald-950/40 text-emerald-300'
                      }`}>
                        {ev.eventType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-cyan-400 font-semibold">{ev.country}</td>
                    <td className="py-3 px-3 text-gray-500 font-sans text-xs">{ev.browser} on {ev.device}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-505">No indexing logs found. Trigger some file stream checks to review events!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
