/**
 * Laboratory System - Records Management
 * نمایش درختی پوشه‌ها + اسکن واقعی
 */

const Records = {
  records: [],
  tree: {},           // ساختار درختی
  expanded: new Set(['records']), // پوشه‌های باز

  async load() {
    const data = await Storage.readJSON('records-index.json');
    this.records = data?.records || [];
    this.buildTree();
    return this.records;
  },

  async save() {
    await Storage.writeJSON('records-index.json', { records: this.records });
  },

  /**
   * ساخت ساختار درختی از لیست فایل‌ها
   */
  buildTree() {
    this.tree = { name: 'records', path: 'records', type: 'folder', children: {}, files: [] };

    this.records.forEach(r => {
      if (!r.path) {
        this.tree.files.push(r);
        return;
      }

      const parts = r.path.replace(/\\/g, '/').split('/').filter(Boolean);
      // حذف records از اول مسیر اگر وجود داشته باشد
      if (parts[0] === 'records') parts.shift();

      let current = this.tree;

      // ساخت پوشه‌ها
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (!current.children[folderName]) {
          current.children[folderName] = {
            name: folderName,
            path: (current.path ? current.path + '/' : '') + folderName,
            type: 'folder',
            children: {},
            files: []
          };
        }
        current = current.children[folderName];
      }

      // اضافه کردن فایل
      if (parts.length > 0) {
        current.files.push(r);
      } else {
        this.tree.files.push(r);
      }
    });
  },

  /**
   * اسکن واقعی پوشه records
   */
  async scanRecordsFolder() {
    if (!Storage.useFSAccess || !Storage.dirHandle) {
      throw new Error('پوشه داده‌ها انتخاب نشده است.');
    }

    let recordsDir;
    try {
      recordsDir = await Storage.dirHandle.getDirectoryHandle('records', { create: true });
    } catch (err) {
      throw new Error('امکان دسترسی به پوشه records وجود ندارد.');
    }

    const foundFiles = [];

    async function walk(dirHandle, relativePath = 'records') {
      for await (const entry of dirHandle.values()) {
        const entryPath = relativePath + '/' + entry.name;

        if (entry.kind === 'file') {
          const ext = entry.name.split('.').pop().toLowerCase();
          let type = 'other';
          if (['pdf'].includes(ext)) type = 'pdf';
          else if (['xls', 'xlsx', 'csv'].includes(ext)) type = 'excel';
          else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) type = 'image';
          else if (['doc', 'docx', 'txt'].includes(ext)) type = 'report';

          foundFiles.push({
            fileName: entry.name,
            path: entryPath,
            type
          });
        } else if (entry.kind === 'directory') {
          try {
            const subDir = await dirHandle.getDirectoryHandle(entry.name);
            await walk(subDir, entryPath);
          } catch (e) {}
        }
      }
    }

    await walk(recordsDir);

    await this.load();
    const existingByPath = {};
    this.records.forEach(r => {
      if (r.path) existingByPath[r.path.toLowerCase()] = r;
    });

    const newRecords = [];
    const seenPaths = new Set();

    for (const f of foundFiles) {
      const key = f.path.toLowerCase();
      seenPaths.add(key);

      if (existingByPath[key]) {
        existingByPath[key].fileExists = true;
        existingByPath[key].lastScanned = Utils.nowISO();
        newRecords.push(existingByPath[key]);
      } else {
        newRecords.push({
          id: Utils.generateId('rec'),
          title: f.fileName,
          fileName: f.fileName,
          path: f.path,
          type: f.type,
          relatedTo: '',
          notes: '',
          fileExists: true,
          createdAt: Utils.nowISO(),
          lastScanned: Utils.nowISO(),
          source: 'scan'
        });
      }
    }

    // فایل‌های مفقود
    for (const r of this.records) {
      if (r.path && !seenPaths.has(r.path.toLowerCase())) {
        r.fileExists = false;
        r.lastScanned = Utils.nowISO();
        newRecords.push(r);
      } else if (!r.path) {
        newRecords.push(r);
      }
    }

    this.records = newRecords;
    await this.save();
    this.buildTree();

    return {
      total: foundFiles.length,
      newCount: foundFiles.filter(f => !existingByPath[f.path.toLowerCase()]).length,
      missing: this.records.filter(r => r.fileExists === false).length
    };
  },

  /**
   * باز کردن فایل سابقه
   */
  async openRecordFile(record) {
    if (!record.path) {
      Utils.showToast('مسیر فایل ثبت نشده', 'warning');
      return;
    }

    if (!Storage.useFSAccess || !Storage.dirHandle) {
      Utils.showToast('پوشه داده‌ها انتخاب نشده', 'warning');
      return;
    }

    try {
      const parts = record.path.replace(/\\/g, '/').split('/').filter(Boolean);
      let handle = Storage.dirHandle;

      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i]);
      }

      const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      Utils.showToast('فایل باز شد', 'success');
    } catch (err) {
      Utils.showToast('فایل یافت نشد: ' + record.path, 'error');
    }
  },

  async renderList(container) {
    await this.load();

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">سوابق آزمایشگاه</h2>
        <div class="flex gap-1">
          <button class="btn btn-outline btn-sm" id="btn-scan-records">اسکن پوشه records</button>
          <button class="btn btn-primary btn-sm" id="btn-add-record">+ افزودن دستی</button>
        </div>
      </div>

      <p class="text-muted mb-2" style="font-size:0.9rem">
        ساختار درختی پوشه <code>records/</code> نمایش داده می‌شود. روی پوشه‌ها کلیک کنید تا باز/بسته شوند.
      </p>

      <div class="table-container" style="padding:1rem" id="records-tree">
        ${this.renderTree(this.tree, 0)}
      </div>

      <p class="text-muted mt-2">تعداد کل فایل‌ها: ${this.records.length}</p>
    `;

    document.getElementById('btn-scan-records')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-scan-records');
      btn.disabled = true;
      btn.textContent = 'در حال اسکن...';
      try {
        const result = await this.scanRecordsFolder();
        Utils.showToast(`اسکن انجام شد: ${result.total} فایل، ${result.newCount} جدید، ${result.missing} مفقود`, 'success');
        this.renderList(container);
      } catch (err) {
        Utils.showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'اسکن پوشه records';
      }
    });

    document.getElementById('btn-add-record')?.addEventListener('click', () => this.openAddForm());

    // رویدادهای درخت
    document.getElementById('records-tree')?.addEventListener('click', (e) => {
      const folderBtn = e.target.closest('[data-folder]');
      if (folderBtn) {
        const path = folderBtn.dataset.folder;
        if (this.expanded.has(path)) this.expanded.delete(path);
        else this.expanded.add(path);
        document.getElementById('records-tree').innerHTML = this.renderTree(this.tree, 0);
        return;
      }

      const openBtn = e.target.closest('[data-open-file]');
      if (openBtn) {
        const id = openBtn.dataset.openFile;
        const rec = this.records.find(r => r.id === id);
        if (rec) this.openRecordFile(rec);
      }

      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        this.deleteRecord(delBtn.dataset.delete);
      }
    });
  },

  renderTree(node, level) {
    if (!node) return '';

    let html = '';
    const isExpanded = this.expanded.has(node.path);
    const hasChildren = Object.keys(node.children || {}).length > 0 || (node.files || []).length > 0;
    const indent = level * 18;

    // خود پوشه
    if (level === 0 || node.name) {
      html += `
        <div style="padding:0.35rem 0;padding-right:${indent}px;cursor:pointer;user-select:none" data-folder="${node.path}">
          <span style="margin-left:0.4rem">${isExpanded ? '📂' : '📁'}</span>
          <strong>${node.name || 'records'}</strong>
          <span class="text-muted" style="font-size:0.8rem;margin-right:0.5rem">
            (${Object.keys(node.children || {}).length} پوشه، ${(node.files || []).length} فایل)
          </span>
        </div>
      `;
    }

    if (!isExpanded && level > 0) return html;

    // زیرپوشه‌ها
    const folders = Object.values(node.children || {}).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    for (const folder of folders) {
      html += this.renderTree(folder, level + 1);
    }

    // فایل‌های این پوشه
    if (isExpanded || level === 0) {
      const files = (node.files || []).sort((a, b) => (a.fileName || a.title || '').localeCompare(b.fileName || b.title || '', 'fa'));
      for (const f of files) {
        const fileIndent = (level + 1) * 18;
        html += `
          <div style="padding:0.3rem 0;padding-right:${fileIndent}px;display:flex;align-items:center;gap:0.5rem;border-bottom:1px solid #f1f5f9">
            <span>${this.fileIcon(f.type)}</span>
            <span style="flex:1">${f.fileName || f.title}</span>
            <span class="status ${f.fileExists === false ? 'status-obsolete' : 'status-current'}" style="font-size:0.75rem">
              ${f.fileExists === false ? 'مفقود' : 'موجود'}
            </span>
            <button class="btn btn-sm btn-outline" data-open-file="${f.id}">باز کردن</button>
            <button class="btn btn-sm btn-outline" data-delete="${f.id}">حذف</button>
          </div>
        `;
      }
    }

    return html;
  },

  fileIcon(type) {
    const map = { pdf: '📄', excel: '📊', image: '🖼️', report: '📝', other: '📎' };
    return map[type] || '📎';
  },

  openAddForm() {
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'افزودن سابقه جدید (دستی)';
    modalBody.innerHTML = `
      <div class="form-group">
        <label>عنوان / نام فایل *</label>
        <input type="text" id="rec-title" required>
      </div>
      <div class="form-group">
        <label>مسیر فایل (نسبت به پوشه داده‌ها)</label>
        <input type="text" id="rec-path" placeholder="مثال: records/1403/گزارش.pdf">
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
        <label>مرتبط با</label>
        <input type="text" id="rec-related" placeholder="کد مدرک یا فرآیند">
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

      this.records.unshift({
        id: Utils.generateId('rec'),
        title,
        fileName: title,
        path: document.getElementById('rec-path').value.trim(),
        type: document.getElementById('rec-type').value,
        relatedTo: document.getElementById('rec-related').value.trim(),
        fileExists: true,
        createdAt: Utils.nowISO(),
        source: 'manual'
      });

      await this.save();
      Utils.hide('modal-overlay');
      Utils.showToast('سابقه اضافه شد', 'success');
      this.renderList(document.getElementById('content'));
    };
  },

  async deleteRecord(id) {
    if (!Utils.confirm('آیا از حذف این مورد از فهرست مطمئن هستید؟\n(فایل فیزیکی حذف نمی‌شود)')) return;
    this.records = this.records.filter(r => r.id !== id);
    await this.save();
    Utils.showToast('حذف شد', 'success');
    this.renderList(document.getElementById('content'));
  }
};

window.Records = Records;
