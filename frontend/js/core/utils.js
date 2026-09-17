/* =========================================================
   AURA Clinic — Core Utilities
   Path: frontend/js/core/utils.js
   Purpose: Shared formatting, validation, ID, date, and UI helpers
   ========================================================= */

(function (window) {
  'use strict';

  const AURA = window.AURA || (window.AURA = {});
  const CONFIG = window.AURA_CONFIG || window.CONFIG || {};

  const utils = {};

  /* =========================================================
     General Helpers
     ========================================================= */

  utils.isObject = function (value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  };

  utils.isEmpty = function (value) {
    return value === null ||
      value === undefined ||
      String(value).trim() === '';
  };

  utils.isArray = function (value) {
    return Array.isArray(value);
  };

  utils.clone = function (value) {
    if (value === null || value === undefined) return value;

    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (error) {
        // Fallback below.
      }
    }

    return JSON.parse(JSON.stringify(value));
  };

  utils.debounce = function (callback, delay) {
    let timer;

    return function (...args) {
      clearTimeout(timer);

      timer = setTimeout(() => {
        callback.apply(this, args);
      }, delay);
    };
  };

  utils.throttle = function (callback, limit) {
    let waiting = false;

    return function (...args) {
      if (waiting) return;

      callback.apply(this, args);
      waiting = true;

      setTimeout(() => {
        waiting = false;
      }, limit);
    };
  };

  utils.sleep = function (milliseconds) {
    return new Promise(resolve => {
      setTimeout(resolve, milliseconds);
    });
  };

  utils.noop = function () {};

  /* =========================================================
     ID and Token Helpers
     ========================================================= */

  utils.createId = function (prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);

    return `${prefix}_${timestamp}_${random}`;
  };

  utils.generateUHID = function () {
    if (typeof CONFIG.generateUHID === 'function') {
      return CONFIG.generateUHID();
    }

    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);

    return `AURA-${year}-${random}`;
  };

  utils.generateToken = function (prefix = 'A') {
    if (typeof CONFIG.generateToken === 'function') {
      return CONFIG.generateToken(prefix);
    }

    const number = Math.floor(1 + Math.random() * 999);

    return `${prefix}-${String(number).padStart(3, '0')}`;
  };

  utils.generateStaffId = function () {
    const random = Math.floor(1000 + Math.random() * 9000);

    return `STAFF-${random}`;
  };

  utils.generateInvoiceNumber = function () {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000);

    return `INV-${year}${month}-${random}`;
  };

  /* =========================================================
     String Helpers
     ========================================================= */

  utils.capitalize = function (value) {
    if (utils.isEmpty(value)) return '';

    const text = String(value).trim();

    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  utils.capitalizeWords = function (value) {
    if (utils.isEmpty(value)) return '';

    return String(value)
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, character => character.toUpperCase());
  };

  utils.toTitleCase = utils.capitalizeWords;

  utils.slugify = function (value) {
    if (utils.isEmpty(value)) return '';

    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  utils.truncate = function (value, length = 80, suffix = '…') {
    if (utils.isEmpty(value)) return '';

    const text = String(value);

    if (text.length <= length) return text;

    return text.slice(0, Math.max(0, length - suffix.length)) + suffix;
  };

  utils.initials = function (name, maxCharacters = 2) {
    if (utils.isEmpty(name)) return 'AU';

    const words = String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 1) {
      return words[0]
        .slice(0, maxCharacters)
        .toUpperCase();
    }

    return words
      .slice(0, maxCharacters)
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase();
  };

  utils.normalizeSearchText = function (value) {
    if (utils.isEmpty(value)) return '';

    return String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  utils.matchesSearch = function (value, searchTerm) {
    const haystack = utils.normalizeSearchText(value);
    const needle = utils.normalizeSearchText(searchTerm);

    if (!needle) return true;

    return haystack.includes(needle);
  };

  /* =========================================================
     Number and Currency Helpers
     ========================================================= */

  utils.toNumber = function (value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
      const parsed = Number(cleaned);

      return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
  };

  utils.formatNumber = function (value, options = {}) {
    const number = utils.toNumber(value);

    const defaults = {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    };

    return new Intl.NumberFormat(
      options.locale || 'en-IN',
      {
        ...defaults,
        ...options
      }
    ).format(number);
  };

  utils.formatCurrency = function (value, currency = 'INR') {
    if (typeof CONFIG.formatCurrency === 'function' &&
        currency === 'INR') {
      return CONFIG.formatCurrency(value);
    }

    const number = utils.toNumber(value);

    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(number);
  };

  utils.formatPercentage = function (value, decimals = 1) {
    const number = utils.toNumber(value);

    return `${number.toFixed(decimals)}%`;
  };

  utils.clamp = function (value, min, max) {
    const number = utils.toNumber(value);

    return Math.min(Math.max(number, min), max);
  };

  utils.round = function (value, decimals = 2) {
    const number = utils.toNumber(value);
    const multiplier = Math.pow(10, decimals);

    return Math.round((number + Number.EPSILON) * multiplier) / multiplier;
  };

  /* =========================================================
     Date and Time Helpers
     ========================================================= */

  utils.parseDate = function (value) {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  };

  utils.formatDate = function (value, options = {}) {
    const date = utils.parseDate(value);

    if (!date) return '—';

    return new Intl.DateTimeFormat(
      options.locale || 'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...options
      }
    ).format(date);
  };

  utils.formatShortDate = function (value) {
    return utils.formatDate(value, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  utils.formatDateTime = function (value, options = {}) {
    const date = utils.parseDate(value);

    if (!date) return '—';

    return new Intl.DateTimeFormat(
      options.locale || 'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options
      }
    ).format(date);
  };

  utils.formatTime = function (value) {
    const date = utils.parseDate(value);

    if (!date) return '—';

    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  utils.toInputDate = function (value) {
    const date = utils.parseDate(value);

    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  utils.toInputDateTime = function (value) {
    const date = utils.parseDate(value);

    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  utils.startOfDay = function (value = new Date()) {
    const date = utils.parseDate(value) || new Date();

    date.setHours(0, 0, 0, 0);

    return date;
  };

  utils.endOfDay = function (value = new Date()) {
    const date = utils.parseDate(value) || new Date();

    date.setHours(23, 59, 59, 999);

    return date;
  };

  utils.isToday = function (value) {
    const date = utils.parseDate(value);

    if (!date) return false;

    const today = new Date();

    return date.toDateString() === today.toDateString();
  };

  utils.daysBetween = function (firstDate, secondDate) {
    const first = utils.parseDate(firstDate);
    const second = utils.parseDate(secondDate);

    if (!first || !second) return 0;

    const milliseconds = Math.abs(second.getTime() - first.getTime());

    return Math.floor(milliseconds / (1000 * 60 * 60 * 24));
  };

  utils.timeAgo = function (value) {
    const date = utils.parseDate(value);

    if (!date) return '—';

    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return utils.formatDate(date);
  };

  /* =========================================================
     Patient and Clinical Helpers
     ========================================================= */

  utils.getPatientDisplayName = function (patient) {
    if (!patient) return 'Unknown Patient';

    if (patient.fullName) return patient.fullName;

    const name = [
      patient.title,
      patient.firstName,
      patient.middleName,
      patient.lastName
    ].filter(Boolean).join(' ');

    return name || 'Unknown Patient';
  };

  utils.getPatientAge = function (dateOfBirth) {
    const birthDate = utils.parseDate(dateOfBirth);

    if (!birthDate) return '—';

    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference = today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        today.getDate() < birthDate.getDate()
      )
    ) {
      age--;
    }

    return Math.max(0, age);
  };

  utils.getGenderLabel = function (gender) {
    const labels = {
      male: 'Male',
      female: 'Female',
      other: 'Other',
      unknown: 'Not specified'
    };

    const key = String(gender || '').toLowerCase();

    return labels[key] || utils.capitalizeWords(gender) || 'Not specified';
  };

  utils.getBloodGroupLabel = function (bloodGroup) {
    return bloodGroup ? String(bloodGroup).toUpperCase() : 'Not recorded';
  };

  utils.getQueueStatusLabel = function (status) {
    const labels = {
      waiting: 'Waiting',
      called: 'Called',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      skipped: 'Skipped',
      no_show: 'No Show'
    };

    return labels[status] || utils.capitalizeWords(status);
  };

  utils.getStatusLabel = function (status) {
    if (utils.isEmpty(status)) return 'Unknown';

    return String(status)
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
  };

  /* =========================================================
     Validation Helpers
     ========================================================= */

  utils.isValidEmail = function (email) {
    if (utils.isEmpty(email)) return false;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      String(email).trim()
    );
  };

  utils.isValidPhone = function (phone) {
    if (utils.isEmpty(phone)) return false;

    const digits = String(phone).replace(/\D/g, '');

    return digits.length >= 10 && digits.length <= 15;
  };

  utils.isValidDate = function (value) {
    return Boolean(utils.parseDate(value));
  };

  utils.isFutureDate = function (value) {
    const date = utils.parseDate(value);

    if (!date) return false;

    return date.getTime() > Date.now();
  };

  utils.isPastDate = function (value) {
    const date = utils.parseDate(value);

    if (!date) return false;

    return date.getTime() < Date.now();
  };

  utils.required = function (value) {
    return !utils.isEmpty(value);
  };

  utils.validateRequiredFields = function (data, fields) {
    const errors = {};

    fields.forEach(field => {
      const value = data ? data[field] : '';

      if (utils.isEmpty(value)) {
        errors[field] = 'This field is required.';
      }
    });

    return errors;
  };

  utils.validatePatient = function (patient) {
    const errors = {};

    if (utils.isEmpty(patient.firstName) &&
        utils.isEmpty(patient.fullName)) {
      errors.firstName = 'Patient name is required.';
    }

    if (utils.isEmpty(patient.gender)) {
      errors.gender = 'Gender is required.';
    }

    if (!utils.isEmpty(patient.phone) &&
        !utils.isValidPhone(patient.phone)) {
      errors.phone = 'Enter a valid phone number.';
    }

    if (!utils.isEmpty(patient.email) &&
        !utils.isValidEmail(patient.email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (patient.dateOfBirth && utils.isFutureDate(patient.dateOfBirth)) {
      errors.dateOfBirth = 'Date of birth cannot be in the future.';
    }

    return errors;
  };

  utils.hasErrors = function (errors) {
    return Boolean(errors && Object.keys(errors).length > 0);
  };

  /* =========================================================
     DOM Helpers
     ========================================================= */

  utils.$ = function (selector, scope = document) {
    return scope.querySelector(selector);
  };

  utils.$$ = function (selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  };

  utils.createElement = function (tagName, options = {}) {
    const element = document