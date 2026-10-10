/**
 * Laboratory System - Records Management
 * مدیریت سوابق جدا از مدارک کنترل‌شده
 */

const Records = {
  records: [],

  async load() {
    const data = await Storage.readJSON('records-index.json');
    this.records = data?.records || [];
    return this.records;
  },

  async save() {
    await Storage.writeJSON('records-index.json', { records: this.records });
  },

  async renderList(container) {
    await this.load();

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">سوابق آزمایشگاه</h2>
        <div class="flex gap-1">
          <input type="text" id="records-search" placeholder="جستجو در نام یا مسیر..." style="width:220px">
          <button class="btn btn-outline btn-sm" id="btn-refresh-records">به‌روزرسانی فهرست</button>
          <button class="btn btn-primary btn-sm" id="btn-add-record">+ افزودن سابقه</button>
        </div>
      </div>

      <p class="text-muted mb-2" style="font-size:0.9rem">
        سوابق از مدارک کنترل‌شده جدا هستند. عملیات به‌روزرسانی فقط فهرست سوابق را تغییر می‌دهد.
      </p>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>نام فایل / عنوان</th>
              <th>مسیر</th>
              <th>نوع</th>
              <th>مرتبط با</th>
              <th>وضعیت فایل</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody id="records-tbody">
            ${this.renderRows(this.records)}
          </tbody>
        </table>
      </div>

      <p class="text-muted mt-2" id="records-count">تعداد: ${this.records.length} سابقه</p>
    `;

    document.getElementById('records-search')?.addEventListener('input', (e) => {
      this.filterAndRender(e.target.value);
    });

    document.getElementById('btn-refresh-records')?.addEventListener('click', () => {
      Utils.showToast('فهرست سوابق از حافظه بارگذاری شد. برای اسکن واقعی پوشه، قابلیت در نسخه‌های بعدی تکمیل می‌شود.', 'info');
      this.renderList(container);
    });

    document.getElementById('btn-add-record')?.addEventListener('click', () => this.openAddForm());

    document.getElementById('records-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'delete') this.deleteRecord(id);
    });
  },

  renderRows(list) {
    if (!list.length) {
      return `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">سابقه‌ای ثبت نشده است</td></tr>`;
    }

    return list.map(r => `
      <tr>
        <td><strong>${r.title || r.fileName || '—'}</strong></td>
        <td style="font-size:0.85rem;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${r.path || ''}">${r.path || '—'}</td>
        <td>${r.type || '—'}</td>
        <td>${r.relatedTo || '—'}</td>
        <td>
          <span class="status ${r.fileExists === false ? 'status-obsolete' : 'status-current'}">
            ${r.fileExists === false ? 'فایل مفقود' : 'موجود'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline" data-action="delete" data-id="${r.id}">حذف از فهرست</button>
        </td>
      </tr>
    `).join('');
  },

  filterAndRender(search) {
    let list = this.records;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.fileName || '').toLowerCase().includes(q) ||
        (r.path || '').toLowerCase().includes(q)
      );
    }
    const tbody = document.getElementById('records-tbody');
    if (tbody) tbody.innerHTML = this.renderRows(list);
    const countEl = document.getElementById('records-count');
    if (countEl) countEl.textContent = `تعداد: ${list.length} سابقه`;
  },

  openAddForm() {
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'افزودن سابقه جدید';
    modalBody.innerHTML = `
      <div class="form-group">
        <label>عنوان / نام فایل *</label>
        <input type="text" id="rec-title" required>
      </div>
      <div class="form-group">
        <label>مسیر فایل</label>
        <input type="text" id="rec-path" placeholder="مثال: records/2024/test-report.pdf">
      </div>
      <div class="form-group">
        <label>نوع</label>
        <select id="rec-type">
          <option value="pdf">PDF</option>
          <option value="excel">Excel</option>
          <option value="image">تصویر</option>
          <option value="report">گزارش</option>
          <option value="other">سایر</option>
        </select>
      </div>
      <div class="form-group">
        <label>مرتبط با (اختیاری)</label>
        <input type="text" id="rec-related" placeholder="کد مدرک، آزمون یا فرآیند">
      </div>
      <div class="form-group">
        <label>توضیحات</label>
        <textarea id="rec-notes" rows="2"></textarea>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn btn-primary" id="btn-save-record">ذخیره</button>
      <button class="btn btn-outline" id="btn-cancel-record">انصراف</button>
    `;

    Utils.show('modal-overlay');

    document.getElementById('btn-cancel-record').onclick = () => Utils.hide('modal-overlay');
    document.getElementById('modal-close').onclick = () => Utils.hide('modal-overlay');

    document.getElementById('btn-save-record').onclick = async () => {
      const title = document.getElementById('rec-title').value.trim();
      if (!title) {
        Utils.showToast('عنوان الزامی است', 'error');
        return;
      }

      const record = {
        id: Utils.generateId('rec'),
        title,
        fileName: title,
        path: document.getElementById('rec-path').value.trim(),
        type: document.getElementById('rec-type').value,
        relatedTo: document.getElementById('rec-related').value.trim(),
        notes: document.getElementById('rec-notes').value.trim(),
        fileExists: true,
        createdAt: Utils.nowISO(),
        createdBy: Auth.currentUser?.displayName
      };

      this.records.unshift(record);
      await this.save();
      Utils.hide('modal-overlay');
      Utils.showToast('سابقه اضافه شد', 'success');
      this.renderList(document.getElementById('content'));
    };
  },

  async deleteRecord(id) {
    if (!Utils.confirm('آیا از حذف این سابقه از فهرست مطمئن هستید؟\n(فایل فیزیکی حذف نمی‌شود)')) return;

    this.records = this.records.filter(r => r.id !== id);
    await this.save();
    Utils.showToast('سابقه از فهرست حذف شد', 'success');
    this.renderList(document.getElementById('content'));
  }
};

window.Records = Records;
