const DEFAULT_LEARNER_UNIT = 'Passages Level 1 - Unit 1: Friends and family';
const DEFAULT_LEARNER_LESSON = 'Unit 1 onboarding diagnostic and first speaking practice';
const DEFAULT_LEARNER_CEFR = 'B1';

function ensureUser_(ss, payload) {
  const sheet = getOrCreateSheet_(ss, 'Users', SHEET_HEADERS.users);

  const profile = payload.userProfile || {};
  const values = sheet.getDataRange().getValues();
  const header = values[0] || [];

  const emailIdx = header.indexOf('User Email');
  const learnerIdx = header.indexOf('Learner ID');

  const inputEmail = normalizeEmail_(payload.userEmail || profile.userEmail || '');
  let inputLearnerId = String(payload.learnerId || profile.learnerId || '').trim();

  if (!inputLearnerId) {
    inputLearnerId = generateLearnerId_(inputEmail);
  }

  const userData = buildUserData_(payload, profile, inputEmail, inputLearnerId);

  for (let i = 1; i < values.length; i++) {
    const rowEmail = normalizeEmail_(values[i][emailIdx] || '');
    const rowLearnerId = String(values[i][learnerIdx] || '').trim();

    if (
      (inputEmail && rowEmail === inputEmail) ||
      (inputLearnerId && rowLearnerId === inputLearnerId)
    ) {
      updateUserRow_(sheet, header, i + 1, userData);

      return {
        userEmail: rowEmail || inputEmail,
        learnerId: rowLearnerId || inputLearnerId,
        created: false
      };
    }
  }

  sheet.appendRow([
    userData.userEmail,
    userData.learnerId,
    userData.name,
    userData.whatsAppNumber,
    userData.preferredChannel || 'Email',
    userData.whatsAppOptIn === true ? true : false,
    userData.currentUnit,
    userData.currentLesson,
    userData.currentCEFR,
    userData.lastActivity || activityDate_(payload),
    userData.active === false ? false : true,
    userData.notes || 'Created automatically by English OS Logger',
    userData.role || 'learner',
    userData.createdAt || today_(),
    userData.lastLogin || today_(),
    userData.accessSource || 'English OS'
  ]);

  return {
    userEmail: userData.userEmail,
    learnerId: userData.learnerId,
    created: true
  };
}

function buildUserData_(payload, profile, inputEmail, inputLearnerId) {
  return {
    userEmail: inputEmail,
    learnerId: inputLearnerId,
    name: profile.name || payload.userName || payload.name || '',
    whatsAppNumber: profile.whatsAppNumber || profile.whatsappNumber || payload.whatsAppNumber || payload.whatsappNumber || '',
    preferredChannel: profile.preferredChannel || payload.preferredChannel || '',
    whatsAppOptIn: profile.whatsAppOptIn === true || profile.whatsappOptIn === true || payload.whatsAppOptIn === true || payload.whatsappOptIn === true,
    currentUnit: profile.currentUnit || payload.unit || DEFAULT_LEARNER_UNIT,
    currentLesson: profile.currentLesson || payload.lesson || DEFAULT_LEARNER_LESSON,
    currentCEFR: profile.currentCEFR || profile.currentCefr || payload.currentCEFR || payload.currentCefr || DEFAULT_LEARNER_CEFR,
    lastActivity: profile.lastActivity || payload.date || today_(),
    active: profile.active === false || payload.active === false ? false : true,
    notes: profile.notes || payload.notes || '',
    role: profile.role || payload.role || 'learner',
    createdAt: profile.createdAt || payload.createdAt || today_(),
    lastLogin: profile.lastLogin || payload.lastLogin || today_(),
    accessSource: profile.accessSource || payload.accessSource || ''
  };
}

function updateUserRow_(sheet, header, rowNumber, userData) {
  const updates = {
    'User Email': userData.userEmail,
    'Learner ID': userData.learnerId,
    'Name': userData.name,
    'WhatsApp Number': userData.whatsAppNumber,
    'Preferred Channel': userData.preferredChannel,
    'WhatsApp Opt-in': userData.whatsAppOptIn,
    'Current Unit': userData.currentUnit,
    'Current Lesson': userData.currentLesson,
    'Current CEFR': userData.currentCEFR,
    'Last Activity': userData.lastActivity,
    'Active': userData.active,
    'Notes': userData.notes,
    'Last Login': userData.lastLogin || today_(),
    'Access Source': userData.accessSource
  };

  const roleIdx = header.indexOf('Role');
  if (roleIdx >= 0) {
    const existingRole = String(sheet.getRange(rowNumber, roleIdx + 1).getValue() || '').trim();

    if (!existingRole) {
      updates['Role'] = userData.role || 'learner';
    }
  }

  const createdAtIdx = header.indexOf('Created At');
  if (createdAtIdx >= 0) {
    const existingCreatedAt = sheet.getRange(rowNumber, createdAtIdx + 1).getValue();

    if (!existingCreatedAt) {
      updates['Created At'] = userData.createdAt || today_();
    }
  }

  Object.keys(updates).forEach(columnName => {
    const idx = header.indexOf(columnName);
    const value = updates[columnName];

    if (idx >= 0 && value !== '' && value !== null && value !== undefined) {
      sheet.getRange(rowNumber, idx + 1).setValue(value);
    }
  });
}

function touchUser_(ss, payload) {
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return;

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const profile = payload.userProfile || {};
  const header = values[0];

  const emailIdx = header.indexOf('User Email');
  const learnerIdx = header.indexOf('Learner ID');

  const email = normalizeEmail_(payload.userEmail || profile.userEmail || '');
  const learnerId = String(payload.learnerId || profile.learnerId || '').trim();

  const userData = buildUserData_(payload, profile, email, learnerId);
  userData.lastActivity = payload.date || profile.lastActivity || today_();

  for (let i = 1; i < values.length; i++) {
    const rowEmail = normalizeEmail_(values[i][emailIdx] || '');
    const rowLearnerId = String(values[i][learnerIdx] || '').trim();

    if ((email && rowEmail === email) || (learnerId && rowLearnerId === learnerId)) {
      updateUserRow_(sheet, header, i + 1, userData);
      return;
    }
  }
}

function findUser_(ss, userEmail, learnerId) {
  const rows = sheetRowsAsObjects_(ss, 'Users');

  return rows.find(row => {
    const rowEmail = normalizeEmail_(row['User Email'] || '');
    const rowLearnerId = String(row['Learner ID'] || '').trim();

    return (
      (userEmail && rowEmail === userEmail) ||
      (learnerId && rowLearnerId === learnerId)
    );
  }) || null;
}

function deleteUser_(ss, params) {
  const sheet = ss.getSheetByName('Users');

  if (!sheet) {
    return {
      ok: false,
      action: 'deleteUser',
      error: 'Users sheet not found.'
    };
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      ok: true,
      action: 'deleteUser',
      deleted: false,
      message: 'No users to delete.'
    };
  }

  const header = values[0];
  const emailIdx = header.indexOf('User Email');
  const learnerIdx = header.indexOf('Learner ID');

  const targetEmail = normalizeEmail_(params.userEmail || params.email || '');
  const targetLearnerId = String(params.learnerId || '').trim();

  if (!targetEmail && !targetLearnerId) {
    return {
      ok: false,
      action: 'deleteUser',
      error: 'Missing userEmail or learnerId.'
    };
  }

  for (let i = values.length - 1; i >= 1; i--) {
    const rowEmail = normalizeEmail_(values[i][emailIdx] || '');
    const rowLearnerId = String(values[i][learnerIdx] || '').trim();

    if (
      (targetEmail && rowEmail === targetEmail) ||
      (targetLearnerId && rowLearnerId === targetLearnerId)
    ) {
      sheet.deleteRow(i + 1);

      return {
        ok: true,
        action: 'deleteUser',
        deleted: true,
        userEmail: rowEmail,
        learnerId: rowLearnerId,
        rowNumber: i + 1
      };
    }
  }

  return {
    ok: true,
    action: 'deleteUser',
    deleted: false,
    message: 'User not found.',
    userEmail: targetEmail,
    learnerId: targetLearnerId
  };
}
