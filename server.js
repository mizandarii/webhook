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
    console.log("Webhook signature error:", err.message);
    return res.status(400).send("Invalid signature");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    console.log("Payment received");

    // 🔥 1. берём payment link из Stripe session
    const paymentLink = session.payment_link;

    if (!paymentLink) {
      console.log("No payment link found");
      return res.json({ received: true });
    }

    // 🔥 2. ищем booking в PocketBase
    const response = await fetch(
      `${process.env.PB_URL}/api/collections/bookings/records?filter=(payment_link='${paymentLink}')`
    );

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log("Booking not found");
      return res.json({ received: true });
    }

    const booking = data.items[0];

    // 🔥 3. обновляем статус
    await fetch(
      `${process.env.PB_URL}/api/collections/bookings/records/${booking.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: "paid"
        })
      }
    );

    console.log("Booking updated:", booking.id);
  }

  res.json({ received: true });
});
