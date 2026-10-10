/**
 * Laboratory System - Excel / CSV Import with Column Mapping
 * پشتیبانی از فایل‌های CSV و Excel ساده (TSV/CSV)
 * برای فایل‌های xlsx واقعی بعداً می‌توان کتابخانه محلی اضافه کرد.
 */

const ExcelImport = {
  rawData: [],
  headers: [],
  mapping: {},
  previewRows: [],

  // فیلدهای استاندارد برنامه
  standardFields: [
    { key: 'title', label: 'عنوان مدرک', required: true },
    { key: 'code', label: 'کد / شماره مدرک', required: true },
    { key: 'type', label: 'نوع مدرک', required: false },
    { key: 'category', label: 'دسته‌بندی', required: false },
    { key: 'standard', label: 'استاندارد مرتبط', required: false },
    { key: 'clauses', label: 'بند / بندها', required: false },
    { key: 'revision', label: 'شماره ویرایش', required: false },
    { key: 'status', label: 'وضعیت', required: false },
    { key: 'createdDate', label: 'تاریخ ایجاد', required: false },
    { key: 'reviewDate', label: 'تاریخ بازنگری', required: false },
    { key: 'approvalDate', label: 'تاریخ تصویب', required: false },
    { key: 'effectiveDate', label: 'تاریخ اجرا', required: false },
    { key: 'preparedBy', label: 'مسئول تهیه', required: false },
    { key: 'reviewedBy', label: 'مسئول بازنگری', required: false },
    { key: 'approvedBy', label: 'مسئول تصویب', required: false },
    { key: 'filePath', label: 'مسیر فایل', required: false },
    { key: 'description', label: 'توضیحات', required: false }
  ],

  /**
   * باز کردن رابط ورود Excel/CSV
   */
  openImportUI(container) {
    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="align-items:center">
        <button class="btn btn-outline btn-sm" id="btn-back-from-import">← بازگشت</button>
        <h2 style="margin:0">ورود اطلاعات مدارک از Excel / CSV</h2>
      </div>

      <div class="table-container" style="padding:1.5rem">
        <p class="text-muted mb-2">
          فایل Excel را به صورت CSV ذخیره کنید (Save As → CSV UTF-8) و سپس انتخاب کنید.<br>
          ستون‌ها را با فیلدهای استاندارد برنامه تطبیق دهید.
        </p>

        <div class="form-group">
          <label>انتخاب فایل CSV</label>
          <input type="file" id="import-file" accept=".csv,.txt,.tsv" style="padding:0.5rem">
        </div>

        <div id="mapping-section" class="hidden mt-2">
          <h3 class="mb-2">نگاشت ستون‌ها</h3>
          <div id="mapping-fields"></div>
          <button class="btn btn-primary mt-2" id="btn-preview-import">پیش‌نمایش داده‌ها</button>
        </div>

        <div id="preview-section" class="hidden mt-2">
          <h3 class="mb-2">پیش‌نمایش (۱۰ ردیف اول)</h3>
          <div class="table-container" style="max-height:300px;overflow:auto">
            <table>
              <thead id="preview-head"></thead>
              <tbody id="preview-body"></tbody>
            </table>
          </div>
          <div id="import-warnings" class="mt-2"></div>
          <button class="btn btn-success mt-2" id="btn-do-import">تأیید و ورود اطلاعات</button>
        </div>
      </div>
    `;

    document.getElementById('btn-back-from-import').onclick = () => App.navigate('documents');

    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.parseFile(file);
    });

    document.getElementById('btn-preview-import')?.addEventListener('click', () => this.showPreview());
    document.getElementById('btn-do-import')?.addEventListener('click', () => this.executeImport());
  },

  parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          Utils.showToast('فایل خالی یا نامعتبر است', 'error');
          return;
        }

        // تشخیص جداکننده
        const firstLine = lines[0];
        let separator = ',';
        if (firstLine.includes('\t')) separator = '\t';
        else if (firstLine.includes(';')) separator = ';';

        this.headers = this.parseCSVLine(firstLine, separator);
        this.rawData = lines.slice(1).map(line => {
          const values = this.parseCSVLine(line, separator);
          const row = {};
          this.headers.forEach((h, i) => {
            row[h] = values[i] !== undefined ? values[i].trim() : '';
          });
          return row;
        }).filter(r => Object.values(r).some(v => v));

        this.showMappingUI();
        Utils.showToast(`${this.rawData.length} ردیف خوانده شد`, 'success');
      } catch (err) {
        Utils.showToast('خطا در خواندن فایل: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  parseCSVLine(line, separator) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map(s => s.replace(/^"|"$/g, '').trim());
  },

  showMappingUI() {
    const section = document.getElementById('mapping-section');
    const fieldsDiv = document.getElementById('mapping-fields');
    Utils.show(section);

    // پیشنهاد خودکار نگاشت بر اساس شباهت نام ستون
    const autoMap = {};
    this.standardFields.forEach(f => {
      const found = this.headers.find(h => {
        const hl = h.toLowerCase();
        const fl = f.label.toLowerCase();
        const fk = f.key.toLowerCase();
        return hl.includes(fk) || hl.includes(fl) || 
               fl.includes(hl) || hl.includes('عنوان') && f.key === 'title' ||
               hl.includes('کد') && f.key === 'code' ||
               hl.includes('ویرایش') && f.key === 'revision' ||
               hl.includes('وضعیت') && f.key === 'status';
      });
      if (found) autoMap[f.key] = found;
    });

    this.mapping = autoMap;

    fieldsDiv.innerHTML = this.standardFields.map(f => `
      <div class="form-group" style="display:grid;grid-template-columns:180px 1fr;gap:0.75rem;align-items:center">
        <label style="margin:0">${f.label} ${f.required ? '*' : ''}</label>
        <select data-field="${f.key}" class="mapping-select">
          <option value="">— انتخاب ستون —</option>
          ${this.headers.map(h => `
            <option value="${h}" ${this.mapping[f.key] === h ? 'selected' : ''}>${h}</option>
          `).join('')}
        </select>
      </div>
    `).join('');

    fieldsDiv.querySelectorAll('.mapping-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this.mapping[e.target.dataset.field] = e.target.value;
      });
    });
  },

  showPreview() {
    // جمع‌آوری نگاشت فعلی
    document.querySelectorAll('.mapping-select').forEach(sel => {
      this.mapping[sel.dataset.field] = sel.value;
    });

    if (!this.mapping.title || !this.mapping.code) {
      Utils.showToast('نگاشت عنوان و کد مدرک الزامی است', 'error');
      return;
    }

    this.previewRows = this.rawData.slice(0, 10).map(row => {
      const mapped = {};
      Object.keys(this.mapping).forEach(key => {
        const col = this.mapping[key];
        mapped[key] = col ? (row[col] || '') : '';
      });
      return mapped;
    });

    const head = document.getElementById('preview-head');
    const body = document.getElementById('preview-body');

    const cols = this.standardFields.filter(f => this.mapping[f.key]);
    head.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    body.innerHTML = this.previewRows.map(r => `
      <tr>${cols.map(c => `<td>${r[c.key] || '—'}</td>`).join('')}</tr>
    `).join('');

    // بررسی خطاها
    const warnings = [];
    const codes = this.rawData.map(r => r[this.mapping.code]).filter(Boolean);
    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
    if (duplicates.length) {
      warnings.push(`⚠ کدهای تکراری در فایل: ${[...new Set(duplicates)].slice(0, 5).join(', ')}`);
    }

    const emptyTitles = this.rawData.filter(r => !r[this.mapping.title]).length;
    if (emptyTitles) warnings.push(`⚠ ${emptyTitles} ردیف بدون عنوان`);

    const warnDiv = document.getElementById('import-warnings');
    warnDiv.innerHTML = warnings.length ? 
      warnings.map(w => `<p style="color:var(--warning)">${w}</p>`).join('') : 
      '<p style="color:var(--success)">✓ داده‌ها از نظر اولیه معتبر به نظر می‌رسند</p>';

    Utils.show('preview-section');
  },

  async executeImport() {
    if (!Utils.confirm(`آیا از ورود ${this.rawData.length} مدرک مطمئن هستید؟\n\nمدارک تکراری (بر اساس کد) نادیده گرفته می‌شوند.`)) {
      return;
    }

    try {
      await Documents.load();
      const existingCodes = new Set(Documents.documents.map(d => (d.code || '').toLowerCase()));

      let imported = 0;
      let skipped = 0;

      for (const row of this.rawData) {
        const code = (row[this.mapping.code] || '').trim();
        const title = (row[this.mapping.title] || '').trim();

        if (!code || !title) {
          skipped++;
          continue;
        }

        if (existingCodes.has(code.toLowerCase())) {
          skipped++;
          continue;
        }

        const doc = {
          id: Utils.generateId('doc'),
          title,
          code,
          type: row[this.mapping.type] || '',
          category: row[this.mapping.category] || '',
          categoryName: row[this.mapping.category] || '',
          standard: row[this.mapping.standard] || '',
          clauses: row[this.mapping.clauses] || '',
          revision: row[this.mapping.revision] || '0',
          status: (row[this.mapping.status] || 'current').toLowerCase().includes('منسوخ') ? 'obsolete' : 'current',
          createdDate: row[this.mapping.createdDate] || Utils.nowISO(),
          reviewDate: row[this.mapping.reviewDate] || '',
          approvalDate: row[this.mapping.approvalDate] || '',
          effectiveDate: row[this.mapping.effectiveDate] || Utils.nowISO(),
          preparedBy: row[this.mapping.preparedBy] || '',
          reviewedBy: row[this.mapping.reviewedBy] || '',
          approvedBy: row[this.mapping.approvedBy] || '',
          filePath: row[this.mapping.filePath] || '',
          description: row[this.mapping.description] || '',
          importedAt: Utils.nowISO(),
          createdAt: Utils.nowISO()
        };

        Documents.documents.push(doc);
        existingCodes.add(code.toLowerCase());
        imported++;
      }

      await Documents.saveDocuments();

      Utils.showToast(`${imported} مدرک وارد شد. ${skipped} ردیف نادیده گرفته شد.`, 'success');
      App.navigate('documents');
    } catch (err) {
      Utils.showToast('خطا در ورود اطلاعات: ' + err.message, 'error');
    }
  }
};

window.ExcelImport = ExcelImport;
