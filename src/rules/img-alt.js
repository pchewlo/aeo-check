import { cap } from './_util.js';

const PLACEHOLDER = /^(image|img|photo|picture|pic|graphic|icon|logo|banner|screenshot|untitled|alt|todo|\d+)$|\.(png|jpe?g|webp|gif|svg|avif)$/i;

export default {
  id: 'img-alt',
  severity: 'warn',
  scope: 'markup',
  category: 'media',
  title: 'Images have alt text',
  rationale: 'Retrieval reduces pages to text, so an image without alt text disappears. Alt text is also how image results and multimodal answers know what the image shows.',
  sources: ['x-suraj', 'x-jingg', 'google-images'],
  fix: 'Describe what the image shows in alt="..." (the takeaway for charts). Use alt="" only for purely decorative images.',
  check(page) {
    const out = [];
    for (const img of page.images) {
      if (img.spread || img.decorative || img.altDynamic) continue;
      const name = (img.src || '').split('/').pop().slice(0, 50);
      if (!img.hasAlt) out.push({ line: img.line, message: `<${img.tag}${name ? ` src="${name}"` : ''}> has no alt attribute.` });
      else if (img.markdown && !img.alt) out.push({ line: img.line, message: `Markdown image ${name} has empty alt text.` });
      else if (img.alt && PLACEHOLDER.test(img.alt.trim())) out.push({ line: img.line, message: `Alt text "${img.alt}" is a placeholder or filename.` });
    }
    return cap(out, 5);
  },
};
