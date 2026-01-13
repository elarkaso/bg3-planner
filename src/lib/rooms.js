import { supabase } from "./supabaseClient";

export async function loadRoom(slug, seedData) {
  const { data, error } = await supabase
    .from("rooms")
    .select("data")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { error: insErr } = await supabase
      .from("rooms")
      .insert({ slug, data: seedData });

    // někdo jiný to mezitím vytvořil → jen znovu načti
    if (insErr && insErr.code !== "23505") {
      throw insErr;
    }

    const { data: retry } = await supabase
      .from("rooms")
      .select("data")
      .eq("slug", slug)
      .single();

    return retry.data;
  }


  return data.data;
}

export async function saveRoom(slug, newData) {
  const { error } = await supabase
    .from("rooms")
    .update({ data: newData })
    .eq("slug", slug);

  if (error) throw error;
}