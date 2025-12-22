# Domain Setup: tapas-and-tackles.live

Connecting Namecheap domain to Vercel hosting.

## Prerequisites

- [x] Domain purchased: `tapas-and-tackles.live` (Namecheap)
- [ ] Vercel project deployed
- [ ] Access to Namecheap dashboard
- [ ] Access to Vercel dashboard

---

## Step 1: Add Domain in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (tapas-fpl-app)
3. Click **Settings** → **Domains**
4. Click **Add Domain**
5. Enter: `tapas-and-tackles.live`
6. Vercel will prompt to also add `www.tapas-and-tackles.live` — accept this

**Important**: After adding, Vercel will show you the DNS values you need. Keep this page open!

You'll see something like:
- **A Record**: `76.76.21.21` (or a project-specific IP)
- **CNAME**: `cname.vercel-dns.com` (or a project-specific value like `xyz.vercel-dns-016.com`)

---

## Step 2: Configure DNS in Namecheap

1. Log into [Namecheap](https://www.namecheap.com/)
2. Go to **Dashboard** → **Domain List**
3. Find `tapas-and-tackles.live` → Click **Manage**
4. Click the **Advanced DNS** tab

### Add A Record (for apex domain)

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | `@` | `76.76.21.21` (or value from Vercel) | Automatic |

### Add CNAME Record (for www subdomain)

| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME | `www` | `cname.vercel-dns.com` (or value from Vercel) | Automatic |

### Remove Conflicting Records

Delete any existing records that conflict:
- Default parking page records
- Other A records pointing to `@`
- Other CNAME records for `www`

---

## Step 3: Wait for DNS Propagation

DNS changes typically take **5-30 minutes**, but can take up to 48 hours.

### Check Propagation Status

- [DNSChecker.org](https://dnschecker.org/#A/tapas-and-tackles.live) - Check A record globally
- [WhatsMyDNS.net](https://www.whatsmydns.net/#A/tapas-and-tackles.live) - Alternative checker

### Verify from Terminal

```bash
# Check A record
dig tapas-and-tackles.live A +short

# Check CNAME
dig www.tapas-and-tackles.live CNAME +short

# Clear local DNS cache if needed
# Mac:
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Linux:
sudo systemd-resolve --flush-caches
```

---

## Step 4: Verify in Vercel

1. Go back to Vercel → Settings → Domains
2. Status should change from "Invalid Configuration" to **"Valid Configuration"**
3. Both domains should show green checkmarks:
   - `tapas-and-tackles.live` ✓
   - `www.tapas-and-tackles.live` ✓

---

## Step 5: SSL Certificate (Automatic)

Vercel automatically provisions SSL certificates via Let's Encrypt.

- **No action required** — happens automatically after DNS verification
- Certificate typically provisions within **minutes to hours**
- Both `https://tapas-and-tackles.live` and `https://www.tapas-and-tackles.live` will work

### If SSL Doesn't Work

Check for CAA records blocking Let's Encrypt:
```bash
dig tapas-and-tackles.live CAA +short
```

If you have CAA records, add this in Namecheap:
| Type | Host | Value |
|------|------|-------|
| CAA | `@` | `0 issue "letsencrypt.org"` |

---

## Step 6: Test Everything

- [ ] `https://tapas-and-tackles.live` loads correctly
- [ ] `https://www.tapas-and-tackles.live` loads correctly
- [ ] HTTP redirects to HTTPS automatically
- [ ] No SSL certificate warnings

---

## Troubleshooting

### "Invalid Configuration" Won't Go Away

1. Double-check DNS values match exactly what Vercel shows
2. Ensure no conflicting records exist
3. Wait longer (up to 48 hours for some DNS providers)
4. Try clearing your local DNS cache

### Apex Domain Works, WWW Doesn't (or vice versa)

1. Verify both A record (for apex) and CNAME (for www) are set
2. Check for typos in the CNAME target value

### "Domain Already in Use" Error

The domain is registered to another Vercel project. Either:
- Remove it from the other project first
- Add a TXT verification record to prove ownership

### Site Loads but Shows "Not Secure"

SSL certificate hasn't provisioned yet. Wait a few hours. If still not working:
1. Check for CAA record issues
2. Look for old `_acme-challenge` TXT records and delete them

---

## Quick Reference

| Record Type | Host | Value | Purpose |
|-------------|------|-------|---------|
| A | `@` | `76.76.21.21` | Points apex domain to Vercel |
| CNAME | `www` | `cname.vercel-dns.com` | Points www subdomain to Vercel |

---

## Useful Links

- [Vercel Domain Docs](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Vercel Troubleshooting](https://vercel.com/docs/domains/troubleshooting)
- [Namecheap DNS Guide](https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/)
- [DNS Propagation Checker](https://dnschecker.org)
