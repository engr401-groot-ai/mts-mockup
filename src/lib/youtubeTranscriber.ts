import youtubedl from 'youtube-dl-exec';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { Storage } from '@google-cloud/storage';
import speech from '@google-cloud/speech';

const execAsync = promisify(exec);

export interface Word {
  word: string;
  startTime: number;
  endTime: number;
}

export interface TranscriptBlock {
  transcript: string;
  words: Word[];
}

const MAX_SYNC_FILE_SIZE = 10 * 1024 * 1024;

const AUDIO_CONFIG = {
  encoding: 'LINEAR16' as const,
  sampleRateHertz: 16000,
  languageCode: 'en-US',
  enableWordTimeOffsets: true,
};

interface AudioFiles {
  tempMp3: string;
  outputWav: string;
}

interface FileStats {
  sizeInBytes: number;
  sizeInMB: number;
  isLargeFile: boolean;
}

interface SpeechWord {
  word?: string;
  startTime?: {
    seconds?: string | number;
    nanos?: string | number;
  };
  endTime?: {
    seconds?: string | number;
    nanos?: string | number;
  };
}

interface SpeechAlternative {
  transcript?: string;
  words?: SpeechWord[];
}

interface SpeechResult {
  alternatives?: SpeechAlternative[];
}

const storage = new Storage();
const speechClient = new speech.SpeechClient();

// Utility functions
function getFileStats(filePath: string): FileStats {
  const stats = fs.statSync(filePath);
  const sizeInBytes = stats.size;
  const sizeInMB = sizeInBytes / (1024 * 1024);
  const isLargeFile = sizeInBytes > MAX_SYNC_FILE_SIZE;
  
  return { sizeInBytes, sizeInMB, isLargeFile };
}

function formatWordsFromResponse(words: SpeechWord[]): Word[] {
  return words?.map((w) => ({
    word: w.word || '',
    startTime: Number(w.startTime?.seconds || 0) + Number(w.startTime?.nanos || 0) / 1e9,
    endTime: Number(w.endTime?.seconds || 0) + Number(w.endTime?.nanos || 0) / 1e9,
  })) || [];
}

function formatTranscriptResults(results: SpeechResult[]): TranscriptBlock[] {
  return results?.map((result) => {
    const transcript = result.alternatives?.[0]?.transcript || '';
    const words = formatWordsFromResponse(result.alternatives?.[0]?.words || []);
    return { transcript, words };
  }) || [];
}

async function cleanupFile(filePath: string): Promise<void> {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Cleaned up file: ${filePath}`);
    } catch (error) {
      console.error(`Error cleaning up file ${filePath}:`, error);
    }
  }
}

// Downloads a YouTube video and converts it to WAV format.
export async function downloadAndConvertVideo(
  youtubeUrl: string,
  tempMp3 = 'temp_audio.mp3',
  outputWav = 'audio.wav'
): Promise<string> {
  try {
    // 1. Download audio from YouTube to MP3
    console.log('Downloading audio from YouTube...');
    await youtubedl(youtubeUrl, {
      extractAudio: true,
      audioFormat: 'mp3',
      output: tempMp3,
    });
    console.log(`Downloaded audio to ${tempMp3}`);

    // 2. Convert MP3 to WAV using FFmpeg
    const ffmpegCommand = `ffmpeg -i "${tempMp3}" -acodec pcm_s16le -ac 1 -ar 16000 "${outputWav}" -y`;
    console.log('Converting to WAV with command:', ffmpegCommand);
    
    await execAsync(ffmpegCommand);
    console.log(`Converted to WAV: ${outputWav}`);
    
    // Clean up the temporary MP3 file
    await cleanupFile(tempMp3);
    
    return outputWav;
  } catch (error) {
    console.error('Error downloading or converting video:', error);
    // Clean up on error
    await cleanupFile(tempMp3);
    throw error;
  }
}

// Uploads a local file to Google Cloud Storage
export async function uploadAudioToGCS(
  localFilePath: string,
  bucketName: string,
): Promise<string> {
  try {
    console.log(`Uploading ${localFilePath} to GCS bucket: ${bucketName}`);
    
    const [file] = await storage.bucket(bucketName).upload(localFilePath, {
      destination: localFilePath,
    });
    
    const gcsUri = `gs://${bucketName}/${file.name}`;
    console.log(`Successfully uploaded to ${gcsUri}`);
    
    return gcsUri;
  } catch (error) {
    console.error('Error uploading to GCS:', error);
    throw error;
  }
}

// Transcribes audio from a local file using Google Cloud Speech-to-Text
export async function transcribeFromLocalFile(localFilePath: string): Promise<TranscriptBlock[]> {
  try {
    const fileStats = getFileStats(localFilePath);
    console.log(`Audio file size: ${fileStats.sizeInMB.toFixed(2)} MB`);
    
    if (fileStats.isLargeFile) {
      throw new Error(
        `File size (${fileStats.sizeInMB.toFixed(2)} MB) exceeds 10MB limit. Must upload to Google Cloud Storage first.`
      );
    }

    console.log('Using synchronous Speech-to-Text API...');
    
    const audioBytes = fs.readFileSync(localFilePath).toString('base64');
    const audio = { content: audioBytes };

    console.log('Starting Speech-to-Text transcription...');
    const [response] = await speechClient.recognize({ 
      audio, 
      config: AUDIO_CONFIG 
    });
    
    console.log('Transcription completed successfully');
    return formatTranscriptResults(response.results as SpeechResult[] || []);
  } catch (error) {
    console.error('Error during local transcription:', error);
    throw error;
  }
}

// Transcribes audio from a GCS URI using Google Cloud Speech-to-Text (long-running operation)
export async function transcribeFromStorage(gcsUri: string): Promise<TranscriptBlock[]> {
  try {
    console.log('Starting long-running Speech-to-Text operation...');
    
    const audio = { uri: gcsUri };

    // Use long-running operation for files in GCS
    const [operation] = await speechClient.longRunningRecognize({
      audio,
      config: AUDIO_CONFIG,
    });

    console.log('Waiting for operation to complete...');
    const [response] = await operation.promise();
    console.log('Transcription completed successfully');

    return formatTranscriptResults(response.results as SpeechResult[] || []);
  } catch (error) {
    console.error('Error during GCS transcription:', error);
    throw error;
  }
}

// Main function to handle the full transcription pipeline
export async function transcribeYoutubeVideo(
  youtubeUrl: string,
  gcsBucket: string
): Promise<TranscriptBlock[]> {
  let wavFile: string | null = null;
  
  try {
    // Step 1: Download and convert video
    wavFile = await downloadAndConvertVideo(youtubeUrl);
    
    // Step 2: Check file size and determine processing strategy
    const fileStats = getFileStats(wavFile);
    console.log(`Audio file size: ${fileStats.sizeInMB.toFixed(2)} MB`);
    
    if (fileStats.isLargeFile) {
      // Large files must use GCS
      console.log('File is too large for local processing, uploading to GCS...');
      return await processLargeFile(wavFile, gcsBucket);
    } else {
      // Small files: try local first, fallback to GCS
      console.log('File is small enough for local processing, trying local first...');
      return await processSmallFile(wavFile, gcsBucket);
    }
  } finally {
    // Always cleanup the temporary WAV file
    if (wavFile) {
      await cleanupFile(wavFile);
    }
  }
}

// Helper function for processing large files
async function processLargeFile(wavFile: string, gcsBucket: string): Promise<TranscriptBlock[]> {
  try {
    const gcsUri = await uploadAudioToGCS(wavFile, gcsBucket);
    return await transcribeFromStorage(gcsUri);
  } catch (gcsError) {
    const fileStats = getFileStats(wavFile);
    throw new Error(
      `File is too large (${fileStats.sizeInMB.toFixed(2)} MB) for local processing and GCS upload failed: ${
        gcsError instanceof Error ? gcsError.message : String(gcsError)
      }`
    );
  }
}

// Helper function for processing small files
async function processSmallFile(wavFile: string, gcsBucket: string): Promise<TranscriptBlock[]> {
  try {
    // Try local processing first
    return await transcribeFromLocalFile(wavFile);
  } catch (localError) {
    console.log('Local processing failed, trying GCS upload...');
    console.log('Local Error:', localError instanceof Error ? localError.message : String(localError));
    
    try {
      // Fallback to GCS processing
      const gcsUri = await uploadAudioToGCS(wavFile, gcsBucket);
      return await transcribeFromStorage(gcsUri);
    } catch (gcsError) {
      console.error('Both local and GCS processing failed');
      throw gcsError;
    }
  }
}
