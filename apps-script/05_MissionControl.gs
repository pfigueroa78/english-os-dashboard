function ensureMissionControlSheet_(ss) {
  const sheet = getOrCreateSheet_(ss, 'Mission Control', SHEET_HEADERS.missionControl);
  sheet.setFrozenRows(1);
  return sheet;
}

function getMissionControl_(ss, params) {
  ensureMissionControlSheet_(ss);

  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();

  const rows = sheetRowsAsObjects_(ss, 'Mission Control');

  const row = rows.find(item => {
    const rowEmail = normalizeEmail_(item['User Email'] || '');

    return (
      (userEmail && rowEmail === userEmail) ||
      (learnerId && rowEmail === normalizeEmail_(learnerId))
    );
  }) || null;

  if (!row) {
    return {
      ok: true,
      found: false,
      message: 'No Mission Control record found for this learner.',
      userEmail: userEmail,
      learnerId: learnerId
    };
  }

  return {
    ok: true,
    found: true,
    missionControl: {
      userEmail: row['User Email'] || '',
      name: row['Name'] || '',
      currentUnit: row['Current Unit'] || '',
      currentLesson: row['Current Lesson'] || '',
      currentCEFR: row['Current CEFR'] || '',
      lastActivity: row['Last Activity'] || '',
      active: row['Active'] || '',
      lastGPTUsed: row['Last GPT Used'] || '',
      lastSessionSummary: row['Last Session Summary'] || '',
      topRecurringMistake: row['Top Recurring Mistake'] || '',
      activeVocabularyCount: row['Active Vocabulary Count'] || '',
      lastEvaluationCEFR: row['Last Evaluation CEFR'] || '',
      currentFocus: row['Current Focus'] || '',
      nextRecommendedAction: row['Next Recommended Action'] || '',
      status: row['Status'] || ''
    }
  };
}

function refreshMissionControl_(ss, userEmail, learnerId) {
  ensureMissionControlSheet_(ss);

  const email = normalizeEmail_(userEmail || '');
  const learner = String(learnerId || '').trim();

  if (!email && !learner) {
    return {
      ok: false,
      error: 'Missing userEmail or learnerId'
    };
  }

  const user = findUser_(ss, email, learner);

  if (!user) {
    return {
      ok: true,
      updated: false,
      message: 'User not found.'
    };
  }

  const rowData = buildMissionControlRow_(ss, user);
  const sheet = ss.getSheetByName('Mission Control');
  const values = sheet.getDataRange().getValues();
  const header = values[0] || [];
  const emailIdx = header.indexOf('User Email');

  let targetRow = -1;

  for (let i = 1; i < values.length; i++) {
    const rowEmail = normalizeEmail_(values[i][emailIdx] || '');

    if (rowEmail === normalizeEmail_(rowData[0])) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
    targetRow = sheet.getLastRow();
  }

  return {
    ok: true,
    updated: true,
    rowNumber: targetRow,
    userEmail: rowData[0]
  };
}

function buildMissionControlRow_(ss, user) {
  const userEmail = normalizeEmail_(user['User Email'] || '');
  const learnerId = String(user['Learner ID'] || userEmail).trim();

  const latestLog = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, 1)[0] || null;
  const latestMistake = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, 1)[0] || null;
  const allVocabulary = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, 500);

  const latestEvaluationProgress = findRowsByLearner_(ss, 'Weekly Progress', userEmail, learnerId, 50)
    .find(item => String(item['Source Agent'] || '') === 'English Evaluation Request') || null;

  const lastGPTUsed = latestLog ? (latestLog['Source Agent'] || '') : '';
  const lastSummary = latestLog ? (latestLog['Summary'] || '') : '';
  const topMistake = latestMistake ? (latestMistake['Mistake'] || '') : '';
  const vocabCount = allVocabulary.length;
  const lastEvaluationCEFR = latestEvaluationProgress ? (latestEvaluationProgress['CEFR Estimate'] || '') : '';
  const currentFocus = latestLog ? (latestLog['Weakness'] || '') : '';
  const nextAction = latestLog ? (latestLog['Next Action'] || '') : '';

  return [
    user['User Email'] || '',
    user['Name'] || '',
    user['Current Unit'] || (latestLog ? latestLog['Unit'] || '' : ''),
    user['Current Lesson'] || (latestLog ? latestLog['Lesson'] || '' : ''),
    user['Current CEFR'] || lastEvaluationCEFR || '',
    user['Last Activity'] || (latestLog ? latestLog['Date'] || '' : ''),
    user['Active'] === false ? false : true,
    lastGPTUsed,
    lastSummary,
    topMistake,
    vocabCount,
    lastEvaluationCEFR,
    currentFocus,
    nextAction,
    user['Active'] === false ? 'Inactive' : 'Active'
  ];
}

function getNextRecommendedAction_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();

  const mission = getMissionControl_(ss, params);
  const user = findUser_(ss, userEmail, learnerId);

  const recentDailyLogs = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, 5);
  const recentMistakes = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, 10);
  const activeVocabulary = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, 20);
  const recentProgress = findRowsByLearner_(ss, 'Weekly Progress', userEmail, learnerId, 5);

  const latestLog = recentDailyLogs.length > 0 ? recentDailyLogs[0] : null;
  const latestMistake = recentMistakes.length > 0 ? recentMistakes[0] : null;
  const latestProgress = recentProgress.length > 0 ? recentProgress[0] : null;

  const currentUnit =
    mission.found && mission.missionControl.currentUnit
      ? mission.missionControl.currentUnit
      : user
        ? user['Current Unit'] || ''
        : '';

  const currentLesson =
    mission.found && mission.missionControl.currentLesson
      ? mission.missionControl.currentLesson
      : user
        ? user['Current Lesson'] || ''
        : '';

  const currentCEFR =
    mission.found && mission.missionControl.currentCEFR
      ? mission.missionControl.currentCEFR
      : latestProgress
        ? latestProgress['CEFR Estimate'] || ''
        : user
          ? user['Current CEFR'] || ''
          : '';

  const topMistake =
    mission.found && mission.missionControl.topRecurringMistake
      ? mission.missionControl.topRecurringMistake
      : latestMistake
        ? latestMistake['Mistake'] || ''
        : '';

  const currentFocus =
    mission.found && mission.missionControl.currentFocus
      ? mission.missionControl.currentFocus
      : latestLog
        ? latestLog['Weakness'] || ''
        : '';

  const previousNextAction =
    mission.found && mission.missionControl.nextRecommendedAction
      ? mission.missionControl.nextRecommendedAction
      : latestLog
        ? latestLog['Next Action'] || ''
        : '';

  const vocabularyToRecycle = activeVocabulary
    .slice(0, 8)
    .map(item => item['Word/Chunk'] || '')
    .filter(value => value !== '');

  const recommendation = buildRecommendation_({
    currentUnit: currentUnit,
    currentLesson: currentLesson,
    currentCEFR: currentCEFR,
    topMistake: topMistake,
    currentFocus: currentFocus,
    previousNextAction: previousNextAction,
    vocabularyToRecycle: vocabularyToRecycle,
    latestLog: latestLog,
    latestMistake: latestMistake,
    latestProgress: latestProgress
  });

  return {
    ok: true,
    userEmail: userEmail,
    learnerId: learnerId,
    currentUnit: currentUnit,
    currentLesson: currentLesson,
    currentCEFR: currentCEFR,
    lastGPTUsed: mission.found ? mission.missionControl.lastGPTUsed : '',
    lastSessionSummary: mission.found ? mission.missionControl.lastSessionSummary : '',
    topRecurringMistake: topMistake,
    currentFocus: currentFocus,
    previousNextAction: previousNextAction,
    vocabularyToRecycle: vocabularyToRecycle,
    recommendation: recommendation,
    evidence: {
      latestDailyLog: latestLog,
      latestMistake: latestMistake,
      latestProgress: latestProgress
    }
  };
}

function buildRecommendation_(context) {
  const unit = context.currentUnit || '';
  const lesson = context.currentLesson || '';
  const mistake = context.topMistake || '';
  const focus = context.currentFocus || '';
  const nextAction = context.previousNextAction || '';
  const vocab = context.vocabularyToRecycle || [];

  let recommendedActivity = '';
  let recommendedSkill = '';
  let recommendedPrompt = '';
  let priority = 'Medium';

  if (mistake) {
    recommendedSkill = 'Accuracy reinforcement';
    recommendedActivity = 'Targeted correction + controlled speaking practice';
    recommendedPrompt =
      'Start with a quick correction drill for: "' + mistake +
      '". Then ask the learner to produce 3 original sentences using the corrected pattern.';
    priority = 'High';
  } else if (focus) {
    recommendedSkill = 'Focused practice';
    recommendedActivity = 'Practice based on current focus';
    recommendedPrompt =
      'Continue practicing the current focus: "' + focus +
      '". Ask 3 short questions and correct only high-impact mistakes.';
    priority = 'Medium';
  } else if (nextAction) {
    recommendedSkill = 'Continuation';
    recommendedActivity = 'Continue previous next action';
    recommendedPrompt =
      'Continue with the previous next action: "' + nextAction + '".';
    priority = 'Medium';
  } else {
    recommendedSkill = 'Course progression';
    recommendedActivity = 'Continue course sequence';
    recommendedPrompt =
      'No strong weakness was found. Continue from the current unit and lesson, or start from the first available class if no lesson exists.';
    priority = 'Low';
  }

  if (vocab.length > 0) {
    recommendedPrompt +=
      ' Recycle these vocabulary/chunks naturally: ' + vocab.join(', ') + '.';
  }

  return {
    priority: priority,
    recommendedSkill: recommendedSkill,
    recommendedActivity: recommendedActivity,
    recommendedPrompt: recommendedPrompt,
    unit: unit,
    lesson: lesson
  };
}
