/** Hand drawn doodles. Original SVG paths from the prototype. */
export type DoodleName =
  | "phone" | "door" | "people" | "scan" | "ladder" | "star" | "bulb" | "hand"
  | "rocket" | "trophy" | "map" | "note" | "clock" | "arrow" | "heart";

export function Doodle({ name, size = 54, color = "#38B2AC" }: { name: DoodleName; size?: number; color?: string }) {
  const o = { stroke: color, fill: "none", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let inner: React.ReactNode;
  switch (name) {
    case "phone": inner = <><path {...o} d="M18 14c-3 0-5 2-5 5 0 14 12 26 26 26 3 0 5-2 5-5l-1-6-8-3-4 4c-5-3-9-7-11-12l4-4-3-8z" /><path {...o} opacity=".55" d="M44 10c5 3 8 8 9 14M46 20c2 2 3 4 3 7" /></>; break;
    case "door": inner = <><rect {...o} x="12" y="8" width="28" height="48" rx="3" /><circle cx="34" cy="33" r="2.4" fill={color} /><path {...o} d="M46 33h14M54 27l6 6-6 6" /></>; break;
    case "people": inner = <><circle {...o} cx="22" cy="20" r="8" /><path {...o} d="M8 52c0-8 6-14 14-14s14 6 14 14" /><circle {...o} cx="45" cy="24" r="6.5" opacity=".65" /><path {...o} opacity=".65" d="M34 52c0-7 5-12 11-12s11 5 11 12" /></>; break;
    case "scan": inner = <><rect {...o} x="10" y="8" width="32" height="42" rx="3" /><path {...o} d="M17 19h18M17 27h18M17 35h11" /><circle {...o} cx="44" cy="42" r="11" /><path {...o} d="M52 50l7 7" /></>; break;
    case "ladder": inner = <path {...o} d="M20 58V8M44 58V8M20 48h24M20 36h24M20 24h24M20 14h24" />; break;
    case "bulb": inner = <><path {...o} d="M32 8c-9 0-16 7-16 15 0 6 3 10 6 13v6h20v-6c3-3 6-7 6-13 0-8-7-15-16-15z" /><path {...o} d="M26 50h12M28 56h8" /><path {...o} opacity=".5" d="M32 2v3M8 20h3M53 20h3M14 8l2 2M50 8l-2 2" /></>; break;
    case "hand": inner = <><path {...o} d="M6 32l10-6 12 5 8-3 10 4 12-6" /><path {...o} d="M16 26v12l12 6 8-3 10 4 12-6V26" /></>; break;
    case "rocket": inner = <><path {...o} d="M32 6c8 8 12 18 12 28l-6 8H26l-6-8C20 24 24 14 32 6z" /><circle {...o} cx="32" cy="26" r="5" /><path {...o} d="M26 42l-6 12 10-5M38 42l6 12-10-5" /></>; break;
    case "trophy": inner = <path {...o} d="M18 10h28v14c0 8-6 14-14 14s-14-6-14-14V10z M18 14h-7v5c0 5 3 8 7 9M46 14h7v5c0 5-3 8-7 9M32 38v10M22 56h20l-2-8H24z" />; break;
    case "map": inner = <><path {...o} d="M8 14l16-6 16 6 16-6v42l-16 6-16-6-16 6z" /><path {...o} d="M24 8v42M40 14v42" /></>; break;
    case "note": inner = <><rect {...o} x="12" y="8" width="36" height="46" rx="3" /><path {...o} d="M20 20h20M20 29h20M20 38h12" /><path {...o} opacity=".6" d="M50 44l8-8 4 4-8 8-5 1z" /></>; break;
    case "clock": inner = <><circle {...o} cx="32" cy="32" r="22" /><path {...o} d="M32 18v14l9 6" /></>; break;
    case "arrow": inner = <><path {...o} d="M8 44c10-18 26-28 46-30" /><path {...o} d="M42 8l12 6-6 12" /></>; break;
    case "heart": inner = <path {...o} d="M32 52S10 39 10 24c0-7 5-12 11-12 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 12 0 15-22 28-22 28z" />; break;
    default: inner = <path {...o} d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" />;
  }
  return <svg className="dd" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">{inner}</svg>;
}

export function Squiggle() {
  return (
    <svg className="scribble" width="150" height="9" viewBox="0 0 150 9" aria-hidden="true">
      <path d="M2 6c14-5 26 3 40-1s26-5 38 1 26 2 34-2" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
