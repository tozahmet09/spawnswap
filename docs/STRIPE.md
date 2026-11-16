# Stripe plan for Spawnswap

What Spawnswap sells, all one-time payments in USD:

| Product | Price | Delivers |
| --- | --- | --- |
| Starter pack | $5 | 50 credits |
| Boost pack | $10 | 120 credits |
| Launch pack | $20 | 300 credits |
| Spotlight 1 / 3 / 7 days | $3 / $7 / $10 | **Not sold any more** (`FEATURED_SALES_ON=false`); spotlight comes with Pro / Max. Old purchases still run and refund normally. |
| Pro (later) | monthly | Subscription, see "Later" below |

No Robux. Prices live in `src/lib/money.ts` and are always set on the server, never taken from the browser.

## How it works

1. **Checkout** (`src/app/api/checkout/route.ts`): creates a `Payment` row (PENDING), then a hosted Stripe Checkout Session in `payment` mode with inline `price_data`. The payment id is put in the session and PaymentIntent metadata. An idempotency key stops a retried request from creating a second session. Unpaid sessions expire after 1 hour.
2. **Fulfilment** (`fulfillCheckoutSession` in `src/lib/payments.ts`): re-reads the session from Stripe, checks it belongs to the payment, is `paid`, and the amount matches, then delivers. It runs from both the webhook and the success page, whichever comes first. Delivery flips PENDING to PAID atomically, so credits can never be added twice.
3. **Webhook** (`src/app/api/stripe/webhook/route.ts`), signature-checked:
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`: deliver.
   - `checkout.session.expired`, `checkout.session.async_payment_failed`: mark FAILED.
   - `charge.refunded` (full refund), `charge.dispute.created`: take back the credits (down to 0) or the spotlight days.
4. **Safety switch**: on the live site with no `STRIPE_SECRET_KEY`, purchases are refused. Free "test mode" purchases only work in local dev, or if you set `ALLOW_FREE_TEST_PAYMENTS=1` on purpose.

## Set up (test mode first)

1. Create an account at <https://dashboard.stripe.com/register>. Leave it in **Test mode** (toggle top right).
2. *Developers → API keys*: copy the **Secret key** (`sk_test_...`).
3. Vercel → project → *Settings → Environment Variables*: add `STRIPE_SECRET_KEY` = that key. Never paste it in chat or commit it.
4. Stripe → *Developers → Webhooks → Add endpoint*: URL `https://<your-site>/api/stripe/webhook`, select the 6 events listed above. Copy the **Signing secret** (`whsec_...`) into Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Make sure `APP_URL` is your https site URL. Redeploy.
6. Buy a pack with card `4242 4242 4242 4242`, any future date, any CVC. Credits should appear right after the redirect. In Stripe → Webhooks the events should show `200`.

Local testing with the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a `whsec_` for `.env`.

## Before going live

- Activate the account (business details, bank account) and switch to live keys in Vercel. Live keys start with `sk_live_`.
- Create a second webhook endpoint in live mode; it has its own signing secret.
- Prefer a **restricted key** with only Checkout Sessions (write) and webhook read access.
- Turn on Stripe Radar rules (default is fine) and email receipts (*Settings → Emails*).
- Terms page already says 13+; payments should be made by an adult or with a parent's permission, since card holders must be adults.
- Check if you need to collect sales tax/VAT: Stripe Tax can be turned on later with `automatic_tax: { enabled: true }`.

## Memberships: Free / Pro / Max (since 2026-11-14)

Monthly subscriptions. Plans live in `src/lib/plans.ts`, Stripe code in `src/lib/subscriptions.ts` and `src/app/api/subscribe/route.ts`, the page is `/pricing`.

- Paid plans sell visibility and tools only (spotlight days, placement, badge, stats, game limit). Credits are still only earned by playing. Credit packs are hidden (`CREDIT_PACKS_ON = false`).
- Products and Prices are created automatically on first checkout, found by lookup key `spawnswap_pro_monthly` / `spawnswap_max_monthly`. Changing a price in `plans.ts` creates a new Price; existing subscribers keep the old one.
- `syncSubscription` re-reads the subscription from Stripe on every event and copies plan, period end, status and cancel flag onto `User`. A new billing period refills `spotlightDaysLeft`. A plan only counts while `planUntil` (+3 days grace) is in the future.
- Cancel / resume run from Plan & billing (`cancel_at_period_end`). "Card & invoices" opens the Stripe Customer Portal.

### One-time setup in the Stripe Dashboard (live mode)

1. *Developers → Webhooks →* the spawnswap.com endpoint *→ Add events*: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
2. *Developers → API keys →* the restricted key used in Vercel: also allow **Products: Write**, **Prices: Write**, **Subscriptions: Write**, **Customers: Write**, **Customer portal: Write**, **Invoices: Read**.
3. *Settings → Billing → Customer portal*: click **Save** once (default settings are fine) so "Card & invoices" works.
