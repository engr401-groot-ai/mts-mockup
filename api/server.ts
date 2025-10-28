import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

// Mount modular routers
import mentionsRouter from './routes/mentions';
import transcribeRouter from './routes/transcribe';
import transcriptsRouter from './routes/transcripts';
import sheetRouter from './routes/sheet';
import healthRouter from './routes/health';
import { pythonHealth } from './services/pythonProxy';

app.use('/api/mentions', mentionsRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/transcript', transcriptsRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/sheet', sheetRouter);
app.use('/health', healthRouter);


app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('Node.js+Express Server Started');
  console.log('='.repeat(60));
  console.log('Port:', PORT);
  console.log('Python API:', process.env.PYTHON_API_URL || 'http://localhost:5001');
  console.log('='.repeat(60) + '\n');
  pythonHealth()
    .then((response) => {
      console.log('   Python API is reachable');
      console.log('   Model:', response.model);
      console.log('   Bucket:', response.gcs_bucket);
      console.log('   Chunk Length:', response.chunk_length_minutes, 'minutes');
    })
    .catch(() => {
      console.log('   WARNING: Python API is not reachable');
      console.log('   Make sure to run: python3 api/whisper_to_gcs.py');
    });
});