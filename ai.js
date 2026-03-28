const SIMPLE_GRAMMAR_RULES = [
  { regex: /\bi goes\b/i, message: 'Use "I go" instead of "I goes".' },
  { regex: /\bhe do\b/i, message: 'Use "he does".' },
  { regex: /\bshe do\b/i, message: 'Use "she does".' },
  { regex: /\bthey is\b/i, message: 'Use "they are".' },
  { regex: /\byou is\b/i, message: 'Use "you are".' },
  { regex: /\bmore better\b/i, message: 'Use only "better" (avoid double comparative).' }
];

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually'];

const average = (arr) => (arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0);

export const analyzeSpeech = async (text) => {
  const safeText = (text || '').trim();
  if (!safeText) {
    return JSON.stringify({
      score: 5.0,
      mistakes: ['No clear speech captured. Try speaking a bit longer.'],
      improved: 'Share one main point, explain it with an example, and close with a short conclusion.'
    });
  }

  const words = safeText.split(/\s+/).filter(Boolean);
  const lowerText = safeText.toLowerCase();

  const grammarFindings = SIMPLE_GRAMMAR_RULES
    .filter((rule) => rule.regex.test(lowerText))
    .map((rule) => rule.message);

  const fillerCount = FILLER_WORDS.reduce((count, filler) => {
    const matches = lowerText.match(new RegExp(`\\b${filler}\\b`, 'g'));
    return count + (matches ? matches.length : 0);
  }, 0);

  const sentenceParts = safeText.split(/[.!?]+/).filter((part) => part.trim().length > 0);
  const sentenceLengths = sentenceParts.map((part) => part.trim().split(/\s+/).length);
  const avgSentenceLength = average(sentenceLengths);
  const uniqueWordRatio = words.length
    ? new Set(words.map((word) => word.toLowerCase().replace(/[^a-z]/g, ''))).size / words.length
    : 0;

  let score = 7.2;
  if (words.length < 15) score -= 1.1;
  if (fillerCount >= 3) score -= 0.8;
  if (grammarFindings.length > 0) score -= Math.min(1.2, grammarFindings.length * 0.45);
  if (avgSentenceLength >= 7 && avgSentenceLength <= 20) score += 0.4;
  if (uniqueWordRatio > 0.62) score += 0.5;

  score = Math.max(3.0, Math.min(9.6, score));

  const mistakes = [];
  if (grammarFindings.length > 0) mistakes.push(...grammarFindings);
  if (fillerCount >= 3) mistakes.push(`Filler words used ${fillerCount} times. Pause briefly instead of using fillers.`);
  if (words.length < 15) mistakes.push('Response is short. Add 2-3 supporting details to improve fluency score.');

  if (mistakes.length === 0) {
    mistakes.push('No major errors detected. Focus on precision and richer vocabulary.');
  }

  const improved =
    'Try this structure: introduce your main idea, add one specific example, then conclude with a clear takeaway using stronger verbs and precise adjectives.';

  return JSON.stringify({
    score: Number(score.toFixed(1)),
    mistakes,
    improved
  });
};
