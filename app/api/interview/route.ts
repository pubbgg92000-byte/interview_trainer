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
  sample_call?: string;
  function_declaration?: string;
  expected_output?: string;
  reference_solution?: string;
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

function inferFallbackRole(requestedRole: string, resumeText: string) {
  if (requestedRole) return requestedRole;
  if (/\b(data|sql|python|analytics|machine learning)\b/i.test(resumeText)) return "Data Engineer";
  if (/\b(java|spring|node\.js|backend|microservice|database)\b/i.test(resumeText)) return "Software Engineer";
  return "Frontend Developer";
}

function codingFallback(questionCount: number, requestedRole: string, resumeText: string, difficulty: string, context: { company: string; interviewStage: string; interviewDate: string }) {
  const role = inferFallbackRole(requestedRole, resumeText);
  const topics = [
    { name: "Double valid numbers", skill: "arrays", declaration: "function doubleNumbers(values)", prompt: "Return a new array where every finite number is doubled. Ignore non-number values and do not mutate the input.", starter: "function doubleNumbers(values) {\n  // Return the transformed array\n}\n", solution: "function doubleNumbers(values) {\n  if (!Array.isArray(values)) return [];\n  return values.filter(Number.isFinite).map((value) => value * 2);\n}", example: "(() => { const result = doubleNumbers([1, 'x', 3]); console.log('result:', result); return result; })()", output: "Console: result: [2, 6]\nResult: [2, 6]", expected: ["Array.isArray", "Number.isFinite", "filter", "map", "immutability"], tests: ["doubleNumbers([1, 'x', 3]) → [2, 6]", "doubleNumbers([]) → []", "doubleNumbers(null) → []"] },
    { name: "Immutable item update", skill: "React state", declaration: "function updateItem(items, id, changes)", prompt: "Update the item matching id without mutating the array or unchanged objects. Return the original array when no id matches.", starter: "function updateItem(items, id, changes) {\n  // Return an immutable update\n}\n", solution: "function updateItem(items, id, changes) {\n  if (!Array.isArray(items)) return [];\n  let found = false;\n  const next = items.map((item) => {\n    if (item.id !== id) return item;\n    found = true;\n    return { ...item, ...changes };\n  });\n  return found ? next : items;\n}", example: "(() => { const result = updateItem([{ id: 1, name: 'Old' }], 1, { name: 'New' }); console.log('updated:', result); return result; })()", output: "Console: updated: [{ id: 1, name: 'New' }]\nResult: [{ id: 1, name: 'New' }]", expected: ["map", "object spread", "immutability", "stable identity", "missing id"], tests: ["matching id updates one object", "missing id returns original array", "input objects are not mutated"] },
    { name: "Case-insensitive search", skill: "strings and arrays", declaration: "function filterSkills(skills, query)", prompt: "Return skills containing query, ignoring case and surrounding spaces. An empty query returns a shallow copy of all skills.", starter: "function filterSkills(skills, query) {\n  // Normalize and filter\n}\n", solution: "function filterSkills(skills, query) {\n  if (!Array.isArray(skills)) return [];\n  const normalized = String(query ?? '').trim().toLowerCase();\n  if (!normalized) return [...skills];\n  return skills.filter((skill) => String(skill).toLowerCase().includes(normalized));\n}", example: "(() => { const result = filterSkills(['React', 'JavaScript', 'CSS'], ' script '); console.log('matches:', result); return result; })()", output: "Console: matches: ['JavaScript']\nResult: ['JavaScript']", expected: ["trim", "toLowerCase", "includes", "filter", "empty query"], tests: ["' script ' → ['JavaScript']", "empty query returns all values", "non-array input returns []"] },
    { name: "Form validation", skill: "frontend forms", declaration: "function validateUser(values)", prompt: "Validate required name and email fields. Return an errors object; email must have text before and after @ and a dot in the domain.", starter: "function validateUser(values) {\n  const errors = {};\n  // Add name and email errors\n  return errors;\n}\n", solution: "function validateUser(values = {}) {\n  const errors = {};\n  if (!String(values.name ?? '').trim()) errors.name = 'Name is required';\n  const email = String(values.email ?? '').trim();\n  if (!email) errors.email = 'Email is required';\n  else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) errors.email = 'Enter a valid email';\n  return errors;\n}", example: "(() => { const result = validateUser({ name: '', email: 'bad@' }); console.log('errors:', result); return result; })()", output: "Console: errors: { name: 'Name is required', email: 'Enter a valid email' }", expected: ["required fields", "trim", "email validation", "errors object", "pure function"], tests: ["missing name creates name error", "invalid email creates email error", "valid values return {}"] },
    { name: "Flatten a tree", skill: "recursion", declaration: "function flattenTree(nodes)", prompt: "Flatten a pre-order tree into an array of ids. Every node can have an optional children array; malformed input returns an empty array.", starter: "function flattenTree(nodes) {\n  // Return ids in pre-order\n}\n", solution: "function flattenTree(nodes) {\n  if (!Array.isArray(nodes)) return [];\n  const result = [];\n  function visit(items) {\n    for (const node of items) {\n      result.push(node.id);\n      if (Array.isArray(node.children)) visit(node.children);\n    }\n  }\n  visit(nodes);\n  return result;\n}", example: "(() => { const result = flattenTree([{ id: 1, children: [{ id: 2 }] }, { id: 3 }]); console.log('ids:', result); return result; })()", output: "Console: ids: [1, 2, 3]\nResult: [1, 2, 3]", expected: ["recursion", "base case", "pre-order", "children", "complexity"], tests: ["nested tree → parent before children", "empty array → []", "missing children is allowed"] },
    { name: "Group records", skill: "reduce", declaration: "function groupBy(items, key)", prompt: "Group an array of objects by the value at key. Skip null items and place missing values under an 'undefined' group.", starter: "function groupBy(items, key) {\n  // Return an object of grouped arrays\n}\n", solution: "function groupBy(items, key) {\n  if (!Array.isArray(items)) return {};\n  return items.reduce((groups, item) => {\n    if (!item || typeof item !== 'object') return groups;\n    const group = String(item[key]);\n    (groups[group] ??= []).push(item);\n    return groups;\n  }, {});\n}", example: "(() => { const result = groupBy([{ team: 'A', id: 1 }, { team: 'A', id: 2 }], 'team'); console.log('groups:', result); return result; })()", output: "Console: groups: { A: [{...}, {...}] }", expected: ["reduce", "dynamic key", "null handling", "accumulator", "complexity"], tests: ["same values share a group", "missing key uses 'undefined'", "non-array input returns {}"] },
    { name: "Remove duplicate objects", skill: "sets", declaration: "function uniqueBy(items, key)", prompt: "Remove duplicate objects by key while preserving the first occurrence and original order.", starter: "function uniqueBy(items, key) {\n  // Keep the first item for each key value\n}\n", solution: "function uniqueBy(items, key) {\n  if (!Array.isArray(items)) return [];\n  const seen = new Set();\n  return items.filter((item) => {\n    const value = item?.[key];\n    if (seen.has(value)) return false;\n    seen.add(value);\n    return true;\n  });\n}", example: "(() => { const result = uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], 'id'); console.log('unique:', result); return result; })()", output: "Console: unique: [{ id: 1 }, { id: 2 }]", expected: ["Set", "filter", "order", "first occurrence", "complexity"], tests: ["duplicate ids keep first object", "order is preserved", "empty input returns []"] },
    { name: "Chunk an array", skill: "algorithms", declaration: "function chunkArray(items, size)", prompt: "Split an array into arrays of at most size elements. Throw a RangeError when size is not a positive integer.", starter: "function chunkArray(items, size) {\n  // Return chunks without mutating items\n}\n", solution: "function chunkArray(items, size) {\n  if (!Array.isArray(items)) return [];\n  if (!Number.isInteger(size) || size <= 0) throw new RangeError('size must be a positive integer');\n  const chunks = [];\n  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));\n  return chunks;\n}", example: "(() => { const result = chunkArray([1, 2, 3, 4, 5], 2); console.log('chunks:', result); return result; })()", output: "Console: chunks: [[1, 2], [3, 4], [5]]", expected: ["validation", "for loop", "slice", "immutability", "O(n)"], tests: ["5 values with size 2 → 3 chunks", "empty array → []", "size 0 throws RangeError"] },
    { name: "Stable product sorting", skill: "sorting", declaration: "function sortProducts(products)", prompt: "Return a new array sorted by price ascending, then name alphabetically when prices match. Do not mutate the input.", starter: "function sortProducts(products) {\n  // Sort a copied array\n}\n", solution: "function sortProducts(products) {\n  if (!Array.isArray(products)) return [];\n  return [...products].sort((a, b) => {\n    const priceDifference = Number(a.price) - Number(b.price);\n    return priceDifference || String(a.name).localeCompare(String(b.name));\n  });\n}", example: "(() => { const result = sortProducts([{ name: 'B', price: 10 }, { name: 'A', price: 10 }, { name: 'C', price: 5 }]); console.log('sorted:', result); return result; })()", output: "Console: sorted: C, A, B by price/name", expected: ["array copy", "sort comparator", "numeric sort", "tie breaker", "immutability"], tests: ["lower price comes first", "equal price sorts by name", "original array stays unchanged"] },
    { name: "Build query parameters", skill: "web APIs", declaration: "function buildQueryString(params)", prompt: "Create a URL query string from an object. Omit null, undefined, and empty-string values while preserving 0 and false.", starter: "function buildQueryString(params) {\n  // Return a string beginning with ? or an empty string\n}\n", solution: "function buildQueryString(params) {\n  const search = new URLSearchParams();\n  for (const [key, value] of Object.entries(params ?? {})) {\n    if (value === null || value === undefined || value === '') continue;\n    search.set(key, String(value));\n  }\n  const text = search.toString();\n  return text ? `?${text}` : '';\n}", example: "(() => { const result = buildQueryString({ q: 'react hooks', page: 0, draft: false, empty: '' }); console.log('query:', result); return result; })()", output: "Console: query: ?q=react+hooks&page=0&draft=false", expected: ["URLSearchParams", "Object.entries", "null checks", "encoding", "0 and false"], tests: ["spaces are encoded", "0 and false are retained", "empty values are omitted"] },
    { name: "Normalize API users", skill: "data mapping", declaration: "function normalizeUsers(payload)", prompt: "Convert payload.data into {id, displayName} objects. Use 'Unknown user' when both name and username are missing; malformed payload returns [].",
      starter: "function normalizeUsers(payload) {\n  // Normalize payload.data\n}\n", solution: "function normalizeUsers(payload) {\n  if (!Array.isArray(payload?.data)) return [];\n  return payload.data.map((user) => ({\n    id: user.id,\n    displayName: String(user.name || user.username || 'Unknown user').trim(),\n  }));\n}", example: "(() => { const result = normalizeUsers({ data: [{ id: 1, username: 'arvind' }] }); console.log('users:', result); return result; })()", output: "Console: users: [{ id: 1, displayName: 'arvind' }]", expected: ["optional chaining", "Array.isArray", "map", "fallback values", "stable shape"], tests: ["name has priority", "username is fallback", "missing data returns []"] },
    { name: "Safe nested property", skill: "object traversal", declaration: "function getPath(object, path, fallback)", prompt: "Read a dot-separated path safely. Return fallback only when traversal fails or the final value is undefined; preserve null, false, and 0.", starter: "function getPath(object, path, fallback) {\n  // Traverse each path segment\n}\n", solution: "function getPath(object, path, fallback) {\n  if (!path) return object === undefined ? fallback : object;\n  let current = object;\n  for (const key of String(path).split('.')) {\n    if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), key)) return fallback;\n    current = current[key];\n  }\n  return current === undefined ? fallback : current;\n}", example: "(() => { const result = getPath({ user: { stats: { score: 0 } } }, 'user.stats.score', 99); console.log('value:', result); return result; })()", output: "Console: value: 0\nResult: 0", expected: ["path split", "iteration", "own property", "null safety", "preserve falsy values"], tests: ["existing path returns value", "missing path returns fallback", "0 and false are preserved"] },
    { name: "Conditional class names", skill: "frontend utilities", declaration: "function classNames(...values)", prompt: "Join class names from strings, nested arrays, and objects whose values are truthy. Ignore false, null, undefined, and empty strings.", starter: "function classNames(...values) {\n  // Flatten supported values into one string\n}\n", solution: "function classNames(...values) {\n  const names = [];\n  function add(value) {\n    if (!value) return;\n    if (typeof value === 'string') names.push(value);\n    else if (Array.isArray(value)) value.forEach(add);\n    else if (typeof value === 'object') Object.entries(value).forEach(([name, enabled]) => { if (enabled) names.push(name); });\n  }\n  values.forEach(add);\n  return names.join(' ');\n}", example: "(() => { const result = classNames('button', ['large'], { active: true, disabled: false }); console.log('classes:', result); return result; })()", output: "Console: classes: button large active", expected: ["rest parameters", "recursion", "arrays", "object entries", "truthy values"], tests: ["strings are joined", "nested arrays are flattened", "false object flags are omitted"] },
    { name: "Memoize a function", skill: "performance", declaration: "function memoize(fn)", prompt: "Return a function that caches results by primitive argument list. Repeated calls with the same arguments must not call fn again.", starter: "function memoize(fn) {\n  // Return a cached wrapper\n}\n", solution: "function memoize(fn) {\n  const cache = new Map();\n  return function (...args) {\n    const key = JSON.stringify(args);\n    if (cache.has(key)) return cache.get(key);\n    const result = fn.apply(this, args);\n    cache.set(key, result);\n    return result;\n  };\n}", example: "(() => { let calls = 0; const doubled = memoize((value) => { calls++; return value * 2; }); const result = [doubled(4), doubled(4), calls]; console.log('values/calls:', result); return result; })()", output: "Console: values/calls: [8, 8, 1]", expected: ["closure", "Map", "cache.has", "rest parameters", "this binding"], tests: ["same arguments call fn once", "different arguments are separate", "falsy results are cached"] },
    { name: "Event emitter", skill: "JavaScript design", declaration: "function createEmitter()", prompt: "Create an emitter with on(event, listener), off(event, listener), and emit(event, ...args). on returns an unsubscribe function.", starter: "function createEmitter() {\n  // Return on, off, and emit methods\n}\n", solution: "function createEmitter() {\n  const listeners = new Map();\n  function on(event, listener) {\n    const group = listeners.get(event) ?? new Set();\n    group.add(listener);\n    listeners.set(event, group);\n    return () => off(event, listener);\n  }\n  function off(event, listener) { listeners.get(event)?.delete(listener); }\n  function emit(event, ...args) { [...(listeners.get(event) ?? [])].forEach((listener) => listener(...args)); }\n  return { on, off, emit };\n}", example: "(() => { const emitter = createEmitter(); const values = []; const stop = emitter.on('data', (value) => values.push(value)); emitter.emit('data', 1); stop(); emitter.emit('data', 2); console.log('received:', values); return values; })()", output: "Console: received: [1]\nResult: [1]", expected: ["Map", "Set", "unsubscribe", "rest parameters", "safe iteration"], tests: ["emit calls listeners", "unsubscribe stops calls", "events are isolated"] },
    { name: "TTL cache", skill: "frontend architecture", declaration: "function createCache(ttlMs, now = Date.now)", prompt: "Create get, set, and delete methods. get returns undefined for missing or expired entries and removes expired entries.", starter: "function createCache(ttlMs, now = Date.now) {\n  // Return get, set, and delete methods\n}\n", solution: "function createCache(ttlMs, now = Date.now) {\n  const entries = new Map();\n  return {\n    set(key, value) { entries.set(key, { value, expiresAt: now() + ttlMs }); },\n    get(key) {\n      const entry = entries.get(key);\n      if (!entry) return undefined;\n      if (now() >= entry.expiresAt) { entries.delete(key); return undefined; }\n      return entry.value;\n    },\n    delete(key) { return entries.delete(key); },\n  };\n}", example: "(() => { let time = 0; const cache = createCache(10, () => time); cache.set('user', 'Arvind'); const before = cache.get('user'); time = 11; const after = cache.get('user'); console.log('before/after:', before, after); return [before, after]; })()", output: "Console: before/after: Arvind undefined\nResult: ['Arvind', undefined]", expected: ["Map", "expiration", "dependency injection", "delete", "boundary condition"], tests: ["hit before expiry", "miss at expiry", "delete removes an entry"] },
    { name: "Retry an async operation", skill: "async JavaScript", declaration: "async function withRetry(operation, attempts)", prompt: "Run an async operation up to attempts times. Return the first success, throw the last error, and reject attempts below 1.", starter: "async function withRetry(operation, attempts) {\n  // Retry and return the first success\n}\n", solution: "async function withRetry(operation, attempts) {\n  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('attempts must be at least 1');\n  let lastError;\n  for (let attempt = 1; attempt <= attempts; attempt++) {\n    try { return await operation(attempt); }\n    catch (error) { lastError = error; }\n  }\n  throw lastError;\n}", example: "(async () => { let calls = 0; const result = await withRetry(async () => { calls++; if (calls < 3) throw new Error('temporary'); return 'ok'; }, 3); console.log('result/calls:', result, calls); return { result, calls }; })()", output: "Console: result/calls: ok 3\nResult: { result: 'ok', calls: 3 }", expected: ["async/await", "loop", "last error", "attempt limit", "validation"], tests: ["first success returns immediately", "later success returns", "all failures throw last error"] },
    { name: "Truncate display text", skill: "strings", declaration: "function truncateText(text, maxLength)", prompt: "Trim text and truncate it to maxLength characters. When truncated, reserve one character for an ellipsis; reject maxLength below 1.", starter: "function truncateText(text, maxLength) {\n  // Return the display-safe text\n}\n", solution: "function truncateText(text, maxLength) {\n  if (!Number.isInteger(maxLength) || maxLength < 1) throw new RangeError('maxLength must be positive');\n  const value = String(text ?? '').trim();\n  if (value.length <= maxLength) return value;\n  if (maxLength === 1) return '…';\n  return `${value.slice(0, maxLength - 1).trimEnd()}…`;\n}", example: "(() => { const result = truncateText('  Frontend Developer  ', 10); console.log('text:', result); return result; })()", output: "Console: text: Frontend…\nResult: Frontend…", expected: ["validation", "trim", "slice", "ellipsis", "boundary case"], tests: ["short text unchanged", "long text includes ellipsis", "maxLength 1 returns ellipsis"] },
    { name: "Merge records by id", skill: "data structures", declaration: "function mergeById(current, updates)", prompt: "Merge update objects into current records by id, keep current order, and append new ids in update order. Do not mutate either input.", starter: "function mergeById(current, updates) {\n  // Merge and return new objects\n}\n", solution: "function mergeById(current, updates) {\n  const updateMap = new Map((updates ?? []).map((item) => [item.id, item]));\n  const currentIds = new Set((current ?? []).map((item) => item.id));\n  const merged = (current ?? []).map((item) => ({ ...item, ...(updateMap.get(item.id) ?? {}) }));\n  for (const item of updates ?? []) if (!currentIds.has(item.id)) merged.push({ ...item });\n  return merged;\n}", example: "(() => { const result = mergeById([{ id: 1, name: 'A' }], [{ id: 1, name: 'B' }, { id: 2, name: 'C' }]); console.log('merged:', result); return result; })()", output: "Console: merged: [{ id: 1, name: 'B' }, { id: 2, name: 'C' }]", expected: ["Map", "Set", "object spread", "order", "immutability"], tests: ["existing id is merged", "new id is appended", "inputs stay unchanged"] },
    { name: "Word frequency", skill: "strings and maps", declaration: "function countWords(text)", prompt: "Return an object containing lowercase word frequencies. Words are letters or digits; punctuation and repeated whitespace are ignored.", starter: "function countWords(text) {\n  // Return word counts\n}\n", solution: "function countWords(text) {\n  const words = String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];\n  return words.reduce((counts, word) => {\n    counts[word] = (counts[word] ?? 0) + 1;\n    return counts;\n  }, {});\n}", example: "(() => { const result = countWords('React, react and JavaScript!'); console.log('counts:', result); return result; })()", output: "Console: counts: { react: 2, and: 1, javascript: 1 }", expected: ["normalization", "regular expression", "reduce", "frequency", "empty input"], tests: ["case is ignored", "punctuation is ignored", "empty input returns {}"] },
    { name: "Paginate results", skill: "array slicing", declaration: "function paginate(items, page, pageSize)", prompt: "Return {items, page, pageSize, totalPages}. Pages are 1-based; clamp page into range and reject non-positive pageSize.", starter: "function paginate(items, page, pageSize) {\n  // Return pagination metadata and items\n}\n", solution: "function paginate(items, page, pageSize) {\n  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be positive');\n  const values = Array.isArray(items) ? items : [];\n  const totalPages = Math.max(1, Math.ceil(values.length / pageSize));\n  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);\n  const start = (safePage - 1) * pageSize;\n  return { items: values.slice(start, start + pageSize), page: safePage, pageSize, totalPages };\n}", example: "(() => { const result = paginate(['a', 'b', 'c', 'd', 'e'], 2, 2); console.log('page:', result); return result; })()", output: "Console: page: { items: ['c', 'd'], page: 2, pageSize: 2, totalPages: 3 }", expected: ["validation", "clamping", "Math.ceil", "slice", "metadata"], tests: ["page 2 returns correct slice", "high page is clamped", "invalid pageSize throws"] },
  ];
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const topic = topics[index % topics.length];
    const round = Math.floor(index / topics.length);
    const variant = round === 0 ? "Implement" : round === 1 ? "Implement and optimize" : "Implement, test, and explain";
    return {
      id: index + 1,
      category: `Coding · ${topic.skill}`,
      level: difficulty === "Beginner" || difficulty === "Advanced" ? difficulty : "Intermediate",
      prompt: `${variant} ${topic.declaration}. ${topic.prompt}`,
      reference: `${role} coding fundamentals`,
      tested: [topic.skill, "problem solving", "testing", "communication"],
      expected: topic.expected,
      suggested: `Declare ${topic.declaration}, validate the contract, then test the supplied examples. Explain the edge cases and time/space complexity.`,
      followUp: `How would you adapt this ${topic.name.toLowerCase()} solution for production scale?`,
      kind: "coding" as const,
      starterCode: topic.starter,
      testCases: topic.tests,
      solutionOutline: `Define the contract, handle ${topic.tests.join(", ")}, keep the implementation readable, and discuss complexity.`,
      testExpression: topic.example,
      functionDeclaration: topic.declaration,
      expectedOutput: topic.output,
      referenceSolution: topic.solution,
    };
  });
  return NextResponse.json({
    questions,
    context,
    fallback: true,
    profile: {
      candidateName: "Candidate",
      headline: role,
      summary: `A resilient local coding practice session for ${role}. AI personalization can resume automatically when the free providers are available.`,
      strengths: ["Hands-on problem solving", "Technical communication", "Testing mindset"],
      focusTopics: ["JavaScript fundamentals", "Error handling", "Testing", "Performance"],
      jobMatch: [role, "Coding fundamentals"],
      missingSkills: ["Add the job description to identify role-specific gaps"],
      resumeRisks: ["Connect each solution to a real project example from your resume"],
    },
  });
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
- Practice mode: ${practiceMode}. In Coding lab mode, make every question a concrete hands-on JavaScript task with an unambiguous input/output contract, function declaration, starter code, runnable sample call, expected console/result output, at least two input-to-output test cases, and a complete executable reference solution. Otherwise, make roughly one quarter practical problem-solving scenarios.
- Order questions from high-probability opening questions to deeper technical and follow-up questions. Avoid duplicates and superficial rewordings.
- Expected points must be short concepts that can be checked in a spoken answer.
- Keep each suggested answer to 2-4 concise sentences. Suggested answers are structure guides. Use cautious first-person placeholders such as "I would explain..." wherever facts are not explicit.
- Identify 3-6 focused topics the candidate should revise for the target role.

Return ONLY valid JSON in this exact shape:
{"profile":{"candidate_name":"...","headline":"...","summary":"...","strengths":["..."],"focus_topics":["..."],"job_match":["..."],"missing_skills":["..."],"resume_risks":["..."]},"questions":[{"category":"...","difficulty":"${difficulty}","kind":"interview","question":"...","resume_reference":"...","skills_tested":["..."],"expected_points":["..."],"suggested_answer":"...","follow_up":"...","starter_code":"","test_cases":["input → expected output"],"solution_outline":"...","sample_call":"runnable expression that logs and returns the result","function_declaration":"function name(args)","expected_output":"Console: ... Result: ...","reference_solution":"complete runnable JavaScript"}]}

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
    if (practiceMode === "Coding lab") return codingFallback(questionCount, requestedRole, resumeText, difficulty, { company, interviewStage, interviewDate });
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
      starterCode: item.starter_code || (item.kind === "coding" ? "// Write your solution here\n" : ""),
      testCases: cleanStringArray(item.test_cases, 6),
      solutionOutline: item.solution_outline || item.suggested_answer || "Explain the approach, edge cases, complexity, and testing strategy.",
      testExpression: item.sample_call || "",
      functionDeclaration: item.function_declaration || "",
      expectedOutput: item.expected_output || "",
      referenceSolution: item.reference_solution || "",
    }));

    const codingQuestions = questions.filter((item) => item.kind === "coding");
    const incompleteCoding = codingQuestions.some((item) => !item.functionDeclaration || !item.testExpression || !item.expectedOutput || !item.referenceSolution || item.testCases.length < 2);
    if (practiceMode === "Coding lab" && (codingQuestions.length !== questionCount || incompleteCoding)) {
      return codingFallback(questionCount, requestedRole, resumeText, difficulty, { company, interviewStage, interviewDate });
    }

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
    if (practiceMode === "Coding lab") return codingFallback(questionCount, requestedRole, resumeText, difficulty, { company, interviewStage, interviewDate });
    return NextResponse.json({ error: "The AI provider returned an unexpected session. Please try again." }, { status: 502 });
  }
}

async function evaluateAnswer(form: FormData, geminiKey: string | undefined, openRouterKey: string | undefined) {
  const role = String(form.get("role") || "the target role").slice(0, 120);
  const question = String(form.get("question") || "").slice(0, 2000);
  const answer = String(form.get("answer") || "").slice(0, 12000);
  const starterCode = String(form.get("starterCode") || "").slice(0, 5000);
  const reference = String(form.get("reference") || "Uploaded resume").slice(0, 1000);
  const expected = String(form.get("expected") || "").slice(0, 3000);
  const suggested = String(form.get("suggested") || "").slice(0, 5000);
  const kind = String(form.get("kind") || "interview").slice(0, 20);

  const unchangedStarter = kind === "coding" && Boolean(starterCode.trim()) && answer.trim() === starterCode.trim();
  if (answer.trim().length < (kind === "coding" ? 12 : 35) || unchangedStarter || !question.trim()) {
    return NextResponse.json({ error: "Please give a complete answer before requesting feedback." }, { status: 400 });
  }

  const prompt = `Act as a fair, specific interviewer and coach for a ${role} candidate. Evaluate the candidate's ${kind === "coding" ? "code solution and technical reasoning" : "answer"} to the interview question. Do not reward buzzwords alone and do not assume facts that are not in the supplied resume reference. Treat the suggested answer only as a structure guide.${kind === "coding" ? " Do not award points for starter code, declarations, placeholder comments, sample calls, or other prefilled text that remains unchanged. Score only implementation the candidate added or changed, while using the full code to judge correctness." : ""}

Question: ${question}
Resume reference: ${reference}
Expected ideas: ${expected}
Structure guide: ${suggested}
Candidate answer: ${answer}
${kind === "coding" ? `Prefilled starter code that must not earn points: ${starterCode}` : ""}

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
