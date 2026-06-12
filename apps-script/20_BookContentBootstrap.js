// Populates Book Content Index from Course Class Index.
// This creates one structured row per English OS class using the source page mapping.

function populateBookContentIndex_(ss, params) {
  const sourceRows = sheetRowsAsObjects_(ss, 'Course Class Index')
    .filter(row => String(row['Unit'] || '').trim() && String(row['Class'] || '').trim());

  const sheet = ensureBookContentIndexSheet_(ss);
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

  const values = [headers];

  sourceRows.forEach(row => {
    const unit = String(row['Unit'] || '').trim();
    const classNumber = String(row['Class'] || '').trim();
    const position = ((Number(classNumber) - 1) % 7) + 1;
    const specialClass = String(row['Special Class'] || '').trim();
    const notes = String(row['Notes'] || '').trim();
    const sourceBookPdfId = String(row['Source Book PDF ID'] || '').trim();

    const bookPages = row['Book Initial Page'] && row['Book Final Page']
      ? row['Book Initial Page'] + '-' + row['Book Final Page']
      : specialClass || '';

    const pdfPages = row['PDF Initial Page'] && row['PDF Final Page']
      ? row['PDF Initial Page'] + '-' + row['PDF Final Page']
      : specialClass || '';

    const template = buildBookContentTemplate_(unit, classNumber, position, specialClass, notes, bookPages, pdfPages);

    values.push([
      unit,
      classNumber,
      bookPages,
      pdfPages,
      template.lesson,
      template.section,
      template.skill,
      template.grammarFocus,
      template.vocabularyFocus,
      template.speakingFocus,
      template.writingFocus,
      template.listeningFocus,
      template.readingFocus,
      template.classSummary,
      template.keyLanguage,
      template.exerciseGuidance,
      sourceBookPdfId,
      template.sourceStatus
    ]);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);

  return {
    ok: true,
    action: 'populateBookContentIndex',
    source: 'Course Class Index',
    target: 'Book Content Index',
    rowsWritten: values.length - 1
  };
}

function buildBookContentTemplate_(unit, classNumber, position, specialClass, notes, bookPages, pdfPages) {
  if (specialClass === 'Grammar Plus') {
    return {
      lesson: notes === 'Communication review' ? 'Grammar Plus / Communication Review' : 'Grammar Plus',
      section: 'Grammar consolidation',
      skill: 'Grammar, controlled practice, correction',
      grammarFocus: 'Consolidate the grammar from the previous lesson block.',
      vocabularyFocus: 'Recycle Unit ' + unit + ' vocabulary.',
      speakingFocus: 'Produce corrected examples using the target structures.',
      writingFocus: '',
      listeningFocus: '',
      readingFocus: '',
      classSummary: 'Grammar consolidation class for Unit ' + unit + '. Use it to stabilize accuracy before moving on.',
      keyLanguage: 'Use accurate forms from the unit before expanding into longer answers.',
      exerciseGuidance: 'Do not advance until the learner can produce accurate examples and complete the required practice.',
      sourceStatus: 'structured_from_course_index_pending_pdf_enrichment'
    };
  }

  if (specialClass === 'Video Class') {
    return {
      lesson: notes === 'Communication review' ? 'Video Class / Communication Review' : 'Video Class',
      section: 'Integrated video review',
      skill: 'Listening, speaking, review',
      grammarFocus: 'Review Unit ' + unit + ' grammar.',
      vocabularyFocus: 'Review Unit ' + unit + ' vocabulary.',
      speakingFocus: 'Summarize, react, and connect video content to personal/professional experience.',
      writingFocus: '',
      listeningFocus: 'Video comprehension.',
      readingFocus: '',
      classSummary: 'Integrated review class for Unit ' + unit + ' using the video resource when available.',
      keyLanguage: 'In the video, they talk about...; I agree because...; This reminds me of...',
      exerciseGuidance: 'Use as a checkpoint before moving to the next unit.',
      sourceStatus: 'structured_from_course_index_video_pending_enrichment'
    };
  }

  const lesson = position <= 2 ? 'Lesson A' : 'Lesson B';
  const extension = position === 2 || position === 5;

  return {
    lesson: extension ? lesson + ' extension' : lesson,
    section: 'Student Book page range',
    skill: extension ? 'Listening, speaking, reading/writing' : 'Vocabulary, grammar, speaking',
    grammarFocus: 'Extract exact grammar focus from Student Book pages ' + bookPages + '.',
    vocabularyFocus: 'Extract vocabulary from Student Book pages ' + bookPages + '.',
    speakingFocus: 'Guided speaking based on the Student Book prompts.',
    writingFocus: extension ? 'Short written production based on the lesson.' : '',
    listeningFocus: extension ? 'Listening practice if audio resource is available.' : '',
    readingFocus: extension ? 'Reading practice from the Student Book page range if present.' : '',
    classSummary: 'Unit ' + unit + ', Class ' + classNumber + ' anchored to Student Book pages ' + bookPages + ' and PDF pages ' + pdfPages + '.',
    keyLanguage: 'Use the target language from the indexed page range. Do not invent content outside the pages.',
    exerciseGuidance: 'Teach from the indexed pages, then ask controlled practice before advancing.',
    sourceStatus: 'structured_from_course_index_pending_pdf_enrichment'
  };
}
