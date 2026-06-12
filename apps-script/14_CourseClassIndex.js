const COURSE_CLASS_INDEX_SHEET_NAME = 'Course Class Index';

function getCourseClassIndex_(ss, params) {
  const rows = sheetRowsAsObjects_(ss, COURSE_CLASS_INDEX_SHEET_NAME);

  const requestedUnit = Number(params.unit || params.unitNumber || 0);
  const requestedClass = Number(params.classNumber || params.class || 0);

  const items = rows
    .map(row => ({
      unit: Number(row['Unit'] || 0),
      classNumber: Number(row['Class'] || 0),
      pdfInitialPage: row['PDF Initial Page'] || '',
      pdfFinalPage: row['PDF Final Page'] || '',
      bookInitialPage: row['Book Initial Page'] || '',
      bookFinalPage: row['Book Final Page'] || '',
      specialClass: row['Special Class'] || '',
      notes: row['Notes'] || '',
      sourceIndexFileId: row['Source Index File ID'] || '',
      sourceBookPdfId: row['Source Book PDF ID'] || '',
      sourceIndexTitle: row['Source Index Title'] || '',
      sourceBookTitle: row['Source Book Title'] || ''
    }))
    .filter(item => item.unit && item.classNumber)
    .filter(item => !requestedUnit || item.unit === requestedUnit)
    .filter(item => !requestedClass || item.classNumber === requestedClass);

  return {
    ok: true,
    action: 'getCourseClassIndex',
    source: COURSE_CLASS_INDEX_SHEET_NAME,
    unit: requestedUnit || '',
    classNumber: requestedClass || '',
    total: items.length,
    items: items
  };
}
