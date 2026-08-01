#!/usr/bin/env node
/**
 * Upload the prepared archive to Cloudflare R2.
 *
 * Talks to R2's S3-compatible API with SigV4 signing. R2's object-scoped tokens
 * only authenticate against the S3 API -- Cloudflare's REST API rejects them --
 * and the REST API is rate limited and unsuited to multi-gigabyte objects
 * regardless. Multipart is used above the threshold so a 2 GB video is not one
 * fragile request.
 *
 * Credentials come from .env in the project root, which .gitignore already
 * covers. Never from arguments or this source.
 *
 *   umask 077 && cat > .env <<'EOF'
 *   R2_ACCESS_KEY_ID=...
 *   R2_SECRET_ACCESS_KEY=...
 *   EOF
 *
 * Usage:
 *   node scripts/upload-r2.js --dry-run
 *   node scripts/upload-r2.js
 *   node scripts/upload-r2.js --only audio
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '70a9d44ef71d9e0d01ab352b2547547f';
const BUCKET = process.env.R2_BUCKET || 'trust-revolution-media';
const REGION = 'auto';
const HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const ARCHIVE_DIR =
  process.env.ARCHIVE_DIR ||
  path.join(os.homedir(), 'Archive', 'trust-revolution-fountain');

/**
 * .env in the project root, which .gitignore covers. The old home-directory
 * path is still honoured so an existing setup keeps working.
 */
const CREDS_CANDIDATES = [
  process.env.R2_CREDS,
  path.join(__dirname, '..', '.env'),
  path.join(os.homedir(), '.config', 'r2-trustrevolution.env')
].filter(Boolean);

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i !== -1 ? process.argv[i + 1] : null;
})();

/** Multipart above this; R2 requires parts of at least 5 MiB except the last. */
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 64 * 1024 * 1024;
const MAX_RETRIES = 4;

/**
 * These files never change once published, so they are cached hard. The audio
 * and video content types matter more than they look: a wrong type on an MP3
 * makes podcast apps refuse the enclosure.
 */
const CONTENT_TYPES = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.xml': 'application/rss+xml'
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function loadCredentials() {
  const found = CREDS_CANDIDATES.find((p) => fs.existsSync(p));

  if (!found) {
    throw new Error(
      `no credentials file found. Looked in:\n` +
        CREDS_CANDIDATES.map((p) => `  ${p}`).join('\n') +
        `\nCreate an Account API token with Object Read & Write scoped to ${BUCKET}, then:\n` +
        `  umask 077 && cat > .env <<'EOF'\n` +
        `  R2_ACCESS_KEY_ID=...\n  R2_SECRET_ACCESS_KEY=...\n  EOF`
    );
  }

  const env = {};
  for (const line of fs.readFileSync(found, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }

  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(`${found} must define R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY`);
  }

  console.log(`Creds:    ${found.replace(os.homedir(), '~')}`);
  return { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY };
}

/* ------------------------------------------------------------------ *
 * SigV4
 * ------------------------------------------------------------------ */

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function encodeKey(key) {
  // Each path segment is encoded, but the separators are not.
  return key.split('/').map(encodeURIComponent).join('/');
}

function sign({ method, key, query = {}, payloadHash, headers = {}, creds }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${BUCKET}/${encodeKey(key)}`;
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&');

  const allHeaders = {
    host: HOST,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers
  };

  const sortedNames = Object.keys(allHeaders).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = sortedNames
    .map((h) => `${h}:${String(allHeaders[Object.keys(allHeaders).find((k) => k.toLowerCase() === h)]).trim()}\n`)
    .join('');
  const signedHeaders = sortedNames.join(';');

  const canonicalRequest = [
    method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)
  ].join('\n');

  let k = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  k = hmac(k, REGION);
  k = hmac(k, 's3');
  k = hmac(k, 'aws4_request');
  const signature = crypto.createHmac('sha256', k).update(stringToSign).digest('hex');

  return {
    url: `https://${HOST}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`,
    headers: {
      ...allHeaders,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  };
}

async function s3(opts) {
  const { body, ...rest } = opts;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const signed = sign(rest);
    try {
      const res = await fetch(signed.url, {
        method: rest.method,
        headers: signed.headers,
        body: body ?? undefined
      });

      // Headers must be captured before the body is read, and the body must
      // always be drained -- leaving it unconsumed holds the connection open
      // and the pool runs dry partway through a few hundred objects.
      const contentLength = res.headers.get('content-length');
      const contentRange = res.headers.get('content-range');
      const etag = res.headers.get('etag');
      const text = await res.text().catch(() => '');

      if (res.ok) {
        return { status: res.status, contentLength, contentRange, etag, headers: res.headers, text };
      }
      lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
      // 4xx other than 429 will not improve on retry.
      if (res.status < 500 && res.status !== 429) throw lastError;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) break;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastError;
}

/* ------------------------------------------------------------------ *
 * Upload
 * ------------------------------------------------------------------ */

const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

/**
 * Size lookup via a one-byte ranged GET rather than HEAD.
 *
 * HEAD works against R2, but Node's fetch does not reliably surface
 * content-length on a HEAD response -- it comes back null for some content
 * types, which silently reads as a zero-byte object and fails every size check.
 * A `Range: bytes=0-0` request returns 206 with `content-range: bytes 0-0/N`,
 * where N is authoritative. It also proves the object serves ranged requests,
 * which is what podcast players and video seeking depend on.
 */
async function headObject(key, creds) {
  try {
    const res = await s3({
      method: 'GET',
      key,
      payloadHash: EMPTY_SHA256,
      headers: { range: 'bytes=0-0' },
      creds
    });
    const total = (res.contentRange || '').match(/\/(\d+)\s*$/);
    return { exists: true, size: total ? parseInt(total[1], 10) : 0, ranged: res.status === 206 };
  } catch (err) {
    // A genuine 404 means "not uploaded yet". Anything else is a real fault and
    // must not be silently reported as a missing object.
    if (!/HTTP 404/.test(err.message)) {
      throw new Error(`range check on ${key} failed: ${err.message}`);
    }
    return { exists: false, size: 0, ranged: false };
  }
}

async function putSimple(key, file, contentType, creds) {
  const body = fs.readFileSync(file);
  await s3({
    method: 'PUT',
    key,
    payloadHash: sha256hex(body),
    headers: { 'content-type': contentType, 'cache-control': CACHE_CONTROL },
    body,
    creds
  });
  return body.length;
}

async function putMultipart(key, file, contentType, creds, onProgress) {
  const size = fs.statSync(file).size;

  const init = await s3({
    method: 'POST',
    key,
    query: { uploads: '' },
    payloadHash: sha256hex(''),
    headers: { 'content-type': contentType, 'cache-control': CACHE_CONTROL },
    creds
  });
  const uploadId = (init.text.match(/<UploadId>([^<]+)<\/UploadId>/) || [])[1];
  if (!uploadId) throw new Error(`no UploadId returned for ${key}`);

  const fd = fs.openSync(file, 'r');
  const parts = [];
  try {
    let offset = 0;
    let partNumber = 1;
    while (offset < size) {
      const length = Math.min(PART_SIZE, size - offset);
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, offset);

      const res = await s3({
        method: 'PUT',
        key,
        query: { partNumber: String(partNumber), uploadId },
        payloadHash: sha256hex(buf),
        body: buf,
        creds
      });
      const etag = res.etag;
      if (!etag) throw new Error(`no ETag for part ${partNumber} of ${key}`);
      parts.push({ partNumber, etag });

      offset += length;
      partNumber += 1;
      if (onProgress) onProgress(offset, size);
    }
  } catch (err) {
    await s3({ method: 'DELETE', key, query: { uploadId }, payloadHash: sha256hex(''), creds }).catch(() => {});
    throw err;
  } finally {
    fs.closeSync(fd);
  }

  const xml =
    '<CompleteMultipartUpload>' +
    parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('') +
    '</CompleteMultipartUpload>';

  await s3({
    method: 'POST',
    key,
    query: { uploadId },
    payloadHash: sha256hex(xml),
    headers: { 'content-type': 'application/xml' },
    body: xml,
    creds
  });

  return size;
}

function collect() {
  const groups = {
    audio: 'audio',
    video: 'video',
    transcripts: 'transcripts',
    captions: 'captions',
    chapters: 'chapters',
    art: 'art'
  };
  const files = [];
  for (const [dir, prefix] of Object.entries(groups)) {
    if (ONLY && ONLY !== dir) continue;
    const full = path.join(ARCHIVE_DIR, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full).sort()) {
      const file = path.join(full, name);
      if (!fs.statSync(file).isFile()) continue;
      files.push({ file, key: `${prefix}/${name}`, size: fs.statSync(file).size });
    }
  }
  return files;
}

async function main() {
  const creds = loadCredentials();
  const files = collect();
  const total = files.reduce((n, f) => n + f.size, 0);

  console.log(`Bucket:   ${BUCKET}`);
  console.log(`Source:   ${ARCHIVE_DIR}`);
  console.log(`Objects:  ${files.length}   ${(total / 1073741824).toFixed(1)} GB${DRY_RUN ? '   (dry run)' : ''}\n`);

  if (DRY_RUN) {
    for (const f of files.slice(0, 10)) {
      console.log(`  ${f.key.padEnd(46)} ${(f.size / 1048576).toFixed(1)} MB`);
    }
    if (files.length > 10) console.log(`  ... and ${files.length - 10} more`);
    return;
  }

  let uploaded = 0, skipped = 0, bytes = 0;
  const failures = [];

  for (const [i, f] of files.entries()) {
    const contentType = CONTENT_TYPES[path.extname(f.file).toLowerCase()] || 'application/octet-stream';
    const label = `[${i + 1}/${files.length}] ${f.key}`;

    const existing = await headObject(f.key, creds);
    if (existing.exists && existing.size === f.size) {
      skipped += 1;
      console.log(`${label} — already present`);
      continue;
    }

    process.stdout.write(`${label} (${(f.size / 1048576).toFixed(0)} MB) ... `);
    const started = Date.now();
    try {
      if (f.size > MULTIPART_THRESHOLD) {
        await putMultipart(f.key, f.file, contentType, creds);
      } else {
        await putSimple(f.key, f.file, contentType, creds);
      }
    } catch (err) {
      failures.push(`${f.key}: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
      continue;
    }

    // Trust the bucket, not the upload call: confirm the stored size matches.
    const check = await headObject(f.key, creds);
    if (!check.exists || check.size !== f.size) {
      failures.push(`${f.key}: stored ${check.size} bytes, expected ${f.size}`);
      console.log(`SIZE MISMATCH: stored ${check.size}, expected ${f.size}`);
      continue;
    }

    uploaded += 1;
    bytes += f.size;
    const secs = (Date.now() - started) / 1000;
    console.log(`ok  ${(f.size / 1048576 / secs).toFixed(1)} MB/s`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Uploaded: ${uploaded}   already present: ${skipped}   failed: ${failures.length}`);
  console.log(`Transferred: ${(bytes / 1073741824).toFixed(2)} GB`);

  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f}`);
    throw new Error(`${failures.length} upload failure(s)`);
  }
  console.log('\nAll objects uploaded and size-verified.');
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
