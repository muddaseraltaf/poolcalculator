// Unified @graph JSON-LD builder. One connected graph per page so crawlers see
// the semantic links between Organization, WebSite, WebPage, and the tool.
import { SITE } from '../config/site';

type FaqItem = { question: string; answer: string };

interface GraphOptions {
  pageUrl: string; // absolute, trailing slash
  title: string;
  description: string;
  isTool?: boolean; // render WebApplication/SoftwareApplication node
  breadcrumbs?: { name: string; url: string }[];
  faq?: FaqItem[];
}

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

export function buildGraph(opts: GraphOptions) {
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/logo.svg`,
      email: SITE.email,
    },
    {
      '@type': 'WebSite',
      '@id': SITE_ID,
      url: SITE.url,
      name: SITE.name,
      publisher: { '@id': ORG_ID },
      inLanguage: SITE.lang,
    },
    {
      '@type': 'WebPage',
      '@id': `${opts.pageUrl}#webpage`,
      url: opts.pageUrl,
      name: opts.title,
      description: opts.description,
      isPartOf: { '@id': SITE_ID },
      inLanguage: SITE.lang,
    },
  ];

  if (opts.isTool) {
    graph.push({
      '@type': 'WebApplication',
      '@id': `${opts.pageUrl}#app`,
      name: opts.title,
      url: opts.pageUrl,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      publisher: { '@id': ORG_ID },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
  }

  if (opts.breadcrumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${opts.pageUrl}#breadcrumb`,
      itemListElement: opts.breadcrumbs.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.name,
        item: b.url,
      })),
    });
  }

  // Only emit FAQPage when real Q&A exist — never fabricate to pad the page.
  if (opts.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${opts.pageUrl}#faq`,
      mainEntity: opts.faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}
