/**
 * AURA Clinic
 * Frontend Configuration
 *
 * Purpose:
 * - Centralize application settings.
 * - Keep environment-specific values in one place.
 * - Provide safe defaults for local development.
 * - Support future Supabase integration.
 */

(function (window) {
  "use strict";

  const AURA_CONFIG = {
    app: {
      name: "AURA Clinic",
      shortName: "AURA",
      version: "1.0.0",
      environment: "development",
      defaultRoute: "dashboard",
      defaultTheme: "light",
      defaultLanguage: "en-IN",
      defaultCurrency: "INR",
      currencySymbol: "₹",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12-hour",
      enableDebug: true
    },

    clinic: {
      name: "AURA Clinic",
      tagline: "Integrated Clinic Management System",
      type: "Outpatient Clinic",
      country: "India",
      state: "",
      city: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      logo: "",
      registrationNumber: "",
      taxNumber: "",
      currency: "INR",
      currencySymbol: "₹"
    },

    storage: {
      databaseName: "AURA_Clinic_DB",
      databaseVersion: 1,
      storagePrefix: "aura_clinic_",
      useIndexedDB: true,
      useLocalStorage: true,
      sessionKey: "aura_clinic_session",
      settingsKey: "aura_clinic_settings",
      themeKey: "aura_clinic_theme",
      languageKey: "aura_clinic_language"
    },

    database: {
      engine: "indexeddb",
      persistent: true,
      autoBackup: false,
      backupFormat: "json",
      collections: [
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
        "auditLogs",
        "settings"
      ]
    },

    supabase: {
      enabled: false,
      url: "",
      anonKey: "",
      schema: "public",
      tablePrefix: "aura_",
      authEnabled: false,
      realtimeEnabled: false,
      storageEnabled: false
    },

    authentication: {
      enabled: true,
      mode: "local",
      sessionDurationHours: 12,
      rememberSession: false,
      requireProfilePicture: true,
      requirePasswordChange: false,
      minimumPasswordLength: 8,
      allowSelfRegistration: false,
      allowMultipleSessions: false
    },

    roles: [
      {
        id: "administrator",
        name: "Administrator",
        permissions: ["*"]
      },
      {
        id: "receptionist",
        name: "Receptionist",
        permissions: [
          "dashboard.view",
          "patients.view",
          "patients.create",
          "patients.edit",
          "registration.manage",
          "queue.manage",
          "billing.view",
          "billing.create"
        ]
      },
      {
        id: "nurse",
        name: "Nurse",
        permissions: [
          "dashboard.view",
          "patients.view",
          "queue.view",
          "vitals.create",
          "vitals.edit"
        ]
      },
      {
        id: "doctor",
        name: "Doctor",
        permissions: [
          "dashboard.view",
          "patients.view",
          "encounters.view",
          "consultations.create",
          "consultations.edit",
          "prescriptions.create",
          "labOrders.create"
        ]
      },
      {
        id: "laboratory",
        name: "Laboratory Staff",
        permissions: [
          "dashboard.view",
          "patients.view",
          "labOrders.view",
          "labOrders.edit",
          "labResults.create",
          "labResults.edit"
        ]
      },
      {
        id: "cashier",
        name: "Cashier",
        permissions: [
          "dashboard.view",
          "patients.view",
          "billing.view",
          "billing.create",
          "payments.create",
          "receipts.create"
        ]
      }
    ],

    navigation: {
      defaultItems: [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: "dashboard",
          route: "dashboard"
        },
        {
          id: "patients",
          label: "Patients",
          icon: "users",
          route: "patients"
        },
        {
          id: "registration",
          label: "Registration",
          icon: "user-plus",
          route: "registration"
        },
        {
          id: "queue",
          label: "Queue",
          icon: "list",
          route: "queue"
        },
        {
          id: "nursing",
          label: "Nursing",
          icon: "heart-pulse",
          route: "nursing"
        },
        {
          id: "doctor",
          label: "Doctor",
          icon: "stethoscope",
          route: "doctor"
        },
        {
          id: "laboratory",
          label: "Laboratory",
          icon: "flask",
          route: "laboratory"
        },
        {
          id: "billing",
          label: "Billing",
          icon: "receipt",
          route: "billing"
        },
        {
          id: "staff",
          label: "Staff",
          icon: "user-cog",
          route: "staff"
        },
        {
          id: "reports",
          label: "Reports",
          icon: "bar-chart",
          route: "reports"
        },
        {
          id: "settings",
          label: "Settings",
          icon: "settings",
          route: "settings"
        }
      ],

      mobileItems: [
        {
          id: "dashboard",
          label: "Home",
          icon: "dashboard",
          route: "dashboard"
        },
        {
          id: "patients",
          label: "Patients",
          icon: "users",
          route: "patients"
        },
        {
          id: "queue",
          label: "Queue",
          icon: "list",
          route: "queue"
        },
        {
          id: "billing",
          label: "Billing",
          icon: "receipt",
          route: "billing"
        },
        {
          id: "more",
          label: "More",
          icon: "more-horizontal",
          route: "more"
        }
      ]
    },

    workflow: {
      stages: [
        "registration",
        "general_queue",
        "pre_consultation",
        "doctor_assignment",
        "doctor_consultation",
        "laboratory",
        "pharmacy",
        "billing",
        "completed"
      ],

      queueTypes: [
        {
          id: "general",
          name: "General Consultation",
          code: "GEN"
        },
        {
          id: "pediatric",
          name: "Pediatric Consultation",
          code: "PED"
        },
        {
          id: "laboratory",
          name: "Laboratory",
          code: "LAB"
        },
        {
          id: "billing",
          name: "Billing",
          code: "BIL"
        }
      ],

      encounterStatuses: [
        "registered",
        "waiting",
        "in_pre_consultation",
        "awaiting_doctor",
        "in_consultation",
        "lab_pending",
        "lab_completed",
        "billing_pending",
        "completed",
        "cancelled"
      ],

      priorityLevels: [
        {
          id: "normal",
          label: "Normal",
          color: "success"
        },
        {
          id: "urgent",
          label: "Urgent",
          color: "warning"
        },
        {
          id: "critical",
          label: "Critical",
          color: "danger"
        }
      ]
    },

    patient: {
      idPrefix: "UHID",
      idLength: 8,
      tokenPrefix: "T",
      tokenLength: 3,
      defaultAgeUnit: "years",
      requireName: true,
      requireMobile: true,
      requireGender: false,
      requireDateOfBirth: false,
      allowDuplicateMobile: false
    },

    clinical: {
      vitals: {
        temperatureUnit: "°C",
        weightUnit: "kg",
        heightUnit: "cm",
        bloodPressureUnit: "mmHg",
        pulseUnit: "bpm",
        respiratoryRateUnit: "per min",
        oxygenSaturationUnit: "%"
      },

      defaultVitals: {
        temperature: "",
        pulse: "",
        respiratoryRate: "",
        bloodPressureSystolic: "",
        bloodPressureDiastolic: "",
        oxygenSaturation: "",
        weight: "",
        height: "",
        bmi: ""
      },

      consultation: {
        requireChiefComplaint: true,
        requireDiagnosis: false,
        requirePrescription: false,
        allowDrafts: true
      },

      prescriptions: {
        requireMedicineName: true,
        requireDosage: false,
        requireFrequency: false,
        requireDuration: false
      }
    },

    laboratory: {
      sampleStatuses: [
        "pending",
        "collected",
        "received",
        "processing",
        "completed",
        "rejected",
        "cancelled"
      ],

      resultStatuses: [
        "pending",
        "draft",
        "verified",
        "released",
        "cancelled"
      ],

      priorityLevels: [
        "routine",
        "urgent",
        "stat"
      ],

      requireVerification: true,
      allowResultEditingAfterVerification: false
    },

    billing: {
      currency: "INR",
      currencySymbol: "₹",
      decimalPlaces: 2,
      taxEnabled: true,
      defaultTaxRate: 0,
      discountEnabled: true,
      allowPartialPayments: true,
      allowCreditBilling: false,
      receiptPrefix: "RCT",
      invoicePrefix: "INV",
      paymentMethods: [
        {
          id: "cash",
          label: "Cash"
        },
        {
          id: "upi",
          label: "UPI"
        },
        {
          id: "card",
          label: "Card"
        },
        {
          id: "bank_transfer",
          label: "Bank Transfer"
        },
        {
          id: "insurance",
          label: "Insurance"
        }
      ],

      invoiceStatuses: [
        "draft",
        "pending",
        "partially_paid",
        "paid",
        "cancelled",
        "refunded"
      ]
    },

    notifications: {
      enabled: true,
      browserNotifications: false,
      soundEnabled: true,
      queueAnnouncements: true,
      defaultDuration: 4000,
      maxVisible: 5
    },

    ui: {
      theme: "light",
      sidebarCollapsed: false,
      sidebarCollapsedWidth: 80,
      tablePageSize: 10,
      searchDebounceMs: 250,
      animationDuration: 180,
      modalAnimationDuration: 220,
      toastPosition: "top-right",
      confirmBeforeDelete: true,
      showLoadingScreen: true,
      showBreadcrumbs: true
    },

    accessibility: {
      highContrastMode: false,
      reduceMotion: false,
      keyboardNavigation: true,
      announceQueueChanges: true
    },

    validation: {
      mobile: {
        pattern: "^[0-9]{10}$",
        minLength: 10,
        maxLength: 10
      },

      email: {
        pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
      },

      password: {
        minLength: 8
      }
    },

    development: {
      enableDemoData: true,
      enableMockAuthentication: true,
      enableConsoleLogging: true,
      enablePerformanceLogging: false,
      showDebugPanel: false,
      seedDatabaseOnFirstRun: true
    },

    messages: {
      appLoading: "Preparing AURA Clinic...",
      appReady: "AURA Clinic is ready.",
      genericError: "Something went wrong. Please try again.",
      networkError: "Unable to connect. Please check your connection.",
      saved: "Changes saved successfully.",
      deleted: "Record deleted successfully.",
      requiredField: "Please complete all required fields.",
      sessionExpired: "Your session has expired. Please sign in again.",
      unauthorized: "You do not have permission to perform this action."
    }
  };

  /**
   * Runtime environment overrides.
   *
   * Optional global object:
   *
   * window.AURA_ENV = {
   *   environment: "production",
   *   supabase: {
   *     enabled: true,
   *     url: "...",
   *     anonKey: "..."
   *   }
   * };
   */

  const environmentOverrides = window.AURA_ENV || {};

  function deepMerge(target, source) {
    const output = { ...target };

    if (!source || typeof source !== "object") {
      return output;
    }

    Object.keys(source).forEach(function (key) {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else {
        output[key] = sourceValue;
      }
    });

    return output;
  }

  const runtimeConfig = deepMerge(AURA_CONFIG, environmentOverrides);

  /**
   * Helper methods
   */

  runtimeConfig.isDevelopment = function () {
    return runtimeConfig.app.environment === "development";
  };

  runtimeConfig.isProduction = function () {
    return runtimeConfig.app.environment === "production";
  };

  runtimeConfig.getCurrencySymbol = function () {
    return runtimeConfig.billing.currencySymbol || "₹";
  };

  runtimeConfig.formatCurrency = function (amount) {
    const numericAmount = Number(amount);

    if (Number.isNaN(numericAmount)) {
      return runtimeConfig.getCurrencySymbol() + "0.00";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: runtimeConfig.billing.currency,
      minimumFractionDigits: runtimeConfig.billing.decimalPlaces,
      maximumFractionDigits: runtimeConfig.billing.decimalPlaces
    }).format(numericAmount);
  };

  runtimeConfig.generateUHID = function () {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, "0");

    return runtimeConfig.patient.idPrefix + timestamp + random;
  };

  runtimeConfig.generateToken = function (queueCode) {
    const prefix = queueCode || runtimeConfig.patient.tokenPrefix;
    const number = Math.floor(Math.random() * 999) + 1;

    return prefix + "-" + String(number).padStart(
      runtimeConfig.patient.tokenLength,
      "0"
    );
  };

  runtimeConfig.hasPermission = function (roleId, permission) {
    const role = runtimeConfig.roles.find(function (item) {
      return item.id === roleId;
    });

    if (!role) {
      return false;
    }

    if (role.permissions.includes("*")) {
      return true;
    }

    return role.permissions.includes(permission);
  };

  runtimeConfig.getRole = function (roleId) {
    return runtimeConfig.roles.find(function (role) {
      return role.id === roleId;
    }) || null;
  };

  runtimeConfig.getStorageKey = function (key) {
    return runtimeConfig.storage.storagePrefix + key;
  };

  runtimeConfig.log = function () {
    if (
      runtimeConfig.development.enableConsoleLogging &&
      typeof console !== "undefined"
    ) {
      console.log.apply(console, ["[AURA Clinic]"].concat(
        Array.from(arguments)
      ));
    }
  };

  runtimeConfig.warn = function () {
    if (
      runtimeConfig.development.enableConsoleLogging &&
      typeof console !== "undefined"
    ) {
      console.warn.apply(console, ["[AURA Clinic]"].concat(
        Array.from(arguments)
      ));
    }
  };

  runtimeConfig.error = function () {
    if (typeof console !== "undefined") {
      console.error.apply(console, ["[AURA Clinic]"].concat(
        Array.from(arguments)
      ));
    }
  };

  /**
   * Freeze configuration to prevent accidental modification.
   * Nested objects are frozen recursively.
   */

  function deepFreeze(object) {
    if (!object || typeof object !== "object") {
      return object;
    }

    Object.getOwnPropertyNames(object).forEach(function (property) {
      const value = object[property];

      if (
        value &&
        typeof value === "object" &&
        !Object.isFrozen(value)
      ) {
        deepFreeze(value);
      }
    });

    return Object.freeze(object);
  }

  /**
   * Do not freeze helper functions or runtime-overridden objects
   * before the configuration has been fully prepared.
   */

  deepFreeze(runtimeConfig);

  window.AURA_CONFIG = runtimeConfig;

  /**
   * Backward-compatible aliases.
   */

  window.CONFIG = window.AURA_CONFIG;

  window.AURA = window.AURA || {};
  window.AURA.config = window.AURA_CONFIG;

  if (runtimeConfig.isDevelopment()) {
    runtimeConfig.log(
      "Configuration loaded:",
      runtimeConfig.app.name,
      "v" + runtimeConfig.app.version
    );
  }

})(window);