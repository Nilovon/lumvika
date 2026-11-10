-- The schema dump behind the baseline migration reproduces table-level privileges only, so the
-- column-level grants that keep private columns out of reach of anon and authenticated are lost on
-- any database rebuilt from it. Without them a fresh project has no readable catalogue at all.

grant select (availability, avatar_url, banner_url, bio, budget, created_at, featured, github_url, id, languages, linkedin_url, location, name, seo_indexed, skills, slug, status, type, updated_at, website_url, x_url) on public.experts to anon;

grant select (category, enabled, icon, name, slug) on public.services to anon;
grant select (category, enabled, icon, name, slug) on public.services to authenticated;

grant select (col_end, col_start, created_at, id, name, row_end, row_start, workspace_id) on public.spaces to authenticated;
grant insert (col_end, col_start, created_at, id, name, row_end, row_start, workspace_id) on public.spaces to authenticated;
grant update (col_end, col_start, created_at, id, name, row_end, row_start) on public.spaces to authenticated;

grant select (agent_count, agents, category, connectors, created_at, faq, featured, gallery, id, long_description, meta_description, meta_title, og_image_url, price_amount_cents, price_currency, pricing_model, published_at, setup_minutes, show_in_library, show_in_marketplace, slug, status, tagline, tags, title, updated_at, video_url) on public.templates to anon;
grant select (agent_count, agents, category, connectors, created_at, faq, featured, gallery, id, long_description, meta_description, meta_title, og_image_url, price_amount_cents, price_currency, pricing_model, published_at, setup_minutes, show_in_library, show_in_marketplace, slug, status, tagline, tags, title, updated_at, video_url) on public.templates to authenticated;
