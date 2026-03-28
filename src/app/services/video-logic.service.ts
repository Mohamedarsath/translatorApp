import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  segmentIndex: number;
  timestampStart: number;
}

export interface TranslationState {
  isProcessing: boolean;
  isSpeaking: boolean;
  currentSubtitle: string;
  originalText: string;
  detectedLanguage: string;
  voiceStatus: string | null;
  error: string | null;
  progress: number; // 0-100
}

@Injectable({
  providedIn: 'root',
})
export class VideoLogicService {
  // Angular Signals for reactive state management
  private _state = signal<TranslationState>({
    isProcessing: false,
    isSpeaking: false,
    currentSubtitle: '',
    originalText: '',
    detectedLanguage: '',
    voiceStatus: null,
    error: null,
    progress: 0,
  });

  readonly state = this._state.asReadonly();
  readonly currentSubtitle = computed(() => this._state().currentSubtitle);
  readonly isProcessing = computed(() => this._state().isProcessing);
  readonly progress = computed(() => this._state().progress);

  private segmentCache = new Map<number, TranslationResult>();
  private processingQueue = new Set<number>();
  private currentSpokenText: string | null = null;
  private lastSpokenBlock: number = -1;
  private audioBuffer: AudioBuffer | null = null;
  private speechQueue: { text: string; lang: string }[] = [];
  private isProcessingSpeech = false;
  private videoElement: HTMLVideoElement | null = null;

  constructor(private http: HttpClient) {
    this.initNativeTTS();
  }

  private async initNativeTTS(): Promise<void> {
    try {
      // Warm up the engine
      await TextToSpeech.speak({
        text: "",
        lang: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        volume: 0.0,
        category: 'ambient'
      });
      console.log('[VideoLogic] Native TTS initialized.');
    } catch (e) {
      console.warn('[VideoLogic] Native TTS warmup failed (normal on browsers):', e);
    }
  }

  /**
   * Main entry point: start translating a video file
   * Uses "look-ahead" buffering for smooth subtitle rendering
   */
  async startVideoTranslation(
    videoElement: HTMLVideoElement,
    file: File,
    srcLang: string = 'eng_Latn',
    tgtLang: string = 'tam_Taml'
  ): Promise<void> {
    this.clearCache();
    this._state.update((s) => ({ ...s, isProcessing: true, isSpeaking: false, error: null, progress: 0 }));

    try {
      // Decode entire audio track instantly
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      console.log(`[VideoLogic] Audio decoded. Total duration: ${this.audioBuffer.duration}s`);
      
      // Pre-fetch first few segments immediately (0, 5, 10s)
      await this.prefetchSegment(0, srcLang, tgtLang);
      this.prefetchSegment(5, srcLang, tgtLang);
      this.prefetchSegment(10, srcLang, tgtLang);

      this.videoElement = videoElement;

      videoElement.addEventListener('timeupdate', () => {
        this.onTimeUpdate(videoElement, srcLang, tgtLang);
      });

      videoElement.addEventListener('ended', () => {
        this._state.update((s) => ({ ...s, isProcessing: false, isSpeaking: false, currentSubtitle: '', progress: 100 }));
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      });
    } catch (e: any) {
      console.error('[VideoLogic] Initialization failed:', e);
      this._state.update((s) => ({ ...s, error: `Failed to load audio: ${e.message}`, isProcessing: false }));
    }
  }

  /**
   * Called on every timeupdate event from the video element
   * Displays cached subtitle or waits for transcription
   */
  private onTimeUpdate(
    videoElement: HTMLVideoElement,
    srcLang: string,
    tgtLang: string
  ): void {
    const currentTime = Math.floor(videoElement.currentTime);
    const duration = videoElement.duration || 1;

    // Calculate current 5-second block
    const blockStart = Math.floor(currentTime / 5) * 5;

    // Update progress
    const progressPct = Math.min(100, Math.round((currentTime / duration) * 100));
    this._state.update((s) => ({ ...s, progress: progressPct }));

    // Show cached subtitle for this block
    if (this.segmentCache.has(blockStart)) {
      const result = this.segmentCache.get(blockStart)!;

      // Update state if text changed (for subtitles)
      if (this._state().currentSubtitle !== result.translatedText) {
        this._state.update((s) => ({
          ...s,
          currentSubtitle: result.translatedText,
          originalText: result.originalText,
          detectedLanguage: result.detectedLanguage,
        }));
      }

      // Trigger Speech Synthesis ONLY ONCE per 5s block
      if (this.lastSpokenBlock !== blockStart) {
        this.lastSpokenBlock = blockStart;
        console.log(`[VideoLogic] Queuing speech for block: ${blockStart}s`);
        this.enqueueSpeech(result.translatedText, tgtLang);
      }
    }

    // Aggressive Look-ahead: prefetch segments 10-15s ahead
    const nextBlock = blockStart + 5;
    const futureBlock = blockStart + 10;
    
    if (!this.segmentCache.has(nextBlock) && !this.processingQueue.has(nextBlock)) {
      this.prefetchSegment(nextBlock, srcLang, tgtLang);
    }
    if (!this.segmentCache.has(futureBlock) && !this.processingQueue.has(futureBlock)) {
      this.prefetchSegment(futureBlock, srcLang, tgtLang);
    }
  }

  /**
   * Extract a 10-second audio segment and send to backend for translation
   * Includes 1-second overlap from previous clip to handle cut words
   */
  async prefetchSegment(
    startSecond: number,
    srcLang: string,
    tgtLang: string
  ): Promise<void> {
    if (this.processingQueue.has(startSecond)) return;
    if (!this.audioBuffer || startSecond >= this.audioBuffer.duration) return;
    this.processingQueue.add(startSecond);

    try {
      // Extract 6-second slice (5s segment + 1s overlap)
      const duration = 6; 
      const audioBlob = await this.extractAudioSlice(startSecond, duration);
      if (!audioBlob) return;

      const formData = new FormData();
      formData.append('audio', audioBlob, `segment_${startSecond}.wav`);
      formData.append('src_lang', srcLang);
      formData.append('tgt_lang', tgtLang);

      const result = await this.http
        .post<{ originalText: string; translatedText: string; detectedLanguage: string }>(
          `${environment.serverUrl}/translate`,
          formData
        )
        .toPromise();

      if (result) {
        console.log(`[VideoLogic] Segment at ${startSecond}s result:`, result);
        this.segmentCache.set(startSecond, {
          ...result,
          segmentIndex: startSecond / 5,
          timestampStart: startSecond,
        });
      }
    } catch (error: any) {
      console.error(`[VideoLogic] Failed to process segment at ${startSecond}s:`, error);
    } finally {
      this.processingQueue.delete(startSecond);
    }
  }

  /**
   * Slices the AudioBuffer and converts to WAV Blob instantly
   */
  private async extractAudioSlice(start: number, duration: number): Promise<Blob | null> {
    if (!this.audioBuffer) return null;
    
    const startSample = Math.max(0, (start - 1) * this.audioBuffer.sampleRate);
    const endSample = Math.min(this.audioBuffer.length, (start + duration) * this.audioBuffer.sampleRate);
    const frameCount = endSample - startSample;
    
    if (frameCount <= 0) return null;

    const offlineCtx = new OfflineAudioContext(
      this.audioBuffer.numberOfChannels,
      frameCount,
      this.audioBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0, startSample / this.audioBuffer.sampleRate);

    const renderedBuffer = await offlineCtx.startRendering();
    return this.audioBufferToWav(renderedBuffer);
  }

  /**
   * Helper to convert AudioBuffer to WAV format
   */
  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"
    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for(i = 0; i < buffer.numberOfChannels; i++)
        channels.push(buffer.getChannelData(i));

    while(pos < length) {
        for(i = 0; i < numOfChan; i++) {           // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); // scale
            view.setInt16(pos, sample, true);      // write 16-bit sample
            pos += 2;
        }
        offset++;
    }

    return new Blob([bufferArr], {type: 'audio/wav'});

    function setUint16(data: any) {
        view.setUint16(pos, data, true);
        pos += 2;
    }
    function setUint32(data: any) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
  }

  /**
   * Unlocks TTS engine for mobile/strict browsers
   * Should be called from a user gesture (like click)
   */
  unlockTTS(): void {
    // Native plugin handles its own activation, but we can do a dummy speak
    TextToSpeech.speak({ text: "", volume: 0 });
    console.log('[VideoLogic] Native TTS activation triggered');
  }

  /**
   * Queues speech and starts processing
   */
  private enqueueSpeech(text: string, tgtLang: string): void {
    if (!text) return;

    // Avoid massive lag: if queue is too long, drop oldest
    if (this.speechQueue.length > 3) {
      console.warn('[VideoLogic] Speech queue too long. Dropping stale segments.');
      this.speechQueue.shift();
    }

    this.speechQueue.push({ text, lang: tgtLang });
    this.processSpeechQueue();
  }

  /**
   * Serial processor for the speech queue
   */
  private async processSpeechQueue(): Promise<void> {
    if (this.isProcessingSpeech || this.speechQueue.length === 0) return;

    this.isProcessingSpeech = true;
    const { text, lang } = this.speechQueue.shift()!;

    try {
      // PRO SYNC: Pause video while speaking to ensure user hears everything in order
      if (this.videoElement && !this.videoElement.paused) {
        this.videoElement.pause();
        console.log('[VideoLogic] Path: Auto-pausing video for speech sync.');
      }

      await this.speak(text, lang);
    } finally {
      this.isProcessingSpeech = false;
      
      // Resume video if there's nothing else in the queue
      if (this.speechQueue.length === 0 && this.videoElement && this.videoElement.paused) {
        this.videoElement.play().catch(() => {});
        console.log('[VideoLogic] Path: Resuming video after speech.');
      }

      // Small pause between segments for natural rhythm
      setTimeout(() => this.processSpeechQueue(), 300);
    }
  }

  /**
   * Internal speak method (async)
   */
  private async speak(text: string, tgtLang: string): Promise<void> {
    const langMap: Record<string, string> = {
      'tam_Taml': 'ta-IN',
      'eng_Latn': 'en-US',
      'hin_Deva': 'hi-IN',
      'fra_Latn': 'fr-FR',
      'spa_Latn': 'es-ES',
      'deu_Latn': 'de-DE',
      'tel_Telu': 'te-IN',
      'mal_Mlym': 'ml-IN',
      'kan_Knda': 'kn-IN',
      'arb_Arab': 'ar-SA',
      'zho_Hans': 'zh-CN',
      'jpn_Jpan': 'ja-JP',
      'por_Latn': 'pt-BR',
      'kor_Hang': 'ko-KR',
      'rus_Cyrl': 'ru-RU',
      'ita_Latn': 'it-IT',
      'tur_Latn': 'tr-TR',
      'vie_Latn': 'vi-VN',
    };

    const targetBCP47 = langMap[tgtLang] || 'en-US';

    try {
      this._state.update((s) => ({ ...s, isSpeaking: true }));

      await TextToSpeech.speak({
        text: text,
        lang: targetBCP47,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
      });

      this._state.update((s) => ({ ...s, isSpeaking: false }));
    } catch (error: any) {
      console.error('[VideoLogic] Native TTS error:', error);
      this._state.update((s) => ({
        ...s,
        isSpeaking: false,
        error: `Native Speech Error: ${error.message}`,
      }));
    }
  }

  stopTranslation(): void {
    this._state.update((s) => ({ ...s, isProcessing: false, isSpeaking: false, currentSubtitle: '', progress: 0 }));
    this.clearCache();
    this.speechQueue = [];
    this.isProcessingSpeech = false;
    TextToSpeech.stop();
    this.audioBuffer = null;
  }

  private availableVoices: string[] = [];
  
  async getAvailableVoices(): Promise<string[]> {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      return voices.map(v => `${v.name} (${v.lang})`);
    } catch {
      return [];
    }
  }

  // Sync shim for UI while async version finishes
  getAvailableVoicesSync(): string[] {
    return ["Scanning Native Pulgine..."];
  }

  refreshVoices(): void {
    console.log('[VideoLogic] Manual voice refresh requested.');
    // The native plugin handles its own list, but we can log it
    this.getAvailableVoices();
  }

  private clearCache(): void {
    this.segmentCache.clear();
    this.processingQueue.clear();
    this.currentSpokenText = null;
    this.lastSpokenBlock = -1;
  }
}
