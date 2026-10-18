import { MarketReport, GoogleTrendsData, ResearchSource } from '../types';
import { getAi } from './geminiService';
import { GenerateContentResponse, Type } from "@google/genai";
import desktopBridge from './desktopBridge';
import { MARKET_INTEL_GROUNDING, getLaneForGenre } from './marketIntel';

// ---------------------------------------------------------------------------
// Optional: Tavily live web search (skipped gracefully when key is absent)
// ---------------------------------------------------------------------------
export async function fetchTavilyResults(topic: string): Promise<ResearchSource[]> {
  const apiKey = import.meta.env.VITE_TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000); // 10 s timeout for Tavily
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query: `best selling books about ${topic}`, max_results: 5 }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.title || 'Untitled',
      summary: (r.content || '').substring(0, 300),
      relevance: r.url || '',
      sourceType: 'web' as const,
    }));
  } catch (e) {
    console.warn('[Tavily] Fetch failed:', e);
    return [];
  }
}

export const generateRealMarketReport = async (topic: string, genre?: string): Promise<MarketReport> => {
    console.log(`Starting real market research for: ${topic}`);

    // 1. Fetch Google Trends Data
    let trendsData: GoogleTrendsData | null = null;
    try {
        trendsData = await desktopBridge.fetchGoogleTrends(topic);
    } catch (e) {
        console.warn("Failed to fetch Google Trends:", e);
    }

    // 2. Fetch Amazon Competitors
    let competitors: any[] = [];
    try {
        competitors = await desktopBridge.fetchAmazonCompetitors(topic);
    } catch (e) {
        console.warn("Failed to fetch Amazon competitors:", e);
    }

    // 3. Fetch Amazon Suggestions (for keywords)
    let suggestions: string[] = [];
    try {
        suggestions = await desktopBridge.fetchAmazonSuggestions(topic);
    } catch (e) {
        console.warn("Failed to fetch Amazon suggestions:", e);
    }

    // 4. Optional: Tavily live web research
    let tavilyResults: ResearchSource[] = [];
    try {
        tavilyResults = await fetchTavilyResults(topic);
    } catch (e) {
        console.warn("Tavily failed:", e);
    }

    const tavilyBlock = tavilyResults.length > 0
        ? `\n\n**Live Web Research:**\n${tavilyResults.map(r => `- ${r.title}: ${r.summary}`).join('\n')}`
        : '';

    // 5. Synthesize Report using Gemini with real data
    // Ground the model with Oct 2026 market intel + the closest researched genre lane.
    const lane = genre ? getLaneForGenre(genre) : undefined;
    const laneBlock = lane
        ? `\n\n**Closest researched genre lane for "${genre}": ${lane.name} — tropes: ${lane.tropes.join(', ')}; POV: ${lane.pov}; heat: ${lane.heat}; target ${lane.wordCount[0].toLocaleString()}–${lane.wordCount[1].toLocaleString()} words; price $${lane.price.toFixed(2)}; ${lane.distribution === 'KU' ? 'Kindle Unlimited exclusive' : 'wide distribution'}. Reasoning: ${lane.reasoning}`
        : '';
    const groundingBlock = `\n\n${MARKET_INTEL_GROUNDING}${laneBlock}`;

    const prompt = `
    Analyze the following REAL market data for the book topic "${topic}"${genre ? ` in genre "${genre}"` : ''}.
    ${groundingBlock}
    **Google Trends Data:**
    ${trendsData ? JSON.stringify(trendsData.interestOverTime.slice(-12)) : "Not available from desktop. Provide expert analysis instead."}
    
    **Top Amazon Competitors:**
    ${competitors.length > 0 ? competitors.map((c: any) => `- ${c.title} by ${c.author} (Rating: ${c.rating}, Reviews: ${c.reviewCount})`).join('\n    ') : "Not available — use genre knowledge."}
    
    **Amazon Search Suggestions (Keywords):**
    ${suggestions.length > 0 ? suggestions.join(', ') : "Not available — suggest based on topic."}${tavilyBlock}

    Based on this data, generate a comprehensive market report.
    - **Trend Analysis**: Interpret the trends, competitor saturation, and demand signals.
    - **Target Audience**: Deduce demographics, interests, and pain points from the data.
    - **Keywords**: Select the highest-value keywords.
    - **Competitor Analysis**: Summarize success factors.
    
    Do NOT fabricate data — work only with what is provided above.
    Return JSON matching the MarketReport schema.
    `;

    const ai = getAi();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    trendAnalysis: { type: Type.STRING },
                    targetAudience: {
                        type: Type.OBJECT,
                        properties: {
                            demographics: { type: Type.STRING },
                            interests: { type: Type.STRING },
                            painPoints: { type: Type.STRING }
                        }
                    },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    suggestedBookTypes: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING },
                                reasoning: { type: Type.STRING }
                            }
                        }
                    },
                    competitorAnalysis: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                successFactor: { type: Type.STRING }
                            }
                        }
                    }
                }
            }
        }
    });

    const report: MarketReport = JSON.parse(response.text || '{}');
    
    // Inject real trends data into the report
    if (trendsData) {
        report.googleTrends = trendsData;
    }
    
    return report;
};
