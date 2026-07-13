"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type Question = {
  id: number;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  prompt: string;
  reference: string;
  tested: string[];
  expected: string[];
  suggested: string;
  followUp: string;
};

type Attempt = { score: number; answer: string };

type Profile = {
  candidateName: string;
  headline: string;
  summary: string;
  strengths: string[];
  focusTopics: string[];
};

type CoachResult = {
  scores: Record<(typeof scoreLabels)[number][0], number>;
  total: number;
  summary: string;
  worked: string[];
  improve: string[];
  betterAnswer: string;
  followUp: string;
  relatedTopics: string[];
};

const defaultQuestions: Question[] = [
  {
    id: 1,
    category: "Introduction",
    level: "Intermediate",
    prompt: "Tell me about yourself and your experience as a frontend developer.",
    reference: "Professional Summary",
    tested: ["communication", "resume clarity", "career narrative"],
    expected: ["frontend", "svelte", "tailwind", "api", "testing", "startup"],
    suggested:
      "I am a frontend-focused developer with startup experience building responsive, customer-facing interfaces. At Uncommon Design Services, I used Svelte, JavaScript and Tailwind CSS to build reusable UI sections, connect REST APIs, and test key user journeys. I also have exposure to AI workflow automation with n8n. I enjoy turning product requirements into clean, reliable flows, and I am now looking to grow in a frontend team that ships production features.",
    followUp: "What was your exact contribution to the meal subscription platform?",
  },
  {
    id: 2,
    category: "Project deep dive",
    level: "Intermediate",
    prompt: "Walk me through the meal subscription platform and your exact contribution.",
    reference: "Meal Subscription Frontend Platform",
    tested: ["project explanation", "Svelte", "ownership"],
    expected: ["subscription", "responsive", "component", "svelte", "api", "testing"],
    suggested:
      "It was a customer-facing meal subscription experience. I focused on responsive Svelte UI sections, reusable component patterns, and API-connected screens. I designed for loading, success, empty and basic error states, then tested navigation, forms and layouts across breakpoints. My contribution was frontend delivery and UI quality; I would improve it next with stronger automated tests and accessibility checks.",
    followUp: "How did you handle loading, success, empty and error states?",
  },
  {
    id: 3,
    category: "Technical skills",
    level: "Intermediate",
    prompt: "How do you connect a frontend screen to a REST API and handle failures?",
    reference: "REST API Integration",
    tested: ["REST APIs", "error handling", "frontend states"],
    expected: ["fetch", "loading", "error", "response", "state", "retry"],
    suggested:
      "I first model the UI states: loading, success, empty and error. I call the API with fetch or the project client, check response.ok, parse the result, then update the UI state. For failures, I show a clear message and a retry path where it helps. In debugging, I inspect the browser network panel, request payload, status code and console before changing code. I keep secrets on the server, never in the frontend bundle.",
    followUp: "How would you debug an API request that works locally but fails in production?",
  },
  {
    id: 4,
    category: "AI workflow",
    level: "Intermediate",
    prompt: "Explain one AI workflow you built using n8n. How did you make it reliable?",
    reference: "AI Workflow Automation Project",
    tested: ["n8n", "LLMs", "guardrails"],
    expected: ["trigger", "prompt", "validation", "output", "monitoring", "guardrail"],
    suggested:
      "I designed a modular n8n workflow with a trigger, data preparation, a structured LLM prompt and an output action. To improve reliability, I validated inputs, constrained the response format, added conditional logic for failures and kept logs so we could review prompt behavior. For sensitive or high-risk actions, I would use permission limits and a human review step rather than automatically trusting model output.",
    followUp: "What would happen if one node in the workflow failed?",
  },
  {
    id: 5,
    category: "Behavioural",
    level: "Intermediate",
    prompt: "Tell me about a time requirements changed quickly. How did you respond?",
    reference: "Lean startup experience",
    tested: ["adaptability", "communication", "delivery"],
    expected: ["requirement", "clarify", "impact", "component", "test", "deliver"],
    suggested:
      "In a lean startup, priorities sometimes changed as product feedback arrived. I clarified the new user need and acceptance criteria first, then separated reusable UI work from the change-specific part. I communicated the impact, delivered the smallest safe update, and retested the affected user journey. This helped me move quickly without treating quality checks as optional.",
    followUp: "How did you communicate the trade-off to the team?",
  },
];

const scoreLabels = [
  ["relevance", "Relevance", 20],
  ["technical", "Technical accuracy", 25],
  ["consistency", "Resume consistency", 15],
  ["structure", "Structure", 15],
  ["communication", "Communication", 15],
  ["examples", "Evidence & examples", 10],
] as const;

const defaultProfile: Profile = {
  candidateName: "Arvind Mangalarapu",
  headline: "Frontend Developer",
  summary: "Frontend-focused candidate with experience in responsive interfaces, APIs, testing, and AI workflows.",
  strengths: ["Frontend delivery", "API integration", "AI workflow exposure"],
  focusTopics: ["Frontend architecture", "API reliability", "Testing strategy", "Behavioural stories"],
};

const waitingTips = [
  "A clear answer is better than a long answer. Lead with what you personally did.",
  "For project questions, use: context, responsibility, action, and result.",
  "If you do not know an answer, explain how you would find the answer instead of guessing.",
  "Interviewers listen for evidence. One real example is stronger than five buzzwords.",
  "Pause before answering. A thoughtful two-second pause sounds confident.",
];

function cleanWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

function evaluate(question: Question, answer: string) {
  const words = cleanWords(answer);
  const exact = question.expected.filter((item) => words.includes(item));
  const hasStructure = /\b(first|then|because|result|learned|context|challenge)\b/.test(answer.toLowerCase());
  const hasExample = /\b(i|my|we)\b/.test(answer.toLowerCase()) && answer.length > 180;
  const hasClearSentences = answer.split(/[.!?]/).filter((part) => part.trim().length > 10).length >= 2;
  const content = exact.length / question.expected.length;
  const length = Math.min(answer.trim().length / 320, 1);
  const scores = {
    relevance: Math.round(8 + content * 9 + length * 3),
    technical: Math.round(8 + content * 12 + length * 5),
    consistency: Math.round(6 + content * 6 + (hasExample ? 3 : 0)),
    structure: Math.round(5 + (hasStructure ? 7 : 0) + (hasClearSentences ? 3 : 0)),
    communication: Math.round(7 + (hasClearSentences ? 5 : 0) + Math.min(answer.length / 180, 1) * 3),
    examples: Math.round(2 + (hasExample ? 5 : 0) + content * 3),
  };
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const missing = question.expected.filter((item) => !exact.includes(item));
  return {
    scores,
    total,
    summary: total >= 75
      ? "You addressed the prompt clearly. Make the outcome and your personal contribution more specific."
      : "You have the right direction. Add concrete evidence and a clearer sequence.",
    worked: [
      exact.length ? `You included relevant ideas: ${exact.join(", ")}.` : "You attempted a direct answer.",
      hasStructure ? "Your answer has a visible flow." : "You stayed focused on the question.",
    ],
    improve: [
      ...missing.slice(0, 3).map((item) => `Add a clear point about ${item}.`),
      ...(!hasExample ? ["Include one specific example of what you personally did."] : []),
    ].slice(0, 4),
    betterAnswer: question.suggested,
    followUp: question.followUp,
    relatedTopics: question.tested,
  } satisfies CoachResult;
}

export default function Home() {
  const [screen, setScreen] = useState<"home" | "setup" | "practice">("setup");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [interviewStage, setInterviewStage] = useState("Technical round");
  const [interviewDate, setInterviewDate] = useState("2026-07-15");
  const [jobDescription, setJobDescription] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [interviewType, setInterviewType] = useState("Mixed interview");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [questionCount, setQuestionCount] = useState("30");
  const [resumeName, setResumeName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>(defaultQuestions);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [evaluationError, setEvaluationError] = useState("");
  const [tipIndex, setTipIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<CoachResult | null>(null);
  const [showSuggested, setShowSuggested] = useState(false);
  const [attempts, setAttempts] = useState<Record<number, Attempt[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const question = sessionQuestions[questionIndex];
  const localResult = useMemo(() => evaluate(question, answer), [answer, question]);
  const questionAttempts = attempts[question.id] ?? [];

  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => setTipIndex((current) => (current + 1) % waitingTips.length), 3200);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  function acceptResume(file: File) {
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      setGenerationError("Please choose a PDF, DOCX, or TXT resume.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setGenerationError("Please choose a resume smaller than 4MB.");
      return;
    }
    setResumeName(file.name);
    setResumeFile(file);
    setResumeText("");
    setGenerationError("");
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      file.text().then(setResumeText);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) acceptResume(file);
  }

  function onResumeDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingResume(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptResume(file);
  }

  function loadDemoProfile() {
    setResumeName("Arvind_Mangalarapu_Frontend_Resume.pdf");
    setResumeText("Frontend developer with Svelte, Tailwind CSS, REST APIs, n8n, Cloudflare and Selenium experience.");
    setResumeFile(null);
    setRole("");
    setGenerationError("");
  }

  async function beginPractice() {
    setIsGenerating(true);
    setGenerationError("");
    try {
      const formData = new FormData();
      formData.append("action", "session");
      formData.append("resumeText", resumeText);
      formData.append("role", role);
      formData.append("company", company);
      formData.append("interviewStage", interviewStage);
      formData.append("interviewDate", interviewDate);
      formData.append("jobDescription", jobDescription);
      formData.append("focusAreas", focusAreas);
      formData.append("interviewType", interviewType);
      formData.append("difficulty", difficulty);
      formData.append("questionCount", questionCount);
      if (resumeFile) formData.append("resume", resumeFile);
      const response = await fetch("/api/interview", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.questions)) throw new Error(data.error || "Question generation failed.");
      setSessionQuestions(data.questions);
      if (data.profile) {
        setProfile(data.profile);
        if (!role.trim() && data.profile.headline) setRole(data.profile.headline);
      }
      setQuestionIndex(0);
      setAttempts({});
      setFeedback(null);
      setScreen("practice");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Question generation failed. Please try again.");
      setSessionQuestions(defaultQuestions);
    } finally {
      setIsGenerating(false);
    }
  }

  async function submitAnswer() {
    if (answer.trim().length < 35) return;
    setIsEvaluating(true);
    setEvaluationError("");
    try {
      const formData = new FormData();
      formData.append("action", "evaluate");
      formData.append("role", role);
      formData.append("question", question.prompt);
      formData.append("answer", answer);
      formData.append("reference", question.reference);
      formData.append("expected", question.expected.join(", "));
      formData.append("suggested", question.suggested);
      const response = await fetch("/api/interview", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || typeof data.total !== "number") throw new Error(data.error || "Feedback failed.");
      setFeedback(data);
      setAttempts((current) => ({ ...current, [question.id]: [...(current[question.id] ?? []), { score: data.total, answer }] }));
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "AI feedback is unavailable. Showing an instant coaching estimate instead.");
      setFeedback(localResult);
      setAttempts((current) => ({ ...current, [question.id]: [...(current[question.id] ?? []), { score: localResult.total, answer }] }));
    } finally {
      setIsEvaluating(false);
    }
  }

  function tryAgain() {
    setFeedback(null);
    setEvaluationError("");
    setShowSuggested(false);
    setAnswer("");
  }

  function nextQuestion() {
    setQuestionIndex((current) => (current + 1) % sessionQuestions.length);
    setAnswer("");
    setFeedback(null);
    setEvaluationError("");
    setShowSuggested(false);
  }

  if (screen === "home") {
    return (
      <main className="landing-shell">
        <nav className="topbar"><a className="brand" href="#top" aria-label="Resume Interview Coach home"><span className="brand-mark">R</span>Resume Interview Coach</a><button className="ghost-button" onClick={() => setScreen("setup")}>Try a demo <span>→</span></button></nav>
        <section className="hero" id="top">
          <div className="hero-copy"><p className="eyebrow">PRACTISE WHAT YOUR RESUME PROMISES</p><h1>Turn your resume into your strongest interview answer.</h1><p className="hero-subtitle">Personalised questions, clear feedback and a better answer on every retry - built around the experience you actually have.</p><div className="hero-actions"><button className="primary-button" onClick={() => setScreen("setup")}>Start practising <span>→</span></button><button className="text-button" onClick={() => { loadDemoProfile(); setScreen("setup"); }}>Explore a sample session</button></div><p className="privacy-note">No generic question dump. Start with your resume, role and interview type.</p></div>
          <div className="coach-preview" aria-label="Example coaching feedback"><div className="preview-head"><span className="live-dot" /> Live practice <span>Question 3 of 12</span></div><p className="preview-label">PROJECT DEEP DIVE</p><h2>How did you make your API-connected frontend screen reliable?</h2><div className="mini-answer"><span>Your answer</span><p>“I showed loading states and handled errors...”</p></div><div className="preview-score"><div><strong>78</strong><span>/ 100</span></div><p><b>Getting stronger.</b><br />Add one real debugging example to make this answer more convincing.</p></div></div>
        </section>
        <section className="feature-row"><div><span>01</span><h3>Resume-aware questions</h3><p>Skills, projects, claims and career transitions become realistic prompts.</p></div><div><span>02</span><h3>Feedback with substance</h3><p>See what was accurate, unclear or missing - not just a generic score.</p></div><div><span>03</span><h3>Practise until it clicks</h3><p>Track every attempt and improve the same answer with purpose.</p></div></section>
      </main>
    );
  }

  if (isGenerating) {
    return (
      <main className="generation-shell" aria-live="polite">
        <div className="generation-card">
          <span className="generation-mark">✦</span>
          <div className="generation-spinner" aria-hidden="true" />
          <p className="eyebrow">GEMINI IS PREPARING YOUR SESSION</p>
          <h1>Turning your resume into realistic interview questions.</h1>
          <p>We are identifying your experience, skills, projects, and the follow-up questions an interviewer is likely to ask.</p>
          <div className="generation-steps"><span>Resume analysed</span><span>Questions tailored</span><span>Coach session ready</span></div>
          <div className="waiting-tip"><span>INTERVIEW TIP</span><p>“{waitingTips[tipIndex]}”</p></div>
        </div>
      </main>
    );
  }

  if (screen === "setup") {
    return (
      <main className="setup-shell">
        <nav className="topbar">
          <button className="brand brand-button" onClick={() => setScreen("home")}><span className="brand-mark">R</span>Resume Interview Coach</button>
          <span className="step-label">SETUP <b>01 / 02</b></span>
        </nav>
        <section className="setup-grid">
          <div className="setup-copy">
            <p className="eyebrow">BUILD YOUR SESSION</p>
            <h1>Bring the resume. We’ll find the questions behind it.</h1>
            <p>Choose the interview you want to practise. You can change these settings anytime.</p>
            <div className="profile-strip"><span className="initials">CV</span><div><b>{resumeName ? "Resume ready to analyse" : "Start with your resume"}</b><small>{resumeName || "PDF, DOCX or TXT, up to 4MB"}</small></div></div>
          </div>
          <div className="setup-card">
            <div
              className={`dropzone ${resumeName ? "has-file" : ""} ${isDraggingResume ? "is-dragging" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setIsDraggingResume(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDraggingResume(false)}
              onDrop={onResumeDrop}
              role="button"
              aria-label="Drop your resume here or click to browse"
              tabIndex={0}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={onFileChange} />
              <span className="upload-icon">↑</span><b>{resumeName || (isDraggingResume ? "Drop it here" : "Drag and drop your resume")}</b><small>{resumeName ? "Ready for personalised analysis" : "or click to browse · PDF, DOCX or TXT"}</small>
            </div>
            <button className="demo-link" onClick={loadDemoProfile}>Use the frontend developer sample instead</button>
            <label>Target role <span className="optional-tag">AUTO</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Automatically detected from your resume" /><small className="field-hint">Leave blank to let the coach identify your strongest matching role. Enter a role only to override it.</small></label>
            <div className="option-grid">
              <label>Interview type<select value={interviewType} onChange={(event) => setInterviewType(event.target.value)}><option>Mixed interview</option><option>Technical interview</option><option>Project-based interview</option><option>Behavioural interview</option><option>Rapid-fire interview</option></select></label>
              <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
            </div>
            <label>Question bank size<select value={questionCount} onChange={(event) => setQuestionCount(event.target.value)}><option value="20">20 focused questions</option><option value="30">30 complete questions</option><option value="40">40 intensive questions</option><option value="50">50 maximum-coverage questions</option></select></label>
            <div className="option-grid">
              <label>Company (optional)<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="e.g. Zomato" /></label>
              <label>Interview round<select value={interviewStage} onChange={(event) => setInterviewStage(event.target.value)}><option>Recruiter screening</option><option>Hiring manager round</option><option>Technical round</option><option>Live coding round</option><option>Final round</option></select></label>
            </div>
            <label>Interview date<input type="date" value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} /></label>
            <label>Job description (recommended)<textarea className="context-textarea" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the job description so questions match what the employer needs." /></label>
            <label>What do you want to improve?<textarea className="context-textarea short" value={focusAreas} onChange={(event) => setFocusAreas(event.target.value)} placeholder="e.g. JavaScript fundamentals, explaining my projects, confidence, career gap" /></label>
            {generationError && <p className="form-error" role="alert">{generationError}</p>}
            <button className="primary-button full-button" disabled={!resumeName} onClick={beginPractice}>Create practice session <span>→</span></button>
            <p className="secure-note">Your AI keys stay on the server. Resume content is only sent to create this session.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => setScreen("home")}><span className="brand-mark">R</span>Resume Interview Coach</button>
        <div className="candidate-card"><span className="initials">{profile.candidateName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{profile.candidateName}</b><small>{profile.headline || role}</small></div></div>
        <div className="session-info"><p>YOUR SESSION</p><strong>{interviewType}</strong><span>{difficulty} · {sessionQuestions.length} resume-matched questions</span></div>
        <ol className="question-list">{sessionQuestions.map((item, index) => <li key={item.id} className={index === questionIndex ? "active" : ""}><button onClick={() => { setQuestionIndex(index); setAnswer(""); setFeedback(null); setEvaluationError(""); setShowSuggested(false); }}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.category}</b><small>{attempts[item.id]?.length ? `${attempts[item.id].length} attempt${attempts[item.id].length > 1 ? "s" : ""}` : "Not started"}</small></div></button></li>)}</ol>
        <button className="sidebar-link" onClick={() => setScreen("setup")}>← Edit session settings</button>
      </aside>

      <section className="practice-area">
        <header className="practice-header"><div><p className="eyebrow">{question.category.toUpperCase()}</p><span className="question-progress">QUESTION {questionIndex + 1} OF {sessionQuestions.length}</span></div><div className="header-actions"><span className="difficulty-pill">{question.level}</span><span className="ai-badge">✦ AI interviewer</span></div></header>
        <article className="question-card"><div className="question-meta"><span>{question.reference}</span><span>•</span><span>Tests: {question.tested.join(", ")}</span></div><h1>{question.prompt}</h1><p className="coach-note"><b>Coach tip:</b> Lead with your contribution, then explain the decision you made and its result. Keep it under 90 seconds.</p></article>

        <section className="answer-card">
          <div className="answer-heading"><div><h2>Your answer</h2><p>Write as you would speak. The coach looks for useful detail, not length.</p></div><span className={answer.length > 35 ? "word-good" : ""}>{cleanWords(answer).length} words</span></div>
          <textarea value={answer} disabled={isEvaluating} onChange={(event) => { setAnswer(event.target.value); if (feedback) setFeedback(null); }} placeholder="Start with the situation or your responsibility. Then explain what you did and what happened..." aria-label="Your interview answer" />
          {!feedback && <div className="answer-help">
            <button className="help-button" onClick={() => setShowSuggested((current) => !current)}>{showSuggested ? "Hide answer guide" : "I don’t know — show answer guide"}</button>
            {showSuggested && <div className="pre-answer-guide"><b>Use this structure</b><p>{question.suggested}</p><small>Read it, close the guide, then answer again in your own words. Keep only details you can truthfully explain.</small></div>}
          </div>}
          {!feedback && <div className="answer-footer"><span>{answer.trim().length < 35 ? "Write at least a few complete sentences to get feedback." : "Ready when you are."}</span><button className="primary-button" disabled={answer.trim().length < 35 || isEvaluating} onClick={submitAnswer}>{isEvaluating ? "Gemini is reviewing…" : "Get coaching feedback"} <span>→</span></button></div>}
          {evaluationError && <p className="inline-warning" role="status">{evaluationError}</p>}
        </section>

        {feedback && <section className="feedback-section">
          <div className="score-card"><div className="score-orbit"><strong>{feedback.total}</strong><span>out of 100</span></div><div><p className="eyebrow">YOUR COACHING RESULT</p><h2>{feedback.total >= 75 ? "A strong answer with room to sharpen." : "Good start. Add the details that make it believable."}</h2><p>{feedback.summary}</p></div><div className="attempt-history"><span>ATTEMPTS</span>{questionAttempts.map((attempt, index) => <div key={`${attempt.score}-${index}`}><small>Try {index + 1}</small><b>{attempt.score}</b>{index > 0 && <em>{attempt.score - questionAttempts[index - 1].score >= 0 ? "+" : ""}{attempt.score - questionAttempts[index - 1].score}</em>}</div>)}</div></div>
          <div className="score-breakdown">{scoreLabels.map(([key, label, max]) => { const value = feedback.scores[key]; return <div key={key}><div><span>{label}</span><b>{value}/{max}</b></div><i><i style={{ width: `${(value / max) * 100}%` }} /></i></div>; })}</div>
          <div className="feedback-grid"><div className="feedback-box success"><h3>What worked</h3><ul>{feedback.worked.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="feedback-box improve"><h3>Make it stronger</h3><ul>{feedback.improve.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
          <details className="suggested-answer" open={showSuggested} onToggle={(event) => setShowSuggested((event.target as HTMLDetailsElement).open)}><summary>See a stronger answer <span>⌄</span></summary><div><p>{feedback.betterAnswer}</p><small>Use this as a structure guide. Keep only details you can truthfully defend.</small></div></details>
          <div className="follow-up-card"><p className="eyebrow">THE INTERVIEWER CONTINUES</p><h3>{feedback.followUp}</h3><div>{feedback.relatedTopics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
          <div className="feedback-actions"><button className="secondary-button" onClick={tryAgain}>↻ Improve this answer</button><button className="primary-button" onClick={nextQuestion}>Next question <span>→</span></button></div>
        </section>}
      </section>

      <aside className="coach-rail"><div className="rail-card"><span className="rail-icon">✦</span><p className="eyebrow">RESUME SNAPSHOT</p><h3>{profile.headline}</h3><p>{profile.summary}</p></div><div className="rail-card"><p className="eyebrow">LISTEN FOR</p><ul>{question.expected.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rail-card"><p className="eyebrow">TOPICS TO REVISE</p><ul>{profile.focusTopics.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rail-card follow-up"><p className="eyebrow">LIKELY FOLLOW-UP</p><p>{question.followUp}</p></div></aside>
    </main>
  );
}
