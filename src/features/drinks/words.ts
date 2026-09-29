/** "a Margarita", "an Espresso Martini", "an Old Fashioned". */
export const aDrink = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
