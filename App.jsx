import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar
} from 'recharts';
import {
  Home, BookOpen, Mic, Clock, User, Star, TrendingUp, Play,
  Square, ArrowRight, Check, X, LogOut, Award, Zap,
  MessageSquare, Activity, Target, Shield
} from 'lucide-react';
import { TOPICS, SCENARIOS } from './data';
import {
  isSpeechSupported, isSynthesisSupported,
  createRecognition, startRecognition, stopRecognition,
  stopSpeaking, analyzeTranscript
} from './speechUtils';
import { analyzeSpeech } from '../ai';
import { saveData } from './firestore';

// Icon Components mapped to lucide-react
const Icons = {
  Home: () => <Home size={24} />,
  Book: () => <BookOpen size={24} />,
  Mic: () => <Mic size={24} />,
  HistoryIcon: () => <Clock size={24} />,
  User: () => <User size={24} />,
  Star: () => <Star size={24} />,
  TrendingUp: () => <TrendingUp size={24} />,
  Play: () => <Play size={24} />,
  Square: () => <Square size={24} />,
  ArrowRight: () => <ArrowRight size={24} />,
  Check: () => <Check size={24} />,
  X: () => <X size={24} />,
  LogOut: () => <LogOut size={24} />,
  Award: () => <Award size={24} />,
  Zap: () => <Zap size={24} />,
  MessageSquare: () => <MessageSquare size={24} />,
  Activity: () => <Activity size={24} />,
  Target: () => <Target size={24} />,
  Shield: () => <Shield size={24} />
};

// Utilities
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const USERS_KEY = 'fm_users';
const CURRENT_USER_EMAIL_KEY = 'fm_current_user_email';
const normalizeEmail = (email = '') => email.trim().toLowerCase();

const getStoredUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch {
    return {};
  }
};

const setStoredUsers = (usersMap) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(usersMap));
};

const defaultProfileFromEmail = (email) => {
  const baseName = (email || 'User').split('@')[0] || 'User';
  const formattedName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
  return {
    id: generateId(),
    name: formattedName,
    email,
    level: 'Intermediate (B1-B2)',
    goals: 'Improve Daily Speaking',
    streak: 1,
    xp: 0,
    history: [],
    badges: []
  };
};

// Badges logic
const checkBadges = (user, newReport) => {
  const customBadges = [...(user.badges || [])];
  if (!customBadges.includes('First Step') && user.history.length >= 1) customBadges.push('First Step');
  if (!customBadges.includes('Rising Star') && user.history.length >= 5) customBadges.push('Rising Star');
  if (!customBadges.includes('Perfect Score') && newReport && parseFloat(newReport.result.fluency) >= 9.5) customBadges.push('Perfect Score');
  if (!customBadges.includes('Streak Master') && user.streak >= 3) customBadges.push('Streak Master');
  return customBadges;
};

// AI Speech Analysis — uses real transcript data when available
const buildAnalysisResult = (transcriptAnalysis, mode) => {
  // If we have real transcript analysis, use it
  if (transcriptAnalysis) {
    return {
      fluency: transcriptAnalysis.fluencyScore,
      grammar: transcriptAnalysis.grammarScore,
      confidence: transcriptAnalysis.confidenceScore,
      vocab: transcriptAnalysis.vocabScore,
      speed: transcriptAnalysis.wpm,
      pauseFreq: transcriptAnalysis.fillerCount,
      correctWords: transcriptAnalysis.transcript.split(/\s+/).slice(0, 10),
      mispronounced: transcriptAnalysis.mispronounced || [],
      grammarFixes: transcriptAnalysis.grammarFixes || [],
      smartSuggestions: transcriptAnalysis.suggestions,
      mistakePattern: transcriptAnalysis.fillerCount > 2
        ? `You used filler words ${transcriptAnalysis.fillerCount} times. Focus on pausing instead of using fillers.`
        : transcriptAnalysis.wpm < 90
          ? "Your speaking pace is slower than average. Practice reading aloud to build speed."
          : "Good speaking patterns detected. Keep practicing to maintain fluency.",
      transcript: transcriptAnalysis.transcript,
      wordCount: transcriptAnalysis.wordCount
    };
  }

  // Fallback to mock data if no real transcript
  const base = mode === 'certification' ? 65 : 75;
  const r = Math.floor(Math.random() * 20);
  return {
    fluency: ((base + r) / 10).toFixed(1),
    grammar: ((base + r - 5) / 10).toFixed(1),
    confidence: ((base + r + 5) / 10).toFixed(1),
    vocab: ((base + r - 2) / 10).toFixed(1),
    speed: Math.floor(Math.random() * 40 + 110),
    pauseFreq: Math.floor(Math.random() * 5 + 2),
    correctWords: ['I', 'am', 'very', 'happy', 'today', 'to', 'talk', 'about', 'this'],
    mispronounced: [
      { word: 'development', suggestion: 'DE-vel-op-ment', ipa: '/dɪˈveləpmənt/' },
      { word: 'comfortable', suggestion: 'COMF-tor-ble', ipa: '/ˈkʌmfərtəbl/' }
    ],
    grammarFixes: [
      { wrong: 'I goes to', correction: 'I go to' }
    ],
    smartSuggestions: [
      "Use more connectors like 'However' and 'Therefore' to link ideas.",
      "Your vocabulary is slightly repetitive. Try using synonyms for 'very'.",
      "You hesitate during long sentences \u2192 practice fluency drills."
    ],
    mistakePattern: "You often skip articles ('a', 'the') before nouns."
  };
};

// --- Views ---

const AuthView = ({ isLogin, setView, onLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);

    if (isLogin) {
      onLogin({ email: normalizedEmail, pwd }, 'login');
    } else {
      const user = {
        id: generateId(),
        name,
        email: normalizedEmail,
        level: 'Intermediate (B1-B2)',
        goals: 'Improve Daily Speaking',
        streak: 1,
        xp: 0,
        history: [],
        badges: []
      };
      onLogin(user, 'signup');
    }
  };

  const handleGoogleLogin = () => {
    // Mock Google login — creates a default user
    const user = {
      id: generateId(),
      name: 'User',
      email: 'user@gmail.com',
      level: 'Intermediate (B1-B2)',
      goals: 'Improve Daily Speaking',
      streak: 1,
      xp: 0,
      history: [],
      badges: []
    };
    onLogin(user, 'signup');
  };

  return (
    <div className="auth-page">
      <div className="auth-box fade-in">
        <h1 className="auth-logo">
          {isLogin ? 'Welcome Back' : 'FluentMind'}
        </h1>
        <p className="auth-tagline">
          {isLogin ? 'Continue your journey.' : 'Think it. Say it. Own it.'}
        </p>
        
        <div className="auth-divider" />
        
        <p className="auth-description">
          {isLogin 
            ? 'Log in to pick up where you left off — your progress, streaks, and practice sessions are all waiting for you.'
            : 'FluentMind helps you convert your thoughts into fluent spoken English. Choose a topic, engage with guided keywords, speak your mind — every session makes you sharper.'
          }
        </p>

        {!showEmailForm ? (
          <>
            <button className="auth-btn auth-btn-dark" onClick={handleGoogleLogin}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.56-2.77z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <button className="auth-btn auth-btn-light" onClick={() => setShowEmailForm(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Continue with Email
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '0.875rem', maxWidth: '420px'}}>
            {!isLogin && (
              <div>
                <label style={{fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block', fontWeight: 500, color: 'var(--text-muted)'}}>Full Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} type="text" placeholder="Your name" />
              </div>
            )}
            <div>
              <label style={{fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block', fontWeight: 500, color: 'var(--text-muted)'}}>Email</label>
              <input required value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
            </div>
            <div>
              <label style={{fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block', fontWeight: 500, color: 'var(--text-muted)'}}>Password</label>
              <input required value={pwd} onChange={e => setPwd(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            <button type="submit" className="auth-btn auth-btn-dark" style={{marginTop: '0.5rem'}}>
              {isLogin ? 'Log In' : 'Get Started'}
            </button>
            <button type="button" className="auth-btn auth-btn-light" onClick={() => setShowEmailForm(false)}>
              ← Back
            </button>
          </form>
        )}

        <p className="auth-footer">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span style={{color: 'var(--accent)', cursor: 'pointer', fontWeight: 600}} onClick={() => { setView(isLogin ? 'signup' : 'login'); setShowEmailForm(false); }}>
            {isLogin ? 'Sign up' : 'Log in'}
          </span>
        </p>
      </div>
    </div>
  );
};

const OnboardingView = ({ user, onComplete }) => {
  const [level, setLevel] = useState('Intermediate');
  const [goals, setGoals] = useState('Crack Job Interview');

  const handleComplete = () => {
    const updatedUser = { ...user, level, goals };
    onComplete(updatedUser);
  };

  return (
    <div className="auth-page">
      <div className="auth-box fade-in">
        <h2 className="text-h2 text-center" style={{marginBottom: '0.5rem'}}>Welcome, {user.name}!</h2>
        <p className="text-muted text-center" style={{marginBottom: '2rem'}}>Let's personalize your learning experience.</p>
        
        <div style={{marginBottom: '1.5rem'}}>
          <label className="fw-500" style={{display: 'block', marginBottom: '0.5rem'}}>Current English Level</label>
          <select value={level} onChange={e => setLevel(e.target.value)} style={{fontSize: '1rem', padding: '1rem'}}>
            <option>Beginner (A1-A2)</option>
            <option>Intermediate (B1-B2)</option>
            <option>Advanced (C1-C2)</option>
          </select>
        </div>

        <div style={{marginBottom: '2rem'}}>
          <label className="fw-500" style={{display: 'block', marginBottom: '0.5rem'}}>Primary Learning Goal</label>
          <select value={goals} onChange={e => setGoals(e.target.value)} style={{fontSize: '1rem', padding: '1rem'}}>
            <option>Crack Job Interview</option>
            <option>Speak Confidently in Meetings</option>
            <option>Improve Daily Speaking</option>
            <option>Accent Reduction</option>
          </select>
        </div>

        <button onClick={handleComplete} className="btn btn-primary" style={{width: '100%', padding: '1rem'}}>Generate My Training Plan</button>
      </div>
    </div>
  );
};

const DashboardView = ({ user, history, setView }) => {
  const currentLevel = Math.floor((user.xp || 0) / 100) + 1;
  const xpProgress = (user.xp || 0) % 100;

  // Speaking Stats
  const totalSessions = history.length;
  const totalMinutes = totalSessions > 0 
    ? Math.round(history.reduce((sum, h) => sum + (parseFloat(h.result.speed) > 0 ? 2 : 1), 0) * 2.5) 
    : 0;
  const avgScore = totalSessions > 0 
    ? (history.reduce((sum, h) => sum + parseFloat(h.result.fluency), 0) / totalSessions).toFixed(1) 
    : '—';
  const bestScore = totalSessions > 0
    ? Math.max(...history.map(h => parseFloat(h.result.fluency))).toFixed(1)
    : '—';
  const streak = user.streak || 0;

  // Contextual tips based on user data
  const tips = [
    { icon: '🎯', text: "Start each answer with a clear topic sentence, then expand with examples and details." },
    { icon: '⏱️', text: "Aim for 2-3 minutes per topic. Shorter answers lack depth, longer ones lose focus." },
    { icon: '🔗', text: "Use linking words like 'however', 'moreover', 'for instance' to connect your ideas smoothly." },
    { icon: '🪞', text: "Record yourself and listen back — you'll catch habits you don't notice while speaking." },
    { icon: '📖', text: "Read aloud for 10 minutes daily to build natural rhythm and reduce hesitation." },
    { icon: '🧠', text: "Think in English, not your native language. This reduces translation pauses." },
    { icon: '💬', text: "Replace filler words like 'um' and 'like' with a brief pause — it sounds more confident." },
    { icon: '🎭', text: "Vary your tone and pace. Monotone speech loses the listener's attention quickly." },
  ];
  const todayTip = tips[new Date().getDate() % tips.length];

  // Get insights from recent sessions
  const getInsight = () => {
    if (totalSessions === 0) return { label: 'Get Started', text: 'Complete your first session to unlock insights.', color: 'var(--accent)' };
    if (parseFloat(avgScore) >= 8) return { label: 'Excellent', text: 'Your fluency is outstanding! Try harder topics to keep improving.', color: 'var(--secondary)' };
    if (parseFloat(avgScore) >= 6) return { label: 'Good Progress', text: 'You\'re improving steadily. Focus on reducing filler words and pauses.', color: 'var(--accent)' };
    return { label: 'Keep Going', text: 'Practice daily — even 5 minutes helps build confidence and flow.', color: 'var(--warning)' };
  };
  const insight = getInsight();

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        <div>
          <h1 className="text-h1" style={{ marginBottom: '0.5rem' }}>Welcome back, {user.name}! 👋</h1>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Goal: <strong>{user.goals}</strong></p>
          <button onClick={() => setView('topics')} className="btn btn-primary" style={{ display: 'inline-flex', padding: '1rem 2rem', fontSize: '1.1rem' }}>
            <Icons.Target /> Start Practice Session
          </button>
        </div>
        <div className="card" style={{ padding: '1.25rem 2rem', textAlign: 'center', background: 'var(--primary-light)', border: 'none', minWidth: '220px' }}>
          <h3 className="text-h3" style={{color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
            <Icons.Zap /> Level {currentLevel}
          </h3>
          <div className="progress-bar-bg" style={{marginBottom: '0.5rem'}}>
            <div className="progress-bar-fill" style={{width: `${xpProgress}%`}} />
          </div>
          <p style={{fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 600}}>{user.xp || 0} XP Total</p>
        </div>
      </div>

      {/* Speaking Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card stat-card" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem' }}>
          <div className="stat-icon" style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
            <Icons.Mic />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{totalSessions}</h2>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Sessions</p>
          </div>
        </div>
        <div className="card stat-card" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem' }}>
          <div className="stat-icon" style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
            <Icons.HistoryIcon />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{totalMinutes}<span style={{fontSize: '0.875rem', fontWeight: 400}}>m</span></h2>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Spoken</p>
          </div>
        </div>
        <div className="card stat-card" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem' }}>
          <div className="stat-icon" style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
            <Icons.TrendingUp />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{avgScore}</h2>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Avg Score</p>
          </div>
        </div>
        <div className="card stat-card" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.5rem' }}>
          <div className="stat-icon" style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
            <Icons.Star />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{bestScore}</h2>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Best Score</p>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{marginBottom: '2rem'}}>
        {/* Daily Tip + Insight */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 className="text-h3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>💡 Speaking Tip of the Day</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '2rem' }}>{todayTip.icon}</span>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{todayTip.text}</p>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: insight.color, display: 'inline-block' }}></span>
              <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: insight.color }}>{insight.label}</h4>
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{insight.text}</p>
          </div>
          <button onClick={() => setView('topics')} className="btn btn-outline" style={{ marginTop: 'auto' }}>
            <Icons.ArrowRight /> Practice Now
          </button>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 className="text-h3">Recent Activity</h3>
            <button className="btn btn-outline" onClick={() => setView('history')} style={{padding: '0.25rem 0.75rem', fontSize: '0.875rem'}}>View All</button>
          </div>
          
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎙️</p>
              <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No sessions yet</p>
              <p style={{ fontSize: '0.85rem' }}>Complete your first speaking practice to see your progress here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {history.slice(-5).reverse().map(session => (
                <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{session.topicTitle}</h4>
                    <p className="text-muted" style={{ fontSize: '0.75rem' }}>{session.mode} • {formatDate(session.date)}</p>
                  </div>
                  <div className="badge badge-blue" style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem' }}>{session.result.fluency}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TopicListView = ({ setView, setCurrentTopic }) => {
  const [activeCategory, setActiveCategory] = useState('all');

  const getDifficultyColor = (diff) => {
    if(diff === 'Beginner') return 'badge-green';
    if(diff === 'Intermediate') return 'badge-blue';
    return 'badge-orange';
  };

  const handleSelect = (topic) => {
    setCurrentTopic(topic);
    setView('topic_detail');
  };

  const filtered = activeCategory === 'all' ? TOPICS : TOPICS.filter(t => t.category === activeCategory);
  const activeScenario = SCENARIOS.find(s => s.id === activeCategory);

  return (
    <div className="fade-in">
      <h1 className="text-h1" style={{marginBottom: '0.5rem'}}>Topics</h1>
      <p className="text-muted" style={{marginBottom: '1.5rem'}}>Choose a scenario and start practising.</p>

      {/* Scenario Category Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '1rem', scrollbarWidth: 'none' }}>
        <button
          className={`btn ${activeCategory === 'all' ? 'btn-primary' : 'btn-outline'}`}
          style={{ whiteSpace: 'nowrap', padding: '0.5rem 1.25rem', fontSize: '0.875rem', borderRadius: 'var(--radius-full)' }}
          onClick={() => setActiveCategory('all')}
        >
          All Topics
        </button>
        {SCENARIOS.map(sc => (
          <button
            key={sc.id}
            className={`btn ${activeCategory === sc.id ? 'btn-primary' : 'btn-outline'}`}
            style={{ whiteSpace: 'nowrap', padding: '0.5rem 1.25rem', fontSize: '0.875rem', borderRadius: 'var(--radius-full)' }}
            onClick={() => setActiveCategory(sc.id)}
          >
            {sc.icon} {sc.label}
          </button>
        ))}
      </div>

      {/* Category Description */}
      {activeScenario && (
        <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.75rem' }}>{activeScenario.icon}</span>
          <div>
            <h3 className="text-h3">{activeScenario.label}</h3>
            <p className="text-muted" style={{fontSize: '0.875rem'}}>{activeScenario.description}</p>
          </div>
          <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>{filtered.length} topics</span>
        </div>
      )}
      
      <div className="grid-3" style={{gap: '1.25rem'}}>
        {filtered.map(topic => (
          <div key={topic.id} className="card topic-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <h3 className="text-h3" style={{ fontSize: '1.15rem' }}>{topic.title}</h3>
              <span className={`badge ${getDifficultyColor(topic.difficulty)}`}>{topic.difficulty}</span>
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {topic.subtopics.join(' • ')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
              {topic.keywords.map(kw => (
                <span key={kw} className="keyword-badge">{kw}</span>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 'auto', width: '100%', padding: '0.75rem' }} onClick={() => handleSelect(topic)}>
              Practice Now →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const TopicDetailView = ({ topic, setView, setCurrentMode }) => {
  const startSession = (mode) => {
    setCurrentMode(mode);
    setView('practice_session');
  };

  return (
    <div className="fade-in mx-auto" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <button className="btn" style={{ padding: 0, marginBottom: '1.5rem', color: 'var(--text-muted)' }} onClick={() => setView('topics')}>
        ← Back to topics
      </button>
      
      <div className="card" style={{ padding: '2.5rem' }}>
        <h1 className="text-h1" style={{ marginBottom: '0.5rem' }}>{topic.title}</h1>
        <p className="text-muted" style={{marginBottom: '2rem'}}>{topic.subtopics.join(' • ')}</p>
        
        <h3 style={{marginBottom: '1rem'}}>Choose how you want to practice:</h3>
        <div className="grid-2">
          <div className="card" style={{ border: '2px solid var(--primary)', cursor: 'pointer' }} onClick={() => startSession('speaking')}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>
              <Icons.Mic /> Real-time Speaking
            </h3>
            <p className="text-muted" style={{ fontSize: '0.875rem' }}>Speak freely about the topic. Record yourself, see your live transcript, and get a detailed analysis of your fluency.</p>
          </div>
          <div className="card" style={{ border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => startSession('test')}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)', marginBottom: '0.5rem' }}>
              <Icons.Shield /> Test Mode
            </h3>
            <p className="text-muted" style={{ fontSize: '0.875rem' }}>Timed speaking test — just the topic, no hints or keywords. Speak uninterrupted and get your score.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Practice Engine — Free-form Speaking & Test Mode
const PracticeSessionView = ({ topic, mode, setView, setRecentReport }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [indicator, setIndicator] = useState('green');
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [speechSupported] = useState(isSpeechSupported());
  const [elapsed, setElapsed] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingStartRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [interimText, finalText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      stopRecognition();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStartRecording = () => {
    stopSpeaking();
    setIsRecording(true);
    isRecordingRef.current = true;
    setInterimText('');
    setFinalText('');
    setElapsed(0);
    recordingStartRef.current = Date.now();

    // Start timer
    timerRef.current = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);

    if (!speechSupported) {
      setIndicator('green');
      return;
    }

    const recognition = createRecognition({
      onInterim: (interim, final) => {
        setInterimText(interim);
        setFinalText(final);
        setIndicator(interim.length === 0 && final.length > 0 ? 'red' : 'green');
      },
      onResult: (text) => {
        setFinalText(text);
      },
      onError: (error) => {
        if (error !== 'aborted') {
          console.warn('Speech error:', error);
          setIndicator('red');
        }
      },
      onEnd: () => {
        // Restart when recognition ends unexpectedly while still recording.
        if (isRecordingRef.current && recognitionRef.current) {
          startRecognition(recognitionRef.current);
        }
      }
    });

    recognitionRef.current = recognition;
    startRecognition(recognition);
  };

  const handleStop = async () => {
    const duration = Date.now() - (recordingStartRef.current || Date.now());
    setIsRecording(false);
    isRecordingRef.current = false;
    stopRecognition();
    recognitionRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const capturedText = (finalText + ' ' + interimText).trim();
    const userText = capturedText || "I think it is very important and I have a lot of experience with it.";

    setIsAnalyzing(true);
    console.log("User said:", userText);
    
    let aiResultData = { score: 7.5, mistakes: [], improved: "Keep practicing to improve your sentence structure." };
    try {
      const aiResult = await analyzeSpeech(userText);
      console.log("AI raw result:", aiResult);
      // Clean potential markdown blocks from OpenAI response
      const cleanJson = aiResult.replace(/```json/gi, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJson);
      
      console.log("Score:", result.score);
      saveData(userText, result.score);

      if (result.score) aiResultData.score = result.score;
      if (result.mistakes) aiResultData.mistakes = Array.isArray(result.mistakes) ? result.mistakes : [result.mistakes];
      if (result.improved) aiResultData.improved = result.improved;
    } catch (err) {
      console.error("AI Parsing Error:", err);
      saveData(userText, aiResultData.score); // Save fallback
    }

    // Blend base stats (wpm, fillers) with AI stats (score, grammar, suggestions)
    const baseAnalysis = analyzeTranscript(userText, duration) || analyzeTranscript('I am practicing spoken English.', 60000);
    const finalScore = parseFloat(aiResultData.score) || parseFloat(baseAnalysis.fluencyScore);
    
    const blendedAnalysis = {
      ...baseAnalysis,
      fluencyScore: finalScore.toFixed(1),
      grammarScore: finalScore.toFixed(1),
      vocabScore: finalScore.toFixed(1),
      confidenceScore: finalScore.toFixed(1),
      grammarFixes: aiResultData.mistakes.map(m => ({ wrong: m, correction: 'AI Feedback' })),
      suggestions: [aiResultData.improved].filter(Boolean)
    };

    const finalReportResult = buildAnalysisResult(blendedAnalysis, mode);
    setRecentReport({
      id: generateId(), topicId: topic.id, topicTitle: topic.title, mode, date: new Date().toISOString(), result: finalReportResult, isNew: true
    });
    
    setIsAnalyzing(false);
    setIsFinished(true);

    setTimeout(() => {
      setView('report');
    }, 500);
  };

  const currentTranscript = (finalText + ' ' + interimText).trim();
  const wordCount = currentTranscript ? currentTranscript.split(/\s+/).length : 0;

  return (
    <div className="fade-in mx-auto" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <button className="btn" style={{ padding: 0, marginBottom: '1.5rem', color: 'var(--text-muted)' }} onClick={() => { stopRecognition(); if(timerRef.current) clearInterval(timerRef.current); setView('topic_detail'); }}>
        ← Back
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 className="text-h2" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          {mode === 'speaking' ? <Icons.Mic/> : <Icons.Shield/>}
          {topic.title}
        </h2>
        <span className={`badge ${mode === 'test' ? 'badge-orange' : 'badge-blue'}`}>
          {mode === 'speaking' ? 'REAL-TIME' : 'TEST MODE'}
        </span>
      </div>

      {!speechSupported && (
        <div style={{ background: 'var(--warning)', color: 'white', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
          ⚠️ Speech recognition is not supported in this browser. Use Chrome or Edge for the best experience.
        </div>
      )}

      {/* Topic prompt */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <p className="text-muted" style={{fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem'}}>
          {mode === 'test' ? 'Test Topic' : 'Speak about'}
        </p>
        <h3 style={{ fontSize: '1.25rem', marginBottom: mode === 'speaking' ? '0.75rem' : 0 }}>{topic.title}</h3>
        {mode === 'speaking' && (
          <p className="text-muted" style={{fontSize: '0.875rem'}}>
            Focus areas: {topic.subtopics.join(' • ')}
          </p>
        )}
      </div>

      {/* Timer + Stats Bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <p className="text-muted" style={{fontSize: '0.75rem', marginBottom: '0.25rem'}}>Duration</p>
          <h2 className="text-h2" style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>{formatTime(elapsed)}</h2>
        </div>
        <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <p className="text-muted" style={{fontSize: '0.75rem', marginBottom: '0.25rem'}}>Words</p>
          <h2 className="text-h2" style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>{wordCount}</h2>
        </div>
        {isRecording && (
          <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
            <p className="text-muted" style={{fontSize: '0.75rem', marginBottom: '0.25rem'}}>Flow</p>
            <div className={`live-indicator ${indicator === 'green' ? 'indicator-green' : 'indicator-red'}`} style={{justifyContent: 'center', border: 'none', padding: '0.25rem'}}>
              <div className="indicator-dot"></div>
              {indicator === 'green' ? 'Good' : 'Pause'}
            </div>
          </div>
        )}
      </div>

      {/* Live Transcript Area */}
      <div className="card" style={{ marginBottom: '1.5rem', minHeight: '200px', maxHeight: '350px', overflow: 'hidden' }}>
        <p className="text-muted" style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem'}}>Live Transcript</p>
        <div ref={transcriptRef} style={{ maxHeight: '280px', overflowY: 'auto', lineHeight: 1.8, fontSize: '1rem' }}>
          {currentTranscript ? (
            <p>{finalText}<span style={{ opacity: 0.5 }}>{interimText}</span></p>
          ) : (
            <p className="text-muted" style={{ fontStyle: 'italic' }}>
              {isRecording ? 'Listening... start speaking.' : 'Press the button below to start recording.'}
            </p>
          )}
        </div>
      </div>

      {/* Recording Controls */}
      <div className="card" style={{ textAlign: 'center', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        {isRecording && (
          <div className="recording-bar-container">
            <div className="recording-bar"></div><div className="recording-bar"></div><div className="recording-bar"></div>
            <div className="recording-bar"></div><div className="recording-bar"></div>
          </div>
        )}

        {isFinished ? (
          <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Generating your report...</p>
        ) : !isRecording ? (
          <button className="btn btn-primary" style={{ padding: '1rem 3rem', fontSize: '1.25rem', borderRadius: 'var(--radius-full)' }} onClick={handleStartRecording}>
            <Icons.Mic /> {elapsed > 0 ? 'Resume Speaking' : 'Start Speaking'}
          </button>
        ) : (
          <button className="btn btn-danger" style={{ padding: '1rem 3rem', fontSize: '1.25rem', borderRadius: 'var(--radius-full)' }} onClick={handleStop}>
            <Icons.Square /> Finish & Analyze
          </button>
        )}
      </div>
    </div>
  );
};

const ReportView = ({ report, setView, saveReport, shouldSave }) => {
  useEffect(() => {
    if (shouldSave) saveReport(report);
  }, [shouldSave, report, saveReport]);
  const { result } = report;
  const reportRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const getPdfOptions = () => ({
    margin: [10, 10, 10, 10],
    filename: `FluentMind_Report_${report.topicTitle.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#f5f0ea' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  });

  const handleDownloadPdf = async () => {
    if (!reportRef.current || !window.html2pdf) return;
    setGenerating(true);
    try {
      await window.html2pdf().set(getPdfOptions()).from(reportRef.current).save();
    } catch (e) { console.error('PDF generation error:', e); }
    setGenerating(false);
  };

  const handleViewPdf = async () => {
    if (!reportRef.current || !window.html2pdf) return;
    setGenerating(true);
    try {
      const blob = await window.html2pdf().set(getPdfOptions()).from(reportRef.current).outputPdf('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) { console.error('PDF generation error:', e); }
    setGenerating(false);
  };

  return (
    <div className="fade-in mx-auto" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className="text-h1">Detailed Analysis Report</h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleViewPdf} disabled={generating}>
            <Icons.Book /> {generating ? 'Generating…' : 'View PDF'}
          </button>
          <button className="btn btn-outline" onClick={handleDownloadPdf} disabled={generating} style={{borderColor: 'var(--primary)', color: 'var(--primary)'}}>
            <Icons.ArrowRight /> {generating ? 'Generating…' : 'Download PDF'}
          </button>
          <button className="btn btn-primary" onClick={() => setView('dashboard')}>Return to Dashboard</button>
        </div>
      </div>

      {/* Printable report area */}
      <div ref={reportRef} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '0.5rem' }}>
        {/* PDF Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>FLUENTMIND</h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Speaking Analysis Report • {report.topicTitle} • {report.mode} mode • {formatDate(report.date)}</p>
        </div>

        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <p className="text-muted" style={{ marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.875rem' }}>Overall Score</p>
            <div className="score-circle">{result.fluency}</div>
          </div>
          <div className="card" style={{gridColumn: 'span 2'}}>
            <h3 className="text-h3" style={{marginBottom: '1rem'}}>Performance Metrics</h3>
            <div className="grid-2">
              <div style={{background: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)'}}>
                <p className="text-muted" style={{fontSize: '0.875rem'}}>Speaking Speed (WPM)</p>
                <h2 className="text-h2 text-primary">{result.speed}</h2>
              </div>
              <div style={{background: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)'}}>
                <p className="text-muted" style={{fontSize: '0.875rem'}}>Pause Frequency (per min)</p>
                <h2 className="text-h2 text-warning">{result.pauseFreq}</h2>
              </div>
              <div style={{background: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)'}}>
                <p className="text-muted" style={{fontSize: '0.875rem'}}>Grammar Accuracy</p>
                <h2 className="text-h2 text-secondary">{result.grammar} / 10</h2>
              </div>
              <div style={{background: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)'}}>
                <p className="text-muted" style={{fontSize: '0.875rem'}}>Vocabulary Richness</p>
                <h2 className="text-h2 text-purple">{result.vocab} / 10</h2>
              </div>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card" style={{borderTop: '4px solid var(--danger)'}}>
            <h3 className="text-h3" style={{ marginBottom: '1rem', color: 'var(--danger)' }}>Accent & Pronunciation Trainer</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {result.mispronounced.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--background)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <strong style={{color: 'var(--danger)', textDecoration: 'line-through'}}>{item.word}</strong>
                    <span style={{marginLeft: '0.5rem', color: 'var(--secondary)', fontWeight: 600}}>→ {item.suggestion}</span>
                  </div>
                  <div className="ipa-text">{item.ipa}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{background: 'linear-gradient(to bottom right, var(--surface), var(--primary-light))'}}>
            <h3 className="text-h3" style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Smart Suggestions</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {result.smartSuggestions.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem', fontSize: '0.95rem' }}>
                  <Icons.Check /> <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};

const HistoryView = ({ history, onViewReport, onDeleteReport }) => (
  <div className="fade-in">
    <h1 className="text-h1" style={{marginBottom: '2rem'}}>Training History</h1>
    <div className="card">
      {history.length === 0 ? (
        <p className="text-muted text-center" style={{padding: '2rem 0'}}>No history available yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {history.slice().reverse().map(session => (
            <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <h3 style={{ fontWeight: 600 }}>{session.topicTitle}</h3>
                  <span className={`badge ${session.mode === 'test' ? 'badge-red' : 'badge-green'}`}>{session.mode}</span>
                </div>
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>{formatDate(session.date)} • Score: {session.result.fluency}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline" style={{padding: '0.5rem 1rem'}} onClick={() => onViewReport(session)}>
                  View Report
                </button>
                <button className="btn btn-danger" style={{padding: '0.5rem 1rem'}} onClick={() => onDeleteReport(session.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const ProfileView = ({ user, onLogout }) => {

  const totalXp = user.xp || 0;
  const currentLevel = Math.floor(totalXp / 100) + 1;
  const xpProgress = totalXp % 100;
  const xpToNext = 100 - xpProgress;
  const sessionCount = (user.history || []).length;

  const badgeCatalog = [
    { name: 'First Step', icon: '🚀', hint: 'Complete 1 session', unlocked: sessionCount >= 1 },
    { name: 'Rising Star', icon: '⭐', hint: 'Complete 5 sessions', unlocked: sessionCount >= 5 },
    { name: 'Streak Master', icon: '🔥', hint: 'Maintain 3-day streak', unlocked: (user.streak || 0) >= 3 },
    { name: 'Perfect Score', icon: '🏆', hint: 'Score 9.5+ once', unlocked: (user.badges || []).includes('Perfect Score') }
  ];

  return (
    <div className="fade-in mx-auto" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 className="text-h1" style={{marginBottom: '2rem'}}>Settings & Profile</h1>

      <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2.25rem 1.5rem' }}>
        <div style={{ width: '82px', height: '82px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.25rem', margin: '0 auto 1rem', fontWeight: 700 }}>
          {(user.name || 'U').charAt(0).toUpperCase()}
        </div>
        <h2 className="text-h2" style={{marginBottom: '0.25rem'}}>{user.name}</h2>
        <p className="text-muted" style={{marginBottom: '1rem'}}>{user.email}</p>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <span className="badge badge-purple">Goal: {user.goals}</span>
          <span className="badge badge-orange">🔥 {user.streak} Day Streak</span>
          <span className="badge badge-blue">Level {currentLevel}</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <h3 className="text-h3" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icons.Zap /> Level Progress</h3>
          <p className="text-muted" style={{fontSize: '0.88rem', marginBottom: '0.5rem'}}>Current Level: <strong>Level {currentLevel}</strong></p>
          <div className="progress-bar-bg" style={{marginBottom: '0.5rem'}}>
            <div className="progress-bar-fill" style={{width: `${xpProgress}%`}} />
          </div>
          <p className="text-muted" style={{fontSize: '0.8rem'}}>{totalXp} XP total • {xpToNext} XP to next level</p>
        </div>

        <div className="card">
          <h3 className="text-h3" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icons.Activity /> Stats</h3>
          <p className="text-muted" style={{fontSize: '0.9rem', marginBottom: '0.35rem'}}>Sessions Completed: <strong>{sessionCount}</strong></p>
          <p className="text-muted" style={{fontSize: '0.9rem', marginBottom: '0.35rem'}}>Best Streak: <strong>{user.streak || 0} days</strong></p>
          <p className="text-muted" style={{fontSize: '0.9rem'}}>Unlocked Badges: <strong>{badgeCatalog.filter(b => b.unlocked).length}</strong> / {badgeCatalog.length}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Icons.Award /> Badges & Progress</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
          {badgeCatalog.map((badge) => (
            <div key={badge.name} style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: badge.unlocked ? 'linear-gradient(135deg, var(--background), var(--primary-light))' : 'var(--surface)', opacity: badge.unlocked ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.3rem' }}>{badge.icon}</span>
                <strong style={{ fontSize: '0.9rem' }}>{badge.name}</strong>
              </div>
              <p className="text-muted" style={{ fontSize: '0.78rem' }}>{badge.hint}</p>
              <span className={`badge ${badge.unlocked ? 'badge-green' : 'badge-blue'}`} style={{ marginTop: '0.45rem' }}>
                {badge.unlocked ? 'Unlocked' : 'Locked'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-danger" style={{ width: '100%', padding: '1rem' }} onClick={onLogout}>
        <Icons.LogOut /> Log Out
      </button>
    </div>
  );
};

// --- App Shell ---

const App = () => {
  const [view, setView] = useState('signup'); 
  const [user, setUser] = useState(null);
  
  const [currentTopic, setCurrentTopic] = useState(null);
  const [currentMode, setCurrentMode] = useState('simulation');
  const [recentReport, setRecentReport] = useState(null);

  useEffect(() => {
    const usersMap = getStoredUsers();
    const currentEmail = normalizeEmail(localStorage.getItem(CURRENT_USER_EMAIL_KEY) || '');
    const activeFromMap = currentEmail ? usersMap[currentEmail] : null;
    const saved = localStorage.getItem('fm_user');

    if (activeFromMap) {
      setUser(activeFromMap);
      localStorage.setItem('fm_user', JSON.stringify(activeFromMap));
      setView('dashboard');
      return;
    }

    if(saved) {
      const parsed = JSON.parse(saved);
      const email = normalizeEmail(parsed.email || '');
      if (email) {
        usersMap[email] = parsed;
        setStoredUsers(usersMap);
        localStorage.setItem(CURRENT_USER_EMAIL_KEY, email);
      }
      setUser(parsed);
      setView('dashboard');
    }
  }, []);

  const persistActiveUser = (nextUser) => {
    const normalizedEmail = normalizeEmail(nextUser.email || '');
    const usersMap = getStoredUsers();
    usersMap[normalizedEmail] = nextUser;
    setStoredUsers(usersMap);
    localStorage.setItem(CURRENT_USER_EMAIL_KEY, normalizedEmail);
    localStorage.setItem('fm_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const handleLogin = (payload, mode = 'login') => {
    if (mode === 'signup') {
      const email = normalizeEmail(payload.email || '');
      const usersMap = getStoredUsers();
      const existing = usersMap[email];
      const nextUser = {
        ...(existing || defaultProfileFromEmail(email)),
        ...payload,
        email,
        name: (payload.name || existing?.name || 'User').trim() || 'User'
      };
      persistActiveUser(nextUser);
      setView('dashboard');
      return;
    }

    const loginEmail = normalizeEmail(payload.email || '');
    const usersMap = getStoredUsers();
    const foundUser = usersMap[loginEmail] || defaultProfileFromEmail(loginEmail);
    persistActiveUser(foundUser);
    setView('dashboard');
  };

  const saveReport = (report) => {
    if (!report) return;
    const normalizedReport = { ...report, isNew: false };

    const score = parseFloat(report.result.fluency);
    const xpGained = Math.floor(score * 10) + 20;
    let tempUser = { ...user, history: [...(user.history || []), normalizedReport], xp: (user.xp || 0) + xpGained };
    tempUser.badges = checkBadges(tempUser, report);
    persistActiveUser(tempUser);
    setRecentReport(normalizedReport);
  };

  const handleViewHistoryReport = (session) => {
    setRecentReport({ ...session, isNew: false });
    setView('report');
  };

  const handleDeleteReport = (reportId) => {
    if (!user) return;
    const shouldDelete = window.confirm('Delete this report permanently from your training history?');
    if (!shouldDelete) return;

    const nextHistory = (user.history || []).filter((entry) => entry.id !== reportId);
    const nextUser = { ...user, history: nextHistory };
    persistActiveUser(nextUser);
  };

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_USER_EMAIL_KEY);
    setUser(null);
    setView('signup');
  };

  const NavItem = ({ icon: Icon, label, id }) => (
    <button className={`nav-link ${view === id ? 'active' : ''}`} onClick={() => setView(id)} style={{width: '100%', justifyContent: 'flex-start'}}>
      <Icon /> {label}
    </button>
  );

  const MobileNavItem = ({ icon: Icon, label, id }) => (
    <button className={`mobile-nav-link ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
      <Icon /> <span>{label}</span>
    </button>
  );

  if (['login', 'signup'].includes(view)) {
    if(view === 'login') return <AuthView isLogin={true} setView={setView} onLogin={handleLogin} />;
    if(view === 'signup') return <AuthView isLogin={false} setView={setView} onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Icons.Mic /> FluentMind
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '1rem' }}>
          <NavItem icon={Icons.Home} label="Dashboard" id="dashboard" />
          <NavItem icon={Icons.Book} label="Topics" id="topics" />
          <NavItem icon={Icons.HistoryIcon} label="Training History" id="history" />
          <NavItem icon={Icons.User} label="My Profile" id="profile" />
        </nav>
      </aside>

      <main className="main-content">
        {view === 'dashboard' && <DashboardView user={user} history={user.history || []} setView={setView} />}
        {view === 'topics' && <TopicListView setView={setView} setCurrentTopic={setCurrentTopic} />}
        {view === 'topic_detail' && <TopicDetailView topic={currentTopic} setView={setView} setCurrentMode={setCurrentMode} />}
        {view === 'practice_session' && <PracticeSessionView topic={currentTopic} mode={currentMode} setView={setView} setRecentReport={setRecentReport} />}
        {view === 'report' && recentReport && (
          <ReportView
            report={recentReport}
            setView={setView}
            saveReport={saveReport}
            shouldSave={Boolean(recentReport?.isNew)}
          />
        )}
        {view === 'history' && (
          <HistoryView
            history={user.history || []}
            onViewReport={handleViewHistoryReport}
            onDeleteReport={handleDeleteReport}
          />
        )}
        {view === 'profile' && <ProfileView user={user} onLogout={handleLogout} />}
      </main>

      <nav className="mobile-nav">
        <MobileNavItem icon={Icons.Home} label="Dashboard" id="dashboard" />
        <MobileNavItem icon={Icons.Book} label="Topics" id="topics" />
        <MobileNavItem icon={Icons.HistoryIcon} label="History" id="history" />
        <MobileNavItem icon={Icons.User} label="Profile" id="profile" />
      </nav>
    </div>
  );
};

export default App;
