function createGrammarWorkbook(ss, params) {
  const userEmail = normalizeEmail_(params.userEmail || '');
  const learnerId = String(params.learnerId || '').trim();
  const user = findUser_(ss, userEmail, learnerId) || {};

  const unit = String(
    params.unit ||
    user['Current Unit'] ||
    'Current English OS Unit'
  ).trim();

  const lesson = String(
    params.lesson ||
    user['Current Lesson'] ||
    'Current English OS Lesson'
  ).trim();

  const currentCEFR = String(user['Current CEFR'] || params.currentCEFR || 'B1+').trim();
  const displayName = String(user['Name'] || userEmail || learnerId || 'English OS Learner').trim();

  const mistakes = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, 20);
  const vocabulary = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, 30);
  const progress = findRowsByLearner_(ss, 'Weekly Progress', userEmail, learnerId, 5);
  const dailyLogs = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, 5);

  const title = buildGrammarWorkbookTitle_(displayName, unit);
  const workbook = SpreadsheetApp.create(title);
  const workbookId = workbook.getId();

  buildGrammarOverviewSheet_(workbook, displayName, userEmail, unit, lesson, currentCEFR, dailyLogs, progress);
  buildGrammarStructuresSheet_(workbook, unit, lesson);
  buildGrammarMistakesSheet_(workbook, mistakes);
  buildGrammarVocabularySheet_(workbook, vocabulary);
  buildGrammarPracticeSheet_(workbook, unit, lesson);

  removeDefaultSheetIfEmpty_(workbook);
  formatGrammarWorkbook_(workbook);
  moveFileToGrammarFolder_(workbookId);

  return {
    ok: true,
    action: 'createGrammarWorkbook',
    title: title,
    fileId: workbookId,
    fileUrl: workbook.getUrl(),
    exportUrl: buildSpreadsheetExportUrl_(workbookId),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    unit: unit,
    lesson: lesson,
    generatedAt: timestamp_()
  };
}

function buildGrammarWorkbookTitle_(displayName, unit) {
  const safeUnit = String(unit || 'Current Unit')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const safeName = String(displayName || 'Learner')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return 'English OS Grammar Workbook - ' + safeName + ' - ' + safeUnit;
}

function buildGrammarOverviewSheet_(workbook, displayName, userEmail, unit, lesson, currentCEFR, dailyLogs, progress) {
  const sheet = getOrCreateWorkbookSheet_(workbook, 'Overview');
  sheet.clear();

  const latestLog = dailyLogs && dailyLogs.length ? dailyLogs[0] : {};
  const latestProgress = progress && progress.length ? progress[0] : {};

  const rows = [
    ['Field', 'Value'],
    ['Learner', displayName],
    ['User Email', userEmail],
    ['Current Unit', unit],
    ['Current Lesson', lesson],
    ['Current CEFR', currentCEFR],
    ['Workbook Purpose', 'Grammar study workbook generated from English OS context.'],
    ['Main Skill Focus', latestLog.Skill || 'Business advice and grammar accuracy'],
    ['Recent Weakness', latestLog.Weakness || 'Add contrast and consequence language to advice.'],
    ['Recommended Next Action', latestLog['Next Action'] || 'Practice business advice using contrast and result clauses.'],
    ['Latest CEFR Estimate', latestProgress['CEFR Estimate'] || currentCEFR],
    ['Generated At', timestamp_()]
  ];

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildGrammarStructuresSheet_(workbook, unit, lesson) {
  const sheet = getOrCreateWorkbookSheet_(workbook, 'Grammar Structures');
  sheet.clear();

  const rows = [
    ['Grammar Area', 'Structure', 'Rule in Spanish', 'Example in English', 'Common Pitfall', 'B1/B2 Tip'],
    [
      'Giving advice',
      'You might want to + base verb',
      'Se usa para dar una recomendación suave y profesional.',
      'You might want to focus on improving communication first.',
      'Do not use “to focusing” after want to.',
      'Úsalo cuando quieras sonar diplomático en contexto laboral.'
    ],
    [
      'Giving advice',
      'It might not be a bad idea to + base verb',
      'Expresa una sugerencia indirecta; es útil en reuniones y consultoría.',
      'It might not be a bad idea to restart the project with a clearer plan.',
      'Avoid: “It might not be a bad idea restarting...”.',
      'Después de “to”, usa el verbo base.'
    ],
    [
      'Giving advice',
      'The way I see it, you ought to + base verb',
      '“Ought to” funciona como “should” y va seguido del verbo base.',
      'The way I see it, you ought to give the whole team some time off.',
      'Avoid: “ought to giving” or “ought to asking”.',
      'Úsalo para dar una opinión firme pero profesional.'
    ],
    [
      'Suggestion with gerund',
      'Have you ever thought of + gerund?',
      'Después de “thought of” se usa verbo en -ing.',
      'Have you ever thought of improving communication first?',
      'Avoid: “thought of improve”.',
      'Muy útil para sugerencias indirectas.'
    ],
    [
      'Contrast',
      'Although + subject + verb',
      '“Although” introduce una cláusula completa con sujeto y verbo.',
      'Although the deadline is important, the manager should focus on improving communication first.',
      'Avoid: “Despite the deadline is important”.',
      'Usa “although” cuando después viene una oración completa.'
    ],
    [
      'Contrast',
      'Despite + noun / noun phrase / gerund',
      '“Despite” no va seguido de una cláusula completa; usa sustantivo o gerundio.',
      'Despite the pressure on the project, it would be a good idea to restart it.',
      'Avoid: “Despite the project is late”.',
      'Si necesitas sujeto + verbo, cambia a “although”.'
    ],
    [
      'Consequence',
      'This would help + object + base verb',
      'Sirve para explicar el beneficio de tu recomendación.',
      'This would help the team work more efficiently.',
      'Avoid advice without an outcome sentence.',
      'Para sonar B2, conecta cada recomendación con un resultado.'
    ],
    [
      'Consequence',
      'That way, + subject + can/could/would + verb',
      '“That way” introduce el resultado práctico de una acción.',
      'That way, everyone can understand what to prioritize.',
      'Avoid using only short disconnected advice.',
      'Úsalo para cerrar respuestas de forma estratégica.'
    ],
    [
      'Purpose / Result',
      'so + subject + verb',
      '“So” conecta una acción con su resultado esperado.',
      'Restart the project with a clearer plan so everyone knows what to prioritize.',
      'Avoid: “so to everyone knows”.',
      'Excelente para expandir respuestas B1 hacia B2.'
    ],
    [
      'Current Unit Focus',
      unit + ' / ' + lesson,
      'La unidad actual se debe practicar conectando consejo, contraste y consecuencia.',
      'You might want to improve communication first, although the deadline is tight. This would help the team work more efficiently.',
      'Avoid giving advice without contrast or result.',
      'Meta: respuesta en 3 partes: advice + contrast + outcome.'
    ]
  ];

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildGrammarMistakesSheet_(workbook, mistakes) {
  const sheet = getOrCreateWorkbookSheet_(workbook, 'Frequent Mistakes');
  sheet.clear();

  const rows = [[
    'Date',
    'Unit',
    'Lesson',
    'Skill',
    'Mistake',
    'Correction',
    'Grammar Rule',
    'Priority',
    'Example'
  ]];

  (mistakes || []).forEach(function(item) {
    rows.push([
      item.Date || '',
      item.Unit || '',
      item.Lesson || '',
      item.Skill || '',
      item.Mistake || '',
      item.Correction || '',
      item['Grammar Rule'] || '',
      item.Priority || '',
      item.Example || ''
    ]);
  });

  if (rows.length === 1) {
    rows.push(['', '', '', '', 'No frequent mistakes found yet.', '', '', '', '']);
  }

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildGrammarVocabularySheet_(workbook, vocabulary) {
  const sheet = getOrCreateWorkbookSheet_(workbook, 'Vocabulary Links');
  sheet.clear();

  const rows = [[
    'Word/Chunk',
    'Meaning',
    'Example',
    'Collocation',
    'Category',
    'CEFR',
    'Status',
    'Grammar Link'
  ]];

  (vocabulary || []).forEach(function(item) {
    rows.push([
      item['Word/Chunk'] || '',
      item.Meaning || '',
      item.Example || '',
      item.Collocation || '',
      item.Category || '',
      item.CEFR || '',
      item.Status || '',
      inferGrammarLink_(item)
    ]);
  });

  if (rows.length === 1) {
    rows.push(['', '', '', '', '', '', '', 'No vocabulary found yet.']);
  }

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildGrammarPracticeSheet_(workbook, unit, lesson) {
  const sheet = getOrCreateWorkbookSheet_(workbook, 'Practice');
  sheet.clear();

  const rows = [
    ['#', 'Exercise Type', 'Prompt', 'Target Structure', 'Suggested Answer'],
    [1, 'Correction', 'Correct this sentence: The way I see it, you ought to asking for help.', 'ought to + base verb', 'The way I see it, you ought to ask for help.'],
    [2, 'Correction', 'Correct this sentence: Despite the deadline is important, we should improve communication.', 'although vs despite', 'Although the deadline is important, we should improve communication.'],
    [3, 'Transformation', 'Transform using “despite”: Although the project is under pressure, the manager should restart it.', 'despite + noun phrase', 'Despite the pressure on the project, the manager should restart it.'],
    [4, 'Expansion', 'Add a result sentence: You might want to focus on improving communication first.', 'This would help...', 'This would help the team work more efficiently and avoid confusion.'],
    [5, 'Advice', 'Give professional advice to a manager whose team is tired.', 'You might want to...', 'You might want to give the team some time off, although the deadline is tight. This would help them recover and stay productive.'],
    [6, 'Advice', 'Suggest restarting a project with a clearer plan.', 'It might not be a bad idea to...', 'It might not be a bad idea to restart the project with a clearer plan so everyone knows what to prioritize.'],
    [7, 'Contrast', 'Complete: _____ the deadline is important, communication should come first.', 'Although + clause', 'Although the deadline is important, communication should come first.'],
    [8, 'Contrast', 'Complete: _____ the pressure, the team needs a clearer plan.', 'Despite + noun phrase', 'Despite the pressure, the team needs a clearer plan.'],
    [9, 'Consequence', 'Complete: Restart the project with a clearer plan so _____.', 'so + subject + verb', 'Restart the project with a clearer plan so everyone knows what to prioritize.'],
    [10, 'Full Answer', 'Write a 3-sentence B2 answer giving advice in a business context.', 'advice + contrast + consequence', 'The first thing I’d recommend is giving the team some time off. Although the deadline is important, it might not be a bad idea to restart the project with a clearer plan. This would help the team recover while keeping the project aligned with business priorities.']
  ];

  rows.push(['', 'Current Unit', unit, 'Current Lesson', lesson]);

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function inferGrammarLink_(item) {
  const text = [
    item['Word/Chunk'] || '',
    item.Example || '',
    item.Collocation || ''
  ].join(' ').toLowerCase();

  if (text.indexOf('although') >= 0) return 'Although + subject + verb';
  if (text.indexOf('despite') >= 0) return 'Despite + noun phrase / gerund';
  if (text.indexOf('ought to') >= 0) return 'Ought to + base verb';
  if (text.indexOf('might want to') >= 0) return 'You might want to + base verb';
  if (text.indexOf('so ') >= 0) return 'Result clause with so';
  if (text.indexOf('would help') >= 0) return 'Consequence language';
  return 'Use in expanded B1/B2 answer';
}

function getOrCreateWorkbookSheet_(workbook, sheetName) {
  const existing = workbook.getSheetByName(sheetName);
  return existing || workbook.insertSheet(sheetName);
}

function removeDefaultSheetIfEmpty_(workbook) {
  const sheets = workbook.getSheets();
  const defaultSheet = workbook.getSheetByName('Sheet1');

  if (defaultSheet && sheets.length > 1) {
    workbook.deleteSheet(defaultSheet);
  }
}

function formatGrammarWorkbook_(workbook) {
  workbook.getSheets().forEach(function(sheet) {
    const range = sheet.getDataRange();
    const values = range.getValues();

    if (!values || !values.length) return;

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, values[0].length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff');

    range.setWrap(true);

    for (let col = 1; col <= values[0].length; col++) {
      sheet.autoResizeColumn(col);
    }
  });
}

function moveFileToGrammarFolder_(fileId) {
  const targetFolder = DriveApp.getFolderById(ENGLISH_OS_FOLDERS.grammarSystem);
  const file = DriveApp.getFileById(fileId);
  targetFolder.addFile(file);

  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    // In shared drives or restricted environments this can fail harmlessly.
  }
}

function buildSpreadsheetExportUrl_(spreadsheetId) {
  return 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx';
}
