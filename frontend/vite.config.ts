import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const apiPlugin = () => ({
  name: 'api-plugin',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      // Add CORS just in case
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.url === '/api/courses' && req.method === 'GET') {
        const filePath = path.resolve(__dirname, 'src/data/courses.json');
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(filePath, 'utf-8'));
        } else {
          res.statusCode = 404;
          res.end('{}');
        }
        return;
      }

      if (req.url === '/api/courses' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', () => {
          fs.writeFileSync(path.resolve(__dirname, 'src/data/courses.json'), body);
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      if (req.url.startsWith('/api/lesson/') && req.method === 'GET') {
        const parts = req.url.split('/');
        const courseId = parts[3];
        const lessonId = parts[4];
        const filePath = path.resolve(__dirname, `src/data/content/${courseId}/lesson-${lessonId}/lessonContent.json`);

        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(filePath, 'utf-8'));
        } else {
          // If the specific lesson content doesn't exist, use the fallback
          const fallbackPath = path.resolve(__dirname, 'src/data/lessonContent.json');
          if (fs.existsSync(fallbackPath)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(fs.readFileSync(fallbackPath, 'utf-8'));
          } else {
            res.statusCode = 404;
            res.end('{}');
          }
        }
        return;
      }

      if (req.url.startsWith('/api/lesson/') && req.method === 'POST') {
        const parts = req.url.split('/');
        const courseId = parts[3];
        const lessonId = parts[4];
        const dirPath = path.resolve(__dirname, `src/data/content/${courseId}/lesson-${lessonId}`);

        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.resolve(__dirname, `src/data/content/${courseId}/lesson-${lessonId}/lessonContent.json`);
        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', () => {
          fs.writeFileSync(filePath, body);
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      if (req.url.startsWith('/api/upload/') && req.method === 'POST') {
        const parts = req.url.split('/');
        const courseId = parts[3];
        const lessonId = parts[4];
        const filename = req.headers['x-filename'] as string;
        const dirPath = path.resolve(__dirname, `src/data/content/${courseId}/lesson-${lessonId}`);

        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.resolve(dirPath, filename);
        const fileStream = fs.createWriteStream(filePath);
        req.pipe(fileStream);

        req.on('end', () => {
          res.end(JSON.stringify({ success: true, filename }));
        });
        return;
      }

      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiPlugin()
  ],
  server: {
    allowedHosts: ['astracodex.online']
  }
})
