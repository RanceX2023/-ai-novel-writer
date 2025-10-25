function buildStyleDirectives(styleProfile = {}) {
  const details = [];
  if (styleProfile.voice) details.push(`voice: ${styleProfile.voice}`);
  if (styleProfile.tone) details.push(`tone: ${styleProfile.tone}`);
  if (styleProfile.mood) details.push(`mood: ${styleProfile.mood}`);
  if (styleProfile.pacing) details.push(`pacing: ${styleProfile.pacing}`);
  if (styleProfile.genre) details.push(`genre: ${styleProfile.genre}`);
  if (styleProfile.pov) details.push(`point of view: ${styleProfile.pov}`);

  const base = details.length ? `Adhere to the following stylistic profile: ${details.join(', ')}.` : '';
  const instructions = styleProfile.instructions
    ? `Special instructions: ${styleProfile.instructions}`
    : '';

  return [base, instructions].filter(Boolean).join(' ');
}

function listOutlineNodes(outlineNodes = []) {
  if (!Array.isArray(outlineNodes) || outlineNodes.length === 0) {
    return 'No outline nodes provided.';
  }
  return outlineNodes
    .map((node, index) => {
      const title = node.title ? `**${node.title}**` : `Beat ${index + 1}`;
      const summary = node.summary || node.description || node.prompt || 'No summary provided.';
      return `${index + 1}. ${title} — ${summary}`;
    })
    .join('\n');
}

function listMemoryFragments(memoryBank = []) {
  if (!Array.isArray(memoryBank) || memoryBank.length === 0) {
    return 'No persistent memory fragments are available.';
  }
  return memoryBank
    .map((fragment, index) => {
      const label = fragment.label || fragment.title || `Memory ${index + 1}`;
      const content = fragment.content || fragment.reminder || 'No content provided.';
      const tags = Array.isArray(fragment.tags) && fragment.tags.length
        ? ` (tags: ${fragment.tags.join(', ')})`
        : '';
      return `- ${label}: ${content}${tags}`;
    })
    .join('\n');
}

function buildOutlinePrompt({
  projectTitle,
  synopsis,
  targetChapters = 12,
  genre,
  tone,
  themes = [],
  existingOutline = [],
  styleProfile = {},
}) {
  const thematicLine = themes.length ? `Key themes: ${themes.join(', ')}.` : '';
  const outlineLine = existingOutline.length
    ? `Reference the existing outline and improve upon it:\n${listOutlineNodes(existingOutline)}`
    : 'No prior outline exists; craft a fresh structure.';

  const styleLine = buildStyleDirectives({ ...styleProfile, genre, tone });

  const messages = [
    {
      role: 'system',
      content:
        'You are an award-winning narrative designer specialised in long-form speculative fiction. '
        + 'Structure stories with strong pacing, character arcs, and thematic cohesion.',
    },
    {
      role: 'user',
      content: [
        `Project title: ${projectTitle || 'Untitled Project'}.`,
        synopsis ? `Premise synopsis: ${synopsis}` : '',
        thematicLine,
        `Draft a ${targetChapters}-chapter outline. Each chapter should include title, synopsis, primary conflict, and cliffhanger or transition beat.`,
        outlineLine,
        styleLine,
        'Return the outline as markdown with numbered chapters and bullet points for the required fields.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  return {
    model: process.env.OPENAI_OUTLINE_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    temperature: 0.75,
    messages,
  };
}

function buildCharacterPrompt({
  projectTitle,
  synopsis,
  characterName,
  role,
  traits = [],
  goals = [],
  secrets = [],
  relationships = [],
  styleProfile = {},
}) {
  const traitLine = traits.length ? `Core traits: ${traits.join(', ')}.` : '';
  const goalsLine = goals.length ? `Primary goals: ${goals.join(', ')}.` : '';
  const secretLine = secrets.length ? `Hidden truths or vulnerabilities: ${secrets.join(', ')}.` : '';
  const relationshipLine = relationships.length
    ? `Key relationships: ${relationships.map((rel) => `${rel.name || rel.with}: ${rel.summary || rel.dynamic || ''}`).join(' | ')}.`
    : '';
  const styleLine = buildStyleDirectives(styleProfile);

  const messages = [
    {
      role: 'system',
      content:
        'You are a character development specialist crafting rich, believable personas that drive narrative momentum.',
    },
    {
      role: 'user',
      content: [
        `Project title: ${projectTitle || 'Untitled Project'}.`,
        synopsis ? `Series synopsis: ${synopsis}` : '',
        `Character focus: ${characterName || 'Unnamed Character'} (${role || 'role unspecified'}).`,
        traitLine,
        goalsLine,
        secretLine,
        relationshipLine,
        styleLine,
        'Produce a character dossier with sections for biography, guiding motivation, internal conflict, contrasting external stakes, and scene hooks. Use markdown headings.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  return {
    model: process.env.OPENAI_CHARACTER_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    temperature: 0.7,
    messages,
  };
}

function buildChapterPrompt({
  projectTitle,
  synopsis,
  chapterTitle,
  outlineNodes = [],
  memoryBank = [],
  styleProfile = {},
  continuation = false,
  previousChapterSummary,
  instructions,
}) {
  const outlineSection = listOutlineNodes(outlineNodes);
  const memorySection = listMemoryFragments(memoryBank);
  const styleLine = buildStyleDirectives(styleProfile);
  const continuationLine = continuation
    ? 'This is a continuation. Maintain continuity with the previous chapter summary and respect established plot threads.'
    : 'Draft a full-length chapter that stands on its own while progressing the overarching plot.';

  const messages = [
    {
      role: 'system',
      content:
        'You are a seasoned novelist who writes compelling, emotionally resonant prose with tight pacing and vivid sensory detail.',
    },
    {
      role: 'user',
      content: [
        `Project title: ${projectTitle || 'Untitled Project'}.`,
        synopsis ? `Project synopsis: ${synopsis}` : '',
        `Chapter title: ${chapterTitle || 'Untitled Chapter'}.`,
        continuation && previousChapterSummary
          ? `Summary of previous chapter: ${previousChapterSummary}`
          : '',
        `Plot outline beats:\n${outlineSection}`,
        `Persistent memory fragments:\n${memorySection}`,
        continuationLine,
        instructions || 'Ensure the chapter concludes with a compelling hook that invites the next scene.',
        styleLine,
        'Respond in markdown with clear sections, including scene headings where relevant, and keep the POV consistent.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  return {
    model: process.env.OPENAI_CHAPTER_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    temperature: continuation ? 0.65 : 0.7,
    messages,
  };
}

function buildRewritePrompt({
  projectTitle,
  synopsis,
  styleProfile = {},
  focusAreas = [],
  instructions,
}) {
  const styleLine = buildStyleDirectives(styleProfile);
  const focusLine = focusAreas.length
    ? `Emphasise the following focus areas: ${focusAreas.join(', ')}.`
    : '';

  const messages = [
    {
      role: 'system',
      content:
        'You are a developmental editor crafting persuasive and cohesive story synopses that communicate stakes and tone.',
    },
    {
      role: 'user',
      content: [
        `Project title: ${projectTitle || 'Untitled Project'}.`,
        synopsis ? `Existing synopsis: ${synopsis}` : 'No existing synopsis provided; craft a fresh one based on supplied cues.',
        focusLine,
        styleLine,
        instructions || 'Write a refreshed synopsis in 3-5 paragraphs, ending with forward-looking momentum.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  return {
    model: process.env.OPENAI_REWRITE_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    temperature: 0.6,
    messages,
  };
}

module.exports = {
  buildOutlinePrompt,
  buildCharacterPrompt,
  buildChapterPrompt,
  buildRewritePrompt,
};
