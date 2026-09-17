/**
 * AURA Clinic
 * IndexedDB Storage Layer
 *
 * Responsibilities:
 * - Initialize the local IndexedDB database.
 * - Create application object stores.
 * - Provide reusable CRUD operations.
 * - Support future synchronization with Supabase.
 * - Keep storage logic independent from UI modules.
 */

(function (window) {
  "use strict";

  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};

  const STORAGE_CONFIG = {
    databaseName:
      CONFIG.storage?.databaseName || "AURA_Clinic_DB",

    databaseVersion:
      CONFIG.storage?.databaseVersion || 1,

    collections:
      CONFIG.database?.collections || [
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
  };

  const INDEX_DEFINITIONS = {
    users: [
      ["email", "email", { unique: true }],
      ["roleId", "roleId", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    staff: [
      ["staffId", "staffId", { unique: true }],
      ["email", "email", { unique: true }],
      ["roleId", "roleId", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    patients: [
      ["uhid", "uhid", { unique: true }],
      ["mobile", "mobile", { unique: false }],
      ["name", "name", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    encounters: [
      ["encounterId", "encounterId", { unique: true }],
      ["uhid", "uhid", { unique: false }],
      ["doctorId", "doctorId", { unique: false }],
      ["status", "status", { unique: false }],
      ["createdAt", "createdAt", { unique: false }]
    ],

    queues: [
      ["token", "token", { unique: true }],
      ["uhid", "uhid", { unique: false }],
      ["queueType", "queueType", { unique: false }],
      ["status", "status", { unique: false }],
      ["priority", "priority", { unique: false }]
    ],

    vitals: [
      ["encounterId", "encounterId", { unique: false }],
      ["uhid", "uhid", { unique: false }],
      ["recordedBy", "recordedBy", { unique: false }]
    ],

    consultations: [
      ["encounterId", "encounterId", { unique: true }],
      ["uhid", "uhid", { unique: false }],
      ["doctorId", "doctorId", { unique: false }]
    ],

    prescriptions: [
      ["encounterId", "encounterId", { unique: false }],
      ["uhid", "uhid", { unique: false }],
      ["doctorId", "doctorId", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    labOrders: [
      ["orderId", "orderId", { unique: true }],
      ["encounterId", "encounterId", { unique: false }],
      ["uhid", "uhid", { unique: false }],
      ["status", "status", { unique: false }],
      ["priority", "priority", { unique: false }]
    ],

    labResults: [
      ["orderId", "orderId", { unique: false }],
      ["uhid", "uhid", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    invoices: [
      ["invoiceNumber", "invoiceNumber", { unique: true }],
      ["uhid", "uhid", { unique: false }],
      ["encounterId", "encounterId", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    payments: [
      ["receiptNumber", "receiptNumber", { unique: true }],
      ["invoiceId", "invoiceId", { unique: false }],
      ["uhid", "uhid", { unique: false }],
      ["paymentMethod", "paymentMethod", { unique: false }]
    ],

    services: [
      ["serviceCode", "serviceCode", { unique: true }],
      ["category", "category", { unique: false }],
      ["status", "status", { unique: false }]
    ],

    departments: [
      ["code", "code", { unique: true }],
      ["status", "status", { unique: false }]
    ],

    notifications: [
      ["userId", "userId", { unique: false }],
      ["type", "type", { unique: false }],
      ["read", "read", { unique: false }],
      ["createdAt", "createdAt", { unique: false }]
    ],

    auditLogs: [
      ["userId", "userId", { unique: false }],
      ["action", "action", { unique: false }],
      ["entity", "entity", { unique: false }],
      ["entityId", "entityId", { unique: false }],
      ["createdAt", "createdAt", { unique: false }]
    ],

    settings: [
      ["key", "key", { unique: true }],
      ["category", "category", { unique: false }]
    ]
  };

  let database = null;
  let databasePromise = null;

  const subscribers = new Set();

  function getTimestamp() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    const safePrefix = prefix || "ID";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();

    return safePrefix + "-" + timestamp + "-" + random;
  }

  function notify(event) {
    subscribers.forEach(function (callback) {
      try {
        callback(event);
      } catch (error) {
        console.error("[AURA Clinic] Storage subscriber error:", error);
      }
    });

    document.dispatchEvent(
      new CustomEvent("aura:storage-change", {
        detail: event
      })
    );
  }

  function subscribe(callback) {
    if (typeof callback !== "function") {
      return function () {};
    }

    subscribers.add(callback);

    return function unsubscribe() {
      subscribers.delete(callback);
    };
  }

  function isSupported() {
    return "indexedDB" in window;
  }

  function createObjectStore(db, storeName, transaction) {
    let store;

    if (!db.objectStoreNames.contains(storeName)) {
      store = db.createObjectStore(storeName, {
        keyPath: "id",
        autoIncrement: false
      });
    } else {
      store = transaction.objectStore(storeName);
    }

    const indexes = INDEX_DEFINITIONS[storeName] || [];

    indexes.forEach(function (indexDefinition) {
      const indexName = indexDefinition[0];
      const keyPath = indexDefinition[1];
      const options = indexDefinition[2] || {};

      if (!store.indexNames.contains(indexName)) {
        store.createIndex(indexName, keyPath, options);
      }
    });

    return store;
  }

  function openDatabase() {
    if (!isSupported()) {
      return Promise.reject(
        new Error("IndexedDB is not supported by this browser.")
      );
    }

    if (database) {
      return Promise.resolve(database);
    }

    if (databasePromise) {
      return databasePromise;
    }

    databasePromise = new Promise(function (resolve, reject) {
      const request = indexedDB.open(
        STORAGE_CONFIG.databaseName,
        STORAGE_CONFIG.databaseVersion
      );

      request.onupgradeneeded = function (event) {
        const db = event.target.result;
        const transaction = event.target.transaction;

        STORAGE_CONFIG.collections.forEach(function (storeName) {
          createObjectStore(db, storeName, transaction);
        });
      };

      request.onsuccess = function (event) {
        database = event.target.result;

        database.onversionchange = function () {
          database.close();
          database = null;
          databasePromise = null;
        };

        database.onclose = function () {
          database = null;
          databasePromise = null;
        };

        resolve(database);
      };

      request.onerror = function () {
        databasePromise = null;
        reject(request.error || new Error("Unable to open IndexedDB."));
      };

      request.onblocked = function () {
        console.warn(
          "[AURA Clinic] IndexedDB upgrade is blocked by another browser tab."
        );
      };
    });

    return databasePromise;
  }

  function ensureStore(storeName) {
    if (!STORAGE_CONFIG.collections.includes(storeName)) {
      throw new Error("Unknown storage collection: " + storeName);
    }
  }

  function prepareRecord(record) {
    const now = getTimestamp();

    return {
      ...record,
      id: record.id || createId("AURA"),
      createdAt: record.createdAt || now,
      updatedAt: now
    };
  }

  function executeTransaction(storeName, mode, callback) {
    ensureStore(storeName);

    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        let transaction;

        try {
          transaction = db.transaction([storeName], mode);
        } catch (error) {
          reject(error);
          return;
        }

        const store = transaction.objectStore(storeName);

        let request;

        try {
          request = callback(store, transaction);
        } catch (error) {
          reject(error);
          return;
        }

        let requestResult;

        if (request && typeof request.onsuccess !== "undefined") {
          request.onsuccess = function () {
            requestResult = request.result;
          };

          request.onerror = function () {
            reject(request.error || new Error("IndexedDB operation failed."));
          };
        } else {
          requestResult = request;
        }

        transaction.oncomplete = function () {
          resolve(requestResult);
        };

        transaction.onerror = function () {
          reject(
            transaction.error ||
            new Error("IndexedDB transaction failed.")
          );
        };

        transaction.onabort = function () {
          reject(
            transaction.error ||
            new Error("IndexedDB transaction aborted.")
          );
        };
      });
    });
  }

  async function add(storeName, record) {
    const preparedRecord = prepareRecord(record || {});

    const result = await executeTransaction(
      storeName,
      "readwrite",
      function (store) {
        return store.add(preparedRecord);
      }
    );

    notify({
      action: "add",
      store: storeName,
      record: preparedRecord
    });

    return result;
  }

  async function put(storeName, record) {
    const preparedRecord = prepareRecord(record || {});

    const result = await executeTransaction(
      storeName,
      "readwrite",
      function (store) {
        return store.put(preparedRecord);
      }
    );

    notify({
      action: "update",
      store: storeName,
      record: preparedRecord
    });

    return result;
  }

  async function get(storeName, id) {
    return executeTransaction(
      storeName,
      "readonly",
      function (store) {
        return store.get(id);
      }
    );
  }

  async function getAll(storeName) {
    return executeTransaction(
      storeName,
      "readonly",
      function (store) {
        return store.getAll();
      }
    );
  }

  async function getByIndex(storeName, indexName, value) {
    ensureStore(storeName);

    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction(
          [storeName],
          "readonly"
        );

        const store = transaction.objectStore(storeName);

        if (!store.indexNames.contains(indexName)) {
          reject(
            new Error(
              "Index '" + indexName + "' does not exist on " + storeName
            )
          );
          return;
        }

        const request = store.index(indexName).get(value);

        request.onsuccess = function () {
          resolve(request.result || null);
        };

        request.onerror = function () {
          reject(
            request.error ||
            new Error("Unable to retrieve record by index.")
          );
        };
      });
    });
  }

  async function getAllByIndex(storeName, indexName, value) {
    ensureStore(storeName);

    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction(
          [storeName],
          "readonly"
        );

        const store = transaction.objectStore(storeName);

        if (!store.indexNames.contains(indexName)) {
          reject(
            new Error(
              "Index '" + indexName + "' does not exist on " + storeName
            )
          );
          return;
        }

        const request = store.index(indexName).getAll(value);

        request.onsuccess = function () {
          resolve(request.result || []);
        };

        request.onerror = function () {
          reject(
            request.error ||
            new Error("Unable to retrieve records by index.")
          );
        };
      });
    });
  }

  async function remove(storeName, id) {
    const existing = await get(storeName, id);

    await executeTransaction(
      storeName,
      "readwrite",
      function (store) {
        return store.delete(id);
      }
    );

    notify({
      action: "delete",
      store: storeName,
      record: existing || { id: id }
    });

    return true;
  }

  async function clear(storeName) {
    await executeTransaction(
      storeName,
      "readwrite",
      function (store) {
        return store.clear();
      }
    );

    notify({
      action: "clear",
      store: storeName
    });

    return true;
  }

  async function count(storeName) {
    return executeTransaction(
      storeName,
      "readonly",
      function (store) {
        return store.count();
      }
    );
  }

  async function search(storeName, query, fields) {
    const records = await getAll(storeName);

    const searchTerm = String(query || "")
      .trim()
      .toLowerCase();

    if (!searchTerm) {
      return records;
    }

    const searchableFields = Array.isArray(fields) && fields.length
      ? fields
      : ["name", "uhid", "mobile", "email", "token"];

    return records.filter(function (record) {
      return searchableFields.some(function (field) {
        const value = record[field];

        return value !== undefined &&
          value !== null &&
          String(value).toLowerCase().includes(searchTerm);
      });
    });
  }

  async function bulkAdd(storeName, records) {
    if (!Array.isArray(records) || !records.length) {
      return [];
    }

    const preparedRecords = records.map(prepareRecord);

    await openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction(
          [storeName],
          "readwrite"
        );

        const store = transaction.objectStore(storeName);

        preparedRecords.forEach(function (record) {
          store.add(record);
        });

        transaction.oncomplete = resolve;

        transaction.onerror = function () {
          reject(
            transaction.error ||
            new Error("Bulk insert failed.")
          );
        };
      });
    });

    notify({
      action: "bulk-add",
      store: storeName,
      records: preparedRecords
    });

    return preparedRecords;
  }

  async function bulkPut(storeName, records) {
    if (!Array.isArray(records) || !records.length) {
      return [];
    }

    const preparedRecords = records.map(prepareRecord);

    await openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction(
          [storeName],
          "readwrite"
        );

        const store = transaction.objectStore(storeName);

        preparedRecords.forEach(function (record) {
          store.put(record);
        });

        transaction.oncomplete = resolve;

        transaction.onerror = function () {
          reject(
            transaction.error ||
            new Error("Bulk update failed.")
          );
        };
      });
    });

    notify({
      action: "bulk-update",
      store: storeName,
      records: preparedRecords
    });

    return preparedRecords;
  }

  async function exportDatabase() {
    const exportedData = {
      databaseName: STORAGE_CONFIG.databaseName,
      databaseVersion: STORAGE_CONFIG.databaseVersion,
      exportedAt: getTimestamp(),
      collections: {}
    };

    for (const storeName of STORAGE_CONFIG.collections) {
      exportedData.collections[storeName] = await getAll(storeName);
    }

    return exportedData;
  }

  async function importDatabase(data, options) {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid database backup.");
    }

    const importOptions = options || {};
    const collections = data.collections || {};

    for (const storeName of Object.keys(collections)) {
      if (!STORAGE_CONFIG.collections.includes(storeName)) {
        continue;
      }

      const records = Array.isArray(collections[storeName])
        ? collections[storeName]
        : [];

      if (importOptions.replace) {
        await clear(storeName);
      }

      if (records.length) {
        await bulkPut(storeName, records);
      }
    }

    return true;
  }

  async function initialize() {
    try {
      await openDatabase();

      if (CONFIG.log) {
        CONFIG.log(
          "IndexedDB initialized:",
          STORAGE_CONFIG.databaseName
        );
      }

      return true;
    } catch (error) {
      console.error(
        "[AURA Clinic] IndexedDB initialization failed:",
        error
      );

      return false;
    }
  }

  async function destroyDatabase() {
    if (database) {
      database.close();
      database = null;
    }

    databasePromise = null;

    return new Promise(function (resolve, reject) {
      const request = indexedDB.deleteDatabase(
        STORAGE_CONFIG.databaseName
      );

      request.onsuccess = function () {
        resolve(true);
      };

      request.onerror = function () {
        reject(
          request.error ||
          new Error("Unable to delete IndexedDB database.")
        );
      };

      request.onblocked = function () {
        console.warn(
          "[AURA Clinic] Database deletion is blocked by another tab."
        );
      };
    });
  }

  const AURA_STORAGE = {
    initialize: initialize,
    isSupported: isSupported,
    openDatabase: openDatabase,
    subscribe: subscribe,

    add: add,
    put: put,
    get: get,
    getAll: getAll,
    getByIndex: getByIndex,
    getAllByIndex: getAllByIndex,
    remove: remove,
    clear: clear,
    count: count,
    search: search,

    bulkAdd: bulkAdd,
    bulkPut: bulkPut,

    exportDatabase: exportDatabase,
    importDatabase: importDatabase,
    destroyDatabase: destroyDatabase,

    createId: createId,
    getTimestamp: getTimestamp,

    stores: STORAGE_CONFIG.collections,
    indexes: INDEX_DEFINITIONS
  };

  window.AURA_STORAGE = AURA_STORAGE;

  window.AURA = window.AURA || {};
  window.AURA.storage = AURA_STORAGE;

  document.addEventListener("DOMContentLoaded", function () {
    initialize();
  });

})(window);