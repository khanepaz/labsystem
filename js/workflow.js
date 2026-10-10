/**
 * Laboratory System - Change Request Workflow
 * اصل حاکم: فقط مدیر سیستم پس از تأیید مدیر کیفیت می‌تواند تغییر نهایی را اعمال کند.
 */

const Workflow = {
  requests: [],
  history: [],

  async load() {
    const reqData = await Storage.readJSON('change-requests.json');
    const histData = await Storage.readJSON('workflow-history.json');
    this.requests = reqData?.requests || [];
    this.history = histData?.events || [];
    return this.requests;
  },

  async saveRequests() {
    await Storage.writeJSON('change-requests.json', { requests: this.requests });
  },

  async saveHistory() {
    await Storage.writeJSON('workflow-history.json', { events: this.history });
  },

  async addHistoryEvent(event) {
    const fullEvent = {
      id: Utils.generateId('evt'),
      timestamp: Utils.nowISO(),
      userId: Auth.currentUser?.id,
      userName: Auth.currentUser?.displayName,
      ...event
    };
    this.history.unshift(fullEvent);
    await this.saveHistory();
    return fullEvent;
  },

  getById(id) {
    return this.requests.find(r => r.id === id);
  },

  getPendingReview() {
    return this.requests.filter(r => r.status === 'pending_review');
  },

  getReadyForAction() {
    return this.requests.filter(r => 
      r.status === 'approved' || r.status === 'ready_to_publish'
    );
  },

  getMyRequests() {
    return this.requests.filter(r => r.requesterId === Auth.currentUser?.id);
  },

  /**
   * باز کردن فرم ایجاد درخواست اصلاح
   */
  async openCreateRequest(documentId) {
    await Documents.load();
    const doc = Documents.getById(documentId);
    if (!doc) {
      Utils.showToast('مدرک یافت نشد', 'error');
      return;
    }

    if (doc.status !== 'current') {
      Utils.showToast('فقط برای مدارک جاری می‌توان درخواست اصلاح ثبت کرد', 'error');
      return;
    }

    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'ثبت درخواست اصلاح مدرک';
    modalBody.innerHTML = `
      <div class="form-group">
        <label>مدرک</label>
        <input type="text" value="${doc.code} — ${doc.title} (ویرایش ${doc.revision})" disabled>
      </div>
      <div class="form-group">
        <label>علت درخواست *</label>
        <select id="cr-reason" required>
          <option value="">انتخاب کنید...</option>
          <option value="اصلاح محتوا">اصلاح محتوا</option>
          <option value="به‌روزرسانی استاندارد">به‌روزرسانی استاندارد</option>
          <option value="تغییر فرآیند">تغییر فرآیند</option>
          <option value="خطا در نسخه جاری">خطا در نسخه جاری</option>
          <option value="درخواست مشتری / ممیزی">درخواست مشتری / ممیزی</option>
          <option value="سایر">سایر</option>
        </select>
      </div>
      <div class="form-group">
        <label>شرح دقیق تغییر پیشنهادی *</label>
        <textarea id="cr-description" rows="4" required placeholder="توضیح دهید چه تغییری و چرا لازم است..."></textarea>
      </div>
      <div class="form-group">
        <label>میزان فوریت</label>
        <select id="cr-priority">
          <option value="normal">عادی</option>
          <option value="high">بالا</option>
          <option value="urgent">فوری</option>
        </select>
      </div>
      <div class="form-group">
        <label>توضیحات تکمیلی</label>
        <textarea id="cr-notes" rows="2"></textarea>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn btn-primary" id="btn-submit-cr">ثبت و ارسال برای بررسی</button>
      <button class="btn btn-outline" id="btn-cancel-modal">انصراف</button>
    `;

    Utils.show('modal-overlay');

    document.getElementById('btn-cancel-modal').onclick = () => Utils.hide('modal-overlay');
    document.getElementById('modal-close').onclick = () => Utils.hide('modal-overlay');

    document.getElementById('btn-submit-cr').onclick = async () => {
      const reason = document.getElementById('cr-reason').value;
      const description = document.getElementById('cr-description').value.trim();
      const priority = document.getElementById('cr-priority').value;
      const notes = document.getElementById('cr-notes').value.trim();

      if (!reason || !description) {
        Utils.showToast('علت و شرح تغییر الزامی است', 'error');
        return;
      }

      try {
        await this.createRequest({
          documentId: doc.id,
          documentCode: doc.code,
          documentTitle: doc.title,
          currentRevision: doc.revision,
          reason,
          description,
          priority,
          notes
        });
        Utils.hide('modal-overlay');
        Utils.showToast('درخواست با موفقیت ثبت و برای مدیر کیفیت ارسال شد', 'success');
        App.navigate('change-requests');
      } catch (err) {
        Utils.showToast(err.message, 'error');
      }
    };
  },

  async createRequest(data) {
    await this.load();

    const request = {
      id: Utils.generateId('cr'),
      documentId: data.documentId,
      documentCode: data.documentCode,
      documentTitle: data.documentTitle,
      currentRevision: data.currentRevision,
      requesterId: Auth.currentUser.id,
      requesterName: Auth.currentUser.displayName,
      createdAt: Utils.nowISO(),
      reason: data.reason,
      description: data.description,
      priority: data.priority || 'normal',
      notes: data.notes || '',
      status: 'pending_review',
      // فیلدهای بعدی
      qualityDecision: null,
      qualityDecisionAt: null,
      qualityDecisionBy: null,
      qualityComment: null,
      systemActionAt: null,
      systemActionBy: null,
      newRevision: null,
      publishedAt: null
    };

    this.requests.unshift(request);
    await this.saveRequests();

    await this.addHistoryEvent({
      type: 'request_created',
      requestId: request.id,
      documentId: data.documentId,
      fromStatus: null,
      toStatus: 'pending_review',
      comment: data.description
    });

    return request;
  },

  /**
   * رندر لیست درخواست‌ها بر اساس نقش
   */
  async renderList(container) {
    await this.load();

    const role = Auth.currentUser.role;
    let list = [];
    let title = 'درخواست‌های تغییر';

    if (role === 'quality_manager' || role === 'system_admin') {
      list = this.requests;
    } else if (role === 'technical_manager') {
      list = this.getMyRequests();
      title = 'درخواست‌های من';
    } else {
      list = [];
    }

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">${title}</h2>
        <select id="cr-filter">
          <option value="all">همه وضعیت‌ها</option>
          <option value="pending_review">در انتظار بررسی</option>
          <option value="approved">تأیید شده</option>
          <option value="rejected">رد شده</option>
          <option value="ready_to_publish">آماده انتشار</option>
          <option value="completed">تکمیل شده</option>
        </select>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>شناسه</th>
              <th>مدرک</th>
              <th>درخواست‌دهنده</th>
              <th>تاریخ</th>
              <th>فوریت</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody id="cr-tbody">
            ${this.renderRequestRows(list)}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('cr-filter')?.addEventListener('change', (e) => {
      let filtered = list;
      if (e.target.value !== 'all') {
        filtered = list.filter(r => r.status === e.target.value);
      }
      document.getElementById('cr-tbody').innerHTML = this.renderRequestRows(filtered);
    });

    document.getElementById('cr-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'view') this.showRequestDetail(id);
      if (action === 'approve') this.decideRequest(id, 'approved');
      if (action === 'reject') this.decideRequest(id, 'rejected');
      if (action === 'publish') this.openPublishAction(id);
    });
  },

  renderRequestRows(list) {
    if (!list.length) {
      return `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">درخواستی وجود ندارد</td></tr>`;
    }

    return list.map(r => {
      const canReview = (Auth.isQualityManager() || Auth.isSystemAdmin()) && r.status === 'pending_review';
      // درخواست‌دهنده نمی‌تواند خودش را تأیید کند
      const isSelf = r.requesterId === Auth.currentUser?.id;
      const showReviewBtns = canReview && !isSelf;

      const canPublish = Auth.isSystemAdmin() && (r.status === 'approved' || r.status === 'ready_to_publish');

      return `
        <tr>
          <td style="font-size:0.85rem">${r.id.substring(0, 12)}...</td>
          <td>${r.documentCode}<br><small class="text-muted">${r.documentTitle}</small></td>
          <td>${r.requesterName}</td>
          <td>${Utils.toPersianDate(r.createdAt)}</td>
          <td>${r.priority === 'urgent' ? 'فوری' : r.priority === 'high' ? 'بالا' : 'عادی'}</td>
          <td><span class="status ${Utils.statusClass(r.status)}">${Utils.statusLabel(r.status)}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" data-action="view" data-id="${r.id}">جزئیات</button>
            ${showReviewBtns ? `
              <button class="btn btn-sm btn-success" data-action="approve" data-id="${r.id}">تأیید</button>
              <button class="btn btn-sm btn-danger" data-action="reject" data-id="${r.id}">رد</button>
            ` : ''}
            ${canPublish ? `
              <button class="btn btn-sm btn-primary" data-action="publish" data-id="${r.id}">اعمال تغییر</button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  },

  async showRequestDetail(requestId) {
    await this.load();
    const r = this.getById(requestId);
    if (!r) return;

    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="flex gap-2 mb-2" style="align-items:center">
        <button class="btn btn-outline btn-sm" id="btn-back-cr">← بازگشت</button>
        <h2 style="margin:0">جزئیات درخواست تغییر</h2>
      </div>

      <div class="table-container" style="padding:1.25rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <div><strong>شناسه درخواست:</strong> ${r.id}</div>
          <div><strong>وضعیت:</strong> <span class="status ${Utils.statusClass(r.status)}">${Utils.statusLabel(r.status)}</span></div>
          <div><strong>مدرک:</strong> ${r.documentCode} — ${r.documentTitle}</div>
          <div><strong>ویرایش جاری:</strong> ${r.currentRevision}</div>
          <div><strong>درخواست‌دهنده:</strong> ${r.requesterName}</div>
          <div><strong>تاریخ ثبت:</strong> ${Utils.toPersianDate(r.createdAt)}</div>
          <div><strong>علت:</strong> ${r.reason}</div>
          <div><strong>فوریت:</strong> ${r.priority}</div>
          <div style="grid-column:1/-1"><strong>شرح تغییر:</strong><br>${r.description}</div>
          ${r.notes ? `<div style="grid-column:1/-1"><strong>توضیحات:</strong> ${r.notes}</div>` : ''}
          ${r.qualityDecision ? `
            <div><strong>تصمیم مدیر کیفیت:</strong> ${r.qualityDecision === 'approved' ? 'تأیید' : 'رد'}</div>
            <div><strong>تاریخ تصمیم:</strong> ${Utils.toPersianDate(r.qualityDecisionAt)}</div>
            <div style="grid-column:1/-1"><strong>توضیح تصمیم:</strong> ${r.qualityComment || '—'}</div>
          ` : ''}
        </div>
      </div>
    `;

    document.getElementById('btn-back-cr')?.addEventListener('click', () => {
      App.navigate('change-requests');
    });
  },

  async decideRequest(requestId, decision) {
    const r = this.getById(requestId);
    if (!r || r.status !== 'pending_review') {
      Utils.showToast('این درخواست قابل بررسی نیست', 'error');
      return;
    }

    if (r.requesterId === Auth.currentUser.id) {
      Utils.showToast('شما نمی‌توانید درخواست خودتان را تأیید یا رد کنید', 'error');
      return;
    }

    const comment = prompt(decision === 'approved' ? 
      'توضیح تأیید (اختیاری):' : 
      'علت رد (الزامی):');

    if (decision === 'rejected' && (!comment || !comment.trim())) {
      Utils.showToast('برای رد درخواست باید علت را وارد کنید', 'error');
      return;
    }

    r.status = decision === 'approved' ? 'approved' : 'rejected';
    r.qualityDecision = decision;
    r.qualityDecisionAt = Utils.nowISO();
    r.qualityDecisionBy = Auth.currentUser.id;
    r.qualityDecisionByName = Auth.currentUser.displayName;
    r.qualityComment = comment || '';

    await this.saveRequests();

    await this.addHistoryEvent({
      type: decision === 'approved' ? 'request_approved' : 'request_rejected',
      requestId: r.id,
      documentId: r.documentId,
      fromStatus: 'pending_review',
      toStatus: r.status,
      comment: comment || ''
    });

    Utils.showToast(decision === 'approved' ? 
      'درخواست تأیید شد. اکنون مدیر سیستم می‌تواند اقدام کند.' : 
      'درخواست رد شد.', decision === 'approved' ? 'success' : 'warning');

    this.renderList(document.getElementById('content'));
  },

  /**
   * اقدام نهایی فقط توسط مدیر سیستم
   */
  async openPublishAction(requestId) {
    if (!Auth.isSystemAdmin()) {
      Utils.showToast('فقط مدیر سیستم می‌تواند تغییر نهایی را اعمال کند', 'error');
      return;
    }

    const r = this.getById(requestId);
    if (!r || (r.status !== 'approved' && r.status !== 'ready_to_publish')) {
      Utils.showToast('این درخواست آماده اقدام نیست', 'error');
      return;
    }

    const newRevision = prompt('شماره ویرایش جدید را وارد کنید:', (parseInt(r.currentRevision) || 0) + 1);
    if (!newRevision) return;

    const confirmed = Utils.confirm(
      `آیا از انتشار نسخه جدید مطمئن هستید؟\n\n` +
      `مدرک: ${r.documentCode}\n` +
      `ویرایش فعلی: ${r.currentRevision} → ویرایش جدید: ${newRevision}\n\n` +
      `نسخه قبلی به وضعیت «منسوخ» منتقل خواهد شد.`
    );
    if (!confirmed) return;

    try {
      await this.publishNewVersion(r, newRevision);
      Utils.showToast('نسخه جدید با موفقیت منتشر شد', 'success');
      App.navigate('change-requests');
    } catch (err) {
      Utils.showToast(err.message, 'error');
    }
  },

  async publishNewVersion(request, newRevision) {
    await Documents.load();
    const doc = Documents.getById(request.documentId);
    if (!doc) throw new Error('مدرک یافت نشد');

    // ۱. نسخه قبلی را منسوخ کن
    const oldVersion = {
      id: Utils.generateId('ver'),
      documentId: doc.id,
      revision: doc.revision,
      status: 'obsolete',
      effectiveDate: doc.effectiveDate,
      obsoleteDate: Utils.nowISO(),
      changeReason: request.reason,
      changeRequestId: request.id,
      replacedByRevision: newRevision
    };
    Documents.versions.push(oldVersion);

    // ۲. به‌روزرسانی مدرک جاری
    doc.revision = String(newRevision);
    doc.status = 'current';
    doc.effectiveDate = Utils.nowISO();
    doc.approvalDate = Utils.nowISO();
    doc.lastChangeRequestId = request.id;
    doc.updatedAt = Utils.nowISO();

    // ۳. ثبت نسخه جدید
    Documents.versions.push({
      id: Utils.generateId('ver'),
      documentId: doc.id,
      revision: String(newRevision),
      status: 'current',
      effectiveDate: Utils.nowISO(),
      changeReason: request.reason,
      changeRequestId: request.id,
      createdAt: Utils.nowISO()
    });

    await Documents.saveDocuments();
    await Documents.saveVersions();

    // ۴. به‌روزرسانی درخواست
    request.status = 'completed';
    request.newRevision = String(newRevision);
    request.publishedAt = Utils.nowISO();
    request.systemActionAt = Utils.nowISO();
    request.systemActionBy = Auth.currentUser.id;
    request.systemActionByName = Auth.currentUser.displayName;

    await this.saveRequests();

    await this.addHistoryEvent({
      type: 'version_published',
      requestId: request.id,
      documentId: doc.id,
      fromStatus: request.status,
      toStatus: 'completed',
      comment: `انتشار ویرایش ${newRevision}`
    });
  }
};

window.Workflow = Workflow;
