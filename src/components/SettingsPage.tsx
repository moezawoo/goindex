/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, UserPlus, Users, Eye, HelpCircle, HardDrive, Key, Globe, LayoutGrid, CheckCircle2, AlertTriangle, ShieldCheck, Clipboard, ExternalLink, Loader, ShieldAlert, Sparkles, Upload, Image, ChevronRight, ChevronDown, Ticket } from 'lucide-react';
import { User, WebSettings, UserRole } from '../types';

interface SettingsPageProps {
  token: string | null;
  userRole: string;
}

export default function SettingsPage({ token, userRole }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'general' | 'drive' | 'ads' | 'deployment' | 'coupons'>('users');
  
  // Users States
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // User Filtering and Sorting states
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All'); // All, Active, Suspended
  const [userSortKey, setUserSortKey] = useState<'id' | 'name' | 'username' | 'email' | 'role' | 'createdAt'>('name');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('asc');

  // States to audit individual member's folder/file permissions matrix
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [userPermissions, setUserPermissions] = useState<Record<string, any>>({});
  const [loadingPermissionsUserIds, setLoadingPermissionsUserIds] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Custom action modal state to bypass browser prompt/confirm blocks inside iframes
  const [actionModal, setActionModal] = useState<{
    type: 'promote' | 'downgrade' | 'reset-password' | 'delete' | null;
    user: User | null;
    inputValue: string;
    loading: boolean;
    error: string;
  }>({
    type: null,
    user: null,
    inputValue: '',
    loading: false,
    error: ''
  });

  const filteredSortedUsers = React.useMemo(() => {
    // 1. Filter based on Admin role constraint
    let list = users.filter(u => userRole === 'Super Admin' || u.role === 'Viewer' || u.role === 'Premium');

    // 2. Filter by search query
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter(u => 
        (u.name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }

    // 3. Filter by role
    if (roleFilter !== 'All') {
      list = list.filter(u => u.role === roleFilter);
    }

    // 4. Filter by status
    if (statusFilter !== 'All') {
      if (statusFilter === 'Suspended') {
        list = list.filter(u => u.suspended === true);
      } else {
        list = list.filter(u => u.suspended !== true);
      }
    }

    // 5. Sort table
    list.sort((a, b) => {
      let valA = a[userSortKey] || '';
      let valB = b[userSortKey] || '';

      if (userSortKey === 'createdAt') {
        valA = new Date(valA as string).getTime();
        valB = new Date(valB as string).getTime();
      } else {
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
      }

      if (valA < valB) return userSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return userSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [users, userRole, userSearch, roleFilter, statusFilter, userSortKey, userSortOrder]);

  const handleTogglePermission = async (targetUser: User, type: 'folder' | 'file', targetId: string, action: 'grant' | 'revoke') => {
    try {
      const res = await fetch('/api/permissions/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          type,
          targetId,
          action
        })
      });
      if (res.ok) {
        // Refresh permissions-info for this user
        const resPerm = await fetch(`/api/users/${targetUser.id}/permissions-info`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resPerm.ok) {
          const data = await resPerm.json();
          setUserPermissions(prev => ({ ...prev, [targetUser.id]: data }));
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Failed to update access permissions');
      }
    } catch (err) {
      console.error(err);
      alert('Network failure adjusting permissions.');
    }
  };

  const toggleExpandUser = async (user: User) => {
    const isExpanded = !!expandedUserIds[user.id];
    setExpandedUserIds(prev => ({ ...prev, [user.id]: !isExpanded }));

    if (!isExpanded && !userPermissions[user.id]) {
      try {
        setLoadingPermissionsUserIds(prev => ({ ...prev, [user.id]: true }));
        const res = await fetch(`/api/users/${user.id}/permissions-info`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUserPermissions(prev => ({ ...prev, [user.id]: data }));
        }
      } catch (err) {
        console.error('Error fetching individual permissions details:', err);
      } finally {
        setLoadingPermissionsUserIds(prev => ({ ...prev, [user.id]: false }));
      }
    }
  };

  const handleConfirmAction = async () => {
    const { type, user, inputValue } = actionModal;
    if (!user) return;
    
    setActionModal(prev => ({ ...prev, loading: true, error: '' }));
    try {
      if (type === 'promote') {
        const durationDays = parseInt(inputValue, 10);
        if (isNaN(durationDays) || durationDays <= 0) {
          setActionModal(prev => ({ ...prev, loading: false, error: 'Please enter a valid positive integer.' }));
          return;
        }
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ role: 'Premium', premiumDurationDays: durationDays })
        });
        if (res.ok) {
          fetchUsers();
          setActionModal({ type: null, user: null, inputValue: '', loading: false, error: '' });
        } else {
          const errorData = await res.json().catch(() => ({}));
          setActionModal(prev => ({ ...prev, loading: false, error: errorData.error || 'Failed to promote user.' }));
        }
      } else if (type === 'downgrade') {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ role: 'Viewer' })
        });
        if (res.ok) {
          fetchUsers();
          setActionModal({ type: null, user: null, inputValue: '', loading: false, error: '' });
        } else {
          const errorData = await res.json().catch(() => ({}));
          setActionModal(prev => ({ ...prev, loading: false, error: errorData.error || 'Failed to downgrade user.' }));
        }
      } else if (type === 'reset-password') {
        if (!inputValue || inputValue.length < 4) {
          setActionModal(prev => ({ ...prev, loading: false, error: 'Password must be at least 4 characters long.' }));
          return;
        }
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ password: inputValue })
        });
        if (res.ok) {
          fetchUsers();
          setActionModal({ type: null, user: null, inputValue: '', loading: false, error: '' });
        } else {
          const errorData = await res.json().catch(() => ({}));
          setActionModal(prev => ({ ...prev, loading: false, error: errorData.error || 'Failed to reset password.' }));
        }
      } else if (type === 'delete') {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          fetchUsers();
          setActionModal({ type: null, user: null, inputValue: '', loading: false, error: '' });
        } else {
          const errorData = await res.json().catch(() => ({}));
          setActionModal(prev => ({ ...prev, loading: false, error: errorData.error || 'Failed to delete user.' }));
        }
      }
    } catch (err) {
      console.error(err);
      setActionModal(prev => ({ ...prev, loading: false, error: 'A network error occurred. Please try again.' }));
    }
  };

  const handlePromoteToPremium = (u: User) => {
    if (userRole !== 'Super Admin' && userRole !== 'Admin') return;
    setActionModal({ type: 'promote', user: u, inputValue: '30', loading: false, error: '' });
  };

  const handleDowngradeToViewer = (u: User) => {
    if (userRole !== 'Super Admin' && userRole !== 'Admin') return;
    setActionModal({ type: 'downgrade', user: u, inputValue: '', loading: false, error: '' });
  };

  const handleResetPassword = (u: User) => {
    if (userRole === 'Admin') {
      if (u.role !== 'Viewer' && u.role !== 'Premium') {
        alert('You do not have permission to reset the password for this user role.');
        return;
      }
    } else if (userRole !== 'Super Admin') {
      alert('Only Administrators and Super Admins can reset user passwords.');
      return;
    }
    setActionModal({ type: 'reset-password', user: u, inputValue: '', loading: false, error: '' });
  };
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Viewer');
  const [userFormError, setUserFormError] = useState('');

  // General Settings States
  const [settings, setSettings] = useState<WebSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const [websiteName, setWebsiteName] = useState('KinoIndex');
  const [customDomain, setCustomDomain] = useState('movies.example.com');
  const [logoUrl, setLogoUrl] = useState('');
  const [indexingSchedule, setIndexingSchedule] = useState('daily');
  const [cacheDuration, setCacheDuration] = useState(12);
  const [maxFiles, setMaxFiles] = useState(1000);

  // Advertisement Settings States
  const [titleBanner1Image, setTitleBanner1Image] = useState('');
  const [titleBanner1Link, setTitleBanner1Link] = useState('');
  const [titleBanner2Image, setTitleBanner2Image] = useState('');
  const [titleBanner2Link, setTitleBanner2Link] = useState('');
  
  const [downloadBanner1Image, setDownloadBanner1Image] = useState('');
  const [downloadBanner1Link, setDownloadBanner1Link] = useState('');
  const [downloadBanner2Image, setDownloadBanner2Image] = useState('');
  const [downloadBanner2Link, setDownloadBanner2Link] = useState('');

  const [leftPosterImage, setLeftPosterImage] = useState('');
  const [leftPosterLink, setLeftPosterLink] = useState('');
  const [rightPosterImage, setRightPosterImage] = useState('');
  const [rightPosterLink, setRightPosterLink] = useState('');

  // HTML format ads states
  const [titleBanner1Html, setTitleBanner1Html] = useState('');
  const [titleBanner2Html, setTitleBanner2Html] = useState('');
  const [downloadBanner1Html, setDownloadBanner1Html] = useState('');
  const [downloadBanner2Html, setDownloadBanner2Html] = useState('');
  const [leftPosterHtml, setLeftPosterHtml] = useState('');
  const [rightPosterHtml, setRightPosterHtml] = useState('');

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size exceeds 2MB limit. Please upload a smaller image.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setter(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchUsers = async () => {
    if (userRole !== 'Super Admin' && userRole !== 'Admin') return;
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoadingSettings(true);
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data: WebSettings = await res.json();
        setSettings(data);
        setWebsiteName(data.websiteName);
        setCustomDomain(data.customDomain);
        setLogoUrl(data.logoUrl || '');
        setIndexingSchedule(data.indexingSchedule);
        setCacheDuration(data.cacheDuration);
        setMaxFiles(data.maxFilesPerFolder);

        // Map advertisement state
        setTitleBanner1Image(data.titleBanner1Image || '');
        setTitleBanner1Link(data.titleBanner1Link || '');
        setTitleBanner2Image(data.titleBanner2Image || '');
        setTitleBanner2Link(data.titleBanner2Link || '');
        setDownloadBanner1Image(data.downloadBanner1Image || '');
        setDownloadBanner1Link(data.downloadBanner1Link || '');
        setDownloadBanner2Image(data.downloadBanner2Image || '');
        setDownloadBanner2Link(data.downloadBanner2Link || '');
        setLeftPosterImage(data.leftPosterImage || '');
        setLeftPosterLink(data.leftPosterLink || '');
        setRightPosterImage(data.rightPosterImage || '');
        setRightPosterLink(data.rightPosterLink || '');

        // Map HTML ads
        setTitleBanner1Html(data.titleBanner1Html || '');
        setTitleBanner2Html(data.titleBanner2Html || '');
        setDownloadBanner1Html(data.downloadBanner1Html || '');
        setDownloadBanner2Html(data.downloadBanner2Html || '');
        setLeftPosterHtml(data.leftPosterHtml || '');
        setRightPosterHtml(data.rightPosterHtml || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSettings();
  }, [token, userRole]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError('');

    if (!newUserName || !newUserEmail || !newUserUsername || !newUserPassword || !newUserRole) {
      setUserFormError('All fields are required');
      return;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          username: newUserUsername,
          password: newUserPassword,
          role: newUserRole
        })
      });

      if (res.ok) {
        setNewUserName('');
        setNewUserEmail('');
        setNewUserUsername('');
        setNewUserPassword('');
        setNewUserRole('Viewer');
        setShowAddUserModal(false);
        fetchUsers();
      } else {
        const data = await res.json();
        setUserFormError(data.error || 'Failed to add user');
      }
    } catch (err) {
      setUserFormError('Network connection failed.');
    }
  };

  const handleSuspendToggle = async (user: User) => {
    if (user.id === 'super-admin-id') {
      alert('Cannot suspend the root Super Admin');
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          suspended: !user.suspended
        })
      });

      if (res.ok) {
        fetchUsers();
      } else {
        alert('Failed to modify user state');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = (user: User) => {
    if (user.id === 'super-admin-id') {
      alert('Cannot delete the root Super Admin');
      return;
    }
    setActionModal({ type: 'delete', user: user, inputValue: '', loading: false, error: '' });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSuccess(false);

    if (userRole !== 'Super Admin') {
      alert('Only Super Admin is authorized to edit core configuration parameters');
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          websiteName,
          customDomain,
          logoUrl: logoUrl || null,
          indexingSchedule,
          cacheDuration: Number(cacheDuration),
          maxFilesPerFolder: Number(maxFiles),
          titleBanner1Image,
          titleBanner1Link,
          titleBanner2Image,
          titleBanner2Link,
          downloadBanner1Image,
          downloadBanner1Link,
          downloadBanner2Image,
          downloadBanner2Link,
          leftPosterImage,
          leftPosterLink,
          rightPosterImage,
          rightPosterLink,
          titleBanner1Html,
          titleBanner2Html,
          downloadBanner1Html,
          downloadBanner2Html,
          leftPosterHtml,
          rightPosterHtml
        })
      });

      if (res.ok) {
        setSettingsSuccess(true);
        fetchSettings();
        setTimeout(() => setSettingsSuccess(false), 3000);
      } else {
        alert('Failed to update system params');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-cyan-400" /> Control Panel & Settings
        </h1>
        <p className="text-sm text-gray-400 mt-1">Configure users, set indexing schedules, and preview production deployment instructions.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-850 gap-2 text-sm select-none font-medium">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-3 relative cursor-pointer ${
            activeTab === 'users' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> User Accounts</span>
          {activeTab === 'users' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />}
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`pb-3 px-3 relative cursor-pointer ${
            activeTab === 'general' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" /> Branding & Domain</span>
          {activeTab === 'general' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />}
        </button>

        <button
          onClick={() => setActiveTab('drive')}
          className={`pb-3 px-3 relative cursor-pointer ${
            activeTab === 'drive' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4" /> Drive Crawler</span>
          {activeTab === 'drive' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />}
        </button>

        <button
          onClick={() => setActiveTab('ads')}
          className={`pb-3 px-3 relative cursor-pointer ${
            activeTab === 'ads' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-400" /> Advertisements</span>
          {activeTab === 'ads' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />}
        </button>

        <button
          onClick={() => setActiveTab('deployment')}
          className={`pb-3 px-3 relative cursor-pointer ${
            activeTab === 'deployment' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5"><LayoutGrid className="w-4 h-4 text-purple-400" /> Production Deployment</span>
          {activeTab === 'deployment' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />}
        </button>

        {(userRole === 'Super Admin' || userRole === 'Admin') && (
          <button
            onClick={() => setActiveTab('coupons')}
            className={`pb-3 px-3 relative cursor-pointer ${
              activeTab === 'coupons' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-1.5"><Ticket className="w-4 h-4 text-emerald-400" /> Promotion Coupons</span>
            {activeTab === 'coupons' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />}
          </button>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === 'users' && (
        <div id="users-settings" className="space-y-6">
          {userRole !== 'Super Admin' && userRole !== 'Admin' ? (
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-805 text-center flex flex-col items-center justify-center space-y-2">
              <ShieldAlert className="w-12 h-12 text-amber-500" />
              <h3 className="text-md font-bold text-white">Privileged Management Module</h3>
              <p className="text-xs text-gray-500 max-w-sm">
                Only Admin or Super Admin roles are authorized to view or audit member accounts, directory permissions, or index keys.
              </p>
            </div>
          ) : (
            <div className="bg-brand-card rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-850 flex items-center justify-between">
                <div>
                  <h3 className="text-md font-display font-bold text-white">User Accounts ({users.length})</h3>
                  <p className="text-xs text-gray-400">Configure role associations or audit member permissions mappings.</p>
                </div>
                {userRole === 'Super Admin' && (
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    className="bg-cyan-500 hover:bg-cyan-600 transition text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer border-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Invite User
                  </button>
                )}
              </div>

              {/* Filter controls */}
              <div className="p-4 bg-slate-900/40 border-b border-slate-850 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, username, email..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
                
                <div className="flex gap-2">
                  <span className="text-[10px] uppercase font-mono text-gray-500 font-bold self-center select-none">Role:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="All">All Roles</option>
                    <option value="Viewer">Viewer</option>
                    <option value="Premium">Premium</option>
                    {userRole === 'Super Admin' && (
                      <>
                        <option value="Admin">Admin</option>
                        <option value="Super Admin">Super Admin</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="flex gap-2">
                  <span className="text-[10px] uppercase font-mono text-gray-500 font-bold self-center select-none">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="All">All Status</option>
                    <option value="Active">Active only</option>
                    <option value="Suspended">Suspended only</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto text-sm">
                <table className="w-full text-left text-gray-400">
                  <thead className="bg-slate-900/60 font-mono text-xs uppercase text-gray-500 border-b border-slate-805">
                    <tr>
                      <th 
                        className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                        onClick={() => {
                          if (userSortKey === 'name') {
                            setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setUserSortKey('name');
                            setUserSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          Name / Username {userSortKey === 'name' && (userSortOrder === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th 
                        className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                        onClick={() => {
                          if (userSortKey === 'email') {
                            setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setUserSortKey('email');
                            setUserSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          Email {userSortKey === 'email' && (userSortOrder === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th 
                        className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                        onClick={() => {
                          if (userSortKey === 'role') {
                            setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setUserSortKey('role');
                            setUserSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          Role Permissions {userSortKey === 'role' && (userSortOrder === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th 
                        className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                        onClick={() => {
                          if (userSortKey === 'createdAt') {
                            setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setUserSortKey('createdAt');
                            setUserSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          Status / Registered {userSortKey === 'createdAt' && (userSortOrder === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500">
                          <Loader className="w-4 h-4 animate-spin inline mr-2 text-cyan-400" /> Loading account matrix...
                        </td>
                      </tr>
                    ) : filteredSortedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500 text-xs">
                          No user accounts match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredSortedUsers.map(u => (
                          <React.Fragment key={u.id}>
                            <tr className="hover:bg-slate-900/40">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleExpandUser(u)}
                                    className="p-1 text-gray-500 hover:text-cyan-400 focus:outline-none cursor-pointer inline-flex items-center border-0 bg-transparent"
                                    title="Audit permissions roadmap"
                                  >
                                    {expandedUserIds[u.id] ? (
                                      <ChevronDown className="w-4 h-4 text-cyan-400" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                  <div>
                                    <span className="font-semibold text-white block">{u.name}</span>
                                    <span className="text-xs text-gray-500 font-mono">@{u.username}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-xs">{u.email}</td>
                              <td className="py-3 px-4">
                                <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                                  u.role === 'Super Admin' ? 'bg-purple-950/40 text-purple-300 border border-purple-900/60' :
                                  u.role === 'Admin' ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-900/60' : 
                                  u.role === 'Premium' ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-900/60 font-serif font-black' : 
                                  'bg-slate-800 text-slate-350 border border-slate-700'
                                }`}>
                                  {u.role}
                                </span>
                                {u.role === 'Premium' && u.premiumExpiresAt && (
                                  <div className="text-[9px] text-indigo-400 font-mono mt-1 font-semibold" title={`Premium active`}>
                                    Exp: {new Date(u.premiumExpiresAt).toLocaleDateString()} ({u.premiumDurationDays}d)
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {u.suspended ? (
                                  <span className="text-xs text-red-400 font-mono">Suspended</span>
                                ) : (
                                  <span className="text-xs text-emerald-400 font-mono">Active</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right select-none">
                                <div className="flex gap-2 justify-end items-center">
                                  {(userRole === 'Super Admin' || userRole === 'Admin') && u.role === 'Viewer' && (
                                    <button
                                      onClick={() => handlePromoteToPremium(u)}
                                      className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-900/40 px-2 py-1.5 rounded-lg hover:bg-indigo-900 hover:text-white transition cursor-pointer font-bold inline-flex items-center gap-1 border-0"
                                    >
                                      <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" /> Promote Premium
                                    </button>
                                  )}

                                  {(userRole === 'Super Admin' || userRole === 'Admin') && u.role === 'Premium' && (
                                    <button
                                      onClick={() => handleDowngradeToViewer(u)}
                                      className="text-[10px] bg-amber-955/65 text-amber-300 border border-amber-900/40 px-2 py-1.5 rounded-lg hover:bg-amber-900 hover:text-white transition cursor-pointer font-mono inline-flex items-center gap-1 border-0"
                                    >
                                      Downgrade Viewer
                                    </button>
                                  )}

                                  {(userRole === 'Super Admin' || (userRole === 'Admin' && (u.role === 'Viewer' || u.role === 'Premium'))) && (
                                    <button
                                      onClick={() => handleResetPassword(u)}
                                      className="text-[10px] bg-slate-900 text-cyan-400 border border-slate-755 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer font-bold inline-flex items-center gap-1 border-0"
                                      title="Reset user password"
                                    >
                                      <Key className="w-3 h-3 text-cyan-400" /> Reset Password
                                    </button>
                                  )}

                                  {userRole === 'Super Admin' && (
                                    <>
                                      <button
                                        onClick={() => handleSuspendToggle(u)}
                                        disabled={u.id === 'super-admin-id'}
                                        className={`text-xs px-2 py-1 rounded cursor-pointer disabled:opacity-30 border-0 ${
                                          u.suspended ? 'bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/30' : 'bg-slate-800 text-gray-400 hover:bg-slate-750'
                                        }`}
                                      >
                                        {u.suspended ? 'Unsuspend' : 'Suspend'}
                                      </button>
                                      <button
                                        onClick={() => handleDeleteUser(u)}
                                        disabled={u.id === 'super-admin-id'}
                                        className="text-xs text-red-400 bg-red-955/20 px-2 py-1 rounded hover:bg-red-900/10 disabled:opacity-30 cursor-pointer border-0"
                                      >
                                        Delete
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Dropdown permissions check matrix */}
                            {expandedUserIds[u.id] && (
                              <tr className="bg-slate-950/45">
                                <td colSpan={5} className="py-3 px-8">
                                  <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-850 space-y-3 text-xs">
                                    <div className="flex justify-between items-center pb-2 border-b border-slate-850/60">
                                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-indigo-400">
                                        Active Permissions Matrix &bull; {u.name}
                                      </span>
                                      <span className="text-[10px] text-gray-500 font-mono">
                                        Role Tier: <strong className="text-white font-semibold">{u.role}</strong>
                                      </span>
                                    </div>

                                    {loadingPermissionsUserIds[u.id] ? (
                                      <div className="flex items-center gap-2 justify-center py-4 text-gray-400 font-mono text-[11px]">
                                        <Loader className="w-3 animate-spin text-cyan-400" /> Resolving auth pathways...
                                      </div>
                                    ) : userPermissions[u.id] ? (
                                      (() => {
                                        const isSuperAdmin = userRole === 'Super Admin';
                                        const isAdmin = userRole === 'Admin';
                                        const canModifyPermissions = isSuperAdmin || (isAdmin && (u.role === 'Viewer' || u.role === 'Premium'));

                                        return (
                                          <div className="space-y-4 text-xs">
                                            {/* Section 1: Folders Collapsible Listing */}
                                            <div className="space-y-2">
                                              <span className="font-bold text-gray-300 block text-xs uppercase tracking-wide">
                                                Directory Permissions (Folders Access)
                                              </span>
                                              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                                {userPermissions[u.id].foldersList && userPermissions[u.id].foldersList.length > 0 ? (
                                                  userPermissions[u.id].foldersList.map((folder: any) => {
                                                    const isFolderExpanded = !!expandedFolders[`${u.id}_${folder.id}`];
                                                    return (
                                                      <div key={folder.id} className="bg-slate-950/65 rounded-xl p-3 border border-slate-850 space-y-2.5">
                                                        <div className="flex justify-between items-center">
                                                          <div className="flex items-center gap-2">
                                                            <button
                                                              onClick={() => {
                                                                setExpandedFolders(prev => ({
                                                                  ...prev,
                                                                  [`${u.id}_${folder.id}`]: !isFolderExpanded
                                                                }));
                                                              }}
                                                              className="p-1 text-gray-500 hover:text-white transition cursor-pointer border-0 bg-transparent inline-flex items-center"
                                                              title="Expand to view files"
                                                            >
                                                              {isFolderExpanded ? (
                                                                <ChevronDown className="w-4 h-4 text-cyan-400" />
                                                              ) : (
                                                                <ChevronRight className="w-4 h-4" />
                                                              )}
                                                            </button>
                                                            <div>
                                                              <span className="font-semibold text-white block text-sm">
                                                                {folder.folderName} <span className="text-xs text-gray-450 font-normal">({folder.fileCount} files)</span>
                                                              </span>
                                                              <span className="text-[10px] text-gray-500 font-mono">/s/{folder.slug}</span>
                                                            </div>
                                                          </div>

                                                          <div className="flex items-center gap-3">
                                                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                                              folder.hasAccess ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/60' : 'bg-rose-955/45 text-rose-300 border border-rose-900/60'
                                                            }`}>
                                                              {folder.hasAccess ? 'Access Granted' : 'No Access'}
                                                            </span>

                                                            {canModifyPermissions && (
                                                              <button
                                                                onClick={() => handleTogglePermission(u, 'folder', folder.id, folder.hasAccess ? 'revoke' : 'grant')}
                                                                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                                                                  folder.hasAccess
                                                                    ? 'bg-rose-955/25 text-rose-450 border-rose-900/40 hover:bg-rose-900/30'
                                                                    : 'bg-emerald-955/25 text-emerald-405 border-emerald-900/40 hover:bg-emerald-900/30'
                                                                }`}
                                                              >
                                                                {folder.hasAccess ? 'Revoke Folder' : 'Grant Folder'}
                                                              </button>
                                                            )}
                                                          </div>
                                                        </div>

                                                        {/* Files of individual folder only show upon click of the expand button */}
                                                        {isFolderExpanded && (
                                                          <div className="pl-6 pt-1 border-t border-slate-900 mt-2 space-y-1.5">
                                                            <span className="text-[10px] text-gray-400 uppercase block font-semibold font-mono tracking-wider mb-1">
                                                              Files inside of {folder.folderName} (access audit):
                                                            </span>
                                                            {folder.files && folder.files.length > 0 ? (
                                                              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                                {folder.files.map((file: any) => (
                                                                  <div key={file.id} className="flex justify-between items-center bg-slate-900/40 px-2.5 py-2 border border-slate-850 rounded-lg text-[11px]">
                                                                    <div className="truncate pr-4">
                                                                      <span className={`${file.hasAccess ? 'text-gray-200' : 'text-gray-550'} font-medium block truncate`} title={file.fileName}>
                                                                        {file.fileName}
                                                                      </span>
                                                                      <span className="text-[9px] text-gray-500 font-mono">
                                                                        {file.hasAccess
                                                                          ? file.isDirectAccess ? 'Direct file-level grant' : 'Inherited from folder access'
                                                                          : 'No access pathway'
                                                                        }
                                                                      </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                      {file.hasAccess && !file.isDirectAccess && (
                                                                        <span className="text-[9px] font-bold bg-slate-800 text-gray-400 px-1.5 py-0.5 rounded border border-slate-750">
                                                                          Inherited
                                                                        </span>
                                                                      )}
                                                                      
                                                                      {canModifyPermissions && (
                                                                        <button
                                                                          onClick={() => handleTogglePermission(u, 'file', file.id, file.isDirectAccess ? 'revoke' : 'grant')}
                                                                          className={`text-[9px] px-2 py-0.5 rounded font-bold border transition cursor-pointer ${
                                                                            file.isDirectAccess
                                                                              ? 'bg-rose-955/20 text-rose-450 border-rose-950 hover:bg-rose-900/20'
                                                                              : 'bg-teal-955/20 text-teal-350 border-teal-950 hover:bg-teal-900/20'
                                                                          }`}
                                                                        >
                                                                          {file.isDirectAccess ? 'Revoke File' : 'Grant File'}
                                                                        </button>
                                                                      )}
                                                                    </div>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            ) : (
                                                              <span className="text-[10px] text-gray-500 italic font-mono block pl-2 py-1">This folder contains no files currently indexed.</span>
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })
                                                ) : (
                                                  <p className="text-gray-550 italic text-xs font-mono">No folders currently indexed.</p>
                                                )}
                                              </div>
                                            </div>

                                            {/* Section 2: Separately Accessed Files - shown just below */}
                                            <div className="mt-4 pt-4 border-t border-slate-805 space-y-2.5">
                                              <span className="font-bold text-gray-300 block text-xs uppercase tracking-wide">
                                                Separately Accessed Files (Individual File-level permissions)
                                              </span>
                                              
                                              {userPermissions[u.id].directAccessibleFiles && userPermissions[u.id].directAccessibleFiles.length > 0 ? (
                                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-[11px]">
                                                  {userPermissions[u.id].directAccessibleFiles.map((file: any) => (
                                                    <div key={file.id} className="flex justify-between items-center bg-teal-950/15 p-2.5 border border-teal-900/35 rounded-xl">
                                                      <div className="truncate pr-4">
                                                        <span className="text-teal-355 font-mono text-xs truncate block" title={file.fileName}>
                                                          {file.fileName}
                                                        </span>
                                                        <span className="text-[9px] text-teal-555 font-mono block">Folder: {file.folderName}</span>
                                                      </div>
                                                      {canModifyPermissions && (
                                                        <button
                                                          onClick={() => handleTogglePermission(u, 'file', file.id, 'revoke')}
                                                          className="text-[9px] text-red-400 bg-red-955/20 border border-red-900/40 px-2 py-1 rounded hover:bg-red-900/30 transition cursor-pointer"
                                                        >
                                                          Revoke Access
                                                        </button>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <p className="text-gray-500 italic text-[11px] font-mono">No direct file-level registrations detected.</p>
                                              )}

                                              {/* Selection box to grant direct permission pathways */}
                                              {canModifyPermissions && (() => {
                                                const directIds = (userPermissions[u.id].directAccessibleFiles || []).map((f: any) => f.id);
                                                const unallowedSystemFiles = (userPermissions[u.id].allSystemFiles || []).filter((f: any) => !directIds.includes(f.id));
                                                
                                                if (unallowedSystemFiles.length === 0) return null;
                                                return (
                                                  <div className="flex gap-2 items-center mt-3 bg-slate-950/40 p-2.5 border border-slate-850 rounded-xl">
                                                    <span className="text-[10px] uppercase font-bold text-gray-400 font-mono">Grant Separate File Access:</span>
                                                    <select
                                                      onChange={(e) => {
                                                        const fileId = e.target.value;
                                                        if (fileId) {
                                                          handleTogglePermission(u, 'file', fileId, 'grant');
                                                          e.target.value = '';
                                                        }
                                                      }}
                                                      className="bg-slate-900 text-white text-[11px] rounded border border-slate-750 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer max-w-xs"
                                                      defaultValue=""
                                                    >
                                                      <option value="" disabled>-- Select a File to Grant Access --</option>
                                                      {unallowedSystemFiles.map((sf: any) => (
                                                        <option key={sf.id} value={sf.id}>
                                                          {sf.fileName}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      <span className="text-red-400 italic font-mono block text-center">Unable to map permission records.</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'coupons' && (userRole === 'Super Admin' || userRole === 'Admin') && (
        <CouponsTabPane token={token} userRole={userRole} />
      )}

      {activeTab === 'general' && (
        <div id="general-settings" className="bg-brand-card rounded-2xl border border-slate-800 p-5 md:p-6 space-y-4">
          <h3 className="text-md font-display font-bold text-white">General Branding Config</h3>
          <p className="text-xs text-gray-400 border-b border-slate-850 pb-3">Customize public appearance identifiers and custom domain mapping setups.</p>

          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Website Name</label>
                <input
                  type="text"
                  value={websiteName}
                  onChange={(e) => setWebsiteName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white placeholder-slate-550 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Custom Domain</label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white placeholder-slate-605 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Branded Logo URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png (fallback is text based logo)"
                className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white placeholder-slate-605 focus:outline-none"
              />
            </div>

            {settingsSuccess && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Global brand settings updated successfully!
              </div>
            )}

            {userRole === 'Super Admin' ? (
              <button
                type="submit"
                className="bg-cyan-500 hover:bg-cyan-600 transition text-slate-950 font-bold py-2 px-4 rounded-lg text-xs glow-btn cursor-pointer"
              >
                Save Branded Options
              </button>
            ) : (
              <div className="text-xs text-amber-500 font-mono">
                Only Super Admins can save changes. Your active role: {userRole}
              </div>
            )}
          </form>
        </div>
      )}

      {activeTab === 'drive' && (
        <div id="drive-settings" className="bg-brand-card rounded-2xl border border-slate-800 p-5 md:p-6 space-y-4">
          <h3 className="text-md font-display font-bold text-white">Drive Indexer Constraints</h3>
          <p className="text-xs text-gray-400 border-b border-slate-850 pb-3">Tune background recursive crawling limits, API thresholds and token timeout durations.</p>

          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Cron Indexing Schedule</label>
                <select
                  value={indexingSchedule}
                  onChange={(e) => setIndexingSchedule(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  <option value="manual">Manual Trigger Only</option>
                  <option value="hourly">Hourly Auto Re-Index</option>
                  <option value="daily">Daily Cron Task</option>
                  <option value="weekly">Weekly Purge & Refresh</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Max files per folder</label>
                <input
                  type="number"
                  value={maxFiles}
                  onChange={(e) => setMaxFiles(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white focus:outline-none"
                  min="10"
                  max="10000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Cache durations (Hours)</label>
                <input
                  type="number"
                  value={cacheDuration}
                  onChange={(e) => setCacheDuration(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Google API status</label>
                <div className="bg-slate-900 rounded-lg border border-slate-755 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> connected
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">v3 REST API</span>
                </div>
              </div>
            </div>

            {settingsSuccess && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Drive configs updated successfully!
              </div>
            )}

            {userRole === 'Super Admin' ? (
              <button
                type="submit"
                className="bg-cyan-500 hover:bg-cyan-600 transition text-slate-950 font-bold py-2 px-4 rounded-lg text-xs glow-btn cursor-pointer"
              >
                Save Drive Parameters
              </button>
            ) : (
              <div className="text-xs text-amber-500 font-mono">
                Only Super Admins can save changes. Your active role: {userRole}
              </div>
            )}
          </form>
        </div>
      )}

      {activeTab === 'ads' && (
        <div id="ads-settings" className="bg-brand-card rounded-2xl border border-slate-800 p-5 md:p-6 space-y-6">
          <div className="flex justify-between items-start border-b border-slate-850 pb-3">
            <div>
              <h3 className="text-md font-display font-bold text-white">Dynamic Advertisement Slots</h3>
              <p className="text-xs text-gray-400">Insert custom image banners and vertical sidebar posters with click-through redirection links.</p>
            </div>
            {userRole === 'Super Admin' && (
              <button
                type="button"
                onClick={() => {
                  setTitleBanner1Image('https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=60'); // Cinema neon banner
                  setTitleBanner1Link('https://unsplash.com');
                  setTitleBanner2Image('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=60'); // Theatre seats banner
                  setTitleBanner2Link('https://unsplash.com');
                  setDownloadBanner1Image('https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=500&auto=format&fit=crop&q=60'); // projector
                  setDownloadBanner1Link('https://unsplash.com');
                  setDownloadBanner2Image('https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=500&auto=format&fit=crop&q=60'); // film canister
                  setDownloadBanner2Link('https://unsplash.com');
                  setLeftPosterImage('https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80'); // vertical popcorn / cinema poster
                  setLeftPosterLink('https://unsplash.com');
                  setRightPosterImage('https://images.unsplash.com/photo-1542204172-e7052809a862?w=400&auto=format&fit=crop&q=80'); // vertical camera / film roll
                  setRightPosterLink('https://unsplash.com');
                }}
                className="bg-slate-800 hover:bg-slate-705 text-amber-400 hover:text-amber-300 transition text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer border border-slate-700/60"
              >
                ⚡ Load Sample Assets
              </button>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6 text-sm">
            {/* Title Banners */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">1. Optional 2 Banners Below Movie Title</h4>
                <p className="text-[11px] text-gray-500 font-sans mt-0.5">Optimal image bounds: 728×90 px (Leaderboard) or 468×60 px (Horizontal banner). <span className="text-cyan-400 font-bold">★ Pro Tip:</span> Leave Banner 2 empty to automatically display a single High-Impact Double-Height banner!</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">Header Banner 1</span>
                      <span className="text-[9px] bg-slate-800 text-cyan-400 border border-slate-700/60 px-1.5 py-0.5 rounded font-mono font-bold">728×90 / 468×60</span>
                    </div>
                    {titleBanner1Html ? (
                      <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-950/25 px-1.5 py-0.5 rounded border border-amber-900/30">Active HTML</span>
                    ) : titleBanner1Image ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-medium bg-cyan-950/25 px-1.5 py-0.5 rounded border border-cyan-900/30">Active Image</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Image URL</label>
                      <input
                        type="text"
                        placeholder="e.g. https://example.com/banner1.png"
                        value={titleBanner1Image}
                        onChange={(e) => setTitleBanner1Image(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex w-full items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-805 hover:border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium cursor-pointer transition duration-150">
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Upload Photo Banner</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setTitleBanner1Image)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {titleBanner1Image && (
                      <div className="relative mt-1 group border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex items-center gap-2">
                        <img src={titleBanner1Image} alt="Banner 1 Preview" className="h-10 w-16 object-cover rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">{titleBanner1Image.startsWith('data:') ? 'Custom Uploaded Photo' : titleBanner1Image}</span>
                        <button
                          type="button"
                          onClick={() => setTitleBanner1Image('')}
                          className="text-[10px] bg-red-950 hover:bg-red-900 text-red-400 font-bold px-2 py-1 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Redirect URL Link</label>
                      <input
                        type="text"
                        placeholder="e.g. https://target-redirect-website.com"
                        value={titleBanner1Link}
                        onChange={(e) => setTitleBanner1Link(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800/50">
                      <label className="block text-[11px] text-gray-400 mb-1">OR Custom Raw HTML Code (e.g. AdSense, custom JS embed)</label>
                      <textarea
                        rows={2}
                        placeholder='e.g. <iframe src="https://example.com/ad" width="100%" height="90"...></iframe>'
                        value={titleBanner1Html}
                        onChange={(e) => setTitleBanner1Html(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">Header Banner 2</span>
                      <span className="text-[9px] bg-slate-800 text-cyan-400 border border-slate-700/60 px-1.5 py-0.5 rounded font-mono font-bold">728×90 / 468×60</span>
                    </div>
                    {titleBanner2Html ? (
                      <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-950/25 px-1.5 py-0.5 rounded border border-amber-900/30">Active HTML</span>
                    ) : titleBanner2Image ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-medium bg-cyan-950/25 px-1.5 py-0.5 rounded border border-cyan-900/30">Active Image</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Image URL</label>
                      <input
                        type="text"
                        placeholder="e.g. https://example.com/banner2.png"
                        value={titleBanner2Image}
                        onChange={(e) => setTitleBanner2Image(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex w-full items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-805 hover:border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium cursor-pointer transition duration-150">
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Upload Photo Banner</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setTitleBanner2Image)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {titleBanner2Image && (
                      <div className="relative mt-1 group border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex items-center gap-2">
                        <img src={titleBanner2Image} alt="Banner 2 Preview" className="h-10 w-16 object-cover rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">{titleBanner2Image.startsWith('data:') ? 'Custom Uploaded Photo' : titleBanner2Image}</span>
                        <button
                          type="button"
                          onClick={() => setTitleBanner2Image('')}
                          className="text-[10px] bg-red-950 hover:bg-red-900 text-red-400 font-bold px-2 py-1 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Redirect URL Link</label>
                      <input
                        type="text"
                        placeholder="e.g. https://target-redirect-website.com"
                        value={titleBanner2Link}
                        onChange={(e) => setTitleBanner2Link(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800/50">
                      <label className="block text-[11px] text-gray-400 mb-1">OR Custom Raw HTML Code (e.g. AdSense, custom JS embed)</label>
                      <textarea
                        rows={2}
                        placeholder='e.g. <iframe src="https://example.com/ad" width="100%" height="90"...></iframe>'
                        value={titleBanner2Html}
                        onChange={(e) => setTitleBanner2Html(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Download Hub Banners */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">2. Optional 2 Banners Below Download/Save Button</h4>
                <p className="text-[11px] text-gray-500 font-sans mt-0.5">Optimal bounds: 300×250 px (Medium Rectangle) or 728×90 px layout box. <span className="text-cyan-400 font-bold">★ Pro Tip:</span> Leave Banner 2 empty to automatically display a single High-Impact Double-Height banner in this position!</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">Save Box Banner 1</span>
                      <span className="text-[9px] bg-slate-800 text-indigo-400 border border-slate-700/60 px-1.5 py-0.5 rounded font-mono font-bold">300×250 / 728×90</span>
                    </div>
                    {downloadBanner1Html ? (
                      <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-950/25 px-1.5 py-0.5 rounded border border-amber-900/30">Active HTML</span>
                    ) : downloadBanner1Image ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-medium bg-cyan-950/25 px-1.5 py-0.5 rounded border border-cyan-900/30">Active Image</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Image URL</label>
                      <input
                        type="text"
                        placeholder="e.g. https://example.com/save-banner1.png"
                        value={downloadBanner1Image}
                        onChange={(e) => setDownloadBanner1Image(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex w-full items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-805 hover:border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium cursor-pointer transition duration-150">
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Upload Photo Banner</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setDownloadBanner1Image)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {downloadBanner1Image && (
                      <div className="relative mt-1 group border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex items-center gap-2">
                        <img src={downloadBanner1Image} alt="Save Box 1 Preview" className="h-10 w-16 object-cover rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">{downloadBanner1Image.startsWith('data:') ? 'Custom Uploaded Photo' : downloadBanner1Image}</span>
                        <button
                          type="button"
                          onClick={() => setDownloadBanner1Image('')}
                          className="text-[10px] bg-red-950 hover:bg-red-900 text-red-400 font-bold px-2 py-1 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Redirect URL Link</label>
                      <input
                        type="text"
                        placeholder="e.g. https://target-redirect-website.com"
                        value={downloadBanner1Link}
                        onChange={(e) => setDownloadBanner1Link(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800/50">
                      <label className="block text-[11px] text-gray-400 mb-1">OR Custom Raw HTML Code (e.g. AdSense, custom JS embed)</label>
                      <textarea
                        rows={2}
                        placeholder='e.g. <iframe src="https://example.com/ad" width="100%" height="90"...></iframe>'
                        value={downloadBanner1Html}
                        onChange={(e) => setDownloadBanner1Html(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">Save Box Banner 2</span>
                      <span className="text-[9px] bg-slate-800 text-indigo-400 border border-slate-700/60 px-1.5 py-0.5 rounded font-mono font-bold">300×250 / 728×90</span>
                    </div>
                    {downloadBanner2Html ? (
                      <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-950/25 px-1.5 py-0.5 rounded border border-amber-900/30">Active HTML</span>
                    ) : downloadBanner2Image ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-medium bg-cyan-950/25 px-1.5 py-0.5 rounded border border-cyan-900/30">Active Image</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Image URL</label>
                      <input
                        type="text"
                        placeholder="e.g. https://example.com/save-banner2.png"
                        value={downloadBanner2Image}
                        onChange={(e) => setDownloadBanner2Image(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex w-full items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-805 hover:border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium cursor-pointer transition duration-150">
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Upload Photo Banner</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setDownloadBanner2Image)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {downloadBanner2Image && (
                      <div className="relative mt-1 group border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex items-center gap-2">
                        <img src={downloadBanner2Image} alt="Save Box 2 Preview" className="h-10 w-16 object-cover rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">{downloadBanner2Image.startsWith('data:') ? 'Custom Uploaded Photo' : downloadBanner2Image}</span>
                        <button
                          type="button"
                          onClick={() => setDownloadBanner2Image('')}
                          className="text-[10px] bg-red-950 hover:bg-red-900 text-red-400 font-bold px-2 py-1 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Redirect URL Link</label>
                      <input
                        type="text"
                        placeholder="e.g. https://target-redirect-website.com"
                        value={downloadBanner2Link}
                        onChange={(e) => setDownloadBanner2Link(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800/50">
                      <label className="block text-[11px] text-gray-400 mb-1">OR Custom Raw HTML Code (e.g. AdSense, custom JS embed)</label>
                      <textarea
                        rows={2}
                        placeholder='e.g. <iframe src="https://example.com/ad" width="100%" height="90"...></iframe>'
                        value={downloadBanner2Html}
                        onChange={(e) => setDownloadBanner2Html(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>            {/* Vertical Posters */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">3. Optional 1 Poster Each on Left and Right Sidebars</h4>
                <p className="text-[11px] text-gray-500 font-sans mt-0.5">Designed specifically for 160×600 px (Skyscraper) or 300×600 px (Vertical poster) assets.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white font-sans">Left Sidebar Poster</span>
                      <span className="text-[9px] bg-slate-800 text-purple-400 border border-slate-700/60 px-1.5 py-0.5 rounded font-mono font-bold">160×600 / 300×600</span>
                    </div>
                    {leftPosterHtml ? (
                      <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-950/25 px-1.5 py-0.5 rounded border border-amber-900/30">Active HTML</span>
                    ) : leftPosterImage ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-medium bg-cyan-950/25 px-1.5 py-0.5 rounded border border-cyan-900/30">Active Image</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Image URL (Vertical Poster)</label>
                      <input
                        type="text"
                        placeholder="e.g. https://example.com/left-poster.png"
                        value={leftPosterImage}
                        onChange={(e) => setLeftPosterImage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex w-full items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-805 hover:border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium cursor-pointer transition duration-150">
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Upload Photo Poster</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setLeftPosterImage)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {leftPosterImage && (
                      <div className="relative mt-1 group border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex items-center gap-2">
                        <img src={leftPosterImage} alt="Left Poster Preview" className="h-12 w-12 object-cover rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">{leftPosterImage.startsWith('data:') ? 'Custom Uploaded Photo' : leftPosterImage}</span>
                        <button
                          type="button"
                          onClick={() => setLeftPosterImage('')}
                          className="text-[10px] bg-red-950 hover:bg-red-900 text-red-400 font-bold px-2 py-1 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Redirect URL Link</label>
                      <input
                        type="text"
                        placeholder="e.g. https://target-redirect-website.com"
                        value={leftPosterLink}
                        onChange={(e) => setLeftPosterLink(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800/50">
                      <label className="block text-[11px] text-gray-400 mb-1">OR Custom Raw HTML Code (e.g. AdSense, custom JS embed)</label>
                      <textarea
                        rows={2}
                        placeholder='e.g. <iframe src="https://example.com/ad" width="100%" height="300"...></iframe>'
                        value={leftPosterHtml}
                        onChange={(e) => setLeftPosterHtml(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white font-sans">Right Sidebar Poster</span>
                      <span className="text-[9px] bg-slate-800 text-purple-400 border border-slate-700/60 px-1.5 py-0.5 rounded font-mono font-bold">160×600 / 300×600</span>
                    </div>
                    {rightPosterHtml ? (
                      <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-950/25 px-1.5 py-0.5 rounded border border-amber-900/30">Active HTML</span>
                    ) : rightPosterImage ? (
                      <span className="text-[10px] text-cyan-400 font-mono font-medium bg-cyan-950/25 px-1.5 py-0.5 rounded border border-cyan-900/30">Active Image</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Image URL (Vertical Poster)</label>
                      <input
                        type="text"
                        placeholder="e.g. https://example.com/right-poster.png"
                        value={rightPosterImage}
                        onChange={(e) => setRightPosterImage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex w-full items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-dashed border-slate-805 hover:border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 font-medium cursor-pointer transition duration-150">
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Upload Photo Poster</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setRightPosterImage)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {rightPosterImage && (
                      <div className="relative mt-1 group border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex items-center gap-2">
                        <img src={rightPosterImage} alt="Right Poster Preview" className="h-12 w-12 object-cover rounded" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">{rightPosterImage.startsWith('data:') ? 'Custom Uploaded Photo' : rightPosterImage}</span>
                        <button
                          type="button"
                          onClick={() => setRightPosterImage('')}
                          className="text-[10px] bg-red-950 hover:bg-red-900 text-red-400 font-bold px-2 py-1 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Redirect URL Link</label>
                      <input
                        type="text"
                        placeholder="e.g. https://target-redirect-website.com"
                        value={rightPosterLink}
                        onChange={(e) => setRightPosterLink(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 border-t border-slate-800/50">
                      <label className="block text-[11px] text-gray-400 mb-1">OR Custom Raw HTML Code (e.g. AdSense, custom JS embed)</label>
                      <textarea
                        rows={2}
                        placeholder='e.g. <iframe src="https://example.com/ad" width="100%" height="300"...></iframe>'
                        value={rightPosterHtml}
                        onChange={(e) => setRightPosterHtml(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {settingsSuccess && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Advertising slots configuration has been saved!
              </div>
            )}

            {userRole === 'Super Admin' ? (
              <button
                type="submit"
                className="bg-cyan-500 hover:bg-cyan-600 transition text-slate-950 font-bold py-2 px-4 rounded-lg text-xs glow-btn cursor-pointer"
              >
                Save Advertisements
              </button>
            ) : (
              <div className="text-xs text-amber-500 font-mono">
                Only Super Admins can save changes. Your active role: {userRole}
              </div>
            )}
          </form>
        </div>
      )}

      {activeTab === 'deployment' && (
        <div id="deployment-instructions" className="bg-brand-card rounded-2xl border border-slate-800 p-5 md:p-6 space-y-6">
          <div>
            <h3 className="text-lg font-display font-bold text-white flex items-center gap-1.5">
              <LayoutGrid className="w-5 h-5 text-purple-400" /> Cloudflare Workers Deployment Blueprint
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              This application has been structured dynamically to deploy perfectly into <strong>Cloudflare Workers + Cloudflare D1 + Cloudflare Pages</strong>. Below are the configurations and database SQL migrations prepared for your build.
            </p>
          </div>

          {/* D1 Migrations */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">1. Cloudflare D1 DB schema migrations (`schema.sql`)</h4>
            <div className="relative font-mono text-xs text-gray-400 bg-slate-900 p-4 rounded-xl border border-slate-850 overflow-x-auto max-h-56 leading-relaxed">
              <pre>{`-- KinoIndex Database Schema Migration

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Viewer',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  last_indexed TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  download_url TEXT NOT NULL,
  stream_url TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Unknown',
  browser TEXT NOT NULL,
  created_at TEXT NOT NULL
);`}</pre>
            </div>
          </div>

          {/* TOML setting */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">2. Wrangler Configuration (`wrangler.toml`)</h4>
            <div className="relative font-mono text-xs text-gray-400 bg-slate-900 p-4 rounded-xl border border-slate-850 overflow-x-auto leading-relaxed">
              <pre>{`name = "kinoindex-backend"
main = "src/index.ts"
compatibility_date = "2026-06-11"

# Bind your D1 database
[[d1_databases]]
binding = "DB"
database_name = "kinoindex_db"
database_id = "your-cloudflare-d1-database-uu-id"

# Bind KV for credentials caching
[[kv_namespaces]]
binding = "CRED_CACHE"
id = "your-kv-namespace-id"`}</pre>
            </div>
          </div>

          <div className="bg-purple-950/20 border border-purple-900/60 p-4 rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-purple-400" /> CLI Deploy Steps
            </h4>
            
            <ol className="list-decimal list-inside text-xs text-gray-400 space-y-2 leading-relaxed">
              <li>
                Initialize a D1 schema file: 
                <code className="bg-slate-900 px-1.5 py-0.5 rounded text-purple-300 font-mono text-[11px] ml-1">npx wrangler d1 create kinoindex_db</code>
              </li>
              <li>
                Apply the initial migration file: 
                <code className="bg-slate-900 px-1.5 py-0.5 rounded text-purple-300 font-mono text-[11px] ml-1">npx wrangler d1 execute kinoindex_db --file=./schema.sql</code>
              </li>
              <li>
                Build and sync the frontend build: 
                <code className="bg-slate-900 px-1.5 py-0.5 rounded text-purple-300 font-mono text-[11px] ml-1">npm run build</code>
              </li>
              <li>
                Deploy the static pages output directly to Cloudflare Pages: 
                <code className="bg-slate-900 px-1.5 py-0.5 rounded text-purple-300 font-mono text-[11px] ml-1">npx wrangler pages deploy dist</code>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-brand-card border border-slate-800 rounded-2xl w-full max-w-sm p-6 overflow-hidden space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-850">
              <h3 className="text-lg font-display font-bold text-white flex items-center gap-1.5">
                <UserPlus className="w-5 h-5 text-cyan-400" /> Invite Team Member
              </h3>
              <button
                onClick={() => {
                  setShowAddUserModal(false);
                  setUserFormError('');
                }}
                className="text-gray-400 hover:text-white text-lg font-semibold bg-transparent border-0 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 font-sans text-xs">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="e.g. user@kinoindex.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. johndoe"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Password plain text"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Role Permission
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full bg-slate-900 border border-slate-755 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                >
                  <option value="Viewer">Viewer (Can read files database only)</option>
                  <option value="Premium">Premium User (Can view designated premium index classes)</option>
                  {userRole === 'Super Admin' && (
                    <>
                      <option value="Admin">Admin (Can re-index drive folders)</option>
                      <option value="Super Admin">Super Admin (Full CRUD access control)</option>
                    </>
                  )}
                </select>
              </div>

              {userFormError && (
                <div className="p-3 bg-red-955/20 border border-red-900/60 text-red-300 text-xs rounded-lg flex items-start gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{userFormError}</span>
                </div>
              )}

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-300 font-semibold py-2 rounded-lg text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2 rounded-lg text-center glow-btn cursor-pointer"
                >
                  Confirm User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Action Dialog/Modal to bypass browser confirm/prompt sandboxed iframe restrictions */}
      {actionModal.type && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 font-sans select-text">
          <div className="bg-brand-card border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative animate-fade-in text-sm text-left">
            <h3 className="text-md font-display font-bold text-white flex items-center gap-1.5 select-none">
              {actionModal.type === 'promote' && 'Promote Member to Premium'}
              {actionModal.type === 'downgrade' && 'Downgrade Member to Viewer'}
              {actionModal.type === 'reset-password' && 'Reset Security Password'}
              {actionModal.type === 'delete' && 'Permanently Delete User Account'}
            </h3>
            
            <p className="text-xs text-gray-400">
              {actionModal.type === 'promote' && `Specify the premium validity period for member ${actionModal.user?.name}.`}
              {actionModal.type === 'downgrade' && `Are you sure you want to downgrade ${actionModal.user?.name} to standard Viewer status? They will lose access to premium movie request privileges.`}
              {actionModal.type === 'reset-password' && `Define a new secure system access password for ${actionModal.user?.name}.`}
              {actionModal.type === 'delete' && `Are you absolutely sure you want to permanently erase the user account of ${actionModal.user?.name}? This cannot be undone.`}
            </p>

            {actionModal.error && (
              <div className="p-2.5 bg-red-955/20 border border-red-900/60 text-red-350 text-xs rounded-xl font-mono select-none">
                {actionModal.error}
              </div>
            )}

            {(actionModal.type === 'promote' || actionModal.type === 'reset-password') && (
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-mono text-gray-400 font-bold mb-1 select-none">
                  {actionModal.type === 'promote' ? 'Duration in Days' : 'New secure password'}
                </label>
                <input
                  type={actionModal.type === 'promote' ? 'number' : 'text'}
                  value={actionModal.inputValue}
                  onChange={(e) => setActionModal(p => ({ ...p, inputValue: e.target.value }))}
                  placeholder={actionModal.type === 'promote' ? 'e.g. 30' : 'e.g. s3cur3P@ss'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  autoFocus
                />
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActionModal({ type: null, user: null, inputValue: '', loading: false, error: '' })}
                className="flex-1 bg-slate-800 hover:bg-slate-755 text-gray-300 font-semibold py-2 rounded-xl text-center cursor-pointer border-0 text-xs transition transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={actionModal.loading}
                className={`flex-1 text-slate-950 font-bold py-2 rounded-xl text-center cursor-pointer border-0 text-xs transition transition-all ${
                  actionModal.type === 'delete' ? 'bg-red-500 hover:bg-red-600 !text-white' : 'bg-cyan-500 hover:bg-cyan-600'
                }`}
              >
                {actionModal.loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CouponsTabPaneProps {
  token: string | null;
  userRole: string;
}

export function CouponsTabPane({ token, userRole }: CouponsTabPaneProps) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [hasExpiration, setHasExpiration] = useState(false); // Default to false (without validity/expiration)
  const [validUntil, setValidUntil] = useState('');
  const [usageLimit, setUsageLimit] = useState<'single' | 'multiple'>('multiple');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/coupons', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setCoupons(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(result);
  };

  useEffect(() => {
    fetchCoupons();
    // Default validUntil to 30 days from now in case they want to enable expiration
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    setValidUntil(nextMonth.toISOString().split('T')[0]);
  }, [token]);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !durationDays || (hasExpiration && !validUntil)) {
      setError('Please fill in all parameters.');
      return;
    }
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: code.trim(),
          durationDays: parseInt(durationDays, 10),
          validUntil: hasExpiration ? validUntil : null,
          usageLimit
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Coupon ${data.code} successfully created!`);
        setCode('');
        fetchCoupons();
      } else {
        setError(data.error || 'Failed to create coupon code.');
      }
    } catch (err) {
      console.error(err);
      setError('Network failure creating coupon.');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    try {
      const res = await fetch(`/api/coupons/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        fetchCoupons();
      } else {
        console.error('Failed to delete coupon code.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="coupons-settings" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creation section (Super Admin only) */}
        <div className="bg-brand-card rounded-2xl border border-slate-800 p-5 md:p-6 space-y-4 h-fit">
          <h3 className="text-md font-display font-bold text-white flex items-center gap-1.5">
            <Ticket className="w-5 h-5 text-cyan-400" /> Create Promotion Coupon
          </h3>
          <p className="text-xs text-gray-500">
            Generate printable promotion coupon codes standard Viewer users can redeem to upgrade themselves.
          </p>

          {userRole !== 'Super Admin' ? (
            <div className="text-xs text-amber-500 bg-amber-950/25 border border-amber-900/40 p-3 rounded-xl font-mono">
              &bull; Access Restricted: Only the Super Admin user is authorized to generate new promotion coupons.
            </div>
          ) : (
            <form onSubmit={handleCreateCoupon} className="space-y-3.5 text-sm">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold uppercase text-gray-400">Coupon Code</label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomCode}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold font-mono border-0 bg-transparent cursor-pointer p-0 underline decoration-dotted"
                  >
                    🎲 Random Code
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. SUMMER30"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-755/80 rounded-lg px-3 py-2 text-white placeholder-slate-655 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">User Limit Type</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setUsageLimit('single')}
                    className={`px-3 py-2 rounded-lg font-medium border text-center transition cursor-pointer border-0 ${
                      usageLimit === 'single'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-gray-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    🙋‍♂️ Single User
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsageLimit('multiple')}
                    className={`px-3 py-2 rounded-lg font-medium border text-center transition cursor-pointer border-0 ${
                      usageLimit === 'multiple'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-gray-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    👥 Multiple Users
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 font-mono">
                  {usageLimit === 'single' 
                    ? '• Coupon will be deactivated immediately after the first user redeems it.' 
                    : '• Coupon supports unlimited redemptions (each standard player/viewer once).'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Duration (Premium Days)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="30"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750/80 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">Expiration / End of Validity</label>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <button
                    type="button"
                    onClick={() => setHasExpiration(false)}
                    className={`px-3 py-1.5 rounded-lg font-medium border text-center transition cursor-pointer border-0 ${
                      !hasExpiration
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-gray-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    No Expiration
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasExpiration(true)}
                    className={`px-3 py-1.5 rounded-lg font-medium border text-center transition cursor-pointer border-0 ${
                      hasExpiration
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-gray-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    Has Expiration
                  </button>
                </div>
                {hasExpiration && (
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-755/80 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    required
                  />
                )}
              </div>

              {error && <p className="text-xs text-red-500 font-mono">{error}</p>}
              {success && <p className="text-xs text-emerald-450 font-mono font-medium">{success}</p>}

              <button
                type="submit"
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2 rounded-lg text-center font-display glow-btn text-xs border-0 cursor-pointer"
              >
                Create Coupon ✨
              </button>
            </form>
          )}
        </div>

        {/* Existing Coupons list */}
        <div className="lg:col-span-2 bg-brand-card rounded-2xl border border-slate-800 p-5 md:p-6 space-y-4">
          <h3 className="text-md font-display font-medium text-white">Active Coupons</h3>
          <p className="text-xs text-gray-450">These active coupons can currently be used by any standard Viewer member during validation.</p>

          <div className="overflow-x-auto rounded-xl border border-slate-855 bg-slate-950/40">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/60 uppercase tracking-wider font-mono text-[10px] text-gray-400">
                  <th className="py-2.5 px-4 font-bold">Coupon Code</th>
                  <th className="py-2.5 px-4">Duration</th>
                  <th className="py-2.5 px-4">Validity / limit</th>
                  <th className="py-2.5 px-4">Redeemed</th>
                  {userRole === 'Super Admin' && <th className="py-2.5 px-4 text-right">Delete</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {loading ? (
                  <tr>
                    <td colSpan={userRole === 'Super Admin' ? 5 : 4} className="py-8 text-center text-gray-500 font-mono text-xs">
                      <Loader className="w-3.5 h-3.5 animate-spin inline-block mr-1.5 text-cyan-400" /> Querying code list...
                    </td>
                  </tr>
                ) : coupons.length === 0 ? (
                  <tr>
                    <td colSpan={userRole === 'Super Admin' ? 5 : 4} className="py-8 text-center text-gray-500 font-mono text-xs italic">
                      No coupon codes have been registered yet.
                    </td>
                  </tr>
                ) : (
                  coupons.map((coupon: any) => {
                    const isExpired = coupon.validUntil ? new Date(coupon.validUntil).getTime() < Date.now() : false;
                    const redemptionCount = coupon.redeemedBy ? coupon.redeemedBy.length : 0;
                    return (
                      <tr key={coupon.id} className="hover:bg-slate-900/30">
                        <td className="py-3 px-4 font-bold font-mono text-white text-sm">
                          <span className="flex items-center gap-1.5">
                            <Ticket className={`w-3.5 h-3.5 ${isExpired ? 'text-gray-600' : 'text-emerald-400'}`} />
                            {coupon.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{coupon.durationDays} Days Premium</td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {coupon.validUntil ? (
                            <div className={isExpired ? 'text-red-400 line-through' : 'text-emerald-400'}>
                              Until: {new Date(coupon.validUntil).toLocaleDateString()} {isExpired && ' (Expired)'}
                            </div>
                          ) : (
                            <div className="text-emerald-400 font-medium">No Expiration (Lifetime)</div>
                          )}
                          <div className="text-[10px] text-gray-450 mt-0.5">
                            Limit: {coupon.usageLimit === 'single' ? 'Single User use' : 'Multiple Users use'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-gray-400">
                          {coupon.usageLimit === 'single' ? (
                            <span className={redemptionCount > 0 ? 'text-red-500 font-semibold' : 'text-emerald-400 font-semibold'}>
                              {redemptionCount} / 1 Used
                            </span>
                          ) : (
                            <span>{redemptionCount} Used</span>
                          )}
                        </td>
                        {userRole === 'Super Admin' && (
                          <td className="py-3 px-4 text-right select-none">
                            {deletingCouponId === coupon.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDeleteCoupon(coupon.id);
                                    setDeletingCouponId(null);
                                  }}
                                  className="text-[10px] bg-red-600 text-white font-bold py-1 px-2.5 rounded hover:bg-red-700 cursor-pointer border-0"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingCouponId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white cursor-pointer border-0 bg-transparent"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingCouponId(coupon.id)}
                                className="text-xs text-red-500 hover:text-red-400 font-bold cursor-pointer border-0 bg-transparent underline decoration-dotted"
                              >
                                Invalidate
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
