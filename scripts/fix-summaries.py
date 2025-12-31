#!/usr/bin/env python3
"""
Fix episode summaries by pulling actual paragraph structure from RSS.
"""

import re
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path
import requests

def fetch_rss():
    """Fetch RSS feed."""
    url = "https://feeds.fountain.fm/OIYZniSDb9jd3Pb78CpF"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    response.encoding = 'utf-8'
    return response.text

def extract_summary_paragraphs(description_html):
    """Extract paragraph text from HTML description - just the summary, not bio/quotes."""
    html = unescape(description_html)
    paragraphs = []

    # Split by </p>
    parts = re.split(r'</p>', html, flags=re.IGNORECASE)

    # Skip patterns that indicate we've left the summary section
    stop_patterns = [
        'ABOUT THE GUEST', 'ABOUT ', 'Guest Bio', 'Guest Background',
        'KEY QUOTES', 'KEY TAKEAWAYS', 'TIMESTAMPS', 'RESOURCES',
        'MENTIONED IN', 'Highlights', 'Key Highlights', 'In This Episode',
        'Privacy-Preserving', 'Guest', 'Episode Summary'
    ]

    for part in parts:
        match = re.search(r'<p[^>]*>(.*)', part, re.IGNORECASE | re.DOTALL)
        if match:
            text = match.group(1).strip()
            text = re.sub(r'<[^>]+>', '', text)

            if not text:
                continue

            # Stop if we hit a section header
            if any(pattern.lower() in text.lower()[:50] for pattern in stop_patterns):
                break

            # Skip timestamps and bullets
            if re.match(r'^\d{1,2}:\d{2}', text) or text.startswith('•'):
                continue

            paragraphs.append(text)

    return paragraphs[:2] if paragraphs else []

def parse_rss(rss_content):
    """Parse RSS and extract episode summaries."""
    rss_content = re.sub(r'xmlns="[^"]+"', '', rss_content)
    root = ET.fromstring(rss_content)

    episodes = {}
    for item in root.findall('.//item'):
        title_elem = item.find('title')
        desc_elem = item.find('description')

        if title_elem is not None and desc_elem is not None:
            title = title_elem.text or ""
            description = desc_elem.text or ""

            match = re.match(r'S(\d+)E(\d+)', title)
            if match:
                season = int(match.group(1))
                episode = int(match.group(2))
                key = f"s{season:02d}e{episode:02d}"

                paragraphs = extract_summary_paragraphs(description)
                if paragraphs:
                    episodes[key] = paragraphs

    return episodes

def update_episode_file(filepath, paragraphs):
    """Update episode file with properly formatted summary."""
    content = filepath.read_text(encoding='utf-8')

    # Build YAML multiline string
    lines = ['summary: |']
    for para in paragraphs:
        lines.append(f'  {para}')
        lines.append('')

    # Remove trailing empty line, add newline at end
    if lines[-1] == '':
        lines.pop()
    summary_yaml = '\n'.join(lines) + '\n'

    # Replace existing summary line
    new_content = re.sub(
        r'^summary:.*?\n(?=\w+:)',
        summary_yaml,
        content,
        flags=re.MULTILINE | re.DOTALL
    )

    if new_content != content:
        filepath.write_text(new_content, encoding='utf-8')
        return True
    return False

def main():
    print("Fetching RSS feed...")
    rss_content = fetch_rss()

    print("Parsing episodes...")
    episodes = parse_rss(rss_content)
    print(f"Found {len(episodes)} episodes with summaries")

    episodes_dir = Path(__file__).resolve().parent.parent / 'content' / 'episodes'

    updated = 0
    for filepath in sorted(episodes_dir.glob('*.md')):
        match = re.match(r'(s\d{2}e\d{2})', filepath.name)
        if match:
            key = match.group(1)
            if key in episodes:
                if update_episode_file(filepath, episodes[key]):
                    print(f"  Updated {filepath.name}")
                    updated += 1

    print(f"\nUpdated {updated} episodes")

if __name__ == '__main__':
    main()
