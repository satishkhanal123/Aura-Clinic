/* ============================================================
   AURA CLINIC — STAFF MANAGEMENT MODULE
   frontend/js/modules/staff.js

   Purpose:
   - Manage clinic staff profiles.
   - Enforce mandatory profile pictures.
   - Generate unique Staff IDs.
   - Manage roles, departments, status, and contact details.
   - Store staff records in IndexedDB.
   - Support profile preview, editing, and deactivation.
============================================================ */

(function () {
  'use strict';

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE || window.AURA?.storage;
  const EVENTS = window.AURA_EVENTS || window.AURA?.events;
  const UTILS = window.AURA_UTILS || window.AURA?.utils;
  const APP = window.AURA_APP || window.AURA?.app;

  const MODULE_NAME = 'staff';
  const STORE = 'staff';
  const AUDIT_STORE = 'auditLogs';

  const ROLES = [
    {
      id: 'administrator',
      label: 'Administrator',
      description: 'Full system administration and configuration access.'
    },
    {
      id: 'receptionist',
      label: 'Receptionist',
      description: 'Registration, appointments, queue, and front-desk operations.'
    },
    {
      id: 'nurse',
      label: 'Nurse',
      description: 'Vitals, pre-consultation, and nursing workflow.'
    },
    {
      id: 'doctor',
      label: 'Doctor',
      description: 'Consultation, diagnosis, prescriptions, and clinical records.'
    },
    {
      id: 'laboratory',
      label: 'Laboratory Staff',
      description: 'Laboratory orders, specimen processing, and result verification.'
    },
    {
      id: 'pathology',
      label: 'Pathology Staff',
      description: 'Pathology and diagnostic workflow management.'
    },
    {
      id: 'pharmacy',
      label: 'Pharmacy Staff',
      description: 'Prescription dispensing and pharmacy inventory operations.'
    },
    {
      id: 'cashier',
      label: 'Cashier',
      description: 'Invoices, payments, refunds, and financial collection.'
    },
    {
      id: 'manager',
      label: 'Clinic Manager',
      description: 'Operational oversight, reports, and staff coordination.'
    }
  ];

  const DEPARTMENTS = [
    'Administration',
    'Reception',
    'Nursing',
    'General Medicine',
    'Pediatrics',
    'Laboratory',
    'Pathology',
    'Radiology',
    'Pharmacy',
    'Billing',
    'Management'
  ];

  const STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    ON_LEAVE: 'on-leave'
  };

  const state = {
    staff: [],
    filteredStaff: [],
    searchTerm: '',
    roleFilter: 'all',
    departmentFilter: 'all',
    statusFilter: 'active',
    selectedStaff: null,
    isLoading: false,
    isSaving: false
  };

  /* ------------------------------------------------------------
     Helpers
  ------------------------------------------------------------ */

  function safe(value) {
    if (UTILS?.escapeHtml) {
      return UTILS.escapeHtml(String(value ?? ''));
    }

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createId(prefix = 'id') {
    if (UTILS?.createId) return UTILS.createId(prefix);

    return `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }

  function generateStaffId() {
    if (UTILS?.generateStaffId) {
      return UTILS.generateStaffId();
    }

    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);

    return `AURA-${year}-${random}`;
  }

  function getTimestamp() {
    return new Date().toISOString();
  }

  function getInitials(staff) {
    const name = getStaffName(staff);

    if (UTILS?.initials) return UTILS.initials(name);

    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'ST';
  }

  function getStaffName(staff) {
    if (!staff) return 'Unknown Staff';

    return [
      staff.firstName,
      staff.middleName,
      staff.lastName
    ]
      .filter(Boolean)
      .join(' ') || staff.name || 'Unknown Staff';
  }

  function getRoleLabel(roleId) {
    return (
      ROLES.find((role) => role.id === roleId)?.label ||
      roleId ||
      'Unassigned'
    );
  }

  function getDepartmentLabel(department) {
    return department || 'Unassigned';
  }

  function getStatusLabel(status) {
    const labels = {
      active: 'Active',
      inactive: 'Inactive',
      suspended: 'Suspended',
      'on-leave': 'On Leave'
    };

    return labels[status] || status || 'Active';
  }

  function getStatusClass(status) {
    const classes = {
      active: 'status-success',
      inactive: 'status-neutral',
      suspended: 'status-danger',
      'on-leave': 'status-warning'
    };

    return classes[status] || 'status-neutral';
  }

  function getRoleIcon(roleId) {
    const icons = {
      administrator: 'shield-check',
      receptionist: 'clipboard-list',
      nurse: 'heart-pulse',
      doctor: 'stethoscope',
      laboratory: 'flask-conical',
      pathology: 'microscope',
      pharmacy: 'pill',
      cashier: 'wallet',
      manager: 'briefcase-business'
    };

    return icons[roleId] || 'user-round';
  }

  function getAvatarMarkup(staff, size = 'medium') {
    const name = getStaffName(staff);
    const photo = staff?.profilePicture || staff?.avatar || '';

    if (photo) {
      return `
        <div class="staff-avatar staff-avatar--${safe(size)}">
          <img src="${safe(photo)}" alt="${safe(name)}" loading="lazy">
        </div>
      `;
    }

    return `
      <div class="staff-avatar staff-avatar--${safe(size)} staff-avatar--initials">
        ${safe(getInitials(staff))}
      </div>
    `;
  }

  function toast(message, type = 'success') {
    if (APP?.toast) {
      APP.toast({
        type,
        title: type === 'error' ? 'Staff Management Error' : 'Staff Management',
        message
      });
      return;
    }

    if (window.AURA?.toast) {
      window.AURA.toast({
        type,
        title: type === 'error' ? 'Staff Management Error' : 'Staff Management',
        message
      });
      return;
    }

    console.log(`[AURA Staff] ${message}`);
  }

  function openModal(options = {}) {
    if (APP?.modal) {
      APP.modal(options);
      return;
    }

    if (window.AURA?.modal) {
      window.AURA.modal(options);
      return;
    }

    createFallbackModal(options);
  }

  function closeModal() {
    const fallback = document.querySelector('[data-aura-fallback-modal]');

    if (fallback) fallback.remove();

    document.querySelectorAll('[data-modal-close]').forEach((button) => {
      button.click();
    });
  }

  function createFallbackModal({
    title = 'AURA Clinic',
    content = '',
    size = 'large',
    footer = ''
  }) {
    closeModal();

    const modal = document.createElement('div');

    modal.setAttribute('data-aura-fallback-modal', 'true');

    modal.innerHTML = `
      <div class="modal-backdrop" data-modal-close></div>

      <div class="modal-shell modal-shell--${safe(size)}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <p class="eyebrow">AURA CLINIC</p>
            <h2>${safe(title)}</h2>
          </div>

          <button type="button" class="icon-button" data-modal-close aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div class="modal-body">${content}</div>

        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-modal-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function emit(name, detail) {
    try {
      EVENTS?.emit?.(name, detail);
    } catch (error) {
      console.warn('[AURA Staff] Event emit failed:', error);
    }

    try {
      document.dispatchEvent(
        new CustomEvent(`aura:${name}`, {
          detail
        })
      );
    } catch (error) {
      console.warn('[AURA Staff] DOM event failed:', error);
    }
  }

  function audit(action, entityId, metadata = {}) {
    if (!STORAGE) return;

    STORAGE.add(AUDIT_STORE, {
      id: createId('audit'),
      action,
      entity: 'staff',
      entityId,
      module: MODULE_NAME,
      metadata,
      createdAt: getTimestamp()
    }).catch((error) => {
      console.warn('[AURA Staff] Audit log failed:', error);
    });
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizePhone(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function validatePhone(phone) {
    if (!phone) return true;

    return /^[0-9+\-\s()]{7,20}$/.test(phone);
  }

  function validateEmail(email) {
    if (!email) return true;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateProfilePicture(profilePicture) {
    return Boolean(profilePicture && String(profilePicture).trim());
  }

  function validateStaff(data, editingId = null) {
    const errors = [];

    if (!String(data.firstName || '').trim()) {
      errors.push('First name is required.');
    }

    if (!String(data.lastName || '').trim()) {
      errors.push('Last name is required.');
    }

    if (!data.role) {
      errors.push('Staff role is required.');
    }

    if (!data.department) {
      errors.push('Department is required.');
    }

    if (!validateProfilePicture(data.profilePicture)) {
      errors.push('A profile picture is mandatory for every staff account.');
    }

    if (data.email && !validateEmail(data.email)) {
      errors.push('Enter a valid email address.');
    }

    if (data.phone && !validatePhone(data.phone)) {
      errors.push('Enter a valid phone number.');
    }

    const duplicateEmail = state.staff.find((staff) => {
      return (
        staff.id !== editingId &&
        normalizeEmail(staff.email) &&
        normalizeEmail(staff.email) === normalizeEmail(data.email)
      );
    });

    if (duplicateEmail) {
      errors.push('A staff member with this email already exists.');
    }

    return errors;
  }

  /* ------------------------------------------------------------
     Data Loading
  ------------------------------------------------------------ */

  async function loadData() {
    state.isLoading = true;

    try {
      const records = await STORAGE?.getAll?.(STORE);

      state.staff = Array.isArray(records) ? records : [];

      applyFilters();
    } catch (error) {
      console.error('[AURA Staff] Failed to load staff:', error);
      toast('Unable to load staff records.', 'error');
    } finally {
      state.isLoading = false;
    }
  }

  /* ------------------------------------------------------------
     Filtering and Statistics
  ------------------------------------------------------------ */

  function matchesSearch(staff) {
    const term = state.searchTerm.trim().toLowerCase();

    if (!term) return true;

    const haystack = [
      staff.staffId,
      staff.firstName,
      staff.middleName,
      staff.lastName,
      staff.name,
      staff.email,
      staff.phone,
      staff.role,
      getRoleLabel(staff.role),
      staff.department
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  }

  function applyFilters() {
    state.filteredStaff = state.staff
      .filter((staff) => matchesSearch(staff))
      .filter((staff) => {
        if (state.roleFilter === 'all') return true;
        return staff.role === state.roleFilter;
      })
      .filter((staff) => {
        if (state.departmentFilter === 'all') return true;
        return staff.department === state.departmentFilter;
      })
      .filter((staff) => {
        if (state.statusFilter === 'all') return true;
        return (staff.status || STATUS.ACTIVE) === state.statusFilter;
      })
      .sort((a, b) => {
        const first = getStaffName(a).localeCompare(getStaffName(b));
        return first;
      });
  }

  function getStats() {
    const active = state.staff.filter(
      (staff) => (staff.status || STATUS.ACTIVE) === STATUS.ACTIVE
    );

    const inactive = state.staff.filter(
      (staff) => (staff.status || STATUS.ACTIVE) === STATUS.INACTIVE
    );

    const onLeave = state.staff.filter(
      (staff) => (staff.status || STATUS.ACTIVE) === STATUS.ON_LEAVE
    );

    const doctors = active.filter((staff) => staff.role === 'doctor');
    const nurses = active.filter((staff) => staff.role === 'nurse');

    return {
      total: state.staff.length,
      active: active.length,
      inactive: inactive.length,
      onLeave: onLeave.length,
      doctors: doctors.length,
      nurses: nurses.length
    };
  }

  /* ------------------------------------------------------------
     Staff CRUD
  ------------------------------------------------------------ */

  function normalizeStaffData(data = {}, existing = null) {
    const now = getTimestamp();

    return {
      id: existing?.id || data.id || createId('staff'),
      staffId: existing?.staffId || data.staffId || generateStaffId(),

      firstName: String(data.firstName || '').trim(),
      middleName: String(data.middleName || '').trim(),
      lastName: String(data.lastName || '').trim(),

      name: [
        data.firstName,
        data.middleName,
        data.lastName
      ]
        .filter(Boolean)
        .join(' ')
        .trim(),

      gender: data.gender || '',
      dateOfBirth: data.dateOfBirth || '',
      profilePicture: data.profilePicture || '',

      role: data.role || '',
      department: data.department || '',
      designation: data.designation || '',

      email: normalizeEmail(data.email),
      phone: normalizePhone(data.phone),
      alternatePhone: normalizePhone(data.alternatePhone),

      employeeCode: data.employeeCode || '',
      qualification: data.qualification || '',
      registrationNumber: data.registrationNumber || '',

      joiningDate: data.joiningDate || '',
      employmentType: data.employmentType || 'Full-time',

      status: data.status || existing?.status || STATUS.ACTIVE,

      username: data.username || '',
      authUserId: data.authUserId || '',

      emergencyContactName: data.emergencyContactName || '',
      emergencyContactPhone: normalizePhone(data.emergencyContactPhone),

      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      postalCode: data.postalCode || '',

      notes: data.notes || '',

      permissions: Array.isArray(data.permissions)
        ? data.permissions
        : existing?.permissions || [],

      lastLoginAt: existing?.lastLoginAt || data.lastLoginAt || null,

      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || data.createdBy || 'system'
    };
  }

  async function createStaff(data = {}) {
    if (!STORAGE) {
      throw new Error('IndexedDB storage is unavailable.');
    }

    const normalized = normalizeStaffData(data);

    const errors = validateStaff(normalized);

    if (errors.length) {
      throw new Error(errors.join(' '));
    }

    await STORAGE.add(STORE, normalized);

    state.staff.push(normalized);
    applyFilters();

    audit('create', normalized.id, {
      staffId: normalized.staffId,
      role: normalized.role,
      department: normalized.department
    });

    emit('staff-created', normalized);

    try {
      EVENTS?.staffCreated?.(normalized);
    } catch (_) {}

    return normalized;
  }

  async function updateStaff(id, changes = {}) {
    if (!STORAGE) {
      throw new Error('IndexedDB storage is unavailable.');
    }

    const existing = state.staff.find((staff) => staff.id === id);

    if (!existing) {
      throw new Error('Staff member not found.');
    }

    const normalized = normalizeStaffData(
      {
        ...existing,
        ...changes
      },
      existing
    );

    const errors = validateStaff(normalized, id);

    if (errors.length) {
      throw new Error(errors.join(' '));
    }

    await STORAGE.put(STORE, normalized);

    const index = state.staff.findIndex((staff) => staff.id === id);

    if (index !== -1) {
      state.staff[index] = normalized;
    }

    applyFilters();

    audit('update', id, {
      staffId: normalized.staffId,
      role: normalized.role
    });

    emit('staff-updated', normalized);

    return normalized;
  }

  async function updateStaffStatus(id, status) {
    const validStatuses = Object.values(STATUS);

    if (!validStatuses.includes(status)) {
      throw new Error('Invalid staff status.');
    }

    const staff = await updateStaff(id, {
      status
    });

    toast(`${getStaffName(staff)} is now ${getStatusLabel(status)}.`);

    return staff;
  }

  async function removeStaff(id) {
    if (!STORAGE) {
      throw new Error('IndexedDB storage is unavailable.');
    }

    const staff = state.staff.find((item) => item.id === id);

    if (!staff) {
      throw new Error('Staff member not found.');
    }

    await STORAGE.remove(STORE, id);

    state.staff = state.staff.filter((item) => item.id !== id);
    applyFilters();

    audit('delete', id, {
      staffId: staff.staffId,
      name: getStaffName(staff)
    });

    emit('staff-deleted', staff);

    return staff;
  }

  function getStaffById(id) {
    return state.staff.find((staff) => staff.id === id) || null;
  }

  function getStaffByRole(role) {
    return state.staff.filter(
      (staff) =>
        staff.role === role &&
        (staff.status || STATUS.ACTIVE) === STATUS.ACTIVE
    );
  }

  function getActiveStaff() {
    return state.staff.filter(
      (staff) => (staff.status || STATUS.ACTIVE) === STATUS.ACTIVE
    );
  }

  /* ------------------------------------------------------------
     Profile Picture Handling
  ------------------------------------------------------------ */

  function readProfilePicture(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }

      if (!file.type.startsWith('image/')) {
        reject(new Error('Please select an image file.'));
        return;
      }

      const maxSize = 5 * 1024 * 1024;

      if (file.size > maxSize) {
        reject(new Error('Profile picture must be smaller than 5 MB.'));
        return;
      }

      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read image file.'));

      reader.readAsDataURL(file);
    });
  }

  function bindProfilePicturePreview(form) {
    const input = form.querySelector('[data-profile-picture-input]');
    const preview = form.querySelector('[data-profile-picture-preview]');
    const hiddenInput = form.querySelector('[name="profilePicture"]');

    if (!input || !preview) return;

    input.addEventListener('change', async () => {
      const file = input.files?.[0];

      if (!file) return;

      try {
        const imageData = await readProfilePicture(file);

        preview.innerHTML = `
          <img src="${safe(imageData)}" alt="Profile picture preview">
        `;

        if (hiddenInput) {
          hiddenInput.value = imageData;
        }
      } catch (error) {
        input.value = '';
        toast(error.message, 'error');
      }
    });
  }

  /* ------------------------------------------------------------
     Staff Form
  ------------------------------------------------------------ */

  function openStaffForm(staffId = null) {
    const existing = staffId ? getStaffById(staffId) : null;
    const editing = Boolean(existing);

    const staff = existing || {
      firstName: '',
      middleName: '',
      lastName: '',
      gender: '',
      dateOfBirth: '',
      profilePicture: '',
      role: '',
      department: '',
      designation: '',
      email: '',
      phone: '',
      alternatePhone: '',
      employeeCode: '',
      qualification: '',
      registrationNumber: '',
      joiningDate: '',
      employmentType: 'Full-time',
      status: STATUS.ACTIVE,
      username: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      notes: ''
    };

    const content = `
      <form id="staff-form" class="aura-form">
        <input type="hidden" name="id" value="${safe(staff.id || '')}">
        <input type="hidden" name="profilePicture" value="${safe(staff.profilePicture || '')}">

        <div class="staff-form-hero">
          <div class="staff-profile-upload">
            <div class="staff-profile-upload__preview" data-profile-picture-preview>
              ${
                staff.profilePicture
                  ? `<img src="${safe(staff.profilePicture)}" alt="${safe(getStaffName(staff))}">`
                  : `<i data-lucide="user-round"></i>`
              }
            </div>

            <label class="btn btn-secondary btn-sm staff-profile-upload__button">
              <i data-lucide="camera"></i>
              Choose Photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                data-profile-picture-input
                hidden
              >
            </label>

            <p class="field-help">
              Required. JPG, PNG, or WebP. Maximum size 5 MB.
            </p>
          </div>

          <div class="staff-form-hero__content">
            <span class="eyebrow">${editing ? 'EDIT STAFF PROFILE' : 'NEW STAFF PROFILE'}</span>
            <h3>${editing ? safe(getStaffName(staff)) : 'Create Staff Account'}</h3>
            <p>
              Every staff account must have a profile picture before it can be saved.
            </p>

            ${
              editing
                ? `
                  <div class="staff-form-meta">
                    <span class="staff-id-chip">
                      <i data-lucide="badge-check"></i>
                      ${safe(staff.staffId || 'Staff ID pending')}
                    </span>
                  </div>
                `
                : ''
            }
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Personal Information</h4>
              <p>Basic identity and contact information.</p>
            </div>
          </div>

          <div class="form-grid form-grid--three">
            <label class="field">
              <span>First Name *</span>
              <input
                type="text"
                name="firstName"
                value="${safe(staff.firstName)}"
                autocomplete="given-name"
                required
              >
            </label>

            <label class="field">
              <span>Middle Name</span>
              <input
                type="text"
                name="middleName"
                value="${safe(staff.middleName)}"
                autocomplete="additional-name"
              >
            </label>

            <label class="field">
              <span>Last Name *</span>
              <input
                type="text"
                name="lastName"
                value="${safe(staff.lastName)}"
                autocomplete="family-name"
                required
              >
            </label>

            <label class="field">
              <span>Gender</span>
              <select name="gender">
                <option value="">Select gender</option>
                <option value="male" ${staff.gender === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${staff.gender === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${staff.gender === 'other' ? 'selected' : ''}>Other</option>
                <option value="prefer-not-to-say" ${staff.gender === 'prefer-not-to-say' ? 'selected' : ''}>Prefer not to say</option>
              </select>
            </label>

            <label class="field">
              <span>Date of Birth</span>
              <input
                type="date"
                name="dateOfBirth"
                value="${safe(staff.dateOfBirth)}"
              >
            </label>

            <label class="field">
              <span>Employment Type</span>
              <select name="employmentType">
                <option value="Full-time" ${staff.employmentType === 'Full-time' ? 'selected' : ''}>Full-time</option>
                <option value="Part-time" ${staff.employmentType === 'Part-time' ? 'selected' : ''}>Part-time</option>
                <option value="Contract" ${staff.employmentType === 'Contract' ? 'selected' : ''}>Contract</option>
                <option value="Visiting" ${staff.employmentType === 'Visiting' ? 'selected' : ''}>Visiting</option>
              </select>
            </label>

            <label class="field">
              <span>Primary Phone</span>
              <input
                type="tel"
                name="phone"
                value="${safe(staff.phone)}"
                autocomplete="tel"
                placeholder="+91 98765 43210"
              >
            </label>

            <label class="field">
              <span>Alternate Phone</span>
              <input
                type="tel"
                name="alternatePhone"
                value="${safe(staff.alternatePhone)}"
                autocomplete="tel"
              >
            </label>

            <label class="field">
              <span>Email Address</span>
              <input
                type="email"
                name="email"
                value="${safe(staff.email)}"
                autocomplete="email"
              >
            </label>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Professional Assignment</h4>
              <p>Define the staff member's role, department, and credentials.</p>
            </div>
          </div>

          <div class="form-grid form-grid--three">
            <label class="field">
              <span>Role *</span>
              <select name="role" required>
                <option value="">Select role</option>
                ${ROLES.map(
                  (role) => `
                    <option value="${safe(role.id)}" ${
                      staff.role === role.id ? 'selected' : ''
                    }>
                      ${safe(role.label)}
                    </option>
                  `
                ).join('')}
              </select>
            </label>

            <label class="field">
              <span>Department *</span>
              <select name="department" required>
                <option value="">Select department</option>
                ${DEPARTMENTS.map(
                  (department) => `
                    <option value="${safe(department)}" ${
                      staff.department === department ? 'selected' : ''
                    }>
                      ${safe(department)}
                    </option>
                  `
                ).join('')}
              </select>
            </label>

            <label class="field">
              <span>Designation</span>
              <input
                type="text"
                name="designation"
                value="${safe(staff.designation)}"
                placeholder="e.g. Senior Nurse"
              >
            </label>

            <label class="field">
              <span>Employee Code</span>
              <input
                type="text"
                name="employeeCode"
                value="${safe(staff.employeeCode)}"
                placeholder="Internal employee code"
              >
            </label>

            <label class="field">
              <span>Joining Date</span>
              <input
                type="date"
                name="joiningDate"
                value="${safe(staff.joiningDate)}"
              >
            </label>

            <label class="field">
              <span>Account Status</span>
              <select name="status">
                <option value="active" ${staff.status === STATUS.ACTIVE ? 'selected' : ''}>Active</option>
                <option value="inactive" ${staff.status === STATUS.INACTIVE ? 'selected' : ''}>Inactive</option>
                <option value="suspended" ${staff.status === STATUS.SUSPENDED ? 'selected' : ''}>Suspended</option>
                <option value="on-leave" ${staff.status === STATUS.ON_LEAVE ? 'selected' : ''}>On Leave</option>
              </select>
            </label>

            <label class="field field--span-two">
              <span>Qualification</span>
              <input
                type="text"
                name="qualification"
                value="${safe(staff.qualification)}"
                placeholder="e.g. MBBS, B.Sc Nursing, DMLT"
              >
            </label>

            <label class="field">
              <span>Registration Number</span>
              <input
                type="text"
                name="registrationNumber"
                value="${safe(staff.registrationNumber)}"
                placeholder="Professional registration number"
              >
            </label>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Login Information</h4>
              <p>Authentication details can be connected to the clinic identity system.</p>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <label class="field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value="${safe(staff.username)}"
                autocomplete="username"
                placeholder="Optional login username"
              >
            </label>

            <div class="notice notice-info">
              <i data-lucide="shield-check"></i>
              <span>Passwords and authentication credentials should be managed by the authentication layer.</span>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Emergency Contact</h4>
              <p>Optional emergency contact information.</p>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <label class="field">
              <span>Contact Name</span>
              <input
                type="text"
                name="emergencyContactName"
                value="${safe(staff.emergencyContactName)}"
              >
            </label>

            <label class="field">
              <span>Contact Phone</span>
              <input
                type="tel"
                name="emergencyContactPhone"
                value="${safe(staff.emergencyContactPhone)}"
              >
            </label>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Address & Notes</h4>
              <p>Additional staff information.</p>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <label class="field field--span-two">
              <span>Address</span>
              <textarea name="address" rows="2">${safe(staff.address)}</textarea>
            </label>

            <label class="field">
              <span>City</span>
              <input type="text" name="city" value="${safe(staff.city)}">
            </label>

            <label class="field">
              <span>State</span>
              <input type="text" name="state" value="${safe(staff.state)}">
            </label>

            <label class="field">
              <span>Postal Code</span>
              <input type="text" name="postalCode" value="${safe(staff.postalCode)}">
            </label>

            <label class="field field--span-two">
              <span>Notes</span>
              <textarea name="notes" rows="3">${safe(staff.notes)}</textarea>
            </label>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close>
            Cancel
          </button>

          <button type="submit" class="btn btn-primary">
            <i data-lucide="save"></i>
            ${editing ? 'Update Staff Profile' : 'Create Staff Profile'}
          </button>
        </div>
      </form>
    `;

    openModal({
      title: editing ? 'Edit Staff Profile' : 'Create Staff Profile',
      content,
      size: 'large'
    });

    const form = document.querySelector('#staff-form');

    if (!form) return;

    bindProfilePicturePreview(form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (state.isSaving) return;

      state.isSaving = true;

      try {
        const formData = new FormData(form);

        const data = {};

        for (const [key, value] of formData.entries()) {
          data[key] = value;
        }

        if (editing) {
          await updateStaff(existing.id, data);
          toast('Staff profile updated successfully.');
        } else {
          const created = await createStaff(data);
          toast(`${getStaffName(created)} added successfully.`);
        }

        closeModal();
        render();
      } catch (error) {
        console.error('[AURA Staff] Save failed:', error);
        toast(error.message || 'Unable to save staff profile.', 'error');
      } finally {
        state.isSaving = false;
      }
    });

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  /* ------------------------------------------------------------
     Staff Details
  ------------------------------------------------------------ */

  function openStaffDetails(staffId) {
    const staff = getStaffById(staffId);

    if (!staff) {
      toast('Staff member not found.', 'error');
      return;
    }

    state.selectedStaff = staff;

    const status = staff.status || STATUS.ACTIVE;

    const content = `
      <div class="staff-profile-detail">
        <div class="staff-profile-detail__hero">
          ${getAvatarMarkup(staff, 'large')}

          <div class="staff-profile-detail__identity">
            <span class="eyebrow">STAFF PROFILE</span>
            <h3>${safe(getStaffName(staff))}</h3>
            <p>${safe(staff.designation || getRoleLabel(staff.role))}</p>

            <div class="staff-profile-detail__badges">
              <span class="staff-id-chip">
                <i data-lucide="badge-check"></i>
                ${safe(staff.staffId)}
              </span>

              <span class="status-badge ${safe(getStatusClass(status))}">
                ${safe(getStatusLabel(status))}
              </span>
            </div>
          </div>
        </div>

        <div class="profile-info-grid">
          <div class="profile-info-card">
            <span class="profile-info-card__label">Role</span>
            <strong>${safe(getRoleLabel(staff.role))}</strong>
          </div>

          <div class="profile-info-card">
            <span class="profile-info-card__label">Department</span>
            <strong>${safe(getDepartmentLabel(staff.department))}</strong>
          </div>

          <div class="profile-info-card">
            <span class="profile-info-card__label">Employment Type</span>
            <strong>${safe(staff.employmentType || 'Full-time')}</strong>
          </div>

          <div class="profile-info-card">
            <span class="profile-info-card__label">Joining Date</span>
            <strong>${safe(formatDate(staff.joiningDate))}</strong>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Contact Information</h4>
              <p>Registered staff contact details.</p>
            </div>
          </div>

          <div class="detail-list">
            <div class="detail-list__row">
              <span>Email</span>
              <strong>${safe(staff.email || 'Not provided')}</strong>
            </div>

            <div class="detail-list__row">
              <span>Primary Phone</span>
              <strong>${safe(staff.phone || 'Not provided')}</strong>
            </div>

            <div class="detail-list__row">
              <span>Alternate Phone</span>
              <strong>${safe(staff.alternatePhone || 'Not provided')}</strong>
            </div>

            <div class="detail-list__row">
              <span>Username</span>
              <strong>${safe(staff.username || 'Not configured')}</strong>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Professional Information</h4>
              <p>Credentials and employment records.</p>
            </div>
          </div>

          <div class="detail-list">
            <div class="detail-list__row">
              <span>Designation</span>
              <strong>${safe(staff.designation || 'Not provided')}</strong>
            </div>

            <div class="detail-list__row">
              <span>Qualification</span>
              <strong>${safe(staff.qualification || 'Not provided')}</strong>
            </div>

            <div class="detail-list__row">
              <span>Registration Number</span>
              <strong>${safe(staff.registrationNumber || 'Not provided')}</strong>
            </div>

            <div class="detail-list__row">
              <span>Employee Code</span>
              <strong>${safe(staff.employeeCode || 'Not provided')}</strong>
            </div>
          </div>
        </div>

        ${
          staff.emergencyContactName || staff.emergencyContactPhone
            ? `
              <div class="form-section">
                <div class="form-section__header">
                  <div>
                    <h4>Emergency Contact</h4>
                    <p>Emergency contact details.</p>
                  </div>
                </div>

                <div class="detail-list">
                  <div class="detail-list__row">
                    <span>Name</span>
                    <strong>${safe(staff.emergencyContactName || 'Not provided')}</strong>
                  </div>

                  <div class="detail-list__row">
                    <span>Phone</span>
                    <strong>${safe(staff.emergencyContactPhone || 'Not provided')}</strong>
                  </div>
                </div>
              </div>
            `
            : ''
        }

        ${
          staff.address || staff.city || staff.state
            ? `
              <div class="form-section">
                <div class="form-section__header">
                  <div>
                    <h4>Address</h4>
                  </div>
                </div>

                <p class="profile-address">
                  ${safe(
                    [
                      staff.address,
                      staff.city,
                      staff.state,
                      staff.postalCode
                    ]
                      .filter(Boolean)
                      .join(', ')
                  )}
                </p>
              </div>
            `
            : ''
        }

        ${
          staff.notes
            ? `
              <div class="notice notice-info">
                <i data-lucide="info"></i>
                <span>${safe(staff.notes)}</span>
              </div>
            `
            : ''
        }

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-edit-staff="${safe(staff.id)}">
            <i data-lucide="pencil"></i>
            Edit Profile
          </button>

          ${
            status === STATUS.ACTIVE
              ? `
                <button type="button" class="btn btn-warning" data-change-staff-status="${safe(staff.id)}" data-status="on-leave">
                  <i data-lucide="calendar-off"></i>
                  Mark On Leave
                </button>
              `
              : ''
          }

          ${
            status !== STATUS.ACTIVE
              ? `
                <button type="button" class="btn btn-primary" data-change-staff-status="${safe(staff.id)}" data-status="active">
                  <i data-lucide="check-circle"></i>
                  Activate
                </button>
              `
              : ''
          }

          <button type="button" class="btn btn-ghost" data-modal-close>
            Close
          </button>
        </div>
      </div>
    `;

    openModal({
      title: getStaffName(staff),
      content,
      size: 'large'
    });

    document
      .querySelector(`[data-edit-staff="${staff.id}"]`)
      ?.addEventListener('click', () => {
        closeModal();
        openStaffForm(staff.id);
      });

    document
      .querySelector(`[data-change-staff-status="${staff.id}"]`)
      ?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const newStatus = button.dataset.status;

        try {
          await updateStaffStatus(staff.id, newStatus);
          closeModal();
          render();
        } catch (error) {
          toast(error.message || 'Unable to update staff status.', 'error');
        }
      });

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function formatDate(value) {
    if (!value) return 'Not provided';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Not provided';

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  /* ------------------------------------------------------------
     Page Rendering
  ------------------------------------------------------------ */

  function render() {
    const container =
      document.querySelector('[data-route-view="staff"]') ||
      document.querySelector('#app-content') ||
      document.querySelector('#app');

    if (!container) return;

    applyFilters();

    const stats = getStats();

    container.innerHTML = `
      <section class="page-shell staff-page">
        <div class="page-header">
          <div>
            <span class="eyebrow">PEOPLE & ACCESS</span>
            <h1>Staff Management</h1>
            <p>Manage staff identities, roles, departments, and account status.</p>
          </div>

          <div class="page-actions">
            <button type="button" class="btn btn-secondary" data-refresh-staff>
              <i data-lucide="refresh-cw"></i>
              Refresh
            </button>

            <button type="button" class="btn btn-primary" data-create-staff>
              <i data-lucide="user-plus"></i>
              Add Staff
            </button>
          </div>
        </div>

        <div class="kpi-grid staff-kpi-grid">
          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="users"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Total Staff</span>
              <strong class="kpi-card__value">${stats.total}</strong>
              <span class="kpi-card__meta">Registered profiles</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="user-check"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Active Staff</span>
              <strong class="kpi-card__value">${stats.active}</strong>
              <span class="kpi-card__meta">Available for clinic operations</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="stethoscope"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Doctors</span>
              <strong class="kpi-card__value">${stats.doctors}</strong>
              <span class="kpi-card__meta">Active clinical providers</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="heart-pulse"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Nursing Staff</span>
              <strong class="kpi-card__value">${stats.nurses}</strong>
              <span class="kpi-card__meta">Active nursing team</span>
            </div>
          </article>
        </div>

        <section class="workspace-card">
          <div class="workspace-card__header">
            <div>
              <span class="eyebrow">STAFF DIRECTORY</span>
              <h2>Clinic Team</h2>
            </div>

            <div class="workspace-card__actions">
              <span class="table-count">${state.filteredStaff.length} visible record${state.filteredStaff.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div class="toolbar staff-toolbar">
            <div class="search-field">
              <i data-lucide="search"></i>
              <input
                type="search"
                placeholder="Search name, Staff ID, role, or phone..."
                value="${safe(state.searchTerm)}"
                data-staff-search
              >
            </div>

            <label class="field field--inline">
              <span class="sr-only">Role filter</span>
              <select data-staff-role-filter>
                <option value="all">All Roles</option>
                ${ROLES.map(
                  (role) => `
                    <option value="${safe(role.id)}" ${
                      state.roleFilter === role.id ? 'selected' : ''
                    }>
                      ${safe(role.label)}
                    </option>
                  `
                ).join('')}
              </select>
            </label>

            <label class="field field--inline">
              <span class="sr-only">Department filter</span>
              <select data-staff-department-filter>
                <option value="all">All Departments</option>
                ${DEPARTMENTS.map(
                  (department) => `
                    <option value="${safe(department)}" ${
                      state.departmentFilter === department ? 'selected' : ''
                    }>
                      ${safe(department)}
                    </option>
                  `
                ).join('')}
              </select>
            </label>

            <label class="field field--inline">
              <span class="sr-only">Status filter</span>
              <select data-staff-status-filter>
                <option value="active" ${
                  state.statusFilter === 'active' ? 'selected' : ''
                }>Active</option>
                <option value="inactive" ${
                  state.statusFilter === 'inactive' ? 'selected' : ''
                }>Inactive</option>
                <option value="suspended" ${
                  state.statusFilter === 'suspended' ? 'selected' : ''
                }>Suspended</option>
                <option value="on-leave" ${
                  state.statusFilter === 'on-leave' ? 'selected' : ''
                }>On Leave</option>
                <option value="all" ${
                  state.statusFilter === 'all' ? 'selected' : ''
                }>All Statuses</option>
              </select>
            </label>
          </div>

          ${
            state.filteredStaff.length
              ? renderStaffTable()
              : renderEmptyState()
          }
        </section>
      </section>
    `;

    bindPageEvents();

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function renderStaffTable() {
    return `
      <div class="table-scroll">
        <table class="data-table staff-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>Staff ID</th>
              <th>Role</th>
              <th>Department</th>
              <th>Contact</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            ${state.filteredStaff
              .map((staff) => {
                const status = staff.status || STATUS.ACTIVE;

                return `
                  <tr data-staff-row="${safe(staff.id)}">
                    <td>
                      <div class="staff-table__identity">
                        ${getAvatarMarkup(staff, 'small')}

                        <div>
                          <button
                            type="button"
                            class="table-link"
                            data-view-staff="${safe(staff.id)}"
                          >
                            ${safe(getStaffName(staff))}
                          </button>

                          <small class="table-subtext">
                            ${safe(staff.designation || getRoleLabel(staff.role))}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span class="staff-id-text">${safe(staff.staffId || 'Pending')}</span>
                    </td>

                    <td>
                      <div class="staff-role-cell">
                        <i data-lucide="${safe(getRoleIcon(staff.role))}"></i>
                        <span>${safe(getRoleLabel(staff.role))}</span>
                      </div>
                    </td>

                    <td>${safe(getDepartmentLabel(staff.department))}</td>

                    <td>
                      <div class="staff-contact-cell">
                        <span>${safe(staff.phone || 'No phone')}</span>
                        <small>${safe(staff.email || 'No email')}</small>
                      </div>
                    </td>

                    <td>
                      <span class="status-badge ${safe(getStatusClass(status))}">
                        ${safe(getStatusLabel(status))}
                      </span>
                    </td>

                    <td class="text-right">
                      <div class="table-actions">
                        <button
                          type="button"
                          class="icon-button"
                          data-view-staff="${safe(staff.id)}"
                          title="View profile"
                        >
                          <i data-lucide="eye"></i>
                        </button>

                        <button
                          type="button"
                          class="icon-button"
                          data-edit-staff="${safe(staff.id)}"
                          title="Edit profile"
                        >
                          <i data-lucide="pencil"></i>
                        </button>

                        ${
                          status === STATUS.ACTIVE
                            ? `
                              <button
                                type="button"
                                class="icon-button icon-button--danger"
                                data-deactivate-staff="${safe(staff.id)}"
                                title="Deactivate staff"
                              >
                                <i data-lucide="user-round-x"></i>
                              </button>
                            `
                            : `
                              <button
                                type="button"
                                class="icon-button icon-button--success"
                                data-activate-staff="${safe(staff.id)}"
                                title="Activate staff"
                              >
                                <i data-lucide="user-round-check"></i>
                              </button>
                            `
                        }
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">
          <i data-lucide="users"></i>
        </div>

        <h3>No staff records found</h3>

        <p>
          ${
            state.searchTerm ||
            state.roleFilter !== 'all' ||
            state.departmentFilter !== 'all' ||
            state.statusFilter !== 'all'
              ? 'Try changing your search or filter criteria.'
              : 'Create the first staff profile to begin managing clinic access.'
          }
        </p>

        <button type="button" class="btn btn-primary" data-create-staff>
          <i data-lucide="user-plus"></i>
          Add Staff
        </button>
      </div>
    `;
  }

  function bindPageEvents() {
    document.querySelectorAll('[data-create-staff]').forEach((button) => {
      button.addEventListener('click', () => openStaffForm());
    });

    document
      .querySelector('[data-refresh-staff]')
      ?.addEventListener('click', async () => {
        await loadData();
        render();
        toast('Staff directory refreshed.');
      });

    document
      .querySelector('[data-staff-search]')
      ?.addEventListener('input', (event) => {
        state.searchTerm = event.target.value;
        applyFilters();
        render();
      });

    document
      .querySelector('[data-staff-role-filter]')
      ?.addEventListener('change', (event) => {
        state.roleFilter = event.target.value;
        applyFilters();
        render();
      });

    document
      .querySelector('[data-staff-department-filter]')
      ?.addEventListener('change', (event) => {
        state.departmentFilter = event.target.value;
        applyFilters();
        render();
      });

    document
      .querySelector('[data-staff-status-filter]')
      ?.addEventListener('change', (event) => {
        state.statusFilter = event.target.value;
        applyFilters();
        render();
      });

    document.querySelectorAll('[data-view-staff]').forEach((button) => {
      button.addEventListener('click', () => {
        openStaffDetails(button.dataset.viewStaff);
      });
    });

    document.querySelectorAll('[data-edit-staff]').forEach((button) => {
      button.addEventListener('click', () => {
        openStaffForm(button.dataset.editStaff);
      });
    });

    document.querySelectorAll('[data-deactivate-staff]').forEach((button) => {
      button.addEventListener('click', async () => {
        const staffId = button.dataset.deactivateStaff;
        const staff = getStaffById(staffId);

        if (!staff) return;

        const confirmed = window.confirm(
          `Deactivate ${getStaffName(staff)}?`
        );

        if (!confirmed) return;

        try {
          await updateStaffStatus(staffId, STATUS.INACTIVE);
          render();
        } catch (error) {
          toast(error.message || 'Unable to deactivate staff.', 'error');
        }
      });
    });

    document.querySelectorAll('[data-activate-staff]').forEach((button) => {
      button.addEventListener('click', async () => {
        const staffId = button.dataset.activateStaff;

        try {
          await updateStaffStatus(staffId, STATUS.ACTIVE);
          render();
        } catch (error) {
          toast(error.message || 'Unable to activate staff.', 'error');
        }
      });
    });
  }

  /* ------------------------------------------------------------
     Public API
  ------------------------------------------------------------ */

  async function refresh() {
    await loadData();
    render();
  }

  function getState() {
    return {
      ...state,
      staff: [...state.staff],
      filteredStaff: [...state.filteredStaff]
    };
  }

  async function initialize() {
    try {
      await loadData();

      if (APP?.registerModule) {
        APP.registerModule(MODULE_NAME, {
          render,
          refresh,
          getState,
          getStaffById,
          getStaffByRole,
          getActiveStaff,
          createStaff,
          updateStaff,
          updateStaffStatus,
          removeStaff
        });
      }

      if (window.AURA) {
        window.AURA.staff = api;
      }
    } catch (error) {
      console.error('[AURA Staff] Initialization failed:', error);
    }
  }

  const api = {
    initialize,
    render,
    refresh,
    getState,
    getStaffById,
    getStaffByRole,
    getActiveStaff,
    createStaff,
    updateStaff,
    updateStaffStatus,
    removeStaff,
    openStaffForm,
    openStaffDetails,
    ROLES,
    DEPARTMENTS,
    STATUS
  };

  window.AURA_STAFF = api;

  window.AURA = window.AURA || {};
  window.AURA.staff = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();