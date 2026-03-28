import { Injectable } from '@angular/core';

export interface Language {
  name: string;
  nllbCode: string;
  flag: string;
}

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  readonly languages: Language[] = [
    { name: 'English', nllbCode: 'eng_Latn', flag: '🇬🇧' },
    { name: 'Tamil', nllbCode: 'tam_Taml', flag: '🇮🇳' },
    { name: 'Hindi', nllbCode: 'hin_Deva', flag: '🇮🇳' },
    { name: 'Spanish', nllbCode: 'spa_Latn', flag: '🇪🇸' },
    { name: 'French', nllbCode: 'fra_Latn', flag: '🇫🇷' },
    { name: 'Arabic', nllbCode: 'arb_Arab', flag: '🇸🇦' },
    { name: 'Chinese (Simplified)', nllbCode: 'zho_Hans', flag: '🇨🇳' },
    { name: 'Japanese', nllbCode: 'jpn_Jpan', flag: '🇯🇵' },
    { name: 'German', nllbCode: 'deu_Latn', flag: '🇩🇪' },
    { name: 'Portuguese', nllbCode: 'por_Latn', flag: '🇧🇷' },
    { name: 'Korean', nllbCode: 'kor_Hang', flag: '🇰🇷' },
    { name: 'Russian', nllbCode: 'rus_Cyrl', flag: '🇷🇺' },
    { name: 'Italian', nllbCode: 'ita_Latn', flag: '🇮🇹' },
    { name: 'Turkish', nllbCode: 'tur_Latn', flag: '🇹🇷' },
    { name: 'Vietnamese', nllbCode: 'vie_Latn', flag: '🇻🇳' },
  ];

  getByCode(code: string): Language | undefined {
    return this.languages.find((l) => l.nllbCode === code);
  }
}
