// Every UI string in one place. Agent lines that come from the spec or faq.md
// are verbatim; the few UI-only strings are marked "ui".

export const copy = {
  meta: {
    title: 'Yoyo',
  },
  entry: {
    /** SPEC §2.1, under the YOYO letters */
    nameLine: 'Yoav Zrihan · 0xYoyo',
    /** WAVE3 V1: the site speaks as Yoyo */
    // a no-break space before the last word: a phone never leaves "it." alone on a line (FIX4 W9)
    greeting: "hey. I'm Yoyo. Ask me anything — or type a word and I'll become\u00a0it.",
    /** SPEC §2.1: "welcome back, Dana." */
    welcomeBack: (name: string) => `welcome back, ${name}.`,
    /** ui: returning visitor without a stored name */
    welcomeBackAnon: 'welcome back.',
    /** ui: appended when the visitor left a build last time */
    lastBuild: (title: string) => `I kept your ${title}.`,
    /** SPEC §2.2 */
    idle: 'or just watch.',
  },
  bar: {
    /** WAVE3 V6: one static placeholder */
    placeholders: ['ask me anything, or type a word'],
    changePlaceholder: 'what should change?',
    inputLabel: 'Ask Yoyo',
    send: 'Send',
    mic: 'Hold to talk',
    micListening: 'Listening',
    stop: 'Stop',
  },
  menu: {
    home: 'Yoyo',
    homeLabel: 'Yoyo, back to the start',
    work: 'Work',
    /** WAVE3 V6: focuses the bar */
    ask: 'Ask',
    contact: 'Contact',
    sound: 'Sound',
  },
  chips: {
    soundOn: 'sound on',
    /** the chip row, when it scrolls sideways (mobile) and takes focus */
    scrollLabel: 'More suggestions: use the arrow keys or scroll',
  },
  card: {
    play: 'Play',
    close: 'Close (Esc)',
    prev: 'Previous',
    next: 'Next',
    showcase: 'showcase',
    status: (status: string, period: string, note?: string) => (note ? `${status}: ${note}. ${period}` : `${status}, ${period}`),
  },
  build: {
    /** SPEC §2.6 */
    onIt: 'on it.',
    /** SPEC §2.6: `14 seconds. Want changes?` */
    done: (seconds: number) => `${seconds} seconds. Want changes?`,
    /** SPEC §2.6 / faq.md build (scripted) */
    resting: "the live builder is resting. here's one I made earlier — same speed, same idea.",
    /** ui: cap reached (SPEC §2.6 asks for an honest message) */
    capped: "that's five builds this hour. come back in a bit — or ask me something.",
    /** POLISH1 A3: the caption while the code streams */
    writing: 'writing…',
    /** ui */
    stopped: 'stopped.',
    failed: 'that one fell over. once more?',
    controls: {
      fullscreen: 'Open full screen',
      copy: 'Copy HTML',
      copied: 'Copied',
      download: 'Download',
      share: 'Share',
      shared: 'Link copied',
      change: 'Change it',
      close: 'Close (Esc)',
    },
    frameTitle: 'Your build',
  },
  contact: {
    /** SPEC §2.7 */
    line: 'I read everything. Say hi.',
    email: 'yoavyoav310@gmail.com',
    mailto: 'mailto:yoavyoav310@gmail.com?subject=Hi%20Yoyo',
    github: 'GitHub',
    githubHref: 'https://github.com/0xYoyo',
    linkedin: 'LinkedIn',
    linkedinHref: 'https://www.linkedin.com/in/yoavzrihan',
    cv: 'CV (PDF)',
    cvHref: '/Yoav_Zrihan_CV.pdf',
    close: 'Close (Esc)',
  },
  game: {
    title: 'Prompt Racers',
    close: 'Close (Esc)',
    /** ui (FIX4 U10): on a touch device, one line — the first only if the game had touch steering */
    touchHint: 'tap to start · tilt or touch to steer',
    keyboardHint: 'best on a keyboard',
  },
  runner: {
    skip: 'Skip',
    next: 'Next',
    prev: 'Back',
    stepHint: 'click for the next one',
    stepHintTouch: 'tap for the next one',
  },
  history: {
    open: 'History',
    title: 'Conversation',
    close: 'Close (Esc)',
    you: 'you',
    agent: 'Yoyo',
    empty: 'nothing yet. ask me something.',
  },
  a11y: {
    skip: 'Skip to the conversation',
    liveLabel: 'Conversation with Yoyo',
    swarm: 'A swarm of particles that becomes whatever Yoyo is saying.',
  },
  /** ui: the "Spell my name" chip when no name is known yet */
  askName: "type your name. I'll become it.",
  /** SPEC §2.8 */
  konami: 'nice.',
  /** SPEC §7 */
  brainResting: 'the live brain is resting — I still know everything.',
  share: {
    title: 'Built on Yoyo’s site',
  },
} as const;
