-- WhatsApp Pro, the second paid app: a WhatsApp number of the workspace, linked through Linkup the
-- way LinkedIn Pro links a profile. It rides on the paid_apps tables as they are (app_slug carries
-- no check), so this only adds the catalogue row coworkers install it from.
--
-- Disabled on insert: this migration runs before the deploy, and the code still live then does not
-- know the 'whatsapp' app. Enabling it right after the deploy is part of the launch. The icon is
-- left to the admin icon route (Simple Icons), as for every catalogue row.
insert into public.services (slug, name, category, summary, enabled, manifest)
values (
  'whatsapp-pro',
  'WhatsApp Pro',
  'crm',
  'Read and answer WhatsApp conversations from your own number, and wake up when someone writes.',
  false,
  jsonb_build_object(
    'slug', 'whatsapp-pro',
    'name', 'WhatsApp Pro',
    'category', 'crm',
    'summary', 'Read and answer WhatsApp conversations from your own number, and wake up when someone writes.',
    'description', 'Your coworker acts from a WhatsApp number linked to the workspace, as a linked device: it reads a conversation, answers with text, files or voice notes, and checks which numbers are on WhatsApp. A new message can wake it up. Daily limits keep the number clear of a WhatsApp ban. Billed by the slot on your plan.',
    'authMethods', jsonb_build_array(
      jsonb_build_object(
        'id', 'app',
        'label', 'Pick a WhatsApp number',
        'kind', 'app',
        'recommended', true,
        'app', jsonb_build_object('appSlug', 'whatsapp'),
        'inputs', '[]'::jsonb,
        'envKeys', '[]'::jsonb,
        'mcpServers', jsonb_build_array(jsonb_build_object(
          'name', 'whatsapp_pro', 'transport', 'http', 'url', '${LUMVIKA_HUB_BASE_URL}/api/mcp/apps/whatsapp',
          'args', '[]'::jsonb, 'env', '{}'::jsonb,
          'headers', jsonb_build_object('x-lumvika-key', '${LUMVIKA_API_KEY}', 'x-lumvika-agent', '${agent.id}')
        ))
      )
    ),
    'skills', jsonb_build_array(jsonb_build_object(
      'name', 'whatsapp-pro-usage', 'description', 'How to write on WhatsApp as the user without getting the number banned',
      'body', '# WhatsApp Pro' || E'\n\n' ||
        'You act from the user''s own WhatsApp number. Everything you send carries their name, and WhatsApp bans a number that messages strangers.' || E'\n\n' ||
        '- Write only to people who expect to hear from the user: someone who wrote first, a customer, a contact the user named. Never send cold messages or the same text to a list.' || E'\n' ||
        '- Before every message, read the conversation with whatsapp_pro_get_conversation. Never send the same message twice, never follow up more than once without an answer.' || E'\n' ||
        '- Numbers go in international format, e.g. +33612345678. Use whatsapp_pro_check_numbers when you are not sure a number is on WhatsApp.' || E'\n' ||
        '- Keep messages short, the way the user would type them on a phone. Attach files by public URL.' || E'\n' ||
        '- Daily limits protect the number. When a tool says a limit is reached, stop writing for the day and tell the user.' || E'\n' ||
        '- In a group, answer only when the message is meant for the user.'
    ))
  )
)
on conflict (slug) do nothing;
