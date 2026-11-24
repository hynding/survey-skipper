import type { SurveyDefinitionInput } from 'survey-skipper';

/** Surveys the demo starts with. Each shows off a different kind of branching. */
export const SAMPLE_SURVEYS: SurveyDefinitionInput[] = [
  {
    id: 'coffee',
    version: 1,
    title: 'Coffee break',
    description: 'Branches on your first answer: coffee drinkers and tea drinkers see different questions.',
    questions: [
      {
        id: 'drinks_coffee',
        text: 'Do you drink coffee?',
        type: 'boolean',
        required: true,
        rules: [{ if: { '==': [{ var: 'answer' }, false] }, goTo: 'tea' }],
      },
      {
        id: 'cups',
        text: 'How many cups on a typical day?',
        type: 'number',
        required: true,
        validation: { min: 1, max: 20 },
      },
      {
        id: 'styles',
        text: 'Which of these do you enjoy?',
        type: 'multi',
        required: true,
        answers: [
          { value: 'espresso', text: 'Espresso' },
          { value: 'latte', text: 'Latte' },
          { value: 'filter', text: 'Filter' },
          { value: 'cold_brew', text: 'Cold brew' },
        ],
      },
      {
        id: 'favorite',
        text: 'Of those, which is your favorite?',
        type: 'single',
        answersFrom: { question: 'styles' },
        rules: [{ end: 'coffee' }],
      },
      {
        id: 'tea',
        text: 'No coffee! Do you drink tea instead?',
        type: 'single',
        required: true,
        answers: [
          { value: 'green', text: 'Green tea' },
          { value: 'black', text: 'Black tea' },
          { value: 'none', text: 'Neither' },
        ],
        rules: [{ if: { '==': [{ var: 'answer' }, 'none'] }, end: 'neither' }],
      },
      {
        id: 'tea_time',
        text: 'When do you usually have your {{answers.tea}} tea?',
        type: 'single',
        answers: [
          { value: 'morning', text: 'Morning' },
          { value: 'afternoon', text: 'Afternoon' },
          { value: 'evening', text: 'Evening' },
        ],
      },
    ],
  },
  {
    id: 'feedback',
    version: 1,
    title: 'Product feedback',
    description: 'A 0 to 10 score decides the follow-up: unhappy, neutral and happy customers get different questions.',
    questions: [
      {
        id: 'nps',
        text: 'How likely are you to recommend us to a friend?',
        type: 'rating',
        required: true,
        validation: { min: 0, max: 10 },
        rules: [
          { if: { '<=': [{ var: 'answer' }, 6] }, goTo: 'improve' },
          { if: { '>=': [{ var: 'answer' }, 9] }, goTo: 'love' },
        ],
      },
      {
        id: 'missing',
        text: 'What would make it a 9 or 10 for you?',
        type: 'text',
        rules: [{ end: 'passive' }],
      },
      {
        id: 'improve',
        text: 'Sorry to hear that. What should we fix first?',
        type: 'single',
        required: true,
        answers: [
          { value: 'speed', text: 'Speed' },
          { value: 'price', text: 'Price' },
          { value: 'support', text: 'Support' },
          { value: 'other', text: 'Something else', isCustom: true },
        ],
      },
      {
        id: 'contact',
        text: 'May we contact you about it?',
        type: 'boolean',
        rules: [{ end: 'detractor' }],
      },
      {
        id: 'love',
        text: 'Thank you! What do you like most?',
        type: 'text',
      },
      {
        id: 'review',
        text: 'Would you leave us a public review?',
        type: 'boolean',
      },
    ],
  },
  {
    id: 'quiz',
    version: 1,
    title: 'Space quiz',
    description: 'Answers carry points, and the last question reads your score.',
    questions: [
      {
        id: 'planets',
        text: 'How many planets are in the solar system?',
        type: 'single',
        required: true,
        answers: [
          { value: '8', text: 'Eight', score: 1 },
          { value: '9', text: 'Nine', score: 0 },
          { value: '12', text: 'Twelve', score: 0 },
        ],
      },
      {
        id: 'red',
        text: 'Which planet is called the Red Planet?',
        type: 'single',
        required: true,
        answers: [
          { value: 'venus', text: 'Venus', score: 0 },
          { value: 'mars', text: 'Mars', score: 1 },
          { value: 'jupiter', text: 'Jupiter', score: 0 },
        ],
      },
      {
        id: 'moon',
        text: 'Roughly how long does light take to reach us from the Moon?',
        type: 'single',
        required: true,
        answers: [
          { value: '1s', text: 'About a second', score: 1 },
          { value: '8m', text: 'About eight minutes', score: 0 },
          { value: '1d', text: 'About a day', score: 0 },
        ],
        rules: [{ if: { '<': [{ var: 'score' }, 3] }, goTo: 'retry' }],
      },
      {
        id: 'perfect',
        text: 'A perfect {{score}} out of 3! Which space topic should the next quiz cover?',
        type: 'text',
        rules: [{ end: 'perfect' }],
      },
      {
        id: 'retry',
        text: 'You scored {{score}} out of 3. Would you like to try a harder quiz next time?',
        type: 'boolean',
      },
    ],
  },
];
