/* =========================================================
   AURA Clinic — Patient Registry Module
   Path: frontend/js/modules/patients.js
   Purpose: Patient records, search, registration, and profiles
   ========================================================= */

(function (window) {
  'use strict';

  const AURA = window.AURA || (window.AURA = {});
  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const STORAGE = window.AURA_STORAGE || AURA.storage;
  const EVENTS = window.AURA_EVENTS || AURA.events;
  const UTILS = window.AURA_UTILS || AURA.utils;
  const ROUTER = window.AURA_ROUTER || AURA.router;

  const patients = {
    name: 'patients',
    initialized: false,
    container: null,
    records: [],
    filteredRecords: [],
    selectedPatient: null,
    searchTerm: '',
    filters: {
      gender: '',
      bloodGroup: '',
      status: 'active'
    },
    editingId: null,
    page: 1,
    pageSize: 10
  };

  const storeName =
    CONFIG.storage?.stores?.patients || 'patients';

  const fields = [
    'fullName',
    'firstName',
    'middleName',
    'lastName',
    'gender',
    'dateOfBirth',
    'phone',
    'email',
    'bloodGroup',
    'address',
    'city',
    'state',
    'emergencyContactName',
    'emergencyContactPhone',
    'allergies',
    'medicalNotes'
  ];

  /* =========================================================
     Initialization
     ========================================================= */

  patients.init = async function () {
    if (patients.initialized) return patients;

    patients.initialized = true;

    patients.bindEvents();

    return patients;
  };

  patients.bindEvents = function () {
    if (!EVENTS?.on) return;

    EVENTS.on('patient:created', () => {
      if (patients.isActive()) patients.refresh();
    });

    EVENTS.on('patient:updated', () => {
      if (patients.isActive()) patients.refresh();
    });

    EVENTS.on('patient:deleted', () => {
      if (patients.isActive()) patients.refresh();
    });
  };

  patients.isActive = function () {
    return ROUTER?.is
      ? ROUTER.is('patients')
      : window.location.hash === '#patients';
  };

  /* =========================================================
     Data Access
     ========================================================= */

  patients.load = async function () {
    if (!STORAGE) return [];

    try {
      patients.records = await STORAGE.getAll(storeName) || [];

      patients.records.sort((a, b) => {
        const first = new Date(a.updatedAt || a.createdAt || 0);
        const second = new Date(b.updatedAt || b.createdAt || 0);

        return second - first;
      });

      return patients.records;
    } catch (error) {
      console.error('AURA Patients: Failed to load records.', error);

      patients.records = [];

      if (AURA.toast) {
        AURA.toast('Unable to load patient records.', 'error');
      }

      return [];
    }
  };

  patients.getById = async function (id) {
    if (!id) return null;

    if (STORAGE?.get) {
      return STORAGE.get(storeName, id);
    }

    return patients.records.find(patient => patient.id === id) || null;
  };

  patients.getByUHID = async function (uhid) {
    if (!uhid) return null;

    const match = patients.records.find(patient =>
      String(patient.uhid || '').toLowerCase() ===
      String(uhid).toLowerCase()
    );

    return match || null;
  };

  patients.search = function (term = '') {
    patients.searchTerm = String(term || '').trim().toLowerCase();

    patients.filteredRecords = patients.records.filter(patient => {
      const searchableText = [
        patient.uhid,
        patient.fullName,
        patient.firstName,
        patient.middleName,
        patient.lastName,
        patient.phone,
        patient.email
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !patients.searchTerm ||
        searchableText.includes(patients.searchTerm);

      const matchesGender =
        !patients.filters.gender ||
        patient.gender === patients.filters.gender;

      const matchesBloodGroup =
        !patients.filters.bloodGroup ||
        patient.bloodGroup === patients.filters.bloodGroup;

      const matchesStatus =
        !patients.filters.status ||
        patient.status === patients.filters.status;

      return (
        matchesSearch &&
        matchesGender &&
        matchesBloodGroup &&
        matchesStatus
      );
    });

    patients.page = 1;

    return patients.filteredRecords;
  };

  patients.getPaginatedRecords = function () {
    if (UTILS?.paginate) {
      return UTILS.paginate(
        patients.filteredRecords,
        patients.page,
        patients.pageSize
      );
    }

    const start = (patients.page - 1) * patients.pageSize;

    return {
      items: patients.filteredRecords.slice(
        start,
        start + patients.pageSize
      ),
      page: patients.page,
      pageSize: patients.pageSize,
      totalItems: patients.filteredRecords.length,
      totalPages: Math.max(
        1,
        Math.ceil(
          patients.filteredRecords.length / patients.pageSize
        )
      )
    };
  };

  /* =========================================================
     Validation
     ========================================================= */

  patients.validate = function (data) {
    const errors = {};

    if (
      UTILS?.isEmpty
        ? UTILS.isEmpty(data.fullName) &&
          UTILS.isEmpty(data.firstName)
        : !data.fullName && !data.firstName
    ) {
      errors.fullName = 'Patient name is required.';
    }

    if (!data.gender) {
      errors.gender = 'Gender is required.';
    }

    if (data.phone && UTILS?.isValidPhone &&
        !UTILS.isValidPhone(data.phone)) {
      errors.phone = 'Enter a valid phone number.';
    }

    if (data.email && UTILS?.isValidEmail &&
        !UTILS.isValidEmail(data.email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (
      data.dateOfBirth &&
      UTILS?.isFutureDate &&
      UTILS.isFutureDate(data.dateOfBirth)
    ) {
      errors.dateOfBirth = 'Date of birth cannot be in the future.';
    }

    return errors;
  };

  /* =========================================================
     Record Creation and Updates
     ========================================================= */

  patients.normalizeData = function (data = {}) {
    const fullName = [
      data.firstName,
      data.middleName,
      data.lastName
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      ...data,
      fullName: data.fullName || fullName,
      firstName: data.firstName || '',
      middleName: data.middleName || '',
      lastName: data.lastName || '',
      gender: data.gender || '',
      dateOfBirth: data.dateOfBirth || '',
      phone: data.phone || '',
      email: data.email || '',
      bloodGroup: data.bloodGroup || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      emergencyContactName: data.emergencyContactName || '',
      emergencyContactPhone: data.emergencyContactPhone || '',
      allergies: data.allergies || '',
      medicalNotes: data.medicalNotes || '',
      status: data.status || 'active'
    };
  };

  patients.create = async function (data = {}) {
    const normalized = patients.normalizeData(data);
    const errors = patients.validate(normalized);

    if (UTILS?.hasErrors && UTILS.hasErrors(errors)) {
      return {
        success: false,
        errors
      };
    }

    const record = {
      ...normalized,
      id: UTILS?.createId
        ? UTILS.createId('patient')
        : `patient_${Date.now()}`,
      uhid: normalized.uhid ||
        (UTILS?.generateUHID
          ? UTILS.generateUHID()
          : `AURA-${Date.now()}`),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (STORAGE?.add) {
        await STORAGE.add(storeName, record);
      }

      patients.records.unshift(record);

      if (EVENTS?.patientCreated) {
        EVENTS.patientCreated(record);
      } else if (EVENTS?.emit) {
        EVENTS.emit('patient:created', record);
      }

      if (AURA.toast) {
        AURA.toast('Patient registered successfully.', 'success');
      }

      return {
        success: true,
        patient: record
      };
    } catch (error) {
      console.error('AURA Patients: Failed to create patient.', error);

      if (AURA.toast) {
        AURA.toast('Unable to save patient record.', 'error');
      }

      return {
        success: false,
        error
      };
    }
  };

  patients.update = async function (id, data = {}) {
    if (!id) {
      return {
        success: false,
        error: new Error('Patient ID is required.')
      };
    }

    const existing = await patients.getById(id);

    if (!existing) {
      return {
        success: false,
        error: new Error('Patient record not found.')
      };
    }

    const normalized = patients.normalizeData({
      ...existing,
      ...data
    });

    const errors = patients.validate(normalized);

    if (UTILS?.hasErrors && UTILS.hasErrors(errors)) {
      return {
        success: false,
        errors
      };
    }

    const updated = {
      ...existing,
      ...normalized,
      id: existing.id,
      uhid: existing.uhid,
      updatedAt: new Date().toISOString()
    };

    try {
      if (STORAGE?.put) {
        await STORAGE.put(storeName, updated);
      }

      const index = patients.records.findIndex(
        patient => patient.id === id
      );

      if (index !== -1) {
        patients.records[index] = updated;
      }

      if (EVENTS?.patientUpdated) {
        EVENTS.patientUpdated(updated);
      } else if (EVENTS?.emit) {
        EVENTS.emit('patient:updated', updated);
      }

      if (AURA.toast) {
        AURA.toast('Patient record updated.', 'success');
      }

      return {
        success: true,
        patient: updated
      };
    } catch (error) {
      console.error('AURA Patients: Failed to update patient.', error);

      if (AURA.toast) {
        AURA.toast('Unable to update patient record.', 'error');
      }

      return {
        success: false,
        error
      };
    }
  };

  patients.remove = async function (id) {
    if (!id) return false;

    const existing = await patients.getById(id);

    if (!existing) return false;

    const confirmed = window.confirm(
      `Delete patient ${existing.fullName || existing.uhid}?`
    );

    if (!confirmed) return false;

    try {
      if (STORAGE?.remove) {
        await STORAGE.remove(storeName, id);
      }

      patients.records = patients.records.filter(
        patient => patient.id !== id
      );

      if (EVENTS?.patientDeleted) {
        EVENTS.patientDeleted(existing);
      } else if (EVENTS?.emit) {
        EVENTS.emit('patient:deleted', existing);
      }

      if (AURA.toast) {
        AURA.toast('Patient record deleted.', 'success');
      }

      patients.render();

      return true;
    } catch (error) {
      console.error('AURA Patients: Failed to delete patient.', error);

      if (AURA.toast) {
        AURA.toast('Unable to delete patient record.', 'error');
      }

      return false;
    }
  };

  /* =========================================================
     Rendering
     ========================================================= */

  patients.render = async function () {
    patients.container = document.querySelector(
      '[data-route-view="patients"]'
    ) || document.querySelector('#app-content');

    if (!patients.container) return;

    await patients.load();

    patients.search(
      patients.container.querySelector('[data-patient-search]')?.value || ''
    );

    patients.renderLayout();
    patients.renderTable();
    patients.bindDomEvents();
  };

  patients.renderLayout = function () {
    patients.container.innerHTML = `
      <section class="page-header">
        <div>
          <p class="eyebrow">Patient Registry</p>
          <h1>Patients</h1>
          <p class="page-subtitle">
            Manage patient records, UHIDs, and clinical history.
          </p>
        </div>

        <div class="page-actions">
          <button
            type="button"
            class="btn btn-primary"
            data-patient-action="new"
          >
            <span aria-hidden="true">＋</span>
            Register Patient
          </button>
        </div>
      </section>

      <section class="patients-toolbar card">
        <div class="patients-search">
          <label class="sr-only" for="patientSearch">
            Search patients
          </label>

          <input
            id="patientSearch"
            type="search"
            class="form-control"
            placeholder="Search by name, UHID, phone, or email..."
            data-patient-search
          />
        </div>

        <div class="patients-filters">
          <select
            class="form-control"
            data-patient-filter="gender"
            aria-label="Filter by gender"
          >
            <option value="">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>

          <select
            class="form-control"
            data-patient-filter="bloodGroup"
            aria-label="Filter by blood group"
          >
            <option value="">All Blood Groups</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>

          <select
            class="form-control"
            data-patient-filter="status"
            aria-label="Filter by status"
          >
            <option value="active">Active</option>
            <option value="">All Statuses</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section class="card patients-table-card">
        <div class="card-header">
          <div>
            <h2>Patient Records</h2>
            <p class="card-subtitle" data-patient-count>
              Loading records...
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-patient-action="refresh"
          >
            ↻ Refresh
          </button>
        </div>

        <div class="card-body">
          <div class="table-responsive">
            <table class="data-table patients-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>UHID</th>
                  <th>Age / Gender</th>
                  <th>Contact</th>
                  <th>Blood Group</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>

              <tbody data-patient-table-body>
                <tr>
                  <td colspan="7">
                    <div class="loading-state">
                      Loading patient records...
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pagination" data-patient-pagination></div>
        </div>
      </section>

      <div class="modal" data-patient-modal hidden>
        <div class="modal-backdrop" data-patient-action="close-modal"></div>

        <div
          class="modal-dialog modal-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="patientModalTitle"
        >
          <div class="modal-header">
            <div>
              <p class="eyebrow">Patient Registry</p>
              <h2 id="patientModalTitle">Register Patient</h2>
            </div>

            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              data-patient-action="close-modal"
            >
              ×
            </button>
          </div>

          <form data-patient-form>
            <div class="modal-body">
              ${patients.formMarkup()}
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                data-patient-action="close-modal"
              >
                Cancel
              </button>

              <button type="submit" class="btn btn-primary">
                Save Patient
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };

  patients.formMarkup = function () {
    return `
      <input type="hidden" name="id" />

      <section class="form-section">
        <div class="form-section-header">
          <h3>Basic Information</h3>
          <p>Enter the patient's identity and demographic details.</p>
        </div>

        <div class="form-grid form-grid-3">
          <div class="form-group">
            <label for="patientFirstName">
              First Name <span class="required">*</span>
            </label>
            <input
              id="patientFirstName"
              class="form-control"
              type="text"
              name="firstName"
              required
            />
            <small class="field-error" data-error="firstName"></small>
          </div>

          <div class="form-group">
            <label for="patientMiddleName">Middle Name</label>
            <input
              id="patientMiddleName"
              class="form-control"
              type="text"
              name="middleName"
            />
          </div>

          <div class="form-group">
            <label for="patientLastName">Last Name</label>
            <input
              id="patientLastName"
              class="form-control"
              type="text"
              name="lastName"
            />
          </div>

          <div class="form-group">
            <label for="patientGender">
              Gender <span class="required">*</span>
            </label>
            <select
              id="patientGender"
              class="form-control"
              name="gender"
              required
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <small class="field-error" data-error="gender"></small>
          </div>

          <div class="form-group">
            <label for="patientDob">Date of Birth</label>
            <input
              id="patientDob"
              class="form-control"
              type="date"
              name="dateOfBirth"
            />
            <small class="field-error" data-error="dateOfBirth"></small>
          </div>

          <div class="form-group">
            <label for="patientBloodGroup">Blood Group</label>
            <select
              id="patientBloodGroup"
              class="form-control"
              name="bloodGroup"
            >
              <option value="">Not Recorded</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-header">
          <h3>Contact Information</h3>
          <p>Patient contact and address details.</p>
        </div>

        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label for="patientPhone">Phone Number</label>
            <input
              id="patientPhone"
              class="form-control"
              type="tel"
              name="phone"
              inputmode="tel"
              autocomplete="tel"
            />
            <small class="field-error" data-error="phone"></small>
          </div>

          <div class="form-group">
            <label for="patientEmail">Email Address</label>
            <input
              id="patientEmail"
              class="form-control"
              type="email"
              name="email"
              autocomplete="email"
            />
            <small class="field-error" data-error="email"></small>
          </div>

          <div class="form-group form-group-full">
            <label for="patientAddress">Address</label>
            <textarea
              id="patientAddress"
              class="form-control"
              name="address"
              rows="2"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="patientCity">City</label>
            <input
              id="patientCity"
              class="form-control"
              type="text"
              name="city"
            />
          </div>

          <div class="form-group">
            <label for="patientState">State</label>
            <input
              id="patientState"
              class="form-control"
              type="text"
              name="state"
            />
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-header">
          <h3>Emergency Contact</h3>
          <p>Details of a person to contact in an emergency.</p>
        </div>

        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label for="emergencyContactName">Contact Name</label>
            <input
              id="emergencyContactName"
              class="form-control"
              type="text"
              name="emergencyContactName"
            />
          </div>

          <div class="form-group">
            <label for="emergencyContactPhone">Contact Phone</label>
            <input
              id="emergencyContactPhone"
              class="form-control"
              type="tel"
              name="emergencyContactPhone"
              inputmode="tel"
            />
          </div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-header">
          <h3>Clinical Notes</h3>
          <p>Optional preliminary information for the care team.</p>
        </div>

        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label for="patientAllergies">Known Allergies</label>
            <textarea
              id="patientAllergies"
              class="form-control"
              name="allergies"
              rows="3"
              placeholder="Medicines, food, or other allergies"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="patientMedicalNotes">Medical Notes</label>
            <textarea
              id="patientMedicalNotes"
              class="form-control"
              name="medicalNotes"
              rows="3"
              placeholder="Additional relevant information"
            ></textarea>
          </div>
        </div>
      </section>
    `;
  };

  /* =========================================================
     Patient Table
     ========================================================= */

  patients.renderTable = function () {
    const tbody = patients.container.querySelector(
      '[data-patient-table-body]'
    );

    const countElement = patients.container.querySelector(
      '[data-patient-count]'
    );

    if (!tbody) return;

    const result = patients.getPaginatedRecords();

    if (countElement) {
      countElement.textContent =
        `${result.totalItems} patient record${result.totalItems === 1 ? '' : 's'}`;
    }

    if (!result.items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-state-icon">♙</div>
              <h3>No patients found</h3>
              <p>Try changing your search or filter criteria.</p>
            </div>
          </td>
        </tr>
      `;

      patients.renderPagination(result);
      return;
    }

    tbody.innerHTML = result.items
      .map(patient => patients.rowMarkup(patient))
      .join('');

    patients.renderPagination(result);
  };

  patients.rowMarkup = function (patient) {
    const displayName =
      patient.fullName ||
      [
        patient.firstName,
        patient.middleName,
        patient.lastName
      ].filter(Boolean).join(' ') ||
      'Unnamed Patient';

    const age = UTILS?.getPatientAge
      ? UTILS.getPatientAge(patient.dateOfBirth)
      : '—';

    const gender = UTILS?.getGenderLabel
      ? UTILS.getGenderLabel(patient.gender)
      : patient.gender || '—';

    const initials = UTILS?.initials
      ? UTILS.initials(displayName)
      : displayName.slice(0, 2).toUpperCase();

    const statusClass = patient.status === 'inactive'
      ? 'badge-neutral'
      : 'badge-success';

    return `
      <tr data-patient-id="${UTILS.escapeHtml(patient.id)}">
        <td>
          <div class="patient-table-identity">
            <div class="avatar avatar-sm">
              ${UTILS.escapeHtml(initials)}
            </div>

            <div>
              <strong>${UTILS.escapeHtml(displayName)}</strong>
              <small>
                ${UTILS.escapeHtml(patient.email || 'No email recorded')}
              </small>
            </div>
          </div>
        </td>

        <td>
          <span class="patient-uhid">
            ${UTILS.escapeHtml(patient.uhid || '—')}
          </span>
        </td>

        <td>
          <span>${UTILS.escapeHtml(String(age))}</span>
          <small>${UTILS.escapeHtml(gender)}</small>
        </td>

        <td>
          ${UTILS.escapeHtml(patient.phone || '—')}
        </td>

        <td>
          <span class="badge badge-neutral">
            ${UTILS.escapeHtml(patient.bloodGroup || '—')}
          </span>
        </td>

        <td>
          <span class="badge ${statusClass}">
            ${UTILS.escapeHtml(
              UTILS.getStatusLabel
                ? UTILS.getStatusLabel(patient.status)
                : patient.status || 'Active'
            )}
          </span>
        </td>

        <td class="text-right">
          <div class="table-actions">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-patient-action="view"
              data-patient-id="${UTILS.escapeHtml(patient.id)}"
            >
              View
            </button>

            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-patient-action="edit"
              data-patient-id="${UTILS.escapeHtml(patient.id)}"
            >
              Edit
            </button>

            <button
              type="button"
              class="btn btn-ghost btn-sm text-danger"
              data-patient-action="delete"
              data-patient-id="${UTILS.escapeHtml(patient.id)}"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  patients.renderPagination = function (result) {
    const container = patients.container.querySelector(
      '[data-patient-pagination]'
    );

    if (!container) return;

    if (result.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        data-patient-page="${result.page - 1}"
        ${result.page <= 1 ? 'disabled' : ''}
      >
        Previous
      </button>

      <span class="pagination-info">
        Page ${result.page} of ${result.totalPages}
      </span>

      <button
        type="button"
        class="btn btn-secondary btn-sm"
        data-patient-page="${result.page + 1}"
        ${result.page >= result.totalPages ? 'disabled' : ''}
      >
        Next
      </button>
    `;
  };

  /* =========================================================
     Patient Profile
     ========================================================= */

  patients.showProfile = async function (id) {
    const patient = await patients.getById(id);

    if (!patient) {
      if (AURA.toast) {
        AURA.toast('Patient record not found.', 'error');
      }

      return;
    }

    patients.selectedPatient = patient;

    if (AURA.modal) {
      AURA.modal({
        title: 'Patient Profile',
        content: patients.profileMarkup(patient),
        size: 'large'
      });

      return;
    }

    patients.openProfileModal(patient);
  };

  patients.profileMarkup = function (patient) {
    const name = patient.fullName || 'Unnamed Patient';

    const age = UTILS?.getPatientAge
      ? UTILS.getPatientAge(patient.dateOfBirth)
      : '—';

    return `
      <div class="patient-profile-summary">
        <div class="patient-profile-avatar avatar avatar-xl">
          ${UTILS.initials(name)}
        </div>

        <div>
          <p class="eyebrow">UHID</p>
          <h3>${UTILS.escapeHtml(name)}</h3>
          <strong>${UTILS.escapeHtml(patient.uhid || '—')}</strong>
        </div>
      </div>

      <div class="patient-profile-grid">
        <div>
          <span class="detail-label">Age</span>
          <strong>${UTILS.escapeHtml(String(age))}</strong>
        </div>

        <div>
          <span class="detail-label">Gender</span>
          <strong>${UTILS.escapeHtml(
            UTILS.getGenderLabel(patient.gender)
          )}</strong>
        </div>

        <div>
          <span class="detail-label">Blood Group</span>
          <strong>${UTILS.escapeHtml(patient.bloodGroup || '—')}</strong>
        </div>

        <div>
          <span class="detail-label">Phone</span>
          <strong>${UTILS.escapeHtml(patient.phone || '—')}</strong>
        </div>

        <div>
          <span class="detail-label">Email</span>
          <strong>${UTILS.escapeHtml(patient.email || '—')}</strong>
        </div>

        <div>
          <span class="detail-label">Status</span>
          <strong>${UTILS.escapeHtml(
            UTILS.getStatusLabel(patient.status)
          )}</strong>
        </div>
      </div>

      <div class="patient-profile-section">
        <h4>Address</h4>
        <p>${UTILS.escapeHtml(
          [
            patient.address,
            patient.city,
            patient.state
          ].filter(Boolean).join(', ') || 'Not recorded'
        )}</p>
      </div>

      <div class="patient-profile-section">
        <h4>Emergency Contact</h4>
        <p>${UTILS.escapeHtml(
          [
            patient.emergencyContactName,
            patient.emergencyContactPhone
          ].filter(Boolean).join(' · ') || 'Not recorded'
        )}</p>
      </div>

      <div class="patient-profile-section">
        <h4>Clinical Notes</h4>
        <p>${UTILS.escapeHtml(
          patient.medicalNotes || 'No medical notes recorded.'
        )}</p>
      </div>
    `;
  };

  patients.openProfileModal = function (patient) {
    const modal = document.createElement('div');

    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>

      <div
        class="modal-dialog modal-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patientProfileTitle"
      >
        <div class="modal-header">
          <div>
            <p class="eyebrow">Patient Profile</p>
            <h2 id="patientProfileTitle">
              ${UTILS.escapeHtml(patient.fullName || 'Patient')}
            </h2>
          </div>

          <button
            type="button"
            class="modal-close"
            aria-label="Close patient profile"
          >
            ×
          </button>
        </div>

        <div class="modal-body">
          ${patients.profileMarkup(patient)}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            data-profile-close
          >
            Close
          </button>

          <button
            type="button"
            class="btn btn-primary"
            data-profile-edit
          >
            Edit Patient
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();

    modal.querySelector('.modal-backdrop').addEventListener(
      'click',
      close
    );

    modal.querySelector('.modal-close').addEventListener(
      'click',
      close
    );

    modal.querySelector('[data-profile-close]').addEventListener(
      'click',
      close
    );

    modal.querySelector('[data-profile-edit]').addEventListener(
      'click',
      () => {
        close();
        patients.openForm(patient);
      }
    );
  };

  /* =========================================================
     Form Handling
     ========================================================= */

  patients.openForm = function (patient = null) {
    const modal = patients.container.querySelector(
      '[data-patient-modal]'
    );

    const form = patients.container.querySelector(
      '[data-patient-form]'
    );

    const title = patients.container.querySelector(
      '#patientModalTitle'
    );

    if (!modal || !form) return;

    patients.editingId = patient?.id || null;

    if (title) {
      title.textContent = patient
        ? 'Edit Patient'
        : 'Register Patient';
    }

    if (patient && UTILS?.setFormData) {
      UTILS.setFormData(form, patient);
    } else if (UTILS?.clearForm) {
      UTILS.clearForm(form);
    }

    modal.hidden = false;
    modal.classList.add('is-open');

    const firstField = form.querySelector(
      'input:not([type="hidden"]), select, textarea'
    );

    firstField?.focus();
  };

  patients.closeForm = function () {
    const modal = patients.container?.querySelector(
      '[data-patient-modal]'
    );

    if (!modal) return;

    modal.hidden = true;
    modal.classList.remove('is-open');

    patients.editingId = null;
  };

  patients.handleSubmit = async function (form) {
    const data = UTILS?.getFormData
      ? UTILS.getFormData(form)
      : {};

    const id = data.id || patients.editingId;

    delete data.id;

    let result;

    if (id) {
      result = await patients.update(id, data);
    } else {
      result = await patients.create(data);
    }

    patients.clearErrors(form);

    if (!result.success) {
      if (result.errors) {
        patients.showErrors(form, result.errors);
      }

      return result;
    }

    patients.closeForm();
    await patients.refresh();

    return result;
  };

  patients.showErrors = function (form, errors = {}) {
    Object.entries(errors).forEach(([field, message]) => {
      const input = form.elements.namedItem(field);
      const errorElement = form.querySelector(
        `[data-error="${field}"]`
      );

      if (input) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
      }

      if (errorElement) {
        errorElement.textContent = message;
      }
    });
  };

  patients.clearErrors = function (form) {
    UTILS?.$$?.('.is-invalid', form).forEach(element => {
      element.classList.remove('is-invalid');
      element.removeAttribute('aria-invalid');
    });

    UTILS?.$$?.('[data-error]', form).forEach(element => {
      element.textContent = '';
    });
  };

  /* =========================================================
     DOM Events
     ========================================================= */

  patients.bindDomEvents = function () {
    if (!patients.container) return;

    const searchInput = patients.container.querySelector(
      '[data-patient-search]'
    );

    searchInput?.addEventListener(
      'input',
      UTILS?.debounce
        ? UTILS.debounce(event => {
            patients.search(event.target.value);
            patients.renderTable();
          }, 250)
        : event => {
            patients.search(event.target.value);
            patients.renderTable();
          }
    );

    patients.container.querySelectorAll(
      '[data-patient-filter]'
    ).forEach(select => {
      select.value = patients.filters[select.dataset.patientFilter] || '';

      select.addEventListener('change', event => {
        patients.filters[select.dataset.patientFilter] =
          event.target.value;

        patients.search(searchInput?.value || '');
        patients.renderTable();
      });
    });

    patients.container.addEventListener('click', async event => {
      const actionElement = event.target.closest(
        '[data-patient-action]'
      );

      const pageElement = event.target.closest(
        '[data-patient-page]'
      );

      if (pageElement) {
        patients.page = Number(pageElement.dataset.patientPage);
        patients.renderTable();
        return;
      }

      if (!actionElement) return;

      const action = actionElement.dataset.patientAction;
      const id = actionElement.dataset.patientId;

      switch (action) {
        case 'new':
          patients.openForm();
          break;

        case 'refresh':
          await patients.refresh();
          break;

        case 'view':
          await patients.showProfile(id);
          break;

        case 'edit': {
          const patient = await patients.getById(id);
          patients.openForm(patient);
          break;
        }

        case 'delete':
          await patients.remove(id);
          break;

        case 'close-modal':
          patients.closeForm();
          break;

        default:
          break;
      }
    });

    const form = patients.container.querySelector(
      '[data-patient-form]'
    );

    form?.addEventListener('submit', async event => {
      event.preventDefault();
      await patients.handleSubmit(form);
    });

    form?.addEventListener('input', event => {
      const field = event.target.name;

      if (!field) return;

      event.target.classList.remove('is-invalid');

      const errorElement = form.querySelector(
        `[data-error="${field}"]`
      );

      if (errorElement) {
        errorElement.textContent = '';
      }
    });
  };

  /* =========================================================
     Refresh
     ========================================================= */

  patients.refresh = async function () {
    await patients.load();

    patients.search(patients.searchTerm);

    if (patients.isActive() && patients.container) {
      patients.renderTable();
    }

    return patients.records;
  };

  /* =========================================================
     Navigation
     ========================================================= */

  patients.navigateToRegistration = function () {
    if (ROUTER?.navigate) {
      ROUTER.navigate('registration');
      return;
    }

    window.location.hash = '#registration';
  };

  /* =========================================================
     Module Registration
     ========================================================= */

  patients.register = function () {
    if (AURA_APP?.registerModule) {
      AURA_APP.registerModule('patients', patients);
    }

    if (ROUTER?.register) {
      ROUTER.register('patients', {
        path: 'patients',
        title: 'Patients',
        label: 'Patients',
        icon: 'patients',
        module: 'patients',
        permission: 'patients.view',
        render: patients.render
      });
    }
  };

  AURA.patients = patients;
  window.AURA_PATIENTS = patients;

  document.addEventListener('DOMContentLoaded', async function () {
    await patients.init();
    patients.register();
  });

})(window);