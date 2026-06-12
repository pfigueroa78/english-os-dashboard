// Router override to expose English OS learning-state and class-content actions.
// Keep this file after 01_Router.js so Apps Script resolves this doGet last.
function doGet(e) {
  try {
    const params = e.parameter || {};

    if (!params.token || params.token !== getSecretToken_()) {
      return jsonResponse_({ ok: false, error: 'Unauthorized' });
    }

    const ss = SpreadsheetApp.openById(getEnglishOSSheetId_());
    ensureMissionControlSheet_(ss);

    const action = params.action || 'getLearnerContext';

    if (action === 'getLearningState') return jsonResponse_(getLearningState_(ss, params));
    if (action === 'getBookContentIndex') return jsonResponse_(getBookContentIndex_(ss, params));
    if (action === 'populateBookContentIndex') return jsonResponse_(populateBookContentIndex_(ss, params));
    if (action === 'getCurrentClassContent') return jsonResponse_(getCurrentClassContent_(ss, params));
    if (action === 'getClassContent') return jsonResponse_(getClassContent_(ss, params));
    if (action === 'approveCurrentClassExercises') return jsonResponse_(approveCurrentClassExercises_(ss, params));
    if (action === 'advanceToNextClass') return jsonResponse_(advanceToNextClass_(ss, params));
    if (action === 'setReviewMode') return jsonResponse_(setReviewMode_(ss, params));
    if (action === 'clearReviewMode') return jsonResponse_(clearReviewMode_(ss, params));
    if (action === 'getCourseClassIndex') return jsonResponse_(getCourseClassIndex_(ss, params));

    if (action === 'listDriveUnitResources') {
      const unit = params.unit || '';
      return jsonResponse_({ ok: true, action: 'listDriveUnitResources', unit: unit, resources: listDriveUnitResources(unit) });
    }

    if (action === 'createGrammarWorkbook') return jsonResponse_(createGrammarWorkbook(ss, params));
    if (action === 'createVocabularyWorkbook') return jsonResponse_(createVocabularyWorkbook(ss, params));
    if (action === 'deleteUser') return jsonResponse_(deleteUser_(ss, params));
    if (action === 'getLearnerContext') return jsonResponse_(getLearnerContext_(ss, params));
    if (action === 'getRecentMistakes') return jsonResponse_(getRecentMistakes_(ss, params));
    if (action === 'getVocabularyByStatus') return jsonResponse_(getVocabularyByStatus_(ss, params));
    if (action === 'getCurrentMission') return jsonResponse_(getCurrentMission_(ss, params));
    if (action === 'getMissionControl') return jsonResponse_(getMissionControl_(ss, params));
    if (action === 'getNextRecommendedAction') return jsonResponse_(getNextRecommendedAction_(ss, params));
    if (action === 'refreshMissionControl') return jsonResponse_(refreshMissionControl_(ss, params.userEmail || '', params.learnerId || ''));
    if (action === 'createDocument') return jsonResponse_(createDocumentFromParams_(ss, params));
    if (action === 'processDocumentQueue') return jsonResponse_(processDocumentQueue_(ss, params));
    if (action === 'listEnglishOSFolders') return jsonResponse_({ ok: true, folders: ENGLISH_OS_FOLDERS });

    if (action === 'sendDailyReportsAllUsers') {
      const result = sendDailyEnglishReportsAllUsers();
      return jsonResponse_({ ok: true, message: 'Daily English reports sent successfully.', result: result || {} });
    }

    if (action === 'listUsers') return jsonResponse_(listUsers_());

    return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err), stack: err.stack || '' });
  }
}
