import axios from 'axios';
import type { PythonAPIResponse, TranscriptionRequest } from '../../src/types/hearings';

const PYTHON_API_URL = process.env.PYTHON_API_URL || `http://127.0.0.1:${process.env.PYTHON_PORT || '3001'}`;
const REQUEST_TIMEOUT = Number(process.env.PYTHON_REQUEST_TIMEOUT_MS || '3600000');

/**
 * Forwards a transcription request to the Python API.
 */
export async function postTranscribe(payload: TranscriptionRequest) {
  const response = await axios.post<PythonAPIResponse>(
    `${PYTHON_API_URL}/transcribe`,
    payload,
    { timeout: REQUEST_TIMEOUT }
  );
  return response.data;
}

/**
 * Forwards a request to get a transcript by folder path to the Python API.
 */
export async function getTranscriptByFolder(encodedFolderPath: string) {
  const response = await axios.get<PythonAPIResponse>(
    `${PYTHON_API_URL}/transcript/${encodedFolderPath}`
  );
  return response.data;
}

/**
 * Forwards a request to list all transcripts to the Python API.
 */
export async function listTranscripts() {
  const response = await axios.get(`${PYTHON_API_URL}/list-transcripts`);
  return response.data;
}

/**
 * Forwards a request to check the health of the Python API.
 */
export async function pythonHealth(timeout = 5000) {
  try {
    const response = await axios.get(`${PYTHON_API_URL}/health`, { timeout });
    return response.data;
  } catch (err: any) {
    console.error(`pythonHealth: failed to reach ${PYTHON_API_URL}/health ->`, err?.message || err);
    throw err;
  }
}

export default { postTranscribe, getTranscriptByFolder, listTranscripts, pythonHealth };
