import { memo, type ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

/**
 * Celeb Dash's own illustrated icons (the app never uses emoji). Each one is
 * drawn on a 24 × 24 grid in full color so it reads at bubble size.
 */
export type IconName =
  | 'drink'
  | 'charger'
  | 'glam'
  | 'light'
  | 'contract'
  | 'selfie'
  | 'order'
  | 'avotoast'
  | 'sushi'
  | 'cupcake'
  | 'acai'
  | 'plate'
  | 'heart'
  | 'heartEmpty'
  | 'star'
  | 'starEmpty'
  | 'clock'
  | 'coin'
  | 'follower'
  | 'flame'
  | 'rocket'
  | 'live'
  | 'paparazzi'
  | 'troll'
  | 'drama'
  | 'wifi'
  | 'spill'
  | 'seat'
  | 'late'
  | 'lock'
  | 'pause'
  | 'play'
  | 'sneaker'
  | 'tote'
  | 'dj'
  | 'chef'
  | 'guard'
  | 'glamsquad'
  | 'powerbank'
  | 'mesh'
  | 'trophy'
  | 'close'
  | 'check'
  | 'retry'
  | 'map'
  | 'shop'
  | 'book'
  | 'next'
  | 'back'
  | 'vibe'
  | 'phone';

const INK = '#1B1426';

const ART: Record<IconName, ReactNode> = {
  drink: (
    <G>
      <Path d="M6 6h12l-1.6 13.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z" fill="#FFFFFF" opacity={0.9} />
      <Path d="M6.9 11h10.2l-1.1 8.1a1.6 1.6 0 0 1-1.6 1.4H9.6A1.6 1.6 0 0 1 8 19.1z" fill="#FF4D8D" />
      <Path d="M7.4 14.6h9.2l-.6 4.5a1.6 1.6 0 0 1-1.6 1.4H9.6A1.6 1.6 0 0 1 8 19.1z" fill="#FFB347" />
      <Rect x={9.2} y={12.2} width={2.6} height={2.6} rx={0.6} fill="#FFFFFF" opacity={0.75} transform="rotate(-12 10.5 13.5)" />
      <Line x1={14.5} y1={2.5} x2={12.8} y2={14} stroke="#4CC9F0" strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={17.6} cy={6.2} r={2.8} fill="#9BE564" stroke="#FFFFFF" strokeWidth={0.7} />
      <Path d="M17.6 3.6v5.2M15 6.2h5.2" stroke="#D8F5A2" strokeWidth={0.5} />
      <Path d="M6 6h12l-1.6 13.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z" fill="none" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
    </G>
  ),
  charger: (
    <G>
      <Rect x={6} y={4} width={12} height={17} rx={2.4} fill="#1F2937" stroke={INK} strokeWidth={1.1} />
      <Rect x={9.5} y={2.2} width={5} height={2.4} rx={0.8} fill="#1F2937" stroke={INK} strokeWidth={0.9} />
      <Rect x={7.8} y={14} width={8.4} height={5.4} rx={1} fill="#7CF29C" />
      <Rect x={7.8} y={10.5} width={8.4} height={3} rx={0.8} fill="#7CF29C" opacity={0.55} />
      <Path d="M12.8 6.2 9.6 12.2h2.8l-1.2 5.6 3.6-6.6h-2.8z" fill="#FFD166" stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />
    </G>
  ),
  glam: (
    <G>
      <Rect x={3.5} y={12} width={9} height={9} rx={4.5} fill="#F7C6D9" stroke={INK} strokeWidth={1} />
      <Circle cx={8} cy={16.5} r={3} fill="#E8A0BF" />
      <Circle cx={7} cy={15.4} r={0.9} fill="#FFFFFF" opacity={0.8} />
      <Rect x={14} y={10} width={5.5} height={11} rx={1} fill="#FFD166" stroke={INK} strokeWidth={1} />
      <Rect x={14.6} y={8} width={4.3} height={3} fill="#C99A2E" />
      <Path d="M14.8 8V5.2C14.8 3.6 16 2.6 17.6 3l1.2.4V8z" fill="#E03174" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
      <Path d="M5 4.5l.8 1.6 1.6.8-1.6.8L5 9.3l-.8-1.6-1.6-.8 1.6-.8z" fill="#FFFFFF" />
    </G>
  ),
  light: (
    <G>
      <Circle cx={12} cy={10} r={7.6} fill="none" stroke="#FFF7D6" strokeWidth={3.2} />
      <Circle cx={12} cy={10} r={7.6} fill="none" stroke={INK} strokeWidth={0.6} opacity={0.5} />
      <Circle cx={12} cy={10} r={3} fill="#1F2937" />
      <Rect x={10.4} y={8} width={3.2} height={4.4} rx={0.7} fill="#4CC9F0" />
      <Line x1={12} y1={17.6} x2={12} y2={21.5} stroke="#3A3A44" strokeWidth={1.6} />
      <Path d="M8 22.5 12 20.5l4 2" fill="none" stroke="#3A3A44" strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={7} cy={4.4} r={0.9} fill="#FFFFFF" />
    </G>
  ),
  contract: (
    <G>
      <Path d="M5.5 3h9.5l4 4v13.5a1 1 0 0 1-1 1h-12.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#FFFFFF" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      <Path d="M15 3v4h4" fill="#E5E7EB" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M7.5 8h5M7.5 10.5h8M7.5 13h8" stroke="#9CA3AF" strokeWidth={1} strokeLinecap="round" />
      <Path d="M7.5 18c1.2-2 2-2 2.4-.8.4 1.4 1.2 1.4 2.2-.4.6 1 1.2 1.3 2.4.8" fill="none" stroke="#3A86FF" strokeWidth={1.1} strokeLinecap="round" />
      <Circle cx={16.8} cy={17.6} r={3.3} fill="#FFD166" stroke={INK} strokeWidth={0.9} />
      <Path d="M17.9 16.3c-.4-.5-2.2-.6-2.2.4s2.3.6 2.3 1.7-1.9 1-2.4.4M16.8 15.2v4.8" fill="none" stroke={INK} strokeWidth={0.8} strokeLinecap="round" />
    </G>
  ),
  selfie: (
    <G>
      <Rect x={6.5} y={2.5} width={11} height={19} rx={2.4} fill="#111827" stroke={INK} strokeWidth={1} />
      <Rect x={7.8} y={4.8} width={8.4} height={14} rx={1} fill="#FF8FAB" />
      <Circle cx={12} cy={10.4} r={2.3} fill="#FFE0C7" />
      <Path d="M8.6 18.8c.6-2.8 2-3.8 3.4-3.8s2.8 1 3.4 3.8z" fill="#FF4D8D" />
      <Circle cx={12} cy={3.6} r={0.5} fill="#6B7280" />
      <Path d="M19.5 4.5l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7z" fill="#FFD166" />
      <Path d="M3.6 13l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="#FFD166" />
    </G>
  ),
  order: (
    <G>
      <Rect x={5} y={3} width={14} height={18} rx={1.6} fill="#FFF8E7" stroke={INK} strokeWidth={1.1} />
      <Rect x={5} y={3} width={14} height={4.5} rx={1.6} fill="#FF4D8D" />
      <Path d="M8 10.5h8M8 13.5h6M8 16.5h7" stroke="#9CA3AF" strokeWidth={1.1} strokeLinecap="round" />
      <Circle cx={16.5} cy={13.5} r={0.8} fill="#FFB703" />
      <Path d="M12 4.2l.5 1 1 .1-.8.7.3 1-.9-.5-.9.5.3-1-.8-.7 1-.1z" fill="#FFFFFF" />
    </G>
  ),
  avotoast: (
    <G>
      <Path d="M3.5 12c0-4 3.6-6.5 8.5-6.5s8.5 2.5 8.5 6.5v6.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="#D4A15A" stroke={INK} strokeWidth={1} />
      <Path d="M5.5 12.2c0-3 2.8-4.7 6.5-4.7s6.5 1.7 6.5 4.7v5.8h-13z" fill="#F2D29B" />
      {[6.8, 10, 13.2, 16.4].map((x) => (
        <Ellipse key={x} cx={x + 0.6} cy={13.4} rx={1.6} ry={3.6} fill="#7CB342" stroke="#4E7F21" strokeWidth={0.5} transform={`rotate(14 ${x + 0.6} 13.4)`} />
      ))}
      <Circle cx={9} cy={16.6} r={0.45} fill="#E63946" />
      <Circle cx={14.5} cy={17} r={0.45} fill="#E63946" />
      <Circle cx={12} cy={10.2} r={0.4} fill="#1B1B1B" />
    </G>
  ),
  sushi: (
    <G>
      <Ellipse cx={12} cy={18.2} rx={9.5} ry={2.8} fill="#2D2D2D" stroke={INK} strokeWidth={0.8} />
      <Rect x={4} y={9.5} width={7} height={8} rx={3.5} fill="#1F3B2D" stroke={INK} strokeWidth={0.8} />
      <Ellipse cx={7.5} cy={10.6} rx={3.1} ry={1.6} fill="#FFFFFF" />
      <Ellipse cx={7.5} cy={10.6} rx={1.4} ry={0.8} fill="#FF8A5B" />
      <Rect x={12.5} y={10.5} width={8} height={7} rx={3} fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      <Path d="M12 11.4c1.6-3 7-3.4 9.2-.2-.6 1.4-2.2 1.8-4.6 1.8s-4-.4-4.6-1.6z" fill="#FF7B54" stroke={INK} strokeWidth={0.7} />
      <Path d="M14.4 10.2l1.6 1.6M16.6 9.6l1.6 1.8M18.8 9.8l1.4 1.6" stroke="#FFC4A8" strokeWidth={0.6} />
    </G>
  ),
  cupcake: (
    <G>
      <Path d="M6 13h12l-1.8 8a1.4 1.4 0 0 1-1.4 1.1H9.2A1.4 1.4 0 0 1 7.8 21z" fill="#4CC9F0" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M9 13.2l.6 8.6M12 13.2v8.8M15 13.2l-.6 8.6" stroke="#2A9CC4" strokeWidth={0.8} />
      <Path d="M5.2 13.4c-.8-2.4 1-4.2 3-4 .2-2.6 2.2-4 3.8-4s3.6 1.4 3.8 4c2-.2 3.8 1.6 3 4z" fill="#FFB3D1" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Circle cx={12} cy={4.4} r={1.7} fill="#E63946" stroke={INK} strokeWidth={0.6} />
      {[
        [8, 11, '#FFD166'],
        [10.5, 9, '#7CF29C'],
        [14, 10.4, '#4CC9F0'],
        [16, 12, '#B983FF'],
        [12, 12, '#FFFFFF'],
      ].map(([x, y, c]) => (
        <Rect key={`${x}-${y}`} x={x as number} y={y as number} width={1.4} height={0.6} rx={0.3} fill={c as string} transform={`rotate(30 ${x} ${y})`} />
      ))}
    </G>
  ),
  acai: (
    <G>
      <Path d="M3 11h18c0 5.5-4 9.5-9 9.5S3 16.5 3 11z" fill="#F5F0E6" stroke={INK} strokeWidth={1} />
      <Ellipse cx={12} cy={11} rx={9} ry={2.6} fill="#5B2A86" />
      <Path d="M5 10.6c1.4-1.6 3-1.8 4.4-1" stroke="#FFD166" strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={13} cy={10} r={1.4} fill="#E63946" />
      <Circle cx={15.6} cy={10.8} r={1.1} fill="#3A0CA3" />
      <Circle cx={17.4} cy={9.8} r={1.2} fill="#3A0CA3" />
      <Ellipse cx={10.4} cy={11.4} rx={1.8} ry={0.9} fill="#FFF3B0" />
      <Path d="M18.5 4.5c-1.6 1-2 2.6-1.4 4" stroke="#7CB342" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <Path d="M18.5 4.5c1 .2 1.6.9 1.6 1.8-1 .1-1.6-.6-1.6-1.8z" fill="#7CB342" />
    </G>
  ),
  plate: (
    <G>
      <Ellipse cx={12} cy={13} rx={9.5} ry={6.5} fill="#F8FAFC" stroke={INK} strokeWidth={1} />
      <Ellipse cx={12} cy={13} rx={6} ry={4} fill="#E2E8F0" />
      <Path d="M9 12.2c1 .6 2.4.4 3-.4M13.6 14.6c.8-.2 1.6.2 1.8.8" stroke="#B08968" strokeWidth={1} strokeLinecap="round" fill="none" />
      <Circle cx={10.2} cy={14.4} r={0.6} fill="#B08968" />
      <Circle cx={15.4} cy={11.6} r={0.5} fill="#7CB342" />
      <Path d="M19.5 3.5 17 11M21 4.2l-2.5 7.4" stroke="#94A3B8" strokeWidth={1} strokeLinecap="round" />
    </G>
  ),
  heart: <Path d="M12 20.5S3.5 15.4 3.5 9.3A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.3c0 6.1-8.5 11.2-8.5 11.2z" fill="#FF4D6D" stroke="#B3123A" strokeWidth={1} />,
  heartEmpty: (
    <Path d="M12 20.5S3.5 15.4 3.5 9.3A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.3c0 6.1-8.5 11.2-8.5 11.2z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
  ),
  star: <Path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#FFD166" stroke="#B7791F" strokeWidth={1} strokeLinejoin="round" />,
  starEmpty: (
    <Path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeLinejoin="round" />
  ),
  clock: (
    <G>
      <Circle cx={12} cy={13} r={8.5} fill="#FFFFFF" stroke={INK} strokeWidth={1.2} />
      <Path d="M12 8v5l3.2 2" stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <Rect x={10} y={2} width={4} height={2.4} rx={0.8} fill="#FF4D8D" />
    </G>
  ),
  coin: (
    <G>
      <Circle cx={12} cy={12} r={9} fill="#FFD166" stroke="#B7791F" strokeWidth={1.2} />
      <Circle cx={12} cy={12} r={6.4} fill="none" stroke="#E9B949" strokeWidth={1} />
      <Path d="M12 7.6l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#FFF3C4" />
    </G>
  ),
  follower: (
    <G>
      <Circle cx={10} cy={8.5} r={3.8} fill="#4CC9F0" />
      <Path d="M3 20c.6-4.6 3.4-6.8 7-6.8s6.4 2.2 7 6.8z" fill="#4CC9F0" />
      <Circle cx={18} cy={8} r={4} fill="#FF4D8D" />
      <Path d="M18 5.8v4.4M15.8 8h4.4" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
    </G>
  ),
  flame: (
    <G>
      <Path d="M12 21.5c-4.2 0-7-2.7-7-6.4 0-3 2-4.9 3.4-6.4.4 1.9 1.4 3 2.4 3.4 0-3.9 1.5-6.4 3.9-8.3.5 3 4.8 5.4 4.8 11.3 0 3.8-3 6.4-7.5 6.4z" fill="#FF6B35" />
      <Path d="M12 21.5c-2.2 0-3.6-1.4-3.6-3.3 0-1.6 1-2.6 1.8-3.4.2 1 .8 1.6 1.3 1.8 0-2 .8-3.4 2-4.4.3 1.6 2.6 2.9 2.6 6 0 2-1.6 3.3-4.1 3.3z" fill="#FFD166" />
    </G>
  ),
  rocket: (
    <G>
      <Path d="M14.5 3.5c3.6.2 6 2.6 6 6.4-1.8 3.8-5.2 6.8-8.4 8.4L6.1 12.4c1.6-3.4 4.6-6.8 8.4-8.9z" fill="#F8FAFC" stroke={INK} strokeWidth={1} />
      <Circle cx={15} cy={9} r={2} fill="#4CC9F0" stroke={INK} strokeWidth={0.8} />
      <Path d="M6.1 12.4 3 12.8l3-4.2 3.6-.6zM12 18.3l-.4 3.2 4.2-3 .6-3.6z" fill="#FF4D8D" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      <Path d="M7.2 16.8c-1.6.2-2.8 1.4-3.4 3.6 2.2-.6 3.4-1.8 3.6-3.4" fill="#FFD166" stroke="#FF6B35" strokeWidth={0.8} />
    </G>
  ),
  live: (
    <G>
      <Rect x={2} y={6} width={20} height={12} rx={3} fill="#FF2E4D" />
      <Circle cx={6.4} cy={12} r={1.8} fill="#FFFFFF" />
      <Path d="M10 9.2v5.6h2.4M13.8 9.2v5.6M15.6 9.2l1.4 5.6 1.4-5.6M21 9.2h-1.8v5.6H21M19.2 12h1.6" stroke="#FFFFFF" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  ),
  paparazzi: (
    <G>
      <Rect x={2.5} y={7} width={19} height={13} rx={2.4} fill="#2D3142" stroke={INK} strokeWidth={1} />
      <Path d="M7.5 7l1.6-2.6h5.8L16.5 7" fill="#2D3142" stroke={INK} strokeWidth={1} />
      <Circle cx={12} cy={13.5} r={4.4} fill="#4F5D75" stroke="#BFC0C0" strokeWidth={1.2} />
      <Circle cx={12} cy={13.5} r={2.2} fill="#0B0C10" />
      <Circle cx={11} cy={12.5} r={0.7} fill="#FFFFFF" />
      <Rect x={16.5} y={8.6} width={3.4} height={2} rx={0.6} fill="#FFFFFF" />
      <Path d="M20 2.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" fill="#FFF3B0" />
    </G>
  ),
  troll: (
    <G>
      <Path d="M4.5 11.5C4.5 6.5 7.8 3.5 12 3.5s7.5 3 7.5 8v4.5c0 2.8-2.4 5-5.4 5H9.9c-3 0-5.4-2.2-5.4-5z" fill="#7BC950" stroke={INK} strokeWidth={1} />
      <Path d="M4.6 9.5 1.8 7.2l3.2 0M19.4 9.5l2.8-2.3-3.2 0" fill="#7BC950" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
      <Circle cx={9.3} cy={11} r={1.8} fill="#FFFFFF" />
      <Circle cx={14.7} cy={11} r={1.8} fill="#FFFFFF" />
      <Circle cx={9.6} cy={11.3} r={0.9} fill="#E63946" />
      <Circle cx={14.4} cy={11.3} r={0.9} fill="#E63946" />
      <Path d="M7.6 8.6l3 1M16.4 8.6l-3 1" stroke={INK} strokeWidth={1} strokeLinecap="round" />
      <Path d="M8.6 16c2.2 1.6 4.6 1.6 6.8 0" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
      <Path d="M10 16.6l.4 1.2.6-1M13.2 16.6l.5 1.2.5-1" fill="#FFFFFF" />
    </G>
  ),
  drama: (
    <G>
      <Path d="M13.5 1.5 5 13.2h5.6L8.6 22.5l10.4-13h-5.8z" fill="#FFD166" stroke="#E85D04" strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M2.5 6l2 1M3 10.5h2M21.5 15l-2-.8M20.5 19l-1.8-1" stroke="#FF4D6D" strokeWidth={1.3} strokeLinecap="round" />
    </G>
  ),
  wifi: (
    <G>
      <Path d="M3 9.5a13 13 0 0 1 18 0M6 12.8a8.6 8.6 0 0 1 12 0M9 16a4.2 4.2 0 0 1 6 0" stroke="#9CA3AF" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={12} cy={19} r={1.6} fill="#9CA3AF" />
      <Line x1={4} y1={4} x2={20} y2={21} stroke="#FF2E4D" strokeWidth={2.4} strokeLinecap="round" />
    </G>
  ),
  spill: (
    <G>
      <Path d="M3 15.5c0-2.6 3-3.2 4.6-2.6 1-2.4 4.6-3 6.4-1 2.2-1.4 6.2-.6 6.2 2.6 1.6.8 1.4 3.6-1 4-1.4 2-5 2.2-7.2 1.4-2.2 1.2-6.4.8-7.4-1.2C3.2 18 3 16.6 3 15.5z" fill="#FF8FB1" stroke="#D6336C" strokeWidth={1} />
      <Ellipse cx={9} cy={15} rx={2.2} ry={0.9} fill="#FFFFFF" opacity={0.6} />
      <Path d="M17 3.5c0 2-1.4 3-1.4 4.2a1.4 1.4 0 0 0 2.8 0c0-1.2-1.4-2.2-1.4-4.2z" fill="#FF8FB1" stroke="#D6336C" strokeWidth={0.8} />
    </G>
  ),
  seat: (
    <G>
      <Path d="M6 3.5h12v9H6z" fill="#FF4D8D" stroke={INK} strokeWidth={1} />
      <Rect x={4.5} y={12} width={15} height={4} rx={1.4} fill="#FF8FB1" stroke={INK} strokeWidth={1} />
      <Path d="M6.5 16v5M17.5 16v5" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
    </G>
  ),
  late: (
    <G>
      <Rect x={3} y={9} width={2.6} height={12} rx={1} fill="#D4A017" />
      <Rect x={18.4} y={9} width={2.6} height={12} rx={1} fill="#D4A017" />
      <Circle cx={4.3} cy={8} r={2} fill="#FFD166" />
      <Circle cx={19.7} cy={8} r={2} fill="#FFD166" />
      <Path d="M5 10c4 4.4 10 4.4 14 0" stroke="#9B111E" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <Path d="M2 21.5h20" stroke="#9B111E" strokeWidth={1.4} />
    </G>
  ),
  lock: (
    <G>
      <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="#C9BEDD" strokeWidth={2} />
      <Rect x={5} y={10} width={14} height={11} rx={2.4} fill="#C9BEDD" />
      <Circle cx={12} cy={15} r={1.6} fill="#251C33" />
      <Path d="M12 15.5v2.5" stroke="#251C33" strokeWidth={1.4} strokeLinecap="round" />
    </G>
  ),
  pause: (
    <G>
      <Rect x={6} y={4.5} width={4.2} height={15} rx={1.4} fill="#FFFFFF" />
      <Rect x={13.8} y={4.5} width={4.2} height={15} rx={1.4} fill="#FFFFFF" />
    </G>
  ),
  play: <Path d="M7.5 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5a1 1 0 0 0-1.5.9z" fill="#FFFFFF" />,
  sneaker: (
    <G>
      <Path d="M2.5 16.5v-6.8c0-.8.7-1.4 1.5-1.2l3.3.9c.8 2 2.4 2.8 4.4 2.6l3.4 2c2.2.4 6.4 1 6.4 3.4v1.6c0 .6-.4 1-1 1H3.5a1 1 0 0 1-1-1z" fill="#FFFFFF" stroke={INK} strokeWidth={1} />
      <Path d="M2.5 16.4h19.5v1.8c0 .6-.4 1-1 1H3.5a1 1 0 0 1-1-1z" fill="#FF4D8D" />
      <Path d="M8 11.6l1.6-1.2M10 12.4l1.6-1.3M12.2 13l1.4-1.2" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
      <Path d="M15 14.4c1.6.2 3.4.8 4.4 1.6" stroke="#4CC9F0" strokeWidth={1.4} strokeLinecap="round" />
    </G>
  ),
  tote: (
    <G>
      <Path d="M8 8V6.5a4 4 0 0 1 8 0V8" fill="none" stroke={INK} strokeWidth={1.4} />
      <Path d="M4 8h16l-1.4 12.2a1.4 1.4 0 0 1-1.4 1.3H6.8a1.4 1.4 0 0 1-1.4-1.3z" fill="#FF4D8D" stroke={INK} strokeWidth={1} />
      <Path d="M7.5 12.5h9" stroke="#FFD166" strokeWidth={1.6} />
      <Path d="M12 14.4l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="#FFD166" />
    </G>
  ),
  dj: (
    <G>
      <Rect x={2.5} y={11} width={19} height={9} rx={1.6} fill="#2D3142" stroke={INK} strokeWidth={1} />
      <Circle cx={8} cy={15.5} r={3.2} fill="#0B0C10" stroke="#4CC9F0" strokeWidth={0.9} />
      <Circle cx={8} cy={15.5} r={0.8} fill="#FF4D8D" />
      <Circle cx={16} cy={15.5} r={3.2} fill="#0B0C10" stroke="#4CC9F0" strokeWidth={0.9} />
      <Circle cx={16} cy={15.5} r={0.8} fill="#FF4D8D" />
      <Path d="M8 9V4.5l8-1.5V7.5" stroke="#FFD166" strokeWidth={1.4} fill="none" />
      <Circle cx={6.6} cy={9} r={1.6} fill="#FFD166" />
      <Circle cx={14.6} cy={7.6} r={1.6} fill="#FFD166" />
    </G>
  ),
  chef: (
    <G>
      <Path d="M6.5 13.5c-2.6-.4-3.6-3.6-1.6-5.4 1.4-1.2 3-.8 3.6-.4.4-2.6 2.2-4 3.5-4s3.1 1.4 3.5 4c.6-.4 2.2-.8 3.6.4 2 1.8 1 5-1.6 5.4V18h-11z" fill="#FFFFFF" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Rect x={6.5} y={17.5} width={11} height={3.5} rx={0.8} fill="#E5E7EB" stroke={INK} strokeWidth={1} />
      <Path d="M9.5 13.5V16M12 13V16M14.5 13.5V16" stroke="#CBD5E1" strokeWidth={0.9} />
    </G>
  ),
  guard: (
    <G>
      <Path d="M12 2.5l7.5 3v5.6c0 4.8-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.6-7.5-10.4V5.5z" fill="#1F2937" stroke={INK} strokeWidth={1} />
      <Path d="M12 5l5 2v4.2c0 3.4-2.1 6.2-5 7.6-2.9-1.4-5-4.2-5-7.6V7z" fill="#4CC9F0" />
      <Path d="M9.2 11.8l2 2 3.8-4" stroke="#FFFFFF" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  ),
  glamsquad: (
    <G>
      <Path d="M5 20.5l3.5-10 4 4z" fill="#FFD166" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M8.5 10.5c1.6-3.6 5-6.4 9-7l1 1c-.6 4-3.4 7.4-7 9z" fill="#FFB3D1" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M16 13l.8 1.6 1.6.8-1.6.8-.8 1.6-.8-1.6-1.6-.8 1.6-.8zM19.5 7.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="#FF4D8D" />
    </G>
  ),
  powerbank: (
    <G>
      <Rect x={4} y={5} width={16} height={15} rx={3} fill="#FFD166" stroke="#B7791F" strokeWidth={1.1} />
      <Rect x={6.2} y={7.2} width={11.6} height={10.6} rx={1.8} fill="#FFE8A3" />
      <Path d="M13 8.5 9.4 13.4h2.8l-1.2 3.8 3.8-5.2h-2.8z" fill="#C99A2E" />
      <Rect x={20} y={10} width={1.6} height={5} rx={0.6} fill="#B7791F" />
    </G>
  ),
  mesh: (
    <G>
      <Rect x={4} y={14} width={16} height={6} rx={2} fill="#1F2937" stroke={INK} strokeWidth={1} />
      <Circle cx={8} cy={17} r={0.9} fill="#7CF29C" />
      <Circle cx={11} cy={17} r={0.9} fill="#7CF29C" />
      <Circle cx={14} cy={17} r={0.9} fill="#FFD166" />
      <Path d="M7 14V9M17 14V9" stroke="#1F2937" strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M6 6.4a8.6 8.6 0 0 1 12 0M8.4 9a4.8 4.8 0 0 1 7.2 0" stroke="#4CC9F0" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  ),
  trophy: (
    <G>
      <Path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z" fill="#FFD166" stroke="#B7791F" strokeWidth={1} />
      <Path d="M7 5H4.5c0 3 1 4.6 3 5M17 5h2.5c0 3-1 4.6-3 5" fill="none" stroke="#B7791F" strokeWidth={1.2} />
      <Path d="M10.6 14h2.8v3.5h-2.8z" fill="#E9B949" />
      <Rect x={7.5} y={17.5} width={9} height={3.2} rx={0.8} fill="#2D3142" />
      <Path d="M12 5.4l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z" fill="#FFF3C4" />
    </G>
  ),
  close: <Path d="M6 6l12 12M18 6 6 18" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  retry: (
    <G>
      <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <Path d="M19.8 3.5v4.6h-4.6" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  ),
  map: (
    <G>
      <Path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z" fill="#4CC9F0" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M9 3.5v14.5M15 6v14.5" stroke={INK} strokeWidth={0.9} />
      <Path d="M5.5 12c2-1.6 3.6.6 5.6-.6s3-2.6 5.4-1.2" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="1.5 1.5" fill="none" />
      <Circle cx={17.5} cy={10.4} r={1.6} fill="#FF4D8D" />
    </G>
  ),
  shop: (
    <G>
      <Path d="M3.5 9h17l-1 11.5a1 1 0 0 1-1 .9H5.5a1 1 0 0 1-1-.9z" fill="#FF4D8D" stroke={INK} strokeWidth={1} />
      <Path d="M3 9l2-5h14l2 5" fill="#FFD166" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M9 12.5a3 3 0 0 0 6 0" stroke="#FFFFFF" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </G>
  ),
  book: (
    <G>
      <Path d="M4 4.5h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" fill="#4CC9F0" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M20 4.5h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z" fill="#FF4D8D" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M6 8h4M6 10.5h4M14 8h4M14 10.5h4" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" />
    </G>
  ),
  next: <Path d="M9 5l7 7-7 7" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  back: <Path d="M15 5l-7 7 7 7" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  vibe: (
    <G>
      <Path d="M3 13h3l2-6 3 12 3-9 2 5 2-2h3" stroke="#FF4D8D" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={21} cy={13} r={1.4} fill="#FFD166" />
    </G>
  ),
  phone: (
    <G>
      <Rect x={6.5} y={2.5} width={11} height={19} rx={2.4} fill="#111827" stroke={INK} strokeWidth={1} />
      <Rect x={7.8} y={4.8} width={8.4} height={14} rx={1} fill="#4CC9F0" />
      <Polygon points="10.8,9 14.6,11.8 10.8,14.6" fill="#FFFFFF" />
    </G>
  ),
};

/** Raw icon drawing, for placing inside another Svg (24 × 24 units). */
export const ICON_ART = ART;

export const GameIcon = memo(function GameIcon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ART[name]}
    </Svg>
  );
});
