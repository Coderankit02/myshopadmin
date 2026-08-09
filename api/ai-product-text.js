/*!
 * /api/ai-product-text — Product Name + Description AI (Cloudflare Workers AI, FREE)
 * -----------------------------------------------------------------------------
 * Admin Products form me jab admin sirf HINDI naam daalta hai (e.g. "गेहूं का
 * आटा"), to ye endpoint usse ek professional ENGLISH product name aur chhota
 * description generate karta hai — bilkul FREE (wahi Cloudflare keys jo image
 * generation use karti hain, koi naya setup nahi).
 *
 * REQUEST (POST, JSON): { "name": "गेहूं का आटा", "category": "Atta & Flour" }
 * RESPONSE: { "englishName": "Wheat Flour", "description": "...", "model": "..." }
 *
 * NOTE (verified Aug 2026): Cloudflare Workers AI text models OpenAI-style
 * `messages` array accept karte hain; response `result.response` me aata hai.
 */

const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CF_TIMEOUT_MS = 25000;

function clean(s, max) {
  return String(s || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildMessages(name, category) {
  const product = clean(name, 120) || 'Unknown product';
  const cat = clean(category, 80);

  const system =
    'You are a professional assistant for an Indian grocery e-commerce store. ' +
    'You receive a product name that may be in HINDI, Hinglish, or a mix. ' +
    'Your job: (1) give the correct ENGLISH product name (title case, max 45 characters, ' +
    'include quantity/pack size if present in the input), and (2) a short, attractive ' +
    'product description (2-3 sentences, max 70 words) suitable for a grocery app — ' +
    'mention quality, uses, and pack details. Reply in STRICT JSON with exactly two keys: ' +
    '{"englishName": "...", "description": "..."}. No markdown, no extra text.';

  const user =
    `Product name: ${product}${cat ? `\nCategory: ${cat}` : ''}\n` +
    'Return the JSON now.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ── Local fallback (quota khatam / keys missing hone par bhi kaam kare) ──
// Common Indian grocery items ka Hindi→English dictionary + generic description
// template. Cloudflare fail hone par yeh instantly kaam karta hai — koi AI call
// nahi, koi quota nahi. Dictionary miss hone par sirf cleanup + template.
const HINDI_GROCERY = [
  // Atta / flour / grains
  [/आटा|aata|atta/i, 'Wheat Flour'],
  [/चावल|चवल|chawal|chaval/i, 'Rice'],
  [/दाल|daal|dal/i, 'Dal'],
  [/चना|chana/i, 'Chana (Bengal Gram)'],
  [/मूंग|moong/i, 'Moong Dal'],
  [/तुअर|अरहर|toor|arhar/i, 'Toor Dal'],
  [/मसूर|masoor/i, 'Masoor Dal'],
  [/राजमा|rajma/i, 'Rajma (Kidney Beans)'],
  [/चोकर|chokar/i, 'Wheat Bran'],
  [/सूजी|sooji|suji/i, 'Sooji (Semolina)'],
  [/मैदा|maida/i, 'Maida (All-Purpose Flour)'],
  [/बेसन|besan/i, 'Besan (Gram Flour)'],
  [/दलिया|daliya/i, 'Daliya (Cracked Wheat)'],
  [/पोहा|poha/i, 'Poha (Flattened Rice)'],
  [/मक्का|makka|makki/i, 'Makki (Corn)'],
  [/ज्वार|jowar|jwar/i, 'Jowar (Sorghum)'],
  [/बाजरा|bajra/i, 'Bajra (Pearl Millet)'],
  [/रागी|ragi/i, 'Ragi (Finger Millet)'],
  // Oil & ghee
  [/सरसों|sarson|mustard/i, 'Mustard'],
  [/सूरजमुखी|sunflower/i, 'Sunflower'],
  [/मूंगफली|groundnut|peanut/i, 'Groundnut (Peanut)'],
  [/नारियल|coconut/i, 'Coconut'],
  [/घी|ghee/i, 'Ghee'],
  [/तेल|tel|oil/i, 'Oil'],
  // Dairy
  [/दूध|doodh|milk/i, 'Milk'],
  [/दही|dahi|curd|yogurt/i, 'Curd (Yogurt)'],
  [/पनीर|paneer/i, 'Paneer (Cottage Cheese)'],
  [/मक्खन|butter/i, 'Butter'],
  [/छाछ|chaas|buttermilk/i, 'Buttermilk'],
  [/क्रीम|cream/i, 'Cream'],
  [/चीज़|cheese/i, 'Cheese'],
  [/मावा|khoya|mawa/i, 'Khoya (Mawa)'],
  [/पेड़ा|peda/i, 'Peda'],
  // Spices
  [/हल्दी|haldi|turmeric/i, 'Turmeric'],
  [/धनिया|dhania|coriander/i, 'Coriander'],
  [/जीरा|jeera|cumin/i, 'Cumin (Jeera)'],
  [/मिर्च|mirch|chilli|chili/i, 'Chilli'],
  [/लाल मिर्च|red chilli/i, 'Red Chilli Powder'],
  [/गरम मसाला|garam masala/i, 'Garam Masala'],
  [/मेथी|methi|fenugreek/i, 'Fenugreek (Methi)'],
  [/अजवाइन|ajwain/i, 'Ajwain (Carom Seeds)'],
  [/सौंफ|saunf|fennel/i, 'Saunf (Fennel Seeds)'],
  [/इलायची|elaichi|cardamom/i, 'Elaichi (Cardamom)'],
  [/दालचीनी|dalchini|cinnamon/i, 'Dalchini (Cinnamon)'],
  [/लौंग|laung|clove/i, 'Laung (Cloves)'],
  [/काली मिर्च|black pepper/i, 'Black Pepper'],
  [/सरसों दाना|rai|mustard seeds/i, 'Rai (Mustard Seeds)'],
  [/नमक|namak|salt/i, 'Salt'],
  [/चीनी|chini|shakkar|sugar/i, 'Sugar'],
  [/हींग|hing|asafoetida/i, 'Hing (Asafoetida)'],
  // Vegetables / produce
  [/आलू|aloo|potato/i, 'Potato'],
  [/प्याज|pyaaz|onion/i, 'Onion'],
  [/टमाटर|tamatar|tomato/i, 'Tomato'],
  [/लहसुन|lahsun|garlic/i, 'Garlic'],
  [/अदरक|adrak|ginger/i, 'Ginger'],
  [/गोभी|gobhi|cabbage|cauliflower/i, 'Gobhi (Cabbage/Cauliflower)'],
  [/बैंगन|baingan|brinjal|eggplant/i, 'Brinjal (Eggplant)'],
  [/भिंडी|bhindi|okra/i, 'Bhindi (Okra)'],
  [/मटर|matar|peas/i, 'Green Peas'],
  [/गाजर|gajar|carrot/i, 'Carrot'],
  [/पालक|palak|spinach/i, 'Palak (Spinach)'],
  [/करेला|karela|bitter gourd/i, 'Karela (Bitter Gourd)'],
  [/तोरई|turai|ridge gourd/i, 'Turai (Ridge Gourd)'],
  [/लौकी|lauki|bottle gourd/i, 'Lauki (Bottle Gourd)'],
  [/कद्दू|kaddu|pumpkin/i, 'Kaddu (Pumpkin)'],
  [/नींबू|nimbu|lemon/i, 'Lemon'],
  [/हरा धनिया|coriander leaves/i, 'Coriander Leaves'],
  [/शिमला मिर्च|shimla mirch|capsicum|bell pepper/i, 'Capsicum (Bell Pepper)'],
  [/मूली|mooli|radish/i, 'Mooli (Radish)'],
  [/खीरा|kheera|cucumber/i, 'Kheera (Cucumber)'],
  [/शकरकंद|sweet potato/i, 'Sweet Potato'],
  [/अरबी|arbi|colocasia/i, 'Arbi (Colocasia)'],
  // Fruits
  [/केला|kela|banana/i, 'Banana'],
  [/सेब|seb|apple/i, 'Apple'],
  [/आम|aam|mango/i, 'Mango'],
  [/संतरा|santra|orange/i, 'Orange'],
  [/अंगूर|angoor|grapes/i, 'Grapes'],
  [/अनार|anar|pomegranate/i, 'Pomegranate'],
  [/पपीता|papita|papaya/i, 'Papaya'],
  [/तरबूज|tarbooj|watermelon/i, 'Watermelon'],
  [/नीबू|nimbu/i, 'Lime'],
  // Pulses/beans
  [/सोयाबीन|soybean|soya/i, 'Soya'],
  [/चने|chane/i, 'Chana'],
  [/काला चना|kala chana/i, 'Kala Chana'],
  [/मटर|white peas/i, 'White Peas'],
  // Snacks & staples
  [/चाय|chai|tea/i, 'Tea'],
  [/कॉफी|coffee/i, 'Coffee'],
  [/बिस्कुट|biscuit/i, 'Biscuit'],
  [/नमकीन|namkeen/i, 'Namkeen'],
  [/मुरमुरे|murmura|puffed rice/i, 'Murmura (Puffed Rice)'],
  [/पापड़|papad/i, 'Papad'],
  [/अचार|achar|pickle/i, 'Achar (Pickle)'],
  [/शहद|shahad|honey/i, 'Honey'],
  [/मूंगफली|groundnut/i, 'Groundnut'],
  // Eggs / meat
  [/अंडा|anda|egg/i, 'Eggs'],
  // Misc
  [/साबुन|sabun|soap/i, 'Soap'],
  [/शैम्पू|shampoo/i, 'Shampoo'],
  [/डिटर्जेंट|detergent/i, 'Detergent'],
  [/टूथपेस्ट|toothpaste/i, 'Toothpaste'],
  [/चूड़ा|chura/i, 'Chura (Flattened Rice)'],
];

// Common pack-size suffixes jo naam me rakhne chahiye (1kg, 500g, 1L, 200ml...)
function extractSize(name) {
  const m = String(name || '').match(/(\d+\s*(\.\d+)?\s*(kg|g|gm|l|ml|pc|pcs|पीस|किग्रा))/i);
  return m ? m[0].replace(/\s+/g, ' ') : '';
}

function fallbackResult(name, category) {
  const raw = clean(name, 120);
  // Pehle dictionary match
  let englishName = '';
  for (const [re, en] of HINDI_GROCERY) {
    if (re.test(raw)) { englishName = en; break; }
  }
  const size = extractSize(raw);
  // Dictionary miss → sirf size + title-cased raw (Devanagari hatao if possible)
  if (!englishName) {
    // Devanagari remove → jo bhi Latin bacha use karo
    const latin = raw.replace(/[\u0900-\u097F]+/g, '').trim();
    englishName = latin
      ? latin.replace(/\s+/g, ' ').replace(/(^|\s)([a-z])/g, (_, p, c) => p + c.toUpperCase())
      : (category ? category.split(' ')[0] : 'Grocery Product');
  }
  // Size duplicate hone se bachao (e.g. "2kg 2kg") — sirf tab jodo jab naam me
  // size pehle se na ho
  const hasSizeInName = size && englishName.toLowerCase().includes(size.toLowerCase());
  const finalName = (hasSizeInName ? englishName : [englishName, size].filter(Boolean).join(' ')).trim().slice(0, 60);
  const desc =
    `Premium quality ${englishName.toLowerCase()} — fresh aur hygienically packed, ${size || 'perfect pack size'} for your daily needs. ` +
    `Best for everyday cooking, great value for money. Order now for quick home delivery.`;
  return { englishName: finalName, description: desc, model: 'local-fallback' };
}

function parseJson(raw) {
  // Models kabhi-kabhi markdown code fence me wrap kar dete hain — strip karo
  const stripped = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  // Pehla { ... last } — aas-paas koi text ho to bhi JSON mil jaye
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sirf POST requests chalti hain.' });
  }

  let body = {};
  try { body = req.body || {}; } catch { /* ignore */ }
  if (!String(body.name || '').trim()) {
    return res.status(400).json({ error: 'name required' });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    // Keys missing → local fallback (dictionary) — hamesha kaam karta hai
    return res.status(200).json(fallbackResult(body.name, body.category));
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CF_MODEL}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          messages: buildMessages(body.name, body.category),
          max_tokens: 220,
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(CF_TIMEOUT_MS),
      }
    );

    const json = await cfRes.json().catch(() => null);
    if (!cfRes.ok || !json?.success) {
      const msg = json?.errors?.[0]?.message || json?.errors?.[0] || `HTTP ${cfRes.status}`;
      throw new Error(`Cloudflare ${cfRes.status}: ${String(msg).slice(0, 250)}`);
    }

    const parsed = parseJson(json.result?.response);
    if (!parsed || !String(parsed.englishName || '').trim()) {
      // JSON nahi mila to fallback: raw text hi naam ke tor par (safe)
      const raw = String(json.result?.response || '').trim();
      const firstLine = raw.split('\n')[0].replace(/^[-*•]?\s*/, '').replace(/["']/g, '').slice(0, 60);
      return res.status(200).json({
        englishName: firstLine || clean(body.name, 45),
        description: clean(raw.split('\n').slice(1).join(' '), 300),
        model: CF_MODEL,
        usage: json.result?.usage || null,
        fallback: true,
      });
    }

    return res.status(200).json({
      englishName: clean(parsed.englishName, 60),
      description: clean(parsed.description, 400),
      model: CF_MODEL,
      usage: json.result?.usage || null,
    });
  } catch (e) {
    // Cloudflare fail (quota/429/network) → local fallback taaki button hamesha
    // kaam kare. 200 return hota hai (fallback=true flag ke saath) taaki client
    // error na dikhaye.
    return res.status(200).json({ ...fallbackResult(body.name, body.category), fallback: true, aiError: String(e.message || e).slice(0, 120) });
  }
}
