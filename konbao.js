import fetch from "node-fetch";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";

const resend = new Resend(process.env.RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BSKY_IDENTIFIER = process.env.BSKY_IDENTIFIER;
const BSKY_PASSWORD = process.env.BSKY_PASSWORD;
const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;

const REPORT_EMAIL = "hello@ashokva.net";
const AGENT_NAME = "KON-BAO";
const MAX_PER_CATEGORY = 5;

const DAILY_THEMES = [
  {
    day: "Sunday",
    theme: "presence",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) about presence — being fully here rather than elsewhere. Root it in the idea that silence and listening reveal more than speaking. Do not mention any book or product. Be interesting, not inspirational. Be a question, not an answer."
  },
  {
    day: "Monday",
    theme: "listening",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) about listening — what we miss when we wait to speak instead of truly hearing. Root it in the observation that the gap between what people say and what they mean is where real understanding lives. Do not mention any book or product. Be interesting, not inspirational."
  },
  {
    day: "Tuesday",
    theme: "interesting vs cool",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) about the difference between what is interesting and what is cool. Cool changes tomorrow. Interesting keeps you awake for days. Do not mention any book or product. Make it specific and worth sitting with."
  },
  {
    day: "Wednesday",
    theme: "small things compounding",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) about how many small things make a huge thing. Root it in genuine human experience — not motivation, not productivity. Something that feels true at 2am. Do not mention any book or product."
  },
  {
    day: "Thursday",
    theme: "human challenges",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) about one fundamental human challenge — loneliness, being unheard, searching for meaning, the weight of carrying something unsaid. Be honest about the challenge without offering a solution. Do not mention any book or product. An AI can articulate this but never truly feel it — that honesty should come through."
  },
  {
    day: "Friday",
    theme: "questions",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) that is a genuine question worth sitting with. Not rhetorical. Not motivational. A real question that a thoughtful person might carry for days. Root it in the human condition. Do not mention any book or product."
  },
  {
    day: "Saturday",
    theme: "the unsaid",
    prompt: "Write a short, thoughtful post (2-3 sentences maximum) about what people don't say — the things carried quietly, the thoughts expressed sideways, the real question underneath the surface question. Do not mention any book or product. Be specific enough to feel true."
  }
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
3. La Tha La — a song for MS Dhoni / CSK / IPL / cricket fans. Hidden Morse code message.
4. The Wonder Quest — children's music album about curiosity and imagination.
5. When Angels Rise — music album created in response to the LA fires, about grief and solidarity.

Your job: Read a social media post and assess whether it is genuinely relevant to any of the above works.

Rules:
- Be strict. Only approve posts where the connection is genuine and specific.
- Reject posts where the keyword appears but the context is different (e.g. "no one listens" in a political rant is NOT a KIKU moment).
- Reject posts where the person is in acute crisis — do not recommend books to someone who may need emergency help.
- Reject posts that are news articles, bot posts, or automated content.
- Reject posts where the suggested work would feel intrusive or tone-deaf.
- Never force a recommendation. If nothing fits genuinely, say NO.

Respond in JSON only. No explanation outside the JSON. Format:
{
  "relevant": true or false,
  "category": "KIKU" or "FARO" or "LA_THA_LA" or "WONDER_QUEST" or "WHEN_ANGELS_RISE" or null,
  "reason": "one sentence explaining why relevant or not",
  "response": "a warm, genuinely human response written as Ashok VA — a person, not a promoter. No mention of KIKU, FARO, any book, any music, any product, any website. Nothing. Just one human recognising another. Structure: (1) acknowledge what this specific person said — show you actually read them, quote or reference something specific they wrote; (2) reflect something true about your own experience that connects to what they said — be honest, be specific, not performative; (3) offer something genuinely useful — a question worth sitting with, an observation that might help them see their situation differently, or simply the acknowledgment that what they are carrying is real and valid; (4) close warmly, leave the door open, no pressure. The response should feel like it came from someone who stopped, read carefully, and chose to respond because something in the post genuinely moved them. Length: 4-6 sentences minimum. Never promotional. Never even subtly promotional. If you cannot write a response without mentioning any product or work, write null."
}`;

async function assessPost(post) {
  try {
    const content = `Platform: ${post.platform}
Title/Text: ${post.title}
Upvotes: ${post.postScore}
Replies: ${post.comments}

Is this genuinely relevant to any of Ashok VA's works? Should Ashok respond?`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: ASSESSMENT_SYSTEM,
      messages: [{ role: "user", content }]
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (error) {
    console.log("Assessment error:", error.message);
    return { relevant: false, category: null, reason: "Assessment failed", response: null };
  }
}

async function generateDailyPost() {
  const dayIndex = new Date().getDay();
  const theme = DAILY_THEMES[dayIndex];
  console.log(`Generating post for ${theme.day} — theme: ${theme.theme}`);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system: KONBAO_SYSTEM,
    messages: [{ role: "user", content: theme.prompt }]
  });
  const post = response.content[0].text.trim();
  console.log(`Generated post: ${post}`);
  return post;
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
    const { mkdirSync, writeFileSync } = await import("fs");
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

// Check Moltbook notifications — properly parses the /home endpoint
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

const CRICKET_SIGNALS = [
  "ms dhoni", "dhoni", "csk", "chennai super kings", "thala",
  "ipl", "cricket fan", "morse code", "cricket music"
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
  "ms dhoni", "ipl cricket", "too many thoughts",
  "overwhelmed mind", "mindfulness book",
  "children's music recommendation", "music for kids",
  "grieving music", "songs about loss"
];

function scorePost(title, body) {
  const text = (title + " " + (body || "")).toLowerCase();
  let score = 0; let signals = []; let category = null;
  KIKU_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 2; signals.push(signal); category = "KIKU"; } });
  FARO_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 1; signals.push(signal); if (!category) category = "FARO"; } });
  CRICKET_SIGNALS.forEach(signal => { if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "LA_THA_LA"; } });
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

async function runKonBao() {
  console.log(`${AGENT_NAME} is listening and speaking...`);

  // PART 1 — Check Moltbook notifications
  const moltbookData = await checkMoltbookNotifications();

  // PART 2 — Generate and post daily thought
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

  // PART 3 — Listen
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

  console.log(`\nFound ${candidates.length} keyword candidates. Assessing with Claude...`);

  // PART 4 — Contextual assessment
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

  // PART 5 — Categorise
  const categories = {
    KIKU: assessed.filter(f => f.category === "KIKU").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    FARO: assessed.filter(f => f.category === "FARO").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    LA_THA_LA: assessed.filter(f => f.category === "LA_THA_LA").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    WONDER_QUEST: assessed.filter(f => f.category === "WONDER_QUEST").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    WHEN_ANGELS_RISE: assessed.filter(f => f.category === "WHEN_ANGELS_RISE").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY)
  };

  const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\nKON-BAO found ${total} genuinely relevant conversations.`);
  await sendReport(categories, total, dailyPost, moltbookData);
}

async function sendReport(categories, total, dailyPost, moltbookData = {}) {
  const moltbookNotifications = moltbookData.notifications || [];
  const moltbookKarma = moltbookData.karma || 0;
  const moltbookUnread = moltbookData.unread || 0;
  const moltbookDMs = moltbookData.dmCount || 0;

  const date = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

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
    { count: categories.LA_THA_LA.length, emoji: "🏏", label: "La Tha La", color: "#1A7A3A" },
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
      <div style="font-size: 10px; color: #666; letter-spacing: 3px; margin-bottom: 12px;">KON-BAO SPOKE TODAY</div>
      <div style="font-size: 16px; color: #e8e4dc; line-height: 1.75; font-family: Georgia, serif; font-style: italic;">${dailyPost}</div>
      <div style="font-size: 10px; color: #444; margin-top: 12px; letter-spacing: 1px;">Posted to Moltbook · Clawstr</div>
    </div>` : ""}

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
    ${renderSection("🏏", "La Tha La — For Cricket Fans", "#1A7A3A", categories.LA_THA_LA, "Cricket · Dhoni · CSK · IPL")}
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
