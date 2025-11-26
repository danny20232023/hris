export const normalizeStatusLabel = (status) => {
  if (status === undefined || status === null) return '';
  return String(status).trim().toUpperCase();
};

export const normalizeDateString = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parts = raw.split(/[ T]/);
  const datePart = parts[0] || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }

  const match = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return datePart;
};

const resolveTransactionEmployeeObjId = (transaction) => {
  const candidates = [
    transaction?.emp_objid,
    transaction?.empObjId,
    transaction?.employee_objid,
    transaction?.EMP_OBJID,
    transaction?.employeeObjId
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }

  return null;
};

const resolveTransactionUserId = (transaction) => {
  const candidates = [
    transaction?.userid,
    transaction?.user_id,
    transaction?.USERID,
    transaction?.userId
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }

  return null;
};

const resolveCdono = (transaction, entry) => {
  const candidates = [
    transaction?.cdono,
    transaction?.CDONO,
    transaction?.cdo_no,
    transaction?.reference,
    entry?.cdono,
    entry?.CDONO,
    entry?.reference_no
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }

  return '';
};

const resolveEmployeeName = (transaction) => {
  const candidates = [
    transaction?.employeeName,
    transaction?.employee_name,
    transaction?.EMPLOYEENAME,
    transaction?.name
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }

  return '';
};

const resolveDepartment = (transaction) => {
  const candidates = [
    transaction?.department,
    transaction?.DEPARTMENT,
    transaction?.office,
    transaction?.OFFICE
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }

  return '';
};

const resolvePosition = (transaction) => {
  const candidates = [
    transaction?.position,
    transaction?.POSITION,
    transaction?.jobtitle,
    transaction?.JOBTITLE
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const str = String(candidate).trim();
    if (str) return str;
  }

  return '';
};

const resolveNumberValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const buildNormalizedEntry = (transaction, entry) => {
  const cdono = resolveCdono(transaction, entry);
  const cdoTitle = transaction?.cdotitle || transaction?.CDOTITLE || transaction?.title || '';
  const cdoPurpose = transaction?.cdopurpose || transaction?.CDOPURPOSE || transaction?.purpose || '';
  const cdoDescription = transaction?.cdodescription || transaction?.CDODESCRIPTION || transaction?.description || '';
  const cdoRemarks = transaction?.cdoremarks || transaction?.CDOREMARKS || transaction?.remarks || '';

  const entryReason = entry?.reason || entry?.cdodateremarks || entry?.remarks || '';
  const entryStatus = normalizeStatusLabel(entry?.cdodatestatus || entry?.status);
  const entryId = entry?.id ?? entry?.ID ?? null;
  const entryCreditsUsed =
    resolveNumberValue(entry?.usedcredit) ??
    resolveNumberValue(entry?.cdoused) ??
    resolveNumberValue(entry?.used_credit);

  const transactionCreditsEarned =
    resolveNumberValue(transaction?.earnedcredit) ??
    resolveNumberValue(transaction?.earned_credit);

  const transactionCreditsUsed =
    resolveNumberValue(transaction?.usedcredit) ??
    resolveNumberValue(transaction?.used_credit);

  const displayRef = cdono || (entryId ? `CDO-${entryId}` : 'CDO');

  return {
    date: normalizeDateString(entry?.cdodate || entry?.CDODATE || entry?.date || entry?.workdate || entry?.useDate),
    displayRef,
    cdono,
    cdoTitle,
    cdoPurpose,
    cdoDescription,
    cdoRemarks,
    entryReason,
    entryStatus,
    entryId,
    transactionId: transaction?.id ?? transaction?.ID ?? null,
    creditsUsed: entryCreditsUsed,
    creditsEarned: transactionCreditsEarned,
    creditsUsedTotal: transactionCreditsUsed,
    employeeName: resolveEmployeeName(transaction),
    department: resolveDepartment(transaction),
    position: resolvePosition(transaction),
    approverName: entry?.approvedByName || entry?.approvedbyname || '',
    approverPosition: entry?.approvedByPosition || entry?.approvedbyposition || '',
    createdByName: entry?.createdByName || entry?.createdbyname || '',
    createdByPosition: entry?.createdByPosition || entry?.createdbyposition || '',
    rawEntry: entry,
    rawTransaction: transaction
  };
};

export const normalizeCdoUsageMap = (transactions, options = {}) => {
  const {
    startDate = null,
    endDate = null,
    employeeObjId = null,
    userId = null
  } = options;

  const normalized = {};
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return normalized;
  }

  const targetEmployeeObjId = employeeObjId !== undefined && employeeObjId !== null ? String(employeeObjId) : null;
  const targetUserId = userId !== undefined && userId !== null ? String(userId) : null;

  transactions.forEach((transaction) => {
    if (!transaction) return;

    const transactionEmployeeObjId = resolveTransactionEmployeeObjId(transaction);
    const transactionUserId = resolveTransactionUserId(transaction);

    if (targetEmployeeObjId) {
      if (!transactionEmployeeObjId || transactionEmployeeObjId !== targetEmployeeObjId) {
        return;
      }
    } else if (targetUserId) {
      if (!transactionUserId || transactionUserId !== targetUserId) {
        return;
      }
    }

    const consumeEntries = Array.isArray(transaction?.consumeEntries) ? transaction.consumeEntries : [];
    if (consumeEntries.length === 0) return;

    consumeEntries.forEach((entry) => {
      if (!entry) return;
      const status = normalizeStatusLabel(entry?.cdodatestatus || entry?.status);
      if (status !== 'APPROVED') return;

      const normalizedEntry = buildNormalizedEntry(transaction, entry);
      if (!normalizedEntry.date) return;

      if (startDate && normalizedEntry.date < startDate) return;
      if (endDate && normalizedEntry.date > endDate) return;

      if (!normalized[normalizedEntry.date]) {
        normalized[normalizedEntry.date] = [];
      }
      normalized[normalizedEntry.date].push(normalizedEntry);
    });
  });

  Object.keys(normalized).forEach((dateKey) => {
    normalized[dateKey].sort((a, b) => {
      const left = a.displayRef || '';
      const right = b.displayRef || '';
      return left.localeCompare(right);
    });
  });

  return normalized;
};

export const getCdoEntriesForDate = (usageMap, dateStr) => {
  if (!usageMap || !dateStr) return [];
  const entries = usageMap[dateStr];
  return Array.isArray(entries) ? entries : [];
};


