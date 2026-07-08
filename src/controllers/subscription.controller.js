const db = require('../config/db');

const TIER_FEATURES = {
  starter: { bots: 0, watchlistLimit: 10, aiAssistant: false, sentimentFeed: false },
  pro:     { bots: 3, watchlistLimit: 100, aiAssistant: true, sentimentFeed: true },
  elite:   { bots: -1, watchlistLimit: -1, aiAssistant: true, sentimentFeed: true },
};

async function getSubscription(req, res, next) {
  try {
    const result = await db.query(
      `SELECT tier, status, current_period_end, created_at, updated_at
       FROM subscriptions WHERE user_id = $1`,
      [req.user.id]
    );
    const sub = result.rows[0] || { tier: 'starter', status: 'active' };
    res.json({ subscription: sub, features: TIER_FEATURES[sub.tier] || TIER_FEATURES.starter });
  } catch (err) { next(err); }
}

// Placeholder for Stripe webhook — when billing is wired, this endpoint
// receives POST events (payment_intent.succeeded, customer.subscription.updated
// etc.) and updates the subscriptions table accordingly.
async function stripeWebhook(req, res) {
  // TODO: verify Stripe-Signature header, then handle event types.
  res.json({ received: true });
}

module.exports = { getSubscription, stripeWebhook };
