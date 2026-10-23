// Self-hosted fonts. Bricolage Grotesque ships weight (200–800) and width
// (75–100%) axes in the "standard" build; Heebo is only used for Hebrew text.
// Commit Mono is vendored in ./fonts (OFL, see ./fonts/LICENSE-FONT.txt) and
// declared in global.css; JetBrains Mono is only downloaded if it fails.
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/hebrew-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
