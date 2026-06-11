function appendDocumentQueue_(ss, payload, doc) {
  const sheet = getOrCreateSheet_(ss, 'Document Queue', SHEET_HEADERS.documentQueue);

  const targetFolderKey = doc.targetFolderKey || inferTargetFolderKey_(doc.documentType || '', payload.sourceAgent || '');
  const targetFolderId = ENGLISH_OS_FOLDERS[targetFolderKey] || doc.targetFolderId || '';
  const targetFolder = doc.targetFolder || targetFolderKey || '';

  const row = [
    timestamp_(),
    payload.userEmail || '',
    payload.learnerId || '',
    doc.documentType || '',
    payload.sourceAgent || '',
    targetFolderKey,
    targetFolderId,
    targetFolder,
    'Pending',
    '',
    '',
    doc.notes || ''
  ];

  sheet.appendRow(row);

  return {
    ok: true,
    rowNumber: sheet.getLastRow(),
    targetFolderKey: targetFolderKey,
    targetFolderId: targetFolderId
  };
}

function updateDocumentQueueRow_(ss, rowNumber, status, generatedFileUrl, notes) {
  const sheet = ss.getSheetByName('Document Queue');
  if (!sheet || !rowNumber) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const statusIdx = headers.indexOf('Status');
  const fileIdx = headers.indexOf('Generated File');
  const generatedAtIdx = headers.indexOf('Generated At');
  const notesIdx = headers.indexOf('Notes');

  if (statusIdx >= 0) sheet.getRange(rowNumber, statusIdx + 1).setValue(status || '');
  if (fileIdx >= 0) sheet.getRange(rowNumber, fileIdx + 1).setValue(generatedFileUrl || '');
  if (generatedAtIdx >= 0) sheet.getRange(rowNumber, generatedAtIdx + 1).setValue(timestamp_());
  if (notesIdx >= 0 && notes) sheet.getRange(rowNumber, notesIdx + 1).setValue(notes);
}

function processDocumentQueue_(ss, params) {
  const limit = Number(params.limit || 5);
  getOrCreateSheet_(ss, 'Document Queue', SHEET_HEADERS.documentQueue);

  const rows = sheetRowsAsObjectsWithRow_(ss, 'Document Queue');

  const pending = rows
    .filter(row => String(row['Status'] || '').toLowerCase() === 'pending')
    .slice(0, limit);

  const processed = [];

  pending.forEach(row => {
    const payload = {
      userEmail: row['User Email'] || '',
      learnerId: row['Learner ID'] || row['User Email'] || '',
      sourceAgent: row['Source Agent'] || 'English OS',
      unit: '',
      lesson: '',
      date: today_()
    };

    const doc = {
      documentType: row['Document Type'] || 'Daily Session Summary',
      targetFolderKey: row['Target Folder Key'] || inferTargetFolderKey_(row['Document Type'] || '', row['Source Agent'] || ''),
      targetFolderId: row['Target Folder ID'] || '',
      targetFolder: row['Target Folder'] || '',
      notes: row['Notes'] || '',
      generateNow: true
    };

    try {
      const created = createEnglishOSDocument_(ss, payload, doc, row.__rowNumber);
      processed.push(created);
    } catch (err) {
      updateDocumentQueueRow_(ss, row.__rowNumber, 'Error', '', String(err));

      processed.push({
        ok: false,
        rowNumber: row.__rowNumber,
        error: String(err)
      });
    }
  });

  return {
    ok: true,
    processedCount: processed.length,
    processed: processed
  };
}
