/**
 * Every font file any theme uses. Keys are the family names referenced in themes.ts.
 * Per-weight imports keep unused weights out of the bundle.
 */
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue/400Regular';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { DMSans_800ExtraBold } from '@expo-google-fonts/dm-sans/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Figtree_900Black } from '@expo-google-fonts/figtree/900Black';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { Syne_400Regular } from '@expo-google-fonts/syne/400Regular';
import { Syne_600SemiBold } from '@expo-google-fonts/syne/600SemiBold';
import { Syne_700Bold } from '@expo-google-fonts/syne/700Bold';

export const FONT_MAP = {
  BebasNeue_400Regular,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  DMSans_800ExtraBold,
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  Figtree_900Black,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  JetBrainsMono_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  Syne_400Regular,
  Syne_600SemiBold,
  Syne_700Bold,
};

/**
 * The phone's own typeface (SF Pro on iPhone, Roboto on Android, the system
 * face on the web), by weight. Nothing to download.
 */
export const SYSTEM_FONTS = ['System400', 'System500', 'System600', 'System700', 'System800', 'System900'] as const;
