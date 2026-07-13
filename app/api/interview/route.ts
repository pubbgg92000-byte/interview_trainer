import { NextResponse } from "next/server";

const MODEL = "gemini-2.5-flash-lite";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

function parseJson(value: string) {
  const cleaned = value.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned) as { questions?: GeneratedQuestion[] };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI generation is not configured yet." }, { status: 503 });

  const form = await request.formData();
  const role = String(form.get("role") || "Frontend Developer").slice(0, 120);
  const interviewType = String(form.get("interviewType") || "Mixed interview").slice(0, 120);
  const difficulty = String(form.get("difficulty") || "Intermediate").slice(0, 30);
  const resumeText = String(form.get("resumeText") || "").slice(0, 30000);
  const resume = form.get("resume");
  const parts: Array<Record<string, unknown>> = [{ text: `You are an interview coach. Create 6 realistic ${difficulty.toLowerCase()} ${interviewType.toLowerCase()} questions for a candidate applying as a ${role}. Use only claims supported by the resume. Include introduction, technical/project, and behavioural questions when relevant. Do not invent employers, metrics, certifications, or technologies. Return ONLY valid JSON in this exact format: {"questions":[{"category":"...","difficulty":"${difficulty}","question":"...","resume_reference":"...","skills_tested":["..."],"expected_points":["..."],"suggested_answer":"...","follow_up":"..."}]}. Each suggested answer must be concise and clearly marked by first-person language as a structure guide, not a factual claim. Resume text follows:\n${resumeText}` }];

  if (resume instanceof File) {
    if (resume.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Please upload a resume smaller than 10MB." }, { status: 413 });
    const data = Buffer.from(await resume.arrayBuffer()).toString("base64");
    parts.push({ inlineData: { mimeType: resume.type || "application/pdf", data } });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.35, maxOutputTokens: 4096 } }),
    });
    if (!response.ok) return NextResponse.json({ error: "Gemini could not generate questions right now. Please try again." }, { status: 502 });
    const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const generated = parseJson(text).questions?.slice(0, 6) || [];
    if (generated.length < 3) throw new Error("Not enough questions");
    const questions = generated.map((item, index) => ({
      id: index + 1,
      category: item.category || "Resume discussion",
      level: item.difficulty === "Beginner" || item.difficulty === "Advanced" ? item.difficulty : "Intermediate",
      prompt: item.question || "Tell me about a relevant experience from your resume.",
      reference: item.resume_reference || "Uploaded resume",
      tested: Array.isArray(item.skills_tested) ? item.skills_tested.slice(0, 4) : ["communication"],
      expected: Array.isArray(item.expected_points) ? item.expected_points.slice(0, 8).map((point) => point.toLowerCase()) : ["example", "contribution"],
      suggested: item.suggested_answer || "Use a clear situation, your contribution, action, and result structure.",
      followUp: item.follow_up || "What was your exact contribution?",
    }));
    return NextResponse.json({ questions });
  } catch {
    return NextResponse.json({ error: "Gemini returned an unexpected response. Please try again." }, { status: 502 });
  }
}
