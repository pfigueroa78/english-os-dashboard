// Book content actions for English OS.
// This file is intentionally loaded after 16_BookContentIndex.js.

function getClassContent_(ss, params) {
  const unit = String(params.unit || params.unitNumber || '').trim();
  const classNumber = String(params.classNumber || params.class || '').trim();

  if (!unit && !classNumber) {
    return { ok: false, action: 'getClassContent', error: 'Missing unit or classNumber.' };
  }

  const classIndex = getCourseClassIndex_(ss, { unit: unit, classNumber: classNumber });
  const bookContent = getBookContentIndex_(ss, { unit: unit, classNumber: classNumber, limit: 10 });
  const effectiveUnit = unit || (classIndex.items && classIndex.items[0] ? String(classIndex.items[0].unit || '') : '');
  const resources = effectiveUnit ? listDriveUnitResources('Unit ' + effectiveUnit) : [];

  return {
    ok: true,
    action: 'getClassContent',
    unit: effectiveUnit,
    classNumber: classNumber,
    courseClassIndex: classIndex.items || [],
    bookContentIndex: bookContent.items || [],
    driveResources: resources,
    canAdvance: false,
    advancePolicy: 'Advance requires explicit learner request and approved exercises.'
  };
}

function getCurrentClassContent_(ss, params) {
  const learningStateResult = getLearningState_(ss, params);
  const state = learningStateResult.learningState;

  if (!state) {
    return { ok: false, action: 'getCurrentClassContent', error: 'Learning State not found.' };
  }

  const content = getClassContent_(ss, { unit: state.currentUnit, classNumber: state.currentClass });

  return {
    ok: true,
    action: 'getCurrentClassContent',
    learningState: state,
    currentClassIndex: learningStateResult.currentClassIndex || null,
    courseClassIndex: content.courseClassIndex || [],
    bookContentIndex: content.bookContentIndex || [],
    driveResources: content.driveResources || [],
    canAdvance: state.currentClassStatus === 'approved' || state.exerciseApprovalStatus === 'approved',
    advancePolicy: 'Do not advance automatically. Advance only after explicit request or exercise approval.'
  };
}
