#!/usr/bin/env python3
"""
Generate chapter timestamps from SRT transcripts.
Uses regex-based frontmatter handling to avoid YAML parsing issues.
"""

import re
import sys
import requests
from pathlib import Path

def parse_srt(srt_content):
    """Parse SRT content into list of (start_time, text) tuples."""
    entries = []
    blocks = re.split(r'\n\n+', srt_content.strip())

    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            timestamp_match = re.match(r'(\d{2}):(\d{2}):(\d{2}),\d+', lines[1])
            if timestamp_match:
                hours, minutes, seconds = map(int, timestamp_match.groups())
                start_seconds = hours * 3600 + minutes * 60 + seconds
                text = ' '.join(lines[2:])
                entries.append((start_seconds, text))

    return entries

def seconds_to_timestamp(seconds):
    """Convert seconds to MM:SS or H:MM:SS format."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def group_into_chunks(entries, chunk_duration=300):
    """Group transcript entries into chunks."""
    chunks = []
    current_chunk = []
    chunk_start = 0

    for start_time, text in entries:
        if not current_chunk:
            chunk_start = start_time

        current_chunk.append(text)

        if start_time - chunk_start >= chunk_duration and current_chunk:
            chunks.append({
                'start': chunk_start,
                'text': ' '.join(current_chunk)
            })
            current_chunk = []

    if current_chunk:
        chunks.append({
            'start': chunk_start,
            'text': ' '.join(current_chunk)
        })

    return chunks

def extract_topics(chunks):
    """Extract topic summaries from chunks using keyword detection."""
    topic_keywords = {
        'bitcoin': 'Bitcoin discussion',
        'lightning': 'Lightning Network',
        'nostr': 'Nostr protocol',
        'privacy': 'Privacy concerns',
        'trust': 'Trust dynamics',
        'government': 'Government and policy',
        'regulation': 'Regulatory landscape',
        'surveillance': 'Surveillance systems',
        'cbdc': 'Central bank digital currencies',
        'money': 'Money and economics',
        'inflation': 'Inflation impact',
        'freedom': 'Freedom and liberty',
        'censorship': 'Censorship resistance',
        'decentraliz': 'Decentralization',
        'artificial intelligence': 'AI and technology',
        ' ai ': 'AI and technology',
        'identity': 'Digital identity',
        'kyc': 'KYC requirements',
        'aml': 'AML regulations',
        'self-custody': 'Self-custody',
        'wallet': 'Wallet technology',
        'network': 'Network effects',
        'swarm': 'Network swarms',
        'political': 'Political dynamics',
    }

    timestamps = []

    for i, chunk in enumerate(chunks):
        text_lower = chunk['text'].lower()
        topics_found = []

        for keyword, topic in topic_keywords.items():
            if keyword in text_lower and topic not in topics_found:
                topics_found.append(topic)
                if len(topics_found) >= 2:
                    break

        if topics_found:
            topic_str = topics_found[0]
        elif i == 0:
            topic_str = "Introduction and background"
        else:
            topic_str = "Continued discussion"

        timestamps.append({
            'time': seconds_to_timestamp(chunk['start']),
            'topic': topic_str
        })

    return timestamps

def fetch_transcript(url):
    """Fetch SRT transcript from URL."""
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.text

def format_timestamps_yaml(timestamps):
    """Format timestamps as YAML."""
    lines = ["timestamps:"]
    for ts in timestamps:
        lines.append(f'- time: "{ts["time"]}"')
        lines.append(f'  topic: "{ts["topic"]}"')
    return '\n'.join(lines)

def process_episode(episode_path):
    """Process a single episode file and add timestamps."""
    content = episode_path.read_text()

    # Check if already has timestamps
    if re.search(r'^timestamps:', content, re.MULTILINE):
        print(f"  Skipping {episode_path.name} - already has timestamps")
        return None

    # Extract transcript URL
    transcript_match = re.search(r'transcript_url:\s*["\']?([^"\'}\n]+)["\']?', content)
    if not transcript_match:
        print(f"  Skipping {episode_path.name} - no transcript URL")
        return None

    transcript_url = transcript_match.group(1).strip()
    print(f"  Processing {episode_path.name}...")

    try:
        # Fetch and parse transcript
        srt_content = fetch_transcript(transcript_url)
        entries = parse_srt(srt_content)

        if not entries:
            print(f"    No entries parsed from transcript")
            return None

        print(f"    Parsed {len(entries)} transcript entries")

        # Group into 5-minute chunks
        chunks = group_into_chunks(entries, chunk_duration=300)
        print(f"    Created {len(chunks)} chunks")

        # Extract topics
        timestamps = extract_topics(chunks)

        # Format as YAML
        timestamps_yaml = format_timestamps_yaml(timestamps)

        # Insert before resources: or at end of frontmatter
        if 'resources:' in content:
            new_content = content.replace('resources:', timestamps_yaml + '\nresources:')
        else:
            # Insert before closing --- of frontmatter
            # Find the closing --- at start of line
            match = re.search(r'\n---\s*\n', content[4:])  # Skip opening ---
            if not match:
                print(f"    Could not find frontmatter end")
                return None
            insert_pos = 4 + match.start() + 1  # +1 for the \n
            new_content = content[:insert_pos] + timestamps_yaml + '\n' + content[insert_pos:]

        return new_content

    except Exception as e:
        print(f"    Error: {e}")
        import traceback
        traceback.print_exc()
        return None

def main():
    episodes_dir = Path('/home/shawn/Work/trustrevolution-co/content/episodes')

    if len(sys.argv) > 1:
        episode_file = episodes_dir / sys.argv[1]
        if episode_file.exists():
            result = process_episode(episode_file)
            if result:
                episode_file.write_text(result)
                print(f"  Updated {episode_file.name}")
        else:
            print(f"File not found: {episode_file}")
    else:
        for episode_path in sorted(episodes_dir.glob('*.md')):
            result = process_episode(episode_path)
            if result:
                episode_path.write_text(result)
                print(f"  Updated {episode_path.name}")

if __name__ == '__main__':
    main()
