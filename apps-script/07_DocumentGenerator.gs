function createDocumentFromParams_(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || userEmail || '').trim();

  if (!userEmail && !learnerId) {
    return {
      ok: false,
      error: 'Missing userEmail or learnerId'
    };
  }

  const payload = {
    userEmail: userEmail,
    learnerId: learnerId,
    sourceAgent: params.sourceAgent || 'English OS',
    unit: params.unit || '',
    lesson: params.lesson || '',
    date: params.date || today_()
  };

  const doc = {
    documentType: params.documentType || 'Daily Session Summary',
    targetFolderKey: params.targetFolderKey || '',
    targetFolderId: params.targetFolderId || '',
    targetFolder: params.targetFolder || '',
    title: params.title || '',
    notes: params.notes || '',
    generateNow: true
  };

  const queueResult = appendDocumentQueue_(ss, payload, doc);
  const created = createEnglishOSDocument_(ss, payload, doc, queueResult.rowNumber);

  return {
    ok: true,
    document: created
  };
}

function createEnglishOSDocument_(ss, payload, doc, queueRowNumber) {
  const documentType = doc.documentType || 'Daily Session Summary';
  const targetFolderKey = doc.targetFolderKey || inferTargetFolderKey_(documentType, payload.sourceAgent || '');
  const targetFolderId = ENGLISH_OS_FOLDERS[targetFolderKey] || doc.targetFolderId || ENGLISH_OS_FOLDERS.dailySessions;

  const title = doc.title || buildDocumentTitle_(payload, documentType);
  const document = DocumentApp.create(title);
  const body = document.getBody();

  buildDocumentBody_(ss, body, payload, doc, documentType);

  document.saveAndClose();

  const file = DriveApp.getFileById(document.getId());
  const folder = DriveApp.getFolderById(targetFolderId);

  folder.addFile(file);

  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    // In some Workspace configurations the root file cannot be removed.
    // The document is still added to the target English OS folder.
  }

  const url = document.getUrl();

  if (queueRowNumber) {
    updateDocumentQueueRow_(ss, queueRowNumber, 'Generated', url, doc.notes || '');
  }

  return {
    ok: true,
    title: title,
    documentType: documentType,
    targetFolderKey: targetFolderKey,
    targetFolderId: targetFolderId,
    url: url,
    documentId: document.getId()
  };
}

function buildDocumentTitle_(payload, documentType) {
  const user = normalizeEmail_(payload.userEmail || payload.learnerId || 'learner');
  const cleanUser = user.replace(/[^a-zA-Z0-9._-]/g, '_');
  const date = activityDate_(payload);
  const type = String(documentType || 'English OS Document').replace(/[\\/:*?"<>|]/g, '-');

  return date + ' - ' + type + ' - ' + cleanUser;
}

function buildDocumentBody_(ss, body, payload, doc, documentType) {
  const userEmail = normalizeEmail_(payload.userEmail || '');
  const learnerId = String(payload.learnerId || '').trim();

  const user = findUser_(ss, userEmail, learnerId);

  const mission = getMissionControl_(ss, {
    userEmail: userEmail,
    learnerId: learnerId
  });

  const recommendation = getNextRecommendedAction_(ss, {
    userEmail: userEmail,
    learnerId: learnerId
  });

  const recentDailyLogs = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, 5);
  const recentMistakes = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, 10);
  const activeVocabulary = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, 20);
  const recentProgress = findRowsByLearner_(ss, 'Weekly Progress', userEmail, learnerId, 5);

  body.clear();

  appendTitle_(body, documentType || 'English OS Document');
  appendMetadata_(body, payload, user, mission, recommendation);

  const normalizedType = String(documentType || '').toLowerCase();

  if (normalizedType.indexOf('evaluation') >= 0 || normalizedType.indexOf('cefr') >= 0) {
    appendEvaluationReport_(body, recentProgress, recentMistakes, activeVocabulary, recommendation);
  } else if (normalizedType.indexOf('vocabulary') >= 0 || normalizedType.indexOf('chunk') >= 0) {
    appendVocabularyReview_(body, activeVocabulary);
  } else if (
    normalizedType.indexOf('mistake') >= 0 ||
    normalizedType.indexOf('correction') >= 0 ||
    normalizedType.indexOf('feedback') >= 0
  ) {
    appendMistakeReview_(body, recentMistakes);
  } else if (normalizedType.indexOf('pronunciation') >= 0 || normalizedType.indexOf('accent') >= 0) {
    appendPronunciationPlan_(body, recentMistakes, recentDailyLogs, activeVocabulary);
  } else if (normalizedType.indexOf('mission') >= 0 || normalizedType.indexOf('roadmap') >= 0) {
    appendMissionSnapshot_(body, mission, recommendation, recentProgress, recentMistakes, activeVocabulary);
  } else {
    appendDailySessionSummary_(body, recentDailyLogs, recentMistakes, activeVocabulary, recommendation);
  }

  if (doc.notes) {
    appendSection_(body, 'Notes');
    body.appendParagraph(doc.notes);
  }

  appendSection_(body, 'Generated by English OS');
  body.appendParagraph('Generated at: ' + timestamp_());
}

function appendTitle_(body, title) {
  const paragraph = body.appendParagraph(title);
  paragraph.setHeading(DocumentApp.ParagraphHeading.TITLE);
}

function appendSection_(body, title) {
  const paragraph = body.appendParagraph(title);
  paragraph.setHeading(DocumentApp.ParagraphHeading.HEADING2);
}

function appendMetadata_(body, payload, user, mission, recommendation) {
  appendSection_(body, 'Learner Context');

  body.appendParagraph('User Email: ' + (payload.userEmail || ''));
  body.appendParagraph('Learner ID: ' + (payload.learnerId || ''));

  if (user) {
    body.appendParagraph('Name: ' + (user['Name'] || ''));
    body.appendParagraph('Current Unit: ' + (user['Current Unit'] || ''));
    body.appendParagraph('Current Lesson: ' + (user['Current Lesson'] || ''));
    body.appendParagraph('Current CEFR: ' + (user['Current CEFR'] || ''));
    body.appendParagraph('Last Activity: ' + formatCellValue_(user['Last Activity'] || ''));
  }

  if (mission && mission.found) {
    body.appendParagraph('Last GPT Used: ' + (mission.missionControl.lastGPTUsed || ''));
    body.appendParagraph('Mission Control Status: ' + (mission.missionControl.status || ''));
    body.appendParagraph('Current Focus: ' + (mission.missionControl.currentFocus || ''));
    body.appendParagraph('Next Recommended Action: ' + (mission.missionControl.nextRecommendedAction || ''));
  }

  if (recommendation && recommendation.recommendation) {
    body.appendParagraph('Recommended Priority: ' + (recommendation.recommendation.priority || ''));
    body.appendParagraph('Recommended Skill: ' + (recommendation.recommendation.recommendedSkill || ''));
    body.appendParagraph('Recommended Activity: ' + (recommendation.recommendation.recommendedActivity || ''));
  }
}

function appendDailySessionSummary_(body, logs, mistakes, vocabulary, recommendation) {
  appendSection_(body, 'Recent Daily Sessions');

  if (!logs || logs.length === 0) {
    body.appendParagraph('No recent daily logs found.');
  } else {
    logs.forEach(log => {
      body.appendParagraph('Date: ' + formatCellValue_(log['Date']) + ' | Source: ' + (log['Source Agent'] || ''));
      body.appendParagraph('Unit/Lesson: ' + (log['Unit'] || '') + ' — ' + (log['Lesson'] || ''));
      body.appendParagraph('Skill: ' + (log['Skill'] || ''));
      body.appendParagraph('Activity: ' + (log['Activity'] || ''));
      body.appendParagraph('Main Topic: ' + (log['Main Topic'] || ''));
      body.appendParagraph('Summary: ' + (log['Summary'] || ''));
      body.appendParagraph('Weakness: ' + (log['Weakness'] || ''));
      body.appendParagraph('New Vocabulary: ' + (log['New Vocabulary'] || ''));
      body.appendParagraph('Next Action: ' + (log['Next Action'] || ''));
      body.appendHorizontalRule();
    });
  }

  appendSection_(body, 'Priority Recommendation');

  if (recommendation && recommendation.recommendation) {
    body.appendParagraph(recommendation.recommendation.recommendedPrompt || '');
  } else {
    body.appendParagraph('No recommendation available.');
  }

  appendMistakeReview_(body, (mistakes || []).slice(0, 5));
  appendVocabularyReview_(body, (vocabulary || []).slice(0, 10));
}

function appendEvaluationReport_(body, progress, mistakes, vocabulary, recommendation) {
  appendSection_(body, 'Recent Progress');

  if (!progress || progress.length === 0) {
    body.appendParagraph('No recent progress records found.');
  } else {
    progress.forEach(item => {
      body.appendParagraph('Date: ' + formatCellValue_(item['Date']) + ' | Source: ' + (item['Source Agent'] || ''));
      body.appendParagraph('Unit: ' + (item['Unit'] || ''));
      body.appendParagraph('Week: ' + (item['Week'] || ''));
      body.appendParagraph(
        'Speaking: ' + safeCell_(item['Speaking']) +
        ' | Grammar: ' + safeCell_(item['Grammar']) +
        ' | Listening: ' + safeCell_(item['Listening']) +
        ' | Writing: ' + safeCell_(item['Writing']) +
        ' | Vocabulary: ' + safeCell_(item['Vocabulary']) +
        ' | Pronunciation: ' + safeCell_(item['Pronunciation']) +
        ' | Confidence: ' + safeCell_(item['Confidence'])
      );
      body.appendParagraph('CEFR Estimate: ' + (item['CEFR Estimate'] || ''));
      body.appendParagraph('Notes: ' + (item['Notes'] || ''));
      body.appendHorizontalRule();
    });
  }

  appendSection_(body, 'Evaluation Recommendation');

  if (recommendation && recommendation.recommendation) {
    body.appendParagraph(recommendation.recommendation.recommendedPrompt || '');
  } else {
    body.appendParagraph('No recommendation available.');
  }

  appendMistakeReview_(body, (mistakes || []).slice(0, 5));
  appendVocabularyReview_(body, (vocabulary || []).slice(0, 8));
}

function appendVocabularyReview_(body, vocabulary) {
  appendSection_(body, 'Vocabulary Review');

  if (!vocabulary || vocabulary.length === 0) {
    body.appendParagraph('No vocabulary records found.');
    return;
  }

  vocabulary.forEach(item => {
    body.appendParagraph('Word/Chunk: ' + (item['Word/Chunk'] || ''));
    body.appendParagraph('Meaning: ' + (item['Meaning'] || ''));
    body.appendParagraph('Example: ' + (item['Example'] || ''));
    body.appendParagraph('Collocation: ' + (item['Collocation'] || ''));
    body.appendParagraph('Category: ' + (item['Category'] || ''));
    body.appendParagraph('CEFR/Status: ' + (item['CEFR'] || '') + ' / ' + (item['Status'] || ''));
    body.appendHorizontalRule();
  });
}

function appendMistakeReview_(body, mistakes) {
  appendSection_(body, 'Mistake Review');

  if (!mistakes || mistakes.length === 0) {
    body.appendParagraph('No recent mistakes found.');
    return;
  }

  mistakes.forEach(item => {
    body.appendParagraph('Skill: ' + (item['Skill'] || ''));
    body.appendParagraph('Mistake: ' + (item['Mistake'] || ''));
    body.appendParagraph('Correction: ' + (item['Correction'] || ''));
    body.appendParagraph('Rule: ' + (item['Grammar Rule'] || ''));
    body.appendParagraph('Frequency: ' + safeCell_(item['Frequency']));
    body.appendParagraph('Priority: ' + (item['Priority'] || ''));
    body.appendParagraph('Example: ' + (item['Example'] || ''));
    body.appendHorizontalRule();
  });
}

function appendPronunciationPlan_(body, mistakes, logs, vocabulary) {
  appendSection_(body, 'Pronunciation Plan');

  const pronunciationMistakes = (mistakes || []).filter(item => {
    const skill = String(item['Skill'] || '').toLowerCase();
    const mistake = String(item['Mistake'] || '').toLowerCase();
    const correction = String(item['Correction'] || '').toLowerCase();

    return (
      skill.indexOf('pronunciation') >= 0 ||
      skill.indexOf('connected speech') >= 0 ||
      mistake.indexOf('pronunciation') >= 0 ||
      mistake.indexOf('/ð/') >= 0 ||
      mistake.indexOf('th') >= 0 ||
      correction.indexOf('/ð/') >= 0 ||
      correction.indexOf('tongue') >= 0
    );
  });

  if (pronunciationMistakes.length === 0) {
    body.appendParagraph('No specific pronunciation mistakes found. Use recent speaking logs to plan connected speech and rhythm practice.');
  } else {
    pronunciationMistakes.forEach(item => {
      body.appendParagraph('Focus: ' + (item['Mistake'] || ''));
      body.appendParagraph('Correction/Cue: ' + (item['Correction'] || ''));
      body.appendParagraph('Rule: ' + (item['Grammar Rule'] || ''));
      body.appendParagraph('Example: ' + (item['Example'] || ''));
      body.appendHorizontalRule();
    });
  }

  appendSection_(body, 'Recent Speaking Evidence');

  const speakingLogs = (logs || []).filter(log => {
    const skill = String(log['Skill'] || '').toLowerCase();
    const source = String(log['Source Agent'] || '').toLowerCase();

    return skill.indexOf('speaking') >= 0 || skill.indexOf('pronunciation') >= 0 || source.indexOf('speaking') >= 0;
  });

  if (speakingLogs.length === 0) {
    body.appendParagraph('No recent speaking logs found.');
  } else {
    speakingLogs.forEach(log => {
      body.appendParagraph('Date: ' + formatCellValue_(log['Date']));
      body.appendParagraph('Activity: ' + (log['Activity'] || ''));
      body.appendParagraph('Weakness: ' + (log['Weakness'] || ''));
      body.appendParagraph('Next Action: ' + (log['Next Action'] || ''));
      body.appendHorizontalRule();
    });
  }

  appendSection_(body, 'Suggested Drill');
  body.appendParagraph('1. Repeat the target phrase slowly.');
  body.appendParagraph('2. Break it into chunks.');
  body.appendParagraph('3. Connect the chunks naturally.');
  body.appendParagraph('4. Say it again at normal speed.');
  body.appendParagraph('5. Use it in a short answer.');

  appendSection_(body, 'Useful Chunks for Speaking');

  const chunks = (vocabulary || [])
    .slice(0, 8)
    .map(item => item['Word/Chunk'] || '')
    .filter(value => value !== '');

  if (chunks.length === 0) {
    body.appendParagraph('No chunks available.');
  } else {
    chunks.forEach(chunk => {
      body.appendParagraph('- ' + chunk);
    });
  }
}

function appendMissionSnapshot_(body, mission, recommendation, progress, mistakes, vocabulary) {
  appendSection_(body, 'Mission Control Snapshot');

  if (mission && mission.found) {
    const mc = mission.missionControl;

    body.appendParagraph('Name: ' + (mc.name || ''));
    body.appendParagraph('User Email: ' + (mc.userEmail || ''));
    body.appendParagraph('Current Unit: ' + (mc.currentUnit || ''));
    body.appendParagraph('Current Lesson: ' + (mc.currentLesson || ''));
    body.appendParagraph('Current CEFR: ' + (mc.currentCEFR || ''));
    body.appendParagraph('Last Activity: ' + formatCellValue_(mc.lastActivity));
    body.appendParagraph('Last GPT Used: ' + (mc.lastGPTUsed || ''));
    body.appendParagraph('Last Session Summary: ' + (mc.lastSessionSummary || ''));
    body.appendParagraph('Top Recurring Mistake: ' + (mc.topRecurringMistake || ''));
    body.appendParagraph('Active Vocabulary Count: ' + safeCell_(mc.activeVocabularyCount));
    body.appendParagraph('Last Evaluation CEFR: ' + (mc.lastEvaluationCEFR || ''));
    body.appendParagraph('Current Focus: ' + (mc.currentFocus || ''));
    body.appendParagraph('Next Recommended Action: ' + (mc.nextRecommendedAction || ''));
    body.appendParagraph('Status: ' + (mc.status || ''));
  } else {
    body.appendParagraph('No Mission Control record found.');
  }

  appendSection_(body, 'Next Recommendation');

  if (recommendation && recommendation.recommendation) {
    body.appendParagraph('Priority: ' + (recommendation.recommendation.priority || ''));
    body.appendParagraph('Skill: ' + (recommendation.recommendation.recommendedSkill || ''));
    body.appendParagraph('Activity: ' + (recommendation.recommendation.recommendedActivity || ''));
    body.appendParagraph('Prompt: ' + (recommendation.recommendation.recommendedPrompt || ''));
  } else {
    body.appendParagraph('No recommendation available.');
  }

  appendEvaluationReport_(
    body,
    (progress || []).slice(0, 5),
    (mistakes || []).slice(0, 5),
    (vocabulary || []).slice(0, 8),
    recommendation
  );
}

function safeCell_(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}
