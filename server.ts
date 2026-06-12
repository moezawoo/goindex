/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import { db } from './src/server/db';
import { crawlGoogleDriveFolder, getGoogleDriveStream } from './src/server/drive';

// In-memory cache for the most recent Google access token used for proxy streaming
let systemAccessToken: string | null = null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple Request Logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // CORS and Middleware Setup
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // 1. AUTHENTICATION ROUTERS
  app.post('/api/auth/login', (req, res) => {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/Email and Password are required' });
    }

    const hashed = db.getUsers().find(u => u.username === usernameOrEmail || u.email === usernameOrEmail);
    if (!hashed) {
      // Find by email or username
      const searchByEmail = db.getUserByEmail(usernameOrEmail);
      const searchByUsername = db.getUserByUsername(usernameOrEmail);
      const user = searchByEmail || searchByUsername;
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid username/email or password' });
      }
      
      const pHash = cryptoHash(password);
      if (user.passwordHash !== pHash) {
        return res.status(401).json({ error: 'Invalid username/email or password' });
      }

      if (user.suspended) {
        return res.status(403).json({ error: 'Account suspended. Please contact Super Admin.' });
      }

      // Generate a simple auth sessions payload
      const mockToken = `token_${user.id}_${Date.now()}`;
      return res.json({ token: mockToken, user });
    } else {
      const pHash = cryptoHash(password);
      if (hashed.passwordHash !== pHash) {
        return res.status(401).json({ error: 'Invalid username/email or password' });
      }

      if (hashed.suspended) {
        return res.status(403).json({ error: 'Account suspended. Please contact Super Admin.' });
      }

      const mockToken = `token_${hashed.id}_${Date.now()}`;
      return res.json({ token: mockToken, user: hashed });
    }
  });

  // User Registration from the main web page URL (doesn't have access to any files unless allowed in folders list)
  app.post('/api/auth/signup', (req, res) => {
    const { name, email, username, password } = req.body;
    if (!name || !email || !username || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (db.getUserByUsername(username)) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    if (db.getUserByEmail(email)) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const newUser = db.addUser({
      name,
      email,
      username,
      role: 'Viewer',
      suspended: false,
      registeredViaDownload: false,
      allowedFileIds: []
    }, password);

    const mockToken = `token_${newUser.id}_${Date.now()}`;
    res.status(201).json({ token: mockToken, user: newUser });
  });

  // Google login callback (Auto-registers as Viewer and permits the specific file only)
  app.post('/api/auth/google-callback', (req, res) => {
    const { email, name, fileId } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is requested' });
    }

    // Find existing user or register
    let user = db.getUserByEmail(email);
    if (!user) {
      const username = email.split('@')[0];
      user = db.addUser({
        name: name || username,
        email: email,
        username: username,
        role: 'Viewer',
        suspended: false,
        registeredViaDownload: !!fileId,
        allowedFileIds: fileId ? [fileId] : []
      }, 'google_session_ignored');
    } else {
      // If user exists, update their allowed files and download registration context
      if (fileId) {
        const allowedFileIds = user.allowedFileIds || [];
        if (!allowedFileIds.includes(fileId)) {
          db.updateUser(user.id, {
            allowedFileIds: [...allowedFileIds, fileId],
            registeredViaDownload: true
          });
          user = db.getUserById(user.id) || user;
        }
      }
    }

    if (user.suspended) {
      return res.status(403).json({ error: 'Account suspended. Please contact Super Admin.' });
    }

    const mockToken = `token_${user.id}_${Date.now()}`;
    res.json({ token: mockToken, user });
  });

  // Fetch logged in user using direct header validation
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer token_')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = authHeader.replace('Bearer token_', '').split('_')[0];
    const user = db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.suspended) return res.status(403).json({ error: 'Account suspended' });

    res.json({ user });
  });

  // Forgot password option with email
  app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No user account found with this email address.' });
    }

    // Generate a secure temp password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdeghjkmnpqrstuvwxyz';
    let tempPassword = 'KINO-';
    for (let i = 0; i < 6; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    db.updateUser(user.id, { passwordPlainText: tempPassword });

    res.json({ success: true, tempPassword, username: user.username });
  });

  // Own Profile settings update for all user roles (Name, profile picture [avatarUrl], password change with old & 2x new password)
  app.put('/api/profile', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const { name, avatarUrl, oldPassword, newPassword, confirmPassword } = req.body;

    const updates: any = {};
    if (name) {
      updates.name = name;
    }
    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl;
    }

    if (oldPassword || newPassword || confirmPassword) {
      if (!oldPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'To change password, you must provide your old password, the new password, and its confirmation.' });
      }

      const hasholds = cryptoHash(oldPassword);
      if (user.passwordHash !== hasholds) {
        return res.status(400).json({ error: 'Incorrect current password.' });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'The new passwords do not match.' });
      }

      if (newPassword.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
      }

      updates.passwordPlainText = newPassword;
    }

    try {
      const updatedUser = db.updateUser(user.id, updates);
      res.json(updatedUser);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update user profile settings.' });
    }
  });

  // Users management lookup (Admin and Super Admin access for permission tracing)
  app.get('/api/users', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    res.json(db.getUsers());
  });

  // A viewer can self-promote to premium by requesting along with a coupon code
  app.post('/api/users/upgrade-with-coupon', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer token_')) {
      return res.status(401).json({ error: 'Auth token missing or invalid format' });
    }

    const userId = authHeader.replace('Bearer token_', '').split('_')[0];
    const user = db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User session not found' });
    }

    if (user.role !== 'Viewer') {
      return res.status(400).json({ error: 'Only Viewer role accounts can redeem coupons to upgrade' });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    const coupon = db.getCouponByCode(code);
    if (!coupon) {
      return res.status(400).json({ error: 'Invalid coupon code. Please verify and try again.' });
    }

    // Check usage limits
    const redeemedUsers = coupon.redeemedBy || [];
    if (coupon.usageLimit === 'single' && redeemedUsers.length >= 1) {
      return res.status(400).json({ error: 'This coupon is valid for a single user and has already been used.' });
    }

    if (redeemedUsers.includes(user.id)) {
      return res.status(400).json({ error: 'You have already redeemed this coupon code once.' });
    }

    // Check expiration date (only if validUntil is set)
    if (coupon.validUntil) {
      const expirationDate = new Date(coupon.validUntil);
      const now = new Date();
      // Compare dates (set hours to 0 to be lenient on actual day boundaries)
      const normalizedExp = new Date(expirationDate.getFullYear(), expirationDate.getMonth(), expirationDate.getDate(), 23, 59, 59);
      if (normalizedExp.getTime() < now.getTime()) {
        return res.status(400).json({ error: 'This coupon code has expired and is no longer valid.' });
      }
    }

    // Update user role to Premium, set duration and expiry
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + coupon.durationDays);

    const updated = db.updateUser(user.id, {
      role: 'Premium',
      premiumDurationDays: coupon.durationDays,
      premiumExpiresAt: expiry.toISOString()
    });

    // Record redemption
    db.recordCouponRedemption(coupon.id, user.id);

    res.json({ success: true, user: updated, coupon });
  });

  // Coupons API management routes (Admins/Super Admins can view; Super Admin creates/deletes)
  app.get('/api/coupons', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;
    res.json(db.getCoupons());
  });

  app.post('/api/coupons', (req, res) => {
    const currUser = requireSuperAdmin(req, res);
    if (!currUser) return;

    let { code, durationDays, validUntil, usageLimit } = req.body;
    if (!code || !durationDays) {
      return res.status(400).json({ error: 'Missing code or durationDays parameters' });
    }

    if (code === '__autoset_random__') {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      code = result;
    }

    const parsedDays = Number(durationDays);
    if (isNaN(parsedDays) || parsedDays <= 0) {
      return res.status(400).json({ error: 'durationDays must be a positive integer.' });
    }

    const existing = db.getCouponByCode(code);
    if (existing) {
      return res.status(400).json({ error: 'A coupon with this code already exists.' });
    }

    const couponExpiry = (validUntil && validUntil !== 'null' && validUntil !== '') ? validUntil : null;

    const newCoupon = db.addCoupon({
      code,
      durationDays: parsedDays,
      validUntil: couponExpiry,
      createdBy: currUser.id,
      usageLimit: usageLimit === 'single' ? 'single' : 'multiple'
    });

    res.status(201).json(newCoupon);
  });

  app.delete('/api/coupons/:id', (req, res) => {
    const currUser = requireSuperAdmin(req, res);
    if (!currUser) return;

    db.deleteCoupon(req.params.id);
    res.json({ success: true });
  });

  // Movie Requests API routes
  app.get('/api/movie-requests', (req, res) => {
    const currUser = requireUser(req, res);
    if (!currUser) return;
    res.json(db.getMovieRequests());
  });

  app.post('/api/movie-requests', (req, res) => {
    const currUser = requireUser(req, res);
    if (!currUser) return;

    if (currUser.role !== 'Premium' && currUser.role !== 'Super Admin' && currUser.role !== 'Admin') {
      return res.status(403).json({ error: 'Only Premium user accounts can submit movie requests.' });
    }

    const { movieName, releaseYear } = req.body;
    if (!movieName || !releaseYear) {
      return res.status(400).json({ error: 'Movie Name and Release year parameters are required.' });
    }

    const yearNum = Number(releaseYear);
    if (isNaN(yearNum) || yearNum < 1880 || yearNum > 2100) {
      return res.status(400).json({ error: 'Please enter a valid release year (e.g. 2024).' });
    }

    const newRequest = db.addMovieRequest(movieName.trim(), yearNum, currUser);
    res.status(201).json(newRequest);
  });

  app.put('/api/movie-requests/:id', (req, res) => {
    const currUser = requireUser(req, res);
    if (!currUser) return;

    if (currUser.role !== 'Super Admin' && currUser.role !== 'Admin') {
      return res.status(403).json({ error: 'Only administrators can update request status.' });
    }

    const { uploaded, confirmed } = req.body;
    const updates: any = {};

    if (uploaded !== undefined) {
      updates.uploaded = !!uploaded;
    }

    if (confirmed !== undefined) {
      if (currUser.role !== 'Super Admin') {
        return res.status(403).json({ error: 'Only Super Admins can confirm movie uploads.' });
      }
      updates.confirmed = !!confirmed;
    }

    const updated = db.updateMovieRequest(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Movie request not found.' });
    }

    res.json(updated);
  });

  app.post('/api/movie-requests/simulate-expiration', (req, res) => {
    const currUser = requireUser(req, res);
    if (!currUser) return;

    const requests = db.getMovieRequests();
    const fortyNineHoursAgo = new Date(Date.now() - 49 * 3600 * 1000).toISOString();
    
    // Update all completed requests to be very old
    requests.forEach(req => {
      if (req.uploaded && req.confirmed) {
        db.updateMovieRequest(req.id, { confirmed: true });
        // Since updateMovieRequest sets confirmedAt with new Date() if confirmed is provided, 
        // let's manually write confirmedAt into the DB, or modify it.
        // Let's check how updateMovieRequest works - we can set it to fortyNineHoursAgo!
        // To bypass updateMovieRequest auto-timestamping, we can pass confirmedAt directly or write a custom update.
      }
    });

    // Let's directly touch the db state for simulation to make it absolutely robust
    const dbRequests = (db as any).state.movieRequests || [];
    dbRequests.forEach((req: any) => {
      if (req.uploaded && req.confirmed) {
        req.confirmedAt = fortyNineHoursAgo;
      }
    });
    db.save();

    res.json({ success: true });
  });

  // Calculate detailed folder and files access permissions for a specific user ID
  app.get('/api/users/:id/permissions-info', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const targetUser = db.getUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const folders = db.getFolders();
    const systemFiles = db.getFiles() || [];
    const foldersList: any[] = [];
    const directAccessibleFiles: any[] = [];
    const inheritedFiles: any[] = [];

    folders.forEach(f => {
      let isAllowed = false;
      if (targetUser.role === 'Super Admin') {
        isAllowed = true;
      } else if (targetUser.role === 'Admin') {
        const hasRolesLimit = f.allowedRoles && f.allowedRoles.length > 0;
        const hasUsersLimit = f.allowedUserIds && f.allowedUserIds.length > 0;
        if (!hasRolesLimit && !hasUsersLimit) {
          isAllowed = true;
        } else {
          if (hasRolesLimit && f.allowedRoles?.includes('Admin')) isAllowed = true;
          if (hasUsersLimit && f.allowedUserIds?.includes(targetUser.id)) isAllowed = true;
        }
      } else if (targetUser.role === 'Premium') {
        const hasRolesLimit = f.allowedRoles && f.allowedRoles.length > 0;
        const hasUsersLimit = f.allowedUserIds && f.allowedUserIds.length > 0;
        if (!hasRolesLimit && !hasUsersLimit) {
          isAllowed = true;
        } else {
          if (hasRolesLimit && f.allowedRoles?.includes('Premium')) isAllowed = true;
          if (hasUsersLimit && f.allowedUserIds?.includes(targetUser.id)) isAllowed = true;
        }
      } else if (targetUser.role === 'Viewer') {
        if (!targetUser.registeredViaDownload) {
          const allowedUserIds = f.allowedUserIds || [];
          if (allowedUserIds.includes(targetUser.id)) {
            isAllowed = true;
          }
        }
      }

      const filesInFolder = systemFiles.filter(file => file.folderId === f.id);
      
      foldersList.push({
        id: f.id,
        folderName: f.folderName,
        slug: f.slug,
        allowedUserIds: f.allowedUserIds || [],
        allowedRoles: f.allowedRoles || [],
        hasAccess: isAllowed,
        fileCount: filesInFolder.length,
        files: filesInFolder.map(file => {
          const isDirectlyAllowed = targetUser.allowedFileIds?.includes(file.fileId) || targetUser.allowedFileIds?.includes(file.id);
          return {
            id: file.id,
            fileId: file.fileId,
            fileName: file.fileName,
            hasAccess: isAllowed || isDirectlyAllowed,
            isDirectAccess: isDirectlyAllowed
          };
        })
      });
    });

    systemFiles.forEach(file => {
      const folder = folders.find(f => f.id === file.folderId);
      if (!folder) return;

      const folderData = foldersList.find(fd => fd.id === folder.id);
      const isAllowedFolder = folderData ? folderData.hasAccess : false;
      const isDirectlyAllowed = targetUser.allowedFileIds?.includes(file.fileId) || targetUser.allowedFileIds?.includes(file.id);

      if (isAllowedFolder) {
        inheritedFiles.push({
          id: file.id,
          fileId: file.fileId,
          fileName: file.fileName,
          folderName: folder.folderName,
          source: 'Folder permission'
        });
      } else if (isDirectlyAllowed) {
        directAccessibleFiles.push({
          id: file.id,
          fileId: file.fileId,
          fileName: file.fileName,
          folderName: folder.folderName,
          source: 'Direct download registry'
        });
      }
    });

    res.json({
      userId: targetUser.id,
      name: targetUser.name,
      role: targetUser.role,
      foldersList,
      directAccessibleFiles,
      inheritedFiles,
      allSystemFiles: systemFiles.map(f => ({ id: f.id, fileId: f.fileId, fileName: f.fileName, folderId: f.folderId }))
    });
  });

  // Grant or Revoke individual folder or file access to/from a user
  app.post('/api/permissions/toggle', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const { targetUserId, type, targetId, action } = req.body; // type: 'folder' | 'file', action: 'grant' | 'revoke'
    if (!targetUserId || !type || !targetId || !action) {
      return res.status(400).json({ error: 'Missing targetUserId, type, targetId, or action' });
    }

    const targetUser = db.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Role check:
    // "a super admin can add or remove ... from any user"
    // "an admin can add or remove ... by a viewer and a premium user."
    if (currUser.role !== 'Super Admin') {
      if (currUser.role === 'Admin') {
        if (targetUser.role !== 'Viewer' && targetUser.role !== 'Premium') {
          return res.status(403).json({ error: 'Admins can only adjust folder/file access for Viewers and Premium users.' });
        }
      } else {
        return res.status(403).json({ error: 'Access Denied: You do not have permissions to adjust permissions for this member.' });
      }
    }

    if (type === 'folder') {
      const folder = db.getFolderById(targetId);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      let allowedUserIds = folder.allowedUserIds || [];
      if (action === 'grant') {
        if (!allowedUserIds.includes(targetUserId)) {
          allowedUserIds = [...allowedUserIds, targetUserId];
        }
      } else if (action === 'revoke') {
        allowedUserIds = allowedUserIds.filter(id => id !== targetUserId);
      }
      db.updateFolder(folder.id, { allowedUserIds });
    } else if (type === 'file') {
      const file = db.getFileById(targetId) || db.getFiles().find(f => f.fileId === targetId || f.id === targetId);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      let allowedFileIds = targetUser.allowedFileIds || [];
      const fileKey = file.fileId || file.id;
      if (action === 'grant') {
        if (!allowedFileIds.includes(fileKey)) {
          allowedFileIds = [...allowedFileIds, fileKey];
        }
      } else if (action === 'revoke') {
        allowedFileIds = allowedFileIds.filter(id => id !== fileKey && id !== file.id && id !== file.fileId);
      }
      db.updateUser(targetUser.id, { allowedFileIds });
    }

    res.json({ success: true });
  });

  // Create user (Super Admin can invite all levels, Admin can invite Viewer and Premium users only)
  app.post('/api/users', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const { name, email, username, password, role } = req.body;
    if (!name || !email || !username || !password || !role) {
      return res.status(400).json({ error: 'Name, Email, Username, Password, and Role are required' });
    }

    // Role permissions validation
    if (currUser.role === 'Admin') {
      if (role !== 'Viewer' && role !== 'Premium') {
        return res.status(403).json({ error: 'Admins can only invite Viewer and Premium users.' });
      }
    }

    if (db.getUserByUsername(username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    if (db.getUserByEmail(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = db.addUser({
      name,
      email,
      username,
      role,
      suspended: false
    }, password);

    res.status(201).json(newUser);
  });

  // Update user (Admin and Super Admin option, restricted roles to and fro Viewer & Premium)
  app.put('/api/users/:id', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const targetUser = db.getUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const { name, email, username, password, role, suspended, premiumDurationDays } = req.body;

    // "Make sure Downgrade and upgrade by super admin user and admin user just to and fro viewer and premium user roles, not for other roles."
    if (role && role !== targetUser.role) {
      if (
        (targetUser.role !== 'Viewer' && targetUser.role !== 'Premium') ||
        (role !== 'Viewer' && role !== 'Premium')
      ) {
        return res.status(403).json({ error: 'Role upgrades and downgrades are strictly restricted to and fro Viewer and Premium roles only.' });
      }
    }

    // Admins can only update Viewer/Premium users
    if (currUser.role === 'Admin') {
      if (targetUser.role !== 'Viewer' && targetUser.role !== 'Premium') {
        return res.status(403).json({ error: 'Admins can only adjust permissions/roles/passwords for Viewer and Premium users.' });
      }
      if (name || email || username) {
        return res.status(403).json({ error: 'Admins cannot change user account profile details (Name, Email, Username).' });
      }
    }

    try {
      const updates: any = {};
      
      // Profile details update only allowed for Super Admin
      if (currUser.role === 'Super Admin') {
        if (name) updates.name = name;
        if (email) updates.email = email;
        if (username) updates.username = username;
      }
      
      // Reset/set password allowed for Super Admin (all roles) or Admin (Viewer/Premium accounts only)
      if (password) {
        updates.passwordPlainText = password;
      }
      
      if (role) updates.role = role;
      if (suspended !== undefined) updates.suspended = suspended;

      // Handle duration when promoting Viewer -> Premium
      if (role === 'Premium' && targetUser.role === 'Viewer') {
        const days = Number(premiumDurationDays);
        if (isNaN(days) || days <= 0) {
          return res.status(400).json({ error: 'A set duration of days is required during promotion to Premium.' });
        }
        updates.premiumDurationDays = days;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);
        updates.premiumExpiresAt = expiry.toISOString();
      } else if (role === 'Viewer' && targetUser.role === 'Premium') {
        // Clear duration/expiration when downgrading
        updates.premiumDurationDays = null;
        updates.premiumExpiresAt = null;
      }

      const updated = db.updateUser(req.params.id, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update user parameters' });
    }
  });

  // Delete user (Super Admin Only)
  app.delete('/api/users/:id', (req, res) => {
    const currUser = requireSuperAdmin(req, res);
    if (!currUser) return;

    if (req.params.id === 'super-admin-id') {
      return res.status(400).json({ error: 'Cannot delete the primary Super Admin account' });
    }

    db.deleteUser(req.params.id);
    res.json({ success: true });
  });

  // 2. GOOGLE DRIVE FOLDERS & INDEXING MANAGEMENT
  // Create / Register google drive folder
  app.post('/api/folders', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const { folderId, folderName, slug } = req.body;
    if (!folderId || !folderName || !slug) {
      return res.status(400).json({ error: 'Folder ID, Folder Name, and Slug are required' });
    }

    // Clean slug
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    if (db.getFolderBySlug(cleanSlug)) {
      return res.status(400).json({ error: 'Slug is already used by another folder' });
    }

    const folder = db.addFolder({
      folderId,
      folderName,
      slug: cleanSlug,
      publicUrl: `/s/${cleanSlug}`,
      createdBy: currUser.id
    });

    res.status(201).json(folder);
  });

  // Retrieve folders
  app.get('/api/folders', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer token_')) {
      return res.status(401).json({ error: 'Unauthorized: invalid or missing administrative credentials' });
    }

    const userId = authHeader.replace('Bearer token_', '').split('_')[0];
    const user = db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User session not found' });
    }

    if (user.suspended) {
      return res.status(403).json({ error: 'This user account is currently suspended' });
    }

    let folders = db.getFolders();
    if (user.role !== 'Super Admin') {
      folders = folders.filter(f => {
        const hasRolesLimit = f.allowedRoles && f.allowedRoles.length > 0;
        const hasUsersLimit = f.allowedUserIds && f.allowedUserIds.length > 0;
        // Default to public access if no limits are configured
        if (!hasRolesLimit && !hasUsersLimit) return true;

        if (hasRolesLimit && f.allowedRoles?.includes(user.role)) return true;
        if (hasUsersLimit && f.allowedUserIds?.includes(user.id)) return true;
        return false;
      });
    }

    res.json(folders);
  });

  // Update folder permissions/properties (Super Admin Only)
  app.put('/api/folders/:id/permissions', (req, res) => {
    const currUser = requireSuperAdmin(req, res);
    if (!currUser) return;

    const { allowedRoles, allowedUserIds } = req.body;
    try {
      const updated = db.updateFolder(req.params.id, {
        allowedRoles: allowedRoles || [],
        allowedUserIds: allowedUserIds || []
      });
      res.json(updated);
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Folder not found' });
    }
  });

  // Delete folder index
  app.delete('/api/folders/:id', (req, res) => {
    const currUser = requireSuperAdmin(req, res);
    if (!currUser) return;

    db.deleteFolder(req.params.id);
    res.json({ success: true });
  });

  // Indexing scan endpoint - crawls Google Drive recursively
  app.post('/api/folders/:id/index', async (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'Google Drive access token is required' });
    }

    const folderId = req.params.id;
    const folder = db.getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Folder index record not found' });
    }

    // Update system token for streaming
    systemAccessToken = accessToken;

    // Mark status as indexing
    db.updateFolder(folderId, { status: 'indexing' });

    res.json({ message: 'Indexing started in background' });

    // Background process to gather files recursively
    try {
      const settings = db.getSettings();
      console.log(`Starting recursive search on folder ${folder.folderId} with limit: ${settings.maxFilesPerFolder}`);
      
      const filesCrawl = await crawlGoogleDriveFolder(
        folder.folderId, 
        accessToken, 
        settings.maxFilesPerFolder
      );

      console.log(`Indexed successfully. Found ${filesCrawl.length} files. Syncing to DB.`);
      
      db.syncFilesForFolder(folderId, filesCrawl);
      db.updateFolder(folderId, { 
        status: 'completed',
        lastIndexed: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(`Recursive Indexing Failed on Folder ${folder.folderId}:`, err);
      db.updateFolder(folderId, { status: 'failed' });
    }
  });

  // 3. PUBLIC PUBLIC PAGES API
  // Get index data for public page
  app.get('/api/public/folders/:slug', (req, res) => {
    const { slug } = req.params;
    const folder = db.getFolderBySlug(slug);
    
    if (!folder) {
      return res.status(404).json({ error: 'The requested category or folder was not found' });
    }

    let files = db.getFiles(folder.id);

    // Grab authorization header to verify access if logged in
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer token_')) {
      const userId = authHeader.replace('Bearer token_', '').split('_')[0];
      const user = db.getUserById(userId);
      if (user) {
        if (user.suspended) {
          return res.status(403).json({ error: 'This user account is currently suspended' });
        }
        
        const isAllowed = hasFolderAccess(user, folder);
        if (!isAllowed) {
          if (user.role === 'Viewer' && user.registeredViaDownload) {
            files = files.filter(f => user.allowedFileIds?.includes(f.fileId) || user.allowedFileIds?.includes(f.id));
          } else {
            return res.status(403).json({ error: 'Access Denied: You do not have permission to view files in this folder. Please register to contact User Admins or promote to Premium to grant access.' });
          }
        } else {
          // Has folder access, but filter if standard viewer registered via download
          if (user.role === 'Viewer') {
            if (user.registeredViaDownload) {
              files = files.filter(f => user.allowedFileIds?.includes(f.fileId) || user.allowedFileIds?.includes(f.id));
            } else {
              const allowedUserIds = folder.allowedUserIds || [];
              if (!allowedUserIds.includes(user.id)) {
                return res.status(403).json({ error: 'Access Denied: You do not have permission to view files in this folder. Contact Admins to grant explicit user permissions.' });
              }
            }
          }
        }
      }
    } else {
      // If folder has restrictions, require authenticating
      const hasRolesLimit = folder.allowedRoles && folder.allowedRoles.length > 0;
      const hasUsersLimit = folder.allowedUserIds && folder.allowedUserIds.length > 0;
      if (hasRolesLimit || hasUsersLimit) {
        return res.status(401).json({ error: 'Authentication Required: Please sign in to view this restricted category.' });
      }
    }

    res.json({
      folderName: folder.folderName,
      slug: folder.slug,
      lastIndexed: folder.lastIndexed,
      filesCount: files.length,
      files
    });
  });

  // Get index data for individual file
  app.get('/api/public/files/:fileId', (req, res) => {
    const { fileId } = req.params;
    const file = db.getFileById(fileId) || db.getFiles().find(f => f.fileId === fileId || f.id === fileId);
    if (!file) {
      return res.status(404).json({ error: 'File folder or resource was not found' });
    }

    // Grab authorization header to verify file access
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer token_')) {
      const userId = authHeader.replace('Bearer token_', '').split('_')[0];
      const user = db.getUserById(userId);
      if (user) {
        if (user.suspended) {
          return res.status(403).json({ error: 'This user account is currently suspended' });
        }
        const folder = db.getFolderById(file.folderId);
        if (folder) {
          const isAllowedFolder = hasFolderAccess(user, folder);
          if (!isAllowedFolder) {
            const isDirectAllowed = user.allowedFileIds?.includes(file.fileId) || user.allowedFileIds?.includes(file.id);
            if (!isDirectAllowed) {
              return res.status(403).json({ error: 'Access Denied: You only have permission to access files you registered for downloads.' });
            }
          } else {
            if (user.role === 'Viewer') {
              if (user.registeredViaDownload) {
                const isAllowed = user.allowedFileIds?.includes(file.fileId) || user.allowedFileIds?.includes(file.id);
                if (!isAllowed) {
                  return res.status(403).json({ error: 'Access Denied: You only have permission to access files you registered for downloads.' });
                }
              } else {
                const isAllowedUser = folder.allowedUserIds?.includes(user.id);
                if (!isAllowedUser) {
                  return res.status(403).json({ error: 'Access Denied: You do not have permission to view files in this folder. Permission must be granted by User Admins.' });
                }
              }
            }
          }
        }
      }
    }

    res.json(file);
  });

  // 4. STREAMING PROXY API (ROBUST CHUNK-AWARE PIPE WITH RE-BUFFERS)
  app.get('/api/stream/:fileId', async (req, res) => {
    const { fileId } = req.params;
    
    // Validate session token if passed to restrict unauthorized streaming
    const authHeader = req.headers.authorization;
    const sessionToken = (req.query.sessionToken as string) || (authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null);
    if (sessionToken && sessionToken.startsWith('token_')) {
      const userId = sessionToken.replace('token_', '').split('_')[0];
      const user = db.getUserById(userId);
      if (user) {
        if (user.suspended) {
          return res.status(403).send('Unauthorized: Account is suspended.');
        }
        const file = db.getFileById(fileId) || db.getFiles().find(f => f.fileId === fileId || f.id === fileId);
        if (file) {
          const folder = db.getFolderById(file.folderId);
          if (folder) {
            const isAllowedFolder = hasFolderAccess(user, folder);
            if (!isAllowedFolder) {
              const isDirectAllowed = user.allowedFileIds?.includes(file.fileId) || user.allowedFileIds?.includes(file.id);
              if (!isDirectAllowed) {
                return res.status(403).send('Access Denied: You only have permission to stream files you registered for downloads.');
              }
            } else {
              if (user.role === 'Viewer') {
                if (user.registeredViaDownload) {
                  const isAllowed = user.allowedFileIds?.includes(file.fileId) || user.allowedFileIds?.includes(file.id);
                  if (!isAllowed) {
                    return res.status(403).send('Access Denied: You only have permission to stream files you registered for downloads.');
                  }
                } else {
                  const isAllowedUser = folder.allowedUserIds?.includes(user.id);
                  if (!isAllowedUser) {
                    return res.status(403).send('Access Denied: You do not have permission to stream files in this folder. Admin authorization is required.');
                  }
                }
              }
            }
          }
        }
      }
    }

    // Support using client-passed token or memorized administrator token
    const token = (req.query.token as string) || systemAccessToken;

    if (!token) {
      console.error('Streaming request rejected: No active Google access token found.');
      return res.status(401).send('Unauthorized: Google credential required to stream files.');
    }

    const rangeHeader = req.headers.range;

    try {
      const { response: driveResponse, contentType, contentLength } = await getGoogleDriveStream(fileId, token, rangeHeader);

      // Setup proxy response headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');

      if (driveResponse.headers.has('content-range')) {
        res.setHeader('Content-Range', driveResponse.headers.get('content-range')!);
      }

      // Read status code from google response (200 or 206)
      const statusCode = driveResponse.status;
      const respContentLen = driveResponse.headers.get('content-length');
      if (respContentLen) {
        res.setHeader('Content-Length', respContentLen);
      } else {
        res.setHeader('Content-Length', contentLength);
      }

      res.writeHead(statusCode);

      // Pipe high performance stream
      if (driveResponse.body) {
        const reader = driveResponse.body.getReader();
        const pump = async () => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(Buffer.from(value));
          await pump();
        };
        await pump();
      } else {
        res.status(502).send('Error proxying binary content stream from Google Drive');
      }

    } catch (err: any) {
      console.error(`Streaming Proxy Failed for file ${fileId}:`, err);
      res.status(500).send(`Stream Proxy Failure: ${err.message || 'Unknown Server Error'}`);
    }
  });

  // 5. ANALYTICS & LOGGING SYSTEM
  app.post('/api/analytics', (req, res) => {
    const { fileId, eventType, country, browser, device, referrer } = req.body;
    if (!fileId || !eventType) {
      return res.status(400).json({ error: 'fileId and eventType are required' });
    }

    // IP Hash for privacy
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ipString = Array.isArray(ip) ? ip[0] : ip;
    const ipHash = cryptoHash(ipString);

    db.trackEvent({
      fileId,
      eventType,
      ipHash,
      country: country || 'Unknown',
      browser: browser || 'Unknown',
      device: device || 'Desktop',
      referrer: referrer || 'Direct'
    });

    res.json({ success: true });
  });

  // Fetch unified analytics report
  app.get('/api/analytics/summary', (req, res) => {
    const currUser = requireAdminOrSuper(req, res);
    if (!currUser) return;

    const events = db.getAnalytics();
    const files = db.getFiles();
    const folders = db.getFolders();

    // Sum files totals
    const totalFiles = files.length;
    const totalFolders = folders.length;

    // Filter analytics
    const todayStr = new Date().toISOString().split('T')[0];
    const downloadsToday = events.filter(e => e.eventType === 'download' && e.createdAt.startsWith(todayStr)).length;
    const viewsToday = events.filter(e => (e.eventType === 'view' || e.eventType === 'stream_click') && e.createdAt.startsWith(todayStr)).length;

    // Lifetime
    const lifetimeViews = events.filter(e => e.eventType === 'view' || e.eventType === 'stream_click').length;
    const lifetimeDownloads = events.filter(e => e.eventType === 'download').length;
    // watch hours is view count * 0.5hr approx for stats
    const watchHours = parseFloat((lifetimeViews * 0.45).toFixed(1));

    // Group views by day
    let fromDateStr = (req.query.from as string) || '';
    let toDateStr = (req.query.to as string) || '';

    if (!fromDateStr || !toDateStr || isNaN(Date.parse(fromDateStr)) || isNaN(Date.parse(toDateStr))) {
      const today = new Date();
      const past7 = new Date();
      past7.setDate(today.getDate() - 6);
      fromDateStr = past7.toISOString().split('T')[0];
      toDateStr = today.toISOString().split('T')[0];
    }

    const start = new Date(fromDateStr);
    const end = new Date(toDateStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const safeDays = Math.min(diffDays, 365); // safety limit

    const dailyViews: Record<string, number> = {};
    const monthlyDownloads: Record<string, number> = {};

    for (let i = 0; i < safeDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateKey = d.toISOString().split('T')[0];
      dailyViews[dateKey] = 0;
      monthlyDownloads[dateKey] = 0;
    }

    events.forEach(e => {
      const dateKey = e.createdAt.split('T')[0];
      if (dateKey in dailyViews) {
        if (e.eventType === 'view' || e.eventType === 'stream_click') {
          dailyViews[dateKey]++;
        }
        if (e.eventType === 'download') {
          monthlyDownloads[dateKey]++;
        }
      }
    });

    const chartsData = Object.keys(dailyViews).map(key => ({
      date: key,
      views: dailyViews[key],
      downloads: monthlyDownloads[key],
      watchHours: parseFloat((dailyViews[key] * 0.45).toFixed(2))
    }));

    res.json({
      summary: {
        totalFiles,
        totalFolders,
        downloadsToday,
        viewsToday,
        lifetimeViews,
        lifetimeDownloads,
        watchHours
      },
      charts: chartsData,
      events: events.slice(-30).reverse() // Last 30 events
    });
  });

  // 6. SETTINGS ENDPOINTS
  app.get('/api/settings', (req, res) => {
    // Public settings are viewable (e.g. Website name, custom logo)
    const all = db.getSettings();
    const { googleClientSecret, ...safeSettings } = all as any;
    res.json(safeSettings);
  });

  app.put('/api/settings', (req, res) => {
    const currUser = requireSuperAdmin(req, res);
    if (!currUser) return;

    const saved = db.updateSettings(req.body);
    res.json(saved);
  });

  // 7. PUBLIC HEALTH CHECK
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', date: new Date().toISOString() });
  });

  // HELPER SECURITY CHECKS
  function hasFolderAccess(user: any, folder: any): boolean {
    if (user.role === 'Super Admin') return true;
    
    const hasRolesLimit = folder.allowedRoles && folder.allowedRoles.length > 0;
    const hasUsersLimit = folder.allowedUserIds && folder.allowedUserIds.length > 0;

    // Default to public if no limits are configured at all
    if (!hasRolesLimit && !hasUsersLimit) return true;

    if (hasRolesLimit && folder.allowedRoles.includes(user.role)) return true;
    if (hasUsersLimit && folder.allowedUserIds.includes(user.id)) return true;

    return false;
  }

  function requireUser(req: express.Request, res: express.Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer token_')) {
      res.status(401).json({ error: 'Auth token missing or invalid format' });
      return null;
    }

    const userId = authHeader.replace('Bearer token_', '').split('_')[0];
    const user = db.getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return null;
    }
    return user;
  }

  function requireSuperAdmin(req: express.Request, res: express.Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer token_')) {
      res.status(401).json({ error: 'Auth token missing or invalid format' });
      return null;
    }

    const userId = authHeader.replace('Bearer token_', '').split('_')[0];
    const user = db.getUserById(userId);
    if (!user || user.role !== 'Super Admin') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required' });
      return null;
    }
    return user;
  }

  function requireAdminOrSuper(req: express.Request, res: express.Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer token_')) {
      res.status(401).json({ error: 'Auth token missing or invalid format' });
      return null;
    }

    const userId = authHeader.replace('Bearer token_', '').split('_')[0];
    const user = db.getUserById(userId);
    if (!user || (user.role !== 'Admin' && user.role !== 'Super Admin')) {
      res.status(403).json({ error: 'Forbidden: Admin access level required' });
      return null;
    }
    return user;
  }

  function cryptoHash(pass: string): string {
    return crypto.createHash('sha256').update(pass).digest('hex');
  }

  // 8. VITE MIDDLEWARE SETUP & SPA ROUTING
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KinoIndex Server] listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
