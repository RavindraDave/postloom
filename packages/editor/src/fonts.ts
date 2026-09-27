/** Fonts that look the same in (almost) every email app. */
export const EMAIL_FONTS = [
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, Times, serif' },
  { id: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'courier', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
] as const;

export const EMAIL_FONT_STACKS = EMAIL_FONTS.map((font) => font.stack) as [string, ...string[]];
