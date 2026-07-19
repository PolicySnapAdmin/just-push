-- Bump rarer skin prices (cosmetic economy balance)

create or replace function public.jp_store_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'skins', jsonb_build_array(
      jsonb_build_object('id','rose','label','Rose','value','#ff4d6d','cost',0,'free',true,'cat','classic','rarity','common'),
      jsonb_build_object('id','coral','label','Coral','value','#ff7a59','cost',0,'free',true,'cat','classic','rarity','common'),
      jsonb_build_object('id','amber','label','Amber','value','#f5a524','cost',0,'free',true,'cat','classic','rarity','common'),
      jsonb_build_object('id','lime','label','Lime','value','#84cc16','cost',80,'free',false,'cat','classic','rarity','common'),
      jsonb_build_object('id','mint','label','Mint','value','#2dd4a8','cost',80,'free',false,'cat','classic','rarity','common'),
      jsonb_build_object('id','sky','label','Sky','value','#38bdf8','cost',120,'free',false,'cat','classic','rarity','common'),
      jsonb_build_object('id','blue','label','Azure','value','#4f7cff','cost',120,'free',false,'cat','classic','rarity','common'),
      jsonb_build_object('id','violet','label','Violet','value','#a78bfa','cost',200,'free',false,'cat','classic','rarity','uncommon'),
      jsonb_build_object('id','pink','label','Blush','value','#f472b6','cost',200,'free',false,'cat','classic','rarity','uncommon'),
      jsonb_build_object('id','white','label','Pearl','value','#e8e8f0','cost',250,'free',false,'cat','classic','rarity','uncommon'),
      jsonb_build_object('id','iron','label','Iron','value','#94a3b8','cost',150,'free',false,'cat','metal','rarity','common'),
      jsonb_build_object('id','copper','label','Copper','value','#d97706','cost',200,'free',false,'cat','metal','rarity','common'),
      jsonb_build_object('id','gold','label','Gold Rush','value','#fbbf24','cost',450,'free',false,'cat','metal','rarity','rare'),
      jsonb_build_object('id','platinum','label','Platinum','value','#e2e8f0','cost',750,'free',false,'cat','metal','rarity','epic'),
      jsonb_build_object('id','obsidian','label','Obsidian','value','#1e1b2e','cost',550,'free',false,'cat','metal','rarity','rare'),
      jsonb_build_object('id','knight','label','Knight Plate','value','#64748b','cost',500,'free',false,'cat','armor','rarity','rare'),
      jsonb_build_object('id','dragonscale','label','Dragonscale','value','#15803d','cost',850,'free',false,'cat','armor','rarity','epic'),
      jsonb_build_object('id','runic','label','Runic Guard','value','#7c3aed','cost',1200,'free',false,'cat','armor','rarity','legendary'),
      jsonb_build_object('id','crimson','label','Crimson Mail','value','#991b1b','cost',800,'free',false,'cat','armor','rarity','epic'),
      jsonb_build_object('id','nebula','label','Nebula','value','#7c3aed','cost',700,'free',false,'cat','space','rarity','epic'),
      jsonb_build_object('id','void','label','Void','value','#0f172a','cost',900,'free',false,'cat','space','rarity','epic'),
      jsonb_build_object('id','comet','label','Comet Trail','value','#22d3ee','cost',550,'free',false,'cat','space','rarity','rare'),
      jsonb_build_object('id','solar','label','Solar Flare','value','#f97316','cost',600,'free',false,'cat','space','rarity','rare'),
      jsonb_build_object('id','neon','label','Neon Pulse','value','#22d3ee','cost',500,'free',false,'cat','space','rarity','rare'),
      jsonb_build_object('id','earth','label','Terra','value','#2563eb','cost',350,'free',false,'cat','world','rarity','uncommon'),
      jsonb_build_object('id','mars','label','Mars','value','#dc2626','cost',400,'free',false,'cat','world','rarity','uncommon'),
      jsonb_build_object('id','jupiter','label','Jupiter','value','#d97706','cost',550,'free',false,'cat','world','rarity','rare'),
      jsonb_build_object('id','moon','label','Lunar','value','#cbd5e1','cost',350,'free',false,'cat','world','rarity','uncommon'),
      jsonb_build_object('id','magma','label','Magma','value','#ef4444','cost',500,'free',false,'cat','element','rarity','rare'),
      jsonb_build_object('id','frost','label','Frostbite','value','#7dd3fc','cost',500,'free',false,'cat','element','rarity','rare'),
      jsonb_build_object('id','storm','label','Storm','value','#6366f1','cost',550,'free',false,'cat','element','rarity','rare'),
      jsonb_build_object('id','toxic','label','Toxic','value','#a3e635','cost',400,'free',false,'cat','element','rarity','uncommon'),
      jsonb_build_object('id','shadow','label','Shadow','value','#475569','cost',250,'free',false,'cat','element','rarity','common')
    ),
    'token_packs', jsonb_build_array(
      jsonb_build_object('id','pack_s','label','Handy Pack','tokens',100,'price_label','$0.99','iap',true,'enabled',false),
      jsonb_build_object('id','pack_m','label','Solid Pack','tokens',550,'price_label','$4.99','iap',true,'enabled',false),
      jsonb_build_object('id','pack_l','label','Vault Pack','tokens',1200,'price_label','$9.99','iap',true,'enabled',false)
    ),
    'note', 'Skins are cosmetic only — never more clicks or XP. Real-money token packs come later (IAP / Lemon Squeezy).'
  );
$$;

grant execute on function public.jp_store_catalog() to authenticated;
