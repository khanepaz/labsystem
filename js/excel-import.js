/**
 * Laboratory System - Excel / CSV Import
 */

const ExcelImport = {
  rawData: [],
  headers: [],
  mapping: {},
  previewRows: [],

  standardFields: [
    { key: 'title', label: 'عنوان مدرک', required: true },
    { key: 'code', label: 'کد / شماره مدرک', required: true },
    { key: 'type', label: 'نوع مدرک', required: false },
    { key: 'category', label: 'دسته‌بندی', required: false },
    { key: 'standard', label: 'استاندارد مرتبط', required: false },
    { key: 'clauses', label: 'بند / بندها', required: false },
    { key: 'revision', label: 'شماره ویرایش', required: false },
    { key: 'status', label: 'وضعیت', required: false },
    { key: 'createdDate', label: 'تاریخ تهیه / ایجاد', required: false },
    { key: 'reviewDate', label: 'تاریخ بازنگری / ویرایش', required: false },
    { key: 'approvalDate', label: 'تاریخ تصویب', required: false },
    { key: 'effectiveDate', label: 'تاریخ اجرا', required: false },
    { key: 'preparedBy', label: 'مسئول تهیه', required: false },
    { key: 'reviewedBy', label: 'مسئول بازنگری', required: false },
    { key: 'approvedBy', label: 'مسئول تصویب', required: false },
    { key: 'filePath', label: 'مسیر فایل', required: false },
    { key: 'description', label: 'توضیحات', required: false }
  ],

  isXlsxSupported() {
    return typeof XLSX !== 'undefined';
  },

  /** تبدیل تاریخ اکسل (عدد سریال یا رشته) به متن قابل نمایش */
  normalizeDate(val) {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim();
    if (!s) return '';

    // عدد سریال اکسل (مثلاً 44927)
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 20000 && n < 60000 && typeof XLSX !== 'undefined' && XLSX.SSF) {
        try {
          // تبدیل تقریبی سریال اکسل به تاریخ
          const utc = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
          if (!isNaN(utc.getTime())) {
            return utc.toISOString().slice(0, 10);
          }
        } catch (e) {}
      }
      // اگر عدد کوچک است شاید شماره ویرایش باشد نه تاریخ
      if (n < 10000) return s;
    }

    return s;
  },

  openImportUI(container) {
    const xlsxOk = this.isXlsxSupported();

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="align-items:center">
        <button class="btn btn-outline btn-sm" id="btn-back-from-import">← بازگشت</button>
        <h2 style="margin:0">ورود اطلاعات مدارک از Excel</h2>
      </div>

      <div class="table-container" style="padding:1.5rem">
        <p class="text-muted mb-2">
          ستون‌های تاریخ (تهیه، بازنگری، تصویب، اجرا) را حتماً در نگاشت مشخص کنید تا در جزئیات مدرک نمایش داده شوند.
        </p>

        <div class="form-group">
          <label>انتخاب فایل ${xlsxOk ? 'Excel یا CSV' : 'CSV'}</label>
          <input type="file" id="import-file" accept="${xlsxOk ? '.xlsx,.xls,.csv,.txt,.tsv' : '.csv,.txt,.tsv'}" style="padding:0.5rem">
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
      if (e.target.files[0]) this.handleFile(e.target.files[0]);
    });
    document.getElementById('btn-preview-import')?.addEventListener('click', () => this.showPreview());
    document.getElementById('btn-do-import')?.addEventListener('click', () => this.executeImport());
  },

  async handleFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (!this.isXlsxSupported()) {
        Utils.showToast('کتابخانه Excel موجود نیست', 'error');
        return;
      }
      await this.parseXlsx(file);
    } else {
      this.parseCSV(file);
    }
  },

  parseCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          Utils.showToast('فایل خالی است', 'error');
          return;
        }
        const firstLine = lines[0];
        let separator = ',';
        if (firstLine.includes('\t')) separator = '\t';
        else if (firstLine.includes(';')) separator = ';';

        this.headers = this.parseCSVLine(firstLine, separator);
        this.rawData = lines.slice(1).map(line => {
          const values = this.parseCSVLine(line, separator);
          const row = {};
          this.headers.forEach((h, i) => { row[h] = values[i] !== undefined ? values[i].trim() : ''; });
          return row;
        }).filter(r => Object.values(r).some(v => v));

        this.showMappingUI();
        Utils.showToast(this.rawData.length + ' ردیف خوانده شد', 'success');
      } catch (err) {
        Utils.showToast('خطا: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  async parseXlsx(file) {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

      if (!json.length) {
        Utils.showToast('فایل خالی است', 'error');
        return;
      }

      this.headers = Object.keys(json[0]);
      this.rawData = json.map(row => {
        const cleaned = {};
        this.headers.forEach(h => {
          let v = row[h];
          if (v instanceof Date) {
            cleaned[h] = v.toISOString().slice(0, 10);
          } else {
            cleaned[h] = v !== undefined && v !== null ? String(v).trim() : '';
          }
        });
        return cleaned;
      });

      this.showMappingUI();
      Utils.showToast(this.rawData.length + ' ردیف از Excel خوانده شد', 'success');
    } catch (err) {
      Utils.showToast('خطا در خواندن Excel: ' + err.message, 'error');
    }
  },

  parseCSVLine(line, separator) {
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === separator && !inQuotes) { result.push(current); current = ''; }
      else current += char;
    }
    result.push(current);
    return result.map(s => s.replace(/^"|"$/g, '').trim());
  },

  /** پیشنهاد نگاشت ستون بر اساس نام‌های رایج فارسی */
  guessColumn(fieldKey) {
    const rules = {
      title: ['عنوان', 'title', 'نام مدرک', 'نام سند', 'document'],
      code: ['کد', 'شماره مدرک', 'شماره سند', 'code', 'شماره'],
      type: ['نوع', 'type'],
      category: ['دسته', 'دسته‌بندی', 'category', 'طبقه'],
      revision: ['ویرایش', 'شماره ویرایش', 'revision', 'rev', 'نسخه'],
      status: ['وضعیت', 'status'],
      createdDate: ['تاریخ تهیه', 'تاریخ ایجاد', 'تاریخ ساخت', 'created', 'تهیه'],
      reviewDate: ['تاریخ بازنگری', 'تاریخ ویرایش', 'تاریخ تجدید', 'review', 'بازنگری'],
      approvalDate: ['تاریخ تصویب', 'تاریخ تأیید', 'approval', 'تصویب'],
      effectiveDate: ['تاریخ اجرا', 'تاریخ اعتبار', 'effective', 'اجرا'],
      preparedBy: ['تهیه', 'مسئول تهیه', 'تهیه‌کننده', 'prepared'],
      reviewedBy: ['بازنگری', 'مسئول بازنگری', 'reviewed'],
      approvedBy: ['تصویب', 'مسئول تصویب', 'approved'],
      filePath: ['مسیر', 'path', 'فایل', 'file'],
      description: ['توضیح', 'شرح', 'description']
    };

    const keywords = rules[fieldKey] || [];
    return this.headers.find(h => {
      const hl = h.toLowerCase();
      return keywords.some(k => hl.includes(k.toLowerCase()));
    }) || '';
  },

  showMappingUI() {
    const section = document.getElementById('mapping-section');
    const fieldsDiv = document.getElementById('mapping-fields');
    Utils.show(section);

    const autoMap = {};
    this.standardFields.forEach(f => {
      const guessed = this.guessColumn(f.key);
      if (guessed) autoMap[f.key] = guessed;
    });
    this.mapping = autoMap;

    fieldsDiv.innerHTML = this.standardFields.map(f => `
      <div class="form-group" style="display:grid;grid-template-columns:200px 1fr;gap:0.75rem;align-items:center">
        <label style="margin:0">${f.label} ${f.required ? '*' : ''}</label>
        <select data-field="${f.key}" class="mapping-select">
          <option value="">— انتخاب ستون —</option>
          ${this.headers.map(h =>
            `<option value="${h}" ${this.mapping[f.key] === h ? 'selected' : ''}>${h}</option>`
          ).join('')}
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
        let val = col ? (row[col] || '') : '';
        if (key.includes('Date')) val = this.normalizeDate(val);
        mapped[key] = val;
      });
      return mapped;
    });

    const head = document.getElementById('preview-head');
    const body = document.getElementById('preview-body');
    const cols = this.standardFields.filter(f => this.mapping[f.key]);

    head.innerHTML = `<tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    body.innerHTML = this.previewRows.map(r =>
      `<tr>${cols.map(c => `<td>${r[c.key] || '—'}</td>`).join('')}</tr>`
    ).join('');

    const warnings = [];
    if (!this.mapping.createdDate && !this.mapping.reviewDate) {
      warnings.push('⚠ ستون تاریخ تهیه یا بازنگری نگاشت نشده — این تاریخ‌ها در جزئیات مدرک خالی می‌مانند.');
    }

    const warnDiv = document.getElementById('import-warnings');
    warnDiv.innerHTML = warnings.length
      ? warnings.map(w => `<p style="color:var(--warning)">${w}</p>`).join('')
      : '<p style="color:var(--success)">✓ آماده ورود</p>';

    Utils.show('preview-section');
  },

  async executeImport() {
    document.querySelectorAll('.mapping-select').forEach(sel => {
      this.mapping[sel.dataset.field] = sel.value;
    });

    if (!Utils.confirm('ورود ' + this.rawData.length + ' ردیف؟\nمدارک تکراری نادیده گرفته می‌شوند.')) return;

    try {
      await Documents.load();
      const existingCodes = new Set(Documents.documents.map(d => (d.code || '').toLowerCase()));
      let imported = 0, skipped = 0;

      for (const row of this.rawData) {
        const code = (row[this.mapping.code] || '').trim();
        const title = (row[this.mapping.title] || '').trim();
        if (!code || !title) { skipped++; continue; }
        if (existingCodes.has(code.toLowerCase())) { skipped++; continue; }

        const get = (key) => {
          const col = this.mapping[key];
          if (!col) return '';
          let v = row[col] || '';
          if (key.includes('Date')) v = this.normalizeDate(v);
          return v;
        };

        const doc = {
          id: Utils.generateId('doc'),
          title,
          code,
          type: get('type'),
          category: get('category'),
          categoryName: get('category'),
          standard: get('standard'),
          clauses: get('clauses'),
          revision: get('revision') || '0',
          status: (get('status') || 'current').toLowerCase().includes('منسوخ') ? 'obsolete' : 'current',
          createdDate: get('createdDate'),      // دیگر امروز را پیش‌فرض نمی‌گذاریم
          reviewDate: get('reviewDate'),
          approvalDate: get('approvalDate'),
          effectiveDate: get('effectiveDate'),
          preparedBy: get('preparedBy'),
          reviewedBy: get('reviewedBy'),
          approvedBy: get('approvedBy'),
          filePath: get('filePath'),
          description: get('description'),
          importedAt: Utils.nowISO(),
          createdAt: Utils.nowISO()
        };

        Documents.documents.push(doc);
        existingCodes.add(code.toLowerCase());
        imported++;
      }

      await Documents.saveDocuments();
      Utils.showToast(imported + ' مدرک وارد شد. ' + skipped + ' رد شد.', 'success');
      App.navigate('documents');
    } catch (err) {
      Utils.showToast('خطا: ' + err.message, 'error');
    }
  }
};

window.ExcelImport = ExcelImport;
