/**
 * Laboratory System - Storage Layer
 * مدیریت فایل‌های JSON با پشتیبانی از File System Access API
 * و مکانیزم تشخیص تعارض ساده
 */

const Storage = {
  dirHandle: null,          // DirectoryHandle از File System Access API
  dataPath: null,           // مسیر متنی (برای نمایش)
  useFSAccess: false,       // آیا API در دسترس است؟
  memoryCache: {},          // کش موقت داده‌ها
  schemaVersion: 1,

  /**
   * بررسی پشتیبانی مرورگر
   */
  isFSAccessSupported() {
    return 'showDirectoryPicker' in window;
  },

  /**
   * انتخاب پوشه داده‌ها توسط کاربر
   */
  async selectDataFolder() {
    if (!this.isFSAccessSupported()) {
      throw new Error('مرورگر شما از انتخاب پوشه پشتیبانی نمی‌کند. از Edge یا Chrome جدید استفاده کنید.');
    }

    try {
      this.dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      // درخواست مجوز نوشتن
      const permission = await this.dirHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        throw new Error('مجوز نوشتن در پوشه داده نشد.');
      }

      this.useFSAccess = true;
      this.dataPath = this.dirHandle.name;
      return this.dirHandle;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('انتخاب پوشه لغو شد.');
      }
      throw err;
    }
  },

  /**
   * خواندن یک فایل JSON از پوشه داده‌ها
   */
  async readJSON(filename) {
    // اول از کش
    if (this.memoryCache[filename]) {
      return Utils.deepClone(this.memoryCache[filename]);
    }

    if (!this.useFSAccess || !this.dirHandle) {
      // حالت fallback: از localStorage (فقط برای توسعه یا دمو)
      const raw = localStorage.getItem('labsystem_' + filename);
      if (raw) {
        const data = JSON.parse(raw);
        this.memoryCache[filename] = data;
        return Utils.deepClone(data);
      }
      return null;
    }

    try {
      const fileHandle = await this.dirHandle.getFileHandle(filename, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      // ذخیره نسخه برای تشخیص تعارض
      data.__meta = data.__meta || {};
      data.__meta.lastModified = file.lastModified;
      data.__meta.size = file.size;

      this.memoryCache[filename] = data;
      return Utils.deepClone(data);
    } catch (err) {
      if (err.name === 'NotFoundError') {
        return null;
      }
      console.error('خطا در خواندن فایل:', filename, err);
      throw new Error(`خطا در خواندن فایل ${filename}: ${err.message}`);
    }
  },

  /**
   * نوشتن امن یک فایل JSON (با پشتیبان‌گیری ساده و تشخیص تعارض)
   */
  async writeJSON(filename, data, options = {}) {
    const { createBackup = true, expectedLastModified = null } = options;

    // حذف متا قبل از ذخیره
    const toSave = Utils.deepClone(data);
    delete toSave.__meta;

    // افزودن نسخه schema و timestamp
    toSave._schemaVersion = this.schemaVersion;
    toSave._updatedAt = Utils.nowISO();

    const jsonStr = JSON.stringify(toSave, null, 2);

    if (!this.useFSAccess || !this.dirHandle) {
      // fallback به localStorage
      localStorage.setItem('labsystem_' + filename, jsonStr);
      this.memoryCache[filename] = toSave;
      return true;
    }

    try {
      // بررسی تعارض ساده
      if (expectedLastModified !== null) {
        try {
          const existing = await this.dirHandle.getFileHandle(filename, { create: false });
          const file = await existing.getFile();
          if (file.lastModified !== expectedLastModified) {
            throw new Error('CONFLICT');
          }
        } catch (e) {
          if (e.message === 'CONFLICT') throw e;
          // فایل وجود ندارد، مشکلی نیست
        }
      }

      // پشتیبان‌گیری ساده (کپی به backups/)
      if (createBackup) {
        try {
          let backupDir;
          try {
            backupDir = await this.dirHandle.getDirectoryHandle('backups', { create: true });
          } catch (e) {
            // اگر نتوانست backups بسازد، ادامه بده
          }
          if (backupDir) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${filename.replace('.json', '')}_${ts}.json`;
            const backupHandle = await backupDir.getFileHandle(backupName, { create: true });
            const writable = await backupHandle.createWritable();
            await writable.write(jsonStr);
            await writable.close();
          }
        } catch (backupErr) {
          console.warn('پشتیبان‌گیری ناموفق بود:', backupErr);
        }
      }

      // نوشتن اصلی
      const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();

      // به‌روزرسانی کش
      this.memoryCache[filename] = toSave;
      return true;
    } catch (err) {
      if (err.message === 'CONFLICT') {
        throw new Error('تعارض داده: فایل توسط کاربر دیگری تغییر کرده است. لطفاً صفحه را رفرش کنید و دوباره تلاش کنید.');
      }
      console.error('خطا در نوشتن فایل:', filename, err);
      throw new Error(`خطا در ذخیره فایل ${filename}: ${err.message}`);
    }
  },

  /**
   * بررسی وجود فایل
   */
  async fileExists(filename) {
    if (!this.useFSAccess || !this.dirHandle) {
      return localStorage.getItem('labsystem_' + filename) !== null;
    }
    try {
      await this.dirHandle.getFileHandle(filename, { create: false });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * خواندن وضعیت راه‌اندازی
   */
  async getSystemConfig() {
    return await this.readJSON('system-config.json');
  },

  /**
   * ذخیره وضعیت راه‌اندازی
   */
  async saveSystemConfig(config) {
    return await this.writeJSON('system-config.json', config);
  },

  /**
   * پاک کردن کش
   */
  clearCache() {
    this.memoryCache = {};
  },

  /**
   * لیست فایل‌های موجود در پوشه (تقریبی)
   */
  async listFiles() {
    if (!this.useFSAccess || !this.dirHandle) return [];
    const files = [];
    for await (const entry of this.dirHandle.values()) {
      if (entry.kind === 'file') {
        files.push(entry.name);
      }
    }
    return files;
  }
};

window.Storage = Storage;
