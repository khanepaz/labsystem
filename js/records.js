/**
 * Laboratory System - Records Management
 * درخت + پیش‌نمایش Excel + باز کردن پوشه
 */

const Records = {
  records: [],
  tree: {},
  expanded: new Set(['records']),

  async load() {
    const data = await Storage.readJSON('records-index.json');
    this.records = data?.records || [];
    this.buildTree();
    return this.records;
  },

  async save() {
    await Storage.writeJSON('records-index.json', { records: this.records });
  },

  buildTree() {
    this.tree = { name: 'records', path: 'records', type: 'folder', children: {}, files: [] };

    this.records.forEach(r => {
      if (!r.path) {
        this.tree.files.push(r);
        return;
      }

      const parts = r.path.replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts[0] === 'records') parts.shift();

      let current = this.tree;
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

      if (parts.length > 0) current.files.push(r);
      else this.tree.files.push(r);
    });
  },

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
          else if (['rar', 'zip', '7z'].includes(ext)) type = 'archive';
          foundFiles.push({ fileName: entry.name, path: entryPath, type });
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

  async getFileFromPath(relativePath) {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let handle = Storage.dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      handle = await handle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
    return await fileHandle.getFile();
  },

  /** مسیر پوشه والد از مسیر فایل */
  parentFolderPath(filePath) {
    if (!filePath) return 'records';
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length <= 1) return 'records';
    parts.pop();
    return parts.join('/');
  },

  /**
   * باز کردن پوشه در درخت + کپی مسیر
   * (مرورگر اجازه باز کردن Explorer ویندوز را نمی‌دهد)
   */
  async openFolder(folderPath) {
    if (!folderPath) folderPath = 'records';

    // باز کردن تمام پوشه‌های والد در درخت
    const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
    let acc = '';
    for (const p of parts) {
      acc = acc ? acc + '/' + p : p;
      this.expanded.add(acc);
    }
    this.expanded.add(folderPath);

    // کپی مسیر نسبی
    try {
      await navigator.clipboard.writeText(folderPath);
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = folderPath;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    // رفرش درخت
    const treeEl = document.getElementById('records-tree');
    if (treeEl) treeEl.innerHTML = this.renderTree(this.tree, 0);

    Utils.showToast(
      'پوشه در درخت باز شد. مسیر کپی شد: ' + folderPath +
      ' — در Explorer بروید به پوشه داده‌ها و این مسیر را باز کنید.',
      'success'
    );
  },

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
      const file = await this.getFileFromPath(record.path);
      const name = (record.fileName || record.title || file.name || '').toLowerCase();
      const ext = name.split('.').pop();

      if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
        const url = URL.createObjectURL(file);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        Utils.showToast('فایل در تب جدید باز شد', 'success');
        return;
      }

      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        await this.previewSpreadsheet(file, record.fileName || record.title || file.name);
        return;
      }

      // rar, zip, doc و ... → دانلود
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.fileName || record.title || file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      Utils.showToast('دانلود آغاز شد. برای rar/zip از «باز کردن پوشه» استفاده کنید.', 'success');
    } catch (err) {
      console.error(err);
      Utils.showToast('فایل یافت نشد: ' + record.path, 'error');
    }
  },

  async previewSpreadsheet(file, title) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modal = document.getElementById('modal');

    modalTitle.textContent = 'پیش‌نمایش: ' + title;
    modalBody.innerHTML = '<p class="text-muted">در حال خواندن...</p>';
    modalFooter.innerHTML = `
      <button class="btn btn-outline" id="btn-close-preview">بستن</button>
      <button class="btn btn-primary" id="btn-download-file">دانلود فایل</button>
    `;
    modal.style.maxWidth = '920px';
    Utils.show('modal-overlay');

    const close = () => { Utils.hide('modal-overlay'); modal.style.maxWidth = ''; };
    document.getElementById('btn-close-preview').onclick = close;
    document.getElementById('modal-close').onclick = close;
    document.getElementById('btn-download-file').onclick = () => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    try {
      let rows = [];
      const name = title.toLowerCase();

      if (name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
        rows = lines.slice(0, 100).map(line => {
          const result = [];
          let cur = '', q = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') q = !q;
            else if (c === sep && !q) { result.push(cur); cur = ''; }
            else cur += c;
          }
          result.push(cur);
          return result.map(s => s.replace(/^"|"$/g, '').trim());
        });
      } else if (typeof XLSX !== 'undefined') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(0, 100);
      } else {
        modalBody.innerHTML = '<p class="text-muted">کتابخانه Excel موجود نیست. فایل را دانلود کنید.</p>';
        return;
      }

      if (!rows.length) {
        modalBody.innerHTML = '<p class="text-muted">فایل خالی است.</p>';
        return;
      }

      const maxCols = Math.max(...rows.map(r => r.length));
      let tableHtml = '<div style="overflow:auto;max-height:60vh"><table><thead><tr>';
      const header = rows[0];
      for (let c = 0; c < maxCols; c++) {
        tableHtml += `<th>${header[c] !== undefined && header[c] !== '' ? header[c] : 'ستون ' + (c + 1)}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';
      for (let i = 1; i < rows.length; i++) {
        tableHtml += '<tr>';
        for (let c = 0; c < maxCols; c++) tableHtml += `<td>${rows[i][c] !== undefined ? rows[i][c] : ''}</td>`;
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table></div>';
      if (rows.length >= 100) tableHtml += '<p class="text-muted mt-1" style="font-size:0.85rem">فقط ۱۰۰ ردیف اول</p>';
      modalBody.innerHTML = tableHtml;
    } catch (err) {
      modalBody.innerHTML = `<p style="color:var(--danger)">خطا: ${err.message}</p>`;
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

      <p class="text-muted mb-2" style="font-size:0.88rem">
        PDF/تصویر در مرورگر باز می‌شود. Excel پیش‌نمایش جدولی دارد.
        برای rar و سایر فایل‌ها از <strong>باز کردن پوشه</strong> استفاده کنید.
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
        Utils.showToast(`اسکن: ${result.total} فایل، ${result.newCount} جدید، ${result.missing} مفقود`, 'success');
        this.renderList(container);
      } catch (err) {
        Utils.showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'اسکن پوشه records';
      }
    });

    document.getElementById('btn-add-record')?.addEventListener('click', () => this.openAddForm());

    document.getElementById('records-tree')?.addEventListener('click', (e) => {
      // جلوگیری از تداخل کلیک دکمه با پوشه
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        if (action === 'open-file') {
          const rec = this.records.find(r => r.id === actionBtn.dataset.id);
          if (rec) this.openRecordFile(rec);
        } else if (action === 'open-folder') {
          this.openFolder(actionBtn.dataset.path);
        } else if (action === 'delete') {
          this.deleteRecord(actionBtn.dataset.id);
        }
        return;
      }

      const folderBtn = e.target.closest('[data-folder]');
      if (folderBtn) {
        const path = folderBtn.dataset.folder;
        if (this.expanded.has(path)) this.expanded.delete(path);
        else this.expanded.add(path);
        document.getElementById('records-tree').innerHTML = this.renderTree(this.tree, 0);
      }
    });
  },

  renderTree(node, level) {
    if (!node) return '';
    let html = '';
    const isExpanded = this.expanded.has(node.path);
    const indent = level * 18;

    if (level === 0 || node.name) {
      html += `
        <div style="padding:0.4rem 0;padding-right:${indent}px;display:flex;align-items:center;gap:0.4rem;border-bottom:1px solid #f1f5f9">
          <span style="cursor:pointer;user-select:none;flex:1" data-folder="${node.path}">
            ${isExpanded ? '📂' : '📁'}
            <strong style="margin-right:0.3rem">${node.name || 'records'}</strong>
            <span class="text-muted" style="font-size:0.8rem">
              (${Object.keys(node.children || {}).length} پوشه، ${(node.files || []).length} فایل)
            </span>
          </span>
          <button class="btn btn-sm btn-outline" data-action="open-folder" data-path="${node.path}" title="باز کردن پوشه">باز کردن پوشه</button>
        </div>`;
    }

    if (!isExpanded && level > 0) return html;

    const folders = Object.values(node.children || {}).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    for (const folder of folders) html += this.renderTree(folder, level + 1);

    if (isExpanded || level === 0) {
      const files = (node.files || []).sort((a, b) =>
        (a.fileName || a.title || '').localeCompare(b.fileName || b.title || '', 'fa'));
      for (const f of files) {
        const fileIndent = (level + 1) * 18;
        const parentPath = this.parentFolderPath(f.path);
        html += `
          <div style="padding:0.3rem 0;padding-right:${fileIndent}px;display:flex;align-items:center;gap:0.4rem;border-bottom:1px solid #f1f5f9">
            <span>${this.fileIcon(f.type)}</span>
            <span style="flex:1">${f.fileName || f.title}</span>
            <span class="status ${f.fileExists === false ? 'status-obsolete' : 'status-current'}" style="font-size:0.75rem">
              ${f.fileExists === false ? 'مفقود' : 'موجود'}
            </span>
            <button class="btn btn-sm btn-primary" data-action="open-file" data-id="${f.id}">باز کردن</button>
            <button class="btn btn-sm btn-outline" data-action="open-folder" data-path="${parentPath}">باز کردن پوشه</button>
            <button class="btn btn-sm btn-outline" data-action="delete" data-id="${f.id}">حذف</button>
          </div>`;
      }
    }
    return html;
  },

  fileIcon(type) {
    return ({ pdf: '📄', excel: '📊', image: '🖼️', report: '📝', archive: '📦', other: '📎' })[type] || '📎';
  },

  openAddForm() {
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'افزودن سابقه جدید';
    modalBody.innerHTML = `
      <div class="form-group"><label>عنوان *</label><input type="text" id="rec-title" required></div>
      <div class="form-group"><label>مسیر فایل</label><input type="text" id="rec-path" placeholder="records/1403/file.rar"></div>
      <div class="form-group">
        <label>نوع</label>
        <select id="rec-type">
          <option value="pdf">PDF</option>
          <option value="excel">Excel</option>
          <option value="archive">آرشیو (rar/zip)</option>
          <option value="image">تصویر</option>
          <option value="report">گزارش</option>
          <option value="other">سایر</option>
        </select>
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
      if (!title) { Utils.showToast('عنوان الزامی است', 'error'); return; }
      this.records.unshift({
        id: Utils.generateId('rec'),
        title,
        fileName: title,
        path: document.getElementById('rec-path').value.trim(),
        type: document.getElementById('rec-type').value,
        fileExists: true,
        createdAt: Utils.nowISO(),
        source: 'manual'
      });
      await this.save();
      Utils.hide('modal-overlay');
      Utils.showToast('اضافه شد', 'success');
      this.renderList(document.getElementById('content'));
    };
  },

  async deleteRecord(id) {
    if (!Utils.confirm('از فهرست حذف شود؟ (فایل فیزیکی پاک نمی‌شود)')) return;
    this.records = this.records.filter(r => r.id !== id);
    await this.save();
    Utils.showToast('حذف شد', 'success');
    this.renderList(document.getElementById('content'));
  }
};

window.Records = Records;
