import { isIndexable, rendersComponents } from './_util.js';
import { jsonLdTypes } from '../site.js';

const ARTICLE_TYPES = /^(Article|BlogPosting|NewsArticle|TechArticle|Report|ScholarlyArticle|AnalysisNewsArticle|OpinionNewsArticle|ReviewNewsArticle|HowTo|FAQPage|QAPage)$/;
const HOME_TYPES = /^(Organization|Corporation|LocalBusiness|WebSite|Person|OnlineStore|NGO|EducationalOrganization|SoftwareApplication|Product)$/;
const PRODUCT_TYPES = /^(Product|SoftwareApplication|WebApplication|MobileApplication|Service|Offer|ProductGroup)$/;
const PRODUCT_ROUTE = /(^|\/)(products?|shop|store|pricing|plans|features|apps?|tools?)(\/|$)/;

export default {
  id: 'structured-data',
  severity: 'warn',
  scope: 'page',
  category: 'schema',
  title: 'Key pages carry schema.org JSON-LD',
  rationale: 'JSON-LD states facts (who publishes the site, what the product costs, when an article was updated) in a form crawlers parse without guessing. It is on every vibe-coder SEO checklist, and Claude Code SEO workflows generate it by default.',
  sources: ['x-suraj', 'x-cody-claude', 'schema-org', 'google-org', 'google-article'],
  fix: 'Add a <script type="application/ld+json"> block: Organization and WebSite on the home page, Article/BlogPosting on posts, Product or SoftwareApplication on product and pricing pages. Keep it consistent with the visible content.',
  check(page) {
    if (!isIndexable(page) || page.isUtility) return [];
    const types = jsonLdTypes(page);
    const sev = page.kind === 'html' || page.kind === 'url' || page.kind === 'md' || !rendersComponents(page) ? 'warn' : 'info';
    if (page.isHome && !types.some((t) => HOME_TYPES.test(t))) return [{ line: 1, severity: sev, message: `Home page has no Organization or WebSite JSON-LD${types.length ? ` (found ${[...new Set(types)].join(', ')})` : ''}.` }];
    if (page.isArticle && !types.some((t) => ARTICLE_TYPES.test(t))) return [{ line: 1, severity: sev, message: `Article page has no Article/BlogPosting JSON-LD${types.length ? ` (found ${[...new Set(types)].join(', ')})` : ''}.` }];
    if (PRODUCT_ROUTE.test(page.route) && !page.isDynamicRoute && !types.some((t) => PRODUCT_TYPES.test(t))) return [{ line: 1, severity: sev === 'warn' ? 'info' : sev, message: 'Product or pricing page has no Product/SoftwareApplication/Service JSON-LD.' }];
    return [];
  },
};
