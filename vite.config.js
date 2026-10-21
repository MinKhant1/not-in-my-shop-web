import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const SCENE_FILE = 'scene-overrides.json';
const MAX_SCENE_BYTES = 2_000_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SCENE_BYTES) {
        reject(new Error('Scene file is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function listAssets(root) {
  const models = path.join(root, 'public');
  const assets = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) {
      return;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(glb|gltf)$/i.test(entry.name)) {
        continue;
      }
      const relative = path.relative(path.join(root, 'public'), full).split(path.sep).join('/');
      assets.push({
        url: `/${relative}`,
        name: entry.name,
        folder: path.posix.dirname(relative)
      });
    }
  };
  walk(models);
  assets.sort((left, right) => left.url.localeCompare(right.url));
  return assets;
}

function isSceneDocument(value) {
  return Boolean(value)
    && value.version === 1
    && Array.isArray(value.deleted)
    && value.deleted.every((id) => typeof id === 'string' && id.length < 200)
    && value.objects
    && typeof value.objects === 'object'
    && !Array.isArray(value.objects)
    && Array.isArray(value.added)
    && value.added.every((item) => item && typeof item.id === 'string');
}

function editorApi() {
  const handle = async (req, res, next, root) => {
    const url = (req.url || '').split('?')[0];
    if (url === '/__editor/assets' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ assets: listAssets(root) }));
      return;
    }
    if (url === '/__editor/scene' && req.method === 'POST') {
      try {
        const parsed = JSON.parse(await readBody(req));
        if (!isSceneDocument(parsed)) {
          res.statusCode = 400;
          res.end('Scene document is invalid');
          return;
        }
        const file = path.join(root, 'public', SCENE_FILE);
        const text = `${JSON.stringify(parsed, null, 2)}\n`;
        const temporary = `${file}.tmp`;
        fs.writeFileSync(temporary, text);
        try {
          fs.renameSync(temporary, file);
        } catch {
          fs.copyFileSync(temporary, file);
          fs.unlinkSync(temporary);
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.statusCode = 400;
        res.end(error.message || 'Could not save the scene');
      }
      return;
    }
    next();
  };

  return {
    name: 'scene-editor-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res, next, server.config.root).catch(next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res, next, server.config.root).catch(next);
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [editorApi()],
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'es2020'
  }
});
