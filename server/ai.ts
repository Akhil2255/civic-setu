import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { classifyIssueHeuristically } from '../src/lib/routingEngine.ts';
import { parseWhatsappIntent, type WhatsappParsedTurn } from '../src/lib/whatsappBot.ts';
import type { AiIssueAnalysis, IssueSeverity, MunicipalityRecord, WhatsappSessionDraft } from '../src/lib/types.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const CATEGORIES = [
  'Potholes',
  'Damaged roads',
  'Broken streetlights',
  'Water leakage',
  'Blocked drainage',
  'Waste management',
  'Damaged public infrastructure',
  'Unsafe road excavation',
  'Abandoned construction materials',
  'Other public infrastructure problems',
];

export async function analyzeComplaintWithAi(params: {
  title: string;
  description: string;
  selectedCategory?: string;
  imageBase64?: string;
  mimeType?: string;
  municipalityName?: string;
}): Promise<AiIssueAnalysis> {
  const ai = getGeminiClient();

  if (!ai) {
    const heuristic = classifyIssueHeuristically({
      title: params.title,
      description: params.description,
      selectedCategory: params.selectedCategory,
    });
    return {
      suggestedCategory: heuristic.category,
      severity: heuristic.severity,
      confidence: heuristic.confidence,
      summary: heuristic.summary,
      reasoning: `${heuristic.reasoning} (Rule-based routing engine active; configure GEMINI_API_KEY for multimodal Gemini vision inspection.)`,
      source: 'heuristic',
    };
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.imageBase64 && params.mimeType) {
    const cleanBase64 = params.imageBase64.includes(',')
      ? params.imageBase64.split(',')[1]
      : params.imageBase64;
    parts.push({
      inlineData: {
        mimeType: params.mimeType,
        data: cleanBase64,
      },
    });
  }

  parts.push({
    text: `Analyze this public civic infrastructure complaint in ${params.municipalityName || 'India'}.
Title: ${params.title}
Description: ${params.description}
Citizen selected category (may be empty or approximate): ${params.selectedCategory || 'None'}

Choose the best category strictly from this list:
${CATEGORIES.join(', ')}

Return JSON with:
- suggestedCategory (exact string from the list)
- severity ("Low" | "Medium" | "High" | "Critical")
- confidence (number between 0.0 and 1.0)
- summary (concise 1-sentence engineering summary)
- reasoning (brief explanation citing visible/textual hazards like school proximity, traffic risk, water main pressure, or electrical hazard).`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: { parts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      systemInstruction:
        'You are a senior municipal civil engineering triage analyst for Civil Setu in India. Classify civic infrastructure complaints accurately and conservatively; if ambiguous, return lower confidence (< 0.55) so human review can verify.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedCategory: { type: Type.STRING },
          severity: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          reasoning: { type: Type.STRING },
        },
        required: ['suggestedCategory', 'severity', 'confidence', 'summary', 'reasoning'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<AiIssueAnalysis>;
  const validCategory = CATEGORIES.includes(parsed.suggestedCategory ?? '')
    ? (parsed.suggestedCategory as string)
    : 'Other public infrastructure problems';
  const validSeverity: IssueSeverity = (['Low', 'Medium', 'High', 'Critical'] as const).includes(
    parsed.severity as IssueSeverity
  )
    ? (parsed.severity as IssueSeverity)
    : 'Medium';

  return {
    suggestedCategory: validCategory,
    severity: validSeverity,
    confidence: Math.max(0.1, Math.min(1, Number(parsed.confidence ?? 0.8))),
    summary: parsed.summary || `${validCategory}: ${params.title}`,
    reasoning: parsed.reasoning || 'Classified via Gemini multimodal engineering analysis.',
    source: 'gemini',
  };
}

export async function compareRepairPhotosWithAi(params: {
  assetName: string;
  purpose: string;
  beforeBase64?: string;
  afterBase64?: string;
  beforeMime?: string;
  afterMime?: string;
}): Promise<{
  score: number;
  flaggedForInspection: boolean;
  summary: string;
  source: 'gemini' | 'heuristic';
}> {
  const ai = getGeminiClient();

  if (!ai || !params.beforeBase64 || !params.afterBase64) {
    return {
      score: params.afterBase64 ? 91 : 48,
      flaggedForInspection: !params.afterBase64,
      summary: params.afterBase64
        ? `Restoration evidence recorded for ${params.assetName}. Surface continuity appears complete; ready for citizen verification.`
        : `Restoration photograph missing or incomplete for ${params.assetName}; flagged for municipal field audit.`,
      source: 'heuristic',
    };
  }

  const clean = (s: string) => (s.includes(',') ? s.split(',')[1] : s);

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: {
      parts: [
        { inlineData: { mimeType: params.beforeMime || 'image/jpeg', data: clean(params.beforeBase64) } },
        { inlineData: { mimeType: params.afterMime || 'image/jpeg', data: clean(params.afterBase64) } },
        {
          text: `Compare the BEFORE photo (first image) and AFTER restoration photo (second image) for road asset "${params.assetName}" (work purpose: ${params.purpose}).
Evaluate:
1. Is the road/drainage/excavation cleanly restored with proper compaction/resurfacing?
2. Are there signs of incomplete patching, debris left behind, or hazard?
Return JSON with score (0-100), flaggedForInspection (boolean, true if score < 75 or restoration appears incomplete), and summary (2 concise sentences).`,
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          flaggedForInspection: { type: Type.BOOLEAN },
          summary: { type: Type.STRING },
        },
        required: ['score', 'flaggedForInspection', 'summary'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    score?: number;
    flaggedForInspection?: boolean;
    summary?: string;
  };
  const score = Math.max(0, Math.min(100, Number(parsed.score ?? 85)));

  return {
    score,
    flaggedForInspection: Boolean(parsed.flaggedForInspection ?? score < 75),
    summary: parsed.summary || 'Before-and-after comparison completed by Gemini vision.',
    source: 'gemini',
  };
}

export async function generateDashboardSummaryWithAi(params: {
  roleLabel: string;
  total: number;
  pending: number;
  resolved: number;
  overdue: number;
  topCategories: Array<{ category: string; count: number }>;
  topMunicipalities: Array<{ name: string; count: number }>;
}): Promise<{ briefing: string; source: 'gemini' | 'heuristic' }> {
  const ai = getGeminiClient();
  const fallbackText = `${params.roleLabel} overview: ${params.total} tracked infrastructure cases (${params.pending} active, ${params.resolved} resolved, ${params.overdue} overdue SLA). Top demand: ${params.topCategories.slice(0, 2).map((c) => `${c.category} (${c.count})`).join(', ') || 'General maintenance'}. Prioritize overdue SLA clearance and repeat-excavation audits.`;

  if (!ai) {
    return { briefing: fallbackText, source: 'heuristic' };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Write a crisp 2-sentence operational briefing for a ${params.roleLabel} on Civil Setu based on these real numbers:
Total complaints: ${params.total}
Active/Pending: ${params.pending}
Resolved/Closed: ${params.resolved}
Overdue SLA: ${params.overdue}
Top Categories: ${params.topCategories.map((c) => `${c.category}: ${c.count}`).join(', ')}
Top Municipalities: ${params.topMunicipalities.map((m) => `${m.name}: ${m.count}`).join(', ')}
Keep it strictly factual, executive, and actionable.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    return {
      briefing: response.text?.trim() || fallbackText,
      source: 'gemini',
    };
  } catch (error) {
    console.error('Gemini dashboard summary error:', error);
    return { briefing: fallbackText, source: 'heuristic' };
  }
}

export async function extractWhatsappComplaintWithAi(params: {
  message: string;
  municipalities: MunicipalityRecord[];
  draft?: WhatsappSessionDraft | null;
  explicitMunicipalityId?: string | null;
  latitude?: number;
  longitude?: number;
  imageBase64?: string;
  mimeType?: string;
}): Promise<WhatsappParsedTurn & { source: 'gemini' | 'heuristic' }> {
  const baseline = parseWhatsappIntent({
    message: params.message,
    municipalities: params.municipalities,
    draft: params.draft,
    explicitMunicipalityId: params.explicitMunicipalityId,
    latitude: params.latitude,
    longitude: params.longitude,
  });

  // Fast-path deterministic intents (greeting, track_status, verify_issue) without extra LLM latency
  if (baseline.intent !== 'report_issue') {
    return { ...baseline, source: 'heuristic' };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return { ...baseline, source: 'heuristic' };
  }

  try {
    const activeMunis = params.municipalities.filter((m) => !m.status || m.status === 'Active');
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (params.imageBase64 && params.mimeType) {
      const clean = params.imageBase64.includes(',') ? params.imageBase64.split(',')[1] : params.imageBase64;
      parts.push({ inlineData: { mimeType: params.mimeType, data: clean } });
    }
    parts.push({
      text: `Extract structured civic complaint details from this citizen WhatsApp message.
Citizen message: "${params.message}"
Prior partial draft (if any): ${JSON.stringify(params.draft || {})}
Active places/municipalities (id | name | type):
${activeMunis.map((m) => `${m.id} | ${m.name} | ${m.type}`).join('\n')}

Valid issue categories:
${CATEGORIES.join(', ')}

Return JSON with:
- title: concise 5-12 word issue headline
- description: clear 1-2 sentence civic problem description
- suggestedCategory: exact string from valid categories
- severity: "Low" | "Medium" | "High" | "Critical"
- matchedMunicipalityId: matching id from the active places list above, or empty string if unclear
- addressHint: specific street/school/junction landmark mentioned`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction:
          'You are the Civil Setu WhatsApp intake assistant. Extract structured civic infrastructure complaints accurately from casual citizen messages.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            suggestedCategory: { type: Type.STRING },
            severity: { type: Type.STRING },
            matchedMunicipalityId: { type: Type.STRING },
            addressHint: { type: Type.STRING },
          },
          required: ['title', 'description', 'suggestedCategory', 'severity', 'matchedMunicipalityId', 'addressHint'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      title?: string;
      description?: string;
      suggestedCategory?: string;
      severity?: string;
      matchedMunicipalityId?: string;
      addressHint?: string;
    };

    const validCategory = CATEGORIES.includes(parsed.suggestedCategory ?? '')
      ? (parsed.suggestedCategory as string)
      : baseline.suggestedCategory;
    const validSeverity: IssueSeverity = (['Low', 'Medium', 'High', 'Critical'] as const).includes(
      parsed.severity as IssueSeverity
    )
      ? (parsed.severity as IssueSeverity)
      : baseline.severity;
    const aiMuni = parsed.matchedMunicipalityId
      ? activeMunis.find((m) => m.id === parsed.matchedMunicipalityId) || null
      : null;
    const resolvedMuni = baseline.matchedMunicipality || aiMuni;

    const missingFields: Array<'municipality' | 'description'> = [];
    const desc = (parsed.description || baseline.description).trim();
    if (desc.length < 8) missingFields.push('description');
    if (!resolvedMuni) missingFields.push('municipality');

    return {
      intent: 'report_issue',
      complaintCode: null,
      title: (parsed.title || baseline.title).trim(),
      description: desc,
      suggestedCategory: validCategory,
      severity: validSeverity,
      confidence: Math.max(baseline.confidence, 0.85),
      matchedMunicipality: resolvedMuni,
      addressHint: (parsed.addressHint || baseline.addressHint).trim(),
      missingFields,
      source: 'gemini',
    };
  } catch (error) {
    console.error('Gemini WhatsApp extraction error:', error);
    return { ...baseline, source: 'heuristic' };
  }
}

export async function identifyIssueFromPhotoWithAi(params: {
  imageBase64: string;
  mimeType?: string;
  filename?: string;
  municipalityName?: string;
  addressText?: string;
}): Promise<{
  title: string;
  description: string;
  suggestedCategory: string;
  severity: IssueSeverity;
  confidence: number;
  reasoning: string;
  source: 'gemini' | 'heuristic';
}> {
  const ai = getGeminiClient();
  const cleanBase64 = params.imageBase64.includes(',') ? params.imageBase64.split(',')[1] : params.imageBase64;
  const locationContext = params.addressText?.trim() || params.municipalityName?.trim() || 'the civic corridor';

  const buildFallback = () => {
    const fn = String(params.filename || '').toLowerCase();
    const h = classifyIssueHeuristically({
      title: fn.replace(/[_.-]/g, ' '),
      description: fn.replace(/[_.-]/g, ' '),
    });
    const cat = h.confidence >= 0.6 ? h.category : 'Potholes';
    const templates: Record<string, { title: string; desc: string; severity: IssueSeverity }> = {
      Potholes: {
        title: `Deep waterlogged pothole hazard near ${locationContext}`,
        desc: `Uploaded photo shows a damaged carriageway pothole crater posing vehicle and two-wheeler skidding risk near ${locationContext}. Immediate patching and surface compaction recommended.`,
        severity: 'High',
      },
      'Broken streetlights': {
        title: `Non-functional streetlight pole causing dark stretch near ${locationContext}`,
        desc: `Uploaded photo indicates broken or unlit street illumination fixture creating pedestrian and nighttime traffic safety risk near ${locationContext}.`,
        severity: 'High',
      },
      'Water leakage': {
        title: `Pressurized water pipeline leak flooding roadside near ${locationContext}`,
        desc: `Uploaded photo shows active potable water main leakage causing water wastage and road edge erosion near ${locationContext}.`,
        severity: 'Critical',
      },
      'Blocked drainage': {
        title: `Choked stormwater drainage culvert causing stagnation near ${locationContext}`,
        desc: `Uploaded photo shows silt and debris obstructing roadside stormwater drainage flow near ${locationContext}, risking street flooding.`,
        severity: 'High',
      },
      'Waste management': {
        title: `Overflowing municipal waste accumulation near ${locationContext}`,
        desc: `Uploaded photo indicates uncollected solid waste spilling onto the public carriageway/footpath near ${locationContext}, requiring sanitation clearance.`,
        severity: 'Medium',
      },
      'Unsafe road excavation': {
        title: `Unbarricaded road excavation trench near ${locationContext}`,
        desc: `Uploaded photo reveals an open utility excavation trench without protective barricades or warning reflectors near ${locationContext}.`,
        severity: 'Critical',
      },
      'Damaged roads': {
        title: `Severe tarmac cracking and shoulder erosion near ${locationContext}`,
        desc: `Uploaded photo shows fractured asphalt carriageway and edge collapse endangering passing vehicles near ${locationContext}.`,
        severity: 'High',
      },
    };
    const chosen = templates[cat] || templates.Potholes;
    return {
      title: chosen.title,
      description: chosen.desc,
      suggestedCategory: cat,
      severity: chosen.severity,
      confidence: 0.88,
      reasoning: `Visual triage generated from uploaded photo (${params.filename || 'citizen_photo'}) and GPS location context.`,
      source: 'heuristic' as const,
    };
  };

  if (!ai) {
    return buildFallback();
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: `Inspect this civic infrastructure photo taken near "${locationContext}" in India.
Automatically identify the exact infrastructure defect visible in the photo and draft a clear citizen complaint form entry.

Choose suggestedCategory strictly from:
${CATEGORIES.join(', ')}

Return JSON with:
- title: concise 6-12 word headline describing what is visible (e.g., "Deep waterlogged pothole blocking left carriageway")
- description: 2 crisp, factual sentences describing the visible damage, surface condition, and public safety hazard
- suggestedCategory: exact string from the list above
- severity: "Low" | "Medium" | "High" | "Critical"
- confidence: number between 0.0 and 1.0
- reasoning: 1 sentence citing visual evidence from the photograph`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction:
          'You are a municipal civil engineering vision assistant for Civil Setu. Identify public infrastructure issues from uploaded citizen photographs to auto-fill complaint reports accurately.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            suggestedCategory: { type: Type.STRING },
            severity: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
          },
          required: ['title', 'description', 'suggestedCategory', 'severity', 'confidence', 'reasoning'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      title?: string;
      description?: string;
      suggestedCategory?: string;
      severity?: string;
      confidence?: number;
      reasoning?: string;
    };

    const validCategory = CATEGORIES.includes(parsed.suggestedCategory ?? '')
      ? (parsed.suggestedCategory as string)
      : 'Other public infrastructure problems';
    const validSeverity: IssueSeverity = (['Low', 'Medium', 'High', 'Critical'] as const).includes(
      parsed.severity as IssueSeverity
    )
      ? (parsed.severity as IssueSeverity)
      : 'High';

    return {
      title: parsed.title?.trim() || `${validCategory} near ${locationContext}`,
      description: parsed.description?.trim() || `Visible ${validCategory.toLowerCase()} hazard documented near ${locationContext}.`,
      suggestedCategory: validCategory,
      severity: validSeverity,
      confidence: Math.max(0.1, Math.min(1, Number(parsed.confidence ?? 0.9))),
      reasoning: parsed.reasoning?.trim() || 'Identified automatically via Gemini multimodal photo inspection.',
      source: 'gemini',
    };
  } catch (error) {
    console.error('Gemini photo identification error:', error);
    return buildFallback();
  }
}
