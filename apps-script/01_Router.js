function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);

    if (!payload.token || payload.token !== getSecretToken_()) {
      return jsonResponse_({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const ss = SpreadsheetApp.openById(getEnglishOSSheetId_());
    ensureMissionControlSheet_(ss);

    // IMPORTANTE:
    // Esta acción no debe depender de ensureUser_ ni de la validación normal
    // porque userEmail/learnerId vienen dentro de payload.aiUsage.
    if (payload.action === 'logAIUsage') {
      const usagePayload = payload.aiUsage || payload;

      const usage = logAIUsage_(ss, usagePayload);

      return jsonResponse_({
        ok: true,
        action: 'logAIUsage',
        usage
      });
    }

    const profile = payload.userProfile || {};
    const hasUserEmail = payload.userEmail || profile.userEmail;
    const hasLearnerId = payload.learnerId || profile.learnerId;

    if (!hasUserEmail && !hasLearnerId) {
      return jsonResponse_({
        ok: false,
        error: 'Missing userEmail or learnerId'
      });
    }

    const userProfile = ensureUser_(ss, payload);
    payload.userEmail = userProfile.userEmail;
    payload.learnerId = userProfile.learnerId;

    if (!payload.userEmail || !payload.learnerId) {
      return jsonResponse_({
        ok: false,
        error: 'Missing userEmail or learnerId'
      });
    }

    const result = {
      users: userProfile.created ? 1 : 0,
      userUpdated: userProfile.created ? false : true,
      dailyLogs: 0,
      mistakes: 0,
      vocabulary: 0,
      progress: 0,
      whatsappQueue: 0,
      documentQueue: 0,
      documentsCreated: 0,
      generatedDocuments: []
    };

    if (payload.dailyLog) {
      appendDailyLog_(ss, payload, payload.dailyLog);
      result.dailyLogs++;
    }

    if (payload.mistakes && Array.isArray(payload.mistakes)) {
      payload.mistakes.forEach(item => {
        appendMistake_(ss, payload, item);
        result.mistakes++;
      });
    }

    if (payload.vocabulary && Array.isArray(payload.vocabulary)) {
      payload.vocabulary.forEach(item => {
        appendVocabulary_(ss, payload, item);
        result.vocabulary++;
      });
    }

    if (payload.progress) {
      appendProgress_(ss, payload, payload.progress);
      result.progress++;
    }

    if (payload.whatsAppMessage) {
      appendWhatsAppQueue_(ss, payload, payload.whatsAppMessage);
      result.whatsappQueue++;
    }

    if (payload.documentRequest) {
      const queueResult = appendDocumentQueue_(ss, payload, payload.documentRequest);
      result.documentQueue++;

      if (payload.documentRequest.generateNow !== false) {
        const created = createEnglishOSDocument_(ss, payload, payload.documentRequest, queueResult.rowNumber);
        result.documentsCreated++;
        result.generatedDocuments.push(created);
      }
    }

    touchUser_(ss, payload);
    refreshMissionControl_(ss, payload.userEmail, payload.learnerId);

    return jsonResponse_({
      ok: true,
      message: 'English OS updated successfully',
      userEmail: payload.userEmail,
      learnerId: payload.learnerId,
      result: result
    });

  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err),
      stack: err.stack || ''
    });
  }
}

function doGet(e) {
  try {
    const params = e.parameter || {};

    if (!params.token || params.token !== getSecretToken_()) {
      return jsonResponse_({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const ss = SpreadsheetApp.openById(getEnglishOSSheetId_());
    ensureMissionControlSheet_(ss);

    const action = params.action || 'getLearnerContext';

    if (action === 'listDriveUnitResources') {
      const unit = e.parameter.unit || '';

      const resources = listDriveUnitResources(unit);

      return jsonResponse_({
        ok: true,
        action: 'listDriveUnitResources',
        unit: unit,
        resources: resources
      });
    }

    if (action === 'createGrammarWorkbook') {
      return jsonResponse_(createGrammarWorkbook(ss, params));
    }

    if (action === 'getLearnerContext') {
      return jsonResponse_(getLearnerContext_(ss, params));
    }

    if (action === 'getRecentMistakes') {
      return jsonResponse_(getRecentMistakes_(ss, params));
    }

    if (action === 'getVocabularyByStatus') {
      return jsonResponse_(getVocabularyByStatus_(ss, params));
    }

    if (action === 'getCurrentMission') {
      return jsonResponse_(getCurrentMission_(ss, params));
    }

    if (action === 'getMissionControl') {
      return jsonResponse_(getMissionControl_(ss, params));
    }

    if (action === 'getNextRecommendedAction') {
      return jsonResponse_(getNextRecommendedAction_(ss, params));
    }

    if (action === 'refreshMissionControl') {
      return jsonResponse_(refreshMissionControl_(ss, params.userEmail || '', params.learnerId || ''));
    }

    if (action === 'createDocument') {
      return jsonResponse_(createDocumentFromParams_(ss, params));
    }

    if (action === 'processDocumentQueue') {
      return jsonResponse_(processDocumentQueue_(ss, params));
    }

    if (action === 'listEnglishOSFolders') {
      return jsonResponse_({
        ok: true,
        folders: ENGLISH_OS_FOLDERS
      });
    }

    if (action === 'sendDailyReportsAllUsers') {
      const result = sendDailyEnglishReportsAllUsers();

      return jsonResponse_({
        ok: true,
        message: 'Daily English reports sent successfully.',
        result: result || {}
      });
    }

    if (action === 'listUsers') {
      return jsonResponse_(listUsers_());
    }

    return jsonResponse_({
      ok: false,
      error: 'Unknown action: ' + action
    });

  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err),
      stack: err.stack || ''
    });
  }
}
