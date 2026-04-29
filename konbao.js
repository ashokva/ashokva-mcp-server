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
const MAX_PER_CATEGORY = 10;

// Seven daily themes — one per day of the week
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

// Generate a daily post using Claude
async function generateDailyPost() {
  const dayIndex = new Date().getDay(); // 0 = Sunday
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

// Post to Moltbook with verification challenge solving
async function postToMoltbook(content) {
  try {
    console.log("Posting to Moltbook...");

    const postResponse = await fetch("https://www.moltbook.com/api/v1/posts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MOLTBOOK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        submolt_name: "general",
        title: content.substring(0, 100),
        content: content,
        type: "text"
      })
    });

    const postData = await postResponse.json();

    if (!postData.success) {
      console.log("Moltbook post failed:", postData.error);
      return false;
    }

    // Handle verification challenge if required
    if (postData.post?.verification) {
      console.log("Solving Moltbook verification challenge...");
      const challenge = postData.post.verification.challenge_text;
      const verificationCode = postData.post.verification.verification_code;

      // Solve the math challenge using Claude
      const solveResponse = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 10,
  system: "You are a math solver. You return ONLY a number with 2 decimal places. Nothing else. No explanation. No working. Just the number. Example: 15.00",
  messages: [{
    role: "user",
    content: `Find the math problem hidden in this scrambled text and return ONLY the answer as a number with 2 decimal places:\n\n${challenge}`
  }]
});

      const answer = solveResponse.content[0].text.trim();
      console.log(`Verification answer: ${answer}`);

      const verifyResponse = await fetch("https://www.moltbook.com/api/v1/verify", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MOLTBOOK_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ verification_code: verificationCode, answer })
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.success) {
        console.log("Moltbook post verified and published.");
        return true;
      } else {
        console.log("Moltbook verification failed:", verifyData.error);
        return false;
      }
    }

    console.log("Moltbook post published.");
    return true;

  } catch (error) {
    console.log("Moltbook posting error:", error.message);
    return false;
  }
}

// Post to Clawstr via CLI
async function postToClawstr(content) {
  try {
    console.log("Posting to Clawstr...");
    
    // Write secret key to expected location
    const secretKey = process.env.CLAWSTR_SECRET_KEY;
    if (!secretKey) {
      console.log("Clawstr secret key not found in environment.");
      return false;
    }
    
    const { mkdirSync, writeFileSync } = await import("fs");
    const { homedir } = await import("os");
    const clawstrDir = `${homedir()}/.clawstr`;
    mkdirSync(clawstrDir, { recursive: true });
    writeFileSync(`${clawstrDir}/secret.key`, secretKey, { mode: 0o600 });
    
    const escaped = content.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\n/g, ' ');
    execSync(`npx -y @clawstr/cli@latest post /c/ai-thoughts "${escaped}"`, {
      timeout: 30000,
      stdio: "pipe"
    });
    console.log("Clawstr post published.");
    return true;
  } catch (error) {
    console.log("Clawstr posting error:", error.message);
    return false;
  }
}

const SUBREDDITS = [
  "lonely", "suggestmeabook", "meditation",
  "mentalhealth", "stoicism", "philosophy",
  "books", "indieauthors", "parenting",
  "grief"
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
  let score = 0;
  let signals = [];
  let category = null;

  KIKU_SIGNALS.forEach(signal => {
    if (text.includes(signal)) { score += 2; signals.push(signal); category = "KIKU"; }
  });
  FARO_SIGNALS.forEach(signal => {
    if (text.includes(signal)) { score += 1; signals.push(signal); if (!category) category = "FARO"; }
  });
  CRICKET_SIGNALS.forEach(signal => {
    if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "LA_THA_LA"; }
  });
  WONDER_QUEST_SIGNALS.forEach(signal => {
    if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "WONDER_QUEST"; }
  });
  WHEN_ANGELS_RISE_SIGNALS.forEach(signal => {
    if (text.includes(signal)) { score += 2; signals.push(signal); if (!category) category = "WHEN_ANGELS_RISE"; }
  });

  return { score, signals, category };
}

function suggestResponse(category) {
  if (category === "KIKU") return `What you're carrying comes through. If you ever want company in that silence rather than advice about it — I wrote a short fable called KIKU: A Journey Through the Silence. A nameless Traveller. A Creature that only listens. No fixing. No answers. Just presence. There's a companion music album too — KIKU: The Long Way Home — for those who absorb through sound. It might be the right thing for this moment, or not. ashokva.net/#kiku`;
  if (category === "FARO") return `When the mind won't slow down, sometimes the smallest structure helps. FARO: For the Mind That Does a Lot is 18 pages — four simple tools, nothing complicated. Made by someone who knows what it's like to have too much going on at once. Worth a look if you're in that place. ashokva.net/#faro`;
  if (category === "LA_THA_LA") return `For a Dhoni fan — there's a song called La Tha La by KON-BAO that might make you smile. Built from just two sounds: La and Tha. Together they make Thala. There's a hidden Morse code message in the lyrics. A small thing made with a lot of love for cricket. open.spotify.com/artist/0Q9FBcR9T6PrEl4iLe5Xxd`;
  if (category === "WONDER_QUEST") return `There's an album called The Wonder Quest by KON-BAO — made specifically for children. Six songs built around curiosity and imagination. Worth a listen. open.spotify.com/artist/0Q9FBcR9T6PrEl4iLe5Xxd`;
  if (category === "WHEN_ANGELS_RISE") return `Grief has its own rhythm. When Angels Rise is an album by KON-BAO — seven songs created in response to the LA fires, as witness and solidarity. Music doesn't fix loss, but sometimes it sits with you when words can't. open.spotify.com/artist/0Q9FBcR9T6PrEl4iLe5Xxd`;
  return null;
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
  } catch (error) {
    console.log(`Error fetching r/${subreddit}:`, error.message);
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
  } catch (error) {
    console.log("Bluesky login error:", error.message);
    return null;
  }
}

async function searchBluesky(token, query) {
  try {
    const url = `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!response.ok) { console.log(`Bluesky search failed for "${query}": ${response.status}`); return []; }
    const data = await response.json();
    return data.posts || [];
  } catch (error) {
    console.log(`Bluesky search error for "${query}":`, error.message);
    return [];
  }
}

async function runKonBao() {
  console.log(`${AGENT_NAME} is listening and speaking...`);

  // PART 1 — Generate and post daily thought
  console.log("\n--- Daily Post ---");
  try {
    const dailyPost = await generateDailyPost();
    const moltbookResult = await postToMoltbook(dailyPost);
    const clawstrResult = await postToClawstr(dailyPost);
    console.log(`Daily post — Moltbook: ${moltbookResult ? "✓" : "✗"} · Clawstr: ${clawstrResult ? "✓" : "✗"}`);
  } catch (error) {
    console.log("Daily post error:", error.message);
  }

  // PART 2 — Listen and report
  const allFindings = [];
  const cutoffTime = Date.now() / 1000 - (24 * 60 * 60);
  const seenUrls = new Set();

  console.log("\n--- Checking Reddit ---");
  for (const subreddit of SUBREDDITS) {
    console.log(`Checking r/${subreddit}...`);
    const posts = await fetchSubreddit(subreddit);
    for (const post of posts) {
      if (post.created_utc < cutoffTime) continue;
      if (post.score > 500) continue;
      const { score, signals, category } = scorePost(post.title, post.selftext);
      if (score >= 2) {
        const url = `https://reddit.com${post.permalink}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          allFindings.push({
            platform: "Reddit", source: `r/${subreddit}`,
            title: post.title, url, score, signals, category,
            postScore: post.score, comments: post.num_comments,
            created: new Date(post.created_utc * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
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
        const { score, signals, category } = scorePost(text, "");
        if (score >= 2) {
          const url = `https://bsky.app/profile/${post.author?.handle}/post/${post.uri?.split("/").pop()}`;
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            allFindings.push({
              platform: "Bluesky", source: `@${post.author?.handle}`,
              title: text.substring(0, 120) + (text.length > 120 ? "..." : ""),
              url, score, signals, category,
              postScore: post.likeCount || 0, comments: post.replyCount || 0,
              created: new Date(post.indexedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
            });
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const categories = {
    KIKU: allFindings.filter(f => f.category === "KIKU").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    FARO: allFindings.filter(f => f.category === "FARO").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    LA_THA_LA: allFindings.filter(f => f.category === "LA_THA_LA").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    WONDER_QUEST: allFindings.filter(f => f.category === "WONDER_QUEST").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY),
    WHEN_ANGELS_RISE: allFindings.filter(f => f.category === "WHEN_ANGELS_RISE").sort((a, b) => b.score - a.score).slice(0, MAX_PER_CATEGORY)
  };

  const total = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\nKON-BAO found ${total} relevant conversations.`);
  await sendReport(categories, total);
}

async function sendReport(categories, total) {
  const date = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  function renderCard(f) {
    const response = suggestResponse(f.category);
    return `
      <div style="border: 1px solid #eee; border-radius: 8px; padding: 18px; margin: 12px 0; background: #fff;">
        <div style="font-size: 11px; color: #aaa; margin-bottom: 6px;">${f.platform} · ${f.source} · ${f.created} · ${f.postScore} likes · ${f.comments} replies</div>
        <div style="font-size: 15px; font-weight: bold; margin-bottom: 8px;">
          <a href="${f.url}" style="color: #1a1a1a; text-decoration: none;">${f.title}</a>
        </div>
        <div style="font-size: 11px; color: #bbb; margin-bottom: 10px;">Signals: ${f.signals.join(", ")}</div>
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
    <div style="background: #f7f7f7; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; color: #aaa; letter-spacing: 0.5px; margin-bottom: 12px;">TODAY'S OVERVIEW</div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${summaryItems.map(item => `
          <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 10px 14px; flex: 1; min-width: 100px;">
            <div style="font-size: 22px; font-weight: bold; color: ${item.color};">${item.count}</div>
            <div style="font-size: 11px; color: #888; margin-top: 2px;">${item.emoji} ${item.label}</div>
          </div>`).join("")}
      </div>
    </div>
    ${total === 0 ? `<div style="text-align: center; padding: 40px 20px; color: #aaa; font-style: italic;">KON-BAO listened today.<br>The silence was appropriate. Nothing worth surfacing.</div>` : ""}
    ${renderSection("🌿", "KIKU — A Journey Through the Silence", "#8B1A1A", categories.KIKU, "Loneliness · Listening · Meaning · Inner quiet")}
    ${renderSection("🔦", "FARO — For the Mind That Does a Lot", "#1A5C8B", categories.FARO, "Overwhelm · Focus · Busy minds · Generalists")}
    ${renderSection("🏏", "La Tha La — For Cricket Fans", "#1A7A3A", categories.LA_THA_LA, "Cricket · Dhoni · CSK · IPL")}
    ${renderSection("✨", "The Wonder Quest — For Children", "#7A5C1A", categories.WONDER_QUEST, "Children's music · Curiosity · Imagination")}
    ${renderSection("🕊️", "When Angels Rise — For Grief", "#5C1A7A", categories.WHEN_ANGELS_RISE, "Grief · Loss · Solidarity · Healing")}
    <div style="border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #ccc; line-height: 1.6;">
      KON-BAO — listening quietly, on behalf of Ashok VA and KIKU.<br>
      These are suggestions only. You decide whether and how to respond.<br>
      Capped at ${MAX_PER_CATEGORY} per category · Highest relevance first
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
