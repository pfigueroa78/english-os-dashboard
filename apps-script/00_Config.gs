const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

const SECRET_TOKEN = SCRIPT_PROPERTIES.getProperty('SECRET_TOKEN');
const ENGLISH_OS_SHEET_ID = SCRIPT_PROPERTIES.getProperty('ENGLISH_OS_SHEET_ID');
const CAMBRIDGE_ONE_FOLDER_ID = SCRIPT_PROPERTIES.getProperty('CAMBRIDGE_ONE_FOLDER_ID');
const CAMBRIDGE_AUDIOS_FOLDER_ID = SCRIPT_PROPERTIES.getProperty('CAMBRIDGE_AUDIOS_FOLDER_ID');
const CAMBRIDGE_VIDEOS_FOLDER_ID = SCRIPT_PROPERTIES.getProperty('CAMBRIDGE_VIDEOS_FOLDER_ID');

function requireConfig_(key, value) {
  if (!value) {
    throw new Error('Missing Script Property: ' + key);
  }

  return value;
}

function getScriptProperty_(key) {
  return requireConfig_(key, SCRIPT_PROPERTIES.getProperty(key));
}

function getSecretToken_() {
  return requireConfig_('SECRET_TOKEN', SECRET_TOKEN);
}

function getEnglishOSSheetId_() {
  return requireConfig_('ENGLISH_OS_SHEET_ID', ENGLISH_OS_SHEET_ID);
}

function getCambridgeOneFolderId_() {
  return requireConfig_('CAMBRIDGE_ONE_FOLDER_ID', CAMBRIDGE_ONE_FOLDER_ID);
}

function getCambridgeAudiosFolderId_() {
  return requireConfig_('CAMBRIDGE_AUDIOS_FOLDER_ID', CAMBRIDGE_AUDIOS_FOLDER_ID);
}

function getCambridgeVideosFolderId_() {
  return requireConfig_('CAMBRIDGE_VIDEOS_FOLDER_ID', CAMBRIDGE_VIDEOS_FOLDER_ID);
}

function getEnglishOSFolderId_(folderKey) {
  const propertyName = 'ENGLISH_OS_FOLDER_' + String(folderKey || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();

  return getScriptProperty_(propertyName);
}

/**
 * English OS Logger v1.3 modular
 * Responsibilities separated by file:
 * 00_Config.gs
 * 01_Router.gs
 * 02_Users.gs
 * 03_Logs.gs
 * 04_Context.gs
 * 05_MissionControl.gs
 * 06_DocumentQueue.gs
 * 07_DocumentGenerator.gs
 * 08_Folders.gs
 * 09_Utils.gs
 */

const ENGLISH_OS_FOLDERS = {
  cambridgeOne: getEnglishOSFolderId_('cambridgeOne'),
  grammarSystem: getEnglishOSFolderId_('grammarSystem'),
  vocabularyIntelligence: getEnglishOSFolderId_('vocabularyIntelligence'),
  speakingSystem: getEnglishOSFolderId_('speakingSystem'),
  correctionsFeedback: getEnglishOSFolderId_('correctionsFeedback'),
  englishEvaluations: getEnglishOSFolderId_('englishEvaluations'),
  listeningLab: getEnglishOSFolderId_('listeningLab'),
  dailySessions: getEnglishOSFolderId_('dailySessions'),
  aiEnglishAgents: getEnglishOSFolderId_('aiEnglishAgents'),
  professionalEnglish: getEnglishOSFolderId_('professionalEnglish'),
  pronunciationLab: getEnglishOSFolderId_('pronunciationLab'),
  b2MissionControl: getEnglishOSFolderId_('b2MissionControl')
};

const SHEET_HEADERS = {
  users: [
    'User Email',
    'Learner ID',
    'Name',
    'WhatsApp Number',
    'Preferred Channel',
    'WhatsApp Opt-in',
    'Current Unit',
    'Current Lesson',
    'Current CEFR',
    'Last Activity',
    'Active',
    'Notes'
  ],

  dailyLogs: [
    'User Email',
    'Learner ID',
    'Date',
    'Source Agent',
    'Unit',
    'Lesson',
    'Skill',
    'Activity',
    'Main Topic',
    'Time',
    'Summary',
    'Weakness',
    'New Vocabulary',
    'Next Action'
  ],

  mistakes: [
    'User Email',
    'Learner ID',
    'Date',
    'Source Agent',
    'Unit',
    'Lesson',
    'Skill',
    'Mistake',
    'Correction',
    'Grammar Rule',
    'Frequency',
    'Priority',
    'Example'
  ],

  vocabulary: [
    'User Email',
    'Learner ID',
    'Date',
    'Source Agent',
    'Unit',
    'Lesson',
    'Word/Chunk',
    'Meaning',
    'Example',
    'Collocation',
    'Category',
    'CEFR',
    'Status'
  ],

  progress: [
    'User Email',
    'Learner ID',
    'Date',
    'Source Agent',
    'Unit',
    'Week',
    'Speaking',
    'Grammar',
    'Listening',
    'Writing',
    'Vocabulary',
    'Pronunciation',
    'Confidence',
    'CEFR Estimate',
    'Notes'
  ],

  whatsappQueue: [
    'Created',
    'User Email',
    'Learner ID',
    'Phone',
    'Message Type',
    'Message',
    'Status',
    'Sent At',
    'Response',
    'Notes'
  ],

  documentQueue: [
    'Created',
    'User Email',
    'Learner ID',
    'Document Type',
    'Source Agent',
    'Target Folder Key',
    'Target Folder ID',
    'Target Folder',
    'Status',
    'Generated File',
    'Generated At',
    'Notes'
  ],

  missionControl: [
    'User Email',
    'Name',
    'Current Unit',
    'Current Lesson',
    'Current CEFR',
    'Last Activity',
    'Active',
    'Last GPT Used',
    'Last Session Summary',
    'Top Recurring Mistake',
    'Active Vocabulary Count',
    'Last Evaluation CEFR',
    'Current Focus',
    'Next Recommended Action',
    'Status'
  ]
};
