import axios from 'axios';
import type { PythonAPIResponse, TranscriptionRequest } from '../../src/types/hearings';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';
const REQUEST_TIMEOUT = Number(process.env.PYTHON_REQUEST_TIMEOUT_MS || '3600000');

export async function postTranscribe(payload: TranscriptionRequest) {
  const response = await axios.post<PythonAPIResponse>(
    `${PYTHON_API_URL}/transcribe`,
    payload,
    { timeout: REQUEST_TIMEOUT }
  );
  return response.data;
}

export async function getTranscriptByFolder(encodedFolderPath: string) {
  const response = await axios.get<PythonAPIResponse>(
    `${PYTHON_API_URL}/transcript/${encodedFolderPath}`
  );
  return response.data;
}

export async function listTranscripts() {
  const response = await axios.get(`${PYTHON_API_URL}/list-transcripts`);
  return response.data;
}

export async function pythonHealth(timeout = 5000) {
  const response = await axios.get(`${PYTHON_API_URL}/health`, { timeout });
  return response.data;
}

export default { postTranscribe, getTranscriptByFolder, listTranscripts, pythonHealth };
