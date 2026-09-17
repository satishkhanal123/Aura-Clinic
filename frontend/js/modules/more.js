/* =========================================================
   AURA CLINIC — MORE MODULE
   File: frontend/js/modules/more.js
   Purpose: Secondary navigation and administrative tools
   ========================================================= */

(function () {
  "use strict";

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE;
  const EVENTS = window.AURA_EVENTS;
  const UTILS = window.AURA_UTILS;
  const APP = window.AURA_APP;

  const MODULE_NAME = "more";

  const state = {
    activeView: "hub",
    notifications: [],
    auditLogs: [],
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

  function formatDateTime(value) {
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
        console.error("[AURA More] Subscriber error:", error);
      }
    });
  }

  function getState() {
    return {
      ...state,
      notifications: [...state.notifications],
      auditLogs: [...state.auditLogs]
    };
  }

  function navigate(route) {
    if (
      window.AURA_ROUTER &&
      typeof window.AURA_ROUTER.navigate === "function"
    ) {
      window.AURA_ROUTER.navigate(route);
      return;
    }

    if (
      window.AURA_APP &&
      typeof window.AURA_APP.navigate === "function"
    ) {
      window.AURA_APP.navigate(route);
      return;
    }

    window.location.hash = `#/${route}`;
  }

  /* =========================================================
     DATA
     ========================================================= */

  async function loadData() {
    state.isLoading = true;

    try {
      if (STORAGE && typeof STORAGE.getAll === "function") {
        const results = await Promise.all([
          STORAGE.getAll("notifications").catch(() => []),
          STORAGE.getAll("auditLogs").catch(() => [])
        ]);

        state.notifications = Array.isArray(results[0])
          ? results[0]
          : [];

        state.auditLogs = Array.isArray(results[1])
          ? results[1]
          : [];
      }
    } catch (error) {
      console.warn("[AURA More] Unable to load data:", error);
    }

    state.isLoading = false;

    notifySubscribers();

    return getState();
  }

  function getUnreadNotifications() {
    return state.notifications.filter(
      (notification) =>
        notification.read !== true &&
        notification.isRead !== true &&
        notification.status !== "read"
    );
  }

  function getRecentAuditLogs() {
    return [...state.auditLogs]
      .sort((a, b) => {
        const first = new Date(
          b.createdAt ||
          b.timestamp ||
          b.updatedAt ||
          0
        );

        const second = new Date(
          a.createdAt ||
          a.timestamp ||
          a.updatedAt ||
          0
        );

        return first - second;
      })
      .slice(0, 10);
  }

  /* =========================================================
     MODULE DEFINITIONS
     ========================================================= */

  const MENU_ITEMS = [
    {
      id: "pharmacy",
      label: "Pharmacy",
      description: "Prescriptions and medicine dispensing.",
      icon: "medication",
      route: "pharmacy",
      available: true
    },
    {
      id: "pathology",
      label: "Pathology",
      description: "Laboratory investigations and reports.",
      icon: "biotech",
      route: "laboratory",
      available: true
    },
    {
      id: "radiology",
      label: "Radiology",
      description: "Imaging requests and diagnostic records.",
      icon: "radiology",
      route: "laboratory",
      available: true
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Operational alerts and system messages.",
      icon: "notifications",
      view: "notifications",
      available: true
    },
    {
      id: "audit",
      label: "Audit Logs",
      description: "Review important system activities.",
      icon: "history",
      view: "audit",
      available: true
    },
    {
      id: "reports",
      label: "Reports",
      description: "Clinical, operational, and financial analytics.",
      icon: "analytics",
      route: "reports",
      available: true
    },
    {
      id: "settings",
      label: "Settings",
      description: "Clinic preferences and configuration.",
      icon: "settings",
      route: "settings",
      available: true
    }
  ];

  /* =========================================================
     RENDERING
     ========================================================= */

  function renderHeader() {
    return `
      <div class="page-header">
        <div>
          <div class="eyebrow">
            <span class="material-symbols-rounded">apps</span>
            Administration Hub
          </div>

          <h1>More</h1>

          <p class="page-header__subtitle">
            Access additional clinical, administrative, and system tools.
          </p>
        </div>
      </div>
    `;
  }

  function renderSummaryCards() {
    const unreadCount = getUnreadNotifications().length;
    const recentAuditCount = getRecentAuditLogs().length;

    return `
      <section class="metrics-grid metrics-grid--three">
        <article class="metric-card">
          <div class="metric-card__icon">
            <span class="material-symbols-rounded">notifications</span>
          </div>

          <div class="metric-card__body">
            <span class="metric-card__label">Unread Notifications</span>
            <strong class="metric-card__value">${unreadCount}</strong>
            <span class="metric-card__caption">Requires attention</span>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">
            <span class="material-symbols-rounded">history</span>
          </div>

          <div class="metric-card__body">
            <span class="metric-card__label">Recent Audit Events</span>
            <strong class="metric-card__value">${recentAuditCount}</strong>
            <span class="metric-card__caption">Latest recorded activities</span>
          </div>
        </article>

        <article class="metric-card">
          <div class="metric-card__icon">
            <span class="material-symbols-rounded">verified</span>
          </div>

          <div class="metric-card__body">
            <span class="metric-card__label">System Status</span>
            <strong class="metric-card__value">Ready</strong>
            <span class="metric-card__caption">Local application active</span>
          </div>
        </article>
      </section>
    `;
  }

  function renderMenu() {
    return `
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Clinic Tools</h2>
            <p class="card__subtitle">
              Open modules and administrative functions.
            </p>
          </div>
        </div>

        <div class="more-menu-grid">
          ${MENU_ITEMS.filter((item) => item.available).map((item) => `
            <button
              type="button"
              class="more-menu-card"
              data-more-action="open"
              data-more-id="${escapeHtml(item.id)}"
            >
              <span class="more-menu-card__icon">
                <span class="material-symbols-rounded">
                  ${escapeHtml(item.icon)}
                </span>
              </span>

              <span class="more-menu-card__body">
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.description)}</small>
              </span>

              <span class="material-symbols-rounded more-menu-card__arrow">
                arrow_forward_ios
              </span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderNotifications() {
    const notifications = [...state.notifications]
      .sort((a, b) => {
        return new Date(
          b.createdAt ||
          b.timestamp ||
          b.updatedAt ||
          0
        ) - new Date(
          a.createdAt ||
          a.timestamp ||
          a.updatedAt ||
          0
        );
      });

    return `
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Notifications</h2>
            <p class="card__subtitle">
              Operational alerts and system messages.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-more-action="back"
          >
            <span class="material-symbols-rounded">arrow_back</span>
            Back
          </button>
        </div>

        ${
          notifications.length
            ? `
              <div class="notification-list">
                ${notifications.map((notification) => {
                  const isUnread =
                    notification.read !== true &&
                    notification.isRead !== true &&
                    notification.status !== "read";

                  return `
                    <article class="notification-item ${
                      isUnread ? "is-unread" : ""
                    }">
                      <div class="notification-item__icon">
                        <span class="material-symbols-rounded">
                          ${
                            notification.icon ||
                            "notifications"
                          }
                        </span>
                      </div>

                      <div class="notification-item__content">
                        <strong>
                          ${escapeHtml(
                            notification.title ||
                            notification.message ||
                            "Notification"
                          )}
                        </strong>

                        <p>
                          ${escapeHtml(
                            notification.message ||
                            notification.description ||
                            ""
                          )}
                        </p>

                        <time>
                          ${escapeHtml(
                            formatDateTime(
                              notification.createdAt ||
                              notification.timestamp
                            )
                          )}
                        </time>
                      </div>

                      ${
                        isUnread
                          ? `
                            <button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              data-more-action="mark-read"
                              data-notification-id="${escapeHtml(
                                notification.id || ""
                              )}"
                            >
                              Mark read
                            </button>
                          `
                          : ""
                      }
                    </article>
                  `;
                }).join("")}
              </div>
            `
            : `
              <div class="page-state">
                <div class="page-state__icon">
                  <span class="material-symbols-rounded">
                    notifications_none
                  </span>
                </div>

                <h3>No notifications</h3>
                <p>There are no operational alerts at this time.</p>
              </div>
            `
        }
      </section>
    `;
  }

  function renderAuditLogs() {
    const logs = getRecentAuditLogs();

    return `
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Audit Logs</h2>
            <p class="card__subtitle">
              Recent system activities and administrative events.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-more-action="back"
          >
            <span class="material-symbols-rounded">arrow_back</span>
            Back
          </button>
        </div>

        <div class="report-table-wrap">
          ${
            logs.length
              ? `
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Action</th>
                      <th>User</th>
                      <th>Description</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${logs.map((log) => `
                      <tr>
                        <td>
                          ${escapeHtml(
                            formatDateTime(
                              log.createdAt ||
                              log.timestamp ||
                              log.updatedAt
                            )
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            log.action ||
                            log.event ||
                            log.type ||
                            "System activity"
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            log.userName ||
                            log.staffName ||
                            log.actorName ||
                            log.userId ||
                            log.staffId ||
                            "System"
                          )}
                        </td>

                        <td>
                          ${escapeHtml(
                            log.description ||
                            log.message ||
                            ""
                          )}
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              `
              : `
                <div class="page-state">
                  <div class="page-state__icon">
                    <span class="material-symbols-rounded">
                      history
                    </span>
                  </div>

                  <h3>No audit records</h3>
                  <p>System activity will appear here when recorded.</p>
                </div>
              `
          }
        </div>
      </section>
    `;
  }

  function renderAbout() {
    const appName =
      CONFIG.app?.name ||
      "AURA Clinic";

    const version =
      CONFIG.app?.version ||
      "1.0.0";

    return `
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">About AURA Clinic</h2>
            <p class="card__subtitle">
              Application information and system details.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-more-action="back"
          >
            <span class="material-symbols-rounded">arrow_back</span>
            Back
          </button>
        </div>

        <div class="about-panel">
          <div class="about-panel__logo">
            <span class="material-symbols-rounded">medical_services</span>
          </div>

          <div>
            <h3>${escapeHtml(appName)}</h3>
            <p>
              A premium local-first clinic management platform for
              reception, nursing, consultation, diagnostics, billing,
              and administration.
            </p>
          </div>
        </div>

        <div class="report-summary-grid">
          <div class="report-summary-item">
            <span>Application Version</span>
            <strong>${escapeHtml(version)}</strong>
          </div>

          <div class="report-summary-item">
            <span>Storage Engine</span>
            <strong>IndexedDB</strong>
          </div>

          <div class="report-summary-item">
            <span>Frontend</span>
            <strong>HTML · CSS · JavaScript</strong>
          </div>

          <div class="report-summary-item">
            <span>Currency</span>
            <strong>INR ₹</strong>
          </div>
        </div>
      </section>
    `;
  }

  function renderHelp() {
    return `
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Help & Support</h2>
            <p class="card__subtitle">
              Quick guidance for using AURA Clinic.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-more-action="back"
          >
            <span class="material-symbols-rounded">arrow_back</span>
            Back
          </button>
        </div>

        <div class="help-list">
          <article class="help-item">
            <span class="material-symbols-rounded">how_to_reg</span>
            <div>
              <strong>Register a Patient</strong>
              <p>
                Open Registration, create or retrieve the UHID, and add
                the patient to the appropriate queue.
              </p>
            </div>
          </article>

          <article class="help-item">
            <span class="material-symbols-rounded">groups</span>
            <div>
              <strong>Manage the Queue</strong>
              <p>
                Use Queue Management to call patients, move them through
                nursing, consultation, and diagnostics.
              </p>
            </div>
          </article>

          <article class="help-item">
            <span class="material-symbols-rounded">science</span>
            <div>
              <strong>Process Laboratory Orders</strong>
              <p>
                Laboratory staff can review orders, enter results, and
                verify completed reports.
              </p>
            </div>
          </article>

          <article class="help-item">
            <span class="material-symbols-rounded">backup</span>
            <div>
              <strong>Protect Your Data</strong>
              <p>
                Open Settings regularly and export a local backup before
                major changes or database maintenance.
              </p>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderActiveView() {
    switch (state.activeView) {
      case "notifications":
        return renderNotifications();

      case "audit":
        return renderAuditLogs();

      case "about":
        return renderAbout();

      case "help":
        return renderHelp();

      case "hub":
      default:
        return `
          ${renderSummaryCards()}
          ${renderMenu()}

          <section class="card">
            <div class="card__header">
              <div>
                <h2 class="card__title">Quick Information</h2>
                <p class="card__subtitle">
                  Additional system resources.
                </p>
              </div>
            </div>

            <div class="more-quick-links">
              <button
                type="button"
                class="btn btn-secondary"
                data-more-action="open-view"
                data-more-view="help"
              >
                <span class="material-symbols-rounded">help</span>
                Help & Support
              </button>

              <button
                type="button"
                class="btn btn-secondary"
                data-more-action="open-view"
                data-more-view="about"
              >
                <span class="material-symbols-rounded">info</span>
                About AURA Clinic
              </button>
            </div>
          </section>
        `;
    }
  }

  function render() {
    const target =
      document.querySelector('[data-route-view="more"]') ||
      document.querySelector("#app-content") ||
      document.querySelector("#app");

    if (!target) return;

    if (state.isLoading) {
      target.innerHTML = `
        <section class="page-state page-state--loading">
          <div class="page-state__icon">
            <span class="material-symbols-rounded">
              progress_activity
            </span>
          </div>

          <h3>Loading tools</h3>
          <p>Preparing administrative resources.</p>
        </section>
      `;
      return;
    }

    target.innerHTML = `
      <div class="page-shell more-page">
        ${renderHeader()}

        <div class="more-page__body">
          ${renderActiveView()}
        </div>
      </div>
    `;

    bindEvents(target);
  }

  /* =========================================================
     ACTIONS
     ========================================================= */

  function openMenuItem(itemId) {
    const item = MENU_ITEMS.find((entry) => entry.id === itemId);

    if (!item) return;

    if (item.route) {
      navigate(item.route);
      return;
    }

    if (item.view) {
      state.activeView = item.view;
      render();
      return;
    }
  }

  async function markNotificationRead(notificationId) {
    if (!notificationId || !STORAGE) return;

    const notification = state.notifications.find(
      (item) => item.id === notificationId
    );

    if (!notification) return;

    notification.read = true;
    notification.isRead = true;
    notification.status = "read";
    notification.readAt = new Date().toISOString();

    try {
      if (typeof STORAGE.put === "function") {
        await STORAGE.put("notifications", notification);
      }

      emit("notification:read", {
        notification
      });

      notify(
        "success",
        "Notification updated",
        "Notification marked as read."
      );

      render();
      notifySubscribers();
    } catch (error) {
      console.error("[AURA More] Unable to mark notification read:", error);

      notify(
        "error",
        "Unable to update notification",
        "Please try again."
      );
    }
  }

  function bindEvents(container) {
    container.querySelectorAll("[data-more-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.moreAction;

        if (action === "open") {
          openMenuItem(button.dataset.moreId);
        }

        if (action === "open-view") {
          state.activeView = button.dataset.moreView || "hub";
          render();
        }

        if (action === "back") {
          state.activeView = "hub";
          render();
        }

        if (action === "mark-read") {
          markNotificationRead(button.dataset.notificationId);
        }
      });
    });
  }

  /* =========================================================
     INITIALIZATION
     ========================================================= */

  async function refresh() {
    await loadData();
    render();
    return getState();
  }

  function registerEventListeners() {
    if (!EVENTS || typeof EVENTS.on !== "function") return;

    const eventNames = [
      "notification:created",
      "notification:updated",
      "notification:read",
      "storage:change"
    ];

    eventNames.forEach((eventName) => {
      EVENTS.on(eventName, () => {
        refresh();
      });
    });
  }

  async function initialize() {
    if (state.initialized) {
      return getState();
    }

    state.initialized = true;

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
        subscribe
      });
    }
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.AURA_MORE = {
    initialize,
    render,
    refresh,
    getState,
    subscribe,
    openMenuItem
  };

  window.AURA = window.AURA || {};
  window.AURA.more = window.AURA_MORE;

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