import { ApplicationFailure } from '@temporalio/common';

export interface AddFirstProductInput {
  tenantId: string;
  name: string;
  unit: string;
  unitPrice: string;
}

export interface AddFirstProductResult {
  skuCode: string;
  name: string;
  unitPrice: string;
}

export const ADD_FIRST_PRODUCT_TOOL_NAME = 'add_first_product';

let skuSequence = 0;

/** A short, readable code from the product name — real SKUs can be renamed/recoded later via the normal authenticated catalog endpoints; this just needs to be unique enough for a first product. */
function generateSkuCode(name: string): string {
  skuSequence += 1;
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return `SKU-${slug}-${Date.now()}-${skuSequence}`;
}

export const addFirstProductToolSchema = {
  name: ADD_FIRST_PRODUCT_TOOL_NAME,
  description: "Add the caller's first product/service to sell. Onboarding-only.",
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const, description: 'Product/service name, as the owner said it.' },
      unit: { type: 'string' as const, description: 'Unit of sale, e.g. "kg", "cái", "phần", "chuyến".' },
      unitPrice: { type: 'string' as const, description: 'Price per unit in VND, digits only, e.g. "50000".' },
    },
    required: ['name', 'unit', 'unitPrice'],
    additionalProperties: false,
  },
};

/** Same cross-service Activity-only calling discipline as `get-sales-forecast.tool.ts`/`set-business-profile.tool.ts`. */
export async function addFirstProduct(input: AddFirstProductInput): Promise<AddFirstProductResult> {
  const baseUrl = process.env.BACKEND_API_BASE_URL ?? 'http://localhost:3000/v1';
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    throw ApplicationFailure.nonRetryable('INTERNAL_SERVICE_TOKEN is not set.', 'ConfigError');
  }

  const skuCode = generateSkuCode(input.name);
  const res = await fetch(`${baseUrl}/internal/onboarding/tenants/${input.tenantId}/skus`, {
    method: 'POST',
    headers: { 'X-Internal-Service-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ skuCode, name: input.name, unit: input.unit, unitPrice: input.unitPrice }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw ApplicationFailure.nonRetryable(`backend-api returned ${res.status}: ${body}`, 'BackendApiNonRetryableError');
    }
    throw new Error(`backend-api returned ${res.status}: ${body}`);
  }

  const body = (await res.json()) as { skuCode: string; name: string; unitPrice: string };
  return { skuCode: body.skuCode, name: body.name, unitPrice: body.unitPrice };
}
