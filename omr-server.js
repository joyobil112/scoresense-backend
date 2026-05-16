/**
 * ScoreSense — OMR Backend
 * Converts PDF / image sheet music → MusicXML via Audiveris
 *
 * Setup:
 *   npm install
 *   node omr-server.js
 *
 * Environment variables:
 *   PORT            — default 3001
 *   AUDIVERIS_PATH  — path to audiveris binary (default: "audiveris" on PATH)
 *   ALLOWED_ORIGIN  — your Netlify URL e.g. https://scoresense.netlify.app
 */

const express   = require('express');
const multer    = require('multer');
const cors      = require('cors');
const { exec }  = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { v4: uuid } = require('uuid');

// ── CONFIG ────────────────────────────────────────────────────────────────────

const PORT           = process.env.PORT || 3001;
const AUDIVERIS_CMD  = process.env.AUDIVERIS_PATH || 'audiveris';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_FILE_MB    = 20;
const TIMEOUT_MS     = 120_000; // Audiveris can take up to 2 min on complex scores

// ── APP SETUP ─────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? '*' : [ALLOWED_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:5500'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|png|jpg|jpeg)$/i.test(file.originalname);
    cb(allowed ? null : new Error('Only PDF, PNG, JPG files are accepted'), allowed);
  },
});

// ── ROUTES ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ service: 'ScoreSense OMR', status: 'running', version: '1.0.0' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const jobId     = uuid();
  const ext       = path.extname(req.file.originalname).toLowerCase();
  const tmpDir    = path.join(os.tmpdir(), `scoresense-${jobId}`);
  const inputPath = path.join(tmpDir, `input${ext}`);
  const outputDir = path.join(tmpDir, 'out');

  console.log(`[${jobId}] Converting: ${req.file.originalname} (${(req.file.size/1024).toFixed(1)} KB)`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(inputPath, req.file.buffer);

    const musicxml = await runAudiveris(inputPath, outputDir, jobId);

    console.log(`[${jobId}] Done — ${musicxml.length} chars`);
    res.json({ musicxml, jobId, filename: req.file.originalname });

  } catch (err) {
    console.error(`[${jobId}] Error:`, err.message);
    res.status(500).json({ error: err.message || 'OMR conversion failed' });

  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
});

// ── AUDIVERIS RUNNER ──────────────────────────────────────────────────────────

function runAudiveris(inputPath, outputDir, jobId) {
  return new Promise((resolve, reject) => {
    // -batch: no GUI  |  -export: write output  |  -output: where to write
    const cmd = `"${AUDIVERIS_CMD}" -batch -export -output "${outputDir}" "${inputPath}"`;
    console.log(`[${jobId}] CMD: ${cmd}`);

    exec(cmd, { timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err && !fs.existsSync(outputDir)) {
        return reject(new Error('Audiveris process failed: ' + (stderr?.slice(0, 300) || err.message)));
      }

      let files;
      try { files = fs.readdirSync(outputDir); } catch(_) { files = []; }

      // Prefer .xml; fall back to .mxl
      const xmlFile = files.find(f => f.endsWith('.xml')) || files.find(f => f.endsWith('.mxl'));

      if (!xmlFile) {
        const hint = err ? `Audiveris error: ${err.message}` : 'No output file produced';
        return reject(new Error(`OMR produced no output. ${hint}. Is Audiveris installed?`));
      }

      const content = fs.readFileSync(path.join(outputDir, xmlFile), 'utf-8');

      // Basic zip check (.mxl files start with PK)
      if (content.charCodeAt(0) === 80 && content.charCodeAt(1) === 75) {
        return reject(new Error('.mxl output is a zip archive. Use Audiveris 5.3+ which outputs plain XML, or add the adm-zip dependency.'));
      }

      resolve(content);
    });
  });
}

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File too large — max ${MAX_FILE_MB} MB` });
  res.status(400).json({ error: err.message });
});

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nScoreSense OMR server on http://localhost:${PORT}`);
  console.log(`  POST /convert — upload PDF/image, receive MusicXML`);
  console.log(`  GET  /health  — health check`);
  console.log(`  Allowed origin: ${ALLOWED_ORIGIN}\n`);

  exec(`"${AUDIVERIS_CMD}" --version`, (err, stdout) => {
    if (err) {
      console.warn('⚠️  Audiveris not found. Install it before conversions will work.');
      console.warn('   Mac:     brew install audiveris');
      console.warn('   Linux:   see github.com/Audiveris/audiveris/releases');
      console.warn('   Or set AUDIVERIS_PATH env var to the full binary path.\n');
    } else {
      console.log('✓ Audiveris:', stdout.trim().split('\n')[0], '\n');
    }
  });
});
