const listFromCsv = value => String(value || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const omrToMinor = value => Math.round(Number(value || 0) * 1000);

export function buildRealEstateSubmission(form, values, context = {}) {
  const requestId = context.requestId;

  switch (form) {
    case 'invite':
      return { operation: 'team_invite', body: { email: values.email } };
    case 'property':
      return {
        operation: 'property_save',
        body: {
          requestId,
          ...(values.propertyId ? { propertyId: values.propertyId, version: Number(values.version) } : {}),
          workflow: {
            label: values.label,
            reference: values.reference,
            transactionType: values.transactionType,
            propertyType: values.propertyType,
            area: values.area,
            location: values.location,
            askingPriceMinor: omrToMinor(values.price),
            pricePeriod: values.transactionType === 'rent' ? values.pricePeriod : 'total',
            bedrooms: Number(values.bedrooms || 0),
            bathrooms: Number(values.bathrooms || 0),
            sizeSqm: Number(values.sizeSqm || 0),
            description: values.description,
            assignedAccountId: values.assignedAccountId || undefined,
            availability: values.availability || 'available',
            authorityStatus: values.authorityStatus,
            features: listFromCsv(values.features),
            photoIds: (context.propertyPhotos || []).map(photo => photo.id),
          },
        },
      };
    case 'opportunity':
      return {
        operation: 'opportunity_save',
        body: {
          requestId,
          workflow: {
            contactId: values.contactId,
            source: 'manual',
            need: values.need,
            areas: listFromCsv(values.areas),
            propertyTypes: listFromCsv(values.propertyTypes),
            budgetMinMinor: omrToMinor(values.budgetMin),
            budgetMaxMinor: omrToMinor(values.budgetMax),
            bedrooms: Number(values.bedrooms || 0),
            financeReadiness: values.financeReadiness,
            decisionMakerReadiness: values.decisionMakerReadiness,
            timeline: values.timeline,
            mustHaves: listFromCsv(values.mustHaves),
            nextAction: values.nextAction,
            assignedAccountId: values.assignedAccountId || undefined,
          },
        },
      };
    case 'viewing':
      return {
        operation: 'viewing_save',
        body: {
          requestId,
          workflow: {
            opportunityId: values.opportunityId,
            propertyId: values.propertyId,
            status: 'requested',
            scheduledAt: new Date(values.scheduledAt).getTime(),
            nextAction: values.nextAction,
          },
        },
      };
    case 'offer':
      return {
        operation: 'offer_save',
        body: {
          requestId,
          workflow: {
            opportunityId: values.opportunityId,
            propertyId: values.propertyId,
            amountMinor: omrToMinor(values.amount),
            terms: values.terms,
          },
        },
      };
    case 'draft': {
      const opportunity = context.opportunities?.find(row => row.id === values.opportunityId);
      return {
        operation: 'draft_save',
        body: {
          requestId,
          workflow: {
            opportunityId: values.opportunityId,
            conversationId: opportunity?.conversationId,
            kind: values.kind,
            text: values.text,
            templateId: values.templateId || undefined,
          },
        },
      };
    }
    case 'close':
      return {
        operation: 'deal_close',
        body: {
          opportunityId: values.opportunityId,
          offerId: values.offerId,
          commissionMinor: omrToMinor(values.commission),
        },
      };
    default:
      return null;
  }
}
