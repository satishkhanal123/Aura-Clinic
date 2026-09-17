/**
 * AURA Clinic
 * Doctor Consultation Module
 *
 * Responsibilities:
 * - Display patients ready for doctor consultation.
 * - Assign and manage doctor consultation queues.
 * - Record consultation notes, diagnosis, prescriptions, and lab orders.
 * - Maintain permanent encounter records linked to UHID.
 * - Move patients to laboratory, pharmacy, billing, or completed status.
 *
 * Storage stores used:
 * - patients
 * - queues
 * - encounters
 * - consultations
 * - prescriptions
 * - labOrders
 * - staff
 *
 * Global dependencies:
 * - window.AURA_CONFIG
 * - window.AURA_STORAGE
 * - window.AURA_EVENTS
 * - window.AURA_UTILS
 * - window.AURA_APP
 * - window.AURA_ROUTER
 */

(function () {
  'use strict';

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE || null;
  const EVENTS = window.AURA_EVENTS || null;
  const UTILS = window.AURA_UTILS || {};
  const AURA = window.AURA || {};

  const MODULE_NAME = 'doctor';

  const STORE = {
    patients: 'patients',
    queues: 'queues',
    encounters: 'encounters',
    consultations: 'consultations',
    prescriptions: 'prescriptions',
    labOrders: 'labOrders',
    staff: 'staff'
  };

  const STATUS = {
    WAITING: 'waiting',
    CALLED: 'called',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    SKIPPED: 'skipped',
    CANCELLED: 'cancelled'
  };

  const state = {
    isInitialized: false,
    isLoading: false,
    isSaving: false,

    queues: [],
    patients: [],
    encounters: [],
    consultations: [],
    prescriptions: [],
    labOrders: [],
    doctors: [],

    selectedQueue: null,
    selectedPatient: null,
    selectedEncounter: null,

    searchTerm: '',
    selectedStatus: 'all',
    selectedDoctor: 'all',
    selectedDepartment: 'all',

    currentView: 'list',

    filters: {
      date: 'today'
    }
  };

  const listeners = [];

  function getTodayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    if (typeof UTILS.createId === 'function') {
      return UTILS.createId(prefix || 'id');
    }

    return `${prefix || 'id'}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  function escapeHtml(value) {
    if (typeof UTILS.escapeHtml === 'function') {
      return UTILS.escapeHtml(value ?? '');
    }

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getPatientName(patient) {
    if (!patient) return 'Unknown Patient';

    if (patient.fullName) return patient.fullName;

    return [
      patient.firstName,
      patient.middleName,
      patient.lastName
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Unknown Patient';
  }

  function getPatientAge(patient) {
    if (typeof UTILS.getPatientAge === 'function') {
      return UTILS.getPatientAge(patient?.dateOfBirth);
    }

    if (!patient?.dateOfBirth) return '—';

    const birthDate = new Date(patient.dateOfBirth);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference = today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        today.getDate() < birthDate.getDate()
      )
    ) {
      age -= 1;
    }

    return Math.max(age, 0);
  }

  function getGender(patient) {
    return (
      patient?.gender ||
      patient?.sex ||
      'Not specified'
    );
  }

  function formatDateTime(value) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDate(value) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function showToast(message, type = 'info', title = '') {
    if (typeof window.AURA_APP?.toast === 'function') {
      try {
        window.AURA_APP.toast({
          type,
          title,
          message
        });
        return;
      } catch (error) {
        console.warn('AURA toast failed:', error);
      }
    }

    if (typeof AURA.toast === 'function') {
      try {
        AURA.toast({
          type,
          title,
          message
        });
        return;
      } catch (error) {
        console.warn('AURA toast failed:', error);
      }
    }

    console.log(`[${type}] ${title ? `${title}: ` : ''}${message}`);
  }

  function emit(eventName, detail = {}) {
    if (typeof EVENTS?.emit === 'function') {
      EVENTS.emit(eventName, detail);
    }

    try {
      document.dispatchEvent(
        new CustomEvent(`aura:${eventName}`, {
          detail
        })
      );
    } catch (error) {
      console.warn('Doctor event dispatch failed:', error);
    }
  }

  function announce(message) {
    if (!message || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-IN';
      utterance.rate = 0.9;
      utterance.pitch = 1;

      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn('Voice announcement failed:', error);
    }
  }

  function getElement(selector) {
    return document.querySelector(selector);
  }

  function getViewRoot() {
    return (
      getElement('[data-route-view="doctor"]') ||
      getElement('#app-content') ||
      getElement('#app')
    );
  }

  function getQueueDate(queue) {
    return (
      queue?.date ||
      queue?.queueDate ||
      queue?.createdAt?.slice?.(0, 10) ||
      ''
    );
  }

  function isTodayQueue(queue) {
    return getQueueDate(queue) === getTodayISO();
  }

  function isDoctorQueue(queue) {
    const stage = String(
      queue?.stage ||
      queue?.currentStage ||
      queue?.department ||
      ''
    ).toLowerCase();

    const nextStage = String(
      queue?.nextStage ||
      ''
    ).toLowerCase();

    const type = String(
      queue?.type ||
      queue?.queueType ||
      ''
    ).toLowerCase();

    return (
      stage.includes('doctor') ||
      stage.includes('consult') ||
      nextStage.includes('doctor') ||
      nextStage.includes('consult') ||
      type.includes('doctor') ||
      type.includes('consult')
    );
  }

  function isReadyForDoctor(queue) {
    const status = String(queue?.status || '').toLowerCase();

    const stage = String(
      queue?.stage ||
      queue?.currentStage ||
      queue?.nextStage ||
      ''
    ).toLowerCase();

    return (
      queue?.readyForDoctor === true ||
      queue?.doctorReady === true ||
      stage === 'doctor' ||
      stage === 'doctor-consultation' ||
      stage === 'consultation' ||
      (
        status === STATUS.WAITING &&
        isDoctorQueue(queue)
      )
    );
  }

  function isActiveDoctorQueue(queue) {
    const status = String(queue?.status || '').toLowerCase();

    return (
      status === STATUS.WAITING ||
      status === STATUS.CALLED ||
      status === STATUS.IN_PROGRESS
    );
  }

  function getQueuePatient(queue) {
    if (!queue) return null;

    const patientId =
      queue.patientId ||
      queue.patient_id ||
      queue.patient?.id;

    return (
      state.patients.find(patient => patient.id === patientId) ||
      queue.patient ||
      null
    );
  }

  function getQueueDoctorId(queue) {
    return (
      queue?.doctorId ||
      queue?.assignedDoctorId ||
      queue?.assignedTo ||
      ''
    );
  }

  function getDoctorName(doctorId) {
    if (!doctorId) return 'Unassigned';

    const doctor = state.doctors.find(item => item.id === doctorId);

    if (!doctor) return 'Assigned Doctor';

    return (
      doctor.fullName ||
      [
        doctor.firstName,
        doctor.middleName,
        doctor.lastName
      ]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      doctor.name ||
      doctor.displayName ||
      'Assigned Doctor'
    );
  }

  function getStatusLabel(status) {
    const labels = {
      waiting: 'Waiting',
      called: 'Called',
      'in-progress': 'In consultation',
      completed: 'Completed',
      skipped: 'Skipped',
      cancelled: 'Cancelled'
    };

    return labels[status] || status || 'Unknown';
  }

  function getStatusClass(status) {
    const classes = {
      waiting: 'status-warning',
      called: 'status-info',
      'in-progress': 'status-primary',
      completed: 'status-success',
      skipped: 'status-muted',
      cancelled: 'status-danger'
    };

    return classes[status] || 'status-muted';
  }

  function normalizeQueue(queue) {
    return {
      ...queue,
      id: queue.id,
      patientId: queue.patientId || queue.patient_id || '',
      tokenNumber:
        queue.tokenNumber ||
        queue.token ||
        queue.queueNumber ||
        '—',
      status: String(queue.status || STATUS.WAITING).toLowerCase(),
      stage: queue.stage || queue.currentStage || '',
      doctorId: getQueueDoctorId(queue),
      date: getQueueDate(queue)
    };
  }

  async function loadData() {
    if (!STORAGE) {
      console.warn('AURA_STORAGE is unavailable.');
      return;
    }

    state.isLoading = true;

    try {
      const [
        queues,
        patients,
        encounters,
        consultations,
        prescriptions,
        labOrders,
        staff
      ] = await Promise.all([
        STORAGE.getAll(STORE.queues),
        STORAGE.getAll(STORE.patients),
        STORAGE.getAll(STORE.encounters),
        STORAGE.getAll(STORE.consultations),
        STORAGE.getAll(STORE.prescriptions),
        STORAGE.getAll(STORE.labOrders),
        STORAGE.getAll(STORE.staff)
      ]);

      state.queues = Array.isArray(queues)
        ? queues.map(normalizeQueue)
        : [];

      state.patients = Array.isArray(patients)
        ? patients
        : [];

      state.encounters = Array.isArray(encounters)
        ? encounters
        : [];

      state.consultations = Array.isArray(consultations)
        ? consultations
        : [];

      state.prescriptions = Array.isArray(prescriptions)
        ? prescriptions
        : [];

      state.labOrders = Array.isArray(labOrders)
        ? labOrders
        : [];

      state.doctors = Array.isArray(staff)
        ? staff.filter(staffMember => {
            const role = String(
              staffMember.role ||
              staffMember.userRole ||
              ''
            ).toLowerCase();

            return (
              role.includes('doctor') ||
              role.includes('physician') ||
              staffMember.department === 'doctor'
            );
          })
        : [];

      state.isLoading = false;
    } catch (error) {
      state.isLoading = false;
      console.error('Doctor module loading failed:', error);
      showToast(
        'Unable to load the doctor workspace.',
        'error',
        'Loading Error'
      );
    }
  }

  function getFilteredQueues() {
    const search = state.searchTerm.trim().toLowerCase();

    return state.queues
      .filter(queue => {
        if (!isTodayQueue(queue)) return false;

        if (
          !isDoctorQueue(queue) &&
          !isReadyForDoctor(queue)
        ) {
          return false;
        }

        if (
          state.selectedStatus !== 'all' &&
          queue.status !== state.selectedStatus
        ) {
          return false;
        }

        if (
          state.selectedDoctor !== 'all' &&
          getQueueDoctorId(queue) !== state.selectedDoctor
        ) {
          return false;
        }

        if (
          state.selectedDepartment !== 'all' &&
          String(
            queue.department ||
            queue.specialty ||
            ''
          ).toLowerCase() !== state.selectedDepartment.toLowerCase()
        ) {
          return false;
        }

        if (!search) return true;

        const patient = getQueuePatient(queue);

        const haystack = [
          getPatientName(patient),
          patient?.uhid,
          patient?.phone,
          queue.tokenNumber,
          queue.id
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => {
        const statusOrder = {
          'in-progress': 0,
          called: 1,
          waiting: 2,
          completed: 3,
          skipped: 4,
          cancelled: 5
        };

        const statusDifference =
          (statusOrder[a.status] ?? 99) -
          (statusOrder[b.status] ?? 99);

        if (statusDifference !== 0) return statusDifference;

        return (
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
        );
      });
  }

  function getStats() {
    const queues = getFilteredQueues();

    return {
      total: queues.length,
      waiting: queues.filter(
        queue => queue.status === STATUS.WAITING
      ).length,
      called: queues.filter(
        queue => queue.status === STATUS.CALLED
      ).length,
      inProgress: queues.filter(
        queue => queue.status === STATUS.IN_PROGRESS
      ).length,
      completed: queues.filter(
        queue => queue.status === STATUS.COMPLETED
      ).length
    };
  }

  function getPatientEncounter(patientId) {
    if (!patientId) return null;

    const encounters = state.encounters
      .filter(encounter => {
        return (
          encounter.patientId === patientId ||
          encounter.patient_id === patientId
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || b.encounterDate || 0).getTime() -
          new Date(a.createdAt || a.encounterDate || 0).getTime()
        );
      });

    return encounters[0] || null;
  }

  function getPatientVitals(patientId) {
    if (!patientId) return null;

    const vitals = [];

    state.encounters.forEach(encounter => {
      if (
        encounter.patientId === patientId ||
        encounter.patient_id === patientId
      ) {
        if (encounter.vitals) {
          vitals.push({
            ...encounter.vitals,
            recordedAt: encounter.updatedAt || encounter.createdAt
          });
        }
      }
    });

    return vitals.sort((a, b) => {
      return (
        new Date(b.recordedAt || 0).getTime() -
        new Date(a.recordedAt || 0).getTime()
      );
    })[0] || null;
  }

  function getPatientLabResults(patientId) {
    return state.labOrders
      .filter(order => {
        return (
          order.patientId === patientId ||
          order.patient_id === patientId
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      });
  }

  function render() {
    const root = getViewRoot();

    if (!root) return;

    if (state.currentView === 'consultation') {
      renderConsultationWorkspace(root);
      return;
    }

    renderDoctorDesk(root);
  }

  function renderDoctorDesk(root) {
    const stats = getStats();
    const queues = getFilteredQueues();

    root.innerHTML = `
      <section class="doctor-module" data-module="${MODULE_NAME}">
        ${renderPageHeader()}
        ${renderStats(stats)}
        ${renderFilters()}
        ${renderQueueTable(queues)}
      </section>
    `;

    bindDeskEvents(root);
  }

  function renderPageHeader() {
    return `
      <header class="page-header doctor-page-header">
        <div class="page-header__main">
          <div class="page-header__eyebrow">
            Clinical Workspace
          </div>

          <h1 class="page-header__title">
            Doctor Consultation
          </h1>

          <p class="page-header__subtitle">
            Review patients, conduct consultations, and maintain clinical records.
          </p>
        </div>

        <div class="page-header__actions">
          <button
            class="btn btn-secondary"
            type="button"
            data-doctor-action="refresh"
          >
            <span class="icon">↻</span>
            Refresh
          </button>

          <button
            class="btn btn-primary"
            type="button"
            data-doctor-action="call-next"
          >
            <span class="icon">→</span>
            Call Next Patient
          </button>
        </div>
      </header>
    `;
  }

  function renderStats(stats) {
    return `
      <div class="queue-stats-grid doctor-stats-grid">
        <article class="metric-card">
          <div class="metric-card__icon">👥</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Today's Queue</span>
            <strong class="metric-card__value">${stats.total}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">⏳</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Waiting</span>
            <strong class="metric-card__value">${stats.waiting}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">🩺</div>
          <div class="metric-card__body">
            <span class="metric-card__label">In Consultation</span>
            <strong class="metric-card__value">${stats.inProgress}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">✓</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Completed</span>
            <strong class="metric-card__value">${stats.completed}</strong>
          </div>
        </article>
      </div>
    `;
  }

  function renderFilters() {
    const doctors = state.doctors
      .map(doctor => {
        const id = escapeHtml(doctor.id);
        const name = escapeHtml(
          doctor.fullName ||
          doctor.name ||
          [
            doctor.firstName,
            doctor.middleName,
            doctor.lastName
          ]
            .filter(Boolean)
            .join(' ') ||
          'Doctor'
        );

        return `
          <option
            value="${id}"
            ${state.selectedDoctor === doctor.id ? 'selected' : ''}
          >
            ${name}
          </option>
        `;
      })
      .join('');

    return `
      <div class="workspace-toolbar doctor-toolbar">
        <div class="workspace-toolbar__search">
          <label class="sr-only" for="doctor-search">
            Search patients
          </label>

          <input
            id="doctor-search"
            class="form-control"
            type="search"
            placeholder="Search patient, UHID, phone, or token..."
            value="${escapeHtml(state.searchTerm)}"
            data-doctor-field="search"
          />
        </div>

        <div class="workspace-toolbar__filters">
          <label class="sr-only" for="doctor-status-filter">
            Filter by status
          </label>

          <select
            id="doctor-status-filter"
            class="form-control"
            data-doctor-field="status"
          >
            <option value="all" ${state.selectedStatus === 'all' ? 'selected' : ''}>
              All Statuses
            </option>
            <option value="waiting" ${state.selectedStatus === 'waiting' ? 'selected' : ''}>
              Waiting
            </option>
            <option value="called" ${state.selectedStatus === 'called' ? 'selected' : ''}>
              Called
            </option>
            <option value="in-progress" ${state.selectedStatus === 'in-progress' ? 'selected' : ''}>
              In Consultation
            </option>
            <option value="completed" ${state.selectedStatus === 'completed' ? 'selected' : ''}>
              Completed
            </option>
          </select>

          <label class="sr-only" for="doctor-assignee-filter">
            Filter by doctor
          </label>

          <select
            id="doctor-assignee-filter"
            class="form-control"
            data-doctor-field="doctor"
          >
            <option value="all">
              All Doctors
            </option>
            ${doctors}
          </select>
        </div>
      </div>
    `;
  }

  function renderQueueTable(queues) {
    if (state.isLoading) {
      return `
        <div class="empty-state">
          <div class="empty-state__icon">⏳</div>
          <h3>Loading doctor queue</h3>
          <p>Please wait while today's consultation queue is loaded.</p>
        </div>
      `;
    }

    if (!queues.length) {
      return `
        <div class="empty-state">
          <div class="empty-state__icon">🩺</div>
          <h3>No patients in the consultation queue</h3>
          <p>
            Patients completed from pre-consultation will appear here.
          </p>
        </div>
      `;
    }

    return `
      <section class="data-card doctor-queue-card">
        <div class="data-card__header">
          <div>
            <h2 class="data-card__title">Today's Consultation Queue</h2>
            <p class="data-card__subtitle">
              ${queues.length} patient${queues.length === 1 ? '' : 's'} ready for review
            </p>
          </div>

          <span class="badge badge-neutral">
            ${formatDate(getTodayISO())}
          </span>
        </div>

        <div class="table-wrapper">
          <table class="data-table doctor-queue-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>UHID</th>
                <th>Age / Gender</th>
                <th>Doctor</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              ${queues.map(renderQueueRow).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderQueueRow(queue) {
    const patient = getQueuePatient(queue);

    const patientId = escapeHtml(patient?.id || queue.patientId || '');
    const patientName = escapeHtml(getPatientName(patient));
    const uhid = escapeHtml(patient?.uhid || '—');
    const token = escapeHtml(queue.tokenNumber || '—');
    const age = escapeHtml(getPatientAge(patient));
    const gender = escapeHtml(getGender(patient));
    const doctorName = escapeHtml(getDoctorName(queue.doctorId));
    const status = escapeHtml(queue.status);

    const primaryAction =
      queue.status === STATUS.IN_PROGRESS
        ? 'continue'
        : queue.status === STATUS.COMPLETED
          ? 'view'
          : 'start';

    const primaryLabel =
      primaryAction === 'continue'
        ? 'Continue'
        : primaryAction === 'view'
          ? 'View'
          : 'Start';

    return `
      <tr data-queue-row="${escapeHtml(queue.id)}">
        <td>
          <span class="token-badge">${token}</span>
        </td>

        <td>
          <button
            type="button"
            class="table-link patient-name-link"
            data-doctor-action="open-patient"
            data-patient-id="${patientId}"
          >
            ${patientName}
          </button>
        </td>

        <td>${uhid}</td>

        <td>
          ${age === '—' ? '—' : `${age} years`}
          <span class="muted-text"> · ${gender}</span>
        </td>

        <td>${doctorName}</td>

        <td>
          <span class="status-badge ${getStatusClass(queue.status)}">
            ${getStatusLabel(queue.status)}
          </span>
        </td>

        <td>
          <div class="table-actions">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              data-doctor-action="${primaryAction}"
              data-queue-id="${escapeHtml(queue.id)}"
            >
              ${primaryLabel}
            </button>

            ${
              queue.status !== STATUS.COMPLETED
                ? `
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost"
                    data-doctor-action="skip"
                    data-queue-id="${escapeHtml(queue.id)}"
                    aria-label="Skip patient"
                  >
                    Skip
                  </button>
                `
                : ''
            }
          </div>
        </td>
      </tr>
    `;
  }

  function bindDeskEvents(root) {
    root.querySelectorAll('[data-doctor-field="search"]').forEach(input => {
      input.addEventListener('input', event => {
        state.searchTerm = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-doctor-field="status"]').forEach(select => {
      select.addEventListener('change', event => {
        state.selectedStatus = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-doctor-field="doctor"]').forEach(select => {
      select.addEventListener('change', event => {
        state.selectedDoctor = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-doctor-action]').forEach(button => {
      button.addEventListener('click', handleDeskAction);
    });
  }

  async function handleDeskAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.doctorAction;
    const queueId = button.dataset.queueId;
    const patientId = button.dataset.patientId;

    switch (action) {
      case 'refresh':
        await refresh();
        break;

      case 'call-next':
        await callNextPatient();
        break;

      case 'start':
        await startConsultation(queueId);
        break;

      case 'continue':
        await openConsultation(queueId);
        break;

      case 'view':
        await openConsultation(queueId);
        break;

      case 'skip':
        await skipQueue(queueId);
        break;

      case 'open-patient':
        await openPatientProfile(patientId);
        break;

      default:
        break;
    }
  }

  async function callNextPatient() {
    const nextQueue = getFilteredQueues().find(queue => {
      return queue.status === STATUS.WAITING;
    });

    if (!nextQueue) {
      showToast(
        'There are no waiting patients in the doctor queue.',
        'info',
        'Queue Clear'
      );
      return;
    }

    await callPatient(nextQueue.id);
  }

  async function callPatient(queueId) {
    const queue = state.queues.find(item => item.id === queueId);

    if (!queue) return;

    const patient = getQueuePatient(queue);

    queue.status = STATUS.CALLED;
    queue.calledAt = nowISO();
    queue.updatedAt = nowISO();
    queue.lastCalledAt = nowISO();

    await STORAGE.put(STORE.queues, queue);

    announce(
      `Token ${queue.tokenNumber || ''}. ${getPatientName(patient)}. Please proceed to the doctor consultation room.`
    );

    emit('queueCalled', {
      queue,
      patient,
      module: MODULE_NAME
    });

    showToast(
      `${getPatientName(patient)} has been called.`,
      'success',
      'Patient Called'
    );

    await refresh();
  }

  async function startConsultation(queueId) {
    const queue = state.queues.find(item => item.id === queueId);

    if (!queue) return;

    const patient = getQueuePatient(queue);

    if (!patient) {
      showToast(
        'The patient record could not be found.',
        'error',
        'Patient Missing'
      );
      return;
    }

    queue.status = STATUS.IN_PROGRESS;
    queue.stage = 'doctor-consultation';
    queue.currentStage = 'doctor-consultation';
    queue.startedAt = nowISO();
    queue.updatedAt = nowISO();

    await STORAGE.put(STORE.queues, queue);

    state.selectedQueue = queue;
    state.selectedPatient = patient;
    state.selectedEncounter = getPatientEncounter(patient.id);

    emit('queueStarted', {
      queue,
      patient,
      module: MODULE_NAME
    });

    state.currentView = 'consultation';
    render();
  }

  async function openConsultation(queueId) {
    const queue = state.queues.find(item => item.id === queueId);

    if (!queue) return;

    const patient = getQueuePatient(queue);

    if (!patient) {
      showToast(
        'The patient record could not be found.',
        'error',
        'Patient Missing'
      );
      return;
    }

    state.selectedQueue = queue;
    state.selectedPatient = patient;
    state.selectedEncounter = getPatientEncounter(patient.id);

    state.currentView = 'consultation';
    render();
  }

  async function skipQueue(queueId) {
    const queue = state.queues.find(item => item.id === queueId);

    if (!queue) return;

    const patient = getQueuePatient(queue);

    if (!window.confirm(
      `Skip ${getPatientName(patient)} from the doctor queue?`
    )) {
      return;
    }

    queue.status = STATUS.SKIPPED;
    queue.skippedAt = nowISO();
    queue.updatedAt = nowISO();

    await STORAGE.put(STORE.queues, queue);

    emit('queueSkipped', {
      queue,
      patient,
      module: MODULE_NAME
    });

    showToast(
      `${getPatientName(patient)} was skipped.`,
      'warning',
      'Queue Updated'
    );

    await refresh();
  }

  function renderConsultationWorkspace(root) {
    const queue = state.selectedQueue;
    const patient = state.selectedPatient;

    if (!queue || !patient) {
      state.currentView = 'list';
      render();
      return;
    }

    const encounter = state.selectedEncounter;
    const vitals = getPatientVitals(patient.id);
    const previousLabOrders = getPatientLabResults(patient.id);

    root.innerHTML = `
      <section class="doctor-module doctor-consultation-module">
        ${renderConsultationHeader(patient, queue)}

        <div class="consultation-layout">
          <aside class="consultation-sidebar">
            ${renderPatientSummary(patient)}
            ${renderVitalsSummary(vitals)}
            ${renderClinicalHistory(patient)}
            ${renderRecentLabResults(previousLabOrders)}
          </aside>

          <main class="consultation-main">
            ${renderConsultationForm(patient, queue, encounter)}
          </main>
        </div>
      </section>
    `;

    bindConsultationEvents(root);
  }

  function renderConsultationHeader(patient, queue) {
    return `
      <header class="page-header doctor-consultation-header">
        <div class="page-header__main">
          <button
            type="button"
            class="btn btn-ghost btn-back"
            data-doctor-action="back-to-queue"
          >
            ← Back to Queue
          </button>

          <div class="page-header__eyebrow">
            Consultation Workspace
          </div>

          <h1 class="page-header__title">
            ${escapeHtml(getPatientName(patient))}
          </h1>

          <p class="page-header__subtitle">
            UHID: ${escapeHtml(patient.uhid || 'Not assigned')}
            · Token: ${escapeHtml(queue.tokenNumber || '—')}
          </p>
        </div>

        <div class="page-header__actions">
          <span class="status-badge ${getStatusClass(queue.status)}">
            ${getStatusLabel(queue.status)}
          </span>
        </div>
      </header>
    `;
  }

  function renderPatientSummary(patient) {
    return `
      <section class="clinical-sidebar-card patient-summary-card">
        <div class="clinical-sidebar-card__header">
          <span class="clinical-sidebar-card__eyebrow">
            Patient Profile
          </span>
        </div>

        <div class="patient-profile-compact">
          <div class="patient-avatar patient-avatar--large">
            ${escapeHtml(
              typeof UTILS.initials === 'function'
                ? UTILS.initials(getPatientName(patient))
                : getPatientName(patient).slice(0, 2).toUpperCase()
            )}
          </div>

          <div>
            <h2>${escapeHtml(getPatientName(patient))}</h2>
            <p>${escapeHtml(patient.uhid || 'UHID not available')}</p>
          </div>
        </div>

        <dl class="clinical-definition-list">
          <div>
            <dt>Age</dt>
            <dd>${escapeHtml(getPatientAge(patient))}</dd>
          </div>

          <div>
            <dt>Gender</dt>
            <dd>${escapeHtml(getGender(patient))}</dd>
          </div>

          <div>
            <dt>Phone</dt>
            <dd>${escapeHtml(patient.phone || '—')}</dd>
          </div>

          <div>
            <dt>Blood Group</dt>
            <dd>${escapeHtml(patient.bloodGroup || '—')}</dd>
          </div>
        </dl>
      </section>
    `;
  }

  function renderVitalsSummary(vitals) {
    if (!vitals) {
      return `
        <section class="clinical-sidebar-card">
          <div class="clinical-sidebar-card__header">
            <span class="clinical-sidebar-card__eyebrow">
              Latest Vitals
            </span>
          </div>

          <div class="empty-state empty-state--small">
            <p>No vitals recorded.</p>
          </div>
        </section>
      `;
    }

    return `
      <section class="clinical-sidebar-card">
        <div class="clinical-sidebar-card__header">
          <span class="clinical-sidebar-card__eyebrow">
            Latest Vitals
          </span>

          <span class="muted-text">
            ${formatDate(vitals.recordedAt)}
          </span>
        </div>

        <div class="vitals-mini-grid">
          <div>
            <span>BP</span>
            <strong>${escapeHtml(vitals.bloodPressure || '—')}</strong>
          </div>

          <div>
            <span>Pulse</span>
            <strong>${escapeHtml(vitals.pulse || vitals.heartRate || '—')}</strong>
          </div>

          <div>
            <span>Temp.</span>
            <strong>${escapeHtml(vitals.temperature || '—')}</strong>
          </div>

          <div>
            <span>SpO₂</span>
            <strong>${escapeHtml(vitals.spo2 || vitals.oxygenSaturation || '—')}</strong>
          </div>

          <div>
            <span>Weight</span>
            <strong>${escapeHtml(vitals.weight || '—')}</strong>
          </div>

          <div>
            <span>BMI</span>
            <strong>${escapeHtml(vitals.bmi || '—')}</strong>
          </div>
        </div>
      </section>
    `;
  }

  function renderClinicalHistory(patient) {
    const history = state.encounters
      .filter(encounter => {
        return (
          encounter.patientId === patient.id ||
          encounter.patient_id === patient.id
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      })
      .slice(0, 5);

    return `
      <section class="clinical-sidebar-card">
        <div class="clinical-sidebar-card__header">
          <span class="clinical-sidebar-card__eyebrow">
            Clinical History
          </span>
        </div>

        ${
          history.length
            ? `
              <div class="timeline-list">
                ${history.map(encounter => `
                  <div class="timeline-item">
                    <div class="timeline-item__marker"></div>

                    <div class="timeline-item__content">
                      <strong>
                        ${escapeHtml(
                          encounter.diagnosis ||
                          encounter.chiefComplaint ||
                          'Clinical Encounter'
                        )}
                      </strong>

                      <span>
                        ${formatDate(
                          encounter.encounterDate ||
                          encounter.createdAt
                        )}
                      </span>
                    </div>
                  </div>
                `).join('')}
              </div>
            `
            : `
              <p class="muted-text">
                No previous encounters found.
              </p>
            `
        }
      </section>
    `;
  }

  function renderRecentLabResults(orders) {
    return `
      <section class="clinical-sidebar-card">
        <div class="clinical-sidebar-card__header">
          <span class="clinical-sidebar-card__eyebrow">
            Recent Laboratory Orders
          </span>
        </div>

        ${
          orders.length
            ? `
              <div class="compact-list">
                ${orders.slice(0, 5).map(order => `
                  <div class="compact-list__item">
                    <div>
                      <strong>
                        ${escapeHtml(
                          order.testName ||
                          order.serviceName ||
                          order.name ||
                          'Laboratory Test'
                        )}
                      </strong>

                      <span>
                        ${formatDate(order.createdAt)}
                      </span>
                    </div>

                    <span class="status-badge ${getLabStatusClass(order.status)}">
                      ${escapeHtml(order.status || 'Ordered')}
                    </span>
                  </div>
                `).join('')}
              </div>
            `
            : `
              <p class="muted-text">
                No laboratory orders found.
              </p>
            `
        }
      </section>
    `;
  }

  function getLabStatusClass(status) {
    const normalized = String(status || '').toLowerCase();

    if (
      normalized.includes('complete') ||
      normalized.includes('verified')
    ) {
      return 'status-success';
    }

    if (
      normalized.includes('pending') ||
      normalized.includes('ordered')
    ) {
      return 'status-warning';
    }

    return 'status-muted';
  }

  function renderConsultationForm(patient, queue, encounter) {
    const existing = getExistingConsultation(patient.id, queue.id);

    return `
      <form
        class="consultation-form"
        id="doctor-consultation-form"
        data-queue-id="${escapeHtml(queue.id)}"
        data-patient-id="${escapeHtml(patient.id)}"
      >
        <section class="clinical-form-card">
          <div class="clinical-form-card__header">
            <div>
              <span class="clinical-form-card__eyebrow">
                Step 1
              </span>

              <h2>Clinical Assessment</h2>

              <p>
                Document the patient's symptoms, examination findings, and clinical impression.
              </p>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <div class="form-field form-field--full">
              <label for="chief-complaint">
                Chief Complaint <span class="required">*</span>
              </label>

              <textarea
                id="chief-complaint"
                name="chiefComplaint"
                class="form-control"
                rows="3"
                required
                placeholder="Reason for today's visit..."
              >${escapeHtml(
                existing?.chiefComplaint ||
                encounter?.chiefComplaint ||
                ''
              )}</textarea>
            </div>

            <div class="form-field form-field--full">
              <label for="history-present-illness">
                History of Present Illness
              </label>

              <textarea
                id="history-present-illness"
                name="historyOfPresentIllness"
                class="form-control"
                rows="4"
                placeholder="Duration, symptoms, progression, relevant history..."
              >${escapeHtml(
                existing?.historyOfPresentIllness ||
                encounter?.historyOfPresentIllness ||
                ''
              )}</textarea>
            </div>

            <div class="form-field form-field--full">
              <label for="examination-findings">
                Examination Findings
              </label>

              <textarea
                id="examination-findings"
                name="examinationFindings"
                class="form-control"
                rows="4"
                placeholder="General examination and system-specific findings..."
              >${escapeHtml(
                existing?.examinationFindings ||
                encounter?.examinationFindings ||
                ''
              )}</textarea>
            </div>

            <div class="form-field form-field--full">
              <label for="diagnosis">
                Diagnosis / Clinical Impression <span class="required">*</span>
              </label>

              <textarea
                id="diagnosis"
                name="diagnosis"
                class="form-control"
                rows="3"
                required
                placeholder="Primary diagnosis or clinical impression..."
              >${escapeHtml(
                existing?.diagnosis ||
                encounter?.diagnosis ||
                ''
              )}</textarea>
            </div>

            <div class="form-field form-field--full">
              <label for="additional-notes">
                Additional Clinical Notes
              </label>

              <textarea
                id="additional-notes"
                name="clinicalNotes"
                class="form-control"
                rows="3"
                placeholder="Additional observations, instructions, or follow-up notes..."
              >${escapeHtml(
                existing?.clinicalNotes ||
                encounter?.clinicalNotes ||
                ''
              )}</textarea>
            </div>
          </div>
        </section>

        ${renderPrescriptionSection(existing)}

        ${renderLabOrderSection(existing)}

        <section class="clinical-form-card consultation-final-card">
          <div class="clinical-form-card__header">
            <div>
              <span class="clinical-form-card__eyebrow">
                Final Review
              </span>

              <h2>Consultation Outcome</h2>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <div class="form-field">
              <label for="follow-up-date">
                Follow-up Date
              </label>

              <input
                id="follow-up-date"
                name="followUpDate"
                class="form-control"
                type="date"
                value="${escapeHtml(existing?.followUpDate || '')}"
              />
            </div>

            <div class="form-field">
              <label for="consultation-status">
                Outcome
              </label>

              <select
                id="consultation-status"
                name="outcome"
                class="form-control"
              >
                <option value="completed" selected>Consultation Completed</option>
                <option value="follow-up">Follow-up Required</option>
                <option value="referred">Referred to Another Department</option>
                <option value="admitted">Admission Recommended</option>
              </select>
            </div>

            <div class="form-field form-field--full">
              <label for="referral-notes">
                Referral / Follow-up Instructions
              </label>

              <textarea
                id="referral-notes"
                name="referralNotes"
                class="form-control"
                rows="3"
                placeholder="Instructions for follow-up, referral, or admission..."
              >${escapeHtml(existing?.referralNotes || '')}</textarea>
            </div>
          </div>
        </section>

        <div class="consultation-form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-doctor-action="back-to-queue"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-primary"
            data-doctor-action="complete-consultation"
          >
            Complete Consultation
          </button>
        </div>
      </form>
    `;
  }

  function getExistingConsultation(patientId, queueId) {
    return state.consultations
      .filter(consultation => {
        const matchesPatient =
          consultation.patientId === patientId ||
          consultation.patient_id === patientId;

        const matchesQueue =
          !queueId ||
          consultation.queueId === queueId ||
          consultation.queue_id === queueId;

        return matchesPatient && matchesQueue;
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      })[0] || null;
  }

  function renderPrescriptionSection(existing) {
    const prescriptions = existing?.prescriptions || [];

    return `
      <section class="clinical-form-card">
        <div class="clinical-form-card__header">
          <div>
            <span class="clinical-form-card__eyebrow">
              Step 2
            </span>

            <h2>Prescription</h2>

            <p>
              Add medicines and instructions for the pharmacy.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-doctor-action="add-medicine"
          >
            + Add Medicine
          </button>
        </div>

        <div
          class="prescription-list"
          data-prescription-list
        >
          ${
            prescriptions.length
              ? prescriptions.map(renderPrescriptionRow).join('')
              : renderPrescriptionRow()
          }
        </div>
      </section>
    `;
  }

  function renderPrescriptionRow(prescription = {}) {
    return `
      <div class="prescription-row" data-prescription-row>
        <div class="form-field">
          <label>Medicine</label>

          <input
            class="form-control"
            type="text"
            name="medicineName"
            value="${escapeHtml(prescription.medicineName || '')}"
            placeholder="Medicine name"
          />
        </div>

        <div class="form-field">
          <label>Strength</label>

          <input
            class="form-control"
            type="text"
            name="strength"
            value="${escapeHtml(prescription.strength || '')}"
            placeholder="500 mg"
          />
        </div>

        <div class="form-field">
          <label>Dosage</label>

          <input
            class="form-control"
            type="text"
            name="dosage"
            value="${escapeHtml(prescription.dosage || '')}"
            placeholder="1 tablet"
          />
        </div>

        <div class="form-field">
          <label>Frequency</label>

          <select class="form-control" name="frequency">
            <option value="">Select</option>
            <option value="OD" ${prescription.frequency === 'OD' ? 'selected' : ''}>
              OD — Once daily
            </option>
            <option value="BD" ${prescription.frequency === 'BD' ? 'selected' : ''}>
              BD — Twice daily
            </option>
            <option value="TDS" ${prescription.frequency === 'TDS' ? 'selected' : ''}>
              TDS — Three times daily
            </option>
            <option value="QID" ${prescription.frequency === 'QID' ? 'selected' : ''}>
              QID — Four times daily
            </option>
            <option value="SOS" ${prescription.frequency === 'SOS' ? 'selected' : ''}>
              SOS — As needed
            </option>
            <option value="HS" ${prescription.frequency === 'HS' ? 'selected' : ''}>
              HS — At bedtime
            </option>
          </select>
        </div>

        <div class="form-field">
          <label>Duration</label>

          <input
            class="form-control"
            type="text"
            name="duration"
            value="${escapeHtml(prescription.duration || '')}"
            placeholder="5 days"
          />
        </div>

        <div class="form-field">
          <label>Route</label>

          <select class="form-control" name="route">
            <option value="">Select</option>
            <option value="oral" ${prescription.route === 'oral' ? 'selected' : ''}>
              Oral
            </option>
            <option value="topical" ${prescription.route === 'topical' ? 'selected' : ''}>
              Topical
            </option>
            <option value="injection" ${prescription.route === 'injection' ? 'selected' : ''}>
              Injection
            </option>
            <option value="inhalation" ${prescription.route === 'inhalation' ? 'selected' : ''}>
              Inhalation
            </option>
            <option value="other" ${prescription.route === 'other' ? 'selected' : ''}>
              Other
            </option>
          </select>
        </div>

        <div class="form-field prescription-row__notes">
          <label>Instructions</label>

          <input
            class="form-control"
            type="text"
            name="instructions"
            value="${escapeHtml(prescription.instructions || '')}"
            placeholder="After food, before sleep, etc."
          />
        </div>

        <button
          type="button"
          class="btn btn-icon btn-ghost prescription-remove-button"
          data-doctor-action="remove-medicine"
          aria-label="Remove medicine"
          title="Remove medicine"
        >
          ×
        </button>
      </div>
    `;
  }

  function renderLabOrderSection(existing) {
    const orders = existing?.labOrders || [];

    return `
      <section class="clinical-form-card">
        <div class="clinical-form-card__header">
          <div>
            <span class="clinical-form-card__eyebrow">
              Step 3
            </span>

            <h2>Laboratory / Diagnostic Orders</h2>

            <p>
              Request pathology, radiology, or other diagnostic services.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-doctor-action="add-lab-order"
          >
            + Add Test
          </button>
        </div>

        <div
          class="lab-order-list"
          data-lab-order-list
        >
          ${
            orders.length
              ? orders.map(renderLabOrderRow).join('')
              : renderLabOrderRow()
          }
        </div>
      </section>
    `;
  }

  function renderLabOrderRow(order = {}) {
    return `
      <div class="lab-order-row" data-lab-order-row>
        <div class="form-field">
          <label>Department</label>

          <select class="form-control" name="department">
            <option value="">Select Department</option>
            <option value="pathology" ${order.department === 'pathology' ? 'selected' : ''}>
              Pathology
            </option>
            <option value="radiology" ${order.department === 'radiology' ? 'selected' : ''}>
              Radiology
            </option>
            <option value="laboratory" ${order.department === 'laboratory' ? 'selected' : ''}>
              Laboratory
            </option>
          </select>
        </div>

        <div class="form-field">
          <label>Test / Investigation</label>

          <input
            class="form-control"
            type="text"
            name="testName"
            value="${escapeHtml(order.testName || '')}"
            placeholder="CBC, X-Ray, LFT, etc."
          />
        </div>

        <div class="form-field">
          <label>Priority</label>

          <select class="form-control" name="priority">
            <option value="routine" ${order.priority === 'routine' ? 'selected' : ''}>
              Routine
            </option>
            <option value="urgent" ${order.priority === 'urgent' ? 'selected' : ''}>
              Urgent
            </option>
            <option value="stat" ${order.priority === 'stat' ? 'selected' : ''}>
              STAT
            </option>
          </select>
        </div>

        <div class="form-field lab-order-row__notes">
          <label>Clinical Notes</label>

          <input
            class="form-control"
            type="text"
            name="clinicalNotes"
            value="${escapeHtml(order.clinicalNotes || '')}"
            placeholder="Relevant clinical information"
          />
        </div>

        <button
          type="button"
          class="btn btn-icon btn-ghost lab-order-remove-button"
          data-doctor-action="remove-lab-order"
          aria-label="Remove laboratory order"
          title="Remove laboratory order"
        >
          ×
        </button>
      </div>
    `;
  }

  function bindConsultationEvents(root) {
    root.querySelectorAll('[data-doctor-action]').forEach(button => {
      button.addEventListener('click', handleConsultationAction);
    });

    const form = root.querySelector('#doctor-consultation-form');

    if (form) {
      form.addEventListener('submit', handleConsultationSubmit);
    }
  }

  async function handleConsultationAction(event) {
    const action = event.currentTarget.dataset.doctorAction;

    switch (action) {
      case 'back-to-queue':
        state.currentView = 'list';
        state.selectedQueue = null;
        state.selectedPatient = null;
        state.selectedEncounter = null;
        render();
        break;

      case 'add-medicine':
        addPrescriptionRow();
        break;

      case 'remove-medicine':
        event.currentTarget
          .closest('[data-prescription-row]')
          ?.remove();
        break;

      case 'add-lab-order':
        addLabOrderRow();
        break;

      case 'remove-lab-order':
        event.currentTarget
          .closest('[data-lab-order-row]')
          ?.remove();
        break;

      case 'complete-consultation':
        break;

      default:
        break;
    }
  }

  function addPrescriptionRow() {
    const list = getElement('[data-prescription-list]');

    if (!list) return;

    list.insertAdjacentHTML(
      'beforeend',
      renderPrescriptionRow()
    );
  }

  function addLabOrderRow() {
    const list = getElement('[data-lab-order-list]');

    if (!list) return;

    list.insertAdjacentHTML(
      'beforeend',
      renderLabOrderRow()
    );
  }

  function collectPrescriptionRows(root) {
    return Array.from(
      root.querySelectorAll('[data-prescription-row]')
    )
      .map(row => {
        const getValue = name => {
          return row.querySelector(`[name="${name}"]`)?.value.trim() || '';
        };

        return {
          medicineName: getValue('medicineName'),
          strength: getValue('strength'),
          dosage: getValue('dosage'),
          frequency: getValue('frequency'),
          duration: getValue('duration'),
          route: getValue('route'),
          instructions: getValue('instructions')
        };
      })
      .filter(item => item.medicineName);
  }

  function collectLabOrderRows(root) {
    return Array.from(
      root.querySelectorAll('[data-lab-order-row]')
    )
      .map(row => {
        const getValue = name => {
          return row.querySelector(`[name="${name}"]`)?.value.trim() || '';
        };

        return {
          department: getValue('department'),
          testName: getValue('testName'),
          priority: getValue('priority') || 'routine',
          clinicalNotes: getValue('clinicalNotes')
        };
      })
      .filter(item => item.testName);
  }

  function validateConsultation(data) {
    const errors = [];

    if (!data.chiefComplaint.trim()) {
      errors.push('Chief Complaint is required.');
    }

    if (!data.diagnosis.trim()) {
      errors.push('Diagnosis / Clinical Impression is required.');
    }

    return errors;
  }

  async function handleConsultationSubmit(event) {
    event.preventDefault();

    if (state.isSaving) return;

    const form = event.currentTarget;

    const queueId = form.dataset.queueId;
    const patientId = form.dataset.patientId;

    const queue = state.queues.find(item => item.id === queueId);
    const patient = state.patients.find(item => item.id === patientId);

    if (!queue || !patient) {
      showToast(
        'Unable to identify the consultation patient.',
        'error',
        'Save Error'
      );
      return;
    }

    const formData = new FormData(form);

    const consultationData = {
      chiefComplaint: String(
        formData.get('chiefComplaint') || ''
      ).trim(),

      historyOfPresentIllness: String(
        formData.get('historyOfPresentIllness') || ''
      ).trim(),

      examinationFindings: String(
        formData.get('examinationFindings') || ''
      ).trim(),

      diagnosis: String(
        formData.get('diagnosis') || ''
      ).trim(),

      clinicalNotes: String(
        formData.get('clinicalNotes') || ''
      ).trim(),

      followUpDate: String(
        formData.get('followUpDate') || ''
      ).trim(),

      outcome: String(
        formData.get('outcome') || 'completed'
      ).trim(),

      referralNotes: String(
        formData.get('referralNotes') || ''
      ).trim(),

      prescriptions: collectPrescriptionRows(form),

      labOrders: collectLabOrderRows(form)
    };

    const errors = validateConsultation(consultationData);

    if (errors.length) {
      showToast(
        errors.join(' '),
        'warning',
        'Check Consultation'
      );
      return;
    }

    state.isSaving = true;

    try {
      const timestamp = nowISO();

      const encounter = await saveEncounter({
        patient,
        queue,
        consultationData,
        timestamp
      });

      const consultation = await saveConsultation({
        patient,
        queue,
        encounter,
        consultationData,
        timestamp
      });

      await savePrescriptions({
        patient,
        queue,
        encounter,
        consultation,
        prescriptions: consultationData.prescriptions,
        timestamp
      });

      await saveLabOrders({
        patient,
        queue,
        encounter,
        consultation,
        labOrders: consultationData.labOrders,
        timestamp
      });

      await completeDoctorQueue({
        queue,
        patient,
        encounter,
        consultation,
        consultationData,
        timestamp
      });

      state.isSaving = false;

      emit('consultationCompleted', {
        patient,
        queue,
        encounter,
        consultation,
        module: MODULE_NAME
      });

      showToast(
        `Consultation for ${getPatientName(patient)} has been saved.`,
        'success',
        'Consultation Completed'
      );

      state.currentView = 'list';
      state.selectedQueue = null;
      state.selectedPatient = null;
      state.selectedEncounter = null;

      await refresh();
    } catch (error) {
      state.isSaving = false;

      console.error('Consultation save failed:', error);

      showToast(
        'The consultation could not be saved. Please try again.',
        'error',
        'Save Error'
      );
    }
  }

  async function saveEncounter({
    patient,
    queue,
    consultationData,
    timestamp
  }) {
    const existingEncounter = getPatientEncounter(patient.id);

    const encounter = {
      ...(existingEncounter || {}),
      id: existingEncounter?.id || createId('enc'),
      patientId: patient.id,
      uhid: patient.uhid || '',
      queueId: queue.id,
      encounterDate: timestamp,
      consultationDate: timestamp,
      doctorId: getQueueDoctorId(queue) || '',
      doctorName: getDoctorName(getQueueDoctorId(queue)),
      chiefComplaint: consultationData.chiefComplaint,
      historyOfPresentIllness: consultationData.historyOfPresentIllness,
      examinationFindings: consultationData.examinationFindings,
      diagnosis: consultationData.diagnosis,
      clinicalNotes: consultationData.clinicalNotes,
      followUpDate: consultationData.followUpDate,
      outcome: consultationData.outcome,
      referralNotes: consultationData.referralNotes,
      status: 'completed',
      updatedAt: timestamp
    };

    if (!existingEncounter) {
      encounter.createdAt = timestamp;
    }

    await STORAGE.put(STORE.encounters, encounter);

    state.encounters = state.encounters.filter(
      item => item.id !== encounter.id
    );

    state.encounters.push(encounter);

    return encounter;
  }

  async function saveConsultation({
    patient,
    queue,
    encounter,
    consultationData,
    timestamp
  }) {
    const existing = getExistingConsultation(
      patient.id,
      queue.id
    );

    const consultation = {
      ...(existing || {}),
      id: existing?.id || createId('consult'),
      patientId: patient.id,
      uhid: patient.uhid || '',
      queueId: queue.id,
      encounterId: encounter.id,
      doctorId: getQueueDoctorId(queue) || '',
      doctorName: getDoctorName(getQueueDoctorId(queue)),
      chiefComplaint: consultationData.chiefComplaint,
      historyOfPresentIllness: consultationData.historyOfPresentIllness,
      examinationFindings: consultationData.examinationFindings,
      diagnosis: consultationData.diagnosis,
      clinicalNotes: consultationData.clinicalNotes,
      followUpDate: consultationData.followUpDate,
      outcome: consultationData.outcome,
      referralNotes: consultationData.referralNotes,
      prescriptions: consultationData.prescriptions,
      labOrders: consultationData.labOrders,
      status: 'completed',
      completedAt: timestamp,
      updatedAt: timestamp
    };

    if (!existing) {
      consultation.createdAt = timestamp;
    }

    await STORAGE.put(STORE.consultations, consultation);

    state.consultations = state.consultations.filter(
      item => item.id !== consultation.id
    );

    state.consultations.push(consultation);

    return consultation;
  }

  async function savePrescriptions({
    patient,
    queue,
    encounter,
    consultation,
    prescriptions,
    timestamp
  }) {
    const existingPrescriptions = state.prescriptions.filter(item => {
      return (
        item.consultationId === consultation.id ||
        item.encounterId === encounter.id
      );
    });

    for (const existing of existingPrescriptions) {
      await STORAGE.remove(STORE.prescriptions, existing.id);
    }

    state.prescriptions = state.prescriptions.filter(item => {
      return (
        item.consultationId !== consultation.id &&
        item.encounterId !== encounter.id
      );
    });

    for (const prescription of prescriptions) {
      const record = {
        id: createId('rx'),
        patientId: patient.id,
        uhid: patient.uhid || '',
        queueId: queue.id,
        encounterId: encounter.id,
        consultationId: consultation.id,
        doctorId: consultation.doctorId,
        doctorName: consultation.doctorName,
        medicineName: prescription.medicineName,
        strength: prescription.strength,
        dosage: prescription.dosage,
        frequency: prescription.frequency,
        duration: prescription.duration,
        route: prescription.route,
        instructions: prescription.instructions,
        status: 'prescribed',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await STORAGE.add(STORE.prescriptions, record);
      state.prescriptions.push(record);
    }

    if (prescriptions.length) {
      emit('prescriptionCreated', {
        patient,
        encounter,
        consultation,
        prescriptions,
        module: MODULE_NAME
      });
    }
  }

  async function saveLabOrders({
    patient,
    queue,
    encounter,
    consultation,
    labOrders,
    timestamp
  }) {
    const existingLabOrders = state.labOrders.filter(item => {
      return (
        item.consultationId === consultation.id ||
        item.encounterId === encounter.id
      );
    });

    for (const existing of existingLabOrders) {
      await STORAGE.remove(STORE.labOrders, existing.id);
    }

    state.labOrders = state.labOrders.filter(item => {
      return (
        item.consultationId !== consultation.id &&
        item.encounterId !== encounter.id
      );
    });

    for (const labOrder of labOrders) {
      const record = {
        id: createId('lab'),
        patientId: patient.id,
        uhid: patient.uhid || '',
        queueId: queue.id,
        encounterId: encounter.id,
        consultationId: consultation.id,
        doctorId: consultation.doctorId,
        doctorName: consultation.doctorName,
        department: labOrder.department || 'laboratory',
        testName: labOrder.testName,
        priority: labOrder.priority || 'routine',
        clinicalNotes: labOrder.clinicalNotes,
        status: 'ordered',
        orderedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await STORAGE.add(STORE.labOrders, record);
      state.labOrders.push(record);
    }

    if (labOrders.length) {
      emit('labOrderCreated', {
        patient,
        encounter,
        consultation,
        labOrders,
        module: MODULE_NAME
      });
    }
  }

  async function completeDoctorQueue({
    queue,
    patient,
    encounter,
    consultation,
    consultationData,
    timestamp
  }) {
    queue.status = STATUS.COMPLETED;
    queue.stage = 'completed';
    queue.currentStage = 'completed';
    queue.completedAt = timestamp;
    queue.updatedAt = timestamp;
    queue.encounterId = encounter.id;
    queue.consultationId = consultation.id;
    queue.outcome = consultationData.outcome;

    if (consultationData.labOrders.length) {
      queue.nextStage = 'laboratory';
      queue.requiresLaboratory = true;
    } else if (consultationData.prescriptions.length) {
      queue.nextStage = 'pharmacy';
      queue.requiresPharmacy = true;
    } else {
      queue.nextStage = 'billing';
      queue.requiresBilling = true;
    }

    await STORAGE.put(STORE.queues, queue);

    state.queues = state.queues.map(item => {
      return item.id === queue.id
        ? normalizeQueue(queue)
        : item;
    });

    emit('queueCompleted', {
      queue,
      patient,
      encounter,
      consultation,
      module: MODULE_NAME
    });
  }

  async function openPatientProfile(patientId) {
    const patient = state.patients.find(item => item.id === patientId);

    if (!patient) return;

    const encounterHistory = state.encounters
      .filter(encounter => {
        return (
          encounter.patientId === patient.id ||
          encounter.patient_id === patient.id
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      });

    const content = `
      <div class="patient-profile-modal">
        <div class="patient-profile-compact">
          <div class="patient-avatar patient-avatar--large">
            ${escapeHtml(
              typeof UTILS.initials === 'function'
                ? UTILS.initials(getPatientName(patient))
                : getPatientName(patient).slice(0, 2).toUpperCase()
            )}
          </div>

          <div>
            <h2>${escapeHtml(getPatientName(patient))}</h2>
            <p>${escapeHtml(patient.uhid || 'UHID not available')}</p>
          </div>
        </div>

        <div class="form-grid form-grid--two">
          <div>
            <span class="detail-label">Age</span>
            <strong>${escapeHtml(getPatientAge(patient))}</strong>
          </div>

          <div>
            <span class="detail-label">Gender</span>
            <strong>${escapeHtml(getGender(patient))}</strong>
          </div>

          <div>
            <span class="detail-label">Phone</span>
            <strong>${escapeHtml(patient.phone || '—')}</strong>
          </div>

          <div>
            <span class="detail-label">Blood Group</span>
            <strong>${escapeHtml(patient.bloodGroup || '—')}</strong>
          </div>
        </div>

        <hr />

        <h3>Recent Encounters</h3>

        ${
          encounterHistory.length
            ? `
              <div class="timeline-list">
                ${encounterHistory.slice(0, 5).map(encounter => `
                  <div class="timeline-item">
                    <div class="timeline-item__marker"></div>

                    <div class="timeline-item__content">
                      <strong>
                        ${escapeHtml(
                          encounter.diagnosis ||
                          encounter.chiefComplaint ||
                          'Clinical Encounter'
                        )}
                      </strong>

                      <span>
                        ${formatDateTime(
                          encounter.encounterDate ||
                          encounter.createdAt
                        )}
                      </span>

                      ${
                        encounter.clinicalNotes
                          ? `<p>${escapeHtml(encounter.clinicalNotes)}</p>`
                          : ''
                      }
                    </div>
                  </div>
                `).join('')}
              </div>
            `
            : '<p class="muted-text">No previous encounters found.</p>'
        }
      </div>
    `;

    openModal({
      title: 'Patient Profile',
      content,
      size: 'large'
    });
  }

  function openModal(options) {
    if (typeof window.AURA_APP?.modal === 'function') {
      try {
        window.AURA_APP.modal(options);
        return;
      } catch (error) {
        console.warn('AURA_APP modal failed:', error);
      }
    }

    if (typeof AURA.modal === 'function') {
      try {
        AURA.modal(options);
        return;
      } catch (error) {
        console.warn('AURA modal failed:', error);
      }
    }

    const existing = document.querySelector('[data-doctor-modal]');

    if (existing) existing.remove();

    const modal = document.createElement('div');

    modal.dataset.doctorModal = 'true';
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-dialog modal-dialog--${escapeHtml(options.size || 'medium')}">
        <div class="modal-header">
          <h2>${escapeHtml(options.title || '')}</h2>

          <button
            type="button"
            class="modal-close"
            data-modal-close
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div class="modal-body">
          ${options.content || ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (
        event.target === modal ||
        event.target.closest('[data-modal-close]')
      ) {
        modal.remove();
      }
    });
  }

  async function refresh() {
    await loadData();
    render();
  }

  function getState() {
    return {
      ...state,
      queues: [...state.queues],
      patients: [...state.patients],
      encounters: [...state.encounters],
      consultations: [...state.consultations],
      prescriptions: [...state.prescriptions],
      labOrders: [...state.labOrders],
      doctors: [...state.doctors]
    };
  }

  function getCurrentQueue() {
    return state.selectedQueue;
  }

  function getCurrentPatient() {
    return state.selectedPatient;
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    listeners.push(callback);

    return () => {
      const index = listeners.indexOf(callback);

      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  function notify() {
    listeners.forEach(callback => {
      try {
        callback(getState());
      } catch (error) {
        console.warn('Doctor subscriber failed:', error);
      }
    });
  }

  function registerEvents() {
    const eventNames = [
      'aura:queue-change',
      'aura:queue-called',
      'aura:queue-completed',
      'aura:vitals-recorded',
      'aura:patient-created',
      'aura:patient-updated',
      'aura:storage-change'
    ];

    eventNames.forEach(eventName => {
      const handler = () => {
        refresh();
      };

      document.addEventListener(eventName, handler);
      listeners.push(() => {
        document.removeEventListener(eventName, handler);
      });
    });
  }

  async function initialize() {
    if (state.isInitialized) {
      await refresh();
      return getState();
    }

    state.isInitialized = true;

    registerEvents();

    await loadData();

    if (typeof window.AURA_APP?.registerModule === 'function') {
      window.AURA_APP.registerModule(MODULE_NAME, api);
    }

    if (typeof window.AURA_ROUTER?.register === 'function') {
      window.AURA_ROUTER.register({
        name: MODULE_NAME,
        path: 'doctor',
        title: 'Doctor Consultation',
        icon: 'stethoscope',
        module: MODULE_NAME
      });
    }

    notify();

    return getState();
  }

  const api = {
    name: MODULE_NAME,
    state,

    initialize,
    refresh,
    render,

    getState,
    getCurrentQueue,
    getCurrentPatient,
    subscribe,

    loadData,

    callPatient,
    callNextPatient,
    startConsultation,
    openConsultation,
    skipQueue,

    saveEncounter,
    saveConsultation,
    savePrescriptions,
    saveLabOrders,

    openPatientProfile,

    getFilteredQueues,
    getStats
  };

  window.AURA_DOCTOR = api;

  window.AURA = window.AURA || {};
  window.AURA.doctor = api;

  window.AURA_DOCTOR_MODULE = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize().catch(error => {
        console.error('Doctor module initialization failed:', error);
      });
    });
  } else {
    initialize().catch(error => {
      console.error('Doctor module initialization failed:', error);
    });
  }

})();