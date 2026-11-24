import { signal } from "@preact/signals";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 今開いているクラブ（2026-11-22 複数クラブ対応）。
 *
 * 1つのアプリを複数のクラブで使い、データは混ぜない。URL の /c/<slug> で
 * クラブが決まり、起動時に1回だけ読み込む（main.tsx）。URL にクラブが
 * 無ければ GG（id=1）。リポジトリは clubId() を見て、読む行も書く行も
 * そのクラブに絞る。DB 側は supabase/migrations/0012_v1_7_clubs.sql。
 */
export interface Club {
  id: number;
  slug: string;
  name: string;
  locale: "ja" | "en";
  /** LINE グループに送れるのは GG だけ（Edge Function の送り先が1つ）。 */
  lineEnabled: boolean;
}

export const GG_CLUB: Club = {
  id: 1,
  slug: "gg",
  name: "Golders Green Tennis Club",
  locale: "ja",
  lineEnabled: true,
};

export const currentClub = signal<Club>(GG_CLUB);

/** リポジトリが使う。テストでは既定値（GG）のまま。 */
export const clubId = (): number => currentClub.value.id;

export const isGgClub = (): boolean => currentClub.value.id === GG_CLUB.id;

interface ClubRow {
  id: number;
  slug: string;
  name: string;
  locale: string;
  line_enabled: boolean;
}

export function toClub(row: ClubRow): Club {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    locale: row.locale === "en" ? "en" : "ja",
    lineEnabled: row.line_enabled === true,
  };
}

const CLUB_COLUMNS = "id, slug, name, locale, line_enabled";

export async function loadClubBySlug(supabase: SupabaseClient, slug: string): Promise<Club | null> {
  const { data, error } = await supabase.from("settings").select(CLUB_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? toClub(data as ClubRow) : null;
}

export async function listClubs(supabase: SupabaseClient): Promise<Club[]> {
  const { data, error } = await supabase.from("settings").select(CLUB_COLUMNS).order("id");
  if (error) throw error;
  return ((data ?? []) as ClubRow[]).map(toClub);
}

export async function createClub(
  supabase: SupabaseClient,
  input: { adminPin: string; slug: string; name: string; locale: "ja" | "en"; pin: string },
): Promise<number> {
  const { data, error } = await supabase.rpc("create_club", {
    p_admin_pin: input.adminPin,
    p_slug: input.slug,
    p_name: input.name,
    p_locale: input.locale,
    p_pin: input.pin,
  });
  if (error) throw error;
  return data as number;
}

/** URL 用の slug として使えるか（DB の settings_slug_format と同じ規則）。 */
export function isValidClubSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,29}$/.test(slug);
}
