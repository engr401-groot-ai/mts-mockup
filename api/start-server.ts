import path from 'path';
import dotenv from 'dotenv';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  console.warn(`.env not loaded from ${envPath}:`, result.error.message || result.error);
} else {
  console.log(`Loaded .env from ${envPath}`);
}

try {
  const nodePort = Number(process.env.PORT || '');
  const pythonUrl = process.env.PYTHON_API_URL || '';
  const m = (pythonUrl || '').match(/:(\d+)(?:\/|$)/);
  const pythonPort = m ? Number(m[1]) : undefined;
  if (nodePort && pythonPort && nodePort === pythonPort) {
    console.warn(`WARNING: Node PORT (${nodePort}) equals PYTHON_API_URL port (${pythonPort}). This will cause collisions. Consider running Node on a different port (e.g. 3001) or starting Python on a different port.`);
  }
} catch (e) {
  // ignore
}

import('./express').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
