// The landing page's only script: the theme toggle and the hero's Sunny. It fetches nothing but Sunny's recorded
// clips from this site, and stores nothing beyond the chosen theme and voice. Timings follow
// design/characters/sunflower/sunflower.rig.json.

const i18n = JSON.parse(document.getElementById("runtime-i18n")?.textContent || "{}");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// THEME: system → light → dark → system
const themeToggle = document.querySelector(".theme-toggle");
const themeModes = ["system", "light", "dark"];

function storedTheme() {
  try {
    const theme = localStorage.getItem("theme");
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

function applyTheme(mode) {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  try {
    if (mode === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", mode);
  } catch {}
  if (themeToggle) {
    themeToggle.dataset.mode = mode;
    themeToggle.setAttribute("aria-label", i18n.themeLabels?.[mode] ?? mode);
  }
}

if (themeToggle) {
  applyTheme(storedTheme());
  themeToggle.addEventListener("click", () => {
    const next = themeModes[(themeModes.indexOf(themeToggle.dataset.mode) + 1) % themeModes.length];
    applyTheme(next);
  });
}

// SUNNY: a little Mac screen with Sunny's panel open under its menu bar glyph. The toggles below change its day,
// and Sunny follows the app's manners: a line when one fits, quiet on a call, in full screen, while you're away
// and while shushed, and the line under the screen says why.
const hero = document.querySelector(".hero");
const screen = hero?.querySelector(".screen");
if (screen) {
  const stage = screen.querySelector(".stage");
  const bubble = stage.querySelector(".bubble");
  const sunnyButton = stage.querySelector(".sunny-button");
  const sayButton = hero.querySelector('[data-action="say"]');
  const shhButton = hero.querySelector('[data-action="shh"]');
  const ruleText = hero.querySelector(".rule");
  const clock = screen.querySelector("[data-clock]");
  const lockClock = screen.querySelector("[data-lock-clock]");
  const rules = i18n.rules ?? {};
  const scene = i18n.scene ?? {};

  const MOUTH_RATE = 6; // frames a second, for lines without a recording
  const MOUTH_FPS = i18n.mouthFPS ?? 12.5; // the recordings' mouth track
  const BLINK_INTERVALS = [4.2, 5.6, 3.8, 6.1];
  const BLINK_DURATION = 0.12;

  // The day on the little screen. A Tuesday, at 10:24 or at 2:04 at night, in the page's language.
  const lang = document.documentElement.lang;
  const DAY = new Date(2024, 0, 2, 10, 24);
  const NIGHT = new Date(2024, 0, 2, 2, 4);
  const menuClock = new Intl.DateTimeFormat(lang, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const bigClock = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" });

  const state = {
    call: false,
    full: false,
    away: false,
    battery: false,
    dark: false,
    night: false,
    shh: false,
  };
  const isQuiet = () => state.call || state.full || state.away || state.shh;

  let mood = "awake";
  let talkTimer = 0;
  let mouthTimer = 0;
  let revealTimer = 0;
  let bag = [];
  let last;

  // Sunny's recorded voices, on pages whose language has them. One player, so two lines never overlap.
  const voices = i18n.voices ?? [];
  const voiceSwitch = hero.querySelector(".voice-switch");
  const player = new Audio();
  player.preload = "none";
  let voice = voices[0];
  try {
    const saved = localStorage.getItem("voice");
    if (voices.includes(saved)) voice = saved;
  } catch {}

  function setMood(next) {
    mood = next;
    stage.dataset.mood = next;
  }

  /** The mood Sunny rests in when it isn't talking. */
  function rest() {
    setMood(state.call ? "call" : state.away ? "sleep" : state.shh ? "shushed" : "awake");
  }

  function setRule(text) {
    ruleText.textContent = text ?? "";
    ruleText.classList.remove("is-new");
    void ruleText.offsetWidth; // restart the fade-in
    ruleText.classList.add("is-new");
  }

  function nextLine() {
    if (!bag.length) {
      bag = [...(i18n.lines ?? [])];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.unshift(bag.pop());
    }
    last = bag.pop();
    warm(bag[bag.length - 1]);
    return last;
  }

  function clipFor(line) {
    return voice ? line?.voices?.[voice] : undefined;
  }

  /** Fetches the next line's clip ahead of time, so the next poke starts at once. */
  function warm(line) {
    const clip = clipFor(line);
    if (!clip) return;
    const ahead = new Audio();
    ahead.preload = "auto";
    ahead.src = clip.audio;
  }

  function play(clip) {
    player.src = clip.audio;
    player.play().catch(() => {}); // blocked or failed: the bubble still runs on the clip's timing
  }

  /** Ends the talking animation; the clip, if any, plays out its last breath. */
  function stopAnimating() {
    clearTimeout(talkTimer);
    clearInterval(mouthTimer);
    clearInterval(revealTimer);
    stage.classList.remove("mouth-open", "mouth-shut");
  }

  function stopTalking() {
    stopAnimating();
    player.pause();
  }

  function showBubble(text, { quiet = false } = {}) {
    bubble.textContent = text;
    bubble.classList.toggle("is-quiet", quiet);
    bubble.classList.remove("is-new");
    void bubble.offsetWidth; // restart the fade-in
    bubble.classList.add("is-new");
  }

  /**
   * Says a line: talking mood, the words appearing as they're said and the mouth moving. With a recording,
   * Sunny's voice plays and the mouth follows the clip's track; without one, it alternates.
   */
  function say(line) {
    if (!line) return;
    const text = line.text;
    stopTalking();
    setMood("talking");
    const clip = clipFor(line);
    const duration = clip ? clip.duration * 1000 : Math.max(1400, text.length * 55);
    if (clip) play(clip);
    if (reduceMotion.matches) {
      showBubble(text);
    } else {
      showBubble("");
      let shown = 0;
      const step = duration / text.length;
      revealTimer = setInterval(() => {
        shown += 1;
        bubble.textContent = text.slice(0, shown);
        if (shown >= text.length) clearInterval(revealTimer);
      }, step);
      if (clip) {
        const start = performance.now();
        mouthTimer = setInterval(() => {
          const seconds = player.paused ? (performance.now() - start) / 1000 : player.currentTime;
          const level = Number(clip.mouth[Math.floor(seconds * MOUTH_FPS)] ?? 0);
          stage.classList.toggle("mouth-open", level >= 2);
          stage.classList.toggle("mouth-shut", level === 0);
        }, 1000 / MOUTH_FPS);
      } else {
        mouthTimer = setInterval(() => stage.classList.toggle("mouth-open"), 1000 / MOUTH_RATE);
      }
    }
    talkTimer = setTimeout(() => {
      stopAnimating();
      bubble.textContent = text;
      rest();
    }, duration);
  }

  /** Something Sunny would remark on now, unless one of its manners keeps it quiet. */
  function remark(line, said, held) {
    if (isQuiet()) return setRule(held);
    say(line);
    setRule(said);
  }

  /** Hushes: speech stops mid-word, and the line is left where it was cut off. */
  function hush() {
    const wasTalking = mood === "talking";
    stopTalking();
    if (wasTalking) {
      bubble.textContent = `${bubble.textContent.trimEnd()}—`;
      bubble.classList.add("is-quiet");
    }
    rest();
    return wasTalking;
  }

  function render() {
    screen.classList.toggle("on-call", state.call);
    screen.classList.toggle("is-full", state.full);
    screen.classList.toggle("is-away", state.away);
    screen.classList.toggle("is-dark", state.dark);
    screen.classList.toggle("battery-low", state.battery);
    screen.dataset.sky = state.night ? "night" : "day";
    const time = state.night ? NIGHT : DAY;
    clock.textContent = menuClock.format(time);
    lockClock.textContent = bigClock.format(time);
    for (const toggle of hero.querySelectorAll("[data-toggle]")) {
      toggle.setAttribute("aria-pressed", String(state[toggle.dataset.toggle]));
    }
    shhButton.textContent = state.shh ? shhButton.dataset.labelWake : shhButton.dataset.labelShh;
    shhButton.setAttribute("aria-pressed", String(state.shh));
  }

  // What each toggle does to Sunny's day, on and off.
  const reactions = {
    call(on) {
      if (on) return setRule(hush() ? rules.callCut : rules.call);
      rest();
      remark(i18n.callOverLine, rules.callOver, rules.callOverQuiet);
    },
    full(on) {
      if (on) {
        hush();
        return setRule(rules.full);
      }
      setRule(rules.fullOff);
    },
    away(on) {
      if (on) {
        hush();
        return setRule(rules.away);
      }
      rest();
      remark(scene["back-chair"], rules.back, rules.backQuiet);
    },
    battery(on) {
      if (on) remark(scene["battery-light"], rules.battery, rules.batteryQuiet);
      else setRule(rules.batteryOff);
    },
    dark(on) {
      if (on) remark(scene["dark-glow"], rules.dark, rules.darkQuiet);
      else setRule(rules.darkOff);
    },
    night(on) {
      if (on) remark(scene["night-stars"], rules.night, rules.nightQuiet);
      else setRule(rules.nightOff);
    },
  };

  for (const toggle of hero.querySelectorAll("[data-toggle]")) {
    toggle.addEventListener("click", () => {
      const name = toggle.dataset.toggle;
      state[name] = !state[name];
      render();
      reactions[name](state[name]);
    });
  }

  function poke() {
    if (isQuiet()) {
      sunnyButton.classList.remove("is-wiggling");
      void sunnyButton.offsetWidth;
      sunnyButton.classList.add("is-wiggling");
      return setRule(state.shh ? rules.shushedPoke : rules.polite);
    }
    say(nextLine());
    setRule(rules.poke);
  }

  sayButton.addEventListener("click", poke);
  sunnyButton.addEventListener("click", poke);

  shhButton.addEventListener("click", () => {
    state.shh = !state.shh;
    render();
    if (state.shh) {
      stopTalking();
      rest();
      showBubble(i18n.shushed ?? "", { quiet: true });
      return setRule(rules.shh);
    }
    rest();
    remark(i18n.shhLine, rules.wake, rules.wakeQuiet);
  });

  // The voice switch: a radio group, arrows move the choice. Sunny says hello in the new voice.
  function setVoice(next, { greet = false, focus = false } = {}) {
    voice = next;
    for (const option of voiceSwitch?.querySelectorAll("[data-voice]") ?? []) {
      const checked = option.dataset.voice === next;
      option.setAttribute("aria-checked", String(checked));
      option.tabIndex = checked ? 0 : -1;
      if (checked && focus) option.focus();
    }
    if (!greet) return;
    try {
      localStorage.setItem("voice", next);
    } catch {}
    if (isQuiet()) player.pause();
    else say(i18n.voiceLine);
  }

  if (voiceSwitch) {
    setVoice(voice);
    voiceSwitch.addEventListener("click", (event) => {
      const option = event.target.closest("[data-voice]");
      if (option) setVoice(option.dataset.voice, { greet: true });
    });
    voiceSwitch.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = voices[(voices.indexOf(voice) + step + voices.length) % voices.length];
      setVoice(next, { greet: true, focus: true });
    });
  }

  // Blinks at the rig's uneven intervals; Reduce Motion holds the still pose.
  let blinkIndex = 0;
  function scheduleBlink() {
    const wait = BLINK_INTERVALS[blinkIndex++ % BLINK_INTERVALS.length] * 1000;
    setTimeout(() => {
      if (!reduceMotion.matches && !document.hidden) {
        stage.classList.add("is-blinking");
        setTimeout(() => stage.classList.remove("is-blinking"), BLINK_DURATION * 1000);
      }
      scheduleBlink();
    }, wait);
  }
  scheduleBlink();
  render();
  rest();
}
