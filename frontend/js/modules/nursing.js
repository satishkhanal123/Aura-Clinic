(function (window) {
  "use strict";

  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS || {};

  const STORE_QUEUES = "queues";
  const STORE_PATIENTS = "patients";
  const STORE_ENCOUNTERS = "encounters";
  const STORE_VITALS = "vitals";

  const MODULE_NAME = "nursing";

  const STATUS = {
    WAITING: "waiting",
    CALLED: "called",
    IN_PROGRESS: "in-progress",
    COMPLETED: "completed",
    SKIPPED: "skipped"
  };

  const MODULE = {
    name: MODULE_NAME,

    state: {
      queues: [],
      patients: [],
      encounters: [],
      vitals: [],
      selectedDepartment: "all",
      selectedStatus: "active",
      searchTerm: "",
      selectedQueue: null,
      isLoading: false,
      isSaving: false
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
          this.state.vitals = [];
          return;
        }

        const [queues, patients, encounters, vitals] =
          await Promise.all([
            STORAGE.getAll(STORE_QUEUES),
            STORAGE.getAll(STORE_PATIENTS),
            STORAGE.getAll(STORE_ENCOUNTERS),
            STORAGE.getAll(STORE_VITALS)
          ]);

        this.state.queues = Array.isArray(queues) ? queues : [];
        this.state.patients = Array.isArray(patients) ? patients : [];
        this.state.encounters = Array.isArray(encounters) ? encounters : [];
        this.state.vitals = Array.isArray(vitals) ? vitals : [];
      } catch (error) {
        console.error("[AURA Nursing] Failed to load data:", error);
      } finally {
        this.state.isLoading = false;
      }
    },

    getToday() {
      return new Date().toISOString().split("T")[0];
    },

    getNursingQueues() {
      const searchTerm = this.state.searchTerm.trim().toLowerCase();

      return this.state.queues
        .filter((queue) => {
          if (queue.date && queue.date !== this.getToday()) {
            return false;
          }

          const stage = queue.stage || "nursing";

          if (
            stage !== "nursing" &&
            queue.status !== STATUS.WAITING &&
            queue.status !== STATUS.CALLED &&
            queue.status !== STATUS.IN_PROGRESS
          ) {
            return false;
          }

          if (this.state.selectedStatus === "active") {
            if (
              ![
                STATUS.WAITING,
                STATUS.CALLED,
                STATUS.IN_PROGRESS
              ].includes(queue.status)
            ) {
              return false;
            }
          } else if (
            this.state.selectedStatus !== "all" &&
            queue.status !== this.state.selectedStatus
          ) {
            return false;
          }

          if (
            this.state.selectedDepartment !== "all" &&
            queue.departmentId !== this.state.selectedDepartment
          ) {
            return false;
          }

          if (searchTerm) {
            const searchableText = [
              queue.tokenDisplay,
              queue.patientName,
              queue.uhid,
              queue.departmentName
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            if (!searchableText.includes(searchTerm)) {
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

    getStats() {
      const queues = this.state.queues.filter(
        (queue) => !queue.date || queue.date === this.getToday()
      );

      return {
        waiting: queues.filter(
          (queue) => queue.status === STATUS.WAITING
        ).length,

        called: queues.filter(
          (queue) => queue.status === STATUS.CALLED
        ).length,

        inProgress: queues.filter(
          (queue) => queue.status === STATUS.IN_PROGRESS
        ).length,

        completed: queues.filter(
          (queue) =>
            queue.status === STATUS.COMPLETED &&
            queue.stage === "doctor"
        ).length
      };
    },

    async getQueue(queueId) {
      if (!STORAGE) return null;

      return STORAGE.get(STORE_QUEUES, queueId);
    },

    async getPatient(patientId) {
      if (!STORAGE) return null;

      return STORAGE.get(STORE_PATIENTS, patientId);
    },

    async getEncounter(encounterId) {
      if (!STORAGE) return null;

      return STORAGE.get(STORE_ENCOUNTERS, encounterId);
    },

    async updateQueue(queueId, updates) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const queue = await this.getQueue(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = {
        ...queue,
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

    async startPreConsultation(queueId) {
      const queue = await this.getQueue(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      if (
        ![
          STATUS.WAITING,
          STATUS.CALLED
        ].includes(queue.status)
      ) {
        throw new Error(
          "This patient cannot start pre-consultation."
        );
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.IN_PROGRESS,
        stage: "nursing",
        startedAt: new Date().toISOString(),
        nursingStartedAt: new Date().toISOString(),
        nursingStaffId: this.getCurrentUserId()
      });

      this.state.selectedQueue = updatedQueue;

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

    async saveVitals(queueId, vitalsData) {
      if (!STORAGE) {
        throw new Error("Local database is not available.");
      }

      const queue = await this.getQueue(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const vitals = this.normalizeVitals(vitalsData);
      const errors = this.validateVitals(vitals);

      if (errors.length) {
        throw new Error(errors.join(" "));
      }

      const now = new Date().toISOString();

      const existingVitals = this.state.vitals.find(
        (item) =>
          item.queueId === queue.id &&
          item.encounterId === queue.encounterId
      );

      const vitalRecord = {
        id: existingVitals?.id || this.createId("vitals"),
        patientId: queue.patientId,
        uhid: queue.uhid,
        encounterId: queue.encounterId,
        queueId: queue.id,
        recordedBy: this.getCurrentUserId(),
        recordedAt: existingVitals?.recordedAt || now,
        temperature: vitals.temperature,
        pulse: vitals.pulse,
        respiratoryRate: vitals.respiratoryRate,
        bloodPressureSystolic: vitals.bloodPressureSystolic,
        bloodPressureDiastolic: vitals.bloodPressureDiastolic,
        oxygenSaturation: vitals.oxygenSaturation,
        weight: vitals.weight,
        height: vitals.height,
        bmi: vitals.bmi,
        painScore: vitals.painScore,
        nursingNotes: vitals.nursingNotes,
        createdAt: existingVitals?.createdAt || now,
        updatedAt: now
      };

      const savedVitals = existingVitals
        ? await STORAGE.put(STORE_VITALS, vitalRecord)
        : await STORAGE.add(STORE_VITALS, vitalRecord);

      const finalVitals = savedVitals || vitalRecord;

      const index = this.state.vitals.findIndex(
        (item) => String(item.id) === String(finalVitals.id)
      );

      if (index === -1) {
        this.state.vitals.push(finalVitals);
      } else {
        this.state.vitals[index] = finalVitals;
      }

      if (EVENTS?.vitalsRecorded) {
        EVENTS.vitalsRecorded(finalVitals);
      }

      return finalVitals;
    },

    async completePreConsultation(queueId, vitalsData) {
      if (this.state.isSaving) return null;

      this.state.isSaving = true;

      try {
        const queue = await this.getQueue(queueId);

        if (!queue) {
          throw new Error("Queue record not found.");
        }

        if (
          ![
            STATUS.IN_PROGRESS,
            STATUS.CALLED,
            STATUS.WAITING
          ].includes(queue.status)
        ) {
          throw new Error(
            "This patient cannot complete pre-consultation."
          );
        }

        const vitals = await this.saveVitals(queueId, vitalsData);

        const now = new Date().toISOString();

        const updatedQueue = await this.updateQueue(queueId, {
          status: STATUS.COMPLETED,
          stage: "doctor",
          nextStage: "doctor-consultation",
          completedAt: now,
          nursingCompletedAt: now,
          vitalsId: vitals.id
        });

        this.state.selectedQueue = updatedQueue;

        if (EVENTS?.queueCompleted) {
          EVENTS.queueCompleted(updatedQueue);
        }

        if (typeof window.AURA?.emit === "function") {
          window.AURA.emit("nursing:completed", {
            queue: updatedQueue,
            vitals
          });
        }

        this.showToast(
          "success",
          "Pre-Consultation Completed",
          `${updatedQueue.patientName} has been moved to Doctor Consultation.`
        );

        return {
          queue: updatedQueue,
          vitals
        };
      } catch (error) {
        this.showToast(
          "error",
          "Unable to Complete Pre-Consultation",
          error.message
        );

        throw error;
      } finally {
        this.state.isSaving = false;
      }
    },

    async skipPatient(queueId, reason = "") {
      const queue = await this.getQueue(queueId);

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
      const queue = await this.getQueue(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.CALLED,
        lastCalledAt: new Date().toISOString(),
        callCount: Number(queue.callCount || 0) + 1
      });

      this.state.selectedQueue = updatedQueue;

      this.announcePatient(updatedQueue);

      if (EVENTS?.queueCalled) {
        EVENTS.queueCalled(updatedQueue);
      }

      return updatedQueue;
    },

    normalizeVitals(data = {}) {
      const temperature = this.toNumberOrEmpty(data.temperature);
      const pulse = this.toNumberOrEmpty(data.pulse);
      const respiratoryRate = this.toNumberOrEmpty(
        data.respiratoryRate
      );
      const bloodPressureSystolic = this.toNumberOrEmpty(
        data.bloodPressureSystolic
      );
      const bloodPressureDiastolic = this.toNumberOrEmpty(
        data.bloodPressureDiastolic
      );
      const oxygenSaturation = this.toNumberOrEmpty(
        data.oxygenSaturation
      );
      const weight = this.toNumberOrEmpty(data.weight);
      const height = this.toNumberOrEmpty(data.height);
      const painScore = this.toNumberOrEmpty(data.painScore);

      return {
        temperature,
        pulse,
        respiratoryRate,
        bloodPressureSystolic,
        bloodPressureDiastolic,
        oxygenSaturation,
        weight,
        height,
        bmi: this.calculateBMI(weight, height),
        painScore,
        nursingNotes: String(data.nursingNotes || "").trim()
      };
    },

    validateVitals(vitals) {
      const errors = [];

      if (
        vitals.temperature !== "" &&
        (vitals.temperature < 30 || vitals.temperature > 45)
      ) {
        errors.push("Temperature must be between 30°C and 45°C.");
      }

      if (
        vitals.pulse !== "" &&
        (vitals.pulse < 20 || vitals.pulse > 250)
      ) {
        errors.push("Pulse must be between 20 and 250 bpm.");
      }

      if (
        vitals.respiratoryRate !== "" &&
        (vitals.respiratoryRate < 5 ||
          vitals.respiratoryRate > 80)
      ) {
        errors.push(
          "Respiratory rate must be between 5 and 80 breaths/min."
        );
      }

      if (
        vitals.oxygenSaturation !== "" &&
        (vitals.oxygenSaturation < 50 ||
          vitals.oxygenSaturation > 100)
      ) {
        errors.push(
          "Oxygen saturation must be between 50% and 100%."
        );
      }

      if (
        vitals.weight !== "" &&
        (vitals.weight <= 0 || vitals.weight > 500)
      ) {
        errors.push("Weight must be between 0 and 500 kg.");
      }

      if (
        vitals.height !== "" &&
        (vitals.height <= 0 || vitals.height > 250)
      ) {
        errors.push("Height must be between 0 and 250 cm.");
      }

      if (
        vitals.painScore !== "" &&
        (vitals.painScore < 0 || vitals.painScore > 10)
      ) {
        errors.push("Pain score must be between 0 and 10.");
      }

      return errors;
    },

    calculateBMI(weightKg, heightCm) {
      const weight = Number(weightKg);
      const height = Number(heightCm);

      if (!weight || !height || weight <= 0 || height <= 0) {
        return "";
      }

      const heightInMeters = height / 100;
      const bmi = weight / (heightInMeters * heightInMeters);

      return Number(bmi.toFixed(2));
    },

    getBMILabel(bmi) {
      const value = Number(bmi);

      if (!value) return "";

      if (value < 18.5) return "Underweight";
      if (value < 25) return "Normal";
      if (value < 30) return "Overweight";

      return "Obesity";
    },

    toNumberOrEmpty(value) {
      if (value === null || value === undefined || value === "") {
        return "";
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : "";
    },

    async openVitalsModal(queueId, container) {
      const queue = await this.getQueue(queueId);

      if (!queue) {
        this.showToast(
          "error",
          "Patient Not Found",
          "The selected queue record could not be found."
        );

        return;
      }

      const existingVitals = this.state.vitals.find(
        (item) =>
          item.queueId === queue.id ||
          item.encounterId === queue.encounterId
      );

      const patient = await this.getPatient(queue.patientId);

      const modalContent = this.getVitalsFormMarkup(
        queue,
        patient,
        existingVitals
      );

      this.openModal({
        title: "Nursing Pre-Consultation",
        content: modalContent,
        size: "large"
      });

      const modal = document.querySelector(
        ".modal:last-of-type"
      );

      const form =
        modal?.querySelector("#nursing-vitals-form") ||
        document.querySelector("#nursing-vitals-form");

      if (!form) return;

      this.bindVitalsFormEvents(form, queue, container);
    },

    getVitalsFormMarkup(queue, patient, existingVitals) {
      const patientName =
        queue.patientName ||
        this.getPatientName(patient) ||
        "Unknown Patient";

      return `
        <div class="nursing-vitals-modal">

          <div class="clinical-patient-banner">
            <div class="clinical-patient-banner__avatar">
              ${this.escapeHtml(this.getInitials(patientName))}
            </div>

            <div class="clinical-patient-banner__body">
              <strong>${this.escapeHtml(patientName)}</strong>
              <span>
                ${this.escapeHtml(queue.uhid || "No UHID")}
                ·
                Token ${this.escapeHtml(
                  queue.tokenDisplay || queue.tokenNumber || "--"
                )}
              </span>
            </div>

            <span class="status-pill status-pill--info">
              ${this.escapeHtml(queue.departmentName || "OPD")}
            </span>
          </div>

          <form id="nursing-vitals-form" novalidate>

            <div class="form-section-heading">
              <span>Vital Signs</span>
            </div>

            <div class="form-grid form-grid--three">

              <label class="form-field">
                <span class="form-label">Temperature (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="45"
                  name="temperature"
                  class="form-input"
                  placeholder="36.5"
                  value="${this.escapeAttribute(
                    existingVitals?.temperature ?? ""
                  )}"
                />
              </label>

              <label class="form-field">
                <span class="form-label">Pulse (bpm)</span>
                <input
                  type="number"
                  min="20"
                  max="250"
                  name="pulse"
                  class="form-input"
                  placeholder="72"
                  value="${this.escapeAttribute(
                    existingVitals?.pulse ?? ""
                  )}"
                />
              </label>

              <label class="form-field">
                <span class="form-label">Respiratory Rate</span>
                <input
                  type="number"
                  min="5"
                  max="80"
                  name="respiratoryRate"
                  class="form-input"
                  placeholder="16"
                  value="${this.escapeAttribute(
                    existingVitals?.respiratoryRate ?? ""
                  )}"
                />
              </label>

            </div>

            <div class="form-grid form-grid--three">

              <label class="form-field">
                <span class="form-label">BP Systolic</span>
                <input
                  type="number"
                  min="40"
                  max="300"
                  name="bloodPressureSystolic"
                  class="form-input"
                  placeholder="120"
                  value="${this.escapeAttribute(
                    existingVitals?.bloodPressureSystolic ?? ""
                  )}"
                />
              </label>

              <label class="form-field">
                <span class="form-label">BP Diastolic</span>
                <input
                  type="number"
                  min="20"
                  max="200"
                  name="bloodPressureDiastolic"
                  class="form-input"
                  placeholder="80"
                  value="${this.escapeAttribute(
                    existingVitals?.bloodPressureDiastolic ?? ""
                  )}"
                />
              </label>

              <label class="form-field">
                <span class="form-label">SpO₂ (%)</span>
                <input
                  type="number"
                  min="50"
                  max="100"
                  name="oxygenSaturation"
                  class="form-input"
                  placeholder="98"
                  value="${this.escapeAttribute(
                    existingVitals?.oxygenSaturation ?? ""
                  )}"
                />
              </label>

            </div>

            <div class="form-section-heading">
              <span>Anthropometric Measurements</span>
            </div>

            <div class="form-grid form-grid--three">

              <label class="form-field">
                <span class="form-label">Weight (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="500"
                  name="weight"
                  id="nursing-weight"
                  class="form-input"
                  placeholder="65"
                  value="${this.escapeAttribute(
                    existingVitals?.weight ?? ""
                  )}"
                />
              </label>

              <label class="form-field">
                <span class="form-label">Height (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="250"
                  name="height"
                  id="nursing-height"
                  class="form-input"
                  placeholder="170"
                  value="${this.escapeAttribute(
                    existingVitals?.height ?? ""
                  )}"
                />
              </label>

              <div class="form-field">
                <span class="form-label">BMI</span>

                <div class="bmi-display">
                  <strong id="nursing-bmi">
                    ${existingVitals?.bmi || "--"}
                  </strong>

                  <small id="nursing-bmi-label">
                    ${existingVitals?.bmi
                      ? this.getBMILabel(existingVitals.bmi)
                      : "Calculated automatically"}
                  </small>
                </div>
              </div>

            </div>

            <div class="form-grid form-grid--two">

              <label class="form-field">
                <span class="form-label">Pain Score (0–10)</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  name="painScore"
                  class="form-input"
                  placeholder="0"
                  value="${this.escapeAttribute(
                    existingVitals?.painScore ?? ""
                  )}"
                />
              </label>

              <div class="form-field">
                <span class="form-label">Nursing Staff</span>

                <div class="readonly-field">
                  ${this.escapeHtml(this.getCurrentUserName())}
                </div>
              </div>

            </div>

            <label class="form-field form-field--full">
              <span class="form-label">Nursing Notes</span>

              <textarea
                name="nursingNotes"
                class="form-textarea"
                rows="4"
                placeholder="Record relevant observations, symptoms, or pre-consultation notes."
              >${this.escapeHtml(
                existingVitals?.nursingNotes || ""
              )}</textarea>
            </label>

            <div class="clinical-alert clinical-alert--info">
              <span class="clinical-alert__icon">ⓘ</span>
              <p>
                Completing this form will move the patient from Nursing to
                Doctor Consultation.
              </p>
            </div>

            <div class="modal-actions">
              <button
                type="button"
                class="btn btn--secondary"
                data-nursing-cancel
              >
                Cancel
              </button>

              <button
                type="submit"
                class="btn btn--primary"
                data-nursing-submit
              >
                Save Vitals & Complete
              </button>
            </div>

          </form>
        </div>
      `;
    },

    bindVitalsFormEvents(form, queue, container) {
      const weightInput = form.querySelector("#nursing-weight");
      const heightInput = form.querySelector("#nursing-height");
      const bmiValue = form.querySelector("#nursing-bmi");
      const bmiLabel = form.querySelector("#nursing-bmi-label");

      const updateBMI = () => {
        const bmi = this.calculateBMI(
          weightInput?.value,
          heightInput?.value
        );

        if (bmiValue) {
          bmiValue.textContent = bmi || "--";
        }

        if (bmiLabel) {
          bmiLabel.textContent = bmi
            ? this.getBMILabel(bmi)
            : "Calculated automatically";
        }
      };

      weightInput?.addEventListener("input", updateBMI);
      heightInput?.addEventListener("input", updateBMI);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (this.state.isSaving) return;

        const submitButton = form.querySelector(
          "[data-nursing-submit]"
        );

        const formData = Object.fromEntries(
          new FormData(form).entries()
        );

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.innerHTML = `
            <span class="button-spinner"></span>
            Saving...
          `;
        }

        try {
          await this.completePreConsultation(
            queue.id,
            formData
          );

          this.closeModal();

          await this.loadData();

          if (container) {
            this.renderQueueTable(container);
            this.updateStats(container);
          }
        } catch (error) {
          console.error("[AURA Nursing] Save vitals failed:", error);
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent =
              "Save Vitals & Complete";
          }
        }
      });

      form
        .querySelector("[data-nursing-cancel]")
        ?.addEventListener("click", () => {
          this.closeModal();
        });
    },

    async handleQueueAction(action, queueId, container) {
      try {
        switch (action) {
          case "call":
            await this.callPatient(queueId);
            break;

          case "start":
            await this.startPreConsultation(queueId);
            break;

          case "vitals":
            await this.openVitalsModal(queueId, container);
            return;

          case "recall":
            await this.recallPatient(queueId);
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
        console.error("[AURA Nursing] Queue action failed:", error);
      }
    },

    async callPatient(queueId) {
      const queue = await this.getQueue(queueId);

      if (!queue) {
        throw new Error("Queue record not found.");
      }

      if (
        ![
          STATUS.WAITING,
          STATUS.SKIPPED
        ].includes(queue.status)
      ) {
        throw new Error("This patient cannot be called.");
      }

      const now = new Date().toISOString();

      const updatedQueue = await this.updateQueue(queueId, {
        status: STATUS.CALLED,
        calledAt: now,
        lastCalledAt: now,
        callCount: Number(queue.callCount || 0) + 1
      });

      this.state.selectedQueue = updatedQueue;

      this.announcePatient(updatedQueue);

      if (EVENTS?.queueCalled) {
        EVENTS.queueCalled(updatedQueue);
      }

      this.showToast(
        "success",
        "Patient Called",
        `${updatedQueue.tokenDisplay || updatedQueue.tokenNumber} — ${updatedQueue.patientName}`
      );

      return updatedQueue;
    },

    async callNextPatient(departmentId = "all") {
      const candidates = this.state.queues
        .filter((queue) => {
          if (queue.date && queue.date !== this.getToday()) {
            return false;
          }

          if (
            departmentId !== "all" &&
            queue.departmentId !== departmentId
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

          return Number(a.tokenNumber || 0) - Number(b.tokenNumber || 0);
        });

      if (!candidates.length) {
        this.showToast(
          "info",
          "Queue Empty",
          "No waiting patients are available."
        );

        return null;
      }

      return this.callPatient(candidates[0].id);
    },

    announcePatient(queue) {
      if (!queue) return;

      const message =
        `Token ${queue.tokenDisplay || queue.tokenNumber}. ` +
        `${queue.patientName}. Please proceed to the nursing desk.`;

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
          console.warn("[AURA Nursing] Voice announcement failed:", error);
        }
      }

      if (typeof window.AURA?.emit === "function") {
        window.AURA.emit("nursing:announcement", {
          queue,
          message
        });
      }
    },

    render(container) {
      const target =
        container ||
        document.querySelector('[data-route-view="nursing"]') ||
        document.getElementById("app-content");

      if (!target) return;

      target.innerHTML = this.getLoadingMarkup();

      this.loadData()
        .then(() => {
          target.innerHTML = this.getPageMarkup();
          this.bindPageEvents(target);
          this.renderQueueTable(target);
          this.updateStats(target);
        })
        .catch((error) => {
          console.error("[AURA Nursing] Render failed:", error);

          target.innerHTML = `
            <div class="empty-state">
              <div class="empty-state__icon">⚠️</div>
              <h3>Nursing module unavailable</h3>
              <p>${this.escapeHtml(error.message)}</p>
            </div>
          `;
        });
    },

    getLoadingMarkup() {
      return `
        <section class="page-shell nursing-page">
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
      return `
        <section class="page-shell nursing-page">

          <div class="page-header">
            <div>
              <span class="eyebrow">NURSING & PRE-CONSULTATION</span>
              <h1 class="page-title">Nursing Desk</h1>
              <p class="page-subtitle">
                Record patient vitals and prepare patients for doctor consultation.
              </p>
            </div>

            <div class="page-header__actions">
              <button
                type="button"
                class="btn btn--secondary"
                data-nursing-refresh
              >
                Refresh
              </button>

              <button
                type="button"
                class="btn btn--primary"
                data-nursing-call-next
              >
                Call Next Patient
              </button>
            </div>
          </div>

          <div class="queue-stats-grid">

            <article class="metric-card">
              <div class="metric-card__icon">◷</div>
              <div>
                <span class="metric-card__label">Waiting</span>
                <strong
                  class="metric-card__value"
                  data-nursing-stat="waiting"
                >0</strong>
              </div>
            </article>

            <article class="metric-card">
              <div class="metric-card__icon">◌</div>
              <div>
                <span class="metric-card__label">Called</span>
                <strong
                  class="metric-card__value"
                  data-nursing-stat="called"
                >0</strong>
              </div>
            </article>

            <article class="metric-card">
              <div class="metric-card__icon">●</div>
              <div>
                <span class="metric-card__label">In Progress</span>
                <strong
                  class="metric-card__value"
                  data-nursing-stat="inProgress"
                >0</strong>
              </div>
            </article>

            <article class="metric-card">
              <div class="metric-card__icon">✓</div>
              <div>
                <span class="metric-card__label">Moved to Doctor</span>
                <strong
                  class="metric-card__value"
                  data-nursing-stat="completed"
                >0</strong>
              </div>
            </article>

          </div>

          <section class="panel nursing-queue-panel">

            <div class="panel__header">
              <div>
                <h2 class="panel__title">Pre-Consultation Queue</h2>
                <p class="panel__subtitle">
                  Patients awaiting nursing assessment.
                </p>
              </div>

              <div class="queue-panel__live">
                <span class="live-indicator"></span>
                Live Queue
              </div>
            </div>

            <div class="queue-toolbar">

              <label class="form-field queue-toolbar__search">
                <span class="form-label sr-only">Search patients</span>

                <div class="input-with-icon">
                  <span class="input-icon">⌕</span>
                  <input
                    type="search"
                    class="form-input"
                    id="nursing-search"
                    placeholder="Search token, UHID, or patient"
                  />
                </div>
              </label>

              <label class="form-field">
                <span class="form-label sr-only">Department</span>

                <select
                  class="form-select"
                  id="nursing-department-filter"
                >
                  <option value="all">All Departments</option>
                  ${this.getDepartmentOptions()}
                </select>
              </label>

              <label class="form-field">
                <span class="form-label sr-only">Status</span>

                <select
                  class="form-select"
                  id="nursing-status-filter"
                >
                  <option value="active">Active Queue</option>
                  <option value="all">All Records</option>
                  <option value="waiting">Waiting</option>
                  <option value="called">Called</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                </select>
              </label>

            </div>

            <div class="queue-table-wrapper">
              <table class="data-table queue-table nursing-table">
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

                <tbody id="nursing-table-body"></tbody>
              </table>
            </div>

            <div
              class="queue-empty-state"
              id="nursing-empty-state"
              hidden
            >
              <div class="empty-state">
                <div class="empty-state__icon">◌</div>
                <h3>No patients awaiting nursing</h3>
                <p>
                  Patients registered for consultation will appear here.
                </p>
              </div>
            </div>

          </section>

          <section class="queue-workflow-strip">

            <div class="workflow-step">
              <span class="workflow-step__number">1</span>
              <div>
                <strong>Reception</strong>
                <small>Registration & Token</small>
              </div>
            </div>

            <div class="workflow-arrow">→</div>

            <div class="workflow-step workflow-step--active">
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

    getDepartmentOptions() {
      const departments =
        CONFIG?.workflow?.departments ||
        CONFIG?.departments ||
        [
          {
            id: "general-medicine",
            name: "General Medicine"
          },
          {
            id: "pediatrics",
            name: "Pediatrics"
          },
          {
            id: "pathology",
            name: "Pathology"
          },
          {
            id: "radiology",
            name: "Radiology"
          }
        ];

      return departments
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
    },

    renderQueueTable(container) {
      const tableBody = container.querySelector(
        "#nursing-table-body"
      );

      const emptyState = container.querySelector(
        "#nursing-empty-state"
      );

      if (!tableBody) return;

      const queues = this.getNursingQueues();

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

      tableBody
        .querySelectorAll("[data-nursing-action]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            this.handleQueueAction(
              button.dataset.nursingAction,
              button.dataset.queueId,
              container
            );
          });
        });
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
        <tr data-nursing-row="${this.escapeAttribute(queue.id)}">

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
                <strong>
                  ${this.escapeHtml(queue.patientName || "Unknown Patient")}
                </strong>
                <small>
                  ${this.escapeHtml(queue.uhid || "No UHID")}
                </small>
              </div>
            </div>
          </td>

          <td>
            ${this.escapeHtml(queue.departmentName || "--")}
          </td>

          <td>
            <span class="priority-badge ${priorityClass}">
              ${this.escapeHtml(
                this.getPriorityLabel(queue.priority)
              )}
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
            data-nursing-action="call"
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
            data-nursing-action="start"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Start
          </button>

          <button
            type="button"
            class="btn btn--ghost btn--sm"
            data-nursing-action="recall"
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
            data-nursing-action="vitals"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Record Vitals
          </button>
        `);
      }

      if (queue.status === STATUS.SKIPPED) {
        buttons.push(`
          <button
            type="button"
            class="btn btn--primary btn--sm"
            data-nursing-action="call"
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
            data-nursing-action="skip"
            data-queue-id="${this.escapeAttribute(queue.id)}"
          >
            Skip
          </button>
        `);
      }

      return buttons.join("");
    },

    updateStats(container) {
      const stats = this.getStats();

      Object.entries(stats).forEach(([key, value]) => {
        const element = container.querySelector(
          `[data-nursing-stat="${key}"]`
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

    getPatientName(patient) {
      if (!patient) return "";

      return [
        patient.firstName,
        patient.middleName,
        patient.lastName
      ]
        .filter(Boolean)
        .join(" ");
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

    getCurrentUserId() {
      const auth =
        window.AURA_AUTH ||
        window.AURA_AUTHENTICATION;

      if (auth?.getCurrentUser) {
        const user = auth.getCurrentUser();
        return user?.id || "local-user";
      }

      if (auth?.getState) {
        const state = auth.getState();
        return state?.user?.id || "local-user";
      }

      return "local-user";
    },

    getCurrentUserName() {
      const auth =
        window.AURA_AUTH ||
        window.AURA_AUTHENTICATION;

      if (auth?.getCurrentUser) {
        const user = auth.getCurrentUser();

        return (
          user?.name ||
          user?.fullName ||
          user?.email ||
          "Nursing Staff"
        );
      }

      if (auth?.getState) {
        const state = auth.getState();

        return (
          state?.user?.name ||
          state?.user?.fullName ||
          state?.user?.email ||
          "Nursing Staff"
        );
      }

      return "Nursing Staff";
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

    openModal(options) {
      if (typeof window.AURA?.modal === "function") {
        window.AURA.modal(options);
        return;
      }

      const modal = document.createElement("div");
      modal.className = "modal-overlay";
      modal.innerHTML = `
        <div class="modal modal--${options.size || "medium"}">
          <div class="modal__header">
            <h2>${this.escapeHtml(options.title || "")}</h2>
            <button
              type="button"
              class="modal__close"
              data-modal-close
            >
              ×
            </button>
          </div>

          <div class="modal__body">
            ${options.content || ""}
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal
        .querySelector("[data-modal-close]")
        ?.addEventListener("click", () => {
          modal.remove();
        });
    },

    closeModal() {
      if (typeof window.AURA?.closeModal === "function") {
        window.AURA.closeModal();
        return;
      }

      const selectors = [
        ".modal-overlay",
        ".modal-backdrop",
        ".aura-modal"
      ];

      selectors.forEach((selector) => {
        document.querySelector(selector)?.remove();
      });
    },

    bindPageEvents(container) {
      const searchInput = container.querySelector(
        "#nursing-search"
      );

      const departmentFilter = container.querySelector(
        "#nursing-department-filter"
      );

      const statusFilter = container.querySelector(
        "#nursing-status-filter"
      );

      const refreshButton = container.querySelector(
        "[data-nursing-refresh]"
      );

      const callNextButton = container.querySelector(
        "[data-nursing-call-next]"
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
          "Nursing Queue Refreshed",
          "Latest patient records have been loaded."
        );
      });

      callNextButton?.addEventListener("click", async () => {
        await this.callNextPatient(
          this.state.selectedDepartment
        );

        await this.loadData();

        this.renderQueueTable(container);
        this.updateStats(container);
      });
    },

    bindGlobalEvents() {
      if (!EVENTS?.on) return;

      const refreshEvents = [
        "queue:created",
        "queue:called",
        "queue:completed",
        "queue:skipped",
        "registration:completed",
        "vitals:recorded",
        "nursing:completed",
        "storage:change"
      ];

      refreshEvents.forEach((eventName) => {
        EVENTS.on(eventName, async () => {
          await this.loadData();

          const container =
            document.querySelector('[data-route-view="nursing"]') ||
            document.getElementById("app-content");

          if (container?.querySelector("#nursing-table-body")) {
            this.renderQueueTable(container);
            this.updateStats(container);
          }
        });
      });
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

  window.AURA_NURSING = MODULE;

  window.AURA = window.AURA || {};
  window.AURA.nursing = MODULE;

  if (window.AURA_APP?.registerModule) {
    window.AURA_APP.registerModule(MODULE_NAME, MODULE);
  }

  if (window.AURA_ROUTER?.register) {
    window.AURA_ROUTER.register("nursing", {
      title: "Nursing Desk",
      module: MODULE,
      render: () => MODULE.render()
    });
  }

  MODULE.init();

})(window);