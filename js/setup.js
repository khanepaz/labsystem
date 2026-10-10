/**
 * Laboratory System - Initial Setup Wizard
 * راه‌اندازی فقط یک بار برای مجموعه داده مشترک
 */

const Setup = {
  currentStep: 0,
  steps: [
    { id: 'folder', title: 'انتخاب پوشه داده‌ها' },
    { id: 'organization', title: 'مشخصات سازمان' },
    { id: 'admin', title: 'ایجاد مدیر اصلی' },
    { id: 'finish', title: 'تکمیل راه‌اندازی' }
  ],
  tempData: {},

  async start() {
    Utils.hide('loading-screen');
    Utils.show('setup-screen');
    this.renderStep();
  },

  renderStep() {
    const container = document.getElementById('setup-steps');
    const step = this.steps[this.currentStep];

    let html = `
      <div class="setup-progress mb-2">
        مرحله ${this.currentStep + 1} از ${this.steps.length}: <strong>${step.title}</strong>
      </div>
    `;

    if (step.id === 'folder') {
      html += `
        <p class="text-muted mb-2">
          پوشه‌ای را انتخاب کنید که تمام فایل‌های JSON، مدارک و سوابق در آن نگهداری شوند.
          این پوشه می‌تواند روی Share شبکه باشد (با محدودیت‌های مرورگر).
        </p>
        <button id="btn-select-folder" class="btn btn-primary">انتخاب پوشه داده‌ها</button>
        <p id="folder-status" class="mt-2 text-muted"></p>
      `;
    }

    if (step.id === 'organization') {
      html += `
        <div class="form-group">
          <label>نام سازمان / آزمایشگاه *</label>
          <input type="text" id="org-name" required placeholder="مثال: آزمایشگاه کنترل کیفیت شرکت ...">
        </div>
        <div class="form-group">
          <label>کد آزمایشگاه (اختیاری)</label>
          <input type="text" id="org-code" placeholder="مثال: LAB-001">
        </div>
        <div class="form-group">
          <label>آدرس (اختیاری)</label>
          <input type="text" id="org-address">
        </div>
        <button id="btn-next-org" class="btn btn-primary">ادامه</button>
      `;
    }

    if (step.id === 'admin') {
      html += `
        <p class="text-muted mb-2">حساب مدیر اصلی سیستم را ایجاد کنید. این حساب نقش «مدیر سیستم» خواهد داشت.</p>
        <div class="form-group">
          <label>نام نمایشی *</label>
          <input type="text" id="admin-display" required placeholder="مثال: علی رضایی">
        </div>
        <div class="form-group">
          <label>نام کاربری *</label>
          <input type="text" id="admin-username" required placeholder="مثال: admin">
        </div>
        <div class="form-group">
          <label>رمز عبور *</label>
          <input type="password" id="admin-password" required minlength="6">
        </div>
        <div class="form-group">
          <label>تکرار رمز عبور *</label>
          <input type="password" id="admin-password2" required>
        </div>
        <button id="btn-create-admin" class="btn btn-primary">ایجاد مدیر و ادامه</button>
      `;
    }

    if (step.id === 'finish') {
      html += `
        <div style="text-align:center; padding: 1.5rem 0;">
          <div style="font-size: 3rem; color: var(--success);">✓</div>
          <h2 style="color: var(--success); margin: 1rem 0;">راه‌اندازی با موفقیت انجام شد</h2>
          <p class="text-muted">سیستم آماده استفاده است. اکنون می‌توانید وارد شوید.</p>
          <button id="btn-go-login" class="btn btn-primary mt-2">ورود به سیستم</button>
        </div>
      `;
    }

    container.innerHTML = html;
    this.bindEvents();
  },

  bindEvents() {
    const step = this.steps[this.currentStep];

    if (step.id === 'folder') {
      document.getElementById('btn-select-folder')?.addEventListener('click', async () => {
        try {
          await Storage.selectDataFolder();
          document.getElementById('folder-status').textContent = `پوشه انتخاب شد: ${Storage.dataPath}`;
          document.getElementById('folder-status').style.color = 'var(--success)';

          // بررسی اینکه قبلاً راه‌اندازی نشده باشد
          const config = await Storage.getSystemConfig();
          if (config && config.setupStatus === 'completed') {
            Utils.showToast('این پوشه قبلاً راه‌اندازی شده است. در حال انتقال به صفحه ورود...', 'warning');
            setTimeout(() => App.showLogin(), 1500);
            return;
          }

          // ایجاد فایل‌های اولیه خالی
          await this.createInitialFiles();
          this.currentStep++;
          this.renderStep();
        } catch (err) {
          Utils.showToast(err.message, 'error');
        }
      });
    }

    if (step.id === 'organization') {
      document.getElementById('btn-next-org')?.addEventListener('click', async () => {
        const name = document.getElementById('org-name').value.trim();
        if (!name) {
          Utils.showToast('نام سازمان الزامی است.', 'error');
          return;
        }
        this.tempData.organization = {
          name,
          code: document.getElementById('org-code').value.trim(),
          address: document.getElementById('org-address').value.trim(),
          createdAt: Utils.nowISO()
        };
        await Storage.writeJSON('organization.json', this.tempData.organization);
        this.currentStep++;
        this.renderStep();
      });
    }

    if (step.id === 'admin') {
      document.getElementById('btn-create-admin')?.addEventListener('click', async () => {
        const displayName = document.getElementById('admin-display').value.trim();
        const username = document.getElementById('admin-username').value.trim();
        const password = document.getElementById('admin-password').value;
        const password2 = document.getElementById('admin-password2').value;

        if (!displayName || !username || !password) {
          Utils.showToast('تمام فیلدهای ستاره‌دار الزامی هستند.', 'error');
          return;
        }
        if (password.length < 6) {
          Utils.showToast('رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');
          return;
        }
        if (password !== password2) {
          Utils.showToast('رمز عبور و تکرار آن یکسان نیستند.', 'error');
          return;
        }

        try {
          await Auth.createInitialAdmin({ displayName, username, password });

          // تکمیل وضعیت راه‌اندازی
          await Storage.saveSystemConfig({
            setupStatus: 'completed',
            setupCompletedAt: Utils.nowISO(),
            schemaVersion: Storage.schemaVersion,
            dataFolderName: Storage.dataPath
          });

          this.currentStep++;
          this.renderStep();
        } catch (err) {
          Utils.showToast(err.message, 'error');
        }
      });
    }

    if (step.id === 'finish') {
      document.getElementById('btn-go-login')?.addEventListener('click', () => {
        App.showLogin();
      });
    }
  },

  async createInitialFiles() {
    // ایجاد فایل‌های پایه خالی
    const files = {
      'documents.json': { documents: [] },
      'document-versions.json': { versions: [] },
      'standards.json': { standards: [] },
      'standard-clauses.json': { clauses: [] },
      'change-requests.json': { requests: [] },
      'workflow-history.json': { events: [] },
      'categories.json': {
        categories: [
          { id: 'cat_1', name: 'ساختاری و سازمانی', active: true },
          { id: 'cat_2', name: 'منابع', active: true },
          { id: 'cat_3', name: 'فرایندهای فنی', active: true },
          { id: 'cat_4', name: 'فراهم‌کنندگان', active: true },
          { id: 'cat_5', name: 'گزارش‌دهی', active: true },
          { id: 'cat_6', name: 'سیستم مدیریت', active: true }
        ]
      },
      'records-index.json': { records: [] },
      'system-config.json': {
        setupStatus: 'in_progress',
        schemaVersion: Storage.schemaVersion
      }
    };

    for (const [filename, data] of Object.entries(files)) {
      const exists = await Storage.fileExists(filename);
      if (!exists) {
        await Storage.writeJSON(filename, data, { createBackup: false });
      }
    }
  }
};

window.Setup = Setup;
