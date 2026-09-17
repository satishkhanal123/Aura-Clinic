/* =========================================================
   AURA CLINIC — REPORTS MODULE
   File: frontend/js/modules/reports.js
   Purpose: Reporting, analytics, export, and printable summaries
   ========================================================= */

(function () {
  "use strict";

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS;
  const APP = window.AURA_APP;

  const MODULE_NAME = "reports";

  const STORE_NAMES = {
    patients: "patients",
    queues: "queues",
    encounters: "encounters",
    consultations: "consultations",
    vitals: "vitals",
    labOrders: "labOrders",
    labResults: "labResults",
    invoices: "invoices",
    payments: "payments",
    staff: "staff",
    auditLogs: "auditLogs"
  };

  const state = {
    patients: [],
    queues: [],
    encounters: [],
    consultations: [],
    vitals: [],
    labOrders: [],
    labResults: [],
    invoices: [],
    payments: [],
    staff: [],
    auditLogs: [],

    fromDate: "",
    toDate: "",
    reportType: "overview",
    searchTerm: "",

    isLoading: false,
    initialized: false
  };

  const listeners = new Set();

  /* =========================================================
     HELPERS
     ========================================================= */

  function escapeHtml(value) {
    if (UTILS && typeof UTILS.escapeHtml === "function") {
      return UTILS.escapeHtml(String(value ?? ""));
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatCurrency(value) {
    const amount = Number(value || 0);

    if (UTILS && typeof UTILS.formatCurrency === "function") {
      return UTILS.formatCurrency(amount);
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(amount);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value || 0));
  }

  function formatDate(dateValue) {
    if (!dateValue) return "—";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function formatDateTime(dateValue) {
    if (!dateValue) return "—";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function todayISO() {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60000);

    return localDate.toISOString().slice(0, 10);
  }

  function startOfDay(dateValue) {
    const date = new Date(dateValue);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfDay(dateValue) {
    const date = new Date(dateValue);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function getRecordDate(record) {
    return (
      record?.createdAt ||
      record?.updatedAt ||
      record?.date ||
      record?.registeredAt ||
      record?.appointmentDate ||
      record?.consultationDate ||
      record?.serviceDate ||
      record?.issuedAt ||
      record?.paymentDate ||
      record?.performedAt ||
      record?.timestamp ||
      null
    );
  }

  function isDateInRange(record, fromDate, toDate) {
    const value = getRecordDate(record);

    if (!value) return false;

    const recordDate = new Date(value);

    if (Number.isNaN(recordDate.getTime())) return false;

    if (fromDate) {
      const from = startOfDay(fromDate);

      if (recordDate < from) return false;
    }

    if (toDate) {
      const to = endOfDay(toDate);

      if (recordDate > to) return false;
    }

    return true;
  }

  function getFilteredRecords(records) {
    return records.filter((record) =>
      isDateInRange(record, state.fromDate, state.toDate)
    );
  }

  function getPatientName(patient) {
    if (!patient) return "Unknown Patient";

    if (patient.fullName) return patient.fullName;

    return [
      patient.firstName,
      patient.middleName,
      patient.lastName
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unknown Patient";
  }

  function getPatientById(id) {
    if (!id) return null;

    return state.patients.find(
      (patient) =>
        patient.id === id ||
        patient.patientId === id ||
        patient.uhid === id
    ) || null;
  }

  function getStaffById(id) {
    if (!id) return null;

    return state.staff.find(
      (staff) =>
        staff.id === id ||
        staff.staffId === id
    ) || null;
  }

  function getStaffName(staffId, fallback = "Unassigned") {
    const staff = getStaffById(staffId);

    if (!staff) return fallback;

    return (
      staff.fullName ||
      [
        staff.firstName,
        staff.middleName,
        staff.lastName
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      staff.name ||
      fallback
    );
  }

  function notify(type, title, message) {
    if (APP && typeof APP.toast === "function") {
      APP.toast({
        type,
        title,
        message
      });
      return;
    }

    if (window.AURA && typeof window.AURA.toast === "function") {
      window.AURA.toast({
        type,
        title,
        message
      });
    }
  }

  function emit(eventName, payload) {
    if (EVENTS && typeof EVENTS.emit === "function") {
      EVENTS.emit(eventName, payload);
    }
  }

  function subscribe(callback) {
    if (typeof callback !== "function") {
      return function () {};
    }

    listeners.add(callback);

    return function unsubscribe() {
      listeners.delete(callback);
    };
  }

  function notifySubscribers() {
    listeners.forEach((callback) => {
      try {
        callback(getState());
      } catch (error) {
        console.error("[AURA Reports] Subscriber error:", error);
      }
    });
  }

  function getState() {
    return {
      ...state,
      patients: [...state.patients],
      queues: [...state.queues],
      encounters: [...state.encounters],
      consultations: [...state.consultations],
      vitals: [...state.vitals],
      labOrders: [...state.labOrders],
      labResults: [...state.labResults],
      invoices: [...state.invoices],
      payments: [...state.payments],
      staff: [...state.staff],
      auditLogs: [...state.auditLogs]
    };
  }

  /* =========================================================
     DATA LOADING
     ========================================================= */

  async function loadStore(storeName) {
    if (!STORAGE || typeof STORAGE.getAll !== "function") {
      return [];
    }

    try {
      const records = await STORAGE.getAll(storeName);
      return Array.isArray(records) ? records : [];
    } catch (error) {
      console.warn(`[AURA Reports] Failed to load ${storeName}:`, error);
      return [];
    }
  }

  async function loadData() {
    state.isLoading = true;

    const results = await Promise.all([
      loadStore(STORE_NAMES.patients),
      loadStore(STORE_NAMES.queues),
      loadStore(STORE_NAMES.encounters),
      loadStore(STORE_NAMES.consultations),
      loadStore(STORE_NAMES.vitals),
      loadStore(STORE_NAMES.labOrders),
      loadStore(STORE_NAMES.labResults),
      loadStore(STORE_NAMES.invoices),
      loadStore(STORE_NAMES.payments),
      loadStore(STORE_NAMES.staff),
      loadStore(STORE_NAMES.auditLogs)
    ]);

    [
      state.patients,
      state.queues,
      state.encounters,
      state.consultations,
      state.vitals,
      state.labOrders,
      state.labResults,
      state.invoices,
      state.payments,
      state.staff,
      state.auditLogs
    ] = results;

    state.isLoading = false;

    notifySubscribers();

    return getState();
  }

  /* =========================================================
     REPORT CALCULATIONS
     ========================================================= */

  function getReportData() {
    const patients = getFilteredRecords(state.patients);
    const queues = getFilteredRecords(state.queues);
    const encounters = getFilteredRecords(state.encounters);
    const consultations = getFilteredRecords(state.consultations);
    const vitals = getFilteredRecords(state.vitals);
    const labOrders = getFilteredRecords(state.labOrders);
    const labResults = getFilteredRecords(state.labResults);
    const invoices = getFilteredRecords(state.invoices);
    const payments = getFilteredRecords(state.payments);
    const auditLogs = getFilteredRecords(state.auditLogs);

    const completedQueues = queues.filter(
      (queue) =>
        queue.status === "completed" ||
        queue.status === "served" ||
        queue.completedAt
    );

    const completedConsultations = consultations.filter(
      (consultation) =>
        consultation.status === "completed" ||
        consultation.completedAt
    );

    const completedLabOrders = labOrders.filter(
      (order) =>
        order.status === "completed" ||
        order.status === "verified" ||
        order.completedAt
    );

    const totalBilled = invoices.reduce((sum, invoice) => {
      return sum + Number(
        invoice.grandTotal ??
        invoice.total ??
        invoice.amount ??
        invoice.netAmount ??
        0
      );
    }, 0);

    const totalPaid = payments.reduce((sum, payment) => {
      return sum + Number(
        payment.amount ??
        payment.paidAmount ??
        payment.total ??
        0
      );
    }, 0);

    const outstanding = invoices.reduce((sum, invoice) => {
      const total = Number(
        invoice.grandTotal ??
        invoice.total ??
        invoice.amount ??
        invoice.netAmount ??
        0
      );

      const paid = Number(
        invoice.paidAmount ??
        invoice.amountPaid ??
        0
      );

      return sum + Math.max(0, total - paid);
    }, 0);

    const uniquePatientIds = new Set(
      [
        ...patients.map((patient) => patient.id || patient.uhid),
        ...queues.map((queue) => queue.patientId || queue.uhid),
        ...encounters.map((encounter) => encounter.patientId || encounter.uhid)
      ].filter(Boolean)
    );

    const genderBreakdown = patients.reduce((accumulator, patient) => {
      const gender = String(
        patient.gender ||
        patient.sex ||
        "unknown"
      ).toLowerCase();

      accumulator[gender] = (accumulator[gender] || 0) + 1;

      return accumulator;
    }, {});

    const queueByDepartment = queues.reduce((accumulator, queue) => {
      const department =
        queue.departmentName ||
        queue.department ||
        queue.service ||
        "General";

      accumulator[department] = (accumulator[department] || 0) + 1;

      return accumulator;
    }, {});

    const labByStatus = labOrders.reduce((accumulator, order) => {
      const status = order.status || "pending";

      accumulator[status] = (accumulator[status] || 0) + 1;

      return accumulator;
    }, {});

    const paymentByMethod = payments.reduce((accumulator, payment) => {
      const method =
        payment.paymentMethod ||
        payment.method ||
        "Other";

      accumulator[method] =
        (accumulator[method] || 0) +
        Number(
          payment.amount ??
          payment.paidAmount ??
          payment.total ??
          0
        );

      return accumulator;
    }, {});

    const staffActivity = auditLogs.reduce((accumulator, log) => {
      const staffId =
        log.userId ||
        log.staffId ||
        log.actorId ||
        "system";

      accumulator[staffId] = (accumulator[staffId] || 0) + 1;

      return accumulator;
    }, {});

    return {
      range: {
        from: state.fromDate,
        to: state.toDate
      },

      totals: {
        patientsRegistered: patients.length,
        uniquePatients: uniquePatientIds.size,
        queueEntries: queues.length,
        completedQueues: completedQueues.length,
        encounters: encounters.length,
        consultations: consultations.length,
        completedConsultations: completedConsultations.length,
        vitalsRecorded: vitals.length,
        labOrders: labOrders.length,
        completedLabOrders: completedLabOrders.length,
        labResults: labResults.length,
        invoices: invoices.length,
        totalBilled,
        totalPaid,
        outstanding,
        auditEvents: auditLogs.length
      },

      genderBreakdown,
      queueByDepartment,
      labByStatus,
      paymentByMethod,
      staffActivity,

      records: {
        patients,
        queues,
        encounters,
        consultations,
        vitals,
        labOrders,
        labResults,
        invoices,
        payments,
        auditLogs
      }
    };
  }

  /* =========================================================
     UI RENDERING
     ========================================================= */

  function renderLoading() {
    return `
      <section class="page-state page-state--loading">
        <div class="page-state__icon">
          <span class="material-symbols-rounded">progress_activity</span>
        </div>
        <h3>Preparing reports</h3>
        <p>Loading clinic data and calculating statistics.</p>
      </section>
    `;
  }

  function renderEmptyState() {
    return `
      <section class="page-state">
        <div class="page-state__icon">
          <span class="material-symbols-rounded">analytics</span>
        </div>
        <h3>No report data available</h3>
        <p>Try selecting a different date range or add clinic records first.</p>
      </section>
    `;
  }

  function renderStatCard(icon, label, value, caption = "") {
    return `
      <article class="metric-card">
        <div class="metric-card__icon">
          <span class="material-symbols-rounded">${escapeHtml(icon)}</span>
        </div>
        <div class="metric-card__body">
          <span class="metric-card__label">${escapeHtml(label)}</span>
          <strong class="metric-card__value">${escapeHtml(value)}</strong>
          ${
            caption
              ? `<span class="metric-card__caption">${escapeHtml(caption)}</span>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderProgressBar(label, value, total, suffix = "") {
    const percentage = total > 0
      ? Math.min(100, Math.round((value / total) * 100))
      : 0;

    return `
      <div class="report-progress-row">
        <div class="report-progress-row__top">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatNumber(value))}${suffix}</strong>
        </div>
        <div class="report-progress">
          <span style="width:${percentage}%"></span>
        </div>
      </div>
    `;
  }

  function renderHeader() {
    return `
      <div class="page-header">
        <div>
          <div class="eyebrow">
            <span class="material-symbols-rounded">analytics</span>
            Operations Intelligence
          </div>

          <h1>Reports & Analytics</h1>

          <p class="page-header__subtitle">
            Monitor patient flow, clinical activity, diagnostics, and revenue.
          </p>
        </div>

        <div class="page-header__actions">
          <button
            class="btn btn-secondary"
            type="button"
            data-report-action="print"
          >
            <span class="material-symbols-rounded">print</span>
            Print
          </button>

          <button
            class="btn btn-primary"
            type="button"
            data-report-action="export"
          >
            <span class="material-symbols-rounded">download</span>
            Export CSV
          </button>
        </div>
      </div>
    `;
  }

  function renderFilters() {
    const today = todayISO();

    return `
      <section class="card reports-filter-card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Report Filters</h2>
            <p class="card__subtitle">
              Select a date range and report category.
            </p>
          </div>

          <button
            class="btn btn-ghost btn-sm"
            type="button"
            data-report-action="today"
          >
            Today
          </button>
        </div>

        <div class="form-grid form-grid--three">
          <label class="form-field">
            <span class="form-label">From Date</span>
            <input
              class="form-control"
              type="date"
              id="reports-from-date"
              value="${escapeHtml(state.fromDate || today)}"
            />
          </label>

          <label class="form-field">
            <span class="form-label">To Date</span>
            <input
              class="form-control"
              type="date"
              id="reports-to-date"
              value="${escapeHtml(state.toDate || today)}"
            />
          </label>

          <label class="form-field">
            <span class="form-label">Report Type</span>
            <select class="form-control" id="reports-report-type">
              <option value="overview" ${
                state.reportType === "overview" ? "selected" : ""
              }>
                Overview
              </option>
              <option value="patients" ${
                state.reportType === "patients" ? "selected" : ""
              }>
                Patients
              </option>
              <option value="clinical" ${
                state.reportType === "clinical" ? "selected" : ""
              }>
                Clinical
              </option>
              <option value="laboratory" ${
                state.reportType === "laboratory" ? "selected" : ""
              }>
                Laboratory
              </option>
              <option value="billing" ${
                state.reportType === "billing" ? "selected" : ""
              }>
                Billing
              </option>
              <option value="staff" ${
                state.reportType === "staff" ? "selected" : ""
              }>
                Staff Activity
              </option>
            </select>
          </label>
        </div>

        <div class="reports-filter-card__footer">
          <span class="status-badge status-neutral">
            <span class="material-symbols-rounded">calendar_month</span>
            ${formatDate(state.fromDate)} – ${formatDate(state.toDate)}
          </span>

          <button
            class="btn btn-primary btn-sm"
            type="button"
            data-report-action="apply"
          >
            <span class="material-symbols-rounded">refresh</span>
            Apply Filters
          </button>
        </div>
      </section>
    `;
  }

  function renderOverview(data) {
    const totals = data.totals;

    const completionRate =
      totals.queueEntries > 0
        ? Math.round((totals.completedQueues / totals.queueEntries) * 100)
        : 0;

    const collectionRate =
      totals.totalBilled > 0
        ? Math.round((totals.totalPaid / totals.totalBilled) * 100)
        : 0;

    return `
      <section class="metrics-grid metrics-grid--four">
        ${renderStatCard(
          "person_add",
          "Patients Registered",
          formatNumber(totals.patientsRegistered),
          `${formatNumber(totals.uniquePatients)} unique patients`
        )}

        ${renderStatCard(
          "medical_services",
          "Clinical Encounters",
          formatNumber(totals.encounters),
          `${formatNumber(totals.completedConsultations)} consultations completed`
        )}

        ${renderStatCard(
          "science",
          "Lab Orders",
          formatNumber(totals.labOrders),
          `${formatNumber(totals.completedLabOrders)} completed`
        )}

        ${renderStatCard(
          "payments",
          "Revenue Collected",
          formatCurrency(totals.totalPaid),
          `${formatCurrency(totals.outstanding)} outstanding`
        )}
      </section>

      <section class="reports-grid reports-grid--two">
        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Patient & Clinical Activity</h2>
              <p class="card__subtitle">Operational activity during the selected period.</p>
            </div>
          </div>

          <div class="report-progress-list">
            ${renderProgressBar(
              "Queue Completion",
              totals.completedQueues,
              totals.queueEntries
            )}

            ${renderProgressBar(
              "Consultation Completion",
              totals.completedConsultations,
              totals.consultations
            )}

            ${renderProgressBar(
              "Laboratory Completion",
              totals.completedLabOrders,
              totals.labOrders
            )}

            ${renderProgressBar(
              "Payment Collection",
              totals.totalPaid,
              totals.totalBilled,
              "%"
            )}
          </div>
        </article>

        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Financial Snapshot</h2>
              <p class="card__subtitle">Billing and collection performance.</p>
            </div>
          </div>

          <div class="report-summary-list">
            <div class="report-summary-item">
              <span>Total Invoices</span>
              <strong>${formatNumber(totals.invoices)}</strong>
            </div>

            <div class="report-summary-item">
              <span>Total Billed</span>
              <strong>${formatCurrency(totals.totalBilled)}</strong>
            </div>

            <div class="report-summary-item">
              <span>Total Collected</span>
              <strong>${formatCurrency(totals.totalPaid)}</strong>
            </div>

            <div class="report-summary-item">
              <span>Outstanding Balance</span>
              <strong>${formatCurrency(totals.outstanding)}</strong>
            </div>
          </div>

          <div class="report-highlight">
            <span class="material-symbols-rounded">account_balance_wallet</span>
            <div>
              <strong>${collectionRate}% collection rate</strong>
              <p>Based on billed versus paid amounts.</p>
            </div>
          </div>
        </article>
      </section>

      <section class="reports-grid reports-grid--two">
        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Queue by Department</h2>
              <p class="card__subtitle">Patient movement across departments.</p>
            </div>
          </div>

          <div class="report-list">
            ${renderDepartmentRows(data.queueByDepartment)}
          </div>
        </article>

        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Laboratory Status</h2>
              <p class="card__subtitle">Diagnostic orders by current status.</p>
            </div>
          </div>

          <div class="report-list">
            ${renderStatusRows(data.labByStatus)}
          </div>
        </article>
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Payment Methods</h2>
            <p class="card__subtitle">Collection distribution by payment method.</p>
          </div>
        </div>

        <div class="report-table-wrap">
          ${renderPaymentTable(data.paymentByMethod)}
        </div>
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Operational Summary</h2>
            <p class="card__subtitle">Key activities recorded in the system.</p>
          </div>
        </div>

        <div class="report-summary-grid">
          <div class="report-summary-item">
            <span>Vitals Recorded</span>
            <strong>${formatNumber(totals.vitalsRecorded)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Lab Results</span>
            <strong>${formatNumber(totals.labResults)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Audit Events</span>
            <strong>${formatNumber(totals.auditEvents)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Queue Completion Rate</span>
            <strong>${completionRate}%</strong>
          </div>
        </div>
      </section>
    `;
  }

  function renderDepartmentRows(departments) {
    const entries = Object.entries(departments || {})
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      return `<div class="empty-state-inline">No department data available.</div>`;
    }

    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    return entries.map(([department, count]) => {
      const percentage = total > 0
        ? Math.round((count / total) * 100)
        : 0;

      return `
        <div class="report-list-row">
          <div class="report-list-row__content">
            <span class="report-list-row__label">
              ${escapeHtml(department)}
            </span>

            <div class="report-progress">
              <span style="width:${percentage}%"></span>
            </div>
          </div>

          <strong>${formatNumber(count)}</strong>
        </div>
      `;
    }).join("");
  }

  function renderStatusRows(statuses) {
    const entries = Object.entries(statuses || {})
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      return `<div class="empty-state-inline">No laboratory data available.</div>`;
    }

    return entries.map(([status, count]) => `
      <div class="report-list-row">
        <span class="status-badge status-neutral">
          ${escapeHtml(status.replace(/[-_]/g, " "))}
        </span>

        <strong>${formatNumber(count)}</strong>
      </div>
    `).join("");
  }

  function renderPaymentTable(paymentByMethod) {
    const entries = Object.entries(paymentByMethod || {})
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      return `<div class="empty-state-inline">No payment data available.</div>`;
    }

    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Payment Method</th>
            <th>Amount</th>
            <th>Share</th>
          </tr>
        </thead>

        <tbody>
          ${entries.map(([method, amount]) => {
            const share = total > 0
              ? Math.round((amount / total) * 100)
              : 0;

            return `
              <tr>
                <td>${escapeHtml(method)}</td>
                <td>${formatCurrency(amount)}</td>
                <td>${share}%</td>
              </tr>
            `;
          }).join("")}
        </tbody>

        <tfoot>
          <tr>
            <th>Total</th>
            <th>${formatCurrency(total)}</th>
            <th>100%</th>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderPatientsReport(data) {
    const totals = data.totals;
    const genderEntries = Object.entries(data.genderBreakdown || {});

    return `
      <section class="metrics-grid metrics-grid--four">
        ${renderStatCard(
          "person_add",
          "New Registrations",
          formatNumber(totals.patientsRegistered)
        )}

        ${renderStatCard(
          "groups",
          "Unique Patients",
          formatNumber(totals.uniquePatients)
        )}

        ${renderStatCard(
          "emergency",
          "Male Patients",
          formatNumber(data.genderBreakdown.male || 0)
        )}

        ${renderStatCard(
          "female",
          "Female Patients",
          formatNumber(data.genderBreakdown.female || 0)
        )}
      </section>

      <section class="reports-grid reports-grid--two">
        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Gender Distribution</h2>
              <p class="card__subtitle">Patient registrations by recorded gender.</p>
            </div>
          </div>

          <div class="report-list">
            ${
              genderEntries.length
                ? genderEntries.map(([gender, count]) => `
                    <div class="report-list-row">
                      <span>${escapeHtml(gender)}</span>
                      <strong>${formatNumber(count)}</strong>
                    </div>
                  `).join("")
                : `<div class="empty-state-inline">No patient demographics available.</div>`
            }
          </div>
        </article>

        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Registration Overview</h2>
              <p class="card__subtitle">Patient registration activity.</p>
            </div>
          </div>

          <div class="report-summary-list">
            <div class="report-summary-item">
              <span>Total Registrations</span>
              <strong>${formatNumber(totals.patientsRegistered)}</strong>
            </div>

            <div class="report-summary-item">
              <span>Unique Patients</span>
              <strong>${formatNumber(totals.uniquePatients)}</strong>
            </div>

            <div class="report-summary-item">
              <span>Repeat Visit Records</span>
              <strong>
                ${formatNumber(Math.max(0, totals.patientsRegistered - totals.uniquePatients))}
              </strong>
            </div>
          </div>
        </article>
      </section>
    `;
  }

  function renderClinicalReport(data) {
    const totals = data.totals;

    return `
      <section class="metrics-grid metrics-grid--four">
        ${renderStatCard(
          "format_list_numbered",
          "Queue Entries",
          formatNumber(totals.queueEntries)
        )}

        ${renderStatCard(
          "task_alt",
          "Completed Queues",
          formatNumber(totals.completedQueues)
        )}

        ${renderStatCard(
          "stethoscope",
          "Consultations",
          formatNumber(totals.consultations)
        )}

        ${renderStatCard(
          "vital_signs",
          "Vitals Recorded",
          formatNumber(totals.vitalsRecorded)
        )}
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Clinical Activity by Department</h2>
            <p class="card__subtitle">Queue distribution for the selected period.</p>
          </div>
        </div>

        <div class="report-list">
          ${renderDepartmentRows(data.queueByDepartment)}
        </div>
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Clinical Records Summary</h2>
            <p class="card__subtitle">Consultation and encounter activity.</p>
          </div>
        </div>

        <div class="report-summary-grid">
          <div class="report-summary-item">
            <span>Encounters</span>
            <strong>${formatNumber(totals.encounters)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Consultations</span>
            <strong>${formatNumber(totals.consultations)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Completed Consultations</span>
            <strong>${formatNumber(totals.completedConsultations)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Vitals Records</span>
            <strong>${formatNumber(totals.vitalsRecorded)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  function renderLaboratoryReport(data) {
    const totals = data.totals;

    return `
      <section class="metrics-grid metrics-grid--four">
        ${renderStatCard(
          "science",
          "Lab Orders",
          formatNumber(totals.labOrders)
        )}

        ${renderStatCard(
          "task_alt",
          "Completed Orders",
          formatNumber(totals.completedLabOrders)
        )}

        ${renderStatCard(
          "description",
          "Lab Results",
          formatNumber(totals.labResults)
        )}

        ${renderStatCard(
          "pending_actions",
          "Pending Orders",
          formatNumber(
            Math.max(0, totals.labOrders - totals.completedLabOrders)
          )
        )}
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Laboratory Status Distribution</h2>
            <p class="card__subtitle">Orders grouped by workflow status.</p>
          </div>
        </div>

        <div class="report-list">
          ${renderStatusRows(data.labByStatus)}
        </div>
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Diagnostic Performance</h2>
            <p class="card__subtitle">Laboratory workflow completion.</p>
          </div>
        </div>

        ${renderProgressBar(
          "Order Completion",
          totals.completedLabOrders,
          totals.labOrders
        )}

        ${renderProgressBar(
          "Result Availability",
          totals.labResults,
          totals.labOrders
        )}
      </section>
    `;
  }

  function renderBillingReport(data) {
    const totals = data.totals;

    return `
      <section class="metrics-grid metrics-grid--four">
        ${renderStatCard(
          "receipt_long",
          "Invoices",
          formatNumber(totals.invoices)
        )}

        ${renderStatCard(
          "account_balance",
          "Total Billed",
          formatCurrency(totals.totalBilled)
        )}

        ${renderStatCard(
          "payments",
          "Collected",
          formatCurrency(totals.totalPaid)
        )}

        ${renderStatCard(
          "pending",
          "Outstanding",
          formatCurrency(totals.outstanding)
        )}
      </section>

      <section class="reports-grid reports-grid--two">
        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Collection Performance</h2>
              <p class="card__subtitle">Revenue billed compared with revenue collected.</p>
            </div>
          </div>

          ${renderProgressBar(
            "Collection Rate",
            totals.totalPaid,
            totals.totalBilled
          )}

          <div class="report-highlight">
            <span class="material-symbols-rounded">payments</span>
            <div>
              <strong>${formatCurrency(totals.totalPaid)}</strong>
              <p>Collected during the selected period.</p>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Payment Distribution</h2>
              <p class="card__subtitle">Revenue grouped by payment method.</p>
            </div>
          </div>

          <div class="report-list">
            ${renderPaymentRows(data.paymentByMethod)}
          </div>
        </article>
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Billing Summary</h2>
            <p class="card__subtitle">Invoice and payment reconciliation overview.</p>
          </div>
        </div>

        <div class="report-summary-grid">
          <div class="report-summary-item">
            <span>Invoices Issued</span>
            <strong>${formatNumber(totals.invoices)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Total Billed</span>
            <strong>${formatCurrency(totals.totalBilled)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Total Paid</span>
            <strong>${formatCurrency(totals.totalPaid)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Outstanding</span>
            <strong>${formatCurrency(totals.outstanding)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  function renderPaymentRows(paymentByMethod) {
    const entries = Object.entries(paymentByMethod || {})
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      return `<div class="empty-state-inline">No payment data available.</div>`;
    }

    return entries.map(([method, amount]) => `
      <div class="report-list-row">
        <span>${escapeHtml(method)}</span>
        <strong>${formatCurrency(amount)}</strong>
      </div>
    `).join("");
  }

  function renderStaffReport(data) {
    const activityEntries = Object.entries(data.staffActivity || {})
      .sort((a, b) => b[1] - a[1]);

    return `
      <section class="metrics-grid metrics-grid--four">
        ${renderStatCard(
          "badge",
          "Total Staff",
          formatNumber(state.staff.length)
        )}

        ${renderStatCard(
          "groups",
          "Active Staff",
          formatNumber(
            state.staff.filter((staff) => staff.status === "active").length
          )
        )}

        ${renderStatCard(
          "history",
          "Audit Events",
          formatNumber(data.totals.auditEvents)
        )}

        ${renderStatCard(
          "medical_services",
          "Staff Activities",
          formatNumber(activityEntries.length)
        )}
      </section>

      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Staff Activity</h2>
            <p class="card__subtitle">Recorded actions during the selected period.</p>
          </div>
        </div>

        <div class="report-table-wrap">
          ${
            activityEntries.length
              ? `
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Activity Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activityEntries.map(([staffId, count]) => `
                      <tr>
                        <td>${escapeHtml(getStaffName(staffId, staffId))}</td>
                        <td>${formatNumber(count)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              `
              : `<div class="empty-state-inline">No staff activity recorded.</div>`
          }
        </div>
      </section>
    `;
  }

  function renderRecentActivity(data) {
    const records = [
      ...data.records.auditLogs.map((record) => ({
        type: "Audit",
        icon: "history",
        date: getRecordDate(record),
        label: record.action || record.event || "System activity",
        detail: record.description || record.message || ""
      })),
      ...data.records.payments.map((record) => ({
        type: "Payment",
        icon: "payments",
        date: getRecordDate(record),
        label: "Payment recorded",
        detail: formatCurrency(
          record.amount ??
          record.paidAmount ??
          record.total ??
          0
        )
      })),
      ...data.records.labResults.map((record) => ({
        type: "Laboratory",
        icon: "science",
        date: getRecordDate(record),
        label: "Laboratory result updated",
        detail: record.status || "Result available"
      })),
      ...data.records.consultations.map((record) => ({
        type: "Clinical",
        icon: "stethoscope",
        date: getRecordDate(record),
        label: "Consultation recorded",
        detail: record.diagnosis || record.status || ""
      }))
    ]
      .filter((item) => item.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    if (!records.length) {
      return `
        <div class="empty-state-inline">
          No recent activity available.
        </div>
      `;
    }

    return `
      <div class="activity-list">
        ${records.map((item) => `
          <div class="activity-item">
            <div class="activity-item__icon">
              <span class="material-symbols-rounded">
                ${escapeHtml(item.icon)}
              </span>
            </div>

            <div class="activity-item__content">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail || item.type)}</span>
            </div>

            <time>${escapeHtml(formatDateTime(item.date))}</time>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderReportBody(data) {
    if (!data.records.patients.length &&
        !data.records.queues.length &&
        !data.records.encounters.length &&
        !data.records.invoices.length &&
        !data.records.payments.length &&
        !data.records.labOrders.length) {
      return renderEmptyState();
    }

    switch (state.reportType) {
      case "patients":
        return renderPatientsReport(data);

      case "clinical":
        return renderClinicalReport(data);

      case "laboratory":
        return renderLaboratoryReport(data);

      case "billing":
        return renderBillingReport(data);

      case "staff":
        return renderStaffReport(data);

      case "overview":
      default:
        return renderOverview(data);
    }
  }

  function render() {
    const target =
      document.querySelector('[data-route-view="reports"]') ||
      document.querySelector("#app-content") ||
      document.querySelector("#app");

    if (!target) return;

    if (state.isLoading) {
      target.innerHTML = renderLoading();
      return;
    }

    const data = getReportData();

    target.innerHTML = `
      <div class="page-shell reports-page">
        ${renderHeader()}
        ${renderFilters()}

        <div class="reports-page__body">
          ${renderReportBody(data)}
        </div>

        <section class="card">
          <div class="card__header">
            <div>
              <h2 class="card__title">Recent Activity</h2>
              <p class="card__subtitle">
                Latest recorded system and operational events.
              </p>
            </div>
          </div>

          ${renderRecentActivity(data)}
        </section>
      </div>
    `;

    bindEvents(target);
  }

  /* =========================================================
     FILTERS AND EVENTS
     ========================================================= */

  function initializeDefaultDates() {
    const today = todayISO();

    if (!state.fromDate) {
      state.fromDate = today;
    }

    if (!state.toDate) {
      state.toDate = today;
    }
  }

  function applyFilters() {
    const fromInput = document.querySelector("#reports-from-date");
    const toInput = document.querySelector("#reports-to-date");
    const typeInput = document.querySelector("#reports-report-type");

    if (fromInput) {
      state.fromDate = fromInput.value || todayISO();
    }

    if (toInput) {
      state.toDate = toInput.value || state.fromDate;
    }

    if (typeInput) {
      state.reportType = typeInput.value || "overview";
    }

    if (state.fromDate > state.toDate) {
      const temporary = state.fromDate;
      state.fromDate = state.toDate;
      state.toDate = temporary;
    }

    render();
    notifySubscribers();
  }

  function setToday() {
    const today = todayISO();

    state.fromDate = today;
    state.toDate = today;

    render();
    notifySubscribers();
  }

  function bindEvents(container) {
    container.querySelectorAll("[data-report-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.reportAction;

        if (action === "apply") {
          applyFilters();
        }

        if (action === "today") {
          setToday();
        }

        if (action === "export") {
          exportCSV();
        }

        if (action === "print") {
          printReport();
        }
      });
    });

    const fromInput = container.querySelector("#reports-from-date");
    const toInput = container.querySelector("#reports-to-date");
    const typeInput = container.querySelector("#reports-report-type");

    if (fromInput) {
      fromInput.addEventListener("change", () => {
        state.fromDate = fromInput.value;
      });
    }

    if (toInput) {
      toInput.addEventListener("change", () => {
        state.toDate = toInput.value;
      });
    }

    if (typeInput) {
      typeInput.addEventListener("change", () => {
        state.reportType = typeInput.value;
      });
    }
  }

  /* =========================================================
     CSV EXPORT
     ========================================================= */

  function csvEscape(value) {
    const stringValue = String(value ?? "");

    if (
      stringValue.includes(",") ||
      stringValue.includes('"') ||
      stringValue.includes("\n")
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  function createCSVRows(data) {
    const rows = [];

    rows.push([
      "AURA Clinic Report",
      ""
    ]);

    rows.push([
      "Report Type",
      state.reportType
    ]);

    rows.push([
      "From Date",
      state.fromDate
    ]);

    rows.push([
      "To Date",
      state.toDate
    ]);

    rows.push([]);

    rows.push([
      "Metric",
      "Value"
    ]);

    Object.entries(data.totals).forEach(([key, value]) => {
      rows.push([
        key,
        typeof value === "number" ? value : String(value)
      ]);
    });

    rows.push([]);

    rows.push([
      "Payment Method",
      "Amount"
    ]);

    Object.entries(data.paymentByMethod).forEach(([method, amount]) => {
      rows.push([
        method,
        amount
      ]);
    });

    rows.push([]);

    rows.push([
      "Queue Department",
      "Count"
    ]);

    Object.entries(data.queueByDepartment).forEach(([department, count]) => {
      rows.push([
        department,
        count
      ]);
    });

    rows.push([]);

    rows.push([
      "Laboratory Status",
      "Count"
    ]);

    Object.entries(data.labByStatus).forEach(([status, count]) => {
      rows.push([
        status,
        count
      ]);
    });

    return rows;
  }

  function exportCSV() {
    const data = getReportData();
    const rows = createCSVRows(data);

    const csvContent = rows
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const filename = [
      "aura-clinic-report",
      state.reportType,
      state.fromDate,
      state.toDate
    ].join("-") + ".csv";

    if (UTILS && typeof UTILS.downloadFile === "function") {
      UTILS.downloadFile(filename, csvContent, "text/csv;charset=utf-8");
    } else {
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8"
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      anchor.click();

      URL.revokeObjectURL(url);
    }

    notify(
      "success",
      "Report exported",
      "The CSV report has been downloaded."
    );

    emit("reports:exported", {
      reportType: state.reportType,
      fromDate: state.fromDate,
      toDate: state.toDate,
      filename
    });
  }

  /* =========================================================
     PRINTING
     ========================================================= */

  function printReport() {
    const data = getReportData();

    const printableWindow = window.open(
      "",
      "_blank",
      "width=1100,height=800"
    );

    if (!printableWindow) {
      notify(
        "warning",
        "Popup blocked",
        "Allow popups to print the report."
      );
      return;
    }

    const clinicName =
      CONFIG.clinic?.name ||
      CONFIG.app?.name ||
      "AURA Clinic";

    const reportTitle = state.reportType
      .charAt(0)
      .toUpperCase() + state.reportType.slice(1);

    printableWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(clinicName)} — ${escapeHtml(reportTitle)} Report</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 32px;
            color: #172033;
            font-family: Arial, sans-serif;
            background: #ffffff;
          }

          h1,
          h2,
          h3,
          p {
            margin-top: 0;
          }

          .print-header {
            border-bottom: 2px solid #172033;
            padding-bottom: 18px;
            margin-bottom: 24px;
          }

          .print-header h1 {
            margin-bottom: 8px;
            font-size: 26px;
          }

          .print-header p {
            margin-bottom: 4px;
            color: #5f6b7a;
          }

          .print-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 14px;
            margin-bottom: 28px;
          }

          .metric {
            border: 1px solid #dce2ea;
            border-radius: 10px;
            padding: 16px;
          }

          .metric span {
            display: block;
            color: #657184;
            font-size: 12px;
            margin-bottom: 8px;
          }

          .metric strong {
            font-size: 20px;
          }

          .section {
            margin-top: 26px;
          }

          .section h2 {
            font-size: 17px;
            margin-bottom: 12px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 18px;
          }

          th,
          td {
            border: 1px solid #dce2ea;
            padding: 9px 10px;
            text-align: left;
            font-size: 12px;
          }

          th {
            background: #f4f6f8;
          }

          .footer {
            margin-top: 32px;
            padding-top: 14px;
            border-top: 1px solid #dce2ea;
            color: #657184;
            font-size: 11px;
          }

          @media print {
            body {
              padding: 16px;
            }

            .print-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }
        </style>
      </head>

      <body>
        <header class="print-header">
          <h1>${escapeHtml(clinicName)}</h1>
          <p>${escapeHtml(reportTitle)} Report</p>
          <p>
            Period: ${escapeHtml(formatDate(state.fromDate))}
            to
            ${escapeHtml(formatDate(state.toDate))}
          </p>
          <p>Generated: ${escapeHtml(formatDateTime(new Date()))}</p>
        </header>

        <section class="print-grid">
          <div class="metric">
            <span>Patients Registered</span>
            <strong>${formatNumber(data.totals.patientsRegistered)}</strong>
          </div>

          <div class="metric">
            <span>Clinical Encounters</span>
            <strong>${formatNumber(data.totals.encounters)}</strong>
          </div>

          <div class="metric">
            <span>Laboratory Orders</span>
            <strong>${formatNumber(data.totals.labOrders)}</strong>
          </div>

          <div class="metric">
            <span>Revenue Collected</span>
            <strong>${escapeHtml(formatCurrency(data.totals.totalPaid))}</strong>
          </div>
        </section>

        <section class="section">
          <h2>Operational Summary</h2>

          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>

            <tbody>
              ${Object.entries(data.totals).map(([key, value]) => `
                <tr>
                  <td>${escapeHtml(key)}</td>
                  <td>${escapeHtml(
                    typeof value === "number"
                      ? formatNumber(value)
                      : value
                  )}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>Payment Methods</h2>

          <table>
            <thead>
              <tr>
                <th>Payment Method</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              ${
                Object.entries(data.paymentByMethod).length
                  ? Object.entries(data.paymentByMethod).map(([method, amount]) => `
                      <tr>
                        <td>${escapeHtml(method)}</td>
                        <td>${escapeHtml(formatCurrency(amount))}</td>
                      </tr>
                    `).join("")
                  : `
                    <tr>
                      <td colspan="2">No payment records available.</td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>Queue by Department</h2>

          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Queue Entries</th>
              </tr>
            </thead>

            <tbody>
              ${
                Object.entries(data.queueByDepartment).length
                  ? Object.entries(data.queueByDepartment).map(([department, count]) => `
                      <tr>
                        <td>${escapeHtml(department)}</td>
                        <td>${formatNumber(count)}</td>
                      </tr>
                    `).join("")
                  : `
                    <tr>
                      <td colspan="2">No queue records available.</td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </section>

        <footer class="footer">
          Generated by AURA Clinic Management System.
        </footer>

        <script>
          window.addEventListener("load", function () {
            window.print();
          });
        <\/script>
      </body>
      </html>
    `);

    printableWindow.document.close();

    emit("reports:printed", {
      reportType: state.reportType,
      fromDate: state.fromDate,
      toDate: state.toDate
    });
  }

  /* =========================================================
     REFRESH AND EVENT SUBSCRIPTIONS
     ========================================================= */

  async function refresh() {
    await loadData();
    render();
    return getState();
  }

  function registerEventListeners() {
    if (!EVENTS || typeof EVENTS.on !== "function") return;

    const eventNames = [
      "patient:created",
      "patient:updated",
      "patient:deleted",

      "queue:created",
      "queue:updated",
      "queue:called",
      "queue:completed",

      "vitals:recorded",
      "consultation:created",
      "consultation:completed",

      "lab:order-created",
      "lab:result-created",
      "lab:result-verified",
      "lab:order-status-updated",

      "invoice:created",
      "payment:created",

      "staff:created",
      "staff:updated",
      "staff:deleted",

      "storage:change"
    ];

    eventNames.forEach((eventName) => {
      EVENTS.on(eventName, () => {
        refresh();
      });
    });
  }

  /* =========================================================
     MODULE INITIALIZATION
     ========================================================= */

  async function initialize() {
    if (state.initialized) {
      return getState();
    }

    state.initialized = true;

    initializeDefaultDates();
    registerEventListeners();

    await loadData();

    return getState();
  }

  function registerModule() {
    if (
      window.AURA_APP &&
      typeof window.AURA_APP.registerModule === "function"
    ) {
      window.AURA_APP.registerModule(MODULE_NAME, {
        initialize,
        render,
        refresh,
        getState,
        subscribe,
        exportCSV,
        printReport,
        applyFilters,
        setToday
      });
    }
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.AURA_REPORTS = {
    initialize,
    render,
    refresh,
    getState,
    subscribe,
    exportCSV,
    printReport,
    applyFilters,
    setToday
  };

  window.AURA = window.AURA || {};
  window.AURA.reports = window.AURA_REPORTS;

  registerModule();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

})();