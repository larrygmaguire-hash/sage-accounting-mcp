#!/usr/bin/env node
/**
 * Sage Accounting MCP Server
 *
 * Provides Claude Code access to Sage Accounting API for:
 * - Contacts (customers, suppliers)
 * - Sales invoices and quotes
 * - Purchase invoices
 * - Bank accounts and transactions
 * - Products and services
 * - Payments and receipts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const SAGE_CLIENT_ID = process.env.SAGE_CLIENT_ID || "";
const SAGE_CLIENT_SECRET = process.env.SAGE_CLIENT_SECRET || "";
const SAGE_ACCESS_TOKEN = process.env.SAGE_ACCESS_TOKEN || "";
const SAGE_REFRESH_TOKEN = process.env.SAGE_REFRESH_TOKEN || "";
const SAGE_REGION = process.env.SAGE_REGION || "uk";
const SAGE_API_VERSION = process.env.SAGE_API_VERSION || "v3.1";

// API Base URLs by region
const API_BASE_URLS: Record<string, string> = {
  uk: "https://api.accounting.sage.com",
  us: "https://api.accounting.sage.com",
  ca: "https://api.accounting.sage.com",
  de: "https://api.accounting.sage.com",
  es: "https://api.accounting.sage.com",
  fr: "https://api.accounting.sage.com",
  ie: "https://api.accounting.sage.com",
};

const BASE_URL = `${API_BASE_URLS[SAGE_REGION]}/${SAGE_API_VERSION}`;

// Token state (for refresh)
let currentAccessToken = SAGE_ACCESS_TOKEN;

/**
 * Make authenticated request to Sage API
 */
async function sageRequest(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: object
): Promise<unknown> {
  if (!currentAccessToken) {
    throw new Error(
      "No access token configured. Please set SAGE_ACCESS_TOKEN in environment."
    );
  }

  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${currentAccessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    // Token expired - attempt refresh
    await refreshAccessToken();
    // Retry request with new token
    headers.Authorization = `Bearer ${currentAccessToken}`;
    const retryResponse = await fetch(url, { ...options, headers });
    if (!retryResponse.ok) {
      throw new Error(`Sage API error: ${retryResponse.status} ${retryResponse.statusText}`);
    }
    return retryResponse.json();
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sage API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(): Promise<void> {
  if (!SAGE_REFRESH_TOKEN || !SAGE_CLIENT_ID || !SAGE_CLIENT_SECRET) {
    throw new Error(
      "Cannot refresh token: missing SAGE_REFRESH_TOKEN, SAGE_CLIENT_ID, or SAGE_CLIENT_SECRET"
    );
  }

  const response = await fetch("https://oauth.accounting.sage.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SAGE_REFRESH_TOKEN,
      client_id: SAGE_CLIENT_ID,
      client_secret: SAGE_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { access_token: string };
  currentAccessToken = data.access_token;
}

// Create MCP Server
const server = new Server(
  {
    name: "sage-accounting-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // === CONTACTS ===
    {
      name: "sage_list_contacts",
      description: "List all contacts (customers and suppliers) from Sage Accounting",
      inputSchema: {
        type: "object",
        properties: {
          contact_type: {
            type: "string",
            enum: ["customer", "supplier", "all"],
            description: "Filter by contact type (default: all)",
          },
          search: {
            type: "string",
            description: "Search term to filter contacts by name or reference",
          },
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
          items_per_page: {
            type: "number",
            description: "Items per page (default: 20, max: 200)",
          },
        },
      },
    },
    {
      name: "sage_get_contact",
      description: "Get details of a specific contact by ID",
      inputSchema: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "The Sage contact ID",
          },
        },
        required: ["contact_id"],
      },
    },
    {
      name: "sage_create_contact",
      description: "Create a new contact (customer or supplier)",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Contact name (required)",
          },
          contact_type_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of contact type IDs (customer, supplier)",
          },
          reference: {
            type: "string",
            description: "Unique reference for the contact",
          },
          email: {
            type: "string",
            description: "Primary email address",
          },
          telephone: {
            type: "string",
            description: "Primary telephone number",
          },
          address_line_1: {
            type: "string",
            description: "Address line 1",
          },
          city: {
            type: "string",
            description: "City",
          },
          postal_code: {
            type: "string",
            description: "Postal/ZIP code",
          },
          country_id: {
            type: "string",
            description: "Country ID (e.g., 'GB', 'IE', 'US')",
          },
        },
        required: ["name"],
      },
    },

    // === SALES INVOICES ===
    {
      name: "sage_list_sales_invoices",
      description: "List sales invoices from Sage Accounting",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "sent", "paid", "part_paid", "overdue", "void"],
            description: "Filter by invoice status",
          },
          contact_id: {
            type: "string",
            description: "Filter by contact/customer ID",
          },
          from_date: {
            type: "string",
            description: "Filter invoices from this date (YYYY-MM-DD)",
          },
          to_date: {
            type: "string",
            description: "Filter invoices to this date (YYYY-MM-DD)",
          },
          page: {
            type: "number",
            description: "Page number for pagination",
          },
          items_per_page: {
            type: "number",
            description: "Items per page (max: 200)",
          },
        },
      },
    },
    {
      name: "sage_get_sales_invoice",
      description: "Get details of a specific sales invoice",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: {
            type: "string",
            description: "The Sage invoice ID",
          },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "sage_create_sales_invoice",
      description: "Create a new sales invoice",
      inputSchema: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "Customer contact ID (required)",
          },
          date: {
            type: "string",
            description: "Invoice date (YYYY-MM-DD, default: today)",
          },
          due_date: {
            type: "string",
            description: "Payment due date (YYYY-MM-DD)",
          },
          reference: {
            type: "string",
            description: "Invoice reference number",
          },
          notes: {
            type: "string",
            description: "Notes to appear on invoice",
          },
          line_items: {
            type: "array",
            description: "Array of invoice line items",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                tax_rate_id: { type: "string" },
                ledger_account_id: { type: "string" },
              },
              required: ["description", "quantity", "unit_price"],
            },
          },
        },
        required: ["contact_id", "line_items"],
      },
    },

    // === PURCHASE INVOICES ===
    {
      name: "sage_list_purchase_invoices",
      description: "List purchase invoices (bills) from Sage Accounting",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "registered", "paid", "part_paid", "overdue", "void"],
            description: "Filter by invoice status",
          },
          contact_id: {
            type: "string",
            description: "Filter by supplier contact ID",
          },
          from_date: {
            type: "string",
            description: "Filter from this date (YYYY-MM-DD)",
          },
          to_date: {
            type: "string",
            description: "Filter to this date (YYYY-MM-DD)",
          },
          page: {
            type: "number",
            description: "Page number",
          },
        },
      },
    },

    // === BANK ACCOUNTS ===
    {
      name: "sage_list_bank_accounts",
      description: "List all bank accounts in Sage Accounting",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "sage_get_bank_account",
      description: "Get details of a specific bank account",
      inputSchema: {
        type: "object",
        properties: {
          bank_account_id: {
            type: "string",
            description: "The Sage bank account ID",
          },
        },
        required: ["bank_account_id"],
      },
    },

    // === PRODUCTS & SERVICES ===
    {
      name: "sage_list_products",
      description: "List all products and services",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term to filter products",
          },
          active: {
            type: "boolean",
            description: "Filter by active status",
          },
          page: {
            type: "number",
            description: "Page number",
          },
        },
      },
    },
    {
      name: "sage_create_product",
      description: "Create a new product or service",
      inputSchema: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Product/service description (required)",
          },
          sales_ledger_account_id: {
            type: "string",
            description: "Sales ledger account ID",
          },
          purchase_ledger_account_id: {
            type: "string",
            description: "Purchase ledger account ID",
          },
          sales_tax_rate_id: {
            type: "string",
            description: "Sales tax rate ID",
          },
          purchase_tax_rate_id: {
            type: "string",
            description: "Purchase tax rate ID",
          },
          item_code: {
            type: "string",
            description: "Product/service code",
          },
          sales_price: {
            type: "number",
            description: "Default sales price",
          },
          purchase_price: {
            type: "number",
            description: "Default purchase price",
          },
        },
        required: ["description"],
      },
    },

    // === PAYMENTS ===
    {
      name: "sage_list_payments",
      description: "List contact payments made",
      inputSchema: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "Filter by contact ID",
          },
          from_date: {
            type: "string",
            description: "Filter from date (YYYY-MM-DD)",
          },
          to_date: {
            type: "string",
            description: "Filter to date (YYYY-MM-DD)",
          },
          page: {
            type: "number",
            description: "Page number",
          },
        },
      },
    },

    // === LEDGER ACCOUNTS ===
    {
      name: "sage_list_ledger_accounts",
      description: "List all ledger accounts (chart of accounts)",
      inputSchema: {
        type: "object",
        properties: {
          ledger_account_type_id: {
            type: "string",
            description: "Filter by account type",
          },
          visible_in: {
            type: "string",
            enum: ["sales", "purchases", "banking", "journals", "other_payments", "other_receipts"],
            description: "Filter by where account is visible",
          },
        },
      },
    },

    // === TAX RATES ===
    {
      name: "sage_list_tax_rates",
      description: "List all tax rates configured in Sage",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },

    // === BUSINESS INFO ===
    {
      name: "sage_get_business",
      description: "Get business/company information from Sage",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },

    // === OTHER PAYMENTS (Bank Payments / Expenses) ===
    {
      name: "sage_create_other_payment",
      description: "Create a bank payment (expense) in Sage. Used for direct bank transactions like card payments and outgoing transfers.",
      inputSchema: {
        type: "object",
        properties: {
          bank_account_id: {
            type: "string",
            description: "The Sage bank account ID (e.g. the Revolut account)",
          },
          date: {
            type: "string",
            description: "Payment date (YYYY-MM-DD)",
          },
          total_amount: {
            type: "number",
            description: "Total payment amount (positive number)",
          },
          tax_rate_id: {
            type: "string",
            description: "Sage tax rate ID (from sage_list_tax_rates)",
          },
          ledger_account_id: {
            type: "string",
            description: "Sage ledger account ID for the expense category",
          },
          contact_id: {
            type: "string",
            description: "Sage contact ID for the supplier (optional)",
          },
          reference: {
            type: "string",
            description: "Payment reference (e.g. Revolut transaction description)",
          },
          net_amount: {
            type: "number",
            description: "Net amount before tax (optional — Sage can calculate from total if tax_rate provided)",
          },
        },
        required: ["bank_account_id", "date", "total_amount", "tax_rate_id", "ledger_account_id"],
      },
    },

    // === OTHER RECEIPTS (Bank Receipts / Refunds) ===
    {
      name: "sage_create_other_receipt",
      description: "Create a bank receipt (income/refund) in Sage. Used for card refunds, incoming transfers, and other non-invoice receipts.",
      inputSchema: {
        type: "object",
        properties: {
          bank_account_id: {
            type: "string",
            description: "The Sage bank account ID",
          },
          date: {
            type: "string",
            description: "Receipt date (YYYY-MM-DD)",
          },
          total_amount: {
            type: "number",
            description: "Total receipt amount (positive number)",
          },
          tax_rate_id: {
            type: "string",
            description: "Sage tax rate ID",
          },
          ledger_account_id: {
            type: "string",
            description: "Sage ledger account ID for the income/receipt category",
          },
          contact_id: {
            type: "string",
            description: "Sage contact ID (optional)",
          },
          reference: {
            type: "string",
            description: "Receipt reference",
          },
          net_amount: {
            type: "number",
            description: "Net amount before tax (optional)",
          },
        },
        required: ["bank_account_id", "date", "total_amount", "tax_rate_id", "ledger_account_id"],
      },
    },

    // === PURCHASE INVOICES (Create) ===
    {
      name: "sage_create_purchase_invoice",
      description: "Create a purchase invoice (bill) in Sage. Used for overseas/non-EU suppliers that require an invoice entry for Irish tax purposes.",
      inputSchema: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "Supplier contact ID (required)",
          },
          date: {
            type: "string",
            description: "Invoice date (YYYY-MM-DD, default: today)",
          },
          due_date: {
            type: "string",
            description: "Payment due date (YYYY-MM-DD)",
          },
          reference: {
            type: "string",
            description: "Invoice reference (e.g. supplier invoice number or Revolut description)",
          },
          notes: {
            type: "string",
            description: "Notes for the invoice",
          },
          line_items: {
            type: "array",
            description: "Array of invoice line items",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                tax_rate_id: { type: "string" },
                ledger_account_id: { type: "string" },
              },
              required: ["description", "quantity", "unit_price"],
            },
          },
        },
        required: ["contact_id", "line_items"],
      },
    },

    // === PURCHASE INVOICE PAYMENTS ===
    {
      name: "sage_create_purchase_invoice_payment",
      description: "Create a payment against a purchase invoice in Sage. Links a bank payment to an existing purchase invoice to mark it as paid.",
      inputSchema: {
        type: "object",
        properties: {
          contact_id: {
            type: "string",
            description: "Supplier contact ID",
          },
          bank_account_id: {
            type: "string",
            description: "The Sage bank account ID the payment was made from",
          },
          date: {
            type: "string",
            description: "Payment date (YYYY-MM-DD)",
          },
          total_amount: {
            type: "number",
            description: "Total payment amount",
          },
          invoice_allocations: {
            type: "array",
            description: "Array of invoice allocations — which invoices this payment covers",
            items: {
              type: "object",
              properties: {
                invoice_id: {
                  type: "string",
                  description: "The Sage purchase invoice ID to allocate payment to",
                },
                amount: {
                  type: "number",
                  description: "Amount allocated to this invoice",
                },
              },
              required: ["invoice_id", "amount"],
            },
          },
          reference: {
            type: "string",
            description: "Payment reference",
          },
        },
        required: ["contact_id", "bank_account_id", "date", "total_amount", "invoice_allocations"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = args as Record<string, unknown>;

  try {
    let result: unknown;

    switch (name) {
      // === CONTACTS ===
      case "sage_list_contacts": {
        const queryParams = new URLSearchParams();
        if (params.contact_type && params.contact_type !== "all") {
          queryParams.append("contact_type_id", params.contact_type as string);
        }
        if (params.search) queryParams.append("search", params.search as string);
        if (params.page) queryParams.append("page", String(params.page));
        if (params.items_per_page) queryParams.append("items_per_page", String(params.items_per_page));

        const query = queryParams.toString();
        result = await sageRequest(`/contacts${query ? `?${query}` : ""}`);
        break;
      }

      case "sage_get_contact":
        result = await sageRequest(`/contacts/${params.contact_id}`);
        break;

      case "sage_create_contact": {
        const contactBody: Record<string, unknown> = {
          contact: {
            name: params.name,
            contact_type_ids: params.contact_type_ids || [],
            reference: params.reference,
            main_address: {
              address_line_1: params.address_line_1,
              city: params.city,
              postal_code: params.postal_code,
              country_id: params.country_id,
            },
            email: params.email,
            telephone: params.telephone,
          },
        };
        result = await sageRequest("/contacts", "POST", contactBody);
        break;
      }

      // === SALES INVOICES ===
      case "sage_list_sales_invoices": {
        const queryParams = new URLSearchParams();
        if (params.status) queryParams.append("status_id", params.status as string);
        if (params.contact_id) queryParams.append("contact_id", params.contact_id as string);
        if (params.from_date) queryParams.append("from_date", params.from_date as string);
        if (params.to_date) queryParams.append("to_date", params.to_date as string);
        if (params.page) queryParams.append("page", String(params.page));
        if (params.items_per_page) queryParams.append("items_per_page", String(params.items_per_page));

        const query = queryParams.toString();
        result = await sageRequest(`/sales_invoices${query ? `?${query}` : ""}`);
        break;
      }

      case "sage_get_sales_invoice":
        result = await sageRequest(`/sales_invoices/${params.invoice_id}`);
        break;

      case "sage_create_sales_invoice": {
        const invoiceBody = {
          sales_invoice: {
            contact_id: params.contact_id,
            date: params.date || new Date().toISOString().split("T")[0],
            due_date: params.due_date,
            reference: params.reference,
            notes: params.notes,
            invoice_lines: (params.line_items as Array<Record<string, unknown>>).map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate_id: item.tax_rate_id,
              ledger_account_id: item.ledger_account_id,
            })),
          },
        };
        result = await sageRequest("/sales_invoices", "POST", invoiceBody);
        break;
      }

      // === PURCHASE INVOICES ===
      case "sage_list_purchase_invoices": {
        const queryParams = new URLSearchParams();
        if (params.status) queryParams.append("status_id", params.status as string);
        if (params.contact_id) queryParams.append("contact_id", params.contact_id as string);
        if (params.from_date) queryParams.append("from_date", params.from_date as string);
        if (params.to_date) queryParams.append("to_date", params.to_date as string);
        if (params.page) queryParams.append("page", String(params.page));

        const query = queryParams.toString();
        result = await sageRequest(`/purchase_invoices${query ? `?${query}` : ""}`);
        break;
      }

      // === BANK ACCOUNTS ===
      case "sage_list_bank_accounts":
        result = await sageRequest("/bank_accounts");
        break;

      case "sage_get_bank_account":
        result = await sageRequest(`/bank_accounts/${params.bank_account_id}`);
        break;

      // === PRODUCTS ===
      case "sage_list_products": {
        const queryParams = new URLSearchParams();
        if (params.search) queryParams.append("search", params.search as string);
        if (params.active !== undefined) queryParams.append("active", String(params.active));
        if (params.page) queryParams.append("page", String(params.page));

        const query = queryParams.toString();
        result = await sageRequest(`/products${query ? `?${query}` : ""}`);
        break;
      }

      case "sage_create_product": {
        const productBody = {
          product: {
            description: params.description,
            item_code: params.item_code,
            sales_ledger_account_id: params.sales_ledger_account_id,
            purchase_ledger_account_id: params.purchase_ledger_account_id,
            sales_tax_rate_id: params.sales_tax_rate_id,
            purchase_tax_rate_id: params.purchase_tax_rate_id,
            sales_prices: params.sales_price ? [{ price: params.sales_price }] : undefined,
            purchase_price: params.purchase_price,
          },
        };
        result = await sageRequest("/products", "POST", productBody);
        break;
      }

      // === PAYMENTS ===
      case "sage_list_payments": {
        const queryParams = new URLSearchParams();
        if (params.contact_id) queryParams.append("contact_id", params.contact_id as string);
        if (params.from_date) queryParams.append("from_date", params.from_date as string);
        if (params.to_date) queryParams.append("to_date", params.to_date as string);
        if (params.page) queryParams.append("page", String(params.page));

        const query = queryParams.toString();
        result = await sageRequest(`/contact_payments${query ? `?${query}` : ""}`);
        break;
      }

      // === LEDGER ACCOUNTS ===
      case "sage_list_ledger_accounts": {
        const queryParams = new URLSearchParams();
        if (params.ledger_account_type_id) {
          queryParams.append("ledger_account_type_id", params.ledger_account_type_id as string);
        }
        if (params.visible_in) queryParams.append("visible_in", params.visible_in as string);

        const query = queryParams.toString();
        result = await sageRequest(`/ledger_accounts${query ? `?${query}` : ""}`);
        break;
      }

      // === TAX RATES ===
      case "sage_list_tax_rates":
        result = await sageRequest("/tax_rates");
        break;

      // === OTHER PAYMENTS ===
      case "sage_create_other_payment": {
        const paymentBody = {
          other_payment: {
            bank_account_id: params.bank_account_id,
            date: params.date,
            reference: params.reference,
            contact_id: params.contact_id,
            payment_lines: [
              {
                ledger_account_id: params.ledger_account_id,
                total_amount: params.total_amount,
                net_amount: params.net_amount,
                tax_rate_id: params.tax_rate_id,
              },
            ],
          },
        };
        result = await sageRequest("/other_payments", "POST", paymentBody);
        break;
      }

      // === OTHER RECEIPTS ===
      case "sage_create_other_receipt": {
        const receiptBody = {
          other_receipt: {
            bank_account_id: params.bank_account_id,
            date: params.date,
            reference: params.reference,
            contact_id: params.contact_id,
            payment_lines: [
              {
                ledger_account_id: params.ledger_account_id,
                total_amount: params.total_amount,
                net_amount: params.net_amount,
                tax_rate_id: params.tax_rate_id,
              },
            ],
          },
        };
        result = await sageRequest("/other_receipts", "POST", receiptBody);
        break;
      }

      // === PURCHASE INVOICES (Create) ===
      case "sage_create_purchase_invoice": {
        const purchaseInvoiceBody = {
          purchase_invoice: {
            contact_id: params.contact_id,
            date: params.date || new Date().toISOString().split("T")[0],
            due_date: params.due_date,
            reference: params.reference,
            notes: params.notes,
            invoice_lines: (params.line_items as Array<Record<string, unknown>>).map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate_id: item.tax_rate_id,
              ledger_account_id: item.ledger_account_id,
            })),
          },
        };
        result = await sageRequest("/purchase_invoices", "POST", purchaseInvoiceBody);
        break;
      }

      // === PURCHASE INVOICE PAYMENTS ===
      case "sage_create_purchase_invoice_payment": {
        const paymentBody = {
          contact_payment: {
            contact_id: params.contact_id,
            bank_account_id: params.bank_account_id,
            date: params.date,
            total_amount: params.total_amount,
            reference: params.reference,
            allocated_artefacts: (params.invoice_allocations as Array<Record<string, unknown>>).map((alloc) => ({
              artefact_id: alloc.invoice_id,
              amount: alloc.amount,
            })),
          },
        };
        result = await sageRequest("/contact_payments", "POST", paymentBody);
        break;
      }

      // === BUSINESS ===
      case "sage_get_business":
        result = await sageRequest("/business");
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Sage Accounting MCP server started");
