// Speech Utilities using Web Speech API
// Works in Chrome, Edge, Safari — no API key needed

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Check browser support
export const isSpeechSupported = () => !!SpeechRecognition;
export const isSynthesisSupported = () => !!window.speechSynthesis;

// --- Speech Recognition (Speech-to-Text) ---

let recognitionInstance = null;

export function createRecognition({ onInterim, onResult, onEnd, onError, lang = 'en-US' }) {
  if (!isSpeechSupported()) {
    console.warn('SpeechRecognition not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interim += transcript;
      }
    }
    if (onInterim) onInterim(interim, finalTranscript);
    if (onResult) onResult(finalTranscript.trim());
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (onError) onError(event.error);
  };

  recognition.onend = () => {
    if (onEnd) onEnd(finalTranscript.trim());
  };

  recognitionInstance = recognition;
  return recognition;
}

export function startRecognition(recognition) {
  if (!recognition) return;
  try {
    recognition.start();
  } catch (e) {
    // Already started — ignore
    console.warn('Recognition already started:', e.message);
  }
}

export function stopRecognition() {
  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch (e) {
      // Already stopped
    }
    recognitionInstance = null;
  }
}

// --- Speech Synthesis (Text-to-Speech) ---

let currentUtterance = null;

export function speak(text, { rate = 0.95, pitch = 1, lang = 'en-US', onEnd } = {}) {
  if (!isSynthesisSupported()) return;

  // Cancel any current speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.pitch = pitch;

  // Try to pick a natural-sounding English voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v =>
    v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'))
  ) || voices.find(v => v.lang.startsWith('en'));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onend = () => {
    currentUtterance = null;
    if (onEnd) onEnd();
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (isSynthesisSupported()) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

// --- Transcript Analysis ---

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'so', 'well', 'i mean', 'kind of', 'sort of'];

export function analyzeTranscript(transcript, durationMs) {
  if (!transcript || transcript.trim().length === 0) {
    return null;
  }

  const text = transcript.trim().toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const durationMin = durationMs / 60000;
  const wpm = durationMin > 0 ? Math.round(wordCount / durationMin) : 0;

  // Filler word detection
  let fillerCount = 0;
  const fillersFound = [];
  FILLER_WORDS.forEach(filler => {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      fillerCount += matches.length;
      fillersFound.push({ word: filler, count: matches.length });
    }
  });

  // Sentence count (rough)
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordsPerSentence = sentences.length > 0 ? Math.round(wordCount / sentences.length) : wordCount;

  // Unique words (vocabulary diversity)
  const uniqueWords = new Set(words.map(w => w.replace(/[^a-z]/g, '')).filter(w => w.length > 2));
  const vocabDiversity = wordCount > 0 ? (uniqueWords.size / wordCount * 10).toFixed(1) : 0;

  // Scoring heuristics (0–10)
  const fluencyScore = Math.min(10, Math.max(3, 
    10 - (fillerCount * 0.5) - (wpm < 80 ? 2 : 0) - (wpm > 180 ? 1 : 0)
  )).toFixed(1);

  const grammarScore = Math.min(10, Math.max(3,
    8 + (avgWordsPerSentence > 5 && avgWordsPerSentence < 20 ? 1 : -1) - (fillerCount * 0.3)
  )).toFixed(1);

  const confidenceScore = Math.min(10, Math.max(3,
    7 + (wpm >= 100 && wpm <= 160 ? 2 : 0) - (fillerCount * 0.4)
  )).toFixed(1);

  // Build suggestions
  const suggestions = [];
  if (fillerCount > 2) {
    suggestions.push(`You used filler words ${fillerCount} times (${fillersFound.map(f => `"${f.word}"`).join(', ')}). Try replacing them with brief pauses.`);
  }
  if (wpm < 90) {
    suggestions.push("Your speaking pace is slow. Try to speak a bit faster for more natural conversations.");
  } else if (wpm > 170) {
    suggestions.push("You're speaking quite fast. Slow down slightly to improve clarity.");
  }
  if (avgWordsPerSentence > 25) {
    suggestions.push("Your sentences are very long. Try breaking them into shorter, clearer sentences.");
  }
  if (uniqueWords.size < 10 && wordCount > 15) {
    suggestions.push("Your vocabulary is somewhat repetitive. Try using more varied words and synonyms.");
  }
  if (suggestions.length === 0) {
    suggestions.push("Good job! Your speech was clear and well-structured.");
    suggestions.push("Keep practicing to maintain and improve your fluency.");
  }

  // Dynamic Pronunciation Extraction
  const extractSyllables = (word) => {
    return word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
               .replace(/^y/, '')
               .match(/[aeiouy]{1,2}/g)?.length || 1;
  };
  
  const longWords = Array.from(uniqueWords)
    .filter(w => w.length > 6 && extractSyllables(w) >= 3)
    .slice(0, 3); // Pick up to 3 complex words

  const mispronounced = longWords.map(word => {
    // Generate a pseudo-phonetic breakdown
    const chunks = word.match(/.{1,3}/g) || [word];
    return {
      word,
      suggestion: chunks.join('-').toUpperCase(),
      ipa: `/${word.slice(0,4)}.../`
    };
  });

  // Dynamic Grammar Checking
  const grammarFixes = [];
  const grammarRules = [
    { regex: /\b(i goes)\b/i, correction: 'I go' },
    { regex: /\b(he do)\b/i, correction: 'he does' },
    { regex: /\b(she do)\b/i, correction: 'she does' },
    { regex: /\b(it do)\b/i, correction: 'it does' },
    { regex: /\b(a apple)\b/i, correction: 'an apple' },
    { regex: /\b(a hour)\b/i, correction: 'an hour' },
    { regex: /\b(they is)\b/i, correction: 'they are' },
    { regex: /\b(we is)\b/i, correction: 'we are' },
    { regex: /\b(you is)\b/i, correction: 'you are' },
    { regex: /\b(much people)\b/i, correction: 'many people' },
    { regex: /\b(more better)\b/i, correction: 'better' },
    { regex: /\b(did went)\b/i, correction: 'did go' }
  ];

  grammarRules.forEach(rule => {
    const match = text.match(rule.regex);
    if (match) {
      grammarFixes.push({ wrong: match[0], correction: rule.correction });
    }
  });

  return {
    wordCount,
    wpm,
    fillerCount,
    fillersFound,
    sentences: sentences.length,
    avgWordsPerSentence,
    uniqueWordCount: uniqueWords.size,
    vocabDiversity,
    fluencyScore,
    grammarScore,
    confidenceScore,
    vocabScore: Math.min(10, parseFloat(vocabDiversity) + 3).toFixed(1),
    suggestions,
    transcript,
    mispronounced,
    grammarFixes
  };
}
