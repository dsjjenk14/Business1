import { useEffect, useState } from 'react';

import { PersonRow } from '@/components/circles/PersonRow';
import { BackHeader } from '@/components/nav/AppHeader';
import { AppText, Screen, TextField } from '@/components/ui';
import { searchMembers, type SearchResult } from '@/features/circles/api';

/** Search members by name. Your circle and network come first. */
export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const h = setTimeout(() => {
      searchMembers(term).then((r) => !cancelled && setResults(r)).catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [q]);

  const shown = q.trim().length >= 2 ? results : [];

  return (
    <>
      <BackHeader title="Search Members" />
      <Screen>
        <TextField label="Name" value={q} onChangeText={setQ} autoFocus autoCorrect={false} placeholder="Search by name" returnKeyType="search" />
        {shown.map((r) => (
          <PersonRow
            key={r.id}
            id={r.id}
            name={r.display_name}
            emoji={r.avatar_emoji}
            avatarUrl={r.avatar_url}
            vouches={r.vouch_count}
            detail={r.degree === 1 ? '1st degree' : r.degree === 2 ? `2nd degree${r.via_name ? ` · via ${r.via_name}` : ''}` : r.headline}
          />
        ))}
        {q.trim().length >= 2 && shown.length === 0 ? (
          <AppText tone="muted" align="center">
            No members found.
          </AppText>
        ) : null}
      </Screen>
    </>
  );
}
