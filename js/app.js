/**
 * Laboratory System - Main Application
 */

const App = {
  async init() {
    console.log('Laboratory System starting...');

    // بررسی پشتیبانی اولیه
    if (!window.crypto || !window.crypto.subtle) {
      console.warn('Web Crypto API در دسترس نیست. هش رمز عبور از روش ساده‌تر استفاده می‌کند.');
    }

    try {
      // تلاش برای تشخیص وضعیت راه‌اندازی
      // چون هنوز پوشه انتخاب نشده، ابتدا صفحه بارگذاری را نشان می‌دهیم
      // و سپس تصمیم می‌گیریم

      // برای سادگی نسخه اول: همیشه اول پوشه را چک می‌کنیم
      // اگر File System Access پشتیبانی نشود، پیام مناسب نشان می‌دهیم

      if (!Storage.isFSAccessSupported()) {
        this.showUnsupportedBrowser();
        return;
      }

      // در نسخه فعلی، کاربر باید هر بار پوشه را انتخاب کند
      // (چون DirectoryHandle را نمی‌توان به راحتی persist کرد بدون permission دائمی)
      // بعداً می‌توان با IndexedDB بهبود داد

      Utils.hide('loading-screen');
      this.showFolderSelectionPrompt();
    } catch (err) {
      console.error(err);
      Utils.showToast('خطا در راه‌اندازی برنامه: ' + err.message, 'error');
    }
  },

  showUnsupportedBrowser() {
    const loading = document.getElementById('loading-screen');
    loading.innerHTML = `
      <div class="loading-box">
        <h1>مرورگر پشتیبانی نمی‌شود</h1>
        <p style="max-width:400px;margin:1rem auto;color:var(--text-muted)">
          برای استفاده از این نرم‌افزار به مرورگر Microsoft Edge یا Google Chrome نسخه جدید نیاز دارید
          (پشتیبانی از File System Access API).
        </p>
        <p class="text-muted">Firefox و مرورگرهای قدیمی پشتیبانی کامل ندارند.</p>
      </div>
    `;
  },

  showFolderSelectionPrompt() {
    const loading = document.getElementById('loading-screen');
    loading.classList.remove('hidden');
    loading.innerHTML = `
      <div class="loading-box" style="max-width:480px">
        <h1>سیستم مدیریت آزمایشگاه</h1>
        <p class="text-muted" style="margin:1rem 0 1.5rem">
          برای شروع، پوشه داده‌های مشترک را انتخاب کنید.
          اگر اولین بار است که سیستم را اجرا می‌کنید، مراحل راه‌اندازی آغاز خواهد شد.
        </p>
        <button id="btn-start-select" class="btn btn-primary">انتخاب پوشه داده‌ها</button>
        <p class="text-muted mt-2" style="font-size:0.85rem">
          توجه: در صورت استفاده از Share شبکه، ممکن است محدودیت‌هایی وجود داشته باشد.
        </p>
      </div>
    `;

    document.getElementById('btn-start-select').addEventListener('click', async () => {
      try {
        await Storage.selectDataFolder();
        await this.checkSetupStatus();
      } catch (err) {
        Utils.showToast(err.message, 'error');
      }
    });
  },

  async checkSetupStatus() {
    try {
      const config = await Storage.getSystemConfig();

      if (!config || config.setupStatus !== 'completed') {
        // راه‌اندازی لازم است
        Setup.start();
      } else {
        // سیستم راه‌اندازی شده → صفحه ورود
        this.showLogin();
      }
    } catch (err) {
      console.error(err);
      // اگر فایل config خراب باشد یا خوانده نشود، راه‌اندازی را شروع کن
      Setup.start();
    }
  },

  showLogin() {
    Utils.hide('loading-screen');
    Utils.hide('setup-screen');
    Utils.hide('main-screen');
    Utils.show('login-screen');

    const form = document.getElementById('login-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('login-error');

      Utils.hide(errorEl);

      const result = await Auth.login(username, password);
      if (result.success) {
        this.showMainApp();
      } else {
        errorEl.textContent = result.message;
        Utils.show(errorEl);
      }
    };
  },

  showMainApp() {
    Utils.hide('login-screen');
    Utils.hide('setup-screen');
    Utils.hide('loading-screen');
    Utils.show('main-screen');

    // نمایش اطلاعات کاربر
    document.getElementById('current-user').textContent = 
      `${Auth.currentUser.displayName} (${Auth.currentUser.roleName})`;

    // بارگذاری نام سازمان
    Storage.readJSON('organization.json').then(org => {
      if (org) {
        document.getElementById('org-name').textContent = org.name || '';
      }
    });

    // ساخت منو بر اساس نقش
    this.buildSidebar();

    // نمایش داشبورد پیش‌فرض
    this.navigate('dashboard');

    // دکمه خروج
    document.getElementById('btn-logout').onclick = () => {
      Auth.logout();
      this.showLogin();
    };
  },

  buildSidebar() {
    const sidebar = document.getElementById('sidebar');
    const role = Auth.currentUser.role;

    let items = [
      { id: 'dashboard', label: 'داشبورد', icon: '📊' },
      { id: 'documents', label: 'مدارک', icon: '📄' },
      { id: 'change-requests', label: 'درخواست‌های تغییر', icon: '📝' },
      { id: 'records', label: 'سوابق', icon: '📁' },
      { id: 'standards', label: 'استانداردها', icon: '📘' },
      { id: 'reports', label: 'گزارش‌ها', icon: '📈' }
    ];

    if (role === 'system_admin') {
      items.push(
        { id: 'users', label: 'مدیریت کاربران', icon: '👥' },
        { id: 'settings', label: 'تنظیمات', icon: '⚙️' },
        { id: 'backup', label: 'پشتیبان‌گیری', icon: '💾' }
      );
    }

    if (role === 'quality_manager' || role === 'system_admin') {
      // نشان تعداد درخواست‌های در انتظار بعداً اضافه می‌شود
    }

    sidebar.innerHTML = items.map(item => `
      <a href="#" data-page="${item.id}" class="nav-item">
        <span>${item.icon}</span>
        <span>${item.label}</span>
        <span class="badge hidden" id="badge-${item.id}"></span>
      </a>
    `).join('');

    // رویداد کلیک منو
    sidebar.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const page = a.dataset.page;
        this.navigate(page);

        // فعال کردن آیتم
        sidebar.querySelectorAll('a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
      });
    });

    // فعال کردن داشبورد به صورت پیش‌فرض
    sidebar.querySelector('a[data-page="dashboard"]')?.classList.add('active');
  },

  navigate(page) {
    const content = document.getElementById('content');

    switch (page) {
      case 'dashboard':
        this.renderDashboard(content);
        break;
      case 'documents':
        content.innerHTML = `<h2>مدارک</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'change-requests':
        content.innerHTML = `<h2>درخواست‌های تغییر</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'records':
        content.innerHTML = `<h2>سوابق آزمایشگاه</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'standards':
        content.innerHTML = `<h2>استانداردها و بندها</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'reports':
        content.innerHTML = `<h2>گزارش‌ها</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'users':
        content.innerHTML = `<h2>مدیریت کاربران</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'settings':
        content.innerHTML = `<h2>تنظیمات</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      case 'backup':
        content.innerHTML = `<h2>پشتیبان‌گیری و بازیابی</h2><p class="text-muted">این بخش در حال پیاده‌سازی است...</p>`;
        break;
      default:
        content.innerHTML = `<p>صفحه یافت نشد.</p>`;
    }
  },

  async renderDashboard(container) {
    const role = Auth.currentUser.role;
    let cardsHtml = '';

    // کارت‌های مشترک
    cardsHtml += `
      <div class="card" data-page="documents">
        <div class="card-title">مدارک جاری</div>
        <div class="card-value" id="stat-current-docs">—</div>
      </div>
    `;

    if (role === 'quality_manager' || role === 'system_admin') {
      cardsHtml += `
        <div class="card warning" data-page="change-requests">
          <div class="card-title">درخواست‌های در انتظار بررسی</div>
          <div class="card-value" id="stat-pending-review">—</div>
        </div>
      `;
    }

    if (role === 'system_admin') {
      cardsHtml += `
        <div class="card success" data-page="change-requests">
          <div class="card-title">آماده اقدام مدیر سیستم</div>
          <div class="card-value" id="stat-ready-action">—</div>
        </div>
      `;
    }

    if (role === 'technical_manager') {
      cardsHtml += `
        <div class="card" data-page="change-requests">
          <div class="card-title">درخواست‌های من</div>
          <div class="card-value" id="stat-my-requests">—</div>
        </div>
      `;
    }

    container.innerHTML = `
      <h2>داشبورد</h2>
      <p class="text-muted mb-2">خوش آمدید، ${Auth.currentUser.displayName}</p>
      <div class="cards-grid">
        ${cardsHtml}
      </div>
      <div class="table-container mt-2">
        <p style="padding:1.5rem;text-align:center;color:var(--text-muted)">
          بخش‌های اصلی سیستم به تدریج پیاده‌سازی می‌شوند.<br>
          راه‌اندازی اولیه، ورود و ساختار اصلی آماده است.
        </p>
      </div>
    `;

    // بارگذاری آمار واقعی (در نسخه‌های بعدی کامل‌تر می‌شود)
    try {
      const docs = await Storage.readJSON('documents.json');
      const currentCount = (docs?.documents || []).filter(d => d.status === 'current').length;
      const el = document.getElementById('stat-current-docs');
      if (el) el.textContent = currentCount;

      const requests = await Storage.readJSON('change-requests.json');
      const pending = (requests?.requests || []).filter(r => r.status === 'pending_review').length;
      const pendingEl = document.getElementById('stat-pending-review');
      if (pendingEl) pendingEl.textContent = pending;

      const ready = (requests?.requests || []).filter(r => r.status === 'ready_to_publish' || r.status === 'approved').length;
      const readyEl = document.getElementById('stat-ready-action');
      if (readyEl) readyEl.textContent = ready;
    } catch (e) {
      console.warn('خطا در بارگذاری آمار:', e);
    }
  }
};

// شروع برنامه پس از لود شدن صفحه
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;
