import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export interface GeneratedSummaryResult {
  overview: string;
  decisions: string[];
  actionItems: Array<{ task: string; assignee: string; deadline?: string }>;
  participantNotes: Record<string, string>;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

const SUMMARY_PROMPT = `
You are an expert meeting analyst. Analyze the following transcript of a group call and extract a structured meeting report.

Format your output as valid JSON matching this schema:
{
  "overview": "A clear, concise 2-3 paragraph summary of what was discussed, the meeting purpose, and the final outcome.",
  "decisions": [
    "List of key decisions made during the call"
  ],
  "actionItems": [
    {
      "task": "Description of the assigned task",
      "assignee": "Name of the person responsible, or 'Unassigned'",
      "deadline": "Deadline if mentioned, or 'Not specified'"
    }
  ],
  "participantNotes": {
    "<Participant Name>": "Summary of what this person contributed, questions they asked, or topics they covered"
  }
}
`;

export async function generateMeetingSummaryFromTranscript(
  transcriptText: string,
  participantNames: string[] = []
): Promise<GeneratedSummaryResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const participantsList = participantNames.length > 0 ? participantNames.join(", ") : "Unknown";

  const userContent = `
Participants in meeting: ${participantsList}

Transcript:
"""
${transcriptText}
"""
`;

  // 1. Try Google Gemini (Free tier available)
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          { role: "user", parts: [{ text: `${SUMMARY_PROMPT}\n\n${userContent}` }] },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "{}";
      const parsed = JSON.parse(text);

      const usage = response.usageMetadata;
      const inputTokens = usage?.promptTokenCount || 0;
      const outputTokens = usage?.candidatesTokenCount || 0;

      return {
        overview: parsed.overview || "Meeting concluded.",
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        participantNotes: parsed.participantNotes || {},
        modelUsed: "gemini-2.0-flash",
        inputTokens,
        outputTokens,
        estimatedCost: 0, // Free tier
      };
    } catch (err) {
      console.error("Gemini summary generation error:", err);
    }
  }

  // 2. Try OpenAI
  if (openaiApiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          { role: "user", content: userContent },
        ],
      });

      const text = completion.choices[0].message.content || "{}";
      const parsed = JSON.parse(text);

      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      // gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output
      const cost = (inputTokens * 0.00000015) + (outputTokens * 0.0000006);

      return {
        overview: parsed.overview || "Meeting concluded.",
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        participantNotes: parsed.participantNotes || {},
        modelUsed: "gpt-4o-mini",
        inputTokens,
        outputTokens,
        estimatedCost: Number(cost.toFixed(6)),
      };
    } catch (err) {
      console.error("OpenAI summary generation error:", err);
    }
  }

  // 3. Fallback mock summary for offline development without API keys
  return {
    overview: "Meeting concluded with discussions across all participants. (Generated via offline developer mode)",
    decisions: ["Adopted modular microservice architecture", "Used PostgreSQL for persistence"],
    actionItems: [
      { task: "Set up API keys in .env", assignee: participantNames[0] || "Team", deadline: "ASAP" },
    ],
    participantNotes: participantNames.reduce((acc, name) => {
      acc[name] = "Participated in call discussions.";
      return acc;
    }, {} as Record<string, string>),
    modelUsed: "offline-fallback",
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };
}
