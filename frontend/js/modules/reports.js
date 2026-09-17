(function (window, document) {
  "use strict";

  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS;
  const APP = window.AURA_APP;

  const MODULE_NAME = "reports";

  const STORES = {
    patients: "patients",
    staff: "staff",
    encounters: "encounters",
    queues: "queues",
    vitals: "vitals",
    consultations: "consultations",
    prescriptions: "prescriptions",
    labOrders: "labOrders",
    labResults: "labResults",
    invoices: "invoices",
    payments: "payments",
    auditLogs: "auditLogs",
    settings: "settings"
  };

  const state = {
    initialized: false,
    loading: false,
    range: "today",
    customFrom: "",
    customTo: "",
    activeReport: "overview",
    search: "",
    data: {
      patients: [],
      staff: [],
      encounters: [],
      queues: [],
      vitals: [],
      consultations: [],
      prescriptions: [],
      labOrders: [],
      labResults: [],
      invoices: [],
      payments: [],
      auditLogs: [],
      settings: null
    }
  };

  const REPORTS = [
    {
      id: "overview",
      label: "Overview",
      icon: "▦",
      description: "Clinic-wide operational summary."
    },
    {
      id: "patients",
      label: "Patients",
      icon: "♙",
      description: "Registration and patient activity."
    },
    {
      id: "clinical",
      label: "Clinical",
      icon: "✚",
      description: "Consultations, encounters, and outcomes."
    },
    {
      id: "laboratory",
      label: "Laboratory",
      icon: "⌬",
      description: "Orders, processing, and result activity."
    },
    {
      id: "financial",
      label: "Financial",
      icon: "₹",
      description: "Invoices, collections, and outstanding balances."
    },
    {
      id: "staff",
      label: "Staff",
      icon: "♧",
      description: "Staff activity and workforce summary."
    },
    {
      id: "audit",
      label: "Audit Log",
      icon: "◷",
      description: "Recent administrative activity."
    }
  ];

  const REPORT_TITLES = {
    overview: "Clinic Overview",
    patients: "Patient Report",
    clinical: "Clinical Report",
    laboratory: "Laboratory Report",
    financial: "Financial Report",
    staff: "Staff Report",
    audit: "Audit Log Report"
  };

  function getStore(name) {
    return STORES[name] || name;
  }

  function escape(value) {
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

  function uid() {
    if (UTILS && typeof UTILS.createId === "function") {
      return UTILS.createId("report");
    }

    return `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function formatCurrency(value) {
    const amount = Number(value) || 0;

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
    return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
  }

  function formatDate(value, options = {}) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: options.month || "short",
      year: options.year || "numeric",
      hour: options.hour ? "2-digit" : undefined,
      minute: options.minute ? "2-digit" : undefined
    }).format(date);
  }

  function dateOnly(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString().slice(0, 10);
  }

  function startOfDay(date = new Date()) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function endOfDay(date = new Date()) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function getDateRange() {
    const now = new Date();

    if (state.range === "custom") {
      const from = state.customFrom
        ? startOfDay(new Date(`${state.customFrom}T00:00:00`))
        : startOfDay(now);

      const to = state.customTo
        ? endOfDay(new Date(`${state.customTo}T23:59:59`))
        : endOfDay(now);

      return from <= to
        ? { from, to }
        : { from: to, to: from };
    }

    if (state.range === "today") {
      return {
        from: startOfDay(now),
        to: endOfDay(now)
      };
    }

    if (state.range === "yesterday") {
      const yesterday = addDays(now, -1);

      return {
        from: startOfDay(yesterday),
        to: endOfDay(yesterday)
      };
    }

    if (state.range === "last7") {
      return {
        from: startOfDay(addDays(now, -6)),
        to: endOfDay(now)
      };
    }

    if (state.range === "last30") {
      return {
        from: startOfDay(addDays(now, -29)),
        to: endOfDay(now)
      };
    }

    if (state.range === "thisMonth") {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(now)
      };
    }

    if (state.range === "lastMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

      return {
        from: startOfDay(firstDay),
        to: endOfDay(lastDay)
      };
    }

    if (state.range === "thisYear") {
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: endOfDay(now)
      };
    }

    return {
      from: startOfDay(now),
      to: endOfDay(now)
    };
  }

  function getRecordDate(record) {
    return (
      record?.updatedAt ||
      record?.createdAt ||
      record?.date ||
      record?.encounterDate ||
      record?.consultationDate ||
      record?.paymentDate ||
      record?.issuedAt ||
      record?.orderedAt ||
      record?.resultDate ||
      record?.timestamp ||
      record?.time ||
      null
    );
  }

  function isWithinRange(record, range = getDateRange()) {
    const value = getRecordDate(record);

    if (!value) {
      return false;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    return date >= range.from && date <= range.to;
  }

  function filterByRange(records) {
    return (records || []).filter((record) => isWithinRange(record));
  }

  function getPatientName(patient) {
    if (!patient) return "Unknown patient";

    const name = [
      patient.firstName,
      patient.middleName,
      patient.lastName
    ]
      .filter(Boolean)
      .join(" ");

    return (
      name ||
      patient.name ||
      patient.fullName ||
      patient.patientName ||
      patient.uhid ||
      "Unknown patient"
    );
  }

  function getStaffName(staff) {
    if (!staff) return "Unknown staff";

    const name = [
      staff.firstName,
      staff.middleName,
      staff.lastName
    ]
      .filter(Boolean)
      .join(" ");

    return name || staff.name || staff.fullName || "Unknown staff";
  }

  function getPatientById(id) {
    return state.data.patients.find(
      (patient) => patient.id === id || patient.uhid === id
    );
  }

  function getStaffById(id) {
    return state.data.staff.find(
      (staff) => staff.id === id || staff.staffId === id
    );
  }

  function getPatientLabel(id) {
    const patient = getPatientById(id);
    return patient ? getPatientName(patient) : id || "Unknown patient";
  }

  function getStaffLabel(id) {
    const staff = getStaffById(id);
    return staff ? getStaffName(staff) : id || "Unknown staff";
  }

  function getNumber(record, keys) {
    for (const key of keys) {
      if (record && record[key] !== undefined && record[key] !== null) {
        const value = Number(record[key]);

        if (!Number.isNaN(value)) {
          return value;
        }
      }
    }

    return 0;
  }

  function sum(records, keys) {
    return (records || []).reduce(
      (total, record) => total + getNumber(record, keys),
      0
    );
  }

  function uniqueCount(records, getter) {
    return new Set(
      (records || [])
        .map(getter)
        .filter((value) => value !== undefined && value !== null && value !== "")
    ).size;
  }

  function countBy(records, getter) {
    return (records || []).reduce((result, record) => {
      const key = getter(record) || "Unknown";

      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  }

  function sortByDate(records, descending = true) {
    return [...(records || [])].sort((a, b) => {
      const dateA = new Date(getRecordDate(a) || 0).getTime();
      const dateB = new Date(getRecordDate(b) || 0).getTime();

      return descending ? dateB - dateA : dateA - dateB;
    });
  }

  function normalizeStatus(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, "-");
  }

  function getStatusClass(status) {
    const value = normalizeStatus(status);

    if (
      ["paid", "completed", "verified", "active", "success", "settled"].includes(
        value
      )
    ) {
      return "is-success";
    }

    if (
      [
        "pending",
        "in-progress",
        "processing",
        "partially-paid",
        "draft",
        "waiting"
      ].includes(value)
    ) {
      return "is-warning";
    }

    if (
      ["cancelled", "cancelled", "failed", "rejected", "inactive"].includes(
        value
      )
    ) {
      return "is-danger";
    }

    return "is-neutral";
  }

  function statusBadge(status) {
    const label = String(status || "Unknown")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return `<span class="status-badge ${getStatusClass(
      status
    )}">${escape(label)}</span>`;
  }

  function showToast(message, type = "info") {
    if (APP && typeof APP.toast === "function") {
      APP.toast({
        type,
        title: type === "success" ? "Reports" : "Reports",
        message
      });
      return;
    }

    if (window.AURA && typeof window.AURA.toast === "function") {
      window.AURA.toast(message, type);
      return;
    }

    console.info(`[AURA Reports] ${message}`);
  }

  function getContainer() {
    return (
      document.querySelector('[data-route-view="reports"]') ||
      document.querySelector("#app-content") ||
      document.querySelector("#app")
    );
  }

  async function loadStore(storeName) {
    if (!STORAGE || typeof STORAGE.getAll !== "function") {
      return [];
    }

    try {
      const result = await STORAGE.getAll(getStore(storeName));
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error(`[AURA Reports] Failed to load ${storeName}`, error);
      return [];
    }
  }

  async function loadData() {
    state.loading = true;

    const storeNames = [
      "patients",
      "staff",
      "encounters",
      "queues",
      "vitals",
      "consultations",
      "prescriptions",
      "labOrders",
      "labResults",
      "invoices",
      "payments",
      "auditLogs"
    ];

    const results = await Promise.all(
      storeNames.map((storeName) => loadStore(storeName))
    );

    storeNames.forEach((storeName, index) => {
      state.data[storeName] = results[index];
    });

    try {
      state.data.settings = STORAGE
        ? await STORAGE.get(getStore("settings"), "clinic-settings")
        : null;
    } catch (error) {
      state.data.settings = null;
    }

    state.loading = false;
    return state.data;
  }

  function getClinicName() {
    return (
      state.data.settings?.clinicName ||
      state.data.settings?.clinic?.name ||
      window.AURA_CONFIG?.clinic?.name ||
      "AURA Clinic"
    );
  }

  function getRangeLabel() {
    const range = getDateRange();

    return `${formatDate(range.from, {
      month: "short"
    })} – ${formatDate(range.to, {
      month: "short"
    })}`;
  }

  function calculateOverview() {
    const range = getDateRange();

    const patients = filterByRange(state.data.patients);
    const encounters = filterByRange(state.data.encounters);
    const queues = filterByRange(state.data.queues);
    const consultations = filterByRange(state.data.consultations);
    const labOrders = filterByRange(state.data.labOrders);
    const invoices = filterByRange(state.data.invoices);
    const payments = filterByRange(state.data.payments);

    const completedQueues = queues.filter((queue) =>
      ["completed", "done"].includes(normalizeStatus(queue.status))
    );

    const completedConsultations = consultations.filter((consultation) =>
      ["completed", "complete", "closed"].includes(
        normalizeStatus(consultation.status)
      )
    );

    const totalInvoiced = sum(invoices, ["total", "grandTotal", "amount"]);
    const totalCollected = sum(payments, [
      "amount",
      "paidAmount",
      "receivedAmount"
    ]);

    const totalOutstanding = invoices.reduce((total, invoice) => {
      const invoiceTotal = getNumber(invoice, ["total", "grandTotal", "amount"]);
      const paid = getNumber(invoice, [
        "paid",
        "paidAmount",
        "amountPaid",
        "receivedAmount"
      ]);

      return total + Math.max(invoiceTotal - paid, 0);
    }, 0);

    return {
      from: range.from,
      to: range.to,
      patients,
      encounters,
      queues,
      consultations,
      labOrders,
      invoices,
      payments,
      completedQueues,
      completedConsultations,
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      activeStaff: state.data.staff.filter(
        (staff) => normalizeStatus(staff.status || "active") === "active"
      ).length
    };
  }

  function renderShell() {
    const container = getContainer();

    if (!container) return;

    container.innerHTML = `
      <section class="reports-workspace" aria-labelledby="reports-page-title">
        <div class="workspace-header reports-header">
          <div class="workspace-heading">
            <span class="eyebrow">AURA CLINIC / ANALYTICS</span>
            <h1 id="reports-page-title">Reports & Analytics</h1>
            <p>Operational, clinical, laboratory, and financial intelligence for ${escape(
              getClinicName()
            )}.</p>
          </div>

          <div class="workspace-actions">
            <button type="button" class="btn btn-secondary" data-report-action="refresh">
              <span aria-hidden="true">↻</span>
              Refresh
            </button>

            <button type="button" class="btn btn-primary" data-report-action="print">
              <span aria-hidden="true">▣</span>
              Print Report
            </button>
          </div>
        </div>

        <div class="reports-control-bar">
          <div class="reports-range-group">
            <label for="reports-range">Reporting period</label>
            <select id="reports-range" class="form-select">
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="thisMonth">This month</option>
              <option value="lastMonth">Last month</option>
              <option value="thisYear">This year</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          <div class="reports-custom-range" data-reports-custom-range hidden>
            <div class="reports-date-field">
              <label for="reports-from">From</label>
              <input type="date" id="reports-from" class="form-input">
            </div>

            <div class="reports-date-field">
              <label for="reports-to">To</label>
              <input type="date" id="reports-to" class="form-input">
            </div>
          </div>

          <div class="reports-period-label">
            <span class="reports-period-caption">Selected period</span>
            <strong data-reports-period-label>${escape(
              getRangeLabel()
            )}</strong>
          </div>
        </div>

        <div class="reports-layout">
          <aside class="reports-sidebar" aria-label="Report navigation">
            <div class="reports-sidebar-title">Report Library</div>
            <nav class="reports-nav">
              ${REPORTS.map(
                (report) => `
                  <button
                    type="button"
                    class="reports-nav-item ${
                      state.activeReport === report.id ? "is-active" : ""
                    }"
                    data-report-id="${escape(report.id)}"
                    aria-current="${
                      state.activeReport === report.id ? "page" : "false"
                    }"
                  >
                    <span class="reports-nav-icon" aria-hidden="true">${escape(
                      report.icon
                    )}</span>
                    <span class="reports-nav-copy">
                      <strong>${escape(report.label)}</strong>
                      <small>${escape(report.description)}</small>
                    </span>
                  </button>
                `
              ).join("")}
            </nav>
          </aside>

          <main class="reports-content" data-reports-content>
            ${renderReportContent()}
          </main>
        </div>
      </section>
    `;

    bindEvents();
  }

  function renderReportContent() {
    if (state.loading) {
      return `
        <div class="reports-loading">
          <div class="loading-spinner" aria-hidden="true"></div>
          <p>Loading report data…</p>
        </div>
      `;
    }

    const report = REPORTS.find((item) => item.id === state.activeReport);

    return `
      <div class="reports-content-header">
        <div>
          <span class="eyebrow">REPORT</span>
          <h2>${escape(report?.label || "Report")}</h2>
          <p>${escape(report?.description || "")}</p>
        </div>

        <div class="reports-content-meta">
          <span class="reports-meta-label">Period</span>
          <strong>${escape(getRangeLabel())}</strong>
        </div>
      </div>

      ${renderActiveReport()}
    `;
  }

  function renderActiveReport() {
    switch (state.activeReport) {
      case "patients":
        return renderPatientsReport();

      case "clinical":
        return renderClinicalReport();

      case "laboratory":
        return renderLaboratoryReport();

      case "financial":
        return renderFinancialReport();

      case "staff":
        return renderStaffReport();

      case "audit":
        return renderAuditReport();

      case "overview":
      default:
        return renderOverviewReport();
    }
  }

  function renderMetricCard(label, value, caption, icon, modifier = "") {
    return `
      <article class="report-metric-card ${escape(modifier)}">
        <div class="report-metric-topline">
          <span class="report-metric-icon" aria-hidden="true">${escape(icon)}</span>
          <span class="report-metric-caption">${escape(caption)}</span>
        </div>
        <strong class="report-metric-value">${escape(value)}</strong>
        <span class="report-metric-label">${escape(label)}</span>
      </article>
    `;
  }

  function renderSectionHeader(title, description, action = "") {
    return `
      <div class="report-section-header">
        <div>
          <h3>${escape(title)}</h3>
          <p>${escape(description)}</p>
        </div>
        ${action}
      </div>
    `;
  }

  function renderOverviewReport() {
    const summary = calculateOverview();
    const queueByStatus = countBy(summary.queues, (queue) =>
      String(queue.status || "unknown")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );

    const labByStatus = countBy(summary.labOrders, (order) =>
      String(order.status || "unknown")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );

    const recentActivity = sortByDate(
      [
        ...summary.encounters.map((item) => ({
          ...item,
          activityType: "Encounter",
          activityDate: getRecordDate(item)
        })),
        ...summary.consultations.map((item) => ({
          ...item,
          activityType: "Consultation",
          activityDate: getRecordDate(item)
        })),
        ...summary.labOrders.map((item) => ({
          ...item,
          activityType: "Laboratory order",
          activityDate: getRecordDate(item)
        })),
        ...summary.payments.map((item) => ({
          ...item,
          activityType: "Payment",
          activityDate: getRecordDate(item)
        }))
      ],
      true
    ).slice(0, 8);

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "New Patients",
          formatNumber(summary.patients.length),
          "Registrations",
          "♙"
        )}

        ${renderMetricCard(
          "Encounters",
          formatNumber(summary.encounters.length),
          "Clinical records",
          "✚"
        )}

        ${renderMetricCard(
          "Consultations",
          formatNumber(summary.consultations.length),
          "Doctor activity",
          "◉"
        )}

        ${renderMetricCard(
          "Laboratory Orders",
          formatNumber(summary.labOrders.length),
          "Diagnostic requests",
          "⌬"
        )}

        ${renderMetricCard(
          "Collected",
          formatCurrency(summary.totalCollected),
          "Payments received",
          "₹",
          "is-positive"
        )}

        ${renderMetricCard(
          "Outstanding",
          formatCurrency(summary.totalOutstanding),
          "Pending balance",
          "◌",
          "is-warning"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Queue Activity",
            "Patient movement across the clinic workflow."
          )}

          <div class="report-breakdown-list">
            ${
              Object.keys(queueByStatus).length
                ? Object.entries(queueByStatus)
                    .map(
                      ([status, count]) => `
                        <div class="report-breakdown-row">
                          <span>${escape(status)}</span>
                          <strong>${formatNumber(count)}</strong>
                        </div>
                      `
                    )
                    .join("")
                : renderEmptyState("No queue records for this period.")
            }
          </div>
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Laboratory Pipeline",
            "Current order distribution within the selected period."
          )}

          <div class="report-breakdown-list">
            ${
              Object.keys(labByStatus).length
                ? Object.entries(labByStatus)
                    .map(
                      ([status, count]) => `
                        <div class="report-breakdown-row">
                          <span>${escape(status)}</span>
                          <strong>${formatNumber(count)}</strong>
                        </div>
                      `
                    )
                    .join("")
                : renderEmptyState("No laboratory orders for this period.")
            }
          </div>
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Recent Activity",
          "Latest clinical, diagnostic, and payment events."
        )}

        ${renderActivityTable(recentActivity)}
      </section>
    `;
  }

  function renderPatientsReport() {
    const patients = filterByRange(state.data.patients);
    const genderCounts = countBy(patients, (patient) => patient.gender || "Not specified");
    const bloodGroups = countBy(patients, (patient) => patient.bloodGroup || "Not specified");

    const withPhone = patients.filter((patient) => patient.phone).length;
    const withEmail = patients.filter((patient) => patient.email).length;

    const latestPatients = sortByDate(patients).slice(0, 12);

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "Registered Patients",
          formatNumber(patients.length),
          "Selected period",
          "♙"
        )}

        ${renderMetricCard(
          "Phone Available",
          formatNumber(withPhone),
          "Contact records",
          "☎"
        )}

        ${renderMetricCard(
          "Email Available",
          formatNumber(withEmail),
          "Contact records",
          "✉"
        )}

        ${renderMetricCard(
          "Unique Gender Values",
          formatNumber(Object.keys(genderCounts).length),
          "Recorded categories",
          "◌"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Gender Distribution",
            "Patient registration distribution by recorded gender."
          )}

          ${renderDistributionList(genderCounts)}
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Blood Group Distribution",
            "Recorded blood group information."
          )}

          ${renderDistributionList(bloodGroups)}
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Latest Patient Registrations",
          "Most recent patient records in the selected period."
        )}

        ${renderPatientTable(latestPatients)}
      </section>
    `;
  }

  function renderClinicalReport() {
    const encounters = filterByRange(state.data.encounters);
    const consultations = filterByRange(state.data.consultations);
    const prescriptions = filterByRange(state.data.prescriptions);
    const vitals = filterByRange(state.data.vitals);

    const doctorCounts = countBy(consultations, (consultation) =>
      getStaffLabel(
        consultation.doctorId ||
          consultation.doctor_id ||
          consultation.staffId ||
          consultation.providerId
      )
    );

    const diagnosisCounts = countBy(consultations, (consultation) =>
      consultation.diagnosis ||
      consultation.primaryDiagnosis ||
      consultation.assessment ||
      "Not documented"
    );

    const completed = consultations.filter((consultation) =>
      ["completed", "complete", "closed"].includes(
        normalizeStatus(consultation.status)
      )
    ).length;

    const uniquePatients = uniqueCount(
      [...encounters, ...consultations],
      (record) =>
        record.patientId ||
        record.patient_id ||
        record.uhid ||
        record.patientUHID
    );

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "Encounters",
          formatNumber(encounters.length),
          "Clinical records",
          "✚"
        )}

        ${renderMetricCard(
          "Consultations",
          formatNumber(consultations.length),
          "Doctor records",
          "◉"
        )}

        ${renderMetricCard(
          "Completed",
          formatNumber(completed),
          "Closed consultations",
          "✓",
          "is-positive"
        )}

        ${renderMetricCard(
          "Vitals Records",
          formatNumber(vitals.length),
          "Nursing activity",
          "♥"
        )}

        ${renderMetricCard(
          "Prescriptions",
          formatNumber(prescriptions.length),
          "Medication records",
          "Rx"
        )}

        ${renderMetricCard(
          "Unique Patients",
          formatNumber(uniquePatients),
          "Clinical population",
          "♙"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Consultations by Doctor",
            "Distribution of consultations by assigned provider."
          )}

          ${renderDistributionList(doctorCounts)}
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Recorded Diagnoses",
            "Most frequently recorded assessment or diagnosis values."
          )}

          ${renderDistributionList(diagnosisCounts, 10)}
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Recent Clinical Activity",
          "Latest encounters and consultations."
        )}

        ${renderClinicalTable(
          sortByDate([...encounters, ...consultations]).slice(0, 15)
        )}
      </section>
    `;
  }

  function renderLaboratoryReport() {
    const orders = filterByRange(state.data.labOrders);
    const results = filterByRange(state.data.labResults);

    const orderStatus = countBy(orders, (order) => order.status || "Unknown");
    const testCounts = countBy(
      orders,
      (order) =>
        order.testName ||
        order.serviceName ||
        order.test ||
        order.panelName ||
        "Unnamed test"
    );

    const verifiedResults = results.filter((result) =>
      ["verified", "approved", "completed"].includes(
        normalizeStatus(result.status)
      )
    ).length;

    const pendingOrders = orders.filter((order) =>
      ["pending", "ordered", "processing", "in-progress", "collected"].includes(
        normalizeStatus(order.status)
      )
    ).length;

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "Laboratory Orders",
          formatNumber(orders.length),
          "Selected period",
          "⌬"
        )}

        ${renderMetricCard(
          "Pending Orders",
          formatNumber(pendingOrders),
          "Awaiting completion",
          "◌",
          "is-warning"
        )}

        ${renderMetricCard(
          "Results Recorded",
          formatNumber(results.length),
          "Diagnostic results",
          "▤"
        )}

        ${renderMetricCard(
          "Verified Results",
          formatNumber(verifiedResults),
          "Completed reports",
          "✓",
          "is-positive"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Order Status",
            "Laboratory order distribution."
          )}

          ${renderDistributionList(orderStatus)}
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Most Ordered Tests",
            "Tests and panels requested during the selected period."
          )}

          ${renderDistributionList(testCounts, 10)}
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Laboratory Orders",
          "Recent diagnostic requests and their current status."
        )}

        ${renderLaboratoryTable(sortByDate(orders).slice(0, 20))}
      </section>
    `;
  }

  function renderFinancialReport() {
    const invoices = filterByRange(state.data.invoices);
    const payments = filterByRange(state.data.payments);

    const invoiced = sum(invoices, ["total", "grandTotal", "amount"]);
    const collected = sum(payments, [
      "amount",
      "paidAmount",
      "receivedAmount"
    ]);

    const outstanding = invoices.reduce((total, invoice) => {
      const invoiceTotal = getNumber(invoice, ["total", "grandTotal", "amount"]);
      const paid = getNumber(invoice, [
        "paid",
        "paidAmount",
        "amountPaid",
        "receivedAmount"
      ]);

      return total + Math.max(invoiceTotal - paid, 0);
    }, 0);

    const paymentMethods = countBy(
      payments,
      (payment) => payment.method || payment.paymentMethod || "Other"
    );

    const invoiceStatuses = countBy(
      invoices,
      (invoice) => invoice.status || "Unknown"
    );

    const averageInvoice = invoices.length ? invoiced / invoices.length : 0;

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "Total Invoiced",
          formatCurrency(invoiced),
          "Gross billing",
          "₹"
        )}

        ${renderMetricCard(
          "Total Collected",
          formatCurrency(collected),
          "Payments received",
          "₹",
          "is-positive"
        )}

        ${renderMetricCard(
          "Outstanding",
          formatCurrency(outstanding),
          "Pending balances",
          "◌",
          "is-warning"
        )}

        ${renderMetricCard(
          "Average Invoice",
          formatCurrency(averageInvoice),
          "Per invoice",
          "▤"
        )}

        ${renderMetricCard(
          "Invoices",
          formatNumber(invoices.length),
          "Generated documents",
          "▧"
        )}

        ${renderMetricCard(
          "Payments",
          formatNumber(payments.length),
          "Transactions",
          "↗"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Invoice Status",
            "Distribution of invoices by current status."
          )}

          ${renderDistributionList(invoiceStatuses)}
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Payment Methods",
            "Payment collection by method."
          )}

          ${renderDistributionList(paymentMethods)}
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Recent Financial Activity",
          "Latest invoices and payments."
        )}

        ${renderFinancialTable(
          sortByDate([...invoices, ...payments]).slice(0, 20)
        )}
      </section>
    `;
  }

  function renderStaffReport() {
    const staff = state.data.staff || [];
    const activeStaff = staff.filter(
      (member) => normalizeStatus(member.status || "active") === "active"
    );

    const departmentCounts = countBy(
      staff,
      (member) => member.department || "Not assigned"
    );

    const roleCounts = countBy(
      staff,
      (member) => member.role || member.designation || "Not assigned"
    );

    const statusCounts = countBy(
      staff,
      (member) => member.status || "active"
    );

    const recentlyUpdated = sortByDate(staff).slice(0, 15);

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "Total Staff",
          formatNumber(staff.length),
          "Registered staff",
          "♧"
        )}

        ${renderMetricCard(
          "Active Staff",
          formatNumber(activeStaff.length),
          "Currently active",
          "✓",
          "is-positive"
        )}

        ${renderMetricCard(
          "Departments",
          formatNumber(Object.keys(departmentCounts).length),
          "Operational units",
          "▦"
        )}

        ${renderMetricCard(
          "Roles",
          formatNumber(Object.keys(roleCounts).length),
          "Assigned roles",
          "♙"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Staff by Department",
            "Workforce distribution across departments."
          )}

          ${renderDistributionList(departmentCounts)}
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Staff by Status",
            "Current staff account status."
          )}

          ${renderDistributionList(statusCounts)}
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Staff Directory",
          "Recently created or updated staff records."
        )}

        ${renderStaffTable(recentlyUpdated)}
      </section>
    `;
  }

  function renderAuditReport() {
    const logs = filterByRange(state.data.auditLogs);

    const actionCounts = countBy(
      logs,
      (log) => log.action || log.event || log.type || "Unknown action"
    );

    const actorCounts = countBy(
      logs,
      (log) =>
        log.actorName ||
        log.userName ||
        log.staffName ||
        getStaffLabel(log.actorId || log.userId) ||
        "System"
    );

    return `
      <div class="report-metric-grid">
        ${renderMetricCard(
          "Audit Events",
          formatNumber(logs.length),
          "Selected period",
          "◷"
        )}

        ${renderMetricCard(
          "Unique Actions",
          formatNumber(Object.keys(actionCounts).length),
          "Recorded event types",
          "▤"
        )}

        ${renderMetricCard(
          "Active Actors",
          formatNumber(Object.keys(actorCounts).length),
          "Users and staff",
          "♙"
        )}

        ${renderMetricCard(
          "Latest Event",
          logs.length ? formatDate(sortByDate(logs)[0].createdAt || sortByDate(logs)[0].timestamp) : "—",
          "Most recent activity",
          "↻"
        )}
      </div>

      <div class="reports-two-column">
        <section class="report-panel">
          ${renderSectionHeader(
            "Audit Actions",
            "Distribution of recorded administrative events."
          )}

          ${renderDistributionList(actionCounts, 12)}
        </section>

        <section class="report-panel">
          ${renderSectionHeader(
            "Activity by Actor",
            "Users or staff generating audit events."
          )}

          ${renderDistributionList(actorCounts, 12)}
        </section>
      </div>

      <section class="report-panel">
        ${renderSectionHeader(
          "Audit Timeline",
          "Detailed activity records for the selected period."
        )}

        ${renderAuditTable(sortByDate(logs).slice(0, 50))}
      </section>
    `;
  }

  function renderDistributionList(counts, limit = 12) {
    const entries = Object.entries(counts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (!entries.length) {
      return renderEmptyState("No data available for this period.");
    }

    const maximum = Math.max(...entries.map((entry) => entry[1]), 1);

    return `
      <div class="report-distribution-list">
        ${entries
          .map(
            ([label, value]) => `
              <div class="report-distribution-row">
                <div class="report-distribution-label">
                  <span>${escape(label)}</span>
                  <strong>${formatNumber(value)}</strong>
                </div>
                <div class="report-distribution-track">
                  <span style="width:${Math.round((value / maximum) * 100)}%"></span>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderEmptyState(message) {
    return `
      <div class="report-empty-state">
        <span class="report-empty-icon" aria-hidden="true">⌁</span>
        <p>${escape(message)}</p>
      </div>
    `;
  }

  function renderPatientTable(patients) {
    if (!patients.length) {
      return renderEmptyState("No patient registrations found.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>UHID</th>
              <th>Gender</th>
              <th>Phone</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            ${patients
              .map(
                (patient) => `
                  <tr>
                    <td>
                      <strong>${escape(getPatientName(patient))}</strong>
                    </td>
                    <td>${escape(patient.uhid || patient.patientId || "—")}</td>
                    <td>${escape(patient.gender || "—")}</td>
                    <td>${escape(patient.phone || "—")}</td>
                    <td>${escape(formatDate(getRecordDate(patient)))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderClinicalTable(records) {
    if (!records.length) {
      return renderEmptyState("No clinical activity found.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>Record Type</th>
              <th>Doctor</th>
              <th>Status</th>
              <th>Diagnosis / Notes</th>
            </tr>
          </thead>
          <tbody>
            ${records
              .map((record) => {
                const type = record.consultationDate || record.diagnosis
                  ? "Consultation"
                  : "Encounter";

                const diagnosis =
                  record.diagnosis ||
                  record.primaryDiagnosis ||
                  record.assessment ||
                  record.chiefComplaint ||
                  record.notes ||
                  "—";

                return `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(record)))}</td>
                    <td>${escape(
                      getPatientLabel(
                        record.patientId ||
                          record.patient_id ||
                          record.uhid ||
                          record.patientUHID
                      )
                    )}</td>
                    <td>${escape(type)}</td>
                    <td>${escape(
                      getStaffLabel(
                        record.doctorId ||
                          record.doctor_id ||
                          record.staffId ||
                          record.providerId
                      )
                    )}</td>
                    <td>${statusBadge(record.status || "Recorded")}</td>
                    <td>${escape(String(diagnosis).slice(0, 80))}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderLaboratoryTable(orders) {
    if (!orders.length) {
      return renderEmptyState("No laboratory orders found.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Order Date</th>
              <th>Patient</th>
              <th>Test / Panel</th>
              <th>Ordered By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map(
                (order) => `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(order)))}</td>
                    <td>${escape(
                      getPatientLabel(
                        order.patientId ||
                          order.patient_id ||
                          order.uhid ||
                          order.patientUHID
                      )
                    )}</td>
                    <td>${escape(
                      order.testName ||
                        order.serviceName ||
                        order.test ||
                        order.panelName ||
                        "Unnamed test"
                    )}</td>
                    <td>${escape(
                      getStaffLabel(
                        order.doctorId ||
                          order.doctor_id ||
                          order.orderedBy ||
                          order.createdBy
                      )
                    )}</td>
                    <td>${statusBadge(order.status || "Unknown")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderFinancialTable(records) {
    if (!records.length) {
      return renderEmptyState("No financial activity found.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Patient</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${records
              .map((record) => {
                const isPayment =
                  record.paymentMethod ||
                  record.method ||
                  record.receivedAmount !== undefined ||
                  record.invoiceId;

                const amount = isPayment
                  ? getNumber(record, [
                      "amount",
                      "paidAmount",
                      "receivedAmount"
                    ])
                  : getNumber(record, ["total", "grandTotal", "amount"]);

                return `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(record)))}</td>
                    <td>${escape(
                      record.invoiceNumber ||
                        record.invoiceNo ||
                        record.reference ||
                        record.id ||
                        "—"
                    )}</td>
                    <td>${escape(
                      getPatientLabel(
                        record.patientId ||
                          record.patient_id ||
                          record.uhid ||
                          record.patientUHID
                      )
                    )}</td>
                    <td>${isPayment ? "Payment" : "Invoice"}</td>
                    <td><strong>${escape(formatCurrency(amount))}</strong></td>
                    <td>${statusBadge(record.status || "Recorded")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderStaffTable(staff) {
    if (!staff.length) {
      return renderEmptyState("No staff records found.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${staff
              .map(
                (member) => `
                  <tr>
                    <td>${escape(member.staffId || member.id || "—")}</td>
                    <td><strong>${escape(getStaffName(member))}</strong></td>
                    <td>${escape(member.role || member.designation || "—")}</td>
                    <td>${escape(member.department || "—")}</td>
                    <td>${statusBadge(member.status || "active")}</td>
                    <td>${escape(formatDate(getRecordDate(member)))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAuditTable(logs) {
    if (!logs.length) {
      return renderEmptyState("No audit events found.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Module</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs
              .map(
                (log) => `
                  <tr>
                    <td>${escape(
                      formatDate(getRecordDate(log), {
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    )}</td>
                    <td>${escape(
                      log.actorName ||
                        log.userName ||
                        log.staffName ||
                        getStaffLabel(log.actorId || log.userId) ||
                        "System"
                    )}</td>
                    <td>${escape(
                      log.action || log.event || log.type || "Unknown"
                    )}</td>
                    <td>${escape(log.module || log.source || "—")}</td>
                    <td>${escape(
                      String(
                        log.description ||
                          log.details ||
                          log.message ||
                          ""
                      ).slice(0, 100)
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderActivityTable(records) {
    if (!records.length) {
      return renderEmptyState("No activity found for this period.");
    }

    return `
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Activity</th>
              <th>Patient</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            ${records
              .map(
                (record) => `
                  <tr>
                    <td>${escape(
                      formatDate(record.activityDate || getRecordDate(record), {
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    )}</td>
                    <td>${escape(record.activityType || "Activity")}</td>
                    <td>${escape(
                      getPatientLabel(
                        record.patientId ||
                          record.patient_id ||
                          record.uhid ||
                          record.patientUHID
                      )
                    )}</td>
                    <td>${escape(
                      record.invoiceNumber ||
                        record.invoiceNo ||
                        record.orderNumber ||
                        record.reference ||
                        record.id ||
                        "—"
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function updateContent() {
    const content = document.querySelector("[data-reports-content]");

    if (!content) {
      renderShell();
      return;
    }

    content.innerHTML = renderReportContent();
    updatePeriodLabel();
  }

  function updatePeriodLabel() {
    const label = document.querySelector("[data-reports-period-label]");

    if (label) {
      label.textContent = getRangeLabel();
    }
  }

  function bindEvents() {
    const container = getContainer();

    if (!container || container.dataset.reportsBound === "true") {
      return;
    }

    container.dataset.reportsBound = "true";

    container.addEventListener("click", handleClick);
    container.addEventListener("change", handleChange);

    container.addEventListener("input", handleInput);
  }

  function handleClick(event) {
    const reportButton = event.target.closest("[data-report-id]");

    if (reportButton) {
      event.preventDefault();

      const reportId = reportButton.dataset.reportId;

      if (REPORTS.some((report) => report.id === reportId)) {
        state.activeReport = reportId;

        document
          .querySelectorAll("[data-report-id]")
          .forEach((button) => {
            const active = button.dataset.reportId === reportId;

            button.classList.toggle("is-active", active);
            button.setAttribute("aria-current", active ? "page" : "false");
          });

        updateContent();
      }

      return;
    }

    const actionButton = event.target.closest("[data-report-action]");

    if (!actionButton) return;

    const action = actionButton.dataset.reportAction;

    if (action === "refresh") {
      refresh();
      return;
    }

    if (action === "print") {
      printReport();
      return;
    }
  }

  function handleChange(event) {
    if (event.target.id === "reports-range") {
      state.range = event.target.value;

      const customRange = document.querySelector("[data-reports-custom-range]");

      if (customRange) {
        customRange.hidden = state.range !== "custom";
      }

      updateContent();
      return;
    }

    if (event.target.id === "reports-from") {
      state.customFrom = event.target.value;
      updateContent();
      return;
    }

    if (event.target.id === "reports-to") {
      state.customTo = event.target.value;
      updateContent();
    }
  }

  function handleInput(event) {
    if (event.target.matches("[data-report-search]")) {
      state.search = event.target.value.trim().toLowerCase();
      updateContent();
    }
  }

  async function refresh() {
    await loadData();
    renderShell();
    showToast("Reports refreshed.", "success");
  }

  function getPrintStyles() {
    return `
      <style>
        @page {
          size: A4;
          margin: 14mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          font-family: Arial, sans-serif;
          color: #111827;
          margin: 0;
          font-size: 11px;
        }

        h1, h2, h3, p {
          margin: 0;
        }

        .print-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #111827;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }

        .print-header h1 {
          font-size: 22px;
          margin-bottom: 6px;
        }

        .print-header p {
          color: #4b5563;
          font-size: 11px;
        }

        .print-meta {
          text-align: right;
          color: #4b5563;
        }

        .print-meta strong {
          display: block;
          color: #111827;
          margin-bottom: 4px;
        }

        .print-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }

        .print-metric {
          border: 1px solid #d1d5db;
          padding: 10px;
          border-radius: 6px;
        }

        .print-metric strong {
          display: block;
          font-size: 17px;
          margin-bottom: 4px;
        }

        .print-metric span {
          color: #4b5563;
          font-size: 10px;
        }

        .print-section {
          margin-bottom: 20px;
          page-break-inside: avoid;
        }

        .print-section h2 {
          font-size: 14px;
          border-bottom: 1px solid #9ca3af;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }

        th,
        td {
          border: 1px solid #d1d5db;
          padding: 6px 7px;
          text-align: left;
          vertical-align: top;
        }

        th {
          background: #f3f4f6;
          font-weight: 700;
        }

        .print-footer {
          border-top: 1px solid #d1d5db;
          padding-top: 8px;
          margin-top: 25px;
          color: #6b7280;
          font-size: 9px;
          display: flex;
          justify-content: space-between;
        }

        .status {
          text-transform: capitalize;
        }
      </style>
    `;
  }

  function printReport() {
    const summary = calculateOverview();
    const reportTitle = REPORT_TITLES[state.activeReport] || "Report";

    const rows = getPrintRows();

    const printWindow = window.open("", "_blank", "width=1100,height=800");

    if (!printWindow) {
      showToast("Please allow pop-ups to print reports.", "warning");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${escape(reportTitle)} - ${escape(getClinicName())}</title>
          ${getPrintStyles()}
        </head>
        <body>
          <header class="print-header">
            <div>
              <h1>${escape(getClinicName())}</h1>
              <p>${escape(reportTitle)}</p>
            </div>

            <div class="print-meta">
              <strong>${escape(getRangeLabel())}</strong>
              <span>Generated ${escape(formatDate(new Date(), {
                hour: "2-digit",
                minute: "2-digit"
              }))}</span>
            </div>
          </header>

          <div class="print-metrics">
            <div class="print-metric">
              <strong>${formatNumber(summary.patients.length)}</strong>
              <span>Patients</span>
            </div>

            <div class="print-metric">
              <strong>${formatNumber(summary.encounters.length)}</strong>
              <span>Encounters</span>
            </div>

            <div class="print-metric">
              <strong>${formatNumber(summary.labOrders.length)}</strong>
              <span>Laboratory Orders</span>
            </div>

            <div class="print-metric">
              <strong>${formatCurrency(summary.totalCollected)}</strong>
              <span>Collected</span>
            </div>
          </div>

          <section class="print-section">
            <h2>${escape(reportTitle)}</h2>
            ${rows}
          </section>

          <footer class="print-footer">
            <span>${escape(getClinicName())}</span>
            <span>AURA Clinic Management System</span>
          </footer>

          <script>
            window.onload = function () {
              window.print();
            };
          <\/script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  function getPrintRows() {
    const summary = calculateOverview();

    if (state.activeReport === "patients") {
      const patients = filterByRange(state.data.patients);

      return `
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>UHID</th>
              <th>Gender</th>
              <th>Phone</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            ${patients
              .map(
                (patient) => `
                  <tr>
                    <td>${escape(getPatientName(patient))}</td>
                    <td>${escape(patient.uhid || patient.patientId || "—")}</td>
                    <td>${escape(patient.gender || "—")}</td>
                    <td>${escape(patient.phone || "—")}</td>
                    <td>${escape(formatDate(getRecordDate(patient)))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (state.activeReport === "clinical") {
      const consultations = filterByRange(state.data.consultations);

      return `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Status</th>
              <th>Diagnosis</th>
            </tr>
          </thead>
          <tbody>
            ${consultations
              .map(
                (consultation) => `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(consultation)))}</td>
                    <td>${escape(
                      getPatientLabel(
                        consultation.patientId ||
                          consultation.patient_id ||
                          consultation.uhid
                      )
                    )}</td>
                    <td>${escape(
                      getStaffLabel(
                        consultation.doctorId ||
                          consultation.doctor_id ||
                          consultation.staffId
                      )
                    )}</td>
                    <td class="status">${escape(
                      consultation.status || "Recorded"
                    )}</td>
                    <td>${escape(
                      consultation.diagnosis ||
                        consultation.primaryDiagnosis ||
                        consultation.assessment ||
                        "—"
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (state.activeReport === "laboratory") {
      const orders = filterByRange(state.data.labOrders);

      return `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>Test</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map(
                (order) => `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(order)))}</td>
                    <td>${escape(
                      getPatientLabel(
                        order.patientId ||
                          order.patient_id ||
                          order.uhid
                      )
                    )}</td>
                    <td>${escape(
                      order.testName ||
                        order.serviceName ||
                        order.test ||
                        order.panelName ||
                        "Unnamed test"
                    )}</td>
                    <td class="status">${escape(order.status || "Unknown")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (state.activeReport === "financial") {
      const invoices = filterByRange(state.data.invoices);
      const payments = filterByRange(state.data.payments);

      return `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Patient</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${[...invoices, ...payments]
              .sort(
                (a, b) =>
                  new Date(getRecordDate(b) || 0) -
                  new Date(getRecordDate(a) || 0)
              )
              .map((record) => {
                const payment =
                  record.paymentMethod ||
                  record.method ||
                  record.receivedAmount !== undefined ||
                  record.invoiceId;

                const amount = payment
                  ? getNumber(record, [
                      "amount",
                      "paidAmount",
                      "receivedAmount"
                    ])
                  : getNumber(record, ["total", "grandTotal", "amount"]);

                return `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(record)))}</td>
                    <td>${escape(
                      record.invoiceNumber ||
                        record.invoiceNo ||
                        record.reference ||
                        record.id ||
                        "—"
                    )}</td>
                    <td>${escape(
                      getPatientLabel(
                        record.patientId ||
                          record.patient_id ||
                          record.uhid
                      )
                    )}</td>
                    <td>${payment ? "Payment" : "Invoice"}</td>
                    <td>${escape(formatCurrency(amount))}</td>
                    <td class="status">${escape(record.status || "Recorded")}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (state.activeReport === "staff") {
      return `
        <table>
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${state.data.staff
              .map(
                (member) => `
                  <tr>
                    <td>${escape(member.staffId || member.id || "—")}</td>
                    <td>${escape(getStaffName(member))}</td>
                    <td>${escape(member.role || member.designation || "—")}</td>
                    <td>${escape(member.department || "—")}</td>
                    <td class="status">${escape(member.status || "active")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    if (state.activeReport === "audit") {
      const logs = filterByRange(state.data.auditLogs);

      return `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Module</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs
              .map(
                (log) => `
                  <tr>
                    <td>${escape(formatDate(getRecordDate(log)))}</td>
                    <td>${escape(
                      log.actorName ||
                        log.userName ||
                        log.staffName ||
                        getStaffLabel(log.actorId || log.userId) ||
                        "System"
                    )}</td>
                    <td>${escape(
                      log.action || log.event || log.type || "Unknown"
                    )}</td>
                    <td>${escape(log.module || log.source || "—")}</td>
                    <td>${escape(
                      log.description ||
                        log.details ||
                        log.message ||
                        ""
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    return `
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>New Patients</td>
            <td>${formatNumber(summary.patients.length)}</td>
          </tr>
          <tr>
            <td>Encounters</td>
            <td>${formatNumber(summary.encounters.length)}</td>
          </tr>
          <tr>
            <td>Consultations</td>
            <td>${formatNumber(summary.consultations.length)}</td>
          </tr>
          <tr>
            <td>Laboratory Orders</td>
            <td>${formatNumber(summary.labOrders.length)}</td>
          </tr>
          <tr>
            <td>Total Invoiced</td>
            <td>${formatCurrency(summary.totalInvoiced)}</td>
          </tr>
          <tr>
            <td>Total Collected</td>
            <td>${formatCurrency(summary.totalCollected)}</td>
          </tr>
          <tr>
            <td>Outstanding</td>
            <td>${formatCurrency(summary.totalOutstanding)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function subscribeToEvents() {
    const eventNames = [
      "patient:created",
      "patient:updated",
      "patient:deleted",
      "queue:created",
      "queue:updated",
      "queue:completed",
      "consultation:completed",
      "lab:order-created",
      "lab:result-verified",
      "invoice:created",
      "invoice:updated",
      "payment:created",
      "staff:created",
      "staff:updated",
      "storage:changed"
    ];

    eventNames.forEach((eventName) => {
      if (EVENTS && typeof EVENTS.on === "function") {
        EVENTS.on(eventName, () => {
          if (document.querySelector('[data-route-view="reports"]')) {
            loadData().then(updateContent);
          }
        });
      }
    });

    document.addEventListener("aura:route-changed", (event) => {
      const route = event.detail?.route || event.detail;

      if (route === "reports") {
        initialize();
      }
    });
  }

  async function initialize() {
    if (state.initialized) {
      await loadData();
      renderShell();
      return state;
    }

    state.initialized = true;

    await loadData();
    renderShell();
    subscribeToEvents();

    if (EVENTS && typeof EVENTS.emit === "function") {
      EVENTS.emit("reports:initialized", {
        module: MODULE_NAME
      });
    }

    return state;
  }

  function getState() {
    return {
      ...state,
      data: {
        ...state.data
      }
    };
  }

  function setRange(range, from = "", to = "") {
    state.range = range || "today";
    state.customFrom = from;
    state.customTo = to;

    updateContent();
  }

  function setActiveReport(reportId) {
    if (!REPORTS.some((report) => report.id === reportId)) {
      return false;
    }

    state.activeReport = reportId;

    document
      .querySelectorAll("[data-report-id]")
      .forEach((button) => {
        const active = button.dataset.reportId === reportId;

        button.classList.toggle("is-active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
      });

    updateContent();

    return true;
  }

  const API = {
    initialize,
    init: initialize,
    refresh,
    render: renderShell,
    loadData,
    print: printReport,
    getState,
    setRange,
    setActiveReport,
    getDateRange,
    calculateOverview
  };

  window.AURA_REPORTS = API;
  window.AURA_REPORTS_MODULE = API;

  window.AURA = window.AURA || {};
  window.AURA.reports = API;

  if (window.AURA_APP && typeof window.AURA_APP.registerModule === "function") {
    window.AURA_APP.registerModule("reports", API);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const currentRoute =
      window.location.hash.replace(/^#\/?/, "").split("?")[0] ||
      "dashboard";

    if (currentRoute === "reports") {
      initialize();
    }
  });
})(window, document);