function inferTargetFolderKey_(documentType, sourceAgent) {
  const text = (String(documentType || '') + ' ' + String(sourceAgent || '')).toLowerCase();

  if (text.indexOf('evaluation') >= 0 || text.indexOf('cefr') >= 0 || text.indexOf('diagnostic') >= 0) {
    return 'englishEvaluations';
  }

  if (text.indexOf('grammar') >= 0) {
    return 'grammarSystem';
  }

  if (text.indexOf('vocabulary') >= 0 || text.indexOf('chunk') >= 0 || text.indexOf('collocation') >= 0) {
    return 'vocabularyIntelligence';
  }

  if (text.indexOf('speaking') >= 0 || text.indexOf('roleplay') >= 0 || text.indexOf('conversation') >= 0) {
    return 'speakingSystem';
  }

  if (text.indexOf('correction') >= 0 || text.indexOf('feedback') >= 0 || text.indexOf('mistake') >= 0) {
    return 'correctionsFeedback';
  }

  if (text.indexOf('listening') >= 0 || text.indexOf('audio') >= 0) {
    return 'listeningLab';
  }

  if (text.indexOf('pronunciation') >= 0 || text.indexOf('accent') >= 0) {
    return 'pronunciationLab';
  }

  if (text.indexOf('mission') >= 0 || text.indexOf('roadmap') >= 0 || text.indexOf('progress') >= 0) {
    return 'b2MissionControl';
  }

  if (text.indexOf('professional') >= 0 || text.indexOf('business') >= 0 || text.indexOf('consulting') >= 0) {
    return 'professionalEnglish';
  }

  return 'dailySessions';
}
