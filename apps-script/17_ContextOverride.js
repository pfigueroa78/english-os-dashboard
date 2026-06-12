// English OS context override.
// Adds persistent Learning State and structured Book Content Index to getLearnerContext_.

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

  const learningStateResult = getLearningState_(ss, params);
  const learningState = learningStateResult.learningState || null;
  const currentClassIndex = learningStateResult.currentClassIndex || null;

  const bookContentResult = learningState
    ? getBookContentIndex_(ss, {
        unit: learningState.currentUnit,
        classNumber: learningState.currentClass,
        limit: params.bookContentLimit || 10
      })
    : { ok: true, items: [] };

  const learningStateGuidance = {
    mode: learningState ? learningState.classMode : '',
    currentUnit: learningState ? learningState.currentUnit : '',
    currentClass: learningState ? learningState.currentClass : '',
    currentClassStatus: learningState ? learningState.currentClassStatus : '',
    reviewUnit: learningState ? learningState.reviewUnit : '',
    reviewClass: learningState ? learningState.reviewClass : '',
    rules: [
      'The learner has a persistent current class.',
      'Do not advance the learner automatically.',
      'Advance only when the learner explicitly requests it or passes the required exercises.',
      'Review mode is temporary and must not change the persistent current class.',
      'Consultation mode is temporary and must not change the persistent current class.',
      'At session start, identify the current unit, current class, class status, and class mode.'
    ]
  };

  const nextRecommendedAction = {
    recommendation: getNextRecommendedAction_(ss, params),
    learningStateGuidance: learningStateGuidance,
    currentClassIndex: currentClassIndex,
    currentBookContentIndex: bookContentResult.items || []
  };

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
    learningState: learningState,
    currentClassIndex: currentClassIndex,
    bookContentIndex: bookContentResult.items || [],
    nextRecommendedAction: nextRecommendedAction,
    folders: ENGLISH_OS_FOLDERS
  };
}
