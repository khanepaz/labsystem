/**
 * Laboratory System - Main Application
 */

const App = {
  async init() {
    console.log('Laboratory System starting...');

    if (!window.crypto || !window.crypto.subtle) {
      console.warn('Web Crypto API در دسترس نیست.');
    }

    try {
      if (!Storage.isFSAccessSupported()) {
        this.showUnsupportedBrowser();
        return;
      }

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
          برای استفاده از این نرم‌افزار به مرورگر Microsoft Edge یا Google Chrome نسخه جدید نیاز دارید.
        </p>
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
        </p>
        <button id="btn-start-select" class="btn btn-primary">انتخاب پوشه داده‌ها</button>
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
        Setup.start();
      } else {
        this.showLogin();
      }
    } catch (err) {
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

    document.getElementById('current-user').textContent = 
      `${Auth.currentUser.displayName} (${Auth.currentUser.roleName})`;

    Storage.readJSON('organization.json').then(org => {
      if (org) document.getElementById('org-name').textContent = org.name || '';
    });

    this.buildSidebar();
    this.navigate('dashboard');

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
        { id: 'import', label: 'ورود Excel', icon: '📥' },
        { id: 'settings', label: 'تنظیمات', icon: '⚙️' },
        { id: 'backup', label: 'پشتیبان‌گیری', icon: '💾' }
      );
    }

    sidebar.innerHTML = items.map(item => `
      <a href="#" data-page="${item.id}" class="nav-item">
        <span>${item.icon}</span>
        <span>${item.label}</span>
        <span class="badge hidden" id="badge-${item.id}"></span>
      </a>
    `).join('');

    sidebar.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(a.dataset.page);
        sidebar.querySelectorAll('a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
      });
    });

    sidebar.querySelector('a[data-page="dashboard"]')?.classList.add('active');
    this.updateBadges();
  },

  async updateBadges() {
    try {
      await Workflow.load();
      const pending = Workflow.getPendingReview().length;
      const badge = document.getElementById('badge-change-requests');
      if (badge) {
        if (pending > 0 && (Auth.isQualityManager() || Auth.isSystemAdmin())) {
          badge.textContent = pending;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch (e) {}
  },

  navigate(page) {
    const content = document.getElementById('content');

    switch (page) {
      case 'dashboard':
        this.renderDashboard(content);
        break;
      case 'documents':
        Documents.renderList(content);
        break;
      case 'change-requests':
        Workflow.renderList(content);
        break;
      case 'records':
        Records.renderList(content);
        break;
      case 'standards':
        Standards.renderList(content);
        break;
      case 'users':
        Users.renderList(content);
        break;
      case 'import':
        ExcelImport.openImportUI(content);
        break;
      case 'reports':
        Export.renderReportsPage(content);
        break;
      case 'settings':
        content.innerHTML = `<h2>تنظیمات</h2><p class="text-muted">تنظیمات عمومی در نسخه‌های بعدی تکمیل می‌شود.</p>`;
        break;
      case 'backup':
        content.innerHTML = `
          <h2>پشتیبان‌گیری و بازیابی</h2>
          <p class="text-muted mb-2">
            سیستم به‌طور خودکار هنگام ذخیره تغییرات مهم، نسخه پشتیبان در پوشه <code>backups/</code> ایجاد می‌کند.
          </p>
          <p class="text-muted">
            برای بازیابی دستی، فایل‌های JSON پشتیبان را از پوشه backups کپی و جایگزین فایل اصلی کنید.
          </p>
        `;
        break;
      default:
        content.innerHTML = `<p>صفحه یافت نشد.</p>`;
    }
  },

  async renderDashboard(container) {
    const role = Auth.currentUser.role;
    let cardsHtml = '';

    cardsHtml += `
      <div class="card" onclick="App.navigate('documents')">
        <div class="card-title">مدارک جاری</div>
        <div class="card-value" id="stat-current-docs">—</div>
      </div>
    `;

    if (role === 'quality_manager' || role === 'system_admin') {
      cardsHtml += `
        <div class="card warning" onclick="App.navigate('change-requests')">
          <div class="card-title">درخواست‌های در انتظار بررسی</div>
          <div class="card-value" id="stat-pending-review">—</div>
        </div>
      `;
    }

    if (role === 'system_admin') {
      cardsHtml += `
        <div class="card success" onclick="App.navigate('change-requests')">
          <div class="card-title">آماده اقدام مدیر سیستم</div>
          <div class="card-value" id="stat-ready-action">—</div>
        </div>
      `;
    }

    if (role === 'technical_manager') {
      cardsHtml += `
        <div class="card" onclick="App.navigate('change-requests')">
          <div class="card-title">درخواست‌های من</div>
          <div class="card-value" id="stat-my-requests">—</div>
        </div>
      `;
    }

    container.innerHTML = `
      <h2>داشبورد</h2>
      <p class="text-muted mb-2">خوش آمدید، ${Auth.currentUser.displayName}</p>
      <div class="cards-grid">${cardsHtml}</div>
      <div class="table-container mt-2">
        <p style="padding:1.5rem;text-align:center;color:var(--text-muted)">
          سیستم آماده استفاده است.
        </p>
      </div>
    `;

    try {
      await Documents.load();
      const el = document.getElementById('stat-current-docs');
      if (el) el.textContent = Documents.getCurrentDocuments().length;

      await Workflow.load();
      const pendingEl = document.getElementById('stat-pending-review');
      if (pendingEl) pendingEl.textContent = Workflow.getPendingReview().length;

      const readyEl = document.getElementById('stat-ready-action');
      if (readyEl) readyEl.textContent = Workflow.getReadyForAction().length;

      const myEl = document.getElementById('stat-my-requests');
      if (myEl) myEl.textContent = Workflow.getMyRequests().length;
    } catch (e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
