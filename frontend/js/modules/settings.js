/* =========================================================
   AURA CLINIC — SETTINGS MODULE
   File: frontend/js/modules/settings.js
   Purpose: Clinic configuration and application preferences
   ========================================================= */

(function () {
  "use strict";

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS;
  const APP = window.AURA_APP;

  const MODULE_NAME = "settings";
  const SETTINGS_STORE = "settings";

  const DEFAULT_SETTINGS = {
    clinic: {
      name: "AURA Clinic",
      tagline: "Smart Healthcare Management",
      address: "",
      phone: "",
      email: "",
      registrationNumber: "",
      gstNumber: "",
      logo: ""
    },

    appearance: {
      theme: "system",
      compactMode: false,
      reducedMotion: false
    },

    workflow: {
      defaultDepartment: "General Medicine",
      autoGenerateUHID: true,
      autoGenerateToken: true,
      enableQueueVoice: true,
      enableLobbyDisplay: true
    },

    notifications: {
      enableNotifications: true,
      enableSound: true,
      enableEmail: false,
      enableSMS: false,
      notifyQueueUpdates: true,
      notifyLabResults: true,
      notifyBilling: true
    },

    security: {
      sessionTimeoutMinutes: 60,
      requireStaffPhoto: true,
      enableAuditLog: true,
      lockInactiveUsers: false
    },

    regional: {
      currency: "INR",
      currencySymbol: "₹",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12-hour",
      timezone: "Asia/Kolkata"
    },

    system: {
      language: "en",
      lastBackupAt: null,
      lastRestoreAt: null
    }
  };

  const state = {
    settings: clone(DEFAULT_SETTINGS),
    activeSection: "clinic",
    isLoading: false,
    isSaving: false,
    initialized: false
  };

  const listeners = new Set();

  /* =========================================================
     HELPERS
     ========================================================= */

  function clone(value) {
    if (value === undefined || value === null) return value;

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

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

  function notify(type, title, message) {
    if (APP && typeof APP.toast === "function") {
      APP.toast({ type, title, message });
      return;
    }

    if (window.AURA && typeof window.AURA.toast === "function") {
      window.AURA.toast({ type, title, message });
    }
  }

  function emit(eventName, payload) {
    if (EVENTS && typeof EVENTS.emit === "function") {
      EVENTS.emit(eventName, payload);
    }
  }

  function deepMerge(target, source) {
    const output = clone(target) || {};

    if (!source || typeof source !== "object") {
      return output;
    }

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];

      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue)
      ) {
        output[key] = deepMerge(output[key] || {}, sourceValue);
      } else {
        output[key] = sourceValue;
      }
    });

    return output;
  }

  function getNested(object, path, fallback = "") {
    return path.split(".").reduce((value, key) => {
      return value && value[key] !== undefined
        ? value[key]
        : undefined;
    }, object) ?? fallback;
  }

  function setNested(object, path, value) {
    const keys = path.split(".");
    let cursor = object;

    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        cursor[key] = value;
        return;
      }

      if (
        !cursor[key] ||
        typeof cursor[key] !== "object" ||
        Array.isArray(cursor[key])
      ) {
        cursor[key] = {};
      }

      cursor = cursor[key];
    });
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
        console.error("[AURA Settings] Subscriber error:", error);
      }
    });
  }

  function getState() {
    return {
      ...state,
      settings: clone(state.settings)
    };
  }

  /* =========================================================
     STORAGE
     ========================================================= */

  async function loadSettings() {
    if (!STORAGE || typeof STORAGE.get !== "function") {
      state.settings = clone(DEFAULT_SETTINGS);
      return state.settings;
    }

    state.isLoading = true;

    try {
      const saved = await STORAGE.get(SETTINGS_STORE, "clinic-settings");

      if (saved && saved.value) {
        state.settings = deepMerge(DEFAULT_SETTINGS, saved.value);
      } else if (saved && saved.settings) {
        state.settings = deepMerge(DEFAULT_SETTINGS, saved.settings);
      } else {
        state.settings = clone(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.warn("[AURA Settings] Unable to load settings:", error);
      state.settings = clone(DEFAULT_SETTINGS);
    }

    state.isLoading = false;

    notifySubscribers();

    return state.settings;
  }

  async function saveSettings() {
    if (!STORAGE || typeof STORAGE.put !== "function") {
      return false;
    }

    state.isSaving = true;

    try {
      await STORAGE.put(SETTINGS_STORE, {
        id: "clinic-settings",
        value: clone(state.settings),
        updatedAt: new Date().toISOString()
      });

      state.isSaving = false;

      emit("settings:updated", {
        settings: clone(state.settings)
      });

      notifySubscribers();

      return true;
    } catch (error) {
      state.isSaving = false;

      console.error("[AURA Settings] Save failed:", error);

      notify(
        "error",
        "Unable to save settings",
        "Please try again."
      );

      return false;
    }
  }

  async function updateSettings(path, value, options = {}) {
    setNested(state.settings, path, value);

    if (options.persist !== false) {
      await saveSettings();
    }

    applyRuntimeSettings(path, value);
    notifySubscribers();

    return getNested(state.settings, path);
  }

  /* =========================================================
     RUNTIME SETTINGS
     ========================================================= */

  function applyRuntimeSettings(path, value) {
    if (path === "appearance.theme") {
      applyTheme(value);
    }

    if (path === "appearance.compactMode") {
      document.body.classList.toggle("is-compact", Boolean(value));
    }

    if (path === "appearance.reducedMotion") {
      document.body.classList.toggle("reduced-motion", Boolean(value));
    }

    if (path === "clinic.name") {
      updateClinicName(value);
    }
  }

  function applyAllRuntimeSettings() {
    const appearance = state.settings.appearance || {};

    applyTheme(appearance.theme);

    document.body.classList.toggle(
      "is-compact",
      Boolean(appearance.compactMode)
    );

    document.body.classList.toggle(
      "reduced-motion",
      Boolean(appearance.reducedMotion)
    );

    updateClinicName(state.settings.clinic?.name);
  }

  function applyTheme(theme) {
    let resolvedTheme = theme || "system";

    if (resolvedTheme === "system") {
      resolvedTheme = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.classList.toggle(
      "theme-dark",
      resolvedTheme === "dark"
    );
    document.documentElement.classList.toggle(
      "theme-light",
      resolvedTheme === "light"
    );

    if (window.AURA_APP && typeof window.AURA_APP.setTheme === "function") {
      window.AURA_APP.setTheme(theme);
    }

    emit("theme:changed", {
      theme,
      resolvedTheme
    });
  }

  function updateClinicName(name) {
    const clinicName = name || "AURA Clinic";

    document.querySelectorAll("[data-clinic-name]").forEach((element) => {
      element.textContent = clinicName;
    });

    document.title = `${clinicName} — Clinic Management System`;
  }

  /* =========================================================
     SECTION DEFINITIONS
     ========================================================= */

  const SECTIONS = [
    {
      id: "clinic",
      label: "Clinic Profile",
      description: "Basic clinic information and branding.",
      icon: "business"
    },
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme, density, and accessibility preferences.",
      icon: "palette"
    },
    {
      id: "workflow",
      label: "Workflow",
      description: "Queue and registration automation settings.",
      icon: "account_tree"
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Sound, alerts, and communication preferences.",
      icon: "notifications"
    },
    {
      id: "security",
      label: "Security",
      description: "Session and account protection settings.",
      icon: "security"
    },
    {
      id: "regional",
      label: "Regional",
      description: "Currency, date, time, and language preferences.",
      icon: "language"
    },
    {
      id: "data",
      label: "Data Management",
      description: "Backup, restore, and local database maintenance.",
      icon: "database"
    }
  ];

  /* =========================================================
     RENDERING
     ========================================================= */

  function renderSidebar() {
    return `
      <aside class="settings-sidebar">
        <div class="settings-sidebar__header">
          <span class="eyebrow">
            <span class="material-symbols-rounded">settings</span>
            Configuration
          </span>

          <h2>Settings</h2>
          <p>Manage AURA Clinic preferences.</p>
        </div>

        <nav class="settings-nav" aria-label="Settings sections">
          ${SECTIONS.map((section) => `
            <button
              type="button"
              class="settings-nav__item ${
                state.activeSection === section.id ? "is-active" : ""
              }"
              data-settings-section="${escapeHtml(section.id)}"
            >
              <span class="material-symbols-rounded">
                ${escapeHtml(section.icon)}
              </span>

              <span>
                <strong>${escapeHtml(section.label)}</strong>
                <small>${escapeHtml(section.description)}</small>
              </span>
            </button>
          `).join("")}
        </nav>
      </aside>
    `;
  }

  function renderToggle(path, label, description) {
    const checked = Boolean(getNested(state.settings, path, false));

    return `
      <label class="settings-toggle">
        <span class="settings-toggle__content">
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(description)}</small>
        </span>

        <input
          type="checkbox"
          data-setting-path="${escapeHtml(path)}"
          ${checked ? "checked" : ""}
        />

        <span class="settings-toggle__switch" aria-hidden="true"></span>
      </label>
    `;
  }

  function renderClinicSection() {
    const clinic = state.settings.clinic || {};

    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Clinic Identity</span>
            <h2>Clinic Profile</h2>
            <p>Configure the information shown throughout AURA Clinic.</p>
          </div>
        </div>

        <div class="card">
          <div class="form-grid form-grid--two">
            <label class="form-field">
              <span class="form-label">Clinic Name</span>
              <input
                class="form-control"
                type="text"
                data-setting-input="clinic.name"
                value="${escapeHtml(clinic.name)}"
                placeholder="Enter clinic name"
              />
            </label>

            <label class="form-field">
              <span class="form-label">Tagline</span>
              <input
                class="form-control"
                type="text"
                data-setting-input="clinic.tagline"
                value="${escapeHtml(clinic.tagline)}"
                placeholder="Enter clinic tagline"
              />
            </label>

            <label class="form-field form-field--full">
              <span class="form-label">Address</span>
              <textarea
                class="form-control"
                rows="3"
                data-setting-input="clinic.address"
                placeholder="Clinic address"
              >${escapeHtml(clinic.address)}</textarea>
            </label>

            <label class="form-field">
              <span class="form-label">Phone Number</span>
              <input
                class="form-control"
                type="tel"
                data-setting-input="clinic.phone"
                value="${escapeHtml(clinic.phone)}"
                placeholder="+91"
              />
            </label>

            <label class="form-field">
              <span class="form-label">Email Address</span>
              <input
                class="form-control"
                type="email"
                data-setting-input="clinic.email"
                value="${escapeHtml(clinic.email)}"
                placeholder="clinic@example.com"
              />
            </label>

            <label class="form-field">
              <span class="form-label">Registration Number</span>
              <input
                class="form-control"
                type="text"
                data-setting-input="clinic.registrationNumber"
                value="${escapeHtml(clinic.registrationNumber)}"
                placeholder="Clinic registration number"
              />
            </label>

            <label class="form-field">
              <span class="form-label">GST Number</span>
              <input
                class="form-control"
                type="text"
                data-setting-input="clinic.gstNumber"
                value="${escapeHtml(clinic.gstNumber)}"
                placeholder="Optional GST number"
              />
            </label>
          </div>

          <div class="settings-logo-upload">
            <div class="settings-logo-preview">
              ${
                clinic.logo
                  ? `<img src="${escapeHtml(clinic.logo)}" alt="Clinic logo" />`
                  : `<span class="material-symbols-rounded">business</span>`
              }
            </div>

            <div>
              <strong>Clinic Logo</strong>
              <p>Use a square PNG, JPG, or WebP image.</p>

              <input
                type="file"
                id="settings-clinic-logo"
                accept="image/png,image/jpeg,image/webp"
                hidden
              />

              <div class="settings-inline-actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-settings-action="upload-logo"
                >
                  <span class="material-symbols-rounded">upload</span>
                  Upload Logo
                </button>

                ${
                  clinic.logo
                    ? `
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        data-settings-action="remove-logo"
                      >
                        Remove
                      </button>
                    `
                    : ""
                }
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderAppearanceSection() {
    const appearance = state.settings.appearance || {};

    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Interface Preferences</span>
            <h2>Appearance</h2>
            <p>Personalize the visual experience of AURA Clinic.</p>
          </div>
        </div>

        <div class="card">
          <div class="form-grid form-grid--two">
            <label class="form-field">
              <span class="form-label">Theme</span>
              <select
                class="form-control"
                data-setting-select="appearance.theme"
              >
                <option value="system" ${
                  appearance.theme === "system" ? "selected" : ""
                }>
                  System Default
                </option>

                <option value="light" ${
                  appearance.theme === "light" ? "selected" : ""
                }>
                  Light
                </option>

                <option value="dark" ${
                  appearance.theme === "dark" ? "selected" : ""
                }>
                  Dark
                </option>
              </select>
            </label>
          </div>

          <div class="settings-list">
            ${renderToggle(
              "appearance.compactMode",
              "Compact Mode",
              "Reduce spacing to display more information on smaller screens."
            )}

            ${renderToggle(
              "appearance.reducedMotion",
              "Reduce Motion",
              "Minimize animations and transitions for accessibility."
            )}
          </div>
        </div>
      </section>
    `;
  }

  function renderWorkflowSection() {
    const workflow = state.settings.workflow || {};

    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Clinical Operations</span>
            <h2>Workflow Settings</h2>
            <p>Control registration, queue, and patient-flow automation.</p>
          </div>
        </div>

        <div class="card">
          <div class="form-grid form-grid--two">
            <label class="form-field">
              <span class="form-label">Default Department</span>
              <select
                class="form-control"
                data-setting-select="workflow.defaultDepartment"
              >
                ${[
                  "General Medicine",
                  "Pediatrics",
                  "Nursing",
                  "Laboratory",
                  "Pathology",
                  "Radiology",
                  "Pharmacy",
                  "Billing"
                ].map((department) => `
                  <option value="${escapeHtml(department)}" ${
                    workflow.defaultDepartment === department
                      ? "selected"
                      : ""
                  }>
                    ${escapeHtml(department)}
                  </option>
                `).join("")}
              </select>
            </label>
          </div>

          <div class="settings-list">
            ${renderToggle(
              "workflow.autoGenerateUHID",
              "Automatic UHID Generation",
              "Generate a unique health identifier when registering a new patient."
            )}

            ${renderToggle(
              "workflow.autoGenerateToken",
              "Automatic Queue Token",
              "Generate queue tokens automatically during registration."
            )}

            ${renderToggle(
              "workflow.enableQueueVoice",
              "Queue Voice Announcements",
              "Enable spoken patient-token announcements."
            )}

            ${renderToggle(
              "workflow.enableLobbyDisplay",
              "Lobby Display",
              "Allow queue information to appear on the waiting-area display."
            )}
          </div>
        </div>
      </section>
    `;
  }

  function renderNotificationsSection() {
    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Communication</span>
            <h2>Notifications</h2>
            <p>Configure alerts and operational communication.</p>
          </div>
        </div>

        <div class="card">
          <div class="settings-list">
            ${renderToggle(
              "notifications.enableNotifications",
              "Enable Notifications",
              "Allow AURA Clinic to display operational notifications."
            )}

            ${renderToggle(
              "notifications.enableSound",
              "Notification Sound",
              "Play sound for important operational alerts."
            )}

            ${renderToggle(
              "notifications.notifyQueueUpdates",
              "Queue Updates",
              "Notify users when queue activity changes."
            )}

            ${renderToggle(
              "notifications.notifyLabResults",
              "Laboratory Results",
              "Notify relevant staff when laboratory results are available."
            )}

            ${renderToggle(
              "notifications.notifyBilling",
              "Billing Updates",
              "Notify staff about invoice and payment events."
            )}

            ${renderToggle(
              "notifications.enableEmail",
              "Email Notifications",
              "Enable email notifications when an email provider is configured."
            )}

            ${renderToggle(
              "notifications.enableSMS",
              "SMS Notifications",
              "Enable SMS notifications when an SMS provider is configured."
            )}
          </div>
        </div>
      </section>
    `;
  }

  function renderSecuritySection() {
    const security = state.settings.security || {};

    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Access Control</span>
            <h2>Security</h2>
            <p>Configure account protection and audit preferences.</p>
          </div>
        </div>

        <div class="card">
          <div class="form-grid form-grid--two">
            <label class="form-field">
              <span class="form-label">Session Timeout</span>
              <select
                class="form-control"
                data-setting-select="security.sessionTimeoutMinutes"
              >
                ${[
                  [15, "15 minutes"],
                  [30, "30 minutes"],
                  [60, "60 minutes"],
                  [120, "2 hours"],
                  [240, "4 hours"],
                  [480, "8 hours"]
                ].map(([value, label]) => `
                  <option value="${value}" ${
                    Number(security.sessionTimeoutMinutes) === value
                      ? "selected"
                      : ""
                  }>
                    ${label}
                  </option>
                `).join("")}
              </select>
            </label>
          </div>

          <div class="settings-list">
            ${renderToggle(
              "security.requireStaffPhoto",
              "Require Staff Profile Photo",
              "Require a profile picture for every staff account."
            )}

            ${renderToggle(
              "security.enableAuditLog",
              "Enable Audit Log",
              "Record important user and system actions."
            )}

            ${renderToggle(
              "security.lockInactiveUsers",
              "Lock Inactive Users",
              "Prevent inactive staff accounts from accessing the system."
            )}
          </div>
        </div>
      </section>
    `;
  }

  function renderRegionalSection() {
    const regional = state.settings.regional || {};

    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Localization</span>
            <h2>Regional Preferences</h2>
            <p>Configure language, currency, and time formatting.</p>
          </div>
        </div>

        <div class="card">
          <div class="form-grid form-grid--two">
            <label class="form-field">
              <span class="form-label">Language</span>
              <select
                class="form-control"
                data-setting-select="system.language"
              >
                <option value="en" ${
                  state.settings.system.language === "en"
                    ? "selected"
                    : ""
                }>
                  English
                </option>

                <option value="ne" ${
                  state.settings.system.language === "ne"
                    ? "selected"
                    : ""
                }>
                  नेपाली
                </option>

                <option value="hi" ${
                  state.settings.system.language === "hi"
                    ? "selected"
                    : ""
                }>
                  हिन्दी
                </option>
              </select>
            </label>

            <label class="form-field">
              <span class="form-label">Currency</span>
              <select
                class="form-control"
                data-setting-select="regional.currency"
              >
                <option value="INR" ${
                  regional.currency === "INR" ? "selected" : ""
                }>
                  Indian Rupee (INR ₹)
                </option>

                <option value="NPR" ${
                  regional.currency === "NPR" ? "selected" : ""
                }>
                  Nepalese Rupee (NPR रू)
                </option>

                <option value="USD" ${
                  regional.currency === "USD" ? "selected" : ""
                }>
                  US Dollar (USD $)
                </option>
              </select>
            </label>

            <label class="form-field">
              <span class="form-label">Date Format</span>
              <select
                class="form-control"
                data-setting-select="regional.dateFormat"
              >
                <option value="DD/MM/YYYY" ${
                  regional.dateFormat === "DD/MM/YYYY" ? "selected" : ""
                }>
                  DD/MM/YYYY
                </option>

                <option value="MM/DD/YYYY" ${
                  regional.dateFormat === "MM/DD/YYYY" ? "selected" : ""
                }>
                  MM/DD/YYYY
                </option>

                <option value="YYYY-MM-DD" ${
                  regional.dateFormat === "YYYY-MM-DD" ? "selected" : ""
                }>
                  YYYY-MM-DD
                </option>
              </select>
            </label>

            <label class="form-field">
              <span class="form-label">Time Format</span>
              <select
                class="form-control"
                data-setting-select="regional.timeFormat"
              >
                <option value="12-hour" ${
                  regional.timeFormat === "12-hour" ? "selected" : ""
                }>
                  12-hour
                </option>

                <option value="24-hour" ${
                  regional.timeFormat === "24-hour" ? "selected" : ""
                }>
                  24-hour
                </option>
              </select>
            </label>

            <label class="form-field form-field--full">
              <span class="form-label">Timezone</span>
              <select
                class="form-control"
                data-setting-select="regional.timezone"
              >
                <option value="Asia/Kolkata" ${
                  regional.timezone === "Asia/Kolkata" ? "selected" : ""
                }>
                  Asia/Kolkata (India)
                </option>

                <option value="Asia/Kathmandu" ${
                  regional.timezone === "Asia/Kathmandu" ? "selected" : ""
                }>
                  Asia/Kathmandu (Nepal)
                </option>

                <option value="UTC" ${
                  regional.timezone === "UTC" ? "selected" : ""
                }>
                  UTC
                </option>
              </select>
            </label>
          </div>
        </div>
      </section>
    `;
  }

  function renderDataSection() {
    const system = state.settings.system || {};

    return `
      <section class="settings-section">
        <div class="settings-section__header">
          <div>
            <span class="eyebrow">Local Database</span>
            <h2>Data Management</h2>
            <p>Protect and maintain locally stored clinic information.</p>
          </div>
        </div>

        <div class="card">
          <div class="settings-danger-banner">
            <span class="material-symbols-rounded">info</span>
            <div>
              <strong>Local-first storage</strong>
              <p>
                AURA Clinic currently stores operational data in IndexedDB.
                Create regular backups before clearing or importing data.
              </p>
            </div>
          </div>

          <div class="settings-data-actions">
            <button
              type="button"
              class="btn btn-primary"
              data-settings-action="backup"
            >
              <span class="material-symbols-rounded">download</span>
              Export Backup
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              data-settings-action="restore"
            >
              <span class="material-symbols-rounded">upload</span>
              Import Backup
            </button>

            <button
              type="button"
              class="btn btn-ghost"
              data-settings-action="refresh-data"
            >
              <span class="material-symbols-rounded">refresh</span>
              Refresh Database
            </button>

            <button
              type="button"
              class="btn btn-danger"
              data-settings-action="clear-data"
            >
              <span class="material-symbols-rounded">delete_forever</span>
              Clear All Data
            </button>
          </div>

          <input
            type="file"
            id="settings-import-file"
            accept=".json,application/json"
            hidden
          />

          <div class="settings-summary">
            <div>
              <span>Last Backup</span>
              <strong>
                ${
                  system.lastBackupAt
                    ? escapeHtml(formatDateTime(system.lastBackupAt))
                    : "Never"
                }
              </strong>
            </div>

            <div>
              <span>Last Restore</span>
              <strong>
                ${
                  system.lastRestoreAt
                    ? escapeHtml(formatDateTime(system.lastRestoreAt))
                    : "Never"
                }
              </strong>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderActiveSection() {
    switch (state.activeSection) {
      case "appearance":
        return renderAppearanceSection();

      case "workflow":
        return renderWorkflowSection();

      case "notifications":
        return renderNotificationsSection();

      case "security":
        return renderSecuritySection();

      case "regional":
        return renderRegionalSection();

      case "data":
        return renderDataSection();

      case "clinic":
      default:
        return renderClinicSection();
    }
  }

  function render() {
    const target =
      document.querySelector('[data-route-view="settings"]') ||
      document.querySelector("#app-content") ||
      document.querySelector("#app");

    if (!target) return;

    if (state.isLoading) {
      target.innerHTML = `
        <section class="page-state page-state--loading">
          <div class="page-state__icon">
            <span class="material-symbols-rounded">progress_activity</span>
          </div>
          <h3>Loading settings</h3>
          <p>Preparing clinic configuration.</p>
        </section>
      `;
      return;
    }

    target.innerHTML = `
      <div class="page-shell settings-page">
        <div class="page-header">
          <div>
            <div class="eyebrow">
              <span class="material-symbols-rounded">settings</span>
              Administration
            </div>

            <h1>Settings</h1>

            <p class="page-header__subtitle">
              Configure clinic operations, preferences, and local data.
            </p>
          </div>

          <div class="page-header__actions">
            <button
              type="button"
              class="btn btn-primary"
              data-settings-action="save"
              ${state.isSaving ? "disabled" : ""}
            >
              <span class="material-symbols-rounded">
                ${state.isSaving ? "progress_activity" : "save"}
              </span>
              ${state.isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        <div class="settings-layout">
          ${renderSidebar()}

          <main class="settings-content">
            ${renderActiveSection()}
          </main>
        </div>
      </div>
    `;

    bindEvents(target);
  }

  /* =========================================================
     INPUT HANDLING
     ========================================================= */

  function convertInputValue(input) {
    const type = input.type;
    const rawValue = input.value;

    if (type === "checkbox") {
      return input.checked;
    }

    if (type === "number") {
      return Number(rawValue);
    }

    return rawValue;
  }

  async function handleInputChange(input) {
    const path =
      input.dataset.settingInput ||
      input.dataset.settingSelect ||
      input.dataset.settingPath;

    if (!path) return;

    const value = convertInputValue(input);

    setNested(state.settings, path, value);

    applyRuntimeSettings(path, value);

    notifySubscribers();

    if (
      input.dataset.settingPath ||
      input.dataset.settingSelect
    ) {
      await saveSettings();
    }
  }

  function bindEvents(container) {
    container.querySelectorAll("[data-settings-section]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeSection = button.dataset.settingsSection;
        render();
      });
    });

    container.querySelectorAll("[data-setting-input]").forEach((input) => {
      input.addEventListener("change", () => handleInputChange(input));
    });

    container.querySelectorAll("[data-setting-select]").forEach((input) => {
      input.addEventListener("change", () => handleInputChange(input));
    });

    container.querySelectorAll("[data-setting-path]").forEach((input) => {
      input.addEventListener("change", () => handleInputChange(input));
    });

    container.querySelectorAll("[data-settings-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.settingsAction;

        switch (action) {
          case "save":
            saveSettings().then(() => {
              notify(
                "success",
                "Settings saved",
                "Clinic preferences have been updated."
              );
              render();
            });
            break;

          case "upload-logo":
            document.querySelector("#settings-clinic-logo")?.click();
            break;

          case "remove-logo":
            removeLogo();
            break;

          case "backup":
            exportBackup();
            break;

          case "restore":
            document.querySelector("#settings-import-file")?.click();
            break;

          case "refresh-data":
            refreshData();
            break;

          case "clear-data":
            clearAllData();
            break;

          default:
            break;
        }
      });
    });

    const logoInput = container.querySelector("#settings-clinic-logo");

    if (logoInput) {
      logoInput.addEventListener("change", handleLogoUpload);
    }

    const importInput = container.querySelector("#settings-import-file");

    if (importInput) {
      importInput.addEventListener("change", handleImportFile);
    }
  }

  /* =========================================================
     LOGO MANAGEMENT
     ========================================================= */

  function handleLogoUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      notify(
        "warning",
        "Invalid logo",
        "Please select a PNG, JPG, or WebP image."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notify(
        "warning",
        "Image too large",
        "The clinic logo must be smaller than 5 MB."
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      state.settings.clinic.logo = reader.result;

      await saveSettings();

      notify(
        "success",
        "Logo updated",
        "Clinic branding has been updated."
      );

      render();
    };

    reader.readAsDataURL(file);
  }

  async function removeLogo() {
    state.settings.clinic.logo = "";

    await saveSettings();

    notify(
      "success",
      "Logo removed",
      "The clinic logo has been removed."
    );

    render();
  }

  /* =========================================================
     BACKUP AND RESTORE
     ========================================================= */

  async function exportBackup() {
    if (!STORAGE || typeof STORAGE.exportDatabase !== "function") {
      notify(
        "error",
        "Backup unavailable",
        "Database export is not available."
      );
      return;
    }

    try {
      const backup = await STORAGE.exportDatabase();

      const payload = {
        app: "AURA Clinic",
        version: CONFIG.app?.version || "1.0.0",
        exportedAt: new Date().toISOString(),
        settings: clone(state.settings),
        database: backup
      };

      const json = JSON.stringify(payload, null, 2);
      const filename = `aura-clinic-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

      if (UTILS && typeof UTILS.downloadFile === "function") {
        UTILS.downloadFile(
          filename,
          json,
          "application/json;charset=utf-8"
        );
      } else {
        const blob = new Blob([json], {
          type: "application/json;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = filename;
        anchor.click();

        URL.revokeObjectURL(url);
      }

      state.settings.system.lastBackupAt = new Date().toISOString();
      await saveSettings();

      notify(
        "success",
        "Backup exported",
        "Your local clinic backup has been downloaded."
      );

      emit("settings:backup-exported", {
        filename,
        exportedAt: state.settings.system.lastBackupAt
      });

      render();
    } catch (error) {
      console.error("[AURA Settings] Backup failed:", error);

      notify(
        "error",
        "Backup failed",
        "Unable to export the local database."
      );
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid backup file.");
      }

      const confirmed = window.confirm(
        "Importing a backup may overwrite existing local records. Continue?"
      );

      if (!confirmed) {
        event.target.value = "";
        return;
      }

      if (
        payload.settings &&
        typeof payload.settings === "object"
      ) {
        state.settings = deepMerge(
          DEFAULT_SETTINGS,
          payload.settings
        );

        await saveSettings();
      }

      if (
        STORAGE &&
        typeof STORAGE.importDatabase === "function" &&
        payload.database
      ) {
        await STORAGE.importDatabase(payload.database);
      }

      state.settings.system.lastRestoreAt = new Date().toISOString();
      await saveSettings();

      notify(
        "success",
        "Backup imported",
        "Local clinic data has been restored."
      );

      emit("settings:backup-imported", {
        importedAt: state.settings.system.lastRestoreAt
      });

      applyAllRuntimeSettings();
      render();
    } catch (error) {
      console.error("[AURA Settings] Restore failed:", error);

      notify(
        "error",
        "Restore failed",
        "The selected backup file could not be imported."
      );
    } finally {
      event.target.value = "";
    }
  }

  async function refreshData() {
    if (
      STORAGE &&
      typeof STORAGE.initialize === "function"
    ) {
      await STORAGE.initialize();
    }

    if (
      window.AURA_APP &&
      typeof window.AURA_APP.refresh === "function"
    ) {
      await window.AURA_APP.refresh();
    }

    notify(
      "success",
      "Database refreshed",
      "Local application data is ready."
    );

    emit("settings:data-refreshed", {
      refreshedAt: new Date().toISOString()
    });
  }

  async function clearAllData() {
    const firstConfirmation = window.confirm(
      "This will permanently remove all locally stored clinic records. Continue?"
    );

    if (!firstConfirmation) return;

    const secondConfirmation = window.confirm(
      "Final confirmation: permanently delete all AURA Clinic data?"
    );

    if (!secondConfirmation) return;

    if (
      !STORAGE ||
      typeof STORAGE.clear !== "function"
    ) {
      notify(
        "error",
        "Clear unavailable",
        "Database clearing is not available."
      );
      return;
    }

    const stores = [
      "users",
      "staff",
      "patients",
      "encounters",
      "queues",
      "vitals",
      "consultations",
      "prescriptions",
      "labOrders",
      "labResults",
      "invoices",
      "payments",
      "services",
      "departments",
      "notifications",
      "auditLogs"
    ];

    try {
      for (const storeName of stores) {
        try {
          await STORAGE.clear(storeName);
        } catch (error) {
          console.warn(
            `[AURA Settings] Unable to clear ${storeName}:`,
            error
          );
        }
      }

      state.settings = clone(DEFAULT_SETTINGS);
      await saveSettings();

      notify(
        "success",
        "Data cleared",
        "All local clinic records have been removed."
      );

      emit("settings:data-cleared", {
        clearedAt: new Date().toISOString()
      });

      render();
    } catch (error) {
      console.error("[AURA Settings] Clear data failed:", error);

      notify(
        "error",
        "Unable to clear data",
        "Please try again."
      );
    }
  }

  /* =========================================================
     INITIALIZATION
     ========================================================= */

  async function initialize() {
    if (state.initialized) {
      return getState();
    }

    state.initialized = true;

    await loadSettings();
    applyAllRuntimeSettings();

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
        refresh: loadSettings,
        getState,
        subscribe,
        updateSettings,
        saveSettings,
        exportBackup,
        clearAllData
      });
    }
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.AURA_SETTINGS = {
    initialize,
    render,
    refresh: loadSettings,
    getState,
    subscribe,
    updateSettings,
    saveSettings,
    exportBackup,
    clearAllData,
    applyTheme
  };

  window.AURA = window.AURA || {};
  window.AURA.settings = window.AURA_SETTINGS;

  registerModule();

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

})();