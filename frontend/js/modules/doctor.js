(function () {
    "use strict";

    /*
     * =========================================================
     * AURA CLINIC — DOCTOR CONSULTATION MODULE
     * =========================================================
     *
     * Workflow:
     *
     * Reception
     *    ↓
     * Nursing / Pre-consultation
     *    ↓
     * Doctor Consultation
     *    ↓
     * Laboratory / Pharmacy / Billing
     *
     * This module manages:
     * - Doctor consultation queue
     * - Patient clinical summary
     * - Chief complaint
     * - History and examination notes
     * - Diagnosis
     * - Prescriptions
     * - Laboratory orders
     * - Consultation completion
     * - Encounter updates
     */

    const MODULE_NAME = "doctor";

    const STORAGE = window.AURA_STORAGE || window.AURA?.storage;
    const EVENTS = window.AURA_EVENTS || window.AURA?.events;
    const UTILS = window.AURA_UTILS || window.AURA?.utils;

    const APP = window.AURA_APP || window.AURA?.app;

    const STORE = {
        patients: "patients",
        staff: "staff",
        queues: "queues",
        encounters: "encounters",
        vitals: "vitals",
        consultations: "consultations",
        prescriptions: "prescriptions",
        labOrders: "labOrders",
        settings: "settings",
        auditLogs: "auditLogs"
    };

    const state = {
        initialized: false,
        loading: false,

        patients: [],
        staff: [],
        queues: [],
        encounters: [],
        vitals: [],
        consultations: [],
        prescriptions: [],
        labOrders: [],

        selectedQueue: null,
        selectedPatient: null,
        selectedEncounter: null,

        filters: {
            search: "",
            status: "all",
            doctorId: ""
        },

        activeTab: "waiting",

        unsubscribe: []
    };


    /* =========================================================
       BASIC HELPERS
    ========================================================= */

    function escapeHtml(value) {
        if (UTILS && typeof UTILS.escapeHtml === "function") {
            return UTILS.escapeHtml(value);
        }

        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }


    function createId(prefix) {
        if (UTILS && typeof UTILS.createId === "function") {
            return UTILS.createId(prefix);
        }

        return (
            prefix +
            "_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 8)
        );
    }


    function now() {
        return new Date().toISOString();
    }


    function formatDate(value, includeTime) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            ...(includeTime
                ? {
                    hour: "2-digit",
                    minute: "2-digit"
                }
                : {})
        }).format(date);
    }


    function formatDateTime(value) {
        return formatDate(value, true);
    }


    function getPatientName(patient) {
        if (!patient) return "Unknown Patient";

        return [
            patient.firstName,
            patient.middleName,
            patient.lastName
        ]
            .filter(Boolean)
            .join(" ") || patient.name || "Unknown Patient";
    }


    function getPatientAge(patient) {
        if (!patient || !patient.dateOfBirth) {
            return "—";
        }

        const dob = new Date(patient.dateOfBirth);
        const today = new Date();

        let age = today.getFullYear() - dob.getFullYear();

        const monthDifference = today.getMonth() - dob.getMonth();

        if (
            monthDifference < 0 ||
            (
                monthDifference === 0 &&
                today.getDate() < dob.getDate()
            )
        ) {
            age--;
        }

        return `${Math.max(0, age)} yrs`;
    }


    function getInitials(name) {
        return String(name || "P")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");
    }


    function getContainer() {
        return (
            document.querySelector('[data-route-view="doctor"]') ||
            document.getElementById("app-content") ||
            document.getElementById("route-container") ||
            document.getElementById("app")
        );
    }


    function showToast(message, type) {
        if (APP && typeof APP.toast === "function") {
            APP.toast({
                type: type || "info",
                title: type === "error" ? "Error" : "AURA Clinic",
                message
            });
            return;
        }

        if (
            window.AURA &&
            typeof window.AURA.toast === "function"
        ) {
            window.AURA.toast(message, type);
            return;
        }

        console.log(`[AURA Clinic] ${message}`);
    }


    function emit(eventName, detail) {
        if (EVENTS && typeof EVENTS.emit === "function") {
            EVENTS.emit(eventName, detail || {});
        }

        document.dispatchEvent(
            new CustomEvent(`aura:${eventName}`, {
                detail: detail || {}
            })
        );
    }


    function audit(action, entity, entityId, details) {
        const record = {
            id: createId("audit"),
            action,
            entity,
            entityId: entityId || null,
            details: details || {},
            createdAt: now()
        };

        if (
            STORAGE &&
            typeof STORAGE.add === "function"
        ) {
            STORAGE.add(STORE.auditLogs, record).catch(() => {});
        }
    }


    function getCurrentDoctor() {
        const user =
            window.AURA_AUTH?.getState?.()?.user ||
            window.AURA_APP?.getCurrentUser?.() ||
            null;

        if (user) {
            return user;
        }

        return state.staff.find(member =>
            member.role === "doctor" &&
            member.status !== "inactive"
        ) || null;
    }


    /* =========================================================
       DATA ACCESS
    ========================================================= */

    async function loadData() {
        if (!STORAGE) {
            console.warn("[AURA Doctor] Storage unavailable.");
            return;
        }

        state.loading = true;

        try {
            const [
                patients,
                staff,
                queues,
                encounters,
                vitals,
                consultations,
                prescriptions,
                labOrders
            ] = await Promise.all([
                STORAGE.getAll(STORE.patients),
                STORAGE.getAll(STORE.staff),
                STORAGE.getAll(STORE.queues),
                STORAGE.getAll(STORE.encounters),
                STORAGE.getAll(STORE.vitals),
                STORAGE.getAll(STORE.consultations),
                STORAGE.getAll(STORE.prescriptions),
                STORAGE.getAll(STORE.labOrders)
            ]);

            state.patients = patients || [];
            state.staff = staff || [];
            state.queues = queues || [];
            state.encounters = encounters || [];
            state.vitals = vitals || [];
            state.consultations = consultations || [];
            state.prescriptions = prescriptions || [];
            state.labOrders = labOrders || [];

        } catch (error) {
            console.error("[AURA Doctor] Failed to load data:", error);
            showToast("Unable to load doctor consultation data.", "error");
        } finally {
            state.loading = false;
        }
    }


    async function getPatientById(patientId) {
        return (
            state.patients.find(patient => patient.id === patientId) ||
            null
        );
    }


    function getQueuePatient(queue) {
        if (!queue) return null;

        return (
            state.patients.find(
                patient => patient.id === queue.patientId
            ) || null
        );
    }


    function getPatientVitals(patientId, encounterId) {
        const records = state.vitals
            .filter(vital => vital.patientId === patientId)
            .filter(vital => {
                if (!encounterId) return true;

                return vital.encounterId === encounterId;
            })
            .sort(
                (a, b) =>
                    new Date(b.createdAt || 0) -
                    new Date(a.createdAt || 0)
            );

        return records[0] || null;
    }


    function getPatientEncounters(patientId) {
        return state.encounters
            .filter(encounter => encounter.patientId === patientId)
            .sort(
                (a, b) =>
                    new Date(b.createdAt || 0) -
                    new Date(a.createdAt || 0)
            );
    }


    function getConsultationsForPatient(patientId) {
        return state.consultations
            .filter(item => item.patientId === patientId)
            .sort(
                (a, b) =>
                    new Date(b.createdAt || 0) -
                    new Date(a.createdAt || 0)
            );
    }


    function getPrescriptionsForEncounter(encounterId) {
        return state.prescriptions.filter(
            prescription => prescription.encounterId === encounterId
        );
    }


    function getLabOrdersForEncounter(encounterId) {
        return state.labOrders.filter(
            order => order.encounterId === encounterId
        );
    }


    /* =========================================================
       QUEUE LOGIC
    ========================================================= */

    function getDoctorQueues() {
        return state.queues
            .filter(queue => {
                const stage = String(queue.stage || "").toLowerCase();
                const status = String(queue.status || "").toLowerCase();

                return (
                    stage === "doctor" ||
                    stage === "doctor-consultation" ||
                    stage === "consultation" ||
                    queue.nextStage === "doctor-consultation" ||
                    (
                        status === "waiting" &&
                        queue.department &&
                        String(queue.department).toLowerCase().includes("doctor")
                    )
                );
            })
            .sort(
                (a, b) =>
                    new Date(a.createdAt || 0) -
                    new Date(b.createdAt || 0)
            );
    }


    function getWaitingQueues() {
        return getDoctorQueues().filter(queue => {
            const status = String(queue.status || "").toLowerCase();

            return (
                status === "waiting" ||
                status === "queued" ||
                status === "pending"
            );
        });
    }


    function getCalledQueues() {
        return getDoctorQueues().filter(queue => {
            const status = String(queue.status || "").toLowerCase();

            return (
                status === "called" ||
                status === "in-progress"
            );
        });
    }


    function getCompletedQueues() {
        return getDoctorQueues().filter(queue => {
            const status = String(queue.status || "").toLowerCase();

            return (
                status === "completed" ||
                status === "consulted"
            );
        });
    }


    async function updateQueue(queueId, changes) {
        const queue = state.queues.find(item => item.id === queueId);

        if (!queue || !STORAGE) {
            return null;
        }

        const updated = {
            ...queue,
            ...changes,
            updatedAt: now()
        };

        const saved = await STORAGE.put(STORE.queues, updated);

        const index = state.queues.findIndex(item => item.id === queueId);

        if (index !== -1) {
            state.queues[index] = saved || updated;
        }

        emit("queue:updated", {
            queue: saved || updated
        });

        return saved || updated;
    }


    async function callPatient(queueId) {
        const queue = state.queues.find(item => item.id === queueId);

        if (!queue) return;

        const updated = await updateQueue(queueId, {
            status: "called",
            stage: "doctor-consultation",
            calledAt: now()
        });

        audit(
            "queue-called",
            "queue",
            queueId,
            {
                token: queue.token,
                patientId: queue.patientId
            }
        );

        emit("queue:called", {
            queue: updated
        });

        showToast("Patient called for consultation.", "success");
        render();
    }


    async function startConsultation(queueId) {
        const queue = state.queues.find(item => item.id === queueId);

        if (!queue) return;

        const patient = getQueuePatient(queue);

        if (!patient) {
            showToast("Patient record could not be found.", "error");
            return;
        }

        const encounter = await getOrCreateEncounter(
            patient.id,
            queue.id
        );

        await updateQueue(queueId, {
            status: "in-progress",
            stage: "doctor-consultation",
            consultationStartedAt: now(),
            encounterId: encounter.id
        });

        state.selectedQueue = queueId;
        state.selectedPatient = patient.id;
        state.selectedEncounter = encounter.id;

        audit(
            "consultation-started",
            "encounter",
            encounter.id,
            {
                patientId: patient.id,
                queueId
            }
        );

        emit("doctor:consultation-started", {
            patient,
            encounter
        });

        render();
    }


    async function completeConsultation(queueId, encounterId) {
        const queue = state.queues.find(item => item.id === queueId);

        if (!queue) return;

        await updateQueue(queueId, {
            status: "completed",
            stage: "completed",
            nextStage: "billing",
            consultationCompletedAt: now()
        });

        if (encounterId && STORAGE) {
            const encounter = state.encounters.find(
                item => item.id === encounterId
            );

            if (encounter) {
                const updatedEncounter = {
                    ...encounter,
                    status: "completed",
                    completedAt: now(),
                    updatedAt: now()
                };

                await STORAGE.put(
                    STORE.encounters,
                    updatedEncounter
                );

                const index = state.encounters.findIndex(
                    item => item.id === encounterId
                );

                if (index !== -1) {
                    state.encounters[index] = updatedEncounter;
                }
            }
        }

        audit(
            "consultation-completed",
            "encounter",
            encounterId,
            {
                patientId: queue.patientId,
                queueId
            }
        );

        emit("doctor:consultation-completed", {
            patientId: queue.patientId,
            queueId,
            encounterId
        });

        showToast(
            "Consultation completed successfully.",
            "success"
        );

        state.selectedQueue = null;
        state.selectedPatient = null;
        state.selectedEncounter = null;

        render();
    }


    /* =========================================================
       ENCOUNTER LOGIC
    ========================================================= */

    async function getOrCreateEncounter(patientId, queueId) {
        let encounter = state.encounters.find(item => {
            return (
                item.patientId === patientId &&
                (
                    item.queueId === queueId ||
                    item.status === "active" ||
                    item.status === "in-progress"
                )
            );
        });

        if (encounter) {
            return encounter;
        }

        encounter = {
            id: createId("encounter"),
            patientId,
            queueId,
            encounterType: "outpatient",
            department: "General Medicine",
            status: "active",
            consultationDate: now(),
            createdAt: now(),
            updatedAt: now()
        };

        if (STORAGE) {
            await STORAGE.add(STORE.encounters, encounter);
        }

        state.encounters.push(encounter);

        emit("encounter:created", {
            encounter
        });

        return encounter;
    }


    async function saveEncounterDetails(encounterId, data) {
        if (!STORAGE) return null;

        const encounter = state.encounters.find(
            item => item.id === encounterId
        );

        if (!encounter) return null;

        const updated = {
            ...encounter,
            ...data,
            updatedAt: now()
        };

        await STORAGE.put(STORE.encounters, updated);

        const index = state.encounters.findIndex(
            item => item.id === encounterId
        );

        if (index !== -1) {
            state.encounters[index] = updated;
        }

        emit("encounter:updated", {
            encounter: updated
        });

        return updated;
    }


    /* =========================================================
       CONSULTATION LOGIC
    ========================================================= */

    async function saveConsultation(event) {
        event.preventDefault();

        const form = event.target;
        const patient = state.patients.find(
            item => item.id === state.selectedPatient
        );

        const encounter = state.encounters.find(
            item => item.id === state.selectedEncounter
        );

        if (!patient || !encounter) {
            showToast(
                "Select a patient and start a consultation first.",
                "error"
            );
            return;
        }

        const data = new FormData(form);

        const consultation = {
            id: createId("consultation"),
            patientId: patient.id,
            encounterId: encounter.id,
            queueId: state.selectedQueue,

            doctorId: data.get("doctorId") || null,

            chiefComplaint: data.get("chiefComplaint") || "",
            historyOfPresentIllness: data.get("historyOfPresentIllness") || "",
            examinationNotes: data.get("examinationNotes") || "",
            diagnosis: data.get("diagnosis") || "",
            clinicalNotes: data.get("clinicalNotes") || "",

            followUpAdvice: data.get("followUpAdvice") || "",
            followUpDate: data.get("followUpDate") || "",

            status: "completed",
            consultationDate: now(),
            createdAt: now(),
            updatedAt: now()
        };

        if (
            !consultation.chiefComplaint &&
            !consultation.diagnosis &&
            !consultation.clinicalNotes
        ) {
            showToast(
                "Please enter at least the chief complaint or diagnosis.",
                "error"
            );
            return;
        }

        try {
            await STORAGE.add(
                STORE.consultations,
                consultation
            );

            state.consultations.push(consultation);

            await saveEncounterDetails(
                encounter.id,
                {
                    chiefComplaint: consultation.chiefComplaint,
                    diagnosis: consultation.diagnosis,
                    clinicalNotes: consultation.clinicalNotes,
                    doctorId: consultation.doctorId,
                    consultationId: consultation.id,
                    status: "in-progress"
                }
            );

            audit(
                "consultation-recorded",
                "consultation",
                consultation.id,
                {
                    patientId: patient.id,
                    encounterId: encounter.id
                }
            );

            emit("consultation:completed", {
                consultation
            });

            showToast(
                "Consultation notes saved.",
                "success"
            );

            render();

        } catch (error) {
            console.error(
                "[AURA Doctor] Consultation save failed:",
                error
            );

            showToast(
                "Unable to save consultation notes.",
                "error"
            );
        }
    }


    /* =========================================================
       PRESCRIPTION LOGIC
    ========================================================= */

    function getPrescriptionRows() {
        return Array.from(
            document.querySelectorAll(
                "#doctor-prescription-editor .prescription-row"
            )
        );
    }


    function collectPrescriptionData() {
        return getPrescriptionRows()
            .map(row => {
                return {
                    medicineName:
                        row.querySelector(
                            '[name="medicineName"]'
                        )?.value?.trim() || "",

                    dosage:
                        row.querySelector(
                            '[name="dosage"]'
                        )?.value?.trim() || "",

                    frequency:
                        row.querySelector(
                            '[name="frequency"]'
                        )?.value?.trim() || "",

                    duration:
                        row.querySelector(
                            '[name="duration"]'
                        )?.value?.trim() || "",

                    route:
                        row.querySelector(
                            '[name="route"]'
                        )?.value?.trim() || "Oral",

                    instructions:
                        row.querySelector(
                            '[name="instructions"]'
                        )?.value?.trim() || ""
                };
            })
            .filter(item => item.medicineName);
    }


    async function savePrescription(event) {
        event.preventDefault();

        if (!STORAGE) return;

        const form = event.target;

        const patient = state.patients.find(
            item => item.id === state.selectedPatient
        );

        const encounter = state.encounters.find(
            item => item.id === state.selectedEncounter
        );

        if (!patient || !encounter) {
            showToast(
                "Start a consultation before prescribing medicines.",
                "error"
            );
            return;
        }

        const medicines = collectPrescriptionData();

        if (!medicines.length) {
            showToast(
                "Add at least one medicine.",
                "error"
            );
            return;
        }

        const data = new FormData(form);

        const prescription = {
            id: createId("prescription"),
            patientId: patient.id,
            encounterId: encounter.id,
            consultationId: data.get("consultationId") || null,
            doctorId: data.get("doctorId") || null,

            medicines,

            notes: data.get("prescriptionNotes") || "",
            status: "active",

            prescribedAt: now(),
            createdAt: now(),
            updatedAt: now()
        };

        try {
            await STORAGE.add(
                STORE.prescriptions,
                prescription
            );

            state.prescriptions.push(prescription);

            audit(
                "prescription-created",
                "prescription",
                prescription.id,
                {
                    patientId: patient.id,
                    encounterId: encounter.id,
                    medicineCount: medicines.length
                }
            );

            emit("prescription:created", {
                prescription
            });

            showToast(
                "Prescription saved successfully.",
                "success"
            );

            form.reset();
            render();

        } catch (error) {
            console.error(
                "[AURA Doctor] Prescription save failed:",
                error
            );

            showToast(
                "Unable to save prescription.",
                "error"
            );
        }
    }


    function addPrescriptionRow() {
        const editor = document.getElementById(
            "doctor-prescription-editor"
        );

        if (!editor) return;

        const rows = editor.querySelector(
            ".prescription-rows"
        );

        if (!rows) return;

        rows.insertAdjacentHTML(
            "beforeend",
            prescriptionRowTemplate()
        );

        bindPrescriptionRowEvents();
    }


    function removePrescriptionRow(button) {
        const row = button.closest(".prescription-row");

        if (!row) return;

        const rows = document.querySelectorAll(
            "#doctor-prescription-editor .prescription-row"
        );

        if (rows.length <= 1) {
            row.querySelectorAll("input").forEach(input => {
                input.value = "";
            });

            row.querySelectorAll("select").forEach(select => {
                select.selectedIndex = 0;
            });

            return;
        }

        row.remove();
    }


    function bindPrescriptionRowEvents() {
        document
            .querySelectorAll(
                "[data-action='remove-prescription-row']"
            )
            .forEach(button => {
                button.onclick = () => removePrescriptionRow(button);
            });

        document
            .querySelectorAll(
                "[data-action='add-prescription-row']"
            )
            .forEach(button => {
                button.onclick = addPrescriptionRow;
            });
    }


    /* =========================================================
       LAB ORDER LOGIC
    ========================================================= */

    async function saveLabOrder(event) {
        event.preventDefault();

        if (!STORAGE) return;

        const patient = state.patients.find(
            item => item.id === state.selectedPatient
        );

        const encounter = state.encounters.find(
            item => item.id === state.selectedEncounter
        );

        if (!patient || !encounter) {
            showToast(
                "Start a consultation before ordering tests.",
                "error"
            );
            return;
        }

        const form = event.target;
        const data = new FormData(form);

        const testName = data.get("testName")?.trim();

        if (!testName) {
            showToast(
                "Enter a laboratory or diagnostic test.",
                "error"
            );
            return;
        }

        const order = {
            id: createId("laborder"),
            patientId: patient.id,
            encounterId: encounter.id,
            doctorId: data.get("doctorId") || null,

            testName,
            category: data.get("category") || "Laboratory",
            priority: data.get("priority") || "routine",
            clinicalNotes: data.get("clinicalNotes") || "",

            status: "ordered",
            orderedAt: now(),
            createdAt: now(),
            updatedAt: now()
        };

        try {
            await STORAGE.add(
                STORE.labOrders,
                order
            );

            state.labOrders.push(order);

            audit(
                "lab-order-created",
                "labOrder",
                order.id,
                {
                    patientId: patient.id,
                    encounterId: encounter.id,
                    testName
                }
            );

            emit("lab:order-created", {
                order
            });

            showToast(
                "Laboratory order created.",
                "success"
            );

            form.reset();
            render();

        } catch (error) {
            console.error(
                "[AURA Doctor] Lab order failed:",
                error
            );

            showToast(
                "Unable to create laboratory order.",
                "error"
            );
        }
    }


    /* =========================================================
       RENDERING
    ========================================================= */

    function render() {
        const container = getContainer();

        if (!container) {
            return;
        }

        if (state.selectedPatient) {
            renderConsultationWorkspace(container);
        } else {
            renderDoctorDesk(container);
        }

        bindEvents();
    }


    function renderDoctorDesk(container) {
        const waiting = getWaitingQueues();
        const called = getCalledQueues();
        const completed = getCompletedQueues();

        container.innerHTML = `
            <div
                class="doctor-workspace"
                data-route-view="doctor"
            >

                ${renderPageHeader()}

                <section class="doctor-kpi-grid">

                    ${kpiCard(
                        "Waiting",
                        waiting.length,
                        "Patients awaiting consultation",
                        "waiting"
                    )}

                    ${kpiCard(
                        "In consultation",
                        called.length,
                        "Currently being attended",
                        "active"
                    )}

                    ${kpiCard(
                        "Completed today",
                        completed.length,
                        "Consultations completed",
                        "completed"
                    )}

                    ${kpiCard(
                        "Total patients",
                        state.patients.length,
                        "Registered clinic patients",
                        "patients"
                    )}

                </section>


                <section class="doctor-toolbar-panel">

                    <div class="doctor-tabs">

                        <button
                            type="button"
                            class="doctor-tab ${state.activeTab === "waiting" ? "active" : ""}"
                            data-doctor-tab="waiting"
                        >
                            Waiting
                            <span>${waiting.length}</span>
                        </button>

                        <button
                            type="button"
                            class="doctor-tab ${state.activeTab === "active" ? "active" : ""}"
                            data-doctor-tab="active"
                        >
                            In Consultation
                            <span>${called.length}</span>
                        </button>

                        <button
                            type="button"
                            class="doctor-tab ${state.activeTab === "completed" ? "active" : ""}"
                            data-doctor-tab="completed"
                        >
                            Completed
                            <span>${completed.length}</span>
                        </button>

                    </div>


                    <div class="doctor-toolbar-actions">

                        <div class="doctor-search-box">

                            <span aria-hidden="true">⌕</span>

                            <input
                                type="search"
                                id="doctor-patient-search"
                                placeholder="Search patient or UHID..."
                                value="${escapeHtml(state.filters.search)}"
                            >

                        </div>

                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-action="refresh-doctor"
                        >
                            ↻ Refresh
                        </button>

                    </div>

                </section>


                <section class="doctor-main-grid">

                    <div class="doctor-queue-panel">

                        <div class="section-heading">

                            <div>
                                <span class="eyebrow">CLINICAL QUEUE</span>
                                <h2>${getTabTitle()}</h2>
                            </div>

                            <span class="section-count">
                                ${getVisibleQueues().length}
                            </span>

                        </div>

                        <div class="doctor-queue-list">

                            ${renderQueueList()}

                        </div>

                    </div>


                    <aside class="doctor-side-panel">

                        ${renderDoctorSummary()}

                    </aside>

                </section>

            </div>
        `;
    }


    function renderPageHeader() {
        return `
            <header class="workspace-page-header">

                <div>
                    <span class="eyebrow">CLINICAL WORKSPACE</span>

                    <h1>Doctor Consultation</h1>

                    <p>
                        Review patients, document clinical findings,
                        prescribe medicines, and order diagnostics.
                    </p>
                </div>

                <div class="workspace-header-actions">

                    <button
                        type="button"
                        class="btn btn-primary"
                        data-action="call-next-patient"
                    >
                        Call Next Patient
                    </button>

                </div>

            </header>
        `;
    }


    function kpiCard(label, value, description, type) {
        return `
            <article class="doctor-kpi-card doctor-kpi-${type}">

                <div class="doctor-kpi-top">
                    <span>${escapeHtml(label)}</span>
                    <span class="doctor-kpi-icon" aria-hidden="true">
                        ${type === "waiting" ? "◷" :
                            type === "active" ? "♡" :
                            type === "completed" ? "✓" : "◉"}
                    </span>
                </div>

                <strong class="doctor-kpi-value">
                    ${escapeHtml(value)}
                </strong>

                <small>
                    ${escapeHtml(description)}
                </small>

            </article>
        `;
    }


    function getTabTitle() {
        if (state.activeTab === "active") {
            return "Patients in Consultation";
        }

        if (state.activeTab === "completed") {
            return "Completed Consultations";
        }

        return "Waiting for Doctor";
    }


    function getVisibleQueues() {
        let queues = [];

        if (state.activeTab === "active") {
            queues = getCalledQueues();
        } else if (state.activeTab === "completed") {
            queues = getCompletedQueues();
        } else {
            queues = getWaitingQueues();
        }

        const search = state.filters.search.trim().toLowerCase();

        if (!search) {
            return queues;
        }

        return queues.filter(queue => {
            const patient = getQueuePatient(queue);

            const name = getPatientName(patient).toLowerCase();
            const uhid = String(patient?.uhid || "").toLowerCase();
            const token = String(queue.token || "").toLowerCase();

            return (
                name.includes(search) ||
                uhid.includes(search) ||
                token.includes(search)
            );
        });
    }


    function renderQueueList() {
        const queues = getVisibleQueues();

        if (!queues.length) {
            return `
                <div class="empty-state doctor-empty-state">

                    <div class="empty-state-icon">✓</div>

                    <strong>
                        No patients in this queue
                    </strong>

                    <span>
                        Patients will appear here when they are ready
                        for doctor consultation.
                    </span>

                </div>
            `;
        }

        return queues.map(renderQueueCard).join("");
    }


    function renderQueueCard(queue) {
        const patient = getQueuePatient(queue);

        const status = String(
            queue.status || "waiting"
        ).toLowerCase();

        const patientName = getPatientName(patient);

        const actionLabel =
            status === "waiting" || status === "queued"
                ? "Start Consultation"
                : status === "called" || status === "in-progress"
                    ? "Continue Consultation"
                    : "View Record";

        return `
            <article class="doctor-queue-card">

                <div class="doctor-queue-card-top">

                    <div class="doctor-patient-identity">

                        <div class="avatar avatar-md">
                            ${escapeHtml(getInitials(patientName))}
                        </div>

                        <div>

                            <strong>
                                ${escapeHtml(patientName)}
                            </strong>

                            <span>
                                UHID: ${escapeHtml(patient?.uhid || "—")}
                            </span>

                        </div>

                    </div>

                    <span class="queue-token-badge">
                        ${escapeHtml(queue.token || "—")}
                    </span>

                </div>


                <div class="doctor-patient-meta">

                    <span>
                        ${escapeHtml(patient?.gender || "—")}
                    </span>

                    <span>
                        ${escapeHtml(getPatientAge(patient))}
                    </span>

                    <span>
                        ${escapeHtml(patient?.phone || "No phone")}
                    </span>

                </div>


                <div class="doctor-queue-card-footer">

                    <div class="queue-status-line">
                        <span class="status-dot ${getStatusClass(status)}"></span>
                        <span>${escapeHtml(formatQueueStatus(status))}</span>
                    </div>

                    <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        data-action="open-consultation"
                        data-queue-id="${escapeHtml(queue.id)}"
                    >
                        ${actionLabel}
                    </button>

                </div>

            </article>
        `;
    }


    function getStatusClass(status) {
        if (
            status === "completed" ||
            status === "consulted"
        ) {
            return "status-dot-success";
        }

        if (
            status === "called" ||
            status === "in-progress"
        ) {
            return "status-dot-info";
        }

        return "status-dot-warning";
    }


    function formatQueueStatus(status) {
        const labels = {
            waiting: "Waiting",
            queued: "Queued",
            pending: "Pending",
            called: "Called",
            "in-progress": "In Consultation",
            completed: "Completed",
            consulted: "Completed"
        };

        return labels[status] || status;
    }


    function renderDoctorSummary() {
        const doctor = getCurrentDoctor();

        const waiting = getWaitingQueues();
        const active = getCalledQueues();

        return `
            <div class="doctor-summary-card">

                <div class="section-heading compact">
                    <div>
                        <span class="eyebrow">TODAY</span>
                        <h3>Consultation Summary</h3>
                    </div>
                </div>

                <div class="doctor-summary-stat">
                    <span>Waiting patients</span>
                    <strong>${waiting.length}</strong>
                </div>

                <div class="doctor-summary-stat">
                    <span>Active consultations</span>
                    <strong>${active.length}</strong>
                </div>

                <div class="doctor-summary-stat">
                    <span>Completed consultations</span>
                    <strong>${getCompletedQueues().length}</strong>
                </div>

                <div class="doctor-summary-divider"></div>

                <div class="doctor-profile-mini">

                    <div class="avatar avatar-md">
                        ${escapeHtml(
                            getInitials(
                                doctor?.name ||
                                doctor?.fullName ||
                                "Doctor"
                            )
                        )}
                    </div>

                    <div>
                        <strong>
                            ${escapeHtml(
                                doctor?.name ||
                                doctor?.fullName ||
                                "Doctor Workspace"
                            )}
                        </strong>

                        <span>
                            ${escapeHtml(
                                doctor?.specialization ||
                                "Clinical Consultation"
                            )}
                        </span>
                    </div>

                </div>

            </div>


            <div class="doctor-guidance-card">

                <span class="eyebrow">WORKFLOW</span>

                <h3>Clinical workflow</h3>

                <ol>
                    <li>Review patient summary and vitals.</li>
                    <li>Document consultation findings.</li>
                    <li>Record diagnosis and treatment plan.</li>
                    <li>Order laboratory or diagnostic tests.</li>
                    <li>Prescribe medicines and complete encounter.</li>
                </ol>

            </div>
        `;
    }


    /* =========================================================
       CONSULTATION WORKSPACE
    ========================================================= */

    function renderConsultationWorkspace(container) {
        const patient = state.patients.find(
            item => item.id === state.selectedPatient
        );

        const encounter = state.encounters.find(
            item => item.id === state.selectedEncounter
        );

        if (!patient || !encounter) {
            state.selectedPatient = null;
            state.selectedEncounter = null;
            render();
            return;
        }

        const vitals = getPatientVitals(
            patient.id,
            encounter.id
        );

        const history = getPatientEncounters(patient.id);

        const consultations = getConsultationsForPatient(
            patient.id
        );

        const prescriptions = getPrescriptionsForEncounter(
            encounter.id
        );

        const labOrders = getLabOrdersForEncounter(
            encounter.id
        );

        container.innerHTML = `
            <div
                class="doctor-workspace doctor-consultation-workspace"
                data-route-view="doctor"
            >

                <header class="workspace-page-header">

                    <div>

                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            data-action="back-to-doctor-desk"
                        >
                            ← Back to Doctor Desk
                        </button>

                        <span class="eyebrow">ACTIVE ENCOUNTER</span>

                        <h1>Patient Consultation</h1>

                        <p>
                            Document the current clinical encounter
                            for ${escapeHtml(getPatientName(patient))}.
                        </p>

                    </div>

                    <div class="workspace-header-actions">

                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-action="print-consultation"
                        >
                            Print Summary
                        </button>

                        <button
                            type="button"
                            class="btn btn-success"
                            data-action="complete-consultation"
                            data-queue-id="${escapeHtml(
                                state.selectedQueue || ""
                            )}"
                            data-encounter-id="${escapeHtml(
                                encounter.id
                            )}"
                        >
                            Complete Encounter
                        </button>

                    </div>

                </header>


                <section class="doctor-patient-banner">

                    <div class="doctor-patient-identity large">

                        <div class="avatar avatar-lg">
                            ${escapeHtml(
                                getInitials(
                                    getPatientName(patient)
                                )
                            )}
                        </div>

                        <div>

                            <span class="eyebrow">
                                PATIENT
                            </span>

                            <h2>
                                ${escapeHtml(
                                    getPatientName(patient)
                                )}
                            </h2>

                            <div class="doctor-patient-meta">

                                <span>
                                    UHID:
                                    ${escapeHtml(
                                        patient.uhid || "—"
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        patient.gender || "—"
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        getPatientAge(patient)
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        patient.phone || "—"
                                    )}
                                </span>

                            </div>

                        </div>

                    </div>

                    <div class="doctor-encounter-meta">

                        <span>Encounter ID</span>

                        <strong>
                            ${escapeHtml(encounter.id)}
                        </strong>

                        <small>
                            ${formatDateTime(
                                encounter.createdAt
                            )}
                        </small>

                    </div>

                </section>


                <div class="doctor-consultation-grid">

                    <main class="doctor-clinical-main">

                        ${renderVitalsCard(vitals)}

                        ${renderConsultationForm(
                            patient,
                            encounter,
                            consultations
                        )}

                        ${renderPrescriptionEditor(
                            patient,
                            encounter,
                            prescriptions
                        )}

                        ${renderLabOrderEditor(
                            patient,
                            encounter,
                            labOrders
                        )}

                    </main>


                    <aside class="doctor-clinical-sidebar">

                        ${renderMedicalHistory(
                            patient,
                            history
                        )}

                        ${renderPreviousConsultations(
                            consultations
                        )}

                        ${renderPatientAlerts(patient)}

                    </aside>

                </div>

            </div>
        `;
    }


    function renderVitalsCard(vitals) {
        if (!vitals) {
            return `
                <section class="clinical-card">

                    <div class="section-heading compact">

                        <div>
                            <span class="eyebrow">PRE-CONSULTATION</span>
                            <h3>Latest Vitals</h3>
                        </div>

                    </div>

                    <div class="empty-state compact">
                        <strong>No vitals recorded</strong>
                        <span>
                            Nursing staff have not yet recorded vitals
                            for this encounter.
                        </span>
                    </div>

                </section>
            `;
        }

        return `
            <section class="clinical-card">

                <div class="section-heading compact">

                    <div>
                        <span class="eyebrow">PRE-CONSULTATION</span>
                        <h3>Latest Vitals</h3>
                    </div>

                    <span class="clinical-card-date">
                        ${formatDateTime(vitals.createdAt)}
                    </span>

                </div>


                <div class="vitals-grid">

                    ${vitalItem(
                        "Temperature",
                        vitals.temperature
                            ? `${vitals.temperature} °C`
                            : "—"
                    )}

                    ${vitalItem(
                        "Pulse",
                        vitals.pulse
                            ? `${vitals.pulse} bpm`
                            : "—"
                    )}

                    ${vitalItem(
                        "Blood Pressure",
                        vitals.bloodPressure || "—"
                    )}

                    ${vitalItem(
                        "SpO₂",
                        vitals.spo2
                            ? `${vitals.spo2}%`
                            : "—"
                    )}

                    ${vitalItem(
                        "Respiratory Rate",
                        vitals.respiratoryRate
                            ? `${vitals.respiratoryRate}/min`
                            : "—"
                    )}

                    ${vitalItem(
                        "Weight",
                        vitals.weight
                            ? `${vitals.weight} kg`
                            : "—"
                    )}

                    ${vitalItem(
                        "Height",
                        vitals.height
                            ? `${vitals.height} cm`
                            : "—"
                    )}

                    ${vitalItem(
                        "BMI",
                        vitals.bmi || "—"
                    )}

                </div>

            </section>
        `;
    }


    function vitalItem(label, value) {
        return `
            <div class="vital-item">

                <span>${escapeHtml(label)}</span>

                <strong>${escapeHtml(value)}</strong>

            </div>
        `;
    }


    function renderConsultationForm(
        patient,
        encounter,
        consultations
    ) {
        const latest = consultations[0] || {};

        const doctor = getCurrentDoctor();

        return `
            <section class="clinical-card">

                <div class="section-heading">

                    <div>
                        <span class="eyebrow">CONSULTATION</span>
                        <h3>Clinical Notes</h3>
                    </div>

                    <span class="section-helper">
                        Required for encounter documentation
                    </span>

                </div>


                <form
                    id="doctor-consultation-form"
                    class="clinical-form"
                >

                    <input
                        type="hidden"
                        name="doctorId"
                        value="${escapeHtml(
                            doctor?.id || ""
                        )}"
                    >

                    <div class="form-section">

                        <label class="form-label">
                            Chief Complaint
                            <span class="required">*</span>
                        </label>

                        <textarea
                            name="chiefComplaint"
                            class="form-control"
                            rows="3"
                            placeholder="Reason for today's visit..."
                        >${escapeHtml(
                            latest.chiefComplaint || ""
                        )}</textarea>

                    </div>


                    <div class="form-grid two-columns">

                        <div class="form-section">

                            <label class="form-label">
                                History of Present Illness
                            </label>

                            <textarea
                                name="historyOfPresentIllness"
                                class="form-control"
                                rows="5"
                                placeholder="Describe symptoms, duration, progression, and relevant history..."
                            >${escapeHtml(
                                latest.historyOfPresentIllness || ""
                            )}</textarea>

                        </div>


                        <div class="form-section">

                            <label class="form-label">
                                Examination Notes
                            </label>

                            <textarea
                                name="examinationNotes"
                                class="form-control"
                                rows="5"
                                placeholder="Clinical examination findings..."
                            >${escapeHtml(
                                latest.examinationNotes || ""
                            )}</textarea>

                        </div>

                    </div>


                    <div class="form-section">

                        <label class="form-label">
                            Diagnosis
                        </label>

                        <textarea
                            name="diagnosis"
                            class="form-control"
                            rows="3"
                            placeholder="Primary diagnosis, differential diagnosis, or clinical impression..."
                        >${escapeHtml(
                            latest.diagnosis || ""
                        )}</textarea>

                    </div>


                    <div class="form-section">

                        <label class="form-label">
                            Clinical Notes / Treatment Plan
                        </label>

                        <textarea
                            name="clinicalNotes"
                            class="form-control"
                            rows="4"
                            placeholder="Treatment plan, observations, precautions, and additional instructions..."
                        >${escapeHtml(
                            latest.clinicalNotes || ""
                        )}</textarea>

                    </div>


                    <div class="form-grid two-columns">

                        <div class="form-section">

                            <label class="form-label">
                                Follow-up Advice
                            </label>

                            <textarea
                                name="followUpAdvice"
                                class="form-control"
                                rows="3"
                                placeholder="Follow-up instructions..."
                            >${escapeHtml(
                                latest.followUpAdvice || ""
                            )}</textarea>

                        </div>


                        <div class="form-section">

                            <label class="form-label">
                                Follow-up Date
                            </label>

                            <input
                                type="date"
                                name="followUpDate"
                                class="form-control"
                                value="${escapeHtml(
                                    latest.followUpDate || ""
                                )}"
                            >

                        </div>

                    </div>


                    <div class="form-actions">

                        <button
                            type="submit"
                            class="btn btn-primary"
                        >
                            Save Consultation Notes
                        </button>

                    </div>

                </form>

            </section>
        `;
    }


    function renderPrescriptionEditor(
        patient,
        encounter,
        prescriptions
    ) {
        const latest = prescriptions[prescriptions.length - 1];

        return `
            <section class="clinical-card">

                <div class="section-heading">

                    <div>
                        <span class="eyebrow">TREATMENT</span>
                        <h3>Prescription</h3>
                    </div>

                    <span class="section-helper">
                        Prescription medicines for this encounter
                    </span>

                </div>


                <form
                    id="doctor-prescription-editor"
                    class="clinical-form"
                >

                    <input
                        type="hidden"
                        name="doctorId"
                        value="${escapeHtml(
                            getCurrentDoctor()?.id || ""
                        )}"
                    >

                    <input
                        type="hidden"
                        name="consultationId"
                        value=""
                    >


                    <div class="prescription-rows">

                        ${latest?.medicines?.length
                            ? latest.medicines.map(
                                medicine => prescriptionRowTemplate(
                                    medicine
                                )
                            ).join("")
                            : prescriptionRowTemplate()
                        }

                    </div>


                    <div class="prescription-actions">

                        <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            data-action="add-prescription-row"
                        >
                            + Add Medicine
                        </button>

                    </div>


                    <div class="form-section">

                        <label class="form-label">
                            Prescription Notes
                        </label>

                        <textarea
                            name="prescriptionNotes"
                            class="form-control"
                            rows="3"
                            placeholder="General medicine instructions..."
                        ></textarea>

                    </div>


                    <div class="form-actions">

                        <button
                            type="submit"
                            class="btn btn-primary"
                        >
                            Save Prescription
                        </button>

                    </div>

                </form>

            </section>
        `;
    }


    function prescriptionRowTemplate(medicine) {
        medicine = medicine || {};

        return `
            <div class="prescription-row">

                <div class="form-section prescription-medicine">

                    <label class="form-label">
                        Medicine
                    </label>

                    <input
                        type="text"
                        name="medicineName"
                        class="form-control"
                        placeholder="Medicine name"
                        value="${escapeHtml(
                            medicine.medicineName || ""
                        )}"
                    >

                </div>


                <div class="form-section">

                    <label class="form-label">
                        Dosage
                    </label>

                    <input
                        type="text"
                        name="dosage"
                        class="form-control"
                        placeholder="500 mg"
                        value="${escapeHtml(
                            medicine.dosage || ""
                        )}"
                    >

                </div>


                <div class="form-section">

                    <label class="form-label">
                        Frequency
                    </label>

                    <input
                        type="text"
                        name="frequency"
                        class="form-control"
                        placeholder="1-0-1"
                        value="${escapeHtml(
                            medicine.frequency || ""
                        )}"
                    >

                </div>


                <div class="form-section">

                    <label class="form-label">
                        Duration
                    </label>

                    <input
                        type="text"
                        name="duration"
                        class="form-control"
                        placeholder="5 days"
                        value="${escapeHtml(
                            medicine.duration || ""
                        )}"
                    >

                </div>


                <div class="form-section">

                    <label class="form-label">
                        Route
                    </label>

                    <select
                        name="route"
                        class="form-control"
                    >
                        ${selectOption(
                            "Oral",
                            medicine.route || "Oral"
                        )}

                        ${selectOption(
                            "Topical",
                            medicine.route
                        )}

                        ${selectOption(
                            "Injection",
                            medicine.route
                        )}

                        ${selectOption(
                            "Inhalation",
                            medicine.route
                        )}

                        ${selectOption(
                            "Other",
                            medicine.route
                        )}
                    </select>

                </div>


                <div class="form-section prescription-instructions">

                    <label class="form-label">
                        Instructions
                    </label>

                    <input
                        type="text"
                        name="instructions"
                        class="form-control"
                        placeholder="After food..."
                        value="${escapeHtml(
                            medicine.instructions || ""
                        )}"
                    >

                </div>


                <button
                    type="button"
                    class="icon-button prescription-remove-button"
                    data-action="remove-prescription-row"
                    aria-label="Remove medicine"
                >
                    ×
                </button>

            </div>
        `;
    }


    function selectOption(label, selected) {
        return `
            <option
                value="${escapeHtml(label)}"
                ${selected === label ? "selected" : ""}
            >
                ${escapeHtml(label)}
            </option>
        `;
    }


    function renderLabOrderEditor(
        patient,
        encounter,
        labOrders
    ) {
        return `
            <section class="clinical-card">

                <div class="section-heading">

                    <div>
                        <span class="eyebrow">DIAGNOSTICS</span>
                        <h3>Laboratory & Diagnostic Orders</h3>
                    </div>

                    <span class="section-helper">
                        Send orders to Laboratory
                    </span>

                </div>


                <form
                    id="doctor-lab-order-form"
                    class="clinical-form"
                >

                    <input
                        type="hidden"
                        name="doctorId"
                        value="${escapeHtml(
                            getCurrentDoctor()?.id || ""
                        )}"
                    >


                    <div class="form-grid two-columns">

                        <div class="form-section">

                            <label class="form-label">
                                Test Name
                                <span class="required">*</span>
                            </label>

                            <input
                                type="text"
                                name="testName"
                                class="form-control"
                                list="doctor-test-options"
                                placeholder="CBC, glucose, X-ray..."
                                required
                            >

                            <datalist id="doctor-test-options">

                                <option value="Complete Blood Count">
                                <option value="Blood Glucose">
                                <option value="Liver Function Test">
                                <option value="Kidney Function Test">
                                <option value="Urine Routine">
                                <option value="Lipid Profile">
                                <option value="Thyroid Profile">
                                <option value="Chest X-Ray">
                                <option value="Ultrasound">
                                <option value="ECG">

                            </datalist>

                        </div>


                        <div class="form-section">

                            <label class="form-label">
                                Category
                            </label>

                            <select
                                name="category"
                                class="form-control"
                            >
                                <option value="Laboratory">
                                    Laboratory
                                </option>

                                <option value="Pathology">
                                    Pathology
                                </option>

                                <option value="Radiology">
                                    Radiology
                                </option>

                                <option value="Other">
                                    Other
                                </option>

                            </select>

                        </div>

                    </div>


                    <div class="form-grid two-columns">

                        <div class="form-section">

                            <label class="form-label">
                                Priority
                            </label>

                            <select
                                name="priority"
                                class="form-control"
                            >
                                <option value="routine">
                                    Routine
                                </option>

                                <option value="urgent">
                                    Urgent
                                </option>

                                <option value="stat">
                                    STAT
                                </option>

                            </select>

                        </div>


                        <div class="form-section">

                            <label class="form-label">
                                Clinical Notes
                            </label>

                            <input
                                type="text"
                                name="clinicalNotes"
                                class="form-control"
                                placeholder="Reason for investigation..."
                            >

                        </div>

                    </div>


                    <div class="form-actions">

                        <button
                            type="submit"
                            class="btn btn-primary"
                        >
                            Create Lab Order
                        </button>

                    </div>

                </form>


                ${renderLabOrdersList(labOrders)}

            </section>
        `;
    }


    function renderLabOrdersList(labOrders) {
        if (!labOrders.length) {
            return `
                <div class="empty-state compact">
                    <span>No diagnostic orders for this encounter.</span>
                </div>
            `;
        }

        return `
            <div class="clinical-subsection">

                <h4>Current Orders</h4>

                <div class="clinical-order-list">

                    ${labOrders.map(order => `
                        <div class="clinical-order-item">

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        order.testName
                                    )}
                                </strong>

                                <span>
                                    ${escapeHtml(
                                        order.category || "Laboratory"
                                    )}
                                    ·
                                    ${escapeHtml(
                                        order.priority || "routine"
                                    )}
                                </span>
                            </div>

                            <span class="status-badge">
                                ${escapeHtml(
                                    order.status || "ordered"
                                )}
                            </span>

                        </div>
                    `).join("")}

                </div>

            </div>
        `;
    }


    function renderMedicalHistory(patient, encounters) {
        return `
            <section class="clinical-card">

                <div class="section-heading compact">

                    <div>
                        <span class="eyebrow">PATIENT RECORD</span>
                        <h3>Medical History</h3>
                    </div>

                </div>


                <div class="patient-summary-list">

                    <div>
                        <span>Blood Group</span>
                        <strong>
                            ${escapeHtml(
                                patient.bloodGroup || "Not recorded"
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Allergies</span>
                        <strong>
                            ${escapeHtml(
                                patient.allergies || "None recorded"
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Emergency Contact</span>
                        <strong>
                            ${escapeHtml(
                                patient.emergencyContactName ||
                                "Not recorded"
                            )}
                        </strong>
                    </div>

                </div>


                <div class="clinical-subsection">

                    <h4>Previous Encounters</h4>

                    ${encounters.length
                        ? encounters.slice(0, 5).map(encounter => `
                            <div class="history-item">

                                <span>
                                    ${formatDate(
                                        encounter.createdAt
                                    )}
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        encounter.diagnosis ||
                                        encounter.encounterType ||
                                        "Outpatient Encounter"
                                    )}
                                </strong>

                            </div>
                        `).join("")
                        : `
                            <div class="empty-state compact">
                                <span>No previous encounters.</span>
                            </div>
                        `
                    }

                </div>

            </section>
        `;
    }


    function renderPreviousConsultations(consultations) {
        return `
            <section class="clinical-card">

                <div class="section-heading compact">

                    <div>
                        <span class="eyebrow">CLINICAL HISTORY</span>
                        <h3>Previous Consultations</h3>
                    </div>

                </div>


                ${consultations.length
                    ? consultations.slice(0, 4).map(item => `
                        <div class="history-item consultation-history-item">

                            <span>
                                ${formatDate(
                                    item.createdAt
                                )}
                            </span>

                            <strong>
                                ${escapeHtml(
                                    item.diagnosis ||
                                    item.chiefComplaint ||
                                    "Consultation"
                                )}
                            </strong>

                            <small>
                                ${escapeHtml(
                                    item.clinicalNotes || ""
                                )}
                            </small>

                        </div>
                    `).join("")
                    : `
                        <div class="empty-state compact">
                            <span>No previous consultation notes.</span>
                        </div>
                    `
                }

            </section>
        `;
    }


    function renderPatientAlerts(patient) {
        const alerts = [];

        if (patient.allergies) {
            alerts.push({
                title: "Allergy Alert",
                text: patient.allergies,
                type: "danger"
            });
        }

        if (patient.medicalNotes) {
            alerts.push({
                title: "Medical Notes",
                text: patient.medicalNotes,
                type: "warning"
            });
        }

        if (!alerts.length) {
            return `
                <section class="clinical-card">

                    <div class="section-heading compact">
                        <div>
                            <span class="eyebrow">SAFETY</span>
                            <h3>Patient Alerts</h3>
                        </div>
                    </div>

                    <div class="empty-state compact">
                        <span>No alerts recorded.</span>
                    </div>

                </section>
            `;
        }

        return `
            <section class="clinical-card">

                <div class="section-heading compact">
                    <div>
                        <span class="eyebrow">SAFETY</span>
                        <h3>Patient Alerts</h3>
                    </div>
                </div>

                ${alerts.map(alert => `
                    <div class="patient-alert patient-alert-${alert.type}">
                        <strong>${escapeHtml(alert.title)}</strong>
                        <span>${escapeHtml(alert.text)}</span>
                    </div>
                `).join("")}

            </section>
        `;
    }


    /* =========================================================
       PRINTING
    ========================================================= */

    function printConsultation() {
        const patient = state.patients.find(
            item => item.id === state.selectedPatient
        );

        const encounter = state.encounters.find(
            item => item.id === state.selectedEncounter
        );

        if (!patient || !encounter) {
            showToast("No active consultation selected.", "error");
            return;
        }

        const consultation = getConsultationsForPatient(
            patient.id
        ).find(item => item.encounterId === encounter.id);

        const vitals = getPatientVitals(
            patient.id,
            encounter.id
        );

        const prescriptions = getPrescriptionsForEncounter(
            encounter.id
        );

        const labOrders = getLabOrdersForEncounter(
            encounter.id
        );

        const printWindow = window.open(
            "",
            "_blank",
            "width=900,height=800"
        );

        if (!printWindow) {
            showToast(
                "Please allow pop-ups to print the consultation.",
                "error"
            );
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Clinical Consultation — ${escapeHtml(
                    getPatientName(patient)
                )}</title>

                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 40px;
                        color: #222;
                    }

                    h1, h2, h3 {
                        margin-bottom: 8px;
                    }

                    .header {
                        border-bottom: 2px solid #222;
                        padding-bottom: 20px;
                        margin-bottom: 24px;
                    }

                    .grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 12px;
                        margin: 16px 0;
                    }

                    .box {
                        border: 1px solid #ddd;
                        padding: 12px;
                    }

                    .box strong {
                        display: block;
                        margin-bottom: 5px;
                    }

                    section {
                        margin: 24px 0;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }

                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }

                    @media print {
                        body {
                            margin: 20px;
                        }
                    }
                </style>
            </head>

            <body>

                <div class="header">
                    <h1>AURA Clinic</h1>
                    <p>Clinical Consultation Record</p>

                    <h2>${escapeHtml(
                        getPatientName(patient)
                    )}</h2>

                    <p>
                        UHID: ${escapeHtml(patient.uhid || "—")}
                        |
                        Encounter: ${escapeHtml(encounter.id)}
                    </p>
                </div>


                <section>
                    <h3>Patient Information</h3>

                    <div class="grid">
                        <div class="box">
                            <strong>Gender</strong>
                            ${escapeHtml(patient.gender || "—")}
                        </div>

                        <div class="box">
                            <strong>Age</strong>
                            ${escapeHtml(getPatientAge(patient))}
                        </div>

                        <div class="box">
                            <strong>Phone</strong>
                            ${escapeHtml(patient.phone || "—")}
                        </div>

                        <div class="box">
                            <strong>Blood Group</strong>
                            ${escapeHtml(patient.bloodGroup || "—")}
                        </div>
                    </div>
                </section>


                <section>
                    <h3>Vitals</h3>

                    <div class="grid">
                        <div class="box">
                            <strong>Temperature</strong>
                            ${escapeHtml(vitals?.temperature || "—")}
                        </div>

                        <div class="box">
                            <strong>Pulse</strong>
                            ${escapeHtml(vitals?.pulse || "—")}
                        </div>

                        <div class="box">
                            <strong>Blood Pressure</strong>
                            ${escapeHtml(vitals?.bloodPressure || "—")}
                        </div>

                        <div class="box">
                            <strong>SpO₂</strong>
                            ${escapeHtml(vitals?.spo2 || "—")}
                        </div>
                    </div>
                </section>


                <section>
                    <h3>Clinical Consultation</h3>

                    <p>
                        <strong>Chief Complaint:</strong><br>
                        ${escapeHtml(
                            consultation?.chiefComplaint || "—"
                        )}
                    </p>

                    <p>
                        <strong>History:</strong><br>
                        ${escapeHtml(
                            consultation?.historyOfPresentIllness || "—"
                        )}
                    </p>

                    <p>
                        <strong>Examination:</strong><br>
                        ${escapeHtml(
                            consultation?.examinationNotes || "—"
                        )}
                    </p>

                    <p>
                        <strong>Diagnosis:</strong><br>
                        ${escapeHtml(
                            consultation?.diagnosis || "—"
                        )}
                    </p>

                    <p>
                        <strong>Clinical Notes:</strong><br>
                        ${escapeHtml(
                            consultation?.clinicalNotes || "—"
                        )}
                    </p>
                </section>


                <section>
                    <h3>Prescriptions</h3>

                    ${
                        prescriptions.length
                            ? prescriptions.flatMap(
                                item => item.medicines || []
                            ).map(medicine => `
                                <p>
                                    <strong>
                                        ${escapeHtml(
                                            medicine.medicineName
                                        )}
                                    </strong>
                                    —
                                    ${escapeHtml(
                                        medicine.dosage || ""
                                    )}
                                    —
                                    ${escapeHtml(
                                        medicine.frequency || ""
                                    )}
                                    —
                                    ${escapeHtml(
                                        medicine.duration || ""
                                    )}
                                </p>
                            `).join("")
                            : "<p>No prescriptions recorded.</p>"
                    }
                </section>


                <section>
                    <h3>Laboratory / Diagnostic Orders</h3>

                    ${
                        labOrders.length
                            ? `<table>
                                <thead>
                                    <tr>
                                        <th>Test</th>
                                        <th>Category</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${labOrders.map(order => `
                                        <tr>
                                            <td>${escapeHtml(
                                                order.testName
                                            )}</td>
                                            <td>${escapeHtml(
                                                order.category || "—"
                                            )}</td>
                                            <td>${escapeHtml(
                                                order.priority || "—"
                                            )}</td>
                                            <td>${escapeHtml(
                                                order.status || "—"
                                            )}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>`
                            : "<p>No diagnostic orders recorded.</p>"
                    }
                </section>

                <footer>
                    <p>
                        Generated by AURA Clinic on
                        ${escapeHtml(formatDateTime(now()))}
                    </p>
                </footer>

            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
        }, 300);
    }


    /* =========================================================
       EVENT BINDING
    ========================================================= */

    function bindEvents() {
        const container = getContainer();

        if (!container) return;

        container
            .querySelectorAll("[data-doctor-tab]")
            .forEach(button => {
                button.onclick = () => {
                    state.activeTab =
                        button.dataset.doctorTab || "waiting";

                    render();
                };
            });


        const searchInput = document.getElementById(
            "doctor-patient-search"
        );

        if (searchInput) {
            searchInput.oninput = event => {
                state.filters.search = event.target.value;
                render();
            };
        }


        container
            .querySelectorAll(
                "[data-action='open-consultation']"
            )
            .forEach(button => {
                button.onclick = async () => {
                    const queueId = button.dataset.queueId;

                    const queue = state.queues.find(
                        item => item.id === queueId
                    );

                    if (!queue) return;

                    const status = String(
                        queue.status || ""
                    ).toLowerCase();

                    if (
                        status === "waiting" ||
                        status === "queued" ||
                        status === "pending"
                    ) {
                        await callPatient(queueId);
                    }

                    await startConsultation(queueId);
                };
            });


        container
            .querySelectorAll(
                "[data-action='call-next-patient']"
            )
            .forEach(button => {
                button.onclick = async () => {
                    const next = getWaitingQueues()[0];

                    if (!next) {
                        showToast(
                            "No patients are waiting.",
                            "info"
                        );
                        return;
                    }

                    await callPatient(next.id);
                    await startConsultation(next.id);
                };
            });


        container
            .querySelectorAll(
                "[data-action='refresh-doctor']"
            )
            .forEach(button => {
                button.onclick = async () => {
                    await loadData();
                    render();
                };
            });


        container
            .querySelectorAll(
                "[data-action='back-to-doctor-desk']"
            )
            .forEach(button => {
                button.onclick = () => {
                    state.selectedQueue = null;
                    state.selectedPatient = null;
                    state.selectedEncounter = null;
                    render();
                };
            });


        container
            .querySelectorAll(
                "[data-action='complete-consultation']"
            )
            .forEach(button => {
                button.onclick = async () => {
                    const queueId = button.dataset.queueId;
                    const encounterId = button.dataset.encounterId;

                    await completeConsultation(
                        queueId,
                        encounterId
                    );
                };
            });


        container
            .querySelectorAll(
                "[data-action='print-consultation']"
            )
            .forEach(button => {
                button.onclick = printConsultation;
            });


        const consultationForm = document.getElementById(
            "doctor-consultation-form"
        );

        if (consultationForm) {
            consultationForm.onsubmit = saveConsultation;
        }


        const prescriptionForm = document.getElementById(
            "doctor-prescription-editor"
        );

        if (prescriptionForm) {
            prescriptionForm.onsubmit = savePrescription;
        }


        const labForm = document.getElementById(
            "doctor-lab-order-form"
        );

        if (labForm) {
            labForm.onsubmit = saveLabOrder;
        }


        bindPrescriptionRowEvents();
    }


    /* =========================================================
       EVENT SUBSCRIPTIONS
    ========================================================= */

    function subscribeToEvents() {
        if (state.unsubscribe.length) {
            return;
        }

        const eventNames = [
            "queue:created",
            "queue:updated",
            "queue:called",
            "queue:completed",
            "vitals:recorded",
            "consultation:completed",
            "prescription:created",
            "lab:order-created",
            "storage:changed"
        ];

        eventNames.forEach(eventName => {
            if (
                EVENTS &&
                typeof EVENTS.on === "function"
            ) {
                const unsubscribe = EVENTS.on(
                    eventName,
                    async () => {
                        await loadData();

                        if (
                            state.selectedPatient ||
                            state.initialized
                        ) {
                            render();
                        }
                    }
                );

                if (typeof unsubscribe === "function") {
                    state.unsubscribe.push(unsubscribe);
                }
            }
        });

        document.addEventListener(
            "aura:route-changed",
            event => {
                const route =
                    event.detail?.route ||
                    window.location.hash.replace("#/", "");

                if (route === MODULE_NAME) {
                    initialize();
                }
            }
        );
    }


    /* =========================================================
       INITIALIZATION
    ========================================================= */

    async function initialize() {
        if (state.initialized) {
            await loadData();
            render();
            return;
        }

        state.initialized = true;

        await loadData();
        subscribeToEvents();
        render();
    }


    function getState() {
        return {
            ...state,
            patients: [...state.patients],
            queues: [...state.queues],
            encounters: [...state.encounters],
            consultations: [...state.consultations],
            prescriptions: [...state.prescriptions],
            labOrders: [...state.labOrders]
        };
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    const DoctorModule = {
        name: MODULE_NAME,
        initialize,
        render,
        loadData,
        getState,

        getDoctorQueues,
        getWaitingQueues,
        getCalledQueues,
        getCompletedQueues,

        callPatient,
        startConsultation,
        completeConsultation,

        getOrCreateEncounter,
        saveEncounterDetails,

        saveConsultation,
        savePrescription,
        saveLabOrder,

        printConsultation
    };


    window.AURA_DOCTOR = DoctorModule;

    window.AURA = window.AURA || {};
    window.AURA.doctor = DoctorModule;


    if (window.AURA_APP?.registerModule) {
        window.AURA_APP.registerModule(
            MODULE_NAME,
            DoctorModule
        );
    }


    document.addEventListener(
        "DOMContentLoaded",
        () => {
            const route =
                window.location.hash.replace("#/", "") ||
                "dashboard";

            if (route === MODULE_NAME) {
                initialize();
            }
        },
        {
            once: true
        }
    );

})();