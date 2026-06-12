/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, RotateCw, ExternalLink, Trash2, Edit, Plus, FolderOpen, AlertCircle, FileVideo, ChevronLeft, ChevronRight, CheckCircle2, RefreshCw, Shield, Users, Lock, Unlock } from 'lucide-react';
import { Folder, User, UserRole } from '../types';

interface DriveFoldersPageProps {
  token: string | null;
  googleToken: string | null;
  onOpenFolder: (folder: Folder) => void;
  userRole: string;
}

export default function DriveFoldersPage({ token, googleToken, onOpenFolder, userRole }: DriveFoldersPageProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Registration Form Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [folderIdInput, setFolderIdInput] = useState('');
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderSlugInput, setFolderSlugInput] = useState('');
  const [modalError, setModalError] = useState('');
  
  // Editing Folder Modal
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

  // Permissions management modal (Super Admin Only)
  const [permissionsFolder, setPermissionsFolder] = useState<Folder | null>(null);
  const [allowedRoles, setAllowedRoles] = useState<UserRole[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [allAppUsers, setAllAppUsers] = useState<User[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [permissionsError, setPermissionsError] = useState('');
  const [permissionsSuccess, setPermissionsSuccess] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(5);

  const fetchFolders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/folders', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (err) {
      console.error('Error fetching folders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchFolders();
    }
  }, [token]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!folderIdInput || !folderNameInput || !folderSlugInput) {
      setModalError('All fields are required');
      return;
    }

    if (userRole === 'Viewer') {
      setModalError('Viewer accounts do not have permission to register folders.');
      return;
    }

    // Clean slug
    const cleanSlug = folderSlugInput.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          folderId: folderIdInput,
          folderName: folderNameInput,
          slug: cleanSlug
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to register folder');
      }

      setFolderIdInput('');
      setFolderNameInput('');
      setFolderSlugInput('');
      setShowAddModal(false);
      fetchFolders();
    } catch (err: any) {
      setModalError(err.message || 'Server error creating folder');
    }
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (userRole !== 'Super Admin') {
      alert('Only Super Admins can delete indexed folders');
      return;
    }

    const conf = window.confirm(`Are you sure you want to delete "${name}" index data? This will clear all parsed movie items from your public list.`);
    if (!conf) return;

    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        fetchFolders();
      } else {
        alert('Failed to delete folder');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReindex = async (folder: Folder) => {
    if (userRole === 'Viewer') {
      alert('Unauthorized action');
      return;
    }

    // Attempt reindexing immediately
    try {
      // Mark as indexing locally first for snappiness
      setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, status: 'indexing' } : f));

      const res = await fetch(`/api/folders/${folder.id}/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accessToken: googleToken || 'demo_active_credential'
        })
      });

      if (res.ok) {
        alert(`Indexing for "${folder.folderName}" successfully initiated in the background! Please reload folders list in a minute.`);
        fetchFolders();
      } else {
        alert('Failed to initiate reindexing. Ensure you are signed in with Google.');
        fetchFolders();
      }
    } catch (err) {
      console.error(err);
      fetchFolders();
    }
  };

  const handleFieldChange = (val: string) => {
    setFolderNameInput(val);
    // Auto populate slug
    const generatedSlug = val.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-');
    setFolderSlugInput(generatedSlug);
  };

  const handleOpenPermissions = async (folder: Folder) => {
    setPermissionsFolder(folder);
    // If not set, let default be unrestricted i.e. both Admin and Viewer are checked (unrestricted)
    setAllowedRoles(folder.allowedRoles || ['Admin', 'Viewer']);
    setAllowedUserIds(folder.allowedUserIds || []);
    setPermissionsError('');
    setPermissionsSuccess('');
    
    try {
      setLoadingPermissions(true);
      const res = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const usersData = await res.json();
        // Exclude Super Admin since Super Admin has total access anyway
        setAllAppUsers(usersData.filter((u: User) => u.role !== 'Super Admin'));
      } else {
        setPermissionsError('Failed to fetch user directory for granular access control.');
      }
    } catch (err) {
      console.error(err);
      setPermissionsError('Failed to load users.');
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionsFolder) return;
    setPermissionsError('');
    setPermissionsSuccess('');
    
    try {
      const res = await fetch(`/api/folders/${permissionsFolder.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          allowedRoles,
          allowedUserIds
        })
      });
      
      if (res.ok) {
        const updated = await res.json();
        setFolders(prev => prev.map(f => f.id === permissionsFolder.id ? { 
          ...f, 
          allowedRoles: updated.allowedRoles, 
          allowedUserIds: updated.allowedUserIds 
        } : f));
        setPermissionsSuccess('Permissions updated successfully!');
        setTimeout(() => setPermissionsFolder(null), 1000);
      } else {
        const errorData = await res.json();
        setPermissionsError(errorData.error || 'Failed to save folder access permissions.');
      }
    } catch (err: any) {
      setPermissionsError(err.message || 'Error saving permissions');
    }
  };

  // Search filtering
  const filteredFolders = folders.filter(f => 
    f.folderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.folderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination bounds
  const totalItems = filteredFolders.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedFolders = filteredFolders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-white flex items-center gap-2">
            <FolderOpen className="text-cyan-400 w-6 h-6" /> Google Drive Folders
          </h1>
          <p className="text-sm text-gray-400 mt-1">Manage, trigger recursive re-indexing, and preview public cinematic lists.</p>
        </div>

        {userRole !== 'Viewer' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-cyan-500 hover:bg-cyan-600 transition tracking-wide text-slate-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 glow-btn cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 text-slate-950 stroke-[3px]" /> Index New Folder
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex bg-brand-card rounded-xl p-4 border border-slate-800 items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 text-gray-500 w-4.5 h-4.5" />
          <input
            type="text"
            placeholder="Search folders, folder ID, slugs..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-900 border border-slate-750 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-slate-550 focus:outline-none focus:border-cyan-400"
          />
        </div>
        <button
          onClick={fetchFolders}
          className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 flex items-center gap-1 cursor-pointer"
          title="Refresh folders list"
        >
          <RefreshCw className="w-4 h-4" /> <span className="text-xs font-semibold px-1 hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Main Table view */}
      <div id="folders-grid-list" className="bg-brand-card rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs uppercase bg-slate-900/60 text-gray-500 border-b border-slate-805 font-mono">
              <tr>
                <th className="py-3 px-4">Folder Name & Slug</th>
                <th className="py-3 px-4">Last Crawled</th>
                <th className="py-3 px-4">Index Status</th>
                <th className="py-3 px-4">Public URL</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500 font-medium font-sans">
                    <div className="flex justify-center items-center gap-2">
                      <RotateCw className="w-4 h-4 text-cyan-400 animate-spin" /> Loading Drive metadata registries...
                    </div>
                  </td>
                </tr>
              ) : paginatedFolders.length > 0 ? (
                paginatedFolders.map((folder) => (
                  <tr key={folder.id} className="hover:bg-slate-900/40">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <FileVideo className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="truncate">{folder.folderName}</span>
                      </div>
                      <span className="text-[11px] text-gray-500 font-mono block mt-0.5">Slug: {folder.slug}</span>
                      {(folder.allowedRoles?.length || folder.allowedUserIds?.length) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400 font-medium font-mono mt-1 px-1.5 py-0.5 bg-indigo-950/20 border border-indigo-900/40 rounded">
                          <Lock className="w-2.5 h-2.5" /> Restricted Access
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium font-mono mt-1 px-1.5 py-0.5 bg-emerald-950/20 border border-emerald-900/40 rounded">
                          <Unlock className="w-2.5 h-2.5" /> Unrestricted Access
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-xs font-mono">
                      {folder.lastIndexed ? (
                        <span className="text-gray-400">{new Date(folder.lastIndexed).toLocaleString()}</span>
                      ) : (
                        <span className="text-amber-500 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Never Index Checked
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        folder.status === 'completed' ? 'bg-emerald-950/40 text-emerald-300' :
                        folder.status === 'indexing' ? 'bg-cyan-950/40 text-cyan-300' :
                        folder.status === 'failed' ? 'bg-red-950/40 text-red-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {folder.status === 'indexing' && <RotateCw className="w-3 h-3 animate-spin text-cyan-400" />}
                        {folder.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        {folder.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <a
                        href={`/s/${folder.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline inline-flex items-center gap-1 font-mono text-xs"
                      >
                        /s/{folder.slug} <ExternalLink className="w-3 h-3 text-cyan-400" />
                      </a>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenFolder(folder)}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                          title="Open folder content view"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        
                        {userRole !== 'Viewer' && (
                          <button
                            onClick={() => handleReindex(folder)}
                            disabled={folder.status === 'indexing'}
                            className="p-1.5 text-cyan-400 hover:bg-cyan-950/30 rounded-lg cursor-pointer disabled:opacity-50"
                            title="Reindex now"
                          >
                            <RotateCw className={`w-4 h-4 ${folder.status === 'indexing' ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        
                        {userRole === 'Super Admin' && (
                          <>
                            <button
                              onClick={() => handleOpenPermissions(folder)}
                              className="p-1.5 text-indigo-400 hover:bg-indigo-950/30 rounded-lg cursor-pointer"
                              title="Edit folder access permissions"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteFolder(folder.id, folder.folderName)}
                              className="p-1.5 text-red-400 hover:bg-red-950/30 rounded-lg cursor-pointer"
                              title="Delete folder index"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500 font-sans">
                    No matching indexed files found. Click "Index New Folder" to read Google Drive metadata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="bg-slate-900/40 border-t border-slate-850 px-4 py-3 flex items-center justify-between font-mono text-xs">
            <span className="text-gray-500">
              Showing page <span className="text-white font-bold">{currentPage}</span> of <span className="text-white">{totalPages}</span> ({totalItems} total folders)
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 bg-slate-850 border border-slate-750 text-gray-300 hover:text-white rounded-lg disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1.5 bg-slate-850 border border-slate-750 text-gray-300 hover:text-white rounded-lg disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Registration Modal Dialog Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-card border border-slate-800 rounded-2xl w-full max-w-md p-6 overflow-hidden shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-850">
              <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400 stroke-[3px]" /> Index Google Drive Folder
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setModalError('');
                }}
                className="text-gray-400 hover:text-white text-lg font-semibold bg-transparent border-0 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4 font-sans text-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Google Drive Folder ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1nS-wL7Kveqis9Uo9H_V7_hGozIe2r48I"
                  value={folderIdInput}
                  onChange={(e) => setFolderIdInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  required
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Find this from your browser URL box inside Google Drive folders view.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Marvel Movies Phase 1"
                  value={folderNameInput}
                  onChange={(e) => handleFieldChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Public Path Slug
                </label>
                <input
                  type="text"
                  placeholder="e.g. marvel-movies-phase-1"
                  value={folderSlugInput}
                  onChange={(e) => setFolderSlugInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  required
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Creates public indices at: {window.location.origin}/s/<span className="text-cyan-400 font-semibold">{folderSlugInput || 'slug'}</span>
                </span>
              </div>

              {modalError && (
                <div className="p-3 bg-red-950/20 border border-red-900/60 text-red-300 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-300 font-semibold py-2 rounded-lg text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2 rounded-lg text-center glow-btn cursor-pointer"
                >
                  Add Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folder Permissions Modification Modal (Super Admin Only) */}
      {permissionsFolder && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-card border border-slate-800 rounded-2xl w-full max-w-md p-6 overflow-hidden shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-850">
              <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" /> Folder Access Permissions
              </h3>
              <button
                onClick={() => setPermissionsFolder(null)}
                className="text-gray-400 hover:text-white text-lg font-semibold bg-transparent border-0 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div>
              <p className="text-sm text-gray-300">
                Configure who can view, enter, and re-index the folder <span className="text-cyan-400 font-semibold font-mono">"{permissionsFolder.folderName}"</span>.
              </p>
              <p className="text-[11px] text-gray-500 mt-1 font-mono">
                Google Drive ID: {permissionsFolder.folderId}
              </p>
            </div>

            <form onSubmit={handleSavePermissions} className="space-y-4 text-sm">
              {/* Category 1: Role Permissions */}
              <div className="bg-slate-900/60 border border-slate-805 rounded-xl p-4 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Role-Level Permissions
                </span>
                <p className="text-xs text-gray-400">
                  Specify which global roles are permitted access. If both are checked, any authenticated staff account can access.
                </p>
                
                <div className="flex flex-col gap-2 mt-2">
                  <label className="flex items-center gap-2.5 text-gray-300 hover:text-white cursor-pointer py-1 select-none">
                    <input
                      type="checkbox"
                      checked={allowedRoles.includes('Admin')}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAllowedRoles(prev => checked ? [...prev, 'Admin'] : prev.filter(r => r !== 'Admin'));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-750 focus:ring-0 cursor-pointer focus:ring-offset-0"
                    />
                    <div>
                      <span className="font-semibold block text-sm">Admins</span>
                      <span className="text-xs text-gray-500 block">Can execute re-indexing, crawl files, download, stream and manage contents.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 text-gray-300 hover:text-white cursor-pointer py-1 select-none">
                    <input
                      type="checkbox"
                      checked={allowedRoles.includes('Viewer')}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAllowedRoles(prev => checked ? [...prev, 'Viewer'] : prev.filter(r => r !== 'Viewer'));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-750 focus:ring-0 cursor-pointer focus:ring-offset-0"
                    />
                    <div>
                      <span className="font-semibold block text-sm">Viewers</span>
                      <span className="text-xs text-gray-500 block">Can view list, download/copy strings, play stream. Cannot run re-indexing scans.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 text-gray-300 hover:text-white cursor-pointer py-1 select-none">
                    <input
                      type="checkbox"
                      checked={allowedRoles.includes('Premium')}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAllowedRoles(prev => checked ? [...prev, 'Premium'] : prev.filter(r => r !== 'Premium'));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-750 focus:ring-0 cursor-pointer focus:ring-offset-0"
                    />
                    <div>
                      <span className="font-semibold block text-sm">Premium Users</span>
                      <span className="text-xs text-gray-500 block">Can view list, download resources, stream cinematic content according to VIP permissions.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Category 2: User Granular Permissions */}
              <div className="bg-slate-900/60 border border-slate-805 rounded-xl p-4 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Individual User Exceptions
                </span>
                <p className="text-xs text-gray-400">
                  Permit specific individual staff members regardless of role. Super Admin accounts always maintain permanent permission.
                </p>

                {loadingPermissions ? (
                  <div className="flex items-center justify-center py-4 gap-2 text-xs text-gray-500">
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> Loading account directory...
                  </div>
                ) : allAppUsers.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-850 pr-1 space-y-1.5 mt-2">
                    {allAppUsers.map(user => {
                      const isChecked = allowedUserIds.includes(user.id);
                      return (
                        <label key={user.id} className="flex items-center justify-between hover:bg-slate-850/50 p-2 rounded cursor-pointer transition select-none">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAllowedUserIds(prev => checked ? [...prev, user.id] : prev.filter(uid => uid !== user.id));
                              }}
                              className="w-4 h-4 rounded text-teal-600 bg-slate-950 border-slate-750 focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <span className="font-semibold text-gray-200 block text-xs">{user.name}</span>
                              <span className="text-[10px] text-gray-500 block font-mono">@{user.username} | {user.email}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                            user.role === 'Admin' ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-900/40' : 'bg-slate-800 text-gray-400'
                          }`}>
                            {user.role}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic py-2">No other user accounts found in registry.</p>
                )}
              </div>

              {permissionsError && (
                <div className="p-3 bg-red-950/20 border border-red-900/60 text-red-300 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{permissionsError}</span>
                </div>
              )}

              {permissionsSuccess && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-300 text-xs rounded-lg flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                  <span>{permissionsSuccess}</span>
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPermissionsFolder(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-300 font-semibold py-2 rounded-lg text-center cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-750 text-white font-bold py-2 rounded-lg text-center cursor-pointer transition glow-btn"
                >
                  Save Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
