/* ============================================================
   AURA CLINIC — DOCTOR MODULE
   File: frontend/js/modules/doctor.js
   Purpose:
   - Doctor consultation workspace
   - Assigned patient queue
   - Clinical history
   - Vitals review
   - Consultation notes
   - Diagnosis
   - Prescriptions
   - Laboratory orders
   - Encounter completion
============================================================ */

(function (window, document) {
    "use strict";

    const STORAGE = window.AURA_STORAGE;
    const EVENTS = window.AURA_EVENTS;
    const UTILS = window.AURA_UTILS;
    const APP = window.AURA_APP;

    const MODULE_NAME = "doctor";

    const STORE = {
        patients: "patients",
        queues: "queues",
        encounters: "encounters",
        vitals: "vitals",
        consultations: "consultations",
        prescriptions: "prescriptions",
        labOrders: "labOrders",
        staff: "staff"
    };

    const state = {
        patients: [],
        queues: [],
        encounters: [],
        vitals: [],
        consultations: [],
        prescriptions: [],
        labOrders: [],
        staff: [],

        currentDoctor: null,
        selectedQueue: null,
        selectedPatient: null,
        selectedEncounter: null,

        searchTerm: "",
        filter: "waiting",
        initialized: false,
        loading: false
    };

    const DOCTOR_STATUS = [
        "waiting",
        "called",
        "in-progress",
        "completed",
        "skipped"
    ];

    const consultationTypes = [
        "General Consultation",
        "Follow-up Consultation",
        "Pediatric Consultation",
        "Emergency Consultation",
        "Review Consultation"
    ];

    const labTests = [
        "Complete Blood Count",
        "Blood Glucose",
        "Liver Function Test",
        "Kidney Function Test",
        "Urine Routine",
        "Lipid Profile",
        "Thyroid Profile",
        "HbA1c",
        "Electrolytes",
        "Dengue NS1",
        "Malaria Test",
        "Chest X-Ray",
        "Ultrasound"
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

    const today = () => {
        return new Date().toISOString().slice(0, 10);
    };

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

    const getContainer = () => {
        return (
            document.querySelector('[data-route-view="doctor"]') ||
            document.querySelector("#app-content") ||
            document.querySelector("#app")
        );
    };

    const getActiveDoctor = () => {
        if (state.currentDoctor) return state.currentDoctor;

        const authUser =
            window.AURA_AUTH?.getState?.()?.user ||
            window.AURA_AUTH?.getUser?.() ||
            null;

        const staffId =
            authUser?.staffId ||
            authUser?.staff_id ||
            authUser?.id ||
            null;

        if (staffId) {
            state.currentDoctor =
                state.staff.find((staff) =>
                    staff.id === staffId ||
                    staff.staffId === staffId ||
                    staff.userId === staffId
                ) || null;
        }

        if (!state.currentDoctor) {
            state.currentDoctor =
                state.staff.find((staff) =>
                    ["doctor", "physician"].includes(
                        String(staff.role || "").toLowerCase()
                    )
                ) || null;
        }

        return state.currentDoctor;
    };

    const getDoctorName = () => {
        const doctor = getActiveDoctor();

        if (doctor) {
            return (
                doctor.name ||
                doctor.fullName ||
                [doctor.firstName, doctor.lastName]
                    .filter(Boolean)
                    .join(" ") ||
                "Doctor"
            );
        }

        return "Doctor";
    };

    const getDoctorId = () => {
        const doctor = getActiveDoctor();

        return doctor?.id || doctor?.staffId || doctor?.userId || null;
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

    const getPatientAge = (patient) => {
        if (!patient?.dateOfBirth) return "—";

        const dob = new Date(patient.dateOfBirth);
        const current = new Date();

        let age = current.getFullYear() - dob.getFullYear();

        const monthDifference =
            current.getMonth() - dob.getMonth();

        if (
            monthDifference < 0 ||
            (
                monthDifference === 0 &&
                current.getDate() < dob.getDate()
            )
        ) {
            age--;
        }

        return age >= 0 ? `${age} yrs` : "—";
    };

    const getPatientById = (patientId) => {
        return state.patients.find(
            (patient) => patient.id === patientId
        );
    };

    const getQueuePatient = (queue) => {
        if (!queue) return null;

        return (
            getPatientById(queue.patientId) ||
            state.patients.find(
                (patient) => patient.uhid === queue.uhid
            ) ||
            null
        );
    };

    const getQueueStatusLabel = (status) => {
        const labels = {
            waiting: "Waiting",
            called: "Called",
            "in-progress": "In Consultation",
            completed: "Completed",
            skipped: "Skipped"
        };

        return labels[status] || status || "Unknown";
    };

    const getStatusClass = (status) => {
        return String(status || "waiting")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
    };

    const getLatestVitals = (patientId) => {
        return state.vitals
            .filter((item) => item.patientId === patientId)
            .sort((a, b) =>
                new Date(b.recordedAt || b.createdAt || 0) -
                new Date(a.recordedAt || a.createdAt || 0)
            )[0] || null;
    };

    const getPatientEncounters = (patientId) => {
        return state.encounters
            .filter((encounter) => encounter.patientId === patientId)
            .sort((a, b) =>
                new Date(b.encounterDate || b.createdAt || 0) -
                new Date(a.encounterDate || a.createdAt || 0)
            );
    };

    const getPatientConsultations = (patientId) => {
        return state.consultations
            .filter((consultation) => consultation.patientId === patientId)
            .sort((a, b) =>
                new Date(b.consultationDate || b.createdAt || 0) -
                new Date(a.consultationDate || a.createdAt || 0)
            );
    };

    const getTodayQueues = () => {
        return state.queues.filter((queue) => {
            const queueDate =
                queue.queueDate ||
                queue.createdAt?.slice?.(0, 10) ||
                today();

            return queueDate === today();
        });
    };

    const getDoctorQueues = () => {
        const doctorId = getDoctorId();

        return getTodayQueues().filter((queue) => {
            if (!queue.assignedDoctorId && !queue.doctorId) {
                return true;
            }

            return (
                queue.assignedDoctorId === doctorId ||
                queue.doctorId === doctorId
            );
        });
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

        if (typeof window.dispatchEvent === "function") {
            window.dispatchEvent(
                new CustomEvent(`aura:${eventName}`, {
                    detail: payload
                })
            );
        }
    };

    const audit = async (action, details = {}) => {
        if (!STORAGE) return;

        try {
            await STORAGE.add?.("auditLogs", {
                id: createId("audit"),
                action,
                module: MODULE_NAME,
                actorId: getDoctorId(),
                actorName: getDoctorName(),
                details,
                createdAt: now()
            });
        } catch (error) {
            console.warn("Doctor audit log failed:", error);
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
                STORAGE.getAll(STORE.queues),
                STORAGE.getAll(STORE.encounters),
                STORAGE.getAll(STORE.vitals),
                STORAGE.getAll(STORE.consultations),
                STORAGE.getAll(STORE.prescriptions),
                STORAGE.getAll(STORE.labOrders),
                STORAGE.getAll(STORE.staff)
            ]);

            state.patients = results[0] || [];
            state.queues = results[1] || [];
            state.encounters = results[2] || [];
            state.vitals = results[3] || [];
            state.consultations = results[4] || [];
            state.prescriptions = results[5] || [];
            state.labOrders = results[6] || [];
            state.staff = results[7] || [];

            getActiveDoctor();

        } catch (error) {
            console.error("Failed to load doctor data:", error);
            notify(
                "error",
                "Loading Failed",
                "Doctor workspace data could not be loaded."
            );
        } finally {
            state.loading = false;
        }
    };

    const getFilteredQueues = () => {
        let queues = getDoctorQueues();

        if (state.filter !== "all") {
            queues = queues.filter(
                (queue) => queue.status === state.filter
            );
        }

        const search = state.searchTerm.trim().toLowerCase();

        if (search) {
            queues = queues.filter((queue) => {
                const patient = getQueuePatient(queue);

                const text = [
                    queue.token,
                    queue.uhid,
                    patient?.uhid,
                    getPatientName(patient),
                    patient?.phone,
                    queue.status
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return text.includes(search);
            });
        }

        return queues.sort((a, b) => {
            const priority = {
                waiting: 1,
                called: 2,
                "in-progress": 3,
                completed: 4,
                skipped: 5
            };

            const priorityDifference =
                (priority[a.status] || 99) -
                (priority[b.status] || 99);

            if (priorityDifference !== 0) {
                return priorityDifference;
            }

            return (
                new Date(a.createdAt || 0) -
                new Date(b.createdAt || 0)
            );
        });
    };

    const calculateStats = () => {
        const queues = getDoctorQueues();

        return {
            total: queues.length,
            waiting: queues.filter(
                (queue) => queue.status === "waiting"
            ).length,
            called: queues.filter(
                (queue) => queue.status === "called"
            ).length,
            inProgress: queues.filter(
                (queue) => queue.status === "in-progress"
            ).length,
            completed: queues.filter(
                (queue) => queue.status === "completed"
            ).length,
            skipped: queues.filter(
                (queue) => queue.status === "skipped"
            ).length
        };
    };

    const render = () => {
        const container = getContainer();

        if (!container) return;

        const stats = calculateStats();

        container.innerHTML = `
            <section class="doctor-workspace" aria-label="Doctor workspace">

                <header class="page-header doctor-page-header">
                    <div>
                        <div class="eyebrow">CLINICAL CARE</div>
                        <h1>Doctor Consultation</h1>
                        <p class="page-subtitle">
                            Review patients, record clinical findings, and complete consultations.
                        </p>
                    </div>

                    <div class="page-header-actions">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-doctor-action="refresh"
                        >
                            <span class="icon">↻</span>
                            Refresh
                        </button>
                    </div>
                </header>

                <section class="doctor-welcome-card">
                    <div class="doctor-welcome-content">
                        <span class="doctor-welcome-label">GOOD ${getGreeting()}</span>
                        <h2>Dr. ${escapeHtml(getDoctorName().replace(/^Dr\.?\s*/i, ""))}</h2>
                        <p>
                            Your consultation workspace is ready for today's patients.
                        </p>
                    </div>

                    <div class="doctor-welcome-meta">
                        <span>${formatDate(new Date())}</span>
                        <strong>${stats.inProgress} Active Consultation${stats.inProgress === 1 ? "" : "s"}</strong>
                    </div>
                </section>

                <section class="kpi-grid doctor-kpi-grid">
                    ${renderStatCard("Total Patients", stats.total, "calendar", "All patients")}
                    ${renderStatCard("Waiting", stats.waiting, "clock", "Awaiting consultation")}
                    ${renderStatCard("In Consultation", stats.inProgress, "activity", "Currently active")}
                    ${renderStatCard("Completed", stats.completed, "check", "Today's completed")}
                </section>

                <section class="doctor-main-grid">

                    <div class="doctor-queue-panel panel-card">
                        <div class="panel-header">
                            <div>
                                <h2>Consultation Queue</h2>
                                <p>Patients assigned to the doctor desk.</p>
                            </div>

                            <button
                                type="button"
                                class="btn btn-primary btn-sm"
                                data-doctor-action="call-next"
                            >
                                Call Next
                            </button>
                        </div>

                        <div class="doctor-queue-toolbar">
                            <label class="search-field">
                                <span class="search-icon">⌕</span>
                                <input
                                    type="search"
                                    id="doctor-queue-search"
                                    placeholder="Search patient, UHID, or token..."
                                    value="${escapeHtml(state.searchTerm)}"
                                >
                            </label>

                            <div class="segmented-control" role="tablist">
                                ${renderFilterButton("waiting", "Waiting")}
                                ${renderFilterButton("called", "Called")}
                                ${renderFilterButton("in-progress", "Active")}
                                ${renderFilterButton("completed", "Completed")}
                                ${renderFilterButton("all", "All")}
                            </div>
                        </div>

                        <div class="doctor-queue-list">
                            ${renderQueueList()}
                        </div>
                    </div>

                    <aside class="doctor-side-panel">

                        <div class="panel-card doctor-summary-panel">
                            <div class="panel-header">
                                <div>
                                    <h2>Today's Summary</h2>
                                    <p>Consultation activity</p>
                                </div>
                            </div>

                            ${renderSummaryRows(stats)}
                        </div>

                        <div class="panel-card doctor-quick-actions">
                            <div class="panel-header">
                                <div>
                                    <h2>Quick Actions</h2>
                                </div>
                            </div>

                            <div class="quick-action-list">
                                <button
                                    type="button"
                                    class="quick-action"
                                    data-doctor-action="open-patients"
                                >
                                    <span class="quick-action-icon">👥</span>
                                    <span>
                                        <strong>Patient Registry</strong>
                                        <small>Search patient records</small>
                                    </span>
                                    <span>›</span>
                                </button>

                                <button
                                    type="button"
                                    class="quick-action"
                                    data-doctor-action="open-laboratory"
                                >
                                    <span class="quick-action-icon">🧪</span>
                                    <span>
                                        <strong>Laboratory</strong>
                                        <small>Review lab reports</small>
                                    </span>
                                    <span>›</span>
                                </button>

                                <button
                                    type="button"
                                    class="quick-action"
                                    data-doctor-action="open-reports"
                                >
                                    <span class="quick-action-icon">📊</span>
                                    <span>
                                        <strong>Clinical Reports</strong>
                                        <small>View consultation activity</small>
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

    const getGreeting = () => {
        const hour = new Date().getHours();

        if (hour < 12) return "MORNING";
        if (hour < 17) return "AFTERNOON";
        return "EVENING";
    };

    const renderStatCard = (label, value, icon, description) => {
        return `
            <article class="kpi-card doctor-stat-card">
                <div class="kpi-card-top">
                    <span class="kpi-label">${escapeHtml(label)}</span>
                    <span class="kpi-icon">${getIcon(icon)}</span>
                </div>

                <div class="kpi-value">${escapeHtml(value)}</div>
                <div class="kpi-description">${escapeHtml(description)}</div>
            </article>
        `;
    };

    const getIcon = (name) => {
        const icons = {
            calendar: "▣",
            clock: "◷",
            activity: "⌁",
            check: "✓"
        };

        return icons[name] || "•";
    };

    const renderFilterButton = (value, label) => {
        const active =
            state.filter === value ? "is-active" : "";

        return `
            <button
                type="button"
                class="segmented-button ${active}"
                data-doctor-filter="${escapeHtml(value)}"
                role="tab"
                aria-selected="${state.filter === value}"
            >
                ${escapeHtml(label)}
            </button>
        `;
    };

    const renderQueueList = () => {
        const queues = getFilteredQueues();

        if (!queues.length) {
            return `
                <div class="empty-state doctor-empty-state">
                    <div class="empty-state-icon">✓</div>
                    <h3>No patients found</h3>
                    <p>
                        There are no patients matching the selected queue filter.
                    </p>
                </div>
            `;
        }

        return queues.map(renderQueueCard).join("");
    };

    const renderQueueCard = (queue) => {
        const patient = getQueuePatient(queue);

        const status = queue.status || "waiting";

        const isActive =
            state.selectedQueue?.id === queue.id;

        const displayToken =
            queue.token ||
            queue.tokenNumber ||
            "—";

        const patientName = getPatientName(patient);

        return `
            <article
                class="doctor-queue-item ${isActive ? "is-selected" : ""}"
                data-queue-id="${escapeHtml(queue.id)}"
            >
                <div class="doctor-queue-token">
                    <span class="token-label">TOKEN</span>
                    <strong>${escapeHtml(displayToken)}</strong>
                </div>

                <div class="doctor-queue-patient">
                    <div class="avatar avatar-sm">
                        ${escapeHtml(
                            patientName
                                .split(" ")
                                .map((part) => part.charAt(0))
                                .slice(0, 2)
                                .join("")
                                .toUpperCase()
                        )}
                    </div>

                    <div class="doctor-patient-summary">
                        <strong>${escapeHtml(patientName)}</strong>

                        <span>
                            ${escapeHtml(patient?.uhid || queue.uhid || "UHID unavailable")}
                        </span>

                        <small>
                            ${escapeHtml(patient?.gender || "—")}
                            ·
                            ${escapeHtml(getPatientAge(patient))}
                        </small>
                    </div>
                </div>

                <div class="doctor-queue-status">
                    <span class="status-badge status-${getStatusClass(status)}">
                        ${escapeHtml(getQueueStatusLabel(status))}
                    </span>
                </div>

                <div class="doctor-queue-actions">
                    ${renderQueueActions(queue)}
                </div>
            </article>
        `;
    };

    const renderQueueActions = (queue) => {
        const status = queue.status || "waiting";

        if (status === "waiting") {
            return `
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    data-doctor-queue-action="call"
                    data-queue-id="${escapeHtml(queue.id)}"
                >
                    Call
                </button>
            `;
        }

        if (status === "called") {
            return `
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    data-doctor-queue-action="start"
                    data-queue-id="${escapeHtml(queue.id)}"
                >
                    Start
                </button>
            `;
        }

        if (status === "in-progress") {
            return `
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    data-doctor-queue-action="consult"
                    data-queue-id="${escapeHtml(queue.id)}"
                >
                    Open
                </button>
            `;
        }

        if (status === "completed") {
            return `
                <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    data-doctor-queue-action="view"
                    data-queue-id="${escapeHtml(queue.id)}"
                >
                    View
                </button>
            `;
        }

        return `
            <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-doctor-queue-action="recall"
                data-queue-id="${escapeHtml(queue.id)}"
            >
                Recall
            </button>
        `;
    };

    const renderSummaryRows = (stats) => {
        return `
            <div class="summary-row">
                <span>Waiting for consultation</span>
                <strong>${stats.waiting}</strong>
            </div>

            <div class="summary-row">
                <span>Called patients</span>
                <strong>${stats.called}</strong>
            </div>

            <div class="summary-row">
                <span>Active consultations</span>
                <strong>${stats.inProgress}</strong>
            </div>

            <div class="summary-row">
                <span>Completed consultations</span>
                <strong>${stats.completed}</strong>
            </div>

            <div class="summary-row">
                <span>Skipped patients</span>
                <strong>${stats.skipped}</strong>
            </div>
        `;
    };

    const bindEvents = () => {
        const container = getContainer();

        if (!container) return;

        container.querySelectorAll("[data-doctor-filter]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    state.filter = button.dataset.doctorFilter || "waiting";
                    render();
                });
            });

        const searchInput =
            container.querySelector("#doctor-queue-search");

        searchInput?.addEventListener("input", (event) => {
            state.searchTerm = event.target.value || "";
            renderQueueOnly();
        });

        container.querySelectorAll("[data-doctor-queue-action]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    const action = button.dataset.doctorQueueAction;
                    const queueId = button.dataset.queueId;

                    handleQueueAction(action, queueId);
                });
            });

        container.querySelectorAll("[data-doctor-action]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    handleAction(button.dataset.doctorAction);
                });
            });

        container.querySelectorAll("[data-queue-id]")
            .forEach((item) => {
                item.addEventListener("click", (event) => {
                    if (
                        event.target.closest("button") ||
                        event.target.closest("a")
                    ) {
                        return;
                    }

                    const queueId = item.dataset.queueId;
                    openConsultation(queueId);
                });
            });
    };

    const renderQueueOnly = () => {
        const container = getContainer();

        if (!container) return;

        const list = container.querySelector(".doctor-queue-list");

        if (!list) return;

        list.innerHTML = renderQueueList();

        bindEvents();
    };

    const handleAction = (action) => {
        switch (action) {
            case "refresh":
                refresh();
                break;

            case "call-next":
                callNext();
                break;

            case "open-patients":
                navigateTo("patients");
                break;

            case "open-laboratory":
                navigateTo("laboratory");
                break;

            case "open-reports":
                navigateTo("reports");
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

    const findQueue = (queueId) => {
        return state.queues.find((queue) => queue.id === queueId);
    };

    const updateQueue = async (queueId, updates) => {
        const queue = findQueue(queueId);

        if (!queue || !STORAGE) return null;

        const updated = {
            ...queue,
            ...updates,
            updatedAt: now()
        };

        await STORAGE.put(STORE.queues, updated);

        const index = state.queues.findIndex(
            (item) => item.id === queueId
        );

        if (index !== -1) {
            state.queues[index] = updated;
        }

        return updated;
    };

    const handleQueueAction = async (action, queueId) => {
        switch (action) {
            case "call":
                await callPatient(queueId);
                break;

            case "start":
                await startConsultation(queueId);
                break;

            case "consult":
                openConsultation(queueId);
                break;

            case "view":
                openConsultation(queueId, true);
                break;

            case "recall":
                await recallPatient(queueId);
                break;

            default:
                break;
        }
    };

    const callPatient = async (queueId) => {
        const queue = findQueue(queueId);

        if (!queue) return;

        await updateQueue(queueId, {
            status: "called",
            calledAt: now(),
            stage: "doctor",
            assignedDoctorId: getDoctorId(),
            doctorId: getDoctorId()
        });

        emit("queue:called", {
            queueId,
            queue
        });

        await audit("Patient called for consultation", {
            queueId,
            token: queue.token,
            patientId: queue.patientId
        });

        announcePatient(queue);

        notify(
            "success",
            "Patient Called",
            `Token ${queue.token || "patient"} has been called.`
        );

        render();
    };

    const startConsultation = async (queueId) => {
        const queue = findQueue(queueId);

        if (!queue) return;

        const patient = getQueuePatient(queue);

        await updateQueue(queueId, {
            status: "in-progress",
            startedAt: now(),
            stage: "doctor",
            assignedDoctorId: getDoctorId(),
            doctorId: getDoctorId()
        });

        emit("doctor:consultation-started", {
            queueId,
            patientId: patient?.id,
            doctorId: getDoctorId()
        });

        await audit("Doctor consultation started", {
            queueId,
            patientId: patient?.id
        });

        openConsultation(queueId);
    };

    const recallPatient = async (queueId) => {
        const queue = findQueue(queueId);

        if (!queue) return;

        await updateQueue(queueId, {
            status: "called",
            recalledAt: now()
        });

        announcePatient(queue);

        notify(
            "success",
            "Patient Recalled",
            `Token ${queue.token || "patient"} has been recalled.`
        );

        render();
    };

    const callNext = async () => {
        const queues = getDoctorQueues();

        const nextPatient = queues.find(
            (queue) => queue.status === "waiting"
        );

        if (!nextPatient) {
            notify(
                "info",
                "Queue Empty",
                "There are no waiting patients in the doctor queue."
            );

            return;
        }

        await callPatient(nextPatient.id);
    };

    const announcePatient = (queue) => {
        if (!("speechSynthesis" in window)) return;

        const patient = getQueuePatient(queue);

        const token = queue.token || queue.tokenNumber || "";

        const patientName = getPatientName(patient);

        const text = `Token ${token}. ${patientName}, please proceed to the doctor consultation room.`;

        try {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            utterance.rate = 0.9;
            utterance.pitch = 1;
            utterance.volume = 1;

            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn("Voice announcement failed:", error);
        }
    };

    const openConsultation = async (queueId, readOnly = false) => {
        const queue = findQueue(queueId);

        if (!queue) return;

        const patient = getQueuePatient(queue);

        if (!patient) {
            notify(
                "error",
                "Patient Not Found",
                "The patient record linked to this queue entry could not be found."
            );

            return;
        }

        state.selectedQueue = queue;
        state.selectedPatient = patient;

        const encounters = getPatientEncounters(patient.id);

        state.selectedEncounter =
            encounters.find(
                (encounter) =>
                    encounter.id === queue.encounterId
            ) ||
            encounters.find(
                (encounter) =>
                    encounter.status === "open" ||
                    encounter.status === "in-progress"
            ) ||
            null;

        renderConsultationWorkspace(readOnly);
    };

    const renderConsultationWorkspace = (readOnly = false) => {
        const container = getContainer();

        if (!container || !state.selectedPatient) return;

        const patient = state.selectedPatient;
        const queue = state.selectedQueue;
        const vitals = getLatestVitals(patient.id);
        const encounters = getPatientEncounters(patient.id);
        const consultations = getPatientConsultations(patient.id);

        const consultation =
            consultations.find(
                (item) =>
                    item.encounterId === state.selectedEncounter?.id
            ) || {};

        container.innerHTML = `
            <section class="doctor-consultation-workspace">

                <header class="page-header">
                    <div>
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            data-doctor-consult-action="back"
                        >
                            ← Back to Queue
                        </button>

                        <div class="eyebrow">PATIENT CONSULTATION</div>
                        <h1>${escapeHtml(getPatientName(patient))}</h1>
                        <p class="page-subtitle">
                            ${escapeHtml(patient.uhid || "UHID unavailable")}
                            ·
                            ${escapeHtml(patient.gender || "—")}
                            ·
                            ${escapeHtml(getPatientAge(patient))}
                        </p>
                    </div>

                    <div class="page-header-actions">
                        <span class="status-badge status-${getStatusClass(queue?.status)}">
                            ${escapeHtml(getQueueStatusLabel(queue?.status))}
                        </span>
                    </div>
                </header>

                <section class="patient-identity-banner">
                    <div class="patient-identity-avatar">
                        ${escapeHtml(
                            getPatientName(patient)
                                .split(" ")
                                .map((part) => part.charAt(0))
                                .slice(0, 2)
                                .join("")
                                .toUpperCase()
                        )}
                    </div>

                    <div class="patient-identity-main">
                        <h2>${escapeHtml(getPatientName(patient))}</h2>
                        <div class="patient-identity-meta">
                            <span>UHID: ${escapeHtml(patient.uhid || "—")}</span>
                            <span>Phone: ${escapeHtml(patient.phone || "—")}</span>
                            <span>Blood Group: ${escapeHtml(patient.bloodGroup || "—")}</span>
                        </div>
                    </div>

                    <div class="patient-identity-actions">
                        <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            data-doctor-consult-action="patient-profile"
                        >
                            Patient Profile
                        </button>
                    </div>
                </section>

                <section class="doctor-consultation-grid">

                    <main class="doctor-consultation-main">

                        ${renderVitalsCard(vitals)}

                        ${renderClinicalForm(consultation, readOnly)}

                    </main>

                    <aside class="doctor-consultation-sidebar">

                        ${renderPatientHistory(encounters)}

                        ${renderPreviousConsultations(consultations)}

                    </aside>

                </section>

            </section>
        `;

        bindConsultationEvents(readOnly);
    };

    const renderVitalsCard = (vitals) => {
        return `
            <section class="panel-card clinical-vitals-card">
                <div class="panel-header">
                    <div>
                        <h2>Latest Vitals</h2>
                        <p>Recorded during pre-consultation.</p>
                    </div>

                    <span class="panel-header-note">
                        ${escapeHtml(formatDateTime(vitals?.recordedAt || vitals?.createdAt))}
                    </span>
                </div>

                ${
                    vitals
                        ? `
                            <div class="vitals-grid">
                                ${renderVital("Temperature", vitals.temperature, "°C")}
                                ${renderVital("Pulse", vitals.pulse, "bpm")}
                                ${renderVital("Respiratory Rate", vitals.respiratoryRate, "/min")}
                                ${renderVital("Blood Pressure", vitals.bloodPressure, "mmHg")}
                                ${renderVital("SpO₂", vitals.oxygenSaturation || vitals.spo2, "%")}
                                ${renderVital("Weight", vitals.weight, "kg")}
                                ${renderVital("Height", vitals.height, "cm")}
                                ${renderVital("BMI", vitals.bmi, "")}
                            </div>
                        `
                        : `
                            <div class="empty-inline">
                                No vitals have been recorded for this patient.
                            </div>
                        `
                }
            </section>
        `;
    };

    const renderVital = (label, value, unit) => {
        return `
            <div class="vital-item">
                <span class="vital-label">${escapeHtml(label)}</span>
                <strong class="vital-value">
                    ${escapeHtml(value ?? "—")}
                    <small>${escapeHtml(unit)}</small>
                </strong>
            </div>
        `;
    };

    const renderClinicalForm = (consultation, readOnly) => {
        const disabled = readOnly ? "disabled" : "";

        return `
            <section class="panel-card consultation-form-card">
                <div class="panel-header">
                    <div>
                        <h2>Clinical Consultation</h2>
                        <p>Record the clinical assessment and treatment plan.</p>
                    </div>

                    ${
                        readOnly
                            ? `<span class="status-badge status-completed">Read Only</span>`
                            : ""
                    }
                </div>

                <form id="doctor-consultation-form" novalidate>

                    <div class="form-section">
                        <h3>Visit Details</h3>

                        <div class="form-grid form-grid-2">

                            <label class="form-field">
                                <span>Consultation Type</span>
                                <select
                                    name="consultationType"
                                    ${disabled}
                                >
                                    ${consultationTypes
                                        .map(
                                            (type) => `
                                                <option
                                                    value="${escapeHtml(type)}"
                                                    ${
                                                        (
                                                            consultation.consultationType ||
                                                            "General Consultation"
                                                        ) === type
                                                            ? "selected"
                                                            : ""
                                                    }
                                                >
                                                    ${escapeHtml(type)}
                                                </option>
                                            `
                                        )
                                        .join("")}
                                </select>
                            </label>

                            <label class="form-field">
                                <span>Chief Complaint</span>
                                <input
                                    type="text"
                                    name="chiefComplaint"
                                    placeholder="Primary reason for visit"
                                    value="${escapeHtml(consultation.chiefComplaint || state.selectedPatient?.chiefComplaint || "")}"
                                    ${disabled}
                                >
                            </label>

                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Clinical Assessment</h3>

                        <div class="form-grid">

                            <label class="form-field">
                                <span>History of Present Illness</span>
                                <textarea
                                    name="historyOfPresentIllness"
                                    rows="4"
                                    placeholder="Describe symptoms, duration, progression, and relevant history..."
                                    ${disabled}
                                >${escapeHtml(consultation.historyOfPresentIllness || "")}</textarea>
                            </label>

                            <label class="form-field">
                                <span>Clinical Examination</span>
                                <textarea
                                    name="clinicalExamination"
                                    rows="4"
                                    placeholder="Record examination findings..."
                                    ${disabled}
                                >${escapeHtml(consultation.clinicalExamination || "")}</textarea>
                            </label>

                            <label class="form-field">
                                <span>Diagnosis</span>
                                <textarea
                                    name="diagnosis"
                                    rows="3"
                                    placeholder="Enter provisional or confirmed diagnosis..."
                                    ${disabled}
                                >${escapeHtml(consultation.diagnosis || "")}</textarea>
                            </label>

                            <label class="form-field">
                                <span>Doctor's Notes</span>
                                <textarea
                                    name="clinicalNotes"
                                    rows="4"
                                    placeholder="Additional clinical observations..."
                                    ${disabled}
                                >${escapeHtml(consultation.clinicalNotes || consultation.notes || "")}</textarea>
                            </label>

                        </div>
                    </div>

                    ${renderPrescriptionSection(consultation, readOnly)}

                    ${renderLabOrderSection(readOnly)}

                    <div class="consultation-form-footer">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-doctor-consult-action="back"
                        >
                            Cancel
                        </button>

                        ${
                            !readOnly
                                ? `
                                    <button
                                        type="submit"
                                        class="btn btn-primary"
                                    >
                                        Save Consultation
                                    </button>

                                    <button
                                        type="button"
                                        class="btn btn-success"
                                        data-doctor-consult-action="complete"
                                    >
                                        Complete Consultation
                                    </button>
                                `
                                : ""
                        }
                    </div>

                </form>
            </section>
        `;
    };

    const renderPrescriptionSection = (consultation, readOnly) => {
        const prescriptions = state.prescriptions.filter(
            (item) =>
                item.patientId === state.selectedPatient?.id &&
                (
                    item.encounterId === state.selectedEncounter?.id ||
                    !state.selectedEncounter
                )
        );

        const disabled = readOnly ? "disabled" : "";

        return `
            <div class="form-section prescription-section">
                <div class="section-heading-row">
                    <div>
                        <h3>Prescription</h3>
                        <p>Add medications and instructions.</p>
                    </div>

                    ${
                        !readOnly
                            ? `
                                <button
                                    type="button"
                                    class="btn btn-secondary btn-sm"
                                    data-doctor-consult-action="add-prescription"
                                >
                                    + Add Medicine
                                </button>
                            `
                            : ""
                    }
                </div>

                <div id="prescription-list">
                    ${
                        prescriptions.length
                            ? prescriptions
                                .map(renderPrescriptionItem)
                                .join("")
                            : `
                                <div class="empty-inline">
                                    No medicines added yet.
                                </div>
                            `
                    }
                </div>

                ${
                    !readOnly
                        ? `
                            <div class="prescription-editor">
                                <div class="form-grid form-grid-2">
                                    <label class="form-field">
                                        <span>Medicine</span>
                                        <input
                                            type="text"
                                            name="medicineName"
                                            placeholder="e.g. Paracetamol 500 mg"
                                            ${disabled}
                                        >
                                    </label>

                                    <label class="form-field">
                                        <span>Dosage</span>
                                        <input
                                            type="text"
                                            name="medicineDosage"
                                            placeholder="e.g. 1 tablet"
                                            ${disabled}
                                        >
                                    </label>

                                    <label class="form-field">
                                        <span>Frequency</span>
                                        <select
                                            name="medicineFrequency"
                                            ${disabled}
                                        >
                                            <option value="">Select frequency</option>
                                            <option value="Once daily">Once daily</option>
                                            <option value="Twice daily">Twice daily</option>
                                            <option value="Three times daily">Three times daily</option>
                                            <option value="Four times daily">Four times daily</option>
                                            <option value="As needed">As needed</option>
                                        </select>
                                    </label>

                                    <label class="form-field">
                                        <span>Duration</span>
                                        <input
                                            type="text"
                                            name="medicineDuration"
                                            placeholder="e.g. 5 days"
                                            ${disabled}
                                        >
                                    </label>
                                </div>

                                <label class="form-field">
                                    <span>Instructions</span>
                                    <input
                                        type="text"
                                        name="medicineInstructions"
                                        placeholder="e.g. After food"
                                        ${disabled}
                                    >
                                </label>
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    };

    const renderPrescriptionItem = (prescription) => {
        return `
            <div class="prescription-item">
                <div class="prescription-medicine">
                    <strong>${escapeHtml(prescription.medicineName || prescription.name || "Medicine")}</strong>
                    <span>
                        ${escapeHtml(prescription.dosage || "—")}
                        ·
                        ${escapeHtml(prescription.frequency || "—")}
                        ·
                        ${escapeHtml(prescription.duration || "—")}
                    </span>
                </div>

                <div class="prescription-instructions">
                    ${escapeHtml(prescription.instructions || "No instructions")}
                </div>

                ${
                    !prescription.readOnly
                        ? `
                            <button
                                type="button"
                                class="btn btn-ghost btn-sm"
                                data-doctor-prescription-remove="${escapeHtml(prescription.id)}"
                            >
                                Remove
                            </button>
                        `
                        : ""
                }
            </div>
        `;
    };

    const renderLabOrderSection = (readOnly) => {
        const orders = state.labOrders.filter(
            (order) =>
                order.patientId === state.selectedPatient?.id &&
                (
                    order.encounterId === state.selectedEncounter?.id ||
                    !state.selectedEncounter
                )
        );

        return `
            <div class="form-section lab-order-section">
                <div class="section-heading-row">
                    <div>
                        <h3>Laboratory & Diagnostics</h3>
                        <p>Order investigations for this encounter.</p>
                    </div>

                    ${
                        !readOnly
                            ? `
                                <button
                                    type="button"
                                    class="btn btn-secondary btn-sm"
                                    data-doctor-consult-action="add-lab-order"
                                >
                                    + Add Investigation
                                </button>
                            `
                            : ""
                    }
                </div>

                <div id="lab-order-list">
                    ${
                        orders.length
                            ? orders.map(renderLabOrderItem).join("")
                            : `
                                <div class="empty-inline">
                                    No laboratory orders for this consultation.
                                </div>
                            `
                    }
                </div>

                ${
                    !readOnly
                        ? `
                            <div class="lab-order-editor">
                                <div class="form-grid form-grid-2">
                                    <label class="form-field">
                                        <span>Investigation</span>
                                        <select name="labTestName">
                                            <option value="">Select investigation</option>
                                            ${labTests
                                                .map(
                                                    (test) => `
                                                        <option value="${escapeHtml(test)}">
                                                            ${escapeHtml(test)}
                                                        </option>
                                                    `
                                                )
                                                .join("")}
                                        </select>
                                    </label>

                                    <label class="form-field">
                                        <span>Priority</span>
                                        <select name="labPriority">
                                            <option value="routine">Routine</option>
                                            <option value="urgent">Urgent</option>
                                            <option value="stat">STAT</option>
                                        </select>
                                    </label>
                                </div>

                                <label class="form-field">
                                    <span>Clinical Indication</span>
                                    <textarea
                                        name="labClinicalIndication"
                                        rows="2"
                                        placeholder="Reason for ordering this investigation..."
                                    ></textarea>
                                </label>
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    };

    const renderLabOrderItem = (order) => {
        return `
            <div class="lab-order-item">
                <div>
                    <strong>${escapeHtml(order.testName || order.name || "Investigation")}</strong>
                    <span>${escapeHtml(order.priority || "routine")}</span>
                </div>

                <small>
                    Status: ${escapeHtml(order.status || "ordered")}
                </small>
            </div>
        `;
    };

    const renderPatientHistory = (encounters) => {
        return `
            <section class="panel-card patient-history-panel">
                <div class="panel-header">
                    <div>
                        <h2>Clinical History</h2>
                        <p>Previous encounters</p>
                    </div>
                </div>

                ${
                    encounters.length
                        ? `
                            <div class="history-timeline">
                                ${encounters
                                    .slice(0, 6)
                                    .map(renderHistoryItem)
                                    .join("")}
                            </div>
                        `
                        : `
                            <div class="empty-inline">
                                No previous encounters found.
                            </div>
                        `
                }
            </section>
        `;
    };

    const renderHistoryItem = (encounter) => {
        return `
            <div class="history-item">
                <div class="history-marker"></div>

                <div class="history-content">
                    <strong>
                        ${escapeHtml(
                            encounter.diagnosis ||
                            encounter.chiefComplaint ||
                            "Clinical Encounter"
                        )}
                    </strong>

                    <span>
                        ${escapeHtml(
                            formatDate(
                                encounter.encounterDate ||
                                encounter.createdAt
                            )
                        )}
                    </span>

                    <small>
                        ${escapeHtml(encounter.doctorName || "Doctor")}
                    </small>
                </div>
            </div>
        `;
    };

    const renderPreviousConsultations = (consultations) => {
        return `
            <section class="panel-card previous-consultations-panel">
                <div class="panel-header">
                    <div>
                        <h2>Previous Consultations</h2>
                        <p>Recent clinical notes</p>
                    </div>
                </div>

                ${
                    consultations.length
                        ? `
                            <div class="previous-consultation-list">
                                ${consultations
                                    .slice(0, 5)
                                    .map(renderPreviousConsultation)
                                    .join("")}
                            </div>
                        `
                        : `
                            <div class="empty-inline">
                                No previous consultation notes found.
                            </div>
                        `
                }
            </section>
        `;
    };

    const renderPreviousConsultation = (consultation) => {
        return `
            <article class="previous-consultation-item">
                <div class="previous-consultation-header">
                    <strong>
                        ${escapeHtml(
                            consultation.diagnosis ||
                            consultation.chiefComplaint ||
                            "Consultation"
                        )}
                    </strong>

                    <span>
                        ${escapeHtml(
                            formatDate(
                                consultation.consultationDate ||
                                consultation.createdAt
                            )
                        )}
                    </span>
                </div>

                <p>
                    ${escapeHtml(
                        consultation.clinicalNotes ||
                        consultation.notes ||
                        "No notes recorded."
                    )}
                </p>
            </article>
        `;
    };

    const bindConsultationEvents = (readOnly) => {
        const container = getContainer();

        if (!container) return;

        container.querySelectorAll("[data-doctor-consult-action]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    handleConsultationAction(
                        button.dataset.doctorConsultAction
                    );
                });
            });

        container.querySelectorAll("[data-doctor-prescription-remove]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    removePrescription(
                        button.dataset.doctorPrescriptionRemove
                    );
                });
            });

        const form = container.querySelector(
            "#doctor-consultation-form"
        );

        form?.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!readOnly) {
                await saveConsultation(false);
            }
        });
    };

    const handleConsultationAction = (action) => {
        switch (action) {
            case "back":
                state.selectedQueue = null;
                state.selectedPatient = null;
                state.selectedEncounter = null;
                render();
                break;

            case "patient-profile":
                openPatientProfile();
                break;

            case "add-prescription":
                addPrescription();
                break;

            case "add-lab-order":
                addLabOrder();
                break;

            case "complete":
                saveConsultation(true);
                break;

            default:
                break;
        }
    };

    const getFormData = () => {
        const form = document.querySelector(
            "#doctor-consultation-form"
        );

        if (!form) return {};

        const data = new FormData(form);

        return Object.fromEntries(data.entries());
    };

    const ensureEncounter = async (formData) => {
        if (state.selectedEncounter) {
            return state.selectedEncounter;
        }

        const encounter = {
            id: createId("encounter"),
            patientId: state.selectedPatient.id,
            uhid: state.selectedPatient.uhid || "",
            queueId: state.selectedQueue?.id || null,
            doctorId: getDoctorId(),
            doctorName: getDoctorName(),
            encounterDate: now(),
            status: "in-progress",
            chiefComplaint: formData.chiefComplaint || "",
            createdAt: now(),
            updatedAt: now()
        };

        await STORAGE.add(STORE.encounters, encounter);

        state.encounters.push(encounter);
        state.selectedEncounter = encounter;

        emit("encounter:created", encounter);

        return encounter;
    };

    const saveConsultation = async (complete = false) => {
        if (!STORAGE || !state.selectedPatient) return;

        const formData = getFormData();

        if (!formData.chiefComplaint?.trim() && !formData.diagnosis?.trim()) {
            notify(
                "warning",
                "Clinical Details Required",
                "Please enter at least the chief complaint or diagnosis."
            );

            return;
        }

        try {
            const encounter = await ensureEncounter(formData);

            const existing = state.consultations.find(
                (item) =>
                    item.encounterId === encounter.id
            );

            const consultation = {
                ...(existing || {}),
                id: existing?.id || createId("consultation"),
                patientId: state.selectedPatient.id,
                uhid: state.selectedPatient.uhid || "",
                encounterId: encounter.id,
                queueId: state.selectedQueue?.id || null,
                doctorId: getDoctorId(),
                doctorName: getDoctorName(),
                consultationType:
                    formData.consultationType ||
                    "General Consultation",
                chiefComplaint: formData.chiefComplaint || "",
                historyOfPresentIllness:
                    formData.historyOfPresentIllness || "",
                clinicalExamination:
                    formData.clinicalExamination || "",
                diagnosis: formData.diagnosis || "",
                clinicalNotes: formData.clinicalNotes || "",
                notes: formData.clinicalNotes || "",
                consultationDate:
                    existing?.consultationDate || now(),
                status: complete ? "completed" : "in-progress",
                createdAt: existing?.createdAt || now(),
                updatedAt: now()
            };

            if (existing) {
                await STORAGE.put(STORE.consultations, consultation);

                const index = state.consultations.findIndex(
                    (item) => item.id === existing.id
                );

                if (index !== -1) {
                    state.consultations[index] = consultation;
                }
            } else {
                await STORAGE.add(STORE.consultations, consultation);
                state.consultations.push(consultation);
            }

            await STORAGE.put(STORE.encounters, {
                ...encounter,
                status: complete ? "completed" : "in-progress",
                diagnosis: formData.diagnosis || "",
                chiefComplaint: formData.chiefComplaint || "",
                updatedAt: now()
            });

            const encounterIndex = state.encounters.findIndex(
                (item) => item.id === encounter.id
            );

            if (encounterIndex !== -1) {
                state.encounters[encounterIndex] = {
                    ...state.encounters[encounterIndex],
                    ...encounter,
                    status: complete ? "completed" : "in-progress",
                    diagnosis: formData.diagnosis || "",
                    chiefComplaint: formData.chiefComplaint || "",
                    updatedAt: now()
                };
            }

            emit(
                complete
                    ? "consultation:completed"
                    : "consultation:saved",
                consultation
            );

            await audit(
                complete
                    ? "Consultation completed"
                    : "Consultation saved",
                {
                    consultationId: consultation.id,
                    encounterId: encounter.id,
                    patientId: state.selectedPatient.id
                }
            );

            if (complete) {
                await completeQueue();
            }

            notify(
                "success",
                complete ? "Consultation Completed" : "Consultation Saved",
                complete
                    ? "The patient encounter has been completed successfully."
                    : "Clinical consultation details have been saved."
            );

            if (complete) {
                state.selectedQueue = null;
                state.selectedPatient = null;
                state.selectedEncounter = null;
                render();
            } else {
                state.selectedEncounter = {
                    ...encounter,
                    status: "in-progress"
                };

                notify(
                    "info",
                    "Draft Saved",
                    "You can continue editing this consultation."
                );
            }

        } catch (error) {
            console.error("Failed to save consultation:", error);

            notify(
                "error",
                "Save Failed",
                "The consultation could not be saved."
            );
        }
    };

    const completeQueue = async () => {
        if (!state.selectedQueue) return;

        const queue = await updateQueue(
            state.selectedQueue.id,
            {
                status: "completed",
                completedAt: now(),
                stage: "completed",
                nextStage: null
            }
        );

        emit("queue:completed", {
            queueId: queue?.id,
            patientId: state.selectedPatient?.id
        });
    };

    const addPrescription = async () => {
        if (!STORAGE || !state.selectedPatient) return;

        const formData = getFormData();

        const medicineName =
            formData.medicineName?.trim();

        if (!medicineName) {
            notify(
                "warning",
                "Medicine Required",
                "Enter a medicine name before adding a prescription."
            );

            return;
        }

        try {
            const prescription = {
                id: createId("prescription"),
                patientId: state.selectedPatient.id,
                uhid: state.selectedPatient.uhid || "",
                encounterId: state.selectedEncounter?.id || null,
                queueId: state.selectedQueue?.id || null,
                doctorId: getDoctorId(),
                doctorName: getDoctorName(),
                medicineName,
                dosage: formData.medicineDosage || "",
                frequency: formData.medicineFrequency || "",
                duration: formData.medicineDuration || "",
                instructions: formData.medicineInstructions || "",
                status: "active",
                createdAt: now(),
                updatedAt: now()
            };

            await STORAGE.add(
                STORE.prescriptions,
                prescription
            );

            state.prescriptions.push(prescription);

            emit("prescription:created", prescription);

            await audit("Prescription created", {
                prescriptionId: prescription.id,
                patientId: state.selectedPatient.id,
                medicineName
            });

            notify(
                "success",
                "Medicine Added",
                `${medicineName} has been added to the prescription.`
            );

            renderConsultationWorkspace(false);

        } catch (error) {
            console.error("Failed to add prescription:", error);

            notify(
                "error",
                "Prescription Failed",
                "The medicine could not be added."
            );
        }
    };

    const removePrescription = async (prescriptionId) => {
        if (!STORAGE) return;

        const prescription = state.prescriptions.find(
            (item) => item.id === prescriptionId
        );

        if (!prescription) return;

        try {
            await STORAGE.remove(
                STORE.prescriptions,
                prescriptionId
            );

            state.prescriptions = state.prescriptions.filter(
                (item) => item.id !== prescriptionId
            );

            emit("prescription:deleted", {
                prescriptionId,
                patientId: state.selectedPatient?.id
            });

            await audit("Prescription removed", {
                prescriptionId,
                patientId: state.selectedPatient?.id
            });

            notify(
                "success",
                "Medicine Removed",
                "The prescription item has been removed."
            );

            renderConsultationWorkspace(false);

        } catch (error) {
            console.error("Failed to remove prescription:", error);

            notify(
                "error",
                "Removal Failed",
                "The prescription item could not be removed."
            );
        }
    };

    const addLabOrder = async () => {
        if (!STORAGE || !state.selectedPatient) return;

        const formData = getFormData();

        const testName = formData.labTestName?.trim();

        if (!testName) {
            notify(
                "warning",
                "Investigation Required",
                "Select a laboratory investigation."
            );

            return;
        }

        try {
            const labOrder = {
                id: createId("lab"),
                orderNumber: generateLabOrderNumber(),
                patientId: state.selectedPatient.id,
                uhid: state.selectedPatient.uhid || "",
                encounterId: state.selectedEncounter?.id || null,
                queueId: state.selectedQueue?.id || null,
                orderedBy: getDoctorId(),
                doctorId: getDoctorId(),
                doctorName: getDoctorName(),
                testName,
                priority: formData.labPriority || "routine",
                clinicalIndication:
                    formData.labClinicalIndication || "",
                status: "ordered",
                orderDate: now(),
                createdAt: now(),
                updatedAt: now()
            };

            await STORAGE.add(
                STORE.labOrders,
                labOrder
            );

            state.labOrders.push(labOrder);

            emit("lab:order-created", labOrder);

            await audit("Laboratory order created", {
                labOrderId: labOrder.id,
                patientId: state.selectedPatient.id,
                testName
            });

            notify(
                "success",
                "Investigation Ordered",
                `${testName} has been sent to the laboratory.`
            );

            renderConsultationWorkspace(false);

        } catch (error) {
            console.error("Failed to create lab order:", error);

            notify(
                "error",
                "Lab Order Failed",
                "The investigation could not be ordered."
            );
        }
    };

    const generateLabOrderNumber = () => {
        const prefix = "LAB";

        const datePart = today().replace(/-/g, "");

        const count = state.labOrders.filter(
            (order) =>
                order.createdAt?.slice?.(0, 10) === today()
        ).length + 1;

        return `${prefix}-${datePart}-${String(count).padStart(4, "0")}`;
    };

    const openPatientProfile = () => {
        const patient = state.selectedPatient;

        if (!patient) return;

        const profileHtml = `
            <div class="modal-content doctor-patient-profile-modal">

                <div class="modal-header">
                    <div>
                        <div class="eyebrow">PATIENT PROFILE</div>
                        <h2>${escapeHtml(getPatientName(patient))}</h2>
                    </div>

                    <button
                        type="button"
                        class="modal-close"
                        data-doctor-modal-close
                    >
                        ×
                    </button>
                </div>

                <div class="profile-summary-grid">
                    <div>
                        <span>UHID</span>
                        <strong>${escapeHtml(patient.uhid || "—")}</strong>
                    </div>

                    <div>
                        <span>Gender</span>
                        <strong>${escapeHtml(patient.gender || "—")}</strong>
                    </div>

                    <div>
                        <span>Date of Birth</span>
                        <strong>${escapeHtml(formatDate(patient.dateOfBirth))}</strong>
                    </div>

                    <div>
                        <span>Phone</span>
                        <strong>${escapeHtml(patient.phone || "—")}</strong>
                    </div>

                    <div>
                        <span>Blood Group</span>
                        <strong>${escapeHtml(patient.bloodGroup || "—")}</strong>
                    </div>

                    <div>
                        <span>Emergency Contact</span>
                        <strong>${escapeHtml(patient.emergencyContact?.phone || patient.emergencyPhone || "—")}</strong>
                    </div>
                </div>

                <div class="profile-detail-section">
                    <h3>Allergies</h3>
                    <p>${escapeHtml(patient.allergies || "No known allergies recorded.")}</p>
                </div>

                <div class="profile-detail-section">
                    <h3>Medical Notes</h3>
                    <p>${escapeHtml(patient.medicalNotes || "No medical notes recorded.")}</p>
                </div>

                <div class="modal-footer">
                    <button
                        type="button"
                        class="btn btn-primary"
                        data-doctor-modal-close
                    >
                        Close
                    </button>
                </div>

            </div>
        `;

        openModal(profileHtml);
    };

    const openModal = (html) => {
        const existing = document.querySelector(
            "#doctor-module-modal"
        );

        existing?.remove();

        const overlay = document.createElement("div");

        overlay.id = "doctor-module-modal";
        overlay.className = "modal-overlay is-open";

        overlay.innerHTML = `
            <div class="modal-dialog">
                ${html}
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelectorAll("[data-doctor-modal-close]")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    overlay.remove();
                });
            });

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                overlay.remove();
            }
        });
    };

    const refresh = async () => {
        await loadData();

        if (state.selectedPatient) {
            renderConsultationWorkspace(false);
        } else {
            render();
        }

        notify(
            "success",
            "Workspace Refreshed",
            "Doctor consultation data has been updated."
        );
    };

    const handleExternalEvent = () => {
        if (!state.initialized) return;

        loadData().then(() => {
            if (state.selectedPatient) {
                renderConsultationWorkspace(false);
            } else {
                render();
            }
        });
    };

    const subscribeToEvents = () => {
        if (!EVENTS || typeof EVENTS.on !== "function") return;

        const events = [
            "patient:created",
            "patient:updated",
            "queue:created",
            "queue:called",
            "queue:completed",
            "vitals:recorded",
            "consultation:saved",
            "consultation:completed",
            "prescription:created",
            "lab:order-created",
            "storage:changed"
        ];

        events.forEach((eventName) => {
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
        queues: [...state.queues],
        encounters: [...state.encounters],
        vitals: [...state.vitals],
        consultations: [...state.consultations],
        prescriptions: [...state.prescriptions],
        labOrders: [...state.labOrders],
        staff: [...state.staff]
    });

    const api = {
        name: MODULE_NAME,
        state,

        initialize,
        refresh,
        render,

        loadData,
        getState,

        getDoctor: getActiveDoctor,
        getDoctorName,
        getDoctorId,

        getDoctorQueues,
        getFilteredQueues,

        callNext,
        callPatient,
        startConsultation,
        recallPatient,

        openConsultation,
        saveConsultation,

        addPrescription,
        removePrescription,

        addLabOrder,

        completeQueue
    };

    window.AURA_DOCTOR = api;

    window.AURA = window.AURA || {};
    window.AURA.doctor = api;

    if (window.AURA_APP?.registerModule) {
        window.AURA_APP.registerModule(MODULE_NAME, api);
    }

    if (window.AURA_EVENTS?.on) {
        window.AURA_EVENTS.on("route:changed", (route) => {
            if (route === "doctor") {
                initialize();
            }
        });
    }

})(window, document);