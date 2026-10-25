import express from "express";
import { z } from "zod";
import { formatDate } from "./dates.js";

const Order = z.object({ customer: z.string(), items: z.array(z.object({ name: z.string(), price: z.number() })) });

const app = express();
app.use(express.json());

app.post("/orders", (req, res) => {
  const order = Order.safeParse(req.body);
  if (!order.success) return res.status(400).json(order.error.issues);
  res.json({ received: formatDate(new Date()), total: order.data.items.reduce((sum, item) => sum + item.price, 0) });
});

app.listen(3000);
