/* =========================================================
   AURA Clinic — Dashboard Module
   Path: frontend/js/modules/dashboard.js
   Purpose: Dashboard metrics, queue summary, activity, and actions
   ========================================================= */

(function (window) {
  'use strict';

  const AURA = window.AURA || (window.AURA = {});
  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};
  const STORAGE = window.AURA_STORAGE || AURA.storage;
  const EVENTS = window.AURA_EVENTS || AURA.events;
  const UTILS = window.AURA_UTILS || AURA.utils;
  const ROUTER = window.AURA_ROUTER || AURA.router;

  const dashboard = {
    name: 'dashboard',
    initialized: false,
    container: null,
    data: {
      patients: [],
      queues: [],
      encounters: [],
      invoices: [],
      payments: [],
      activities: []
    }
  };

  /* =========================================================
     Configuration
     ========================================================= */

  const stores = {
    patients: CONFIG.storage?.stores?.patients || 'patients',
    queues: CONFIG.storage?.stores?.queues || 'queues',
    encounters: CONFIG.storage?.stores?.encounters || 'encounters',
    invoices: CONFIG.storage?.stores?.invoices || 'invoices',
    payments: CONFIG.storage?.stores?.payments || 'payments',
    auditLogs: CONFIG.storage?.stores?.auditLogs || 'auditLogs'
  };

  /* =========================================================
     Initialization
     ========================================================= */

  dashboard.init = async function () {
    if (dashboard.initialized) return dashboard;

    dashboard.initialized = true;

    dashboard.bindEvents();

    return dashboard;
  };

  dashboard.bindEvents = function () {
    if (!EVENTS?.on) return;

    const refreshEvents = [
      'patient:created',
      'patient:updated',
      'patient:deleted',
      'queue:created',
      'queue:called',
      'queue:completed',
      'consultation:completed',
      'invoice:created',
      'payment:created',
      'storage:change'
    ];

    refreshEvents.forEach(eventName => {
      EVENTS.on(eventName, function () {
        if (dashboard.isActive()) {
          dashboard.refresh();
        }
      });
    });
  };

  /* =========================================================
     Route Rendering
     ========================================================= */

  dashboard.render = async function (context = {}) {
    dashboard.container = document.querySelector(
      '[data-route-view="dashboard"]'
    );

    if (!dashboard.container) {
      dashboard.container = document.querySelector('#app-content');
    }

    if (!dashboard.container) {
      return;
    }

    await dashboard.loadData();
    dashboard.renderLayout(context);
    dashboard.renderMetrics();
    dashboard.renderQueueSummary();
    dashboard.renderRecentActivity();
    dashboard.renderQuickActions();

    dashboard.bindDomEvents();
  };

  dashboard.isActive = function () {
    if (ROUTER?.is) {
      return ROUTER.is('dashboard');
    }

    return window.location.hash === '#dashboard' ||
      window.location.hash === '';
  };

  /* =========================================================
     Data Loading
     ========================================================= */

  dashboard.loadData = async function () {
    if (!STORAGE) return;

    try {
      const [
        patients,
        queues,
        encounters,
        invoices,
        payments,
        activities
      ] = await Promise.all([
        STORAGE.getAll(stores.patients),
        STORAGE.getAll(stores.queues),
        STORAGE.getAll(stores.encounters),
        STORAGE.getAll(stores.invoices),
        STORAGE.getAll(stores.payments),
        STORAGE.getAll(stores.auditLogs)
      ]);

      dashboard.data.patients = patients || [];
      dashboard.data.queues = queues || [];
      dashboard.data.encounters = encounters || [];
      dashboard.data.invoices = invoices || [];
      dashboard.data.payments = payments || [];
      dashboard.data.activities = activities || [];
    } catch (error) {
      console.error('AURA Dashboard: Failed to load data.', error);

      dashboard.data = {
        patients: [],
        queues: [],
        encounters: [],
        invoices: [],
        payments: [],
        activities: []
      };
    }
  };

  /* =========================================================
     Calculations
     ========================================================= */

  dashboard.getTodayRecords = function (items) {
    return (items || []).filter(item => {
      return UTILS?.isToday
        ? UTILS.isToday(
            item.createdAt ||
            item.updatedAt ||
            item.timestamp ||
            item.date
          )
        : true;
    });
  };

  dashboard.getMetrics = function () {
    const patientsToday = dashboard.getTodayRecords(
      dashboard.data.patients
    );

    const encountersToday = dashboard.getTodayRecords(
      dashboard.data.encounters
    );

    const queuesToday = dashboard.getTodayRecords(
      dashboard.data.queues
    );

    const invoicesToday = dashboard.getTodayRecords(
      dashboard.data.invoices
    );

    const paymentsToday = dashboard.getTodayRecords(
      dashboard.data.payments
    );

    const waitingQueues = dashboard.data.queues.filter(queue => {
      return ['waiting', 'called', 'in_progress'].includes(
        String(queue.status || '').toLowerCase()
      );
    });

    const completedQueues = queuesToday.filter(queue => {
      return String(queue.status || '').toLowerCase() === 'completed';
    });

    const totalRevenue = paymentsToday.reduce((total, payment) => {
      return total + Number(payment.amount || payment.paidAmount || 0);
    }, 0);

    return {
      totalPatients: dashboard.data.patients.length,
      patientsToday: patientsToday.length,
      encountersToday: encountersToday.length,
      waitingPatients: waitingQueues.length,
      completedVisits: completedQueues.length,
      invoicesToday: invoicesToday.length,
      paymentsToday: paymentsToday.length,
      revenueToday: totalRevenue
    };
  };

  /* =========================================================
     Layout
     ========================================================= */

  dashboard.renderLayout = function () {
    dashboard.container.innerHTML = `
      <section class="page-header dashboard-page-header">
        <div>
          <p class="eyebrow">AURA Clinic</p>
          <h1>Good day, <span data-dashboard-user>Administrator</span></h1>
          <p class="page-subtitle">
            Here's what's happening across your clinic today.
          </p>
        </div>

        <div class="page-actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-dashboard-action="refresh"
          >
            <span class="icon">↻</span>
            Refresh
          </button>

          <button
            type="button"
            class="btn btn-primary"
            data-dashboard-action="register-patient"
          >
            <span class="icon">＋</span>
            Register Patient
          </button>
        </div>
      </section>

      <section class="dashboard-kpi-grid" data-dashboard-metrics>
        <div class="dashboard-kpi-card skeleton-card"></div>
        <div class="dashboard-kpi-card skeleton-card"></div>
        <div class="dashboard-kpi-card skeleton-card"></div>
        <div class="dashboard-kpi-card skeleton-card"></div>
      </section>

      <section class="dashboard-content-grid">
        <div class="dashboard-main-column">

          <section class="card dashboard-queue-card">
            <div class="card-header">
              <div>
                <h2>Today's Queue</h2>
                <p class="card-subtitle">
                  Patient flow across active departments.
                </p>
              </div>

              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-dashboard-action="open-queue"
              >
                View Queue
                <span aria-hidden="true">→</span>
              </button>
            </div>

            <div class="card-body" data-dashboard-queue>
              <div class="loading-state">Loading queue...</div>
            </div>
          </section>

          <section class="card dashboard-activity-card">
            <div class="card-header">
              <div>
                <h2>Recent Activity</h2>
                <p class="card-subtitle">
                  Latest operational updates.
                </p>
              </div>

              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-dashboard-action="open-reports"
              >
                View Reports
                <span aria-hidden="true">→</span>
              </button>
            </div>

            <div class="card-body" data-dashboard-activity>
              <div class="loading-state">Loading activity...</div>
            </div>
          </section>

        </div>

        <aside class="dashboard-side-column">

          <section class="card quick-actions-card">
            <div class="card-header">
              <div>
                <h2>Quick Actions</h2>
                <p class="card-subtitle">Common clinic tasks.</p>
              </div>
            </div>

            <div class="card-body" data-dashboard-quick-actions></div>
          </section>

          <section class="card dashboard-summary-card">
            <div class="card-header">
              <div>
                <h2>Today's Summary</h2>
                <p class="card-subtitle">Operational snapshot.</p>
              </div>
            </div>

            <div class="card-body" data-dashboard-summary></div>
          </section>

        </aside>
      </section>
    `;
  };

  /* =========================================================
     Metrics
     ========================================================= */

  dashboard.renderMetrics = function () {
    const container = dashboard.container.querySelector(
      '[data-dashboard-metrics]'
    );

    if (!container) return;

    const metrics = dashboard.getMetrics();

    container.innerHTML = `
      ${dashboard.metricCard(
        'Patients Today',
        metrics.patientsToday,
        'New registrations',
        'patients',
        'primary'
      )}

      ${dashboard.metricCard(
        'Waiting Patients',
        metrics.waitingPatients,
        'Active queue',
        'queue',
        'warning'
      )}

      ${dashboard.metricCard(
        'Completed Visits',
        metrics.completedVisits,
        'Consultations completed',
        'check',
        'success'
      )}

      ${dashboard.metricCard(
        'Revenue Today',
        UTILS?.formatCurrency
          ? UTILS.formatCurrency(metrics.revenueToday)
          : `₹${metrics.revenueToday.toLocaleString('en-IN')}`,
        `${metrics.paymentsToday} payments recorded`,
        'billing',
        'info'
      )}
    `;
  };

  dashboard.metricCard = function (
    title,
    value,
    subtitle,
    icon,
    tone
  ) {
    return `
      <article class="dashboard-kpi-card ${tone}">
        <div class="dashboard-kpi-icon" aria-hidden="true">
          ${dashboard.getIcon(icon)}
        </div>

        <div class="dashboard-kpi-content">
          <p class="dashboard-kpi-label">${UTILS.escapeHtml(title)}</p>
          <strong class="dashboard-kpi-value">
            ${UTILS.escapeHtml(String(value))}
          </strong>
          <span class="dashboard-kpi-subtitle">
            ${UTILS.escapeHtml(subtitle)}
          </span>
        </div>
      </article>
    `;
  };

  /* =========================================================
     Queue Summary
     ========================================================= */

  dashboard.renderQueueSummary = function () {
    const container = dashboard.container.querySelector(
      '[data-dashboard-queue]'
    );

    if (!container) return;

    const todayQueues = dashboard.getTodayRecords(
      dashboard.data.queues
    );

    if (!todayQueues.length) {
      container.innerHTML = dashboard.emptyState(
        'No patients in the queue today.',
        'New registrations will appear here.'
      );

      return;
    }

    const grouped = UTILS?.groupBy
      ? UTILS.groupBy(todayQueues, queue => queue.department || 'General')
      : { General: todayQueues };

    const groups = Object.entries(grouped);

    container.innerHTML = groups.map(([department, queues]) => {
      const waiting = queues.filter(queue => {
        return String(queue.status || '').toLowerCase() === 'waiting';
      }).length;

      const called = queues.filter(queue => {
        return String(queue.status || '').toLowerCase() === 'called';
      }).length;

      const completed = queues.filter(queue => {
        return String(queue.status || '').toLowerCase() === 'completed';
      }).length;

      return `
        <div class="dashboard-queue-row">
          <div class="dashboard-queue-department">
            <span class="status-dot status-dot-info"></span>
            <strong>${UTILS.escapeHtml(
              UTILS.capitalizeWords
                ? UTILS.capitalizeWords(department)
                : department
            )}</strong>
          </div>

          <div class="dashboard-queue-counts">
            <span class="badge badge-warning">${waiting} waiting</span>
            <span class="badge badge-info">${called} called</span>
            <span class="badge badge-success">${completed} completed</span>
          </div>
        </div>
      `;
    }).join('');
  };

  /* =========================================================
     Recent Activity
     ========================================================= */

  dashboard.renderRecentActivity = function () {
    const container = dashboard.container.querySelector(
      '[data-dashboard-activity]'
    );

    if (!container) return;

    const activities = [...dashboard.data.activities]
      .sort((a, b) => {
        const first = new Date(
          a.timestamp || a.createdAt || a.updatedAt || 0
        );

        const second = new Date(
          b.timestamp || b.createdAt || b.updatedAt || 0
        );

        return second - first;
      })
      .slice(0, 8);

    if (!activities.length) {
      container.innerHTML = dashboard.emptyState(
        'No recent activity.',
        'Clinic events will appear here as work is completed.'
      );

      return;
    }

    container.innerHTML = `
      <div class="activity-feed">
        ${activities.map(activity => dashboard.activityItem(activity)).join('')}
      </div>
    `;
  };

  dashboard.activityItem = function (activity) {
    const action = activity.action || 'Activity recorded';
    const details = activity.details || {};
    const timestamp =
      activity.timestamp ||
      activity.createdAt ||
      activity.updatedAt;

    const description =
      details.description ||
      details.message ||
      details.name ||
      action;

    return `
      <div class="activity-item">
        <div class="activity-item-icon">
          ${dashboard.getIcon('activity')}
        </div>

        <div class="activity-item-content">
          <strong>${UTILS.escapeHtml(
            UTILS.getStatusLabel
              ? UTILS.getStatusLabel(action)
              : action
          )}</strong>

          <p>${UTILS.escapeHtml(String(description))}</p>

          <time datetime="${UTILS.escapeHtml(timestamp || '')}">
            ${UTILS.timeAgo
              ? UTILS.timeAgo(timestamp)
              : UTILS.formatDateTime(timestamp)}
          </time>
        </div>
      </div>
    `;
  };

  /* =========================================================
     Quick Actions
     ========================================================= */

  dashboard.renderQuickActions = function () {
    const container = dashboard.container.querySelector(
      '[data-dashboard-quick-actions]'
    );

    if (!container) return;

    const actions = [
      {
        route: 'registration',
        icon: 'registration',
        label: 'Register Patient',
        description: 'Create a new patient record.'
      },
      {
        route: 'queue',
        icon: 'queue',
        label: 'Manage Queue',
        description: 'Call and manage waiting patients.'
      },
      {
        route: 'nursing',
        icon: 'nursing',
        label: 'Record Vitals',
        description: 'Start pre-consultation workflow.'
      },
      {
        route: 'billing',
        icon: 'billing',
        label: 'Create Invoice',
        description: 'Process charges and payments.'
      }
    ];

    container.innerHTML = actions.map(action => `
      <button
        type="button"
        class="quick-action-item"
        data-dashboard-route="${UTILS.escapeHtml(action.route)}"
      >
        <span class="quick-action-icon">
          ${dashboard.getIcon(action.icon)}
        </span>

        <span class="quick-action-content">
          <strong>${UTILS.escapeHtml(action.label)}</strong>
          <small>${UTILS.escapeHtml(action.description)}</small>
        </span>

        <span class="quick-action-arrow" aria-hidden="true">→</span>
      </button>
    `).join('');

    const summaryContainer = dashboard.container.querySelector(
      '[data-dashboard-summary]'
    );

    if (summaryContainer) {
      dashboard.renderSummary(summaryContainer);
    }
  };

  dashboard.renderSummary = function (container) {
    const metrics = dashboard.getMetrics();

    container.innerHTML = `
      <div class="summary-list">
        <div class="summary-row">
          <span>Total Registered Patients</span>
          <strong>${metrics.totalPatients}</strong>
        </div>

        <div class="summary-row">
          <span>Today's Encounters</span>
          <strong>${metrics.encountersToday}</strong>
        </div>

        <div class="summary-row">
          <span>Today's Invoices</span>
          <strong>${metrics.invoicesToday}</strong>
        </div>

        <div class="summary-row">
          <span>Payments Received</span>
          <strong>${metrics.paymentsToday}</strong>
        </div>
      </div>
    `;
  };

  /* =========================================================
     DOM Events
     ========================================================= */

  dashboard.bindDomEvents = function () {
    if (!dashboard.container) return;

    dashboard.container.addEventListener('click', function (event) {
      const actionElement = event.target.closest(
        '[data-dashboard-action]'
      );

      if (actionElement) {
        dashboard.handleAction(
          actionElement.dataset.dashboardAction
        );

        return;
      }

      const routeElement = event.target.closest(
        '[data-dashboard-route]'
      );

      if (routeElement) {
        dashboard.navigate(routeElement.dataset.dashboardRoute);
      }
    });
  };

  dashboard.handleAction = function (action) {
    const routes = {
      'register-patient': 'registration',
      'open-queue': 'queue',
      'open-reports': 'reports'
    };

    if (action === 'refresh') {
      dashboard.refresh();
      return;
    }

    if (routes[action]) {
      dashboard.navigate(routes[action]);
    }
  };

  dashboard.navigate = function (route) {
    if (ROUTER?.navigate) {
      ROUTER.navigate(route);
      return;
    }

    if (AURA.navigate) {
      AURA.navigate(route);
      return;
    }

    window.location.hash = `#${route}`;
  };

  /* =========================================================
     Icons and Empty States
     ========================================================= */

  dashboard.getIcon = function (name) {
    const icons = {
      dashboard: '▦',
      patients: '♙',
      registration: '＋',
      queue: '☷',
      nursing: '♡',
      doctor: '✚',
      laboratory: '⚗',
      pharmacy: '▣',
      billing: '₹',
      check: '✓',
      activity: '•',
      reports: '▤',
      settings: '⚙',
      more: '⋯'
    };

    return icons[name] || '•';
  };

  dashboard.emptyState = function (title, message) {
    return `
      <div class="empty-state dashboard-empty-state">
        <div class="empty-state-icon">○</div>
        <h3>${UTILS.escapeHtml(title)}</h3>
        <p>${UTILS.escapeHtml(message)}</p>
      </div>
    `;
  };

  /* =========================================================
     Refresh
     ========================================================= */

  dashboard.refresh = async function () {
    if (!dashboard.isActive()) return;

    const button = dashboard.container?.querySelector(
      '[data-dashboard-action="refresh"]'
    );

    if (button) {
      button.disabled = true;
      button.classList.add('is-loading');
    }

    await dashboard.loadData();

    dashboard.renderMetrics();
    dashboard.renderQueueSummary();
    dashboard.renderRecentActivity();

    const summaryContainer = dashboard.container?.querySelector(
      '[data-dashboard-summary]'
    );

    if (summaryContainer) {
      dashboard.renderSummary(summaryContainer);
    }

    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
    }

    if (AURA.toast) {
      AURA.toast('Dashboard refreshed.', 'success');
    }

    return dashboard.data;
  };

  /* =========================================================
     Module Registration
     ========================================================= */

  dashboard.register = function () {
    if (AURA_APP?.registerModule) {
      AURA_APP.registerModule('dashboard', dashboard);
    }

    if (AURA.router?.register) {
      AURA.router.register('dashboard', {
        path: 'dashboard',
        title: 'Dashboard',
        label: 'Dashboard',
        icon: 'dashboard',
        module: 'dashboard',
        permission: null,
        render: dashboard.render
      });
    }
  };

  AURA.dashboard = dashboard;
  window.AURA_DASHBOARD = dashboard;

  document.addEventListener('DOMContentLoaded', async function () {
    await dashboard.init();
    dashboard.register();
  });

})(window);