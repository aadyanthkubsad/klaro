/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieveChunks } from './src/data/syllabusRetrieval.js';

const __filename = fileURLToPath(import.meta.url);
// Initialize path helpers
const __dirname = path.dirname(__filename);

/**
 * Safe one-line summary of the configured Gemini API key.
 * Never prints the actual key — just whether it exists and its length.
 */
function logApiKeyStatus() {
  const raw = process.env.GEMINI_API_KEY || '';
  const trimmed = raw.replace(/^["']|["']$/g, '').trim();
  const isPlaceholder = trimmed === '' || trimmed === 'your_api_key_here' || trimmed === 'undefined' || trimmed === 'null';
  console.log('--------------------------------------------------');
  console.log('[VARKify] Gemini API key check');
  console.log('  API key exists:', !isPlaceholder);
  console.log('  API key length:', trimmed.length);
  console.log('  Source:         process.env.GEMINI_API_KEY (.env via dotenv)');
  if (isPlaceholder) {
    console.log('  ⚠️  Add a real key to .env at the project root, then restart.');
  }
  console.log('--------------------------------------------------');
}

async function startServer() {
  logApiKeyStatus();

  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json({ limit: '10mb' }));

  // Safe debug endpoint — exposes existence + length only, never the key.
  app.get("/api/debug-key", (_req, res) => {
    const raw = process.env.GEMINI_API_KEY || '';
    const trimmed = raw.replace(/^["']|["']$/g, '').trim();
    const isPlaceholder = trimmed === '' || trimmed === 'your_api_key_here' || trimmed === 'undefined' || trimmed === 'null';
    res.json({
      exists: !isPlaceholder,
      length: trimmed.length,
      source: 'process.env.GEMINI_API_KEY',
    });
  });

  // In-memory store for session (resets on server restart)
  const sessionData = {
    stats: {
      streak: 0,
      xp: 0,
      level: 1,
      weakTopics: [] as string[],
      mistakes: [] as any[]
    },
    library: [] as any[],
    kits: {} as Record<string, any>
  };

  /**
   * Endpoint: /api/dashboard-data
   * Purpose: Returns library and user stats.
   */
  app.get('/api/dashboard-data', (req, res) => {
    res.json({
      success: true,
      data: {
        stats: sessionData.stats,
        library: sessionData.library
      }
    });
  });

  /**
   * Endpoint: /api/get-kit/:id
   * Purpose: Retrieves a specific revision kit by ID.
   */
  app.get('/api/get-kit/:id', (req, res) => {
    const { id } = req.params;
    const kit = sessionData.kits[id];
    if (!kit) return res.status(404).json({ error: 'Kit not found' });
    res.json({ success: true, data: kit });
  });

  /**
   * Endpoint: /api/save-to-library
   * Purpose: Saves an item to the session library.
   */
  app.post('/api/save-to-library', (req, res) => {
    const { item, kit } = req.body;
    if (!item) return res.status(400).json({ error: 'Item is required' });
    
    // Add ID if missing
    const id = item.id || Math.random().toString(36).substr(2, 9);
    item.id = id;
    if (!item.date) item.date = 'Just now';
    
    // Store kit if provided
    if (kit) {
      sessionData.kits[id] = kit;
    }
    
    const existingIndex = sessionData.library.findIndex((l: any) => l.id === id);
    if (existingIndex >= 0) {
      sessionData.library[existingIndex] = item;
    } else {
      sessionData.library.unshift(item);
      sessionData.stats.xp += 50; // Award XP for saving
    }
    
    res.json({ success: true, data: { stats: sessionData.stats, library: sessionData.library } });
  });

  app.post('/api/update-stats', (req, res) => {
    const changes = req.body;
    sessionData.stats = { ...sessionData.stats, ...changes };
    res.json({ success: true, data: sessionData.stats });
  });

  /**
   * Endpoint: /api/cleanup-library
   * Purpose: Removes duplicate library items, keeping the most-recent entry per
   * (normalised-title, type) pair. Returns the deduplicated library.
   */
  app.post('/api/delete-library-item', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });
    const before = sessionData.library.length;
    sessionData.library = sessionData.library.filter((it: any) => it.id !== id);
    if (sessionData.library.length === before) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: { library: sessionData.library, stats: sessionData.stats } });
  });

  app.post('/api/cleanup-library', (req, res) => {
    const stripPrefix = (t: string) =>
      t.replace(/^\s*(audio|visual|read\/write|readwrite|read|write)\s*[:\-–]\s*/i, '').trim().toLowerCase();

    // Library is stored newest-first (unshift on every save), so the first
    // occurrence of each key is always the most-recent item — no date parsing needed.
    const seen = new Set<string>();
    sessionData.library = sessionData.library.filter((item: any) => {
      const key = `${stripPrefix(item.title)}::${item.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, data: { library: sessionData.library, stats: sessionData.stats } });
  });

  const handleSDKError = (e: any) => {
    let msg = e.message || String(e);
    if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
      return `Invalid GEMINI_API_KEY. Please check your Google AI Studio API key.`;
    }
    try {
      const parsed = JSON.parse(msg);
      if (parsed.error && parsed.error.message) {
        if (parsed.error.message.includes("API key not valid") || parsed.error.message.includes("API_KEY_INVALID")) {
          return `Invalid GEMINI_API_KEY. Please check your Google AI Studio API key.`;
        }
        return parsed.error.message;
      }
    } catch (_) {}
    return msg;
  };

  /**
   * AI Service Endpoints
   */
  const callGemini = async (contents: any[], respFormat = "application/json") => {
    let rawKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawKey.replace(/^["']|["']$/g, '').trim();

    if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey === "" || apiKey === "your_api_key_here") {
      throw new Error("GEMINI_API_KEY is not configured. Add it to .env at the project root (e.g. GEMINI_API_KEY=AIza...) and restart `npm run dev`.");
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const contentsObj = typeof contents[0] === 'string' ? [{ role: "user", parts: contents.map(c => ({ text: c })) }] : contents;

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contentsObj,
        config: {
          temperature: 0.4,
          responseMimeType: respFormat,
        }
      });
    } catch (e: any) {
      console.error("Gemini error response:", e.message || String(e));
      throw new Error(handleSDKError(e));
    }

    const rawText = response.text || "";

    if (!rawText) {
      throw new Error(`Gemini returned no text.`);
    }

    if (respFormat === "application/json") {
       let cleanText = rawText;
       const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
       if (codeBlockMatch) cleanText = codeBlockMatch[1];
       cleanText = cleanText.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');

       try {
         return JSON.parse(cleanText);
       } catch (e2) {
         try {
           cleanText = cleanText.replace(/\n/g, ' ').replace(/\r/g, '');
           return JSON.parse(cleanText);
         } catch (e3) {
            console.error("Failed to parse", cleanText);
            throw new Error("Invalid JSON from Gemini.");
         }
       }
    }
    return rawText;
  };

  // Removed legacy varkify and full kit endpoints, all generation happens in generate-kit now.

  app.post("/api/ai/generate-weak-topic-analysis", async (req, res) => {
    try {
      const { weakTopics, mistakes } = req.body;
      const mistakesContext = mistakes.map((m: any) => `Q: ${m.question}\nCorrect: ${m.correction}`).join("\n\n");
      const topicsContext = weakTopics.join(", ");
      
      const prompt = `Analyze the user's mistakes and weak topics. Weak topics: ${topicsContext}.
Here are the past mistakes they made:
${mistakesContext}

Identify the specific sub-topics or conceptual gaps based on these mistakes.
Generate:
1) 'notes': Short notes mapped as bullet points after every two sentences, covering concepts they failed, clear up misconceptions.
2) 'tips': Strategies and tricks to remember the correct information or avoid such mistakes.
3) 'keywords': Keywords to look into based on their mistakes.
4) 'quiz': A small quiz (3-5 questions) focusing strictly on the weak areas.

Respond ONLY with a JSON object that strictly follows this interface:
{
  "notes": "string (bullet points formatting, making short notes. Start a new bullet point after every two sentences.)",
  "tips": "string (bullet points of actionable tips)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "quiz": {
    "title": "Weak Topic Remediation Quiz",
    "questions": [
      {
        "question": "...",
        "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
        "answer": "A",
        "explanation": "..."
      }
    ]
  }
}`;
      const data = await callGemini([prompt]);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/ai/generate-focused-review", async (req, res) => {
    try {
      const { weakTopics, mistakes } = req.body;
      const mistakesContext = mistakes.map((m: any) => `Q: ${m.question}\nCorrect: ${m.correction}`).join("\n\n");
      const topicsContext = weakTopics.join(", ");
      
      const prompt = `Generate a focused review quiz of EXACTLY 5 new questions. The user is weak in the following topics: ${topicsContext}.
Here are some past mistakes they made:
${mistakesContext}

Create a new set of strictly 5 multiple-choice questions that specifically target these weak areas and past mistakes.

Respond with ONLY a JSON object that satisfies this EXACT interface:
{
  "title": "Focused Review Quiz",
  "questions": [
    {
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "..."
    }
  ]
}`;
      const data = await callGemini([prompt]);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
  app.post("/api/generate-kit", async (req, res) => {
    try {
      console.log("Generate kit request body:", JSON.stringify({ ...req.body, imageBase64: req.body.imageBase64 ? '[TRUNCATED]' : undefined }));
      
      let { topic, manualText, sourceText, classLevel, examMode, sourceType, imageBase64, mimeType, chapterTitle, subject, board, mode, language, chapterId, academicYear } = req.body;

      let rawKey = process.env.GEMINI_API_KEY || "";
      const apiKey = rawKey.replace(/^["']|["']$/g, '').trim();

      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey === "" || apiKey === "your_api_key_here") {
        return res.status(500).json({
          success: false,
          error: "GEMINI_API_KEY is not configured. Add it to .env at the project root (e.g. GEMINI_API_KEY=AIza...) and restart `npm run dev`.",
        });
      }

      // 6. Derive topic from manualText/sourceText if missing
      const textRef = manualText || sourceText || "";
      if (!topic && textRef) {
        topic = textRef.substring(0, 50) + (textRef.length > 50 ? "..." : "");
      }

      // 7. If both topic and text and image are missing
      if (!topic && !textRef && !imageBase64) {
        return res.status(400).json({ success: false, error: "Please enter a topic or upload content." });
      }

      console.log("Resolved topic:", topic || "Extracted from image");

      // ── Syllabus chunk retrieval (RAG-ready grounding) ────────────────────
      const retrieval = retrieveChunks({
        chapterId,
        chapterTitle,
        subject,
        academicYear,
      });
      const syllabusGrounding = retrieval.chunks.length > 0
        ? `
SYLLABUS GROUNDING (${retrieval.academicYear}):
${retrieval.chunks.map(c => `[${c.chunkType.toUpperCase()}] ${c.text}`).join('\n')}

Use only the provided syllabus context and general educational explanation. Do not invent out-of-syllabus sections.
`
        : '';
      console.log(`Syllabus retrieval: ${retrieval.chunks.length} chunks found for ${chapterTitle || topic || 'unknown'}`);

      // When the request comes from the predefined chapter library, lock the
      // prompt to that chapter so Gemini doesn't drift into adjacent syllabus.
      const chapterContext = chapterTitle
        ? `
You are generating a ${board || examMode || 'CBSE'} ${classLevel || 'Class 10'} revision kit for the chapter "${chapterTitle}"${subject ? ` in ${subject}` : ''}.
Academic year: ${retrieval.academicYear}.
Keep answers student-friendly, exam-focused, and aligned with the chapter title.
Do not invent syllabus outside the chapter.
${mode ? `The student picked the "${mode}" learning mode — emphasise that section while still returning the full JSON shape.` : ''}
${syllabusGrounding}
`
        : '';

      // Force-Hindi when the student explicitly picked Hindi via the language
      // picker, OR when the chapter belongs to the Hindi syllabus and no
      // explicit language was requested.
      const isHindiSubject = (subject || '').toString().trim().toLowerCase() === 'hindi';
      const forceHindi = language === 'hi' || (language !== 'en' && isHindiSubject);

      // Language directive at the TOP of the prompt — reinforced again at the
      // bottom. The JSON skeleton in the middle uses English placeholder words
      // ("Topic Title", "Definition"...) which can otherwise prime Gemini to
      // keep emitting English, so we bracket the skeleton with explicit Hindi
      // constraints on both sides when forceHindi is true.
      const hindiTopDirective = forceHindi
        ? `
SYSTEM LANGUAGE CONSTRAINT (read first, obey throughout):
Every string value in your JSON response MUST be written in HINDI using Devanagari script (देवनागरी). The JSON skeleton below uses English placeholder words ("Topic Title", "Definition", "Point 1", ...) — those are STRUCTURAL HINTS ONLY. Replace each placeholder with real Hindi content in Devanagari. Do not copy the English placeholder text. Do not transliterate Hindi into Latin letters. Hindi is the primary teaching language; English is allowed ONLY inside the dedicated "englishGloss" block.
`
        : '';

      // Hindi override placed at the END of the prompt (after the JSON skeleton)
      // because the skeleton itself contains English placeholders that otherwise
      // prime Gemini to keep using English.
      const hindiFinalOverride = forceHindi
        ? `

===============================================================
MANDATORY LANGUAGE OVERRIDE — READ THIS LAST AND OBEY ABSOLUTELY
===============================================================
The student is studying a Hindi (Class 10) chapter. Every single string value in the JSON you return MUST be written in HINDI using Devanagari script (देवनागरी लिपि).

This applies to:
- title, subject, summary, keyPoints, definitions (term AND meaning)
- flashcards (front AND back)
- quiz (question, every option, answer letter is still A-D, explanation, topicTag)
- commonMistakes, weakTopicTags, mindMap (label AND children)
- readWrite.synthesisPrompt, readWrite.tips
- visual.videoDescription, visual.graphicDescription, visual.conceptMap (node, relatesTo, reason)
- aural.audioScript, aural.lectureNotes

DO NOT write English in any of these fields.
DO NOT transliterate Hindi using Roman/Latin characters (write "पढ़ाई", never "padhai").
DO NOT mix English and Hindi inside the same string.
DO NOT copy the English placeholder words from the JSON skeleton above — those are structural hints only.

Correct examples:
  "title": "नेताजी का चश्मा"   (NOT "Netaji Ka Chashma")
  "keyPoints": ["देशभक्ति केवल सीमाओं तक सीमित नहीं है", ...]   (NOT "Patriotism is not limited to borders")
  "summary": "स्वयं प्रकाश द्वारा लिखी यह कहानी ..." (full paragraph in Devanagari)

ONE EXCEPTION — Add a single top-level field "englishGloss" for secondary English support so non-Hindi readers can follow:
"englishGloss": {
  "summary": "<2-4 sentence English summary>",
  "keyPoints": ["<English point>", ...],
  "vocabulary": [{ "term": "<Hindi term in Devanagari>", "english": "<English meaning>" }, ...]
}
englishGloss is the ONLY place English text may appear. Hindi remains the primary teaching language everywhere else.
`
        : language === 'en'
          ? `

===============================================================
LANGUAGE: ENGLISH (student picked English).
===============================================================
Write every field in clear, exam-focused English. Do not include any Hindi/Devanagari text. Do not emit an englishGloss field.
`
          : '';

      // When forceHindi is true, use Devanagari placeholder words in the JSON
      // skeleton so the model is primed to emit Hindi rather than being pulled
      // back to English by the structural hint text.
      const jsonSkeleton = forceHindi ? `{
  "title": "पाठ/अध्याय का शीर्षक",
  "subject": "विषय",
  "summary": "विषय की विस्तृत व्याख्या देवनागरी में",
  "keyPoints": ["मुख्य बिंदु 1", "मुख्य बिंदु 2", "मुख्य बिंदु 3", "मुख्य बिंदु 4", "मुख्य बिंदु 5"],
  "definitions": [
    { "term": "शब्द/पद", "meaning": "परिभाषा देवनागरी में" }
  ],
  "flashcards": [
    { "front": "प्रश्न/शब्द", "back": "उत्तर/व्याख्या" }
  ],
  "quiz": [
    {
      "question": "प्रश्न का पाठ",
      "options": ["A) विकल्प 1", "B) विकल्प 2", "C) विकल्प 3", "D) विकल्प 4"],
      "answer": "A",
      "explanation": "सही उत्तर की विस्तृत व्याख्या",
      "topicTag": "उप-विषय"
    }
  ],
  "commonMistakes": ["सामान्य गलती 1", "सामान्य गलती 2"],
  "weakTopicTags": ["उप-विषय 1", "उप-विषय 2"],
  "mindMap": [
    { "label": "मुख्य विचार", "children": ["शाखा 1", "शाखा 2"] }
  ],
  "retestQuestions": [],
  "readWrite": {
    "externalReferences": ["https://ncert.nic.in/textbook.php"],
    "tips": ["अध्ययन सुझाव 1", "अध्ययन सुझाव 2", "अध्ययन सुझाव 3"],
    "synthesisPrompt": "गहरी समझ के लिए एक विचारशील प्रश्न।"
  },
  "visual": {
    "videoDescription": "विषय पर वैचारिक वीडियो की व्याख्यात्मक कथन",
    "graphicDescription": "इस विषय के लिए आदर्श आरेख का विवरण",
    "conceptMap": [
      { "node": "मुख्य विचार", "relatesTo": "उपशाखा", "reason": "संबंध का विवरण" }
    ]
  },
  "aural": {
    "audioScript": "पॉडकास्ट शैली में विषय की व्याख्या करने वाली बातचीत",
    "lectureNotes": ["व्याख्यान बिंदु अ", "व्याख्यान बिंदु ब"]
  }
}` : `{
  "title": "Topic Title",
  "subject": "Subject Name",
  "summary": "Detailed explanation of the topic",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "definitions": [
    { "term": "Term", "meaning": "Definition" }
  ],
  "flashcards": [
    { "front": "Question/Term", "back": "Answer/Explanation" }
  ],
  "quiz": [
    {
      "question": "The question text",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "answer": "A",
      "explanation": "Detailed explanation of why A is correct.",
      "topicTag": "Subtopic tag string"
    }
  ],
  "commonMistakes": ["Mistake 1", "Mistake 2"],
  "weakTopicTags": ["Subtopic 1", "Subtopic 2"],
  "mindMap": [
    { "label": "Node label", "children": ["Child node 1", "Child node 2"] }
  ],
  "retestQuestions": [],
  "readWrite": {
    "externalReferences": ["https://example.com/source1", "https://example.com/source2"],
    "tips": ["Study tip 1", "Study tip 2", "Study tip 3"],
    "synthesisPrompt": "A reflective question to test deeper understanding."
  },
  "visual": {
    "videoDescription": "Explanatory narration for a conceptual video about the topic",
    "graphicDescription": "Description of an ideal diagram for this topic",
    "conceptMap": [
      { "node": "Root", "relatesTo": "Leaf", "reason": "Connection description" }
    ]
  },
  "aural": {
    "audioScript": "A conversational script explaining the topic for a podcast",
    "lectureNotes": ["Point A", "Point B"]
  }
}`;

      const promptTemplate = `${hindiTopDirective}
You are an expert Indian school teacher (Class 10-12 level).
${chapterContext}
Generate a comprehensive revision kit for this topic.
Topic/Source Material: ${topic || chapterTitle || 'Extracted from image'} ${textRef ? `\nContent: ${textRef}` : ''}
Level: ${classLevel || "Class 10"}
Exam mode: ${examMode || "CBSE"}

Return ONLY valid JSON.
Do NOT include any markdown formatting or backticks.
Ensure all strings are correctly closed and there are no stray quotes.

Use this EXACT nested structure:

${jsonSkeleton}

Requirements:
- Create exactly 5 questions for the quiz.
- Create at least 8 flashcards covering definitions, processes, equations, and common mistakes.
- Quiz answers MUST be the single letter (A, B, C, or D) that matches the correct option.
- Options MUST start with "A) ", "B) ", "C) ", "D) ".
- Explanations MUST be provided for every question.
- All strings must be valid and escape double quotes if they appear within text.
${hindiFinalOverride}`;

      let contents: any[] = [];
      if (sourceType === 'image' && imageBase64 && mimeType) {
        contents = [{
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: `Analyze this document/image and extract the core topic and details. ${promptTemplate}` }
          ]
        }];
      } else {
        contents = [{ parts: [{ text: promptTemplate }] }];
      }

      console.log("Calling Gemini...");
      let parsedKit: any;
      try {
        const resultStringOrObject = await callGemini(contents);
        // callGemini parser returns an object if json format
        if (typeof resultStringOrObject === "string") {
            try {
                parsedKit = JSON.parse(resultStringOrObject);
            } catch (jsonErr) {
                console.error("Manual JSON Parse Error on raw string:", jsonErr);
                throw new Error("Failed to parse JSON structure. API returned: " + resultStringOrObject.substring(0, 100));
            }
        } else {
            parsedKit = resultStringOrObject;
        }
      } catch (geminiError: any) {
         console.error("Gemini invocation failed:", geminiError);
         return res.status(500).json({ success: false, error: geminiError.message || "Failed to contact AI service" });
      }

      console.log("Parsed revision kit successfully. Extracting keys.");

      // Tag the kit with its language and subject so the client can render
      // Hindi-specific UI (e.g. an English-translation toggle) and match
      // cached kits by language without re-deriving from the title.
      parsedKit.language = forceHindi ? 'hi' : 'en';
      if (subject) {
        parsedKit.subject = parsedKit.subject || subject;
      }
      if (chapterTitle) {
        parsedKit.chapterTitle = chapterTitle;
      }

      const kitId = Date.now().toString();

      sessionData.kits[kitId] = {
        id: kitId,
        ...parsedKit,
        createdAt: new Date().toISOString(),
        grounding: {
          academicYear: retrieval.academicYear,
          sourcesUsed: retrieval.sourcesUsed,
          syllabusStatus: retrieval.syllabusStatus,
          chunksUsed: retrieval.chunks.length,
        },
      };

      const finalTopic = parsedKit.quiz?.title || parsedKit.title || topic || "Generated Revision Kit";

      sessionData.library.unshift({
        id: kitId,
        title: finalTopic,
        type: "revision-kit",
        date: new Date().toLocaleDateString(),
        progress: 0,
        contentSnippet: typeof parsedKit?.summary === 'string' ? parsedKit.summary : (parsedKit?.summary?.executiveSummary || parsedKit?.summary?.text || ""),
        // Tags carry the chapter id + language so the client can match a
        // cached kit by (chapter, language) without fetching every kit.
        tags: [
          examMode || "CBSE",
          classLevel || "Class 10",
          ...(chapterTitle ? [`chapter:${chapterTitle}`] : []),
          `lang:${forceHindi ? 'hi' : 'en'}`,
          ...(subject ? [subject] : []),
        ],
      });

      res.json({
        success: true,
        data: sessionData.kits[kitId],
      });
    } catch (error: any) {
      console.error("Generate kit error:", error);

      res.status(500).json({
        success: false,
        error: error?.message || "Failed to generate revision kit",
      });
    }
  });

  // ── /api/generate-study-notes ────────────────────────────────────────────────
  // Generates richly-structured study notes in one of 7 VARK-aligned styles.
  // The prompt is subject-aware (Science/Maths/SS/English/Hindi) and style-aware.
  app.post('/api/generate-study-notes', async (req, res) => {
    try {
      const { chapterTitle, subject, noteStyle, classLevel, examMode, board, language } = req.body;

      if (!chapterTitle || !subject || !noteStyle) {
        return res.status(400).json({ success: false, error: 'chapterTitle, subject, and noteStyle are required.' });
      }

      const rawKey = process.env.GEMINI_API_KEY || "";
      const apiKey = rawKey.replace(/^["']|["']$/g, '').trim();
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        return res.status(500).json({ success: false, error: "GEMINI_API_KEY is not configured." });
      }

      const isHindi = language === 'hi' || (language !== 'en' && (subject || '').toLowerCase() === 'hindi');
      const lvl   = classLevel || 'Class 10';
      const board_ = board || examMode || 'CBSE';

      // ── Style-specific instructions ──────────────────────────────────────────
      const styleInstructions: Record<string, string> = {
        smart: `Generate SMART NOTES — the most useful all-in-one notes style.
Fill: summary (2-3 detailed paragraphs), keyPoints (8-10 bullets), definitions (all key terms),
sections (4-6 sections, each with title + detailed content + 2-3 examTips + examples),
flashcards (10 cards). Leave tables/recallQuestions/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        cornell: `Generate CORNELL NOTES — the two-column academic note style.
Fill: summary (concise 1-paragraph recap), keyPoints (6-8 bullets), definitions (key terms),
sections (one per major subtopic; each section.content = detailed notes in that cell,
section.cueQuestions = 3-4 self-test questions for the left cue column, section.examTips = exam tips),
recallQuestions (8-10 active-recall Q+hint+answer pairs),
flashcards (8 cards). Leave tables/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        outline: `Generate an EXAM OUTLINE — hierarchical notes optimised for exam revision.
Fill: summary (1 paragraph), keyPoints (top 5 most exam-relevant points),
examOutline.mainTopic and examOutline.subtopics (4-6 subtopics, each with 4-6 keyPoints, 2-3 examples, 3-4 examQuestions),
sections (mirror the outline as readable paragraphs with examTips),
flashcards (8 cards covering likely exam answers).
Leave tables/recallQuestions/conceptConnections/knowledgeCards empty arrays.`,

        comparison: `Generate COMPARISON NOTES — table-driven notes ideal for topics with contrasting concepts.
Fill: summary (1 paragraph), keyPoints (5-6 bullets), definitions (key terms),
tables (3-5 comparison tables; each table has a descriptive title, 5-6 meaningful columns e.g.
"Concept", "Meaning / Definition", "Key Features", "Real-life Example", "Difference from X", "Exam Tip",
and 3-6 data rows with complete content in every cell — never leave cells blank),
sections (written context for each comparison with examTips),
flashcards (8 cards). Leave recallQuestions/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        recall: `Generate RECALL NOTES — active-recall format for spaced repetition study.
Fill: summary (1 paragraph), keyPoints (6-8 bullets), definitions (all key terms),
recallQuestions (12-15 questions — each must have a clear question, a one-sentence hint, and a full correct answer),
sections (4-5 sections with content + cueQuestions for additional recall prompts),
flashcards (12 cards with varied front/back phrasing for maximum recall coverage).
Leave tables/conceptConnections/knowledgeCards/examOutline empty arrays.`,

        'concept-map': `Generate CONCEPT MAP NOTES — relationship-focused text-based mind map.
Fill: summary (1 paragraph), keyPoints (5-7 bullets), definitions (all key terms),
conceptConnections (12-18 connections; each with concept, connectedConcept, relationship description, whyItMatters for exam),
sections (3-4 narrative sections explaining how the concepts cluster together),
flashcards (8 cards on the most important concept pairs).
Leave tables/recallQuestions/knowledgeCards/examOutline empty arrays.`,

        'knowledge-cards': `Generate KNOWLEDGE CARDS (Zettelkasten-style atomic notes) — one idea per card.
Fill: summary (1 paragraph), keyPoints (5-6 bullets), definitions (key terms),
knowledgeCards (12-18 cards; each with a single atomic idea (3-7 words), a 2-3 sentence explanation,
2-4 linkedConcepts (other card ideas), and a precise quizQuestion with the answer embedded in it),
sections (3-4 sections grouping the cards by theme),
flashcards (10 cards matching the knowledge card questions).
Leave tables/recallQuestions/conceptConnections/examOutline empty arrays.`,
      };

      // ── Subject-specific instructions ────────────────────────────────────────
      const subjectLC = (subject || '').toLowerCase();
      const subjectInstructions =
        subjectLC === 'science' || subjectLC === 'physics' || subjectLC === 'chemistry' || subjectLC === 'biology'
          ? `SCIENCE-SPECIFIC: Include chemical/physical equations using → symbol, descriptions of diagrams to draw, clear definitions of all scientific terms, SI units where applicable, and a "Common Exam Mistakes" section listing frequent student errors.`
        : subjectLC === 'mathematics' || subjectLC === 'maths'
          ? `MATHS-SPECIFIC: List ALL relevant formulas in a dedicated section. For each major concept include a fully worked step-by-step solved example. Highlight common calculation/sign mistakes. Include proof steps where relevant.`
        : subjectLC === 'social science' || subjectLC === 'history' || subjectLC === 'geography' || subjectLC === 'civics' || subjectLC === 'economics'
          ? `SOCIAL SCIENCE-SPECIFIC: Include a chronological timeline of key events (if history), important personalities and their roles, cause-and-effect chains, geographical or map-based points, important statistics or data, and treaty/act names with dates.`
        : subjectLC === 'english'
          ? `ENGLISH-SPECIFIC: Include theme and central idea, a chapter/poem summary, character sketches (name → personality → role → key quote), important lines/stanzas with explanation, word meanings and literary devices, and likely long-answer question themes.`
        : subjectLC === 'hindi'
          ? `HINDI-SPECIFIC: पाठ का केंद्रीय विषय, पात्र-चित्रण (नाम → स्वभाव → भूमिका → महत्वपूर्ण पंक्ति), कठिन शब्दों के अर्थ, महत्वपूर्ण पंक्तियों की व्याख्या, और संभावित प्रश्न-उत्तर शामिल करें।`
        : `Include relevant formulas/definitions, real-life examples, key facts, and common mistakes.`;

      const langDirective = isHindi
        ? `LANGUAGE: Write ALL content in Hindi using Devanagari script (देवनागरी). Do NOT write in English except for proper nouns or chemical symbols. JSON keys remain in English.`
        : `LANGUAGE: Write all content in clear, student-friendly English.`;

      const prompt = `${langDirective}

You are an expert ${board_} ${lvl} ${subject} teacher. Generate structured study notes.

Chapter / Topic: ${chapterTitle}
Subject: ${subject}
Note Style: ${noteStyle.toUpperCase()}
Class: ${lvl}  |  Board: ${board_}

NOTE STYLE INSTRUCTIONS:
${styleInstructions[noteStyle] || styleInstructions['smart']}

SUBJECT-SPECIFIC INSTRUCTIONS:
${subjectInstructions}

QUALITY RULES:
- Write like a real teacher — not generic filler. Every sentence must help a student understand or remember.
- keyPoints must be specific facts/rules/formulas, NOT vague headings.
- sections.content must be detailed (4-8 sentences minimum per section).
- definitions.meaning must include an example in brackets where possible.
- flashcards must cover different angles: definition, application, equation, common mistake, comparison.
- examTips must be specific and actionable (e.g. "CBSE often asks about X in 3-mark questions").
- Do NOT repeat the same sentence in multiple fields.
- All arrays must have at least the minimum count stated in the style instructions.

Return ONLY valid JSON matching this EXACT structure (no markdown, no backticks):

{
  "topic": "${chapterTitle}",
  "subject": "${subject}",
  "noteStyle": "${noteStyle}",
  "summary": "detailed summary paragraph(s)",
  "keyPoints": ["specific point 1", "specific point 2"],
  "definitions": [{ "term": "Term", "meaning": "Clear meaning with example" }],
  "sections": [
    {
      "title": "Section Title",
      "content": "Detailed paragraph content",
      "cueQuestions": ["Self-test question?"],
      "examTips": ["Specific exam tip"],
      "examples": ["Concrete example"]
    }
  ],
  "tables": [
    {
      "title": "Table Title",
      "columns": ["Col 1", "Col 2", "Col 3"],
      "rows": [["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"]]
    }
  ],
  "recallQuestions": [{ "question": "Q?", "hint": "Think about...", "answer": "Full answer" }],
  "flashcards": [{ "front": "Question or term", "back": "Answer or definition" }],
  "conceptConnections": [
    { "concept": "A", "connectedConcept": "B", "relationship": "how A relates to B", "whyItMatters": "exam relevance" }
  ],
  "knowledgeCards": [
    { "idea": "Atomic idea title", "explanation": "2-3 sentence explanation", "linkedConcepts": ["related idea"], "quizQuestion": "Question testing this idea?" }
  ],
  "examOutline": {
    "mainTopic": "${chapterTitle}",
    "subtopics": [
      { "title": "Subtopic", "keyPoints": ["point"], "examples": ["example"], "examQuestions": ["Q?"] }
    ]
  }
}`;

      console.log('Calling Gemini for study notes:', noteStyle, chapterTitle);
      const parsed = await callGemini([prompt]);

      // Ensure required arrays exist
      parsed.sections        = parsed.sections        || [];
      parsed.definitions     = parsed.definitions     || [];
      parsed.keyPoints       = parsed.keyPoints       || [];
      parsed.flashcards      = parsed.flashcards      || [];
      parsed.tables          = parsed.tables          || [];
      parsed.recallQuestions = parsed.recallQuestions || [];
      parsed.conceptConnections = parsed.conceptConnections || [];
      parsed.knowledgeCards  = parsed.knowledgeCards  || [];
      parsed.noteStyle       = noteStyle;
      parsed.subject         = subject;
      parsed.topic           = chapterTitle;
      parsed.language        = isHindi ? 'hi' : 'en';

      res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.error('generate-study-notes error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to generate study notes.' });
    }
  });

  // ── /api/evaluate-exam-answer ─────────────────────────────────────────────────
  // AI-evaluates a student's written exam answer against CBSE rubrics and returns
  // structured feedback: marks, missing keywords, strengths, improvements, model answer.
  app.post('/api/evaluate-exam-answer', async (req, res) => {
    try {
      const { question, studentAnswer, totalMarks, subject, chapterTitle, classLevel } = req.body;
      if (!question || !studentAnswer) {
        return res.status(400).json({ success: false, error: 'question and studentAnswer are required.' });
      }
      const lvl = classLevel || 'Class 10';
      const sub = subject || 'General';
      const prompt = `You are a strict but encouraging ${sub} teacher evaluating a ${lvl} CBSE exam answer.

Question (${totalMarks || 3} marks): ${question}

Student's Answer: ${studentAnswer}

Evaluate the answer and return ONLY valid JSON:
{
  "marksScored": <number out of ${totalMarks || 3}>,
  "totalMarks": ${totalMarks || 3},
  "missingKeywords": ["keyword the student should have mentioned but didn't"],
  "strengths": ["what the student did well"],
  "improvements": ["specific advice to improve the answer"],
  "modelAnswer": "The ideal answer a topper would write for full marks"
}

Grading rules:
- Be fair but strict — CBSE examiners look for specific keywords and structure.
- For 1-mark answers: 1 keyword/definition is enough for full marks.
- For 3-mark answers: expect 3 distinct points or a definition + example + application.
- For 5-mark answers: expect an introduction, 4-5 key points, examples, and a conclusion.
- If the student's answer is empty or gibberish, give 0 marks.
- missingKeywords should list specific terms/facts the student missed.
- modelAnswer should be exactly what a full-marks answer looks like.`;

      const parsed = await callGemini([prompt]);
      parsed.marksScored = Number(parsed.marksScored) || 0;
      parsed.totalMarks = Number(parsed.totalMarks) || totalMarks || 3;
      res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.error('evaluate-exam-answer error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to evaluate answer.' });
    }
  });

  // ── /api/ai/generate-summary ─────────────────────────────────────────────────
  app.post('/api/ai/generate-summary', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ success: false, error: 'text is required.' });

      const prompt = `You are Lumina, a friendly AI study coach. Summarise the following and respond helpfully.

Input: "${text}"

Respond ONLY with a JSON object:
{
  "summary": "Your helpful response here",
  "keyTakeaways": ["Point 1", "Point 2", "Point 3"],
  "complexity": "Beginner"
}

complexity must be one of: Beginner | Intermediate | Advanced`;

      const data = await callGemini([prompt]);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── /api/generate-flashcards ─────────────────────────────────────────────────
  // Generates standalone flashcards for a topic. Used by the shared
  // openFlashcards() flow when no kit-bundled flashcards are available.
  app.post('/api/generate-flashcards', async (req, res) => {
    try {
      const {
        topic,
        classLevel = 'Class 10',
        examMode   = 'CBSE',
        sourceText = '',
      } = req.body;

      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic is required.' });
      }

      const sourceCtx = sourceText
        ? `\n\nExtra context from the student's revision kit:\n${String(sourceText).substring(0, 2000)}`
        : '';

      const prompt = `You are an expert ${examMode} teacher creating revision flashcards for a ${classLevel} student.

Topic: "${topic}"${sourceCtx}

Generate at least 8 flashcards covering definitions, processes, equations and common mistakes.
Use student-friendly language suitable for a Class 10 student.

Return ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "topic": "${topic}",
  "flashcards": [
    {
      "front": "Short question, term or concept",
      "back": "Clear explanation or answer (2–3 sentences max)",
      "topicTag": "Specific subtopic label",
      "difficulty": "easy"
    }
  ]
}

Rules:
- At least 8 flashcards.
- difficulty must be one of: easy | medium | hard.
- Cover definitions, processes, equations and common mistakes.
- All JSON strings must be properly escaped.`;

      const raw = await callGemini([prompt]);

      const cards: any[] = (raw.flashcards || []).map((c: any, i: number) => ({
        front:      c.front      || `Card ${i + 1}`,
        back:       c.back       || '',
        topicTag:   c.topicTag   || topic,
        difficulty: c.difficulty || 'medium',
      })).filter((c: any) => c.front && c.back);

      if (cards.length === 0) {
        return res.status(502).json({ success: false, error: 'AI returned no usable flashcards. Please retry.' });
      }

      res.json({
        success: true,
        data: { topic: raw.topic || topic, flashcards: cards },
      });
    } catch (e: any) {
      console.error('generate-flashcards error:', e.message);
      res.status(500).json({ success: false, error: e.message || 'Failed to generate flashcards. Please try again.' });
    }
  });

  // ── /api/generate-quiz ────────────────────────────────────────────────────────
  // Generates CBSE-style MCQs. If weakTopics are provided, questions target those
  // subtopics only. Returns questions with id, difficulty, topicTag fields.
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const {
        topic,
        classLevel = 'Class 10',
        examMode   = 'CBSE',
        sourceText = '',
        weakTopics = [] as string[],
        count      = 5,
      } = req.body;

      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic is required.' });
      }

      // Build context block
      const weakCtx = weakTopics.length > 0
        ? `\nFocus ONLY on these weak subtopics: ${weakTopics.join(', ')}.`
        : '';
      const sourceCtx = sourceText
        ? `\n\nExtra context from the student's revision kit:\n${sourceText.substring(0, 2000)}`
        : '';

      const prompt = `You are an expert ${examMode} teacher preparing a ${classLevel} quiz.

Topic: "${topic}"${weakCtx}${sourceCtx}

Generate exactly ${count} multiple-choice questions in ${examMode} ${classLevel} style.
Mix difficulty: roughly 2 easy, 2 medium, 1 hard (scale to count proportionally).

Return ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "topic": "${topic}",
  "questions": [
    {
      "id": "q1",
      "question": "Full question text?",
      "options": ["A) Option one", "B) Option two", "C) Option three", "D) Option four"],
      "answer": "A",
      "explanation": "Clear explanation of why A is correct.",
      "topicTag": "Specific subtopic label",
      "difficulty": "easy"
    }
  ]
}

Rules:
- id must be "q1", "q2", … "q${count}".
- options must start with "A) ", "B) ", "C) ", "D) ".
- answer must be a single letter: A, B, C, or D.
- difficulty must be one of: easy | medium | hard.
- Every question must include explanation and topicTag.
- All JSON strings must be properly escaped.`;

      const raw = await callGemini([prompt]);

      // Normalise: ensure questions have the id field
      const questions: any[] = (raw.questions || []).map((q: any, i: number) => ({
        id: q.id || `q${i + 1}`,
        question:    q.question   || '',
        options:     q.options    || [],
        answer:      q.answer     || 'A',
        explanation: q.explanation|| '',
        topicTag:    q.topicTag   || topic,
        difficulty:  q.difficulty || 'medium',
      }));

      res.json({
        success: true,
        data: { topic: raw.topic || topic, questions },
      });
    } catch (e: any) {
      console.error('generate-quiz error:', e.message);
      res.status(500).json({ success: false, error: e.message || 'Failed to generate quiz. Please try again.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();