const LEARNING_STATE_SHEET_NAME = 'Learning State';

function getLearningState_(ss, params) {
  ensureLearningStateSheet_(ss);

  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || userEmail).trim();

  let state = findLearningState_(ss, userEmail, learnerId);

  if (!state) {
    const user = findUser_(ss, userEmail, learnerId);
    state = createDefaultLearningState_(ss, userEmail, learnerId, user);
  }

  const classIndex = getCourseClassIndex_(ss, {
    unit: state.currentUnit,
    classNumber: state.currentClass
  });

  return {
    ok: true,
    action: 'getLearningState',
    learningState: state,
    currentClassIndex: classIndex.items && classIndex.items.length ? classIndex.items[0] : null
  };
}

function ensureLearningStateSheet_(ss) {
  const headers = [
    'User Email',
    'Learner ID',
    'Current Unit',
    'Current Class',
    'Current Class Status',
    'Class Mode',
    'Review Unit',
    'Review Class',
    'Last Approved Unit',
    'Last Approved Class',
    'Last Approved At',
    'Updated At',
    'Source',
    'Notes',
    'Advance Requires Approval',
    'Exercise Approval Status'
  ];

  return getOrCreateSheet_(ss, LEARNING_STATE_SHEET_NAME, headers);
}

function findLearningState_(ss, userEmail, learnerId) {
  const rows = sheetRowsAsObjectsWithRow_(ss, LEARNING_STATE_SHEET_NAME);
  const email = normalizeEmail_(userEmail || '');
  const learner = String(learnerId || '').trim();

  const row = rows.find(item => {
    const rowEmail = normalizeEmail_(item['User Email'] || '');
    const rowLearnerId = String(item['Learner ID'] || '').trim();

    return (
      (email && rowEmail === email) ||
      (learner && rowLearnerId === learner)
    );
  });

  if (!row) return null;

  return normalizeLearningStateRow_(row);
}

function normalizeLearningStateRow_(row) {
  return {
    userEmail: normalizeEmail_(row['User Email'] || ''),
    learnerId: String(row['Learner ID'] || '').trim(),
    currentUnit: String(row['Current Unit'] || '').trim(),
    currentClass: String(row['Current Class'] || '').trim(),
    currentClassStatus: String(row['Current Class Status'] || 'not_started').trim(),
    classMode: String(row['Class Mode'] || 'viewing_current_class').trim(),
    reviewUnit: String(row['Review Unit'] || '').trim(),
    reviewClass: String(row['Review Class'] || '').trim(),
    lastApprovedUnit: String(row['Last Approved Unit'] || '').trim(),
    lastApprovedClass: String(row['Last Approved Class'] || '').trim(),
    lastApprovedAt: formatCellValue_(row['Last Approved At'] || ''),
    updatedAt: formatCellValue_(row['Updated At'] || ''),
    source: String(row['Source'] || '').trim(),
    notes: String(row['Notes'] || '').trim(),
    advanceRequiresApproval: String(row['Advance Requires Approval'] || 'TRUE').trim(),
    exerciseApprovalStatus: String(row['Exercise Approval Status'] || 'pending').trim(),
    rowNumber: row.__rowNumber || null
  };
}

function createDefaultLearningState_(ss, userEmail, learnerId, user) {
  const email = normalizeEmail_(userEmail || (user ? user['User Email'] : ''));
  const learner = String(learnerId || email).trim();
  const currentUnitText = user ? String(user['Current Unit'] || '') : '';
  const currentUnit = extractUnitNumberFromText_(currentUnitText) || '1';
  const currentClass = currentUnit === '4' ? '25' : String(((Number(currentUnit) - 1) * 7) + 1);

  const row = [
    email,
    learner,
    currentUnit,
    currentClass,
    'not_started',
    'viewing_current_class',
    '',
    '',
    '',
    '',
    '',
    today_(),
    'auto_default',
    'Default learning state created by English OS.',
    'TRUE',
    'pending'
  ];

  const sheet = ensureLearningStateSheet_(ss);
  sheet.appendRow(row);

  return findLearningState_(ss, email, learner);
}

function extractUnitNumberFromText_(value) {
  const match = String(value || '').match(/Unit\s*(\d{1,2})|Unidad\s*(\d{1,2})/i);
  return match ? String(match[1] || match[2] || '') : '';
}
