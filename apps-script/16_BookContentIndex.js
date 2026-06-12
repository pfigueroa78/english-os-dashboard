const BOOK_CONTENT_INDEX_SHEET_NAME = 'Book Content Index';

function getBookContentIndex_(ss, params) {
  ensureBookContentIndexSheet_(ss);

  const unit = String(params.unit || params.unitNumber || '').trim();
  const classNumber = String(params.classNumber || params.class || '').trim();
  const limit = Number(params.limit || 20);

  const rows = sheetRowsAsObjects_(ss, BOOK_CONTENT_INDEX_SHEET_NAME);

  const items = rows
    .map(row => ({
      unit: String(row['Unit'] || '').trim(),
      classNumber: String(row['Class'] || '').trim(),
      bookPages: String(row['Book Pages'] || '').trim(),
      pdfPages: String(row['PDF Pages'] || '').trim(),
      lesson: String(row['Lesson'] || '').trim(),
      section: String(row['Section'] || '').trim(),
      skill: String(row['Skill'] || '').trim(),
      grammarFocus: String(row['Grammar Focus'] || '').trim(),
      vocabularyFocus: String(row['Vocabulary Focus'] || '').trim(),
      speakingFocus: String(row['Speaking Focus'] || '').trim(),
      writingFocus: String(row['Writing Focus'] || '').trim(),
      listeningFocus: String(row['Listening Focus'] || '').trim(),
      readingFocus: String(row['Reading Focus'] || '').trim(),
      classSummary: String(row['Class Summary'] || '').trim(),
      keyLanguage: String(row['Key Language'] || '').trim(),
      exerciseGuidance: String(row['Exercise Guidance'] || '').trim(),
      sourceBookPdfId: String(row['Source Book PDF ID'] || '').trim(),
      sourceStatus: String(row['Source Status'] || '').trim()
    }))
    .filter(item => item.unit || item.classNumber)
    .filter(item => !unit || item.unit === unit)
    .filter(item => !classNumber || item.classNumber === classNumber)
    .slice(0, limit || 20);

  return {
    ok: true,
    action: 'getBookContentIndex',
    source: BOOK_CONTENT_INDEX_SHEET_NAME,
    unit: unit,
    classNumber: classNumber,
    total: items.length,
    items: items
  };
}

function ensureBookContentIndexSheet_(ss) {
  const headers = [
    'Unit',
    'Class',
    'Book Pages',
    'PDF Pages',
    'Lesson',
    'Section',
    'Skill',
    'Grammar Focus',
    'Vocabulary Focus',
    'Speaking Focus',
    'Writing Focus',
    'Listening Focus',
    'Reading Focus',
    'Class Summary',
    'Key Language',
    'Exercise Guidance',
    'Source Book PDF ID',
    'Source Status'
  ];

  return getOrCreateSheet_(ss, BOOK_CONTENT_INDEX_SHEET_NAME, headers);
}
