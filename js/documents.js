/**
 * Laboratory System - Documents Management
 * با فیلتر تگ دسته‌بندی + باز کردن فایل مدرک
 */

const Documents = {
  documents: [],
  versions: [],
  categories: [],
  activeCategory: 'all',
  activeStatus: 'current',

  async load() {
    const docsData = await Storage.readJSON('documents.json');
    const versData = await Storage.readJSON('document-versions.json');
    const catData = await Storage.readJSON('categories.json');

    this.documents = docsData?.documents || [];
    this.versions = versData?.versions || [];
    this.categories = (catData?.categories || []).filter(c => c.active !== false);
    return this.documents;
  },

  async saveDocuments() {
    await Storage.writeJSON('documents.json', { documents: this.documents });
  },

  async saveVersions() {
    await Storage.writeJSON('document-versions.json', { versions: this.versions });
  },

  getById(id) {
    return this.documents.find(d => d.id === id);
  },

  getCurrentDocuments() {
    return this.documents.filter(d => d.status === 'current');
  },

  getVersionsForDocument(docId) {
    return this.versions
      .filter(v => v.documentId === docId)
      .sort((a, b) => (b.revision || 0) - (a.revision || 0));
  },

  /**
   * تلاش برای باز کردن فایل مدرک
   */
  async openDocumentFile(doc) {
    if (!doc.filePath || !doc.filePath.trim()) {
      Utils.showToast('مسیر فایل برای این مدرک ثبت نشده است', 'warning');
      return;
    }

    if (!Storage.useFSAccess || !Storage.dirHandle) {
      Utils.showToast('برای باز کردن فایل باید پوشه داده‌ها انتخاب شده باشد', 'warning');
      return;
    }

    try {
      // مسیر نسبی را به صورت بخش‌بخش جدا کن
      const parts = doc.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
      let handle = Storage.dirHandle;

      // حرکت در پوشه‌ها
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i]);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await handle.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      // ساخت URL موقت و باز کردن
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');

      // بعد از مدتی URL را آزاد کن
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      Utils.showToast('فایل باز شد', 'success');
    } catch (err) {
      console.error(err);
      Utils.showToast('فایل یافت نشد یا مسیر نامعتبر است: ' + doc.filePath, 'error');
    }
  },

  /**
   * رندر لیست مدارک با تگ دسته‌بندی
   */
  async renderList(container) {
    await this.load();
    this.activeCategory = 'all';
    this.activeStatus = 'current';

    const categoryTags = [
      { id: 'all', name: 'همه' },
      ...this.categories.map(c => ({ id: c.id || c.name, name: c.name }))
    ];

    // اگر دسته‌بندی در مدارک هست ولی در لیست categories نیست، اضافه کن
    const usedCategories = [...new Set(this.documents.map(d => d.categoryName || d.category).filter(Boolean))];
    usedCategories.forEach(name => {
      if (!categoryTags.find(t => t.name === name)) {
        categoryTags.push({ id: name, name });
      }
    });

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">مدارک</h2>
        <div class="flex gap-1">
          <input type="text" id="doc-search" placeholder="جستجو در عنوان یا کد..." style="width:200px">
          <select id="doc-filter-status">
            <option value="current">جاری</option>
            <option value="obsolete">منسوخ</option>
            <option value="all">همه وضعیت‌ها</option>
          </select>
        </div>
      </div>

      <!-- تگ‌های دسته‌بندی -->
      <div id="category-tags" class="flex gap-1 mb-2" style="flex-wrap:wrap">
        ${categoryTags.map(t => `
          <button class="btn btn-sm ${t.id === 'all' ? 'btn-primary' : 'btn-outline'} category-tag" data-cat="${t.id}">
            ${t.name}
          </button>
        `).join('')}
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>کد مدرک</th>
              <th>عنوان</th>
              <th>دسته‌بندی</th>
              <th>ویرایش</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody id="docs-tbody">
            ${this.renderRows(this.getFilteredList())}
          </tbody>
        </table>
      </div>

      <p class="text-muted mt-2" id="docs-count">تعداد: ${this.getFilteredList().length} مدرک</p>
    `;

    // رویداد جستجو
    document.getElementById('doc-search')?.addEventListener('input', () => this.applyFilters());
    document.getElementById('doc-filter-status')?.addEventListener('change', (e) => {
      this.activeStatus = e.target.value;
      this.applyFilters();
    });

    // رویداد تگ‌ها
    document.getElementById('category-tags')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-tag');
      if (!btn) return;
      this.activeCategory = btn.dataset.cat;

      // استایل فعال
      document.querySelectorAll('.category-tag').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline');
      });
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-primary');

      this.applyFilters();
    });

    // رویداد دکمه‌های جدول
    document.getElementById('docs-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'view') this.showDetail(id);
      if (action === 'open-file') {
        const doc = this.getById(id);
        if (doc) this.openDocumentFile(doc);
      }
      if (action === 'request-change') this.startChangeRequest(id);
    });
  },

  getFilteredList() {
    let list = this.documents;

    if (this.activeStatus === 'current') list = list.filter(d => d.status === 'current');
    else if (this.activeStatus === 'obsolete') list = list.filter(d => d.status === 'obsolete');

    if (this.activeCategory && this.activeCategory !== 'all') {
      list = list.filter(d => {
        const cat = d.categoryName || d.category || '';
        return cat === this.activeCategory || d.category === this.activeCategory;
      });
    }

    const search = document.getElementById('doc-search')?.value || '';
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q)
      );
    }

    return list;
  },

  applyFilters() {
    const list = this.getFilteredList();
    const tbody = document.getElementById('docs-tbody');
    if (tbody) tbody.innerHTML = this.renderRows(list);
    const countEl = document.getElementById('docs-count');
    if (countEl) countEl.textContent = `تعداد: ${list.length} مدرک`;
  },

  renderRows(docs) {
    if (!docs.length) {
      return `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">مدرکی یافت نشد</td></tr>`;
    }

    return docs.map(d => `
      <tr>
        <td><strong>${d.code || '—'}</strong></td>
        <td>${d.title || '—'}</td>
        <td>${d.categoryName || d.category || '—'}</td>
        <td>${d.revision || '—'}</td>
        <td><span class="status ${Utils.statusClass(d.status)}">${Utils.statusLabel(d.status)}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-outline" data-action="view" data-id="${d.id}">جزئیات</button>
          ${d.filePath ? `<button class="btn btn-sm btn-primary" data-action="open-file" data-id="${d.id}">باز کردن فایل</button>` : ''}
          ${Auth.hasPermission('create_change_request') && d.status === 'current' ?
            `<button class="btn btn-sm btn-outline" data-action="request-change" data-id="${d.id}">درخواست اصلاح</button>` : ''}
        </td>
      </tr>
    `).join('');
  },

  async showDetail(docId) {
    await this.load();
    const doc = this.getById(docId);
    if (!doc) {
      Utils.showToast('مدرک یافت نشد', 'error');
      return;
    }

    const versions = this.getVersionsForDocument(docId);

    if (doc.status === 'obsolete') {
      const confirmed = Utils.confirm(
        `⚠ هشدار: این مدرک منسوخ شده است.\n\n` +
        `عنوان: ${doc.title}\nکد: ${doc.code}\nویرایش: ${doc.revision}\n` +
        `تاریخ منسوخ شدن: ${Utils.toPersianDate(doc.obsoleteDate)}\n` +
        (doc.obsoleteReason ? `علت: ${doc.obsoleteReason}\n` : '') +
        `\nآیا می‌خواهید ادامه دهید؟`
      );
      if (!confirmed) return;
    }

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="flex gap-2 mb-2" style="align-items:center">
        <button class="btn btn-outline btn-sm" id="btn-back-docs">← بازگشت به فهرست</button>
        <h2 style="margin:0">جزئیات مدرک</h2>
      </div>

      <div class="table-container" style="padding:1.25rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <div><strong>عنوان:</strong> ${doc.title || '—'}</div>
          <div><strong>کد مدرک:</strong> ${doc.code || '—'}</div>
          <div><strong>نوع:</strong> ${doc.type || '—'}</div>
          <div><strong>دسته‌بندی:</strong> ${doc.categoryName || doc.category || '—'}</div>
          <div><strong>شماره ویرایش:</strong> ${doc.revision || '—'}</div>
          <div><strong>وضعیت:</strong> <span class="status ${Utils.statusClass(doc.status)}">${Utils.statusLabel(doc.status)}</span></div>
          <div><strong>تاریخ ایجاد:</strong> ${Utils.toPersianDate(doc.createdDate)}</div>
          <div><strong>تاریخ تصویب:</strong> ${Utils.toPersianDate(doc.approvalDate)}</div>
          <div><strong>تاریخ اجرا:</strong> ${Utils.toPersianDate(doc.effectiveDate)}</div>
          <div><strong>مسئول تهیه:</strong> ${doc.preparedBy || '—'}</div>
          <div><strong>مسئول بازنگری:</strong> ${doc.reviewedBy || '—'}</div>
          <div><strong>مسئول تصویب:</strong> ${doc.approvedBy || '—'}</div>
          <div style="grid-column:1/-1">
            <strong>مسیر فایل:</strong> 
            <span style="font-family:monospace;direction:ltr;display:inline-block">${doc.filePath || '—'}</span>
            ${doc.filePath ? `
              <button class="btn btn-sm btn-primary" id="btn-open-file" style="margin-right:0.75rem">باز کردن فایل</button>
              <button class="btn btn-sm btn-outline" id="btn-edit-path">ویرایش مسیر</button>
            ` : `
              <button class="btn btn-sm btn-outline" id="btn-edit-path" style="margin-right:0.75rem">ثبت مسیر فایل</button>
            `}
          </div>
          <div style="grid-column:1/-1"><strong>توضیحات:</strong> ${doc.description || '—'}</div>
        </div>

        <div class="mt-2 flex gap-1">
          ${Auth.hasPermission('create_change_request') && doc.status === 'current' ? `
            <button class="btn btn-primary" id="btn-request-change">ثبت درخواست اصلاح</button>
          ` : ''}
        </div>
      </div>

      <h3 class="mt-2 mb-2">تاریخچه نسخه‌ها</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ویرایش</th>
              <th>وضعیت</th>
              <th>تاریخ اجرا</th>
              <th>علت تغییر</th>
              <th>درخواست مرتبط</th>
            </tr>
          </thead>
          <tbody>
            ${versions.length ? versions.map(v => `
              <tr>
                <td>${v.revision}</td>
                <td><span class="status ${Utils.statusClass(v.status)}">${Utils.statusLabel(v.status)}</span></td>
                <td>${Utils.toPersianDate(v.effectiveDate)}</td>
                <td>${v.changeReason || '—'}</td>
                <td>${v.changeRequestId || '—'}</td>
              </tr>
            `).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">نسخه‌ای ثبت نشده</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-back-docs')?.addEventListener('click', () => App.navigate('documents'));
    document.getElementById('btn-request-change')?.addEventListener('click', () => this.startChangeRequest(docId));
    document.getElementById('btn-open-file')?.addEventListener('click', () => this.openDocumentFile(doc));

    document.getElementById('btn-edit-path')?.addEventListener('click', async () => {
      const newPath = prompt('مسیر نسبی فایل را وارد کنید (نسبت به پوشه داده‌ها):\nمثال: docs/SOP-001.pdf', doc.filePath || '');
      if (newPath === null) return;

      doc.filePath = newPath.trim();
      await this.saveDocuments();
      Utils.showToast('مسیر فایل ذخیره شد', 'success');
      this.showDetail(docId);
    });
  },

  startChangeRequest(docId) {
    if (window.Workflow) {
      Workflow.openCreateRequest(docId);
    } else {
      Utils.showToast('ماژول گردش کار بارگذاری نشده', 'error');
    }
  }
};

window.Documents = Documents;
