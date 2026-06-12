function listDriveUnitResources(unitText) {
  return listDriveUnitResources_(unitText);
}

function testListDriveUnitResources() {
  return testListDriveUnitResources_();
}

function listDriveUnitResources_(unitText) {
  const unitNumber = extractUnitNumber_(unitText);

  if (!unitNumber) {
    return [];
  }

  const resources = [];

  resources.push.apply(resources, listDriveUnitVideos_(unitNumber));
  resources.push.apply(resources, listDriveUnitAudios_(unitNumber));

  return resources.sort(function(a, b) {
    const typeOrder = {
      video: 1,
      audio: 2,
      document: 3,
      link: 4
    };

    const aType = typeOrder[a.type] || 99;
    const bType = typeOrder[b.type] || 99;

    if (aType !== bType) {
      return aType - bType;
    }

    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function extractUnitNumber_(unitText) {
  const text = String(unitText || '').trim();

  if (!text) {
    return null;
  }

  let match = text.match(/Unit\s*0?(\d{1,2})/i);

  if (match && match[1]) {
    return Number(match[1]);
  }

  match = text.match(/U0?(\d{1,2})/i);

  if (match && match[1]) {
    return Number(match[1]);
  }

  return null;
}

function padUnitNumber_(unitNumber) {
  return String(unitNumber).padStart(2, '0');
}

function listDriveUnitVideos_(unitNumber) {
  const resources = [];
  const unitCode = padUnitNumber_(unitNumber);
  const folder = DriveApp.getFolderById(getCambridgeVideosFolderId_());
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();

    const isCurrentUnitVideo =
      name.match(new RegExp('L1U' + unitCode, 'i')) ||
      name.match(new RegExp('U' + unitCode, 'i'));

    if (!isCurrentUnitVideo) {
      continue;
    }

    const mimeType = file.getMimeType();

    if (!String(mimeType).toLowerCase().startsWith('video/')) {
      continue;
    }

    resources.push({
      resourceId: file.getId(),
      title: name,
      description: 'Video resource for Unit ' + unitNumber + '.',
      type: 'video',
      unitNumber: unitNumber,
      unitCode: 'U' + unitCode,
      section: '',
      page: '',
      exercise: '',
      url: file.getUrl(),
      embedUrl: buildDrivePreviewUrl_(file.getId()),
      provider: 'Google Drive',
      mimeType: mimeType,
      order: 10
    });
  }

  return resources;
}

function listDriveUnitAudios_(unitNumber) {
  const unitCode = padUnitNumber_(unitNumber);
  const resources = [];

  const audioRoot = DriveApp.getFolderById(getCambridgeAudiosFolderId_());
  const folders = audioRoot.getFolders();

  let unitFolder = null;
  const expectedFolderText = 'Unit ' + unitCode;

  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();

    if (
      name.toLowerCase().indexOf(expectedFolderText.toLowerCase()) >= 0 ||
      name.toLowerCase().indexOf(('Unit 0' + unitNumber).toLowerCase()) >= 0 ||
      name.toLowerCase().indexOf(('Unit ' + unitNumber).toLowerCase()) >= 0
    ) {
      unitFolder = folder;
      break;
    }
  }

  if (!unitFolder) {
    return resources;
  }

  const files = unitFolder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    const mimeType = file.getMimeType();

    const isAudio =
      String(mimeType).toLowerCase().startsWith('audio/') ||
      name.toLowerCase().endsWith('.mp3') ||
      name.toLowerCase().endsWith('.m4a') ||
      name.toLowerCase().endsWith('.wav');

    if (!isAudio) {
      continue;
    }

    const parsed = parsePassagesAudioName_(name);

    resources.push({
      resourceId: file.getId(),
      title: name,
      description: buildAudioDescription_(unitNumber, parsed),
      type: 'audio',
      unitNumber: unitNumber,
      unitCode: 'U' + unitCode,
      section: parsed.section || '',
      page: parsed.page || '',
      exercise: parsed.exercise || '',
      exercisePart: parsed.exercisePart || '',
      url: file.getUrl(),
      embedUrl: buildDrivePreviewUrl_(file.getId()),
      provider: 'Google Drive',
      mimeType: mimeType,
      order: 20 + Number(parsed.page || 0)
    });
  }

  return resources;
}

function parsePassagesAudioName_(fileName) {
  const name = String(fileName || '');

  const parsed = {
    unit: '',
    section: '',
    page: '',
    exercise: '',
    exercisePart: ''
  };

  const unitMatch = name.match(/U(\d{2})([A-Z]?)/i);
  if (unitMatch) {
    parsed.unit = unitMatch[1] || '';
    parsed.section = unitMatch[2] || '';
  }

  const pageMatch = name.match(/P(\d{3})/i);
  if (pageMatch) {
    parsed.page = pageMatch[1] || '';
  }

  const exerciseMatch = name.match(/Ex(\d+)_?([A-Z]?)/i);
  if (exerciseMatch) {
    parsed.exercise = exerciseMatch[1] || '';
    parsed.exercisePart = exerciseMatch[2] || '';
  }

  return parsed;
}

function buildAudioDescription_(unitNumber, parsed) {
  const parts = ['Audio resource for Unit ' + unitNumber];

  if (parsed.section) {
    parts.push('Section ' + parsed.section);
  }

  if (parsed.page) {
    parts.push('Page ' + parsed.page);
  }

  if (parsed.exercise) {
    parts.push('Exercise ' + parsed.exercise + (parsed.exercisePart ? parsed.exercisePart : ''));
  }

  return parts.join(' · ');
}

function buildDrivePreviewUrl_(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/preview';
}

function testListDriveUnitResources_() {
  const unitText = getScriptProperty_('TEST_CURRENT_UNIT');
  const resources = listDriveUnitResources_(unitText);
  Logger.log(JSON.stringify(resources, null, 2));
}
