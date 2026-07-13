"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Code2,
  Download,
  FileCheck2,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Mic,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  UploadCloud,
  UserRound,
} from "lucide-react";

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
  kind?: "interview" | "coding";
  starterCode?: string;
  testCases?: string[];
  solutionOutline?: string;
  testExpression?: string;
  functionDeclaration?: string;
  expectedOutput?: string;
  referenceSolution?: string;
};

type Attempt = { score: number; answer: string; createdAt?: string };

type Profile = {
  candidateName: string;
  headline: string;
  summary: string;
  strengths: string[];
  focusTopics: string[];
  jobMatch?: string[];
  missingSkills?: string[];
  resumeRisks?: string[];
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Screen = "home" | "setup" | "practice" | "report";

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
  jobMatch: ["Responsive frontend delivery", "REST API integration"],
  missingSkills: ["Add the job description to identify gaps"],
  resumeRisks: ["Be ready to explain your exact contribution and measurable results"],
};

const STORAGE_KEY = "resume-coach-session-v2";
const fillerWords = ["um", "uh", "like", "basically", "actually", "literally", "you know"];

type StoredSession = {
  hasCreatedSession?: boolean;
  screen?: Screen;
  questions?: Question[];
  profile?: Profile;
  attempts?: Record<number, Attempt[]>;
  questionIndex?: number;
  answer?: string;
  feedback?: CoachResult | null;
  showSuggested?: boolean;
  role?: string;
  company?: string;
  interviewStage?: string;
  interviewDate?: string;
  jobDescription?: string;
  focusAreas?: string;
  interviewType?: string;
  practiceMode?: string;
  difficulty?: string;
  questionCount?: string;
  codeExpression?: string;
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

function codingContribution(question: Question, value: string) {
  if (question.kind !== "coding") return value;
  const starterLines = new Set((question.starterCode || "").split("\n").map((line) => line.trim()).filter(Boolean));
  return value.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed && !starterLines.has(trimmed);
  }).join("\n").trim();
}

function defaultInterviewDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date.toISOString().slice(0, 10);
}

function normalizeStoredQuestions(questions: Question[]) {
  return questions.map((item) => {
    const looksLikeCoding = /\b(implement|debug|algorithm|coding|refactor|write (?:code|a function|tests?)|test cases?|component)\b/i.test(`${item.category} ${item.prompt}`);
    const onlyPlaceholder = !item.starterCode || /write your solution here/i.test(item.starterCode);
    if (item.kind === "coding" && !item.testCases?.length && onlyPlaceholder && !looksLikeCoding) {
      return { ...item, kind: "interview" as const, starterCode: "" };
    }
    return item;
  });
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
  const [screen, setScreen] = useState<Screen>("setup");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [interviewStage, setInterviewStage] = useState("Technical round");
  const [interviewDate, setInterviewDate] = useState(defaultInterviewDate);
  const [jobDescription, setJobDescription] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [interviewType, setInterviewType] = useState("Mixed interview");
  const [practiceMode, setPracticeMode] = useState("Mock interview");
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
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [codeOutput, setCodeOutput] = useState("");
  const [codeExpression, setCodeExpression] = useState("");
  const [hasCreatedSession, setHasCreatedSession] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const safeQuestionIndex = Math.min(Math.max(questionIndex, 0), Math.max(sessionQuestions.length - 1, 0));
  const question = sessionQuestions[safeQuestionIndex] || defaultQuestions[0];
  const scoringAnswer = useMemo(() => codingContribution(question, answer), [answer, question]);
  const localResult = useMemo(() => evaluate(question, scoringAnswer), [question, scoringAnswer]);
  const questionAttempts = attempts[question.id] ?? [];
  const completedQuestions = Object.values(attempts).filter((items) => items.length > 0).length;
  const allAttempts = Object.values(attempts).flat();
  const averageScore = allAttempts.length ? Math.round(allAttempts.reduce((sum, item) => sum + item.score, 0) / allAttempts.length) : 0;
  const fillerCount = fillerWords.reduce((count, filler) => count + (answer.toLowerCase().match(new RegExp(`\\b${filler.replace(" ", "\\s+")}\\b`, "g"))?.length || 0), 0);
  const answerReady = question.kind === "coding" ? scoringAnswer.length >= 12 : answer.trim().length >= 35;

  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => setTipIndex((current) => (current + 1) % waitingTips.length), 3200);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    let restored: StoredSession | null = null;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) restored = JSON.parse(saved);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.queueMicrotask(() => {
      const restoredHasSession = Boolean(restored?.hasCreatedSession || restored?.screen === "practice" || restored?.screen === "report");
      const restoredQuestions = restored?.questions?.length ? normalizeStoredQuestions(restored.questions) : undefined;
      const restoredIndex = typeof restored?.questionIndex === "number" ? Math.min(Math.max(restored.questionIndex, 0), Math.max((restoredQuestions?.length || defaultQuestions.length) - 1, 0)) : 0;
      const migratedCurrentQuestion = restored?.questions?.[restoredIndex]?.kind === "coding" && restoredQuestions?.[restoredIndex]?.kind === "interview";
      if (restoredQuestions) setSessionQuestions(restoredQuestions);
      if (restored?.profile) setProfile(restored.profile);
      if (restored?.attempts) setAttempts(restored.attempts);
      if (typeof restored?.questionIndex === "number") setQuestionIndex(restoredIndex);
      if (typeof restored?.answer === "string") setAnswer(migratedCurrentQuestion && /write your solution here/i.test(restored.answer) ? "" : restored.answer);
      if (typeof restored?.codeExpression === "string") setCodeExpression(restored.codeExpression);
      if (restored?.feedback) setFeedback(restored.feedback);
      if (typeof restored?.showSuggested === "boolean") setShowSuggested(restored.showSuggested);
      if (typeof restored?.role === "string") setRole(restored.role);
      if (typeof restored?.company === "string") setCompany(restored.company);
      if (restored?.interviewStage) setInterviewStage(restored.interviewStage);
      if (restored?.interviewDate) setInterviewDate(restored.interviewDate);
      if (typeof restored?.jobDescription === "string") setJobDescription(restored.jobDescription);
      if (typeof restored?.focusAreas === "string") setFocusAreas(restored.focusAreas);
      if (restored?.interviewType) setInterviewType(restored.interviewType);
      if (restored?.practiceMode) setPracticeMode(restored.practiceMode);
      if (restored?.difficulty) setDifficulty(restored.difficulty);
      if (restored?.questionCount) setQuestionCount(restored.questionCount);
      setHasCreatedSession(restoredHasSession);
      if ((restored?.screen === "practice" || restored?.screen === "report") && restoredHasSession) setScreen(restored.screen);
      else if (restored?.screen === "setup") setScreen("setup");
      if (restoredHasSession) setSaveNotice("Previous progress restored on this device.");
      setIsHydrated(true);
    });

    const SpeechRecognition = (window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      || (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    window.queueMicrotask(() => setSpeechSupported(Boolean(SpeechRecognition)));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", captureInstall);
    return () => window.removeEventListener("beforeinstallprompt", captureInstall);
  }, []);

  useEffect(() => {
    if (!isHydrated || !sessionQuestions.length) return;
    const stored: StoredSession = { hasCreatedSession, screen, questions: sessionQuestions, profile, attempts, questionIndex: safeQuestionIndex, answer, feedback, showSuggested, role, company, interviewStage, interviewDate, jobDescription, focusAreas, interviewType, practiceMode, difficulty, questionCount, codeExpression };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [answer, attempts, codeExpression, company, difficulty, feedback, focusAreas, hasCreatedSession, interviewDate, interviewStage, interviewType, isHydrated, jobDescription, practiceMode, profile, questionCount, questionIndex, role, safeQuestionIndex, screen, sessionQuestions, showSuggested]);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => setSecondsLeft((current) => {
      if (current <= 1) {
        setTimerRunning(false);
        recognitionRef.current?.stop();
        return 0;
      }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setTimerRunning(false);
      return;
    }
    const Recognition = (window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      || (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    let committed = answer.trim();
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) committed = `${committed} ${result[0].transcript}`.trim();
        else interim += result[0].transcript;
      }
      setAnswer(`${committed} ${interim}`.trim());
    };
    recognition.onend = () => { setIsListening(false); setTimerRunning(false); };
    recognition.onerror = () => { setIsListening(false); setTimerRunning(false); setEvaluationError("Microphone transcription stopped. You can continue by typing."); };
    recognitionRef.current = recognition;
    setSecondsLeft(90);
    setTimerRunning(true);
    setIsListening(true);
    recognition.start();
  }

  function resetAnswerTools() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setTimerRunning(false);
    setSecondsLeft(90);
    setCodeOutput("");
  }

  function runCode() {
    if (!answer.trim()) return;
    setCodeOutput("Running…");
    const workerSource = `self.onmessage=async({data})=>{const format=v=>{if(typeof v==='string')return v;if(v===undefined)return'undefined';try{return JSON.stringify(v,null,2)}catch{return String(v)}};const logs=[];const safeConsole={log:(...v)=>logs.push(v.map(format).join(' ')),warn:(...v)=>logs.push('Warning: '+v.map(format).join(' ')),error:(...v)=>logs.push('Error: '+v.map(format).join(' '))};try{const expression=String(data.expression||'').trim();const suffix=expression?'\\nreturn ('+expression+');':'';const body='"use strict"; return (async()=>{\\n'+data.code+suffix+'\\n})();';const result=await new Function('console','fetch','XMLHttpRequest','WebSocket','importScripts',body)(safeConsole,undefined,undefined,undefined,undefined);const sections=[];if(logs.length)sections.push('Console:\\n'+logs.join('\\n'));if(expression)sections.push('Result:\\n'+format(result));self.postMessage({ok:true,text:sections.join('\\n\\n')||'Code ran successfully. Add console.log(...) or a test expression to see a value.'})}catch(error){const sections=[];if(logs.length)sections.push('Console:\\n'+logs.join('\\n'));sections.push('Error:\\n'+(error?.message||String(error)));self.postMessage({ok:false,text:sections.join('\\n\\n')})}}`;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const timeout = window.setTimeout(() => { worker.terminate(); URL.revokeObjectURL(workerUrl); setCodeOutput("Stopped after 2 seconds. Check for an infinite loop."); }, 2000);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; text: string }>) => {
      window.clearTimeout(timeout);
      setCodeOutput(`${event.data.ok ? "✓ " : ""}${event.data.text}`);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
    worker.postMessage({ code: answer, expression: codeExpression });
  }

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
      formData.append("practiceMode", practiceMode);
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
      setAnswer(data.questions[0]?.kind === "coding" ? data.questions[0]?.starterCode || "" : "");
      setCodeExpression(data.questions[0]?.kind === "coding" ? data.questions[0]?.testExpression || "" : "");
      setAttempts({});
      setFeedback(null);
      setHasCreatedSession(true);
      setSaveNotice("Session saved automatically on this device.");
      setScreen("practice");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Question generation failed. Please try again.");
      setScreen("setup");
    } finally {
      setIsGenerating(false);
    }
  }

  async function submitAnswer() {
    if (!answerReady) return;
    setIsEvaluating(true);
    setEvaluationError("");
    try {
      const formData = new FormData();
      formData.append("action", "evaluate");
      formData.append("role", role);
      formData.append("question", question.prompt);
      formData.append("answer", answer);
      formData.append("starterCode", question.starterCode || "");
      formData.append("reference", question.reference);
      formData.append("expected", question.expected.join(", "));
      formData.append("suggested", question.suggested);
      formData.append("kind", question.kind || "interview");
      const response = await fetch("/api/interview", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || typeof data.total !== "number") throw new Error(data.error || "Feedback failed.");
      setFeedback(data);
      setAttempts((current) => ({ ...current, [question.id]: [...(current[question.id] ?? []), { score: data.total, answer, createdAt: new Date().toISOString() }] }));
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "AI feedback is unavailable. Showing an instant coaching estimate instead.");
      setFeedback(localResult);
      setAttempts((current) => ({ ...current, [question.id]: [...(current[question.id] ?? []), { score: localResult.total, answer, createdAt: new Date().toISOString() }] }));
    } finally {
      setIsEvaluating(false);
    }
  }

  function tryAgain() {
    resetAnswerTools();
    setFeedback(null);
    setEvaluationError("");
    setShowSuggested(false);
    setAnswer("");
  }

  function nextQuestion() {
    selectQuestion((questionIndex + 1) % sessionQuestions.length);
  }

  function selectQuestion(index: number) {
    resetAnswerTools();
    setQuestionIndex(index);
    setAnswer(sessionQuestions[index]?.kind === "coding" ? sessionQuestions[index]?.starterCode || "" : "");
    setCodeExpression(sessionQuestions[index]?.kind === "coding" ? sessionQuestions[index]?.testExpression || "" : "");
    setFeedback(null);
    setEvaluationError("");
    setShowSuggested(false);
  }

  function practiseFollowUp() {
    if (!feedback?.followUp) return;
    const followUpQuestion: Question = {
      id: Math.max(...sessionQuestions.map((item) => item.id)) + 1,
      category: "Adaptive follow-up",
      level: question.level,
      prompt: feedback.followUp,
      reference: question.reference,
      tested: feedback.relatedTopics.length ? feedback.relatedTopics : question.tested,
      expected: question.expected,
      suggested: "Answer the follow-up directly, add one defensible example, and connect it to the decision or result you described previously.",
      followUp: "What would you do differently next time?",
      kind: "interview",
    };
    setSessionQuestions((current) => [...current, followUpQuestion]);
    setQuestionIndex(sessionQuestions.length);
    setAnswer("");
    setFeedback(null);
    setShowSuggested(false);
    resetAnswerTools();
  }

  function resetAndStartFresh() {
    resetAnswerTools();
    window.localStorage.removeItem(STORAGE_KEY);
    setScreen("setup");
    setRole("");
    setCompany("");
    setInterviewStage("Technical round");
    setInterviewDate(defaultInterviewDate());
    setJobDescription("");
    setFocusAreas("");
    setInterviewType("Mixed interview");
    setPracticeMode("Mock interview");
    setDifficulty("Intermediate");
    setQuestionCount("30");
    setResumeName("");
    setResumeText("");
    setResumeFile(null);
    if (inputRef.current) inputRef.current.value = "";
    setSessionQuestions(defaultQuestions);
    setProfile(defaultProfile);
    setAttempts({});
    setQuestionIndex(0);
    setAnswer("");
    setFeedback(null);
    setShowSuggested(false);
    setGenerationError("");
    setEvaluationError("");
    setCodeOutput("");
    setCodeExpression("");
    setHasCreatedSession(false);
    setSaveNotice("Previous data cleared. Upload a resume to start fresh.");
  }

  function requestReset() {
    if (window.confirm("Reset everything? This clears all saved questions, answers, scores, settings, and progress on this device.")) resetAndStartFresh();
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (screen === "home") {
    return (
      <main className="landing-shell">
        <nav className="topbar"><a className="brand" href="#top" aria-label="Resume Interview Coach home"><span className="brand-mark">R</span>Resume Interview Coach</a><button className="ghost-button" onClick={() => setScreen("setup")}>Try a demo <span>→</span></button></nav>
        <section className="hero" id="top">
          <div className="hero-copy"><p className="eyebrow">PRACTISE WHAT YOUR RESUME PROMISES</p><h1>Turn your resume into your strongest interview answer.</h1><p className="hero-subtitle">Personalised questions, clear feedback and a better answer on every retry - built around the experience you actually have.</p><div className="hero-actions"><button className="primary-button" onClick={() => setScreen("setup")}>Start practising <ArrowRight size={16} aria-hidden="true" /></button><button className="text-button" onClick={() => { loadDemoProfile(); setScreen("setup"); }}><Sparkles size={15} aria-hidden="true" /> Explore a sample session</button></div><p className="privacy-note">No generic question dump. Start with your resume, role and interview type.</p></div>
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
          <div className="setup-nav-actions">{hasCreatedSession && <button className="reset-button" onClick={requestReset}><Trash2 size={14} aria-hidden="true" /> Reset</button>}{installPrompt && <button className="install-button" onClick={installApp}><Download size={14} aria-hidden="true" /> Install app</button>}<span className="step-label">SETUP <b>01 / 02</b></span></div>
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
              <span className="upload-icon">{resumeName ? <FileCheck2 size={20} aria-hidden="true" /> : <UploadCloud size={20} aria-hidden="true" />}</span><b>{resumeName || (isDraggingResume ? "Drop it here" : "Drag and drop your resume")}</b><small>{resumeName ? "Ready for personalised analysis" : "or click to browse · PDF, DOCX or TXT"}</small>
            </div>
            <button className="demo-link" onClick={loadDemoProfile}>Use the frontend developer sample instead</button>
            <label>Target role <span className="optional-tag">AUTO</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Automatically detected from your resume" /><small className="field-hint">Leave blank to let the coach identify your strongest matching role. Enter a role only to override it.</small></label>
            <label>Practice experience<select value={practiceMode} onChange={(event) => setPracticeMode(event.target.value)}><option>Mock interview</option><option>Voice interview</option><option>Coding lab</option></select></label>
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
            {saveNotice && <p className="save-notice" role="status">{saveNotice}</p>}
            <button className="primary-button full-button" disabled={!resumeName} onClick={beginPractice}><Sparkles size={16} aria-hidden="true" /> Create practice session <ArrowRight size={16} aria-hidden="true" /></button>
            <p className="secure-note">Your AI keys stay on the server. Resume content is only sent to create this session.</p>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "report") {
    const weakQuestions = sessionQuestions.filter((item) => {
      const itemAttempts = attempts[item.id];
      return itemAttempts?.length && itemAttempts[itemAttempts.length - 1].score < 75;
    }).slice(0, 5);
    const readiness = completedQuestions === 0 ? "Start practising" : averageScore >= 80 ? "Interview ready" : averageScore >= 65 ? "Nearly ready" : "Needs focused practice";
    return (
      <main className="report-shell">
        <nav className="topbar"><button className="brand brand-button" onClick={() => setScreen("home")}><span className="brand-mark">R</span>Resume Interview Coach</button><button className="secondary-button" onClick={() => setScreen("practice")}><ArrowLeft size={15} aria-hidden="true" /> Back to practice</button></nav>
        <section className="report-wrap">
          <div className="report-hero"><div><p className="eyebrow">READINESS REPORT</p><h1>{readiness}</h1><p>{completedQuestions} of {sessionQuestions.length} questions practised · {allAttempts.length} total attempts</p></div><div className="readiness-score"><strong>{averageScore}</strong><span>average score</span></div></div>
          <div className="report-metrics"><div><span>Completion</span><strong>{Math.round((completedQuestions / sessionQuestions.length) * 100)}%</strong></div><div><span>Best attempt</span><strong>{allAttempts.length ? Math.max(...allAttempts.map((item) => item.score)) : 0}</strong></div><div><span>Questions remaining</span><strong>{sessionQuestions.length - completedQuestions}</strong></div></div>
          <div className="report-grid">
            <section className="report-card"><span className="card-icon teal"><BookOpenCheck size={19} aria-hidden="true" /></span><p className="eyebrow">NEXT 24 HOURS</p><h2>Your focused revision plan</h2><ol><li>Practise the {Math.min(5, sessionQuestions.length - completedQuestions || 5)} highest-priority unanswered questions.</li><li>Repeat every answer below 75 until it has a clear example and result.</li><li>Revise: {(profile.focusTopics || []).slice(0, 3).join(", ") || "your role fundamentals"}.</li><li>Finish with one timed voice mock without opening answer guides.</li></ol></section>
            <section className="report-card"><span className="card-icon gold"><TrendingUp size={19} aria-hidden="true" /></span><p className="eyebrow">WEAK ANSWERS</p><h2>Practise these again</h2>{weakQuestions.length ? <ul>{weakQuestions.map((item) => <li key={item.id}><button onClick={() => { selectQuestion(sessionQuestions.indexOf(item)); setScreen("practice"); }}>{item.prompt}</button></li>)}</ul> : <p>No low-scoring answers yet. Complete a few questions to identify weak areas.</p>}</section>
            <section className="report-card"><span className="card-icon coral"><ShieldCheck size={19} aria-hidden="true" /></span><p className="eyebrow">RESUME CLAIM CHECK</p><h2>Be ready to defend</h2><ul>{(profile.resumeRisks?.length ? profile.resumeRisks : sessionQuestions.slice(0, 4).map((item) => `${item.reference}: explain your exact contribution and result.`)).map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section className="report-card"><span className="card-icon teal"><Target size={19} aria-hidden="true" /></span><p className="eyebrow">JOB MATCH</p><h2>Strengths and gaps</h2><h3>Matches</h3><div className="report-tags">{(profile.jobMatch || profile.strengths).map((item) => <span key={item}>{item}</span>)}</div><h3>Revise or clarify</h3><div className="report-tags warning">{(profile.missingSkills || profile.focusTopics).map((item) => <span key={item}>{item}</span>)}</div></section>
          </div>
          <div className="report-actions"><button className="reset-button" onClick={requestReset}><Trash2 size={15} aria-hidden="true" /> Reset &amp; start fresh</button><button className="primary-button" onClick={() => setScreen("practice")}>Continue practising <ArrowRight size={16} aria-hidden="true" /></button></div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => setScreen("home")}><span className="brand-mark">R</span>Resume Interview Coach</button>
        <div className="candidate-card"><span className="initials">{profile.candidateName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{profile.candidateName}</b><small>{profile.headline || role}</small></div></div>
        <div className="session-info"><p>YOUR SESSION</p><strong>{practiceMode}</strong><span>{difficulty} · {sessionQuestions.length} resume-matched questions</span><i><i style={{ width: `${(completedQuestions / sessionQuestions.length) * 100}%` }} /></i></div>
        <ol className="question-list">{sessionQuestions.map((item, index) => <li key={item.id} className={index === questionIndex ? "active" : ""}><button onClick={() => selectQuestion(index)}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.category}</b><small>{attempts[item.id]?.length ? `${attempts[item.id].length} attempt${attempts[item.id].length > 1 ? "s" : ""} · ${attempts[item.id].at(-1)?.score}` : "Not started"}</small></div></button></li>)}</ol>
        <button className="report-link" onClick={() => setScreen("report")}><BarChart3 size={16} aria-hidden="true" /> View readiness report <span>{averageScore || "—"}</span></button>
        <button className="sidebar-link" onClick={() => setScreen("setup")}><ArrowLeft size={14} aria-hidden="true" /> Edit session settings</button>
        <button className="sidebar-link reset-link" onClick={requestReset}><Trash2 size={14} aria-hidden="true" /> Reset &amp; start fresh</button>
      </aside>

      <section className="practice-area">
        <header className="practice-header"><div><p className="eyebrow">{question.category.toUpperCase()}</p><span className="question-progress">QUESTION {safeQuestionIndex + 1} OF {sessionQuestions.length}</span></div><div className="header-actions"><button className="mobile-report-button" onClick={() => setScreen("report")}><BarChart3 size={13} aria-hidden="true" /> {averageScore || "—"}</button><span className={`question-type-pill ${question.kind === "coding" ? "coding" : "discussion"}`}>{question.kind === "coding" ? <Code2 size={13} aria-hidden="true" /> : <MessageCircleQuestion size={13} aria-hidden="true" />}{question.kind === "coding" ? "Coding task" : "Discussion"}</span><span className="difficulty-pill">{question.level}</span><span className="ai-badge"><Sparkles size={13} aria-hidden="true" /> AI interviewer</span></div></header>
        <article className="question-card"><div className="question-meta"><span>{question.kind === "coding" ? <Code2 size={13} aria-hidden="true" /> : <MessageCircleQuestion size={13} aria-hidden="true" />}{question.reference}</span><span>•</span><span>Tests: {question.tested.join(", ")}</span></div><h1>{question.prompt}</h1>{question.kind === "coding" && <div className="code-contract"><div><span>REQUIRED DECLARATION</span><code>{question.functionDeclaration || question.starterCode?.split("\n")[0] || "Use the declaration in the starter code"}</code></div><div><span>EXPECTED OUTPUT</span><pre>{question.expectedOutput || "Run the supplied test expression and match its expected value."}</pre></div></div>}<details className="intent-note"><summary><Lightbulb size={15} aria-hidden="true" /> Why the interviewer asks this</summary><p>They are checking {question.tested.join(", ")}, whether your explanation matches <b>{question.reference}</b>, and how clearly you separate your contribution from the team’s work.</p></details><p className="coach-note"><Lightbulb size={15} aria-hidden="true" /><span><b>Coach tip:</b> {question.kind === "coding" ? "State the contract, implement the smallest correct solution, run every case, then explain complexity. Starter code never counts toward your score." : "Lead with your contribution, then explain the decision you made and its result. Keep it under 90 seconds."}</span></p>{question.kind === "coding" && Boolean(question.testCases?.length) && <div className="test-case-list"><b><ListChecks size={14} aria-hidden="true" /> Inputs and expected outputs</b>{question.testCases?.map((item) => <code key={item}>{item}</code>)}</div>}</article>

        <section className="answer-card">
          <div className="answer-heading"><div><h2>{question.kind === "coding" ? "Your solution" : "Your answer"}</h2><p>{question.kind === "coding" ? "Complete the declaration, run the sample, and inspect both Console and Result." : "Speak or type naturally. The coach looks for useful detail, not length."}</p></div><span className={answerReady ? "word-good" : ""}>{question.kind === "coding" ? `${scoringAnswer.split("\n").filter(Boolean).length} added lines` : `${cleanWords(answer).length} words`}</span></div>
          {question.kind !== "coding" && <div className="voice-toolbar"><button className={`voice-button ${isListening ? "is-live" : ""}`} disabled={!speechSupported} onClick={toggleVoice}>{isListening ? <Square size={13} fill="currentColor" aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}{isListening ? "Stop recording" : "Answer with voice"}</button><div className={`answer-timer ${secondsLeft <= 15 ? "time-low" : ""}`}><Timer size={14} aria-hidden="true" /><strong>{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</strong><span>90-sec target</span></div><span>{speechSupported ? `${fillerCount} filler word${fillerCount === 1 ? "" : "s"}` : "Voice unavailable — type your answer"}</span></div>}
          <textarea className={question.kind === "coding" ? "code-editor" : ""} value={answer} disabled={isEvaluating} onChange={(event) => { setAnswer(event.target.value); if (feedback) setFeedback(null); }} placeholder={question.kind === "coding" ? "Write your JavaScript solution here…" : "Start with the situation or your responsibility. Then explain what you did and what happened..."} aria-label={question.kind === "coding" ? "Your code solution" : "Your interview answer"} spellCheck={question.kind !== "coding"} />
          {question.kind === "coding" && <div className="code-runner"><div className="code-test-row"><label>Runnable sample / test expression<input value={codeExpression} onChange={(event) => setCodeExpression(event.target.value)} placeholder="e.g. transformItems([1, 2, 3])" spellCheck={false} /></label><button className="secondary-button" onClick={runCode} disabled={!answer.trim()}><Play size={14} fill="currentColor" aria-hidden="true" /> Run JavaScript</button></div><small className="code-comment-note">The sample logs its values and returns the result. Comments work normally: <code>{"// one line"}</code> and <code>{"/* multiple lines */"}</code>. Prefilled lines do not count toward your score.</small><pre aria-live="polite">{codeOutput || "Console logs and the sample result will appear here."}</pre></div>}
          {!feedback && <div className="answer-help">
            <button className="help-button" onClick={() => setShowSuggested((current) => !current)}><BookOpenCheck size={14} aria-hidden="true" />{showSuggested ? "Hide answer guide" : "I don’t know — show answer guide"}</button>
            {showSuggested && (question.kind === "coding" ? <div className="pre-answer-guide coding-guide"><b>Approach</b><p>{question.solutionOutline || question.suggested}</p><b>Working reference solution</b>{question.referenceSolution ? <pre>{question.referenceSolution}</pre> : <p>Create a new Coding Lab session to receive the upgraded executable answer.</p>}<small>Study why it works, close the guide, then write the solution yourself. The guide and starter code never count toward your score.</small></div> : <div className="pre-answer-guide"><b>Use this structure</b><p>{question.suggested}</p><small>Read it, close the guide, then answer again in your own words. Keep only details you can truthfully explain.</small></div>)}
          </div>}
          {!feedback && <div className="answer-footer"><span>{!answerReady ? (question.kind === "coding" ? "Add a complete solution before requesting feedback." : "Give a few complete sentences to get feedback.") : "Ready when you are."}</span><button className="primary-button" disabled={!answerReady || isEvaluating} onClick={submitAnswer}>{isEvaluating ? <Sparkles className="icon-spin" size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}{isEvaluating ? "AI coach is reviewing…" : "Get coaching feedback"}<ArrowRight size={15} aria-hidden="true" /></button></div>}
          {evaluationError && <p className="inline-warning" role="status">{evaluationError}</p>}
        </section>

        {feedback && <section className="feedback-section">
          <div className="score-card"><div className="score-orbit"><strong>{feedback.total}</strong><span>out of 100</span></div><div><p className="eyebrow">YOUR COACHING RESULT</p><h2>{feedback.total >= 75 ? "A strong answer with room to sharpen." : "Good start. Add the details that make it believable."}</h2><p>{feedback.summary}</p></div><div className="attempt-history"><span>ATTEMPTS</span>{questionAttempts.map((attempt, index) => <div key={`${attempt.score}-${index}`}><small>Try {index + 1}</small><b>{attempt.score}</b>{index > 0 && <em>{attempt.score - questionAttempts[index - 1].score >= 0 ? "+" : ""}{attempt.score - questionAttempts[index - 1].score}</em>}</div>)}</div></div>
          <div className="score-breakdown">{scoreLabels.map(([key, label, max]) => { const value = feedback.scores[key]; return <div key={key}><div><span>{label}</span><b>{value}/{max}</b></div><i><i style={{ width: `${(value / max) * 100}%` }} /></i></div>; })}</div>
          <div className="feedback-grid"><div className="feedback-box success"><h3><CheckCircle2 size={17} aria-hidden="true" /> What worked</h3><ul>{feedback.worked.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="feedback-box improve"><h3><CircleAlert size={17} aria-hidden="true" /> Make it stronger</h3><ul>{feedback.improve.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
          <details className="suggested-answer" open={showSuggested} onToggle={(event) => setShowSuggested((event.target as HTMLDetailsElement).open)}><summary>{question.kind === "coding" ? "See the working reference solution" : "See a stronger answer"} <span>⌄</span></summary><div>{question.kind === "coding" && question.referenceSolution ? <pre className="feedback-code">{question.referenceSolution}</pre> : <p>{feedback.betterAnswer}</p>}<small>{question.kind === "coding" ? "Compare the logic and edge cases, then rewrite it yourself. Reference code is never included in your score." : "Use this as a structure guide. Keep only details you can truthfully defend."}</small></div></details>
          <div className="follow-up-card"><p className="eyebrow"><MessageCircleQuestion size={14} aria-hidden="true" /> THE INTERVIEWER CONTINUES</p><h3>{feedback.followUp}</h3><div>{feedback.relatedTopics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
          <div className="feedback-actions"><button className="secondary-button" onClick={tryAgain}><RotateCcw size={15} aria-hidden="true" /> Improve this answer</button><button className="secondary-button" onClick={practiseFollowUp}><MessageCircleQuestion size={15} aria-hidden="true" /> Answer follow-up</button><button className="primary-button" onClick={nextQuestion}>Next question <ArrowRight size={15} aria-hidden="true" /></button></div>
        </section>}
      </section>

      <aside className="coach-rail"><div className="rail-card"><span className="rail-icon"><UserRound size={18} aria-hidden="true" /></span><p className="eyebrow">RESUME SNAPSHOT</p><h3>{profile.headline}</h3><p>{profile.summary}</p></div><div className="rail-card"><p className="eyebrow"><ListChecks size={13} aria-hidden="true" /> LISTEN FOR</p><ul>{question.expected.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rail-card"><p className="eyebrow"><BookOpenCheck size={13} aria-hidden="true" /> TOPICS TO REVISE</p><ul>{profile.focusTopics.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rail-card follow-up"><p className="eyebrow"><MessageCircleQuestion size={13} aria-hidden="true" /> LIKELY FOLLOW-UP</p><p>{question.followUp}</p></div></aside>
      <nav className="mobile-bottom-nav" aria-label="Practice navigation"><button onClick={() => selectQuestion(Math.max(0, questionIndex - 1))}><ChevronLeft size={17} aria-hidden="true" /><span>Previous</span></button><button className="active"><ListChecks size={17} aria-hidden="true" /><span>{questionIndex + 1} / {sessionQuestions.length}</span></button><button onClick={nextQuestion}><ChevronRight size={17} aria-hidden="true" /><span>Next</span></button><button onClick={() => setScreen("report")}><BarChart3 size={17} aria-hidden="true" /><span>Report</span></button></nav>
    </main>
  );
}
