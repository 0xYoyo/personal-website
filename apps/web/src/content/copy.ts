// Every UI string in one place. Agent lines that come from the spec or faq.md
// are verbatim; the few UI-only strings are marked "ui".

export const copy = {
  meta: {
    title: 'Yoyo — ask his agent',
  },
  entry: {
    /** SPEC §2.1, under the YOYO letters */
    nameLine: 'Yoav Zrihan · 0xYoyo',
    /** SPEC §2.1 */
    greeting: "hey. I'm Yoyo's agent — the one he keeps around to answer what the CV can't.",
    /** SPEC §2.1: "welcome back, Dana." */
    welcomeBack: (name: string) => `welcome back, ${name}.`,
    /** ui: returning visitor without a stored name */
    welcomeBackAnon: 'welcome back.',
    /** ui: appended when the visitor left a build last time */
    lastBuild: (title: string) => `your ${title} is still here.`,
    /** SPEC §2.2 */
    idle: 'or just watch.',
  },
  bar: {
    /** SPEC §2.1 placeholder cycle */
    placeholders: ['ask me anything', 'type your name', '🚀', 'make me a pomodoro timer', 'who is Yoyo?'],
    changePlaceholder: 'what should change?',
    inputLabel: 'Ask Yoyo’s agent',
    send: 'Send',
    mic: 'Hold to talk',
    micListening: 'Listening',
    stop: 'Stop',
  },
  menu: {
    home: 'Yoyo',
    homeLabel: 'Yoyo, back to the start',
    work: 'Work',
    stories: 'Stories',
    contact: 'Contact',
    sound: 'Sound',
    voice: 'Voice',
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
    line: 'He reads everything. Say you met the agent.',
    email: 'yoavyoav310@gmail.com',
    mailto: 'mailto:yoavyoav310@gmail.com?subject=Re%3A%20your%20agent',
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
  },
  runner: {
    skip: 'Skip',
    next: 'Next',
    prev: 'Back',
    stepHint: 'click for the next one',
  },
  history: {
    open: 'History',
    title: 'Conversation',
    close: 'Close (Esc)',
    you: 'you',
    agent: 'agent',
    empty: 'nothing yet. ask me something.',
  },
  a11y: {
    skip: 'Skip to the conversation',
    liveLabel: 'Conversation with Yoyo’s agent',
    swarm: 'A swarm of particles that becomes whatever the agent is saying.',
  },
  /** ui: the "Spell my name" chip when no name is known yet */
  askName: "type your name. I'll become it.",
  /** SPEC §2.8 */
  konami: 'nice.',
  /** SPEC §7 */
  brainResting: 'the live brain is resting — I still know everything.',
  share: {
    title: 'Built by Yoyo’s agent',
  },
} as const;
