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
    'Exercise Approval Status',
    'Approval Evidence',
    'Approval Rubric',
    'Approval Score',
    'Approval Gate Completed',
    'Approval Evaluator Version',
    'Approval Policy ID',
    'Approval Source Request ID'
  ];

  return getOrCreateSheet_(ss, LEARNING_STATE_SHEET_NAME, headers);
}

function findLearningState_(ss, userEmail, learnerId) {
  ensureLearningStateSheet_(ss);
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
  const firstClassIndex = getCourseClassIndex_(ss, { unit: currentUnit });
  const currentClass = String((firstClassIndex.items && firstClassIndex.items[0] && firstClassIndex.items[0].classNumber) || '1');

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
    'pending',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ];

  const sheet = ensureLearningStateSheet_(ss);
  sheet.appendRow(row);

  return findLearningState_(ss, email, learner);
}

function extractUnitNumberFromText_(value) {
  const match = String(value || '').match(/Unit\s*(\d{1,2})|Unidad\s*(\d{1,2})/i);
  return match ? String(match[1] || match[2] || '') : '';
}

function updateLearningState_(ss, userEmail, learnerId, patch) {
  const sheet = ensureLearningStateSheet_(ss);
  let state = findLearningState_(ss, userEmail, learnerId);

  if (!state) {
    const user = findUser_(ss, userEmail, learnerId);
    state = createDefaultLearningState_(ss, userEmail, learnerId, user);
  }

  const rowNumber = state.rowNumber;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const currentObject = {};

  headers.forEach((header, index) => {
    currentObject[header] = currentValues[index];
  });

  Object.keys(patch || {}).forEach(key => {
    currentObject[key] = patch[key];
  });

  currentObject['Updated At'] = today_();

  const nextRow = headers.map(header => currentObject[header] === undefined ? '' : currentObject[header]);
  sheet.getRange(rowNumber, 1, 1, nextRow.length).setValues([nextRow]);

  return findLearningState_(ss, userEmail, learnerId);
}

function approveCurrentClassExercises_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || userEmail).trim();
  const state = getLearningState_(ss, params).learningState;
  const validation = validateApprovalEvidence_(params);

  if (!validation.ok) {
    return {
      ok: false,
      action: 'approveCurrentClassExercises',
      error: validation.error,
      learningState: state,
      canAdvance: false
    };
  }

  const updated = updateLearningState_(ss, userEmail, learnerId, {
    'Current Class Status': 'approved',
    'Exercise Approval Status': 'approved',
    'Last Approved Unit': state.currentUnit,
    'Last Approved Class': state.currentClass,
    'Last Approved At': today_(),
    'Source': 'exercise_approval',
    'Notes': params.notes || 'Current class exercises approved with evaluated evidence.',
    'Approval Evidence': validation.approvalEvidence,
    'Approval Rubric': validation.rubric,
    'Approval Score': validation.score,
    'Approval Gate Completed': 'TRUE',
    'Approval Evaluator Version': validation.evaluatorVersion,
    'Approval Policy ID': validation.policyId,
    'Approval Source Request ID': validation.requestId
  });

  return {
    ok: true,
    action: 'approveCurrentClassExercises',
    learningState: updated,
    canAdvance: true
  };
}

function validateApprovalEvidence_(params) {
  const evidence = String(params.approvalEvidence || '').trim();
  const rubric = String(params.rubric || '').trim();
  const score = Number(params.approvalScore || params.score || 0);
  const gateRaw = params.evaluationGateCompleted || params.approvalGateCompleted || '';
  const gateCompleted = String(gateRaw).toLowerCase() === 'true';
  const evaluatorVersion = String(params.evaluatorVersion || '').trim();
  const requestId = String(params.requestId || params.approvalSourceRequestId || '').trim();
  const classId = String(params.classId || '').trim();
  const policyId = String(params.policyId || '').trim();
  const canApproveClass = String(params.canApproveClass || '').toLowerCase() === 'true';
  const blockingErrors = String(params.blockingErrors || '').trim();

  if (!classId || !/^unit-\d{2}-class-\d{2}$/i.test(classId)) {
    return { ok: false, error: 'Approval rejected: explicit classId is required.' };
  }
  if (!policyId) {
    return { ok: false, error: 'Approval rejected: policyId is required.' };
  }
  if (!requestId) {
    return { ok: false, error: 'Approval rejected: requestId is required.' };
  }
  if (!canApproveClass) {
    return { ok: false, error: 'Approval rejected: canApproveClass must be true.' };
  }
  if (!gateRaw) {
    return { ok: false, error: 'Approval rejected: evaluationGateCompleted must be explicit.' };
  }
  if (blockingErrors && blockingErrors !== '[]') {
    return { ok: false, error: 'Approval rejected: blockingErrors must be empty.' };
  }

  if (!evidence || evidence === '[]') {
    return { ok: false, error: 'Approval rejected: approvalEvidence is required.' };
  }
  if (!rubric) {
    return { ok: false, error: 'Approval rejected: rubric is required.' };
  }
  if (!Number.isFinite(score) || score < 8) {
    return { ok: false, error: 'Approval rejected: approvalScore must be at least 8.' };
  }
  if (!gateCompleted) {
    return { ok: false, error: 'Approval rejected: evaluation gate must be completed.' };
  }
  if (!evaluatorVersion) {
    return { ok: false, error: 'Approval rejected: evaluatorVersion is required.' };
  }

  return {
    ok: true,
    approvalEvidence: evidence,
    rubric: rubric,
    score: String(score),
    evaluatorVersion: evaluatorVersion,
    policyId: policyId,
    requestId: requestId
  };
}

function advanceToNextClass_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || userEmail).trim();
  const state = getLearningState_(ss, params).learningState;
  const force = String(params.force || '').toLowerCase() === 'true';

  const requiresApproval = String(state.advanceRequiresApproval || 'TRUE').toLowerCase() !== 'false';
  const approved = state.currentClassStatus === 'approved' || state.exerciseApprovalStatus === 'approved';

  if (requiresApproval && !approved && !force) {
    return {
      ok: false,
      action: 'advanceToNextClass',
      error: 'Current class is not approved. Approve exercises or pass force=true.',
      learningState: state,
      canAdvance: false
    };
  }

  const nextClassNumber = String(Number(state.currentClass || 0) + 1);
  const nextIndex = getCourseClassIndex_(ss, { classNumber: nextClassNumber });

  if (!nextIndex.items || !nextIndex.items.length) {
    return {
      ok: false,
      action: 'advanceToNextClass',
      error: 'Next class not found in Course Class Index.',
      learningState: state,
      attemptedNextClass: nextClassNumber
    };
  }

  const nextClass = nextIndex.items[0];
  const updated = updateLearningState_(ss, userEmail, learnerId, {
    'Current Unit': nextClass.unit,
    'Current Class': nextClass.classNumber,
    'Current Class Status': 'not_started',
    'Class Mode': 'viewing_current_class',
    'Review Unit': '',
    'Review Class': '',
    'Exercise Approval Status': 'pending',
    'Source': force ? 'forced_advance' : 'approved_advance',
    'Notes': 'Advanced to next class from English OS.'
  });

  return {
    ok: true,
    action: 'advanceToNextClass',
    previousLearningState: state,
    learningState: updated,
    nextClassIndex: nextClass
  };
}

function setReviewMode_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || userEmail).trim();

  const reviewUnit = String(params.reviewUnit || params.unit || '').trim();
  const reviewClass = String(params.reviewClass || params.classNumber || '').trim();

  const updated = updateLearningState_(ss, userEmail, learnerId, {
    'Class Mode': 'reviewing',
    'Review Unit': reviewUnit,
    'Review Class': reviewClass,
    'Source': 'review_mode',
    'Notes': params.notes || 'Temporary review mode enabled. Persistent current class unchanged.'
  });

  return {
    ok: true,
    action: 'setReviewMode',
    learningState: updated
  };
}

function clearReviewMode_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || userEmail).trim();

  const updated = updateLearningState_(ss, userEmail, learnerId, {
    'Class Mode': 'viewing_current_class',
    'Review Unit': '',
    'Review Class': '',
    'Source': 'clear_review_mode',
    'Notes': params.notes || 'Returned to persistent current class.'
  });

  return {
    ok: true,
    action: 'clearReviewMode',
    learningState: updated
  };
}
