function ensureAIUsageSheet_(ss) {
  const headers = [
    'Timestamp',
    'User Email',
    'Learner ID',
    'Agent',
    'Model',
    'Input Tokens',
    'Output Tokens',
    'Total Tokens',
    'Estimated Cost USD',
    'Activity',
    'Request Source',
    'Notes'
  ];

  let sheet = ss.getSheetByName('AI Usage');

  if (!sheet) {
    sheet = ss.insertSheet('AI Usage');
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
    return sheet;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (!existingHeaders || existingHeaders.length < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
  }

  return sheet;
}

function logAIUsage_(ss, usagePayload) {
  const sheet = ensureAIUsageSheet_(ss);

  const timestamp = usagePayload.timestamp || new Date();
  const userEmail = normalizeEmail_(usagePayload.userEmail || '');
  const learnerId = String(usagePayload.learnerId || userEmail || '').trim();
  const agent = usagePayload.agent || 'coach';
  const model = usagePayload.model || '';
  const inputTokens = Number(usagePayload.inputTokens || 0);
  const outputTokens = Number(usagePayload.outputTokens || 0);
  const totalTokens = Number(usagePayload.totalTokens || inputTokens + outputTokens);
  const estimatedCostUSD = Number(usagePayload.estimatedCostUSD || 0);
  const activity = usagePayload.activity || '';
  const requestSource = usagePayload.requestSource || 'Dashboard';
  const notes = usagePayload.notes || '';

  sheet.appendRow([
    timestamp,
    userEmail,
    learnerId,
    agent,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUSD,
    activity,
    requestSource,
    notes
  ]);

  return {
    userEmail,
    learnerId,
    agent,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUSD
  };
}
