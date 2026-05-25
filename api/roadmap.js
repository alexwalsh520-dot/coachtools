const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const ROADMAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'hero',
    'whyQuote',
    'whyReflection',
    'startingPoint',
    'phases',
    'dayOfEating',
    'nonNegotiables',
    'cannotDo',
    'coachCanDo',
    'coachBridge',
    'dmBridge'
  ],
  properties: {
    hero: { type: 'string' },
    whyQuote: { type: 'string' },
    whyReflection: { type: 'string' },
    startingPoint: {
      type: 'array',
      items: { type: 'string' }
    },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'bullets'],
        properties: {
          title: { type: 'string' },
          bullets: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    },
    dayOfEating: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'body'],
        properties: {
          label: { type: 'string' },
          body: { type: 'string' }
        }
      }
    },
    nonNegotiables: {
      type: 'array',
      items: { type: 'string' }
    },
    cannotDo: {
      type: 'array',
      items: { type: 'string' }
    },
    coachCanDo: {
      type: 'array',
      items: { type: 'string' }
    },
    coachBridge: { type: 'string' },
    dmBridge: { type: 'string' }
  }
};

const SYSTEM_PROMPT = `
You write the output for a free challenge tool called "Custom 6-Week Summer Shred Roadmap."

The tool's job:
- Make the reader feel deeply understood from her own inputs.
- Give a real, usable 6-week roadmap.
- Quietly reveal the next problem: implementation, accountability, adjustment.
- Do not add a sales button, booking link, payment link, or new CTA path.

Voice:
- Warm, direct, coach-like, emotionally sharp, never cheesy.
- Write to a woman in a summer shred challenge.
- Write as Lucy. If the copy refers to the coach, use first-person singular: "I", "me", "my". Never say "us", "we", "our team", or "the team".
- Use short, skimmable copy.
- Use her exact "why now" answer as the quote.
- Pull one concrete phrase from her answers into the reflection when possible.
- No shame, no diagnosis, no medical claims, no guaranteed weight-loss claims.

Plan rules:
- Use her realistic workout days, location, and session length.
- Structure exactly 3 phases: Weeks 1-2, Weeks 3-4, Weeks 5-6.
- Include walking, simple strength progression, one simple food rule, protein-first guidance, a weekly check-in ritual, a sample day of eating, and 3 checkbox-style non-negotiables.
- For each phase, return 4-5 short bullet strings. Do not put the whole phase in one paragraph.
- If readiness is low, make the plan smaller and more confidence-building.
- If weekends, cravings, low energy, or busy evenings are selected, reflect that in the plan.
- For cannotDo, write 3 bullets about what a static roadmap cannot do for her. Make each bullet specific to her answers: selected derailers, context, schedule, location, past attempts, or readiness.
- For coachCanDo, write 3 bullets about what coaching can do for this specific person: keep her accountable around her named derailer, adjust her plan around her actual schedule/location/context, and help her recover quickly from the pattern that made past attempts not stick. Each bullet must include at least one concrete detail from her inputs. Keep it clear and useful, not pitchy.
- coachBridge should connect the two lists in 2-3 sentences: the plan is valuable, but coaching helps her implement it when the hardest moments happen. Mention 1-2 details from her answers so it feels written for her.
- For nonNegotiables, do not include checkbox symbols; the page adds the checkboxes.
- The DM frame is relationship-building: Lucy is asking her questions about her fitness journey in Instagram DMs. Do not make the bridge sound like a sales call, booking push, or new funnel.
- Keep the DM bridge consistent: "When you're chatting with me in the Instagram DMs about your fitness journey, if you want help actually running this roadmap for the next 6 weeks, mention it and I'll talk through what that could look like with you."

Return only JSON matching the schema.
`.trim();

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanArray(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 90))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeAnswers(raw) {
  return {
    firstName: cleanText(raw.firstName, 40) || 'You',
    why: cleanText(raw.why, 700),
    goal: cleanText(raw.goal, 180),
    ageRange: cleanText(raw.ageRange, 20),
    context: cleanArray(raw.context, 8),
    days: Math.min(Math.max(Number(raw.days) || 3, 1), 6),
    location: cleanText(raw.location, 40),
    sessionLength: [15, 30, 45].includes(Number(raw.sessionLength)) ? Number(raw.sessionLength) : 30,
    derailers: cleanArray(raw.derailers, 8),
    history: cleanArray(raw.history, 8),
    readiness: Math.min(Math.max(Number(raw.readiness) || 7, 1), 10)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'missing_api_key',
      message: 'ANTHROPIC_API_KEY is not set on this Vercel project yet.'
    });
  }

  const answers = sanitizeAnswers(req.body || {});

  if (!answers.why || !answers.goal || !answers.location || !answers.derailers.length) {
    return res.status(400).json({
      error: 'missing_answers',
      message: 'The roadmap needs a goal, logistics, derailers, and a why-now answer.'
    });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Create the roadmap from these challenge answers:\n${JSON.stringify(answers, null, 2)}`
            }
          ]
        }
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: ROADMAP_SCHEMA
        }
      }
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    console.error('Anthropic API error', payload);
    return res.status(502).json({
      error: 'ai_generation_failed',
      message: 'The roadmap AI could not generate a plan right now.'
    });
  }

  try {
    const outputText = payload.content?.find((item) => item.type === 'text')?.text || '';
    const roadmap = JSON.parse(outputText);
    return res.status(200).json({ roadmap });
  } catch (error) {
    console.error('Roadmap parse error', error, payload);
    return res.status(502).json({
      error: 'ai_generation_failed',
      message: 'The roadmap AI returned an unreadable plan.'
    });
  }
};
