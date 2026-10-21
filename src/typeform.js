// Read a Typeform's public definition from its share page (form.typeform.com/to/<id>), which the
// renderer embeds as JSON: what it asks, what is required, and which answers send people elsewhere.

/** The balanced JSON object starting at s[i], or null. */
function objectAt(s, i) {
  let depth = 0, str = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (str) { if (ch === '\\') j++; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; } }
  }
  return null;
}

export function typeformDefinition(html, id) {
  const key = `{"id":"${id}"`;
  for (let i = html.indexOf(key); i >= 0; i = html.indexOf(key, i + 1)) {
    const o = objectAt(html, i);
    if (o && Array.isArray(o.fields) && Array.isArray(o.logic || [])) return o;
  }
  return null;
}

const host = (u) => { try { return new URL(u).host + new URL(u).pathname.replace(/\/$/, ''); } catch { return u; } };

/** Short facts about the form for a journey step. */
export function summariseTypeform(form) {
  const all = [];
  const walk = (fs) => { for (const f of fs || []) { all.push(f); walk(f.properties && f.properties.fields); } };
  walk(form.fields);
  const asks = all.filter((f) => !['group', 'contact_info', 'statement'].includes(f.type));
  const required = asks.filter((f) => f.validations && f.validations.required);
  const endings = new Map((form.thankyou_screens || []).map((t) => [t.ref, t]));
  const choices = new Map();
  for (const f of all) for (const c of (f.properties && f.properties.choices) || []) choices.set(c.ref, { label: c.label, field: f });

  // answers that jump to an ending which redirects off the form
  const exits = [];
  for (const l of form.logic || []) {
    const field = all.find((f) => f.ref === l.ref);
    const routed = new Set();
    for (const a of l.actions || []) {
      const to = a.details && a.details.to;
      const chosen = ((a.condition && a.condition.vars) || []).filter((v) => v.type === 'choice').map((v) => v.value);
      const end = to && to.type === 'thankyou' ? endings.get(to.value) : null;
      if (end && end.type === 'url_redirect' && end.properties && end.properties.redirect_url) {
        const labels = a.condition && a.condition.op === 'always' && field
          ? ((field.properties && field.properties.choices) || []).filter((c) => !routed.has(c.ref)).map((c) => c.label)
          : chosen.map((c) => choices.has(c) ? choices.get(c).label : c);
        if (labels.length) exits.push({ answers: labels, to: end.properties.redirect_url });
      }
      for (const c of chosen) routed.add(c);
    }
  }
  const scheduler = all.some((f) => /calendly|google_calendar|cal_com|scheduler/.test(f.type));
  const thanks = (form.thankyou_screens || []).find((t) => t.type === 'thankyou_screen' && t.ref !== 'default_tys' && t.properties && t.properties.description);
  const notes = [`${asks.length} field${asks.length === 1 ? '' : 's'}, ${required.length} required`];
  for (const e of exits) notes.push(`${e.answers.map((a) => `"${a}"`).join(' or ')} redirects to ${host(e.to)}`);
  if (!scheduler) notes.push(`no booking step${thanks ? `; it ends "${thanks.properties.description.trim().slice(0, 90)}"` : ''}`);
  if (form.settings && form.settings.captcha) notes.push('captcha on submit');
  return { notes, exits, questions: asks.length, required: required.length, scheduler };
}
