import { NextResponse } from "next/server";

const MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
] as const;
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type GeneratedQuestion = {
  category?: string;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  question?: string;
  resume_reference?: string;
  skills_tested?: string[];
  expected_points?: string[];
  suggested_answer?: string;
  follow_up?: string;
  kind?: "interview" | "coding";
  starter_code?: string;
  test_cases?: string[];
  solution_outline?: string;
};

type DimensionKey =
  | "relevance"
  | "technical"
  | "consistency"
  | "structure"
  | "communication"
  | "examples";

const dimensionLimits: Record<DimensionKey, number> = {
  relevance: 20,
  technical: 25,
  consistency: 15,
  structure: 15,
  communication: 15,
  examples: 10,
};

function parseJson<T>(value: string): T {
  const cleaned = value.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned) as T;
}

function outputText(result: unknown) {
  const data = result as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

async function generateWithGemini(apiKey: string | undefined, parts: Array<Record<string, unknown>>, maxOutputTokens = 4096) {
  if (!apiKey) return { ok: false as const, status: 503, retryAfter: null, provider: "gemini" };
  let lastFailure = { status: 502, retryAfter: null as string | null, model: MODELS[0] as string };
  for (const model of MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.25,
            maxOutputTokens,
          },
        }),
      },
    );

    if (response.ok) {
      return { ok: true as const, text: outputText(await response.json()), model, provider: "gemini" };
    }

    lastFailure = { status: response.status, retryAfter: response.headers.get("retry-after"), model };
    if (![404, 429, 503].includes(response.status)) break;
  }
  console.warn("Gemini request failed", lastFailure);
  return { ok: false as const, ...lastFailure };
}

async function generateWithOpenRouter(
  apiKey: string | undefined,
  parts: Array<Record<string, unknown>>,
  maxOutputTokens: number,
) {
  if (!apiKey) return { ok: false as const, status: 503, retryAfter: null, provider: "openrouter" };

  const content: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if (typeof part.text === "string") content.push({ type: "text", text: part.text });
    const inline = part.inlineData as { mimeType?: string; data?: string } | undefined;
    if (inline?.data && inline.mimeType === "application/pdf") {
      content.push({
        type: "file",
        file: {
          filename: "resume.pdf",
          file_data: `data:application/pdf;base64,${inline.data}`,
        },
      });
    }
  }

  const hasPdf = content.some((part) => part.type === "file");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Resume Interview Coach",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      temperature: 0.25,
      max_tokens: maxOutputTokens,
      ...(hasPdf
        ? { plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }] }
        : {}),
    }),
  });

  if (!response.ok) {
    const failure = {
      ok: false as const,
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      provider: "openrouter",
    };
    console.warn("OpenRouter request failed", failure);
    return failure;
  }

  const result = await response.json() as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = result.choices?.[0]?.message?.content || "";
  if (!text) return { ok: false as const, status: 502, retryAfter: null, provider: "openrouter" };
  return { ok: true as const, text, model: result.model || "openrouter/free", provider: "openrouter" };
}

async function generateWithProviders(
  geminiKey: string | undefined,
  openRouterKey: string | undefined,
  parts: Array<Record<string, unknown>>,
  maxOutputTokens: number,
) {
  const gemini = await generateWithGemini(geminiKey, parts, maxOutputTokens);
  if (gemini.ok) return gemini;
  return generateWithOpenRouter(openRouterKey, parts, maxOutputTokens);
}

function cleanStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit);
}

async function createSession(form: FormData, geminiKey: string | undefined, openRouterKey: string | undefined) {
  const requestedRole = String(form.get("role") || "").trim().slice(0, 120);
  const role = requestedRole || "the strongest matching role inferred from the resume";
  const company = String(form.get("company") || "Not provided").slice(0, 160);
  const interviewStage = String(form.get("interviewStage") || "Not provided").slice(0, 120);
  const interviewDate = String(form.get("interviewDate") || "Not provided").slice(0, 40);
  const focusAreas = String(form.get("focusAreas") || "Not provided").slice(0, 1000);
  const jobDescription = String(form.get("jobDescription") || "Not provided").slice(0, 12000);
  const interviewType = String(form.get("interviewType") || "Mixed interview").slice(0, 120);
  const practiceMode = String(form.get("practiceMode") || "Mock interview").slice(0, 60);
  const difficulty = String(form.get("difficulty") || "Intermediate").slice(0, 30);
  const requestedCount = Number(form.get("questionCount") || 30);
  const questionCount = [20, 30, 40, 50].includes(requestedCount) ? requestedCount : 30;
  const resumeText = String(form.get("resumeText") || "").slice(0, 30000);
  const resume = form.get("resume");

  if (!resumeText.trim() && !(resume instanceof File)) {
    return NextResponse.json({ error: "Please upload a resume or paste resume text first." }, { status: 400 });
  }

  const prompt = `You are a rigorous but encouraging interview coach. Analyse the supplied resume and interview context, then create exactly ${questionCount} realistic ${difficulty.toLowerCase()} ${interviewType.toLowerCase()} questions for this opportunity.

Interview context:
- Target role: ${requestedRole || "Infer the candidate's strongest matching role from the resume and use it consistently."}
- Company: ${company}
- Interview stage: ${interviewStage}
- Interview date: ${interviewDate}
- Candidate's requested focus areas: ${focusAreas}
- Job description: ${jobDescription}

Rules:
- Use only claims supported by the resume. Never invent employers, dates, metrics, certifications, technologies, or achievements.
- Cover introduction, role-specific knowledge, project depth, and behavioural evidence when relevant.
- Build a comprehensive bank across resume walkthrough, career transition, JavaScript, the candidate's frontend framework, HTML/CSS/responsiveness, REST APIs, debugging, performance, testing, deployment, AI/automation claims, project deep dives, behavioural situations, and hiring-manager fit. Omit a category only when the resume and role make it irrelevant.
- Practice mode: ${practiceMode}. In Coding lab mode, make at least two thirds of the questions hands-on coding, debugging, refactoring, or implementation tasks and include concise starter code and test cases. Otherwise, make roughly one quarter practical problem-solving scenarios.
- Order questions from high-probability opening questions to deeper technical and follow-up questions. Avoid duplicates and superficial rewordings.
- Expected points must be short concepts that can be checked in a spoken answer.
- Keep each suggested answer to 2-4 concise sentences. Suggested answers are structure guides. Use cautious first-person placeholders such as "I would explain..." wherever facts are not explicit.
- Identify 3-6 focused topics the candidate should revise for the target role.

Return ONLY valid JSON in this exact shape:
{"profile":{"candidate_name":"...","headline":"...","summary":"...","strengths":["..."],"focus_topics":["..."],"job_match":["..."],"missing_skills":["..."],"resume_risks":["..."]},"questions":[{"category":"...","difficulty":"${difficulty}","kind":"interview","question":"...","resume_reference":"...","skills_tested":["..."],"expected_points":["..."],"suggested_answer":"...","follow_up":"...","starter_code":"","test_cases":["..."],"solution_outline":"..."}]}

Resume text follows:
${resumeText}`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (resume instanceof File) {
    if (resume.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Please upload a resume smaller than 4MB." }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES.has(resume.type) && !/\.(pdf|docx|txt)$/i.test(resume.name)) {
      return NextResponse.json({ error: "Please upload a PDF, DOCX, or TXT resume." }, { status: 415 });
    }
    const data = Buffer.from(await resume.arrayBuffer()).toString("base64");
    parts.push({ inlineData: { mimeType: resume.type || "application/pdf", data } });
  }

  const generated = await generateWithProviders(geminiKey, openRouterKey, parts, questionCount >= 40 ? 24576 : 16384);
  if (!generated.ok) {
    const message = generated.status === 429
      ? "The free AI providers are busy right now. Please wait a moment and try again."
      : "The AI providers could not create the session right now. Please try again.";
    return NextResponse.json({ error: message, retryAfter: generated.retryAfter }, { status: 502 });
  }

  try {
    const payload = parseJson<{
      profile?: { candidate_name?: string; headline?: string; summary?: string; strengths?: string[]; focus_topics?: string[]; job_match?: string[]; missing_skills?: string[]; resume_risks?: string[] };
      questions?: GeneratedQuestion[];
    }>(generated.text);
    const items = payload.questions?.slice(0, questionCount) || [];
    if (items.length < Math.min(15, questionCount)) throw new Error("Not enough questions");

    const questions = items.map((item, index) => ({
      id: index + 1,
      category: item.category || "Resume discussion",
      level: item.difficulty === "Beginner" || item.difficulty === "Advanced" ? item.difficulty : "Intermediate",
      prompt: item.question || "Tell me about a relevant experience from your resume.",
      reference: item.resume_reference || "Uploaded resume",
      tested: cleanStringArray(item.skills_tested, 4).length ? cleanStringArray(item.skills_tested, 4) : ["communication"],
      expected: cleanStringArray(item.expected_points, 8).length ? cleanStringArray(item.expected_points, 8) : ["example", "contribution"],
      suggested: item.suggested_answer || "Use a clear context, contribution, action, and result structure.",
      followUp: item.follow_up || "What was your exact contribution?",
      kind: item.kind === "coding" ? "coding" : "interview",
      starterCode: item.starter_code || "",
      testCases: cleanStringArray(item.test_cases, 6),
      solutionOutline: item.solution_outline || item.suggested_answer || "Explain the approach, edge cases, complexity, and testing strategy.",
    }));

    return NextResponse.json({
      questions,
      context: { company, interviewStage, interviewDate },
      profile: {
        candidateName: payload.profile?.candidate_name || "Candidate",
        headline: payload.profile?.headline || role,
        summary: payload.profile?.summary || `Interview preparation for ${role}.`,
        strengths: cleanStringArray(payload.profile?.strengths, 6),
        focusTopics: cleanStringArray(payload.profile?.focus_topics, 6),
        jobMatch: cleanStringArray(payload.profile?.job_match, 6),
        missingSkills: cleanStringArray(payload.profile?.missing_skills, 6),
        resumeRisks: cleanStringArray(payload.profile?.resume_risks, 6),
      },
    });
  } catch {
    return NextResponse.json({ error: "The AI provider returned an unexpected session. Please try again." }, { status: 502 });
  }
}

async function evaluateAnswer(form: FormData, geminiKey: string | undefined, openRouterKey: string | undefined) {
  const role = String(form.get("role") || "the target role").slice(0, 120);
  const question = String(form.get("question") || "").slice(0, 2000);
  const answer = String(form.get("answer") || "").slice(0, 12000);
  const reference = String(form.get("reference") || "Uploaded resume").slice(0, 1000);
  const expected = String(form.get("expected") || "").slice(0, 3000);
  const suggested = String(form.get("suggested") || "").slice(0, 5000);
  const kind = String(form.get("kind") || "interview").slice(0, 20);

  if (answer.trim().length < (kind === "coding" ? 12 : 35) || !question.trim()) {
    return NextResponse.json({ error: "Please give a complete answer before requesting feedback." }, { status: 400 });
  }

  const prompt = `Act as a fair, specific interviewer and coach for a ${role} candidate. Evaluate the candidate's ${kind === "coding" ? "code solution and technical reasoning" : "answer"} to the interview question. Do not reward buzzwords alone and do not assume facts that are not in the supplied resume reference. Treat the suggested answer only as a structure guide.

Question: ${question}
Resume reference: ${reference}
Expected ideas: ${expected}
Structure guide: ${suggested}
Candidate answer: ${answer}

Score these exact dimensions within their maximums: relevance 20, technical 25, consistency 15, structure 15, communication 15, examples 10. The total must equal their sum. Give concise, actionable feedback, a better answer that preserves only facts present in the candidate's answer/reference, one realistic follow-up question, and 2-4 related topics to revise.

Return ONLY valid JSON:
{"scores":{"relevance":0,"technical":0,"consistency":0,"structure":0,"communication":0,"examples":0},"summary":"...","worked":["..."],"improve":["..."],"better_answer":"...","follow_up":"...","related_topics":["..."]}`;

  const generated = await generateWithProviders(geminiKey, openRouterKey, [{ text: prompt }], 3072);
  if (!generated.ok) {
    return NextResponse.json({ error: "The AI providers could not review this answer right now. Please try again." }, { status: 502 });
  }

  try {
    const payload = parseJson<{
      scores?: Partial<Record<DimensionKey, number>>;
      summary?: string;
      worked?: string[];
      improve?: string[];
      better_answer?: string;
      follow_up?: string;
      related_topics?: string[];
    }>(generated.text);

    const scores = Object.fromEntries(
      (Object.keys(dimensionLimits) as DimensionKey[]).map((key) => [
        key,
        Math.max(0, Math.min(dimensionLimits[key], Math.round(Number(payload.scores?.[key]) || 0))),
      ]),
    ) as Record<DimensionKey, number>;

    return NextResponse.json({
      scores,
      total: Object.values(scores).reduce((sum, score) => sum + score, 0),
      summary: payload.summary || "You addressed the question. Add more specific evidence to make the answer stronger.",
      worked: cleanStringArray(payload.worked, 4),
      improve: cleanStringArray(payload.improve, 4),
      betterAnswer: payload.better_answer || suggested,
      followUp: payload.follow_up || "What was your personal contribution?",
      relatedTopics: cleanStringArray(payload.related_topics, 4),
    });
  } catch {
    return NextResponse.json({ error: "The AI provider returned unexpected feedback. Please try again." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!geminiKey && !openRouterKey) return NextResponse.json({ error: "AI coaching is not configured yet." }, { status: 503 });

  try {
    const form = await request.formData();
    const action = String(form.get("action") || "session");
    return action === "evaluate"
      ? evaluateAnswer(form, geminiKey, openRouterKey)
      : createSession(form, geminiKey, openRouterKey);
  } catch {
    return NextResponse.json({ error: "The request could not be processed. Please try again." }, { status: 400 });
  }
}
