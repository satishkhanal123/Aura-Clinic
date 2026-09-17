(function (window) {
  "use strict";

  const AURA = window.AURA || {};
  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS || {};

  const STORE_QUEUES = "queues";
  const STORE_PATIENTS = "patients";
  const STORE_ENCOUNTERS = "encounters";
  const STORE_VITALS = "vitals";

  const MODULE_NAME = "queue";

  const STATUS = {
    WAITING: "waiting",
    CALLED: "called",
    IN_PROGRESS: "in-progress",
    COMPLETED: "completed",
    SKIPPED: "skipped",
    CANCELLED: "cancelled"
  };

  const DEFAULT_DEPARTMENTS = [
    {
      id: "general-medicine",
      name: "General Medicine",
      queueCode: "GM"
    },
    {
      id: "pediatrics",
      name: "Pediatrics",
      queueCode: "PD"
    },
    {
      id: "pathology",
      name: "Pathology",
      queueCode: "PL"
    },
    {
      id: "radiology",
      name: "Radiology",
      queueCode: "RD"
    }
  ];

  const MODULE = {
    name: MODULE_NAME,

    state: {
      queues: [],
      patients: [],
      encounters: [],
      selectedDepartment: "all",
      selectedStatus: "active",
      searchTerm: "",
      currentQueue: null,
      isLoading: false,
      isCalling: false,
      lastUpdated: null
    },

    initialized: false,

    init() {
      if (this.initialized) return this;

      this.initialized = true;

      this.bindGlobalEvents();

      return this;
    },

    async loadData() {
      this.state.isLoading = true;

      try {
        if (!STORAGE) {
          this.state.queues = [];
          this.state.patients = [];
          this.state.encounters = [];
          return;
        }

        const [queues, patients, encounters] = await Promise.all([
          STORAGE.getAll(STORE_QUEUES),
          STORAGE.getAll(STORE_PATIENTS),
          STORAGE.getAll(STORE_ENCOUNTERS)
        ]);

        this.state.queues = Array.isArray(queues) ? queues : [];
        this.state.patients = Array.isArray(patients) ? patients : [];
        this.state.encounters = Array.isArray(encounters) ? encounters : [];
        this.state.lastUpdated = new Date().toISOString();
      } catch (error) {
        console.error("[AURA Queue] Failed to load queue data:", error);
      } finally {
        this.state.isLoading = false;
      }
    },

    getDepartments() {
      const configured =
        CONFIG?.workflow?.departments ||
        CONFIG?.departments ||
        CONFIG?.clinic?.departments;

      if (Array.isArray(configured) && configured.length) {
        return configured;
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

    getToday() {
      return new Date().toISOString().split("T")[0];
    },

    getActiveStatuses() {
      return [
        STATUS.WAITING,
        STATUS.CALLED,
        STATUS.IN_PROGRESS
      ];
    },

    getFilteredQueues() {
      const today = this.getToday();
      const searchTerm = this.state.searchTerm.trim().toLowerCase();

      return this.state.queues
        .filter((queue) => {
          if (queue.date && queue.date !== today) {
            return false;
          }

          if (
            this.state.selectedDepartment !== "all" &&
            queue.departmentId !== this.state.selectedDepartment
          ) {
            return false;
          }

          if (this.state.selectedStatus === "active") {
            return this.getActiveStatuses().includes(queue.status);
          }

          if (
            this.state.selectedStatus !== "all" &&
            queue.status !== this.state.selectedStatus
          ) {
            return false;
          }

          if (searchTerm) {
            const searchable = [
              queue.tokenDisplay,
              queue.tokenNumber,
              queue.patientName,
              queue.uhid,
              queue.departmentName
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            if (!searchable.includes(searchTerm)) {
              return false;
            }
          }

          return true;
        })
        .sort((a, b) => {
          const priorityOrder = {
            urgent: 1,
            priority: 2,
            normal: 3
          };

          const priorityDifference =
            (priorityOrder[a.priority] || 3) -
            (priorityOrder[b.priority] || 3);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return (
            Number(a.tokenNumber || 0) -
            Number(b.tokenNumber || 0)
          );
        });
    },

    getQueueStats() {
      const today = this.getToday();

      const todayQueues = this.state.queues.filter(
        (queue) => !queue.date || queue.date === today
      );

      return {
        total: todayQueues.length,

        waiting: todayQueues.filter(
          (queue) => queue.status === STATUS.WAITING
        ).length,

        called: todayQueues.filter(
          (queue) => queue.status === STATUS.CALLED
        ).length,

        inProgress: todayQueues.filter(
          (queue) => queue.status === STATUS.IN_PROGRESS
        ).length,

        completed: todayQueues.filter(
          (queue) => queue.status === STATUS.COMPLETED
        ).length,

        skipped: todayQueues.filter(
          (queue) => queue.status === STATUS.SKIPPED
        ).length,

        urgent: todayQueues.filter(
          (queue) =>
            queue.priority === "urgent" &&
            this.getActiveStatuses().includes(queue.status)
        ).length
      };
    },

    async getPatient(patientId) {
      if (!patientId || !STORAGE) return null;

      try {
        return await STORAGE.get(STORE_PATIENTS, patientId);
      } catch (error) {
        return null;
      }
    },

    async getEncounter(encounterId) {
      if (!encounterId || !STORAGE) return null;

      try {
        return await STORAGE.get(STORE_ENCOUNTERS, encounterId);
      } catch (error) {
        return null;
      }
    },

    async getQueueById(queueId) {
      if (!queueId || !STORAGE) return null;

      try {
        return await STORAGE.get(STORE_QUEUES, queueId);
      } catch (error) {
        return null;
      }
    },

    async updateQueue(queueId, updates) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const existingQueue = await this.getQueueById(queueId);

      if (!existingQueue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = {
        ...existingQueue,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const savedQueue = await STORAGE.put(
        STORE_QUEUES,
        updatedQueue
      );

      const finalQueue = savedQueue || updatedQueue;

      this.replaceQueueInState(finalQueue);

      return finalQueue;
    },

    replaceQueueInState(queue) {
      const index = this.state.queues.findIndex(
        (item) => String(item.id) === String(queue.id)
      );

      if (index === -1) {
        this.state.queues.push(queue);
      } else {
        this.state.queues[index] = queue;
      }
    },

    async callPatient(queueId) {
      if (this.state.isCalling) return null;

      this.state.isCalling = true;

      try {
        const queue = await this.getQueueById(queueId);

        if (!queue) {
          throw new Error("Queue record not found.");
        }

        if (
          ![
            STATUS.WAITING,
            STATUS.SKIPPED
          ].includes(queue.status)
        ) {
          throw new Error("This patient cannot be called from the current status.");
        }

        const now = new Date().toISOString();

        const updatedQueue = await this.updateQueue(queueId, {
          status: STATUS.CALLED,
          calledAt: now,
          calledBy: this.getCurrentUserId(),
          lastCalledAt: now,
          callCount: Number(queue.callCount || 0) + 1
        });

        this.state.currentQueue = updatedQueue;

        if (EVENTS?.queueCalled) {
          EVENTS.queueCalled(updatedQueue);
        }

        this.announcePatient(updatedQueue);

        this.showToast(
          "success",
          "Patient Called",
          `${updatedQueue.tokenDisplay || updatedQueue.tokenNumber} — ${updatedQueue.patientName}`
        );

        return updatedQueue;
      } catch (error) {
        this.showToast(
          "error",
          "Unable to Call Patient",
          error.message
        );

        throw error;
      } finally {
        this.state.isCalling = false;
      }
    },

    async callNextPatient(departmentId) {
      const department =
        departmentId ||
        this.state.selectedDepartment;

      const candidates = this.state.queues
        .filter((queue) => {
          if (queue.date && queue.date !== this.getToday()) {
            return false;
          }

          if (
            department !== "all" &&
            queue.departmentId !== department
          ) {
            return false;
          }

          return queue.status === STATUS.WAITING;
        })
        .sort((a, b) => {
          const priorityOrder = {
            urgent: 1,
            priority: 2,
            normal: 3
          };

          const priorityDifference =
            (priorityOrder[a.priority] || 3) -
            (priorityOrder[b.priority] || 3);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return (
            Number(a.tokenNumber || 0) -
            Number(b.tokenNumber || 0)
          );
        });

      const nextPatient = candidates[0];

      if (!nextPatient) {
        this.showToast(
          "info",
          "Queue Empty",
          "No waiting patients are available for this department."
        );

        return null;
      }

      return this.callPatient(nextPatient.id);
    },

    async startPreConsultation(queueId) {
      const queue = await this.getQueueById(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      if (![STATUS.CALLED, STATUS.WAITING].includes(queue.status)) {
        throw new Error(
          "This patient cannot start pre-consultation."
        );
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.IN_PROGRESS,
        startedAt: new Date().toISOString(),
        stage: "nursing",
        assignedTo: this.getCurrentUserId()
      });

      this.state.currentQueue = updatedQueue;

      if (EVENTS?.queueStarted) {
        EVENTS.queueStarted(updatedQueue);
      }

      this.showToast(
        "info",
        "Pre-Consultation Started",
        `${updatedQueue.patientName} is ready for vitals.`
      );

      return updatedQueue;
    },

    async completePreConsultation(queueId, vitals = {}) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const queue = await this.getQueueById(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const now = new Date().toISOString();

      const vitalRecord = {
        id: this.createId("vitals"),
        patientId: queue.patientId,
        uhid: queue.uhid,
        encounterId: queue.encounterId,
        queueId: queue.id,
        recordedBy: this.getCurrentUserId(),
        recordedAt: now,
        temperature: vitals.temperature || "",
        pulse: vitals.pulse || "",
        respiratoryRate: vitals.respiratoryRate || "",
        bloodPressureSystolic: vitals.bloodPressureSystolic || "",
        bloodPressureDiastolic: vitals.bloodPressureDiastolic || "",
        oxygenSaturation: vitals.oxygenSaturation || "",
        weight: vitals.weight || "",
        height: vitals.height || "",
        bmi: vitals.bmi || "",
        notes: vitals.notes || "",
        createdAt: now,
        updatedAt: now
      };

      const savedVitals = await STORAGE.add(
        STORE_VITALS,
        vitalRecord
      );

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.COMPLETED,
        completedAt: now,
        stage: "doctor",
        nextStage: "doctor-consultation",
        vitalsId: savedVitals?.id || vitalRecord.id
      });

      this.state.currentQueue = updatedQueue;

      if (EVENTS?.vitalsRecorded) {
        EVENTS.vitalsRecorded(savedVitals || vitalRecord);
      }

      if (EVENTS?.queueCompleted) {
        EVENTS.queueCompleted(updatedQueue);
      }

      this.showToast(
        "success",
        "Pre-Consultation Completed",
        `${updatedQueue.patientName} has been moved to Doctor Consultation.`
      );

      return {
        queue: updatedQueue,
        vitals: savedVitals || vitalRecord
      };
    },

    async skipPatient(queueId, reason = "") {
      const queue = await this.getQueueById(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.SKIPPED,
        skippedAt: new Date().toISOString(),
        skippedBy: this.getCurrentUserId(),
        skipReason: reason
      });

      if (EVENTS?.queueSkipped) {
        EVENTS.queueSkipped(updatedQueue);
      }

      this.showToast(
        "warning",
        "Patient Skipped",
        `${updatedQueue.patientName} has been marked as skipped.`
      );

      return updatedQueue;
    },

    async recallPatient(queueId) {
      const queue = await this.getQueueById(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.CALLED,
        lastCalledAt: new Date().toISOString(),
        callCount: Number(queue.callCount || 0) + 1
      });

      this.state.currentQueue = updatedQueue;

      this.announcePatient(updatedQueue);

      if (EVENTS?.queueCalled) {
        EVENTS.queueCalled(updatedQueue);
      }

      return updatedQueue;
    },

    async cancelQueueEntry(queueId, reason = "") {
      const queue = await this.getQueueById(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.CANCELLED,
        cancelledAt: new Date().toISOString(),
        cancelledBy: this.getCurrentUserId(),
        cancellationReason: reason
      });

      if (EVENTS?.queueCancelled) {
        EVENTS.queueCancelled(updatedQueue);
      }

      this.showToast(
        "info",
        "Queue Entry Cancelled",
        `${updatedQueue.patientName} has been removed from the active queue.`
      );

      return updatedQueue;
    },

    announcePatient(queue) {
      if (!queue) return;

      const message =
        `Token ${queue.tokenDisplay || queue.tokenNumber}. ` +
        `${queue.patientName}. ` +
        `Please proceed to ${queue.departmentName || "the consultation area"}.`;

      if (
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance === "function"
      ) {
        try {
          window.speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(message);

          utterance.rate = 0.9;
          utterance.pitch = 1;
          utterance.volume = 1;

          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.warn("[AURA Queue] Voice announcement failed:", error);
        }
      }

      if (typeof window.AURA?.emit === "function") {
        window.AURA.emit("queue:announcement", {
          queue,
          message
        });
      }
    },

    getCurrentUserId() {
      const auth = window.AURA_AUTH || window.AURA_AUTHENTICATION;

      if (auth?.getCurrentUser) {
        const user = auth.getCurrentUser();
        return user?.id || null;
      }

      if (auth?.getState) {
        const state = auth.getState();
        return state?.user?.id || null;
      }

      return "local-user";
    },

    createId(prefix) {
      if (typeof UTILS.createId === "function") {
        return UTILS.createId(prefix);
      }

      return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    },

    showToast(type, title, message) {
      if (typeof window.AURA?.toast === "function") {
        window.AURA.toast({
          type,
          title,
          message
        });
      }
    },

    async render(container) {
      const target =
        container ||
        document.querySelector('[data-route-view="queue"]') ||
        document.getElementById("app-content");

      if (!target) return;

      target.innerHTML = this.getLoadingMarkup();

      await this.loadData();

      target.innerHTML = this.getPageMarkup();

      this.bindPageEvents(target);
      this.renderQueueTable(target);
      this.updateStats(target);
    },

    getLoadingMarkup() {
      return `
        <section class="page-shell queue-page">
          <div class="page-header">
            <div>
              <div class="skeleton skeleton--title"></div>
              <div class="skeleton skeleton--text"></div>
            </div>
          </div>

          <div class="queue-stats-grid">
            <div class="skeleton skeleton--card"></div>
            <div class="skeleton skeleton--card"></div>
            <div class="skeleton skeleton--card"></div>
            <div class="skeleton skeleton--card"></div>
          </div>

          <div class="skeleton skeleton--table"></div>
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
        <section class="page-shell queue-page">

          <div class="page-header">
            <div>
              <span class="eyebrow">CENTRAL QUEUE MANAGEMENT</span>
              <h1 class="page-title">Patient Queue</h1>
              <p class="page-subtitle">
                Manage waiting patients, token calling, and pre-consultation flow.
              </p>
            </div>

            <div class="page-header__actions">
              <button
                type="button"
                class="btn btn--secondary"
                data-queue-refresh
              >
                Refresh
              </button>

              <button
                type="button"
                class="btn btn--primary"
                data-queue-call-next
              >
                Call Next Patient
              </button>
            </div>
          </div>

          <div class="queue-stats-grid">

            <article class="metric-card">
              <div class="metric-card__icon">◉</div>
              <div>
                <span class="metric-card__label">Total Today</span>
                <strong class="metric-card__value" data-queue-stat="total">0</strong>
              </div>
            </article>

            <article class="metric-card">
              <div class="metric-card__icon">◷</div>
              <div>
                <span class="metric-card__label">Waiting</span>
                <strong class="metric-card__value" data-queue-stat="waiting">0</strong>
              </div>
            </article>

            <article class="metric-card">
              <div class="metric-card__icon">◌</div>
              <div>
                <span class="metric-card__label">In Progress</span>
                <strong class="metric-card__value" data-queue-stat="inProgress">0</strong>
              </div>
            </article>

            <article class="metric-card">
              <div class="metric-card__icon">✓</div>
              <div>
                <span class="metric-card__label">Completed</span>
                <strong class="metric-card__value" data-queue-stat="completed">0</strong>
              </div>
            </article>

          </div>

          <section class="panel queue-panel">

            <div class="panel__header queue-panel__header">
              <div>
                <h2 class="panel__title">Today's Queue</h2>
                <p class="panel__subtitle">
                  Patients registered for clinical services today.
                </p>
              </div>

              <div class="queue-panel__live">
                <span class="live-indicator"></span>
                Live Queue
              </div>
            </div>

            <div class="queue-toolbar">

              <label class="form-field queue-toolbar__search">
                <span class="form-label sr-only">Search queue</span>

                <div class="input-with-icon">
                  <span class="input-icon">⌕</span>
                  <input
                    type="search"
                    class="form-input"
                    id="queue-search"
                    placeholder="Search token, UHID, or patient"
                  />
                </div>
              </label>

              <label class="form-field">
                <span class="form-label sr-only">Department</span>

                <select
                  class="form-select"
                  id="queue-department-filter"
                >
                  <option value="all">All Departments</option>
                  ${departmentOptions}
                </select>
              </label>

              <label class="form-field">
                <span class="form-label sr-only">Queue status</span>

                <select
                  class="form-select"
                  id="queue-status-filter"
                >
                  <option value="active">Active Queue</option>
                  <option value="all">All Records</option>
                  <option value="waiting">Waiting</option>
                  <option value="called">Called</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

            </div>

            <div class="queue-table-wrapper">
              <table class="data-table queue-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient</th>
                    <th>Department</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>

                <tbody id="queue-table-body"></tbody>
              </table>
            </div>

            <div
              class="queue-empty-state"
              id="queue-empty-state"
              hidden
            >
              <div class="empty-state">
                <div class="empty-state__icon">◌</div>
                <h3>No patients in the queue</h3>
                <p>
                  Registered patients will appear here automatically.
                </p>
              </div>
            </div>

          </section>

          <section class="queue-workflow-strip">

            <div class="workflow-step workflow-step--active">
              <span class="workflow-step__number">1</span>
              <div>
                <strong>Reception</strong>
                <small>Registration & Token</small>
              </div>
            </div>

            <div class="workflow-arrow">→</div>

            <div class="workflow-step">
              <span class="workflow-step__number">2</span>
              <div>
                <strong>Nursing</strong>
                <small>Vitals & Pre-Consultation</small>
              </div>
            </div>

            <div class="workflow-arrow">→</div>

            <div class="workflow-step">
              <span class="workflow-step__number">3</span>
              <div>
                <strong>Doctor</strong>
                <small>Consultation & Diagnosis</small>
              </div>
            </div>

          </section>

        </section>
      `;
    },

    renderQueueTable(container) {
      const tableBody = container.querySelector(
        "#queue-table-body"
      );

      const emptyState = container.querySelector(
        "#queue-empty-state"
      );

      if (!tableBody) return;

      const queues = this.getFilteredQueues();

      if (!queues.length) {
        tableBody.innerHTML = "";

        if (emptyState) {
          emptyState.hidden = false;
        }

        return;
      }

      if (emptyState) {
        emptyState.hidden = true;
      }

      tableBody.innerHTML = queues
        .map((queue) => this.getQueueRowMarkup(queue))
        .join("");

      tableBody.querySelectorAll("[data-queue-action]").forEach(
        (button) => {
          button.addEventListener("click", () => {
            const action = button.dataset.queueAction;
            const queueId = button.dataset.queueId;

            this.handleQueueAction(action, queueId, container);
          });
        }
      );
    },

    getQueueRowMarkup(queue) {
      const statusClass = this.getStatusClass(queue.status);
      const priorityClass = this.getPriorityClass(queue.priority);

      const registeredTime = queue.registeredAt
        ? new Date(queue.registeredAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "--";

      return `
        <tr data-queue-row="${this.escapeAttribute(queue.id)}">

          <td>
            <div class="queue-token">
              <strong>${this.escapeHtml(
                queue.tokenDisplay || queue.tokenNumber || "--"
              )}</strong>
            </div>
          </td>

          <td>
            <div class="queue-patient">
              <div class="queue-patient__avatar">
                ${this.escapeHtml(this.getInitials(queue.patientName))}
              </div>

              <div class="queue-patient__body">
                <strong>${this.escapeHtml(queue.patientName || "Unknown Patient")}</strong>
                <small>${this.escapeHtml(queue.uhid || "No UHID")}</small>
              </div>
            </div>
          </td>

          <td>
            <span class="queue-department">
              ${this.escapeHtml(queue.departmentName || "--")}
            </span>
          </td>

          <td>
            <span class="priority-badge ${priorityClass}">
              ${this.escapeHtml(this.getPriorityLabel(queue.priority))}
            </span>
          </td>

          <td>
            <span class="status-pill ${statusClass}">
              ${this.escapeHtml(this.getStatusLabel(queue.status))}
            </span>
          </td>

          <td>
            <span class="table-secondary-text">
              ${registeredTime}
            </span>
          </td>

          <td class="text-right">
            <div class="table-actions">
              ${this.getActionButtonsMarkup(queue)}
            </div>
          </td>

        </tr>
      `;
    },

    getActionButtonsMarkup(queue) {
      const buttons = [];

      if (queue.status === STATUS.WAITING) {
        buttons.push(`
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-queue-action="call"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Call
          </button>
        `);
      }

      if (queue.status === STATUS.CALLED) {
        buttons.push(`
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-queue-action="start"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Start
          </button>

          <button
            type="button"
            class="btn btn--ghost btn--sm"
            data-queue-action="recall"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Recall
          </button>
        `);
      }

      if (queue.status === STATUS.IN_PROGRESS) {
        buttons.push(`
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            data-queue-action="complete"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Complete
          </button>
        `);
      }

      if (queue.status === STATUS.SKIPPED) {
        buttons.push(`
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-queue-action="call"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Call Again
          </button>
        `);
      }

      if (
        [
          STATUS.WAITING,
          STATUS.CALLED,
          STATUS.IN_PROGRESS
        ].includes(queue.status)
      ) {
        buttons.push(`
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            data-queue-action="skip"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Skip
          </button>
        `);
      }

      return buttons.join("");
    },

    async handleQueueAction(action, queueId, container) {
      try {
        switch (action) {
          case "call":
            await this.callPatient(queueId);
            break;

          case "recall":
            await this.recallPatient(queueId);
            break;

          case "start":
            await this.startPreConsultation(queueId);
            break;

          case "complete":
            await this.completeQueueWithoutVitals(queueId);
            break;

          case "skip": {
            const reason = window.prompt(
              "Reason for skipping this patient (optional):",
              ""
            );

            if (reason === null) return;

            await this.skipPatient(queueId, reason);
            break;
          }

          default:
            return;
        }

        await this.loadData();

        this.renderQueueTable(container);
        this.updateStats(container);
      } catch (error) {
        console.error("[AURA Queue] Action failed:", error);
      }
    },

    async completeQueueWithoutVitals(queueId) {
      const queue = await this.getQueueById(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.COMPLETED,
        completedAt: new Date().toISOString()
      });

      if (EVENTS?.queueCompleted) {
        EVENTS.queueCompleted(updatedQueue);
      }

      this.showToast(
        "success",
        "Queue Completed",
        `${updatedQueue.patientName} has been completed.`
      );

      return updatedQueue;
    },

    bindPageEvents(container) {
      const searchInput = container.querySelector(
        "#queue-search"
      );

      const departmentFilter = container.querySelector(
        "#queue-department-filter"
      );

      const statusFilter = container.querySelector(
        "#queue-status-filter"
      );

      const refreshButton = container.querySelector(
        "[data-queue-refresh]"
      );

      const callNextButton = container.querySelector(
        "[data-queue-call-next]"
      );

      searchInput?.addEventListener(
        "input",
        this.debounce((event) => {
          this.state.searchTerm = event.target.value || "";
          this.renderQueueTable(container);
        }, 250)
      );

      departmentFilter?.addEventListener("change", (event) => {
        this.state.selectedDepartment = event.target.value;
        this.renderQueueTable(container);
      });

      statusFilter?.addEventListener("change", (event) => {
        this.state.selectedStatus = event.target.value;
        this.renderQueueTable(container);
      });

      refreshButton?.addEventListener("click", async () => {
        await this.loadData();
        this.renderQueueTable(container);
        this.updateStats(container);

        this.showToast(
          "success",
          "Queue Refreshed",
          "Latest queue records have been loaded."
        );
      });

      callNextButton?.addEventListener("click", async () => {
        await this.callNextPatient(this.state.selectedDepartment);

        await this.loadData();

        this.renderQueueTable(container);
        this.updateStats(container);
      });
    },

    updateStats(container) {
      const stats = this.getQueueStats();

      Object.entries(stats).forEach(([key, value]) => {
        const element = container.querySelector(
          `[data-queue-stat="${key}"]`
        );

        if (element) {
          element.textContent = value;
        }
      });
    },

    getStatusLabel(status) {
      const labels = {
        waiting: "Waiting",
        called: "Called",
        "in-progress": "In Progress",
        completed: "Completed",
        skipped: "Skipped",
        cancelled: "Cancelled"
      };

      return labels[status] || status || "Unknown";
    },

    getStatusClass(status) {
      const classes = {
        waiting: "status-pill--warning",
        called: "status-pill--info",
        "in-progress": "status-pill--success",
        completed: "status-pill--success",
        skipped: "status-pill--muted",
        cancelled: "status-pill--danger"
      };

      return classes[status] || "status-pill--muted";
    },

    getPriorityLabel(priority) {
      const labels = {
        normal: "Normal",
        priority: "Priority",
        urgent: "Urgent"
      };

      return labels[priority] || "Normal";
    },

    getPriorityClass(priority) {
      const classes = {
        normal: "priority-badge--normal",
        priority: "priority-badge--priority",
        urgent: "priority-badge--urgent"
      };

      return classes[priority] || "priority-badge--normal";
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
    },

    bindGlobalEvents() {
      if (!EVENTS?.on) return;

      const refreshEvents = [
        "queue:created",
        "queue:called",
        "queue:completed",
        "queue:skipped",
        "queue:cancelled",
        "registration:completed",
        "storage:change"
      ];

      refreshEvents.forEach((eventName) => {
        EVENTS.on(eventName, async () => {
          await this.loadData();

          const container =
            document.querySelector('[data-route-view="queue"]') ||
            document.getElementById("app-content");

          if (container?.querySelector("#queue-table-body")) {
            this.renderQueueTable(container);
            this.updateStats(container);
          }
        });
      });
    }
  };

  window.AURA_QUEUE = MODULE;

  window.AURA = window.AURA || {};
  window.AURA.queue = MODULE;

  if (window.AURA_APP?.registerModule) {
    window.AURA_APP.registerModule(MODULE_NAME, MODULE);
  }

  if (window.AURA_ROUTER?.register) {
    window.AURA_ROUTER.register("queue", {
      title: "Patient Queue",
      module: MODULE,
      render: () => MODULE.render()
    });
  }

  MODULE.init();

})(window);