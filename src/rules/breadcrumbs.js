import { isIndexable } from './_util.js';
import { jsonLdTypes } from '../site.js';

export default {
  id: 'breadcrumbs',
  severity: 'info',
  scope: 'page',
  category: 'schema',
  title: 'Nested pages declare breadcrumbs',
  rationale: 'BreadcrumbList markup tells crawlers where a page sits in the site (Home > Guides > This guide), which helps them group related pages and show the path in results.',
  sources: ['x-suraj', 'google-breadcrumb'],
  fix: 'Add visible breadcrumbs and BreadcrumbList JSON-LD on pages two or more levels deep.',
  check(page) {
    if (!isIndexable(page) || page.isUtility) return [];
    const depth = page.route.split('/').filter(Boolean).length;
    if (depth < 2) return [];
    if (jsonLdTypes(page).includes('BreadcrumbList')) return [];
    return [{ line: 1, message: `Page is ${depth} levels deep (${page.route}) with no BreadcrumbList JSON-LD.` }];
  },
};
