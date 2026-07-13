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

async function generateWithGemini(apiKey: string, parts: Array<Record<string, unknown>>, maxOutputTokens = 4096) {
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
      return { ok: true as const, text: outputText(await response.json()), model };
    }

    lastFailure = { status: response.status, retryAfter: response.headers.get("retry-after"), model };
    if (![404, 429, 503].includes(response.status)) break;
  }
  console.warn("Gemini request failed", lastFailure);
  return { ok: false as const, ...lastFailure };
}

function cleanStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit);
}

async function createSession(form: FormData, apiKey: string) {
  const role = String(form.get("role") || "Frontend Developer").slice(0, 120);
  const company = String(form.get("company") || "Not provided").slice(0, 160);
  const interviewStage = String(form.get("interviewStage") || "Not provided").slice(0, 120);
  const interviewDate = String(form.get("interviewDate") || "Not provided").slice(0, 40);
  const focusAreas = String(form.get("focusAreas") || "Not provided").slice(0, 1000);
  const jobDescription = String(form.get("jobDescription") || "Not provided").slice(0, 12000);
  const interviewType = String(form.get("interviewType") || "Mixed interview").slice(0, 120);
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
- Target role: ${role}
- Company: ${company}
- Interview stage: ${interviewStage}
- Interview date: ${interviewDate}
- Candidate's requested focus areas: ${focusAreas}
- Job description: ${jobDescription}

Rules:
- Use only claims supported by the resume. Never invent employers, dates, metrics, certifications, technologies, or achievements.
- Cover introduction, role-specific knowledge, project depth, and behavioural evidence when relevant.
- Build a comprehensive bank across resume walkthrough, career transition, JavaScript, the candidate's frontend framework, HTML/CSS/responsiveness, REST APIs, debugging, performance, testing, deployment, AI/automation claims, project deep dives, behavioural situations, and hiring-manager fit. Omit a category only when the resume and role make it irrelevant.
- Make roughly one quarter of the questions practical problem-solving scenarios. Ask the candidate to reason through code, debugging, UI state, architecture, or trade-offs without requiring an embedded code editor.
- Order questions from high-probability opening questions to deeper technical and follow-up questions. Avoid duplicates and superficial rewordings.
- Expected points must be short concepts that can be checked in a spoken answer.
- Keep each suggested answer to 2-4 concise sentences. Suggested answers are structure guides. Use cautious first-person placeholders such as "I would explain..." wherever facts are not explicit.
- Identify 3-6 focused topics the candidate should revise for the target role.

Return ONLY valid JSON in this exact shape:
{"profile":{"candidate_name":"...","headline":"...","summary":"...","strengths":["..."],"focus_topics":["..."]},"questions":[{"category":"...","difficulty":"${difficulty}","question":"...","resume_reference":"...","skills_tested":["..."],"expected_points":["..."],"suggested_answer":"...","follow_up":"..."}]}

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

  const generated = await generateWithGemini(apiKey, parts, questionCount >= 40 ? 24576 : 16384);
  if (!generated.ok) {
    const message = generated.status === 429
      ? "Gemini is busy right now. Please wait a moment and try again."
      : "Gemini could not create the session right now. Please try again.";
    return NextResponse.json({ error: message, retryAfter: generated.retryAfter }, { status: 502 });
  }

  try {
    const payload = parseJson<{
      profile?: { candidate_name?: string; headline?: string; summary?: string; strengths?: string[]; focus_topics?: string[] };
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
      },
    });
  } catch {
    return NextResponse.json({ error: "Gemini returned an unexpected session. Please try again." }, { status: 502 });
  }
}

async function evaluateAnswer(form: FormData, apiKey: string) {
  const role = String(form.get("role") || "the target role").slice(0, 120);
  const question = String(form.get("question") || "").slice(0, 2000);
  const answer = String(form.get("answer") || "").slice(0, 12000);
  const reference = String(form.get("reference") || "Uploaded resume").slice(0, 1000);
  const expected = String(form.get("expected") || "").slice(0, 3000);
  const suggested = String(form.get("suggested") || "").slice(0, 5000);

  if (answer.trim().length < 35 || !question.trim()) {
    return NextResponse.json({ error: "Please give a complete answer before requesting feedback." }, { status: 400 });
  }

  const prompt = `Act as a fair, specific interviewer and coach for a ${role} candidate. Evaluate the candidate's answer to the interview question. Do not reward buzzwords alone and do not assume facts that are not in the supplied resume reference. Treat the suggested answer only as a structure guide.

Question: ${question}
Resume reference: ${reference}
Expected ideas: ${expected}
Structure guide: ${suggested}
Candidate answer: ${answer}

Score these exact dimensions within their maximums: relevance 20, technical 25, consistency 15, structure 15, communication 15, examples 10. The total must equal their sum. Give concise, actionable feedback, a better answer that preserves only facts present in the candidate's answer/reference, one realistic follow-up question, and 2-4 related topics to revise.

Return ONLY valid JSON:
{"scores":{"relevance":0,"technical":0,"consistency":0,"structure":0,"communication":0,"examples":0},"summary":"...","worked":["..."],"improve":["..."],"better_answer":"...","follow_up":"...","related_topics":["..."]}`;

  const generated = await generateWithGemini(apiKey, [{ text: prompt }], 3072);
  if (!generated.ok) {
    return NextResponse.json({ error: "Gemini could not review this answer right now. Please try again." }, { status: 502 });
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
    return NextResponse.json({ error: "Gemini returned unexpected feedback. Please try again." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI coaching is not configured yet." }, { status: 503 });

  try {
    const form = await request.formData();
    const action = String(form.get("action") || "session");
    return action === "evaluate" ? evaluateAnswer(form, apiKey) : createSession(form, apiKey);
  } catch {
    return NextResponse.json({ error: "The request could not be processed. Please try again." }, { status: 400 });
  }
}
