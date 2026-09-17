/* =========================================================
   AURA Clinic — Core Router
   Path: frontend/js/core/router.js
   Purpose: Hash-based SPA routing and navigation management
   ========================================================= */

(function (window) {
  'use strict';

  const AURA = window.AURA || (window.AURA = {});
  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const EVENTS = window.AURA_EVENTS || null;
  const UTILS = window.AURA_UTILS || {};

  const router = {
    initialized: false,
    currentRoute: null,
    previousRoute: null,
    routes: new Map(),
    guards: [],
    notFoundRoute: 'dashboard',
    basePath: ''
  };

  /* =========================================================
     Route Definitions
     ========================================================= */

  const defaultRoutes = {
    dashboard: {
      path: 'dashboard',
      title: 'Dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      module: 'dashboard',
      permission: null
    },

    patients: {
      path: 'patients',
      title: 'Patients',
      label: 'Patients',
      icon: 'patients',
      module: 'patients',
      permission: 'patients.view'
    },

    registration: {
      path: 'registration',
      title: 'Patient Registration',
      label: 'Registration',
      icon: 'registration',
      module: 'registration',
      permission: 'patients.create'
    },

    queue: {
      path: 'queue',
      title: 'Queue Management',
      label: 'Queue',
      icon: 'queue',
      module: 'queue',
      permission: 'queue.view'
    },

    nursing: {
      path: 'nursing',
      title: 'Nursing & Vitals',
      label: 'Nursing',
      icon: 'nursing',
      module: 'nursing',
      permission: 'vitals.view'
    },

    doctor: {
      path: 'doctor',
      title: 'Doctor Consultation',
      label: 'Doctor',
      icon: 'doctor',
      module: 'doctor',
      permission: 'consultation.view'
    },

    laboratory: {
      path: 'laboratory',
      title: 'Laboratory & Diagnostics',
      label: 'Laboratory',
      icon: 'laboratory',
      module: 'laboratory',
      permission: 'laboratory.view'
    },

    pharmacy: {
      path: 'pharmacy',
      title: 'Pharmacy',
      label: 'Pharmacy',
      icon: 'pharmacy',
      module: 'pharmacy',
      permission: 'pharmacy.view'
    },

    billing: {
      path: 'billing',
      title: 'Billing & Payments',
      label: 'Billing',
      icon: 'billing',
      module: 'billing',
      permission: 'billing.view'
    },

    staff: {
      path: 'staff',
      title: 'Staff Management',
      label: 'Staff',
      icon: 'staff',
      module: 'staff',
      permission: 'staff.view'
    },

    reports: {
      path: 'reports',
      title: 'Reports & Analytics',
      label: 'Reports',
      icon: 'reports',
      module: 'reports',
      permission: 'reports.view'
    },

    settings: {
      path: 'settings',
      title: 'Settings',
      label: 'Settings',
      icon: 'settings',
      module: 'settings',
      permission: 'settings.view'
    },

    more: {
      path: 'more',
      title: 'More',
      label: 'More',
      icon: 'more',
      module: 'more',
      permission: null
    }
  };

  /* =========================================================
     Initialization
     ========================================================= */

  router.init = function (options = {}) {
    if (router.initialized) return router;

    router.basePath = options.basePath || '';

    const configuredRoutes = options.routes || defaultRoutes;

    Object.entries(configuredRoutes).forEach(([name, definition]) => {
      router.register(name, definition);
    });

    window.addEventListener('hashchange', router.handleHashChange);

    router.initialized = true;

    const initialRoute = router.getRouteFromHash();

    router.navigate(initialRoute.name, {
      replace: true,
      silent: true,
      initial: true
    });

    return router;
  };

  /* =========================================================
     Route Registration
     ========================================================= */

  router.register = function (name, definition = {}) {
    if (!name) return null;

    const route = {
      name,
      path: definition.path || name,
      title: definition.title || UTILS.capitalizeWords?.(name) || name,
      label: definition.label || definition.title || name,
      icon: definition.icon || 'circle',
      module: definition.module || name,
      permission: definition.permission || null,
      requiresAuth: definition.requiresAuth !== false,
      render: definition.render || null,
      beforeEnter: definition.beforeEnter || null,
      afterEnter: definition.afterEnter || null,
      meta: definition.meta || {}
    };

    router.routes.set(name, route);

    return route;
  };

  router.unregister = function (name) {
    return router.routes.delete(name);
  };

  router.getRoute = function (name) {
    return router.routes.get(name) || null;
  };

  router.getRoutes = function () {
    return Array.from(router.routes.values());
  };

  router.hasRoute = function (name) {
    return router.routes.has(name);
  };

  /* =========================================================
     Hash Parsing
     ========================================================= */

  router.normalizePath = function (path) {
    let normalized = String(path || '').trim();

    normalized = normalized.replace(/^#/, '');
    normalized = normalized.replace(/^\/+/, '');
    normalized = normalized.replace(/\/+$/, '');

    return normalized || router.notFoundRoute;
  };

  router.getRouteFromHash = function () {
    const hash = window.location.hash || '';
    const rawHash = hash.replace(/^#/, '');

    const [pathPart, queryPart = ''] = rawHash.split('?');
    const normalizedPath = router.normalizePath(pathPart);

    const route = router.findRouteByPath(normalizedPath);

    return {
      name: route?.name || router.notFoundRoute,
      path: normalizedPath,
      query: router.parseQuery(queryPart),
      params: router.extractParams(normalizedPath, route),
      route
    };
  };

  router.findRouteByPath = function (path) {
    const normalizedPath = router.normalizePath(path);

    for (const route of router.routes.values()) {
      if (route.path === normalizedPath) {
        return route;
      }
    }

    return null;
  };

  router.parseQuery = function (queryString = '') {
    const params = new URLSearchParams(queryString);
    const query = {};

    params.forEach((value, key) => {
      query[key] = value;
    });

    return query;
  };

  router.extractParams = function (path, route) {
    if (!route || !route.path) return {};

    const routeParts = route.path.split('/');
    const pathParts = path.split('/');
    const params = {};

    routeParts.forEach((part, index) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = pathParts[index] || '';
      }
    });

    return params;
  };

  /* =========================================================
     Navigation
     ========================================================= */

  router.navigate = async function (name, options = {}) {
    const route = router.getRoute(name) || router.findRouteByPath(name);

    if (!route) {
      return router.navigate(router.notFoundRoute, {
        ...options,
        replace: true
      });
    }

    const target = {
      name: route.name,
      path: route.path,
      route,
      query: options.query || {},
      params: options.params || {}
    };

    const previous = router.currentRoute;

    if (
      previous &&
      previous.name === target.name &&
      !options.force
    ) {
      router.updateUrl(target, options);
      return target;
    }

    const allowed = await router.runGuards(target, previous);

    if (!allowed) {
      return null;
    }

    router.previousRoute = previous;
    router.currentRoute = target;

    router.updateUrl(target, options);
    router.updateActiveNavigation(target.name);
    router.updateDocumentTitle(route);

    if (typeof route.render === 'function') {
      await route.render(target);
    }

    if (AURA_APP?.handleRouteChange) {
      await AURA_APP.handleRouteChange(target.name, target);
    }

    router.emitRouteChange(target, previous);

    if (typeof route.afterEnter === 'function') {
      await route.afterEnter(target, previous);
    }

    return target;
  };

  router.go = function (name, options = {}) {
    return router.navigate(name, options);
  };

  router.replace = function (name, options = {}) {
    return router.navigate(name, {
      ...options,
      replace: true
    });
  };

  router.updateUrl = function (target, options = {}) {
    const queryString = router.buildQuery(target.query);
    const hash = `#${target.path}${queryString}`;

    if (options.replace) {
      const url = `${window.location.pathname}${window.location.search}${hash}`;

      window.history.replaceState(
        { auraRoute: target.name },
        '',
        url
      );
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  };

  router.buildQuery = function (query = {}) {
    const params = new URLSearchParams();

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;

      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, item));
      } else {
        params.set(key, value);
      }
    });

    const serialized = params.toString();

    return serialized ? `?${serialized}` : '';
  };

  router.handleHashChange = function () {
    const target = router.getRouteFromHash();

    router.navigate(target.name, {
      query: target.query,
      params: target.params,
      fromHashChange: true
    });
  };

  router.back = function () {
    if (router.previousRoute) {
      return router.navigate(router.previousRoute.name);
    }

    window.history.back();
  };

  router.refresh = function () {
    if (!router.currentRoute) return null;

    return router.navigate(router.currentRoute.name, {
      force: true,
      query: router.currentRoute.query,
      params: router.currentRoute.params
    });
  };

  /* =========================================================
     Route Guards
     ========================================================= */

  router.addGuard = function (guard) {
    if (typeof guard !== 'function') return () => {};

    router.guards.push(guard);

    return function removeGuard() {
      const index = router.guards.indexOf(guard);

      if (index !== -1) {
        router.guards.splice(index, 1);
      }
    };
  };

  router.runGuards = async function (target, previous) {
    for (const guard of router.guards) {
      const result = await guard(target, previous);

      if (result === false) {
        return false;
      }

      if (typeof result === 'string') {
        await router.navigate(result, { replace: true });
        return false;
      }
    }

    if (typeof target.route.beforeEnter === 'function') {
      const result = await target.route.beforeEnter(target, previous);

      if (result === false) return false;

      if (typeof result === 'string') {
        await router.navigate(result, { replace: true });
        return false;
      }
    }

    return true;
  };

  /* =========================================================
     Authentication and Permission Guards
     ========================================================= */

  router.addGuard(async function authenticationGuard(target) {
    if (target.route.requiresAuth === false) {
      return true;
    }

    const authState = AURA_AUTH?.getState
      ? AURA_AUTH.getState()
      : null;

    if (!authState || authState.authenticated !== false) {
      return true;
    }

    if (target.name === 'login') {
      return true;
    }

    if (AURA_APP?.logout) {
      AURA_APP.logout({ redirect: false });
    }

    return 'dashboard';
  });

  router.canAccess = function (routeOrName) {
    const route = typeof routeOrName === 'string'
      ? router.getRoute(routeOrName)
      : routeOrName;

    if (!route) return false;

    if (!route.permission) return true;

    if (typeof CONFIG.hasPermission === 'function') {
      return CONFIG.hasPermission(route.permission);
    }

    if (AURA_AUTH?.hasPermission) {
      return AURA_AUTH.hasPermission(route.permission);
    }

    return true;
  };

  router.addGuard(async function permissionGuard(target) {
    if (router.canAccess(target.route)) {
      return true;
    }

    if (AURA?.toast) {
      AURA.toast(
        'You do not have permission to access this section.',
        'warning'
      );
    }

    return 'dashboard';
  });

  /* =========================================================
     Navigation UI
     ========================================================= */

  router.updateActiveNavigation = function (routeName) {
    const selectors = [
      '[data-route]',
      '[data-nav-route]',
      '[data-page]'
    ];

    const elements = document.querySelectorAll(selectors.join(','));

    elements.forEach(element => {
      const elementRoute =
        element.dataset.route ||
        element.dataset.navRoute ||
        element.dataset.page;

      const isActive = elementRoute === routeName;

      element.classList.toggle('active', isActive);

      if (isActive) {
        element.setAttribute('aria-current', 'page');
      } else {
        element.removeAttribute('aria-current');
      }
    });
  };

  router.updateDocumentTitle = function (route) {
    if (!route) return;

    const clinicName =
      CONFIG.clinic?.name ||
      CONFIG.app?.name ||
      'AURA Clinic';

    document.title = `${route.title} | ${clinicName}`;
  };

  router.bindNavigation = function (scope = document) {
    const elements = scope.querySelectorAll(
      '[data-route], [data-nav-route], [data-page]'
    );

    elements.forEach(element => {
      if (element.dataset.routerBound === 'true') return;

      element.dataset.routerBound = 'true';

      element.addEventListener('click', function (event) {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const routeName =
          element.dataset.route ||
          element.dataset.navRoute ||
          element.dataset.page;

        if (!routeName) return;

        event.preventDefault();

        const query = utilsDatasetQuery(element);

        router.navigate(routeName, { query });
      });
    });

    function utilsDatasetQuery(element) {
      const query = {};

      Object.entries(element.dataset).forEach(([key, value]) => {
        if (key.startsWith('query')) {
          const queryKey = key
            .replace(/^query/, '')
            .replace(/^[A-Z]/, character => character.toLowerCase());

          if (queryKey) {
            query[queryKey] = value;
          }
        }
      });

      return query;
    }

    return elements;
  };

  /* =========================================================
     Events
     ========================================================= */

  router.emitRouteChange = function (current, previous) {
    const payload = {
      current,
      previous,
      route: current.route,
      timestamp: new Date().toISOString()
    };

    if (EVENTS?.emit) {
      EVENTS.emit('route:change', payload);
    }

    document.dispatchEvent(
      new CustomEvent('aura:route-change', {
        detail: payload
      })
    );
  };

  /* =========================================================
     Utility Accessors
     ========================================================= */

  router.getCurrentRoute = function () {
    return router.currentRoute;
  };

  router.getPreviousRoute = function () {
    return router.previousRoute;
  };

  router.is = function (name) {
    return router.currentRoute?.name === name;
  };

  router.getPath = function () {
    return router.currentRoute?.path || '';
  };

  router.getQuery = function (key) {
    if (!router.currentRoute) return undefined;

    if (key === undefined) {
      return router.currentRoute.query;
    }

    return router.currentRoute.query?.[key];
  };

  router.getParam = function (key) {
    if (!router.currentRoute) return undefined;

    if (key === undefined) {
      return router.currentRoute.params;
    }

    return router.currentRoute.params?.[key];
  };

  router.clear = function () {
    window.removeEventListener('hashchange', router.handleHashChange);

    router.routes.clear();
    router.guards.length = 0;
    router.currentRoute = null;
    router.previousRoute = null;
    router.initialized = false;
  };

  /* =========================================================
     Global Exposure
     ========================================================= */

  AURA_ROUTER = router;

  AURA.router = router;
  window.AURA_ROUTER = router;

  window.AURA_NAVIGATE = function (name, options) {
    return router.navigate(name, options);
  };

  /* =========================================================
     Startup
     ========================================================= */

  document.addEventListener('DOMContentLoaded', function () {
    router.bindNavigation();

    if (!router.initialized) {
      router.init();
    }
  });

})(window);