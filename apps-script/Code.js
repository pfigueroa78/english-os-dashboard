const OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');

function requireCodeConfig_(key, value) {
  if (!value) {
    throw new Error('Missing Script Property: ' + key);
  }

  return value;
}

function getOpenAIApiKey_() {
  return requireCodeConfig_('OPENAI_API_KEY', OPENAI_API_KEY);
}

function getSheetId_() {
  return requireCodeConfig_('SHEET_ID', SHEET_ID);
}

function sendDailyEnglishReportsAllUsers() {
  const ss = SpreadsheetApp.openById(getSheetId_());

  const usersSheet = ss.getSheetByName('Users');
  const dailyLogsSheet = ss.getSheetByName('Daily Logs');
  const recurringSheet = ss.getSheetByName('Recurring Mistakes');
  const vocabSheet = ss.getSheetByName('Vocabulary Intelligence');
  const progressSheet = ss.getSheetByName('Weekly Progress');

  const users = rowsToObjects_(usersSheet.getDataRange().getValues());
  const dailyLogs = rowsToObjects_(dailyLogsSheet.getDataRange().getValues());
  const recurring = rowsToObjects_(recurringSheet.getDataRange().getValues());
  const vocab = rowsToObjects_(vocabSheet.getDataRange().getValues());
  const progress = rowsToObjects_(progressSheet.getDataRange().getValues());

  const activeUsers = users.filter(user => {
    const active = String(user['Active'] || '').toLowerCase();
    const email = String(user['User Email'] || '').trim();
    return email && active !== 'false';
  });

  let sent = 0;
  let failed = 0;
  const errors = [];

  activeUsers.forEach(user => {
    try {
      const userEmail = String(user['User Email'] || '').trim();
      const learnerId = String(user['Learner ID'] || userEmail).trim();

      const userDailyLogs = filterByLearner_(dailyLogs, userEmail, learnerId).slice(-10);
      const userRecurring = filterByLearner_(recurring, userEmail, learnerId).slice(-10);
      const userVocab = filterByLearner_(vocab, userEmail, learnerId).slice(-20);
      const userProgress = filterByLearner_(progress, userEmail, learnerId).slice(-5);

      const emailContent = buildDailyReportForUser_({
        user: user,
        dailyLogs: userDailyLogs,
        recurring: userRecurring,
        vocab: userVocab,
        progress: userProgress
      });

      MailApp.sendEmail({
        to: userEmail,
        subject: 'Daily English Report - ' + (user['Name'] || userEmail),
        htmlBody: emailContent
      });

      sent++;
    } catch (err) {
      failed++;
      errors.push({
        email: user['User Email'] || '',
        error: String(err && err.message ? err.message : err)
      });
    }
  });

  return {
    totalActiveUsers: activeUsers.length,
    sent,
    failed,
    errors
  };
}

function buildDailyReportForUser_(data) {
  const user = data.user;

  const learnerName = user['Name'] || 'learner';
  const currentUnit = user['Current Unit'] || 'Not specified';
  const currentLesson = user['Current Lesson'] || 'Not specified';
  const currentCEFR = user['Current CEFR'] || 'Not specified';

  const prompt = `
You are the English Daily Email Reporter for an English OS learning system.

Create a personalized daily coaching email in valid HTML.

LEARNER PROFILE:
Name: ${learnerName}
Email: ${user['User Email'] || ''}
Current Unit: ${currentUnit}
Current Lesson: ${currentLesson}
Current CEFR: ${currentCEFR}
Last Activity: ${user['Last Activity'] || ''}

DAILY LOGS:
${JSON.stringify(data.dailyLogs)}

RECURRING MISTAKES:
${JSON.stringify(data.recurring)}

VOCABULARY:
${JSON.stringify(data.vocab)}

PROGRESS:
${JSON.stringify(data.progress)}

The email must include:

1. A short motivational opening using the learner's name.
2. Latest progress summary.
3. Top 3 recurring mistakes to reinforce.
4. Grammar focus of the day.
5. Vocabulary of the day: 5 words or chunks.
6. Speaking challenge connected to the learner's current unit and lesson.
7. Listening task.
8. Writing task.
9. CEFR progress note.
10. Study plans:
   - 30-minute plan
   - 60-minute plan
   - 90-minute plan
11. Final motivational sentence.

Important rules:
- Output ONLY valid HTML.
- Use headings, short paragraphs, and bullet points.
- Use English most of the time.
- Use Spanish only for brief explanations if necessary.
- Do not invent progress if the data is empty.
- If data is missing, tell the learner what should be updated in English OS.
- Focus on speaking, listening, naturalness, collocations, and B2 fluency.
- Do not mention raw JSON, spreadsheets, or internal system names.
- Do not include private data from other learners.
`;

  const response = UrlFetchApp.fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + getOpenAIApiKey_(),
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        model: 'gpt-5',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    }
  );

  const result = JSON.parse(response.getContentText());
  return result.choices[0].message.content;
}

function rowsToObjects_(values) {
  if (!values || values.length < 2) return [];

  const headers = values[0];

  return values.slice(1).map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  });
}

function filterByLearner_(rows, userEmail, learnerId) {
  const email = String(userEmail || '').trim().toLowerCase();
  const id = String(learnerId || '').trim().toLowerCase();

  return rows.filter(row => {
    const rowEmail = String(row['User Email'] || '').trim().toLowerCase();
    const rowLearnerId = String(row['Learner ID'] || '').trim().toLowerCase();

    return rowEmail === email || rowLearnerId === id;
  });
}

function authorizeDailyReportPermissions() {
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/models', {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + getOpenAIApiKey_()
    },
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log('Mail quota: ' + MailApp.getRemainingDailyQuota());
}
