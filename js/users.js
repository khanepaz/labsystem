/**
 * Laboratory System - User Management
 */

const Users = {
  async renderList(container) {
    if (!Auth.isSystemAdmin()) {
      container.innerHTML = `<p class="text-muted">دسترسی مجاز نیست.</p>`;
      return;
    }

    await Auth.loadUsers();

    container.innerHTML = `
      <div class="flex gap-2 mb-2" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">مدیریت کاربران</h2>
        <button class="btn btn-primary" id="btn-add-user">+ کاربر جدید</button>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>نام نمایشی</th>
              <th>نام کاربری</th>
              <th>نقش</th>
              <th>وضعیت</th>
              <th>تاریخ ایجاد</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
            ${this.renderRows(Auth.users)}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-add-user').onclick = () => this.openCreateForm();

    document.getElementById('users-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === 'toggle') await this.toggleActive(id);
      if (action === 'reset-password') await this.resetPassword(id);
    });
  },

  renderRows(users) {
    if (!users.length) {
      return `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">کاربری وجود ندارد</td></tr>`;
    }

    return users.map(u => `
      <tr>
        <td>${u.displayName}</td>
        <td>${u.username}</td>
        <td>${Auth.roles[u.role]?.name || u.role}</td>
        <td>
          <span class="status ${u.active !== false ? 'status-current' : 'status-obsolete'}">
            ${u.active !== false ? 'فعال' : 'غیرفعال'}
          </span>
        </td>
        <td>${Utils.toPersianDate(u.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline" data-action="toggle" data-id="${u.id}">
            ${u.active !== false ? 'غیرفعال کردن' : 'فعال کردن'}
          </button>
          <button class="btn btn-sm btn-outline" data-action="reset-password" data-id="${u.id}">
            تغییر رمز
          </button>
        </td>
      </tr>
    `).join('');
  },

  openCreateForm() {
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = 'ایجاد کاربر جدید';
    modalBody.innerHTML = `
      <div class="form-group">
        <label>نام نمایشی *</label>
        <input type="text" id="new-display" required>
      </div>
      <div class="form-group">
        <label>نام کاربری *</label>
        <input type="text" id="new-username" required>
      </div>
      <div class="form-group">
        <label>رمز عبور *</label>
        <input type="password" id="new-password" required minlength="6">
      </div>
      <div class="form-group">
        <label>نقش *</label>
        <select id="new-role" required>
          <option value="technical_manager">مدیر فنی</option>
          <option value="quality_manager">مدیر کیفیت</option>
          <option value="viewer">مشاهده‌کننده</option>
          <option value="system_admin">مدیر سیستم</option>
        </select>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn btn-primary" id="btn-save-user">ایجاد کاربر</button>
      <button class="btn btn-outline" id="btn-cancel-user">انصراف</button>
    `;

    Utils.show('modal-overlay');

    document.getElementById('btn-cancel-user').onclick = () => Utils.hide('modal-overlay');
    document.getElementById('modal-close').onclick = () => Utils.hide('modal-overlay');

    document.getElementById('btn-save-user').onclick = async () => {
      const displayName = document.getElementById('new-display').value.trim();
      const username = document.getElementById('new-username').value.trim();
      const password = document.getElementById('new-password').value;
      const role = document.getElementById('new-role').value;

      if (!displayName || !username || !password) {
        Utils.showToast('تمام فیلدها الزامی هستند', 'error');
        return;
      }
      if (password.length < 6) {
        Utils.showToast('رمز عبور حداقل ۶ کاراکتر باشد', 'error');
        return;
      }

      try {
        await Auth.createUser({ displayName, username, password, role });
        Utils.hide('modal-overlay');
        Utils.showToast('کاربر با موفقیت ایجاد شد', 'success');
        this.renderList(document.getElementById('content'));
      } catch (err) {
        Utils.showToast(err.message, 'error');
      }
    };
  },

  async toggleActive(userId) {
    await Auth.loadUsers();
    const user = Auth.users.find(u => u.id === userId);
    if (!user) return;

    if (user.id === Auth.currentUser.id) {
      Utils.showToast('نمی‌توانید حساب خودتان را غیرفعال کنید', 'error');
      return;
    }

    user.active = user.active === false ? true : false;
    await Storage.writeJSON('users.json', { users: Auth.users });
    Utils.showToast(user.active ? 'کاربر فعال شد' : 'کاربر غیرفعال شد', 'success');
    this.renderList(document.getElementById('content'));
  },

  async resetPassword(userId) {
    const newPass = prompt('رمز عبور جدید را وارد کنید (حداقل ۶ کاراکتر):');
    if (!newPass || newPass.length < 6) {
      if (newPass !== null) Utils.showToast('رمز عبور معتبر نیست', 'error');
      return;
    }

    await Auth.loadUsers();
    const user = Auth.users.find(u => u.id === userId);
    if (!user) return;

    user.passwordHash = await Auth.hashPassword(newPass);
    user.passwordChangedAt = Utils.nowISO();
    await Storage.writeJSON('users.json', { users: Auth.users });
    Utils.showToast('رمز عبور با موفقیت تغییر کرد', 'success');
  }
};

window.Users = Users;
