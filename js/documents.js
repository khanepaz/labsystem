/**
 * Laboratory System - Documents Management
 */

const Documents = {
  documents: [],
  versions: [],
  categories: [],
  activeCategory: 'all',
  activeStatus: 'current',

  FIXED_CATEGORIES: [
    { id: 'روش اجرایی', name: 'روش اجرایی' },
    { id: 'دستورالعمل', name: 'دستورالعمل' },
    { id: 'فرم', name: 'فرم‌ها' },
    { id: 'مدرک پشتیبان', name: 'مدارک پشتیبان' }
  ],

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

  detectCategory(doc) {
    const text = ((doc.categoryName || '') + ' ' + (doc.category || '') + ' ' + (doc.type || '') + ' ' + (doc.title || '')).toLowerCase();
    if (text.includes('روش اجرایی') || text.includes('procedure') || text.includes('sop')) return 'روش اجرایی';
    if (text.includes('دستورالعمل') || text.includes('instruction') || text.includes('wi')) return 'دستورالعمل';
    if (text.includes('فرم') || text.includes('form')) return 'فرم';
    if (text.includes('پشتیبان') || text.includes('support') || text.includes('reference')) return 'مدرک پشتیبان';
    return doc.categoryName || doc.category || doc.type || '';
  },

  countByCategory(catId) {
    return this.documents.filter(d => d.status === 'current' && this.detectCategory(d) === catId).length;
  },

  /** نمایش تاریخ — اگر خالی باشد خط تیره */
  fmtDate(val) {
    if (!val) return '—';
    // اگر از قبل شمسی یا رشته تاریخ باشد
    if (typeof val === 'string' && (val.includes('/') || val.includes('-'))) {
      // اگر ISO است به شمسی تبدیل کن
      if (val.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(val)) {
        return Utils.toPersianDate(val);
      }
      return val; // احتمالاً از قبل متن تاریخ است
    }
    return Utils.toPersianDate(val);
  },

  async pickAndSetFilePath(doc) {
    if (!Storage.useFSAccess || !Storage.dirHandle) {
      Utils.showToast('ابتدا پوشه داده‌ها را انتخاب کنید', 'warning');
      return null;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'مدارک',
          accept: {
            'application/pdf': ['.pdf'],
            'application/msword': ['.doc', '.docx'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/vnd.ms-excel': ['.xls', '.xlsx'],
            'image/*': ['.png', '.jpg', '.jpeg']
          }
        }]
      });

      const fileName = fileHandle.name;
      let docsDir;
      try {
        docsDir = await Storage.dirHandle.getDirectoryHandle('docs', { create: true });
      } catch (e) {
        Utils.showToast('خطا در ایجاد پوشه docs', 'error');
        return null;
      }

      const file = await fileHandle.getFile();
      const newHandle = await docsDir.getFileHandle(fileName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();

      doc.filePath = 'docs/' + fileName;
      await this.saveDocuments();
      Utils.showToast('فایل ذخیره شد: docs/' + fileName, 'success');
      return doc.filePath;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      Utils.showToast('خطا: ' + err.message, 'error');
      return null;
    }
  },

  async openDocumentFile(doc) {
    if (!doc.filePath || !doc.filePath.trim()) {
      Utils.showToast('مسیر فایل ثبت نشده. ابتدا فایل را انتخاب کنید.', 'warning');
      return;
    }
    if (!Storage.useFSAccess || !Storage.dirHandle) {
      Utils.showToast('پوشه داده‌ها انتخاب نشده', 'warning');
      return;
    }
    try {
      const parts = doc.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
      let handle = Storage.dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i], { create: false });
      }
      const fileHandle = await handle.getFileHandle(parts[parts.length - 1], { create: false });
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      Utils.showToast('فایل باز شد', 'success');
    } catch (err) {
      Utils.showToast('فایل یافت نشد. مسیر: ' + doc.filePath, 'error');
    }
  },

  async renderList(container) {
    await this.load();
    this.activeCategory = 'all';
    this.activeStatus = 'current';

    const categoryTags = [{ id: 'all', name: 'همه' }, ...this.FIXED_CATEGORIES];

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">مدارک</h2>
        <div class="flex gap-1">
          <input type="text" id="doc-search" placeholder="جستجو..." style="width:200px">
          <select id="doc-filter-status">
            <option value="current">جاری</option>
            <option value="obsolete">منسوخ</option>
            <option value="all">همه</option>
          </select>
        </div>
      </div>

      <div id="category-tags" class="flex gap-1 mb-2" style="flex-wrap:wrap">
        ${categoryTags.map(t => `
          <button class="btn btn-sm ${t.id === 'all' ? 'btn-primary' : 'btn-outline'} category-tag" data-cat="${t.id}">${t.name}</button>
        `).join('')}
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>کد</th>
              <th>عنوان</th>
              <th>دسته</th>
              <th>ویرایش</th>
              <th>وضعیت</th>
              <th>باز کردن فایل</th>
              <th>درخواست اصلاح</th>
              <th>جزئیات</th>
            </tr>
          </thead>
          <tbody id="docs-tbody">${this.renderRows(this.getFilteredList())}</tbody>
        </table>
      </div>
      <p class="text-muted mt-2" id="docs-count">تعداد: ${this.getFilteredList().length}</p>
    `;

    document.getElementById('doc-search')?.addEventListener('input', () => this.applyFilters());
    document.getElementById('doc-filter-status')?.addEventListener('change', (e) => {
      this.activeStatus = e.target.value;
      this.applyFilters();
    });
    document.getElementById('category-tags')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-tag');
      if (!btn) return;
      this.activeCategory = btn.dataset.cat;
      document.querySelectorAll('.category-tag').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-outline'); });
      btn.classList.remove('btn-outline'); btn.classList.add('btn-primary');
      this.applyFilters();
    });
    document.getElementById('docs-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'view') this.showDetail(id);
      if (btn.dataset.action === 'open-file') { const d = this.getById(id); if (d) this.openDocumentFile(d); }
      if (btn.dataset.action === 'request-change') this.startChangeRequest(id);
    });
  },

  getFilteredList() {
    let list = this.documents;
    if (this.activeStatus === 'current') list = list.filter(d => d.status === 'current');
    else if (this.activeStatus === 'obsolete') list = list.filter(d => d.status === 'obsolete');
    if (this.activeCategory && this.activeCategory !== 'all') {
      list = list.filter(d => this.detectCategory(d) === this.activeCategory);
    }
    const search = document.getElementById('doc-search')?.value || '';
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => (d.title || '').toLowerCase().includes(q) || (d.code || '').toLowerCase().includes(q));
    }
    return list;
  },

  applyFilters() {
    const list = this.getFilteredList();
    const tbody = document.getElementById('docs-tbody');
    if (tbody) tbody.innerHTML = this.renderRows(list);
    const countEl = document.getElementById('docs-count');
    if (countEl) countEl.textContent = 'تعداد: ' + list.length;
  },

  renderRows(docs) {
    if (!docs.length) return '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted)">مدرکی یافت نشد</td></tr>';
    return docs.map(d => {
      const cat = this.detectCategory(d);
      return `<tr>
        <td><strong>${d.code || '—'}</strong></td>
        <td>${d.title || '—'}</td>
        <td>${cat || '—'}</td>
        <td>${d.revision || '—'}</td>
        <td><span class="status ${Utils.statusClass(d.status)}">${Utils.statusLabel(d.status)}</span></td>
        <td>${d.filePath ? `<button class="btn btn-sm btn-primary" data-action="open-file" data-id="${d.id}">باز کردن</button>` : '<span class="text-muted" style="font-size:0.8rem">بدون فایل</span>'}</td>
        <td>${Auth.hasPermission('create_change_request') && d.status === 'current' ? `<button class="btn btn-sm btn-outline" data-action="request-change" data-id="${d.id}">درخواست اصلاح</button>` : '—'}</td>
        <td><button class="btn btn-sm btn-outline" data-action="view" data-id="${d.id}">جزئیات</button></td>
      </tr>`;
    }).join('');
  },

  async showDetail(docId) {
    await this.load();
    const doc = this.getById(docId);
    if (!doc) { Utils.showToast('مدرک یافت نشد', 'error'); return; }

    const versions = this.getVersionsForDocument(docId);

    if (doc.status === 'obsolete') {
      if (!Utils.confirm('این مدرک منسوخ است. ادامه می‌دهید؟')) return;
    }

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="flex gap-2 mb-2" style="align-items:center">
        <button class="btn btn-outline btn-sm" id="btn-back-docs">← بازگشت</button>
        <h2 style="margin:0">جزئیات مدرک</h2>
      </div>

      <div class="table-container" style="padding:1.25rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem">
          <div><strong>عنوان:</strong> ${doc.title || '—'}</div>
          <div><strong>کد:</strong> ${doc.code || '—'}</div>
          <div><strong>دسته:</strong> ${this.detectCategory(doc) || '—'}</div>
          <div><strong>ویرایش:</strong> ${doc.revision || '—'}</div>
          <div><strong>وضعیت:</strong> <span class="status ${Utils.statusClass(doc.status)}">${Utils.statusLabel(doc.status)}</span></div>
          <div><strong>نوع:</strong> ${doc.type || '—'}</div>

          <div><strong>تاریخ تهیه:</strong> ${this.fmtDate(doc.createdDate)}</div>
          <div><strong>تاریخ بازنگری:</strong> ${this.fmtDate(doc.reviewDate)}</div>
          <div><strong>تاریخ تصویب:</strong> ${this.fmtDate(doc.approvalDate)}</div>
          <div><strong>تاریخ اجرا:</strong> ${this.fmtDate(doc.effectiveDate)}</div>

          <div><strong>مسئول تهیه:</strong> ${doc.preparedBy || '—'}</div>
          <div><strong>مسئول بازنگری:</strong> ${doc.reviewedBy || '—'}</div>
          <div><strong>مسئول تصویب:</strong> ${doc.approvedBy || '—'}</div>
          <div></div>

          <div style="grid-column:1/-1">
            <strong>فایل مدرک:</strong>
            ${doc.filePath ? `<span style="font-family:monospace;direction:ltr;margin:0 0.5rem">${doc.filePath}</span>` : '<span class="text-muted">ثبت نشده</span>'}
            <button class="btn btn-sm btn-primary" id="btn-pick-file" style="margin-right:0.5rem">${doc.filePath ? 'تغییر فایل' : 'انتخاب فایل'}</button>
            ${doc.filePath ? '<button class="btn btn-sm btn-outline" id="btn-open-file">باز کردن فایل</button>' : ''}
          </div>
          <div style="grid-column:1/-1"><strong>توضیحات:</strong> ${doc.description || '—'}</div>
        </div>

        <div class="mt-2 flex gap-1">
          ${Auth.hasPermission('create_change_request') && doc.status === 'current'
            ? '<button class="btn btn-primary" id="btn-request-change">ثبت درخواست اصلاح</button>' : ''}
        </div>
      </div>

      <h3 class="mt-2 mb-1">تاریخچه نسخه‌ها</h3>
      <div class="table-container">
        <table>
          <thead><tr><th>ویرایش</th><th>وضعیت</th><th>تاریخ اجرا</th><th>علت تغییر</th></tr></thead>
          <tbody>
            ${versions.length ? versions.map(v => `
              <tr>
                <td>${v.revision}</td>
                <td><span class="status ${Utils.statusClass(v.status)}">${Utils.statusLabel(v.status)}</span></td>
                <td>${this.fmtDate(v.effectiveDate)}</td>
                <td>${v.changeReason || '—'}</td>
              </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">نسخه‌ای ثبت نشده</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-back-docs')?.addEventListener('click', () => App.navigate('documents'));
    document.getElementById('btn-request-change')?.addEventListener('click', () => this.startChangeRequest(docId));
    document.getElementById('btn-open-file')?.addEventListener('click', () => this.openDocumentFile(doc));
    document.getElementById('btn-pick-file')?.addEventListener('click', async () => {
      const path = await this.pickAndSetFilePath(doc);
      if (path) this.showDetail(docId);
    });
  },

  startChangeRequest(docId) {
    if (window.Workflow) Workflow.openCreateRequest(docId);
    else Utils.showToast('ماژول گردش کار بارگذاری نشده', 'error');
  }
};

window.Documents = Documents;
