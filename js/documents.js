/**
 * Laboratory System - Documents Management
 */

const Documents = {
  documents: [],
  versions: [],
  categories: [],

  async load() {
    const docsData = await Storage.readJSON('documents.json');
    const versData = await Storage.readJSON('document-versions.json');
    const catData = await Storage.readJSON('categories.json');

    this.documents = docsData?.documents || [];
    this.versions = versData?.versions || [];
    this.categories = catData?.categories || [];
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

  getObsoleteDocuments() {
    return this.documents.filter(d => d.status === 'obsolete');
  },

  getVersionsForDocument(docId) {
    return this.versions
      .filter(v => v.documentId === docId)
      .sort((a, b) => (b.revision || 0) - (a.revision || 0));
  },

  /**
   * رندر لیست مدارک
   */
  async renderList(container) {
    await this.load();

    const current = this.getCurrentDocuments();
    const obsolete = this.getObsoleteDocuments();

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">مدارک</h2>
        <div class="flex gap-1">
          <input type="text" id="doc-search" placeholder="جستجو در عنوان یا کد..." style="width:220px">
          <select id="doc-filter-status">
            <option value="current">جاری</option>
            <option value="obsolete">منسوخ</option>
            <option value="all">همه</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>کد مدرک</th>
              <th>عنوان</th>
              <th>نوع</th>
              <th>ویرایش</th>
              <th>وضعیت</th>
              <th>تاریخ اجرا</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody id="docs-tbody">
            ${this.renderRows(current)}
          </tbody>
        </table>
      </div>

      <p class="text-muted mt-2" id="docs-count">تعداد: ${current.length} مدرک جاری</p>
    `;

    // رویدادها
    document.getElementById('doc-search')?.addEventListener('input', (e) => {
      this.filterAndRender(e.target.value, document.getElementById('doc-filter-status').value);
    });

    document.getElementById('doc-filter-status')?.addEventListener('change', (e) => {
      this.filterAndRender(document.getElementById('doc-search').value, e.target.value);
    });

    // کلیک روی ردیف‌ها بعداً با event delegation
    document.getElementById('docs-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'view') this.showDetail(id);
      if (action === 'request-change') this.startChangeRequest(id);
    });
  },

  renderRows(docs) {
    if (!docs.length) {
      return `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">مدرکی یافت نشد</td></tr>`;
    }

    return docs.map(d => `
      <tr>
        <td><strong>${d.code || '—'}</strong></td>
        <td>${d.title || '—'}</td>
        <td>${d.type || '—'}</td>
        <td>${d.revision || '—'}</td>
        <td><span class="status ${Utils.statusClass(d.status)}">${Utils.statusLabel(d.status)}</span></td>
        <td>${Utils.toPersianDate(d.effectiveDate)}</td>
        <td>
          <button class="btn btn-sm btn-outline" data-action="view" data-id="${d.id}">مشاهده</button>
          ${Auth.hasPermission('create_change_request') && d.status === 'current' ? 
            `<button class="btn btn-sm btn-primary" data-action="request-change" data-id="${d.id}" style="margin-right:0.3rem">درخواست اصلاح</button>` : ''}
        </td>
      </tr>
    `).join('');
  },

  filterAndRender(search, statusFilter) {
    let list = this.documents;

    if (statusFilter === 'current') list = list.filter(d => d.status === 'current');
    else if (statusFilter === 'obsolete') list = list.filter(d => d.status === 'obsolete');

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q)
      );
    }

    const tbody = document.getElementById('docs-tbody');
    if (tbody) tbody.innerHTML = this.renderRows(list);

    const countEl = document.getElementById('docs-count');
    if (countEl) countEl.textContent = `تعداد: ${list.length} مدرک`;
  },

  async showDetail(docId) {
    await this.load();
    const doc = this.getById(docId);
    if (!doc) {
      Utils.showToast('مدرک یافت نشد', 'error');
      return;
    }

    const versions = this.getVersionsForDocument(docId);

    // هشدار برای مدرک منسوخ
    if (doc.status === 'obsolete') {
      const confirmed = Utils.confirm(
        `⚠ هشدار: این مدرک منسوخ شده است.\n\n` +
        `عنوان: ${doc.title}\n` +
        `کد: ${doc.code}\n` +
        `ویرایش: ${doc.revision}\n` +
        `تاریخ منسوخ شدن: ${Utils.toPersianDate(doc.obsoleteDate)}\n` +
        (doc.obsoleteReason ? `علت: ${doc.obsoleteReason}\n` : '') +
        (doc.replacedBy ? `جایگزین: ${doc.replacedBy}\n` : '') +
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
          <div><strong>دسته‌بندی:</strong> ${doc.categoryName || '—'}</div>
          <div><strong>شماره ویرایش:</strong> ${doc.revision || '—'}</div>
          <div><strong>وضعیت:</strong> <span class="status ${Utils.statusClass(doc.status)}">${Utils.statusLabel(doc.status)}</span></div>
          <div><strong>تاریخ ایجاد:</strong> ${Utils.toPersianDate(doc.createdDate)}</div>
          <div><strong>تاریخ تصویب:</strong> ${Utils.toPersianDate(doc.approvalDate)}</div>
          <div><strong>تاریخ اجرا:</strong> ${Utils.toPersianDate(doc.effectiveDate)}</div>
          <div><strong>مسئول تهیه:</strong> ${doc.preparedBy || '—'}</div>
          <div><strong>مسئول بازنگری:</strong> ${doc.reviewedBy || '—'}</div>
          <div><strong>مسئول تصویب:</strong> ${doc.approvedBy || '—'}</div>
          <div style="grid-column:1/-1"><strong>مسیر فایل:</strong> ${doc.filePath || '—'}</div>
          <div style="grid-column:1/-1"><strong>توضیحات:</strong> ${doc.description || '—'}</div>
        </div>

        ${Auth.hasPermission('create_change_request') && doc.status === 'current' ? `
          <div class="mt-2">
            <button class="btn btn-primary" id="btn-request-change">ثبت درخواست اصلاح</button>
          </div>
        ` : ''}
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

    document.getElementById('btn-back-docs')?.addEventListener('click', () => {
      App.navigate('documents');
    });

    document.getElementById('btn-request-change')?.addEventListener('click', () => {
      this.startChangeRequest(docId);
    });
  },

  startChangeRequest(docId) {
    // به ماژول workflow واگذار می‌شود
    if (window.Workflow) {
      Workflow.openCreateRequest(docId);
    } else {
      Utils.showToast('ماژول گردش کار هنوز بارگذاری نشده', 'error');
    }
  }
};

window.Documents = Documents;
