(function (window) {
  "use strict";

  const AURA = window.AURA || {};
  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS || {};
  const ROUTER = window.AURA_ROUTER;

  const STORE_PATIENTS = "patients";
  const STORE_ENCOUNTERS = "encounters";
  const STORE_QUEUES = "queues";

  const MODULE_NAME = "registration";

  const DEFAULT_DEPARTMENTS = [
    {
      id: "general-medicine",
      name: "General Medicine",
      shortName: "General",
      queueCode: "GM"
    },
    {
      id: "pediatrics",
      name: "Pediatrics",
      shortName: "Pediatrics",
      queueCode: "PD"
    },
    {
      id: "pathology",
      name: "Pathology",
      shortName: "Pathology",
      queueCode: "PL"
    },
    {
      id: "radiology",
      name: "Radiology",
      shortName: "Radiology",
      queueCode: "RD"
    }
  ];

  const MODULE = {
    name: MODULE_NAME,
    state: {
      patients: [],
      selectedPatient: null,
      searchTerm: "",
      selectedDepartment: "",
      selectedVisitType: "OPD",
      isLoading: false,
      isSaving: false,
      lastRegistration: null
    },

    init() {
      if (this.initialized) return this;

      this.initialized = true;

      this.bindGlobalEvents();
      this.bindDocumentEvents();

      return this;
    },

    async loadPatients() {
      if (!STORAGE) {
        this.state.patients = [];
        return [];
      }

      try {
        this.state.patients = await STORAGE.getAll(STORE_PATIENTS);
        return this.state.patients;
      } catch (error) {
        console.error("[AURA Registration] Failed to load patients:", error);
        this.state.patients = [];
        return [];
      }
    },

    async searchPatients(searchTerm) {
      const term = String(searchTerm || "").trim().toLowerCase();

      if (!term) {
        return [];
      }

      if (!STORAGE) {
        return [];
      }

      try {
        const patients = await STORAGE.getAll(STORE_PATIENTS);

        return patients
          .filter((patient) => {
            const searchableText = [
              patient.uhid,
              patient.firstName,
              patient.middleName,
              patient.lastName,
              patient.phone,
              patient.email
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return searchableText.includes(term);
          })
          .sort((a, b) => {
            const aDate = new Date(a.updatedAt || a.createdAt || 0);
            const bDate = new Date(b.updatedAt || b.createdAt || 0);

            return bDate - aDate;
          })
          .slice(0, 20);
      } catch (error) {
        console.error("[AURA Registration] Patient search failed:", error);
        return [];
      }
    },

    getDepartments() {
      const configuredDepartments =
        CONFIG?.workflow?.departments ||
        CONFIG?.departments ||
        CONFIG?.clinic?.departments;

      if (Array.isArray(configuredDepartments) && configuredDepartments.length) {
        return configuredDepartments;
      }

      return DEFAULT_DEPARTMENTS;
    },

    getDepartment(departmentId) {
      return this.getDepartments().find(
        (department) =>
          String(department.id || department.code || department.name) ===
          String(departmentId)
      );
    },

    getPatientFullName(patient) {
      if (!patient) return "";

      return [
        patient.firstName,
        patient.middleName,
        patient.lastName
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    },

    getTodayDate() {
      return new Date().toISOString().split("T")[0];
    },

    createLocalId(prefix) {
      if (typeof UTILS.createId === "function") {
        return UTILS.createId(prefix);
      }

      return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    },

    generateUHID() {
      if (typeof UTILS.generateUHID === "function") {
        return UTILS.generateUHID();
      }

      if (typeof CONFIG.generateUHID === "function") {
        return CONFIG.generateUHID();
      }

      const date = new Date();
      const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("");

      const randomPart = Math.floor(1000 + Math.random() * 9000);

      return `AURA-${datePart}-${randomPart}`;
    },

    async generateQueueToken(department) {
      const queueCode =
        department?.queueCode ||
        department?.code ||
        "OPD";

      const today = this.getTodayDate();

      let existingQueues = [];

      if (STORAGE) {
        try {
          existingQueues = await STORAGE.getAll(STORE_QUEUES);
        } catch (error) {
          console.warn("[AURA Registration] Could not read queue records:", error);
        }
      }

      const todayQueues = existingQueues.filter((queue) => {
        return (
          queue.date === today &&
          queue.departmentId === department.id
        );
      });

      const nextNumber = todayQueues.length + 1;

      return {
        number: nextNumber,
        display: `${queueCode}-${String(nextNumber).padStart(3, "0")}`,
        code: queueCode
      };
    },

    normalizePatientData(formData) {
      const data = {
        firstName: String(formData.firstName || "").trim(),
        middleName: String(formData.middleName || "").trim(),
        lastName: String(formData.lastName || "").trim(),
        gender: String(formData.gender || "").trim(),
        dateOfBirth: String(formData.dateOfBirth || "").trim(),
        phone: String(formData.phone || "").trim(),
        email: String(formData.email || "").trim(),
        bloodGroup: String(formData.bloodGroup || "").trim(),
        address: String(formData.address || "").trim(),
        emergencyContactName: String(
          formData.emergencyContactName || ""
        ).trim(),
        emergencyContactPhone: String(
          formData.emergencyContactPhone || ""
        ).trim(),
        allergies: String(formData.allergies || "").trim(),
        medicalNotes: String(formData.medicalNotes || "").trim()
      };

      return data;
    },

    validatePatientData(data) {
      const errors = [];

      if (!data.firstName) {
        errors.push("First name is required.");
      }

      if (!data.lastName) {
        errors.push("Last name is required.");
      }

      if (!data.phone) {
        errors.push("Phone number is required.");
      }

      if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
        errors.push("Please enter a valid email address.");
      }

      return errors;
    },

    async createPatient(formData) {
      const data = this.normalizePatientData(formData);
      const errors = this.validatePatientData(data);

      if (errors.length) {
        throw new Error(errors.join(" "));
      }

      const patient = {
        id: this.createLocalId("patient"),
        uhid: this.generateUHID(),
        ...data,
        status: "active",
        registrationDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const savedPatient = await STORAGE.add(STORE_PATIENTS, patient);

      this.state.patients.push(savedPatient || patient);
      this.state.selectedPatient = savedPatient || patient;

      if (EVENTS?.patientCreated) {
        EVENTS.patientCreated(savedPatient || patient);
      }

      if (typeof window.AURA?.emit === "function") {
        window.AURA.emit("registration:patient-created", savedPatient || patient);
      }

      return savedPatient || patient;
    },

    async updatePatient(patientId, formData) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const existingPatient = await STORAGE.get(STORE_PATIENTS, patientId);

      if (!existingPatient) {
        throw new Error("Patient record not found.");
      }

      const data = this.normalizePatientData(formData);
      const errors = this.validatePatientData(data);

      if (errors.length) {
        throw new Error(errors.join(" "));
      }

      const updatedPatient = {
        ...existingPatient,
        ...data,
        updatedAt: new Date().toISOString()
      };

      const savedPatient = await STORAGE.put(
        STORE_PATIENTS,
        updatedPatient
      );

      this.state.selectedPatient = savedPatient || updatedPatient;

      if (EVENTS?.patientUpdated) {
        EVENTS.patientUpdated(savedPatient || updatedPatient);
      }

      return savedPatient || updatedPatient;
    },

    async createEncounter(patient, options = {}) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const department = this.getDepartment(
        options.departmentId || this.state.selectedDepartment
      );

      if (!department) {
        throw new Error("Please select a department.");
      }

      const encounter = {
        id: this.createLocalId("encounter"),
        patientId: patient.id,
        uhid: patient.uhid,
        patientName: this.getPatientFullName(patient),
        encounterType: options.visitType || "OPD",
        visitType: options.visitType || "OPD",
        departmentId: department.id,
        departmentName: department.name,
        status: "registered",
        priority: options.priority || "normal",
        chiefComplaint: options.chiefComplaint || "",
        doctorId: null,
        doctorName: "",
        registrationDate: new Date().toISOString(),
        encounterDate: this.getTodayDate(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const savedEncounter = await STORAGE.add(
        STORE_ENCOUNTERS,
        encounter
      );

      if (EVENTS?.registrationCompleted) {
        EVENTS.registrationCompleted(savedEncounter || encounter);
      }

      return savedEncounter || encounter;
    },

    async createQueueEntry(patient, encounter, options = {}) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const department = this.getDepartment(
        options.departmentId || encounter.departmentId
      );

      if (!department) {
        throw new Error("Department not found.");
      }

      const token = await this.generateQueueToken(department);
      const now = new Date().toISOString();

      const queueEntry = {
        id: this.createLocalId("queue"),
        tokenNumber: token.number,
        tokenDisplay: token.display,
        tokenCode: token.code,
        patientId: patient.id,
        uhid: patient.uhid,
        patientName: this.getPatientFullName(patient),
        encounterId: encounter.id,
        departmentId: department.id,
        departmentName: department.name,
        queueType: "pre-consultation",
        visitType: encounter.visitType || "OPD",
        status: "waiting",
        priority: options.priority || "normal",
        date: this.getTodayDate(),
        registeredAt: now,
        calledAt: null,
        startedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now
      };

      const savedQueue = await STORAGE.add(
        STORE_QUEUES,
        queueEntry
      );

      if (EVENTS?.queueCreated) {
        EVENTS.queueCreated(savedQueue || queueEntry);
      }

      if (typeof window.AURA?.emit === "function") {
        window.AURA.emit(
          "registration:queue-created",
          savedQueue || queueEntry
        );
      }

      return savedQueue || queueEntry;
    },

    async registerVisit(options = {}) {
      if (this.state.isSaving) {
        throw new Error("A registration is already being processed.");
      }

      this.state.isSaving = true;

      try {
        let patient = options.patient || null;

        if (!patient && options.patientId && STORAGE) {
          patient = await STORAGE.get(STORE_PATIENTS, options.patientId);
        }

        if (!patient && options.patientData) {
          patient = await this.createPatient(options.patientData);
        }

        if (!patient) {
          throw new Error("Please select or register a patient.");
        }

        const departmentId =
          options.departmentId ||
          this.state.selectedDepartment;

        if (!departmentId) {
          throw new Error("Please select a department.");
        }

        const encounter = await this.createEncounter(patient, {
          departmentId,
          visitType:
            options.visitType ||
            this.state.selectedVisitType ||
            "OPD",
          priority: options.priority || "normal",
          chiefComplaint: options.chiefComplaint || ""
        });

        const queue = await this.createQueueEntry(patient, encounter, {
          departmentId,
          priority: options.priority || "normal"
        });

        const registration = {
          patient,
          encounter,
          queue,
          registeredAt: new Date().toISOString()
        };

        this.state.selectedPatient = patient;
        this.state.lastRegistration = registration;

        this.showSuccessMessage(registration);

        return registration;
      } catch (error) {
        console.error("[AURA Registration] Visit registration failed:", error);

        this.showErrorMessage(error.message || "Registration failed.");

        throw error;
      } finally {
        this.state.isSaving = false;
      }
    },

    showSuccessMessage(registration) {
      const patientName = this.getPatientFullName(registration.patient);
      const token = registration.queue.tokenDisplay;

      const message =
        `${patientName} registered successfully. Queue token: ${token}`;

      if (typeof window.AURA?.toast === "function") {
        window.AURA.toast({
          type: "success",
          title: "Registration Complete",
          message
        });
      } else {
        console.info(`[AURA Registration] ${message}`);
      }

      if (typeof window.AURA?.emit === "function") {
        window.AURA.emit("registration:completed", registration);
      }
    },

    showErrorMessage(message) {
      if (typeof window.AURA?.toast === "function") {
        window.AURA.toast({
          type: "error",
          title: "Registration Error",
          message
        });
      } else {
        console.error(`[AURA Registration] ${message}`);
      }
    },

    async render(container) {
      const target =
        container ||
        document.querySelector('[data-route-view="registration"]') ||
        document.getElementById("app-content");

      if (!target) return;

      this.state.isLoading = true;

      target.innerHTML = this.getLoadingMarkup();

      try {
        await this.loadPatients();
        target.innerHTML = this.getPageMarkup();
        this.bindPageEvents(target);
      } catch (error) {
        console.error("[AURA Registration] Render failed:", error);

        target.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">⚠️</div>
            <h3>Registration unavailable</h3>
            <p>${this.escapeHtml(error.message)}</p>
            <button class="btn btn--primary" data-registration-retry>
              Try Again
            </button>
          </div>
        `;

        target
          .querySelector("[data-registration-retry]")
          ?.addEventListener("click", () => this.render(target));
      } finally {
        this.state.isLoading = false;
      }
    },

    getLoadingMarkup() {
      return `
        <section class="page-shell registration-page">
          <div class="page-header">
            <div>
              <div class="skeleton skeleton--title"></div>
              <div class="skeleton skeleton--text"></div>
            </div>
          </div>

          <div class="registration-layout">
            <div class="skeleton skeleton--card"></div>
            <div class="skeleton skeleton--card"></div>
          </div>
        </section>
      `;
    },

    getPageMarkup() {
      const departments = this.getDepartments();

      const departmentOptions = departments
        .map(
          (department) => `
            <option value="${this.escapeAttribute(
              department.id || department.code || department.name
            )}">
              ${this.escapeHtml(department.name)}
            </option>
          `
        )
        .join("");

      return `
        <section class="page-shell registration-page">

          <div class="page-header">
            <div>
              <span class="eyebrow">RECEPTION DESK</span>
              <h1 class="page-title">Patient Registration</h1>
              <p class="page-subtitle">
                Register a patient and create today's clinical visit.
              </p>
            </div>

            <div class="page-header__actions">
              <button class="btn btn--secondary" data-registration-clear>
                Clear
              </button>
            </div>
          </div>

          <div class="registration-layout">

            <section class="panel registration-panel">

              <div class="panel__header">
                <div>
                  <h2 class="panel__title">Patient Details</h2>
                  <p class="panel__subtitle">
                    Search an existing patient or create a new UHID.
                  </p>
                </div>

                <span class="status-pill status-pill--info">
                  Step 1 of 2
                </span>
              </div>

              <div class="registration-search">
                <label class="form-field form-field--full">
                  <span class="form-label">Search Existing Patient</span>

                  <div class="input-with-icon">
                    <span class="input-icon">⌕</span>
                    <input
                      type="search"
                      class="form-input"
                      id="registration-patient-search"
                      placeholder="Search UHID, name, or phone number"
                      autocomplete="off"
                    />
                  </div>
                </label>

                <div
                  class="patient-search-results"
                  id="registration-search-results"
                  hidden
                ></div>
              </div>

              <div class="selected-patient-card" id="selected-patient-card" hidden>
                <div class="selected-patient-card__avatar" id="selected-patient-avatar">
                  --
                </div>

                <div class="selected-patient-card__body">
                  <div class="selected-patient-card__name" id="selected-patient-name">
                    Patient Name
                  </div>

                  <div class="selected-patient-card__meta" id="selected-patient-meta">
                    UHID
                  </div>
                </div>

                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  data-registration-change-patient
                >
                  Change
                </button>
              </div>

              <div class="registration-divider">
                <span>OR REGISTER NEW PATIENT</span>
              </div>

              <form id="registration-patient-form" novalidate>

                <div class="form-grid form-grid--three">

                  <label class="form-field">
                    <span class="form-label">
                      First Name <span class="required">*</span>
                    </span>
                    <input
                      type="text"
                      name="firstName"
                      class="form-input"
                      placeholder="First name"
                      required
                    />
                  </label>

                  <label class="form-field">
                    <span class="form-label">Middle Name</span>
                    <input
                      type="text"
                      name="middleName"
                      class="form-input"
                      placeholder="Middle name"
                    />
                  </label>

                  <label class="form-field">
                    <span class="form-label">
                      Last Name <span class="required">*</span>
                    </span>
                    <input
                      type="text"
                      name="lastName"
                      class="form-input"
                      placeholder="Last name"
                      required
                    />
                  </label>

                </div>

                <div class="form-grid form-grid--three">

                  <label class="form-field">
                    <span class="form-label">
                      Gender <span class="required">*</span>
                    </span>
                    <select name="gender" class="form-select" required>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  </label>

                  <label class="form-field">
                    <span class="form-label">Date of Birth</span>
                    <input
                      type="date"
                      name="dateOfBirth"
                      class="form-input"
                    />
                  </label>

                  <label class="form-field">
                    <span class="form-label">Blood Group</span>
                    <select name="bloodGroup" class="form-select">
                      <option value="">Unknown</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </label>

                </div>

                <div class="form-grid form-grid--two">

                  <label class="form-field">
                    <span class="form-label">
                      Phone Number <span class="required">*</span>
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      class="form-input"
                      placeholder="+91 XXXXX XXXXX"
                      required
                    />
                  </label>

                  <label class="form-field">
                    <span class="form-label">Email Address</span>
                    <input
                      type="email"
                      name="email"
                      class="form-input"
                      placeholder="patient@example.com"
                    />
                  </label>

                </div>

                <label class="form-field form-field--full">
                  <span class="form-label">Address</span>
                  <textarea
                    name="address"
                    class="form-textarea"
                    rows="2"
                    placeholder="Residential address"
                  ></textarea>
                </label>

                <div class="form-section-heading">
                  <span>Emergency Contact</span>
                </div>

                <div class="form-grid form-grid--two">

                  <label class="form-field">
                    <span class="form-label">Contact Name</span>
                    <input
                      type="text"
                      name="emergencyContactName"
                      class="form-input"
                      placeholder="Emergency contact name"
                    />
                  </label>

                  <label class="form-field">
                    <span class="form-label">Contact Phone</span>
                    <input
                      type="tel"
                      name="emergencyContactPhone"
                      class="form-input"
                      placeholder="Emergency contact number"
                    />
                  </label>

                </div>

                <div class="form-section-heading">
                  <span>Clinical Notes</span>
                </div>

                <label class="form-field form-field--full">
                  <span class="form-label">Known Allergies</span>
                  <input
                    type="text"
                    name="allergies"
                    class="form-input"
                    placeholder="Drug, food, or other allergies"
                  />
                </label>

                <label class="form-field form-field--full">
                  <span class="form-label">Medical Notes</span>
                  <textarea
                    name="medicalNotes"
                    class="form-textarea"
                    rows="3"
                    placeholder="Relevant medical information"
                  ></textarea>
                </label>

              </form>

            </section>

            <aside class="registration-sidebar">

              <section class="panel visit-panel">

                <div class="panel__header">
                  <div>
                    <h2 class="panel__title">Visit Details</h2>
                    <p class="panel__subtitle">
                      Configure today's visit.
                    </p>
                  </div>

                  <span class="status-pill status-pill--info">
                    Step 2 of 2
                  </span>
                </div>

                <div class="visit-form">

                  <label class="form-field form-field--full">
                    <span class="form-label">Visit Type</span>

                    <select
                      class="form-select"
                      id="registration-visit-type"
                    >
                      <option value="OPD">OPD Consultation</option>
                      <option value="follow-up">Follow-up Visit</option>
                      <option value="emergency">Emergency</option>
                      <option value="diagnostic">Diagnostic Visit</option>
                    </select>
                  </label>

                  <label class="form-field form-field--full">
                    <span class="form-label">
                      Department <span class="required">*</span>
                    </span>

                    <select
                      class="form-select"
                      id="registration-department"
                      required
                    >
                      <option value="">Select department</option>
                      ${departmentOptions}
                    </select>
                  </label>

                  <label class="form-field form-field--full">
                    <span class="form-label">Priority</span>

                    <select
                      class="form-select"
                      id="registration-priority"
                    >
                      <option value="normal">Normal</option>
                      <option value="priority">Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>

                  <label class="form-field form-field--full">
                    <span class="form-label">Chief Complaint</span>

                    <textarea
                      class="form-textarea"
                      id="registration-chief-complaint"
                      rows="3"
                      placeholder="Reason for today's visit"
                    ></textarea>
                  </label>

                </div>

                <div class="registration-summary" id="registration-summary">
                  <div class="summary-row">
                    <span>Patient</span>
                    <strong id="summary-patient">Not selected</strong>
                  </div>

                  <div class="summary-row">
                    <span>Department</span>
                    <strong id="summary-department">Not selected</strong>
                  </div>

                  <div class="summary-row">
                    <span>Visit</span>
                    <strong id="summary-visit">OPD Consultation</strong>
                  </div>
                </div>

                <button
                  type="button"
                  class="btn btn--primary btn--full"
                  id="registration-submit"
                >
                  Register Patient & Generate Token
                </button>

              </section>

              <section class="panel registration-info-panel">
                <div class="info-card">
                  <div class="info-card__icon">✓</div>
                  <div>
                    <h3>Registration Workflow</h3>
                    <p>
                      A permanent patient record, encounter, and queue token
                      will be created automatically.
                    </p>
                  </div>
                </div>

                <div class="info-card">
                  <div class="info-card__icon">ⓘ</div>
                  <div>
                    <h3>Next Step</h3>
                    <p>
                      The patient will appear in the Pre-Consultation Queue
                      for nursing vitals.
                    </p>
                  </div>
                </div>
              </section>

            </aside>

          </div>

        </section>
      `;
    },

    bindPageEvents(container) {
      const searchInput = container.querySelector(
        "#registration-patient-search"
      );

      const searchResults = container.querySelector(
        "#registration-search-results"
      );

      const patientForm = container.querySelector(
        "#registration-patient-form"
      );

      const departmentSelect = container.querySelector(
        "#registration-department"
      );

      const visitTypeSelect = container.querySelector(
        "#registration-visit-type"
      );

      const prioritySelect = container.querySelector(
        "#registration-priority"
      );

      const chiefComplaintInput = container.querySelector(
        "#registration-chief-complaint"
      );

      const submitButton = container.querySelector(
        "#registration-submit"
      );

      const clearButton = container.querySelector(
        "[data-registration-clear]"
      );

      const changePatientButton = container.querySelector(
        "[data-registration-change-patient]"
      );

      searchInput?.addEventListener(
        "input",
        this.debounce(async (event) => {
          const term = event.target.value.trim();

          this.state.searchTerm = term;

          if (!term) {
            searchResults.hidden = true;
            searchResults.innerHTML = "";
            return;
          }

          const patients = await this.searchPatients(term);

          this.renderPatientSearchResults(searchResults, patients);
        }, 250)
      );

      searchResults?.addEventListener("click", (event) => {
        const patientButton = event.target.closest(
          "[data-select-patient]"
        );

        if (!patientButton) return;

        const patientId = patientButton.dataset.selectPatient;
        const patient = this.state.patients.find(
          (item) => String(item.id) === String(patientId)
        );

        if (patient) {
          this.selectPatient(patient, container);
        }
      });

      changePatientButton?.addEventListener("click", () => {
        this.clearSelectedPatient(container);
      });

      departmentSelect?.addEventListener("change", (event) => {
        this.state.selectedDepartment = event.target.value;
        this.updateRegistrationSummary(container);
      });

      visitTypeSelect?.addEventListener("change", (event) => {
        this.state.selectedVisitType = event.target.value;
        this.updateRegistrationSummary(container);
      });

      prioritySelect?.addEventListener("change", (event) => {
        this.state.selectedPriority = event.target.value;
      });

      submitButton?.addEventListener("click", async () => {
        await this.handleRegistrationSubmit(container);
      });

      clearButton?.addEventListener("click", () => {
        this.resetRegistrationForm(container);
      });

      patientForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handleRegistrationSubmit(container);
      });

      this.updateRegistrationSummary(container);
    },

    renderPatientSearchResults(container, patients) {
      if (!container) return;

      if (!patients.length) {
        container.innerHTML = `
          <div class="search-empty">
            No matching patient found.
          </div>
        `;

        container.hidden = false;
        return;
      }

      container.innerHTML = patients
        .map((patient) => {
          const name = this.getPatientFullName(patient);
          const initials = this.getInitials(name);

          return `
            <button
              type="button"
              class="patient-search-result"
              data-select-patient="${this.escapeAttribute(patient.id)}"
            >
              <span class="patient-search-result__avatar">
                ${this.escapeHtml(initials)}
              </span>

              <span class="patient-search-result__body">
                <strong>${this.escapeHtml(name)}</strong>
                <small>
                  ${this.escapeHtml(patient.uhid || "No UHID")}
                  ·
                  ${this.escapeHtml(patient.phone || "No phone")}
                </small>
              </span>

              <span class="patient-search-result__arrow">›</span>
            </button>
          `;
        })
        .join("");

      container.hidden = false;
    },

    selectPatient(patient, container) {
      this.state.selectedPatient = patient;

      const searchInput = container.querySelector(
        "#registration-patient-search"
      );

      const searchResults = container.querySelector(
        "#registration-search-results"
      );

      const form = container.querySelector(
        "#registration-patient-form"
      );

      const selectedCard = container.querySelector(
        "#selected-patient-card"
      );

      const selectedAvatar = container.querySelector(
        "#selected-patient-avatar"
      );

      const selectedName = container.querySelector(
        "#selected-patient-name"
      );

      const selectedMeta = container.querySelector(
        "#selected-patient-meta"
      );

      const name = this.getPatientFullName(patient);

      if (searchInput) {
        searchInput.value = "";
      }

      if (searchResults) {
        searchResults.hidden = true;
        searchResults.innerHTML = "";
      }

      if (selectedAvatar) {
        selectedAvatar.textContent = this.getInitials(name);
      }

      if (selectedName) {
        selectedName.textContent = name;
      }

      if (selectedMeta) {
        selectedMeta.textContent = [
          patient.uhid || "No UHID",
          patient.phone || "No phone"
        ]
          .filter(Boolean)
          .join(" · ");
      }

      if (selectedCard) {
        selectedCard.hidden = false;
      }

      if (form) {
        form.classList.add("registration-form--existing-patient");
      }

      this.fillPatientForm(form, patient);
      this.updateRegistrationSummary(container);
    },

    clearSelectedPatient(container) {
      this.state.selectedPatient = null;

      const selectedCard = container.querySelector(
        "#selected-patient-card"
      );

      const form = container.querySelector(
        "#registration-patient-form"
      );

      if (selectedCard) {
        selectedCard.hidden = true;
      }

      if (form) {
        form.classList.remove("registration-form--existing-patient");
        form.reset();
      }

      this.updateRegistrationSummary(container);
    },

    fillPatientForm(form, patient) {
      if (!form || !patient) return;

      const fields = [
        "firstName",
        "middleName",
        "lastName",
        "gender",
        "dateOfBirth",
        "phone",
        "email",
        "bloodGroup",
        "address",
        "emergencyContactName",
        "emergencyContactPhone",
        "allergies",
        "medicalNotes"
      ];

      fields.forEach((fieldName) => {
        const field = form.elements[fieldName];

        if (field) {
          field.value = patient[fieldName] || "";
        }
      });
    },

    async handleRegistrationSubmit(container) {
      if (this.state.isSaving) return;

      const form = container.querySelector(
        "#registration-patient-form"
      );

      const departmentSelect = container.querySelector(
        "#registration-department"
      );

      const visitTypeSelect = container.querySelector(
        "#registration-visit-type"
      );

      const prioritySelect = container.querySelector(
        "#registration-priority"
      );

      const chiefComplaintInput = container.querySelector(
        "#registration-chief-complaint"
      );

      const submitButton = container.querySelector(
        "#registration-submit"
      );

      const departmentId = departmentSelect?.value || "";

      if (!departmentId) {
        this.showErrorMessage("Please select a department.");
        departmentSelect?.focus();
        return;
      }

      const formData = form
        ? Object.fromEntries(new FormData(form).entries())
        : {};

      const hasSelectedExistingPatient = Boolean(
        this.state.selectedPatient
      );

      const hasNewPatientData =
        formData.firstName ||
        formData.lastName ||
        formData.phone;

      if (!hasSelectedExistingPatient && !hasNewPatientData) {
        this.showErrorMessage(
          "Please select an existing patient or enter new patient details."
        );
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = `
          <span class="button-spinner"></span>
          Processing Registration...
        `;
      }

      try {
        const registration = await this.registerVisit({
          patient: this.state.selectedPatient,
          patientData: this.state.selectedPatient
            ? null
            : formData,
          departmentId,
          visitType: visitTypeSelect?.value || "OPD",
          priority: prioritySelect?.value || "normal",
          chiefComplaint: chiefComplaintInput?.value || ""
        });

        this.renderRegistrationReceipt(container, registration);
      } catch (error) {
        console.error("[AURA Registration] Submit error:", error);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent =
            "Register Patient & Generate Token";
        }
      }
    },

    renderRegistrationReceipt(container, registration) {
      const existingReceipt = container.querySelector(
        "#registration-receipt"
      );

      existingReceipt?.remove();

      const patientName = this.getPatientFullName(registration.patient);
      const department = registration.encounter.departmentName;
      const token = registration.queue.tokenDisplay;

      const receipt = document.createElement("div");

      receipt.id = "registration-receipt";
      receipt.className = "registration-receipt";

      receipt.innerHTML = `
        <div class="registration-receipt__header">
          <div class="registration-receipt__success-icon">✓</div>

          <div>
            <span class="eyebrow">REGISTRATION SUCCESSFUL</span>
            <h2>Patient Added to Queue</h2>
            <p>The visit record has been created successfully.</p>
          </div>
        </div>

        <div class="registration-receipt__token">
          <span class="registration-receipt__token-label">
            QUEUE TOKEN
          </span>

          <strong>${this.escapeHtml(token)}</strong>

          <span class="registration-receipt__token-department">
            ${this.escapeHtml(department)}
          </span>
        </div>

        <div class="registration-receipt__details">
          <div>
            <span>Patient</span>
            <strong>${this.escapeHtml(patientName)}</strong>
          </div>

          <div>
            <span>UHID</span>
            <strong>${this.escapeHtml(registration.patient.uhid)}</strong>
          </div>

          <div>
            <span>Visit Type</span>
            <strong>${this.escapeHtml(
              registration.encounter.visitType
            )}</strong>
          </div>

          <div>
            <span>Status</span>
            <strong>Waiting for Pre-Consultation</strong>
          </div>
        </div>

        <div class="registration-receipt__actions">
          <button
            type="button"
            class="btn btn--secondary"
            data-registration-new
          >
            Register Another Patient
          </button>

          <button
            type="button"
            class="btn btn--primary"
            data-registration-open-queue
          >
            Open Queue
          </button>
        </div>
      `;

      const pageHeader = container.querySelector(".page-header");

      if (pageHeader) {
        pageHeader.insertAdjacentElement("afterend", receipt);
      } else {
        container.prepend(receipt);
      }

      receipt
        .querySelector("[data-registration-new]")
        ?.addEventListener("click", () => {
          this.resetRegistrationForm(container);
          receipt.remove();
        });

      receipt
        .querySelector("[data-registration-open-queue]")
        ?.addEventListener("click", () => {
          if (typeof window.AURA?.navigate === "function") {
            window.AURA.navigate("queue");
          } else if (ROUTER?.navigate) {
            ROUTER.navigate("queue");
          } else {
            window.location.hash = "#queue";
          }
        });

      receipt.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    },

    resetRegistrationForm(container) {
      this.state.selectedPatient = null;
      this.state.searchTerm = "";
      this.state.selectedDepartment = "";
      this.state.selectedVisitType = "OPD";
      this.state.lastRegistration = null;

      const form = container.querySelector(
        "#registration-patient-form"
      );

      const searchInput = container.querySelector(
        "#registration-patient-search"
      );

      const searchResults = container.querySelector(
        "#registration-search-results"
      );

      const selectedCard = container.querySelector(
        "#selected-patient-card"
      );

      const departmentSelect = container.querySelector(
        "#registration-department"
      );

      const visitTypeSelect = container.querySelector(
        "#registration-visit-type"
      );

      const prioritySelect = container.querySelector(
        "#registration-priority"
      );

      const chiefComplaintInput = container.querySelector(
        "#registration-chief-complaint"
      );

      const receipt = container.querySelector(
        "#registration-receipt"
      );

      form?.reset();

      if (searchInput) {
        searchInput.value = "";
      }

      if (searchResults) {
        searchResults.hidden = true;
        searchResults.innerHTML = "";
      }

      if (selectedCard) {
        selectedCard.hidden = true;
      }

      if (departmentSelect) {
        departmentSelect.value = "";
      }

      if (visitTypeSelect) {
        visitTypeSelect.value = "OPD";
      }

      if (prioritySelect) {
        prioritySelect.value = "normal";
      }

      if (chiefComplaintInput) {
        chiefComplaintInput.value = "";
      }

      receipt?.remove();

      this.updateRegistrationSummary(container);
    },

    updateRegistrationSummary(container) {
      const patientNameElement = container.querySelector(
        "#summary-patient"
      );

      const departmentElement = container.querySelector(
        "#summary-department"
      );

      const visitElement = container.querySelector(
        "#summary-visit"
      );

      const departmentSelect = container.querySelector(
        "#registration-department"
      );

      const visitTypeSelect = container.querySelector(
        "#registration-visit-type"
      );

      const patientName = this.state.selectedPatient
        ? this.getPatientFullName(this.state.selectedPatient)
        : "New patient";

      const selectedDepartment =
        departmentSelect?.selectedOptions?.[0]?.textContent?.trim() ||
        "Not selected";

      const selectedVisit =
        visitTypeSelect?.selectedOptions?.[0]?.textContent?.trim() ||
        "OPD Consultation";

      if (patientNameElement) {
        patientNameElement.textContent = patientName;
      }

      if (departmentElement) {
        departmentElement.textContent = selectedDepartment;
      }

      if (visitElement) {
        visitElement.textContent = selectedVisit;
      }
    },

    bindGlobalEvents() {
      if (!EVENTS?.on) return;

      EVENTS.on("patient:created", () => {
        this.loadPatients();
      });

      EVENTS.on("patient:updated", () => {
        this.loadPatients();
      });

      EVENTS.on("storage:change", (payload) => {
        if (
          payload?.storeName === STORE_PATIENTS ||
          payload?.store === STORE_PATIENTS
        ) {
          this.loadPatients();
        }
      });
    },

    bindDocumentEvents() {
      document.addEventListener("click", (event) => {
        const searchContainer = event.target.closest(
          ".registration-search"
        );

        if (!searchContainer) {
          const results = document.querySelector(
            "#registration-search-results"
          );

          if (results && !event.target.closest("#registration-patient-search")) {
            results.hidden = true;
          }
        }
      });
    },

    getInitials(name) {
      const value = String(name || "").trim();

      if (!value) return "--";

      const parts = value.split(/\s+/);

      if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
      }

      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    },

    escapeHtml(value) {
      if (typeof UTILS.escapeHtml === "function") {
        return UTILS.escapeHtml(value);
      }

      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    escapeAttribute(value) {
      return this.escapeHtml(value);
    },

    debounce(callback, delay) {
      if (typeof UTILS.debounce === "function") {
        return UTILS.debounce(callback, delay);
      }

      let timeoutId;

      return function (...args) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
          callback.apply(this, args);
        }, delay);
      };
    }
  };

  window.AURA_REGISTRATION = MODULE;

  window.AURA = window.AURA || {};
  window.AURA.registration = MODULE;

  if (window.AURA_APP?.registerModule) {
    window.AURA_APP.registerModule(MODULE_NAME, MODULE);
  }

  if (window.AURA_ROUTER?.register) {
    window.AURA_ROUTER.register("registration", {
      title: "Patient Registration",
      module: MODULE,
      render: () => MODULE.render()
    });
  }

  MODULE.init();

})(window);