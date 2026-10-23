/** Where the Prompt Racers footage lives. Defaults to `<BASE_URL>footage/` (this package's public/footage). */
let footageBase: string = `${import.meta.env.BASE_URL ?? '/'}footage/`;

export function configureShowcases(opts: { footageBase?: string }): void {
  if (opts.footageBase) footageBase = opts.footageBase.endsWith('/') ? opts.footageBase : `${opts.footageBase}/`;
}

export const footageUrl = (file: string) => `${footageBase}${file}`;
