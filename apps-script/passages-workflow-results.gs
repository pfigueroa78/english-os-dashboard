/**
 * Passages workflow result logger for Google Sheets.
 *
 * Integration required in the existing doGet/doPost router:
 * if (action === 'appendPassagesWorkflowResult') {
 *   return jsonResponse_(appendPassagesWorkflowResult_(payload || data.payload || data));
 * }
 *
 * This file uses the existing English OS sheet resolver when available.
 */

const PASSAGES_WORKFLOW_RESULTS_SHEET = 'Passages Workflow Results';
const PASSAGES_CONTRACT_AUDIT_SHEET = 'Passages Contract Audit';
const PASSAGES_VECTOR_REFRESH_SHEET = 'Passages Vector Refresh';

function getPassagesWorkflowSpreadsheet_() {
  if (typeof getEnglishOSSheetId_ === 'function') {
    return SpreadsheetApp.openById(getEnglishOSSheetId_());
  }

  if (typeof ENGLISH_OS_SHEET_ID !== 'undefined' && ENGLISH_OS_SHEET_ID) {
    return SpreadsheetApp.openById(ENGLISH_OS_SHEET_ID);
  }

  throw new Error('Missing spreadsheet resolver. Define getEnglishOSSheetId_() or ENGLISH_OS_SHEET_ID.');
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1)).getValues()[0];
  const hasHeaders = existingHeaders.some(function(value) { return String(value || '').trim(); });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function stringifyForSheet_(value, maxLength) {
  const limit = maxLength || 45000;
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? text.slice(0, limit) : text;
}

function appendPassagesWorkflowResult_(payload) {
  if (!payload) throw new Error('Missing payload.');

  const spreadsheet = getPassagesWorkflowSpreadsheet_();
  const summary = payload.summary || {};
  const workflow = String(payload.workflow || '');
  const unit = String(payload.unit || '');
  const classNumber = String(payload.classNumber || '');
  const status = String(payload.status || '');
  const runUrl = String(payload.runUrl || '');
  const createdAt = String(payload.createdAt || new Date().toISOString());

  const summarySheet = getOrCreateSheet_(spreadsheet, PASSAGES_WORKFLOW_RESULTS_SHEET, [
    'Created At',
    'Workflow',
    'Status',
    'Unit',
    'Class',
    'Repository',
    'SHA',
    'Run ID',
    'Run URL',
    'Knowledge Path',
    'Summary JSON',
    'Markdown Preview'
  ]);

  summarySheet.appendRow([
    createdAt,
    workflow,
    status,
    unit,
    classNumber,
    payload.repository || '',
    payload.sha || '',
    payload.runId || '',
    runUrl,
    payload.knowledgePath || '',
    stringifyForSheet_(summary, 20000),
    stringifyForSheet_(payload.markdown || '', 45000)
  ]);

  if (payload.audit && Array.isArray(payload.audit.results)) {
    appendPassagesAuditRows_(spreadsheet, payload);
  }

  if (payload.diagnostic) {
    appendPassagesVectorRefreshRow_(spreadsheet, payload);
  }

  return {
    ok: true,
    workflow: workflow,
    status: status,
    unit: unit,
    classNumber: classNumber,
    runUrl: runUrl
  };
}

function appendPassagesAuditRows_(spreadsheet, payload) {
  const sheet = getOrCreateSheet_(spreadsheet, PASSAGES_CONTRACT_AUDIT_SHEET, [
    'Created At',
    'Run ID',
    'Run URL',
    'Unit',
    'Filename',
    'Lesson Type',
    'Lesson Title',
    'OK',
    'Issues Count',
    'Warnings Count',
    'Contract Sections',
    'Detected Sections',
    'Expected Book Pages',
    'Detected Book Pages',
    'Expected PDF Pages',
    'Detected PDF Pages',
    'Issues',
    'Warnings'
  ]);

  const createdAt = String(payload.createdAt || new Date().toISOString());
  const rows = payload.audit.results.map(function(result) {
    const detected = result.detected || {};
    const metadata = result.metadata || {};
    const contract = result.contract || {};
    const issues = result.issues || [];
    const warnings = result.warnings || [];

    return [
      createdAt,
      payload.runId || '',
      payload.runUrl || '',
      payload.unit || metadata.unit || '',
      result.filename || '',
      metadata.lessonType || '',
      metadata.lessonTitle || '',
      result.ok === true,
      issues.length,
      warnings.length,
      contract.sections || '',
      (detected.sections || []).join(' + '),
      (detected.expectedBookPages || []).join(', '),
      (detected.bookPages || []).join(', '),
      (detected.expectedPdfPages || []).join(', '),
      (detected.pdfPages || []).join(', '),
      issues.join('\n'),
      warnings.join('\n')
    ];
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function appendPassagesVectorRefreshRow_(spreadsheet, payload) {
  const diagnostic = payload.diagnostic || {};
  const env = diagnostic.env || {};
  const expected = diagnostic.expected || {};
  const fileSearch = diagnostic.fileSearch || {};
  const detected = fileSearch.detected || {};

  const sheet = getOrCreateSheet_(spreadsheet, PASSAGES_VECTOR_REFRESH_SHEET, [
    'Created At',
    'Run ID',
    'Run URL',
    'Status',
    'Unit',
    'Class',
    'Global Class',
    'Vector Store ID Masked',
    'Vercel Commit SHA',
    'Vercel Deployment ID',
    'Expected File Found',
    'Contract Found',
    'Active Sections',
    'Active Grammar Focus',
    'Diagnosis',
    'Top Filenames JSON'
  ]);

  sheet.appendRow([
    payload.createdAt || new Date().toISOString(),
    payload.runId || '',
    payload.runUrl || '',
    payload.status || '',
    payload.unit || expected.unit || '',
    payload.classNumber || expected.localClass || '',
    expected.globalClass || '',
    env.vectorStoreIdMasked || '',
    env.vercelGitCommitSha || '',
    env.vercelDeploymentId || '',
    fileSearch.expectedFileFound === true,
    fileSearch.contractFound === true,
    detected.activeClassSectionNames || '',
    detected.activeClassGrammarFocus || '',
    diagnostic.diagnosis || '',
    stringifyForSheet_(fileSearch.filenames || [], 20000)
  ]);
}
