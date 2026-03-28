import { Component, ViewChild, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { VideoLogicService } from '../services/video-logic.service';
import { LanguageService, Language } from '../services/language.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class HomePage implements OnDestroy, OnInit {
  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  videoSrc: string | null = null;
  selectedFile: File | null = null;

  targetLang = 'tam_Taml';
  sourceLang = 'eng_Latn';

  showOriginal = false;
  isPlaying = false;
  availableVoices: string[] = [];

  constructor(
    public videoService: VideoLogicService,
    public langService: LanguageService
  ) {}

  async ngOnInit() {
    this.availableVoices = await this.videoService.getAvailableVoices();
  }

  openFilePicker(): void {
    this.fileInputRef.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    this.selectedFile = file;

    // Revoke old URL
    if (this.videoSrc) URL.revokeObjectURL(this.videoSrc);
    this.videoSrc = URL.createObjectURL(file);

    // Reset state
    this.videoService.stopTranslation();
    this.isPlaying = false;
  }

  async playAndTranslate(): Promise<void> {
    if (!this.videoPlayerRef || !this.selectedFile) return;
    const video = this.videoPlayerRef.nativeElement;

    // Unlocking SpeechSynthesis (must be from user gesture)
    this.videoService.unlockTTS();

    this.isPlaying = true;
    
    // Mute original video
    video.muted = true;

    // Start translation and wait for the first segment (0-5s) to be ready
    // With the new OfflineAudioContext method, "waiting" is now near-instant
    await this.videoService.startVideoTranslation(video, this.selectedFile, this.sourceLang, this.targetLang);
    
    // Now start the main video
    video.play();
  }

  pauseVideo(): void {
    this.videoPlayerRef?.nativeElement.pause();
    this.isPlaying = false;
  }

  stopVideo(): void {
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    this.isPlaying = false;
    this.videoService.stopTranslation();
  }

  getLangName(code: string): string {
    return this.langService.getByCode(code)?.name ?? code;
  }

  async testVoice() {
    const text = 'Hello! This is a test of the native video translator voice system.';
    
    // Attempt native speech
    this.videoService.unlockTTS(); // Trigger native warmup
    
    // Log available voices
    console.log('Available Voices:', this.availableVoices);
    
    if (this.availableVoices.length === 0) {
      alert("ZERO native voices found. Please check your Android Speech settings (Preferred Engine).");
    } else {
      // Use the service to speak so it handles the plugin call
      this.videoService.unlockTTS(); // Dummy speak to "unlock"
    }
  }

  async refreshVoices() {
    this.videoService.refreshVoices();
    this.availableVoices = await this.videoService.getAvailableVoices();
  }

  ngOnDestroy(): void {
    if (this.videoSrc) URL.revokeObjectURL(this.videoSrc);
    this.videoService.stopTranslation();
  }
}
