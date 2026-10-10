/**
 * Laboratory System - Export Module (fixed)
 */

const Export = {
  downloadCSV(data, filename = 'export.csv', headers = null) {
    if (!data || !data.length) {
      Utils.showToast('داده‌ای برای خروجی وجود ندارد', 'warning');
      return;
    }

    // اگر headers آبجکت باشد، کلیدها و برچسب‌ها را جدا کن
    let keys, headerLabels;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      keys = Object.keys(headers);
      headerLabels = Object.values(headers);
    } else if (Array.isArray(headers)) {
      keys = headers;
      headerLabels = headers;
    } else {
      keys = Object.keys(data[0]);
      headerLabels = keys;
    }

    // BOM برای نمایش صحیح فارسی در Excel
    let csv = '\uFEFF';
    csv += headerLabels.map(h => this.escapeCSV(String(h))).join(',') + '\r\n';

    data.forEach(row => {
      const values = keys.map(k => {
        let val = row[k];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object') val = JSON.stringify(val);
        return this.escapeCSV(String(val));
      });
      csv += values.join(',') + '\r\n';
    });

    this.triggerDownload(csv, filename, 'text/csv;charset=utf-8');
    Utils.showToast('فایل با موفقیت دانلود شد', 'success');
  },

  escapeCSV(str) {
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  triggerDownload(content, filename, mime) {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('Download error:', err);
      Utils.showToast('خطا در دانلود فایل: ' + err.message, 'error');
    }
  },

  async exportCurrentDocuments() {
    try {
      await Documents.load();
      const docs = Documents.getCurrentDocuments();

      if (!docs.length) {
        Utils.showToast('مدرک جاری برای خروجی وجود ندارد', 'warning');
        return;
      }

      const data = docs.map(d => ({
        code: d.code || '',
        title: d.title || '',
        type: d.type || '',
        category: d.categoryName || d.category || '',
        revision: d.revision || '',
        status: Utils.statusLabel(d.status),
        effectiveDate: d.effectiveDate ? Utils.toPersianDate(d.effectiveDate) : '',
        preparedBy: d.preparedBy || '',
        reviewedBy: d.reviewedBy || '',
        approvedBy: d.approvedBy || '',
        filePath: d.filePath || '',
        description: d.description || ''
      }));

      const headers = {
        code: 'کد مدرک',
        title: 'عنوان',
        type: 'نوع',
        category: 'دسته‌بندی',
        revision: 'ویرایش',
        status: 'وضعیت',
        effectiveDate: 'تاریخ اجرا',
        preparedBy: 'مسئول تهیه',
        reviewedBy: 'مسئول بازنگری',
        approvedBy: 'مسئول تصویب',
        filePath: 'مسیر فایل',
        description: 'توضیحات'
      };

      this.downloadCSV(data, 'documents_' + this.dateStamp() + '.csv', headers);
    } catch (err) {
      console.error(err);
      Utils.showToast('خطا در خروجی مدارک: ' + err.message, 'error');
    }
  },

  async exportChangeRequests() {
    try {
      await Workflow.load();
      if (!Workflow.requests.length) {
        Utils.showToast('درخواستی برای خروجی وجود ندارد', 'warning');
        return;
      }

      const data = Workflow.requests.map(r => ({
        id: r.id || '',
        documentCode: r.documentCode || '',
        documentTitle: r.documentTitle || '',
        currentRevision: r.currentRevision || '',
        requester: r.requesterName || '',
        createdAt: Utils.toPersianDate(r.createdAt),
        reason: r.reason || '',
        priority: r.priority || '',
        status: Utils.statusLabel(r.status),
        qualityDecision: r.qualityDecision === 'approved' ? 'تأیید' : (r.qualityDecision === 'rejected' ? 'رد' : ''),
        qualityComment: r.qualityComment || '',
        newRevision: r.newRevision || ''
      }));

      const headers = {
        id: 'شناسه',
        documentCode: 'کد مدرک',
        documentTitle: 'عنوان مدرک',
        currentRevision: 'ویرایش جاری',
        requester: 'درخواست‌دهنده',
        createdAt: 'تاریخ ثبت',
        reason: 'علت',
        priority: 'فوریت',
        status: 'وضعیت',
        qualityDecision: 'تصمیم کیفیت',
        qualityComment: 'توضیح کیفیت',
        newRevision: 'ویرایش جدید'
      };

      this.downloadCSV(data, 'change_requests_' + this.dateStamp() + '.csv', headers);
    } catch (err) {
      console.error(err);
      Utils.showToast('خطا در خروجی درخواست‌ها: ' + err.message, 'error');
    }
  },

  async exportRecords() {
    try {
      await Records.load();
      if (!Records.records.length) {
        Utils.showToast('سابقه‌ای برای خروجی وجود ندارد', 'warning');
        return;
      }

      const data = Records.records.map(r => ({
        title: r.title || r.fileName || '',
        path: r.path || '',
        type: r.type || '',
        relatedTo: r.relatedTo || '',
        fileExists: r.fileExists === false ? 'مفقود' : 'موجود',
        createdAt: Utils.toPersianDate(r.createdAt),
        notes: r.notes || ''
      }));

      const headers = {
        title: 'عنوان',
        path: 'مسیر',
        type: 'نوع',
        relatedTo: 'مرتبط با',
        fileExists: 'وضعیت فایل',
        createdAt: 'تاریخ ثبت',
        notes: 'توضیحات'
      };

      this.downloadCSV(data, 'records_' + this.dateStamp() + '.csv', headers);
    } catch (err) {
      console.error(err);
      Utils.showToast('خطا در خروجی سوابق: ' + err.message, 'error');
    }
  },

  dateStamp() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  renderReportsPage(container) {
    container.innerHTML = `
      <h2>گزارش‌ها و خروجی Excel</h2>
      <p class="text-muted mb-2">با کلیک روی دکمه دانلود، فایل CSV (قابل باز شدن در Excel) ذخیره می‌شود.</p>

      <div class="cards-grid">
        <div class="card" style="cursor:default">
          <div class="card-title">مدارک جاری</div>
          <div class="card-value" style="font-size:0.95rem;margin-bottom:0.75rem">فهرست کامل مدارک جاری</div>
          <button class="btn btn-primary btn-sm" id="btn-export-docs" type="button">دانلود Excel</button>
        </div>

        <div class="card" style="cursor:default">
          <div class="card-title">درخواست‌های تغییر</div>
          <div class="card-value" style="font-size:0.95rem;margin-bottom:0.75rem">وضعیت و تصمیم‌ها</div>
          <button class="btn btn-primary btn-sm" id="btn-export-cr" type="button">دانلود Excel</button>
        </div>

        <div class="card" style="cursor:default">
          <div class="card-title">سوابق آزمایشگاه</div>
          <div class="card-value" style="font-size:0.95rem;margin-bottom:0.75rem">فهرست سوابق</div>
          <button class="btn btn-primary btn-sm" id="btn-export-records" type="button">دانلود Excel</button>
        </div>
      </div>

      <div class="table-container mt-2" style="padding:1.1rem">
        <p class="text-muted" style="font-size:0.88rem;margin:0">
          فایل با فرمت CSV و پشتیبانی فارسی دانلود می‌شود. آن را با Microsoft Excel باز کنید.
          اگر دانلود انجام نشد، تنظیمات مسدودکننده دانلود مرورگر را بررسی کنید.
        </p>
      </div>
    `;

    document.getElementById('btn-export-docs')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.exportCurrentDocuments();
    });
    document.getElementById('btn-export-cr')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.exportChangeRequests();
    });
    document.getElementById('btn-export-records')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.exportRecords();
    });
  }
};

window.Export = Export;
