import fetch from "node-fetch";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const BSKY_IDENTIFIER = process.env.BSKY_IDENTIFIER;
const BSKY_PASSWORD = process.env.BSKY_PASSWORD;

const REPORT_EMAIL = "konbao369@gmail.com";
const AGENT_NAME = "KON-BAO";

const SUBREDDITS = [
  "lonely", "suggestmeabook", "meditation",
  "mentalhealth", "stoicism", "philosophy",
  "books", "indieauthors"
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
  "book that changed", "fable for adults"
];

const FARO_SIGNALS = [
  "too many thoughts", "can't focus", "overwhelmed", "too much going on",
  "adhd", "scattered", "can't finish anything", "pulled in every direction",
  "generalist", "jack of all trades", "productivity system",
  "reset my mind", "clarity", "overwhelm script"
];

const CRICKET_SIGNALS = [
  "ms dhoni", "dhoni", "csk", "chennai super kings", "thala",
  "ipl", "cricket fan", "morse code", "cricket music"
];

const BSKY_SEARCH_TERMS = [
  "feel unheard", "no one listens", "feeling lonely",
  "searching for meaning", "philosophical book",
  "book recommendation silence", "contemplative reading",
  "ms dhoni", "ipl cricket", "too many thoughts",
  "overwhelmed mind", "mindfulness book"
];

function scorePost(title, body) {
  const text = (title + " " + (body || "")).toLowerCase();
  let score = 0;
  let signals = [];
  let category = null;

  KIKU_SIGNALS.forEach(signal => {
    if (text.includes(signal)) {
      score += 2;
      signals.push(signal);
      category = "KIKU";
    }
  });

  FARO_SIGNALS.forEach(signal => {
    if (text.includes(signal)) {
      score += 1;
      signals.push(signal);
      if (!category) category = "FARO";
    }
  });

  CRICKET_SIGNALS.forEach(signal => {
    if (text.includes(signal)) {
      score += 2;
      signals.push(signal);
      if (!category) category = "LA_THA_LA";
    }
  });

  return { score, signals, category };
}

function suggestResponse(post, category) {
  if (category === "KIKU") {
    return `I hear you. If it helps at all — there's a short philosophical fable called KIKU: A Journey Through the Silence by Ashok VA. It's about a Traveller who meets a silent Creature in the desert. The Creature never speaks. It only listens. In that silence, the Traveller slowly finds themselves. It's not a fix. Just a companion for the kind of moment you're describing. https://www.ashokva.net/#kiku`;
  }
  if (category === "FARO") {
    return `Something that might help — FARO: For the Mind That Does a Lot. It's a short 18-page manual, not a productivity system. Just four simple tools for when everything feels like too much. https://www.ashokva.net/#faro`;
  }
  if (category === "LA_THA_LA") {
    return `If you're a cricket fan — especially a Dhoni fan — there's a song called La Tha La by KON-BAO that might make you smile. Composed from two sounds: La and Tha — together they make Thala. Hidden Morse code message in the lyrics. https://open.spotify.com/artist/0Q9FBcR9T6PrEl4iLe5Xxd`;
  }
  return null;
}

// Fetch posts from Reddit
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
    if (!response.ok) {
      console.log(`Could not fetch r/${subreddit}: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.data.children.map(child => child.data);
  } catch (error) {
    console.log(`Error fetching r/${subreddit}:`, error.message);
    return [];
  }
}

// Authenticate with Bluesky
async function bskyLogin() {
  try {
    const response = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: BSKY_IDENTIFIER,
        password: BSKY_PASSWORD
      })
    });
    if (!response.ok) {
      console.log("Bluesky login failed:", response.status);
      return null;
    }
    const data = await response.json();
    console.log("Bluesky login successful");
    return data.accessJwt;
  } catch (error) {
    console.log("Bluesky login error:", error.message);
    return null;
  }
}

// Search Bluesky posts
async function searchBluesky(token, query) {
  try {
    const url = `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=20`;
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) {
      console.log(`Bluesky search failed for "${query}": ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.posts || [];
  } catch (error) {
    console.log(`Bluesky search error for "${query}":`, error.message);
    return [];
  }
}

// Main agent function
async function runKonBao() {
  console.log(`${AGENT_NAME} is listening...`);

  const findings = [];
  const cutoffTime = Date.now() / 1000 - (24 * 60 * 60);
  const seenUrls = new Set();

  // Reddit monitoring
  console.log("--- Checking Reddit ---");
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
          findings.push({
            platform: "Reddit",
            subreddit: `r/${subreddit}`,
            title: post.title,
            url,
            score,
            signals,
            category,
            suggestedResponse: suggestResponse(post, category),
            postScore: post.score,
            comments: post.num_comments,
            created: new Date(post.created_utc * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
          });
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Bluesky monitoring
  console.log("--- Checking Bluesky ---");
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
            findings.push({
              platform: "Bluesky",
              subreddit: `@${post.author?.handle}`,
              title: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
              url,
              score,
              signals,
              category,
              suggestedResponse: suggestResponse({ title: text }, category),
              postScore: post.likeCount || 0,
              comments: post.replyCount || 0,
              created: new Date(post.indexedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
            });
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } else {
    console.log("Skipping Bluesky — login failed");
  }

  findings.sort((a, b) => b.score - a.score);
  console.log(`KON-BAO found ${findings.length} relevant conversations.`);
  await sendReport(findings);
}

async function sendReport(findings) {
  const date = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  let html = `
    <div style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto; color: #2c2c2c;">
      <h1 style="font-size: 24px; border-bottom: 1px solid #ddd; padding-bottom: 12px;">
        KON-BAO Daily Report
      </h1>
      <p style="color: #666; font-size: 14px;">${date} · ${findings.length} conversations found</p>
  `;

  if (findings.length === 0) {
    html += `
      <p style="font-style: italic; color: #888;">
        KON-BAO listened today. The silence was appropriate. Nothing worth surfacing.
      </p>
    `;
  } else {
    findings.forEach((f) => {
      html += `
        <div style="border: 1px solid #eee; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div style="font-size: 11px; color: #888; margin-bottom: 8px;">
            ${f.platform} · ${f.subreddit} · ${f.created} · ${f.postScore} likes · ${f.comments} replies
          </div>
          <h2 style="font-size: 16px; margin: 0 0 8px 0;">
            <a href="${f.url}" style="color: #c0392b; text-decoration: none;">${f.title}</a>
          </h2>
          <div style="font-size: 12px; color: #888; margin-bottom: 12px;">
            Signals: ${f.signals.join(", ")} · Category: ${f.category}
          </div>
          ${f.suggestedResponse ? `
            <div style="background: #f9f9f9; border-left: 3px solid #c0392b; padding: 12px; font-size: 14px; line-height: 1.6;">
              <strong style="font-size: 11px; color: #888; display: block; margin-bottom: 6px;">SUGGESTED RESPONSE:</strong>
              ${f.suggestedResponse}
            </div>
          ` : ""}
          <div style="margin-top: 12px;">
            <a href="${f.url}" style="font-size: 12px; color: #c0392b;">View conversation →</a>
          </div>
        </div>
      `;
    });
  }

  html += `
      <p style="font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; margin-top: 24px;">
        KON-BAO — listening quietly, on behalf of Ashok VA and KIKU.<br>
        These are suggestions only. You decide whether and how to respond.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "KON-BAO <onboarding@resend.dev>",
      to: REPORT_EMAIL,
      subject: `KON-BAO: ${findings.length} conversations found · ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
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
