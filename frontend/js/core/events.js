/**
 * AURA Clinic
 * Central Event Bus
 *
 * Responsibilities:
 * - Provide application-wide custom events.
 * - Decouple modules from one another.
 * - Standardize clinical workflow events.
 * - Support one-time and persistent listeners.
 * - Provide event history in development mode.
 */

(function (window, document) {
  "use strict";

  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};

  const listeners = new Map();
  const onceListeners = new Map();
  const history = [];

  const MAX_HISTORY = 100;

  const EVENT_NAMES = {
    APP_READY: "app:ready",
    APP_ERROR: "app:error",
    ROUTE_CHANGE: "route:change",

    THEME_CHANGE: "theme:change",
    SIDEBAR_CHANGE: "sidebar:change",

    AUTH_LOGIN: "auth:login",
    AUTH_LOGOUT: "auth:logout",
    AUTH_STATE_CHANGE: "auth:state-change",
    SESSION_EXPIRED: "auth:session-expired",

    PATIENT_CREATED: "patient:created",
    PATIENT_UPDATED: "patient:updated",
    PATIENT_DELETED: "patient:deleted",
    PATIENT_SELECTED: "patient:selected",

    REGISTRATION_CREATED: "registration:created",
    REGISTRATION_COMPLETED: "registration:completed",

    QUEUE_CREATED: "queue:created",
    QUEUE_UPDATED: "queue:updated",
    QUEUE_CALLED: "queue:called",
    QUEUE_SKIPPED: "queue:skipped",
    QUEUE_COMPLETED: "queue:completed",

    VITALS_RECORDED: "vitals:recorded",
    VITALS_UPDATED: "vitals:updated",

    DOCTOR_ASSIGNED: "doctor:assigned",
    CONSULTATION_STARTED: "consultation:started",
    CONSULTATION_SAVED: "consultation:saved",
    CONSULTATION_COMPLETED: "consultation:completed",

    PRESCRIPTION_CREATED: "prescription:created",
    PRESCRIPTION_UPDATED: "prescription:updated",

    LAB_ORDER_CREATED: "lab:order-created",
    LAB_SAMPLE_COLLECTED: "lab:sample-collected",
    LAB_RESULT_SAVED: "lab:result-saved",
    LAB_RESULT_VERIFIED: "lab:result-verified",
    LAB_REPORT_RELEASED: "lab:report-released",

    INVOICE_CREATED: "billing:invoice-created",
    INVOICE_UPDATED: "billing:invoice-updated",
    PAYMENT_CREATED: "billing:payment-created",
    PAYMENT_UPDATED: "billing:payment-updated",
    RECEIPT_CREATED: "billing:receipt-created",

    STAFF_CREATED: "staff:created",
    STAFF_UPDATED: "staff:updated",
    STAFF_DELETED: "staff:deleted",

    NOTIFICATION_CREATED: "notification:created",
    NOTIFICATION_READ: "notification:read",

    STORAGE_CHANGE: "storage:change",
    DATABASE_READY: "database:ready",
    DATABASE_ERROR: "database:error",

    MODAL_OPEN: "modal:open",
    MODAL_CLOSE: "modal:close",
    TOAST_CREATED: "toast:created",

    SEARCH: "search:global"
  };

  function getTimestamp() {
    return new Date().toISOString();
  }

  function normalizeEventName(eventName) {
    if (!eventName) {
      return "";
    }

    return String(eventName).trim().toLowerCase();
  }

  function ensureSet(map, eventName) {
    if (!map.has(eventName)) {
      map.set(eventName, new Set());
    }

    return map.get(eventName);
  }

  function addHistory(eventName, payload) {
    const item = {
      event: eventName,
      payload: payload || {},
      timestamp: getTimestamp()
    };

    history.push(item);

    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    return item;
  }

  function invokeCallbacks(callbackSet, payload, eventName) {
    if (!callbackSet || !callbackSet.size) {
      return;
    }

    Array.from(callbackSet).forEach(function (callback) {
      try {
        callback(payload, eventName);
      } catch (error) {
        console.error(
          "[AURA Clinic] Event callback failed:",
          eventName,
          error
        );
      }
    });
  }

  function emit(eventName, payload, options) {
    const normalizedName = normalizeEventName(eventName);

    if (!normalizedName) {
      return false;
    }

    const eventPayload = payload || {};
    const emitOptions = options || {};

    const historyItem = addHistory(
      normalizedName,
      eventPayload
    );

    const detail = {
      ...eventPayload,
      event: normalizedName,
      timestamp: historyItem.timestamp
    };

    if (!emitOptions.silent) {
      document.dispatchEvent(
        new CustomEvent("aura:event", {
          detail: detail
        })
      );

      document.dispatchEvent(
        new CustomEvent("aura:" + normalizedName, {
          detail: detail
        })
      );
    }

    invokeCallbacks(
      listeners.get(normalizedName),
      detail,
      normalizedName
    );

    const oneTimeCallbacks = onceListeners.get(normalizedName);

    if (oneTimeCallbacks && oneTimeCallbacks.size) {
      invokeCallbacks(
        oneTimeCallbacks,
        detail,
        normalizedName
      );

      onceListeners.delete(normalizedName);
    }

    return true;
  }

  function on(eventName, callback) {
    const normalizedName = normalizeEventName(eventName);

    if (!normalizedName || typeof callback !== "function") {
      return function () {};
    }

    const callbackSet = ensureSet(listeners, normalizedName);

    callbackSet.add(callback);

    return function unsubscribe() {
      off(normalizedName, callback);
    };
  }

  function once(eventName, callback) {
    const normalizedName = normalizeEventName(eventName);

    if (!normalizedName || typeof callback !== "function") {
      return function () {};
    }

    const callbackSet = ensureSet(
      onceListeners,
      normalizedName
    );

    callbackSet.add(callback);

    return function unsubscribe() {
      callbackSet.delete(callback);

      if (!callbackSet.size) {
        onceListeners.delete(normalizedName);
      }
    };
  }

  function off(eventName, callback) {
    const normalizedName = normalizeEventName(eventName);

    if (!normalizedName) {
      return false;
    }

    if (typeof callback === "function") {
      const callbackSet = listeners.get(normalizedName);

      if (callbackSet) {
        callbackSet.delete(callback);

        if (!callbackSet.size) {
          listeners.delete(normalizedName);
        }
      }

      return true;
    }

    listeners.delete(normalizedName);
    onceListeners.delete(normalizedName);

    return true;
  }

  function clear() {
    listeners.clear();
    onceListeners.clear();
  }

  function getHistory(eventName) {
    const normalizedName = normalizeEventName(eventName);

    if (!normalizedName) {
      return history.slice();
    }

    return history.filter(function (item) {
      return item.event === normalizedName;
    });
  }

  function clearHistory() {
    history.length = 0;
  }

  function listenerCount(eventName) {
    const normalizedName = normalizeEventName(eventName);

    const regularCount =
      listeners.get(normalizedName)?.size || 0;

    const onceCount =
      onceListeners.get(normalizedName)?.size || 0;

    return regularCount + onceCount;
  }

  function hasListeners(eventName) {
    return listenerCount(eventName) > 0;
  }

  function waitFor(eventName, timeout) {
    const waitTimeout = Number.isFinite(timeout)
      ? timeout
      : 10000;

    return new Promise(function (resolve, reject) {
      let timer = null;

      const unsubscribe = once(eventName, function (payload) {
        if (timer) {
          clearTimeout(timer);
        }

        resolve(payload);
      });

      if (waitTimeout > 0) {
        timer = setTimeout(function () {
          unsubscribe();

          reject(
            new Error(
              "Timed out waiting for event: " + eventName
            )
          );
        }, waitTimeout);
      }
    });
  }

  function bridgeToDocument(eventName) {
    return on(eventName, function (payload) {
      document.dispatchEvent(
        new CustomEvent("aura:" + normalizeEventName(eventName), {
          detail: payload
        })
      );
    });
  }

  /**
   * Convenience helpers for major AURA Clinic workflows.
   */

  const workflow = {
    patientCreated: function (patient) {
      return emit(EVENT_NAMES.PATIENT_CREATED, { patient: patient });
    },

    patientUpdated: function (patient) {
      return emit(EVENT_NAMES.PATIENT_UPDATED, { patient: patient });
    },

    patientDeleted: function (patientId) {
      return emit(EVENT_NAMES.PATIENT_DELETED, { patientId: patientId });
    },

    queueCreated: function (queueItem) {
      return emit(EVENT_NAMES.QUEUE_CREATED, { queueItem: queueItem });
    },

    queueCalled: function (queueItem) {
      return emit(EVENT_NAMES.QUEUE_CALLED, { queueItem: queueItem });
    },

    queueCompleted: function (queueItem) {
      return emit(EVENT_NAMES.QUEUE_COMPLETED, { queueItem: queueItem });
    },

    vitalsRecorded: function (vitals) {
      return emit(EVENT_NAMES.VITALS_RECORDED, { vitals: vitals });
    },

    doctorAssigned: function (assignment) {
      return emit(EVENT_NAMES.DOCTOR_ASSIGNED, { assignment: assignment });
    },

    consultationCompleted: function (consultation) {
      return emit(
        EVENT_NAMES.CONSULTATION_COMPLETED,
        { consultation: consultation }
      );
    },

    labOrderCreated: function (labOrder) {
      return emit(
        EVENT_NAMES.LAB_ORDER_CREATED,
        { labOrder: labOrder }
      );
    },

    labResultVerified: function (labResult) {
      return emit(
        EVENT_NAMES.LAB_RESULT_VERIFIED,
        { labResult: labResult }
      );
    },

    invoiceCreated: function (invoice) {
      return emit(
        EVENT_NAMES.INVOICE_CREATED,
        { invoice: invoice }
      );
    },

    paymentCreated: function (payment) {
      return emit(
        EVENT_NAMES.PAYMENT_CREATED,
        { payment: payment }
      );
    },

    staffCreated: function (staff) {
      return emit(EVENT_NAMES.STAFF_CREATED, { staff: staff });
    }
  };

  /**
   * Public API
   */

  const AURA_EVENTS = {
    names: Object.freeze({ ...EVENT_NAMES }),

    emit: emit,
    on: on,
    once: once,
    off: off,
    clear: clear,

    waitFor: waitFor,

    getHistory: getHistory,
    clearHistory: clearHistory,

    listenerCount: listenerCount,
    hasListeners: hasListeners,

    bridgeToDocument: bridgeToDocument,

    workflow: workflow
  };

  window.AURA_EVENTS = AURA_EVENTS;

  window.AURA = window.AURA || {};
  window.AURA.events = AURA_EVENTS;

  /**
   * Bridge existing application-level events into the central event bus.
   */

  document.addEventListener("aura:route-change", function (event) {
    emit(EVENT_NAMES.ROUTE_CHANGE, event.detail || {}, {
      silent: true
    });
  });

  document.addEventListener("aura:theme-change", function (event) {
    emit(EVENT_NAMES.THEME_CHANGE, event.detail || {}, {
      silent: true
    });
  });

  document.addEventListener("aura:storage-change", function (event) {
    emit(EVENT_NAMES.STORAGE_CHANGE, event.detail || {}, {
      silent: true
    });
  });

  document.addEventListener("aura:auth-state-change", function (event) {
    emit(EVENT_NAMES.AUTH_STATE_CHANGE, event.detail || {}, {
      silent: true
    });
  });

  document.addEventListener("aura:app-ready", function (event) {
    emit(EVENT_NAMES.APP_READY, event.detail || {}, {
      silent: true
    });
  });

  if (CONFIG.development?.enableConsoleLogging) {
    AURA_EVENTS.on(EVENT_NAMES.APP_READY, function () {
      console.log("[AURA Clinic] Central event bus ready.");
    });
  }

})(window, document);