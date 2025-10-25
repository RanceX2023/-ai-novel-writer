const {
  buildOutlinePrompt,
  buildCharacterPrompt,
  buildChapterPrompt,
  buildRewritePrompt,
} = require('../src/utils/promptTemplates');

describe('prompt templates', () => {
  test('buildOutlinePrompt returns structured messages', () => {
    const payload = buildOutlinePrompt({
      projectTitle: 'Starfall Chronicles',
      synopsis: 'A rebellion sparks among the stars.',
      targetChapters: 8,
      themes: ['courage', 'sacrifice'],
      styleProfile: { tone: 'hopeful', genre: 'space opera' },
    });

    expect(payload.model).toBeDefined();
    expect(payload.temperature).toBeGreaterThan(0);
    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages[0].role).toBe('system');
    expect(payload.messages[1].content).toContain('Starfall Chronicles');
    expect(payload.messages[1].content).toContain('8-chapter outline');
  });

  test('buildCharacterPrompt layers character details', () => {
    const payload = buildCharacterPrompt({
      projectTitle: 'Starfall Chronicles',
      synopsis: 'A rebellion sparks among the stars.',
      characterName: 'Captain Lyra Vega',
      role: 'Fleet Commander',
      traits: ['strategic', 'empathetic'],
      goals: ['protect her crew', 'liberate Orion sector'],
      secrets: ['haunted by past failure'],
      relationships: [{ name: 'Kai', summary: 'trusted first officer' }],
      styleProfile: { voice: 'confident' },
    });

    expect(payload.messages[1].content).toContain('Captain Lyra Vega');
    expect(payload.messages[1].content).toContain('Fleet Commander');
    expect(payload.messages[1].content).toContain('character dossier');
  });

  test('buildChapterPrompt supports continuation context', () => {
    const payload = buildChapterPrompt({
      projectTitle: 'Starfall Chronicles',
      synopsis: 'A rebellion sparks among the stars.',
      chapterTitle: 'Chapter 3: Breach',
      outlineNodes: [{ title: 'Sabotage', summary: 'Disable the blockade generator.' }],
      memoryBank: [{ label: 'Promise', content: 'Never abandon a civilian transport.' }],
      styleProfile: { tone: 'tense' },
      continuation: true,
      previousChapterSummary: 'The team infiltrated the station via the cargo ducts.',
    });

    expect(payload.messages[1].content).toContain('Summary of previous chapter');
    expect(payload.messages[1].content).toContain('Persistent memory fragments');
    expect(payload.temperature).toBeLessThan(0.7);
  });

  test('buildRewritePrompt captures editorial focus', () => {
    const payload = buildRewritePrompt({
      projectTitle: 'Starfall Chronicles',
      synopsis: 'A rebellion sparks among the stars.',
      focusAreas: ['Highlight the moral dilemma of the rebellion.'],
      styleProfile: { tone: 'reflective' },
    });

    expect(payload.messages[1].content).toContain('Highlight the moral dilemma');
    expect(payload.temperature).toBeGreaterThan(0);
  });
});
