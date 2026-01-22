const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const FOUNTAIN_RSS_URL = 'https://feeds.fountain.fm/OIYZniSDb9jd3Pb78CpF';

async function updateEpisodeData() {
  const parser = new Parser({
    customFields: {
      item: [
        ['itunes:duration', 'duration'],
        ['itunes:image', 'image']
      ]
    }
  });

  try {
    // Fetch RSS feed
    const feed = await parser.parseURL(FOUNTAIN_RSS_URL);

    // Get latest episode
    const latestEpisode = feed.items[0];

    // Build data object (metadata only - no media URLs needed)
    const episodeData = {
      title: latestEpisode.title,
      pubDate: latestEpisode.pubDate,
      duration: latestEpisode.duration || null,
      artwork: latestEpisode.image?.href || latestEpisode.itunes?.image || null,
      link: latestEpisode.link,
      description: latestEpisode.contentSnippet || latestEpisode.description
    };

    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Only write if data actually changed
    const latestEpisodePath = path.join(dataDir, 'latest_episode.json');
    const existingData = fs.existsSync(latestEpisodePath)
      ? JSON.parse(fs.readFileSync(latestEpisodePath, 'utf8'))
      : null;

    if (JSON.stringify(episodeData) !== JSON.stringify(existingData)) {
      fs.writeFileSync(latestEpisodePath, JSON.stringify(episodeData, null, 2));
      console.log('Episode data updated');
    } else {
      console.log('Episode data unchanged, skipping write');
    }

    // Cache full RSS data (always update for episode creation script)
    fs.writeFileSync(
      path.join(dataDir, 'fountain_rss.json'),
      JSON.stringify(feed.items, null, 2)
    );

    console.log('Successfully updated episode data');
    console.log(`Latest episode: ${episodeData.title}`);

  } catch (error) {
    console.error('Error updating episode data:', error);
    process.exit(1);
  }
}

updateEpisodeData();
