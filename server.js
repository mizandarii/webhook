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

    // ⚠️ иногда payment_link тут отсутствует — fallback
    const paymentLink =
      session.payment_link ||
      session.metadata?.payment_link;

    if (!paymentLink) {
      console.log("No payment link found in session");
      return res.json({ received: true });
    }

    // 🔥 1. найти service по payment_link
    const serviceRes = await fetch(
      `${process.env.PB_URL}/api/collections/services/records?filter=(stripe_payment_link='${paymentLink}')`
    );

    const serviceData = await serviceRes.json();
    const service = serviceData.items?.[0];

    if (!service) {
      console.log("Service not found");
      return res.json({ received: true });
    }

    // 🔥 2. найти booking по service relation
    const bookingRes = await fetch(
      `${process.env.PB_URL}/api/collections/bookings/records?filter=(service='${service.id}'&&status='pending')`
    );

    const bookingData = await bookingRes.json();
    const booking = bookingData.items?.[0];

    if (!booking) {
      console.log("Booking not found");
      return res.json({ received: true });
    }

    // 🔥 3. обновить статус
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
