/**
 * Laboratory System - Standards & Clauses
 * با امکان ثبت مسیر فایل و باز کردن استاندارد
 */

const Standards = {
  standards: [],
  clauses: [],

  async load() {
    const stdData = await Storage.readJSON('standards.json');
    const clData = await Storage.readJSON('standard-clauses.json');
    this.standards = stdData?.standards || [];
    this.clauses = clData?.clauses || [];
    return this.standards;
  },

  async saveStandards() {
    await Storage.writeJSON('standards.json', { standards: this.standards });
  },

  async saveClauses() {
    await Storage.writeJSON('standard-clauses.json', { clauses: this.clauses });
  },

  async openStandardFile(std) {
    if (!std.filePath || !std.filePath.trim()) {
      Utils.showToast('مسیر فایل برای این استاندارد ثبت نشده است', 'warning');
      return;
    }
    if (!Storage.useFSAccess || !Storage.dirHandle) {
      Utils.showToast('پوشه داده‌ها انتخاب نشده', 'warning');
      return;
    }
    try {
      const parts = std.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
      let handle = Storage.dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i]);
      }
      const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      Utils.showToast('فایل استاندارد باز شد', 'success');
    } catch (err) {
      Utils.showToast('فایل یافت نشد: ' + std.filePath, 'error');
    }
  },

  async renderList(container) {
    await this.load();

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">استانداردها و بندها</h2>
        <div class="flex gap-1">
          <button class="btn btn-primary btn-sm" id="btn-add-standard">+ استاندارد جدید</button>
          <button class="btn btn-outline btn-sm" id="btn-add-clause">+ بند جدید</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
        <div>
          <h3 class="mb-2">استانداردها</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>نام / شماره</th>
                  <th>ویرایش</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody id="standards-tbody">
                ${this.renderStandardRows()}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 class="mb-2">بندهای استاندارد</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>استاندارد</th>
                  <th>شماره بند</th>
                  <th>عنوان</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="clauses-tbody">
                ${this.renderClauseRows()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-add-standard')?.addEventListener('click', () => this.openStandardForm());
    document.getElementById('btn-add-clause')?.addEventListener('click', () => this.openClauseForm());

    document.getElementById('standards-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'toggle-std') await this.toggleStandard(id);
      if (btn.dataset.action === 'open-std') {
        const std = this.standards.find(s => s.id === id);
        if (std) this.openStandardFile(std);
      }
      if (btn.dataset.action === 'edit-path') {
        const std = this.standards.find(s => s.id === id);
        if (!std) return;
        const newPath = prompt('مسیر فایل استاندارد (نسبت به پوشه داده‌ها):\nمثال: standards/ISO17025-2017.pdf', std.filePath || '');
        if (newPath === null) return;
        std.filePath = newPath.trim();
        await this.saveStandards();
        Utils.showToast('مسیر ذخیره شد', 'success');
        this.renderList(document.getElementById('content'));
      }
    });

    document.getElementById('clauses-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'delete-clause') await this.deleteClause(btn.dataset.id);
    });
  },

  renderStandardRows() {
    if (!this.standards.length) {
      return `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">استانداردی تعریف نشده</td></tr>`;
    }
    return this.standards.map(s => `
      <tr>
        <td>
          <strong>${s.name || s.code}</strong><br>
          <small class="text-muted">${s.code || ''}</small>
          ${s.filePath ? `<br><small style="font-family:monospace;direction:ltr">${s.filePath}</small>` : ''}
        </td>
        <td>${s.revision || '—'}</td>
        <td>
          <span class="status ${s.active !== false ? 'status-current' : 'status-obsolete'}">
            ${s.active !== false ? 'فعال' : 'غیرفعال'}
          </span>
        </td>
        <td style="white-space:nowrap">
          ${s.filePath ? `<button class="btn btn-sm btn-primary" data-action="open-std" data-id="${s.id}">باز کردن</button>` : ''}
          <button class="btn btn-sm btn-outline" data-action="edit-path" data-id="${s.id}">${s.filePath ? 'ویرایش مسیر' : 'ثبت مسیر'}</button>
          <button class="btn btn-sm btn-outline" data-action="toggle-std" data-id="${s.id}">
            ${s.active !== false ? 'غیرفعال' : 'فعال'}
          </button>
        </td>
      </tr>
    `).join('');
  },

  renderClauseRows() {
    if (!this.clauses.length) {
      return `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">بندی تعریف نشده</td></tr>`;
    }
    return this.clauses.map(c => {
      const std = this.standards.find(s => s.id === c.standardId);
      return `
        <tr>
          <td>${std ? (std.code || std.name) : '—'}</td>
          <td>${c.number || '—'}</td>
          <td>${c.title || '—'}</td>
          <td><button class="btn btn-sm btn-outline" data-action="delete-clause" data-id="${c.id}">حذف</button></td>
        </tr>
      `;
    }).join('');
  },

  openStandardForm() {
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'افزودن استاندارد';
    modalBody.innerHTML = `
      <div class="form-group">
        <label>نام استاندارد *</label>
        <input type="text" id="std-name" required placeholder="مثال: ISO/IEC 17025">
      </div>
      <div class="form-group">
        <label>شماره / شناسه</label>
        <input type="text" id="std-code" placeholder="مثال: ISO/IEC 17025:2017">
      </div>
      <div class="form-group">
        <label>ویرایش</label>
        <input type="text" id="std-revision" placeholder="مثال: 2017">
      </div>
      <div class="form-group">
        <label>مسیر فایل (اختیاری)</label>
        <input type="text" id="std-filepath" placeholder="مثال: standards/ISO17025.pdf">
      </div>
      <div class="form-group">
        <label>توضیحات</label>
        <textarea id="std-desc" rows="2"></textarea>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn btn-primary" id="btn-save-std">ذخیره</button>
      <button class="btn btn-outline" id="btn-cancel-std">انصراف</button>
    `;

    Utils.show('modal-overlay');
    document.getElementById('btn-cancel-std').onclick = () => Utils.hide('modal-overlay');
    document.getElementById('modal-close').onclick = () => Utils.hide('modal-overlay');

    document.getElementById('btn-save-std').onclick = async () => {
      const name = document.getElementById('std-name').value.trim();
      if (!name) {
        Utils.showToast('نام استاندارد الزامی است', 'error');
        return;
      }
      this.standards.push({
        id: Utils.generateId('std'),
        name,
        code: document.getElementById('std-code').value.trim(),
        revision: document.getElementById('std-revision').value.trim(),
        filePath: document.getElementById('std-filepath').value.trim(),
        description: document.getElementById('std-desc').value.trim(),
        active: true,
        createdAt: Utils.nowISO()
      });
      await this.saveStandards();
      Utils.hide('modal-overlay');
      Utils.showToast('استاندارد اضافه شد', 'success');
      this.renderList(document.getElementById('content'));
    };
  },

  openClauseForm() {
    if (!this.standards.length) {
      Utils.showToast('ابتدا حداقل یک استاندارد تعریف کنید', 'warning');
      return;
    }
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'افزودن بند استاندارد';
    modalBody.innerHTML = `
      <div class="form-group">
        <label>استاندارد *</label>
        <select id="cl-standard" required>
          ${this.standards.filter(s => s.active !== false).map(s =>
            `<option value="${s.id}">${s.name || s.code}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>شماره بند *</label>
        <input type="text" id="cl-number" required placeholder="مثال: 7.2.1">
      </div>
      <div class="form-group">
        <label>عنوان بند *</label>
        <input type="text" id="cl-title" required>
      </div>
      <div class="form-group">
        <label>توضیح</label>
        <textarea id="cl-desc" rows="2"></textarea>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn btn-primary" id="btn-save-clause">ذخیره</button>
      <button class="btn btn-outline" id="btn-cancel-clause">انصراف</button>
    `;

    Utils.show('modal-overlay');
    document.getElementById('btn-cancel-clause').onclick = () => Utils.hide('modal-overlay');
    document.getElementById('modal-close').onclick = () => Utils.hide('modal-overlay');

    document.getElementById('btn-save-clause').onclick = async () => {
      const number = document.getElementById('cl-number').value.trim();
      const title = document.getElementById('cl-title').value.trim();
      if (!number || !title) {
        Utils.showToast('شماره و عنوان بند الزامی است', 'error');
        return;
      }
      this.clauses.push({
        id: Utils.generateId('cl'),
        standardId: document.getElementById('cl-standard').value,
        number,
        title,
        description: document.getElementById('cl-desc').value.trim(),
        createdAt: Utils.nowISO()
      });
      await this.saveClauses();
      Utils.hide('modal-overlay');
      Utils.showToast('بند اضافه شد', 'success');
      this.renderList(document.getElementById('content'));
    };
  },

  async toggleStandard(id) {
    const std = this.standards.find(s => s.id === id);
    if (!std) return;
    std.active = std.active === false ? true : false;
    await this.saveStandards();
    this.renderList(document.getElementById('content'));
  },

  async deleteClause(id) {
    if (!Utils.confirm('آیا از حذف این بند مطمئن هستید؟')) return;
    this.clauses = this.clauses.filter(c => c.id !== id);
    await this.saveClauses();
    Utils.showToast('بند حذف شد', 'success');
    this.renderList(document.getElementById('content'));
  }
};

window.Standards = Standards;
