// src/components/settings/Keyboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { getEffectiveTheme } from '../../../src/settings';
import { ArrowLeft, ChevronUp, ChevronLeft, ChevronRight, Mic } from 'lucide-react';
import './_keyboard.scss';

// Letterrijen (Tesla Model 3 indeling)
const LETTER_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', ',', '.'],
];

// Symbolenlaag (vervangt de letterrijen, zelfde aantal toetsen per rij)
const SYMBOL_ROWS: string[][] = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
  ['-', '/', ':', ';', "'", '"', '€', '£', '+'],
  ['_', '=', '[', ']', '{', '}', '<', '>', '?', '~'],
];

// Numpad rechts: 1-9 in een 3x3 raster, 0 onder de 8
const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Shift-modus: uit, eenmalig (volgende letter hoofdletter) of caps lock
type ShiftMode = 'off' | 'once' | 'lock';

// Tijd (ms) waarbinnen een tweede shift-tik caps lock aanzet
const DOUBLE_TAP_MS = 400;

// Spraakinvoer: meldingen (Nederlands; het toetsenbord heeft verder geen vertaalde teksten)
const VOICE_MESSAGES: Record<string, string> = {
  permission: 'Sta de microfoon toe en tik opnieuw op de microfoon.',
  ready: 'Microfoon toegestaan. Tik op de microfoon om te praten.',
  unavailable: 'Spraakherkenning is niet beschikbaar op dit apparaat (installeer of update de Google-app).',
  nothing: 'Niets verstaan. Probeer het nog eens.',
  network: 'Geen internet: spraakherkenning werkt alleen online.',
  audio: 'De microfoon geeft geen geluid.',
  error: 'Spraakinvoer lukte niet.',
};

// Herkende tekst achteraan het invoerveld toevoegen (met een spatie ertussen)
const insertVoiceText = (text: string) => {
  const { keyboardValue, setKeyboardValue } = useUIStore.getState();
  const clean = text.trim();
  if (!clean) return;
  const separator = keyboardValue && !keyboardValue.endsWith(' ') ? ' ' : '';
  setKeyboardValue(keyboardValue + separator + clean);
};

interface KeyProps {
  className?: string;
  onPress: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}

// Losse toets: reageert op pointerdown zodat het actieve invoerveld de focus houdt
const Key: React.FC<KeyProps> = ({ className = '', onPress, ariaLabel, children }) => {
  const [pressed, setPressed] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault(); // Voorkomt focusverlies van het invoerveld
    setPressed(true);
    onPress();
  };

  const release = () => setPressed(false);

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      className={`key ${className} ${pressed ? 'is-pressed' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
};

const Keyboard: React.FC = () => {
  const { isKeyboardOpen, keyboardValue, setKeyboardValue, closeKeyboard, screenMode, vehicleLightsOn } = useUIStore();
  const [theme, setTheme] = useState(getEffectiveTheme(screenMode, vehicleLightsOn));

  // Cursorpositie binnen keyboardValue (null = altijd aan het einde)
  const [caret, setCaret] = useState<number | null>(null);
  const [shiftMode, setShiftMode] = useState<ShiftMode>('off');
  const [showSymbols, setShowSymbols] = useState(false);
  const lastShiftTap = useRef(0);
  // Spraakinvoer (microfoon-toets): luistert, tussenresultaat, foutmelding
  const [voice, setVoice] = useState<{ listening: boolean; preview: string; message: string }>({ listening: false, preview: '', message: '' });
  const webRecognizer = useRef<any>(null);

  // Resultaten van de spraakherkenning van Android (VoiceInput.kt via window.PandaOS.voiceInput)
  useEffect(() => {
    const onVoice = (e: Event) => {
      const { state, text = '', error = '' } = (e as CustomEvent).detail as { state: string; text?: string; error?: string };
      if (state === 'listening') setVoice({ listening: true, preview: '', message: '' });
      else if (state === 'partial') setVoice((v) => ({ ...v, preview: text }));
      else if (state === 'final') insertVoiceText(text);
      else if (state === 'ready') setVoice({ listening: false, preview: '', message: VOICE_MESSAGES.ready });
      else if (state === 'error') setVoice({ listening: false, preview: '', message: VOICE_MESSAGES[error] ?? VOICE_MESSAGES.error });
      else setVoice((v) => ({ ...v, listening: false, preview: '' }));
    };
    window.addEventListener('pandaos-voice', onVoice);
    return () => window.removeEventListener('pandaos-voice', onVoice);
  }, []);
  // Melding (toestemming, geen internet ...) na 5 seconden weer weg
  useEffect(() => {
    if (!voice.message) return;
    const timer = window.setTimeout(() => setVoice((v) => ({ ...v, message: '' })), 5000);
    return () => window.clearTimeout(timer);
  }, [voice.message]);

  useEffect(() => {
    setTheme(getEffectiveTheme(screenMode, vehicleLightsOn));
  }, [screenMode, vehicleLightsOn]);

  // Bij openen: cursor naar het einde en lagen resetten
  useEffect(() => {
    if (isKeyboardOpen) {
      setCaret(null);
      setShiftMode('off');
      setShowSymbols(false);
    }
  }, [isKeyboardOpen]);

  // Klik buiten het toetsenbord (en niet in een invoerveld) sluit het, zonder die klik te blokkeren
  useEffect(() => {
    if (!isKeyboardOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tsl-keyboard') || target.closest('input, textarea')) return;
      closeKeyboard();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isKeyboardOpen, closeKeyboard]);

  const isDarkMode = theme === 'dark';

  if (!isKeyboardOpen) return null;

  // Microfoon-toets: op de radio de spraakherkenning van Android, op laptop/Pi die van de browser (als die er is)
  const toggleVoice = () => {
    const language = useUIStore.getState().displaySettings.language === 'en' ? 'en-US' : 'nl-NL';
    const android = (window as any).PandaAndroid;
    if (android?.startVoiceInput) {
      if (voice.listening) { android.stopVoiceInput(); return; }
      const result = android.startVoiceInput(language);
      if (result === 'permission') setVoice({ listening: false, preview: '', message: VOICE_MESSAGES.permission });
      else if (result === 'unavailable') setVoice({ listening: false, preview: '', message: VOICE_MESSAGES.unavailable });
      return;
    }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setVoice({ listening: false, preview: '', message: VOICE_MESSAGES.unavailable }); return; }
    if (voice.listening) { webRecognizer.current?.stop(); return; }
    const rec = new Recognition();
    rec.lang = language;
    rec.interimResults = true;
    rec.onstart = () => setVoice({ listening: true, preview: '', message: '' });
    rec.onresult = (e: any) => {
      const result = e.results[e.results.length - 1];
      if (result.isFinal) insertVoiceText(result[0].transcript);
      else setVoice((v) => ({ ...v, preview: result[0].transcript }));
    };
    rec.onerror = () => setVoice({ listening: false, preview: '', message: VOICE_MESSAGES.error });
    rec.onend = () => setVoice((v) => ({ ...v, listening: false, preview: '' }));
    webRecognizer.current = rec;
    rec.start();
  };

  // Huidige cursorpositie, begrensd op de lengte van de tekst
  const caretPos = caret === null ? keyboardValue.length : Math.min(caret, keyboardValue.length);

  // Zet de cursor; aan het einde terug naar null zodat externe wijzigingen meeschuiven
  const moveCaretTo = (pos: number) => {
    const clamped = Math.max(0, Math.min(pos, keyboardValue.length));
    setCaret(clamped >= keyboardValue.length ? null : clamped);
  };

  // Tekst invoegen op de cursorpositie
  const insertText = (text: string) => {
    const next = keyboardValue.slice(0, caretPos) + text + keyboardValue.slice(caretPos);
    setKeyboardValue(next);
    const newPos = caretPos + text.length;
    setCaret(newPos >= next.length ? null : newPos);
  };

  // Teken vóór de cursor verwijderen
  const handleBackspace = () => {
    if (caretPos === 0) return;
    const next = keyboardValue.slice(0, caretPos - 1) + keyboardValue.slice(caretPos);
    setKeyboardValue(next);
    const newPos = caretPos - 1;
    setCaret(newPos >= next.length ? null : newPos);
  };

  // Letter/symbool invoeren, rekening houdend met shift
  const handleCharacter = (char: string) => {
    const isLetter = /^[a-z]$/.test(char);
    const output = isLetter && shiftMode !== 'off' ? char.toUpperCase() : char;
    insertText(output);
    if (shiftMode === 'once') setShiftMode('off');
  };

  // Shift: enkele tik = volgende letter hoofdletter, dubbele tik = caps lock, nogmaals = uit
  const handleShift = () => {
    const now = Date.now();
    const isDoubleTap = now - lastShiftTap.current < DOUBLE_TAP_MS;
    lastShiftTap.current = now;

    if (shiftMode === 'lock') {
      setShiftMode('off');
    } else if (shiftMode === 'once' && isDoubleTap) {
      setShiftMode('lock');
    } else if (shiftMode === 'once') {
      setShiftMode('off');
    } else {
      setShiftMode('once');
    }
  };

  const rows = showSymbols ? SYMBOL_ROWS : LETTER_ROWS;

  // Label van een teken-toets (hoofdletter tonen als shift actief is)
  const labelFor = (char: string) =>
    !showSymbols && shiftMode !== 'off' && /^[a-z]$/.test(char) ? char.toUpperCase() : char;

  return (
    <div className="keyboard-wrapper">
      {/* Spraakinvoer: wat er gehoord wordt, of waarom het niet lukt */}
      {(voice.listening || voice.message) && (
        <div className={`voice-strip ${isDarkMode ? 'dark-mode' : ''}`}>
          {voice.listening ? <><span className="voice-dot" /> {voice.preview || 'Luisteren…'}</> : voice.message}
        </div>
      )}
      <div className={`tsl-keyboard ${isDarkMode ? 'dark-mode' : 'light-mode'}`} onClick={(e) => e.stopPropagation()}>

        {/* LETTERBLOK (links) */}
        <div className="letters-block">

          {/* RIJ 1: letters + brede backspace */}
          <div className="keyboard-row row-1">
            {rows[0].map((k, i) => (
              <Key key={`r1-${i}`} className="char" onPress={() => handleCharacter(k)}>{labelFor(k)}</Key>
            ))}
            <Key className="special backspace" ariaLabel="Backspace" onPress={handleBackspace}>
              <ArrowLeft size={22} strokeWidth={2} />
            </Key>
          </div>

          {/* RIJ 2: halve toets ingesprongen + brede Enter */}
          <div className="keyboard-row row-2">
            {rows[1].map((k, i) => (
              <Key key={`r2-${i}`} className="char" onPress={() => handleCharacter(k)}>{labelFor(k)}</Key>
            ))}
            <Key className="special enter" onPress={closeKeyboard}>Enter</Key>
          </div>

          {/* RIJ 3: hele toets ingesprongen */}
          <div className="keyboard-row row-3">
            {rows[2].map((k, i) => (
              <Key key={`r3-${i}`} className="char" onPress={() => handleCharacter(k)}>{labelFor(k)}</Key>
            ))}
          </div>

          {/* RIJ 4: shift, mic, spatie, symbolen, cursor links/rechts */}
          <div className="keyboard-row row-4">
            <Key
              className={`special shift ${shiftMode !== 'off' ? 'is-active' : ''} ${shiftMode === 'lock' ? 'is-locked' : ''}`}
              ariaLabel="Shift"
              onPress={handleShift}
            >
              <ChevronUp size={24} strokeWidth={2} />
            </Key>
            <Key className={`special mic ${voice.listening ? 'is-listening' : ''}`} ariaLabel="Spraak" onPress={toggleVoice}>
              <Mic size={20} strokeWidth={2} />
            </Key>
            <Key className="special spacebar" ariaLabel="Spatie" onPress={() => insertText(' ')}>{null}</Key>
            <Key className="special symbols" onPress={() => setShowSymbols((s) => !s)}>
              {showSymbols ? 'abc' : '? # &'}
            </Key>
            <Key className="special caret-left" ariaLabel="Cursor naar links" onPress={() => moveCaretTo(caretPos - 1)}>
              <ChevronLeft size={22} strokeWidth={2} />
            </Key>
            <Key className="special caret-right" ariaLabel="Cursor naar rechts" onPress={() => moveCaretTo(caretPos + 1)}>
              <ChevronRight size={22} strokeWidth={2} />
            </Key>
          </div>
        </div>

        {/* NUMPAD (rechts) */}
        <div className="numpad-block">
          {NUMPAD_KEYS.map((k) => (
            <Key key={k} className="char" onPress={() => insertText(k)}>{k}</Key>
          ))}
          <Key className="char zero" onPress={() => insertText('0')}>0</Key>
        </div>

      </div>
    </div>
  );
};

export default Keyboard;
