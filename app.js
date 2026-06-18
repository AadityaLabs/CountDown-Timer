// Init Lucide Icons early
lucide.createIcons();

// --- THEME ENGINE ---
const themeToggle = document.getElementById('themeToggle');

function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

themeToggle.addEventListener('click', () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
    }
});

initTheme();

// --- CUSTOM TOASTS ---
function showToast(title, message, iconName = "award") {
    const toast = document.getElementById('toastNotification');
    const tTitle = document.getElementById('toastTitle');
    const tMsg = document.getElementById('toastMessage');
    const tIcon = document.getElementById('toastIcon');

    tTitle.textContent = title;
    tMsg.textContent = message;
    
    tIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons();

    toast.classList.remove('opacity-0', 'translate-y-20');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-20');
    }, 4500);
}

// --- SPATIAL Web Audio Synthesis Engine ---
class Web8DAudioEngine {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;
        this.masterGain = null;
        this.pannerNode = null;
        this.binauralActive = false;
        this.oscLeft = null;
        this.oscRight = null;
        this.leftGain = null;
        this.rightGain = null;
        this.noiseActive = false;
        this.noiseSourceNode = null;
        this.noiseFilter = null;
        this.crackleTimer = null;
        this.currentType = null;
        this.lfo = null;
        this.lfoGain = null;
        this.spatialSpeedVal = 0.2;
    }

    init() {
        if (this.isInitialized) return;
        
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);

            if (this.ctx.createStereoPanner) {
                this.pannerNode = this.ctx.createStereoPanner();
                this.pannerNode.pan.setValueAtTime(0, this.ctx.currentTime);
            } else {
                this.pannerNode = this.ctx.createPanner();
                this.pannerNode.panningModel = 'HRTF';
                this.pannerNode.distanceModel = 'linear';
            }

            this.pannerNode.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            this.start8DLFO();
            this.isInitialized = true;
            console.log("8D Audio Engine synthesizers constructed successfully.");
        } catch (e) {
            console.error("Web Audio API not fully compatible in this browser mode.", e);
        }
    }

    start8DLFO() {
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.setValueAtTime(this.spatialSpeedVal, this.ctx.currentTime);

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

        this.lfo.connect(this.lfoGain);
        if (this.pannerNode && this.pannerNode.pan) {
            this.lfoGain.connect(this.pannerNode.pan);
        }
        this.lfo.start();
    }

    updateSpatialSpeed(freqHz) {
        if (!this.isInitialized) return;
        this.spatialSpeedVal = freqHz;
        if (this.lfo) {
            this.lfo.frequency.setValueAtTime(freqHz, this.ctx.currentTime);
        }
    }

    updateMasterGain(fraction) {
        if (!this.isInitialized) return;
        this.masterGain.gain.setValueAtTime(fraction, this.ctx.currentTime);
    }

    toggleBinauralFocus() {
        this.init();
        this.stopAllSynthesizersExcept('');
        
        if (this.binauralActive) {
            this.stopBinaural();
            return false;
        }

        this.oscLeft = this.ctx.createOscillator();
        this.oscLeft.type = 'sine';
        this.oscLeft.frequency.setValueAtTime(198, this.ctx.currentTime);

        this.oscRight = this.ctx.createOscillator();
        this.oscRight.type = 'sine';
        this.oscRight.frequency.setValueAtTime(204, this.ctx.currentTime);

        const splitter = this.ctx.createChannelMerger(2);
        this.leftGain = this.ctx.createGain();
        this.rightGain = this.ctx.createGain();
        this.leftGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
        this.rightGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

        this.oscLeft.connect(this.leftGain).connect(splitter, 0, 0);
        this.oscRight.connect(this.rightGain).connect(splitter, 0, 1);
        splitter.connect(this.pannerNode);

        this.oscLeft.start();
        this.oscRight.start();
        this.binauralActive = true;
        this.currentType = 'binaural';
        return true;
    }

    stopBinaural() {
        if (this.oscLeft) { try { this.oscLeft.stop(); } catch(e){} }
        if (this.oscRight) { try { this.oscRight.stop(); } catch(e){} }
        this.binauralActive = false;
        if (this.currentType === 'binaural') this.currentType = null;
    }

    toggleBrownNoise() {
        this.init();
        this.stopAllSynthesizersExcept('');

        if (this.noiseActive && this.currentType === 'brown') {
            this.stopNoise();
            return false;
        }

        this.stopNoise();

        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 4.5;
        }

        this.noiseSourceNode = this.ctx.createBufferSource();
        this.noiseSourceNode.buffer = noiseBuffer;
        this.noiseSourceNode.loop = true;

        this.noiseFilter = this.ctx.createBiquadFilter();
        this.noiseFilter.type = 'lowpass';
        this.noiseFilter.frequency.setValueAtTime(320, this.ctx.currentTime);

        this.noiseSourceNode.connect(this.noiseFilter).connect(this.pannerNode);
        this.noiseSourceNode.start();
        this.noiseActive = true;
        this.currentType = 'brown';

        return true;
    }

    toggleRainSound() {
        this.init();
        this.stopAllSynthesizersExcept('');

        if (this.noiseActive && this.currentType === 'rain') {
            this.stopNoise();
            return false;
        }

        this.stopNoise();

        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        this.noiseSourceNode = this.ctx.createBufferSource();
        this.noiseSourceNode.buffer = noiseBuffer;
        this.noiseSourceNode.loop = true;

        this.noiseFilter = this.ctx.createBiquadFilter();
        this.noiseFilter.type = 'bandpass';
        this.noiseFilter.frequency.setValueAtTime(650, this.ctx.currentTime);
        this.noiseFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);

        this.noiseSourceNode.connect(this.noiseFilter).connect(gainNode).connect(this.pannerNode);
        this.noiseSourceNode.start();

        this.noiseActive = true;
        this.currentType = 'rain';

        const generateRaincrack = () => {
            if (!this.noiseActive || this.currentType !== 'rain') return;

            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(Math.random() * 1200 + 400, this.ctx.currentTime);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, this.ctx.currentTime);

            gain.gain.setValueAtTime(Math.random() * 0.015, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);

            osc.connect(filter).connect(gain).connect(this.pannerNode);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);

            this.crackleTimer = setTimeout(generateRaincrack, Math.random() * 150 + 20);
        };

        generateRaincrack();
        return true;
    }

    stopNoise() {
        if (this.noiseSourceNode) {
            try { this.noiseSourceNode.stop(); } catch(e){}
            this.noiseSourceNode = null;
        }
        if (this.crackleTimer) {
            clearTimeout(this.crackleTimer);
            this.crackleTimer = null;
        }
        this.noiseActive = false;
        if (this.currentType === 'rain' || this.currentType === 'brown') {
            this.currentType = null;
        }
    }

    stopAllSynthesizersExcept(except) {
        if (except !== 'binaural') this.stopBinaural();
        if (except !== 'noise') this.stopNoise();
    }

    playFocusEndChime() {
        this.init();
        const now = this.ctx.currentTime;
        const playSynthNote = (freq, delay, duration, vol = 0.15) => {
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(freq, now + delay);
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(freq * 1.5, now + delay);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900, now + delay);

            gain.gain.setValueAtTime(0, now + delay);
            gain.gain.linearRampToValueAtTime(vol, now + delay + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);

            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(gain).connect(this.ctx.destination);

            osc1.start(now + delay);
            osc1.stop(now + delay + duration);
            osc2.start(now + delay);
            osc2.stop(now + delay + duration);
        };

        const speed = 0.18;
        playSynthNote(261.63, 0, 1.8);
        playSynthNote(329.63, speed, 1.8);
        playSynthNote(392.00, speed * 2, 1.8);
        playSynthNote(493.88, speed * 3, 1.8);
        playSynthNote(587.33, speed * 4, 2.5);
    }
}

const AudioEngine = new Web8DAudioEngine();

const btnBinaural = document.getElementById('ambientFocusBtn');
const btnRain = document.getElementById('ambientRainBtn');
const btnBrown = document.getElementById('ambientBrownBtn');
const audioStatusText = document.getElementById('audioStatus');
const masterVolumeSlider = document.getElementById('masterVolume');
const volValLabel = document.getElementById('volumeVal');
const rotationSpeedSlider = document.getElementById('spatialSpeed');
const rotationSpeedValLabel = document.getElementById('rotationSpeedVal');
const testAlarmBtn = document.getElementById('testAlarmBtn');
const soundwaveElement = document.getElementById('soundwave');

function updateAudioUIVisuals() {
    const activeType = AudioEngine.currentType;
    
    btnBinaural.classList.remove('border-study-gold', 'bg-study-gold/10');
    btnRain.classList.remove('border-study-gold', 'bg-study-gold/10');
    btnBrown.classList.remove('border-study-gold', 'bg-study-gold/10');
    
    document.getElementById('icon-binaural').className = "w-3.5 h-3.5 opacity-60";
    document.getElementById('icon-rain').className = "w-3.5 h-3.5 opacity-60";
    document.getElementById('icon-brown').className = "w-3.5 h-3.5 opacity-60";

    if (activeType) {
        audioStatusText.textContent = "8D Panning Audio Live";
        audioStatusText.classList.remove('bg-study-sand-200', 'dark:bg-study-olive-800/60', 'text-study-olive-600');
        audioStatusText.classList.add('bg-study-gold/20', 'text-study-gold');
        soundwaveElement.classList.remove('opacity-30');
        soundwaveElement.classList.add('opacity-100');

        if (activeType === 'binaural') {
            btnBinaural.classList.add('border-study-gold', 'bg-study-gold/10');
            document.getElementById('icon-binaural').className = "w-3.5 h-3.5 text-study-gold animate-bounce";
        } else if (activeType === 'rain') {
            btnRain.classList.add('border-study-gold', 'bg-study-gold/10');
            document.getElementById('icon-rain').className = "w-3.5 h-3.5 text-study-gold animate-bounce";
        } else if (activeType === 'brown') {
            btnBrown.classList.add('border-study-gold', 'bg-study-gold/10');
            document.getElementById('icon-brown').className = "w-3.5 h-3.5 text-study-gold animate-bounce";
        }
    } else {
        audioStatusText.textContent = "Inactive";
        audioStatusText.classList.add('bg-study-sand-200', 'dark:bg-study-olive-800/60', 'text-study-olive-600');
        audioStatusText.classList.remove('bg-study-gold/20', 'text-study-gold');
        soundwaveElement.classList.add('opacity-30');
        soundwaveElement.classList.remove('opacity-100');
    }
}

btnBinaural.addEventListener('click', () => {
    AudioEngine.toggleBinauralFocus();
    updateAudioUIVisuals();
});

btnRain.addEventListener('click', () => {
    AudioEngine.toggleRainSound();
    updateAudioUIVisuals();
});

btnBrown.addEventListener('click', () => {
    AudioEngine.toggleBrownNoise();
    updateAudioUIVisuals();
});

masterVolumeSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    volValLabel.textContent = val + "%";
    AudioEngine.updateMasterGain(val / 100);
});

rotationSpeedSlider.addEventListener('input', (e) => {
    const rawVal = e.target.value;
    const mapFreq = rawVal / 100;
    let status = "Normal";
    if (mapFreq < 0.1) status = "Cozy & Slow";
    else if (mapFreq > 0.28) status = "Expressive";
    
    rotationSpeedValLabel.textContent = status;
    AudioEngine.updateSpatialSpeed(mapFreq);
});

testAlarmBtn.addEventListener('click', () => {
    AudioEngine.playFocusEndChime();
    showToast("Melodic Chime Triggered", "Synthesizer completed playing the warm focal chord.", "bell-ring");
});

// --- CORE TIMER / STOPWATCH ENGINE ---
class CountdownTimerEngine {
    constructor() {
        this.timerState = 'idle';
        this.currentMode = 'pomodoro';
        this.remainingSeconds = 1500;
        this.initialDurationSeconds = 1500;
        this.intervalId = null;
        this.statSessionsCount = 0;
        this.statMinutesFocused = 0;
        this.stopwatchElapsedSeconds = 0;
    }

    setMode(mode) {
        if (this.timerState === 'running') {
            this.pause();
        }

        this.currentMode = mode;
        
        if (mode === 'pomodoro') {
            this.remainingSeconds = 1500;
            this.initialDurationSeconds = 1500;
        } else if (mode === 'shortBreak') {
            this.remainingSeconds = 300;
            this.initialDurationSeconds = 300;
        } else if (mode === 'longBreak') {
            this.remainingSeconds = 900;
            this.initialDurationSeconds = 900;
        } else if (mode === 'custom') {
            const h = parseInt(document.getElementById('customHrs').value) || 0;
            const m = parseInt(document.getElementById('customMins').value) || 0;
            const s = parseInt(document.getElementById('customSecs').value) || 0;
            const totalSecs = (h * 3600) + (m * 60) + s;
            this.remainingSeconds = totalSecs > 0 ? totalSecs : 1500;
            this.initialDurationSeconds = this.remainingSeconds;
        } else if (mode === 'stopwatch') {
            this.stopwatchElapsedSeconds = 0;
        }
        
        this.timerState = 'idle';
        this.updateUI();
    }

    togglePlayPause() {
        if (this.timerState === 'running') {
            this.pause();
        } else {
            this.start();
        }
    }

    start() {
        this.timerState = 'running';
        AudioEngine.init();

        if (this.currentMode === 'stopwatch') {
            this.intervalId = setInterval(() => {
                this.stopwatchElapsedSeconds++;
                this.updateUI();
            }, 1000);
        } else {
            this.intervalId = setInterval(() => {
                if (this.remainingSeconds > 0) {
                    this.remainingSeconds--;
                    this.updateUI();
                } else {
                    this.completeTimerCycle();
                }
            }, 1000);
        }
        this.updateUI();
    }

    pause() {
        this.timerState = 'paused';
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.updateUI();
    }

    reset() {
        this.pause();
        this.timerState = 'idle';
        
        if (this.currentMode === 'stopwatch') {
            this.stopwatchElapsedSeconds = 0;
        } else {
            this.remainingSeconds = this.initialDurationSeconds;
        }
        this.updateUI();
    }

    completeTimerCycle() {
        this.pause();
        AudioEngine.playFocusEndChime();

        if (this.currentMode === 'pomodoro' || this.currentMode === 'custom') {
            const durationMins = Math.round(this.initialDurationSeconds / 60);
            this.statSessionsCount++;
            this.statMinutesFocused += durationMins;
            
            document.getElementById('statSessions').textContent = this.statSessionsCount;
            document.getElementById('statMinutes').textContent = this.statMinutesFocused + "m";
            
            showToast(
                "Goal Accomplished!", 
                `Spectacular work. Focused for ${durationMins}m straight. Take a break!`, 
                "cup"
            );
        } else {
            showToast(
                "Break Cycle Completed", 
                "Ready to center back into focused study time?", 
                "coffee"
            );
        }

        this.reset();
    }

    updateUI() {
        const display = document.getElementById('countdownDisplay');
        const zenDisplay = document.getElementById('zenCountdown');
        const phaseLabel = document.getElementById('currentPhaseLabel');
        const zenPhaseLabel = document.getElementById('zenPhaseLabel');
        
        let activeSecs = (this.currentMode === 'stopwatch') ? this.stopwatchElapsedSeconds : this.remainingSeconds;
        const hrs = Math.floor(activeSecs / 3600);
        const mins = Math.floor((activeSecs % 3600) / 60);
        const secs = activeSecs % 60;
        
        let timeStr = "";
        if (hrs > 0) {
            timeStr = `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        display.textContent = timeStr;
        zenDisplay.textContent = timeStr;
        document.title = `${timeStr} - AuraFocus Companion`;

        const dot1 = document.getElementById('dot1');
        const dot2 = document.getElementById('dot2');
        const dot3 = document.getElementById('dot3');
        
        if (this.timerState === 'running') {
            const tickPhase = activeSecs % 3;
            dot1.style.opacity = tickPhase === 0 ? '1' : '0.3';
            dot2.style.opacity = tickPhase === 1 ? '1' : '0.3';
            dot3.style.opacity = tickPhase === 2 ? '1' : '0.3';
            particleSpeedMultiplier = 2.5;
        } else {
            dot1.style.opacity = '0.3';
            dot2.style.opacity = '0.3';
            dot3.style.opacity = '0.3';
            particleSpeedMultiplier = 0.4;
        }

        let labelText = "FOCUS SESSION";
        if (this.currentMode === 'shortBreak') labelText = "SHORT COFFEE BREAK";
        else if (this.currentMode === 'longBreak') labelText = "DEEP CALM RECESS";
        else if (this.currentMode === 'custom') labelText = "CUSTOM FOCUS SESSION";
        else if (this.currentMode === 'stopwatch') labelText = "STOPWATCH DESK";

        phaseLabel.textContent = labelText;
        zenPhaseLabel.textContent = labelText;

        const countdownRing = document.getElementById('countdownRing');
        if (this.currentMode === 'stopwatch') {
            countdownRing.style.strokeDashoffset = "0";
        } else {
            const progressFraction = (this.initialDurationSeconds - this.remainingSeconds) / this.initialDurationSeconds;
            const maxOffset = 276.4;
            const calculatedOffset = maxOffset - (progressFraction * maxOffset);
            countdownRing.style.strokeDashoffset = calculatedOffset;
        }

        const playIcon = document.getElementById('playIcon');
        const playText = document.getElementById('playText');
        const zenPlayIcon = document.getElementById('zenPlayIcon');

        if (this.timerState === 'running') {
            playIcon.setAttribute('data-lucide', 'pause');
            zenPlayIcon.setAttribute('data-lucide', 'pause');
            playText.textContent = "Pause Session";
        } else {
            playIcon.setAttribute('data-lucide', 'play');
            zenPlayIcon.setAttribute('data-lucide', 'play');
            playText.textContent = this.currentMode === 'stopwatch' ? "Start Stopwatch" : "Begin Session";
        }
        lucide.createIcons();
    }
}

const Timer = new CountdownTimerEngine();
const slidingPill = document.getElementById('slidingPill');
const modePomoBtn = document.getElementById('modePomodoro');
const modeShortBtn = document.getElementById('modeBreakShort');
const modeLongBtn = document.getElementById('modeBreakLong');
const modeCustomBtn = document.getElementById('modeCustom');
const customTimerForm = document.getElementById('customTimerForm');
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const skipBtn = document.getElementById('skipBtn');
const toggleStopwatchBtn = document.getElementById('toggleStopwatchBtn');
const stopwatchToggleText = document.getElementById('stopwatchToggleText');

function switchTimerTab(mode, offsetPercent) {
    slidingPill.style.left = `calc(${offsetPercent}% + 1.5px)`;
    slidingPill.style.width = `calc(25% - 3px)`;
    
    if (mode === 'custom') {
        customTimerForm.classList.remove('hidden');
        setTimeout(() => {
            customTimerForm.classList.remove('scale-95', 'opacity-0');
            customTimerForm.classList.add('scale-100', 'opacity-100');
        }, 50);
    } else {
        customTimerForm.classList.remove('scale-100', 'opacity-100');
        customTimerForm.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            customTimerForm.classList.add('hidden');
        }, 150);
    }

    Timer.setMode(mode);
    stopwatchToggleText.textContent = "Switch to Stopwatch Mode";
}

modePomoBtn.addEventListener('click', () => switchTimerTab('pomodoro', 0));
modeShortBtn.addEventListener('click', () => switchTimerTab('shortBreak', 25));
modeLongBtn.addEventListener('click', () => switchTimerTab('longBreak', 50));
modeCustomBtn.addEventListener('click', () => switchTimerTab('custom', 75));

document.getElementById('applyCustomBtn').addEventListener('click', () => {
    Timer.setMode('custom');
    showToast("Custom Countdown Ready", "Desired study timer configuration has been locked in.", "sliders");
});

playPauseBtn.addEventListener('click', () => Timer.togglePlayPause());
resetBtn.addEventListener('click', () => Timer.reset());
skipBtn.addEventListener('click', () => {
    if (Timer.currentMode === 'pomodoro') {
        switchTimerTab('shortBreak', 25);
    } else {
        switchTimerTab('pomodoro', 0);
    }
    showToast("Interval Skipped", "Advanced forward to next target focus phase.", "skip-forward");
});

toggleStopwatchBtn.addEventListener('click', () => {
    if (Timer.currentMode !== 'stopwatch') {
        Timer.setMode('stopwatch');
        stopwatchToggleText.textContent = "Switch to Classic Timer Mode";
        slidingPill.style.width = "0%";
        customTimerForm.classList.add('hidden');
        showToast("Stopwatch Initialized", "Keep tracking study blocks chronologically.", "stopwatch");
    } else {
        switchTimerTab('pomodoro', 0);
    }
});

// --- COZY STUDY TASKS SUITE ---
class FocusTaskManager {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('studyTasks')) || [
            { id: '1', title: 'Deep Work: Concepts Overview', completed: false },
            { id: '2', title: 'Revise Chemistry Equations', completed: false }
        ];
        this.activeTaskId = '1';
    }

    init() {
        const form = document.getElementById('taskForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('taskInput');
            const text = input.value.trim();
            if (text) {
                this.addTask(text);
                input.value = '';
            }
        });
        this.render();
    }

    addTask(title) {
        const newTask = {
            id: Date.now().toString(),
            title: title,
            completed: false
        };
        this.tasks.push(newTask);
        
        if (!this.activeTaskId) {
            this.activeTaskId = newTask.id;
        }

        this.save();
        this.render();
        showToast("Focus Goal Added", `Successfully outlined task: "${title.slice(0, 18)}..."`, "check-square");
    }

    toggleComplete(id) {
        this.tasks = this.tasks.map(t => {
            if (t.id === id) {
                const status = !t.completed;
                if (status) showToast("Study Task Finished", "Outstanding focus performance!", "award");
                return { ...t, completed: status };
            }
            return t;
        });
        this.save();
        this.render();
    }

    deleteTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        if (this.activeTaskId === id) {
            this.activeTaskId = this.tasks.length > 0 ? this.tasks[0].id : null;
        }
        this.save();
        this.render();
    }

    setActiveTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task && !task.completed) {
            this.activeTaskId = id;
            this.save();
            this.render();
            showToast("Task Spotlight Swapped", `Now focusing on: "${task.title.slice(0, 18)}..."`, "crosshair");
        }
    }

    save() {
        localStorage.setItem('studyTasks', JSON.stringify(this.tasks));
    }

    render() {
        const list = document.getElementById('taskList');
        const empty = document.getElementById('emptyTasksState');
        const counter = document.getElementById('taskCount');
        
        list.innerHTML = '';

        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        counter.textContent = `${completed} / ${total}`;

        if (total === 0) {
            list.appendChild(empty);
            document.getElementById('spotlightTaskBanner').classList.add('hidden');
            document.getElementById('zenActiveTaskText').textContent = "";
            return;
        }

        this.tasks.forEach(task => {
            const taskCard = document.createElement('div');
            const isActive = task.id === this.activeTaskId && !task.completed;
            
            let bgClasses = "bg-study-sand-100/30 dark:bg-study-olive-800/10 hover:bg-study-sand-100/80 dark:hover:bg-study-olive-800/25";
            let borderClasses = "border-study-sand-200/50 dark:border-study-olive-800/10";
            if (isActive) {
                bgClasses = "bg-study-gold/10 dark:bg-study-gold/5";
                borderClasses = "border-study-gold/40";
            }

            taskCard.className = `flex items-center justify-between p-3 rounded-2xl border ${borderClasses} ${bgClasses} transition-all duration-200 cursor-pointer relative group`;
            
            taskCard.addEventListener('click', (e) => {
                if (!e.target.closest('.action-button')) {
                    this.setActiveTask(task.id);
                }
            });

            const leftPart = document.createElement('div');
            leftPart.className = "flex items-center space-x-2.5 flex-grow pr-2";
            
            const checkBtn = document.createElement('button');
            checkBtn.type = "button";
            checkBtn.className = "action-button w-5 h-5 rounded-md border flex items-center justify-center transition-all";
            if (task.completed) {
                checkBtn.className += " bg-study-gold border-study-gold text-white";
                checkBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i>`;
            } else {
                checkBtn.className += " border-study-sand-300 dark:border-study-olive-700 hover:border-study-gold";
            }
            
            checkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleComplete(task.id);
            });

            const textSpan = document.createElement('span');
            textSpan.className = `text-[11px] font-medium leading-tight ${task.completed ? 'line-through opacity-45' : 'text-study-sand-900 dark:text-study-olive-100'}`;
            textSpan.textContent = task.title;

            leftPart.appendChild(checkBtn);
            leftPart.appendChild(textSpan);

            const rightPart = document.createElement('div');
            rightPart.className = "flex items-center space-x-2 flex-shrink-0";

            if (isActive) {
                const spotBadge = document.createElement('span');
                spotBadge.className = "text-[8px] font-bold tracking-wider uppercase text-study-gold px-1.5 py-0.5 rounded bg-study-gold/10";
                spotBadge.textContent = "Pinned";
                rightPart.appendChild(spotBadge);
            }

            const delBtn = document.createElement('button');
            delBtn.type = "button";
            delBtn.className = "action-button p-1.5 rounded-lg text-study-olive-600/40 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100";
            delBtn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>`;
            
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTask(task.id);
            });

            rightPart.appendChild(delBtn);
            taskCard.appendChild(leftPart);
            taskCard.appendChild(rightPart);
            list.appendChild(taskCard);
        });

        const activeTaskObj = this.tasks.find(t => t.id === this.activeTaskId && !t.completed);
        const spotlightBanner = document.getElementById('spotlightTaskBanner');
        const spotlightTitle = document.getElementById('spotlightTaskTitle');
        const zenActiveText = document.getElementById('zenActiveTaskText');

        if (activeTaskObj) {
            spotlightBanner.classList.remove('hidden');
            spotlightTitle.textContent = `Focusing on: ${activeTaskObj.title}`;
            zenActiveText.textContent = `Focus Target: "${activeTaskObj.title}"`;
        } else {
            spotlightBanner.classList.add('hidden');
            zenActiveText.textContent = "";
        }

        lucide.createIcons();
    }
}

const Tasks = new FocusTaskManager();
Tasks.init();

// --- 3D PARTICLE AMBIENT VISUALIZER (The 8D Visual Space) ---
const canvas = document.getElementById('ambientCanvas');
const ctx = canvas.getContext('2d');
let particlesArray = [];
let particleSpeedMultiplier = 0.4;

function setCanvasDimensions() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', () => {
    setCanvasDimensions();
    initVisualSpaceParticles();
});
setCanvasDimensions();

class AtmosphericParticle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = (Math.random() * 2 - 1) * 350;
        this.y = (Math.random() * 2 - 1) * 350;
        this.z = Math.random() * 350 + 50;
        this.size = Math.random() * 1.5 + 0.5;
        this.alpha = Math.random() * 0.4 + 0.1;
        const isGold = Math.random() > 0.4;
        this.color = isGold ? '197, 168, 128' : '96, 114, 100';
    }

    update() {
        this.z -= (0.2 * particleSpeedMultiplier);
        if (this.z <= 0) {
            this.reset();
        }
    }

    draw() {
        const focalLength = 250;
        const scale = focalLength / (focalLength + this.z);
        const projX = (this.x * scale) + (canvas.width / 2);
        const projY = (this.y * scale) + (canvas.height / 2);
        const drawSize = this.size * scale * 2.5;

        if (projX >= 0 && projX <= canvas.width && projY >= 0 && projY <= canvas.height) {
            ctx.beginPath();
            ctx.arc(projX, projY, drawSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.alpha * scale})`;
            ctx.fill();
        }
    }
}

function initVisualSpaceParticles() {
    particlesArray = [];
    const count = Math.min(120, Math.round(window.innerWidth / 12));
    for (let i = 0; i < count; i++) {
        particlesArray.push(new AtmosphericParticle());
    }
}
initVisualSpaceParticles();

function animateVisualSpace() {
    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? 'rgba(15, 18, 16, 0.12)' : 'rgba(250, 248, 245, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const time = Date.now() * 0.0006;
    const aurX = canvas.width / 2 + Math.cos(time) * 120;
    const aurY = canvas.height / 2 + Math.sin(time) * 60;
    const radGradient = ctx.createRadialGradient(aurX, aurY, 5, canvas.width/2, canvas.height/2, canvas.width * 0.5);
    
    if (isDark) {
        radGradient.addColorStop(0, 'rgba(197, 168, 128, 0.025)');
        radGradient.addColorStop(1, 'rgba(15, 18, 16, 0)');
    } else {
        radGradient.addColorStop(0, 'rgba(197, 168, 128, 0.05)');
        radGradient.addColorStop(1, 'rgba(250, 248, 245, 0)');
    }
    
    ctx.fillStyle = radGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particlesArray.forEach(p => {
        p.update();
        p.draw();
    });

    requestAnimationFrame(animateVisualSpace);
}

window.onload = function () {
    animateVisualSpace();
};

// --- 3D PERSPECTIVE CARD TILT HANDLERS ---
const timerCard = document.getElementById('timerCard');

document.addEventListener('mousemove', (e) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const mouseX = e.clientX - width / 2;
    const mouseY = e.clientY - height / 2;
    
    const rotX = -(mouseY / height) * 12;
    const rotY = (mouseX / width) * 12;
    
    timerCard.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-2px)`;
    timerCard.style.boxShadow = `${-rotY * 1.5}px ${rotX * 1.5}px 35px -5px rgba(197, 168, 128, 0.18)`;
});

document.addEventListener('mouseleave', () => {
    timerCard.style.transform = `rotateX(0deg) rotateY(0deg) translateY(0px)`;
    timerCard.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.08)';
});

// --- CALM ZEN FOCUS MODE SUITE ---
const zenBtn = document.getElementById('zenBtn');
const exitZenBtn = document.getElementById('exitZenBtn');
const zenOverlay = document.getElementById('zenOverlay');
const zenPlayPauseBtn = document.getElementById('zenPlayPauseBtn');
const zenResetBtn = document.getElementById('zenResetBtn');

function toggleZenView(activate) {
    if (activate) {
        AudioEngine.init();
        zenOverlay.classList.remove('hidden');
        setTimeout(() => {
            zenOverlay.classList.add('opacity-100');
            zenOverlay.classList.remove('pointer-events-none');
        }, 50);

        Timer.updateUI();
        showToast("Zen Space Activated", "External components collapsed to lock in absolute visual concentration.", "peace");
    } else {
        zenOverlay.classList.remove('opacity-100');
        zenOverlay.classList.add('pointer-events-none');
        setTimeout(() => {
            zenOverlay.classList.add('hidden');
        }, 700);
        Timer.updateUI();
    }
}

zenBtn.addEventListener('click', () => toggleZenView(true));
exitZenBtn.addEventListener('click', () => toggleZenView(false));
zenPlayPauseBtn.addEventListener('click', () => Timer.togglePlayPause());
zenResetBtn.addEventListener('click', () => Timer.reset());

// --- INFO DIALOG DESK MODAL ---
const btnHelp = document.getElementById('btnHelp');
const btnAbout = document.getElementById('btnAbout');
const aboutModal = document.getElementById('aboutModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalOkBtn = document.getElementById('modalOkBtn');

function toggleModal(open) {
    if (open) {
        aboutModal.classList.remove('hidden');
        setTimeout(() => {
            aboutModal.classList.remove('opacity-0');
            aboutModal.querySelector('.transform').classList.remove('scale-95');
            aboutModal.querySelector('.transform').classList.add('scale-100');
        }, 50);
    } else {
        aboutModal.classList.add('opacity-0');
        aboutModal.querySelector('.transform').classList.remove('scale-100');
        aboutModal.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            aboutModal.classList.add('hidden');
        }, 300);
    }
}

btnHelp.addEventListener('click', () => toggleModal(true));
btnAbout.addEventListener('click', () => toggleModal(true));
closeModalBtn.addEventListener('click', () => toggleModal(false));
modalOkBtn.addEventListener('click', () => toggleModal(false));
