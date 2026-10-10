/**
 * Laboratory System - Export Module
 * خروجی CSV سازگار با Excel + پشتیبانی از xlsx در صورت وجود کتابخانه
 */

const Export = {
  /**
   * تبدیل آرایه اشیاء به CSV و دانلود
   */
  downloadCSV(data, filename = 'export.csv', headers = null) {
    if (!data || !data.length) {
      Utils.showToast('داده‌ای برای خروجی وجود ندارد', 'warning');
      return;
    }

    // تعیین هدرها
    const keys = headers || Object.keys(data[0]);
    const headerLabels = headers ? Object.values(headers) : keys;

    // ساخت CSV با BOM برای پشتیبانی فارسی در Excel
    let csv = '\uFEFF'; // BOM
    csv += headerLabels.map(h => this.escapeCSV(h)).join(',') + '\r\n';

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
    Utils.showToast('فایل CSV آماده دانلود شد', 'success');
  },

  escapeCSV(str) {
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * خروجی مدارک جاری
   */
  async exportCurrentDocuments() {
    await Documents.load();
    const docs = Documents.getCurrentDocuments();

    const data = docs.map(d => ({
      code: d.code,
      title: d.title,
      type: d.type,
      category: d.categoryName || d.category,
      revision: d.revision,
      status: Utils.statusLabel(d.status),
      effectiveDate: d.effectiveDate ? Utils.toPersianDate(d.effectiveDate) : '',
      preparedBy: d.preparedBy,
      reviewedBy: d.reviewedBy,
      approvedBy: d.approvedBy,
      filePath: d.filePath,
      description: d.description
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

    this.downloadCSV(data, `مدارک_جاری_${this.dateStamp()}.csv`, headers);
  },

  /**
   * خروجی درخواست‌های تغییر
   */
  async exportChangeRequests() {
    await Workflow.load();
    const data = Workflow.requests.map(r => ({
      id: r.id,
      documentCode: r.documentCode,
      documentTitle: r.documentTitle,
      currentRevision: r.currentRevision,
      requester: r.requesterName,
      createdAt: Utils.toPersianDate(r.createdAt),
      reason: r.reason,
      priority: r.priority,
      status: Utils.statusLabel(r.status),
      qualityDecision: r.qualityDecision ? (r.qualityDecision === 'approved' ? 'تأیید' : 'رد') : '',
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

    this.downloadCSV(data, `درخواست_تغییر_${this.dateStamp()}.csv`, headers);
  },

  /**
   * خروجی سوابق
   */
  async exportRecords() {
    await Records.load();
    const data = Records.records.map(r => ({
      title: r.title,
      path: r.path,
      type: r.type,
      relatedTo: r.relatedTo,
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

    this.downloadCSV(data, `سوابق_${this.dateStamp()}.csv`, headers);
  },

  dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  /**
   * رندر صفحه گزارش‌ها با دکمه‌های خروجی
   */
  renderReportsPage(container) {
    container.innerHTML = `
      <h2>گزارش‌ها و خروجی</h2>
      <p class="text-muted mb-2">خروجی‌ها به صورت CSV و سازگار با Microsoft Excel تولید می‌شوند (پشتیبانی کامل فارسی).</p>

      <div class="cards-grid">
        <div class="card">
          <div class="card-title">مدارک جاری</div>
          <div class="card-value" style="font-size:1rem;margin-bottom:0.75rem">فهرست کامل مدارک با وضعیت جاری</div>
          <button class="btn btn-primary btn-sm" id="btn-export-docs">دانلود Excel (CSV)</button>
        </div>

        <div class="card">
          <div class="card-title">درخواست‌های تغییر</div>
          <div class="card-value" style="font-size:1rem;margin-bottom:0.75rem">تمام درخواست‌ها با وضعیت و تصمیم‌ها</div>
          <button class="btn btn-primary btn-sm" id="btn-export-cr">دانلود Excel (CSV)</button>
        </div>

        <div class="card">
          <div class="card-title">سوابق آزمایشگاه</div>
          <div class="card-value" style="font-size:1rem;margin-bottom:0.75rem">فهرست سوابق ثبت‌شده</div>
          <button class="btn btn-primary btn-sm" id="btn-export-records">دانلود Excel (CSV)</button>
        </div>

        <div class="card" onclick="App.navigate('documents')">
          <div class="card-title">مشاهده مدارک</div>
          <div class="card-value" style="font-size:1rem">رفتن به فهرست</div>
        </div>
      </div>

      <div class="table-container mt-2" style="padding:1.25rem">
        <h3 class="mb-1">نکته</h3>
        <p class="text-muted" style="font-size:0.9rem;margin:0">
          فایل‌های CSV با کدگذاری UTF-8 و BOM تولید می‌شوند تا در Excel فارسی به‌درستی نمایش داده شوند.
          می‌توانید فایل را مستقیماً با Microsoft Excel باز کنید.
        </p>
      </div>
    `;

    document.getElementById('btn-export-docs')?.addEventListener('click', () => this.exportCurrentDocuments());
    document.getElementById('btn-export-cr')?.addEventListener('click', () => this.exportChangeRequests());
    document.getElementById('btn-export-records')?.addEventListener('click', () => this.exportRecords());
  }
};

window.Export = Export;
