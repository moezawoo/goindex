import React, { useState, useRef } from 'react';
import { 
  User as UserIcon, Camera, Key, Lock, Loader, CheckCircle2, Shield,
  Sparkles, Flame, Ghost, Upload, Link, AlertCircle
} from 'lucide-react';
import { User } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  token: string;
  onUpdateUser: (updatedUser: any) => void;
}

const PRESET_GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-purple-500 to-indigo-600',
  'from-emerald-400 to-teal-600',
  'from-rose-550 to-pink-600',
  'from-amber-400 to-orange-650',
  'from-slate-700 to-slate-900',
];

const PRESET_ICONS = [
  { name: 'user', component: UserIcon },
  { name: 'sparkles', component: Sparkles },
  { name: 'flame', component: Flame },
  { name: 'ghost', component: Ghost },
  { name: 'shield', component: Shield }
];

export default function ProfileModal({ isOpen, onClose, user, token, onUpdateUser }: ProfileModalProps) {
  if (!isOpen) return null;

  // Profile fields state
  const [name, setName] = useState(user.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [selectedGradient, setSelectedGradient] = useState('');
  const [selectedIconName, setSelectedIconName] = useState('user');

  // Password fields state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status and feedback states
  const [loading, setLoading] = useState(false);
  const [errorMess, setErrorMess] = useState('');
  const [successMess, setSuccessMess] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to handle avatar presets
  const applyPresetAvatar = (gradient: string, icon: string) => {
    const presetCompound = `preset:${gradient}::${icon}`;
    setAvatarUrl(presetCompound);
  };

  // Convert uploaded image to base64
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMess('Only image files are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMess('Image size must be smaller than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        setErrorMess('');
      }
    };
    reader.onerror = () => {
      setErrorMess('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMess('');
    setSuccessMess('');

    // If changing password, validate new matches confirm
    if (oldPassword || newPassword || confirmPassword) {
      if (!oldPassword || !newPassword || !confirmPassword) {
        setErrorMess('Please provide your current password and both new passwords to update it.');
        setLoading(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMess('The response confirmation password does not match.');
        setLoading(false);
        return;
      }
      if (newPassword.length < 4) {
        setErrorMess('New password must be at least 4 characters long.');
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          avatarUrl: avatarUrl,
          oldPassword: oldPassword ? oldPassword : undefined,
          newPassword: newPassword ? newPassword : undefined,
          confirmPassword: confirmPassword ? confirmPassword : undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        onUpdateUser(data);
        setSuccessMess('Your account settings have been saved successfully!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setSuccessMess('');
        }, 3000);
      } else {
        setErrorMess(data.error || 'Failed to update your account settings.');
      }
    } catch (err: any) {
      setErrorMess('An error occurred during profile synchronization.');
    } finally {
      setLoading(false);
    }
  };

  // Render current active avatar image or gradient preset helper
  const renderAvatarPreview = () => {
    if (avatarUrl && avatarUrl.startsWith('preset:')) {
      const parts = avatarUrl.replace('preset:', '').split('::');
      const gradientClass = parts[0] || PRESET_GRADIENTS[0];
      const iconName = parts[1] || 'user';
      const SelectedIconObj = PRESET_ICONS.find(i => i.name === iconName)?.component || UserIcon;
      return (
        <div className={`w-20 h-20 rounded-full bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-white border-2 border-slate-750 shadow-md`}>
          <SelectedIconObj className="w-9 h-9" />
        </div>
      );
    }

    if (avatarUrl && (avatarUrl.startsWith('data:image') || avatarUrl.startsWith('http'))) {
      return (
        <img 
          src={avatarUrl} 
          alt="Avatar Preview" 
          referrerPolicy="no-referrer"
          className="w-20 h-20 rounded-full object-cover border-2 border-slate-755 shadow-md"
        />
      );
    }

    // Default Initials Avatar
    const initials = (name || user.name || '?').substring(0, 2).toUpperCase();
    return (
      <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-cyan-400 font-display font-bold text-xl tracking-tight shadow-md">
        {initials}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-55 overflow-y-auto">
      <div className="bg-brand-card border border-slate-800 rounded-3xl w-full max-w-lg p-5 md:p-6 space-y-5 shadow-2xl my-8 font-sans">
        
        {/* Header Block */}
        <div className="flex justify-between items-center pb-2.5 border-b border-slate-850">
          <div>
            <h3 className="text-md font-display font-bold text-white flex items-center gap-1.5">
              <Camera className="w-5 h-5 text-cyan-400" /> My Account Settings
            </h3>
            <p className="text-[11px] text-gray-400 font-mono">Customize profile identifier details and change password</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg font-semibold bg-transparent border-0 cursor-pointer p-1"
          >
            &times;
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          
          {/* Avatar and Info Block */}
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start p-3 bg-slate-900/50 rounded-2xl border border-slate-850">
            <div className="shrink-0 flex flex-col items-center gap-2">
              {renderAvatarPreview()}
              <span className="text-[10px] uppercase font-mono font-bold tracking-wide text-indigo-400">{user.role}</span>
            </div>
            
            <div className="flex-1 w-full space-y-1">
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-slate-500 block">Personal Profile</span>
              <h4 className="text-sm font-bold text-white">{name || user.name}</h4>
              <p className="text-gray-400 font-mono text-[10px]">@{user.username} &nbsp;|&nbsp; {user.email}</p>
              
              <div className="pt-1.5 flex flex-wrap gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-800 hover:bg-slate-750 text-gray-300 px-2 py-1 rounded transition cursor-pointer border-0"
                >
                  Change Photo
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="bg-slate-900 hover:bg-slate-850 text-red-400 border border-red-950/40 px-2 py-1 rounded transition cursor-pointer"
                  >
                    Clear Avatar
                  </button>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleImageUpload(e.target.files[0]);
                    }
                  }}
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Name Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-400"
                required
              />
            </div>
          </div>

          {/* Profile Picture Design / Upload Area */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Customize / Upload Profile Photo
            </label>
            
            {/* Tabs for choosing presets vs links */}
            <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl space-y-3">
              {/* Preset Avatar Toolpicker */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Preset 3D Abstract Gradients & Icons
                </span>
                
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {PRESET_GRADIENTS.map((gradient, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => applyPresetAvatar(gradient, selectedIconName)}
                      className={`w-7 h-7 rounded-full bg-gradient-to-tr ${gradient} border cursor-pointer hover:scale-105 active:scale-95 transition ${
                        avatarUrl.includes(gradient) ? 'border-white ring-2 ring-cyan-500/65' : 'border-slate-800'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex gap-2 pt-1.5 items-center">
                  <span className="text-[10px] text-gray-500 font-mono">Preset Icon:</span>
                  <div className="flex gap-1.5">
                    {PRESET_ICONS.map((it) => {
                      const IconComp = it.component;
                      return (
                        <button
                          key={it.name}
                          type="button"
                          onClick={() => {
                            setSelectedIconName(it.name);
                            // If a preset is currently selected, refresh with new icon
                            if (avatarUrl.startsWith('preset:')) {
                              const parts = avatarUrl.replace('preset:', '').split('::');
                              applyPresetAvatar(parts[0], it.name);
                            }
                          }}
                          className={`p-1 rounded cursor-pointer transition flex items-center justify-center border ${
                            selectedIconName === it.name ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20' : 'border-slate-800 text-gray-500 bg-slate-900/60'
                          }`}
                          title={`Display with ${it.name} icon`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Upload Drag/Drop Box */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border border-dashed rounded-lg p-3 text-center cursor-default transition ${
                  dragOver ? 'border-cyan-400 bg-cyan-950/10' : 'border-slate-800 hover:border-slate-700 bg-slate-900/60'
                }`}
              >
                <div className="flex flex-col items-center space-y-1">
                  <Upload className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="text-[10px] text-gray-300">
                    <span className="text-cyan-400 hover:underline cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      Upload file
                    </span>
                    &nbsp;or drag and drop here
                  </span>
                  <p className="text-[9px] text-gray-500 font-mono">PNG, Jpeg, Webp &bull; up to 2MB</p>
                </div>
              </div>

              {/* Custom Image URL */}
              <div className="space-y-1">
                <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                  <Link className="w-3.5 h-3.5 text-gray-500" /> External Image URL
                </span>
                <input
                  type="text"
                  placeholder="https://example.com/avatar.png"
                  value={avatarUrl && !avatarUrl.startsWith('preset:') && !avatarUrl.startsWith('data:image') ? avatarUrl : ''}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder-slate-700 focus:outline-none focus:border-cyan-400"
                />
              </div>

            </div>
          </div>

          {/* Password Reset Block */}
          <div className="p-3.5 bg-slate-900/50 border border-slate-850 rounded-2xl space-y-3.5">
            <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-cyan-400 flex items-center gap-1">
              <Key className="w-4 h-4 text-cyan-400" /> Change Secure Password
            </span>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">
                  Current Password
                </label>
                <input
                  type="password"
                  placeholder="Leave blank if not changing"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">
                    New Password
                  </label>
                  <input
                    type="password"
                    placeholder="New password (min 4 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    placeholder="Provide again to double-check"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {errorMess && (
            <div className="p-3 bg-red-955/20 border border-red-900/60 text-red-300 text-xs rounded-xl flex items-start gap-1.5 font-sans">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMess}</span>
            </div>
          )}

          {successMess && (
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs rounded-xl flex items-center gap-1.5 font-sans">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMess}</span>
            </div>
          )}

          {/* Footer Save Row */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-750 text-gray-300 font-semibold py-2.5 rounded-xl text-center cursor-pointer border-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:opacity-90 active:scale-95 transition text-slate-950 font-bold py-2.5 rounded-xl text-center cursor-pointer disabled:opacity-50 border-0 flex items-center justify-center gap-1"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Save Account Settings'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
