function createVocabularyWorkbook(ss, params) {
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

  const vocabulary = findRowsByLearner_(ss, 'Vocabulary Intelligence', userEmail, learnerId, 200);
  const mistakes = findRowsByLearner_(ss, 'Recurring Mistakes', userEmail, learnerId, 30);
  const dailyLogs = findRowsByLearner_(ss, 'Daily Logs', userEmail, learnerId, 10);

  const title = buildVocabularyWorkbookTitle_(displayName, unit);
  const workbook = SpreadsheetApp.create(title);
  const workbookId = workbook.getId();

  buildVocabularyOverviewSheet_(workbook, displayName, userEmail, unit, lesson, currentCEFR, vocabulary, dailyLogs);
  buildVocabularyCoreSheet_(workbook, vocabulary);
  buildVocabularyCollocationsSheet_(workbook, vocabulary);
  buildVocabularyMistakeLinksSheet_(workbook, mistakes, vocabulary);
  buildVocabularyPracticeSheet_(workbook, unit, lesson, vocabulary);
  buildVocabularyReviewPlanSheet_(workbook, vocabulary);

  removeDefaultSheetIfEmpty_(workbook);
  formatVocabularyWorkbook_(workbook);
  moveFileToVocabularyFolder_(workbookId);

  return {
    ok: true,
    action: 'createVocabularyWorkbook',
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

function buildVocabularyWorkbookTitle_(displayName, unit) {
  const safeUnit = String(unit || 'Current Unit')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const safeName = String(displayName || 'Learner')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return 'English OS Vocabulary Workbook - ' + safeName + ' - ' + safeUnit;
}

function buildVocabularyOverviewSheet_(workbook, displayName, userEmail, unit, lesson, currentCEFR, vocabulary, dailyLogs) {
  const sheet = getOrCreateVocabularyWorkbookSheet_(workbook, 'Overview');
  sheet.clear();

  const latestLog = dailyLogs && dailyLogs.length ? dailyLogs[0] : {};
  const newCount = countVocabularyByStatus_(vocabulary, 'new');
  const reviewCount = countVocabularyByStatus_(vocabulary, 'review');
  const masteredCount = countVocabularyByStatus_(vocabulary, 'mastered');

  const rows = [
    ['Field', 'Value'],
    ['Learner', displayName],
    ['User Email', userEmail],
    ['Current Unit', unit],
    ['Current Lesson', lesson],
    ['Current CEFR', currentCEFR],
    ['Workbook Purpose', 'Vocabulary, chunks, collocations and review plan generated from English OS context.'],
    ['Recent Topic', latestLog['Main Topic'] || 'Business advice and professional communication'],
    ['Vocabulary Items Included', vocabulary.length],
    ['New Items', newCount],
    ['Review Items', reviewCount],
    ['Mastered Items', masteredCount],
    ['Generated At', timestamp_()]
  ];

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildVocabularyCoreSheet_(workbook, vocabulary) {
  const sheet = getOrCreateVocabularyWorkbookSheet_(workbook, 'Core Vocabulary');
  sheet.clear();

  const rows = [[
    'Word/Chunk',
    'Meaning',
    'Example',
    'Collocation',
    'Category',
    'CEFR',
    'Status',
    'Spanish Study Note',
    'Production Prompt'
  ]];

  (vocabulary || []).forEach(function(item) {
    const word = item['Word/Chunk'] || '';
    rows.push([
      word,
      item.Meaning || '',
      item.Example || '',
      item.Collocation || '',
      item.Category || '',
      item.CEFR || '',
      item.Status || '',
      buildVocabularyStudyNote_(item),
      'Write one original business sentence using: ' + word
    ]);
  });

  if (rows.length === 1) {
    rows.push(['No vocabulary found yet.', '', '', '', '', '', '', '', '']);
  }

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildVocabularyCollocationsSheet_(workbook, vocabulary) {
  const sheet = getOrCreateVocabularyWorkbookSheet_(workbook, 'Collocations');
  sheet.clear();

  const rows = [[
    'Chunk',
    'Collocation',
    'Category',
    'Use Case',
    'B1 Sentence',
    'B2 Upgrade'
  ]];

  (vocabulary || []).forEach(function(item) {
    const word = item['Word/Chunk'] || '';
    const collocation = item.Collocation || inferCollocation_(item);
    rows.push([
      word,
      collocation,
      item.Category || '',
      inferVocabularyUseCase_(item),
      buildB1VocabularySentence_(item),
      buildB2VocabularyUpgrade_(item)
    ]);
  });

  if (rows.length === 1) {
    rows.push(['No collocations found yet.', '', '', '', '', '']);
  }

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildVocabularyMistakeLinksSheet_(workbook, mistakes, vocabulary) {
  const sheet = getOrCreateVocabularyWorkbookSheet_(workbook, 'Mistake Links');
  sheet.clear();

  const vocabText = vocabulary.map(function(item) {
    return String(item['Word/Chunk'] || '').toLowerCase();
  }).join(' | ');

  const rows = [[
    'Mistake',
    'Correction',
    'Grammar Rule',
    'Priority',
    'Related Vocabulary Focus',
    'Practice Sentence'
  ]];

  (mistakes || []).forEach(function(item) {
    rows.push([
      item.Mistake || '',
      item.Correction || '',
      item['Grammar Rule'] || '',
      item.Priority || '',
      inferRelatedVocabularyFocus_(item, vocabText),
      item.Example || ''
    ]);
  });

  if (rows.length === 1) {
    rows.push(['No mistakes found yet.', '', '', '', '', '']);
  }

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildVocabularyPracticeSheet_(workbook, unit, lesson, vocabulary) {
  const sheet = getOrCreateVocabularyWorkbookSheet_(workbook, 'Practice');
  sheet.clear();

  const topVocabulary = (vocabulary || []).slice(0, 12);
  const recycledChunks = topVocabulary.map(function(item) {
    return item['Word/Chunk'] || '';
  }).filter(Boolean).join(', ');

  const rows = [
    ['#', 'Exercise Type', 'Prompt', 'Vocabulary Target', 'Suggested Answer / Instruction'],
    [1, 'Recall', 'Write the Spanish meaning of 8 vocabulary items from this workbook.', recycledChunks, 'Use the Core Vocabulary sheet to check your answers.'],
    [2, 'Controlled sentence', 'Write 5 sentences using one chunk per sentence.', recycledChunks, 'Each sentence must be related to work, consulting or business advice.'],
    [3, 'Collocation drill', 'Complete each phrase with the correct collocation.', 'Collocations sheet', 'Example: keep something aligned with priorities.'],
    [4, 'Upgrade', 'Transform a simple B1 sentence into a more professional B2 sentence.', 'professionally appropriate / strategic reasoning', 'Add contrast and consequence language.'],
    [5, 'Business answer', 'Give advice to a manager using at least 4 vocabulary items.', recycledChunks, 'Use advice + contrast + consequence.'],
    [6, 'Speaking', 'Record yourself using 5 vocabulary items naturally.', recycledChunks, 'Listen again and mark pronunciation or fluency problems.'],
    [7, 'Contrast', 'Use one vocabulary item with although.', 'Although + vocabulary', 'Although the deadline is tight, the manager should focus on improving communication first.'],
    [8, 'Contrast', 'Use one vocabulary item with despite.', 'Despite + noun phrase', 'Despite the pressure, the team needs a clearer plan.'],
    [9, 'Result', 'Use one vocabulary item with so + subject + verb.', 'so + result', 'Restart the project with a clearer plan so everyone knows what to prioritize.'],
    [10, 'Final task', 'Write a 90-second answer using 6 vocabulary items.', unit + ' / ' + lesson, 'Your answer should sound professional, clear and B2-oriented.']
  ];

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function buildVocabularyReviewPlanSheet_(workbook, vocabulary) {
  const sheet = getOrCreateVocabularyWorkbookSheet_(workbook, 'Review Plan');
  sheet.clear();

  const rows = [[
    'Day',
    'Task',
    'Items',
    'Output',
    'Completion'
  ]];

  const chunks = (vocabulary || []).slice(0, 20).map(function(item) {
    return item['Word/Chunk'] || '';
  }).filter(Boolean);

  rows.push(['Day 1', 'Recognition', chunks.slice(0, 8).join(', '), 'Match each item with meaning and example.', '']);
  rows.push(['Day 2', 'Controlled production', chunks.slice(0, 8).join(', '), 'Write 8 original sentences.', '']);
  rows.push(['Day 3', 'Collocations', chunks.slice(0, 12).join(', '), 'Build 12 chunk + collocation pairs.', '']);
  rows.push(['Day 4', 'Speaking', chunks.slice(0, 10).join(', '), 'Record a 90-second answer.', '']);
  rows.push(['Day 5', 'Business simulation', chunks.slice(0, 15).join(', '), 'Give advice in a work scenario.', '']);
  rows.push(['Day 7', 'Review test', chunks.slice(0, 20).join(', '), 'Write a full B2 answer from memory.', '']);

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function countVocabularyByStatus_(vocabulary, status) {
  const target = String(status || '').toLowerCase();
  return (vocabulary || []).filter(function(item) {
    return String(item.Status || '').toLowerCase() === target;
  }).length;
}

function buildVocabularyStudyNote_(item) {
  const status = String(item.Status || '').toLowerCase();
  const cefr = item.CEFR || 'B1/B2';

  if (status === 'new') {
    return 'Nuevo: primero entiende el significado, luego úsalo en una frase corta.';
  }

  if (status === 'review') {
    return 'En revisión: úsalo en respuestas habladas y escritas hasta que salga natural.';
  }

  if (status === 'mastered') {
    return 'Dominado: recíclalo en respuestas más largas para mantenerlo activo.';
  }

  return 'Nivel ' + cefr + ': conecta el chunk con una situación real de trabajo.';
}

function inferCollocation_(item) {
  const word = String(item['Word/Chunk'] || '').toLowerCase();

  if (word.indexOf('communication') >= 0) return 'improve communication / focus on communication';
  if (word.indexOf('priorit') >= 0) return 'know what to prioritize / align with priorities';
  if (word.indexOf('strategic') >= 0) return 'use strategic reasoning / strategic decision';
  if (word.indexOf('appropriate') >= 0) return 'professionally appropriate response';
  if (word.indexOf('traffic') >= 0) return 'reduce traffic congestion';

  return item.Collocation || 'use naturally in context';
}

function inferVocabularyUseCase_(item) {
  const category = String(item.Category || '').toLowerCase();

  if (category.indexOf('business') >= 0) return 'Business advice / professional communication';
  if (category.indexOf('contrast') >= 0) return 'Contrasting ideas with although/despite';
  if (category.indexOf('city') >= 0) return 'City preferences / urban issues';
  if (category.indexOf('professional') >= 0) return 'Meetings, consulting and work conversations';

  return 'General English OS practice';
}

function buildB1VocabularySentence_(item) {
  const word = item['Word/Chunk'] || 'this word';
  return 'I can use ' + word + ' in a simple sentence.';
}

function buildB2VocabularyUpgrade_(item) {
  const word = item['Word/Chunk'] || 'this expression';
  return 'Although the situation is challenging, I can use ' + word + ' to explain my recommendation more professionally.';
}

function inferRelatedVocabularyFocus_(mistake, vocabText) {
  const text = [mistake.Mistake || '', mistake.Correction || '', mistake.Example || ''].join(' ').toLowerCase();

  if (text.indexOf('although') >= 0 || text.indexOf('despite') >= 0) return 'contrast chunks: although / despite';
  if (text.indexOf('ought to') >= 0 || text.indexOf('should') >= 0) return 'business advice chunks';
  if (text.indexOf('communication') >= 0) return 'communication and priority vocabulary';
  if (vocabText.indexOf('strategic') >= 0) return 'strategic reasoning';

  return 'recycle active vocabulary in corrected sentences';
}

function getOrCreateVocabularyWorkbookSheet_(workbook, sheetName) {
  const existing = workbook.getSheetByName(sheetName);
  return existing || workbook.insertSheet(sheetName);
}

function formatVocabularyWorkbook_(workbook) {
  workbook.getSheets().forEach(function(sheet) {
    const range = sheet.getDataRange();
    const values = range.getValues();

    if (!values || !values.length) return;

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, values[0].length)
      .setFontWeight('bold')
      .setBackground('#065f46')
      .setFontColor('#ffffff');

    range.setWrap(true);

    for (let col = 1; col <= values[0].length; col++) {
      sheet.autoResizeColumn(col);
    }
  });
}

function moveFileToVocabularyFolder_(fileId) {
  const targetFolder = DriveApp.getFolderById(ENGLISH_OS_FOLDERS.vocabularyIntelligence);
  const file = DriveApp.getFileById(fileId);
  targetFolder.addFile(file);

  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    // In shared drives or restricted environments this can fail harmlessly.
  }
}
