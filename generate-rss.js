const fs = require('fs');
const path = require('path');
const musicMetadata = require('music-metadata');

// --- Helper Functions ---

const escapeXML = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '&':
                return '&amp;';
            case "'":
                return '&apos;';
            case '"':
                return '&quot;';
            default:
                return c;
        }
    });
};

const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    return new Date(seconds * 1000).toISOString().substr(11, 8);
};

// Determine MIME type based on file extension
const getMimeType = (extension) => {
    switch (extension.toLowerCase()) {
        case '.mp3':
            return 'audio/mpeg';
        case '.m4a':
            return 'audio/x-m4a';
        case '.mp4':
            return 'audio/x-m4a';
        default:
            return 'application/octet-stream'; // Generic fallback
    }
};

// --- Main Script Logic ---

async function generateRssFeed() {
    try {
        console.log('Starting RSS feed generation...');

        const config = JSON.parse(fs.readFileSync('config.json'));
        const chaptersDir = path.resolve(config.chaptersDirectory);
        const summaryFilePath = path.resolve('./summary.json');

        let summaries = [];
        if (fs.existsSync(summaryFilePath)) {
            summaries = JSON.parse(fs.readFileSync(summaryFilePath, 'utf8'));
            console.log(`Loaded ${summaries.length} summaries from summary.json.`);
        } else {
            console.warn(`Warning: summary.json not found at '${summaryFilePath}'. Episodes will have generic summaries.`);
        }

        const files = fs.readdirSync(chaptersDir).filter((file) => path.extname(file).toLowerCase() === config.fileExtension);

        if (files.length === 0) {
            console.error(`Error: No files with extension '${config.fileExtension}' found in '${chaptersDir}'.`);
            return;
        }

        console.log(`Found ${files.length} chapter file(s). Processing metadata...`);

        let episodes = [];
        for (const file of files) {
            const filePath = path.join(chaptersDir, file);
            const fileUrl = `${config.audioBaseURL}${encodeURIComponent(file)}`;
            const fileExt = path.extname(file).toLowerCase();

            const match = file.match(/^Chapter_(\d+)_(.+)\.\w+$/);
            if (!match) {
                console.warn(`Skipping file with incorrect format: ${file}. Expected "Chapter_#_Title.ext"`);
                continue;
            }
            const chapterNumber = parseInt(match[1], 10);
            const title = match[2].replace(/_/g, ' ');

            const stats = fs.statSync(filePath);
            const metadata = await musicMetadata.parseFile(filePath);

            let episodeSummary = `Chapter ${chapterNumber}: ${escapeXML(title)}.`; // Default generic

            episodes.push({
                title: escapeXML(title),
                chapterNumber,
                fileUrl,
                guid: fileUrl,
                pubDate: new Date(stats.mtime).toUTCString(),
                length: stats.size,
                duration: formatDuration(metadata.format.duration),
                mimeType: getMimeType(fileExt), // Dynamically set MIME type
                originalSummary: episodeSummary,
            });
        }

        episodes.sort((a, b) => a.chapterNumber - b.chapterNumber);

        episodes = episodes.map((episode, index) => {
            episode.summary = escapeXML(summaries[index]) || episode.originalSummary;
            return episode;
        });

        const podcastSubtitle = 'Principles and Knowledge of AI'; // Example subtitle

        const itemXml = episodes
            .map(
                (episode) => `
    <item>
      <title>${episode.title}</title>
      <pubDate>${episode.pubDate}</pubDate>
      <guid isPermaLink="false">${episode.guid}</guid>
      <enclosure url="${episode.fileUrl}" length="${episode.length}" type="${episode.mimeType}" />
      <itunes:duration>${episode.duration}</itunes:duration>
      <itunes:summary>${episode.summary}</itunes:summary>
      <description>${episode.summary}</description>
      <itunes:episode>${episode.chapterNumber}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
    </item>`
            )
            .join('');

        const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXML(config.podcastTitle)}</title>
    <link>${config.podcastLink}</link>
    <language>en-us</language>
    <itunes:author>${escapeXML(config.author)}</itunes:author>
    <itunes:subtitle>${escapeXML(podcastSubtitle)}</itunes:subtitle> <description>${escapeXML(
            config.podcastDescription
        )}</description>
    <itunes:owner>
      <itunes:name>${escapeXML(config.author)}</itunes:name>
    </itunes:owner>
    <itunes:image href="${config.coverArtURL}" />
    <itunes:category text="Education"/>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type> ${itemXml}
  </channel>
</rss>`;

        fs.writeFileSync(config.outputFile, rssXml);
        console.log(`✅ RSS feed successfully generated and saved to ${config.outputFile}`);
    } catch (error) {
        console.error('❌ An error occurred:', error);
    }
}

generateRssFeed();
