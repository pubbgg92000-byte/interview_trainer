"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

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
  return { scores, total, missing, exact, hasStructure, hasExample };
}

export default function Home() {
  const [screen, setScreen] = useState<"home" | "setup" | "practice">("home");
  const [role, setRole] = useState("Frontend Developer");
  const [interviewType, setInterviewType] = useState("Mixed interview");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [resumeName, setResumeName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>(defaultQuestions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluated, setEvaluated] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);
  const [attempts, setAttempts] = useState<Record<number, Attempt[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const question = sessionQuestions[questionIndex];
  const result = useMemo(() => (evaluated ? evaluate(question, answer) : null), [answer, evaluated, question]);
  const questionAttempts = attempts[question.id] ?? [];

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeName(file.name);
    setResumeFile(file);
    setGenerationError("");
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      file.text().then(setResumeText);
    } else {
      setResumeText("Resume file ready for analysis. This demo uses the personalised frontend-developer interview set.");
    }
  }

  function useDemoProfile() {
    setResumeName("Arvind_Mangalarapu_Frontend_Resume.pdf");
    setResumeText("Frontend developer with Svelte, Tailwind CSS, REST APIs, n8n, Cloudflare and Selenium experience.");
    setResumeFile(null);
    setGenerationError("");
  }

  async function beginPractice() {
    setIsGenerating(true);
    setGenerationError("");
    try {
      const formData = new FormData();
      formData.append("resumeText", resumeText || "Frontend developer seeking a role.");
      formData.append("role", role);
      formData.append("interviewType", interviewType);
      formData.append("difficulty", difficulty);
      if (resumeFile) formData.append("resume", resumeFile);
      const response = await fetch("/api/interview", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.questions)) throw new Error(data.error || "Question generation failed.");
      setSessionQuestions(data.questions);
      setQuestionIndex(0);
      setAttempts({});
      setScreen("practice");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Question generation failed. Please try again.");
      setSessionQuestions(defaultQuestions);
    } finally {
      setIsGenerating(false);
    }
  }

  function submitAnswer() {
    if (answer.trim().length < 35) return;
    const score = evaluate(question, answer).total;
    setAttempts((current) => ({ ...current, [question.id]: [...(current[question.id] ?? []), { score, answer }] }));
    setEvaluated(true);
  }

  function tryAgain() {
    setEvaluated(false);
    setShowSuggested(false);
    setAnswer("");
  }

  function nextQuestion() {
    setQuestionIndex((current) => (current + 1) % sessionQuestions.length);
    setAnswer("");
    setEvaluated(false);
    setShowSuggested(false);
  }

  if (screen === "home") {
    return (
      <main className="landing-shell">
        <nav className="topbar"><a className="brand" href="#top" aria-label="Resume Interview Coach home"><span className="brand-mark">R</span>Resume Interview Coach</a><button className="ghost-button" onClick={() => setScreen("setup")}>Try a demo <span>→</span></button></nav>
        <section className="hero" id="top">
          <div className="hero-copy"><p className="eyebrow">PRACTISE WHAT YOUR RESUME PROMISES</p><h1>Turn your resume into your strongest interview answer.</h1><p className="hero-subtitle">Personalised questions, clear feedback and a better answer on every retry - built around the experience you actually have.</p><div className="hero-actions"><button className="primary-button" onClick={() => setScreen("setup")}>Start practising <span>→</span></button><button className="text-button" onClick={() => { useDemoProfile(); setScreen("setup"); }}>Explore a sample session</button></div><p className="privacy-note">No generic question dump. Start with your resume, role and interview type.</p></div>
          <div className="coach-preview" aria-label="Example coaching feedback"><div className="preview-head"><span className="live-dot" /> Live practice <span>Question 3 of 12</span></div><p className="preview-label">PROJECT DEEP DIVE</p><h2>How did you make your API-connected frontend screen reliable?</h2><div className="mini-answer"><span>Your answer</span><p>“I showed loading states and handled errors...”</p></div><div className="preview-score"><div><strong>78</strong><span>/ 100</span></div><p><b>Getting stronger.</b><br />Add one real debugging example to make this answer more convincing.</p></div></div>
        </section>
        <section className="feature-row"><div><span>01</span><h3>Resume-aware questions</h3><p>Skills, projects, claims and career transitions become realistic prompts.</p></div><div><span>02</span><h3>Feedback with substance</h3><p>See what was accurate, unclear or missing - not just a generic score.</p></div><div><span>03</span><h3>Practise until it clicks</h3><p>Track every attempt and improve the same answer with purpose.</p></div></section>
      </main>
    );
  }

  if (screen === "setup") {
    return (
      <main className="setup-shell"><nav className="topbar"><button className="brand brand-button" onClick={() => setScreen("home")}><span className="brand-mark">R</span>Resume Interview Coach</button><span className="step-label">SETUP <b>01 / 02</b></span></nav><section className="setup-grid"><div className="setup-copy"><p className="eyebrow">BUILD YOUR SESSION</p><h1>Bring the resume. We’ll find the questions behind it.</h1><p>Choose the interview you want to practise. You can change these settings anytime.</p><div className="profile-strip"><span className="initials">AM</span><div><b>{resumeName ? "Resume ready to analyse" : "Start with your resume"}</b><small>{resumeName || "PDF, DOCX or TXT, up to 10MB"}</small></div></div></div><div className="setup-card"><div className={`dropzone ${resumeName ? "has-file" : ""}`} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}><input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={onFileChange} /><span className="upload-icon">↑</span><b>{resumeName || "Upload your resume"}</b><small>{resumeName ? "Ready for personalised analysis" : "PDF, DOCX or TXT"}</small></div><button className="demo-link" onClick={useDemoProfile}>Use Arvind’s frontend developer sample instead</button><label>Target role<input value={role} onChange={(event) => setRole(event.target.value)} /></label><div className="option-grid"><label>Interview type<select value={interviewType} onChange={(event) => setInterviewType(event.target.value)}><option>Mixed interview</option><option>Technical interview</option><option>Project-based interview</option><option>Behavioural interview</option><option>Rapid-fire interview</option></select></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div><button className="primary-button full-button" onClick={beginPractice}>Create practice session <span>→</span></button></div></section></main>
    );
  }

  return (
    <main className="app-shell"><aside className="sidebar"><button className="brand brand-button" onClick={() => setScreen("home")}><span className="brand-mark">R</span>Resume Interview Coach</button><div className="candidate-card"><span className="initials">AM</span><div><b>Arvind Mangalarapu</b><small>{role}</small></div></div><div className="session-info"><p>YOUR SESSION</p><strong>{interviewType}</strong><span>{difficulty} · Resume matched</span></div><ol className="question-list">{sessionQuestions.map((item, index) => <li key={item.id} className={index === questionIndex ? "active" : ""}><button onClick={() => { setQuestionIndex(index); setAnswer(""); setEvaluated(false); setShowSuggested(false); }}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.category}</b><small>{attempts[item.id]?.length ? `${attempts[item.id].length} attempt${attempts[item.id].length > 1 ? "s" : ""}` : "Not started"}</small></div></button></li>)}</ol><button className="sidebar-link" onClick={() => setScreen("setup")}>← Edit session settings</button></aside>
      <section className="practice-area"><header className="practice-header"><div><p className="eyebrow">{question.category.toUpperCase()}</p><span className="question-progress">QUESTION {questionIndex + 1} OF {sessionQuestions.length}</span></div><div className="header-actions"><span className="difficulty-pill">{question.level}</span><button className="save-button">Session saved</button></div></header><article className="question-card"><div className="question-meta"><span>{question.reference}</span><span>•</span><span>Tests: {question.tested.join(", ")}</span></div><h1>{question.prompt}</h1><p className="coach-note"><b>Coach tip:</b> Lead with your contribution, then explain the decision you made and its result. Keep it under 90 seconds.</p></article>
        <section className="answer-card"><div className="answer-heading"><div><h2>Your answer</h2><p>Write as you would speak. The coach looks for useful detail, not length.</p></div><span className={answer.length > 35 ? "word-good" : ""}>{cleanWords(answer).length} words</span></div><textarea value={answer} onChange={(event) => { setAnswer(event.target.value); if (evaluated) setEvaluated(false); }} placeholder="Start with the situation or your responsibility. Then explain what you did and what happened..." aria-label="Your interview answer" />{!evaluated && <div className="answer-footer"><span>{answer.trim().length < 35 ? "Write at least a few complete sentences to get feedback." : "Ready when you are."}</span><button className="primary-button" disabled={answer.trim().length < 35} onClick={submitAnswer}>Get coaching feedback <span>→</span></button></div>}</section>
        {evaluated && result && <section className="feedback-section"><div className="score-card"><div className="score-orbit"><strong>{result.total}</strong><span>out of 100</span></div><div><p className="eyebrow">YOUR COACHING RESULT</p><h2>{result.total >= 75 ? "A strong answer with room to sharpen." : "Good start. Add the details that make it believable."}</h2><p>{result.total >= 75 ? "You addressed the prompt clearly. Now make the outcome and your personal contribution even more specific." : "You have the right direction. Use the points below to make your explanation clearer and more complete."}</p></div><div className="attempt-history"><span>ATTEMPTS</span>{questionAttempts.map((attempt, index) => <div key={`${attempt.score}-${index}`}><small>Try {index + 1}</small><b>{attempt.score}</b>{index > 0 && <em>+{attempt.score - questionAttempts[index - 1].score}</em>}</div>)}</div></div><div className="score-breakdown">{scoreLabels.map(([key, label, max]) => { const value = result.scores[key]; return <div key={key}><div><span>{label}</span><b>{value}/{max}</b></div><i><i style={{ width: `${(value / max) * 100}%` }} /></i></div>; })}</div><div className="feedback-grid"><div className="feedback-box success"><h3>What worked</h3><ul><li>{result.exact.length ? `You included relevant points: ${result.exact.join(", ")}.` : "You attempted a direct answer rather than avoiding the question."}</li><li>{result.hasStructure ? "Your answer has a visible flow, which makes it easier to follow." : "You kept the focus on the question."}</li></ul></div><div className="feedback-box improve"><h3>Make it stronger</h3><ul>{result.missing.slice(0, 3).map((item) => <li key={item}>Add a clear point about <b>{item}</b>.</li>)}{!result.hasExample && <li>Include one specific example of what <b>you</b> did.</li>}</ul></div></div><details className="suggested-answer" open={showSuggested} onToggle={(event) => setShowSuggested((event.target as HTMLDetailsElement).open)}><summary>View suggested answer <span>⌄</span></summary><div><p>{question.suggested}</p><small>This is a structure guide. Use only details you can truthfully explain.</small></div></details><div className="feedback-actions"><button className="secondary-button" onClick={tryAgain}>↻ Try again</button><button className="primary-button" onClick={nextQuestion}>Next question <span>→</span></button></div></section>}
      </section>
      <aside className="coach-rail"><div className="rail-card"><span className="rail-icon">✦</span><p className="eyebrow">QUESTION INTENT</p><h3>Why this is being asked</h3><p>Your resume claims experience in <b>{question.reference}</b>. An interviewer wants to understand what you personally did, not just the tools named.</p></div><div className="rail-card"><p className="eyebrow">LISTEN FOR</p><ul>{question.expected.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rail-card follow-up"><p className="eyebrow">LIKELY FOLLOW-UP</p><p>{question.followUp}</p></div></aside>
    </main>
  );
}
