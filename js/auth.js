/**
 * Laboratory System - Authentication & Authorization
 */

const Auth = {
  currentUser: null,
  users: [],
  roles: {
    system_admin: {
      id: 'system_admin',
      name: 'مدیر سیستم',
      permissions: ['*']
    },
    quality_manager: {
      id: 'quality_manager',
      name: 'مدیر کیفیت',
      permissions: [
        'view_documents', 'view_change_requests',
        'approve_change_request', 'reject_change_request',
        'view_workflow_history', 'view_records'
      ]
    },
    technical_manager: {
      id: 'technical_manager',
      name: 'مدیر فنی',
      permissions: [
        'view_documents', 'create_change_request',
        'view_own_requests', 'view_records'
      ]
    },
    viewer: {
      id: 'viewer',
      name: 'مشاهده‌کننده',
      permissions: ['view_documents', 'view_records']
    }
  },

  /**
   * بارگذاری کاربران از storage
   */
  async loadUsers() {
    const data = await Storage.readJSON('users.json');
    this.users = data?.users || [];
    return this.users;
  },

  /**
   * هش ساده رمز عبور (برای نسخه اولیه - در محیط واقعی از روش قوی‌تر استفاده شود)
   * توجه: این هش فقط برای جلوگیری از ذخیره متن ساده است و امنیت واقعی ایجاد نمی‌کند.
   */
  async hashPassword(password) {
    // استفاده از Web Crypto API اگر موجود باشد
    if (window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password + 'labsystem_salt_v1');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // fallback خیلی ساده (فقط برای محیط‌های قدیمی)
    let hash = 0;
    const str = password + 'labsystem_salt_v1';
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'simple_' + Math.abs(hash).toString(16);
  },

  /**
   * ورود کاربر
   */
  async login(username, password) {
    await this.loadUsers();

    const user = this.users.find(u => 
      u.username.toLowerCase() === username.toLowerCase() && u.active !== false
    );

    if (!user) {
      return { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' };
    }

    const hashed = await this.hashPassword(password);
    if (user.passwordHash !== hashed) {
      return { success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' };
    }

    // ذخیره کاربر فعلی (فقط در حافظه - نه در localStorage برای امنیت بیشتر)
    this.currentUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      roleName: this.roles[user.role]?.name || user.role
    };

    return { success: true, user: this.currentUser };
  },

  /**
   * خروج
   */
  logout() {
    this.currentUser = null;
  },

  /**
   * بررسی لاگین بودن
   */
  isLoggedIn() {
    return !!this.currentUser;
  },

  /**
   * بررسی مجوز
   */
  hasPermission(permission) {
    if (!this.currentUser) return false;
    const role = this.roles[this.currentUser.role];
    if (!role) return false;
    if (role.permissions.includes('*')) return true;
    return role.permissions.includes(permission);
  },

  /**
   * آیا کاربر مدیر سیستم است؟
   */
  isSystemAdmin() {
    return this.currentUser?.role === 'system_admin';
  },

  /**
   * آیا کاربر مدیر کیفیت است؟
   */
  isQualityManager() {
    return this.currentUser?.role === 'quality_manager';
  },

  /**
   * ایجاد کاربر جدید (فقط توسط مدیر سیستم)
   */
  async createUser(userData) {
    if (!this.isSystemAdmin()) {
      throw new Error('فقط مدیر سیستم می‌تواند کاربر جدید ایجاد کند.');
    }

    await this.loadUsers();

    if (this.users.some(u => u.username.toLowerCase() === userData.username.toLowerCase())) {
      throw new Error('این نام کاربری قبلاً ثبت شده است.');
    }

    const hashed = await this.hashPassword(userData.password);

    const newUser = {
      id: Utils.generateId('user'),
      username: userData.username.trim(),
      displayName: userData.displayName.trim(),
      passwordHash: hashed,
      role: userData.role,
      active: true,
      createdAt: Utils.nowISO(),
      createdBy: this.currentUser.id
    };

    this.users.push(newUser);
    await Storage.writeJSON('users.json', { users: this.users });
    return newUser;
  },

  /**
   * ایجاد مدیر اصلی در راه‌اندازی اولیه
   */
  async createInitialAdmin(adminData) {
    const hashed = await this.hashPassword(adminData.password);

    const admin = {
      id: Utils.generateId('user'),
      username: adminData.username.trim(),
      displayName: adminData.displayName.trim(),
      passwordHash: hashed,
      role: 'system_admin',
      active: true,
      createdAt: Utils.nowISO(),
      isInitialAdmin: true
    };

    const usersData = { users: [admin] };
    await Storage.writeJSON('users.json', usersData);
    this.users = [admin];
    return admin;
  }
};

window.Auth = Auth;
