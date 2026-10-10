/**
 * Laboratory System - Main Application
 */

const App = {
  async init() {
    try {
      if (!Storage.isFSAccessSupported()) {
        this.showUnsupportedBrowser();
        return;
      }
      Utils.hide('loading-screen');
      this.showFolderSelectionPrompt();
    } catch (err) {
      Utils.showToast('خطا: ' + err.message, 'error');
    }
  },

  showUnsupportedBrowser() {
    document.getElementById('loading-screen').innerHTML = `
      <div class="loading-box">
        <h1>مرورگر پشتیبانی نمی‌شود</h1>
        <p class="text-muted">از Edge یا Chrome جدید استفاده کنید.</p>
      </div>`;
  },

  showFolderSelectionPrompt() {
    const el = document.getElementById('loading-screen');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="loading-box" style="max-width:460px">
        <h1>سیستم مدیریت آزمایشگاه</h1>
        <p class="text-muted" style="margin:1rem 0 1.25rem">پوشه داده‌های مشترک را انتخاب کنید.</p>
        <button id="btn-start-select" class="btn btn-primary">انتخاب پوشه داده‌ها</button>
      </div>`;
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
      if (!config || config.setupStatus !== 'completed') Setup.start();
      else this.showLogin();
    } catch (e) { Setup.start(); }
  },

  showLogin() {
    Utils.hide('loading-screen');
    Utils.hide('setup-screen');
    Utils.hide('main-screen');
    Utils.show('login-screen');
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('login-error');
      Utils.hide(errorEl);
      const result = await Auth.login(username, password);
      if (result.success) this.showMainApp();
      else { errorEl.textContent = result.message; Utils.show(errorEl); }
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
    document.getElementById('btn-logout').onclick = () => { Auth.logout(); this.showLogin(); };
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
        { id: 'backup', label: 'پشتیبان‌گیری', icon: '💾' }
      );
    }
    sidebar.innerHTML = items.map(item => `
      <a href="#" data-page="${item.id}">
        <span>${item.icon}</span><span>${item.label}</span>
        <span class="badge hidden" id="badge-${item.id}"></span>
      </a>`).join('');
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
        } else badge.classList.add('hidden');
      }
    } catch (e) {}
  },

  navigate(page) {
    const content = document.getElementById('content');
    switch (page) {
      case 'dashboard': this.renderDashboard(content); break;
      case 'documents': Documents.renderList(content); break;
      case 'change-requests': Workflow.renderList(content); break;
      case 'records': Records.renderList(content); break;
      case 'standards': Standards.renderList(content); break;
      case 'users': Users.renderList(content); break;
      case 'import': ExcelImport.openImportUI(content); break;
      case 'reports': Export.renderReportsPage(content); break;
      case 'backup':
        content.innerHTML = `
          <h2>پشتیبان‌گیری</h2>
          <div class="table-container" style="padding:1.25rem;margin-top:0.75rem">
            <p class="text-muted">پشتیبان خودکار در پوشه <code>backups/</code> ذخیره می‌شود.</p>
          </div>`;
        break;
      default: content.innerHTML = '<p>صفحه یافت نشد.</p>';
    }
  },

  async renderDashboard(container) {
    const role = Auth.currentUser.role;

    container.innerHTML = `
      <div class="dash-welcome">
        <h2>سلام، ${Auth.currentUser.displayName}</h2>
        <p>نقش: ${Auth.currentUser.roleName}</p>
      </div>

      <h3 class="mb-1">آمار کلی</h3>
      <div class="cards-grid" id="dash-main-stats">
        <div class="card" onclick="App.navigate('documents')">
          <div class="card-title">کل مدارک</div>
          <div class="card-value" id="stat-total">—</div>
        </div>
        <div class="card success" onclick="App.navigate('documents')">
          <div class="card-title">جاری</div>
          <div class="card-value" id="stat-current">—</div>
        </div>
        <div class="card danger" onclick="App.navigate('documents')">
          <div class="card-title">منسوخ</div>
          <div class="card-value" id="stat-obsolete">—</div>
        </div>
        <div class="card info" onclick="App.navigate('users')">
          <div class="card-title">پرسنل / کاربران</div>
          <div class="card-value" id="stat-users">—</div>
        </div>
        ${role === 'quality_manager' || role === 'system_admin' ? `
        <div class="card warning" onclick="App.navigate('change-requests')">
          <div class="card-title">در انتظار کیفیت</div>
          <div class="card-value" id="stat-pending">—</div>
        </div>` : ''}
        ${role === 'system_admin' ? `
        <div class="card" onclick="App.navigate('change-requests')">
          <div class="card-title">آماده اقدام</div>
          <div class="card-value" id="stat-ready">—</div>
        </div>` : ''}
      </div>

      <h3 class="mb-1 mt-2">مدارک بر اساس نوع</h3>
      <div class="cards-grid">
        <div class="card" onclick="App.navigate('documents')">
          <div class="card-title">روش اجرایی</div>
          <div class="card-value" id="stat-sop">—</div>
        </div>
        <div class="card" onclick="App.navigate('documents')">
          <div class="card-title">دستورالعمل</div>
          <div class="card-value" id="stat-wi">—</div>
        </div>
        <div class="card" onclick="App.navigate('documents')">
          <div class="card-title">فرم‌ها</div>
          <div class="card-value" id="stat-form">—</div>
        </div>
        <div class="card" onclick="App.navigate('documents')">
          <div class="card-title">مدارک پشتیبان</div>
          <div class="card-value" id="stat-support">—</div>
        </div>
      </div>

      <div class="table-container" style="padding:1.1rem;margin-top:0.5rem">
        <h3 class="mb-1">دسترسی سریع</h3>
        <div class="flex gap-1" style="flex-wrap:wrap;margin-top:0.5rem">
          <button class="btn btn-outline btn-sm" onclick="App.navigate('documents')">مدارک</button>
          <button class="btn btn-outline btn-sm" onclick="App.navigate('change-requests')">درخواست‌ها</button>
          <button class="btn btn-outline btn-sm" onclick="App.navigate('records')">سوابق</button>
          <button class="btn btn-outline btn-sm" onclick="App.navigate('reports')">گزارش‌ها</button>
          ${role === 'system_admin' ? `<button class="btn btn-outline btn-sm" onclick="App.navigate('import')">ورود Excel</button>` : ''}
        </div>
      </div>
    `;

    try {
      await Documents.load();
      const all = Documents.documents.length;
      const current = Documents.getCurrentDocuments().length;
      const obsolete = Documents.documents.filter(d => d.status === 'obsolete').length;

      document.getElementById('stat-total').textContent = all;
      document.getElementById('stat-current').textContent = current;
      document.getElementById('stat-obsolete').textContent = obsolete;

      document.getElementById('stat-sop').textContent = Documents.countByCategory('روش اجرایی');
      document.getElementById('stat-wi').textContent = Documents.countByCategory('دستورالعمل');
      document.getElementById('stat-form').textContent = Documents.countByCategory('فرم');
      document.getElementById('stat-support').textContent = Documents.countByCategory('مدرک پشتیبان');

      await Auth.loadUsers();
      const usersEl = document.getElementById('stat-users');
      if (usersEl) usersEl.textContent = Auth.users.filter(u => u.active !== false).length;

      await Workflow.load();
      const pEl = document.getElementById('stat-pending');
      if (pEl) pEl.textContent = Workflow.getPendingReview().length;
      const rEl = document.getElementById('stat-ready');
      if (rEl) rEl.textContent = Workflow.getReadyForAction().length;
    } catch (e) {
      console.warn(e);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
