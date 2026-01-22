const fs = require('fs');
const path = require('path');
const https = require('https');

const FOUNTAIN_RSS_URL = 'https://feeds.fountain.fm/OIYZniSDb9jd3Pb78CpF';
const FOUNTAIN_SHOW_URL = 'https://fountain.fm/show/Mk0fJte5vrfiDQ5RyCZd';
const CONTENT_DIR = path.join(__dirname, '../content/episodes');
const COVER_ART_DIR = path.join(__dirname, '../assets/images/cover-art');

// Check for API key - timestamp generation is optional
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GENERATE_TIMESTAMPS = process.env.GENERATE_TIMESTAMPS !== 'false'; // default true if API key present

// Will be populated by fetchFountainEpisodeMap()
let FOUNTAIN_EPISODE_MAP = {};

/**
 * Fetch the Fountain show page and extract hosting_id -> episode_id mappings
 */
async function fetchFountainEpisodeMap() {
  console.log('Fetching Fountain episode mappings...');
  
  try {
    const html = await fetchUrl(FOUNTAIN_SHOW_URL);
    
    // Unescape the JSON embedded in the HTML
    const unescaped = html.replace(/\\"/g, '"');
    
    // Extract all _id and _hosting_id pairs
    // The structure varies - sometimes has _item_id, sometimes not
    // Pattern: "_id":"<episode_id>","_guid":"...","_hosting_id":"<hosting_id>" 
    // or: "_id":"<episode_id>","_guid":"...","_item_id":...,"_hosting_id":"<hosting_id>"
    const episodePattern = /"_id":"([^"]+)","_guid":"[^"]+"(?:,"_item_id":\d+)?,"_hosting_id":"([^"]+)"/g;
    
    const map = {};
    let match;
    while ((match = episodePattern.exec(unescaped)) !== null) {
      const episodeId = match[1];
      const hostingId = match[2];
      map[hostingId] = episodeId;
    }
    
    const count = Object.keys(map).length;
    console.log(`Found ${count} episode mappings from Fountain\n`);
    
    return map;
  } catch (err) {
    console.warn(`Warning: Could not fetch Fountain mappings: ${err.message}`);
    console.warn('fountain_url will be empty for new episodes.\n');
    return {};
  }
}

/**
 * Get Fountain episode URL from audio URL
 */
function getFountainUrl(audioUrl) {
  if (!audioUrl) return '';
  
  // Extract hosting ID from audio URL: .../items/HOSTING_ID/...
  const match = audioUrl.match(/\/items\/([^/]+)\//);
  if (!match) return '';
  
  const hostingId = match[1];
  const fountainId = FOUNTAIN_EPISODE_MAP[hostingId];
  
  if (fountainId) {
    return `https://fountain.fm/episode/${fountainId}`;
  }
  
  return '';
}

/**
 * Fetch URL content as string
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Download file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Parse SRT content into text with timestamps
 * Returns a simplified transcript with timestamps every ~30 seconds
 */
function parseSrt(srtContent) {
  const entries = [];
  const blocks = srtContent.split(/\n\n+/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    
    // Line 1: sequence number
    // Line 2: timestamp (00:00:00,000 --> 00:00:03,160)
    // Line 3+: text
    const timeMatch = lines[1]?.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!timeMatch) continue;
    
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3], 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    
    const text = lines.slice(2).join(' ').trim();
    if (text) {
      entries.push({ totalSeconds, text });
    }
  }
  
  // Consolidate into ~30 second chunks for the LLM
  const chunks = [];
  let currentChunk = { startSeconds: 0, text: [] };
  
  for (const entry of entries) {
    if (entry.totalSeconds - currentChunk.startSeconds > 30 && currentChunk.text.length > 0) {
      chunks.push({
        time: formatTimeForDisplay(currentChunk.startSeconds),
        text: currentChunk.text.join(' ')
      });
      currentChunk = { startSeconds: entry.totalSeconds, text: [] };
    }
    currentChunk.text.push(entry.text);
  }
  
  // Don't forget the last chunk
  if (currentChunk.text.length > 0) {
    chunks.push({
      time: formatTimeForDisplay(currentChunk.startSeconds),
      text: currentChunk.text.join(' ')
    });
  }
  
  return chunks;
}

/**
 * Format seconds as MM:SS or H:MM:SS for display
 */
function formatTimeForDisplay(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Call Claude API to generate timestamps and description from transcript
 * Returns { timestamps: [...], description: "..." }
 */
async function generateFromTranscript(srtContent, episodeTitle, guestName, summary) {
  if (!ANTHROPIC_API_KEY) {
    console.log('  No ANTHROPIC_API_KEY, skipping AI generation');
    return { timestamps: [], description: '' };
  }
  
  const chunks = parseSrt(srtContent);
  if (chunks.length === 0) {
    console.log('  Could not parse SRT content');
    return { timestamps: [], description: '' };
  }
  
  // Build a condensed transcript for the LLM
  const transcriptText = chunks.map(c => `[${c.time}] ${c.text}`).join('\n\n');
  
  // Limit to ~100K chars to stay within token limits
  const truncatedTranscript = transcriptText.slice(0, 100000);
  
  const prompt = `You are generating metadata for a podcast episode. You need to create:
1. A punchy 1-2 sentence description/hook (max 120 chars)
2. 10-12 chapter timestamps

Episode: "${episodeTitle}"
${guestName ? `Guest: ${guestName}` : 'Solo episode (no guest)'}

EPISODE SUMMARY (from RSS):
${summary}

---

TASK 1: DESCRIPTION (1-2 short sentences, STRICTLY under 100 characters)
Write a punchy hook for the homepage feature. This is NOT SEO description--it's a teaser.

Good examples (note the length):
- "One ban erases your identity. Pip built reputation they can't revoke." (71 chars)
- "Seven billion people lack property rights. Bitcoin changes that math." (70 chars)
- "Big Tech captures $670/year from you. Voluntary payment can't compete." (71 chars)

Bad examples:
- "In this episode we discuss..." (boring, too long)
- "John shares his thoughts on..." (passive)
- Anything over 100 characters (too long for homepage)

---

TASK 2: TIMESTAMPS (exactly 10-12)
Create chapter markers every 5-7 minutes.

Good timestamp examples:
- "Why CBDCs fail: governments suck at consumer tech adoption"
- "What 'debanked' actually means for activists on the ground"
- "Bitcoin 101 workshops: what 300+ activists ask about most"
- "$4M in grants this year—what has to work by 2027"

Style notes:
- Use specific numbers and names ("300+ activists", "$4M in grants")
- Casual language fine ("suck at", "orange-pilling")
- Colons work well: "Topic: the interesting angle"
- Em-dashes for asides
- 5-12 words each

---

Respond with ONLY this JSON structure, no other text:
{
  "description": "Your punchy hook here.",
  "timestamps": [{"time": "00:44", "topic": "Topic title here"}, ...]
}

TRANSCRIPT:
${truncatedTranscript}`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log(`  Claude API error: ${res.statusCode}`);
          console.log(`  Response: ${data.slice(0, 500)}`);
          resolve({ timestamps: [], description: '' });
          return;
        }
        
        try {
          const response = JSON.parse(data);
          const content = response.content?.[0]?.text || '';
          
          // Extract JSON object from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.log('  Could not find JSON in Claude response');
            resolve({ timestamps: [], description: '' });
            return;
          }
          
          const result = JSON.parse(jsonMatch[0]);
          
          // Enforce max 100 chars for homepage hook
          let description = result.description || '';
          if (description.length > 100) {
            console.log(`  Warning: AI description too long (${description.length} chars), truncating intelligently`);
            description = truncateDescription(description, 100);
          }
          
          resolve({
            timestamps: result.timestamps || [],
            description: description
          });
        } catch (err) {
          console.log(`  Error parsing Claude response: ${err.message}`);
          resolve({ timestamps: [], description: '' });
        }
      });
    });
    
    req.on('error', (err) => {
      console.log(`  Claude API request error: ${err.message}`);
      resolve({ timestamps: [], description: '' });
    });
    
    req.write(requestBody);
    req.end();
  });
}

/**
 * Extract text between XML tags (simple, non-nested)
 * Handles namespaced tags like itunes:duration
 * Uses word boundary to avoid matching itunes:episodeType when looking for itunes:episode
 */
function extractTag(xml, tag) {
  // Escape special regex chars in tag name (like colons)
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use > or whitespace after tag name to ensure exact match (not substring)
  const regex = new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapedTag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract attribute from tag
 */
function extractAttr(xml, tag, attr) {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Decode HTML entities
 */
function decodeHtml(html) {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Strip HTML tags
 */
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * Normalize text - convert curly quotes/apostrophes to straight
 */
function normalizeText(text) {
  return text
    .replace(/[""]/g, '"')      // curly double quotes
    .replace(/['']/g, "'")      // curly single quotes/apostrophes
    .replace(/…/g, '...');      // ellipsis
}

/**
 * Truncate description intelligently at sentence/word boundary
 */
function truncateDescription(text, maxLen) {
  if (text.length <= maxLen) return text;
  
  // Try to truncate at sentence boundary first (handle quotes after punctuation)
  const sentences = text.split(/(?<=[.!?]['"]?['"]?)\s+/);
  let result = '';
  for (const sentence of sentences) {
    if ((result + (result ? ' ' : '') + sentence).length <= maxLen) {
      result += (result ? ' ' : '') + sentence;
    } else {
      break;
    }
  }
  // If we got at least one full sentence that's reasonably long, use it
  if (result.length > 0 && result.length >= maxLen * 0.5) {
    return result;
  }
  
  // Fall back to word boundary with ellipsis
  const truncated = text.slice(0, maxLen - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Convert duration in seconds to H:MM:SS or MM:SS
 */
function formatDuration(seconds) {
  const sec = parseInt(seconds, 10);
  if (isNaN(sec)) return '';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert to URL-friendly slug
 */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse title: "S02E16 Pippellia – Reputation Without a Kill Switch"
 * Returns { season, episode, guestName, episodeTitle, fullTitle, isGuest }
 */
function parseTitle(rssTitle) {
  const prefixMatch = rssTitle.match(/^S(\d+)E(\d+)\s+(.+)$/i);
  if (!prefixMatch) return null;

  const season = parseInt(prefixMatch[1], 10);
  const episode = parseInt(prefixMatch[2], 10);
  const remainder = prefixMatch[3].trim();

  // Guest episode: "Guest Name – Episode Title"
  const guestMatch = remainder.match(/^(.+?)\s*[–—-]\s*(.+)$/);
  if (guestMatch) {
    return {
      season,
      episode,
      guestName: guestMatch[1].trim(),
      episodeTitle: guestMatch[2].trim(),
      fullTitle: remainder, // Keep "Guest Name – Episode Title"
      isGuest: true
    };
  }

  // Solo episode
  return {
    season,
    episode,
    guestName: null,
    episodeTitle: remainder,
    fullTitle: remainder,
    isGuest: false
  };
}

/**
 * Parse description HTML to extract all sections
 */
function parseDescription(html) {
  const decoded = decodeHtml(html);
  const result = {
    summary: '',
    guestBio: '',
    socialLinks: {},
    keyQuote: null,
    timestamps: [],
    resources: []
  };

  // Split into paragraphs
  const paragraphs = decoded.split(/<\/p>/i).map(p => p.replace(/<p>/gi, '').trim()).filter(Boolean);

  // First paragraph is the summary/hook
  if (paragraphs.length > 0) {
    result.summary = stripHtml(paragraphs[0]);
  }

  // Find sections by looking for <strong>SECTION NAME</strong> patterns
  const sectionRegex = /<strong>([^<]+)<\/strong>/gi;
  let currentSection = null;
  let sectionContent = {};

  // Split by section headers
  const parts = decoded.split(/<p><strong>/i);
  for (let i = 1; i < parts.length; i++) {
    const part = '<p><strong>' + parts[i];
    const headerMatch = part.match(/<strong>([^<]+)<\/strong>/i);
    if (headerMatch) {
      const sectionName = headerMatch[1].toLowerCase().trim();
      sectionContent[sectionName] = part;
    }
  }

  // Extract ABOUT THE GUEST / About the Guest
  const guestSection = sectionContent['about the guest'] || sectionContent['about guest'];
  if (guestSection) {
    // Get the paragraph after the header
    const bioMatch = guestSection.match(/<\/strong><\/p>\s*<p>([^<]+(?:<[^>]+>[^<]*)*?)<\/p>/i);
    if (bioMatch) {
      result.guestBio = stripHtml(bioMatch[1]);
    }

    // Extract social links from the list after bio
    const socialListMatch = guestSection.match(/<ul>([\s\S]*?)<\/ul>/i);
    if (socialListMatch) {
      const listHtml = socialListMatch[1];

      const twitterMatch = listHtml.match(/href="(https?:\/\/(?:twitter|x)\.com\/[^"]+)"/i);
      if (twitterMatch) result.socialLinks.twitter = twitterMatch[1];

      const nostrMatch = listHtml.match(/href="(https?:\/\/primal\.net\/[^"]+)"/i);
      if (nostrMatch) result.socialLinks.nostr = nostrMatch[1];

      const githubMatch = listHtml.match(/href="(https?:\/\/github\.com\/[^"]+)"/i);
      if (githubMatch) result.socialLinks.github = githubMatch[1];

      const linkedinMatch = listHtml.match(/href="(https?:\/\/(?:www\.)?linkedin\.com\/[^"]+)"/i);
      if (linkedinMatch) result.socialLinks.linkedin = linkedinMatch[1];

      const mastodonMatch = listHtml.match(/href="(https?:\/\/[^"]*mastodon[^"]*|https?:\/\/mamot\.fr\/[^"]+)"/i);
      if (mastodonMatch) result.socialLinks.mastodon = mastodonMatch[1];

      const websiteMatch = listHtml.match(/(?:Website|Blog|Site)[^<]*<a href="([^"]+)"/i);
      if (websiteMatch) result.socialLinks.website = websiteMatch[1];
    }
  }

  // Also check for social links right after guest bio (different format)
  if (Object.keys(result.socialLinks).length === 0) {
    // Look for bullet list of social links anywhere
    const socialPatterns = [
      { key: 'twitter', regex: /X\/Twitter[^<]*<a href="([^"]+)"/i },
      { key: 'twitter', regex: /Twitter[^<]*<a href="([^"]+)"/i },
      { key: 'nostr', regex: /Nostr[^<]*<a href="([^"]+)"/i },
      { key: 'github', regex: /GitHub[^<]*<a href="([^"]+)"/i },
      { key: 'linkedin', regex: /LinkedIn[^<]*<a href="([^"]+)"/i },
      { key: 'mastodon', regex: /Mastodon[^<]*<a href="([^"]+)"/i },
    ];
    for (const { key, regex } of socialPatterns) {
      const match = decoded.match(regex);
      if (match && !result.socialLinks[key]) {
        result.socialLinks[key] = match[1];
      }
    }
  }

  // Extract KEY QUOTES / Key Quotes
  // Find ALL quotes so we can pick one that's not in the summary
  const quotesSection = sectionContent['key quotes'] || sectionContent['key quote'];
  if (quotesSection) {
    // Look for ALL quoted text with attribution
    // Handle straight quotes (U+0022) and curly quotes (U+201C/U+201D)
    const quoteRegex = /[\u201c\u201d\u0022](.+?)[\u201c\u201d\u0022][^—–-]*[—–-]\s*([^<\n]+)/g;
    const allQuotes = [];
    let quoteMatch;
    while ((quoteMatch = quoteRegex.exec(quotesSection)) !== null) {
      allQuotes.push({
        text: quoteMatch[1].trim(),
        attribution: quoteMatch[2].trim()
      });
    }
    // Store all quotes, we'll pick the best one later (after we have the summary)
    result.allQuotes = allQuotes;
    result.keyQuote = allQuotes[0] || null;
  }

  // Extract TIMESTAMPS
  const timestampsSection = sectionContent['timestamps'];
  if (timestampsSection) {
    // Pattern: [MM:SS] or [H:MM:SS] followed by topic
    const timeRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^\n<]+)/g;
    let match;
    while ((match = timeRegex.exec(timestampsSection)) !== null) {
      result.timestamps.push({
        time: match[1],
        topic: match[2].trim()
      });
    }

    // Also try bullet list format
    if (result.timestamps.length === 0) {
      const bulletRegex = /<li>\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*([^<]+)/gi;
      while ((match = bulletRegex.exec(timestampsSection)) !== null) {
        result.timestamps.push({
          time: match[1],
          topic: match[2].trim()
        });
      }
    }
  }

  // Extract RESOURCES & LINKS / Mentioned in Episode
  const resourcesSection = sectionContent['resources & links'] ||
                           sectionContent['resources'] ||
                           sectionContent['mentioned in episode'];
  if (resourcesSection) {
    // Look for links in list items
    const linkRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    const seen = new Set();
    while ((match = linkRegex.exec(resourcesSection)) !== null) {
      const url = match[1];
      let name = match[2].trim();

      // Skip podcast subscribe links and generic links
      if (url.includes('podcast.trustrevolution.co') ||
          url.includes('fountain.fm/show') ||
          name.toLowerCase() === 'subscribe') {
        continue;
      }

      // Avoid duplicates
      if (seen.has(url)) continue;
      seen.add(url);

      result.resources.push({ name, url });
    }
  }

  // Also check "Mentioned in Episode" subsection
  const mentionedMatch = decoded.match(/<strong>Mentioned in Episode:?<\/strong>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
  if (mentionedMatch && result.resources.length === 0) {
    const linkRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(mentionedMatch[1])) !== null) {
      const url = match[1];
      const name = match[2].trim();
      if (!url.includes('podcast.trustrevolution.co')) {
        result.resources.push({ name, url });
      }
    }
  }

  return result;
}

/**
 * Parse a single RSS item XML (supports both regular <item> and <podcast:paidItem>)
 */
function parseItem(itemXml) {
  const title = extractTag(itemXml, 'title');
  const description = extractTag(itemXml, 'description');
  const pubDate = extractTag(itemXml, 'pubDate');
  const season = extractTag(itemXml, 'itunes:season') || extractTag(itemXml, 'podcast:season');
  const episode = extractTag(itemXml, 'itunes:episode') || extractTag(itemXml, 'podcast:episode');

  // Cover art
  const coverArt = extractAttr(itemXml, 'itunes:image', 'href');

  // For regular items: audio from <enclosure>, duration from top-level <itunes:duration>
  // For paid items: audio from <podcast:alternateEnclosure type="audio/mpeg">, duration inside that block
  let audioUrl = extractAttr(itemXml, 'enclosure', 'url');
  let duration = extractTag(itemXml, 'itunes:duration');

  // Check for paid item audio format (podcast:alternateEnclosure with type="audio/mpeg")
  const audioEnclosureMatch = itemXml.match(/<podcast:alternateEnclosure[^>]*type="audio\/mpeg"[^>]*>([\s\S]*?)<\/podcast:alternateEnclosure>/i);
  if (audioEnclosureMatch) {
    const audioBlock = audioEnclosureMatch[1];
    const audioSourceMatch = audioBlock.match(/<podcast:source[^>]*uri="([^"]+)"/i);
    if (audioSourceMatch) {
      audioUrl = audioSourceMatch[1];
    }
    // Duration might be inside the alternateEnclosure for paid items
    const blockDuration = extractTag(audioBlock, 'itunes:duration');
    if (blockDuration) {
      duration = blockDuration;
    }
  }

  // Video URL from podcast:alternateEnclosure with type="application/x-mpegURL" (HLS video)
  const videoMatch = itemXml.match(/<podcast:alternateEnclosure[^>]*type="application\/x-mpegURL"[^>]*>[\s\S]*?<podcast:source[^>]*uri="([^"]+)"[\s\S]*?<\/podcast:alternateEnclosure>/i);
  const videoUrl = videoMatch ? videoMatch[1] : null;

  // Transcript URL - check both top-level and inside alternateEnclosure blocks
  let transcriptUrl = extractAttr(itemXml, 'podcast:transcript', 'url');
  if (!transcriptUrl && audioEnclosureMatch) {
    const audioBlock = audioEnclosureMatch[1];
    transcriptUrl = extractAttr(audioBlock, 'podcast:transcript', 'url');
  }

  return {
    title,
    description,
    pubDate,
    duration,
    season: season ? parseInt(season, 10) : null,
    episode: episode ? parseInt(episode, 10) : null,
    audioUrl,
    coverArt,
    videoUrl,
    transcriptUrl
  };
}

/**
 * Get existing episodes from content directory
 */
function getExistingEpisodes() {
  const existing = new Set();
  if (!fs.existsSync(CONTENT_DIR)) return existing;

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const match = file.match(/s(\d+)e(\d+)/i);
    if (match) {
      existing.add(`${parseInt(match[1], 10)}-${parseInt(match[2], 10)}`);
    }
  }
  return existing;
}

/**
 * Escape YAML string value
 */
function yamlString(str, multiline = false) {
  if (!str) return '""';
  if (multiline) {
    return str;
  }
  // If contains quotes or special chars, use double quotes and escape
  if (str.includes('"') || str.includes(':') || str.includes('#') || str.includes('\n')) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return '"' + str + '"';
}

/**
 * Generate episode markdown
 */
function generateMarkdown(data) {
  const {
    fullTitle,
    date,
    slug,
    season,
    episode,
    summary,
    description,
    featuredImage,
    audioUrl,
    videoUrl,
    duration,
    transcriptUrl,
    guest,
    isGuest,
    keyQuote,
    timestamps,
    resources
  } = data;

  let md = `---
title: ${yamlString(fullTitle)}
date: ${date}
draft: false
slug: ${slug}
season: ${season}
episode: ${episode}
description: ${yamlString(description)}
summary: |
  ${summary.split('\n').join('\n  ')}
featured_image: ${yamlString(featuredImage)}
audio_url: ${yamlString(audioUrl)}`;

  if (videoUrl) {
    md += `\nvideo_url: ${yamlString(videoUrl)}`;
  }

  md += `\nduration: ${yamlString(duration)}`;

  if (transcriptUrl) {
    md += `\ntranscript_url: ${yamlString(transcriptUrl)}`;
  }

  const fountainUrl = getFountainUrl(audioUrl);
  md += `\nfountain_url: ${yamlString(fountainUrl)}`;

  if (isGuest && guest) {
    md += `
guest:
  name: ${yamlString(guest.name)}
  bio: ${yamlString(guest.bio)}
  social:`;

    if (guest.social.nostr) md += `\n    nostr: ${yamlString(guest.social.nostr)}`;
    if (guest.social.twitter) md += `\n    twitter: ${yamlString(guest.social.twitter)}`;
    if (guest.social.github) md += `\n    github: ${yamlString(guest.social.github)}`;
    if (guest.social.linkedin) md += `\n    linkedin: ${yamlString(guest.social.linkedin)}`;
    if (guest.social.mastodon) md += `\n    mastodon: ${yamlString(guest.social.mastodon)}`;
    if (guest.social.website) md += `\n    website: ${yamlString(guest.social.website)}`;

    md += `
guests:
- ${guest.name}`;
  }

  if (keyQuote && keyQuote.text) {
    md += `
key_quote:
  text: ${yamlString(keyQuote.text)}
  attribution: ${keyQuote.attribution || ''}`;
  }

  if (timestamps && timestamps.length > 0) {
    md += `\ntimestamps:`;
    for (const ts of timestamps) {
      md += `\n- time: ${yamlString(ts.time)}`;
      md += `\n  topic: ${yamlString(ts.topic)}`;
    }
  } else {
    md += `\ntimestamps: []`;
  }

  if (resources && resources.length > 0) {
    md += `\nresources:`;
    for (const res of resources) {
      md += `\n- name: ${yamlString(res.name)}`;
      md += `\n  url: ${yamlString(res.url)}`;
    }
  } else {
    md += `\nresources: []`;
  }

  md += `\n---\n`;

  return md;
}

/**
 * Main
 */
async function main() {
  // Fetch Fountain episode mappings first
  FOUNTAIN_EPISODE_MAP = await fetchFountainEpisodeMap();
  
  console.log('Fetching RSS feed...');
  const rssXml = await fetchUrl(FOUNTAIN_RSS_URL);
  console.log(`Fetched ${rssXml.length} bytes\n`);

  // Extract all <item> and <podcast:paidItem> elements (paid items are early-access/subscriber content)
  const itemRegex = /<(?:item|podcast:paidItem)>([\s\S]*?)<\/(?:item|podcast:paidItem)>/gi;
  const items = [];
  let match;
  while ((match = itemRegex.exec(rssXml)) !== null) {
    items.push(match[1]);
  }
  console.log(`Found ${items.length} episodes in RSS feed (including paid/early-access)`);

  // Get existing episodes
  const existing = getExistingEpisodes();
  console.log(`Found ${existing.size} existing episode files\n`);

  // Ensure directories exist
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(COVER_ART_DIR)) fs.mkdirSync(COVER_ART_DIR, { recursive: true });

  let created = 0;
  const issues = []; // Track issues for GitHub issue creation

  for (const itemXml of items) {
    const item = parseItem(itemXml);

    if (!item.season || !item.episode) {
      console.log(`Skipping (no season/episode): ${item.title}`);
      continue;
    }

    const key = `${item.season}-${item.episode}`;
    if (existing.has(key)) {
      continue; // Already exists
    }

    console.log(`Creating: ${item.title}`);

    // Parse title
    const parsed = parseTitle(item.title);
    if (!parsed) {
      console.log(`  Could not parse title, skipping`);
      continue;
    }

    // Parse description HTML
    const content = parseDescription(item.description || '');

    // Generate slug
    const seasonStr = item.season.toString().padStart(2, '0');
    const episodeStr = item.episode.toString().padStart(2, '0');
    const slugBase = parsed.isGuest ? slugify(parsed.guestName) : slugify(parsed.episodeTitle);
    const slug = `s${seasonStr}e${episodeStr}-${slugBase}`;

    // Format date
    const date = new Date(item.pubDate).toISOString().split('T')[0];

    // Cover art
    const coverArtFilename = `s${seasonStr}e${episodeStr}.jpg`;
    const coverArtPath = path.join(COVER_ART_DIR, coverArtFilename);

    if (item.coverArt && !fs.existsSync(coverArtPath)) {
      try {
        console.log(`  Downloading cover art...`);
        await downloadFile(item.coverArt, coverArtPath);
      } catch (err) {
        console.log(`  Failed to download cover art: ${err.message}`);
      }
    } else if (fs.existsSync(coverArtPath)) {
      console.log(`  Cover art exists, skipping download`);
    }

    // Generate timestamps and/or description from transcript if needed
    let timestamps = content.timestamps;
    let generatedDescription = '';
    
    // Check if first sentence of summary would work as description
    const firstSentence = (content.summary || '').split(/(?<=[.!?]['"]?['"]?)\s+/)[0] || '';
    const needsDescriptionFromAI = !firstSentence || firstSentence.length > 100;
    
    // Call AI if we need timestamps OR description, and have transcript + API key
    if ((timestamps.length === 0 || needsDescriptionFromAI) && item.transcriptUrl && ANTHROPIC_API_KEY && GENERATE_TIMESTAMPS) {
      const reason = timestamps.length === 0 ? 'timestamps' : 'description';
      console.log(`  Generating ${reason} from transcript...`);
      try {
        const srtContent = await fetchUrl(item.transcriptUrl);
        const generated = await generateFromTranscript(
          srtContent,
          parsed.fullTitle,
          parsed.guestName,
          content.summary
        );
        if (timestamps.length === 0) {
          timestamps = generated.timestamps;
        }
        generatedDescription = generated.description;
        console.log(`  Generated ${generated.timestamps.length} timestamps and description from transcript`);
      } catch (err) {
        console.log(`  Failed to generate from transcript: ${err.message}`);
      }
    }

    // Check for fountain_url
    const fountainUrl = getFountainUrl(item.audioUrl);
    if (!fountainUrl) {
      // Extract hosting ID for the issue
      const hostingIdMatch = item.audioUrl?.match(/\/items\/([^/]+)\//);
      const hostingId = hostingIdMatch ? hostingIdMatch[1] : 'unknown';
      issues.push({
        type: 'missing_fountain_url',
        episode: `S${seasonStr}E${episodeStr}`,
        title: parsed.fullTitle,
        hostingId,
        slug
      });
      console.log(`  Warning: No fountain_url mapping for hosting_id: ${hostingId}`);
    }

    // Normalize all text content (curly quotes, fancy dashes, etc.)
    const summary = normalizeText(content.summary || '');
    const guestBio = normalizeText(content.guestBio || '');
    // Pick a key quote that's NOT duplicated in the summary
    let selectedQuote = null;
    if (content.allQuotes && content.allQuotes.length > 0) {
      // Find a quote whose text doesn't appear in the summary
      for (const quote of content.allQuotes) {
        const quoteStart = quote.text.slice(0, 50).toLowerCase();
        if (!summary.toLowerCase().includes(quoteStart)) {
          selectedQuote = quote;
          break;
        }
      }
      // If all quotes are in summary, use the second one (if available), else first
      if (!selectedQuote) {
        selectedQuote = content.allQuotes[1] || content.allQuotes[0];
      }
    }
    const keyQuoteText = selectedQuote ? normalizeText(selectedQuote.text || '') : '';
    const keyQuoteAttr = selectedQuote ? normalizeText(selectedQuote.attribution || '') : '';

    // Description: use AI-generated, or fall back to first sentence if short enough
    let description = generatedDescription ? normalizeText(generatedDescription) : '';
    if (!description && summary) {
      const firstSentence = summary.split(/(?<=[.!?]['"]?['"]?)\s+/)[0];
      if (firstSentence && firstSentence.length <= 100) {
        description = firstSentence;
        console.log(`  Using first sentence for description (${description.length} chars)`);
      } else {
        console.log(`  Description needs manual review (first sentence too long)`);
      }
    }

    // Build episode data
    const episodeData = {
      fullTitle: normalizeText(parsed.fullTitle),
      date,
      slug,
      season: item.season,
      episode: item.episode,
      summary: summary,
      description: description,
      featuredImage: `images/cover-art/${coverArtFilename}`,
      audioUrl: item.audioUrl || '',
      videoUrl: item.videoUrl || '',
      duration: formatDuration(item.duration),
      transcriptUrl: item.transcriptUrl || '',
      isGuest: parsed.isGuest,
      guest: parsed.isGuest ? {
        name: parsed.guestName,
        bio: guestBio,
        social: content.socialLinks
      } : null,
      keyQuote: selectedQuote ? { text: keyQuoteText, attribution: keyQuoteAttr } : null,
      timestamps: timestamps.map(ts => ({ time: ts.time, topic: normalizeText(ts.topic) })),
      resources: content.resources
    };

    // Generate markdown
    const markdown = generateMarkdown(episodeData);

    // Write file
    const filePath = path.join(CONTENT_DIR, `${slug}.md`);
    fs.writeFileSync(filePath, markdown);
    // Track if description is empty (needs manual review)
    if (!description) {
      issues.push({
        type: 'missing_description',
        episode: `S${seasonStr}E${episodeStr}`,
        title: parsed.fullTitle,
        slug
      });
    }

    console.log(`  Created: ${slug}.md`);
    console.log(`    - ${timestamps.length} timestamps${content.timestamps.length === 0 && timestamps.length > 0 ? ' (generated from transcript)' : ''}`);
    console.log(`    - ${content.resources.length} resources`);
    console.log(`    - key_quote: ${content.keyQuote ? 'yes' : 'no'}`);
    console.log(`    - video_url: ${item.videoUrl ? 'yes' : 'no'}`);
    console.log(`    - transcript_url: ${item.transcriptUrl ? 'yes' : 'no'}`);
    console.log(`    - fountain_url: ${fountainUrl ? 'yes' : 'NO (needs manual mapping)'}`);
    console.log(`    - description: ${description ? 'yes' : 'NO (needs manual review)'}`);

    created++;
  }

  console.log(`\nDone! Created ${created} new episode draft(s).`);

  // Output issues summary for GitHub Actions
  if (issues.length > 0) {
    console.log('\n=== ISSUES REQUIRING ATTENTION ===\n');
    
    const missingFountain = issues.filter(i => i.type === 'missing_fountain_url');
    const missingDesc = issues.filter(i => i.type === 'missing_description');
    
    if (missingFountain.length > 0) {
      console.log('Missing Fountain URL mappings:');
      for (const issue of missingFountain) {
        console.log(`  - ${issue.episode}: ${issue.title}`);
        console.log(`    hosting_id: ${issue.hostingId}`);
        console.log(`    file: content/episodes/${issue.slug}.md`);
      }
      console.log('\nThis usually means Fountain has not indexed the episode yet.');
      console.log('Re-run the workflow later, or manually add fountain_url to the episode file.\n');
    }
    
    if (missingDesc.length > 0) {
      console.log('Missing descriptions (AI-generated was too long):');
      for (const issue of missingDesc) {
        console.log(`  - ${issue.episode}: ${issue.title}`);
        console.log(`    file: content/episodes/${issue.slug}.md`);
      }
      console.log('\nTo fix: Edit the file and add a description (max 155 chars).\n');
    }

    // Write issues to a JSON file for GitHub Actions to pick up
    const issuesPath = path.join(__dirname, 'episode-issues.json');
    fs.writeFileSync(issuesPath, JSON.stringify(issues, null, 2));
    console.log(`Issues written to: ${issuesPath}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
