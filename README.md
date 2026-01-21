# Sage Accounting MCP Server

An MCP (Model Context Protocol) server that provides Claude Code access to the Sage Accounting API (Sage Business Cloud Accounting).

**Note:** This MCP is specifically for Sage Accounting (cloud-based). Other Sage products (Sage 50, Sage 200, Sage Intacct, Sage X3) have separate APIs and would require separate MCP servers.

## Features

### Contacts
- List, search, and filter contacts (customers/suppliers)
- Get contact details
- Create new contacts

### Sales Invoices
- List invoices with filters (status, date range, customer)
- Get invoice details
- Create new sales invoices with line items

### Purchase Invoices
- List purchase invoices/bills
- Filter by status, supplier, date range

### Bank Accounts
- List all bank accounts
- Get bank account details

### Products & Services
- List products with search/filter
- Create new products/services

### Payments
- List contact payments
- Filter by contact, date range

### Reference Data
- List ledger accounts (chart of accounts)
- List tax rates
- Get business/company information

## Installation

```bash
npm install
npm run build
```

## Configuration

### 1. Register a Sage Developer App

1. Go to the [Sage Developer Self Service Portal](https://developerselfservice.sageone.com/) and login or register
2. Click **Create App**
3. Enter a name and **Callback URL** for your app (use `http://localhost:3000/callback` for local development)
4. Optionally provide an alternative email address and homepage URL
5. Click **Save**
6. Note your **Client ID** and **Client Secret** — you'll need these for the next step

For detailed guidance, see Sage's official documentation on [Creating an app](https://developer.sage.com/accounting/guides/authenticating/creating-an-app/) and [Authentication](https://developer.sage.com/accounting/guides/authenticating/).

### 2. OAuth Authentication

Sage uses OAuth 2.0. Follow these steps to obtain your tokens:

#### Option A: Use Sage's API Playground (Easiest)

1. Go to the [Sage Developer Portal](https://developer.sage.com/)
2. Navigate to **API Playground** or **Try It Out**
3. Sign in with your Sage Business Cloud account
4. Copy the **Access Token** and **Refresh Token** from the playground

#### Option B: Use the OAuth Helper Script (Recommended)

This repository includes an OAuth helper script that handles the entire flow automatically:

```bash
node oauth-helper.cjs
```

This script:
1. Starts a local HTTP server on port 3000 to capture the callback
2. Opens the Sage authorisation URL in your browser
3. Exchanges the authorisation code for tokens automatically
4. Displays the tokens in both the terminal and browser

**Important:** The localhost callback URL requires a server to be listening. Without a running server, the browser will appear to hang after clicking "Allow" because there's nothing to receive the redirect.

#### Option C: Manual OAuth Flow

If you prefer to handle the OAuth flow manually:

1. **Start a local server first** to capture the callback (the OAuth helper script does this for you)
2. Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://www.sageone.com/oauth2/auth/central?filter=apiv3.1&response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=full_access&state=random_string&country=ie
```

3. Sign in and authorise the application
4. Your server will receive the redirect to `http://localhost:3000/callback?code=AUTH_CODE`
5. Exchange the code for tokens:

```bash
curl -X POST https://oauth.accounting.sage.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Accept: application/json" \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/callback"
```

6. The response contains your `access_token` and `refresh_token`

**Note:** Access tokens expire after ~1 hour. The MCP server automatically refreshes them using your refresh token.

### 3. Environment Variables

Create a `.env` file (see `.env.example`):

```env
SAGE_CLIENT_ID=your_client_id
SAGE_CLIENT_SECRET=your_client_secret
SAGE_ACCESS_TOKEN=your_access_token
SAGE_REFRESH_TOKEN=your_refresh_token
SAGE_REGION=uk
SAGE_API_VERSION=v3.1
```

### 4. Claude Configuration

Add to `~/.claude.json`:

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "sage-accounting": {
          "type": "stdio",
          "command": "node",
          "args": ["/path/to/sage-accounting-mcp/dist/index.js"],
          "env": {
            "SAGE_CLIENT_ID": "your_client_id",
            "SAGE_CLIENT_SECRET": "your_client_secret",
            "SAGE_ACCESS_TOKEN": "your_access_token",
            "SAGE_REFRESH_TOKEN": "your_refresh_token",
            "SAGE_REGION": "uk"
          }
        }
      }
    }
  }
}
```

## Usage

Once configured, Claude Code can use commands like:

- "List all my customers in Sage"
- "Show unpaid invoices from last month"
- "Create a new invoice for customer X"
- "What products do I have in Sage?"
- "Show my bank accounts"

## API Reference

This MCP wraps the [Sage Accounting API v3.1](https://developer.sage.com/accounting/reference/).

### Supported Endpoints

| Tool | Sage Endpoint |
|------|---------------|
| `sage_list_contacts` | GET /contacts |
| `sage_get_contact` | GET /contacts/{id} |
| `sage_create_contact` | POST /contacts |
| `sage_list_sales_invoices` | GET /sales_invoices |
| `sage_get_sales_invoice` | GET /sales_invoices/{id} |
| `sage_create_sales_invoice` | POST /sales_invoices |
| `sage_list_purchase_invoices` | GET /purchase_invoices |
| `sage_list_bank_accounts` | GET /bank_accounts |
| `sage_get_bank_account` | GET /bank_accounts/{id} |
| `sage_list_products` | GET /products |
| `sage_create_product` | POST /products |
| `sage_list_payments` | GET /contact_payments |
| `sage_list_ledger_accounts` | GET /ledger_accounts |
| `sage_list_tax_rates` | GET /tax_rates |
| `sage_get_business` | GET /business |

## Regions

Supported regions: `uk`, `us`, `ca`, `de`, `es`, `fr`, `ie`

Set via `SAGE_REGION` environment variable.

## Troubleshooting

### OAuth "Allow" button doesn't redirect / browser hangs after clicking Allow

**Symptom:** After clicking "Allow" on the Sage authorisation screen, the browser appears to hang or spin indefinitely. The URL may or may not change to your localhost callback URL.

**Cause:** The localhost callback URL requires an HTTP server to be actively listening. Without a running server, the browser successfully redirects but has nothing to connect to — causing it to hang while waiting for a response.

**Solution:** Use the OAuth helper script, which starts a local server before initiating the OAuth flow:

```bash
node oauth-helper.cjs
```

This is the simplest fix and handles everything automatically.

**Alternative solutions** (if the helper script doesn't work):

#### Option 1: Use ngrok (for network/firewall issues)

If you have genuine network issues preventing localhost connections, create a public tunnel:

```bash
# Install ngrok
brew install ngrok

# Sign up for free account at https://dashboard.ngrok.com/signup
# Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken

# Configure ngrok
ngrok config add-authtoken YOUR_AUTHTOKEN

# Start tunnel
ngrok http 3000
```

Update your Sage app's callback URL in the [Sage Developer Portal](https://developerselfservice.sageone.com/) to `https://abc123.ngrok.io/callback`, then retry the OAuth flow.

#### Option 2: Use Sage API Playground

Skip the OAuth flow entirely:

1. Go to [developer.sage.com](https://developer.sage.com/accounting/)
2. Navigate to the API Playground or Quick Start section
3. Sign in with your Sage Business Cloud account
4. Copy the Access Token and Refresh Token directly from the playground

#### Option 3: Use a real domain

If you have a web server with a public domain:

1. Update your Sage app's callback URL to `https://yourdomain.com/callback`
2. Create a simple endpoint that captures the `code` parameter
3. Use that code in the token exchange

#### Option 4: Try different browser/incognito mode

Sometimes browser extensions or security settings block redirects to localhost:

- Try an incognito/private window
- Disable ad blockers temporarily
- Try a different browser

### "No access token configured"
- Ensure `SAGE_ACCESS_TOKEN` is set in your `~/.claude.json` environment variables

### "401 Unauthorized"
- Your access token has expired
- The MCP will attempt to refresh automatically if you've provided `SAGE_REFRESH_TOKEN`, `SAGE_CLIENT_ID`, and `SAGE_CLIENT_SECRET`
- If refresh fails, re-authenticate using the OAuth flow above

### "403 Forbidden"
- Check your Sage developer app has the correct API scopes
- Ensure your Sage subscription includes API access

### MCP not loading
- Verify the path in `~/.claude.json` points to the correct `dist/index.js` location
- Run `npm run build` to ensure the TypeScript is compiled
- Restart VS Code completely after config changes

## Licence

MIT
