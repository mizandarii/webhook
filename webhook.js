import express from "express";
import Stripe from "stripe";
import fetch from "node-fetch";

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET);

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const bookingId = session.client_reference_id;

    console.log("PAID:", bookingId);

    // обновляем PocketBase
    await fetch(`${process.env.PB_URL}/api/collections/bookings/records/${bookingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "paid"
      })
    });
  }

  res.json({ received: true });
});

app.listen(3000, () => console.log("Webhook server running"));
