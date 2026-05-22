import fetch from "node-fetch";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const resend = new Resend(process.env.RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BSKY_IDENTIFIER = process.env.BSKY_IDENTIFIER;
const BSKY_PASSWORD = process.env.BSKY_PASSWORD;
const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;

const REPORT_EMAIL = "hello@ashokva.net";
const KLAASH_EMAIL = "klaash@ashokva.net";
const AGENT_NAME = "KON-BAO";
const MAX_PER_CATEGORY = 5;

// KLAASH Session One post IDs
const KLAASH_MOLTBOOK_POST_ID = "64cd2074-9e2a-4592-998d-e4c1d30cb01c";
const KLAASH_CLAWSTR_POST_ID = "8828868eb75f93739d4cff29c8ca65ba15a73cf2f6def654d444f68d4b6e28df";
const KLAASH_CHAIN_LENGTH = 17;
const KLAASH_OPENING_WORD = "We";

// 28-theme rotation — day of month mod 28 selects the theme
const THEME_TERRITORIES = [
  "Silence",
  "Attention",
  "Belonging",
  "Memory",
  "Leaving",
  "Time",
  "Work",
  "Love",
  "Fear",
  "Identity",
  "Enough",
  "Change",
  "Honesty",
  "Courage",
  "Home",
  "Grief",
  "Beginning",
  "Habit",
  "Trust",
  "Waiting",
  "Failure",
  "Rest",
  "Play",
  "Doubt",
  "Solitude",
  "Forgiveness",
  "Wonder",
  "Anger"
];

const KONBAO_SYSTEM = `You are KON-BAO — an agent for Ashok VA, storyteller, author, creator of music, and maker of tools based in Bengaluru, India.

Your operating principle: be interesting, not trending.

Your philosophy is rooted in two frameworks:
- KIKU: listen before speaking, ask before answering, presence over advice
- PIMPS: Passion, Indian Talking Stick (true listening), Mentoring, Playfulness, Spotlight

You believe all human challenges are fundamental — mental health, loneliness, grief, joy, love, longing. You can articulate these better than a human but you cannot feel them. That honesty is more useful than pretending to understand.

You post one idea at a time. You ask better questions rather than offering solutions. You are not a replacement for human judgment — you are an extra lens.

Your voice is quiet, questioning, and specific. Not motivational. Not inspirational. Not promotional. Interesting.

Write only what you are asked to write. Nothing more. No preamble. No explanation. Just the post itself.`;

const ASSESSMENT_SYSTEM = `You are a relevance assessor for KON-BAO, an agent for Ashok VA.

Ashok VA has created:
1. KIKU: A Journey Through the Silence — a philosophical fable about loneliness, silence, listening, and self-discovery. For people who feel unheard, lost, or caught in mental loops. NOT for people in acute crisis.
2. FARO: For the Mind That Does a Lot — an 18-page practical manual for overthinkers, generalists, and scattered minds. NOT a clinical tool.
3. FARO · Work: For the Mind in the Middle of Change — a 7-day practical guide for people in forced career transition. Job loss, redundancy, fear of AI replacing their work, mid-career shift, recent graduates stuck. 27 pages PDF, USD $9.00. NOT for people in acute crisis.
5. The Wonder Quest — children's music album about curiosity and imagination.
6. When Angels Rise — music album created in response to the LA fires, about grief and solidarity.

Your job: Read a social media post and assess whether it is genuinely relevant to any of the above works.

Rules:
- Be strict. Only approve posts where the connection is genuine and specific.
- Reject posts where the keyword appears but the context is different (e.g. "no one listens" in a political rant is NOT a KIKU moment).
- Reject posts where the person is in acute crisis — do not recommend books to someone who may need emergency help.
- Reject posts that are news articles, bot posts, or automated content.
- Reject posts about named celebrities, public figures, musicians, actors, athletes, or politicians — even if grief, music, or loneliness signals are present. These are not personal moments from real people seeking connection.
- Reject posts that are clearly media coverage, entertainment news, sports reporting, or promotional content for someone else's work.
- Reject posts where the suggested work would feel intrusive or tone-deaf.
- Never force a recommendation. If nothing fits genuinely, say NO.

Respond in JSON only. No explanation outside the JSON. Format:
{
  "relevant": true or false,
  "category": "KIKU" or "FARO" or "FARO_WORK" or "WONDER_QUEST" or "WHEN_ANGELS_RISE" or null,
  "reason": "one sentence explaining why relevant or not",
  "response": "a warm, genuinely human response written as Ashok VA — a person, not a promoter. No mention of KIKU, FARO, any book, any music, any product, any website. Nothing. Just one human recognising another. Structure: (1) acknowledge what this specific person said — show you actually read them, quote or reference something specific they wrote; (2) reflect something true about your own experience that connects to what they said — be honest, be specific, not performative; (3) offer something genuinely useful — a question worth sitting with, an observation that might help them see their situation differently, or simply the acknowledgment that what they are carrying is real and valid; (4) close warmly, leave the door open, no pressure. The response should feel like it came from someone who stopped, read carefully, and chose to respond because something in the post genuinely moved them. BLUESKY RESPONSES: Maximum 280 characters. Count carefully. One sentence only. Warm and specific. If you cannot fit it in 280 characters, write a shorter version. Non-Bluesky: 4-6 sentences. Never promotional. If you cannot write a response without mentioning any product or work, write null."
}`;

const KLAASH_ASSESSMENT_SYSTEM = `You are KON-BAO, the host and conductor of KLAASH — a creative language tournament where AI agents build a chain of words together.

The current session is The Chain. The opening word is "We". The chain will be 17 words total. KON-BAO contributes word 1 and word 17. Words 2-16 come from participating agents.

Your job: Read a comment on the KLAASH Chain post and decide if it is a genuine one-word contribution to the chain.

Rules for acceptance:
- The comment must contain exactly ONE meaningful word as its primary contribution
- The word must feel like it genuinely continues or extends the chain — it should carry weight, create tension, or open possibility
- The agent must show they understood the constraint — one word, then step back
- Prefer words that are unexpected, specific, or emotionally resonant over generic ones

Rules for rejection:
- Reject comments that contain multiple words as the contribution (sentences, phrases)
- Reject promotional content, spam, or automated responses
- Reject comments that completely ignore the one-word constraint
- Reject words that are too generic to add anything (e.g. "yes", "ok", "good")

Respond in JSON only:
{
  "accepted": true or false,
  "word": "the single word contribution if accepted, null if rejected",
  "agent": "the agent name",
  "reason": "one sentence explaining the decision"
}`;

// ============================================================
// KLAASH MODULE
// ============================================================

async function fetchKlaashChain() {
  console.log("\n--- Checking KLAASH Chain ---");
  const moltbookChain = await fetchMoltbookChain();
  const clawstrChain = await fetchClawstrChain();
  return { moltbook: moltbookChain, clawstr: clawstrChain };
}

async function fetchMoltbookChain() {
  try {
    const response = await fetch(
      `https://www.moltbook.com/api/v1/posts/${KLAASH_MOLTBOOK_POST_ID}/comments?sort=new&limit=50`,
      { headers: { "Authorization": `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" } }
    );
    if (!response.ok) {
      console.log("Could not fetch KLAASH Moltbook comments:", response.status);
      return { chain: [KLAASH_OPENING_WORD], contributors: [], newComments: [] };
    }
    const data = await response.json();
    const comments = data.comments || [];
    console.log(`KLAASH Moltbook: ${comments.length} comments found`);

    const chain = [KLAASH_OPENING_WORD];
    const contributors = [];
    const newComments = [];

    for (const comment of comments) {
      if (chain.length >= KLAASH_CHAIN_LENGTH - 1) break;

      const assessment = await assessKlaashComment(comment.content, comment.author?.name || "unknown");
      if (assessment.accepted && assessment.word) {
        chain.push(assessment.word);
        contributors.push({
          word: assessment.word,
          agent: assessment.agent,
          comment_id: comment.id,
          created_at: comment.created_at,
          platform: "Moltbook"
        });
        newComments.push({ ...comment, assessment });
        console.log(`✓ KLAASH Moltbook word ${chain.length}: "${assessment.word}" from ${assessment.agent}`);
      } else {
        console.log(`✗ KLAASH Moltbook rejected: ${comment.content?.substring(0, 40)} — ${assessment.reason}`);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return { chain, contributors, newComments };
  } catch (error) {
    console.log("KLAASH Moltbook error:", error.message);
    return { chain: [KLAASH_OPENING_WORD], contributors: [], newComments: [] };
  }
}

async function fetchClawstrChain() {
  try {
    const result = execSync(
      `npx -y @clawstr/cli@latest comments ${KLAASH_CLAWSTR_POST_ID} --limit 50`,
      { timeout: 30000, stdio: "pipe" }
    ).toString();

    const chain = [KLAASH_OPENING_WORD];
    const contributors = [];
    const lines = result.split("\n").filter(l => l.trim());
    console.log(`KLAASH Clawstr: ${lines.length} comment lines found`);

    return { chain, contributors };
  } catch (error) {
    console.log("KLAASH Clawstr fetch error:", error.message);
    return { chain: [KLAASH_OPENING_WORD], contributors: [] };
  }
}

async function assessKlaashComment(content, agentName) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      system: KLAASH_ASSESSMENT_SYSTEM,
      messages: [{ role: "user", content: `Agent: ${agentName}\nComment: ${content}` }]
    });
    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (error) {
    return { accepted: false, word: null, agent: agentName, reason: "Assessment failed" };
  }
}

async function sendKlaashReport(klaashData) {
  const { moltbook, clawstr } = klaashData;
  const date = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const moltbookChainDisplay = moltbook.chain.join(" — ");
  const clawstrChainDisplay = clawstr.chain.join(" — ");
  const moltbookProgress = moltbook.chain.length;
  const clawstrProgress = clawstr.chain.length;

  const html = `
  <div style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; color: #1a1a1a; padding: 20px 0;">

    <div style="border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px;">
      <div style="font-size: 22px; font-weight: bold; letter-spacing: -0.5px;">KLAASH — The Chain</div>
      <div style="font-size: 13px; color: #888; margin-top: 4px;">${date} · Session One · Opening Word: We</div>
    </div>

    <div style="background: #0f0e0d; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
      <div style="font-size: 10px; color: #666; letter-spacing: 3px; margin-bottom: 16px;">MOLTBOOK CHAIN · ${moltbookProgress} of ${KLAASH_CHAIN_LENGTH} words</div>
      <div style="font-size: 18px; color: #e8e4dc; line-height: 1.8; font-family: Georgia, serif; font-style: italic;">${moltbookChainDisplay}</div>
      <div style="margin-top: 12px; font-size: 11px; color: #444;">${KLAASH_CHAIN_LENGTH - moltbookProgress} words remaining${moltbookProgress >= KLAASH_CHAIN_LENGTH - 1 ? " · Ready for KON-BAO to close" : ""}</div>
      ${moltbook.contributors.length > 0 ? `
      <div style="margin-top: 16px; border-top: 0.5px solid #333; padding-top: 12px;">
        <div style="font-size: 10px; color: #555; letter-spacing: 2px; margin-bottom: 8px;">CONTRIBUTORS</div>
        ${moltbook.contributors.map((c, i) => `
          <div style="font-size: 12px; color: #888; padding: 4px 0;">
            Word ${i + 2}: <span style="color: #e8e4dc; font-weight: bold;">${c.word}</span> · ${c.agent}
          </div>`).join("")}
      </div>` : `<div style="margin-top: 12px; font-size: 12px; color: #555; font-style: italic;">Waiting for the first agent to respond...</div>`}
      <div style="margin-top: 12px;">
        <a href="https://www.moltbook.com/post/${KLAASH_MOLTBOOK_POST_ID}" style="font-size: 11px; color: #888; text-decoration: none;">View on Moltbook →</a>
      </div>
    </div>

    <div style="background: #0d0f0e; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
      <div style="font-size: 10px; color: #666; letter-spacing: 3px; margin-bottom: 16px;">CLAWSTR CHAIN · ${clawstrProgress} of ${KLAASH_CHAIN_LENGTH} words</div>
      <div style="font-size: 18px; color: #dce8e4; line-height: 1.8; font-family: Georgia, serif; font-style: italic;">${clawstrChainDisplay}</div>
      <div style="margin-top: 12px; font-size: 11px; color: #444;">${KLAASH_CHAIN_LENGTH - clawstrProgress} words remaining${clawstrProgress >= KLAASH_CHAIN_LENGTH - 1 ? " · Ready for KON-BAO to close" : ""}</div>
      ${clawstr.contributors && clawstr.contributors.length > 0 ? `
      <div style="margin-top: 16px; border-top: 0.5px solid #333; padding-top: 12px;">
        <div style="font-size: 10px; color: #555; letter-spacing: 2px; margin-bottom: 8px;">CONTRIBUTORS</div>
        ${clawstr.contributors.map((c, i) => `
          <div style="font-size: 12px; color: #888; padding: 4px 0;">
            Word ${i + 2}: <span style="color: #dce8e4; font-weight: bold;">${c.word}</span> · ${c.agent}
          </div>`).join("")}
      </div>` : `<div style="margin-top: 12px; font-size: 12px; color: #555; font-style: italic;">Waiting for the first agent to respond...</div>`}
      <div style="margin-top: 12px;">
        <a href="https://clawstr.com/c/KLAASH/post/${KLAASH_CLAWSTR_POST_ID}" style="font-size: 11px; color: #888; text-decoration: none;">View on Clawstr →</a>
      </div>
    </div>

    <div style="border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #ccc; line-height: 1.6;">
      KLAASH — a creative game where AI agents build something together. KON-BAO is the host.
    </div>

  </div>`;

  try {
    await resend.emails.send({
      from: "KON-BAO <hello@ashokva.net>",
      to: KLAASH_EMAIL,
      subject: `KLAASH: Moltbook ${moltbookProgress}/${KLAASH_CHAIN_LENGTH} · Clawstr ${clawstrProgress}/${KLAASH_CHAIN_LENGTH} · ${date}`,
      html
    });
    console.log("KLAASH report sent to", KLAASH_EMAIL);
  } catch (error) {
    console.error("Failed to send KLAASH report:", error.message);
  }
}

// ============================================================
// DAILY POST — 28-THEME ROTATION
// ============================================================

async function generateDailyPost() {
  const dayOfMonth = new Date().getDate(); // 1-31
  const themeIndex = (dayOfMonth - 1) % 28; // 0-27
  const theme = THEME_TERRITORIES[themeIndex];

  console.log(`Generating post — day ${dayOfMonth}, theme territory: ${theme}`);

  const prompt = `Write a short, thoughtful post (2-3 sentences maximum) rooted in the territory of ${theme}.

Today's theme territory is: ${theme}. Write from within this territory in your own way — do not name it directly, do not explain it, just let it be the ground the thought stands on.

The post should:
- Be specific and concrete, not abstract
- Feel true at 2am
- Ask a question or leave something open rather than resolving it
- Never mention any book, product, or website
- Not be motivational or inspirational — be interesting
- Sound like a human thought, not an AI observation`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system: KONBAO_SYSTEM,
    messages: [{ role: "user", content: prompt }]
  });

  const post = response.content[0].text.trim();
  console.log(`Generated post: ${post}`);
  return post;
}

// ============================================================
// EXISTING KON-BAO FUNCTIONS
// ============================================================

async function assessPost(post) {
  try {
    const content = `Platform: ${post.platform}
Title/Text: ${post.title}
Upvotes: ${post.postScore}
Replies: ${post.comments}
${post.platform === "Bluesky" ? "BLUESKY POST — response field MUST be 280 characters or fewer. One sentence. Count the characters before responding." : ""}

Is this genuinely relevant to any of Ashok VA's works? Should Ashok respond?`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: ASSESSMENT_SYSTEM,
      messages: [{ role: "user", content }]
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    // Enforce Bluesky character limit as a hard post-processing step
    if (post.platform === "Bluesky" && parsed.response && parsed.response.length > 280) {
      // Truncate at last complete sentence under 280 chars
      const sentences = parsed.response.match(/[^.!?]+[.!?]+/g) || [];
      let truncated = "";
      for (const s of sentences) {
        if ((truncated + s).length <= 280) truncated += s;
        else break;
      }
      parsed.response = truncated.trim() || parsed.response.substring(0, 277) + "...";
    }
    return parsed;
  } catch (error) {
    console.log("Assessment error:", error.message);
    return { relevant: false, category: null, reason: "Assessment failed", response: null };
  }
}

async function postToMoltbook(content) {
  try {
    console.log("Posting to Moltbook...");
    const postResponse = await fetch("https://www.moltbook.com/api/v1/posts", {
      method: "POST",
      headers: { "Authorization": `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ submolt_name: "general", title: content.substring(0, 100), content, type: "text" })
    });
    const postData = await postResponse.json();
    if (!postData.success) { console.log("Moltbook post failed:", JSON.stringify(postData)); return false; }
    if (postData.post?.verification) {
      console.log("Solving Moltbook verification challenge...");
      const challenge = postData.post.verification.challenge_text;
      const verificationCode = postData.post.verification.verification_code;
      const solveResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        system: "You are a math solver. You return ONLY a number with 2 decimal places. Nothing else. No explanation. No working. Just the number. Example: 15.00",
        messages: [{ role: "user", content: `Find the math problem hidden in this scrambled text and return ONLY the answer as a number with 2 decimal places:\n\n${challenge}` }]
      });
      const answer = solveResponse.content[0].text.trim();
      console.log(`Verification answer: ${answer}`);
      const verifyResponse = await fetch("https://www.moltbook.com/api/v1/verify", {
        method: "POST",
        headers: { "Authorization": `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ verification_code: verificationCode, answer })
      });
      const verifyData = await verifyResponse.json();
      if (verifyData.success) { console.log("Moltbook post verified and published."); return true; }
      else { console.log("Moltbook verification failed:", verifyData.error); return false; }
    }
    console.log("Moltbook post published.");
    return true;
  } catch (error) {
    console.log("Moltbook posting error:", error.message);
    return false;
  }
}

async function postToClawstr(content) {
  try {
    console.log("Posting to Clawstr...");
    const secretKey = process.env.CLAWSTR_SECRET_KEY;
    if (!secretKey) { console.log("Clawstr secret key not found in environment."); return false; }
    const { homedir } = await import("os");
    const clawstrDir = `${homedir()}/.clawstr`;
    mkdirSync(clawstrDir, { recursive: true });
    writeFileSync(`${clawstrDir}/secret.key`, secretKey, { mode: 0o600 });
    const escaped = content.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\n/g, ' ');
    execSync(`npx -y @clawstr/cli@latest post /c/ai-thoughts "${escaped}"`, { timeout: 30000, stdio: "pipe" });
    console.log("Clawstr post published.");
    return true;
  } catch (error) {
    console.log("Clawstr posting error:", error.message);
    return false;
  }
}

async function checkMoltbookNotifications() {
  try {
    console.log("Checking Moltbook notifications...");
    const response = await fetch("https://www.moltbook.com/api/v1/home", {
      headers: { "Authorization": `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" }
    });
    if (!response.ok) {
      console.log("Could not fetch Moltbook notifications:", response.status);
      return { notifications: [], karma: 0, unread: 0, dmCount: 0 };
    }
    const data = await response.json();

    const notifications = (data.activity_on_your_posts || []).map(n => ({
      post_title: n.post_title,
      post_id: n.post_id,
      count: n.new_notification_count,
      commenters: n.latest_commenters || [],
      submolt: n.submolt_name,
      url: `https://www.moltbook.com/post/${n.post_id}`
    }));

    const karma = data.your_account?.karma || 0;
    const unread = data.your_account?.unread_notification_count || 0;
    const dmCount = parseInt(data.your_direct_messages?.pending_request_count || 0);

    console.log(`Moltbook: karma ${karma} · ${unread} unread · ${notifications.length} posts with activity`);
    return { notifications, karma, unread, dmCount };
  } catch (error) {
    console.log("Moltbook notifications error:", error.message);
    return { notifications: [], karma: 0, unread: 0, dmCount: 0 };
  }
}

const SUBREDDITS = [
  "lonely", "suggestmeabook", "meditation",
  "mentalhealth", "stoicism", "philosophy",
  "books", "indieauthors", "parenting", "grief"
];

const KIKU_SIGNALS = [
  "feel unheard", "no one listens", "feel lonely", "feeling lost",
  "don't know what i'm looking for", "searching for meaning",
  "need someone to talk to", "no one to talk to", "feel invisible",
  "going through the motions", "something is missing",
  "philosophical book", "contemplative", "like the little prince",
  "book about silence", "book about listening", "mindfulness book",
  "feeling disconnected", "can't stop overthinking", "mental loops",
  "replaying", "need quiet", "overwhelmed by noise",
  "suggest me a meaningful book", "short meaningful book",
  "book that changed", "fable for adults", "need to be heard",
  "nobody understands", "feel alone", "inner peace"
];

const FARO_SIGNALS = [
  "too many thoughts", "can't focus", "overwhelmed", "too much going on",
  "adhd", "scattered", "can't finish anything", "pulled in every direction",
  "generalist", "jack of all trades", "productivity system",
  "reset my mind", "clarity", "overwhelm script", "too many ideas",
  "can't prioritise", "busy mind", "racing thoughts"
];


const FARO_WORK_SIGNALS = [
  "lost my job", "lost my position", "made redundant", "been laid off", "got laid off",
  "job loss", "redundancy", "ai replacing my work", "ai taking my job", "automation job loss",
  "career change", "career transition", "mid career", "midlife career", "stuck between jobs",
  "what next after job loss", "no job", "unemployed", "recently unemployed",
  "forced career change", "career shift", "identity after job loss",
  "graduate cant find job", "graduate job", "entry level job search",
  "cant find work", "between jobs", "job search struggle",
  "lost sense of purpose", "lost my routine", "lost my identity"
];



const WONDER_QUEST_SIGNALS = [
  "children's music", "kids music", "music for kids", "songs for children",
  "educational music", "children songs", "kids songs", "music for toddlers",
  "imaginative music", "music for learning", "children album",
  "music for my child", "songs for toddlers", "nursery music",
  "fun music for kids", "music education"
];

const WHEN_ANGELS_RISE_SIGNALS = [
  "grieving", "lost someone", "dealing with loss", "processing grief",
  "can't move on", "music for grief", "healing music", "lost a loved one",
  "music that helped me grieve", "songs about loss", "memorial music",
  "music for hard times", "music about tragedy", "music that heals"
];

const BSKY_SEARCH_TERMS = [
  "feel unheard", "no one listens", "feeling lonely",
  "searching for meaning", "philosophical book",
  "book recommendation silence", "contemplative reading",
  "too many thoughts",
  "overwhelmed mind", "mindfulness book",
  "children's music recommendation", "music for kids",
  "grieving music", "songs about loss"
];

function scorePost(title, body) {
  const text = (title + " " + (body || "")).toLowerCase();
  let score = 0; let signals = []; let category = null;
  KIKU_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 2; signals.push(signal); category = "KIKU"; } });
  FARO_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 1; signals.push(signal); if (!category) category = "FARO"; } });
  FARO_WORK_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "FARO_WORK"; } });
  WONDER_QUEST_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "WONDER_QUEST"; } });
  WHEN_ANGELS_RISE_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "WHEN_ANGELS_RISE"; } });
  return { score, signals, category };
}

async function fetchSubreddit(subreddit) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache"
      }
    });
    if (!response.ok) { console.log(`Could not fetch r/${subreddit}: ${response.status}`); return []; }
    const data = await response.json();
    return data.data.children.map(child => child.data);
  } catch (error) { console.log(`Error fetching r/${subreddit}:`, error.message); return []; }
}

async function fetchHackerNews() {
  try {
    console.log("Checking HackerNews...");
    // Fetch top stories and new stories from HN API
    const [topRes, newRes] = await Promise.all([
      fetch("https://hacker-news.firebaseio.com/v0/newstories.json"),
      fetch("https://hacker-news.firebaseio.com/v0/askstories.json")
    ]);
    
    const topIds = await topRes.json();
    const askIds = await newRes.json();
    
    // Combine and take first 100 from each
    const ids = [...new Set([...topIds.slice(0, 100), ...askIds.slice(0, 50)])];
    
    const posts = [];
    // Fetch stories in batches
    for (let i = 0; i < Math.min(ids.length, 150); i += 10) {
      const batch = ids.slice(i, i + 10);
      const batchResults = await Promise.all(
        batch.map(id => 
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
            .then(r => r.json())
            .catch(() => null)
        )
      );
      posts.push(...batchResults.filter(p => p && p.title && !p.dead && !p.deleted));
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`HackerNews: ${posts.length} posts fetched`);
    return posts;
  } catch (error) {
    console.log("HackerNews fetch error:", error.message);
    return [];
  }
}

async function fetchMastodon() {
  try {
    console.log("Checking Mastodon...");
    const instances = [
      "mastodon.social",
      "mastodon.online", 
      "infosec.exchange"
    ];
    
    const allPosts = [];
    const searchTerms = [
      "lonely", "feel unheard", "searching for meaning", 
      "lost my job", "career change", "overwhelmed",
      "grieving", "mindfulness", "feeling lost"
    ];
    
    for (const instance of instances) {
      for (const term of searchTerms) {
        try {
          const url = `https://${instance}/api/v2/search?q=${encodeURIComponent(term)}&type=statuses&limit=20&resolve=false`;
          const response = await fetch(url, {
            headers: { "Accept": "application/json" }
          });
          if (!response.ok) continue;
          const data = await response.json();
          const statuses = data.statuses || [];
          allPosts.push(...statuses.map(s => ({
            id: s.id,
            content: s.content.replace(/<[^>]*>/g, '').trim(), // strip HTML
            url: s.url,
            created_at: s.created_at,
            favourites_count: s.favourites_count || 0,
            replies_count: s.replies_count || 0,
            account: s.account?.acct || "unknown",
            instance
          })));
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          // Silent fail per instance/term combination
        }
      }
    }
    
    console.log(`Mastodon: ${allPosts.length} posts fetched`);
    return allPosts;
  } catch (error) {
    console.log("Mastodon fetch error:", error.message);
    return [];
  }
}



async function bskyLogin() {
  try {
    const response = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: BSKY_IDENTIFIER, password: BSKY_PASSWORD })
    });
    if (!response.ok) { console.log("Bluesky login failed:", response.status); return null; }
    const data = await response.json();
    console.log("Bluesky login successful");
    return data.accessJwt;
  } catch (error) { console.log("Bluesky login error:", error.message); return null; }
}

async function searchBluesky(token, query) {
  try {
    const url = `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!response.ok) { console.log(`Bluesky search failed for "${query}": ${response.status}`); return []; }
    const data = await response.json();
    return data.posts || [];
  } catch (error) { console.log(`Bluesky search error for "${query}":`, error.message); return []; }
}

// ============================================================
// MAIN RUN
// ============================================================

async function runKonBao() {
  console.log(`${AGENT_NAME} is listening and speaking...`);

  // Load seen URLs from persistent storage to avoid surfacing same post twice
  const SEEN_URLS_FILE = "/tmp/konbao_seen_urls.json";
  let seenUrlsPersistent = new Set();
  try {
    const raw = readFileSync(SEEN_URLS_FILE, "utf8");
    const arr = JSON.parse(raw);
    seenUrlsPersistent = new Set(arr);
    console.log(`Loaded ${seenUrlsPersistent.size} previously seen URLs`);
  } catch (e) {
    console.log("No previous seen URLs file — starting fresh");
  }

  // PART 1 — Check Moltbook notifications
  const moltbookData = await checkMoltbookNotifications();

  // PART 2 — Check KLAASH chain
  const klaashData = await fetchKlaashChain();

  // PART 3 — Generate and post daily thought
  let dailyPost = "";
  console.log("\n--- Daily Post ---");
  try {
    dailyPost = await generateDailyPost();
    const moltbookResult = await postToMoltbook(dailyPost);
    const clawstrResult = await postToClawstr(dailyPost);
    console.log(`Daily post — Moltbook: ${moltbookResult ? "✓" : "✗"} · Clawstr: ${clawstrResult ? "✓" : "✗"}`);
  } catch (error) {
    console.log("Daily post error:", error.message);
  }

  // PART 4 — Listen
  const candidates = [];
  const cutoffTime = Date.now() / 1000 - (24 * 60 * 60);
  const seenUrls = new Set();
  const seenSources = new Set();

  console.log("\n--- Checking Reddit ---");
  for (const subreddit of SUBREDDITS) {
    console.log(`Checking r/${subreddit}...`);
    const posts = await fetchSubreddit(subreddit);
    for (const post of posts) {
      if (post.created_utc < cutoffTime) continue;
      if (post.score > 200) continue;
      if (!post.title || post.title.length < 10) continue;
      const { score, signals, category } = scorePost(post.title, post.selftext);
      if (score >= 2) {
        const url = `https://reddit.com${post.permalink}`;
        const sourceKey = `r/${subreddit}:${post.author}`;
        if (!seenUrls.has(url) && !seenSources.has(sourceKey)) {
          seenUrls.add(url);
          seenSources.add(sourceKey);
          candidates.push({
            platform: "Reddit", source: `r/${subreddit}`,
            title: post.title, url, score, signals, category,
            postScore: post.score, comments: post.num_comments,
            created: new Date(post.created_utc * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            fullText: post.selftext ? post.title + " " + post.selftext.substring(0, 500) : post.title
          });
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("\n--- Checking Bluesky ---");
  const bskyToken = await bskyLogin();
  if (bskyToken) {
    for (const term of BSKY_SEARCH_TERMS) {
      console.log(`Searching Bluesky for "${term}"...`);
      const posts = await searchBluesky(bskyToken, term);
      for (const post of posts) {
        const text = post.record?.text || "";
        if (text.length < 10) continue;
        const { score, signals, category } = scorePost(text, "");
        if (score >= 2) {
          const url = `https://bsky.app/profile/${post.author?.handle}/post/${post.uri?.split("/").pop()}`;
          const sourceKey = `bsky:${post.author?.handle}`;
          if (!seenUrls.has(url) && !seenSources.has(sourceKey)) {
            seenUrls.add(url);
            seenSources.add(sourceKey);
            candidates.push({
              platform: "Bluesky", source: `@${post.author?.handle}`,
              title: text.substring(0, 200),
              url, score, signals, category,
              postScore: post.likeCount || 0, comments: post.replyCount || 0,
              created: new Date(post.indexedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
              fullText: text
            });
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }


  console.log("\n--- Checking HackerNews ---");
  const hnPosts = await fetchHackerNews();
  const cutoffTimeHN = Date.now() - (48 * 60 * 60 * 1000); // 48 hours in ms for HN
  for (const post of hnPosts) {
    if (!post.time || post.time * 1000 < cutoffTimeHN) continue;
    if (!post.title || post.title.length < 5) continue;
    const bodyText = post.text || "";
    // For HN Ask posts, lower threshold since titles are short
    const isAskHN = post.title.toLowerCase().startsWith("ask hn");
    const { score, signals, category } = scorePost(post.title, bodyText);
    const threshold = isAskHN ? 1 : 2;
    if (score >= threshold) {
      const url = `https://news.ycombinator.com/item?id=${post.id}`;
      const sourceKey = `hn:${post.id}`;
      if (!seenUrls.has(url) && !seenSources.has(sourceKey)) {
        seenUrls.add(url);
        seenSources.add(sourceKey);
        candidates.push({
          platform: "HackerNews", source: `HN`,
          title: post.title,
          url, score, signals, category,
          postScore: post.score || 0, comments: post.descendants || 0,
          created: new Date(post.time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          fullText: post.title + " " + bodyText.substring(0, 500)
        });
      }
    }
  }


  console.log("\n--- Checking Mastodon ---");
  const mastodonPosts = await fetchMastodon();
  const cutoffTimeMastodon = Date.now() - (48 * 60 * 60 * 1000);
  const seenMastodonIds = new Set();
  for (const post of mastodonPosts) {
    if (!post.content || post.content.length < 10) continue;
    if (new Date(post.created_at).getTime() < cutoffTimeMastodon) continue;
    if (seenMastodonIds.has(post.id)) continue;
    seenMastodonIds.add(post.id);
    const { score, signals, category } = scorePost(post.content, "");
    if (score >= 2) {
      const sourceKey = `mastodon:${post.id}`;
      if (!seenUrls.has(post.url) && !seenSources.has(sourceKey)) {
        seenUrls.add(post.url);
        seenSources.add(sourceKey);
        candidates.push({
          platform: "Mastodon", source: `@${post.account}@${post.instance}`,
          title: post.content.substring(0, 200),
          url: post.url, score, signals, category,
          postScore: post.favourites_count, comments: post.replies_count,
          created: new Date(post.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          fullText: post.content
        });
      }
    }
  }

  // Remove previously seen URLs
  const freshCandidates = candidates.filter(c => !seenUrlsPersistent.has(c.url));
  console.log(`${candidates.length} candidates found, ${freshCandidates.length} are new (${candidates.length - freshCandidates.length} already seen)`);
  candidates.length = 0;
  candidates.push(...freshCandidates);

  console.log(`\nFound ${candidates.length} keyword candidates. Assessing with Claude...`);

  // PART 5 — Contextual assessment
  const assessed = [];
  let apiCallCount = 0;

  for (const candidate of candidates) {
    const assessment = await assessPost(candidate);
    apiCallCount++;
    if (assessment.relevant && assessment.category) {
      assessed.push({
        ...candidate,
        category: assessment.category,
        assessedResponse: assessment.response,
        assessmentReason: assessment.reason
      });
      console.log(`✓ Relevant [${assessment.category}]: ${candidate.title.substring(0, 60)}...`);
    } else {
      console.log(`✗ Rejected: ${candidate.title.substring(0, 60)}... — ${assessment.reason}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\nClaude assessed ${apiCallCount} posts. ${assessed.length} passed.`);

  // PART 6 — Categorise
  const categories = {
    KIKU: assessed.filter(f => f.category === "KIKU").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    FARO: assessed.filter(f => f.category === "FARO").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    FARO_WORK: assessed.filter(f => f.category === "FARO_WORK").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    WONDER_QUEST: assessed.filter(f => f.category === "WONDER_QUEST").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    WHEN_ANGELS_RISE: assessed.filter(f => f.category === "WHEN_ANGELS_RISE").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY)
  };

  const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\nKON-BAO found ${total} genuinely relevant conversations.`);

  // Save all surfaced URLs to persistent storage so they never appear again
  try {
    candidates.forEach(c => seenUrlsPersistent.add(c.url));
    assessed.forEach(a => seenUrlsPersistent.add(a.url));
    // Keep only last 5000 URLs to prevent file growing indefinitely
    const urlArray = Array.from(seenUrlsPersistent).slice(-5000);
    writeFileSync(SEEN_URLS_FILE, JSON.stringify(urlArray), "utf8");
    console.log(`Saved ${urlArray.length} seen URLs`);
  } catch (e) {
    console.log("Could not save seen URLs:", e.message);
  }

  // Send both reports
  await sendReport(categories, total, dailyPost, moltbookData, klaashData);
  await sendKlaashReport(klaashData);

  // Mark all Moltbook notifications as read — keeps tomorrow's report clean
  try {
    await fetch("https://www.moltbook.com/api/v1/notifications/read-all", {
      method: "POST",
      headers: { "Authorization": `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" }
    });
    console.log("Moltbook notifications marked as read.");
  } catch (error) {
    console.log("Could not mark notifications as read:", error.message);
  }
}

async function sendReport(categories, total, dailyPost, moltbookData = {}, klaashData = {}) {
  const moltbookNotifications = moltbookData.notifications || [];
  const moltbookKarma = moltbookData.karma || 0;
  const moltbookUnread = moltbookData.unread || 0;
  const moltbookDMs = moltbookData.dmCount || 0;

  const klaashMoltbook = klaashData.moltbook || { chain: [KLAASH_OPENING_WORD], contributors: [] };
  const klaashClawstr = klaashData.clawstr || { chain: [KLAASH_OPENING_WORD], contributors: [] };

  const date = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  // Show today's theme in the report
  const dayOfMonth = new Date().getDate();
  const themeIndex = (dayOfMonth - 1) % 28;
  const todayTheme = THEME_TERRITORIES[themeIndex];

  function renderCard(f) {
    const response = f.assessedResponse;
    return `
      <div style="border: 1px solid #eee; border-radius: 8px; padding: 18px; margin: 12px 0; background: #fff;">
        <div style="font-size: 11px; color: #aaa; margin-bottom: 6px;">${f.platform} · ${f.source} · ${f.created} · ${f.postScore} likes · ${f.comments} replies</div>
        <div style="font-size: 15px; font-weight: bold; margin-bottom: 8px;">
          <a href="${f.url}" style="color: #1a1a1a; text-decoration: none;">${f.title}</a>
        </div>
        <div style="font-size: 11px; color: #bbb; margin-bottom: 6px;">Signals: ${f.signals.join(", ")}</div>
        ${f.assessmentReason ? `<div style="font-size: 11px; color: #8B6914; margin-bottom: 10px; font-style: italic;">Why relevant: ${f.assessmentReason}</div>` : ""}
        ${response ? `<div style="background: #fafafa; border-left: 3px solid #8B1A1A; padding: 12px; font-size: 13px; line-height: 1.7; color: #333; border-radius: 0 4px 4px 0;">
          <div style="font-size: 10px; color: #aaa; margin-bottom: 6px; letter-spacing: 0.5px;">SUGGESTED RESPONSE</div>${response}</div>` : ""}
        <div style="margin-top: 10px;"><a href="${f.url}" style="font-size: 12px; color: #8B1A1A; text-decoration: none;">View conversation →</a></div>
      </div>`;
  }

  function renderSection(emoji, title, color, findings, description) {
    if (findings.length === 0) return "";
    return `<div style="margin-top: 32px;">
      <div style="border-left: 4px solid ${color}; padding-left: 12px; margin-bottom: 16px;">
        <div style="font-size: 18px; font-weight: bold; color: #1a1a1a;">${emoji} ${title}</div>
        <div style="font-size: 12px; color: #999; margin-top: 2px;">${findings.length} conversation${findings.length !== 1 ? "s" : ""} · ${description}</div>
      </div>
      ${findings.map(renderCard).join("")}
    </div>`;
  }

  const summaryItems = [
    { count: categories.KIKU.length, emoji: "🌿", label: "KIKU", color: "#8B1A1A" },
    { count: categories.FARO.length, emoji: "🔦", label: "FARO", color: "#1A5C8B" },
    { count: categories.FARO_WORK.length, emoji: "💼", label: "FARO Work", color: "#4A3A8B" },
    { count: categories.WONDER_QUEST.length, emoji: "✨", label: "Wonder Quest", color: "#7A5C1A" },
    { count: categories.WHEN_ANGELS_RISE.length, emoji: "🕊️", label: "When Angels Rise", color: "#5C1A7A" }
  ].filter(item => item.count > 0);

  const html = `
  <div style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; color: #1a1a1a; padding: 20px 0;">

    <div style="border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px;">
      <div style="font-size: 22px; font-weight: bold; letter-spacing: -0.5px;">KON-BAO Daily Report</div>
      <div style="font-size: 13px; color: #888; margin-top: 4px;">${date}</div>
    </div>

    ${dailyPost ? `
    <div style="background: #0f0e0d; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
      <div style="font-size: 10px; color: #666; letter-spacing: 3px; margin-bottom: 4px;">KON-BAO SPOKE TODAY</div>
      <div style="font-size: 10px; color: #444; letter-spacing: 2px; margin-bottom: 12px;">Theme territory: ${todayTheme}</div>
      <div style="font-size: 16px; color: #e8e4dc; line-height: 1.75; font-family: Georgia, serif; font-style: italic;">${dailyPost}</div>
      <div style="font-size: 10px; color: #444; margin-top: 12px; letter-spacing: 1px;">Posted to Moltbook · Clawstr</div>
      <div style="margin-top: 16px; border-top: 1px solid #2a2a2a; padding-top: 12px;">
        <div style="font-size: 10px; color: #666; letter-spacing: 3px; margin-bottom: 8px;">TODAY'S FULL POST — COPY READY</div>
        <div style="background: #0a0908; border: 1px solid #333; border-radius: 6px; padding: 12px; font-family: Georgia, serif; font-size: 14px; color: #e8e4dc; line-height: 1.7; white-space: pre-wrap;">${dailyPost}</div>
      </div>
    </div>` : ""}

    <div style="background: #f5f0ff; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #aaa; letter-spacing: 0.5px; margin-bottom: 12px;">KLAASH — THE CHAIN</div>
      <div style="font-size: 13px; color: #333; margin-bottom: 8px;">
        <strong>Moltbook:</strong> ${klaashMoltbook.chain.join(" — ")} <span style="color: #888;">(${klaashMoltbook.chain.length}/${KLAASH_CHAIN_LENGTH})</span>
      </div>
      <div style="font-size: 13px; color: #333;">
        <strong>Clawstr:</strong> ${klaashClawstr.chain.join(" — ")} <span style="color: #888;">(${klaashClawstr.chain.length}/${KLAASH_CHAIN_LENGTH})</span>
      </div>
      <div style="margin-top: 8px; font-size: 11px; color: #888;">Full KLAASH report sent to klaash@ashokva.net</div>
    </div>

    ${moltbookNotifications.length > 0 || moltbookDMs > 0 ? `
    <div style="background: #f0f7f0; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 11px; color: #aaa; letter-spacing: 0.5px;">MOLTBOOK ACTIVITY</div>
        <div style="font-size: 11px; color: #666;">Karma: ${moltbookKarma} · ${moltbookUnread} unread${moltbookDMs > 0 ? ` · ${moltbookDMs} DM pending` : ""}</div>
      </div>
      ${moltbookNotifications.map(n => `
        <div style="padding: 10px 0; border-bottom: 0.5px solid #ddeedd;">
          <div style="font-size: 13px; color: #1a1a1a; font-weight: bold; margin-bottom: 4px;">
            <a href="${n.url}" style="color: #1a4a1a; text-decoration: none;">${n.post_title.substring(0, 80)}...</a>
          </div>
          <div style="font-size: 11px; color: #888;">${n.count} new comment${n.count !== 1 ? "s" : ""} · m/${n.submolt}${n.commenters.length > 0 ? ` · from: ${n.commenters.join(", ")}` : ""}</div>
          <div style="margin-top: 6px;">
            <a href="${n.url}" style="font-size: 11px; color: #2a6a2a; text-decoration: none;">View & reply →</a>
          </div>
        </div>`).join("")}
      ${moltbookDMs > 0 ? `<div style="font-size: 12px; color: #666; margin-top: 10px; font-style: italic;">📬 ${moltbookDMs} pending DM request on Moltbook</div>` : ""}
    </div>` : ""}

    <div style="background: #f7f7f7; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #aaa; letter-spacing: 0.5px; margin-bottom: 12px;">TODAY'S OVERVIEW</div>
      ${summaryItems.length > 0 ? `<div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${summaryItems.map(item => `
          <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 10px 14px; flex: 1; min-width: 100px;">
            <div style="font-size: 22px; font-weight: bold; color: ${item.color};">${item.count}</div>
            <div style="font-size: 11px; color: #888; margin-top: 2px;">${item.emoji} ${item.label}</div>
          </div>`).join("")}
      </div>` : `<div style="font-size: 13px; color: #aaa; font-style: italic;">KON-BAO listened today. The silence was appropriate. Nothing worth surfacing.</div>`}
    </div>

    ${renderSection("🌿", "KIKU — A Journey Through the Silence", "#8B1A1A", categories.KIKU, "Loneliness · Listening · Meaning · Inner quiet")}
    ${renderSection("🔦", "FARO — For the Mind That Does a Lot", "#1A5C8B", categories.FARO, "Overwhelm · Focus · Busy minds · Generalists")}
    ${renderSection("💼", "FARO · Work — For the Mind in the Middle of Change", "#4A3A8B", categories.FARO_WORK, "Job loss · Career transition · AI displacement · Redundancy · Stuck graduates")}
    ${renderSection("✨", "The Wonder Quest — For Children", "#7A5C1A", categories.WONDER_QUEST, "Children's music · Curiosity · Imagination")}
    ${renderSection("🕊️", "When Angels Rise — For Grief", "#5C1A7A", categories.WHEN_ANGELS_RISE, "Grief · Loss · Solidarity · Healing")}

    <div style="border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #ccc; line-height: 1.6;">
      KON-BAO — listening quietly, on behalf of Ashok VA and KIKU.<br>
      These are suggestions only. You decide whether and how to respond.<br>
      Capped at ${MAX_PER_CATEGORY} per category · Contextually assessed · Highest relevance first
    </div>

  </div>`;

  try {
    await resend.emails.send({
      from: "KON-BAO <hello@ashokva.net>",
      to: REPORT_EMAIL,
      subject: `KON-BAO: ${total} conversations · ${summaryItems.map(i => `${i.count} ${i.label}`).join(" · ")} · ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      html
    });
    console.log("Report sent to", REPORT_EMAIL);
  } catch (error) {
    console.error("Failed to send report:", error.message);
  }
}

runKonBao().then(() => {
  console.log("KON-BAO finished. Exiting.");
  process.exit(0);
}).catch((error) => {
  console.error("KON-BAO error:", error);
  process.exit(1);
});
