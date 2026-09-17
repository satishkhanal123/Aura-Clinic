/* ============================================================
   AURA CLINIC — BILLING MODULE
   frontend/js/modules/billing.js

   Purpose:
   - Create and manage patient invoices.
   - Record payments.
   - Track pending, partial, and paid invoices.
   - Support consultation, laboratory, diagnostic, pharmacy,
     procedure, and miscellaneous charges.
   - Store billing data in IndexedDB.
============================================================ */

(function () {
  'use strict';

  const CONFIG = window.AURA_CONFIG || {};
  const STORAGE = window.AURA_STORAGE || window.AURA?.storage;
  const EVENTS = window.AURA_EVENTS || window.AURA?.events;
  const UTILS = window.AURA_UTILS || window.AURA?.utils;
  const APP = window.AURA_APP || window.AURA?.app;

  const MODULE_NAME = 'billing';

  const STORES = {
    patients: 'patients',
    invoices: 'invoices',
    payments: 'payments',
    services: 'services',
    encounters: 'encounters',
    consultations: 'consultations',
    labOrders: 'labOrders',
    labResults: 'labResults',
    auditLogs: 'auditLogs'
  };

  const STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PARTIAL: 'partial',
    PAID: 'paid',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded'
  };

  const state = {
    invoices: [],
    patients: [],
    payments: [],
    services: [],
    encounters: [],
    consultations: [],
    labOrders: [],
    filteredInvoices: [],
    searchTerm: '',
    statusFilter: 'all',
    dateFilter: 'today',
    selectedInvoice: null,
    isLoading: false,
    isSaving: false
  };

  const serviceCatalog = [
    {
      id: 'consultation-general',
      code: 'CONSULT-GEN',
      name: 'General Consultation',
      category: 'Consultation',
      price: 500
    },
    {
      id: 'consultation-pediatric',
      code: 'CONSULT-PED',
      name: 'Pediatric Consultation',
      category: 'Consultation',
      price: 600
    },
    {
      id: 'followup-consultation',
      code: 'CONSULT-FUP',
      name: 'Follow-up Consultation',
      category: 'Consultation',
      price: 300
    },
    {
      id: 'cbc',
      code: 'LAB-CBC',
      name: 'Complete Blood Count',
      category: 'Laboratory',
      price: 350
    },
    {
      id: 'blood-sugar',
      code: 'LAB-FBS',
      name: 'Fasting Blood Sugar',
      category: 'Laboratory',
      price: 150
    },
    {
      id: 'urine-routine',
      code: 'LAB-URINE',
      name: 'Urine Routine Examination',
      category: 'Laboratory',
      price: 200
    },
    {
      id: 'xray',
      code: 'RAD-XRAY',
      name: 'X-Ray',
      category: 'Radiology',
      price: 700
    },
    {
      id: 'ultrasound',
      code: 'RAD-USG',
      name: 'Ultrasound',
      category: 'Radiology',
      price: 1200
    },
    {
      id: 'injection',
      code: 'PROC-INJ',
      name: 'Injection Administration',
      category: 'Procedure',
      price: 100
    },
    {
      id: 'dressing',
      code: 'PROC-DRS',
      name: 'Wound Dressing',
      category: 'Procedure',
      price: 250
    }
  ];

  /* ------------------------------------------------------------
     Helpers
  ------------------------------------------------------------ */

  function safe(value) {
    if (UTILS?.escapeHtml) return UTILS.escapeHtml(String(value ?? ''));
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createId(prefix = 'id') {
    if (UTILS?.createId) return UTILS.createId(prefix);

    return `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatDateTime(value) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCurrency(value) {
    const amount = Number(value || 0);

    if (CONFIG?.formatCurrency) {
      return CONFIG.formatCurrency(amount);
    }

    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getInvoiceNumber() {
    if (UTILS?.generateInvoiceNumber) {
      return UTILS.generateInvoiceNumber();
    }

    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');

    return `INV-${datePart}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
  }

  function getPaymentNumber() {
    return `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
  }

  function getPatientName(patient) {
    if (!patient) return 'Unknown Patient';

    return [
      patient.firstName,
      patient.middleName,
      patient.lastName
    ]
      .filter(Boolean)
      .join(' ') || patient.name || 'Unknown Patient';
  }

  function getPatientById(id) {
    return state.patients.find((patient) => patient.id === id);
  }

  function getInvoicePatient(invoice) {
    return (
      getPatientById(invoice.patientId) || {
        id: invoice.patientId,
        uhid: invoice.uhid || '',
        firstName: invoice.patientName || 'Unknown',
        lastName: ''
      }
    );
  }

  function getInvoiceStatus(invoice) {
    if (!invoice) return STATUS.PENDING;

    if (invoice.status === STATUS.CANCELLED) return STATUS.CANCELLED;
    if (invoice.status === STATUS.REFUNDED) return STATUS.REFUNDED;

    const total = number(invoice.total);
    const paid = number(invoice.paidAmount);

    if (total <= 0) return STATUS.PAID;
    if (paid >= total) return STATUS.PAID;
    if (paid > 0) return STATUS.PARTIAL;

    return invoice.status || STATUS.PENDING;
  }

  function getStatusLabel(status) {
    const labels = {
      draft: 'Draft',
      pending: 'Pending',
      partial: 'Partially Paid',
      paid: 'Paid',
      cancelled: 'Cancelled',
      refunded: 'Refunded'
    };

    return labels[status] || status || 'Pending';
  }

  function getStatusClass(status) {
    const classes = {
      draft: 'status-neutral',
      pending: 'status-warning',
      partial: 'status-info',
      paid: 'status-success',
      cancelled: 'status-danger',
      refunded: 'status-purple'
    };

    return classes[status] || 'status-neutral';
  }

  function getCategoryIcon(category) {
    const icons = {
      Consultation: 'stethoscope',
      Laboratory: 'flask-conical',
      Radiology: 'scan',
      Pharmacy: 'pill',
      Procedure: 'syringe',
      Miscellaneous: 'receipt'
    };

    return icons[category] || 'receipt';
  }

  function getPaymentMethods() {
    return [
      'Cash',
      'UPI',
      'Debit Card',
      'Credit Card',
      'Bank Transfer',
      'Insurance',
      'Other'
    ];
  }

  function emit(name, detail) {
    try {
      EVENTS?.emit?.(name, detail);
    } catch (error) {
      console.warn('[AURA Billing] Event emit failed:', error);
    }

    try {
      document.dispatchEvent(
        new CustomEvent(`aura:${name}`, {
          detail
        })
      );
    } catch (error) {
      console.warn('[AURA Billing] DOM event failed:', error);
    }
  }

  function toast(message, type = 'success') {
    if (APP?.toast) {
      APP.toast({
        type,
        title: type === 'error' ? 'Billing Error' : 'Billing',
        message
      });
      return;
    }

    if (window.AURA?.toast) {
      window.AURA.toast({
        type,
        title: type === 'error' ? 'Billing Error' : 'Billing',
        message
      });
      return;
    }

    console.log(`[AURA Billing] ${message}`);
  }

  function openModal(options = {}) {
    if (APP?.modal) {
      APP.modal(options);
      return;
    }

    if (window.AURA?.modal) {
      window.AURA.modal(options);
      return;
    }

    createFallbackModal(options);
  }

  function closeModal() {
    const modal = document.querySelector('[data-aura-fallback-modal]');

    if (modal) modal.remove();

    document.querySelectorAll('[data-modal-close]').forEach((button) => {
      button.click();
    });
  }

  function createFallbackModal({
    title = 'AURA Clinic',
    content = '',
    size = 'large',
    footer = ''
  }) {
    closeModal();

    const modal = document.createElement('div');

    modal.setAttribute('data-aura-fallback-modal', 'true');

    modal.innerHTML = `
      <div class="modal-backdrop" data-modal-close></div>
      <div class="modal-shell modal-shell--${safe(size)}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <p class="eyebrow">AURA CLINIC</p>
            <h2>${safe(title)}</h2>
          </div>
          <button class="icon-button" type="button" data-modal-close aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-modal-close]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function audit(action, entity, entityId, metadata = {}) {
    try {
      STORAGE?.add?.(STORES.auditLogs, {
        id: createId('audit'),
        action,
        entity,
        entityId,
        metadata,
        module: MODULE_NAME,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn('[AURA Billing] Audit failed:', error);
    }
  }

  /* ------------------------------------------------------------
     Data Loading
  ------------------------------------------------------------ */

  async function loadData() {
    state.isLoading = true;

    try {
      const [
        invoices,
        patients,
        payments,
        services,
        encounters,
        consultations,
        labOrders
      ] = await Promise.all([
        STORAGE?.getAll?.(STORES.invoices) || [],
        STORAGE?.getAll?.(STORES.patients) || [],
        STORAGE?.getAll?.(STORES.payments) || [],
        STORAGE?.getAll?.(STORES.services) || [],
        STORAGE?.getAll?.(STORES.encounters) || [],
        STORAGE?.getAll?.(STORES.consultations) || [],
        STORAGE?.getAll?.(STORES.labOrders) || []
      ]);

      state.invoices = Array.isArray(invoices) ? invoices : [];
      state.patients = Array.isArray(patients) ? patients : [];
      state.payments = Array.isArray(payments) ? payments : [];
      state.services = Array.isArray(services) ? services : [];
      state.encounters = Array.isArray(encounters) ? encounters : [];
      state.consultations = Array.isArray(consultations) ? consultations : [];
      state.labOrders = Array.isArray(labOrders) ? labOrders : [];

      ensureDefaultServices();
      calculateInvoiceBalances();
      applyFilters();
    } catch (error) {
      console.error('[AURA Billing] Data loading failed:', error);
      toast('Unable to load billing records.', 'error');
    } finally {
      state.isLoading = false;
    }
  }

  async function ensureDefaultServices() {
    if (!STORAGE) return;

    if (state.services.length > 0) return;

    try {
      await STORAGE.bulkAdd(
        STORES.services,
        serviceCatalog.map((service) => ({
          ...service,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))
      );

      state.services = serviceCatalog.map((service) => ({
        ...service,
        active: true
      }));
    } catch (error) {
      console.warn('[AURA Billing] Default services unavailable:', error);
    }
  }

  function calculateInvoiceBalances() {
    state.invoices = state.invoices.map((invoice) => {
      const total = number(invoice.total);
      const paidAmount = number(invoice.paidAmount);

      return {
        ...invoice,
        total,
        paidAmount,
        balance: Math.max(0, total - paidAmount),
        status: getInvoiceStatus({
          ...invoice,
          total,
          paidAmount
        })
      };
    });
  }

  /* ------------------------------------------------------------
     Filtering and Statistics
  ------------------------------------------------------------ */

  function isToday(value) {
    if (!value) return false;

    const date = new Date(value);
    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  function isThisMonth(value) {
    if (!value) return false;

    const date = new Date(value);
    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth()
    );
  }

  function matchesDate(invoice) {
    if (state.dateFilter === 'all') return true;

    if (state.dateFilter === 'today') {
      return isToday(invoice.createdAt || invoice.invoiceDate);
    }

    if (state.dateFilter === 'month') {
      return isThisMonth(invoice.createdAt || invoice.invoiceDate);
    }

    return true;
  }

  function matchesSearch(invoice) {
    const term = state.searchTerm.trim().toLowerCase();

    if (!term) return true;

    const patient = getInvoicePatient(invoice);

    const haystack = [
      invoice.invoiceNumber,
      invoice.uhid,
      invoice.patientName,
      getPatientName(patient),
      invoice.phone,
      invoice.status
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  }

  function applyFilters() {
    state.filteredInvoices = state.invoices
      .filter((invoice) => matchesDate(invoice))
      .filter((invoice) => matchesSearch(invoice))
      .filter((invoice) => {
        if (state.statusFilter === 'all') return true;
        return getInvoiceStatus(invoice) === state.statusFilter;
      })
      .sort((a, b) => {
        const first = new Date(b.createdAt || b.invoiceDate || 0).getTime();
        const second = new Date(a.createdAt || a.invoiceDate || 0).getTime();
        return first - second;
      });
  }

  function getStats() {
    const todayInvoices = state.invoices.filter((invoice) =>
      isToday(invoice.createdAt || invoice.invoiceDate)
    );

    const todayRevenue = todayInvoices.reduce(
      (sum, invoice) => sum + number(invoice.paidAmount),
      0
    );

    const totalBilled = todayInvoices.reduce(
      (sum, invoice) => sum + number(invoice.total),
      0
    );

    const pending = state.invoices
      .filter((invoice) => {
        const status = getInvoiceStatus(invoice);
        return status === STATUS.PENDING || status === STATUS.PARTIAL;
      })
      .reduce((sum, invoice) => sum + number(invoice.balance), 0);

    const outstandingCount = state.invoices.filter((invoice) => {
      const status = getInvoiceStatus(invoice);
      return status === STATUS.PENDING || status === STATUS.PARTIAL;
    }).length;

    const paidCount = todayInvoices.filter(
      (invoice) => getInvoiceStatus(invoice) === STATUS.PAID
    ).length;

    return {
      todayInvoices: todayInvoices.length,
      todayRevenue,
      totalBilled,
      pending,
      outstandingCount,
      paidCount
    };
  }

  /* ------------------------------------------------------------
     Invoice Creation
  ------------------------------------------------------------ */

  function getServiceList() {
    const stored = state.services.filter((service) => service.active !== false);

    const merged = [...serviceCatalog];

    stored.forEach((service) => {
      const exists = merged.some((item) => item.id === service.id);

      if (!exists) merged.push(service);
    });

    return merged;
  }

  function createInvoiceLineItem(data = {}) {
    const quantity = Math.max(1, number(data.quantity || 1));
    const unitPrice = Math.max(0, number(data.unitPrice));

    return {
      id: data.id || createId('item'),
      serviceId: data.serviceId || '',
      code: data.code || '',
      name: data.name || 'Service',
      category: data.category || 'Miscellaneous',
      quantity,
      unitPrice,
      discount: Math.max(0, number(data.discount)),
      taxRate: Math.max(0, number(data.taxRate)),
      notes: data.notes || '',
      total: calculateLineTotal({
        quantity,
        unitPrice,
        discount: data.discount,
        taxRate: data.taxRate
      })
    };
  }

  function calculateLineTotal(item) {
    const quantity = Math.max(0, number(item.quantity));
    const unitPrice = Math.max(0, number(item.unitPrice));
    const discount = Math.max(0, number(item.discount));
    const taxRate = Math.max(0, number(item.taxRate));

    const subtotal = quantity * unitPrice;
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = taxableAmount * (taxRate / 100);

    return Math.max(0, taxableAmount + taxAmount);
  }

  function calculateInvoiceTotals(items = [], adjustments = {}) {
    const subtotal = items.reduce((sum, item) => {
      return sum + number(item.quantity) * number(item.unitPrice);
    }, 0);

    const itemDiscount = items.reduce(
      (sum, item) => sum + number(item.discount),
      0
    );

    const itemTax = items.reduce((sum, item) => {
      const taxableAmount = Math.max(
        0,
        number(item.quantity) * number(item.unitPrice) - number(item.discount)
      );

      return sum + taxableAmount * (number(item.taxRate) / 100);
    }, 0);

    const invoiceDiscount = Math.max(0, number(adjustments.discount));
    const additionalTax = Math.max(0, number(adjustments.tax));
    const roundOff = number(adjustments.roundOff);

    const taxableBase = Math.max(
      0,
      subtotal - itemDiscount - invoiceDiscount
    );

    const total = Math.max(
      0,
      taxableBase + itemTax + additionalTax + roundOff
    );

    return {
      subtotal,
      itemDiscount,
      invoiceDiscount,
      itemTax,
      additionalTax,
      roundOff,
      total
    };
  }

  function validateInvoice(invoice) {
    const errors = [];

    if (!invoice.patientId) {
      errors.push('Please select a patient.');
    }

    if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
      errors.push('Add at least one service.');
    }

    if (number(invoice.total) < 0) {
      errors.push('Invoice total cannot be negative.');
    }

    return errors;
  }

  async function createInvoice(invoiceData = {}) {
    if (!STORAGE) {
      throw new Error('IndexedDB storage is unavailable.');
    }

    const now = new Date().toISOString();

    const patient = getPatientById(invoiceData.patientId);

    const items = (invoiceData.items || []).map((item) =>
      createInvoiceLineItem(item)
    );

    const totals = calculateInvoiceTotals(items, {
      discount: invoiceData.discount,
      tax: invoiceData.tax,
      roundOff: invoiceData.roundOff
    });

    const invoice = {
      id: createId('invoice'),
      invoiceNumber: invoiceData.invoiceNumber || getInvoiceNumber(),
      patientId: invoiceData.patientId,
      uhid: patient?.uhid || invoiceData.uhid || '',
      patientName: patient ? getPatientName(patient) : invoiceData.patientName || '',
      phone: patient?.phone || invoiceData.phone || '',
      encounterId: invoiceData.encounterId || '',
      consultationId: invoiceData.consultationId || '',
      source: invoiceData.source || 'billing',
      invoiceDate: invoiceData.invoiceDate || todayISO(),
      items,
      subtotal: totals.subtotal,
      itemDiscount: totals.itemDiscount,
      discount: totals.invoiceDiscount,
      itemTax: totals.itemTax,
      tax: totals.additionalTax,
      roundOff: totals.roundOff,
      total: totals.total,
      paidAmount: 0,
      balance: totals.total,
      status: totals.total > 0 ? STATUS.PENDING : STATUS.PAID,
      notes: invoiceData.notes || '',
      createdAt: now,
      updatedAt: now,
      createdBy: invoiceData.createdBy || 'system'
    };

    const errors = validateInvoice(invoice);

    if (errors.length) {
      throw new Error(errors.join(' '));
    }

    await STORAGE.add(STORES.invoices, invoice);

    state.invoices.push(invoice);
    calculateInvoiceBalances();
    applyFilters();

    audit('create', 'invoice', invoice.id, {
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total
    });

    emit('invoice-created', invoice);

    try {
      EVENTS?.invoiceCreated?.(invoice);
    } catch (_) {}

    return invoice;
  }

  async function updateInvoice(id, changes = {}) {
    if (!STORAGE) throw new Error('IndexedDB storage is unavailable.');

    const existing = state.invoices.find((invoice) => invoice.id === id);

    if (!existing) {
      throw new Error('Invoice not found.');
    }

    const updated = {
      ...existing,
      ...changes,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    if (changes.items) {
      const items = changes.items.map((item) => createInvoiceLineItem(item));

      const totals = calculateInvoiceTotals(items, {
        discount: changes.discount ?? existing.discount,
        tax: changes.tax ?? existing.tax,
        roundOff: changes.roundOff ?? existing.roundOff
      });

      Object.assign(updated, {
        items,
        subtotal: totals.subtotal,
        itemDiscount: totals.itemDiscount,
        itemTax: totals.itemTax,
        total: totals.total
      });
    }

    updated.paidAmount = number(updated.paidAmount);
    updated.balance = Math.max(0, number(updated.total) - updated.paidAmount);
    updated.status = getInvoiceStatus(updated);

    await STORAGE.put(STORES.invoices, updated);

    const index = state.invoices.findIndex((invoice) => invoice.id === id);

    if (index !== -1) state.invoices[index] = updated;

    calculateInvoiceBalances();
    applyFilters();

    audit('update', 'invoice', id, {
      invoiceNumber: updated.invoiceNumber
    });

    emit('invoice-updated', updated);

    return updated;
  }

  async function cancelInvoice(id, reason = '') {
    const invoice = state.invoices.find((item) => item.id === id);

    if (!invoice) throw new Error('Invoice not found.');

    if (number(invoice.paidAmount) > 0) {
      throw new Error(
        'Paid invoices cannot be cancelled directly. Process a refund or adjustment instead.'
      );
    }

    const updated = await updateInvoice(id, {
      status: STATUS.CANCELLED,
      cancellationReason: reason
    });

    toast('Invoice cancelled.', 'success');

    return updated;
  }

  /* ------------------------------------------------------------
     Payments
  ------------------------------------------------------------ */

  async function recordPayment(paymentData = {}) {
    if (!STORAGE) {
      throw new Error('IndexedDB storage is unavailable.');
    }

    const invoice = state.invoices.find(
      (item) => item.id === paymentData.invoiceId
    );

    if (!invoice) {
      throw new Error('Invoice not found.');
    }

    if (getInvoiceStatus(invoice) === STATUS.CANCELLED) {
      throw new Error('Cancelled invoices cannot receive payments.');
    }

    const amount = number(paymentData.amount);

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const balance = Math.max(0, number(invoice.total) - number(invoice.paidAmount));

    if (amount > balance) {
      throw new Error(
        `Payment exceeds the outstanding balance of ${formatCurrency(balance)}.`
      );
    }

    const now = new Date().toISOString();

    const payment = {
      id: createId('payment'),
      paymentNumber: paymentData.paymentNumber || getPaymentNumber(),
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      patientId: invoice.patientId,
      uhid: invoice.uhid || '',
      patientName: invoice.patientName || '',
      amount,
      method: paymentData.method || 'Cash',
      reference: paymentData.reference || '',
      paymentDate: paymentData.paymentDate || todayISO(),
      notes: paymentData.notes || '',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      createdBy: paymentData.createdBy || 'system'
    };

    await STORAGE.add(STORES.payments, payment);

    const updatedInvoice = await updateInvoice(invoice.id, {
      paidAmount: number(invoice.paidAmount) + amount
    });

    state.payments.push(payment);

    audit('create', 'payment', payment.id, {
      invoiceId: invoice.id,
      amount
    });

    emit('payment-created', {
      payment,
      invoice: updatedInvoice
    });

    try {
      EVENTS?.paymentCreated?.({
        payment,
        invoice: updatedInvoice
      });
    } catch (_) {}

    return {
      payment,
      invoice: updatedInvoice
    };
  }

  async function getInvoicePayments(invoiceId) {
    return state.payments
      .filter((payment) => payment.invoiceId === invoiceId)
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
  }

  /* ------------------------------------------------------------
     Patient and Service Selection
  ------------------------------------------------------------ */

  function getPatientOptions(selectedId = '') {
    const patients = [...state.patients].sort((a, b) =>
      getPatientName(a).localeCompare(getPatientName(b))
    );

    return `
      <option value="">Select patient</option>
      ${patients
        .map(
          (patient) => `
            <option value="${safe(patient.id)}" ${
              patient.id === selectedId ? 'selected' : ''
            }>
              ${safe(patient.uhid || '')} — ${safe(getPatientName(patient))}
            </option>
          `
        )
        .join('')}
    `;
  }

  function getServiceOptions(selectedId = '') {
    return `
      <option value="">Select service</option>
      ${getServiceList()
        .map(
          (service) => `
            <option value="${safe(service.id)}" ${
              service.id === selectedId ? 'selected' : ''
            }>
              ${safe(service.name)} — ${formatCurrency(service.price)}
            </option>
          `
        )
        .join('')}
    `;
  }

  function openNewInvoiceModal(patientId = '') {
    const content = `
      <form id="billing-invoice-form" class="aura-form">
        <div class="clinical-patient-banner">
          <div class="clinical-patient-banner__icon">
            <i data-lucide="receipt"></i>
          </div>
          <div>
            <span class="eyebrow">NEW BILLING RECORD</span>
            <h3>Create Patient Invoice</h3>
            <p>Generate charges for consultation, diagnostics, procedures, or other services.</p>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Patient Information</h4>
              <p>Select the patient receiving the services.</p>
            </div>
          </div>

          <div class="form-grid form-grid--two">
            <label class="field">
              <span>Patient *</span>
              <select name="patientId" required>
                ${getPatientOptions(patientId)}
              </select>
            </label>

            <label class="field">
              <span>Invoice Date *</span>
              <input type="date" name="invoiceDate" value="${todayISO()}" required>
            </label>

            <label class="field">
              <span>UHID</span>
              <input type="text" name="uhid" data-invoice-uhid readonly placeholder="Auto-filled">
            </label>

            <label class="field">
              <span>Billing Source</span>
              <select name="source">
                <option value="billing">General Billing</option>
                <option value="consultation">Consultation</option>
                <option value="laboratory">Laboratory</option>
                <option value="radiology">Radiology</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="procedure">Procedure</option>
              </select>
            </label>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Invoice Items</h4>
              <p>Add services and charges to this invoice.</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-add-invoice-item>
              <i data-lucide="plus"></i>
              Add Item
            </button>
          </div>

          <div class="invoice-items-editor" data-invoice-items>
            ${renderInvoiceItemEditorRow()}
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__header">
            <div>
              <h4>Adjustments</h4>
              <p>Apply discounts, taxes, and rounding adjustments.</p>
            </div>
          </div>

          <div class="form-grid form-grid--three">
            <label class="field">
              <span>Additional Discount (₹)</span>
              <input type="number" name="discount" min="0" step="0.01" value="0">
            </label>

            <label class="field">
              <span>Additional Tax (₹)</span>
              <input type="number" name="tax" min="0" step="0.01" value="0">
            </label>

            <label class="field">
              <span>Round-off (₹)</span>
              <input type="number" name="roundOff" step="0.01" value="0">
            </label>
          </div>
        </div>

        <div class="invoice-summary-card">
          <div class="invoice-summary-card__row">
            <span>Subtotal</span>
            <strong data-summary-subtotal>₹0.00</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Discount</span>
            <strong data-summary-discount>₹0.00</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Tax</span>
            <strong data-summary-tax>₹0.00</strong>
          </div>
          <div class="invoice-summary-card__row invoice-summary-card__row--total">
            <span>Total Amount</span>
            <strong data-summary-total>₹0.00</strong>
          </div>
        </div>

        <label class="field">
          <span>Notes</span>
          <textarea name="notes" rows="3" placeholder="Optional billing notes"></textarea>
        </label>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-modal-close>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            <i data-lucide="check"></i>
            Create Invoice
          </button>
        </div>
      </form>
    `;

    openModal({
      title: 'Create Invoice',
      content,
      size: 'large'
    });

    bindInvoiceFormEvents();

    const form = document.querySelector('#billing-invoice-form');

    if (form && patientId) {
      updatePatientDetails(patientId, form);
    }

    refreshInvoiceSummary();
  }

  function renderInvoiceItemEditorRow(item = {}) {
    const quantity = item.quantity || 1;
    const unitPrice = item.unitPrice || 0;
    const discount = item.discount || 0;
    const taxRate = item.taxRate || 0;

    return `
      <div class="invoice-item-editor" data-invoice-item>
        <div class="invoice-item-editor__main">
          <label class="field">
            <span>Service</span>
            <select name="serviceId" data-service-select>
              ${getServiceOptions(item.serviceId || '')}
            </select>
          </label>

          <label class="field">
            <span>Description</span>
            <input type="text" name="name" value="${safe(item.name || '')}" placeholder="Service description" data-item-name>
          </label>
        </div>

        <div class="invoice-item-editor__grid">
          <label class="field">
            <span>Qty</span>
            <input type="number" name="quantity" min="1" step="1" value="${quantity}" data-item-quantity>
          </label>

          <label class="field">
            <span>Unit Price</span>
            <input type="number" name="unitPrice" min="0" step="0.01" value="${unitPrice}" data-item-price>
          </label>

          <label class="field">
            <span>Discount</span>
            <input type="number" name="discount" min="0" step="0.01" value="${discount}" data-item-discount>
          </label>

          <label class="field">
            <span>Tax %</span>
            <input type="number" name="taxRate" min="0" step="0.01" value="${taxRate}" data-item-tax>
          </label>

          <div class="invoice-item-editor__total">
            <span>Line Total</span>
            <strong data-item-total>${formatCurrency(
              calculateLineTotal({
                quantity,
                unitPrice,
                discount,
                taxRate
              })
            )}</strong>
          </div>

          <button
            type="button"
            class="icon-button icon-button--danger"
            data-remove-invoice-item
            title="Remove item"
          >
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }

  function bindInvoiceFormEvents() {
    const form = document.querySelector('#billing-invoice-form');

    if (!form) return;

    form.addEventListener('change', (event) => {
      const serviceSelect = event.target.closest('[data-service-select]');

      if (serviceSelect) {
        const service = getServiceList().find(
          (item) => item.id === serviceSelect.value
        );

        const row = serviceSelect.closest('[data-invoice-item]');

        if (service && row) {
          row.querySelector('[data-item-name]').value = service.name;
          row.querySelector('[data-item-price]').value = service.price;
          row.querySelector('[data-item-tax]').value = service.taxRate || 0;
        }

        refreshInvoiceSummary();
        return;
      }

      if (
        event.target.matches(
          '[data-item-quantity], [data-item-price], [data-item-discount], [data-item-tax], input[name="discount"], input[name="tax"], input[name="roundOff"]'
        )
      ) {
        refreshInvoiceSummary();
      }

      if (event.target.name === 'patientId') {
        updatePatientDetails(event.target.value, form);
      }
    });

    form.addEventListener('input', (event) => {
      if (
        event.target.matches(
          '[data-item-quantity], [data-item-price], [data-item-discount], [data-item-tax], input[name="discount"], input[name="tax"], input[name="roundOff"]'
        )
      ) {
        refreshInvoiceSummary();
      }
    });

    form.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-add-invoice-item]');
      const removeButton = event.target.closest('[data-remove-invoice-item]');

      if (addButton) {
        const container = form.querySelector('[data-invoice-items]');

        container.insertAdjacentHTML(
          'beforeend',
          renderInvoiceItemEditorRow()
        );

        try {
          window.lucide?.createIcons?.();
        } catch (_) {}

        return;
      }

      if (removeButton) {
        const rows = form.querySelectorAll('[data-invoice-item]');

        if (rows.length <= 1) {
          toast('At least one invoice item is required.', 'error');
          return;
        }

        removeButton.closest('[data-invoice-item]')?.remove();
        refreshInvoiceSummary();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (state.isSaving) return;

      state.isSaving = true;

      try {
        const formData = new FormData(form);
        const items = readInvoiceItems(form);

        const invoiceData = {
          patientId: formData.get('patientId'),
          uhid: formData.get('uhid'),
          invoiceDate: formData.get('invoiceDate'),
          source: formData.get('source'),
          items,
          discount: number(formData.get('discount')),
          tax: number(formData.get('tax')),
          roundOff: number(formData.get('roundOff')),
          notes: formData.get('notes')
        };

        const invoice = await createInvoice(invoiceData);

        closeModal();
        toast(`Invoice ${invoice.invoiceNumber} created successfully.`);

        render();
      } catch (error) {
        console.error('[AURA Billing] Invoice creation failed:', error);
        toast(error.message || 'Unable to create invoice.', 'error');
      } finally {
        state.isSaving = false;
      }
    });

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function updatePatientDetails(patientId, form) {
    const patient = getPatientById(patientId);
    const uhidInput = form.querySelector('[data-invoice-uhid]');

    if (uhidInput) {
      uhidInput.value = patient?.uhid || '';
    }
  }

  function readInvoiceItems(form) {
    return [...form.querySelectorAll('[data-invoice-item]')]
      .map((row) => {
        const serviceId = row.querySelector('[data-service-select]')?.value || '';
        const service = getServiceList().find(
          (item) => item.id === serviceId
        );

        return {
          serviceId,
          code: service?.code || '',
          category: service?.category || 'Miscellaneous',
          name:
            row.querySelector('[data-item-name]')?.value ||
            service?.name ||
            'Service',
          quantity: number(
            row.querySelector('[data-item-quantity]')?.value || 1
          ),
          unitPrice: number(
            row.querySelector('[data-item-price]')?.value || 0
          ),
          discount: number(
            row.querySelector('[data-item-discount]')?.value || 0
          ),
          taxRate: number(row.querySelector('[data-item-tax]')?.value || 0)
        };
      })
      .filter((item) => item.name.trim());
  }

  function refreshInvoiceSummary() {
    const form = document.querySelector('#billing-invoice-form');

    if (!form) return;

    const items = readInvoiceItems(form);

    const totals = calculateInvoiceTotals(items, {
      discount: form.querySelector('input[name="discount"]')?.value,
      tax: form.querySelector('input[name="tax"]')?.value,
      roundOff: form.querySelector('input[name="roundOff"]')?.value
    });

    form.querySelectorAll('[data-invoice-item]').forEach((row, index) => {
      const item = items[index];

      if (!item) return;

      const totalElement = row.querySelector('[data-item-total]');

      if (totalElement) {
        totalElement.textContent = formatCurrency(calculateLineTotal(item));
      }
    });

    const subtotal = form.querySelector('[data-summary-subtotal]');
    const discount = form.querySelector('[data-summary-discount]');
    const tax = form.querySelector('[data-summary-tax]');
    const total = form.querySelector('[data-summary-total]');

    if (subtotal) subtotal.textContent = formatCurrency(totals.subtotal);
    if (discount) {
      discount.textContent = formatCurrency(
        totals.itemDiscount + totals.invoiceDiscount
      );
    }
    if (tax) {
      tax.textContent = formatCurrency(totals.itemTax + totals.additionalTax);
    }
    if (total) total.textContent = formatCurrency(totals.total);
  }

  /* ------------------------------------------------------------
     Payment Modal
  ------------------------------------------------------------ */

  async function openPaymentModal(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);

    if (!invoice) {
      toast('Invoice not found.', 'error');
      return;
    }

    const status = getInvoiceStatus(invoice);

    if (status === STATUS.PAID) {
      toast('This invoice is already fully paid.', 'error');
      return;
    }

    if (status === STATUS.CANCELLED) {
      toast('Cancelled invoices cannot receive payments.', 'error');
      return;
    }

    const balance = Math.max(0, number(invoice.total) - number(invoice.paidAmount));
    const payments = await getInvoicePayments(invoiceId);

    const content = `
      <div class="payment-modal">
        <div class="clinical-patient-banner">
          <div class="clinical-patient-banner__icon">
            <i data-lucide="wallet"></i>
          </div>
          <div>
            <span class="eyebrow">PAYMENT COLLECTION</span>
            <h3>${safe(invoice.invoiceNumber)}</h3>
            <p>${safe(invoice.patientName || 'Unknown Patient')} · ${safe(invoice.uhid || '')}</p>
          </div>
        </div>

        <div class="invoice-summary-card">
          <div class="invoice-summary-card__row">
            <span>Invoice Total</span>
            <strong>${formatCurrency(invoice.total)}</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Already Paid</span>
            <strong>${formatCurrency(invoice.paidAmount)}</strong>
          </div>
          <div class="invoice-summary-card__row invoice-summary-card__row--total">
            <span>Outstanding Balance</span>
            <strong>${formatCurrency(balance)}</strong>
          </div>
        </div>

        <form id="billing-payment-form" class="aura-form">
          <input type="hidden" name="invoiceId" value="${safe(invoice.id)}">

          <div class="form-grid form-grid--two">
            <label class="field">
              <span>Payment Amount (₹) *</span>
              <input
                type="number"
                name="amount"
                min="0.01"
                max="${balance}"
                step="0.01"
                value="${balance}"
                required
              >
            </label>

            <label class="field">
              <span>Payment Method *</span>
              <select name="method" required>
                ${getPaymentMethods()
                  .map(
                    (method) =>
                      `<option value="${safe(method)}">${safe(method)}</option>`
                  )
                  .join('')}
              </select>
            </label>

            <label class="field">
              <span>Payment Date *</span>
              <input type="date" name="paymentDate" value="${todayISO()}" required>
            </label>

            <label class="field">
              <span>Reference Number</span>
              <input type="text" name="reference" placeholder="Transaction/reference ID">
            </label>
          </div>

          <label class="field">
            <span>Payment Notes</span>
            <textarea name="notes" rows="2" placeholder="Optional notes"></textarea>
          </label>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" data-modal-close>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              <i data-lucide="check-circle"></i>
              Record Payment
            </button>
          </div>
        </form>

        ${
          payments.length
            ? `
              <div class="form-section">
                <div class="form-section__header">
                  <div>
                    <h4>Payment History</h4>
                    <p>Previous payments against this invoice.</p>
                  </div>
                </div>

                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Method</th>
                        <th class="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments
                        .map(
                          (payment) => `
                            <tr>
                              <td>${safe(formatDate(payment.paymentDate || payment.createdAt))}</td>
                              <td>${safe(payment.reference || payment.paymentNumber || '—')}</td>
                              <td>${safe(payment.method || 'Cash')}</td>
                              <td class="text-right">${formatCurrency(payment.amount)}</td>
                            </tr>
                          `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `
            : ''
        }
      </div>
    `;

    openModal({
      title: 'Collect Payment',
      content,
      size: 'medium'
    });

    const form = document.querySelector('#billing-payment-form');

    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (state.isSaving) return;

      state.isSaving = true;

      try {
        const formData = new FormData(form);

        const result = await recordPayment({
          invoiceId: formData.get('invoiceId'),
          amount: number(formData.get('amount')),
          method: formData.get('method'),
          paymentDate: formData.get('paymentDate'),
          reference: formData.get('reference'),
          notes: formData.get('notes')
        });

        closeModal();

        toast(
          `${formatCurrency(result.payment.amount)} payment recorded successfully.`
        );

        render();
      } catch (error) {
        console.error('[AURA Billing] Payment failed:', error);
        toast(error.message || 'Unable to record payment.', 'error');
      } finally {
        state.isSaving = false;
      }
    });

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  /* ------------------------------------------------------------
     Invoice Details
  ------------------------------------------------------------ */

  async function openInvoiceDetails(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);

    if (!invoice) {
      toast('Invoice not found.', 'error');
      return;
    }

    state.selectedInvoice = invoice;

    const patient = getInvoicePatient(invoice);
    const payments = await getInvoicePayments(invoice.id);
    const status = getInvoiceStatus(invoice);

    const content = `
      <div class="invoice-detail">
        <div class="invoice-detail__header">
          <div>
            <span class="eyebrow">AURA CLINIC BILLING</span>
            <h3>${safe(invoice.invoiceNumber)}</h3>
            <p>Created ${safe(formatDateTime(invoice.createdAt))}</p>
          </div>

          <span class="status-badge ${safe(getStatusClass(status))}">
            ${safe(getStatusLabel(status))}
          </span>
        </div>

        <div class="invoice-detail__patient">
          <div class="patient-avatar">
            ${safe(
              UTILS?.initials
                ? UTILS.initials(getPatientName(patient))
                : getPatientName(patient).slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <strong>${safe(getPatientName(patient))}</strong>
            <span>${safe(patient.uhid || invoice.uhid || 'No UHID')}</span>
            <span>${safe(patient.phone || invoice.phone || 'No phone')}</span>
          </div>
        </div>

        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Category</th>
                <th class="text-center">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${(invoice.items || [])
                .map(
                  (item) => `
                    <tr>
                      <td>
                        <strong>${safe(item.name)}</strong>
                        ${
                          item.code
                            ? `<small class="table-subtext">${safe(item.code)}</small>`
                            : ''
                        }
                      </td>
                      <td>${safe(item.category || 'Miscellaneous')}</td>
                      <td class="text-center">${number(item.quantity)}</td>
                      <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                      <td class="text-right">${formatCurrency(
                        calculateLineTotal(item)
                      )}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>

        <div class="invoice-summary-card">
          <div class="invoice-summary-card__row">
            <span>Subtotal</span>
            <strong>${formatCurrency(invoice.subtotal)}</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Discount</span>
            <strong>${formatCurrency(
              number(invoice.itemDiscount) + number(invoice.discount)
            )}</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Tax</span>
            <strong>${formatCurrency(
              number(invoice.itemTax) + number(invoice.tax)
            )}</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Round-off</span>
            <strong>${formatCurrency(invoice.roundOff)}</strong>
          </div>
          <div class="invoice-summary-card__row invoice-summary-card__row--total">
            <span>Total</span>
            <strong>${formatCurrency(invoice.total)}</strong>
          </div>
          <div class="invoice-summary-card__row">
            <span>Paid</span>
            <strong>${formatCurrency(invoice.paidAmount)}</strong>
          </div>
          <div class="invoice-summary-card__row invoice-summary-card__row--balance">
            <span>Balance Due</span>
            <strong>${formatCurrency(invoice.balance)}</strong>
          </div>
        </div>

        ${
          payments.length
            ? `
              <div class="form-section">
                <div class="form-section__header">
                  <div>
                    <h4>Payment History</h4>
                    <p>Recorded transactions for this invoice.</p>
                  </div>
                </div>

                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Payment</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th class="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments
                        .map(
                          (payment) => `
                            <tr>
                              <td>${safe(payment.paymentNumber || '—')}</td>
                              <td>${safe(formatDate(payment.paymentDate || payment.createdAt))}</td>
                              <td>${safe(payment.method || 'Cash')}</td>
                              <td class="text-right">${formatCurrency(payment.amount)}</td>
                            </tr>
                          `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `
            : ''
        }

        ${
          invoice.notes
            ? `
              <div class="notice notice-info">
                <i data-lucide="info"></i>
                <span>${safe(invoice.notes)}</span>
              </div>
            `
            : ''
        }

        <div class="form-actions">
          ${
            status !== STATUS.PAID &&
            status !== STATUS.CANCELLED &&
            status !== STATUS.REFUNDED
              ? `
                <button type="button" class="btn btn-primary" data-collect-payment="${safe(invoice.id)}">
                  <i data-lucide="wallet"></i>
                  Collect Payment
                </button>
              `
              : ''
          }

          <button type="button" class="btn btn-secondary" data-print-invoice="${safe(invoice.id)}">
            <i data-lucide="printer"></i>
            Print Invoice
          </button>

          <button type="button" class="btn btn-ghost" data-modal-close>
            Close
          </button>
        </div>
      </div>
    `;

    openModal({
      title: `Invoice ${invoice.invoiceNumber}`,
      content,
      size: 'large'
    });

    const paymentButton = document.querySelector(
      `[data-collect-payment="${invoice.id}"]`
    );

    if (paymentButton) {
      paymentButton.addEventListener('click', () => {
        closeModal();
        openPaymentModal(invoice.id);
      });
    }

    const printButton = document.querySelector(
      `[data-print-invoice="${invoice.id}"]`
    );

    if (printButton) {
      printButton.addEventListener('click', () => {
        printInvoice(invoice.id);
      });
    }

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function printInvoice(invoiceId) {
    const invoice = state.invoices.find((item) => item.id === invoiceId);

    if (!invoice) return;

    const patient = getInvoicePatient(invoice);
    const status = getInvoiceStatus(invoice);

    const printWindow = window.open('', '_blank', 'width=900,height=700');

    if (!printWindow) {
      toast('Please allow pop-ups to print the invoice.', 'error');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${safe(invoice.invoiceNumber)}</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, sans-serif;
            color: #172033;
            margin: 0;
            padding: 32px;
            background: #fff;
          }

          .invoice {
            max-width: 800px;
            margin: auto;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #172033;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }

          h1 {
            margin: 0 0 6px;
            font-size: 26px;
          }

          h2 {
            margin: 0;
            font-size: 18px;
          }

          p {
            margin: 4px 0;
            color: #64748b;
          }

          .invoice-meta {
            text-align: right;
          }

          .patient {
            margin-bottom: 24px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }

          th,
          td {
            border-bottom: 1px solid #dbe2ea;
            padding: 10px 8px;
            text-align: left;
            font-size: 13px;
          }

          th {
            background: #f3f6f9;
            font-weight: 700;
          }

          .right {
            text-align: right;
          }

          .summary {
            width: 320px;
            margin-left: auto;
            margin-top: 20px;
          }

          .summary div {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
          }

          .total {
            border-top: 2px solid #172033;
            font-size: 17px;
            font-weight: 700;
            padding-top: 12px !important;
          }

          .status {
            display: inline-block;
            margin-top: 8px;
            padding: 5px 10px;
            border-radius: 4px;
            background: #eef2f7;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
          }

          .footer {
            margin-top: 60px;
            padding-top: 16px;
            border-top: 1px solid #dbe2ea;
            font-size: 11px;
            color: #64748b;
            text-align: center;
          }

          @media print {
            body {
              padding: 0;
            }

            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <main class="invoice">
          <header class="header">
            <div>
              <h1>AURA CLINIC</h1>
              <p>Outpatient Clinic Management System</p>
              <p>Patient Billing Invoice</p>
            </div>

            <div class="invoice-meta">
              <h2>${safe(invoice.invoiceNumber)}</h2>
              <p>Date: ${safe(formatDate(invoice.invoiceDate || invoice.createdAt))}</p>
              <span class="status">${safe(getStatusLabel(status))}</span>
            </div>
          </header>

          <section class="patient">
            <h2>Patient Details</h2>
            <p><strong>Name:</strong> ${safe(getPatientName(patient))}</p>
            <p><strong>UHID:</strong> ${safe(patient.uhid || invoice.uhid || '—')}</p>
            <p><strong>Phone:</strong> ${safe(patient.phone || invoice.phone || '—')}</p>
          </section>

          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Category</th>
                <th class="right">Qty</th>
                <th class="right">Unit Price</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(invoice.items || [])
                .map(
                  (item) => `
                    <tr>
                      <td>${safe(item.name)}</td>
                      <td>${safe(item.category || 'Miscellaneous')}</td>
                      <td class="right">${number(item.quantity)}</td>
                      <td class="right">${formatCurrency(item.unitPrice)}</td>
                      <td class="right">${formatCurrency(calculateLineTotal(item))}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>

          <section class="summary">
            <div>
              <span>Subtotal</span>
              <strong>${formatCurrency(invoice.subtotal)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>${formatCurrency(
                number(invoice.itemDiscount) + number(invoice.discount)
              )}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>${formatCurrency(
                number(invoice.itemTax) + number(invoice.tax)
              )}</strong>
            </div>
            <div>
              <span>Round-off</span>
              <strong>${formatCurrency(invoice.roundOff)}</strong>
            </div>
            <div class="total">
              <span>Total</span>
              <strong>${formatCurrency(invoice.total)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>${formatCurrency(invoice.paidAmount)}</strong>
            </div>
            <div>
              <span>Balance Due</span>
              <strong>${formatCurrency(invoice.balance)}</strong>
            </div>
          </section>

          ${
            invoice.notes
              ? `<p style="margin-top:30px;"><strong>Notes:</strong> ${safe(invoice.notes)}</p>`
              : ''
          }

          <footer class="footer">
            Thank you for choosing AURA Clinic.
            This is a computer-generated invoice.
          </footer>
        </main>

        <script>
          window.onload = function () {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  /* ------------------------------------------------------------
     Dashboard Rendering
  ------------------------------------------------------------ */

  function render() {
    const container =
      document.querySelector('[data-route-view="billing"]') ||
      document.querySelector('#app-content') ||
      document.querySelector('#app');

    if (!container) return;

    applyFilters();

    const stats = getStats();

    container.innerHTML = `
      <section class="page-shell billing-page">
        <div class="page-header">
          <div>
            <span class="eyebrow">FINANCIAL OPERATIONS</span>
            <h1>Billing & Cashier</h1>
            <p>Manage invoices, payments, outstanding balances, and revenue collection.</p>
          </div>

          <div class="page-actions">
            <button type="button" class="btn btn-secondary" data-refresh-billing>
              <i data-lucide="refresh-cw"></i>
              Refresh
            </button>
            <button type="button" class="btn btn-primary" data-create-invoice>
              <i data-lucide="plus"></i>
              New Invoice
            </button>
          </div>
        </div>

        <div class="kpi-grid billing-kpi-grid">
          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="receipt"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Today's Invoices</span>
              <strong class="kpi-card__value">${stats.todayInvoices}</strong>
              <span class="kpi-card__meta">${stats.paidCount} fully paid</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="wallet"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Today's Collection</span>
              <strong class="kpi-card__value">${formatCurrency(stats.todayRevenue)}</strong>
              <span class="kpi-card__meta">Payments received today</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="file-text"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Today's Billing</span>
              <strong class="kpi-card__value">${formatCurrency(stats.totalBilled)}</strong>
              <span class="kpi-card__meta">Total invoice value</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-card__icon">
              <i data-lucide="alert-circle"></i>
            </div>
            <div class="kpi-card__content">
              <span class="kpi-card__label">Outstanding</span>
              <strong class="kpi-card__value">${formatCurrency(stats.pending)}</strong>
              <span class="kpi-card__meta">${stats.outstandingCount} unpaid invoices</span>
            </div>
          </article>
        </div>

        <section class="workspace-card">
          <div class="workspace-card__header">
            <div>
              <span class="eyebrow">INVOICE REGISTRY</span>
              <h2>Invoices & Payments</h2>
            </div>
            <div class="workspace-card__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-export-billing>
                <i data-lucide="download"></i>
                Export
              </button>
            </div>
          </div>

          <div class="toolbar billing-toolbar">
            <div class="search-field">
              <i data-lucide="search"></i>
              <input
                type="search"
                placeholder="Search invoice, patient, or UHID..."
                value="${safe(state.searchTerm)}"
                data-billing-search
              >
            </div>

            <label class="field field--inline">
              <span class="sr-only">Date range</span>
              <select data-billing-date-filter>
                <option value="today" ${
                  state.dateFilter === 'today' ? 'selected' : ''
                }>Today</option>
                <option value="month" ${
                  state.dateFilter === 'month' ? 'selected' : ''
                }>This Month</option>
                <option value="all" ${
                  state.dateFilter === 'all' ? 'selected' : ''
                }>All Dates</option>
              </select>
            </label>

            <label class="field field--inline">
              <span class="sr-only">Invoice status</span>
              <select data-billing-status-filter>
                <option value="all" ${
                  state.statusFilter === 'all' ? 'selected' : ''
                }>All Statuses</option>
                <option value="pending" ${
                  state.statusFilter === 'pending' ? 'selected' : ''
                }>Pending</option>
                <option value="partial" ${
                  state.statusFilter === 'partial' ? 'selected' : ''
                }>Partially Paid</option>
                <option value="paid" ${
                  state.statusFilter === 'paid' ? 'selected' : ''
                }>Paid</option>
                <option value="cancelled" ${
                  state.statusFilter === 'cancelled' ? 'selected' : ''
                }>Cancelled</option>
              </select>
            </label>
          </div>

          ${
            state.filteredInvoices.length
              ? renderInvoiceTable()
              : renderEmptyState()
          }
        </section>
      </section>
    `;

    bindBillingEvents();

    try {
      window.lucide?.createIcons?.();
    } catch (_) {}
  }

  function renderInvoiceTable() {
    return `
      <div class="table-scroll">
        <table class="data-table billing-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Patient</th>
              <th>Date</th>
              <th>Items</th>
              <th class="text-right">Total</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Balance</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.filteredInvoices
              .map((invoice) => {
                const patient = getInvoicePatient(invoice);
                const status = getInvoiceStatus(invoice);

                return `
                  <tr data-invoice-row="${safe(invoice.id)}">
                    <td>
                      <button type="button" class="table-link" data-view-invoice="${safe(invoice.id)}">
                        ${safe(invoice.invoiceNumber)}
                      </button>
                      <small class="table-subtext">${safe(invoice.uhid || 'No UHID')}</small>
                    </td>

                    <td>
                      <strong>${safe(getPatientName(patient))}</strong>
                      <small class="table-subtext">${safe(patient.phone || invoice.phone || '')}</small>
                    </td>

                    <td>${safe(formatDate(invoice.invoiceDate || invoice.createdAt))}</td>

                    <td>
                      <span class="table-count">
                        ${(invoice.items || []).length} item${(invoice.items || []).length === 1 ? '' : 's'}
                      </span>
                    </td>

                    <td class="text-right">${formatCurrency(invoice.total)}</td>

                    <td class="text-right">${formatCurrency(invoice.paidAmount)}</td>

                    <td class="text-right">
                      <strong>${formatCurrency(invoice.balance)}</strong>
                    </td>

                    <td>
                      <span class="status-badge ${safe(getStatusClass(status))}">
                        ${safe(getStatusLabel(status))}
                      </span>
                    </td>

                    <td class="text-right">
                      <div class="table-actions">
                        <button type="button" class="icon-button" data-view-invoice="${safe(invoice.id)}" title="View invoice">
                          <i data-lucide="eye"></i>
                        </button>

                        ${
                          status !== STATUS.PAID &&
                          status !== STATUS.CANCELLED &&
                          status !== STATUS.REFUNDED
                            ? `
                              <button type="button" class="icon-button" data-pay-invoice="${safe(invoice.id)}" title="Collect payment">
                                <i data-lucide="wallet"></i>
                              </button>
                            `
                            : ''
                        }

                        <button type="button" class="icon-button" data-print-invoice="${safe(invoice.id)}" title="Print invoice">
                          <i data-lucide="printer"></i>
                        </button>

                        ${
                          status === STATUS.PENDING || status === STATUS.DRAFT
                            ? `
                              <button type="button" class="icon-button icon-button--danger" data-cancel-invoice="${safe(invoice.id)}" title="Cancel invoice">
                                <i data-lucide="x-circle"></i>
                              </button>
                            `
                            : ''
                        }
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">
          <i data-lucide="receipt"></i>
        </div>
        <h3>No invoices found</h3>
        <p>
          ${
            state.searchTerm || state.statusFilter !== 'all'
              ? 'Try changing your search or filter criteria.'
              : 'Create your first patient invoice to begin billing.'
          }
        </p>
        <button type="button" class="btn btn-primary" data-create-invoice>
          <i data-lucide="plus"></i>
          Create Invoice
        </button>
      </div>
    `;
  }

  function bindBillingEvents() {
    document.querySelectorAll('[data-create-invoice]').forEach((button) => {
      button.addEventListener('click', () => openNewInvoiceModal());
    });

    document
      .querySelector('[data-refresh-billing]')
      ?.addEventListener('click', async () => {
        await loadData();
        render();
        toast('Billing records refreshed.');
      });

    document
      .querySelector('[data-billing-search]')
      ?.addEventListener('input', (event) => {
        state.searchTerm = event.target.value;
        applyFilters();
        render();
      });

    document
      .querySelector('[data-billing-date-filter]')
      ?.addEventListener('change', (event) => {
        state.dateFilter = event.target.value;
        applyFilters();
        render();
      });

    document
      .querySelector('[data-billing-status-filter]')
      ?.addEventListener('change', (event) => {
        state.statusFilter = event.target.value;
        applyFilters();
        render();
      });

    document.querySelectorAll('[data-view-invoice]').forEach((button) => {
      button.addEventListener('click', () => {
        openInvoiceDetails(button.dataset.viewInvoice);
      });
    });

    document.querySelectorAll('[data-pay-invoice]').forEach((button) => {
      button.addEventListener('click', () => {
        openPaymentModal(button.dataset.payInvoice);
      });
    });

    document.querySelectorAll('[data-print-invoice]').forEach((button) => {
      button.addEventListener('click', () => {
        printInvoice(button.dataset.printInvoice);
      });
    });

    document.querySelectorAll('[data-cancel-invoice]').forEach((button) => {
      button.addEventListener('click', async () => {
        const invoiceId = button.dataset.cancelInvoice;
        const invoice = state.invoices.find((item) => item.id === invoiceId);

        if (!invoice) return;

        const confirmed = window.confirm(
          `Cancel invoice ${invoice.invoiceNumber}?`
        );

        if (!confirmed) return;

        const reason = window.prompt(
          'Enter cancellation reason:',
          'Cancelled by cashier'
        );

        if (reason === null) return;

        try {
          await cancelInvoice(invoiceId, reason);
          render();
        } catch (error) {
          toast(error.message || 'Unable to cancel invoice.', 'error');
        }
      });
    });

    document
      .querySelector('[data-export-billing]')
      ?.addEventListener('click', exportBillingCSV);
  }

  /* ------------------------------------------------------------
     CSV Export
  ------------------------------------------------------------ */

  function exportBillingCSV() {
    const rows = [
      [
        'Invoice Number',
        'Invoice Date',
        'UHID',
        'Patient',
        'Total',
        'Paid',
        'Balance',
        'Status'
      ]
    ];

    state.filteredInvoices.forEach((invoice) => {
      rows.push([
        invoice.invoiceNumber || '',
        invoice.invoiceDate || '',
        invoice.uhid || '',
        invoice.patientName || '',
        invoice.total || 0,
        invoice.paidAmount || 0,
        invoice.balance || 0,
        getStatusLabel(getInvoiceStatus(invoice))
      ]);
    });

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `aura-billing-${todayISO()}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);

    audit('export', 'billing', null, {
      rows: state.filteredInvoices.length
    });

    toast('Billing CSV exported.');
  }

  /* ------------------------------------------------------------
     Event Listeners
  ------------------------------------------------------------ */

  function subscribeToEvents() {
    document.addEventListener('aura:patient-created', async () => {
      await loadData();
      render();
    });

    document.addEventListener('aura:patient-updated', async () => {
      await loadData();
      render();
    });

    document.addEventListener('aura:consultation-completed', async (event) => {
      const consultation = event.detail;

      if (!consultation?.patientId) return;

      await loadData();
      render();
    });

    document.addEventListener('aura:lab-result-verified', async () => {
      await loadData();
      render();
    });

    document.addEventListener('aura:storage-change', async () => {
      await loadData();
      render();
    });

    document.addEventListener('aura:route-change', (event) => {
      const route = event.detail?.route || event.detail?.name;

      if (route === 'billing') {
        loadData().then(render);
      }
    });
  }

  /* ------------------------------------------------------------
     Public API
  ------------------------------------------------------------ */

  async function refresh() {
    await loadData();
    render();
  }

  function getState() {
    return {
      ...state,
      invoices: [...state.invoices],
      payments: [...state.payments],
      patients: [...state.patients]
    };
  }

  function getInvoice(id) {
    return state.invoices.find((invoice) => invoice.id === id) || null;
  }

  function getPatientOutstanding(patientId) {
    return state.invoices
      .filter(
        (invoice) =>
          invoice.patientId === patientId &&
          getInvoiceStatus(invoice) !== STATUS.CANCELLED &&
          getInvoiceStatus(invoice) !== STATUS.REFUNDED
      )
      .reduce((sum, invoice) => sum + number(invoice.balance), 0);
  }

  async function initialize() {
    try {
      await loadData();
      subscribeToEvents();

      if (APP?.registerModule) {
        APP.registerModule(MODULE_NAME, {
          render,
          refresh,
          getState,
          getInvoice,
          createInvoice,
          updateInvoice,
          recordPayment,
          getPatientOutstanding
        });
      }

      if (window.AURA) {
        window.AURA.billing = api;
      }
    } catch (error) {
      console.error('[AURA Billing] Initialization failed:', error);
    }
  }

  const api = {
    initialize,
    render,
    refresh,
    getState,
    getInvoice,
    createInvoice,
    updateInvoice,
    recordPayment,
    cancelInvoice,
    getInvoicePayments,
    getPatientOutstanding,
    openNewInvoiceModal,
    openInvoiceDetails,
    openPaymentModal,
    printInvoice,
    exportBillingCSV
  };

  window.AURA_BILLING = api;

  window.AURA = window.AURA || {};
  window.AURA.billing = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();