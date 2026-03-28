# 🎬 AI Video Translator

An AI-powered video translation application that converts any video file into 200+ languages with synchronized native voiceovers.

## 🚀 Key Features
- **Instant Translation**: Upload a video and get translated voiceovers in seconds.
- **200+ Languages**: Powered by **Meta's NLLB-200** (No Language Left Behind) via **Hugging Face** and **Groq Whisper**.
- **Native Android Support**: Optimized for Android 14 with a high-performance native speech engine.
- **Serial Audio Queue**: Ensures perfectly synchronized, non-overlapping voiceovers.

## 🛠️ Tech Stack
- **Mobile App**: Ionic / Angular / Capacitor
- **Native Bridge**: `@capacitor-community/text-to-speech`
- **Backend API**: Node.js / Express
- **AI Models & Platforms**:
  - **Transcription**: **Groq Whisper** (Large-v3)
  - **Translation Engine**: **Hugging Face Inference API**
  - **Core Model**: **Facebook/NLLB-200-distilled-600M**
  - **Speech**: Android Native TTS Engine
- **Audio Processing**: Web Audio API (Frontend) & FFmpeg / Fluent-FFmpeg (Backend)

## 📱 Getting Started

### Prerequisites
- Node.js (v20+)
- Capacitor CLI
- Android Studio (for APK building)

### Running Locally
1. **Frontend**:
   ```bash
   npm install
   npx ionic serve
   ```
2. **Android**:
   ```bash
   npx cap build android
   npx cap open android
   ```

## 🏗️ Technical Details
- **Segmented Buffer**: The app processes audio in 5-second overlapping segments (Groq Whisper windowing) for maximum accuracy.
- **Serial Queue**: A custom-built async queue ensures that even if a translation is long, the audio plays sequentially without interruption.
- **Null Safety**: Comprehensive guards for WebView SpeechSynthesis to ensure stability across all Android devices.

## 📄 License
This project is for educational and personal use.

---
**Created with ❤️ and Antigravity AI.**
