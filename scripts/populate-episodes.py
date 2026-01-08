#!/usr/bin/env python3
"""
Populate Hugo episode pages from Fountain RSS feed.
Uses BeautifulSoup to parse structured shownotes HTML.

Usage:
    python scripts/populate-episodes.py [--dry-run] [--limit N]

Requirements:
    pip install requests beautifulsoup4
"""

import xml.etree.ElementTree as ET
import requests
import re
import os
import json
import argparse
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup

RSS_URL = "https://feeds.fountain.fm/OIYZniSDb9jd3Pb78CpF"
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "content" / "episodes"

# Load episode mapping from external JSON file
FOUNTAIN_EPISODE_MAP_FILE = SCRIPT_DIR / "fountain-episode-map.json"
with open(FOUNTAIN_EPISODE_MAP_FILE) as f:
    _map_data = json.load(f)
    # Remove the _comment key if present
    FOUNTAIN_EPISODE_MAP = {k: v for k, v in _map_data.items() if not k.startswith('_')}

NAMESPACES = {
    'itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    'podcast': 'https://podcastindex.org/namespace/1.0',
}

HONORIFICS = ['Dr.', 'Mr.', 'Ms.', 'Mrs.', 'Prof.', 'Rev.', 'Hon.']


def fetch_rss() -> ET.Element:
    """Fetch and parse RSS feed."""
    response = requests.get(RSS_URL, timeout=30)
    response.raise_for_status()
    return ET.fromstring(response.content)


def parse_duration(seconds: int) -> str:
    """Convert seconds to H:MM:SS or MM:SS format."""
    hours, remainder = divmod(int(seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def strip_honorifics(name: str) -> str:
    """Remove honorific prefixes like Dr., Mr., etc."""
    for h in HONORIFICS:
        if name.startswith(h + ' '):
            return name[len(h)+1:]
    return name


def make_slug(text: str) -> str:
    """Create URL-safe slug from text."""
    # Strip honorifics first
    text = strip_honorifics(text)
    slug = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    return slug[:50].strip('-')


def parse_shownotes(html: str) -> dict:
    """Parse structured shownotes HTML with BeautifulSoup."""
    soup = BeautifulSoup(html, 'html.parser')

    result = {
        'hook': '',
        'summary': '',
        'bio': '',
        'social': {},
        'quotes': [],
        'timestamps': [],
        'resources': [],
    }

    # Find all paragraph elements
    paragraphs = soup.find_all('p')

    current_section = None
    section_content = []
    intro_paragraphs = []  # Collect paragraphs before first section header

    for p in paragraphs:
        # Use separator=' ' to preserve spaces around inline elements like <em>, <a>
        text = ' '.join(p.get_text(separator=' ').split())

        # Check if this is a section header (bold text only)
        strong = p.find('strong')
        if strong and ' '.join(strong.get_text(separator=' ').split()) == text:
            header = text.upper()
            # Save previous section
            if current_section:
                process_section(result, current_section, section_content, soup)

            # Start new section - check various header formats
            if 'EPISODE SUMMARY' in header or header == 'SUMMARY':
                current_section = 'summary'
            elif 'ABOUT THE GUEST' in header or 'ABOUT ' in header:
                current_section = 'about'
            elif 'QUOTE' in header:  # Matches KEY QUOTES, QUOTES TO REMEMBER, etc.
                current_section = 'quotes'
            elif 'KEY TAKEAWAY' in header or 'TAKEAWAY' in header or 'HIGHLIGHT' in header:
                current_section = 'takeaways'
            elif 'TIMESTAMP' in header:
                current_section = 'timestamps'
            elif 'RESOURCE' in header or 'MENTIONED' in header or 'LINK' in header:
                current_section = 'resources'
            elif 'SOCIAL' in header or 'CONNECT' in header:
                current_section = 'social'
            else:
                # Check if it's a guest name (common in older episodes)
                # Pattern: just a name like "Dr. David Strayhorn" or "Max Hillebrand"
                if len(text.split()) <= 4 and not any(kw in header for kw in ['SUBSCRIBE', 'MUSIC', 'PODCAST']):
                    current_section = 'about'
                else:
                    current_section = None

            section_content = []
        elif current_section:
            section_content.append(p)
        else:
            # No section yet - collect intro paragraphs
            if text and len(text) > 20 and not text.lower().startswith('subscribe'):
                intro_paragraphs.append(text)

    # Use intro paragraphs as summary if no explicit summary section found
    if intro_paragraphs and not result['summary']:
        result['hook'] = intro_paragraphs[0].strip('""\'"')
        result['summary'] = ' '.join(intro_paragraphs[:3])

    # Process last section
    if current_section:
        process_section(result, current_section, section_content, soup)

    # Also check for lists that might contain timestamps/resources/social/quotes
    for ul in soup.find_all('ul'):
        parent_text = ''
        prev = ul.find_previous_sibling()
        if prev and prev.name == 'p':
            parent_text = prev.get_text(strip=True).upper()

        if 'TIMESTAMP' in parent_text:
            result['timestamps'] = parse_list_timestamps(ul)
        elif 'RESOURCE' in parent_text or 'MENTIONED' in parent_text or 'LINK' in parent_text:
            if not result['resources']:  # Don't overwrite if already found
                result['resources'] = parse_list_resources(ul)
        elif 'QUOTE' in parent_text:
            # Parse quotes from list items
            for li in ul.find_all('li'):
                text = li.get_text(strip=True)
                if text and len(text) > 20:
                    result['quotes'].append(text.strip('""\'"'))
        elif 'SOCIAL' in parent_text or not parent_text:
            # Check if list contains social links
            social = parse_list_social(ul)
            if social:
                result['social'].update(social)

    return result


def process_section(result: dict, section: str, content: list, soup) -> None:
    """Process accumulated content for a section."""
    def clean_text(p):
        """Extract text preserving spaces around inline elements."""
        return ' '.join(p.get_text(separator=' ').split())

    if section == 'summary':
        texts = [clean_text(p) for p in content if clean_text(p)]
        result['summary'] = ' '.join(texts[:3])  # First 3 paragraphs

    elif section == 'about':
        # Bio is text paragraphs, social links are in lists
        bio_parts = []
        for p in content:
            text = clean_text(p)
            # Skip lines that are just "Social Links:" or similar
            if text.lower().startswith('social') or text.lower().startswith('connect'):
                continue
            # Skip if it's a link list item
            if p.find('a') and len(text) < 100 and 'http' in str(p):
                continue
            if text:
                bio_parts.append(text)
        result['bio'] = ' '.join(bio_parts)

        # Check for social links in following list
        for p in content:
            ul = p.find_next_sibling('ul')
            if ul:
                social = parse_list_social(ul)
                if social:
                    result['social'].update(social)
                break

    elif section == 'quotes':
        for p in content:
            text = clean_text(p)
            if text and len(text) > 20:
                # Clean up quote markers
                quote = text.strip('""\'"')
                result['quotes'].append(quote)

    elif section == 'timestamps':
        for p in content:
            text = clean_text(p)
            ts = parse_timestamp_line(text)
            if ts:
                result['timestamps'].append(ts)

    elif section == 'resources':
        for p in content:
            links = p.find_all('a')
            for a in links:
                href = a.get('href', '')
                name = a.get_text(strip=True)
                if href and name and not is_podcast_link(href):
                    result['resources'].append({'name': name[:60], 'url': href})


def parse_list_timestamps(ul) -> list:
    """Parse timestamps from a <ul> element."""
    timestamps = []
    for li in ul.find_all('li'):
        text = li.get_text(strip=True)
        ts = parse_timestamp_line(text)
        if ts:
            timestamps.append(ts)
    return timestamps


def parse_timestamp_line(text: str) -> dict | None:
    """Parse a single timestamp line like '[00:44] Topic' or '(03:23) Topic'."""
    match = re.match(r'[\[\(]?(\d{1,2}:\d{2}(?::\d{2})?)[\]\)]?\s*[-–—]?\s*(.+)', text)
    if match:
        return {'time': match.group(1), 'topic': match.group(2).strip()[:100]}
    return None


def parse_list_resources(ul) -> list:
    """Parse resources from a <ul> element."""
    resources = []
    seen_urls = set()

    for li in ul.find_all('li'):
        links = li.find_all('a')
        for link in links:
            href = link.get('href', '')
            if not href or is_podcast_link(href) or href in seen_urls:
                continue

            # Get name from link text or from context
            name = link.get_text(strip=True)

            # If name is just a URL, try to get better name from surrounding text
            if name.startswith('http') or not name:
                # Look for strong text before the link
                strong = li.find('strong')
                if strong:
                    name = strong.get_text(strip=True).rstrip(':')
                else:
                    # Use full li text before the link
                    full_text = li.get_text(strip=True)
                    # Try to extract name before colon
                    if ':' in full_text:
                        name = full_text.split(':')[0].strip()

            # Clean up name
            name = name.strip().rstrip(':')
            if ' - ' in name:
                name = name.split(' - ')[0].strip()

            if href and name and href not in seen_urls:
                seen_urls.add(href)
                resources.append({'name': name[:60], 'url': href})

    return resources


def parse_list_social(ul) -> dict:
    """Parse social links from a <ul> element."""
    social = {}

    for li in ul.find_all('li'):
        link = li.find('a')
        if link:
            href = link.get('href', '').lower()
            url = link.get('href', '')

            if 'twitter.com' in href or 'x.com/' in href:
                social['twitter'] = url
            elif 'primal.net' in href or 'njump' in href or 'nprofile' in href or 'npub' in href:
                social['nostr'] = url
            elif 'linkedin.com' in href:
                social['linkedin'] = url
            elif 'github.com' in href:
                social['github'] = url

    return social


def is_podcast_link(url: str) -> bool:
    """Check if URL is a podcast/subscribe link we should skip."""
    url_lower = url.lower()
    skip_patterns = ['trustrevolution.co', 'fountain.fm/show', 'feeds.', 'podhome.fm',
                     'podcast.trustrevolution', 'subscribe']
    return any(p in url_lower for p in skip_patterns)


def parse_episode(item: ET.Element) -> dict:
    """Parse a single RSS item into episode data."""

    # Basic fields from RSS
    title = item.findtext('title', '')
    pub_date_str = item.findtext('pubDate', '')
    description_html = item.findtext('description', '')

    # Parse season/episode from title (more reliable than RSS metadata)
    season = 1
    episode_num = 0
    title_ep_match = re.match(r'S(\d+)E(\d+)', title, re.IGNORECASE)
    if title_ep_match:
        season = int(title_ep_match.group(1))
        episode_num = int(title_ep_match.group(2))
    else:
        season = int(item.findtext('itunes:season', '1', NAMESPACES))
        episode_num = int(item.findtext('itunes:episode', '0', NAMESPACES))

    duration_secs = item.findtext('itunes:duration', '0', NAMESPACES)

    # Image
    image_elem = item.find('itunes:image', NAMESPACES)
    image_url = image_elem.get('href', '') if image_elem is not None else ''

    # Audio
    enclosure = item.find('enclosure')
    audio_url = ''
    if enclosure is not None and enclosure.get('type', '').startswith('audio'):
        audio_url = enclosure.get('url', '')

    # Video (from alternateEnclosure)
    video_url = ''
    for alt_enc in item.findall('podcast:alternateEnclosure', NAMESPACES):
        if alt_enc.get('type', '') == 'application/x-mpegURL':
            source = alt_enc.find('podcast:source', NAMESPACES)
            if source is not None:
                video_url = source.get('uri', '')
                break

    # Transcript
    transcript_elem = item.find('podcast:transcript', NAMESPACES)
    transcript_url = transcript_elem.get('url', '') if transcript_elem is not None else ''

    # Fountain episode URL - map hosting_id from RSS to actual Fountain episode ID
    fountain_url = ''
    if audio_url:
        id_match = re.search(r'/items/([^/]+)/', audio_url)
        if id_match:
            hosting_id = id_match.group(1)
            fountain_id = FOUNTAIN_EPISODE_MAP.get(hosting_id, '')
            if fountain_id:
                fountain_url = f'https://fountain.fm/episode/{fountain_id}'

    # Parse date
    try:
        pub_date = datetime.strptime(pub_date_str, '%a, %d %b %Y %H:%M:%S %Z')
    except ValueError:
        try:
            pub_date = datetime.strptime(pub_date_str, '%a, %d %b %Y %H:%M:%S %z')
        except ValueError:
            pub_date = datetime.now()

    # Extract guest name and subtitle from title
    guest_name = ''
    subtitle = ''

    # Remove SxxExx prefix
    title_without_ep = re.sub(r'^S\d+E\d+\s*', '', title).strip()

    # Check if there's a dash separating guest from subtitle
    dash_match = re.search(r'^(.+?)\s*[–—‒−-]\s*(.+)$', title_without_ep)
    if dash_match:
        potential_guest = dash_match.group(1).strip()
        potential_subtitle = dash_match.group(2).strip()

        if potential_guest:
            # Has text before dash = guest episode
            guest_name = potential_guest
            subtitle = potential_subtitle
        else:
            # Nothing before dash (e.g., "– Privacy's last stand") = solo
            subtitle = potential_subtitle
    else:
        # No dash = solo episode, whole thing is the title
        subtitle = title_without_ep

    # Strip honorifics from guest name
    guest_name_clean = strip_honorifics(guest_name)

    # Parse structured shownotes
    shownotes = parse_shownotes(description_html)

    # Build final title (use em-dash consistently, with cleaned guest name)
    if guest_name and subtitle:
        clean_title = f"{guest_name_clean} – {subtitle}"
    elif subtitle:
        clean_title = subtitle
    elif guest_name:
        clean_title = guest_name_clean
    else:
        clean_title = re.sub(r'^S\d+E\d+\s*[–—-]?\s*', '', title).strip()

    # Use hook for description, or truncate summary
    description = shownotes['hook'][:120] if shownotes['hook'] else ''
    if not description and shownotes['summary']:
        # Take first sentence
        sentences = re.split(r'(?<=[.!?])\s+', shownotes['summary'])
        description = sentences[0][:120] if sentences else shownotes['summary'][:120]

    episode_data = {
        'title': clean_title,
        'date': pub_date.strftime('%Y-%m-%d'),
        'draft': False,
        'season': season,
        'episode': episode_num,
        'description': description,
        'summary': shownotes['summary'] or description,
        'featured_image': image_url,
        'audio_url': audio_url,
        'video_url': video_url,
        'duration': parse_duration(int(duration_secs)) if duration_secs.isdigit() else duration_secs,
        'fountain_url': fountain_url,
    }

    # Add transcript URL
    if transcript_url:
        episode_data['transcript_url'] = transcript_url

    # Add guest fields if there's a guest
    if guest_name:
        episode_data['guest'] = {'name': guest_name_clean}
        episode_data['guests'] = [guest_name_clean]

        # Add bio (no truncation!)
        if shownotes['bio']:
            episode_data['guest']['bio'] = shownotes['bio']

        # Add social links
        if shownotes['social']:
            episode_data['guest']['social'] = shownotes['social']

    # Add ONE key quote only (first one)
    if shownotes['quotes']:
        quote = shownotes['quotes'][0]
        # Extract attribution if present (quote — Name format)
        attribution = guest_name_clean if guest_name else 'Shawn Yeager'
        if ' — ' in quote:
            parts = quote.rsplit(' — ', 1)
            if len(parts) == 2 and len(parts[1]) < 50:
                quote = parts[0].strip()
                attribution = parts[1].strip()

        episode_data['key_quote'] = {
            'text': quote.strip('""\'"'),
            'attribution': strip_honorifics(attribution),
        }

    # Add timestamps
    if shownotes['timestamps']:
        episode_data['timestamps'] = shownotes['timestamps']

    # Add resources
    if shownotes['resources']:
        episode_data['resources'] = shownotes['resources'][:10]

    return episode_data


def format_yaml_value(value, indent=0) -> str:
    """Format a value for YAML output."""
    prefix = '  ' * indent

    if value is None:
        return 'null'
    elif isinstance(value, bool):
        return 'true' if value else 'false'
    elif isinstance(value, int):
        return str(value)
    elif isinstance(value, str):
        # Check if value needs quoting
        needs_quotes = any(c in value for c in [':', '#', '{', '}', '[', ']', ',', '&', '*', '?', '|', '<', '>', '=', '!', '%', '@', '`', '"', "'"])
        needs_quotes = needs_quotes or value.startswith('-') or value.startswith(' ') or value.endswith(' ') or value == ''

        if needs_quotes:
            escaped = value.replace('\\', '\\\\').replace('"', '\\"')
            return f'"{escaped}"'
        return value
    elif isinstance(value, list):
        if not value:
            return '[]'
        lines = []
        for item in value:
            if isinstance(item, dict):
                first = True
                for k, v in item.items():
                    if first:
                        lines.append(f"- {k}: {format_yaml_value(v)}")
                        first = False
                    else:
                        lines.append(f"  {k}: {format_yaml_value(v)}")
            else:
                lines.append(f"- {format_yaml_value(item)}")
        return '\n' + '\n'.join(prefix + line for line in lines)
    elif isinstance(value, dict):
        if not value:
            return '{}'
        lines = []
        for k, v in value.items():
            if v is not None:
                formatted = format_yaml_value(v, indent + 1)
                if isinstance(v, (dict, list)) and v:
                    lines.append(f"{k}:{formatted}")
                else:
                    lines.append(f"{k}: {formatted}")
        return '\n' + '\n'.join(prefix + '  ' + line for line in lines)
    return str(value)


def write_markdown(episode_data: dict, dry_run: bool = False) -> Path:
    """Write episode data to Hugo markdown file."""
    season = episode_data['season']
    episode = episode_data['episode']
    guest_name = episode_data.get('guest', {}).get('name', '')
    title = episode_data.get('title', '')

    # Use guest name for slug, or title for solo episodes
    slug_source = guest_name if guest_name else title
    slug = make_slug(slug_source) if slug_source else 'episode'
    filename = f"s{season:02d}e{episode:02d}-{slug}.md"
    filepath = OUTPUT_DIR / filename

    yaml_lines = ['---']

    field_order = ['title', 'date', 'draft', 'season', 'episode', 'description', 'summary',
                   'featured_image', 'audio_url', 'video_url', 'duration', 'transcript_url',
                   'fountain_url', 'guest', 'guests', 'key_quote', 'timestamps', 'resources']

    for field in field_order:
        if field in episode_data and episode_data[field] is not None:
            value = episode_data[field]
            formatted = format_yaml_value(value)
            if isinstance(value, (dict, list)) and value:
                yaml_lines.append(f"{field}:{formatted}")
            else:
                yaml_lines.append(f"{field}: {formatted}")

    yaml_lines.append('---')
    yaml_lines.append('')
    # No body content - templates render everything from frontmatter

    content = '\n'.join(yaml_lines)

    if dry_run:
        print(f"\n{'='*60}")
        print(f"Would write: {filepath}")
        print('='*60)
        print(content[:800] + ('...' if len(content) > 800 else ''))
    else:
        filepath.write_text(content)
        print(f"  Written: {filepath.name}")

    return filepath


def main():
    parser = argparse.ArgumentParser(description='Populate Hugo episode pages from RSS feed')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing files')
    parser.add_argument('--limit', type=int, help='Process only N episodes')
    args = parser.parse_args()

    print("Fetching RSS feed...")
    root = fetch_rss()

    items = root.findall('.//item')
    print(f"Found {len(items)} episodes")

    if args.limit:
        items = items[:args.limit]
        print(f"Processing first {args.limit}")

    if not args.dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for i, item in enumerate(items, 1):
        title = item.findtext('title', 'Unknown')
        print(f"\n[{i}/{len(items)}] {title[:50]}...")

        try:
            episode_data = parse_episode(item)
            write_markdown(episode_data, args.dry_run)
        except Exception as e:
            print(f"  Error: {e}")
            import traceback
            traceback.print_exc()
            continue

    print(f"\n{'='*60}")
    print(f"Processed {len(items)} episodes")


if __name__ == "__main__":
    main()
