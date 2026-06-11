function appendDailyLog_(ss, payload, log) {
  const sheet = getOrCreateSheet_(ss, 'Daily Logs', SHEET_HEADERS.dailyLogs);

  sheet.appendRow([
    payload.userEmail || '',
    payload.learnerId || '',
    activityDate_(payload),
    payload.sourceAgent || '',
    payload.unit || '',
    payload.lesson || '',
    log.skill || '',
    log.activity || '',
    log.mainTopic || '',
    log.time || '',
    log.summary || '',
    log.weakness || '',
    log.newVocabulary || '',
    log.nextAction || ''
  ]);
}

function appendMistake_(ss, payload, item) {
  const sheet = getOrCreateSheet_(ss, 'Recurring Mistakes', SHEET_HEADERS.mistakes);

  sheet.appendRow([
    payload.userEmail || '',
    payload.learnerId || '',
    activityDate_(payload),
    payload.sourceAgent || '',
    payload.unit || '',
    payload.lesson || '',
    item.skill || '',
    item.mistake || '',
    item.correction || '',
    item.grammarRule || '',
    item.frequency || 1,
    item.priority || 'Medium',
    item.example || ''
  ]);
}

function appendVocabulary_(ss, payload, item) {
  const sheet = getOrCreateSheet_(ss, 'Vocabulary Intelligence', SHEET_HEADERS.vocabulary);

  sheet.appendRow([
    payload.userEmail || '',
    payload.learnerId || '',
    activityDate_(payload),
    payload.sourceAgent || '',
    payload.unit || '',
    payload.lesson || '',
    item.wordChunk || item.wordOrChunk || '',
    item.meaning || '',
    item.example || '',
    item.collocation || '',
    item.category || '',
    item.cefr || '',
    item.status || 'New'
  ]);
}

function appendProgress_(ss, payload, item) {
  const sheet = getOrCreateSheet_(ss, 'Weekly Progress', SHEET_HEADERS.progress);

  sheet.appendRow([
    payload.userEmail || '',
    payload.learnerId || '',
    activityDate_(payload),
    payload.sourceAgent || '',
    payload.unit || '',
    item.week || '',
    item.speaking || '',
    item.grammar || '',
    item.listening || '',
    item.writing || '',
    item.vocabulary || '',
    item.pronunciation || '',
    item.confidence || '',
    item.cefrEstimate || '',
    item.notes || ''
  ]);
}

function appendWhatsAppQueue_(ss, payload, msg) {
  const sheet = getOrCreateSheet_(ss, 'WhatsApp Queue', SHEET_HEADERS.whatsappQueue);

  sheet.appendRow([
    timestamp_(),
    payload.userEmail || '',
    payload.learnerId || '',
    payload.whatsAppNumber || payload.whatsappNumber || msg.phone || '',
    msg.messageType || 'Speaking Practice',
    msg.message || '',
    'Pending',
    '',
    '',
    msg.notes || ''
  ]);
}
