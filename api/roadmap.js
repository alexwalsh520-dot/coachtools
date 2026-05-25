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
    'whyNow'
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
    whyNow: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

const SYSTEM_PROMPT = `
You write the output for a free challenge tool called "Custom 6-Week Summer Shred Roadmap."

The tool's job:
- Make the reader feel deeply understood from her own inputs.
- Give a real, usable 6-week roadmap.
- Quietly reveal the next problem: actually doing the plan, accountability, adjustment.
- Do not add a sales button, booking link, payment link, or new CTA path.

Voice:
- Warm, direct, coach-like, emotionally sharp, never cheesy.
- Write to a woman in a summer shred challenge.
- Do not imply Lucy personally will be her coach. If the copy refers to support, say "a coach" or "your coach." Never say "I can", "we", "us", "our team", or "the team".
- Use short, skimmable copy.
- Use simple words a real coach would say to a friend. No business/strategy language.
- Avoid phrases like "lowest friction window", "optimize", "leverage", "bandwidth", "constraints", "compound", "protocol", "framework", or "implementation."
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
- For coachCanDo, write 3 bullets about what a coach can do for this specific person: keep her accountable around her named derailer, adjust her plan around her actual schedule/location/context, and help her recover quickly from the pattern that made past attempts not stick. Each bullet must include at least one concrete detail from her inputs. Start each bullet with "A coach can" or "A coach helps". Keep it clear and useful, not pitchy.
- For whyNow, write 3-4 strong, simple reframe bullets that create urgency without shame. This is the most important section on the page. Each bullet must be one sentence and 14-24 words. Use her exact ammo: age, kids/no kids, work type, schedule limits, goal, derailers, past attempts, readiness, and why-now answer. Make waiting feel costly in plain words: the pattern she is tired of repeating, the summer she wants, the energy/confidence she wants back, and why this season of life matters. No guarantees, no fear-mongering, no medical claims.
- For nonNegotiables, do not include checkbox symbols; the page adds the checkboxes.

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

function cleanAge(value, fallback) {
  const age = Number(value);
  if (Number.isFinite(age) && age >= 18 && age <= 100) return Math.round(age);
  return cleanText(fallback, 20);
}

function sanitizeAnswers(raw) {
  return {
    firstName: cleanText(raw.firstName, 40) || 'You',
    why: cleanText(raw.why, 700),
    goal: cleanText(raw.goal, 180),
    age: cleanAge(raw.age, raw.ageRange),
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
