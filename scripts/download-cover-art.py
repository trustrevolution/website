#!/usr/bin/env python3
"""Download episode cover art from Fountain CDN and update frontmatter."""

import os
import re
import urllib.request
from pathlib import Path

CONTENT_DIR = Path(__file__).parent.parent / "content" / "episodes"
ASSETS_DIR = Path(__file__).parent.parent / "assets" / "images" / "cover-art"

def extract_frontmatter(content):
    """Extract frontmatter from markdown file."""
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if match:
        return match.group(1), content[match.end():]
    return None, content

def get_featured_image_url(frontmatter):
    """Extract featured_image URL from frontmatter."""
    match = re.search(r'featured_image:\s*["\']?(https?://[^"\']+)["\']?', frontmatter)
    if match:
        return match.group(1)
    return None

def download_image(url, dest_path):
    """Download image from URL to destination path."""
    try:
        print(f"  Downloading: {url[:60]}...")
        urllib.request.urlretrieve(url, dest_path)
        size_kb = os.path.getsize(dest_path) / 1024
        print(f"  Saved: {dest_path.name} ({size_kb:.1f} KB)")
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False

def update_frontmatter(content, old_url, new_path):
    """Replace featured_image URL with local path in content."""
    # Handle both quoted and unquoted URLs
    pattern = rf'(featured_image:\s*)["\']?{re.escape(old_url)}["\']?'
    replacement = rf'\1"{new_path}"'
    return re.sub(pattern, replacement, content)

def main():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    episodes = list(CONTENT_DIR.glob("*.md"))
    print(f"Found {len(episodes)} episodes\n")

    downloaded = 0
    skipped = 0
    errors = 0

    for ep_file in sorted(episodes):
        # Get episode ID from filename (e.g., s01e01 from s01e01-john-robb.md)
        ep_id = ep_file.stem.split('-')[0]  # s01e01, s02e05, etc.

        print(f"Processing {ep_file.name}...")

        content = ep_file.read_text()
        frontmatter, body = extract_frontmatter(content)

        if not frontmatter:
            print("  No frontmatter found, skipping")
            skipped += 1
            continue

        url = get_featured_image_url(frontmatter)

        if not url:
            print("  No featured_image URL found, skipping")
            skipped += 1
            continue

        if not url.startswith("http"):
            print(f"  Already local: {url}")
            skipped += 1
            continue

        # Determine file extension from URL
        ext = ".jpg"  # Default to jpg
        if ".png" in url.lower():
            ext = ".png"
        elif ".webp" in url.lower():
            ext = ".webp"

        dest_path = ASSETS_DIR / f"{ep_id}{ext}"
        local_path = f"images/cover-art/{ep_id}{ext}"

        # Download if not exists
        if not dest_path.exists():
            if download_image(url, dest_path):
                downloaded += 1
            else:
                errors += 1
                continue
        else:
            print(f"  Already downloaded: {dest_path.name}")

        # Update frontmatter
        new_content = update_frontmatter(content, url, local_path)
        if new_content != content:
            ep_file.write_text(new_content)
            print(f"  Updated frontmatter -> {local_path}")

    print(f"\n{'='*50}")
    print(f"Downloaded: {downloaded}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    main()
