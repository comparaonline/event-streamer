import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const OrderStatusSchema = BaseEventSchema.extend({
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  amount: z.number()
});

export type OrderStatus = z.infer<typeof OrderStatusSchema>;
