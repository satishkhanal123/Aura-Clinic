/* ============================================================
   AURA CLINIC — BILLING MODULE
   File: frontend/js/modules/billing.js

   Purpose:
   - Invoice creation and management
   - Consultation and laboratory charges
   - Payment collection
   - Outstanding balance tracking
   - Cashier workspace
   - Invoice printing
============================================================ */

(function (window, document) {
    "use strict";

    const STORAGE = window.AURA_STORAGE;
    const EVENTS = window.AURA_EVENTS;
    const UTILS = window.AURA_UTILS;
    const APP = window.AURA_APP;

    const MODULE_NAME = "billing";

    const STORE = {
        patients: "patients",
        staff: "staff",
        encounters: "encounters",
        consultations: "consultations",
        labOrders: "labOrders",
        invoices: "invoices",
        payments: "payments",
        services: "services",
        auditLogs: "auditLogs",
        settings: "settings"
    };

    const state = {
        patients: [],
        staff: [],
        encounters: [],
        consultations: [],
        labOrders: [],
        invoices: [],
        payments: [],
        services: [],
        settings: {},

        searchTerm: "",
        filter: "all",

        selectedInvoice: null,
        selectedPatient: null,

        initialized: false,
        loading: false
    };

    const DEFAULT_SERVICES = [
        {
            id: "service-consultation",
            name: "General Consultation",
            category: "Consultation",
            price: 500,
            active: true
        },
        {
            id: "service-follow-up",
            name: "Follow-up Consultation",
            category: "Consultation",
            price: 300,
            active: true
        },
        {
            id: "service-pediatric",
            name: "Pediatric Consultation",
            category: "Consultation",
            price: 600,
            active: true
        },
        {
            id: "service-emergency",
            name: "Emergency Consultation",
            category: "Consultation",
            price: 800,
            active: true
        },
        {
            id: "service-cbc",
            name: "Complete Blood Count",
            category: "Laboratory",
            price: 300,
            active: true
        },
        {
            id: "service-glucose",
            name: "Blood Glucose",
            category: "Laboratory",
            price: 100,
            active: true
        },
        {
            id: "service-lft",
            name: "Liver Function Test",
            category: "Laboratory",
            price: 700,
            active: true
        },
        {
            id: "service-kft",
            name: "Kidney Function Test",
            category: "Laboratory",
            price: 700,
            active: true
        },
        {
            id: "service-urine",
            name: "Urine Routine",
            category: "Laboratory",
            price: 150,
            active: true
        },
        {
            id: "service-xray",
            name: "Chest X-Ray",
            category: "Radiology",
            price: 500,
            active: true
        }
    ];

    const PAYMENT_METHODS = [
        "Cash",
        "UPI",
        "Debit Card",
        "Credit Card",
        "Bank Transfer",
        "Other"
    ];

    const INVOICE_STATUSES = [
        "draft",
        "unpaid",
        "partially-paid",
        "paid",
        "cancelled"
    ];

    const escapeHtml = (value) => {
        if (UTILS && typeof UTILS.escapeHtml === "function") {
            return UTILS.escapeHtml(value ?? "");
        }

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const createId = (prefix = "id") => {
        if (UTILS && typeof UTILS.createId === "function") {
            return UTILS.createId(prefix);
        }

        return `${prefix}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
    };

    const now = () => new Date().toISOString();

    const today = () => new Date().toISOString().slice(0, 10);

    const formatDate = (value) => {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    const formatDateTime = (value) => {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    const formatCurrency = (value) => {
        const amount = Number(value) || 0;

        if (UTILS && typeof UTILS.formatCurrency === "function") {
            return UTILS.formatCurrency(amount);
        }

        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(amount);
    };

    const getContainer = () => {
        return (
            document.querySelector('[data-route-view="billing"]') ||
            document.querySelector("#app-content") ||
            document.querySelector("#app")
        );
    };

    const getCurrentUser = () => {
        return (
            window.AURA_AUTH?.getState?.()?.user ||
            window.AURA_AUTH?.getUser?.() ||
            null
        );
    };

    const getActorName = () => {
        const user = getCurrentUser();

        return (
            user?.name ||
            user?.fullName ||
            user?.email ||
            "Cashier"
        );
    };

    const getActorId = () => {
        const user = getCurrentUser();

        return user?.id || user?.staffId || null;
    };

    const getPatientName = (patient) => {
        if (!patient) return "Unknown Patient";

        return (
            patient.fullName ||
            patient.name ||
            [
                patient.firstName,
                patient.middleName,
                patient.lastName
            ]
                .filter(Boolean)
                .join(" ") ||
            "Unknown Patient"
        );
    };

    const getPatientById = (patientId) => {
        return state.patients.find(
            (patient) => patient.id === patientId
        );
    };

    const getPatientByUHID = (uhid) => {
        return state.patients.find(
            (patient) => patient.uhid === uhid
        );
    };

    const getInvoicePatient = (invoice) => {
        if (!invoice) return null;

        return (
            getPatientById(invoice.patientId) ||
            getPatientByUHID(invoice.uhid)
        );
    };

    const notify = (type, title, message) => {
        if (APP && typeof APP.toast === "function") {
            APP.toast({
                type,
                title,
                message
            });
            return;
        }

        if (typeof window.AURA?.toast === "function") {
            window.AURA.toast({
                type,
                title,
                message
            });
            return;
        }

        console.log(`[${type}] ${title}: ${message}`);
    };

    const emit = (eventName, payload) => {
        if (EVENTS && typeof EVENTS.emit === "function") {
            EVENTS.emit(eventName, payload);
        }

        window.dispatchEvent?.(
            new CustomEvent(`aura:${eventName}`, {
                detail: payload
            })
        );
    };

    const audit = async (action, details = {}) => {
        if (!STORAGE) return;

        try {
            await STORAGE.add(STORE.auditLogs, {
                id: createId("audit"),
                action,
                module: MODULE_NAME,
                actorId: getActorId(),
                actorName: getActorName(),
                details,
                createdAt: now()
            });
        } catch (error) {
            console.warn("Billing audit log failed:", error);
        }
    };

    const loadData = async () => {
        state.loading = true;

        try {
            if (!STORAGE) {
                console.warn("AURA_STORAGE is unavailable.");
                return;
            }

            const results = await Promise.all([
                STORAGE.getAll(STORE.patients),
                STORAGE.getAll(STORE.staff),
                STORAGE.getAll(STORE.encounters),
                STORAGE.getAll(STORE.consultations),
                STORAGE.getAll(STORE.labOrders),
                STORAGE.getAll(STORE.invoices),
                STORAGE.getAll(STORE.payments),
                STORAGE.getAll(STORE.services),
                STORAGE.get(STORE.settings, "clinic-settings")
            ]);

            state.patients = results[0] || [];
            state.staff = results[1] || [];
            state.encounters = results[2] || [];
            state.consultations = results[3] || [];
            state.labOrders = results[4] || [];
            state.invoices = results[5] || [];
            state.payments = results[6] || [];
            state.services = results[7] || [];
            state.settings = results[8] || {};

        } catch (error) {
            console.error("Failed to load billing data:", error);

            notify(
                "error",
                "Loading Failed",
                "Billing data could not be loaded."
            );
        } finally {
            state.loading = false;
        }
    };

    const getServices = () => {
        const activeServices = state.services.filter(
            (service) => service.active !== false
        );

        return activeServices.length
            ? activeServices
            : DEFAULT_SERVICES;
    };

    const getServiceByName = (name) => {
        return getServices().find(
            (service) =>
                service.name.toLowerCase() ===
                String(name || "").toLowerCase()
        );
    };

    const getServicePrice = (name) => {
        return Number(getServiceByName(name)?.price || 0);
    };

    const getInvoiceItems = (invoice) => {
        return Array.isArray(invoice?.items)
            ? invoice.items
            : [];
    };

    const getInvoiceSubtotal = (invoice) => {
        if (!invoice) return 0;

        if (invoice.subtotal !== undefined) {
            return Number(invoice.subtotal) || 0;
        }

        return getInvoiceItems(invoice).reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0
        );
    };

    const getInvoiceDiscount = (invoice) => {
        return Number(invoice?.discount || 0);
    };

    const getInvoiceTax = (invoice) => {
        return Number(invoice?.tax || 0);
    };

    const getInvoiceTotal = (invoice) => {
        if (!invoice) return 0;

        if (invoice.total !== undefined) {
            return Number(invoice.total) || 0;
        }

        return Math.max(
            0,
            getInvoiceSubtotal(invoice) -
                getInvoiceDiscount(invoice) +
                getInvoiceTax(invoice)
        );
    };

    const getInvoicePayments = (invoiceId) => {
        return state.payments.filter(
            (payment) =>
                payment.invoiceId === invoiceId &&
                payment.status !== "voided" &&
                payment.status !== "cancelled"
        );
    };

    const getPaidAmount = (invoice) => {
        return getInvoicePayments(invoice.id).reduce(
            (sum, payment) => sum + Number(payment.amount || 0),
            0
        );
    };

    const getOutstandingAmount = (invoice) => {
        return Math.max(
            0,
            getInvoiceTotal(invoice) - getPaidAmount(invoice)
        );
    };

    const getInvoiceStatus = (invoice) => {
        if (!invoice) return "draft";

        if (invoice.status === "cancelled") {
            return "cancelled";
        }

        const total = getInvoiceTotal(invoice);
        const paid = getPaidAmount(invoice);

        if (total <= 0) return "draft";
        if (paid >= total) return "paid";
        if (paid > 0) return "partially-paid";

        return invoice.status === "draft"
            ? "draft"
            : "unpaid";
    };

    const getStatusLabel = (status) => {
        const labels = {
            draft: "Draft",
            unpaid: "Unpaid",
            "partially-paid": "Partially Paid",
            paid: "Paid",
            cancelled: "Cancelled"
        };

        return labels[status] || "Unknown";
    };

    const getStatusClass = (status) => {
        return String(status || "draft")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
    };

    const generateInvoiceNumber = () => {
        const prefix = "INV";
        const datePart = today().replace(/-/g, "");

        const count = state.invoices.filter(
            (invoice) =>
                invoice.createdAt?.slice?.(0, 10) === today()
        ).length + 1;

        return `${prefix}-${datePart}-${String(count).padStart(4, "0")}`;
    };

    const generatePaymentNumber = () => {
        const prefix = "PAY";
        const datePart = today().replace(/-/g, "");

        const count = state.payments.filter(
            (payment) =>
                payment.createdAt?.slice?.(0, 10) === today()
        ).length + 1;

        return `${prefix}-${datePart}-${String(count).padStart(4, "0")}`;
    };

    const getTodayInvoices = () => {
        return state.invoices.filter(
            (invoice) =>
                invoice.createdAt?.slice?.(0, 10) === today() ||
                invoice.invoiceDate === today()
        );
    };

    const calculateStats = () => {
        const invoices = getTodayInvoices();

        const totalBilled = invoices.reduce(
            (sum, invoice) => sum + getInvoiceTotal(invoice),
            0
        );

        const totalCollected = invoices.reduce(
            (sum, invoice) => sum + getPaidAmount(invoice),
            0
        );

        const outstanding = invoices.reduce(
            (sum, invoice) => sum + getOutstandingAmount(invoice),
            0
        );

        return {
            invoices: invoices.length,
            totalBilled,
            totalCollected,
            outstanding,
            paid: invoices.filter(
                (invoice) => getInvoiceStatus(invoice) === "paid"
            ).length,
            pending: invoices.filter(
                (invoice) =>
                    ["unpaid", "partially-paid"].includes(
                        getInvoiceStatus(invoice)
                    )
            ).length
        };
    };

    const getFilteredInvoices = () => {
        let invoices = [...state.invoices];

        if (state.filter !== "all") {
            invoices = invoices.filter(
                (invoice) =>
                    getInvoiceStatus(invoice) === state.filter
            );
        }

        const search = state.searchTerm.trim().toLowerCase();

        if (search) {
            invoices = invoices.filter((invoice) => {
                const patient = getInvoicePatient(invoice);

                const text = [
                    invoice.invoiceNumber,
                    invoice.uhid,
                    patient?.uhid,
                    getPatientName(patient),
                    patient?.phone,
                    getInvoiceStatus(invoice)
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return text.includes(search);
            });
        }

        return invoices.sort(
            (a, b) =>
                new Date(b.createdAt || 0) -
                new Date(a.createdAt || 0)
        );
    };

    const render = () => {
        const container = getContainer();

        if (!container) return;

        const stats = calculateStats();

        container.innerHTML = `
            <section class="billing-workspace">

                <header class="page-header">
                    <div>
                        <div class="eyebrow">FINANCE & CASHIER</div>
                        <h1>Billing & Payments</h1>
                        <p class="page-subtitle">
                            Create invoices, collect payments, and manage outstanding balances.
                        </p>
                    </div>

                    <div class="page-header-actions">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-billing-action="refresh"
                        >
                            ↻ Refresh
                        </button>

                        <button
                            type="button"
                            class="btn btn-primary"
                            data-billing-action="new-invoice"
                        >
                            + New Invoice
                        </button>
                    </div>
                </header>

                <section class="kpi-grid billing-kpi-grid">
                    ${renderStatCard(
                        "Today's Invoices",
                        stats.invoices,
                        "invoice"
                    )}

                    ${renderStatCard(
                        "Total Billed",
                        formatCurrency(stats.totalBilled),
                        "billing"
                    )}

                    ${renderStatCard(
                        "Collected",
                        formatCurrency(stats.totalCollected),
                        "payment"
                    )}

                    ${renderStatCard(
                        "Outstanding",
                        formatCurrency(stats.outstanding),
                        "pending"
                    )}
                </section>

                <section class="billing-main-grid">

                    <div class="panel-card billing-list-panel">

                        <div class="panel-header">
                            <div>
                                <h2>Invoices</h2>
                                <p>Search and manage patient invoices.</p>
                            </div>

                            <span class="panel-header-note">
                                ${state.invoices.length} Total
                            </span>
                        </div>

                        <div class="billing-toolbar">
                            <label class="search-field">
                                <span class="search-icon">⌕</span>
                                <input
                                    type="search"
                                    id="billing-search"
                                    placeholder="Search invoice, patient, or UHID..."
                                    value="${escapeHtml(state.searchTerm)}"
                                >
                            </label>

                            <div class="segmented-control" role="tablist">
                                ${renderFilterButton("all", "All")}
                                ${renderFilterButton("unpaid", "Unpaid")}
                                ${renderFilterButton("partially-paid", "Partial")}
                                ${renderFilterButton("paid", "Paid")}
                            </div>
                        </div>

                        <div class="billing-table-wrapper">
                            ${renderInvoiceTable()}
                        </div>

                    </div>

                    <aside class="billing-side-panel">

                        <div class="panel-card billing-summary-panel">
                            <div class="panel-header">
                                <div>
                                    <h2>Collection Summary</h2>
                                    <p>Today's payment position</p>
                                </div>
                            </div>

                            ${renderSummaryRows(stats)}
                        </div>

                        <div class="panel-card billing-quick-panel">
                            <div class="panel-header">
                                <div>
                                    <h2>Quick Actions</h2>
                                </div>
                            </div>

                            <div class="quick-action-list">
                                <button
                                    type="button"
                                    class="quick-action"
                                    data-billing-action="new-invoice"
                                >
                                    <span class="quick-action-icon">🧾</span>
                                    <span>
                                        <strong>Create Invoice</strong>
                                        <small>Generate a new patient bill</small>
                                    </span>
                                    <span>›</span>
                                </button>

                                <button
                                    type="button"
                                    class="quick-action"
                                    data-billing-action="patients"
                                >
                                    <span class="quick-action-icon">👥</span>
                                    <span>
                                        <strong>Patient Registry</strong>
                                        <small>Find patient records</small>
                                    </span>
                                    <span>›</span>
                                </button>

                                <button
                                    type="button"
                                    class="quick-action"
                                    data-billing-action="services"
                                >
                                    <span class="quick-action-icon">⚙</span>
                                    <span>
                                        <strong>Service Charges</strong>
                                        <small>Manage billing services</small>
                                    </span>
                                    <span>›</span>
                                </button>
                            </div>
                        </div>

                    </aside>

                </section>

            </section>
        `;

        bindEvents();
    };

    const renderStatCard = (label, value, icon) => {
        return `
            <article class="kpi-card billing-stat-card">
                <div class="kpi-card-top">
                    <span class="kpi-label">${escapeHtml(label)}</span>
                    <span class="kpi-icon">${getIcon(icon)}</span>
                </div>

                <div class="kpi-value">${escapeHtml(value)}</div>
                <div class="kpi-description">Updated ${escapeHtml(formatDate(new Date()))}</div>
            </article>
        `;
    };

    const getIcon = (name) => {
        const icons = {
            invoice: "▣",
            billing: "₹",
            payment: "✓",
            pending: "◷"
        };

        return icons[name] || "•";
    };

    const renderFilterButton = (value, label) => {
        return `
            <button
                type="button"
                class="segmented-button ${
                    state.filter === value ? "is-active" : ""
                }"
                data-billing-filter="${escapeHtml(value)}"
                role="tab"
                aria-selected="${state.filter === value}"
            >
                ${escapeHtml(label)}
            </button>
        `;
    };

    const renderSummaryRows = (stats) => {
        return `
            <div class="summary-row">
                <span>Total invoices</span>
                <strong>${stats.invoices}</strong>
            </div>

            <div class="summary-row">
                <span>Paid invoices</span>
                <strong>${stats.paid}</strong>
            </div>

            <div class="summary-row">
                <span>Pending invoices</span>
                <strong>${stats.pending}</strong>
            </div>

            <div class="summary-row">
                <span>Total billed</span>
                <strong>${formatCurrency(stats.totalBilled)}</strong>
            </div>

            <div class="summary-row">
                <span>Total collected</span>
                <strong>${formatCurrency(stats.totalCollected)}</strong>
            </div>

            <div class="summary-row">
                <span>Outstanding</span>
                <strong>${formatCurrency(stats.outstanding)}</strong>
            </div>
        `;
    };

    const renderInvoiceTable = () => {
        const invoices = getFilteredInvoices();

        if (!invoices.length) {
            return `
                <div class="empty-state">
                    <div class="empty-state-icon">₹</div>
                    <h3>No invoices found</h3>
                    <p>Create an invoice or adjust the selected filters.</p>
                </div>
            `;
        }

        return `
            <table class="data-table billing-table">
                <thead>
                    <tr>
                        <th>Invoice</th>
                        <th>Patient</th>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>

                <tbody>
                    ${invoices.map(renderInvoiceRow).join("")}
                </tbody>
            </table>
        `;
    };

    const renderInvoiceRow = (invoice) => {
        const patient = getInvoicePatient(invoice);
        const total = getInvoiceTotal(invoice);
        const paid = getPaidAmount(invoice);
        const outstanding = getOutstandingAmount(invoice);
        const status = getInvoiceStatus(invoice);

        return `
            <tr data-invoice-id="${escapeHtml(invoice.id)}">

                <td>
                    <strong>${escapeHtml(invoice.invoiceNumber || "—")}</strong>
                    <small>${escapeHtml(invoice.uhid || patient?.uhid || "—")}</small>
                </td>

                <td>
                    <strong>${escapeHtml(getPatientName(patient))}</strong>
                    <small>${escapeHtml(patient?.phone || "—")}</small>
                </td>

                <td>${escapeHtml(formatDate(invoice.invoiceDate || invoice.createdAt))}</td>

                <td><strong>${formatCurrency(total)}</strong></td>

                <td>${formatCurrency(paid)}</td>

                <td>
                    <strong class="${outstanding > 0 ? "text-warning" : "text-success"}">
                        ${formatCurrency(outstanding)}
                    </strong>
                </td>

                <td>
                    <span class="status-badge status-${getStatusClass(status)}">
                        ${escapeHtml(getStatusLabel(status))}
                    </span>
                </td>

                <td>
                    <div class="table-actions">
                        <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            data-billing-invoice-action="view"
                            data-invoice-id="${escapeHtml(invoice.id)}"
                        >
                            View
                        </button>

                        ${
                            outstanding > 0 && status !== "cancelled"
                                ? `
                                    <button
                                        type="button"
                                        class="btn btn-primary btn-sm"
                                        data-billing-invoice-action="pay"
                                        data-invoice-id="${escapeHtml(invoice.id)}"
                                    >
                                        Pay
                                    </button>
                                `
                                : ""
                        }
                    </div>
                </td>

            </tr>
        `;
    };

    const bindEvents = () => {
        const container = getContainer();

        if (!container) return;

        container.querySelectorAll("[data-billing-filter]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    state.filter =
                        button.dataset.billingFilter || "all";

                    render();
                });
            });

        const searchInput =
            container.querySelector("#billing-search");

        searchInput?.addEventListener("input", (event) => {
            state.searchTerm = event.target.value || "";
            renderInvoiceTableOnly();
        });

        container.querySelectorAll("[data-billing-invoice-action]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    handleInvoiceAction(
                        button.dataset.billingInvoiceAction,
                        button.dataset.invoiceId
                    );
                });
            });

        container.querySelectorAll("[data-billing-action]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    handleAction(button.dataset.billingAction);
                });
            });
    };

    const renderInvoiceTableOnly = () => {
        const container = getContainer();

        if (!container) return;

        const tableWrapper =
            container.querySelector(".billing-table-wrapper");

        if (!tableWrapper) return;

        tableWrapper.innerHTML = renderInvoiceTable();

        bindEvents();
    };

    const handleAction = (action) => {
        switch (action) {
            case "refresh":
                refresh();
                break;

            case "new-invoice":
                openInvoiceForm();
                break;

            case "patients":
                navigateTo("patients");
                break;

            case "services":
                openServicesModal();
                break;

            default:
                break;
        }
    };

    const handleInvoiceAction = (action, invoiceId) => {
        const invoice = state.invoices.find(
            (item) => item.id === invoiceId
        );

        if (!invoice) return;

        switch (action) {
            case "view":
                openInvoiceDetails(invoice);
                break;

            case "pay":
                openPaymentModal(invoice);
                break;

            default:
                break;
        }
    };

    const navigateTo = (route) => {
        if (window.AURA_ROUTER?.navigate) {
            window.AURA_ROUTER.navigate(route);
            return;
        }

        if (window.AURA_APP?.navigate) {
            window.AURA_APP.navigate(route);
            return;
        }

        window.location.hash = `#/${route}`;
    };

    const openInvoiceForm = () => {
        const services = getServices();

        const html = `
            <div class="modal-content billing-modal">

                <div class="modal-header">
                    <div>
                        <div class="eyebrow">NEW BILLING RECORD</div>
                        <h2>Create Invoice</h2>
                    </div>

                    <button
                        type="button"
                        class="modal-close"
                        data-billing-modal-close
                    >
                        ×
                    </button>
                </div>

                <form id="billing-invoice-form" novalidate>

                    <div class="form-section">
                        <h3>Patient Details</h3>

                        <div class="form-grid form-grid-2">

                            <label class="form-field">
                                <span>Search Patient</span>
                                <input
                                    type="search"
                                    name="patientSearch"
                                    id="billing-patient-search"
                                    placeholder="Name, UHID, or phone"
                                    autocomplete="off"
                                >
                                <div
                                    id="billing-patient-results"
                                    class="patient-search-results"
                                ></div>
                            </label>

                            <label class="form-field">
                                <span>Selected UHID</span>
                                <input
                                    type="text"
                                    name="uhid"
                                    id="billing-selected-uhid"
                                    placeholder="Select a patient"
                                    readonly
                                >
                                <input
                                    type="hidden"
                                    name="patientId"
                                    id="billing-selected-patient-id"
                                >
                            </label>

                        </div>

                        <div
                            id="billing-selected-patient"
                            class="selected-patient-banner"
                        >
                            No patient selected.
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="section-heading-row">
                            <div>
                                <h3>Billable Services</h3>
                                <p>Select services and enter quantities.</p>
                            </div>

                            <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                data-billing-form-action="add-item"
                            >
                                + Add Item
                            </button>
                        </div>

                        <div id="billing-items">
                            ${renderInvoiceItemEditor(0, services)}
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Invoice Summary</h3>

                        <div class="billing-summary-editor">

                            <div class="summary-row">
                                <span>Subtotal</span>
                                <strong id="billing-form-subtotal">₹0.00</strong>
                            </div>

                            <div class="summary-row">
                                <label for="billing-discount">
                                    Discount
                                </label>

                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    id="billing-discount"
                                    name="discount"
                                    value="0"
                                >
                            </div>

                            <div class="summary-row">
                                <label for="billing-tax">
                                    Tax
                                </label>

                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    id="billing-tax"
                                    name="tax"
                                    value="0"
                                >
                            </div>

                            <div class="summary-row summary-row-total">
                                <span>Total</span>
                                <strong id="billing-form-total">₹0.00</strong>
                            </div>

                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Initial Payment</h3>

                        <div class="form-grid form-grid-2">

                            <label class="form-field">
                                <span>Payment Amount</span>
                                <input
                                    type="number"
                                    name="paymentAmount"
                                    min="0"
                                    step="0.01"
                                    value="0"
                                >
                            </label>

                            <label class="form-field">
                                <span>Payment Method</span>
                                <select name="paymentMethod">
                                    ${PAYMENT_METHODS.map(
                                        (method) => `
                                            <option value="${escapeHtml(method)}">
                                                ${escapeHtml(method)}
                                            </option>
                                        `
                                    ).join("")}
                                </select>
                            </label>

                        </div>
                    </div>

                    <div class="modal-footer">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-billing-modal-close
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            class="btn btn-primary"
                        >
                            Create Invoice
                        </button>
                    </div>

                </form>

            </div>
        `;

        openModal(html);
        bindInvoiceFormEvents();
    };

    const renderInvoiceItemEditor = (index, services) => {
        return `
            <div
                class="billing-item-editor"
                data-billing-item-index="${index}"
            >
                <label class="form-field">
                    <span>Service</span>

                    <select
                        name="itemService"
                        class="billing-item-service"
                    >
                        <option value="">Select service</option>

                        ${services.map(
                            (service) => `
                                <option
                                    value="${escapeHtml(service.name)}"
                                    data-price="${Number(service.price || 0)}"
                                >
                                    ${escapeHtml(service.name)}
                                    — ${formatCurrency(service.price)}
                                </option>
                            `
                        ).join("")}
                    </select>
                </label>

                <label class="form-field">
                    <span>Quantity</span>

                    <input
                        type="number"
                        name="itemQuantity"
                        class="billing-item-quantity"
                        min="1"
                        step="1"
                        value="1"
                    >
                </label>

                <label class="form-field">
                    <span>Unit Price</span>

                    <input
                        type="number"
                        name="itemPrice"
                        class="billing-item-price"
                        min="0"
                        step="0.01"
                        value="0"
                    >
                </label>

                <label class="form-field">
                    <span>Amount</span>

                    <input
                        type="number"
                        name="itemAmount"
                        class="billing-item-amount"
                        min="0"
                        step="0.01"
                        value="0"
                        readonly
                    >
                </label>

                <button
                    type="button"
                    class="btn btn-ghost btn-sm billing-item-remove"
                    data-billing-form-action="remove-item"
                    data-billing-item-index="${index}"
                >
                    Remove
                </button>
            </div>
        `;
    };

    const bindInvoiceFormEvents = () => {
        const overlay = document.querySelector("#billing-module-modal");

        if (!overlay) return;

        overlay.querySelectorAll("[data-billing-modal-close]")
            .forEach((button) => {
                button.addEventListener("click", closeModal);
            });

        const patientSearch =
            overlay.querySelector("#billing-patient-search");

        patientSearch?.addEventListener("input", (event) => {
            renderPatientSearchResults(event.target.value || "");
        });

        overlay.querySelector("#billing-invoice-form")
            ?.addEventListener("submit", async (event) => {
                event.preventDefault();
                await createInvoiceFromForm();
            });

        overlay.querySelectorAll("[data-billing-form-action]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    handleInvoiceFormAction(
                        button.dataset.billingFormAction,
                        button.dataset.billingItemIndex
                    );
                });
            });

        overlay.querySelectorAll(
            ".billing-item-service, .billing-item-quantity, .billing-item-price"
        ).forEach((input) => {
            input.addEventListener("input", updateInvoiceFormTotals);
            input.addEventListener("change", updateInvoiceFormTotals);
        });

        overlay.querySelector("#billing-discount")
            ?.addEventListener("input", updateInvoiceFormTotals);

        overlay.querySelector("#billing-tax")
            ?.addEventListener("input", updateInvoiceFormTotals);

        updateInvoiceFormTotals();
    };

    const handleInvoiceFormAction = (action, itemIndex) => {
        switch (action) {
            case "add-item":
                addInvoiceItem();
                break;

            case "remove-item":
                removeInvoiceItem(Number(itemIndex));
                break;

            case "select-patient":
                selectPatientForInvoice(itemIndex);
                break;

            default:
                break;
        }
    };

    const addInvoiceItem = () => {
        const container = document.querySelector("#billing-items");

        if (!container) return;

        const index =
            container.querySelectorAll(".billing-item-editor").length;

        container.insertAdjacentHTML(
            "beforeend",
            renderInvoiceItemEditor(index, getServices())
        );

        const newItem = container.lastElementChild;

        newItem.querySelectorAll(
            ".billing-item-service, .billing-item-quantity, .billing-item-price"
        ).forEach((input) => {
            input.addEventListener("input", updateInvoiceFormTotals);
            input.addEventListener("change", updateInvoiceFormTotals);
        });

        updateInvoiceFormTotals();
    };

    const removeInvoiceItem = (index) => {
        const container = document.querySelector("#billing-items");

        if (!container) return;

        const items =
            container.querySelectorAll(".billing-item-editor");

        if (items.length <= 1) {
            notify(
                "info",
                "Minimum Item Required",
                "An invoice must contain at least one line item."
            );

            return;
        }

        items[index]?.remove();

        updateInvoiceFormTotals();
    };

    const renderPatientSearchResults = (searchTerm) => {
        const resultsContainer = document.querySelector(
            "#billing-patient-results"
        );

        if (!resultsContainer) return;

        const search = searchTerm.trim().toLowerCase();

        if (!search) {
            resultsContainer.innerHTML = "";
            return;
        }

        const results = state.patients
            .filter((patient) => {
                const text = [
                    patient.uhid,
                    getPatientName(patient),
                    patient.phone
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return text.includes(search);
            })
            .slice(0, 8);

        if (!results.length) {
            resultsContainer.innerHTML = `
                <div class="patient-search-empty">
                    No matching patients found.
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = results
            .map(
                (patient) => `
                    <button
                        type="button"
                        class="patient-search-result"
                        data-billing-select-patient="${escapeHtml(patient.id)}"
                    >
                        <strong>${escapeHtml(getPatientName(patient))}</strong>
                        <span>
                            ${escapeHtml(patient.uhid || "—")}
                            ·
                            ${escapeHtml(patient.phone || "—")}
                        </span>
                    </button>
                `
            )
            .join("");

        resultsContainer.querySelectorAll(
            "[data-billing-select-patient]"
        ).forEach((button) => {
            button.addEventListener("click", () => {
                selectPatientForInvoice(
                    button.dataset.billingSelectPatient
                );
            });
        });
    };

    const selectPatientForInvoice = (patientId) => {
        const patient = getPatientById(patientId);

        if (!patient) return;

        state.selectedPatient = patient;

        const patientIdInput = document.querySelector(
            "#billing-selected-patient-id"
        );

        const uhidInput = document.querySelector(
            "#billing-selected-uhid"
        );

        const searchInput = document.querySelector(
            "#billing-patient-search"
        );

        const selectedBanner = document.querySelector(
            "#billing-selected-patient"
        );

        if (patientIdInput) {
            patientIdInput.value = patient.id;
        }

        if (uhidInput) {
            uhidInput.value = patient.uhid || "";
        }

        if (searchInput) {
            searchInput.value = getPatientName(patient);
        }

        if (selectedBanner) {
            selectedBanner.innerHTML = `
                <strong>${escapeHtml(getPatientName(patient))}</strong>
                <span>
                    ${escapeHtml(patient.uhid || "—")}
                    ·
                    ${escapeHtml(patient.phone || "—")}
                </span>
            `;
        }

        const resultsContainer = document.querySelector(
            "#billing-patient-results"
        );

        if (resultsContainer) {
            resultsContainer.innerHTML = "";
        }
    };

    const updateInvoiceFormTotals = () => {
        const overlay = document.querySelector("#billing-module-modal");

        if (!overlay) return;

        let subtotal = 0;

        overlay.querySelectorAll(".billing-item-editor")
            .forEach((item) => {
                const serviceSelect =
                    item.querySelector(".billing-item-service");

                const quantityInput =
                    item.querySelector(".billing-item-quantity");

                const priceInput =
                    item.querySelector(".billing-item-price");

                const amountInput =
                    item.querySelector(".billing-item-amount");

                const selectedOption =
                    serviceSelect?.selectedOptions?.[0];

                const selectedPrice = Number(
                    selectedOption?.dataset?.price || 0
                );

                const currentPrice = Number(priceInput?.value || 0);

                if (
                    selectedOption?.value &&
                    (
                        !priceInput.value ||
                        Number(priceInput.value) === 0
                    )
                ) {
                    priceInput.value = selectedPrice;
                }

                const price = Number(priceInput?.value || 0);
                const quantity = Math.max(
                    1,
                    Number(quantityInput?.value || 1)
                );

                const amount = price * quantity;

                if (amountInput) {
                    amountInput.value = amount.toFixed(2);
                }

                subtotal += amount;
            });

        const discount = Math.max(
            0,
            Number(
                overlay.querySelector("#billing-discount")?.value || 0
            )
        );

        const tax = Math.max(
            0,
            Number(
                overlay.querySelector("#billing-tax")?.value || 0
            )
        );

        const total = Math.max(
            0,
            subtotal - discount + tax
        );

        const subtotalElement =
            overlay.querySelector("#billing-form-subtotal");

        const totalElement =
            overlay.querySelector("#billing-form-total");

        if (subtotalElement) {
            subtotalElement.textContent = formatCurrency(subtotal);
        }

        if (totalElement) {
            totalElement.textContent = formatCurrency(total);
        }

        return {
            subtotal,
            discount,
            tax,
            total
        };
    };

    const collectInvoiceItemsFromForm = () => {
        const items = [];

        document.querySelectorAll(
            "#billing-items .billing-item-editor"
        ).forEach((item) => {
            const serviceName =
                item.querySelector(".billing-item-service")?.value || "";

            const quantity = Math.max(
                1,
                Number(
                    item.querySelector(".billing-item-quantity")?.value || 1
                )
            );

            const unitPrice = Number(
                item.querySelector(".billing-item-price")?.value || 0
            );

            const amount = unitPrice * quantity;

            if (!serviceName || amount <= 0) return;

            items.push({
                id: createId("invoice-item"),
                serviceName,
                description: serviceName,
                quantity,
                unitPrice,
                amount
            });
        });

        return items;
    };

    const createInvoiceFromForm = async () => {
        if (!STORAGE) return;

        const form = document.querySelector("#billing-invoice-form");

        if (!form) return;

        const formData = new FormData(form);

        const patientId = formData.get("patientId");
        const patient = getPatientById(patientId);

        if (!patient) {
            notify(
                "warning",
                "Patient Required",
                "Please select a patient before creating an invoice."
            );

            return;
        }

        const items = collectInvoiceItemsFromForm();

        if (!items.length) {
            notify(
                "warning",
                "Invoice Items Required",
                "Add at least one billable service."
            );

            return;
        }

        const totals = updateInvoiceFormTotals();

        const paymentAmount = Math.max(
            0,
            Number(formData.get("paymentAmount") || 0)
        );

        if (paymentAmount > totals.total) {
            notify(
                "warning",
                "Invalid Payment",
                "The initial payment cannot exceed the invoice total."
            );

            return;
        }

        try {
            const invoice = {
                id: createId("invoice"),
                invoiceNumber: generateInvoiceNumber(),
                patientId: patient.id,
                uhid: patient.uhid || "",
                patientName: getPatientName(patient),

                invoiceDate: today(),
                items,

                subtotal: totals.subtotal,
                discount: totals.discount,
                tax: totals.tax,
                total: totals.total,

                status: paymentAmount > 0
                    ? paymentAmount >= totals.total
                        ? "paid"
                        : "partially-paid"
                    : "unpaid",

                createdBy: getActorId(),
                createdByName: getActorName(),
                createdAt: now(),
                updatedAt: now()
            };

            await STORAGE.add(STORE.invoices, invoice);

            state.invoices.push(invoice);

            emit("invoice:created", invoice);

            await audit("Invoice created", {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                patientId: patient.id,
                total: invoice.total
            });

            if (paymentAmount > 0) {
                await recordPayment(
                    invoice,
                    paymentAmount,
                    formData.get("paymentMethod") || "Cash",
                    false
                );
            }

            closeModal();

            notify(
                "success",
                "Invoice Created",
                `${invoice.invoiceNumber} has been created successfully.`
            );

            render();

        } catch (error) {
            console.error("Failed to create invoice:", error);

            notify(
                "error",
                "Invoice Failed",
                "The invoice could not be created."
            );
        }
    };

    const openInvoiceDetails = (invoice) => {
        const patient = getInvoicePatient(invoice);
        const payments = getInvoicePayments(invoice.id);

        const total = getInvoiceTotal(invoice);
        const paid = getPaidAmount(invoice);
        const outstanding = getOutstandingAmount(invoice);

        const html = `
            <div class="modal-content billing-modal invoice-details-modal">

                <div class="modal-header">
                    <div>
                        <div class="eyebrow">INVOICE DETAILS</div>
                        <h2>${escapeHtml(invoice.invoiceNumber || "Invoice")}</h2>
                    </div>

                    <button
                        type="button"
                        class="modal-close"
                        data-billing-modal-close
                    >
                        ×
                    </button>
                </div>

                <div class="invoice-detail-header">
                    <div>
                        <strong>${escapeHtml(getPatientName(patient))}</strong>
                        <span>${escapeHtml(patient?.uhid || invoice.uhid || "—")}</span>
                    </div>

                    <span class="status-badge status-${getStatusClass(getInvoiceStatus(invoice))}">
                        ${escapeHtml(getStatusLabel(getInvoiceStatus(invoice)))}
                    </span>
                </div>

                <div class="invoice-meta-grid">
                    <div>
                        <span>Invoice Date</span>
                        <strong>${escapeHtml(formatDate(invoice.invoiceDate || invoice.createdAt))}</strong>
                    </div>

                    <div>
                        <span>Phone</span>
                        <strong>${escapeHtml(patient?.phone || "—")}</strong>
                    </div>

                    <div>
                        <span>Created By</span>
                        <strong>${escapeHtml(invoice.createdByName || "—")}</strong>
                    </div>

                    <div>
                        <span>Last Updated</span>
                        <strong>${escapeHtml(formatDateTime(invoice.updatedAt))}</strong>
                    </div>
                </div>

                <div class="invoice-items-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                                <th>Amount</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${getInvoiceItems(invoice)
                                .map(
                                    (item) => `
                                        <tr>
                                            <td>${escapeHtml(item.serviceName || item.description || "Service")}</td>
                                            <td>${escapeHtml(item.quantity || 1)}</td>
                                            <td>${formatCurrency(item.unitPrice)}</td>
                                            <td>${formatCurrency(item.amount)}</td>
                                        </tr>
                                    `
                                )
                                .join("")}
                        </tbody>
                    </table>
                </div>

                <div class="invoice-total-summary">
                    <div class="summary-row">
                        <span>Subtotal</span>
                        <strong>${formatCurrency(getInvoiceSubtotal(invoice))}</strong>
                    </div>

                    <div class="summary-row">
                        <span>Discount</span>
                        <strong>${formatCurrency(getInvoiceDiscount(invoice))}</strong>
                    </div>

                    <div class="summary-row">
                        <span>Tax</span>
                        <strong>${formatCurrency(getInvoiceTax(invoice))}</strong>
                    </div>

                    <div class="summary-row summary-row-total">
                        <span>Total</span>
                        <strong>${formatCurrency(total)}</strong>
                    </div>

                    <div class="summary-row">
                        <span>Paid</span>
                        <strong class="text-success">${formatCurrency(paid)}</strong>
                    </div>

                    <div class="summary-row">
                        <span>Outstanding</span>
                        <strong class="${outstanding > 0 ? "text-warning" : "text-success"}">
                            ${formatCurrency(outstanding)}
                        </strong>
                    </div>
                </div>

                <div class="form-section">
                    <h3>Payment History</h3>

                    ${
                        payments.length
                            ? `
                                <div class="payment-history-list">
                                    ${payments
                                        .map(renderPaymentHistoryItem)
                                        .join("")}
                                </div>
                            `
                            : `
                                <div class="empty-inline">
                                    No payments recorded.
                                </div>
                            `
                    }
                </div>

                <div class="modal-footer">
                    <button
                        type="button"
                        class="btn btn-secondary"
                        data-billing-action-modal="print"
                        data-invoice-id="${escapeHtml(invoice.id)}"
                    >
                        Print Invoice
                    </button>

                    ${
                        outstanding > 0 &&
                        getInvoiceStatus(invoice) !== "cancelled"
                            ? `
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    data-billing-action-modal="pay"
                                    data-invoice-id="${escapeHtml(invoice.id)}"
                                >
                                    Collect Payment
                                </button>
                            `
                            : ""
                    }

                    <button
                        type="button"
                        class="btn btn-secondary"
                        data-billing-modal-close
                    >
                        Close
                    </button>
                </div>

            </div>
        `;

        openModal(html);

        const overlay = document.querySelector(
            "#billing-module-modal"
        );

        overlay?.querySelectorAll("[data-billing-action-modal]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    const action = button.dataset.billingActionModal;
                    const invoiceId = button.dataset.invoiceId;

                    closeModal();

                    if (action === "print") {
                        printInvoice(invoiceId);
                    }

                    if (action === "pay") {
                        const selectedInvoice = state.invoices.find(
                            (item) => item.id === invoiceId
                        );

                        if (selectedInvoice) {
                            openPaymentModal(selectedInvoice);
                        }
                    }
                });
            });
    };

    const renderPaymentHistoryItem = (payment) => {
        return `
            <div class="payment-history-item">
                <div>
                    <strong>${escapeHtml(payment.paymentNumber || "Payment")}</strong>
                    <span>${escapeHtml(formatDateTime(payment.createdAt))}</span>
                </div>

                <div>
                    <strong>${formatCurrency(payment.amount)}</strong>
                    <span>${escapeHtml(payment.paymentMethod || "Cash")}</span>
                </div>
            </div>
        `;
    };

    const openPaymentModal = (invoice) => {
        const outstanding = getOutstandingAmount(invoice);

        if (outstanding <= 0) {
            notify(
                "info",
                "Invoice Paid",
                "This invoice has no outstanding balance."
            );

            return;
        }

        const patient = getInvoicePatient(invoice);

        const html = `
            <div class="modal-content billing-modal payment-modal">

                <div class="modal-header">
                    <div>
                        <div class="eyebrow">PAYMENT COLLECTION</div>
                        <h2>Collect Payment</h2>
                    </div>

                    <button
                        type="button"
                        class="modal-close"
                        data-billing-modal-close
                    >
                        ×
                    </button>
                </div>

                <div class="payment-patient-summary">
                    <strong>${escapeHtml(getPatientName(patient))}</strong>
                    <span>
                        ${escapeHtml(invoice.invoiceNumber || "—")}
                        ·
                        ${escapeHtml(patient?.uhid || invoice.uhid || "—")}
                    </span>
                </div>

                <div class="payment-balance-card">
                    <span>Outstanding Balance</span>
                    <strong>${formatCurrency(outstanding)}</strong>
                </div>

                <form id="billing-payment-form">

                    <label class="form-field">
                        <span>Payment Amount</span>
                        <input
                            type="number"
                            name="amount"
                            min="0.01"
                            max="${outstanding}"
                            step="0.01"
                            value="${outstanding}"
                            required
                        >
                    </label>

                    <label class="form-field">
                        <span>Payment Method</span>
                        <select name="paymentMethod">
                            ${PAYMENT_METHODS.map(
                                (method) => `
                                    <option value="${escapeHtml(method)}">
                                        ${escapeHtml(method)}
                                    </option>
                                `
                            ).join("")}
                        </select>
                    </label>

                    <label class="form-field">
                        <span>Reference / Transaction ID</span>
                        <input
                            type="text"
                            name="referenceNumber"
                            placeholder="Optional transaction reference"
                        >
                    </label>

                    <label class="form-field">
                        <span>Notes</span>
                        <textarea
                            name="notes"
                            rows="3"
                            placeholder="Optional payment notes"
                        ></textarea>
                    </label>

                    <div class="modal-footer">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-billing-modal-close
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            class="btn btn-primary"
                        >
                            Record Payment
                        </button>
                    </div>

                </form>

            </div>
        `;

        openModal(html);

        document.querySelector("#billing-payment-form")
            ?.addEventListener("submit", async (event) => {
                event.preventDefault();

                const formData = new FormData(event.target);

                const amount = Number(
                    formData.get("amount") || 0
                );

                if (amount <= 0 || amount > outstanding) {
                    notify(
                        "warning",
                        "Invalid Amount",
                        "Enter a valid payment amount within the outstanding balance."
                    );

                    return;
                }

                await recordPayment(
                    invoice,
                    amount,
                    formData.get("paymentMethod") || "Cash",
                    true,
                    formData.get("referenceNumber") || "",
                    formData.get("notes") || ""
                );
            });
    };

    const recordPayment = async (
        invoice,
        amount,
        paymentMethod = "Cash",
        closeAfter = true,
        referenceNumber = "",
        notes = ""
    ) => {
        if (!STORAGE || !invoice) return null;

        const outstanding = getOutstandingAmount(invoice);

        if (amount <= 0 || amount > outstanding) {
            throw new Error("Invalid payment amount.");
        }

        try {
            const payment = {
                id: createId("payment"),
                paymentNumber: generatePaymentNumber(),
                invoiceId: invoice.id,
                patientId: invoice.patientId,
                uhid: invoice.uhid || "",
                amount: Number(amount),
                paymentMethod,
                referenceNumber,
                notes,
                status: "completed",
                receivedBy: getActorId(),
                receivedByName: getActorName(),
                createdAt: now(),
                updatedAt: now()
            };

            await STORAGE.add(STORE.payments, payment);

            state.payments.push(payment);

            const total = getInvoiceTotal(invoice);
            const newPaidAmount = getPaidAmount(invoice);
            const newStatus =
                newPaidAmount >= total
                    ? "paid"
                    : "partially-paid";

            const updatedInvoice = {
                ...invoice,
                status: newStatus,
                paidAmount: newPaidAmount,
                balanceAmount: Math.max(
                    0,
                    total - newPaidAmount
                ),
                updatedAt: now()
            };

            await STORAGE.put(
                STORE.invoices,
                updatedInvoice
            );

            const index = state.invoices.findIndex(
                (item) => item.id === invoice.id
            );

            if (index !== -1) {
                state.invoices[index] = updatedInvoice;
            }

            emit("payment:created", payment);
            emit("invoice:updated", updatedInvoice);

            await audit("Payment recorded", {
                paymentId: payment.id,
                paymentNumber: payment.paymentNumber,
                invoiceId: invoice.id,
                amount: payment.amount,
                paymentMethod
            });

            if (closeAfter) {
                closeModal();
            }

            notify(
                "success",
                "Payment Recorded",
                `${formatCurrency(amount)} received successfully.`
            );

            render();

            return payment;

        } catch (error) {
            console.error("Failed to record payment:", error);

            if (closeAfter) {
                notify(
                    "error",
                    "Payment Failed",
                    "The payment could not be recorded."
                );
            }

            throw error;
        }
    };

    const openServicesModal = () => {
        const services = getServices();

        const html = `
            <div class="modal-content billing-modal">

                <div class="modal-header">
                    <div>
                        <div class="eyebrow">BILLING CONFIGURATION</div>
                        <h2>Service Charges</h2>
                    </div>

                    <button
                        type="button"
                        class="modal-close"
                        data-billing-modal-close
                    >
                        ×
                    </button>
                </div>

                <div class="service-list">
                    ${services.map(renderServiceRow).join("")}
                </div>

                <div class="modal-footer">
                    <button
                        type="button"
                        class="btn btn-secondary"
                        data-billing-modal-close
                    >
                        Close
                    </button>
                </div>

            </div>
        `;

        openModal(html);
    };

    const renderServiceRow = (service) => {
        return `
            <div class="service-charge-row">
                <div>
                    <strong>${escapeHtml(service.name)}</strong>
                    <span>${escapeHtml(service.category || "General")}</span>
                </div>

                <strong>${formatCurrency(service.price)}</strong>
            </div>
        `;
    };

    const printInvoice = (invoiceId) => {
        const invoice = state.invoices.find(
            (item) => item.id === invoiceId
        );

        if (!invoice) return;

        const patient = getInvoicePatient(invoice);
        const clinicName =
            state.settings?.clinic?.name ||
            "AURA Clinic";

        const clinicAddress =
            state.settings?.clinic?.address ||
            "";

        const paid = getPaidAmount(invoice);
        const outstanding = getOutstandingAmount(invoice);

        const printWindow = window.open(
            "",
            "_blank",
            "width=800,height=900"
        );

        if (!printWindow) {
            notify(
                "warning",
                "Print Blocked",
                "Please allow pop-ups to print the invoice."
            );

            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(invoice.invoiceNumber)}</title>

                <style>
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        margin: 0;
                        padding: 32px;
                        font-family: Arial, sans-serif;
                        color: #111827;
                        background: #ffffff;
                    }

                    .invoice {
                        max-width: 760px;
                        margin: auto;
                    }

                    .header {
                        display: flex;
                        justify-content: space-between;
                        gap: 24px;
                        border-bottom: 2px solid #111827;
                        padding-bottom: 20px;
                        margin-bottom: 24px;
                    }

                    h1 {
                        margin: 0 0 8px;
                        font-size: 26px;
                    }

                    h2 {
                        margin: 0;
                        font-size: 20px;
                    }

                    p {
                        margin: 5px 0;
                    }

                    .muted {
                        color: #6b7280;
                    }

                    .meta {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px 24px;
                        margin-bottom: 24px;
                    }

                    .meta span {
                        display: block;
                        color: #6b7280;
                        font-size: 12px;
                    }

                    .meta strong {
                        display: block;
                        margin-top: 4px;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 16px;
                    }

                    th,
                    td {
                        padding: 10px 8px;
                        border-bottom: 1px solid #e5e7eb;
                        text-align: left;
                    }

                    th:last-child,
                    td:last-child {
                        text-align: right;
                    }

                    .totals {
                        width: 320px;
                        margin-left: auto;
                        margin-top: 24px;
                    }

                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 7px 0;
                    }

                    .grand-total {
                        font-size: 18px;
                        font-weight: bold;
                        border-top: 2px solid #111827;
                        margin-top: 8px;
                        padding-top: 12px;
                    }

                    .footer {
                        margin-top: 48px;
                        padding-top: 16px;
                        border-top: 1px solid #e5e7eb;
                        font-size: 12px;
                        color: #6b7280;
                    }

                    @media print {
                        body {
                            padding: 0;
                        }
                    }
                </style>
            </head>

            <body>
                <div class="invoice">

                    <div class="header">
                        <div>
                            <h1>${escapeHtml(clinicName)}</h1>
                            <p class="muted">${escapeHtml(clinicAddress)}</p>
                        </div>

                        <div style="text-align:right">
                            <h2>INVOICE</h2>
                            <p>${escapeHtml(invoice.invoiceNumber)}</p>
                            <p class="muted">${escapeHtml(formatDate(invoice.invoiceDate || invoice.createdAt))}</p>
                        </div>
                    </div>

                    <div class="meta">
                        <div>
                            <span>Patient</span>
                            <strong>${escapeHtml(getPatientName(patient))}</strong>
                        </div>

                        <div>
                            <span>UHID</span>
                            <strong>${escapeHtml(patient?.uhid || invoice.uhid || "—")}</strong>
                        </div>

                        <div>
                            <span>Phone</span>
                            <strong>${escapeHtml(patient?.phone || "—")}</strong>
                        </div>

                        <div>
                            <span>Created By</span>
                            <strong>${escapeHtml(invoice.createdByName || "—")}</strong>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                                <th>Amount</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${getInvoiceItems(invoice)
                                .map(
                                    (item) => `
                                        <tr>
                                            <td>${escapeHtml(item.serviceName || item.description || "Service")}</td>
                                            <td>${escapeHtml(item.quantity || 1)}</td>
                                            <td>${formatCurrency(item.unitPrice)}</td>
                                            <td>${formatCurrency(item.amount)}</td>
                                        </tr>
                                    `
                                )
                                .join("")}
                        </tbody>
                    </table>

                    <div class="totals">
                        <div class="total-row">
                            <span>Subtotal</span>
                            <strong>${formatCurrency(getInvoiceSubtotal(invoice))}</strong>
                        </div>

                        <div class="total-row">
                            <span>Discount</span>
                            <strong>${formatCurrency(getInvoiceDiscount(invoice))}</strong>
                        </div>

                        <div class="total-row">
                            <span>Tax</span>
                            <strong>${formatCurrency(getInvoiceTax(invoice))}</strong>
                        </div>

                        <div class="total-row grand-total">
                            <span>Total</span>
                            <strong>${formatCurrency(getInvoiceTotal(invoice))}</strong>
                        </div>

                        <div class="total-row">
                            <span>Paid</span>
                            <strong>${formatCurrency(paid)}</strong>
                        </div>

                        <div class="total-row">
                            <span>Balance Due</span>
                            <strong>${formatCurrency(outstanding)}</strong>
                        </div>
                    </div>

                    <div class="footer">
                        Thank you for choosing ${escapeHtml(clinicName)}.
                    </div>

                </div>

                <script>
                    window.onload = function () {
                        window.print();
                    };
                <\/script>
            </body>
            </html>
        `);

        printWindow.document.close();
    };

    const openModal = (html) => {
        closeModal();

        const overlay = document.createElement("div");

        overlay.id = "billing-module-modal";
        overlay.className = "modal-overlay is-open";

        overlay.innerHTML = `
            <div class="modal-dialog">
                ${html}
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeModal();
            }
        });

        overlay.querySelectorAll("[data-billing-modal-close]")
            .forEach((button) => {
                button.addEventListener("click", closeModal);
            });
    };

    const closeModal = () => {
        document.querySelector("#billing-module-modal")?.remove();
    };

    const refresh = async () => {
        await loadData();

        if (state.selectedInvoice) {
            const updatedInvoice = state.invoices.find(
                (invoice) =>
                    invoice.id === state.selectedInvoice.id
            );

            state.selectedInvoice = updatedInvoice || null;
        }

        render();

        notify(
            "success",
            "Billing Refreshed",
            "Billing and payment data has been updated."
        );
    };

    const handleExternalEvent = () => {
        if (!state.initialized) return;

        loadData().then(() => render());
    };

    const subscribeToEvents = () => {
        if (!EVENTS || typeof EVENTS.on !== "function") return;

        [
            "invoice:created",
            "invoice:updated",
            "payment:created",
            "patient:created",
            "patient:updated",
            "storage:changed"
        ].forEach((eventName) => {
            EVENTS.on(eventName, handleExternalEvent);
        });
    };

    const initialize = async () => {
        if (state.initialized) {
            await refresh();
            return;
        }

        await loadData();

        state.initialized = true;

        subscribeToEvents();

        render();
    };

    const getState = () => ({
        ...state,
        patients: [...state.patients],
        staff: [...state.staff],
        encounters: [...state.encounters],
        consultations: [...state.consultations],
        labOrders: [...state.labOrders],
        invoices: [...state.invoices],
        payments: [...state.payments],
        services: [...state.services]
    });

    const api = {
        name: MODULE_NAME,
        state,

        initialize,
        refresh,
        render,
        loadData,
        getState,

        getServices,
        getServiceByName,
        getServicePrice,

        getInvoiceTotal,
        getPaidAmount,
        getOutstandingAmount,
        getInvoiceStatus,

        openInvoiceForm,
        openInvoiceDetails,
        openPaymentModal,

        createInvoiceFromForm,
        recordPayment,

        printInvoice
    };

    window.AURA_BILLING = api;

    window.AURA = window.AURA || {};
    window.AURA.billing = api;

    if (window.AURA_APP?.registerModule) {
        window.AURA_APP.registerModule(MODULE_NAME, api);
    }

    if (window.AURA_EVENTS?.on) {
        window.AURA_EVENTS.on("route:changed", (route) => {
            if (route === "billing") {
                initialize();
            }
        });
    }

})(window, document);