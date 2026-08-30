import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest',
  geminiJudgeModel: process.env.GEMINI_JUDGE_MODEL || 'gemini-3.6-flash',
  rootDir,
  runsDir: path.join(rootDir, 'runs'),
  publicDir: path.join(rootDir, 'public'),
  sampleRateAudioIn: 16000,   // Input to Gemini Live (16kHz PCM 16-bit mono)
  sampleRateAudioOut: 24000,  // Output from Gemini Live (24kHz PCM 16-bit mono)
};
