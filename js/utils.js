/**
 * Laboratory System - Utility Functions
 */

const Utils = {
  /**
   * نمایش پیام موقت (Toast)
   */
  showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * تولید شناسه یکتا ساده
   */
  generateId(prefix = '') {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`;
  },

  /**
   * فرمت تاریخ میلادی به شمسی ساده (بدون کتابخانه خارجی)
   * برای نمایش در UI
   */
  toPersianDate(isoDate) {
    if (!isoDate) return '—';
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;

      // الگوریتم ساده تبدیل (تقریبی برای نمایش)
      // در نسخه کامل می‌توان از کتابخانه محلی استفاده کرد
      const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
      return d.toLocaleDateString('fa-IR', options);
    } catch (e) {
      return isoDate;
    }
  },

  /**
   * تاریخ فعلی به صورت ISO
   */
  nowISO() {
    return new Date().toISOString();
  },

  /**
   * بررسی خالی بودن مقدار
   */
  isEmpty(val) {
    return val === null || val === undefined || String(val).trim() === '';
  },

  /**
   * کپی عمیق ساده
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * نمایش/مخفی کردن المنت
   */
  show(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.classList.remove('hidden');
  },

  hide(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.classList.add('hidden');
  },

  /**
   * پاک کردن محتوای المنت
   */
  clear(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = '';
  },

  /**
   * تأیید ساده
   */
  confirm(message) {
    return window.confirm(message);
  },

  /**
   * وضعیت فارسی
   */
  statusLabel(status) {
    const map = {
      'current': 'جاری',
      'obsolete': 'منسوخ',
      'draft': 'پیش‌نویس',
      'pending_review': 'در انتظار بررسی',
      'pending_approval': 'در انتظار تصویب',
      'approved': 'تأیید شده',
      'rejected': 'رد شده',
      'ready_to_publish': 'آماده انتشار',
      'archived': 'بایگانی‌شده',
      'not_started': 'شروع نشده',
      'in_progress': 'در حال انجام',
      'completed': 'تکمیل شده'
    };
    return map[status] || status;
  },

  /**
   * کلاس CSS وضعیت
   */
  statusClass(status) {
    const map = {
      'current': 'status-current',
      'obsolete': 'status-obsolete',
      'draft': 'status-draft',
      'pending_review': 'status-pending',
      'pending_approval': 'status-pending',
      'approved': 'status-approved',
      'rejected': 'status-rejected',
      'ready_to_publish': 'status-pending'
    };
    return map[status] || '';
  }
};

// برای استفاده سراسری
window.Utils = Utils;
