/**
 * AURA Clinic
 * Supabase Client Adapter
 *
 * Current mode:
 * - IndexedDB remains the primary local database.
 * - Supabase is optional and disabled by default.
 * - This adapter prevents the rest of the application from depending
 *   directly on the Supabase SDK.
 *
 * Future use:
 * - Authentication
 * - Cloud database synchronization
 * - Realtime queue updates
 * - File and profile-picture storage
 */

(function (window) {
  "use strict";

  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};

  const DEFAULT_STATE = {
    initialized: false,
    enabled: false,
    connected: false,
    authEnabled: false,
    realtimeEnabled: false,
    storageEnabled: false,
    error: null
  };

  const state = {
    ...DEFAULT_STATE
  };

  let client = null;
  let sdkPromise = null;
  let authSubscription = null;

  const subscribers = new Set();
  const realtimeChannels = new Map();

  function getSupabaseConfig() {
    return CONFIG.supabase || {
      enabled: false,
      url: "",
      anonKey: "",
      schema: "public",
      tablePrefix: "aura_",
      authEnabled: false,
      realtimeEnabled: false,
      storageEnabled: false
    };
  }

  function isConfigured() {
    const supabaseConfig = getSupabaseConfig();

    return Boolean(
      supabaseConfig.enabled &&
      supabaseConfig.url &&
      supabaseConfig.anonKey
    );
  }

  function notifyStateChange() {
    subscribers.forEach(function (callback) {
      try {
        callback(getState());
      } catch (error) {
        console.error("[AURA Clinic] Supabase state subscriber error:", error);
      }
    });
  }

  function updateState(updates) {
    Object.assign(state, updates);
    notifyStateChange();
  }

  function getState() {
    return Object.freeze({
      ...state
    });
  }

  function log() {
    if (CONFIG.log) {
      CONFIG.log.apply(CONFIG, arguments);
    }
  }

  function warn() {
    if (CONFIG.warn) {
      CONFIG.warn.apply(CONFIG, arguments);
    } else {
      console.warn.apply(console, arguments);
    }
  }

  function error() {
    if (CONFIG.error) {
      CONFIG.error.apply(CONFIG, arguments);
    } else {
      console.error.apply(console, arguments);
    }
  }

  function loadSupabaseSDK() {
    if (window.supabase) {
      return Promise.resolve(window.supabase);
    }

    if (sdkPromise) {
      return sdkPromise;
    }

    sdkPromise = new Promise(function (resolve, reject) {
      const existingScript = document.querySelector(
        'script[data-aura-supabase-sdk="true"]'
      );

      if (existingScript) {
        existingScript.addEventListener("load", function () {
          if (window.supabase) {
            resolve(window.supabase);
          } else {
            reject(new Error("Supabase SDK loaded without a global client."));
          }
        });

        existingScript.addEventListener("error", function () {
          reject(new Error("Unable to load Supabase SDK."));
        });

        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.async = true;
      script.defer = true;
      script.dataset.auraSupabaseSdk = "true";

      script.onload = function () {
        if (window.supabase) {
          resolve(window.supabase);
        } else {
          reject(new Error("Supabase SDK is unavailable."));
        }
      };

      script.onerror = function () {
        reject(new Error("Unable to load Supabase SDK."));
      };

      document.head.appendChild(script);
    });

    return sdkPromise;
  }

  async function initialize(options) {
    const initOptions = options || {};
    const supabaseConfig = {
      ...getSupabaseConfig(),
      ...initOptions
    };

    if (state.initialized && !initOptions.force) {
      return getState();
    }

    if (
      !supabaseConfig.enabled ||
      !supabaseConfig.url ||
      !supabaseConfig.anonKey
    ) {
      updateState({
        initialized: true,
        enabled: false,
        connected: false,
        authEnabled: false,
        realtimeEnabled: false,
        storageEnabled: false,
        error: null
      });

      log("Supabase adapter initialized in local-only mode.");

      return getState();
    }

    try {
      const sdk = await loadSupabaseSDK();

      if (!sdk || typeof sdk.createClient !== "function") {
        throw new Error("Supabase createClient function is unavailable.");
      }

      client = sdk.createClient(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        {
          db: {
            schema: supabaseConfig.schema || "public"
          },
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
          },
          global: {
            headers: {
              "x-aura-client": "aura-clinic"
            }
          }
        }
      );

      updateState({
        initialized: true,
        enabled: true,
        connected: true,
        authEnabled: Boolean(supabaseConfig.authEnabled),
        realtimeEnabled: Boolean(supabaseConfig.realtimeEnabled),
        storageEnabled: Boolean(supabaseConfig.storageEnabled),
        error: null
      });

      attachAuthListener();

      log("Supabase client initialized successfully.");

      return getState();
    } catch (initError) {
      client = null;

      updateState({
        initialized: true,
        enabled: true,
        connected: false,
        error: initError.message || "Supabase initialization failed."
      });

      error("Supabase initialization failed:", initError);

      return getState();
    }
  }

  function getClient() {
    return client;
  }

  function isEnabled() {
    return Boolean(client && state.enabled);
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

  function attachAuthListener() {
    if (!client || !client.auth || authSubscription) {
      return;
    }

    const result = client.auth.onAuthStateChange(function (event, session) {
      window.dispatchEvent(
        new CustomEvent("aura:auth-state-change", {
          detail: {
            event: event,
            session: session
          }
        })
      );
    });

    if (result && result.data) {
      authSubscription = result.data.subscription || null;
    }
  }

  async function getSession() {
    if (!client || !client.auth) {
      return {
        data: { session: null },
        error: null
      };
    }

    return client.auth.getSession();
  }

  async function getUser() {
    if (!client || !client.auth) {
      return {
        data: { user: null },
        error: null
      };
    }

    return client.auth.getUser();
  }

  async function signIn(email, password) {
    if (!client || !client.auth) {
      return {
        data: null,
        error: new Error("Supabase authentication is not enabled.")
      };
    }

    if (!email || !password) {
      return {
        data: null,
        error: new Error("Email and password are required.")
      };
    }

    return client.auth.signInWithPassword({
      email: String(email).trim(),
      password: password
    });
  }

  async function signUp(email, password, metadata) {
    if (!client || !client.auth) {
      return {
        data: null,
        error: new Error("Supabase authentication is not enabled.")
      };
    }

    return client.auth.signUp({
      email: String(email).trim(),
      password: password,
      options: {
        data: metadata || {}
      }
    });
  }

  async function signOut() {
    if (!client || !client.auth) {
      return {
        error: null
      };
    }

    return client.auth.signOut();
  }

  async function resetPassword(email) {
    if (!client || !client.auth) {
      return {
        data: null,
        error: new Error("Supabase authentication is not enabled.")
      };
    }

    const redirectUrl = window.location.origin + window.location.pathname;

    return client.auth.resetPasswordForEmail(String(email).trim(), {
      redirectTo: redirectUrl
    });
  }

  function getTableName(collection) {
    const supabaseConfig = getSupabaseConfig();
    const prefix = supabaseConfig.tablePrefix || "aura_";

    if (!collection) {
      throw new Error("A collection name is required.");
    }

    return prefix + String(collection);
  }

  function requireClient() {
    if (!client) {
      throw new Error(
        "Supabase is not connected. The application is currently using local storage."
      );
    }

    return client;
  }

  async function select(collection, options) {
    const supabaseClient = requireClient();
    const queryOptions = options || {};

    let query = supabaseClient
      .from(getTableName(collection))
      .select(queryOptions.columns || "*");

    if (queryOptions.filters) {
      Object.keys(queryOptions.filters).forEach(function (column) {
        const value = queryOptions.filters[column];

        if (value === null) {
          query = query.is(column, null);
        } else if (Array.isArray(value)) {
          query = query.in(column, value);
        } else {
          query = query.eq(column, value);
        }
      });
    }

    if (queryOptions.search) {
      const searchTerm = String(queryOptions.search)
        .trim()
        .replace(/[%(),]/g, "");

      if (searchTerm) {
        const searchColumn = queryOptions.searchColumn || "name";
        query = query.ilike(searchColumn, "%" + searchTerm + "%");
      }
    }

    if (queryOptions.orderBy) {
      query = query.order(
        queryOptions.orderBy,
        {
          ascending: queryOptions.ascending !== false
        }
      );
    }

    if (Number.isInteger(queryOptions.limit)) {
      query = query.limit(queryOptions.limit);
    }

    if (
      Number.isInteger(queryOptions.from) &&
      Number.isInteger(queryOptions.to)
    ) {
      query = query.range(queryOptions.from, queryOptions.to);
    }

    return query;
  }

  async function insert(collection, records, options) {
    const supabaseClient = requireClient();
    const insertOptions = options || {};

    let query = supabaseClient
      .from(getTableName(collection))
      .insert(records);

    if (insertOptions.select) {
      query = query.select(insertOptions.select);
    }

    if (insertOptions.single) {
      query = query.single();
    }

    return query;
  }

  async function update(collection, values, options) {
    const supabaseClient = requireClient();
    const updateOptions = options || {};

    if (!updateOptions.filters || !Object.keys(updateOptions.filters).length) {
      throw new Error("Update operations require at least one filter.");
    }

    let query = supabaseClient
      .from(getTableName(collection))
      .update(values);

    Object.keys(updateOptions.filters).forEach(function (column) {
      query = query.eq(column, updateOptions.filters[column]);
    });

    if (updateOptions.select) {
      query = query.select(updateOptions.select);
    }

    if (updateOptions.single) {
      query = query.single();
    }

    return query;
  }

  async function remove(collection, options) {
    const supabaseClient = requireClient();
    const deleteOptions = options || {};

    if (!deleteOptions.filters || !Object.keys(deleteOptions.filters).length) {
      throw new Error("Delete operations require at least one filter.");
    }

    let query = supabaseClient
      .from(getTableName(collection))
      .delete();

    Object.keys(deleteOptions.filters).forEach(function (column) {
      query = query.eq(column, deleteOptions.filters[column]);
    });

    if (deleteOptions.select) {
      query = query.select(deleteOptions.select);
    }

    return query;
  }

  function createRealtimeChannel(name, table, options) {
    const supabaseClient = requireClient();
    const realtimeOptions = options || {};

    const channelName = name || "aura-channel-" + Date.now();

    const channel = supabaseClient.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: realtimeOptions.event || "*",
        schema: realtimeOptions.schema || "public",
        table: getTableName(table),
        filter: realtimeOptions.filter
      },
      function (payload) {
        if (typeof realtimeOptions.callback === "function") {
          realtimeOptions.callback(payload);
        }

        window.dispatchEvent(
          new CustomEvent("aura:realtime-change", {
            detail: {
              channel: channelName,
              table: table,
              payload: payload
            }
          })
        );
      }
    );

    realtimeChannels.set(channelName, channel);

    return channel;
  }

  async function subscribeRealtime(name, table, options) {
    const channel = createRealtimeChannel(name, table, options);

    return new Promise(function (resolve, reject) {
      channel.subscribe(function (status, subscribeError) {
        if (status === "SUBSCRIBED") {
          resolve({
            channel: channel,
            status: status
          });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(
            subscribeError ||
            new Error("Unable to subscribe to realtime channel.")
          );
        }
      });
    });
  }

  async function removeRealtimeChannel(name) {
    const supabaseClient = requireClient();
    const channel = realtimeChannels.get(name);

    if (!channel) {
      return {
        error: null
      };
    }

    const result = await supabaseClient.removeChannel(channel);

    realtimeChannels.delete(name);

    return result;
  }

  async function uploadFile(bucket, path, file, options) {
    const supabaseClient = requireClient();
    const uploadOptions = options || {};

    if (!getSupabaseConfig().storageEnabled) {
      throw new Error("Supabase Storage is not enabled.");
    }

    if (!bucket || !path || !file) {
      throw new Error("Bucket, file path, and file are required.");
    }

    return supabaseClient.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: uploadOptions.cacheControl || "3600",
        upsert: uploadOptions.upsert !== false,
        contentType: uploadOptions.contentType
      });
  }

  function getPublicFileUrl(bucket, path) {
    const supabaseClient = requireClient();

    if (!getSupabaseConfig().storageEnabled) {
      throw new Error("Supabase Storage is not enabled.");
    }

    return supabaseClient.storage
      .from(bucket)
      .getPublicUrl(path);
  }

  async function deleteFile(bucket, paths) {
    const supabaseClient = requireClient();

    if (!getSupabaseConfig().storageEnabled) {
      throw new Error("Supabase Storage is not enabled.");
    }

    const filePaths = Array.isArray(paths) ? paths : [paths];

    return supabaseClient.storage
      .from(bucket)
      .remove(filePaths);
  }

  function destroy() {
    if (authSubscription && typeof authSubscription.unsubscribe === "function") {
      authSubscription.unsubscribe();
    }

    realtimeChannels.forEach(function (channel) {
      if (client && typeof client.removeChannel === "function") {
        client.removeChannel(channel);
      }
    });

    realtimeChannels.clear();
    authSubscription = null;
    client = null;
    sdkPromise = null;

    updateState({
      ...DEFAULT_STATE
    });
  }

  const AURA_SUPABASE = {
    initialize: initialize,
    getClient: getClient,
    getState: getState,
    isEnabled: isEnabled,
    isConfigured: isConfigured,
    subscribe: subscribe,

    auth: {
      getSession: getSession,
      getUser: getUser,
      signIn: signIn,
      signUp: signUp,
      signOut: signOut,
      resetPassword: resetPassword
    },

    database: {
      select: select,
      insert: insert,
      update: update,
      remove: remove,
      getTableName: getTableName
    },

    realtime: {
      createChannel: createRealtimeChannel,
      subscribe: subscribeRealtime,
      removeChannel: removeRealtimeChannel
    },

    storage: {
      upload: uploadFile,
      getPublicUrl: getPublicFileUrl,
      delete: deleteFile
    },

    destroy: destroy
  };

  window.AURA_SUPABASE = AURA_SUPABASE;

  window.AURA = window.AURA || {};
  window.AURA.supabase = AURA_SUPABASE;

  document.addEventListener("DOMContentLoaded", function () {
    initialize();
  });

})(window);