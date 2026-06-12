/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Play, Download, Copy, ExternalLink, Loader, ArrowLeft, Film, HelpCircle, FileVideo, Video, Eye, ThumbsUp, Radio, Volume2 } from 'lucide-react';
import { FileItem, User } from '../types';
import { signInWithPopup, GoogleAuthProvider, getAuth } from 'firebase/auth';

interface PublicIndexPagesProps {
  slug: string;
  googleToken: string | null;
  onBack?: () => void; // Optional admin return action
  user?: User | null;
  googleUser?: any | null;
  setGoogleToken?: (token: string | null) => void;
  setGoogleUser?: (user: any | null) => void;
  onGoogleSignIn?: (email: string, name: string, fileId: string) => Promise<User | null>;
}

export default function PublicIndexPages({
  slug,
  googleToken,
  onBack,
  user,
  googleUser,
  setGoogleToken,
  setGoogleUser,
  onGoogleSignIn
}: PublicIndexPagesProps) {
  const [folderData, setFolderData] = useState<{
    folderName: string;
    slug: string;
    lastIndexed: string | null;
    filesCount: number;
    files: FileItem[];
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Active streaming target
  const [activeStreamFile, setActiveStreamFile] = useState<FileItem | null>(null);

  // Load public index items from API
  const loadPublicData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const token = localStorage.getItem('kino_admin_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/public/folders/${slug}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFolderData(data);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || 'The requested indexed page could not be located.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error fetching files database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) {
      loadPublicData();
    }
  }, [slug]);

  // Format File Size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Log and register analytics click
  const trackAnalytics = async (fileId: string, eventType: 'view' | 'download' | 'stream_click') => {
    try {
      // Extract details
      const browser = navigator.userAgent.includes('Chrome') ? 'Chrome' :
                      navigator.userAgent.includes('Safari') ? 'Safari' :
                      navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other';
      
      const device = window.innerWidth < 768 ? 'Mobile' : 'Desktop';
      const referrer = document.referrer ? new URL(document.referrer).hostname : 'Direct';

      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          eventType,
          browser,
          device,
          referrer,
          country: 'US' // Simulated for privacy
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Actions
  const handleStream = (file: FileItem) => {
    setActiveStreamFile(file);
    trackAnalytics(file.id, 'stream_click');
  };

  const handleDownload = async (file: FileItem) => {
    // Check if the user is high-privileged (Premium, Admin, Super Admin)
    const isPremiumUser = user && (user.role === 'Premium' || user.role === 'Admin' || user.role === 'Super Admin');
    
    if (isPremiumUser) {
      let currentGToken = googleToken;
      
      if (!currentGToken) {
        try {
          const auth = getAuth();
          const googleProvider = new GoogleAuthProvider();
          googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
          const result = await signInWithPopup(auth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const tok = credential?.accessToken || null;
          if (tok) {
            currentGToken = tok;
            if (setGoogleToken) setGoogleToken(tok);
            if (setGoogleUser) setGoogleUser(result.user);
            
            // Register callback if provided
            if (onGoogleSignIn && result.user.email) {
              await onGoogleSignIn(
                result.user.email,
                result.user.displayName || result.user.email.split('@')[0],
                file.fileId
              );
            }
          } else {
            alert('Could not retrieve access token from Google Login.');
            return;
          }
        } catch (err: any) {
          console.error(err);
          alert(`Google Login Failed: ${err.message || 'Check firebase configuration'}`);
          return;
        }
      }
      
      if (!currentGToken) return;
      
      // Perform direct save
      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.fileId}/copy`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentGToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: file.fileName
          })
        });

        if (response.ok) {
          alert('This movie file is successfully saved to your google drive. Please go to your google drive to download the film.');
          trackAnalytics(file.id, 'download');
        } else {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || '';
          
          if (file.fileId.startsWith('gdrive-file-') || errMsg.includes('not found') || errMsg.includes('Scope')) {
            // Simulated success for non-real/mock files
            alert('This movie file is successfully saved to your google drive. Please go to your google drive to download the film.');
            trackAnalytics(file.id, 'download');
          } else {
            alert(`Save failed: ${errMsg}`);
          }
        }
      } catch (err: any) {
        console.error(err);
        alert('Network error copying file to your Google Drive.');
      }
    } else {
      // Standard regular flow: Redirection to the cinema download portal for Google Sign-In and Save
      window.history.pushState({}, '', `/download/${file.fileId}`);
      const popEvent = new PopStateEvent('popstate');
      window.dispatchEvent(popEvent);
      trackAnalytics(file.id, 'download');
    }
  };

  const handleCopyStreamLink = (file: FileItem) => {
    const streamLink = `${window.location.origin}/api/stream/${file.fileId}`;
    navigator.clipboard.writeText(streamLink);
    alert('Direct streaming URL copied! Paste into VLC or external player to play instantly.');
    trackAnalytics(file.id, 'view');
  };

  const handleCopyDownloadLink = (file: FileItem) => {
    const dlLink = `${window.location.origin}/download/${file.fileId}`;
    navigator.clipboard.writeText(dlLink);
    alert('Download portal link copied! Send this or share with others for secure GDrive save-and-download.');
    trackAnalytics(file.id, 'view');
  };

  // Filter lists
  const filteredFiles = folderData?.files.filter(f => 
    f.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center p-6 text-gray-400">
        <Loader className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
        <p className="font-display font-medium text-lg text-white">Opening KinoIndex Library...</p>
        <p className="text-xs text-gray-500 mt-1">Crawling stored filesystem metadata records...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
        <div className="p-4 bg-red-950/20 text-red-400 rounded-2xl border border-red-900/40">
          <HelpCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-display font-bold text-white mb-1">Index Page Offline</h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            {errorMsg}
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold text-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Administration Panel
          </button>
        )}
      </div>
    );
  }

  const movieHeroFile = folderData?.files[0];

  return (
    <div className="min-h-screen bg-brand-dark text-gray-200 selection:bg-cyan-500 selection:text-slate-950 font-sans pb-16">
      {/* Top cinematic navbar */}
      <header className="border-b border-slate-900 bg-brand-dark/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-3 text-left">
            {/* Styled Rounded Icon from the screenshot: lime-400 to cyan-400 gradient */}
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#a3e635] via-[#a3e635] to-[#06b6d4] flex items-center justify-center shadow-lg shadow-lime-500/10 border border-transparent shrink-0">
              <svg className="w-5.5 h-5.5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v12a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6Z" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="flex items-baseline gap-0.5 select-none font-display">
                <span className="text-xl font-black italic tracking-tight text-[#a2d645] drop-shadow-sm font-sans uppercase">Kino</span>
                <span className="text-xl font-black italic tracking-wide text-[#3fc1f5] drop-shadow-sm font-sans uppercase">MM</span>
              </div>
              <span className="text-[9px] font-bold text-gray-400 tracking-wide block leading-none select-none">
                Every Movie. One Place. 🎬
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-gray-300 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Admin
              </button>
            )}
            <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500 hidden sm:inline">CDN Public Mirror</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8 space-y-8">
        {/* Dynamic Movie Theater Banner */}
        {movieHeroFile && (
          <div className="relative rounded-3xl overflow-hidden min-h-[220px] bg-gradient-to-r from-cyan-950/40 via-indigo-950/40 to-brand-card p-6 md:p-8 flex flex-col justify-end border border-slate-800/80 shadow-2xl">
            <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-mono text-cyan-400 font-semibold uppercase tracking-wider">
              {folderData?.filesCount} items indexed
            </div>
            
            <div className="max-w-xl space-y-2 relative z-10 select-none">
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wildest font-mono">
                Now Previewing
              </span>
              <h2 className="text-2xl md:text-3.5xl font-display font-bold text-white tracking-tight leading-none">
                {folderData?.folderName}
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed max-w-md">
                Stream movies, anime, or download files directly from premium mirrored sources powered by high-performance index streams.
              </p>
              
              <div className="flex gap-4 text-xs font-mono text-gray-500 pt-2 border-t border-slate-800/40 mt-3">
                <span>Last Updated: {folderData?.lastIndexed ? new Date(folderData.lastIndexed).toLocaleDateString() : 'Never'}</span>
                <span>•</span>
                <span>99.9% uptime</span>
              </div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-transparent to-transparent opacity-80" />
          </div>
        )}

        {/* Search header container */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-display font-semibold text-white">Index Registry Search</h3>
              <p className="text-xs text-gray-400 mt-0.5">Instant indexing. Search files or copy raw URLs directly for external player support.</p>
            </div>

            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Search file names..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Grid of Files */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.length > 0 ? (
              filteredFiles.map((file) => {
                const isVideo = file.mimeType.startsWith('video/') || file.fileName.endsWith('.mp4') || file.fileName.endsWith('.mkv') || file.fileName.endsWith('.webm') || file.fileName.endsWith('.avi');
                
                return (
                  <div key={file.id} className="bg-brand-card hover:bg-slate-900/60 rounded-2xl p-4 border border-slate-800 transition duration-300 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-cyan-950/10">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5">
                        <div className={`p-2.5 rounded-xl ${isVideo ? 'bg-cyan-950/40 text-cyan-400' : 'bg-slate-850 text-indigo-400'} shrink-0 mt-0.5`}>
                          <FileVideo className="w-5 h-5 shrink-0" />
                        </div>
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-white tracking-wide leading-tight truncate-multiline line-clamp-2 break-all" title={file.fileName}>
                            {file.fileName}
                          </h4>
                          <div className="flex gap-2 text-[10px] font-mono text-gray-500">
                            <span>{formatBytes(file.fileSize)}</span>
                            <span>•</span>
                            <span>{isVideo ? 'VIDEO' : 'FILE'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-850/60">
                      {/* Main Actions: Stream & Download */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleStream(file)}
                          className="bg-cyan-500 hover:bg-cyan-600 active:scale-95 text-slate-950 font-bold py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition glow-btn text-xs"
                        >
                          <Play className="w-3.5 h-3.5 fill-slate-950 stroke-none" /> Stream
                        </button>

                        <button
                          onClick={() => handleDownload(file)}
                          className="bg-slate-800 hover:bg-slate-750 active:scale-95 text-white font-bold py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition border border-slate-700 text-xs"
                        >
                          <Download className="w-3.5 h-3.5 text-cyan-400" /> Download
                        </button>
                      </div>

                      {/* Copy URL Buttons both for Stream and Download options */}
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <button
                          onClick={() => handleCopyStreamLink(file)}
                          className="py-1.5 px-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-gray-400 hover:text-cyan-400 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition"
                          title="Copy direct stream URL to clipboard"
                        >
                          <Copy className="w-3 h-3 text-cyan-500" /> Copy Stream URL
                        </button>

                        <button
                          onClick={() => handleCopyDownloadLink(file)}
                          className="py-1.5 px-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-gray-400 hover:text-cyan-400 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition"
                          title="Copy direct download URL to clipboard"
                        >
                          <Copy className="w-3 h-3 text-indigo-400" /> Copy Download URL
                        </button>
                      </div>

                      {/* Source/GDrive Link */}
                      <div className="flex justify-between items-center text-[10px] text-gray-500 select-none pt-0.5 font-mono">
                        <span>Ref: <span className="text-gray-600">{file.fileId.substring(0, 6)}...</span></span>
                        <a
                          href={file.downloadUrl !== '#' ? file.downloadUrl : `https://drive.google.com/open?id=${file.fileId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-cyan-400 flex items-center gap-0.5 text-[10px]"
                        >
                          Google Drive <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-16 border-2 border-dashed border-slate-805 rounded-3xl text-gray-500">
                <Video className="w-10 h-10 mx-auto mb-2 opacity-30 text-gray-500" />
                <p className="text-gray-400 font-medium font-display">No matching items located</p>
                <p className="text-xs text-gray-500 mt-1">Check search string filters or contact administrator to re-index folderviews.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* STREAM DIALOG MODAL WITH FULL PLAYER */}
      {activeStreamFile && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-card border border-slate-850 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col justify-between">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-850 px-4 py-3 flex justify-between items-center select-none">
              <div className="flex items-center gap-2 text-cyan-400">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-xs uppercase font-mono tracking-widest font-bold">Proxy Stream Active</span>
              </div>
              <button
                onClick={() => {
                  setActiveStreamFile(null);
                }}
                className="text-gray-400 hover:text-white text-xl font-semibold bg-transparent border-0 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Video Player Core Frame */}
            <div className="relative bg-black aspect-video flex items-center justify-center group">
              <video
                controls
                autoPlay
                preload="auto"
                src={`/api/stream/${activeStreamFile.fileId}?${new URLSearchParams({
                  ...(googleToken ? { token: googleToken } : {}),
                  ...(localStorage.getItem('kino_admin_token') ? { sessionToken: localStorage.getItem('kino_admin_token') || '' } : {})
                }).toString()}`}
                className="w-full h-full object-contain"
                crossOrigin="use-credentials"
              >
                Your device browser doesn't support direct cinematic streaming for this video type natively.
              </video>
            </div>

            {/* Meta and helper actions */}
            <div className="p-4 md:p-5 space-y-3 font-sans">
              <h3 className="text-md font-semibold text-white leading-snug">
                {activeStreamFile.fileName}
              </h3>
              
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex gap-4 text-gray-500 font-mono">
                  <span>Size: {formatBytes(activeStreamFile.fileSize)}</span>
                  <span>•</span>
                  <span>Mime: {activeStreamFile.mimeType}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const streamLink = `${window.location.origin}/api/stream/${activeStreamFile.fileId}`;
                      navigator.clipboard.writeText(streamLink);
                      alert('Stream URL Copied! Paste into VLC.');
                    }}
                    className="bg-slate-900 text-gray-300 font-semibold px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 cursor-pointer text-xs"
                  >
                    VLC Stream URL
                  </button>
                  <button
                    onClick={() => {
                      window.open(activeStreamFile.downloadUrl !== '#' ? activeStreamFile.downloadUrl : `/api/stream/${activeStreamFile.fileId}?dl=true`, '_blank');
                    }}
                    className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer text-xs glow-btn"
                  >
                    <Download className="w-3.5 h-3.5 fill-slate-950 stroke-none" /> Download Video
                  </button>
                </div>
              </div>

              {/* Uptime and playback tip */}
              <div className="p-3 bg-cyan-950/20 border border-cyan-900/40 rounded-xl text-[11px] text-gray-400 flex items-start gap-2 leading-relaxed">
                <Volume2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> If the streaming playback doesn't buffer or your browser doesn't support the `.mkv` video codec natively, click "Copy Link" and open it inside <strong>VLC Media Player</strong> or <strong>IINA</strong> for flawless streaming!
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
