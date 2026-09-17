/**
 * AURA Clinic
 * Laboratory & Diagnostics Module
 *
 * Responsibilities:
 * - Display laboratory and diagnostic orders.
 * - Manage pathology, laboratory, and radiology work queues.
 * - Record sample collection and processing.
 * - Enter and verify test results.
 * - Attach results to the permanent patient encounter.
 * - Notify the doctor workflow when results are available.
 */

(function () {
  'use strict';

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE || null;
  const EVENTS = window.AURA_EVENTS || null;
  const UTILS = window.AURA_UTILS || {};
  const AURA = window.AURA || {};

  const MODULE_NAME = 'laboratory';

  const STORE = {
    patients: 'patients',
    queues: 'queues',
    encounters: 'encounters',
    consultations: 'consultations',
    labOrders: 'labOrders',
    labResults: 'labResults',
    staff: 'staff'
  };

  const STATUS = {
    ORDERED: 'ordered',
    SAMPLE_PENDING: 'sample-pending',
    COLLECTED: 'collected',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    VERIFIED: 'verified',
    CANCELLED: 'cancelled'
  };

  const state = {
    isInitialized: false,
    isLoading: false,
    isSaving: false,

    orders: [],
    results: [],
    patients: [],
    encounters: [],
    consultations: [],
    staff: [],

    selectedOrder: null,
    selectedPatient: null,
    selectedResult: null,

    currentView: 'list',

    searchTerm: '',
    selectedStatus: 'all',
    selectedDepartment: 'all',
    selectedPriority: 'all'
  };

  const subscriptions = [];

  function nowISO() {
    return new Date().toISOString();
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
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

  function getElement(selector) {
    return document.querySelector(selector);
  }

  function getViewRoot() {
    return (
      getElement('[data-route-view="laboratory"]') ||
      getElement('#app-content') ||
      getElement('#app')
    );
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
        console.warn('AURA_APP toast failed:', error);
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
      console.warn('Laboratory event dispatch failed:', error);
    }
  }

  function getOrderPatient(order) {
    if (!order) return null;

    const patientId =
      order.patientId ||
      order.patient_id;

    return (
      state.patients.find(patient => patient.id === patientId) ||
      order.patient ||
      null
    );
  }

  function getOrderStatus(order) {
    return String(order?.status || STATUS.ORDERED).toLowerCase();
  }

  function getOrderDepartment(order) {
    return String(
      order?.department ||
      order?.serviceDepartment ||
      'laboratory'
    ).toLowerCase();
  }

  function getOrderPriority(order) {
    return String(order?.priority || 'routine').toLowerCase();
  }

  function getStatusLabel(status) {
    const labels = {
      ordered: 'Ordered',
      'sample-pending': 'Sample Pending',
      collected: 'Collected',
      processing: 'Processing',
      completed: 'Completed',
      verified: 'Verified',
      cancelled: 'Cancelled'
    };

    return labels[status] || status || 'Unknown';
  }

  function getStatusClass(status) {
    const classes = {
      ordered: 'status-info',
      'sample-pending': 'status-warning',
      collected: 'status-primary',
      processing: 'status-primary',
      completed: 'status-success',
      verified: 'status-success',
      cancelled: 'status-danger'
    };

    return classes[status] || 'status-muted';
  }

  function getPriorityClass(priority) {
    const classes = {
      routine: 'priority-routine',
      urgent: 'priority-urgent',
      stat: 'priority-stat'
    };

    return classes[priority] || 'priority-routine';
  }

  function normalizeOrder(order) {
    return {
      ...order,
      id: order.id,
      patientId: order.patientId || order.patient_id || '',
      testName: order.testName || order.name || 'Unnamed Test',
      department: getOrderDepartment(order),
      priority: getOrderPriority(order),
      status: getOrderStatus(order),
      orderedAt: order.orderedAt || order.createdAt || nowISO()
    };
  }

  function normalizeResult(result) {
    return {
      ...result,
      id: result.id,
      orderId: result.orderId || result.labOrderId || '',
      patientId: result.patientId || result.patient_id || '',
      status: String(result.status || STATUS.COMPLETED).toLowerCase()
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
        orders,
        results,
        patients,
        encounters,
        consultations,
        staff
      ] = await Promise.all([
        STORAGE.getAll(STORE.labOrders),
        STORAGE.getAll(STORE.labResults),
        STORAGE.getAll(STORE.patients),
        STORAGE.getAll(STORE.encounters),
        STORAGE.getAll(STORE.consultations),
        STORAGE.getAll(STORE.staff)
      ]);

      state.orders = Array.isArray(orders)
        ? orders.map(normalizeOrder)
        : [];

      state.results = Array.isArray(results)
        ? results.map(normalizeResult)
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

      state.staff = Array.isArray(staff)
        ? staff
        : [];

      state.isLoading = false;
    } catch (error) {
      state.isLoading = false;

      console.error('Laboratory module loading failed:', error);

      showToast(
        'Unable to load laboratory orders.',
        'error',
        'Loading Error'
      );
    }
  }

  function getFilteredOrders() {
    const search = state.searchTerm.trim().toLowerCase();

    return state.orders
      .filter(order => {
        if (
          state.selectedStatus !== 'all' &&
          order.status !== state.selectedStatus
        ) {
          return false;
        }

        if (
          state.selectedDepartment !== 'all' &&
          order.department !== state.selectedDepartment
        ) {
          return false;
        }

        if (
          state.selectedPriority !== 'all' &&
          order.priority !== state.selectedPriority
        ) {
          return false;
        }

        if (!search) return true;

        const patient = getOrderPatient(order);

        const haystack = [
          getPatientName(patient),
          patient?.uhid,
          patient?.phone,
          order.testName,
          order.department,
          order.priority,
          order.id
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      })
      .sort((a, b) => {
        const priorityOrder = {
          stat: 0,
          urgent: 1,
          routine: 2
        };

        const priorityDifference =
          (priorityOrder[a.priority] ?? 99) -
          (priorityOrder[b.priority] ?? 99);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return (
          new Date(a.orderedAt || a.createdAt || 0).getTime() -
          new Date(b.orderedAt || b.createdAt || 0).getTime()
        );
      });
  }

  function getStats() {
    const orders = state.orders;

    return {
      total: orders.length,

      pending: orders.filter(order => {
        return [
          STATUS.ORDERED,
          STATUS.SAMPLE_PENDING,
          STATUS.COLLECTED,
          STATUS.PROCESSING
        ].includes(order.status);
      }).length,

      processing: orders.filter(order => {
        return order.status === STATUS.PROCESSING;
      }).length,

      completed: orders.filter(order => {
        return [
          STATUS.COMPLETED,
          STATUS.VERIFIED
        ].includes(order.status);
      }).length,

      urgent: orders.filter(order => {
        return (
          order.priority === 'urgent' ||
          order.priority === 'stat'
        ) && ![
          STATUS.COMPLETED,
          STATUS.VERIFIED,
          STATUS.CANCELLED
        ].includes(order.status);
      }).length
    };
  }

  function getResultForOrder(orderId) {
    if (!orderId) return null;

    return state.results
      .filter(result => {
        return (
          result.orderId === orderId ||
          result.labOrderId === orderId
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
      })[0] || null;
  }

  function getEncounter(patientId, order) {
    return state.encounters
      .filter(encounter => {
        return (
          encounter.patientId === patientId ||
          encounter.patient_id === patientId
        );
      })
      .filter(encounter => {
        if (!order?.encounterId) return true;

        return encounter.id === order.encounterId;
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || b.encounterDate || 0).getTime() -
          new Date(a.createdAt || a.encounterDate || 0).getTime()
        );
      })[0] || null;
  }

  function getConsultation(order) {
    if (!order) return null;

    return state.consultations
      .filter(consultation => {
        return (
          consultation.id === order.consultationId ||
          consultation.id === order.consultation_id ||
          consultation.patientId === order.patientId
        );
      })
      .sort((a, b) => {
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      })[0] || null;
  }

  function render() {
    const root = getViewRoot();

    if (!root) return;

    if (state.currentView === 'result') {
      renderResultWorkspace(root);
      return;
    }

    renderLaboratoryDesk(root);
  }

  function renderLaboratoryDesk(root) {
    const stats = getStats();
    const orders = getFilteredOrders();

    root.innerHTML = `
      <section class="laboratory-module" data-module="${MODULE_NAME}">
        ${renderPageHeader()}
        ${renderStats(stats)}
        ${renderFilters()}
        ${renderOrdersTable(orders)}
      </section>
    `;

    bindDeskEvents(root);
  }

  function renderPageHeader() {
    return `
      <header class="page-header laboratory-page-header">
        <div class="page-header__main">
          <div class="page-header__eyebrow">
            Diagnostics Workspace
          </div>

          <h1 class="page-header__title">
            Laboratory & Diagnostics
          </h1>

          <p class="page-header__subtitle">
            Manage test orders, sample collection, processing, and verified results.
          </p>
        </div>

        <div class="page-header__actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-lab-action="refresh"
          >
            <span class="icon">↻</span>
            Refresh
          </button>
        </div>
      </header>
    `;
  }

  function renderStats(stats) {
    return `
      <div class="queue-stats-grid laboratory-stats-grid">
        <article class="metric-card">
          <div class="metric-card__icon">🧪</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Total Orders</span>
            <strong class="metric-card__value">${stats.total}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">⏳</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Pending</span>
            <strong class="metric-card__value">${stats.pending}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">⚙️</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Processing</span>
            <strong class="metric-card__value">${stats.processing}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">✓</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Completed</span>
            <strong class="metric-card__value">${stats.completed}</strong>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">!</div>
          <div class="metric-card__body">
            <span class="metric-card__label">Priority Orders</span>
            <strong class="metric-card__value">${stats.urgent}</strong>
          </div>
        </article>
      </div>
    `;
  }

  function renderFilters() {
    return `
      <div class="workspace-toolbar laboratory-toolbar">
        <div class="workspace-toolbar__search">
          <label class="sr-only" for="laboratory-search">
            Search laboratory orders
          </label>

          <input
            id="laboratory-search"
            class="form-control"
            type="search"
            placeholder="Search patient, UHID, test, or order ID..."
            value="${escapeHtml(state.searchTerm)}"
            data-lab-field="search"
          />
        </div>

        <div class="workspace-toolbar__filters">
          <label class="sr-only" for="laboratory-status-filter">
            Filter by status
          </label>

          <select
            id="laboratory-status-filter"
            class="form-control"
            data-lab-field="status"
          >
            <option value="all">All Statuses</option>
            <option value="ordered">Ordered</option>
            <option value="sample-pending">Sample Pending</option>
            <option value="collected">Collected</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="verified">Verified</option>
          </select>

          <label class="sr-only" for="laboratory-department-filter">
            Filter by department
          </label>

          <select
            id="laboratory-department-filter"
            class="form-control"
            data-lab-field="department"
          >
            <option value="all">All Departments</option>
            <option value="laboratory">Laboratory</option>
            <option value="pathology">Pathology</option>
            <option value="radiology">Radiology</option>
          </select>

          <label class="sr-only" for="laboratory-priority-filter">
            Filter by priority
          </label>

          <select
            id="laboratory-priority-filter"
            class="form-control"
            data-lab-field="priority"
          >
            <option value="all">All Priorities</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
        </div>
      </div>
    `;
  }

  function renderOrdersTable(orders) {
    if (state.isLoading) {
      return `
        <div class="empty-state">
          <div class="empty-state__icon">⏳</div>
          <h3>Loading laboratory orders</h3>
          <p>Please wait while diagnostic records are loaded.</p>
        </div>
      `;
    }

    if (!orders.length) {
      return `
        <div class="empty-state">
          <div class="empty-state__icon">🧪</div>
          <h3>No laboratory orders found</h3>
          <p>
            New orders created by doctors will appear here.
          </p>
        </div>
      `;
    }

    return `
      <section class="data-card laboratory-orders-card">
        <div class="data-card__header">
          <div>
            <h2 class="data-card__title">Diagnostic Orders</h2>
            <p class="data-card__subtitle">
              ${orders.length} order${orders.length === 1 ? '' : 's'} in the workspace
            </p>
          </div>

          <span class="badge badge-neutral">
            ${formatDate(todayISO())}
          </span>
        </div>

        <div class="table-wrapper">
          <table class="data-table laboratory-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Patient</th>
                <th>Test</th>
                <th>Department</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Ordered At</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              ${orders.map(renderOrderRow).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderOrderRow(order) {
    const patient = getOrderPatient(order);
    const result = getResultForOrder(order.id);

    const action =
      order.status === STATUS.VERIFIED ||
      order.status === STATUS.COMPLETED
        ? 'view-result'
        : 'process';

    const actionLabel =
      action === 'view-result'
        ? 'View Result'
        : 'Process';

    return `
      <tr data-order-row="${escapeHtml(order.id)}">
        <td>
          <span class="order-id">
            ${escapeHtml(order.id)}
          </span>
        </td>

        <td>
          <button
            type="button"
            class="table-link patient-name-link"
            data-lab-action="open-patient"
            data-patient-id="${escapeHtml(patient?.id || order.patientId)}"
          >
            ${escapeHtml(getPatientName(patient))}
          </button>

          <small class="muted-text">
            ${escapeHtml(patient?.uhid || 'UHID unavailable')}
          </small>
        </td>

        <td>
          <strong>${escapeHtml(order.testName)}</strong>

          ${
            order.clinicalNotes
              ? `<small class="muted-text">${escapeHtml(order.clinicalNotes)}</small>`
              : ''
          }
        </td>

        <td>
          ${escapeHtml(order.department)}
        </td>

        <td>
          <span class="priority-badge ${getPriorityClass(order.priority)}">
            ${escapeHtml(order.priority.toUpperCase())}
          </span>
        </td>

        <td>
          <span class="status-badge ${getStatusClass(order.status)}">
            ${escapeHtml(getStatusLabel(order.status))}
          </span>

          ${
            result
              ? `
                <small class="muted-text">
                  Result available
                </small>
              `
              : ''
          }
        </td>

        <td>
          ${formatDateTime(order.orderedAt)}
        </td>

        <td>
          <div class="table-actions">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              data-lab-action="${action}"
              data-order-id="${escapeHtml(order.id)}"
            >
              ${actionLabel}
            </button>

            ${
              order.status !== STATUS.VERIFIED &&
              order.status !== STATUS.CANCELLED
                ? `
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost"
                    data-lab-action="update-status"
                    data-order-id="${escapeHtml(order.id)}"
                  >
                    Status
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
    root.querySelectorAll('[data-lab-field="search"]').forEach(input => {
      input.addEventListener('input', event => {
        state.searchTerm = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-lab-field="status"]').forEach(select => {
      select.value = state.selectedStatus;

      select.addEventListener('change', event => {
        state.selectedStatus = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-lab-field="department"]').forEach(select => {
      select.value = state.selectedDepartment;

      select.addEventListener('change', event => {
        state.selectedDepartment = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-lab-field="priority"]').forEach(select => {
      select.value = state.selectedPriority;

      select.addEventListener('change', event => {
        state.selectedPriority = event.target.value;
        render();
      });
    });

    root.querySelectorAll('[data-lab-action]').forEach(button => {
      button.addEventListener('click', handleDeskAction);
    });
  }

  async function handleDeskAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.labAction;
    const orderId = button.dataset.orderId;
    const patientId = button.dataset.patientId;

    switch (action) {
      case 'refresh':
        await refresh();
        break;

      case 'process':
        await openResultWorkspace(orderId);
        break;

      case 'view-result':
        await openResultWorkspace(orderId);
        break;

      case 'update-status':
        await openStatusModal(orderId);
        break;

      case 'open-patient':
        await openPatientProfile(patientId);
        break;

      default:
        break;
    }
  }

  async function openResultWorkspace(orderId) {
    const order = state.orders.find(item => item.id === orderId);

    if (!order) return;

    const patient = getOrderPatient(order);

    if (!patient) {
      showToast(
        'The patient record could not be found.',
        'error',
        'Patient Missing'
      );
      return;
    }

    state.selectedOrder = order;
    state.selectedPatient = patient;
    state.selectedResult = getResultForOrder(order.id);
    state.currentView = 'result';

    render();
  }

  function renderResultWorkspace(root) {
    const order = state.selectedOrder;
    const patient = state.selectedPatient;

    if (!order || !patient) {
      state.currentView = 'list';
      render();
      return;
    }

    const result = state.selectedResult;
    const encounter = getEncounter(patient.id, order);
    const consultation = getConsultation(order);

    root.innerHTML = `
      <section class="laboratory-module laboratory-result-module">
        ${renderResultHeader(patient, order)}

        <div class="laboratory-result-layout">
          <aside class="laboratory-result-sidebar">
            ${renderOrderSummary(order, patient)}
            ${renderClinicalContext(order, encounter, consultation)}
          </aside>

          <main class="laboratory-result-main">
            ${renderResultForm(order, patient, result)}
          </main>
        </div>
      </section>
    `;

    bindResultEvents(root);
  }

  function renderResultHeader(patient, order) {
    return `
      <header class="page-header laboratory-result-header">
        <div class="page-header__main">
          <button
            type="button"
            class="btn btn-ghost btn-back"
            data-lab-action="back-to-orders"
          >
            ← Back to Orders
          </button>

          <div class="page-header__eyebrow">
            Result Processing
          </div>

          <h1 class="page-header__title">
            ${escapeHtml(order.testName)}
          </h1>

          <p class="page-header__subtitle">
            ${escapeHtml(getPatientName(patient))}
            · UHID: ${escapeHtml(patient.uhid || 'Not assigned')}
          </p>
        </div>

        <div class="page-header__actions">
          <span class="priority-badge ${getPriorityClass(order.priority)}">
            ${escapeHtml(order.priority.toUpperCase())}
          </span>
        </div>
      </header>
    `;
  }

  function renderOrderSummary(order, patient) {
    return `
      <section class="clinical-sidebar-card">
        <div class="clinical-sidebar-card__header">
          <span class="clinical-sidebar-card__eyebrow">
            Order Summary
          </span>
        </div>

        <dl class="clinical-definition-list">
          <div>
            <dt>Order ID</dt>
            <dd>${escapeHtml(order.id)}</dd>
          </div>

          <div>
            <dt>Patient</dt>
            <dd>${escapeHtml(getPatientName(patient))}</dd>
          </div>

          <div>
            <dt>Age</dt>
            <dd>${escapeHtml(getPatientAge(patient))}</dd>
          </div>

          <div>
            <dt>Department</dt>
            <dd>${escapeHtml(order.department)}</dd>
          </div>

          <div>
            <dt>Priority</dt>
            <dd>${escapeHtml(order.priority)}</dd>
          </div>

          <div>
            <dt>Ordered At</dt>
            <dd>${formatDateTime(order.orderedAt)}</dd>
          </div>

          <div>
            <dt>Status</dt>
            <dd>
              <span class="status-badge ${getStatusClass(order.status)}">
                ${escapeHtml(getStatusLabel(order.status))}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    `;
  }

  function renderClinicalContext(order, encounter, consultation) {
    return `
      <section class="clinical-sidebar-card">
        <div class="clinical-sidebar-card__header">
          <span class="clinical-sidebar-card__eyebrow">
            Clinical Context
          </span>
        </div>

        ${
          order.clinicalNotes
            ? `
              <div class="clinical-context-block">
                <span class="detail-label">Order Notes</span>
                <p>${escapeHtml(order.clinicalNotes)}</p>
              </div>
            `
            : ''
        }

        ${
          consultation?.diagnosis
            ? `
              <div class="clinical-context-block">
                <span class="detail-label">Diagnosis</span>
                <p>${escapeHtml(consultation.diagnosis)}</p>
              </div>
            `
            : ''
        }

        ${
          encounter?.chiefComplaint
            ? `
              <div class="clinical-context-block">
                <span class="detail-label">Chief Complaint</span>
                <p>${escapeHtml(encounter.chiefComplaint)}</p>
              </div>
            `
            : ''
        }

        ${
          !order.clinicalNotes &&
          !consultation?.diagnosis &&
          !encounter?.chiefComplaint
            ? `
              <p class="muted-text">
                No additional clinical context available.
              </p>
            `
            : ''
        }
      </section>
    `;
  }

  function renderResultForm(order, patient, result) {
    const isVerified = order.status === STATUS.VERIFIED;
    const resultValue = result?.resultValue || result?.result || '';
    const referenceRange = result?.referenceRange || '';
    const units = result?.units || '';
    const interpretation = result?.interpretation || '';
    const remarks = result?.remarks || '';

    return `
      <form
        class="laboratory-result-form"
        id="laboratory-result-form"
        data-order-id="${escapeHtml(order.id)}"
        data-patient-id="${escapeHtml(patient.id)}"
      >
        <section class="clinical-form-card">
          <div class="clinical-form-card__header">
            <div>
              <span class="clinical-form-card__eyebrow">
                Test Result
              </span>

              <h2>Laboratory Findings</h2>

              <p>
                Enter the measured result and supporting interpretation.
              </p>
            </div>

            ${
              isVerified
                ? `
                  <span class="status-badge status-success">
                    Verified
                  </span>
                `
                : ''
            }
          </div>

          <div class="form-grid form-grid--two">
            <div class="form-field form-field--full">
              <label for="result-value">
                Result / Findings <span class="required">*</span>
              </label>

              <textarea
                id="result-value"
                name="resultValue"
                class="form-control"
                rows="5"
                required
                placeholder="Enter the test result or diagnostic findings..."
                ${isVerified ? 'readonly' : ''}
              >${escapeHtml(resultValue)}</textarea>
            </div>

            <div class="form-field">
              <label for="reference-range">
                Reference Range
              </label>

              <input
                id="reference-range"
                name="referenceRange"
                class="form-control"
                type="text"
                value="${escapeHtml(referenceRange)}"
                placeholder="e.g. 4.5–11.0"
                ${isVerified ? 'readonly' : ''}
              />
            </div>

            <div class="form-field">
              <label for="result-units">
                Units
              </label>

              <input
                id="result-units"
                name="units"
                class="form-control"
                type="text"
                value="${escapeHtml(units)}"
                placeholder="mg/dL, %, cells/µL"
                ${isVerified ? 'readonly' : ''}
              />
            </div>

            <div class="form-field">
              <label for="interpretation">
                Interpretation
              </label>

              <select
                id="interpretation"
                name="interpretation"
                class="form-control"
                ${isVerified ? 'disabled' : ''}
              >
                <option value="">Select Interpretation</option>
                <option value="normal" ${interpretation === 'normal' ? 'selected' : ''}>
                  Normal
                </option>
                <option value="abnormal" ${interpretation === 'abnormal' ? 'selected' : ''}>
                  Abnormal
                </option>
                <option value="critical" ${interpretation === 'critical' ? 'selected' : ''}>
                  Critical
                </option>
                <option value="inconclusive" ${interpretation === 'inconclusive' ? 'selected' : ''}>
                  Inconclusive
                </option>
              </select>
            </div>

            <div class="form-field">
              <label for="result-status">
                Processing Status
              </label>

              <select
                id="result-status"
                name="status"
                class="form-control"
                ${isVerified ? 'disabled' : ''}
              >
                <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>
                  Processing
                </option>
                <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>
                  Completed
                </option>
              </select>
            </div>

            <div class="form-field form-field--full">
              <label for="result-remarks">
                Remarks
              </label>

              <textarea
                id="result-remarks"
                name="remarks"
                class="form-control"
                rows="3"
                placeholder="Additional observations or laboratory remarks..."
                ${isVerified ? 'readonly' : ''}
              >${escapeHtml(remarks)}</textarea>
            </div>
          </div>
        </section>

        <section class="clinical-form-card">
          <div class="clinical-form-card__header">
            <div>
              <span class="clinical-form-card__eyebrow">
                Verification
              </span>

              <h2>Result Review</h2>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <div class="form-field">
              <label for="technician-name">
                Laboratory Staff
              </label>

              <input
                id="technician-name"
                name="technicianName"
                class="form-control"
                type="text"
                value="${escapeHtml(
                  result?.technicianName ||
                  result?.performedByName ||
                  ''
                )}"
                placeholder="Technician or pathologist name"
                ${isVerified ? 'readonly' : ''}
              />
            </div>

            <div class="form-field">
              <label for="verified-by">
                Verified By
              </label>

              <input
                id="verified-by"
                name="verifiedByName"
                class="form-control"
                type="text"
                value="${escapeHtml(result?.verifiedByName || '')}"
                placeholder="Doctor or authorized verifier"
                ${isVerified ? 'readonly' : ''}
              />
            </div>
          </div>

          ${
            result?.verifiedAt
              ? `
                <div class="verification-meta">
                  Verified on ${formatDateTime(result.verifiedAt)}
                </div>
              `
              : ''
          }
        </section>

        <div class="laboratory-form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-lab-action="back-to-orders"
          >
            Back to Orders
          </button>

          ${
            !isVerified
              ? `
                <button
                  type="button"
                  class="btn btn-secondary"
                  data-lab-action="save-draft"
                >
                  Save Draft
                </button>

                <button
                  type="submit"
                  class="btn btn-primary"
                  data-lab-action="complete-result"
                >
                  Save Result
                </button>

                <button
                  type="button"
                  class="btn btn-success"
                  data-lab-action="verify-result"
                >
                  Verify Result
                </button>
              `
              : `
                <button
                  type="button"
                  class="btn btn-secondary"
                  data-lab-action="print-result"
                >
                  Print Result
                </button>
              `
          }
        </div>
      </form>
    `;
  }

  function bindResultEvents(root) {
    root.querySelectorAll('[data-lab-action]').forEach(button => {
      button.addEventListener('click', handleResultAction);
    });

    const form = root.querySelector('#laboratory-result-form');

    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        saveResult(false);
      });
    }
  }

  async function handleResultAction(event) {
    const action = event.currentTarget.dataset.labAction;

    switch (action) {
      case 'back-to-orders':
        state.currentView = 'list';
        state.selectedOrder = null;
        state.selectedPatient = null;
        state.selectedResult = null;
        render();
        break;

      case 'save-draft':
        await saveResult(false);
        break;

      case 'complete-result':
        await saveResult(false);
        break;

      case 'verify-result':
        await saveResult(true);
        break;

      case 'print-result':
        printResult();
        break;

      default:
        break;
    }
  }

  function collectResultFormData() {
    const form = getElement('#laboratory-result-form');

    if (!form) return null;

    const formData = new FormData(form);

    return {
      resultValue: String(
        formData.get('resultValue') || ''
      ).trim(),

      referenceRange: String(
        formData.get('referenceRange') || ''
      ).trim(),

      units: String(
        formData.get('units') || ''
      ).trim(),

      interpretation: String(
        formData.get('interpretation') || ''
      ).trim(),

      status: String(
        formData.get('status') || STATUS.COMPLETED
      ).trim(),

      remarks: String(
        formData.get('remarks') || ''
      ).trim(),

      technicianName: String(
        formData.get('technicianName') || ''
      ).trim(),

      verifiedByName: String(
        formData.get('verifiedByName') || ''
      ).trim()
    };
  }

  function validateResult(data) {
    const errors = [];

    if (!data.resultValue) {
      errors.push('Result / Findings is required.');
    }

    if (
      data.interpretation === 'critical' &&
      !data.remarks
    ) {
      errors.push('Remarks are required for a critical result.');
    }

    return errors;
  }

  async function saveResult(verify = false) {
    if (state.isSaving) return;

    const order = state.selectedOrder;
    const patient = state.selectedPatient;

    if (!order || !patient) {
      showToast(
        'No laboratory order is selected.',
        'error',
        'Save Error'
      );
      return;
    }

    const data = collectResultFormData();

    if (!data) return;

    const errors = validateResult(data);

    if (errors.length) {
      showToast(
        errors.join(' '),
        'warning',
        'Check Result'
      );
      return;
    }

    if (
      verify &&
      !data.verifiedByName
    ) {
      showToast(
        'Enter the name of the verifying doctor or authorized staff member.',
        'warning',
        'Verification Required'
      );
      return;
    }

    state.isSaving = true;

    try {
      const timestamp = nowISO();
      const existingResult = getResultForOrder(order.id);

      const result = {
        ...(existingResult || {}),
        id: existingResult?.id || createId('lab-result'),

        orderId: order.id,
        labOrderId: order.id,

        patientId: patient.id,
        uhid: patient.uhid || '',

        encounterId: order.encounterId || '',
        consultationId: order.consultationId || '',

        testName: order.testName,
        department: order.department,

        resultValue: data.resultValue,
        result: data.resultValue,
        referenceRange: data.referenceRange,
        units: data.units,
        interpretation: data.interpretation,
        remarks: data.remarks,

        technicianName: data.technicianName,
        performedByName: data.technicianName,

        status: verify
          ? STATUS.VERIFIED
          : data.status || STATUS.COMPLETED,

        updatedAt: timestamp
      };

      if (!existingResult) {
        result.createdAt = timestamp;
      }

      if (verify) {
        result.verifiedAt = timestamp;
        result.verifiedByName = data.verifiedByName;
      }

      await STORAGE.put(STORE.labResults, result);

      const updatedOrder = {
        ...order,
        status: verify
          ? STATUS.VERIFIED
          : result.status,
        resultId: result.id,
        resultAvailable: true,
        completedAt: result.status === STATUS.COMPLETED ||
          result.status === STATUS.VERIFIED
          ? timestamp
          : order.completedAt,
        verifiedAt: verify
          ? timestamp
          : order.verifiedAt,
        updatedAt: timestamp
      };

      await STORAGE.put(STORE.labOrders, updatedOrder);

      await updateEncounterWithResult({
        order: updatedOrder,
        result,
        timestamp
      });

      state.results = state.results.filter(
        item => item.id !== result.id
      );

      state.results.push(normalizeResult(result));

      state.orders = state.orders.map(item => {
        return item.id === updatedOrder.id
          ? normalizeOrder(updatedOrder)
          : item;
      });

      state.selectedOrder = normalizeOrder(updatedOrder);
      state.selectedResult = normalizeResult(result);

      emit('labResultUpdated', {
        order: updatedOrder,
        result,
        patient,
        verified: verify,
        module: MODULE_NAME
      });

      if (verify) {
        emit('labResultVerified', {
          order: updatedOrder,
          result,
          patient,
          module: MODULE_NAME
        });
      }

      showToast(
        verify
          ? 'Laboratory result verified successfully.'
          : 'Laboratory result saved successfully.',
        'success',
        verify ? 'Result Verified' : 'Result Saved'
      );

      state.isSaving = false;

      if (verify) {
        state.currentView = 'list';
        state.selectedOrder = null;
        state.selectedPatient = null;
        state.selectedResult = null;
      }

      render();
    } catch (error) {
      state.isSaving = false;

      console.error('Laboratory result save failed:', error);

      showToast(
        'The laboratory result could not be saved.',
        'error',
        'Save Error'
      );
    }
  }

  async function updateEncounterWithResult({
    order,
    result,
    timestamp
  }) {
    if (!order.patientId) return;

    let encounter = null;

    if (order.encounterId) {
      encounter = state.encounters.find(
        item => item.id === order.encounterId
      );
    }

    if (!encounter) {
      encounter = state.encounters
        .filter(item => {
          return (
            item.patientId === order.patientId ||
            item.patient_id === order.patientId
          );
        })
        .sort((a, b) => {
          return (
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
          );
        })[0];
    }

    if (!encounter) return;

    const existingResults = Array.isArray(encounter.labResults)
      ? encounter.labResults
      : [];

    const filteredResults = existingResults.filter(item => {
      return item.orderId !== order.id;
    });

    const updatedEncounter = {
      ...encounter,

      labResults: [
        ...filteredResults,
        {
          orderId: order.id,
          resultId: result.id,
          testName: order.testName,
          department: order.department,
          status: result.status,
          resultValue: result.resultValue,
          referenceRange: result.referenceRange,
          units: result.units,
          interpretation: result.interpretation,
          remarks: result.remarks,
          updatedAt: timestamp
        }
      ],

      updatedAt: timestamp
    };

    await STORAGE.put(STORE.encounters, updatedEncounter);

    state.encounters = state.encounters.map(item => {
      return item.id === updatedEncounter.id
        ? updatedEncounter
        : item;
    });
  }

  async function updateOrderStatus(orderId, status) {
    const order = state.orders.find(item => item.id === orderId);

    if (!order) return;

    const validStatuses = Object.values(STATUS);

    if (!validStatuses.includes(status)) {
      showToast(
        'Invalid laboratory status selected.',
        'warning',
        'Status Error'
      );
      return;
    }

    const timestamp = nowISO();

    const updatedOrder = {
      ...order,
      status,
      updatedAt: timestamp
    };

    if (status === STATUS.COLLECTED) {
      updatedOrder.sampleCollectedAt = timestamp;
    }

    if (status === STATUS.PROCESSING) {
      updatedOrder.processingStartedAt = timestamp;
    }

    if (
      status === STATUS.COMPLETED ||
      status === STATUS.VERIFIED
    ) {
      updatedOrder.completedAt = timestamp;
    }

    await STORAGE.put(STORE.labOrders, updatedOrder);

    state.orders = state.orders.map(item => {
      return item.id === order.id
        ? normalizeOrder(updatedOrder)
        : item;
    });

    emit('labOrderStatusUpdated', {
      order: updatedOrder,
      patient: getOrderPatient(updatedOrder),
      module: MODULE_NAME
    });

    showToast(
      `Order status changed to ${getStatusLabel(status)}.`,
      'success',
      'Status Updated'
    );

    render();
  }

  async function openStatusModal(orderId) {
    const order = state.orders.find(item => item.id === orderId);

    if (!order) return;

    const content = `
      <div class="form-field">
        <label for="laboratory-status-modal-select">
          Select Status
        </label>

        <select
          id="laboratory-status-modal-select"
          class="form-control"
        >
          <option value="ordered">Ordered</option>
          <option value="sample-pending">Sample Pending</option>
          <option value="collected">Collected</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          data-lab-modal-close
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary"
          data-lab-modal-save
        >
          Update Status
        </button>
      </div>
    `;

    const modal = openModal({
      title: 'Update Laboratory Status',
      content,
      size: 'small'
    });

    const select = modal?.querySelector(
      '#laboratory-status-modal-select'
    );

    if (select) {
      select.value = order.status;
    }

    modal?.querySelector('[data-lab-modal-close]')?.addEventListener(
      'click',
      () => closeModal(modal)
    );

    modal?.querySelector('[data-lab-modal-save]')?.addEventListener(
      'click',
      async () => {
        const selectedStatus = select?.value || order.status;

        closeModal(modal);
        await updateOrderStatus(order.id, selectedStatus);
      }
    );
  }

  function openModal(options) {
    const existingModal = document.querySelector(
      '[data-laboratory-modal]'
    );

    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');

    modal.className = 'modal-backdrop';
    modal.dataset.laboratoryModal = 'true';

    modal.innerHTML = `
      <div class="modal-dialog modal-dialog--${escapeHtml(options.size || 'medium')}">
        <div class="modal-header">
          <h2>${escapeHtml(options.title || '')}</h2>

          <button
            type="button"
            class="modal-close"
            data-laboratory-modal-close
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
        event.target.closest('[data-laboratory-modal-close]')
      ) {
        closeModal(modal);
      }
    });

    return modal;
  }

  function closeModal(modal) {
    if (modal && modal.parentNode) {
      modal.remove();
    }
  }

  async function openPatientProfile(patientId) {
    const patient = state.patients.find(
      item => item.id === patientId
    );

    if (!patient) return;

    const orders = state.orders
      .filter(order => order.patientId === patient.id)
      .sort((a, b) => {
        return (
          new Date(b.orderedAt || 0).getTime() -
          new Date(a.orderedAt || 0).getTime()
        );
      })
      .slice(0, 10);

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
            <p>${escapeHtml(patient.uhid || 'UHID unavailable')}</p>
          </div>
        </div>

        <div class="form-grid form-grid--two">
          <div>
            <span class="detail-label">Age</span>
            <strong>${escapeHtml(getPatientAge(patient))}</strong>
          </div>

          <div>
            <span class="detail-label">Gender</span>
            <strong>${escapeHtml(patient.gender || '—')}</strong>
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

        <h3>Recent Diagnostic Orders</h3>

        ${
          orders.length
            ? `
              <div class="compact-list">
                ${orders.map(order => `
                  <div class="compact-list__item">
                    <div>
                      <strong>${escapeHtml(order.testName)}</strong>
                      <span>
                        ${formatDate(order.orderedAt)}
                      </span>
                    </div>

                    <span class="status-badge ${getStatusClass(order.status)}">
                      ${escapeHtml(getStatusLabel(order.status))}
                    </span>
                  </div>
                `).join('')}
              </div>
            `
            : `
              <p class="muted-text">
                No diagnostic orders found.
              </p>
            `
        }
      </div>
    `;

    openModal({
      title: 'Patient Diagnostic Profile',
      content,
      size: 'large'
    });
  }

  function printResult() {
    const order = state.selectedOrder;
    const patient = state.selectedPatient;
    const result = state.selectedResult;

    if (!order || !patient || !result) {
      showToast(
        'No completed result is available for printing.',
        'warning',
        'Print Error'
      );
      return;
    }

    const printWindow = window.open(
      '',
      '_blank',
      'width=800,height=900'
    );

    if (!printWindow) {
      showToast(
        'Please allow pop-ups to print the laboratory report.',
        'warning',
        'Print Blocked'
      );
      return;
    }

    const clinicName =
      CONFIG?.clinic?.name ||
      'AURA Clinic';

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Laboratory Report - ${escapeHtml(order.testName)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 32px;
              color: #111827;
              line-height: 1.5;
            }

            h1, h2, p {
              margin-top: 0;
            }

            .header {
              border-bottom: 2px solid #111827;
              margin-bottom: 24px;
              padding-bottom: 16px;
            }

            .meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 24px;
            }

            .label {
              display: block;
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: .06em;
            }

            .value {
              font-weight: 600;
            }

            .result-box {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              padding: 16px;
              white-space: pre-wrap;
              min-height: 100px;
            }

            .footer {
              margin-top: 48px;
              padding-top: 16px;
              border-top: 1px solid #d1d5db;
              font-size: 12px;
              color: #6b7280;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>${escapeHtml(clinicName)}</h1>
            <p>Laboratory & Diagnostic Report</p>
          </div>

          <div class="meta">
            <div>
              <span class="label">Patient</span>
              <span class="value">${escapeHtml(getPatientName(patient))}</span>
            </div>

            <div>
              <span class="label">UHID</span>
              <span class="value">${escapeHtml(patient.uhid || '—')}</span>
            </div>

            <div>
              <span class="label">Test</span>
              <span class="value">${escapeHtml(order.testName)}</span>
            </div>

            <div>
              <span class="label">Department</span>
              <span class="value">${escapeHtml(order.department)}</span>
            </div>

            <div>
              <span class="label">Ordered At</span>
              <span class="value">${formatDateTime(order.orderedAt)}</span>
            </div>

            <div>
              <span class="label">Verified At</span>
              <span class="value">${formatDateTime(result.verifiedAt || result.updatedAt)}</span>
            </div>
          </div>

          <h2>Result / Findings</h2>

          <div class="result-box">
            ${escapeHtml(result.resultValue || result.result || '')}
          </div>

          <p>
            <strong>Reference Range:</strong>
            ${escapeHtml(result.referenceRange || '—')}
          </p>

          <p>
            <strong>Units:</strong>
            ${escapeHtml(result.units || '—')}
          </p>

          <p>
            <strong>Interpretation:</strong>
            ${escapeHtml(result.interpretation || '—')}
          </p>

          ${
            result.remarks
              ? `
                <p>
                  <strong>Remarks:</strong>
                  ${escapeHtml(result.remarks)}
                </p>
              `
              : ''
          }

          <div class="footer">
            Verified by: ${escapeHtml(result.verifiedByName || '—')}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  async function refresh() {
    await loadData();
    render();
  }

  function getState() {
    return {
      ...state,
      orders: [...state.orders],
      results: [...state.results],
      patients: [...state.patients],
      encounters: [...state.encounters],
      consultations: [...state.consultations],
      staff: [...state.staff]
    };
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    subscriptions.push(callback);

    return () => {
      const index = subscriptions.indexOf(callback);

      if (index !== -1) {
        subscriptions.splice(index, 1);
      }
    };
  }

  function notify() {
    subscriptions.forEach(callback => {
      try {
        callback(getState());
      } catch (error) {
        console.warn('Laboratory subscriber failed:', error);
      }
    });
  }

  function registerEvents() {
    const eventNames = [
      'aura:lab-order-created',
      'aura:lab-order-status-updated',
      'aura:lab-result-updated',
      'aura:lab-result-verified',
      'aura:storage-change'
    ];

    eventNames.forEach(eventName => {
      const handler = () => {
        refresh();
      };

      document.addEventListener(eventName, handler);

      subscriptions.push(() => {
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
        path: 'laboratory',
        title: 'Laboratory & Diagnostics',
        icon: 'flask',
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
    subscribe,

    loadData,

    getFilteredOrders,
    getStats,

    openResultWorkspace,
    updateOrderStatus,

    saveResult,
    printResult
  };

  window.AURA_LABORATORY = api;

  window.AURA = window.AURA || {};
  window.AURA.laboratory = api;

  window.AURA_LABORATORY_MODULE = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize().catch(error => {
        console.error('Laboratory module initialization failed:', error);
      });
    });
  } else {
    initialize().catch(error => {
      console.error('Laboratory module initialization failed:', error);
    });
  }

})();