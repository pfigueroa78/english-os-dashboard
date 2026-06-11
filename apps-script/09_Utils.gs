function getOrCreateSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const existingColumnCount = Math.max(sheet.getLastColumn(), headers.length);
  const firstRow = sheet.getRange(1, 1, 1, existingColumnCount).getValues()[0];
  const isEmpty = firstRow.every(value => value === '');

  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const currentHeaders = firstRow.slice(0, headers.length).map(value => String(value || '').trim());
  const expectedHeaders = headers.map(value => String(value || '').trim());
  const headersMatch = expectedHeaders.every((header, index) => currentHeaders[index] === header);

  if (!headersMatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function sheetRowsAsObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];

  return values.slice(1).map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  });
}

function sheetRowsAsObjectsWithRow_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];

  return values.slice(1).map((row, rowIndex) => {
    const obj = {
      __rowNumber: rowIndex + 2
    };

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  });
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function generateLearnerId_(email) {
  const base = email || ('learner-' + new Date().getTime());

  const hash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base)
  ).substring(0, 10);

  return 'L-' + hash;
}

function activityDate_(payload) {
  return payload.date || today_();
}

function today_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}

function timestamp_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
}

function formatCellValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return String(value || '');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeEnglishOS_() {
  const doc = DocumentApp.create('English OS Authorization Test - ' + timestamp_());
  doc.getBody().appendParagraph('Authorization test for English OS document generation.');
  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  const folder = DriveApp.getFolderById(ENGLISH_OS_FOLDERS.dailySessions);
  folder.addFile(file);

  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    // Ignore if not allowed.
  }

  Logger.log(doc.getUrl());
}

function authorizeEnglishOS() {
  return authorizeEnglishOS_();
}

function testListUsers() {
  Logger.log(JSON.stringify(listUsers_(), null, 2));
}

function testLogAIUsage() {
  const ss = SpreadsheetApp.openById(getEnglishOSSheetId_());

  const result = logAIUsage_(ss, {
    userEmail: getScriptProperty_('TEST_USER_EMAIL'),
    learnerId: getScriptProperty_('TEST_LEARNER_ID'),
    agent: 'coach',
    model: 'gpt-5.4-mini',
    inputTokens: 1500,
    outputTokens: 700,
    totalTokens: 2200,
    estimatedCostUSD: 0.0026,
    activity: 'Manual AI Usage test',
    requestSource: 'Apps Script test',
    notes: 'Testing AI Usage logging'
  });

  Logger.log(JSON.stringify(result, null, 2));
}

function testDoPostLogAIUsage() {
  const url = getScriptProperty_('ENGLISH_OS_WEB_APP_URL');

  const payload = {
    token: getSecretToken_(),
    action: 'logAIUsage',
    aiUsage: {
      timestamp: new Date().toISOString(),
      userEmail: getScriptProperty_('TEST_USER_EMAIL'),
      learnerId: getScriptProperty_('TEST_LEARNER_ID'),
      agent: 'coach',
      model: 'gpt-5.4-mini',
      inputTokens: 2000,
      outputTokens: 500,
      totalTokens: 2500,
      estimatedCostUSD: 0.003,
      activity: 'Web App doPost AI Usage test',
      requestSource: 'Apps Script UrlFetchApp test',
      notes: 'Testing deployed doPost action'
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}
