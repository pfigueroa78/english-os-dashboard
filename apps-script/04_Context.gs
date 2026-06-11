function getLearnerContext_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();

  const user = findUser_(ss, userEmail, learnerId);
  const recentDailyLogs = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, Number(params.dailyLimit || 5));
  const recentMistakes = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, Number(params.mistakeLimit || 10));
  const activeVocabulary = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, Number(params.vocabularyLimit || 10));
  const recentProgress = findRowsByLearner_(ss, 'Weekly Progress', userEmail, learnerId, Number(params.progressLimit || 3));

  const latestDailyLog = recentDailyLogs.length > 0 ? recentDailyLogs[0] : null;

  const userCurrentUnit = user ? (user['Current Unit'] || '') : '';
  const userCurrentLesson = user ? (user['Current Lesson'] || '') : '';

  const logCurrentUnit = latestDailyLog ? (latestDailyLog['Unit'] || '') : '';
  const logCurrentLesson = latestDailyLog ? (latestDailyLog['Lesson'] || '') : '';

  const recommendedCurrentUnit = logCurrentUnit || userCurrentUnit;
  const recommendedCurrentLesson = logCurrentLesson || userCurrentLesson;

  const contextSource = latestDailyLog && (logCurrentUnit || logCurrentLesson)
    ? 'recentDailyLogs'
    : 'users';

  const missionControl = getMissionControl_(ss, params);
  const nextRecommendedAction = getNextRecommendedAction_(ss, params);

  return {
    ok: true,
    user: user,
    recentDailyLogs: recentDailyLogs,
    recentMistakes: recentMistakes,
    activeVocabulary: activeVocabulary,
    recentProgress: recentProgress,
    currentPosition: {
      unit: userCurrentUnit,
      lesson: userCurrentLesson,
      source: 'users'
    },
    recommendedCurrentPosition: {
      unit: recommendedCurrentUnit,
      lesson: recommendedCurrentLesson,
      source: contextSource
    },
    contextSyncNeeded: (
      (recommendedCurrentUnit && recommendedCurrentUnit !== userCurrentUnit) ||
      (recommendedCurrentLesson && recommendedCurrentLesson !== userCurrentLesson)
    ),
    missionControl: missionControl,
    nextRecommendedAction: nextRecommendedAction,
    folders: ENGLISH_OS_FOLDERS
  };
}

function getRecentMistakes_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();
  const limit = Number(params.limit || 10);

  return {
    ok: true,
    mistakes: findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, limit)
  };
}

function getVocabularyByStatus_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();
  const status = String(params.status || '').toLowerCase();
  const limit = Number(params.limit || 20);

  const rows = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, 500);

  const filtered = status
    ? rows.filter(row => String(row.Status || '').toLowerCase() === status)
    : rows;

  return {
    ok: true,
    vocabulary: filtered.slice(0, limit)
  };
}

function getCurrentMission_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();

  const user = findUser_(ss, userEmail, learnerId);
  const progress = findRowsByLearner_(ss, 'Weekly Progress', userEmail, learnerId, 1);
  const dailyLogs = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, 3);
  const mistakes = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, 5);

  return {
    ok: true,
    user: user,
    currentUnit: user ? user['Current Unit'] : '',
    currentLesson: user ? user['Current Lesson'] : '',
    currentCEFR: user ? user['Current CEFR'] : '',
    lastProgress: progress,
    lastDailyLogs: dailyLogs,
    priorityMistakes: mistakes,
    missionControlFolderId: ENGLISH_OS_FOLDERS.b2MissionControl
  };
}

function findRowsByLearner_(ss, sheetName, userEmail, learnerId, limit) {
  const rows = sheetRowsAsObjects_(ss, sheetName);

  const filtered = rows.filter(row => {
    const rowEmail = normalizeEmail_(row['User Email'] || '');
    const rowLearnerId = String(row['Learner ID'] || '').trim();

    return (
      (userEmail && rowEmail === userEmail) ||
      (learnerId && rowLearnerId === learnerId)
    );
  });

  return filtered.reverse().slice(0, limit || 10);
}

function listUsers_() {
  const ss = SpreadsheetApp.openById(getEnglishOSSheetId_());
  const sheet = ss.getSheetByName('Users');

  if (!sheet) {
    return {
      ok: false,
      error: 'Users sheet not found.'
    };
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      ok: true,
      users: []
    };
  }

  const headers = values[0];

  const users = values.slice(1)
    .filter(row => String(row[0] || '').trim())
    .map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] = row[index];
      });

      return {
        userEmail: obj['User Email'] || '',
        learnerId: obj['Learner ID'] || '',
        name: obj['Name'] || '',
        preferredChannel: obj['Preferred Channel'] || '',
        currentUnit: obj['Current Unit'] || '',
        currentLesson: obj['Current Lesson'] || '',
        currentCEFR: obj['Current CEFR'] || '',
        lastActivity: obj['Last Activity'] || '',
        active: obj['Active'] || '',
        role: obj['Role'] || 'learner',
        createdAt: obj['Created At'] || '',
        lastLogin: obj['Last Login'] || '',
        accessSource: obj['Access Source'] || ''
      };
    });

  return {
    ok: true,
    users
  };
}
