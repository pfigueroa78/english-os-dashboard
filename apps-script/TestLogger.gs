function testLogger() {
  const payload = {
    token: getSecretToken_(),

    // Multi-user fields
    userEmail: getScriptProperty_('TEST_USER_EMAIL'),
    learnerId: getScriptProperty_('TEST_LEARNER_ID'),
    userName: getScriptProperty_('TEST_USER_NAME'),
    whatsAppNumber: getScriptProperty_('TEST_WHATSAPP_NUMBER'),
    preferredChannel: 'Email',
    whatsAppOptIn: false,

    sourceAgent: 'Manual Test',
    unit: 'Unit 3',
    lesson: 'Lesson A',
    currentCefr: 'B1+',

    dailyLog: {
      skill: 'Speaking',
      activity: 'Test practice',
      mainTopic: 'Exploring New Cities',
      time: '10 minutes',
      summary: 'Testing the multi-user version of English OS Logger.',
      weakness: 'Third-person singular.',
      newVocabulary: 'traffic congestion, public transportation',
      nextAction: 'Practice relative clauses and third-person singular.'
    },

    mistakes: [
      {
        skill: 'Grammar',
        mistake: 'technology help people',
        correction: 'technology helps people',
        grammarRule: 'Third-person singular requires -s.',
        frequency: 1,
        priority: 'High',
        example: 'Technology helps people communicate faster.'
      }
    ],

    vocabulary: [
      {
        wordOrChunk: 'traffic congestion',
        meaning: 'congestión vehicular',
        example: 'Bogotá has serious traffic congestion.',
        collocation: 'reduce traffic congestion',
        category: 'Cities',
        cefr: 'B2',
        status: 'New'
      }
    ],

    progress: {
      week: 'Week 1',
      speaking: 6,
      grammar: 7,
      listening: 6,
      writing: 6,
      vocabulary: 7,
      pronunciation: 6,
      confidence: 7,
      cefrEstimate: 'B1+',
      notes: 'Manual multi-user logger test.'
    },

    whatsAppMessage: {
      phone: getScriptProperty_('TEST_WHATSAPP_NUMBER'),
      messageType: 'Speaking Practice',
      message:
        '🎙️ English Speaking Practice\n\n' +
        'Today’s focus: Unit 3 - Exploring New Cities.\n\n' +
        'Prompt: Describe a city that is ideal for technology, innovation, and quality of life.\n\n' +
        'Use 2 relative clauses, 3 connectors, and 5 city vocabulary words.',
      notes: 'Queued from testLogger. Do not send if WhatsApp opt-in is false.'
    },

    documentRequest: {
      documentType: 'Daily Session Summary',
      targetFolder: '08_Daily_Sessions',
      notes: 'Create a daily session summary document for this test.'
    }
  };

  const response = UrlFetchApp.fetch(getScriptProperty_('ENGLISH_OS_WEB_APP_URL'), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log(response.getContentText());
}
