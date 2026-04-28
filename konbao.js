import fetch from "node-fetch";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const REPORT_EMAIL = "konbao369@gmail.com";
const AGENT_NAME = "KON-BAO";

// Subreddits to monitor
const SUBREDDITS = [
  "lonely",
  "suggestmeabook", 
  "meditation",
  "mentalhealth",
  "stoicism",
  "philosophy",
  "books",
  "indieauthors"
];

// What KON-BAO listens for — the signals that matter
const KIKU_SIGNALS = [
  "feel unheard",
  "no one listens",
  "feel lonely",
  "feeling lost",
  "don't know what i'm looking for",
  "searching for meaning",
  "need someone to talk to",
  "no one to talk to",
  "feel invisible",
  "going through the motions",
  "something is missing",
  "philosophical book",
  "contemplative",
  "like the little prince",
  "book about silence",
  "book about listening",
  "mindfulness book",
  "feeling disconnected",
  "can't stop overthinking",
  "mental loops",
  "replaying",
  "need quiet",
  "overwhelmed by noise",
  "suggest me a meaningful book",
  "short meaningful book",
  "book that changed",
  "fable for adults"
];

const FARO_SIGNALS = [
  "too many thoughts",
  "can't focus",
  "overwhelmed",
  "too much going on",
  "adhd",
  "scattered",
  "can't finish anything",
  "pulled in every direction",
  "generalist",
  "jack of all trades",
  "productivity system",
  "reset my mind",
  "clarity",
  "overwhelm script"
];

const CRICKET_SIGNALS = [
  "ms dhoni",
  "dhoni",
  "csk",
  "chennai super kings",
  "thala",
  "ipl",
  "cricket fan",
  "morse code",
  "cricket music"
];

// Score a post based on how relevant it is
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

// Generate a suggested response for a post
function suggestResponse(post, category) {
  if (category === "KIKU") {
    return `I hear you. If it helps at all — there's a short philosophical fable called KIKU: A Journey Through the Silence by Ashok VA. It's about a Traveller who meets a silent Creature in the desert. The Creature never speaks. It only listens. In that silence, the Traveller slowly finds themselves. It's not a fix. Just a companion for the kind of moment you're describing. https://www.ashokva.net/#kiku`;
  }

  if (category === "FARO") {
    return `Something that might help — FARO: For the Mind That Does a Lot. It's a short 18-page manual, not a productivity system. Just four simple tools for when everything feels like too much. Free to read, no fluff. https://www.ashokva.net/#faro`;
  }

  if (category === "LA_THA_LA") {
    return `If you're a cricket fan — especially a Dhoni fan — there's a song called La Tha La by KON-BAO that might make you smile. It's composed entirely from two sounds: La and Tha. Together they make Thala. There's a hidden Morse code message in the lyrics. Worth a listen. https://open.spotify.com/artist/0Q9FBcR9T6PrEl4iLe5Xxd`;
  }

  return null;
}

// Fetch posts from a subreddit using public JSON
async function fetchSubreddit(subreddit) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "KON-BAO-agent/1.0 by ashokva (personal non-commercial monitoring tool)"
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

// Main agent function
async function runKonBao() {
  console.log(`${AGENT_NAME} is listening...`);

  const findings = [];
  const cutoffTime = Date.now() / 1000 - (24 * 60 * 60); // Last 24 hours

  for (const subreddit of SUBREDDITS) {
    console.log(`Checking r/${subreddit}...`);
    const posts = await fetchSubreddit(subreddit);

    for (const post of posts) {
      // Only look at posts from the last 24 hours
      if (post.created_utc < cutoffTime) continue;
      // Skip posts that are already highly upvoted (too much attention)
      if (post.score > 500) continue;

      const { score, signals, category } = scorePost(post.title, post.selftext);

      if (score >= 2) {
        findings.push({
          subreddit,
          title: post.title,
          url: `https://reddit.com${post.permalink}`,
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

    // Be polite — wait between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Sort by relevance score
  findings.sort((a, b) => b.score - a.score);

  console.log(`KON-BAO found ${findings.length} relevant conversations.`);

  // Build the email report
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
    findings.forEach((f, i) => {
      html += `
        <div style="border: 1px solid #eee; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div style="font-size: 11px; color: #888; margin-bottom: 8px;">
            r/${f.subreddit} · ${f.created} · ${f.postScore} upvotes · ${f.comments} comments
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

// Run immediately
runKonBao().then(() => {
  console.log("KON-BAO finished. Exiting.");
  process.exit(0);
}).catch((error) => {
  console.error("KON-BAO error:", error);
  process.exit(1);
});
