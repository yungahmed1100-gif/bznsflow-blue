// Graph API reads for Broadcast: approved templates and the portfolio messaging
// limit. Templates are managed in WhatsApp Manager.
import { metaRequest } from './customer-meta.js';
import { PilotError } from './config.js';
import { messagingAllowance, sanitizeTemplate } from '../../../config/layla-templates.js';

const FIELDS = 'id,name,language,status,category,parameter_format,components';
const PAGE_LIMIT = 25, MAX_PAGES = 10;

// Every approved template is listed so the owner sees what WhatsApp Manager holds.
// Only MARKETING ones are sendable: sanitizeTemplate marks the rest not_marketing,
// and campaign creation and the send worker re-check the category.
export async function fetchApprovedTemplates({ c, integration, token, fetcher }) {
  const templates = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ fields: FIELDS, status: 'APPROVED', limit: String(PAGE_LIMIT), ...(after ? { after } : {}) });
    const result = await metaRequest(c, `${integration.waba}/message_templates?${query}`, token, fetcher);
    if (!Array.isArray(result.data)) throw new PilotError('meta_connection_unavailable', 502);
    for (const raw of result.data) {
      if (String(raw?.status).toUpperCase() !== 'APPROVED') continue;
      const t = sanitizeTemplate(raw);
      if (/^\d{1,30}$/.test(t.templateId) && /^[a-z0-9_]{1,512}$/.test(t.name) && /^[a-zA-Z_]{2,15}$/.test(t.language)) templates.push(t);
    }
    const next = result.paging?.cursors?.after;
    if (!result.paging?.next || typeof next !== 'string' || next.length > 500) break;
    after = next;
  }
  return templates;
}

/** Portfolio limit on unique users per 24 hours outside a service window. Unknown → 0. */
export async function fetchMessagingAllowance({ c, integration, token, fetcher }) {
  const result = await metaRequest(c, `${integration.phone}?fields=whatsapp_business_manager_messaging_limit`, token, fetcher);
  return messagingAllowance(result.whatsapp_business_manager_messaging_limit);
}

export async function fetchTemplateState({ c, templateId, token, fetcher }) {
  if (!/^\d{1,30}$/.test(templateId || '')) throw new PilotError('template_not_sendable', 409);
  const result = await metaRequest(c, `${templateId}?fields=status,category`, token, fetcher);
  return { status: String(result.status || '').toUpperCase(), category: String(result.category || '').toUpperCase() };
}
