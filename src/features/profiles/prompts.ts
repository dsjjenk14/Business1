/** Profile prompts. Members answer up to 3. None of them ask for a place. */
export const PROMPTS: { key: string; label: string; placeholder: string }[] = [
  { key: 'ideal_friday', label: 'My ideal Friday is…', placeholder: 'Dinner with a few friends, then somewhere with live music' },
  { key: 'ask_me_about', label: 'Ask me about…', placeholder: 'The time I ran a half marathon by accident' },
  { key: 'friend_who', label: 'I’m the friend who…', placeholder: 'Always has a plan B' },
  { key: 'go_to_order', label: 'My go-to order…', placeholder: 'Spicy margarita, no salt' },
  { key: 'perfect_sunday', label: 'A perfect Sunday looks like…', placeholder: 'Long brunch, longer nap' },
  { key: 'green_flag', label: 'Green flag in a friend…', placeholder: 'Texts back about the plan' },
  { key: 'hype_song', label: 'The song that gets me out the door…', placeholder: 'Anything by Beyoncé' },
  { key: 'learning', label: 'I’m learning…', placeholder: 'Salsa, slowly' },
  { key: 'never_miss', label: 'I never miss…', placeholder: 'A good happy hour' },
  { key: 'two_truths', label: 'Two truths and a lie…', placeholder: 'I’ve met Obama, I can juggle, I hate brunch' },
];

export type ProfilePrompt = { key: string; answer: string };
export const promptLabel = (key: string) => PROMPTS.find((p) => p.key === key)?.label ?? key;
export const MAX_PROMPTS = 3;
