/**
 * AURA Clinic
 * Core Application Bootstrap
 *
 * Responsibilities:
 * - Initialize the application.
 * - Manage navigation and routes.
 * - Manage theme and sidebar state.
 * - Connect authentication and persistence layers.
 * - Provide global application events.
 * - Keep UI modules independent from one another.
 */

(function (window, document) {
  "use strict";

  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const SUPABASE = window.AURA_SUPABASE || null;

  const AURA_APP = {
    initialized: false,
    currentRoute: null,
    previousRoute: null,
    user: null,
    session: null,
    listeners: new Map(),
    modules: new Map()
  };

  const routeMap = {
    dashboard: {
      label: "Dashboard",
      title: "Dashboard",
      template: "dashboard"
    },
    patients: {
      label: "Patients",
      title: "Patient Management",
      template: "patients"
    },
    registration: {
      label: "Registration",
      title: "Patient Registration",
      template: "registration"
    },
    queue: {
      label: "Queue",
      title: "Central Queue Management",
      template: "queue"
    },
    nursing: {
      label: "Nursing",
      title: "Nursing & Pre-Consultation",
      template: "nursing"
    },
    doctor: {
      label: "Doctor",
      title: "Doctor Consultation",
      template: "doctor"
    },
    laboratory: {
      label: "Laboratory",
      title: "Laboratory & Diagnostics",
      template: "laboratory"
    },
    billing: {
      label: "Billing",
      title: "Billing & Payments",
      template: "billing"
    },
    staff: {
      label: "Staff",
      title: "Staff Management",
      template: "staff"
    },
    reports: {
      label: "Reports",
      title: "Reports & Analytics",
      template: "reports"
    },
    settings: {
      label: "Settings",
      title: "Settings",
      template: "settings"
    },
    more: {
      label: "More",
      title: "More Options",
      template: "more"
    }
  };

  const selectors = {
    app: "#app",
    loadingScreen: "#loading-screen",
    authScreen: "#auth-screen",
    appShell: "#app-shell",
    pageContainer: "#page-container",
    pageTitle: "#page-title",
    breadcrumb: "#breadcrumb",
    sidebar: "#sidebar",
    sidebarToggle: "#sidebar-toggle",
    mobileNav: "#mobile-bottom-nav",
    themeToggle: "[data-action='toggle-theme']",
    routeLinks: "[data-route]",
    modalContainer: "#modal-container",
    toastContainer: "#toast-container",
    globalSearch: "#global-search",
    notificationButton: "#notification-button",
    userMenuButton: "#user-menu-button",
    logoutButton: "[data-action='logout']"
  };

  function $(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  function $$(selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  }

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent("aura:" + name, {
        detail: detail || {}
      })
    );
  }

  function on(name, callback) {
    if (typeof callback !== "function") {
      return function () {};
    }

    if (!AURA_APP.listeners.has(name)) {
      AURA_APP.listeners.set(name, new Set());
    }

    AURA_APP.listeners.get(name).add(callback);

    return function unsubscribe() {
      AURA_APP.listeners.get(name)?.delete(callback);
    };
  }

  function emit(name, payload) {
    const listeners = AURA_APP.listeners.get(name);

    if (!listeners) {
      return;
    }

    listeners.forEach(function (callback) {
      try {
        callback(payload);
      } catch (error) {
        console.error("[AURA Clinic] Event listener error:", error);
      }
    });
  }

  function getElement(selector) {
    return $(selector);
  }

  function showElement(element) {
    if (!element) {
      return;
    }

    element.hidden = false;
    element.removeAttribute("aria-hidden");
  }

  function hideElement(element) {
    if (!element) {
      return;
    }

    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
  }

  function setText(selector, value) {
    const element = $(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function getStorageKey(key) {
    if (typeof CONFIG.getStorageKey === "function") {
      return CONFIG.getStorageKey(key);
    }

    return "aura_clinic_" + key;
  }

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(getStorageKey(key));

      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn("[AURA Clinic] Storage read failed:", error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(
        getStorageKey(key),
        JSON.stringify(value)
      );

      return true;
    } catch (error) {
      console.warn("[AURA Clinic] Storage write failed:", error);
      return false;
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(getStorageKey(key));
    } catch (error) {
      console.warn("[AURA Clinic] Storage removal failed:", error);
    }
  }

  function getTheme() {
    const savedTheme = readStorage("theme", null);

    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }

    return CONFIG.app?.defaultTheme || "light";
  }

  function applyTheme(theme) {
    const selectedTheme = theme === "dark" ? "dark" : "light";

    document.documentElement.dataset.theme = selectedTheme;

    writeStorage("theme", selectedTheme);

    $$("[data-theme-icon]").forEach(function (icon) {
      icon.hidden = icon.dataset.themeIcon !== selectedTheme;
    });

    $$("[data-action='toggle-theme']").forEach(function (button) {
      button.setAttribute(
        "aria-label",
        selectedTheme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      );

      button.setAttribute(
        "title",
        selectedTheme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      );
    });

    dispatch("theme-change", {
      theme: selectedTheme
    });

    emit("theme-change", selectedTheme);

    return selectedTheme;
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme || "light";

    return applyTheme(
      currentTheme === "dark" ? "light" : "dark"
    );
  }

  function isSidebarCollapsed() {
    return document.body.classList.contains("sidebar-collapsed");
  }

  function applySidebarState(collapsed) {
    document.body.classList.toggle("sidebar-collapsed", Boolean(collapsed));

    const sidebar = $(selectors.sidebar);
    const toggle = $(selectors.sidebarToggle);

    if (sidebar) {
      sidebar.setAttribute(
        "aria-expanded",
        String(!collapsed)
      );
    }

    if (toggle) {
      toggle.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar"
      );
    }

    writeStorage("sidebar_collapsed", Boolean(collapsed));

    dispatch("sidebar-change", {
      collapsed: Boolean(collapsed)
    });
  }

  function toggleSidebar() {
    applySidebarState(!isSidebarCollapsed());
  }

  function initializeSidebar() {
    const savedState = readStorage("sidebar_collapsed", false);

    applySidebarState(Boolean(savedState));

    const toggle = $(selectors.sidebarToggle);

    if (toggle) {
      toggle.addEventListener("click", toggleSidebar);
    }
  }

  function getCurrentPath() {
    const hash = window.location.hash.replace(/^#\/?/, "").trim();

    return hash || CONFIG.app?.defaultRoute || "dashboard";
  }

  function normalizeRoute(route) {
    if (!route) {
      return CONFIG.app?.defaultRoute || "dashboard";
    }

    const normalized = String(route)
      .replace(/^#\/?/, "")
      .replace(/^\/+|\/+$/g, "")
      .split("?")[0]
      .trim()
      .toLowerCase();

    return routeMap[normalized] ? normalized : "dashboard";
  }

  function updateUrl(route, replace) {
    const normalizedRoute = normalizeRoute(route);
    const newHash = "#/" + normalizedRoute;

    if (window.location.hash !== newHash) {
      if (replace) {
        history.replaceState(null, "", newHash);
      } else {
        history.pushState(null, "", newHash);
      }
    }
  }

  function updateNavigation(route) {
    $$(selectors.routeLinks).forEach(function (link) {
      const linkRoute = normalizeRoute(link.dataset.route);

      const isActive = linkRoute === route;

      link.classList.toggle("active", isActive);
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function updatePageMeta(route) {
    const routeInfo = routeMap[route];

    if (!routeInfo) {
      return;
    }

    document.title =
      routeInfo.title + " | " + (CONFIG.app?.name || "AURA Clinic");

    setText(selectors.pageTitle, routeInfo.title);

    const breadcrumb = $(selectors.breadcrumb);

    if (breadcrumb) {
      breadcrumb.textContent = routeInfo.label;
    }
  }

  function showLoading(message) {
    const loadingScreen = $(selectors.loadingScreen);

    if (!loadingScreen) {
      return;
    }

    const loadingMessage = loadingScreen.querySelector(
      "[data-loading-message]"
    );

    if (loadingMessage && message) {
      loadingMessage.textContent = message;
    }

    showElement(loadingScreen);
  }

  function hideLoading() {
    const loadingScreen = $(selectors.loadingScreen);

    if (!loadingScreen) {
      return;
    }

    loadingScreen.classList.add("is-hidden");

    window.setTimeout(function () {
      hideElement(loadingScreen);
    }, 250);
  }

  function showAuthScreen() {
    hideElement($(selectors.appShell));
    showElement($(selectors.authScreen));
  }

  function showAppShell() {
    hideElement($(selectors.authScreen));
    showElement($(selectors.appShell));
  }

  function createPagePlaceholder(route) {
    const routeInfo = routeMap[route];

    return `
      <section class="workspace workspace--placeholder" data-page="${route}">
        <div class="workspace__header">
          <div>
            <p class="eyebrow">AURA Clinic</p>
            <h1 class="workspace__title">${routeInfo.title}</h1>
            <p class="text-muted">
              This module is ready for clinical workflow integration.
            </p>
          </div>
        </div>

        <div class="workspace-panel workspace-panel--muted">
          <div class="workspace-panel__body">
            <div class="workspace-empty">
              <div class="workspace-empty__icon" aria-hidden="true">
                <span class="icon icon-${getRouteIcon(route)}"></span>
              </div>
              <h2>${routeInfo.label}</h2>
              <p>
                The ${routeInfo.label.toLowerCase()} module will be connected
                to its dedicated workflow in the next implementation phase.
              </p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function getRouteIcon(route) {
    const icons = {
      dashboard: "dashboard",
      patients: "users",
      registration: "user-plus",
      queue: "list",
      nursing: "heart-pulse",
      doctor: "stethoscope",
      laboratory: "flask",
      billing: "receipt",
      staff: "user-cog",
      reports: "bar-chart",
      settings: "settings",
      more: "more-horizontal"
    };

    return icons[route] || "grid";
  }

  function renderRoute(route) {
    const container = $(selectors.pageContainer);

    if (!container) {
      return;
    }

    const routeInfo = routeMap[route];

    if (!routeInfo) {
      container.innerHTML = createPagePlaceholder("dashboard");
      return;
    }

    const module = AURA_APP.modules.get(route);

    if (module && typeof module.render === "function") {
      const rendered = module.render(container, {
        route: route,
        app: AURA_APP,
        config: CONFIG
      });

      if (typeof rendered === "string") {
        container.innerHTML = rendered;
      }
    } else {
      container.innerHTML = createPagePlaceholder(route);
    }

    container.dataset.currentRoute = route;

    dispatch("route-rendered", {
      route: route,
      routeInfo: routeInfo
    });

    emit("route-rendered", route);
  }

  async function navigate(route, options) {
    const navigationOptions = options || {};
    const normalizedRoute = normalizeRoute(route);

    if (
      AURA_APP.currentRoute === normalizedRoute &&
      !navigationOptions.force
    ) {
      return normalizedRoute;
    }

    const previousRoute = AURA_APP.currentRoute;

    AURA_APP.previousRoute = previousRoute;
    AURA_APP.currentRoute = normalizedRoute;

    if (!navigationOptions.skipUrl) {
      updateUrl(
        normalizedRoute,
        Boolean(navigationOptions.replace)
      );
    }

    updateNavigation(normalizedRoute);
    updatePageMeta(normalizedRoute);

    renderRoute(normalizedRoute);

    dispatch("route-change", {
      route: normalizedRoute,
      previousRoute: previousRoute
    });

    emit("route-change", {
      route: normalizedRoute,
      previousRoute: previousRoute
    });

    return normalizedRoute;
  }

  function initializeNavigation() {
    $$(selectors.routeLinks).forEach(function (link) {
      link.addEventListener("click", function (event) {
        const route = link.dataset.route;

        if (!route) {
          return;
        }

        event.preventDefault();

        navigate(route);

        const mobileNav = $(selectors.mobileNav);

        if (mobileNav) {
          mobileNav.classList.remove("is-open");
        }
      });
    });

    window.addEventListener("hashchange", function () {
      navigate(getCurrentPath(), {
        skipUrl: true
      });
    });

    window.addEventListener("popstate", function () {
      navigate(getCurrentPath(), {
        skipUrl: true
      });
    });
  }

  function registerModule(name, module) {
    if (!name || !module) {
      return false;
    }

    AURA_APP.modules.set(name, module);

    return true;
  }

  function unregisterModule(name) {
    return AURA_APP.modules.delete(name);
  }

  function initializeTheme() {
    applyTheme(getTheme());

    $$(selectors.themeToggle).forEach(function (button) {
      button.addEventListener("click", toggleTheme);
    });
  }

  function showToast(message, type, options) {
    const container = $(selectors.toastContainer);

    if (!container || !message) {
      return;
    }

    const toastOptions = options || {};
    const toastType = type || "info";
    const duration = Number.isFinite(toastOptions.duration)
      ? toastOptions.duration
      : CONFIG.notifications?.defaultDuration || 4000;

    const toast = document.createElement("div");

    toast.className =
      "toast toast--" + toastType;

    toast.setAttribute("role", "status");

    toast.innerHTML = `
      <div class="toast__icon" aria-hidden="true">
        ${getToastIcon(toastType)}
      </div>
      <div class="toast__content">
        <strong class="toast__title">
          ${escapeHtml(toastOptions.title || getToastTitle(toastType))}
        </strong>
        <p class="toast__message">${escapeHtml(String(message))}</p>
      </div>
      <button
        type="button"
        class="toast__close"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    `;

    const closeButton = toast.querySelector(".toast__close");

    const removeToast = function () {
      toast.classList.add("is-leaving");

      window.setTimeout(function () {
        toast.remove();
      }, 180);
    };

    closeButton.addEventListener("click", removeToast);

    container.appendChild(toast);

    window.setTimeout(removeToast, duration);

    return toast;
  }

  function getToastTitle(type) {
    const titles = {
      success: "Success",
      error: "Error",
      warning: "Attention",
      info: "Information"
    };

    return titles[type] || titles.info;
  }

  function getToastIcon(type) {
    const icons = {
      success: "✓",
      error: "!",
      warning: "⚠",
      info: "i"
    };

    return icons[type] || icons.info;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showModal(options) {
    const container = $(selectors.modalContainer);

    if (!container) {
      return null;
    }

    const modalOptions = options || {};

    const modal = document.createElement("div");

    modal.className = "modal-backdrop is-visible";
    modal.dataset.modalId = modalOptions.id || "modal-" + Date.now();

    modal.innerHTML = `
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="${modal.dataset.modalId}-title"
      >
        <div class="modal__header">
          <div>
            <p class="eyebrow">${escapeHtml(modalOptions.eyebrow || "")}</p>
            <h2 id="${modal.dataset.modalId}-title">
              ${escapeHtml(modalOptions.title || "AURA Clinic")}
            </h2>
          </div>
          <button
            type="button"
            class="modal__close"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div class="modal__body">
          ${modalOptions.content || ""}
        </div>

        ${
          modalOptions.footer
            ? `<div class="modal__footer">${modalOptions.footer}</div>`
            : ""
        }
      </div>
    `;

    const closeButton = modal.querySelector(".modal__close");

    const close = function () {
      modal.classList.remove("is-visible");

      window.setTimeout(function () {
        modal.remove();
      }, 180);

      dispatch("modal-close", {
        id: modal.dataset.modalId
      });
    };

    closeButton.addEventListener("click", close);

    modal.addEventListener("click", function (event) {
      if (
        event.target === modal &&
        modalOptions.closeOnBackdrop !== false
      ) {
        close();
      }
    });

    document.addEventListener("keydown", function escapeHandler(event) {
      if (
        event.key === "Escape" &&
        document.body.contains(modal)
      ) {
        close();
        document.removeEventListener("keydown", escapeHandler);
      }
    });

    container.appendChild(modal);

    dispatch("modal-open", {
      id: modal.dataset.modalId
    });

    return {
      element: modal,
      close: close
    };
  }

  function initializeGlobalSearch() {
    const search = $(selectors.globalSearch);

    if (!search) {
      return;
    }

    search.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") {
        return;
      }

      const query = search.value.trim();

      if (!query) {
        return;
      }

      dispatch("global-search", {
        query: query
      });

      emit("global-search", query);
    });
  }

  function initializeUserActions() {
    $$(selectors.logoutButton).forEach(function (button) {
      button.addEventListener("click", async function () {
        await logout();
      });
    });
  }

  async function restoreSession() {
    if (!SUPABASE || !SUPABASE.isEnabled()) {
      return null;
    }

    try {
      const result = await SUPABASE.auth.getSession();

      if (result.error) {
        throw result.error;
      }

      AURA_APP.session = result.data?.session || null;
      AURA_APP.user = result.data?.session?.user || null;

      return AURA_APP.session;
    } catch (error) {
      console.warn("[AURA Clinic] Session restoration failed:", error);
      return null;
    }
  }

  async function logout() {
    if (SUPABASE && SUPABASE.isEnabled()) {
      try {
        await SUPABASE.auth.signOut();
      } catch (error) {
        console.warn("[AURA Clinic] Supabase sign-out failed:", error);
      }
    }

    AURA_APP.session = null;
    AURA_APP.user = null;

    removeStorage("session");

    showAuthScreen();

    dispatch("logout");

    emit("logout");

    showToast("You have been signed out.", "success");
  }

  function initializeAuthListener() {
    document.addEventListener(
      "aura:auth-state-change",
      function (event) {
        const detail = event.detail || {};

        AURA_APP.session = detail.session || null;
        AURA_APP.user = detail.session?.user || null;

        if (detail.session) {
          showAppShell();
        }
      }
    );
  }

  function registerGlobalApi() {
    window.AURA_APP = AURA_APP;

    window.AURA = window.AURA || {};

    window.AURA.app = AURA_APP;

    window.AURA.navigate = navigate;
    window.AURA.toast = showToast;
    window.AURA.modal = showModal;
    window.AURA.on = on;
    window.AURA.emit = emit;
    window.AURA.registerModule = registerModule;
    window.AURA.toggleTheme = toggleTheme;
    window.AURA.toggleSidebar = toggleSidebar;
    window.AURA.logout = logout;
  }

  async function initialize() {
    if (AURA_APP.initialized) {
      return AURA_APP;
    }

    AURA_APP.initialized = true;

    showLoading(
      CONFIG.messages?.appLoading || "Preparing AURA Clinic..."
    );

    registerGlobalApi();
    initializeTheme();
    initializeSidebar();
    initializeNavigation();
    initializeGlobalSearch();
    initializeUserActions();
    initializeAuthListener();

    await restoreSession();

    showAppShell();

    const initialRoute = normalizeRoute(getCurrentPath());

    await navigate(initialRoute, {
      skipUrl: false,
      force: true
    });

    hideLoading();

    dispatch("app-ready", {
      app: AURA_APP
    });

    emit("app-ready", AURA_APP);

    if (CONFIG.log) {
      CONFIG.log(
        "Application initialized:",
        CONFIG.app?.name || "AURA Clinic"
      );
    }

    return AURA_APP;
  }

  function boot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize, {
        once: true
      });
    } else {
      initialize();
    }
  }

  window.AURA_CORE = {
    initialize: initialize,
    navigate: navigate,
    registerModule: registerModule,
    unregisterModule: unregisterModule,
    showToast: showToast,
    showModal: showModal,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    applySidebarState: applySidebarState,
    toggleSidebar: toggleSidebar,
    getCurrentPath: getCurrentPath,
    getState: function () {
      return {
        ...AURA_APP,
        listeners: undefined,
        modules: undefined
      };
    },
    on: on,
    emit: emit
  };

  boot();

})(window, document);